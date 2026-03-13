import { createHash, randomBytes } from 'node:crypto';
import { sessions, tenants } from '@ctrlpane/db';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { ulid } from 'ulid';
import { dualAuthMiddleware } from '../middleware/dual-auth.js';
import type { AppEnv } from '../shared/hono-env.js';

const COOKIE_NAME = 'ctrlpane_sid';
const SESSION_MAX_AGE = 604800; // 7 days in seconds
const DEV_TENANT_ID = 'tnt_seed_00000000000000000000000001';

export const authRoutes = new Hono<AppEnv>()

  // POST /api/auth/dev-session — create a dev session (non-production only)
  .post('/dev-session', async (c) => {
    if (process.env.NODE_ENV === 'production') {
      return c.json(
        {
          error: {
            code: 'FORBIDDEN',
            message: 'Dev sessions are not available in production',
            details: {},
          },
        },
        403,
      );
    }

    const db = c.get('db');
    const token = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const sessionId = `ses_${ulid()}`;
    const expiresAt = new Date(Date.now() + SESSION_MAX_AGE * 1000);

    // Ensure the dev tenant exists before creating the session (avoids FK violation
    // on freshly-migrated databases that haven't been seeded).
    await db
      .insert(tenants)
      .values({
        id: DEV_TENANT_ID,
        name: 'Dev Tenant',
        slug: 'dev-tenant',
        plan: 'pro',
      })
      .onConflictDoNothing({ target: tenants.id });

    await db.insert(sessions).values({
      id: sessionId,
      tenantId: DEV_TENANT_ID,
      tokenHash,
      userAgent: c.req.header('User-Agent') ?? null,
      ipAddress: null,
      expiresAt,
    });

    const isProduction = process.env.NODE_ENV === 'production';

    setCookie(c, COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: 'Strict',
      secure: isProduction,
      path: '/',
      maxAge: SESSION_MAX_AGE,
    });

    return c.json({
      data: {
        tenant_id: DEV_TENANT_ID,
        expires_at: expiresAt.toISOString(),
      },
    });
  })

  // GET /api/auth/me — get current auth info (requires auth)
  .get('/me', dualAuthMiddleware, (c) => {
    return c.json({
      data: {
        authenticated: true,
        tenant_id: c.get('tenantId'),
        auth_method: c.get('authMethod'),
      },
    });
  })

  // DELETE /api/auth/session — log out (destroy session)
  .delete('/session', dualAuthMiddleware, async (c) => {
    const token = getCookie(c, COOKIE_NAME);

    if (token) {
      const tokenHash = createHash('sha256').update(token).digest('hex');
      const db = c.get('db');

      // Delete session from DB
      await db.delete(sessions).where(eq(sessions.tokenHash, tokenHash));
    }

    // Always clear the cookie
    deleteCookie(c, COOKIE_NAME, {
      httpOnly: true,
      sameSite: 'Strict',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
    });

    return c.json({
      data: { success: true },
    });
  });
