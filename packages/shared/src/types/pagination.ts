export interface CursorPaginationRequest {
  readonly cursor?: string;
  readonly limit?: number;
  readonly sort?: string;
  readonly order?: 'asc' | 'desc';
}

export interface CursorPaginationResponse {
  readonly next_cursor: string | null;
  readonly prev_cursor: string | null;
  readonly has_more: boolean;
  readonly limit: number;
}

export const DEFAULT_PAGE_LIMIT = 25;
export const MAX_PAGE_LIMIT = 100;
