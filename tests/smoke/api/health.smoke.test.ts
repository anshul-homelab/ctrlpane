import { describe, expect, it } from 'vitest';
import { HEALTH_BASE } from './setup.js';

describe('smoke: health endpoints', () => {
  it('GET /health/live returns 200 with ok: true', async () => {
    const res = await fetch(`${HEALTH_BASE}/health/live`);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toEqual({ ok: true });
  });

  it('GET /health/ready returns 200 with dependency statuses', async () => {
    const res = await fetch(`${HEALTH_BASE}/health/ready`);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toHaveProperty('db');
    expect(body).toHaveProperty('redis');
    expect(body).toHaveProperty('nats');
  });

  it('GET /health returns 200 with status and timestamp', async () => {
    const res = await fetch(`${HEALTH_BASE}/health`);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toHaveProperty('status', 'healthy');
    expect(body).toHaveProperty('timestamp');
    expect(new Date(body.timestamp).getTime()).not.toBeNaN();
  });
});
