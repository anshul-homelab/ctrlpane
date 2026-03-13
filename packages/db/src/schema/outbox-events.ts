import { index, integer, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';

export const outboxEvents = pgTable(
  'outbox_events',
  {
    id: text('id').primaryKey(), // obx_ + ULID
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    eventType: text('event_type').notNull(), // e.g. 'blueprint.item.created.v1'
    aggregateType: text('aggregate_type').notNull(), // e.g. 'blueprint_item'
    aggregateId: text('aggregate_id').notNull(), // ID of the entity that triggered the event
    payload: jsonb('payload').notNull(), // CloudEvents-inspired envelope
    traceId: text('trace_id'), // OpenTelemetry trace ID
    status: text('status').notNull().default('pending'), // pending, published, dead_letter
    attempts: integer('attempts').notNull().default(0),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_outbox_pending').on(table.createdAt),
    index('idx_outbox_dead_letter').on(table.createdAt),
    index('idx_outbox_tenant').on(table.tenantId),
  ],
);

export type OutboxEventRow = typeof outboxEvents.$inferSelect;
export type NewOutboxEventRow = typeof outboxEvents.$inferInsert;
