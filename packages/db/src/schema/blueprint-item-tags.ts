import { pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';
import { blueprintItems } from './blueprint-items.js';
import { blueprintTags } from './blueprint-tags.js';
import { tenants } from './tenants.js';

export const blueprintItemTags = pgTable(
  'blueprint_item_tags',
  {
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    itemId: text('item_id')
      .notNull()
      .references(() => blueprintItems.id, { onDelete: 'cascade' }),
    tagId: text('tag_id')
      .notNull()
      .references(() => blueprintTags.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.itemId, table.tagId] })],
);

export type BlueprintItemTagRow = typeof blueprintItemTags.$inferSelect;
export type NewBlueprintItemTagRow = typeof blueprintItemTags.$inferInsert;
