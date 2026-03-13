import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import type { AppEnv } from '../shared/hono-env.js';
import { dbMiddleware } from './db.js';

describe('dbMiddleware', () => {
  it('sets db on the Hono context', async () => {
    const app = new Hono<AppEnv>();
    app.use('*', dbMiddleware);
    app.get('/test', (c) => {
      const db = c.get('db');
      return c.json({ hasDb: db != null });
    });

    const res = await app.request('/test');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.hasDb).toBe(true);
  });
});
