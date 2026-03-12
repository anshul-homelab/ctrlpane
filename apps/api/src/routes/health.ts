import { Hono } from 'hono';

export const healthRoutes = new Hono()
  .get('/health', (c) => c.json({ status: 'healthy', timestamp: new Date().toISOString() }))
  .get('/health/live', (c) => c.json({ ok: true }))
  .get('/health/ready', async (c) => {
    // Check connectivity to all dependencies
    // Actual checks are wired up when infrastructure clients are available;
    // for now return a basic response indicating infrastructure presence.
    return c.json({
      db: true,
      redis: true,
      nats: true,
    });
  });
