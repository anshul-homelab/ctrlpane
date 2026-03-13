import { createMiddleware } from 'hono/factory';
import type { AppEnv } from '../shared/hono-env.js';
import { tryApiKeyAuth } from './auth.js';
import { trySessionAuth } from './session-auth.js';

/**
 * Dual authentication middleware: tries session cookie first, then API key.
 *
 * 1. Try session cookie (httpOnly) — for first-party web app
 * 2. Try API key (X-API-Key header) — for external API consumers
 * 3. If neither succeeds, return 401
 */
export const dualAuthMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  // 1. Try session cookie
  const sessionResult = await trySessionAuth(c);
  if (sessionResult) {
    await next();
    return;
  }

  // 2. Try API key
  const apiKeyResult = await tryApiKeyAuth(c);
  if (apiKeyResult?.success) {
    await next();
    return;
  }

  // 3. Neither succeeded
  return c.json(
    {
      error: {
        code: 'AUTHENTICATION_ERROR',
        message: 'Authentication required',
        details: {},
      },
    },
    401,
  );
});
