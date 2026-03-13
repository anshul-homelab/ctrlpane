import { createHash } from 'node:crypto';
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import type { AppEnv } from '../shared/hono-env.js';
import { authRoutes } from './auth.js';

// ── Fixtures ─────────────────────────────────────────────────────────

const SESSION_TOKEN = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2';
const SESSION_TOKEN_HASH = createHash('sha256').update(SESSION_TOKEN).digest('hex');
const SESSION_TENANT_ID = 'tnt_seed_00000000000000000000000001';
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

// ── Helpers ──────────────────────────────────────────────────────────

interface MockDbOptions {
  sessionRows?: Record<string, unknown>[];
  insertedValues?: Record<string, unknown>[];
  deleteCalled?: { called: boolean };
}

/**
 * Creates a test Hono app with the auth routes mounted at /api/auth.
 * The mock DB tracks insert and delete operations for verification.
 */
function createApp(opts: MockDbOptions = {}) {
  const { sessionRows = [], insertedValues = [], deleteCalled = { called: false } } = opts;
  const app = new Hono<AppEnv>();

  // Inject mock DB into context
  app.use('*', async (c, next) => {
    const mockDb = {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: () => Promise.resolve(sessionRows),
          }),
        }),
      }),
      insert: () => ({
        values: (vals: Record<string, unknown>) => {
          insertedValues.push(vals);
          return Object.assign(Promise.resolve(), {
            onConflictDoNothing: () => Promise.resolve(),
            onConflictDoUpdate: () => Promise.resolve(),
          });
        },
      }),
      delete: () => ({
        where: () => {
          deleteCalled.called = true;
          return Promise.resolve();
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

  app.route('/api/auth', authRoutes);
  return app;
}

describe('unit: Auth Routes', () => {
  // ── POST /api/auth/dev-session ──────────────────────────────────

  describe('POST /api/auth/dev-session', () => {
    it('creates session and sets cookie in non-production', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'test';

      try {
        const insertedValues: Record<string, unknown>[] = [];
        const app = createApp({ insertedValues });

        const res = await app.request('/api/auth/dev-session', {
          method: 'POST',
        });

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.data.tenant_id).toBe(SESSION_TENANT_ID);
        expect(body.data.expires_at).toBeDefined();

        // Verify cookie was set
        const setCookieHeader = res.headers.get('Set-Cookie');
        expect(setCookieHeader).toBeTruthy();
        expect(setCookieHeader).toContain('ctrlpane_sid=');
        expect(setCookieHeader).toContain('HttpOnly');
        expect(setCookieHeader).toContain('SameSite=Strict');
        expect(setCookieHeader).toContain('Path=/');

        // Verify tenant upsert + session insert were performed
        expect(insertedValues.length).toBe(2);

        // First insert: dev tenant (upsert with onConflictDoNothing)
        const tenantInsert = insertedValues[0];
        expect(tenantInsert).toBeDefined();
        expect(tenantInsert?.id).toBe(SESSION_TENANT_ID);

        // Second insert: session
        const sessionInsert = insertedValues[1];
        expect(sessionInsert).toBeDefined();
        if (sessionInsert) {
          expect(sessionInsert.tenantId).toBe(SESSION_TENANT_ID);
          expect(sessionInsert.id).toMatch(/^ses_/);
          expect(sessionInsert.tokenHash).toBeDefined();
        }
      } finally {
        process.env.NODE_ENV = originalEnv;
      }
    });

    it('returns 403 in production mode', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      try {
        const app = createApp();
        const res = await app.request('/api/auth/dev-session', {
          method: 'POST',
        });

        expect(res.status).toBe(403);
        const body = await res.json();
        expect(body.error.code).toBe('FORBIDDEN');
        expect(body.error.message).toBe('Dev sessions are not available in production');
      } finally {
        process.env.NODE_ENV = originalEnv;
      }
    });
  });

  // ── GET /api/auth/me ────────────────────────────────────────────

  describe('GET /api/auth/me', () => {
    it('returns auth info with valid session cookie', async () => {
      const app = createApp({ sessionRows: [validSession] });
      const res = await app.request('/api/auth/me', {
        headers: { Cookie: `ctrlpane_sid=${SESSION_TOKEN}` },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.authenticated).toBe(true);
      expect(body.data.tenant_id).toBe(SESSION_TENANT_ID);
      expect(body.data.auth_method).toBe('session');
    });

    it('returns 401 without authentication', async () => {
      const app = createApp();
      const res = await app.request('/api/auth/me');
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error.code).toBe('AUTHENTICATION_ERROR');
    });
  });

  // ── DELETE /api/auth/session ────────────────────────────────────

  describe('DELETE /api/auth/session', () => {
    it('clears cookie and deletes session from DB', async () => {
      const deleteCalled = { called: false };
      const app = createApp({
        sessionRows: [validSession],
        deleteCalled,
      });

      const res = await app.request('/api/auth/session', {
        method: 'DELETE',
        headers: { Cookie: `ctrlpane_sid=${SESSION_TOKEN}` },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.success).toBe(true);

      // Verify cookie was cleared
      const setCookieHeader = res.headers.get('Set-Cookie');
      expect(setCookieHeader).toBeTruthy();
      // Cookie clearing sets Max-Age=0 or Expires in the past
      expect(setCookieHeader).toContain('ctrlpane_sid=');

      // Verify session was deleted from DB
      expect(deleteCalled.called).toBe(true);
    });

    it('returns 401 without authentication', async () => {
      const app = createApp();
      const res = await app.request('/api/auth/session', {
        method: 'DELETE',
      });
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error.code).toBe('AUTHENTICATION_ERROR');
    });
  });
});
