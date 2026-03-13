import { createConnection, createDrizzle, defaultDbConfig } from '@ctrlpane/db/client';
import { createMiddleware } from 'hono/factory';
import type { AppEnv } from '../shared/hono-env.js';

const config = defaultDbConfig();
const connection = createConnection(config);
const db = createDrizzle(connection);

/**
 * Middleware that provides the Drizzle database instance on the Hono context.
 * Creates a single shared connection pool at module load time.
 */
export const dbMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  c.set('db', db);
  await next();
});
