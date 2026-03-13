/**
 * Schema snapshot tests — verify Drizzle schema definitions match expectations.
 *
 * These tests run against the schema *objects* (no running database required).
 * They guard against accidental column renames, type changes, missing indexes,
 * and broken foreign-key references.
 */
import {
  apiKeys,
  blueprintActivity,
  blueprintComments,
  blueprintItemTags,
  blueprintItems,
  blueprintTags,
  outboxEvents,
  sessions,
  tenants,
} from '@ctrlpane/db';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type ColumnInfo = {
  name: string;
  columnType: string;
  dataType: string;
  notNull: boolean;
  hasDefault: boolean;
  primary: boolean;
  isUnique: boolean;
};

type ForeignKeyInfo = {
  localColumn: string;
  foreignTable: string;
  foreignColumn: string;
  onDelete: string;
};

function getColumns(table: Parameters<typeof getTableConfig>[0]): ColumnInfo[] {
  const cfg = getTableConfig(table);
  return cfg.columns.map((c) => ({
    name: c.name,
    columnType: c.columnType,
    dataType: c.dataType,
    notNull: c.notNull,
    hasDefault: c.hasDefault,
    primary: c.primary,
    isUnique: c.isUnique,
  }));
}

function getColumnNames(table: Parameters<typeof getTableConfig>[0]): string[] {
  return getTableConfig(table).columns.map((c) => c.name) as string[];
}

function getIndexNames(table: Parameters<typeof getTableConfig>[0]): string[] {
  return getTableConfig(table).indexes.map((i) => i.config.name) as string[];
}

function getForeignKeys(table: Parameters<typeof getTableConfig>[0]): ForeignKeyInfo[] {
  const cfg = getTableConfig(table);
  return cfg.foreignKeys.map((fk) => {
    const ref = fk.reference();
    const localCol = ref.columns[0];
    const foreignCol = ref.foreignColumns[0];
    return {
      localColumn: localCol ? localCol.name : '',
      foreignTable: ref.foreignTable[
        Symbol.for('drizzle:Name') as unknown as keyof typeof ref.foreignTable
      ] as string,
      foreignColumn: foreignCol ? foreignCol.name : '',
      onDelete: fk.onDelete ?? 'no action',
    };
  });
}

function getCompositePrimaryKeys(table: Parameters<typeof getTableConfig>[0]): string[][] {
  return getTableConfig(table).primaryKeys.map((pk) => pk.columns.map((c) => c.name)) as string[][];
}

