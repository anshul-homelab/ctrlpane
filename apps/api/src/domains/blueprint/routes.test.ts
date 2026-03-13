import { createHash } from 'node:crypto';
import { apiKeys, outboxEvents, tenants } from '@ctrlpane/db';
import { createId } from '@ctrlpane/shared';
import { sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { authMiddleware } from '../../middleware/auth.js';
import type { AppEnv } from '../../shared/hono-env.js';
import {
  type TestInfra,
  createTestInfra,
  isDockerAvailable,
} from '../../test-helpers/containers.js';
import { blueprintRoutes } from './routes.js';

// biome-ignore lint/suspicious/noExplicitAny: test helper — JSON responses are untyped
type Json = Record<string, any>;

const dockerAvailable = isDockerAvailable();

describe.skipIf(!dockerAvailable)('Blueprint Routes [integration]', () => {
  let infra: TestInfra;
  let app: Hono<AppEnv>;
  let testApiKey: string;
  const tenantId = createId('tnt_');
  const apiKeyId = createId('apk_');

  beforeAll(async () => {
    infra = await createTestInfra();

    // Create tables (simplified — in production you'd run migrations)
    await infra.sql.unsafe(`
      CREATE TABLE IF NOT EXISTS tenants (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        slug TEXT NOT NULL UNIQUE,
        plan TEXT NOT NULL DEFAULT 'free',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS api_keys (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL REFERENCES tenants(id),
        name TEXT NOT NULL,
        key_hash TEXT NOT NULL,
        key_prefix TEXT NOT NULL,
        scopes TEXT[] NOT NULL DEFAULT '{}',
        expires_at TIMESTAMPTZ,
        last_used_at TIMESTAMPTZ,
        revoked_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS blueprint_items (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL REFERENCES tenants(id),
        title TEXT NOT NULL,
        body TEXT,
        status TEXT NOT NULL DEFAULT 'draft',
        priority TEXT NOT NULL DEFAULT 'medium',
        kind TEXT NOT NULL DEFAULT 'idea',
        parent_id TEXT,
        sort_order INTEGER NOT NULL DEFAULT 0,
        metadata JSONB NOT NULL DEFAULT '{}',
        created_by TEXT,
        deleted_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS blueprint_tags (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL REFERENCES tenants(id),
        name TEXT NOT NULL,
        color TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS blueprint_item_tags (
        tenant_id TEXT NOT NULL REFERENCES tenants(id),
        item_id TEXT NOT NULL REFERENCES blueprint_items(id) ON DELETE CASCADE,
        tag_id TEXT NOT NULL REFERENCES blueprint_tags(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (item_id, tag_id)
      );

      CREATE TABLE IF NOT EXISTS blueprint_comments (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL REFERENCES tenants(id),
        item_id TEXT NOT NULL REFERENCES blueprint_items(id) ON DELETE CASCADE,
        author_id TEXT,
        author_type TEXT NOT NULL DEFAULT 'user',
        body TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS blueprint_activity (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL REFERENCES tenants(id),
        item_id TEXT NOT NULL REFERENCES blueprint_items(id) ON DELETE CASCADE,
        actor_id TEXT,
        actor_type TEXT NOT NULL DEFAULT 'user',
        action TEXT NOT NULL,
        changes JSONB NOT NULL DEFAULT '{}',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS outbox_events (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL REFERENCES tenants(id),
        event_type TEXT NOT NULL,
        aggregate_type TEXT NOT NULL,
        aggregate_id TEXT NOT NULL,
        payload JSONB NOT NULL,
        trace_id TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        attempts INTEGER NOT NULL DEFAULT 0,
        published_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // Create test tenant
    testApiKey = `ctrltest_${createId('')}`;
    const keyHash = createHash('sha256').update(testApiKey).digest('hex');
    const keyPrefix = testApiKey.slice(0, 8);

    await infra.db.insert(tenants).values({
      id: tenantId,
      name: 'Test Tenant',
      slug: 'test-tenant',
    });

    await infra.db.insert(apiKeys).values({
      id: apiKeyId,
      tenantId: tenantId,
      name: 'Test Key',
      keyHash: keyHash,
      keyPrefix: keyPrefix,
      scopes: ['read', 'write'],
    });

    // Set env vars for DbClientLive and RedisClientLive
    process.env.DB_HOST = 'localhost';
    process.env.DB_PORT = String(infra.pgPort);
    process.env.DB_NAME = 'ctrlpane_test';
    process.env.DB_USER = 'ctrlpane_app';
    process.env.DB_PASSWORD = 'test';
    process.env.REDIS_URL = `redis://localhost:${infra.redisPort}`;

    // Build test app with auth middleware
    app = new Hono<AppEnv>();

    // Inject DB into context for auth middleware
    const { drizzle } = await import('drizzle-orm/postgres-js');
    const dbConnection = (await import('postgres')).default(
      `postgres://ctrlpane_app:test@localhost:${infra.pgPort}/ctrlpane_test`,
    );
    const schema = await import('@ctrlpane/db');
    const testDb = drizzle(dbConnection, { schema });

    app.use('*', async (c, next) => {
      // biome-ignore lint/suspicious/noExplicitAny: test DB instance type mismatch with Hono context
      c.set('db', testDb as any);
      await next();
    });
    app.use('*', authMiddleware);
    app.route('/api/v1/blueprint', blueprintRoutes);
  }, 120_000);

  afterAll(async () => {
    if (infra) await infra.cleanup();
  });

  const request = (method: 'GET' | 'POST' | 'PATCH' | 'DELETE', path: string, body?: unknown) => {
    const url = `http://localhost/api/v1/blueprint${path}`;
    const init: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': testApiKey,
      },
    };
    if (body) init.body = JSON.stringify(body);
    return app.request(url, init);
  };

  describe('Items CRUD', () => {
    it('creates an item', async () => {
      const res = await request('POST', '/items', {
        title: 'Test Item',
        description: 'Test description',
      });
      expect(res.status).toBe(200);
      const json = (await res.json()) as Json;
      expect(json.data.title).toBe('Test Item');
      expect(json.data.id).toMatch(/^bpi_/);
    });

    it('lists items with pagination', async () => {
      const res = await request('GET', '/items?limit=10');
      expect(res.status).toBe(200);
      const json = (await res.json()) as Json;
      expect(json.data).toBeInstanceOf(Array);
      expect(json.pagination).toBeDefined();
      expect(json.pagination.limit).toBe(10);
    });

    it('gets item by id', async () => {
      // Create first
      const createRes = await request('POST', '/items', {
        title: 'Detail Item',
      });
      const created = (await createRes.json()) as Json;

      const res = await request('GET', `/items/${created.data.id}`);
      expect(res.status).toBe(200);
      const json = (await res.json()) as Json;
      expect(json.data.title).toBe('Detail Item');
      expect(json.data.subItems).toBeInstanceOf(Array);
      expect(json.data.tags).toBeInstanceOf(Array);
      expect(json.data.comments).toBeInstanceOf(Array);
    });

    it('updates an item', async () => {
      const createRes = await request('POST', '/items', {
        title: 'Before Update',
      });
      const created = (await createRes.json()) as Json;

      const res = await request('PATCH', `/items/${created.data.id}`, {
        title: 'After Update',
      });
      expect(res.status).toBe(200);
      const json = (await res.json()) as Json;
      expect(json.data.title).toBe('After Update');
    });

    it('soft deletes an item', async () => {
      const createRes = await request('POST', '/items', {
        title: 'To Delete',
      });
      const created = (await createRes.json()) as Json;

      const deleteRes = await request('DELETE', `/items/${created.data.id}`);
      expect(deleteRes.status).toBe(200);

      // Should not be found after deletion
      const getRes = await request('GET', `/items/${created.data.id}`);
      expect(getRes.status).toBe(404);
    });

    it('returns 404 for non-existent item', async () => {
      const res = await request('GET', '/items/bpi_nonexistent');
      expect(res.status).toBe(404);
    });
  });

  describe('Status Transitions', () => {
    it('allows pending -> in_progress', async () => {
      const createRes = await request('POST', '/items', {
        title: 'Transition Test',
        status: 'pending',
      });
      const created = (await createRes.json()) as Json;

      const res = await request('PATCH', `/items/${created.data.id}`, {
        status: 'in_progress',
      });
      expect(res.status).toBe(200);
      const json = (await res.json()) as Json;
      expect(json.data.status).toBe('in_progress');
    });

    it('rejects pending -> done', async () => {
      const createRes = await request('POST', '/items', {
        title: 'Invalid Transition',
        status: 'pending',
      });
      const created = (await createRes.json()) as Json;

      const res = await request('PATCH', `/items/${created.data.id}`, {
        status: 'done',
      });
      expect(res.status).toBe(422);
    });
  });

  describe('Tags', () => {
    it('creates a tag', async () => {
      const res = await request('POST', '/tags', {
        name: 'urgent',
        color: '#FF0000',
      });
      expect(res.status).toBe(200);
      const json = (await res.json()) as Json;
      expect(json.data.name).toBe('urgent');
      expect(json.data.id).toMatch(/^bpt_/);
    });

    it('lists tags', async () => {
      const res = await request('GET', '/tags');
      expect(res.status).toBe(200);
      const json = (await res.json()) as Json;
      expect(json.data).toBeInstanceOf(Array);
    });

    it('rejects duplicate tag names', async () => {
      await request('POST', '/tags', {
        name: 'duplicate-test',
        color: '#00FF00',
      });
      const res = await request('POST', '/tags', {
        name: 'duplicate-test',
        color: '#0000FF',
      });
      expect(res.status).toBe(409);
    });
  });

  describe('Comments', () => {
    it('creates a comment on an item', async () => {
      const createRes = await request('POST', '/items', {
        title: 'Comment Target',
      });
      const created = (await createRes.json()) as Json;

      const res = await request('POST', `/items/${created.data.id}/comments`, {
        content: 'This is a test comment',
      });
      expect(res.status).toBe(200);
      const json = (await res.json()) as Json;
      expect(json.data.body).toBe('This is a test comment');
      expect(json.data.id).toMatch(/^bpc_/);
    });

    it('lists comments for an item', async () => {
      const createRes = await request('POST', '/items', {
        title: 'List Comments Target',
      });
      const created = (await createRes.json()) as Json;

      await request('POST', `/items/${created.data.id}/comments`, {
        content: 'Comment 1',
      });
      await request('POST', `/items/${created.data.id}/comments`, {
        content: 'Comment 2',
      });

      const res = await request('GET', `/items/${created.data.id}/comments`);
      expect(res.status).toBe(200);
      const json = (await res.json()) as Json;
      expect(json.data.length).toBe(2);
    });
  });

  describe('Activity', () => {
    it('records activity on item creation', async () => {
      const createRes = await request('POST', '/items', {
        title: 'Activity Test',
      });
      const created = (await createRes.json()) as Json;

      const res = await request('GET', `/items/${created.data.id}/activity`);
      expect(res.status).toBe(200);
      const json = (await res.json()) as Json;
      expect(json.data.length).toBeGreaterThan(0);
      expect(json.data[0].action).toBe('created');
    });
  });

  describe('Search', () => {
    it('searches items by title', async () => {
      await request('POST', '/items', { title: 'Searchable Alpha' });
      await request('POST', '/items', { title: 'Searchable Beta' });

      const res = await request('GET', '/search?q=Searchable');
      expect(res.status).toBe(200);
      const json = (await res.json()) as Json;
      expect(json.data.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Outbox Events', () => {
    it('writes outbox event on item creation', async () => {
      const createRes = await request('POST', '/items', {
        title: 'Outbox Test',
      });
      const created = (await createRes.json()) as Json;

      // Check outbox_events table directly
      const events = await infra.db
        .select()
        .from(outboxEvents)
        .where(sql`${outboxEvents.aggregateId} = ${created.data.id}`);
      expect(events.length).toBeGreaterThan(0);
      expect(events[0]?.eventType).toBe('blueprint.item.created');
    });
  });
});
