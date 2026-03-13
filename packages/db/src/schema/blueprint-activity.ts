import { index, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { blueprintItems } from './blueprint-items.js';
import { tenants } from './tenants.js';

export const blueprintActivity = pgTable(
  'blueprint_activity',
  {
    id: text('id').primaryKey(), // bpa_ + ULID
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    itemId: text('item_id')
      .notNull()
      .references(() => blueprintItems.id, { onDelete: 'cascade' }),
    actorId: text('actor_id'), // User or agent ID
    actorType: text('actor_type').notNull().default('user'), // user, agent, system
    action: text('action').notNull(), // created, updated, status_changed, commented, tagged, etc.
    changes: jsonb('changes').notNull().default({}), // { field: { from: old, to: new } }
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_blueprint_activity_item').on(table.itemId),
    index('idx_blueprint_activity_tenant').on(table.tenantId, table.createdAt),
  ],
);

export type BlueprintActivityRow = typeof blueprintActivity.$inferSelect;
export type NewBlueprintActivityRow = typeof blueprintActivity.$inferInsert;
