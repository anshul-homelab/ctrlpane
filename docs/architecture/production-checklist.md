# Production Readiness Checklist

> Single-page verification gate for any new ctrlpane domain, feature, or integration.
> Run through this checklist before marking work "done."

## How to Use

Every domain, feature, or integration must pass this checklist before it is considered production-ready. An agent or human reviews each section, checks the applicable items, and marks inapplicable items with `N/A` and a one-line reason. If any item fails, the work is not done.

This checklist covers **Bronze tier items only** — the must-ship requirements that are mechanically enforced via fitness functions, lint rules, and hooks. For Silver and Gold tier items, see [Production Governance](./production-governance.md).

---

## 1. Correctness & Testing

> Authoritative docs: [Development Conventions](../guides/development-conventions.md)

- [ ] TDD cycle followed: every behavioral change has a test written BEFORE the implementation (red-green-refactor)
- [ ] Unit tests exist for all service methods (Effect Layer mocks in `domains/<name>/__tests__/`)
- [ ] Integration/API tests exist for all new endpoints (success + validation error + auth error + not-found)
- [ ] RLS isolation tests exist: zero rows without `SET LOCAL`, tenant A cannot see tenant B, soft-deleted rows excluded
- [ ] Error/failure paths tested: every `describe` block includes at least one failure case
- [ ] Bug fixes include a regression test that fails before the fix and passes after
- [ ] No `test.skip()` or `test.todo()` without a tracking task

## 2. Security

> Authoritative docs: [Security Architecture](./security.md), [ADR-002 Auth](../decisions/ADR-002-auth-strategy.md)

- [ ] RLS enabled (`ENABLE ROW LEVEL SECURITY`) AND forced (`FORCE ROW LEVEL SECURITY`) on every new table
- [ ] RLS policies cover SELECT, INSERT, UPDATE, DELETE with `tenant_id = current_setting('app.tenant_id')`
- [ ] `requireAuth` middleware applied to all routes (no unauthenticated access to domain data)
- [ ] `requirePermission(key)` applied to mutating routes
- [ ] Input validated with `zValidator` + Zod schemas from `@ctrlpane/shared` on every endpoint
- [ ] No secrets, passwords, tokens, or PII logged — verify with `grep -r` for suspicious log statements

## 3. Reliability

> Authoritative docs: [ADR-006 Event Architecture](../decisions/ADR-006-event-architecture.md)

- [ ] Event consumers use `processed_events` table for exactly-once semantics
- [ ] Domain events published via transactional outbox (INSERT in same Postgres TX as business write)
- [ ] NATS JetStream consumer uses durable subscription with explicit ACK

## 4. Scalability

> Authoritative docs: [Data Model](./data-model.md)

- [ ] Indexes exist on: `tenant_id`, `user_id`, all foreign key columns, plus domain-specific query columns
- [ ] Composite indexes lead with `tenant_id` for all tenant-scoped queries
- [ ] Partial index on `WHERE deleted_at IS NULL` for tables with soft delete

## 5. Maintainability

> Authoritative docs: [Development Conventions](../guides/development-conventions.md)

- [ ] All source files under 400 lines; all test files under 300 lines (`bun run check:sizes`)
- [ ] Domain follows 3-layer pattern: `routes.ts` + `service.ts` + `repository.ts` (or documented variant)
- [ ] No direct cross-domain service imports for side effects (use events via outbox)
- [ ] Code passes `bun run check` (Biome lint + format) with zero errors
- [ ] Code passes `bun run typecheck` with zero errors
- [ ] No `--no-verify` used on any commit
- [ ] File naming follows convention: `service-live.ts`, `repository-live.ts`, `layer.ts`, `errors.ts`
- [ ] TypeScript strict mode enabled — no `any` types

## 6. Observability

