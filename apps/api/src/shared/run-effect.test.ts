import { Data, Effect } from 'effect';
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { runEffect } from './run-effect.js';

/**
 * Creates a test Hono app that runs the given Effect through runEffect.
 * Returns the Response so we can assert status + body.
 */
function createApp(effect: Effect.Effect<unknown, unknown, never>) {
  const app = new Hono();
  app.get('/test', (c) => runEffect(c, effect));
  return app;
}

/** Helper: fire a GET /test and return { status, body }. */
async function run(effect: Effect.Effect<unknown, unknown, never>) {
  const app = createApp(effect);
  const res = await app.request('/test');
  const body = await res.json();
  return { status: res.status, body };
}

/** Tagged error factory using Effect Data.TaggedError. */
function taggedError(tag: string, message: string) {
  class Err extends Data.TaggedError(tag)<{ message: string }> {}
  return new Err({ message });
}

describe('unit: runEffect', () => {
  // ── Success ────────────────────────────────────────────────────

  it('returns 200 JSON on Effect.succeed', async () => {
    const { status, body } = await run(Effect.succeed({ id: '1', name: 'ok' }));
    expect(status).toBe(200);
    expect(body).toEqual({ id: '1', name: 'ok' });
  });

  // ── 404 Not Found ─────────────────────────────────────────────

  it.each([
    'ItemNotFoundError',
    'TagNotFoundError',
    'CommentNotFoundError',
    'ParentItemNotFoundError',
    'NotFoundError',
  ])('maps %s to 404 NOT_FOUND', async (tag) => {
    const { status, body } = await run(Effect.fail(taggedError(tag, `${tag} detail`)));
    expect(status).toBe(404);
    expect(body.error.code).toBe('NOT_FOUND');
    expect(body.error.message).toContain(tag);
    expect(body.error.details).toEqual({});
  });

  // ── 422 Validation ────────────────────────────────────────────

  it.each(['InvalidStatusTransitionError', 'ValidationError'])(
    'maps %s to 422 VALIDATION_ERROR',
    async (tag) => {
      const { status, body } = await run(Effect.fail(taggedError(tag, 'bad input')));
      expect(status).toBe(422);
      expect(body.error.code).toBe('VALIDATION_ERROR');
    },
  );

  // ── 409 Conflict ──────────────────────────────────────────────

  it.each(['DuplicateTagError', 'ConflictError'])('maps %s to 409 CONFLICT', async (tag) => {
    const { status, body } = await run(Effect.fail(taggedError(tag, 'already exists')));
    expect(status).toBe(409);
    expect(body.error.code).toBe('CONFLICT');
  });

  // ── 401 Authentication ────────────────────────────────────────

  it('maps AuthenticationError to 401', async () => {
    const { status, body } = await run(
      Effect.fail(taggedError('AuthenticationError', 'bad creds')),
    );
    expect(status).toBe(401);
    expect(body.error.code).toBe('AUTHENTICATION_ERROR');
  });

  // ── 403 Authorization ─────────────────────────────────────────

  it('maps AuthorizationError to 403', async () => {
    const { status, body } = await run(Effect.fail(taggedError('AuthorizationError', 'forbidden')));
    expect(status).toBe(403);
    expect(body.error.code).toBe('AUTHORIZATION_ERROR');
  });

  // ── Unknown tagged error → 500 with tag as code ───────────────

  it('maps unknown tagged error to 500 with tag as code', async () => {
    const { status, body } = await run(
      Effect.fail(taggedError('WeirdDomainError', 'something broke')),
    );
    expect(status).toBe(500);
    expect(body.error.code).toBe('WeirdDomainError');
    expect(body.error.message).toContain('something broke');
  });

  // ── Defect (die) → 500 INTERNAL_ERROR ─────────────────────────

  it('maps Effect.die (defect) to 500 INTERNAL_ERROR', async () => {
    const { status, body } = await run(Effect.die(new Error('kaboom')));
    expect(status).toBe(500);
    expect(body.error.code).toBe('INTERNAL_ERROR');
    expect(body.error.message).toBe('An unexpected error occurred');
  });

  // ── Plain (non-tagged) failure → 500 INTERNAL_ERROR ───────────

  it('maps non-tagged failure to 500 INTERNAL_ERROR', async () => {
    const { status, body } = await run(Effect.fail('plain string error'));
    expect(status).toBe(500);
    expect(body.error.code).toBe('INTERNAL_ERROR');
    expect(body.error.message).toBe('An unexpected error occurred');
  });
});
