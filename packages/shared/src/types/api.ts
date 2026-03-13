import type { CursorPaginationResponse } from './pagination.js';

export interface ApiResponse<T> {
  readonly data: T;
}

export interface ApiErrorDetail {
  readonly code: string;
  readonly message: string;
  readonly details?: Record<string, unknown>;
}

export interface ApiErrorResponse {
  readonly error: ApiErrorDetail;
}

export interface PaginatedResponse<T> {
  readonly data: T[];
  readonly pagination: CursorPaginationResponse;
}
