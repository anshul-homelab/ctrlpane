import { IdPrefix, createId } from '@ctrlpane/shared';
import { sql as rawSql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { defaultDbConfig } from '../client/db-client.js';
import * as schema from '../schema/index.js';

/**
 * Seed script: creates test tenant, API key, and sample blueprint data.
 *
 * Idempotent: uses fixed IDs so re-running overwrites cleanly.
 */
async function seed() {
  const config = defaultDbConfig();
  const connection = postgres({
    host: config.host,
    port: config.port,
    database: config.database,
    username: config.username,
    password: config.password,
    ssl: config.ssl ? 'require' : undefined,
  });

  const db = drizzle(connection, { schema });

  try {
    console.log('Seeding database...');

    // Fixed IDs for idempotent seeding
    const tenantId = 'tnt_seed_00000000000000000000000001';
    const apiKeyId = 'apk_seed_00000000000000000000000001';

    // 1. Create test tenant
    await db
      .insert(schema.tenants)
      .values({
        id: tenantId,
        name: 'Seed Tenant',
        slug: 'seed-tenant',
        plan: 'pro',
      })
      .onConflictDoUpdate({
        target: schema.tenants.id,
        set: { name: 'Seed Tenant', slug: 'seed-tenant', plan: 'pro' },
      });
    console.log('  [ok] Tenant created:', tenantId);

    // 2. Create test API key (hash of "ctrlpane_test_key_seed")
    const testKeyHash = 'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
    await db
      .insert(schema.apiKeys)
      .values({
        id: apiKeyId,
        tenantId,
        name: 'Seed API Key',
        keyHash: testKeyHash,
        keyPrefix: 'ctrlpane',
        scopes: ['read', 'write'],
      })
      .onConflictDoUpdate({
        target: schema.apiKeys.id,
        set: { name: 'Seed API Key', keyHash: testKeyHash, keyPrefix: 'ctrlpane' },
      });
    console.log('  [ok] API Key created:', apiKeyId);

    // 3. Bypass RLS for seeding by using raw SQL insert approach
    // (The app role has RLS enforced, so we insert directly without SET LOCAL for seed data)
    // For blueprint items, we use the superadmin or seeder pattern.
    // Since this is a dev seed, we set tenant context first.
    await db.execute(rawSql.raw(`SET LOCAL app.tenant_id = '${tenantId}'`));

    // 4. Create sample blueprint items
    const ideaId = createId(IdPrefix.BlueprintItem);
    const taskId = createId(IdPrefix.BlueprintItem);
    const noteId = createId(IdPrefix.BlueprintItem);

    // Note: We need to wrap in a transaction for SET LOCAL to work
    await db.transaction(async (tx) => {
      await tx.execute(rawSql.raw(`SET LOCAL app.tenant_id = '${tenantId}'`));

      await tx.insert(schema.blueprintItems).values([
        {
          id: ideaId,
          tenantId,
          title: 'Build AI-first project management',
          body: 'CtrlPane should be the single source of truth for all project management across all projects.',
          status: 'active',
          priority: 'high',
          kind: 'idea',
          sortOrder: 0,
        },
        {
          id: taskId,
          tenantId,
          title: 'Implement blueprint CRUD API',
          body: 'Create the REST endpoints for blueprint items with full CRUD support.',
          status: 'draft',
          priority: 'high',
          kind: 'task',
          parentId: ideaId,
          sortOrder: 1,
        },
        {
          id: noteId,
          tenantId,
          title: 'Architecture notes on multi-tenancy',
          body: 'RLS-based isolation with SET LOCAL app.tenant_id pattern. All queries go through tenant-scoped transactions.',
          status: 'active',
          priority: 'medium',
          kind: 'note',
          sortOrder: 2,
        },
      ]);
      console.log('  [ok] Blueprint items created:', ideaId, taskId, noteId);

      // 5. Create sample tags
      const tagUrgent = createId(IdPrefix.BlueprintTag);
      const tagBackend = createId(IdPrefix.BlueprintTag);

      await tx.insert(schema.blueprintTags).values([
        { id: tagUrgent, tenantId, name: 'urgent', color: '#ef4444' },
        { id: tagBackend, tenantId, name: 'backend', color: '#3b82f6' },
      ]);
      console.log('  [ok] Tags created:', tagUrgent, tagBackend);

      // 6. Tag the task with both tags
      await tx.insert(schema.blueprintItemTags).values([
        { tenantId, itemId: taskId, tagId: tagUrgent },
        { tenantId, itemId: taskId, tagId: tagBackend },
      ]);
      console.log('  [ok] Item-tag associations created');

      // 7. Add a comment
      const commentId = createId(IdPrefix.BlueprintComment);
      await tx.insert(schema.blueprintComments).values({
        id: commentId,
        tenantId,
        itemId: taskId,
        authorId: 'usr_system',
        authorType: 'system',
        body: 'This task was created during database seeding.',
      });
      console.log('  [ok] Comment created:', commentId);

      // 8. Add activity log entry
      const activityId = createId(IdPrefix.BlueprintActivity);
      await tx.insert(schema.blueprintActivity).values({
        id: activityId,
        tenantId,
        itemId: ideaId,
        actorId: 'usr_system',
        actorType: 'system',
        action: 'created',
        changes: { title: { from: null, to: 'Build AI-first project management' } },
      });
      console.log('  [ok] Activity log created:', activityId);
    });

    console.log('\nSeed complete.');
  } catch (error) {
    console.error('Seed failed:', error);
    process.exit(1);
  } finally {
    await connection.end();
  }
}

seed();
