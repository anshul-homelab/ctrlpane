import { index, integer, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';

export const blueprintItems = pgTable(
  'blueprint_items',
  {
    id: text('id').primaryKey(), // bpi_ + ULID
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    title: text('title').notNull(),
    body: text('body'), // Markdown content
    status: text('status').notNull().default('draft'), // draft, active, completed, archived
    priority: text('priority').notNull().default('medium'), // low, medium, high, critical
    kind: text('kind').notNull().default('idea'), // idea, task, note, bug, feature
    parentId: text('parent_id'), // Self-referential for hierarchy
    sortOrder: integer('sort_order').notNull().default(0),
    metadata: jsonb('metadata').notNull().default({}),
    createdBy: text('created_by'), // User or agent ID
    deletedAt: timestamp('deleted_at', { withTimezone: true }), // Soft delete
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_blueprint_items_tenant_status').on(table.tenantId, table.status),
    index('idx_blueprint_items_tenant_kind').on(table.tenantId, table.kind),
    index('idx_blueprint_items_parent').on(table.parentId),
    index('idx_blueprint_items_tenant_created').on(table.tenantId, table.createdAt),
  ],
);

export type BlueprintItemRow = typeof blueprintItems.$inferSelect;
export type NewBlueprintItemRow = typeof blueprintItems.$inferInsert;
