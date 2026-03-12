import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { blueprintRoutes } from './domains/blueprint/routes.js';
import { authMiddleware } from './middleware/auth.js';
import { errorHandler } from './middleware/error-handler.js';
import { requestIdMiddleware } from './middleware/request-id.js';
import { healthRoutes } from './routes/health.js';
import type { AppEnv } from './shared/hono-env.js';

const app = new Hono<AppEnv>();

// Global error handler (maps domain errors to HTTP responses)
app.onError(errorHandler);

// Global middleware
app.use('*', requestIdMiddleware);
app.use(
  '/api/*',
  cors({
    origin: ['http://localhost:33000'],
    allowHeaders: ['Content-Type', 'X-API-Key', 'Idempotency-Key'],
    allowMethods: ['GET', 'POST', 'PATCH', 'DELETE'],
  }),
);

// Health routes (outside /api/v1, no auth required)
app.route('/', healthRoutes);

// Blueprint domain routes (auth required)
app.use('/api/v1/blueprint/*', authMiddleware);
app.route('/api/v1/blueprint', blueprintRoutes);

const port = Number(process.env.API_PORT ?? 33001);
const hostname = process.env.API_HOST ?? '127.0.0.1';

console.log(`ctrlpane API starting on ${hostname}:${port}`);

export { app };

export default {
  port,
  hostname,
  fetch: app.fetch,
};
