import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import {
  AuthenticationError,
  AuthorizationError,
  ConflictError,
  NotFoundError,
  ValidationError,
  errorHandler,
} from './error-handler.js';

function createApp(throwFn: () => never) {
  const app = new Hono();
  app.onError(errorHandler);
  app.get('/test', () => {
    throwFn();
  });
  return app;
}

describe('unit: Error Handler', () => {
  it('returns 404 for NotFoundError', async () => {
    const app = createApp(() => {
      throw new NotFoundError({ resource: 'item', id: '123' });
    });
    const res = await app.request('/test');
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe('NOT_FOUND_ERROR');
  });

  it('returns 422 for ValidationError', async () => {
    const app = createApp(() => {
      throw new ValidationError({ field: 'title', message: 'Required' });
    });
    const res = await app.request('/test');
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 401 for AuthenticationError', async () => {
    const app = createApp(() => {
      throw new AuthenticationError({ message: 'Bad credentials' });
    });
    const res = await app.request('/test');
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe('AUTHENTICATION_ERROR');
  });

  it('returns 403 for AuthorizationError', async () => {
    const app = createApp(() => {
      throw new AuthorizationError({ message: 'Forbidden' });
    });
    const res = await app.request('/test');
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe('AUTHORIZATION_ERROR');
  });

  it('returns 409 for ConflictError', async () => {
    const app = createApp(() => {
      throw new ConflictError({ resource: 'tag', message: 'Duplicate' });
    });
    const res = await app.request('/test');
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe('CONFLICT_ERROR');
  });

  it('returns 500 for unknown errors', async () => {
    const app = createApp(() => {
      throw new Error('Something went wrong');
    });
    const res = await app.request('/test');
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.code).toBe('INTERNAL_ERROR');
    expect(body.error.message).toBe('Something went wrong');
  });

  it('returns structured error response', async () => {
    const app = createApp(() => {
      throw new NotFoundError({ resource: 'item', id: 'abc' });
    });
    const res = await app.request('/test');
    const body = await res.json();
    expect(body.error).toHaveProperty('code');
    expect(body.error).toHaveProperty('message');
    expect(body.error).toHaveProperty('details');
  });
});
