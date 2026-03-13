import { Data } from 'effect';
import type { Context, ErrorHandler } from 'hono';

// Domain error base classes for HTTP mapping
export class NotFoundError extends Data.TaggedError('NotFoundError')<{
  readonly resource: string;
  readonly id: string;
}> {}

export class ValidationError extends Data.TaggedError('ValidationError')<{
  readonly field: string;
  readonly message: string;
}> {}

export class AuthenticationError extends Data.TaggedError('AuthenticationError')<{
  readonly message: string;
}> {}

export class AuthorizationError extends Data.TaggedError('AuthorizationError')<{
  readonly message: string;
}> {}

export class ConflictError extends Data.TaggedError('ConflictError')<{
  readonly resource: string;
  readonly message: string;
}> {}

const errorToStatus = (error: unknown): number => {
  if (error instanceof NotFoundError) return 404;
  if (error instanceof ValidationError) return 422;
  if (error instanceof AuthenticationError) return 401;
  if (error instanceof AuthorizationError) return 403;
  if (error instanceof ConflictError) return 409;
  return 500;
};

const errorToCode = (error: unknown): string => {
  if (error != null && typeof error === 'object' && '_tag' in error) {
    return (error as { _tag: string })._tag
      .replace(/([A-Z])/g, '_$1')
      .toUpperCase()
      .replace(/^_/, '');
  }
  return 'INTERNAL_ERROR';
};

/**
 * Global error handler for the Hono app.
 * Maps domain errors to structured JSON responses with appropriate HTTP status codes.
 *
 * Usage: `app.onError(errorHandler);`
 */
export const errorHandler: ErrorHandler = (error: Error, c: Context) => {
  const status = errorToStatus(error);
  const code = errorToCode(error);
  const message = error instanceof Error ? error.message : 'An unexpected error occurred';

  return c.json(
    {
      error: {
        code,
        message,
        details: {},
      },
    },
    status as 400,
  );
};
