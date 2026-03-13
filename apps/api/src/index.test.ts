import { describe, expect, it } from 'vitest';
import { app } from './index.js';

describe('unit: API app', () => {
  it('exports a Hono app', () => {
    expect(app).toBeDefined();
    expect(app.request).toBeDefined();
  });

  it('health endpoint is accessible at root', async () => {
    const res = await app.request('/health');
    expect(res.status).toBe(200);
  });

  it('health/live endpoint is accessible', async () => {
    const res = await app.request('/health/live');
    expect(res.status).toBe(200);
  });

  it('sets X-Request-ID header on responses', async () => {
    const res = await app.request('/health');
    expect(res.headers.get('X-Request-ID')).toBeDefined();
  });
});
