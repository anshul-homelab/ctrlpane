import { index, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { blueprintItems } from './blueprint-items.js';
import { tenants } from './tenants.js';

export const blueprintComments = pgTable(
  'blueprint_comments',
  {
    id: text('id').primaryKey(), // bpc_ + ULID
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    itemId: text('item_id')
      .notNull()
      .references(() => blueprintItems.id, { onDelete: 'cascade' }),
    authorId: text('author_id'), // User or agent ID
    authorType: text('author_type').notNull().default('user'), // user, agent, system
    body: text('body').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_blueprint_comments_item').on(table.itemId),
    index('idx_blueprint_comments_tenant').on(table.tenantId, table.createdAt),
  ],
);

export type BlueprintCommentRow = typeof blueprintComments.$inferSelect;
export type NewBlueprintCommentRow = typeof blueprintComments.$inferInsert;
