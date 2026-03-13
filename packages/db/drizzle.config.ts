import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/schema/index.ts',
  out: './src/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    host: process.env.DB_HOST ?? 'localhost',
    port: Number(process.env.DB_PORT ?? '35432'),
    database: process.env.DB_NAME ?? 'ctrlpane',
    user: process.env.DB_USER ?? 'ctrlpane_app',
    password: process.env.DB_PASSWORD ?? 'ctrlpane_dev',
    ssl: process.env.DB_SSL === 'true',
  },
});
