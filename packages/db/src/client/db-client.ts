import { sql as rawSql } from 'drizzle-orm';
import { type PostgresJsDatabase, drizzle } from 'drizzle-orm/postgres-js';
import { Context, Effect, Layer } from 'effect';
import postgres from 'postgres';
import * as schema from '../schema/index.js';

/**
 * The Drizzle database instance type with full schema.
 */
export type DrizzleDb = PostgresJsDatabase<typeof schema>;

/**
 * Shape of the DbClient service — wraps a Drizzle instance
 * and provides tenant-scoped transaction execution.
 */
export interface DbClientShape {
  /** The raw Drizzle instance (for queries outside tenant scope, e.g. migrations, seed) */
  readonly db: DrizzleDb;

  /**
   * Execute a callback within a transaction that has SET LOCAL app.tenant_id applied.
   * This is the primary way domain code should interact with the database.
   */
  readonly withTenant: <A>(
    tenantId: string,
    fn: (tx: DrizzleDb) => Promise<A>,
  ) => Effect.Effect<A, DatabaseError>;

  /**
   * Execute a callback within a plain transaction (no tenant context).
   * Used for infrastructure operations like migrations, seed scripts.
   */
  readonly transaction: <A>(fn: (tx: DrizzleDb) => Promise<A>) => Effect.Effect<A, DatabaseError>;
}

/**
 * Effect Context.Tag for the database client service.
 */
export class DbClient extends Context.Tag('DbClient')<DbClient, DbClientShape>() {}

/**
 * Tagged error for database operations.
 */
export class DatabaseError {
  readonly _tag = 'DatabaseError';
  constructor(
    readonly message: string,
    readonly cause?: unknown,
  ) {}
}

/**
 * Configuration for the database connection.
 */
export interface DbConfig {
  readonly host: string;
  readonly port: number;
  readonly database: string;
  readonly username: string;
  readonly password: string;
  readonly ssl?: boolean;
  readonly maxConnections?: number;
}

/**
 * Default database configuration from environment variables.
 * Reads env vars lazily at call time so that values set after module import
 * (e.g. in test setup with testcontainers) are picked up correctly.
 */
export const defaultDbConfig = (): DbConfig => ({
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? '35432'),
  database: process.env.DB_NAME ?? 'ctrlpane',
  username: process.env.DB_USER ?? 'ctrlpane_app',
  password: process.env.DB_PASSWORD ?? 'ctrlpane_dev',
  ssl: process.env.DB_SSL === 'true',
  maxConnections: Number(process.env.DB_MAX_CONNECTIONS ?? '10'),
});

/**
 * Create a postgres.js connection from config.
 */
export const createConnection = (config: DbConfig): postgres.Sql =>
  postgres({
    host: config.host,
    port: config.port,
    database: config.database,
    username: config.username,
    password: config.password,
    ssl: config.ssl ? 'require' : undefined,
    max: config.maxConnections ?? 10,
  });

/**
 * Create a Drizzle instance from a postgres.js connection.
 */
export const createDrizzle = (connection: postgres.Sql): DrizzleDb =>
  drizzle(connection, { schema });

/**
 * Create a DbClientShape from an existing Drizzle instance.
 * Useful for both production (pooled connection) and testing (per-test connection).
 */
export const makeDbClient = (db: DrizzleDb): DbClientShape => ({
  db,

  withTenant: <A>(tenantId: string, fn: (tx: DrizzleDb) => Promise<A>) =>
    Effect.tryPromise({
      try: () =>
        db.transaction(async (tx) => {
          await tx.execute(rawSql.raw(`SET LOCAL app.tenant_id = '${tenantId}'`));
          return await fn(tx as unknown as DrizzleDb);
        }),
      catch: (error) => new DatabaseError('Tenant transaction failed', error),
    }),

  transaction: <A>(fn: (tx: DrizzleDb) => Promise<A>) =>
    Effect.tryPromise({
      try: () =>
        db.transaction(async (tx) => {
          return await fn(tx as unknown as DrizzleDb);
        }),
      catch: (error) => new DatabaseError('Transaction failed', error),
    }),
});

/**
 * Live implementation of DbClient that connects to a real Postgres instance.
 * Uses a single connection pool shared across all operations.
 */
export const DbClientLive = (config: DbConfig = defaultDbConfig()): Layer.Layer<DbClient> => {
  const connection = createConnection(config);
  const db = createDrizzle(connection);
  return Layer.succeed(DbClient, DbClient.of(makeDbClient(db)));
};
