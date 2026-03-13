/**
 * Test infrastructure helpers using testcontainers.
 *
 * Provides isolated Postgres and Redis containers for integration tests.
 * Containers are created on demand and cleaned up after tests complete.
 *
 * Requirements:
 * - Docker must be running for integration tests
 * - Use `createTestInfra()` in beforeAll/afterAll lifecycle hooks
 *
 * If Docker is not available, tests using this helper should be skipped
 * via vitest's `skipIf` or by checking `isDockerAvailable()`.
 */
import { execSync } from 'node:child_process';
import { drizzle } from 'drizzle-orm/postgres-js';
import Redis from 'ioredis';
import postgres from 'postgres';
import { GenericContainer, Wait } from 'testcontainers';
import type { StartedTestContainer } from 'testcontainers';

export interface TestInfra {
  readonly db: ReturnType<typeof drizzle>;
  readonly sql: ReturnType<typeof postgres>;
  readonly redis: Redis;
  readonly pgPort: number;
  readonly redisPort: number;
  readonly cleanup: () => Promise<void>;
}

/**
 * Check if Docker is available in the current environment.
 * Useful for conditionally skipping integration tests.
 */
export function isDockerAvailable(): boolean {
  try {
    execSync('docker info', { stdio: 'ignore', timeout: 5_000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Create isolated test infrastructure with Postgres and Redis containers.
 *
 * The Postgres container is configured with:
 * - Database: ctrlpane_test
 * - User: ctrlpane_app
 * - Password: test
 *
 * Call `cleanup()` in afterAll to stop containers and close connections.
 *
 * @example
 * ```ts
 * let infra: TestInfra;
 *
 * beforeAll(async () => {
 *   infra = await createTestInfra();
 * });
 *
 * afterAll(async () => {
 *   await infra.cleanup();
 * });
 * ```
 */
export async function createTestInfra(): Promise<TestInfra> {
  const containers: StartedTestContainer[] = [];

  const pgContainer = await new GenericContainer('postgres:17-alpine')
    .withEnvironment({
      POSTGRES_DB: 'ctrlpane_test',
      POSTGRES_USER: 'ctrlpane_app',
      POSTGRES_PASSWORD: 'test',
    })
    .withExposedPorts(5432)
    .withWaitStrategy(Wait.forListeningPorts())
    .start();
  containers.push(pgContainer);

  const redisContainer = await new GenericContainer('redis:7-alpine')
    .withExposedPorts(6379)
    .withWaitStrategy(Wait.forListeningPorts())
    .start();
  containers.push(redisContainer);

  const pgPort = pgContainer.getMappedPort(5432);
  const redisPort = redisContainer.getMappedPort(6379);

  // secretlint-disable -- dev-only test credentials
  const sql = postgres(`postgres://ctrlpane_app:test@localhost:${pgPort}/ctrlpane_test`);
  // secretlint-enable
  const db = drizzle(sql);
  const redis = new Redis({ host: 'localhost', port: redisPort, lazyConnect: true });

  return {
    db,
    sql,
    redis,
    pgPort,
    redisPort,
    cleanup: async () => {
      await sql.end();
      redis.disconnect();
      for (const container of containers) {
        await container.stop();
      }
    },
  };
}

/**
 * Create a Postgres-only test infrastructure (no Redis).
 * Lighter weight for tests that only need database access.
 */
export async function createTestDb(): Promise<
  Pick<TestInfra, 'db' | 'sql' | 'pgPort' | 'cleanup'>
> {
  const pgContainer = await new GenericContainer('postgres:17-alpine')
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
  const sql = postgres(`postgres://ctrlpane_app:test@localhost:${pgPort}/ctrlpane_test`);
  // secretlint-enable
  const db = drizzle(sql);

  return {
    db,
    sql,
    pgPort,
    cleanup: async () => {
      await sql.end();
      await pgContainer.stop();
    },
  };
}

/**
 * Apply RLS policies to a test database.
 * Call after running migrations to set up row-level security.
 */
export async function applyRlsPolicies(
  sql: ReturnType<typeof postgres>,
  tenantId: string,
): Promise<void> {
  await sql.unsafe(`
    -- Set the tenant context for RLS
    SET app.current_tenant_id = '${tenantId}';

    -- Enable RLS on all tables (will be applied as tables are created)
    DO $$
    DECLARE
      tbl RECORD;
    BEGIN
      FOR tbl IN
        SELECT tablename FROM pg_tables
        WHERE schemaname = 'public'
        AND tablename NOT IN ('drizzle_migrations', '__drizzle_migrations')
      LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl.tablename);
        EXECUTE format(
          'CREATE POLICY IF NOT EXISTS tenant_isolation ON %I
           USING (tenant_id = current_setting(''app.current_tenant_id'')::text)',
          tbl.tablename
        );
      END LOOP;
    END $$;
  `);
}
