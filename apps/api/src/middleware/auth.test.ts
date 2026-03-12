import { createHash } from 'node:crypto';
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import type { AppEnv } from '../shared/hono-env.js';
import { authMiddleware } from './auth.js';

/**
 * Creates a test Hono app with a mock DB injected via middleware.
 * The mock DB returns the provided rows for any select query.
 */
function createApp(mockRows: Record<string, unknown>[] = []) {
  const app = new Hono<AppEnv>();

  // Inject mock DB into context before auth middleware runs
  app.use('*', async (c, next) => {
    const mockDb = {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: () => Promise.resolve(mockRows),
          }),
        }),
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

  app.use('*', authMiddleware);
  app.get('/test', (c) =>
    c.json({
      tenantId: c.get('tenantId'),
      apiKeyId: c.get('apiKeyId'),
      permissions: c.get('permissions'),
    }),
  );
  return app;
}

const TEST_KEY = 'cpk_test_1234567890abcdef';
const TEST_KEY_HASH = createHash('sha256').update(TEST_KEY).digest('hex');
const TEST_KEY_PREFIX = TEST_KEY.slice(0, 8);

const validKeyRow = {
  id: 'apk_01TEST',
  tenantId: 'tnt_01TENANT',
  name: 'Test Key',
  keyHash: TEST_KEY_HASH,
  keyPrefix: TEST_KEY_PREFIX,
  scopes: ['read', 'write'],
  expiresAt: null,
  revokedAt: null,
  lastUsedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('unit: Auth Middleware', () => {
  it('returns 401 when X-API-Key header is missing', async () => {
    const app = createApp();
    const res = await app.request('/test');
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe('AUTHENTICATION_ERROR');
    expect(body.error.message).toBe('Missing X-API-Key header');
  });

  it('returns 401 when API key is not found', async () => {
    const app = createApp([]);
    const res = await app.request('/test', {
      headers: { 'X-API-Key': 'unknown_key_value' },
    });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.message).toBe('Invalid API key');
  });

  it('returns 401 when hash does not match', async () => {
    const wrongHashRow = {
      ...validKeyRow,
      keyHash: createHash('sha256').update('wrong_key').digest('hex'),
    };
    const app = createApp([wrongHashRow]);
    const res = await app.request('/test', {
      headers: { 'X-API-Key': TEST_KEY },
    });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.message).toBe('Invalid API key');
  });

  it('returns 401 when API key is expired', async () => {
    const expiredRow = {
      ...validKeyRow,
      expiresAt: new Date('2020-01-01'),
    };
    const app = createApp([expiredRow]);
    const res = await app.request('/test', {
      headers: { 'X-API-Key': TEST_KEY },
    });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.message).toBe('API key expired');
  });

  it('returns 401 when API key is revoked', async () => {
    const revokedRow = {
      ...validKeyRow,
      revokedAt: new Date('2024-01-01'),
    };
    const app = createApp([revokedRow]);
    const res = await app.request('/test', {
      headers: { 'X-API-Key': TEST_KEY },
    });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.message).toBe('API key revoked');
  });

  it('sets tenant context on success', async () => {
    const app = createApp([validKeyRow]);
    const res = await app.request('/test', {
      headers: { 'X-API-Key': TEST_KEY },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tenantId).toBe('tnt_01TENANT');
    expect(body.apiKeyId).toBe('apk_01TEST');
    expect(body.permissions).toEqual(['read', 'write']);
  });
});
