import { index, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';

export const apiKeys = pgTable(
  'api_keys',
  {
    id: text('id').primaryKey(), // apk_ + ULID
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    name: text('name').notNull(),
    keyHash: text('key_hash').notNull(), // SHA-256 hash of the actual key
    keyPrefix: text('key_prefix').notNull(), // First 8 chars for identification
    scopes: text('scopes').array().notNull().default([]), // e.g. ['read', 'write', 'admin']
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_api_keys_tenant').on(table.tenantId),
    index('idx_api_keys_key_prefix').on(table.keyPrefix),
    index('idx_api_keys_active').on(table.tenantId, table.createdAt),
  ],
);

export type ApiKeyRow = typeof apiKeys.$inferSelect;
export type NewApiKeyRow = typeof apiKeys.$inferInsert;
