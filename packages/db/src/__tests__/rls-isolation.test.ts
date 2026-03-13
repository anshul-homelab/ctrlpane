/**
 * RLS Isolation Tests
 *
 * These tests verify that Postgres Row-Level Security correctly isolates
 * tenant data. They require a running Postgres instance.
 *
 * In CI without Docker/testcontainers, tests are skipped.
 * Locally, run: `docker compose up -d postgres` then `bun test packages/db`
 */
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { IdPrefix, createId } from '@ctrlpane/shared';
import { sql as rawSql } from 'drizzle-orm';
import { createConnection, createDrizzle } from '../client/db-client.js';
import type { DbConfig } from '../client/db-client.js';
import * as schema from '../schema/index.js';

/**
 * Check if Postgres is available at the test port.
 */
async function isPostgresAvailable(config: DbConfig): Promise<boolean> {
  try {
    const sql = createConnection(config);
    await sql`SELECT 1`;
    await sql.end();
    return true;
  } catch {
    return false;
  }
}

const testConfig: DbConfig = {
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? '35432'),
  database: process.env.DB_NAME ?? 'ctrlpane_test',
  username: process.env.DB_USER ?? 'ctrlpane_app',
  password: process.env.DB_PASSWORD ?? 'ctrlpane_dev',
};

// Skip all tests if Postgres is not available
const pgAvailable = await isPostgresAvailable(testConfig);
const testFn = pgAvailable ? it : it.skip;

