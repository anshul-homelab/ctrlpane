# ADR-011: Pagination, Filtering, and Sorting Conventions

- Status: accepted
- Date: 2026-03-12
- Deciders: Anshul Bisen
- Categories: API

## Context

Pagination format is baked into every list endpoint response shape. Changing from cursor-based to offset-based (or vice versa) breaks all client pagination loops. AI agents need consistent, mechanically-parseable list responses with clear termination signals. The pagination strategy must perform well at depth (deep pages) and remain stable during concurrent writes.

## Decision

Cursor-based pagination using opaque base64-encoded cursors that encode `(sort_field_value, id)`.

**Standard query parameters:**
- `limit` (1-100, default 25)
- `cursor` (opaque string)
- `sort` (field name, default `created_at`)
- `order` (`asc` or `desc`, default `desc`)

**Response envelope:**
```json
{
  "data": [],
  "pagination": {
    "next_cursor": "string | null",
    "prev_cursor": "string | null",
    "has_more": "boolean",
    "limit": "number"
  }
}
```

**Filtering supports:** exact match (`?status=active`), multi-value OR (`?status=active,paused`), range (`?created_after=2026-01-01`), full-text search (`?q=search+term`), and foreign key filter (`?project_id=prj_xxx`).

No field projection — agents need consistent response shapes to parse reliably.

**SQL pattern:** `WHERE (sort_col, id) > ($cursor_sort, $cursor_id) ORDER BY sort_col, id LIMIT $limit + 1` — fetch limit+1 to detect `has_more`.

### Alternatives Rejected

| Option | Reason |
|--------|--------|
| Offset-based (`?page=3&per_page=25`) | O(n) performance at depth, inconsistent during concurrent writes, requires total count query |
| Keyset with transparent cursors | Exposes internal sort field names and types, coupling clients to schema details |
| GraphQL Relay-style connections | CtrlPane uses REST. The cursor concept is borrowed from Relay but adapted to REST conventions. |
| Field projection (`?fields=id,title,status`) | Inconsistent response shapes break agent parsing. The bandwidth savings are negligible for typical payloads (<5KB). |

### Schema and Code Impact

- New shared schema: `paginationSchema` in `packages/shared/src/pagination.ts` — Zod schemas for request params and response envelope
- Repository pattern: all `list*` methods accept `PaginationParams` and return `PaginatedResult<T>`
- Cursor encoding/decoding utilities in `packages/shared/src/cursor.ts`
- Filter parsing middleware in Hono for standard filter params

## Consequences

### Positive

- O(1) performance: keyset pagination uses index scans regardless of page depth
- Consistency during iteration: stable when rows are inserted or deleted mid-iteration
- Agent-friendly: agents follow `next_cursor` mechanically with no page number arithmetic; `has_more` provides a clear termination signal
- Opaque cursors preserve flexibility: base64 encoding hides internal format, allowing underlying keyset column changes without breaking clients
- No field projection simplifies agent development: consistent response shapes eliminate combinatorial explosion in agent prompt engineering

### Negative

- Cannot jump to arbitrary pages (no "go to page 50" functionality)
- Opaque cursors cannot be constructed by clients — must be obtained from a previous response
- Cursor format must be kept backward compatible to avoid breaking in-progress pagination sessions

### Neutral

- `total_count` is intentionally omitted from the default response to avoid expensive COUNT queries; may be added as opt-in header at GA
- Filter DSL uses simple query parameters rather than a custom expression language

## Phase Gates

| Phase | Behavior |
|-------|----------|
| Alpha | Full pagination contract implemented. All list endpoints use cursor-based pagination with the standard response envelope. |
| Beta | Same contract. Performance monitoring on keyset queries. Index coverage validation. |
| GA | Same contract. Consider adding `total_count` as opt-in header (`X-Total-Count`) for admin dashboards only — never in default response. |

## More Information

- [Pre-Implementation Architecture Decisions](../superpowers/specs/2026-03-12-pre-implementation-architecture-decisions-design.md)
- [ADR-009: API Versioning](./ADR-009-api-versioning.md)
