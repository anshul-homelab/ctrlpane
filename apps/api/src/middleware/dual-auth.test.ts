import { createHash } from 'node:crypto';
import { apiKeys, sessions } from '@ctrlpane/db';
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import type { AppEnv } from '../shared/hono-env.js';
import { dualAuthMiddleware } from './dual-auth.js';

// ── Session fixtures ─────────────────────────────────────────────────

const SESSION_TOKEN = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2';
const SESSION_TOKEN_HASH = createHash('sha256').update(SESSION_TOKEN).digest('hex');
const SESSION_TENANT_ID = 'tnt_01SESSION_TENANT';
const SESSION_ID = 'ses_01SESSION';

const validSession = {
  id: SESSION_ID,
  tenantId: SESSION_TENANT_ID,
  tokenHash: SESSION_TOKEN_HASH,
  userAgent: null,
  ipAddress: null,
  expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  createdAt: new Date(),
};

// ── API key fixtures ─────────────────────────────────────────────────

const API_KEY = 'cpk_test_1234567890abcdef';
const API_KEY_HASH = createHash('sha256').update(API_KEY).digest('hex');
const API_KEY_PREFIX = API_KEY.slice(0, 8);
const API_KEY_TENANT_ID = 'tnt_01APIKEY_TENANT';

const validApiKey = {
  id: 'apk_01TEST',
  tenantId: API_KEY_TENANT_ID,
  name: 'Test Key',
  keyHash: API_KEY_HASH,
  keyPrefix: API_KEY_PREFIX,
  scopes: ['read', 'write'],
  expiresAt: null,
  revokedAt: null,
  lastUsedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

// ── Helper ───────────────────────────────────────────────────────────

interface MockDbOptions {
  sessionRows?: Record<string, unknown>[];
  apiKeyRows?: Record<string, unknown>[];
}

/**
 * Creates a test Hono app with dual auth middleware.
 *
 * The mock DB uses the Drizzle table reference identity to return the
 * correct rows for each auth path (session-auth queries `sessions`,
 * API key auth queries `apiKeys`).
 */
function createApp(opts: MockDbOptions = {}) {
  const { sessionRows = [], apiKeyRows = [] } = opts;
  const app = new Hono<AppEnv>();

  app.use('*', async (c, next) => {
    const mockDb = {
      select: () => ({
        from: (table: unknown) => {
          // Match by reference identity to the imported Drizzle table objects
          const rows = table === sessions ? sessionRows : table === apiKeys ? apiKeyRows : [];
          return {
            where: () => ({
              limit: () => Promise.resolve(rows),
            }),
          };
        },
      }),
      update: () => ({
        set: () => ({
          where: () => Promise.resolve(),
        }),
      }),
    };
    // biome-ignore lint/suspicious/noExplicitAny: mock DB for testing
    c.set('db', mockDb as any);
    await next();
  });

  app.use('/test', dualAuthMiddleware);
  app.get('/test', (c) =>
    c.json({
      tenantId: c.get('tenantId'),
      apiKeyId: c.get('apiKeyId'),
      permissions: c.get('permissions'),
      authMethod: c.get('authMethod'),
    }),
  );
  return app;
}

describe('unit: Dual Auth Middleware', () => {
  it('authenticates via session cookie when present and valid', async () => {
    const app = createApp({ sessionRows: [validSession] });
    const res = await app.request('/test', {
      headers: { Cookie: `ctrlpane_sid=${SESSION_TOKEN}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tenantId).toBe(SESSION_TENANT_ID);
    expect(body.apiKeyId).toBe(SESSION_ID);
    expect(body.authMethod).toBe('session');
  });

  it('falls through to API key when no cookie is present', async () => {
    const app = createApp({ apiKeyRows: [validApiKey] });
    const res = await app.request('/test', {
      headers: { 'X-API-Key': API_KEY },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tenantId).toBe(API_KEY_TENANT_ID);
    expect(body.apiKeyId).toBe('apk_01TEST');
    expect(body.authMethod).toBe('api_key');
  });

  it('returns 401 when neither cookie nor API key is provided', async () => {
    const app = createApp();
    const res = await app.request('/test');
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe('AUTHENTICATION_ERROR');
    expect(body.error.message).toBe('Authentication required');
  });

  it('falls through to API key when session is expired', async () => {
    const expiredSession = {
      ...validSession,
      expiresAt: new Date('2020-01-01'),
    };
    const app = createApp({
      sessionRows: [expiredSession],
      apiKeyRows: [validApiKey],
    });
    const res = await app.request('/test', {
      headers: {
        Cookie: `ctrlpane_sid=${SESSION_TOKEN}`,
        'X-API-Key': API_KEY,
      },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tenantId).toBe(API_KEY_TENANT_ID);
    expect(body.authMethod).toBe('api_key');
  });

  it('prefers session over API key when both are valid', async () => {
    const app = createApp({
      sessionRows: [validSession],
      apiKeyRows: [validApiKey],
    });
    const res = await app.request('/test', {
      headers: {
        Cookie: `ctrlpane_sid=${SESSION_TOKEN}`,
        'X-API-Key': API_KEY,
      },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tenantId).toBe(SESSION_TENANT_ID);
    expect(body.authMethod).toBe('session');
  });

  it('returns 401 when cookie is invalid and no API key is provided', async () => {
    const app = createApp({ sessionRows: [] }); // no matching session
    const res = await app.request('/test', {
      headers: { Cookie: 'ctrlpane_sid=invalid_token' },
    });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe('AUTHENTICATION_ERROR');
  });
});
