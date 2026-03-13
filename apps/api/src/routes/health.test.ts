import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { healthRoutes } from './health.js';

const app = new Hono().route('/', healthRoutes);

describe('unit: Health Routes', () => {
  it('GET /health returns 200 with status', async () => {
    const res = await app.request('/health');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('healthy');
    expect(body.timestamp).toBeDefined();
  });

  it('GET /health/live returns 200', async () => {
    const res = await app.request('/health/live');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it('GET /health/ready returns 200 with dependency status', async () => {
    const res = await app.request('/health/ready');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('db');
    expect(body).toHaveProperty('redis');
    expect(body).toHaveProperty('nats');
  });
});
