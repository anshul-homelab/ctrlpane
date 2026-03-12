import { createHash, timingSafeEqual } from 'node:crypto';
import { apiKeys } from '@ctrlpane/db';
import { eq } from 'drizzle-orm';
import { createMiddleware } from 'hono/factory';
import type { AppEnv } from '../shared/hono-env.js';

/**
 * API key authentication middleware.
 *
 * Reads the X-API-Key header, hashes it with SHA-256, looks up by prefix,
 * then performs a constant-time comparison of the full hash.
 *
 * On success, sets `tenantId`, `apiKeyId`, and `permissions` on the Hono context.
 */
export const authMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  const rawKey = c.req.header('X-API-Key');

  if (!rawKey) {
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
      return c.json(
        {
          error: {
            code: 'AUTHENTICATION_ERROR',
            message: 'Invalid API key',
            details: {},
          },
        },
        401,
      );
    }

    const key = results[0];
    if (!key) {
      return c.json(
        {
          error: {
            code: 'AUTHENTICATION_ERROR',
            message: 'Invalid API key',
            details: {},
          },
        },
        401,
      );
    }

    // Constant-time comparison of hashes
    const storedHash = Buffer.from(key.keyHash, 'hex');
    const providedHash = Buffer.from(keyHash, 'hex');

    if (storedHash.length !== providedHash.length || !timingSafeEqual(storedHash, providedHash)) {
      return c.json(
        {
          error: {
            code: 'AUTHENTICATION_ERROR',
            message: 'Invalid API key',
            details: {},
          },
        },
        401,
      );
    }

    // Check expiration
    if (key.expiresAt && new Date(key.expiresAt) < new Date()) {
      return c.json(
        {
          error: {
            code: 'AUTHENTICATION_ERROR',
            message: 'API key expired',
            details: {},
          },
        },
        401,
      );
    }

    // Check revocation
    if (key.revokedAt) {
      return c.json(
        {
          error: {
            code: 'AUTHENTICATION_ERROR',
            message: 'API key revoked',
            details: {},
          },
        },
        401,
      );
    }

    // Store auth context on request
    c.set('tenantId', key.tenantId);
    c.set('apiKeyId', key.id);
    c.set('permissions', key.scopes);

    // Update last_used_at (fire-and-forget)
    db.update(apiKeys)
      .set({ lastUsedAt: new Date() })
      .where(eq(apiKeys.id, key.id))
      .catch(() => {});

    await next();
  } catch {
    return c.json(
      {
        error: {
          code: 'AUTHENTICATION_ERROR',
          message: 'Authentication failed',
          details: {},
        },
      },
      401,
    );
  }
});
