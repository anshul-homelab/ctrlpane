// Schema exports
export {
  tenants,
  apiKeys,
  blueprintItems,
  blueprintTags,
  blueprintItemTags,
  blueprintComments,
  blueprintActivity,
  outboxEvents,
  sessions,
} from './schema/index.js';

export type {
  TenantRow,
  NewTenantRow,
  ApiKeyRow,
  NewApiKeyRow,
  BlueprintItemRow,
  NewBlueprintItemRow,
  BlueprintTagRow,
  NewBlueprintTagRow,
  BlueprintItemTagRow,
  NewBlueprintItemTagRow,
  BlueprintCommentRow,
  NewBlueprintCommentRow,
  BlueprintActivityRow,
  NewBlueprintActivityRow,
  OutboxEventRow,
  NewOutboxEventRow,
  SessionRow,
  NewSessionRow,
} from './schema/index.js';

// Client exports
export {
  DbClient,
  DbClientLive,
  DatabaseError,
  makeDbClient,
  createConnection,
  createDrizzle,
  defaultDbConfig,
} from './client/index.js';

export type { DbClientShape, DbConfig, DrizzleDb } from './client/index.js';
