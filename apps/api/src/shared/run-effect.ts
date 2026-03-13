import { Cause, Effect, Exit } from 'effect';
import type { Context as HonoContext } from 'hono';

/**
 * Runs an Effect program within a Hono route handler.
 * Maps typed failures to JSON error responses.
 * NEVER use Effect.runPromise directly in routes — always use this.
 */
export const runEffect = async <A, E>(
  c: HonoContext,
  effect: Effect.Effect<A, E, never>,
): Promise<Response> => {
  const exit = await Effect.runPromiseExit(effect);

  if (Exit.isSuccess(exit)) {
    return c.json(exit.value as Record<string, unknown>);
  }

  const cause = exit.cause;

  if (Cause.isFailType(cause)) {
    const error = cause.error;
    // Check for tagged errors with _tag property
    if (error != null && typeof error === 'object' && '_tag' in error) {
      const tag = (error as { _tag: string })._tag;
      const message = error instanceof Error ? error.message : String(error);

      switch (tag) {
        case 'NotFoundError':
        case 'ItemNotFoundError':
        case 'TagNotFoundError':
        case 'CommentNotFoundError':
        case 'ParentItemNotFoundError':
          return c.json({ error: { code: 'NOT_FOUND', message, details: {} } }, 404);
        case 'ValidationError':
        case 'InvalidStatusTransitionError':
          return c.json({ error: { code: 'VALIDATION_ERROR', message, details: {} } }, 422);
        case 'ConflictError':
        case 'DuplicateTagError':
          return c.json({ error: { code: 'CONFLICT', message, details: {} } }, 409);
        case 'AuthenticationError':
          return c.json({ error: { code: 'AUTHENTICATION_ERROR', message, details: {} } }, 401);
        case 'AuthorizationError':
          return c.json({ error: { code: 'AUTHORIZATION_ERROR', message, details: {} } }, 403);
        default:
          return c.json({ error: { code: tag, message, details: {} } }, 500);
      }
    }
  }

  return c.json(
    {
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
        details: {},
      },
    },
    500,
  );
};
