import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { sessions, tenants } from '@ctrlpane/db';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import { Hono } from 'hono';
import postgres from 'postgres';
import { GenericContainer, Wait } from 'testcontainers';
import type { StartedTestContainer } from 'testcontainers';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AppEnv } from '../shared/hono-env.js';
import { authRoutes } from './auth.js';

/**
 * Integration test for POST /api/auth/dev-session.
 *
 * Spins up a real Postgres container, applies migrations (no seed), and verifies
 * the dev-session endpoint succeeds without a pre-existing tenant. This is the
 * exact scenario that caused the FK violation bug in preview environments.
 */

let pgContainer: StartedTestContainer;
let sql: ReturnType<typeof postgres>;
let db: ReturnType<typeof drizzle>;

// Helper: apply raw SQL migration files in order
async function applyMigrations(connection: ReturnType<typeof postgres>) {
  // biome-ignore lint/style/noNonNullAssertion: dirname always defined for file: URLs
  const migrationsDir = join(import.meta.dirname!, '../../../../packages/db/src/migrations');
  const migrationFiles = [
    '0001_create_tables.sql',
    '0002_api_keys_auth_bypass.sql',
    '0003_create_sessions.sql',
  ];

  for (const file of migrationFiles) {
    const content = readFileSync(join(migrationsDir, file), 'utf-8');
    await connection.unsafe(content);
  }
}

// Build a Hono app wired to the real DB (no mocks)
function createIntegrationApp(realDb: ReturnType<typeof drizzle>) {
  const app = new Hono<AppEnv>();
  app.use('*', async (c, next) => {
    // biome-ignore lint/suspicious/noExplicitAny: integration test wiring
    c.set('db', realDb as any);
    await next();
  });
  app.route('/api/auth', authRoutes);
  return app;
}

describe('integration: POST /api/auth/dev-session', () => {
  beforeAll(async () => {
    pgContainer = await new GenericContainer('postgres:17-alpine')
      .withEnvironment({
        POSTGRES_DB: 'ctrlpane_test',
        POSTGRES_USER: 'ctrlpane_app',
        POSTGRES_PASSWORD: 'test',
      })
      .withExposedPorts(5432)
      .withWaitStrategy(Wait.forListeningPorts())
      .start();

    const pgPort = pgContainer.getMappedPort(5432);
    // secretlint-disable -- dev-only test credentials
    sql = postgres(`postgres://ctrlpane_app:test@localhost:${pgPort}/ctrlpane_test`);
    // secretlint-enable
    db = drizzle(sql);

    await applyMigrations(sql);
  }, 60_000);

  afterAll(async () => {
    await sql.end();
    await pgContainer.stop();
  });

  it('succeeds on a freshly-migrated DB with no seed data (no FK violation)', async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'test';

    try {
      const app = createIntegrationApp(db);

      const res = await app.request('/api/auth/dev-session', {
        method: 'POST',
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.tenant_id).toBe('tnt_seed_00000000000000000000000001');
      expect(body.data.expires_at).toBeDefined();

      // Verify the tenant was auto-created in the DB
      const [tenant] = await db
        .select()
        .from(tenants)
        .where(eq(tenants.id, 'tnt_seed_00000000000000000000000001'))
        .limit(1);
      expect(tenant).toBeDefined();
      expect(tenant?.name).toBe('Dev Tenant');

      // Verify the session was actually persisted
      const allSessions = await db.select().from(sessions).limit(10);
      expect(allSessions.length).toBeGreaterThanOrEqual(1);
      expect(allSessions[0]?.tenantId).toBe('tnt_seed_00000000000000000000000001');
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });

  it('is idempotent — calling twice does not fail on tenant conflict', async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'test';

    try {
      const app = createIntegrationApp(db);

      // First call (tenant may already exist from previous test)
      const res1 = await app.request('/api/auth/dev-session', {
        method: 'POST',
      });
      expect(res1.status).toBe(200);

      // Second call — must not fail with unique constraint violation
      const res2 = await app.request('/api/auth/dev-session', {
        method: 'POST',
      });
      expect(res2.status).toBe(200);
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });
});