describe('RLS Isolation', () => {
  const tenantA = 'tnt_test_aaaaaaaaaaaaaaaaaaaaaaaa01';
  const tenantB = 'tnt_test_bbbbbbbbbbbbbbbbbbbbbbbb01';

  beforeAll(async () => {
    if (!pgAvailable) return;

    const connection = createConnection(testConfig);
    const db = createDrizzle(connection);

    try {
      // Ensure test tenants exist
      await db
        .insert(schema.tenants)
        .values([
          { id: tenantA, name: 'Tenant A', slug: 'tenant-a' },
          { id: tenantB, name: 'Tenant B', slug: 'tenant-b' },
        ])
        .onConflictDoNothing();
    } finally {
      await connection.end();
    }
  });

  afterAll(async () => {
    if (!pgAvailable) return;

    // Cleanup test tenants and their data
    const connection = createConnection(testConfig);
    try {
      // Use raw SQL to bypass RLS for cleanup
      await connection.unsafe(`
        DELETE FROM blueprint_activity WHERE tenant_id IN ('${tenantA}', '${tenantB}');
        DELETE FROM blueprint_comments WHERE tenant_id IN ('${tenantA}', '${tenantB}');
        DELETE FROM blueprint_item_tags WHERE tenant_id IN ('${tenantA}', '${tenantB}');
        DELETE FROM blueprint_tags WHERE tenant_id IN ('${tenantA}', '${tenantB}');
        DELETE FROM blueprint_items WHERE tenant_id IN ('${tenantA}', '${tenantB}');
        DELETE FROM outbox_events WHERE tenant_id IN ('${tenantA}', '${tenantB}');
        DELETE FROM api_keys WHERE tenant_id IN ('${tenantA}', '${tenantB}');
        DELETE FROM tenants WHERE id IN ('${tenantA}', '${tenantB}');
      `);
    } finally {
      await connection.end();
    }
  });

  testFn('returns zero rows without SET LOCAL app.tenant_id', async () => {
    const connection = createConnection(testConfig);
    const db = createDrizzle(connection);

    try {
      const result = await db.select().from(schema.blueprintItems);
      expect(result).toHaveLength(0);
    } finally {
      await connection.end();
    }
  });

  testFn('tenant A cannot see tenant B data', async () => {
    const connection = createConnection(testConfig);
    const db = createDrizzle(connection);

    try {
      // Insert data as tenant A
      const itemA = createId(IdPrefix.BlueprintItem);
      await db.transaction(async (tx) => {
        await tx.execute(rawSql.raw(`SET LOCAL app.tenant_id = '${tenantA}'`));
        await tx.insert(schema.blueprintItems).values({
          id: itemA,
          tenantId: tenantA,
          title: 'Tenant A item',
          kind: 'idea',
        });
      });

      // Query as tenant B — should see zero items
      const result = await db.transaction(async (tx) => {
        await tx.execute(rawSql.raw(`SET LOCAL app.tenant_id = '${tenantB}'`));
        return await tx.select().from(schema.blueprintItems);
      });

      expect(result).toHaveLength(0);

      // Cleanup
      await db.transaction(async (tx) => {
        await tx.execute(rawSql.raw(`SET LOCAL app.tenant_id = '${tenantA}'`));
        await tx
          .delete(schema.blueprintItems)
          .where(rawSql`${schema.blueprintItems.id} = ${itemA}`);
      });
    } finally {
      await connection.end();
    }
  });

  testFn('tenant A can see own data', async () => {
    const connection = createConnection(testConfig);
    const db = createDrizzle(connection);

    try {
      const itemA = createId(IdPrefix.BlueprintItem);
      await db.transaction(async (tx) => {
        await tx.execute(rawSql.raw(`SET LOCAL app.tenant_id = '${tenantA}'`));
        await tx.insert(schema.blueprintItems).values({
          id: itemA,
          tenantId: tenantA,
          title: 'Tenant A own item',
          kind: 'task',
        });
      });

      // Query as tenant A — should see the item
      const result = await db.transaction(async (tx) => {
        await tx.execute(rawSql.raw(`SET LOCAL app.tenant_id = '${tenantA}'`));
        return await tx.select().from(schema.blueprintItems);
      });

      expect(result.length).toBeGreaterThanOrEqual(1);
      expect(result.some((r) => r.id === itemA)).toBe(true);

      // Cleanup
      await db.transaction(async (tx) => {
        await tx.execute(rawSql.raw(`SET LOCAL app.tenant_id = '${tenantA}'`));
        await tx
          .delete(schema.blueprintItems)
          .where(rawSql`${schema.blueprintItems.id} = ${itemA}`);
      });
    } finally {
      await connection.end();
    }
  });

  testFn('soft-deleted items are still accessible via RLS (app filters them)', async () => {
    const connection = createConnection(testConfig);
    const db = createDrizzle(connection);

    try {
      const itemId = createId(IdPrefix.BlueprintItem);

      // Insert then soft-delete
      await db.transaction(async (tx) => {
        await tx.execute(rawSql.raw(`SET LOCAL app.tenant_id = '${tenantA}'`));
        await tx.insert(schema.blueprintItems).values({
          id: itemId,
          tenantId: tenantA,
          title: 'Soft deleted item',
          kind: 'note',
        });
        await tx
          .update(schema.blueprintItems)
          .set({ deletedAt: new Date() })
          .where(rawSql`${schema.blueprintItems.id} = ${itemId}`);
      });

      // RLS should still return soft-deleted rows (application filters them)
      const result = await db.transaction(async (tx) => {
        await tx.execute(rawSql.raw(`SET LOCAL app.tenant_id = '${tenantA}'`));
        return await tx.select().from(schema.blueprintItems);
      });

      expect(result.some((r) => r.id === itemId)).toBe(true);

      // Cleanup
      await db.transaction(async (tx) => {
        await tx.execute(rawSql.raw(`SET LOCAL app.tenant_id = '${tenantA}'`));
        await tx
          .delete(schema.blueprintItems)
          .where(rawSql`${schema.blueprintItems.id} = ${itemId}`);
      });
    } finally {
      await connection.end();
    }
  });

  testFn('outbox events are tenant-isolated', async () => {
    const connection = createConnection(testConfig);
    const db = createDrizzle(connection);

    try {
      const eventId = createId(IdPrefix.OutboxEvent);

      // Insert outbox event as tenant A
      await db.transaction(async (tx) => {
        await tx.execute(rawSql.raw(`SET LOCAL app.tenant_id = '${tenantA}'`));
        await tx.insert(schema.outboxEvents).values({
          id: eventId,
          tenantId: tenantA,
          eventType: 'blueprint.item.created.v1',
          aggregateType: 'blueprint_item',
          aggregateId: 'bpi_test',
          payload: { test: true },
        });
      });

      // Tenant B should not see the event
      const resultB = await db.transaction(async (tx) => {
        await tx.execute(rawSql.raw(`SET LOCAL app.tenant_id = '${tenantB}'`));
        return await tx.select().from(schema.outboxEvents);
      });
      expect(resultB).toHaveLength(0);

      // Tenant A should see the event
      const resultA = await db.transaction(async (tx) => {
        await tx.execute(rawSql.raw(`SET LOCAL app.tenant_id = '${tenantA}'`));
        return await tx.select().from(schema.outboxEvents);
      });
      expect(resultA.some((r) => r.id === eventId)).toBe(true);

      // Cleanup
      await db.transaction(async (tx) => {
        await tx.execute(rawSql.raw(`SET LOCAL app.tenant_id = '${tenantA}'`));
        await tx.delete(schema.outboxEvents).where(rawSql`${schema.outboxEvents.id} = ${eventId}`);
      });
    } finally {
      await connection.end();
    }
  });
});
