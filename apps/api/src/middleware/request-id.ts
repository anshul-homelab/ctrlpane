import { createMiddleware } from 'hono/factory';
import { ulid } from 'ulid';
import type { AppEnv } from '../shared/hono-env.js';

export const requestIdMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  const requestId = c.req.header('X-Request-ID') ?? `req_${ulid()}`;
  c.set('requestId', requestId);
  c.header('X-Request-ID', requestId);
  await next();
});
