import { createHash, timingSafeEqual } from 'node:crypto';
import { sessions } from '@ctrlpane/db';
import { eq } from 'drizzle-orm';
import type { Context } from 'hono';
import { getCookie } from 'hono/cookie';
import type { AppEnv } from '../shared/hono-env.js';

const COOKIE_NAME = 'ctrlpane_sid';

/**
 * Try to authenticate via session cookie.
 *
 * Reads the `ctrlpane_sid` cookie, hashes it with SHA-256, looks up in
 * the sessions table, and verifies expiration using constant-time comparison.
 *
 * On success, sets `tenantId`, `apiKeyId` (session id), `permissions`,
 * and `authMethod` on the Hono context.
 *
 * @returns true if authenticated, false otherwise (does NOT return errors)
 */
export async function trySessionAuth(c: Context<AppEnv>): Promise<boolean> {
  const token = getCookie(c, COOKIE_NAME);

  if (!token) {
    return false;
  }

  const tokenHash = createHash('sha256').update(token).digest('hex');

  try {
    const db = c.get('db');
    const results = await db
      .select()
      .from(sessions)
      .where(eq(sessions.tokenHash, tokenHash))
      .limit(1);

    if (results.length === 0) {
      return false;
    }

    const session = results[0];
    if (!session) {
      return false;
    }

    // Constant-time comparison of token hashes
    const storedHash = Buffer.from(session.tokenHash, 'hex');
    const providedHash = Buffer.from(tokenHash, 'hex');

    if (storedHash.length !== providedHash.length || !timingSafeEqual(storedHash, providedHash)) {
      return false;
    }

    // Check expiration
    if (new Date(session.expiresAt) < new Date()) {
      return false;
    }

    // Store auth context on request
    c.set('tenantId', session.tenantId);
    c.set('apiKeyId', session.id); // Use session id as apiKeyId
    c.set('permissions', ['read', 'write'] as const);
    c.set('authMethod', 'session');

    return true;
  } catch {
    return false;
  }
}
