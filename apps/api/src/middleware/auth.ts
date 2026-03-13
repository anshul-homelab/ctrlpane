import { createHash, timingSafeEqual } from 'node:crypto';
import { apiKeys } from '@ctrlpane/db';
import { eq } from 'drizzle-orm';
import type { Context } from 'hono';
import { createMiddleware } from 'hono/factory';
import type { AppEnv } from '../shared/hono-env.js';

/**
 * Try to authenticate via API key. Returns true if auth succeeded,
 * false if no key was provided, or null if key was invalid.
 *
 * On success, sets `tenantId`, `apiKeyId`, `permissions`, and `authMethod`
 * on the Hono context.
 *
 * @returns true if authenticated, false if no key provided, null if key invalid
 */
export async function tryApiKeyAuth(
  c: Context<AppEnv>,
): Promise<{ success: true } | { success: false; message: string } | null> {
  const rawKey = c.req.header('X-API-Key');

  if (!rawKey) {
    return null; // No API key provided — not an error, just not this auth method
  }

  const keyHash = createHash('sha256').update(rawKey).digest('hex');
  const keyPrefix = rawKey.slice(0, 8);

  try {
    const db = c.get('db');
    const results = await db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.keyPrefix, keyPrefix))
      .limit(1);

    if (results.length === 0) {
      return { success: false, message: 'Invalid API key' };
    }

    const key = results[0];
    if (!key) {
      return { success: false, message: 'Invalid API key' };
    }

    // Constant-time comparison of hashes
    const storedHash = Buffer.from(key.keyHash, 'hex');
    const providedHash = Buffer.from(keyHash, 'hex');

    if (storedHash.length !== providedHash.length || !timingSafeEqual(storedHash, providedHash)) {
      return { success: false, message: 'Invalid API key' };
    }

    // Check expiration
    if (key.expiresAt && new Date(key.expiresAt) < new Date()) {
      return { success: false, message: 'API key expired' };
    }

    // Check revocation
    if (key.revokedAt) {
      return { success: false, message: 'API key revoked' };
    }

    // Store auth context on request
    c.set('tenantId', key.tenantId);
    c.set('apiKeyId', key.id);
    c.set('permissions', key.scopes);
    c.set('authMethod', 'api_key');

    // Update last_used_at (fire-and-forget)
    db.update(apiKeys)
      .set({ lastUsedAt: new Date() })
      .where(eq(apiKeys.id, key.id))
      .catch(() => {});

    return { success: true };
  } catch {
    return { success: false, message: 'Authentication failed' };
  }
}

/**
 * API key authentication middleware (standalone).
 *
 * Reads the X-API-Key header, hashes it with SHA-256, looks up by prefix,
 * then performs a constant-time comparison of the full hash.
 *
 * On success, sets `tenantId`, `apiKeyId`, and `permissions` on the Hono context.
 */
export const authMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  const result = await tryApiKeyAuth(c);

  if (result === null) {
    // No API key header provided
    return c.json(
      {
        error: {
          code: 'AUTHENTICATION_ERROR',
          message: 'Missing X-API-Key header',
          details: {},
        },
      },
      401,
    );
  }

  if (!result.success) {
    return c.json(
      {
        error: {
          code: 'AUTHENTICATION_ERROR',
          message: result.message,
          details: {},
        },
      },
      401,
    );
  }

  await next();
});