function findColumn(
  table: Parameters<typeof getTableConfig>[0],
  name: string,
): ColumnInfo | undefined {
  return getColumns(table).find((c) => c.name === name);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('schema snapshot [unit]', () => {
  // -----------------------------------------------------------------------
  // tenants
  // -----------------------------------------------------------------------
  describe('tenants', () => {
    it('has table name "tenants"', () => {
      expect(getTableConfig(tenants).name).toBe('tenants');
    });

    it('has the expected columns', () => {
      expect(getColumnNames(tenants)).toEqual([
        'id',
        'name',
        'slug',
        'plan',
        'created_at',
        'updated_at',
      ]);
    });

    it('has correct column types', () => {
      expect(findColumn(tenants, 'id')).toMatchObject({
        columnType: 'PgText',
        notNull: true,
        primary: true,
      });
      expect(findColumn(tenants, 'name')).toMatchObject({
        columnType: 'PgText',
        notNull: true,
      });
      expect(findColumn(tenants, 'slug')).toMatchObject({
        columnType: 'PgText',
        notNull: true,
        isUnique: true,
      });
      expect(findColumn(tenants, 'plan')).toMatchObject({
        columnType: 'PgText',
        notNull: true,
        hasDefault: true,
      });
      expect(findColumn(tenants, 'created_at')).toMatchObject({
        columnType: 'PgTimestamp',
        notNull: true,
        hasDefault: true,
      });
      expect(findColumn(tenants, 'updated_at')).toMatchObject({
        columnType: 'PgTimestamp',
        notNull: true,
        hasDefault: true,
      });
    });

    it('has the slug index', () => {
      expect(getIndexNames(tenants)).toContain('idx_tenants_slug');
    });

    it('has no foreign keys (root table)', () => {
      expect(getForeignKeys(tenants)).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // api_keys
  // -----------------------------------------------------------------------
  describe('api_keys', () => {
    it('has table name "api_keys"', () => {
      expect(getTableConfig(apiKeys).name).toBe('api_keys');
    });

    it('has the expected columns', () => {
      expect(getColumnNames(apiKeys)).toEqual([
        'id',
        'tenant_id',
        'name',
        'key_hash',
        'key_prefix',
        'scopes',
        'expires_at',
        'last_used_at',
        'revoked_at',
        'created_at',
        'updated_at',
      ]);
    });

    it('has correct column types', () => {
      expect(findColumn(apiKeys, 'id')).toMatchObject({
        columnType: 'PgText',
        notNull: true,
        primary: true,
      });
      expect(findColumn(apiKeys, 'tenant_id')).toMatchObject({
        columnType: 'PgText',
        notNull: true,
      });
      expect(findColumn(apiKeys, 'key_hash')).toMatchObject({
        columnType: 'PgText',
        notNull: true,
      });
      expect(findColumn(apiKeys, 'key_prefix')).toMatchObject({
        columnType: 'PgText',
        notNull: true,
      });
      expect(findColumn(apiKeys, 'scopes')).toMatchObject({
        columnType: 'PgArray',
        notNull: true,
        hasDefault: true,
      });
      expect(findColumn(apiKeys, 'expires_at')).toMatchObject({
        columnType: 'PgTimestamp',
        notNull: false,
      });
      expect(findColumn(apiKeys, 'last_used_at')).toMatchObject({
        columnType: 'PgTimestamp',
        notNull: false,
      });
      expect(findColumn(apiKeys, 'revoked_at')).toMatchObject({
        columnType: 'PgTimestamp',
        notNull: false,
      });
    });

    it('has the expected indexes', () => {
      const names = getIndexNames(apiKeys);
      expect(names).toContain('idx_api_keys_tenant');
      expect(names).toContain('idx_api_keys_key_prefix');
      expect(names).toContain('idx_api_keys_active');
    });

    it('has FK to tenants', () => {
      const fks = getForeignKeys(apiKeys);
      expect(fks).toContainEqual({
        localColumn: 'tenant_id',
        foreignTable: 'tenants',
        foreignColumn: 'id',
        onDelete: 'no action',
      });
    });
  });

  // -----------------------------------------------------------------------
  // blueprint_items
  // -----------------------------------------------------------------------
  describe('blueprint_items', () => {
    it('has table name "blueprint_items"', () => {
      expect(getTableConfig(blueprintItems).name).toBe('blueprint_items');
    });

    it('has the expected columns', () => {
      expect(getColumnNames(blueprintItems)).toEqual([
        'id',
        'tenant_id',
        'title',
        'body',
        'status',
        'priority',
        'kind',
        'parent_id',
        'sort_order',
        'metadata',
        'created_by',
        'deleted_at',
        'created_at',
        'updated_at',
      ]);
    });

    it('has correct column types', () => {
      expect(findColumn(blueprintItems, 'id')).toMatchObject({
        columnType: 'PgText',
        primary: true,
      });
      expect(findColumn(blueprintItems, 'body')).toMatchObject({
        columnType: 'PgText',
        notNull: false,
      });
      expect(findColumn(blueprintItems, 'status')).toMatchObject({
        columnType: 'PgText',
        notNull: true,
        hasDefault: true,
      });
      expect(findColumn(blueprintItems, 'priority')).toMatchObject({
        columnType: 'PgText',
        notNull: true,
        hasDefault: true,
      });
      expect(findColumn(blueprintItems, 'kind')).toMatchObject({
        columnType: 'PgText',
        notNull: true,
        hasDefault: true,
      });
      expect(findColumn(blueprintItems, 'sort_order')).toMatchObject({
        columnType: 'PgInteger',
        notNull: true,
        hasDefault: true,
      });
      expect(findColumn(blueprintItems, 'metadata')).toMatchObject({
        columnType: 'PgJsonb',
        notNull: true,
        hasDefault: true,
      });
      expect(findColumn(blueprintItems, 'parent_id')).toMatchObject({
        columnType: 'PgText',
        notNull: false,
      });
      expect(findColumn(blueprintItems, 'created_by')).toMatchObject({
        columnType: 'PgText',
        notNull: false,
      });
      expect(findColumn(blueprintItems, 'deleted_at')).toMatchObject({
        columnType: 'PgTimestamp',
        notNull: false,
      });
    });

    it('has the expected indexes', () => {
      const names = getIndexNames(blueprintItems);
      expect(names).toContain('idx_blueprint_items_tenant_status');
      expect(names).toContain('idx_blueprint_items_tenant_kind');
      expect(names).toContain('idx_blueprint_items_parent');
      expect(names).toContain('idx_blueprint_items_tenant_created');
    });

    it('has FK to tenants', () => {
      const fks = getForeignKeys(blueprintItems);
      expect(fks).toContainEqual({
        localColumn: 'tenant_id',
        foreignTable: 'tenants',
        foreignColumn: 'id',
        onDelete: 'no action',
      });
    });
  });

  // -----------------------------------------------------------------------
  // blueprint_tags
  // -----------------------------------------------------------------------
  describe('blueprint_tags', () => {
    it('has table name "blueprint_tags"', () => {
      expect(getTableConfig(blueprintTags).name).toBe('blueprint_tags');
    });

    it('has the expected columns', () => {
      expect(getColumnNames(blueprintTags)).toEqual([
        'id',
        'tenant_id',
        'name',
        'color',
        'created_at',
        'updated_at',
      ]);
    });

    it('has correct column types', () => {
      expect(findColumn(blueprintTags, 'id')).toMatchObject({
        columnType: 'PgText',
        primary: true,
      });
      expect(findColumn(blueprintTags, 'name')).toMatchObject({
        columnType: 'PgText',
        notNull: true,
      });
      expect(findColumn(blueprintTags, 'color')).toMatchObject({
        columnType: 'PgText',
        notNull: false,
      });
    });

    it('has the tenant-name index', () => {
      expect(getIndexNames(blueprintTags)).toContain('idx_blueprint_tags_tenant_name');
    });

    it('has FK to tenants', () => {
      expect(getForeignKeys(blueprintTags)).toContainEqual({
        localColumn: 'tenant_id',
        foreignTable: 'tenants',
        foreignColumn: 'id',
        onDelete: 'no action',
      });
    });
  });

  // -----------------------------------------------------------------------
  // blueprint_item_tags (join table)
  // -----------------------------------------------------------------------
  describe('blueprint_item_tags', () => {
    it('has table name "blueprint_item_tags"', () => {
      expect(getTableConfig(blueprintItemTags).name).toBe('blueprint_item_tags');
    });

    it('has the expected columns', () => {
      expect(getColumnNames(blueprintItemTags)).toEqual([
        'tenant_id',
        'item_id',
        'tag_id',
        'created_at',
      ]);
    });

    it('has composite primary key (item_id, tag_id)', () => {
      const pks = getCompositePrimaryKeys(blueprintItemTags);
      expect(pks).toHaveLength(1);
      expect(pks[0]).toEqual(['item_id', 'tag_id']);
    });

    it('has correct column types', () => {
      expect(findColumn(blueprintItemTags, 'tenant_id')).toMatchObject({
        columnType: 'PgText',
        notNull: true,
      });
      expect(findColumn(blueprintItemTags, 'item_id')).toMatchObject({
        columnType: 'PgText',
        notNull: true,
      });
      expect(findColumn(blueprintItemTags, 'tag_id')).toMatchObject({
        columnType: 'PgText',
        notNull: true,
      });
    });

    it('has FKs to tenants, blueprint_items (cascade), and blueprint_tags (cascade)', () => {
      const fks = getForeignKeys(blueprintItemTags);
      expect(fks).toContainEqual({
        localColumn: 'tenant_id',
        foreignTable: 'tenants',
        foreignColumn: 'id',
        onDelete: 'no action',
      });
      expect(fks).toContainEqual({
        localColumn: 'item_id',
        foreignTable: 'blueprint_items',
        foreignColumn: 'id',
        onDelete: 'cascade',
      });
      expect(fks).toContainEqual({
        localColumn: 'tag_id',
        foreignTable: 'blueprint_tags',
        foreignColumn: 'id',
        onDelete: 'cascade',
      });
    });
  });

  // -----------------------------------------------------------------------
  // blueprint_comments
  // -----------------------------------------------------------------------
  describe('blueprint_comments', () => {
    it('has table name "blueprint_comments"', () => {
      expect(getTableConfig(blueprintComments).name).toBe('blueprint_comments');
    });

    it('has the expected columns', () => {
      expect(getColumnNames(blueprintComments)).toEqual([
        'id',
        'tenant_id',
        'item_id',
        'author_id',
        'author_type',
        'body',
        'created_at',
        'updated_at',
      ]);
    });

    it('has correct column types', () => {
      expect(findColumn(blueprintComments, 'id')).toMatchObject({
        columnType: 'PgText',
        primary: true,
      });
      expect(findColumn(blueprintComments, 'author_id')).toMatchObject({
        columnType: 'PgText',
        notNull: false,
      });
      expect(findColumn(blueprintComments, 'author_type')).toMatchObject({
        columnType: 'PgText',
        notNull: true,
        hasDefault: true,
      });
      expect(findColumn(blueprintComments, 'body')).toMatchObject({
        columnType: 'PgText',
        notNull: true,
      });
    });

    it('has the expected indexes', () => {
      const names = getIndexNames(blueprintComments);
      expect(names).toContain('idx_blueprint_comments_item');
      expect(names).toContain('idx_blueprint_comments_tenant');
    });

    it('has FKs to tenants and blueprint_items (cascade)', () => {
      const fks = getForeignKeys(blueprintComments);
      expect(fks).toContainEqual({
        localColumn: 'tenant_id',
        foreignTable: 'tenants',
        foreignColumn: 'id',
        onDelete: 'no action',
      });
      expect(fks).toContainEqual({
        localColumn: 'item_id',
        foreignTable: 'blueprint_items',
        foreignColumn: 'id',
        onDelete: 'cascade',
      });
    });
  });

  // -----------------------------------------------------------------------
  // blueprint_activity
  // -----------------------------------------------------------------------
  describe('blueprint_activity', () => {
    it('has table name "blueprint_activity"', () => {
      expect(getTableConfig(blueprintActivity).name).toBe('blueprint_activity');
    });

    it('has the expected columns', () => {
      expect(getColumnNames(blueprintActivity)).toEqual([
        'id',
        'tenant_id',
        'item_id',
        'actor_id',
        'actor_type',
        'action',
        'changes',
        'created_at',
      ]);
    });

    it('has correct column types', () => {
      expect(findColumn(blueprintActivity, 'id')).toMatchObject({
        columnType: 'PgText',
        primary: true,
      });
      expect(findColumn(blueprintActivity, 'actor_id')).toMatchObject({
        columnType: 'PgText',
        notNull: false,
      });
      expect(findColumn(blueprintActivity, 'actor_type')).toMatchObject({
        columnType: 'PgText',
        notNull: true,
        hasDefault: true,
      });
      expect(findColumn(blueprintActivity, 'action')).toMatchObject({
        columnType: 'PgText',
        notNull: true,
      });
      expect(findColumn(blueprintActivity, 'changes')).toMatchObject({
        columnType: 'PgJsonb',
        notNull: true,
        hasDefault: true,
      });
    });

    it('has the expected indexes', () => {
      const names = getIndexNames(blueprintActivity);
      expect(names).toContain('idx_blueprint_activity_item');
      expect(names).toContain('idx_blueprint_activity_tenant');
    });

    it('has FKs to tenants and blueprint_items (cascade)', () => {
      const fks = getForeignKeys(blueprintActivity);
      expect(fks).toContainEqual({
        localColumn: 'tenant_id',
        foreignTable: 'tenants',
        foreignColumn: 'id',
        onDelete: 'no action',
      });
      expect(fks).toContainEqual({
        localColumn: 'item_id',
        foreignTable: 'blueprint_items',
        foreignColumn: 'id',
        onDelete: 'cascade',
      });
    });
  });

  // -----------------------------------------------------------------------
  // outbox_events
  // -----------------------------------------------------------------------
  describe('outbox_events', () => {
    it('has table name "outbox_events"', () => {
      expect(getTableConfig(outboxEvents).name).toBe('outbox_events');
    });

    it('has the expected columns', () => {
      expect(getColumnNames(outboxEvents)).toEqual([
        'id',
        'tenant_id',
        'event_type',
        'aggregate_type',
        'aggregate_id',
        'payload',
        'trace_id',
        'status',
        'attempts',
        'published_at',
        'created_at',
      ]);
    });

    it('has correct column types', () => {
      expect(findColumn(outboxEvents, 'id')).toMatchObject({
        columnType: 'PgText',
        primary: true,
      });
      expect(findColumn(outboxEvents, 'event_type')).toMatchObject({
        columnType: 'PgText',
        notNull: true,
      });
      expect(findColumn(outboxEvents, 'aggregate_type')).toMatchObject({
        columnType: 'PgText',
        notNull: true,
      });
      expect(findColumn(outboxEvents, 'aggregate_id')).toMatchObject({
        columnType: 'PgText',
        notNull: true,
      });
      expect(findColumn(outboxEvents, 'payload')).toMatchObject({
        columnType: 'PgJsonb',
        notNull: true,
      });
      expect(findColumn(outboxEvents, 'trace_id')).toMatchObject({
        columnType: 'PgText',
        notNull: false,
      });
      expect(findColumn(outboxEvents, 'status')).toMatchObject({
        columnType: 'PgText',
        notNull: true,
        hasDefault: true,
      });
      expect(findColumn(outboxEvents, 'attempts')).toMatchObject({
        columnType: 'PgInteger',
        notNull: true,
        hasDefault: true,
      });
      expect(findColumn(outboxEvents, 'published_at')).toMatchObject({
        columnType: 'PgTimestamp',
        notNull: false,
      });
    });

    it('has the expected indexes', () => {
      const names = getIndexNames(outboxEvents);
      expect(names).toContain('idx_outbox_pending');
      expect(names).toContain('idx_outbox_dead_letter');
      expect(names).toContain('idx_outbox_tenant');
    });

    it('has FK to tenants', () => {
      expect(getForeignKeys(outboxEvents)).toContainEqual({
        localColumn: 'tenant_id',
        foreignTable: 'tenants',
        foreignColumn: 'id',
        onDelete: 'no action',
      });
    });
  });

  // -----------------------------------------------------------------------
  // sessions
  // -----------------------------------------------------------------------
  describe('sessions', () => {
    it('has table name "sessions"', () => {
      expect(getTableConfig(sessions).name).toBe('sessions');
    });

    it('has the expected columns', () => {
      expect(getColumnNames(sessions)).toEqual([
        'id',
        'tenant_id',
        'token_hash',
        'user_agent',
        'ip_address',
        'expires_at',
        'created_at',
      ]);
    });

    it('has correct column types', () => {
      expect(findColumn(sessions, 'id')).toMatchObject({
        columnType: 'PgText',
        notNull: true,
        primary: true,
      });
      expect(findColumn(sessions, 'tenant_id')).toMatchObject({
        columnType: 'PgText',
        notNull: true,
      });
      expect(findColumn(sessions, 'token_hash')).toMatchObject({
        columnType: 'PgText',
        notNull: true,
      });
      expect(findColumn(sessions, 'user_agent')).toMatchObject({
        columnType: 'PgText',
        notNull: false,
      });
      expect(findColumn(sessions, 'ip_address')).toMatchObject({
        columnType: 'PgText',
        notNull: false,
      });
      expect(findColumn(sessions, 'expires_at')).toMatchObject({
        columnType: 'PgTimestamp',
        notNull: true,
      });
      expect(findColumn(sessions, 'created_at')).toMatchObject({
        columnType: 'PgTimestamp',
        notNull: true,
        hasDefault: true,
      });
    });

    it('has the expected indexes', () => {
      const names = getIndexNames(sessions);
      expect(names).toContain('idx_sessions_token_hash');
      expect(names).toContain('idx_sessions_tenant');
      expect(names).toContain('idx_sessions_expires');
    });

    it('has FK to tenants', () => {
      expect(getForeignKeys(sessions)).toContainEqual({
        localColumn: 'tenant_id',
        foreignTable: 'tenants',
        foreignColumn: 'id',
        onDelete: 'no action',
      });
    });
  });

  // -----------------------------------------------------------------------
  // Cross-cutting: all 9 tables present
  // -----------------------------------------------------------------------
  describe('schema completeness', () => {
    it('exports all 9 expected tables', () => {
      const tables = [
        tenants,
        apiKeys,
        blueprintItems,
        blueprintTags,
        blueprintItemTags,
        blueprintComments,
        blueprintActivity,
        outboxEvents,
        sessions,
      ];
      expect(tables).toHaveLength(9);
      for (const table of tables) {
        expect(getTableConfig(table).name).toBeTruthy();
      }
    });

    it('every tenant-scoped table has tenant_id FK to tenants', () => {
      const tenantScopedTables = [
        apiKeys,
        blueprintItems,
        blueprintTags,
        blueprintItemTags,
        blueprintComments,
        blueprintActivity,
        outboxEvents,
        sessions,
      ];
      for (const table of tenantScopedTables) {
        const fks = getForeignKeys(table);
        const tenantFk = fks.find(
          (fk) => fk.localColumn === 'tenant_id' && fk.foreignTable === 'tenants',
        );
        expect(tenantFk, `${getTableConfig(table).name} should FK to tenants`).toBeDefined();
      }
    });
  });
});
