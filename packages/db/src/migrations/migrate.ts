import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import postgres from 'postgres';
import { defaultDbConfig } from '../client/db-client.js';

/**
 * Simple migration runner that executes SQL files in order.
 * Uses a migrations tracking table to avoid re-running migrations.
 */
async function migrate() {
  const config = defaultDbConfig();
  const sql = postgres({
    host: config.host,
    port: config.port,
    database: config.database,
    username: config.username,
    password: config.password,
    ssl: config.ssl ? 'require' : undefined,
  });

  try {
    // Create migrations tracking table if it doesn't exist
    await sql`
      CREATE TABLE IF NOT EXISTS _migrations (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `;

    // Get already-applied migrations
    const applied = await sql`SELECT name FROM _migrations ORDER BY id`;
    const appliedNames = new Set(applied.map((r) => r.name));

    // Read migration files from directory
    const migrationsDir = join(import.meta.dir, '.');
    const files = readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    for (const file of files) {
      if (appliedNames.has(file)) {
        console.log(`  [skip] ${file} (already applied)`);
        continue;
      }

      console.log(`  [apply] ${file}`);
      const content = readFileSync(join(migrationsDir, file), 'utf-8');
      await sql.unsafe(content);
      await sql`INSERT INTO _migrations (name) VALUES (${file})`;
      console.log(`  [done] ${file}`);
    }

    console.log('Migrations complete.');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

migrate();
