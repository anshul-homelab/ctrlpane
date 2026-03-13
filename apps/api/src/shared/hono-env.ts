import type { DrizzleDb } from '@ctrlpane/db';

/**
 * Hono environment type definition for ctrlpane API.
 * Defines the custom variables available on the Hono context (c.get/c.set).
 */
export type AppEnv = {
  Variables: {
    requestId: string;
    tenantId: string;
    apiKeyId: string;
    permissions: readonly string[];
    authMethod: 'session' | 'api_key';
    db: DrizzleDb;
  };
};
