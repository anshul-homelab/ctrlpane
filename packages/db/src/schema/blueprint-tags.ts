import { index, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';

export const blueprintTags = pgTable(
  'blueprint_tags',
  {
    id: text('id').primaryKey(), // bpt_ + ULID
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    name: text('name').notNull(),
    color: text('color'), // Hex color for UI
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_blueprint_tags_tenant_name').on(table.tenantId, table.name)],
);

export type BlueprintTagRow = typeof blueprintTags.$inferSelect;
export type NewBlueprintTagRow = typeof blueprintTags.$inferInsert;
