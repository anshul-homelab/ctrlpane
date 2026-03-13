import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { blueprintRoutes } from './domains/blueprint/routes.js';
import { dbMiddleware } from './middleware/db.js';
import { dualAuthMiddleware } from './middleware/dual-auth.js';
import { errorHandler } from './middleware/error-handler.js';
import { requestIdMiddleware } from './middleware/request-id.js';
import { authRoutes } from './routes/auth.js';
import { healthRoutes } from './routes/health.js';
import type { AppEnv } from './shared/hono-env.js';

const app = new Hono<AppEnv>();

// Global error handler (maps domain errors to HTTP responses)
app.onError(errorHandler);

// Global middleware
app.use('*', requestIdMiddleware);
app.use('*', dbMiddleware);
app.use(
  '/api/*',
  cors({
    origin: [`http://localhost:${process.env.WEB_PORT ?? 33000}`],
    allowHeaders: ['Content-Type', 'X-API-Key', 'Idempotency-Key'],
    allowMethods: ['GET', 'POST', 'PATCH', 'DELETE'],
    credentials: true,
  }),
);

// Health routes (outside /api/v1, no auth required)
app.route('/', healthRoutes);

// Auth routes (POST /api/auth/dev-session has no auth; /me and DELETE /session use dual auth internally)
app.route('/api/auth', authRoutes);

// Blueprint domain routes (dual auth required)
app.use('/api/v1/blueprint/*', dualAuthMiddleware);
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
