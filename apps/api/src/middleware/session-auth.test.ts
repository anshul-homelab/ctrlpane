import { createHash } from 'node:crypto';
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import type { AppEnv } from '../shared/hono-env.js';
import { trySessionAuth } from './session-auth.js';

const TEST_TOKEN = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2';
const TEST_TOKEN_HASH = createHash('sha256').update(TEST_TOKEN).digest('hex');
const TENANT_ID = 'tnt_01TENANT';
const SESSION_ID = 'ses_01SESSION';

const validSession = {
  id: SESSION_ID,
  tenantId: TENANT_ID,
  tokenHash: TEST_TOKEN_HASH,
  userAgent: null,
  ipAddress: null,
  expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days in the future
  createdAt: new Date(),
};

/**
 * Creates a test Hono app that uses trySessionAuth and exposes the result.
 * The mock DB returns the provided rows for any select query.
 */
function createApp(mockRows: Record<string, unknown>[] = []) {
  const app = new Hono<AppEnv>();

  // Inject mock DB into context before session auth runs
  app.use('*', async (c, next) => {
    const mockDb = {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: () => Promise.resolve(mockRows),
          }),
        }),
      }),
    };
    // biome-ignore lint/suspicious/noExplicitAny: mock DB for testing
    c.set('db', mockDb as any);
    await next();
  });

  app.get('/test', async (c) => {
    const result = await trySessionAuth(c);
    if (result) {
      return c.json({
        authenticated: true,
        tenantId: c.get('tenantId'),
        apiKeyId: c.get('apiKeyId'),
        permissions: c.get('permissions'),
        authMethod: c.get('authMethod'),
      });
    }
    return c.json({ authenticated: false });
  });

  return app;
}

describe('unit: Session Auth Middleware', () => {
  it('returns false when no cookie is present', async () => {
    const app = createApp();
    const res = await app.request('/test');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.authenticated).toBe(false);
  });

  it('returns false when cookie contains unknown token', async () => {
    const app = createApp([]); // empty results = no matching session
    const res = await app.request('/test', {
      headers: { Cookie: `ctrlpane_sid=${TEST_TOKEN}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.authenticated).toBe(false);
  });

  it('returns false when session is expired', async () => {
    const expiredSession = {
      ...validSession,
      expiresAt: new Date('2020-01-01'),
    };
    const app = createApp([expiredSession]);
    const res = await app.request('/test', {
      headers: { Cookie: `ctrlpane_sid=${TEST_TOKEN}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.authenticated).toBe(false);
  });

  it('returns false when token hash does not match (timing-safe comparison)', async () => {
    const wrongHash = createHash('sha256').update('wrong_token').digest('hex');
    const mismatchSession = {
      ...validSession,
      tokenHash: wrongHash,
    };
    const app = createApp([mismatchSession]);
    const res = await app.request('/test', {
      headers: { Cookie: `ctrlpane_sid=${TEST_TOKEN}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.authenticated).toBe(false);
  });

  it('sets auth context on success with valid cookie and session', async () => {
    const app = createApp([validSession]);
    const res = await app.request('/test', {
      headers: { Cookie: `ctrlpane_sid=${TEST_TOKEN}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.authenticated).toBe(true);
    expect(body.tenantId).toBe(TENANT_ID);
    expect(body.apiKeyId).toBe(SESSION_ID);
    expect(body.permissions).toEqual(['read', 'write']);
    expect(body.authMethod).toBe('session');
  });

  it('returns false when DB throws an error', async () => {
    const app = new Hono<AppEnv>();

    app.use('*', async (c, next) => {
      const mockDb = {
        select: () => ({
          from: () => ({
            where: () => ({
              limit: () => Promise.reject(new Error('DB connection failed')),
            }),
          }),
        }),
      };
      // biome-ignore lint/suspicious/noExplicitAny: mock DB for testing
      c.set('db', mockDb as any);
      await next();
    });

    app.get('/test', async (c) => {
      const result = await trySessionAuth(c);
      return c.json({ authenticated: result });
    });

    const res = await app.request('/test', {
      headers: { Cookie: `ctrlpane_sid=${TEST_TOKEN}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.authenticated).toBe(false);
  });
});