> Authoritative docs: [Development Conventions — Logging](../guides/development-conventions.md#logging)

- [ ] Service wrapped with `instrumentService('domain', { ... })` for auto spans + duration histograms
- [ ] Repository wrapped with `instrumentRepository('domain', { ... })` for DB spans
- [ ] Structured logging uses `Effect.log` / `Effect.logWarning` / `Effect.logError` (not `console.log`)
- [ ] No high-cardinality values used as metric labels (no user IDs, entity IDs)

## 7. Deployability

> Authoritative docs: [Data Model — Migrations](./data-model.md)

- [ ] Migrations use expand/contract: no column rename or drop in same migration as replacement
- [ ] At least one deployment between expand and contract phases
- [ ] Migration runs under `ctrlpane_migrator` role (not `ctrlpane_app`)
- [ ] Env parity: same code runs in development and production, differentiated by env vars only
- [ ] No hardcoded ports/URLs — all configurable via env vars

## 8. Error Handling

> Authoritative docs: [Development Conventions — Error Handling](../guides/development-conventions.md#error-handling)

- [ ] Tagged errors defined in `errors.ts` using `Data.TaggedError` for every domain failure mode
- [ ] `runEffect` boundary used in routes — no `Effect.runPromise` in route handlers
- [ ] Standard error response format: `{ error: { code: string, message: string, details?: unknown } }`
- [ ] Error-to-HTTP mapping defined: NotFoundError -> 404, ValidationError -> 422, AuthorizationError -> 403, ConflictError -> 409, AuthenticationError -> 401, RateLimitError -> 429
- [ ] All error paths return meaningful HTTP status codes (no generic 500 for known failure modes)

## 9. Modularity

- [ ] Bounded context boundary respected: domain does not import another domain's service directly
- [ ] Shared types/schemas live in `packages/shared`, not duplicated across domains
- [ ] Cross-domain communication uses NATS events via the outbox pattern
- [ ] `Context.Tag` defined in `service.ts` / `repository.ts`, layers in `*-live.ts`
- [ ] Layer composition in `layer.ts` provides clean dependency graph

## 10. Testability

- [ ] Effect DI used: all dependencies injected via `Context.Tag`, mockable with `Layer.succeed`
- [ ] No `mock.module()` in Effect tests — only test Layers with mock repos
- [ ] Test data isolated: prefix with `test-` or use unique identifiers for cleanup
- [ ] Cleanup hooks present: `afterEach`/`afterAll` clean up created entities
- [ ] Tests are self-contained: no cross-test state dependencies

## 11. Interoperability

- [ ] Zod schemas in `@ctrlpane/shared` define API request/response contracts
- [ ] ID format uses prefixed ULIDs with registered prefix from [data-model prefix registry](./data-model.md#id-prefix-registry)
- [ ] Side effects triggered via domain events (outbox), not synchronous cross-domain calls
- [ ] Schema changes are additive: new columns nullable or with defaults
- [ ] Zod schemas are the single source of truth for contracts
- [ ] Tier 2 dependencies (NATS, Drizzle, Redis, Centrifugo, Hono) accessed only through `Context.Tag` port interfaces, never directly in domain code
- [ ] No hardcoded infrastructure URLs, ports, or credentials in domain code — all externalized via env vars

---

## Quick Verification Commands

These commands can verify many checklist items mechanically:

```bash
# Correctness: run all tests
bun run test 2>&1 | tail -30

# Maintainability: lint + format + type check + file sizes
bun run check && bun run typecheck && bun run check:sizes

# Architecture fitness functions (domain isolation, layer direction, conventions)
bun run test:arch

# Dead code detection
bun run lint:dead

# Dependency validation (forbidden imports, circular deps)
bun run deps:check

# Full governance suite (all Bronze checks)
bun run governance

# Dependencies: version governance
bun run lint:deps

# Security: search for console.log / secret logging
grep -rn 'console\.\(log\|warn\|error\)' apps/api/src/domains/<name>/
grep -rn 'password\|secret\|token' apps/api/src/domains/<name>/ | grep -i 'log\|console'

# Data: verify RLS on a table
psql -p 35432 -c "SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname = '<table>';"

# Indexes: verify expected indexes exist
psql -p 35432 -c "SELECT indexname FROM pg_indexes WHERE tablename = '<table>';"
```
