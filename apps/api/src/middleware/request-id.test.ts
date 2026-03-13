import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import type { AppEnv } from '../shared/hono-env.js';
import { requestIdMiddleware } from './request-id.js';

function createApp() {
  const app = new Hono<AppEnv>();
  app.use('*', requestIdMiddleware);
  app.get('/test', (c) => c.json({ requestId: c.get('requestId') }));
  return app;
}

describe('unit: Request ID Middleware', () => {
  it('generates X-Request-ID header when not provided', async () => {
    const app = createApp();
    const res = await app.request('/test');
    expect(res.status).toBe(200);

    const requestId = res.headers.get('X-Request-ID');
    expect(requestId).toBeDefined();
    expect(requestId).toMatch(/^req_/);
  });

  it('preserves X-Request-ID header when provided', async () => {
    const app = createApp();
    const res = await app.request('/test', {
      headers: { 'X-Request-ID': 'custom-id-123' },
    });
    expect(res.status).toBe(200);

    const requestId = res.headers.get('X-Request-ID');
    expect(requestId).toBe('custom-id-123');
  });

  it('sets requestId on context', async () => {
    const app = createApp();
    const res = await app.request('/test');
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.requestId).toMatch(/^req_/);
  });

  it('passes provided requestId to context', async () => {
    const app = createApp();
    const res = await app.request('/test', {
      headers: { 'X-Request-ID': 'my-trace-id' },
    });
    const body = await res.json();
    expect(body.requestId).toBe('my-trace-id');
  });
});
