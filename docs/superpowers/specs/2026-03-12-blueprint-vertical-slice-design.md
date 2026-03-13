# Blueprint Vertical Slice Design

> Comprehensive design spec for the ctrlpane blueprint domain — a production-grade reference implementation that validates every architectural layer end-to-end before building real product domains.

**Date**: 2026-03-12
**Status**: Draft
**Scope**: Blueprint domain, API key auth, full Kali deployment

---

## 1. Overview

### Purpose

The blueprint domain validates the entire ctrlpane architecture end-to-end before building real product domains (tasks, projects, goals, etc.). It is a complete, isolated domain that exercises every layer of the system — from database to frontend to deployment — proving that the patterns work in production before any product code is written.

### Scope

- Standalone "blueprint" domain, separate from all product features
- API key authentication only (auth layer upgradeable independently later)
- Full deployment to Kali (production Mini PC) via CI/CD
- Exercises every layer: DB, repository, service, routes, events, caching, real-time, MCP, frontend, testing, CI/CD, observability

### Success Criteria

- All layers working in production on Kali
- All tests passing (unit, integration, architecture)
- MCP tools functional and tested via MCP client
- Real-time updates arriving in frontend via Centrifugo WebSocket
- CI/CD pipeline deploying automatically on merge to main

---

## 2. Monorepo Scaffold

```
ctrlpane/
├── apps/
│   ├── api/                    # Hono.js + Effect.ts API server
│   │   ├── src/
│   │   │   ├── index.ts        # Server entry, health routes
│   │   │   ├── middleware/      # Auth, tenant context, error handling, request ID
│   │   │   ├── domains/
│   │   │   │   └── blueprint/  # The blueprint domain
│   │   │   ├── infra/          # DB client, Redis client, NATS client, Centrifugo client
│   │   │   └── shared/         # Effect layers, error types, pagination helpers
│   │   └── package.json
│   └── web/                    # React 19 + TanStack frontend
│       ├── src/
│       │   ├── routes/         # TanStack Router file-based routes
│       │   ├── components/     # Shared UI components
│       │   ├── lib/            # API client, WebSocket client, query helpers
│       │   └── domains/
│       │       └── blueprint/  # Blueprint UI components
│       └── package.json
├── packages/
│   └── shared/                 # Zod schemas, types, constants shared between api + web
│       ├── src/
│       │   ├── schemas/        # Zod schemas (blueprint items, comments, tags)
│       │   └── types/          # TypeScript types, enums, constants
│       └── package.json
├── docker-compose.yml          # Postgres, Redis, NATS, Centrifugo
├── process-compose.yml         # Dev orchestration (api, web, infra)
├── turbo.json                  # Turborepo pipeline
├── biome.json                  # Linter + formatter
├── lefthook.yml                # Pre-commit hooks
├── commitlint.config.ts        # Conventional commits
└── package.json                # Workspace root
```

### Key Structural Decisions

- **Turborepo** orchestrates build/lint/test pipelines across workspaces
- **process-compose** handles local dev (starts api, web, and all infra containers)
- **`packages/shared`** is the single source of truth for schemas and types consumed by both `apps/api` and `apps/web`
- Domain code lives inside the app that owns it (`apps/api/src/domains/blueprint/`, `apps/web/src/domains/blueprint/`), not in a shared package

---

## 3. Auth Foundation

### Middleware Pipeline

```
Request
  → extractApiKey(header: X-API-Key)
  → lookupKey(db, constant-time compare of SHA-256 hash)
  → setTenantContext(postgres SET LOCAL app.tenant_id)
  → handler
```

### Design Decisions

- API keys stored as SHA-256 hashes in the `api_keys` table — raw key returned only once at creation time
- Middleware sets `app.tenant_id` via `SET LOCAL` for RLS, scoped to the transaction and automatically cleared on commit/rollback
- All downstream code receives tenant context through Effect — domains never touch auth directly
- Constant-time comparison via `crypto.timingSafeEqual` on the hash to prevent timing attacks
- When JWT/session auth is added later, only the middleware changes; all domain code remains untouched

### Tables

| Column | Type | Notes |
|--------|------|-------|
| **api_keys** | | |
| `id` | `TEXT PK` | `apk_` prefix ULID |
| `tenant_id` | `TEXT NOT NULL` | FK to tenants |
| `name` | `TEXT NOT NULL` | Human-readable label |
| `key_hash` | `TEXT NOT NULL` | SHA-256 hash of raw key |
| `key_prefix` | `TEXT NOT NULL` | First 8 chars for identification |
| `permissions` | `JSONB NOT NULL` | `["read", "write", "admin"]` |
| `expires_at` | `TIMESTAMPTZ` | Nullable, null = never expires |
| `last_used_at` | `TIMESTAMPTZ` | Updated on each authenticated request |
| `created_at` | `TIMESTAMPTZ NOT NULL` | Default `now()` |

| Column | Type | Notes |
|--------|------|-------|
| **tenants** | | |
| `id` | `TEXT PK` | `tnt_` prefix ULID |
| `name` | `TEXT NOT NULL` | Display name |
| `slug` | `TEXT NOT NULL UNIQUE` | URL-safe identifier |
| `settings` | `JSONB NOT NULL` | Default `{}` |
| `created_at` | `TIMESTAMPTZ NOT NULL` | Default `now()` |
| `updated_at` | `TIMESTAMPTZ NOT NULL` | Default `now()`, trigger-updated |

---

## 4. Blueprint Domain — Data Model

All tables live in the `blueprint` schema. Every table includes `tenant_id` with RLS enabled and forced.

### blueprint_items

The main entity — a generic item that exercises CRUD, status lifecycle, self-referential FK, and all relational patterns.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `TEXT PK` | `bpi_` prefix ULID |
| `tenant_id` | `TEXT NOT NULL` | RLS-enforced |
| `title` | `TEXT NOT NULL` | Max 500 chars |
| `description` | `TEXT` | Nullable, Markdown |
| `status` | `TEXT NOT NULL` | Enum: `pending`, `in_progress`, `done` |
| `priority` | `TEXT NOT NULL` | Enum: `critical`, `high`, `medium`, `low` |
| `parent_id` | `TEXT` | FK to self, nullable, one level deep |
| `created_by` | `TEXT NOT NULL` | API key ID |
| `assigned_to` | `TEXT` | Nullable |
| `due_date` | `TIMESTAMPTZ` | Nullable |
| `completed_at` | `TIMESTAMPTZ` | Set automatically when status transitions to `done` |
| `metadata` | `JSONB NOT NULL` | Default `{}`, extensible |
| `created_at` | `TIMESTAMPTZ NOT NULL` | Default `now()` |
| `updated_at` | `TIMESTAMPTZ NOT NULL` | Default `now()`, trigger-updated |
| `deleted_at` | `TIMESTAMPTZ` | Nullable, default null — soft delete (NULL = active) |

### blueprint_tags

Lookup table for tag management.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `TEXT PK` | `bpt_` prefix ULID |
| `tenant_id` | `TEXT NOT NULL` | RLS-enforced |
| `name` | `TEXT NOT NULL` | Unique per tenant |
| `color` | `TEXT NOT NULL` | Hex color code |
| `created_at` | `TIMESTAMPTZ NOT NULL` | Default `now()` |

### blueprint_item_tags

Junction table for many-to-many items-to-tags relationship.

| Column | Type | Notes |
|--------|------|-------|
| `item_id` | `TEXT NOT NULL` | FK to blueprint_items, cascade delete |
| `tag_id` | `TEXT NOT NULL` | FK to blueprint_tags, cascade delete |
| `tenant_id` | `TEXT NOT NULL` | RLS-enforced |
| | | PK: composite `(item_id, tag_id)` |

### blueprint_comments

| Column | Type | Notes |
|--------|------|-------|
| `id` | `TEXT PK` | `bpc_` prefix ULID |
| `tenant_id` | `TEXT NOT NULL` | RLS-enforced |
| `item_id` | `TEXT NOT NULL` | FK to blueprint_items (no cascade — comments survive item soft delete for audit) |
| `content` | `TEXT NOT NULL` | Markdown |
| `author_id` | `TEXT NOT NULL` | |
| `author_type` | `TEXT NOT NULL` | Enum: `user`, `agent`, `system` |
| `created_at` | `TIMESTAMPTZ NOT NULL` | Default `now()` |

### blueprint_activity

Append-only audit log for item changes.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `TEXT PK` | `bpa_` prefix ULID |
| `tenant_id` | `TEXT NOT NULL` | RLS-enforced |
| `item_id` | `TEXT NOT NULL` | FK to blueprint_items (no cascade — append-only, never deleted, survives item soft delete) |
| `actor_id` | `TEXT NOT NULL` | |
| `actor_type` | `TEXT NOT NULL` | Enum: `user`, `agent`, `system` |
| `action` | `TEXT NOT NULL` | `created`, `updated`, `deleted`, `status_changed`, `assigned`, `commented` |
| `field` | `TEXT` | Nullable, which field changed |
| `old_value` | `TEXT` | Nullable |
| `new_value` | `TEXT` | Nullable |
| `created_at` | `TIMESTAMPTZ NOT NULL` | Default `now()` |

### outbox_events (Shared Infrastructure)

This table is defined in the canonical schema at `docs/architecture/data-model.md` § "Outbox Table Design". The blueprint domain writes events with `event_type` values matching Section 8 subjects (e.g., `blueprint.item.created`). Key columns: `id`, `event_type`, `payload` (JSONB), `trace_id` (for ADR-018 trace propagation), `published_at` (null until poller processes), `created_at`. Index: `idx_outbox_pending` on `(published_at IS NULL, created_at)` for efficient polling.

### Relational Patterns Validated

| Pattern | Example |
|---------|---------|
| One-to-many | items -> comments, items -> activity |
| Self-referential FK | items -> sub-items via `parent_id` |
| Many-to-many | items <-> tags via `blueprint_item_tags` junction |
| Soft delete | Items use `deleted_at` column; `blueprint_item_tags` hard cascade (junction table, no audit value); comments and activity survive item soft delete |
| Multi-table retrieval | Item detail fetches sub-items, tags, comments in parallel |
| RLS on every table | All 5 tables enforce tenant isolation |

---

## 5. API Endpoints

All endpoints under `/api/v1/blueprint`. Standard JSON request/response bodies. Errors follow the ctrlpane error response format.

### Items

| Method | Path | Description | Notes |
|--------|------|-------------|-------|
| `GET` | `/items` | List items | Cursor pagination, filters: `status`, `priority`, `tag`, `search`, `assigned_to` |
| `POST` | `/items` | Create item | `Idempotency-Key` header supported |
| `GET` | `/items/:id` | Get item detail | Includes sub-items, tags, comments |
| `PATCH` | `/items/:id` | Update item | Partial update |
| `DELETE` | `/items/:id` | Delete item | Soft delete — sets `deleted_at = now()`, does NOT change status |
| `POST` | `/items/:id/assign` | Assign item | Sets `assigned_to` field |

### Sub-items

| Method | Path | Description | Notes |
|--------|------|-------------|-------|
| `GET` | `/items/:id/sub-items` | List sub-items | Returns children where `parent_id` = `:id` |
| `POST` | `/items/:id/sub-items` | Create sub-item | Sets `parent_id` automatically |

### Tags

| Method | Path | Description | Notes |
|--------|------|-------------|-------|
| `GET` | `/tags` | List all tags | Tenant-scoped |
| `POST` | `/tags` | Create tag | Unique name per tenant |
| `DELETE` | `/tags/:id` | Delete tag | Cascades to junction table |
| `POST` | `/items/:id/tags` | Add tag to item | Creates junction row |
| `DELETE` | `/items/:id/tags/:tagId` | Remove tag from item | Deletes junction row |

### Comments

| Method | Path | Description | Notes |
|--------|------|-------------|-------|
| `GET` | `/items/:id/comments` | List comments | Cursor pagination |
| `POST` | `/items/:id/comments` | Add comment | Supports user/agent/system author types |
| `DELETE` | `/comments/:id` | Delete comment | |

### Activity

| Method | Path | Description | Notes |
|--------|------|-------------|-------|
| `GET` | `/items/:id/activity` | Get activity log | Cursor pagination, append-only |

### Auth

| Method | Path | Description | Notes |
|--------|------|-------------|-------|
| `POST` | `/auth/keys` | Create API key | Returns raw key once — store it |
| `GET` | `/auth/keys` | List API keys | Returns `key_prefix` + `name` only |
| `DELETE` | `/auth/keys/:id` | Revoke API key | |

### Health

| Method | Path | Description | Notes |
|--------|------|-------------|-------|
| `GET` | `/health` | Overall health | |
| `GET` | `/health/live` | Liveness probe | Process is running |
| `GET` | `/health/ready` | Readiness probe | Postgres + Redis + NATS connectivity |

---

## 6. Service Layer (Effect.ts)

### 3-Layer Pattern

```
routes.ts → BlueprintItemService → BlueprintItemRepository
                                 → BlueprintEventPublisher
                                 → BlueprintCacheService
```

### Key Patterns

- **Effect `Context.Tag`** for dependency injection — services receive repositories and infrastructure through the Effect context, never via imports
- **`Effect.gen`** for async composition — all service methods are Effect generators
- **Typed domain errors**: `ItemNotFound`, `InvalidStatusTransition`, `DuplicateTag`, `PermissionDenied`
- **Transactional outbox**: mutations write to `outbox_events` table in the same Postgres transaction, poller publishes to NATS
- **`instrumentService`**: auto-wraps all service methods with OpenTelemetry spans — no manual `Effect.withSpan()`

### Domain Files

Following the [development conventions](../../guides/development-conventions.md):

```
domains/blueprint/
  routes.ts            — Hono router, zValidator, runEffect()
  service.ts           — Business logic + Context.Tag interface + class
  repository.ts        — Drizzle queries + Context.Tag interface + class
  service-live.ts      — Live Effect Layer for service
  repository-live.ts   — Live Effect Layer for repository
  layer.ts             — Layer composition (BlueprintLive = service + repo + infra)
  errors.ts            — Domain-specific Data.TaggedError classes
  types.ts             — Re-export barrel for row/result types
  event-publisher.ts   — Event publishing via outbox
  cache-service.ts     — Redis cache-aside logic
```

Cache logic is co-located in `service.ts`. Event publishing is extracted to `event-publisher.ts` as a separate Effect service with its own Context.Tag, since it wraps the outbox write pattern and is reused across multiple service methods.

### Status State Machine

Deletion is handled via the `deleted_at` column, not via status. Status tracks workflow state only.

```
pending ──→ in_progress ──→ done
   ↑            │              │
   └────────────┘ (reassign)   │
                ←──────────────┘ (reopen)
```

| From | To | Transition |
|------|----|-----------|
| `pending` | `in_progress` | Start work |
| `in_progress` | `done` | Complete |
| `in_progress` | `pending` | Reassign / revert |
| `done` | `in_progress` | Reopen |

All other transitions are rejected with `InvalidStatusTransition` error (HTTP 422).

---

## 7. Caching (Redis)

Cache-aside pattern: check cache -> miss -> query DB -> populate cache -> return.

### Cache Keys

| Key Pattern | TTL | Invalidation |
|-------------|-----|-------------|
| `bp:{tenant}:items:list:{cursor_hash}` | 60s | Any item mutation for the tenant |
| `bp:{tenant}:item:{id}` | 300s | Update or delete of that item |
| `bp:{tenant}:tags` | 600s | Tag create or delete for the tenant |

### Invalidation Strategy

- Item mutations invalidate both the specific item cache and all list caches for the tenant
- Tag mutations invalidate the tag list cache for the tenant
- Cache keys include tenant ID for isolation — no cross-tenant cache leakage
- On cache miss, populate cache after DB read within the same service call

---

## 8. Events (NATS JetStream)

All events use the [CloudEvents](https://cloudevents.io/) envelope format. Events are published via the transactional outbox — never directly from service code.

### Event Subjects

| Subject | Trigger | Payload |
|---------|---------|---------|
| `blueprint.item.created` | New item | Full item object |
| `blueprint.item.updated` | Field change | Item ID + changed fields + old/new values |
| `blueprint.item.completed` | Status -> `done` | Item ID + `completed_at` |
| `blueprint.item.deleted` | `deleted_at` set (soft delete) | Item ID |
| `blueprint.item.assigned` | Assignment change | Item ID + old/new assignee |
| `blueprint.comment.created` | New comment | Item ID + comment object |

### Transactional Outbox Flow

1. Service method writes business data + outbox event row in the same Postgres transaction
2. Outbox poller queries pending events: `SELECT ... FROM outbox_events WHERE status = 'pending' ORDER BY created_at LIMIT 100 FOR UPDATE SKIP LOCKED`
3. Poller publishes each event to NATS JetStream
4. On success: mark `status = 'published'`, set `published_at`
5. On failure: increment `attempts`. After 10 attempts, mark as `dead_letter` and alert

This guarantees at-least-once delivery without distributed transactions.

---

## 9. Real-time (Centrifugo)

### Channels

| Channel | Scope | Events |
|---------|-------|--------|
| `blueprint:items#{tenant_id}` | List-level | `item.created`, `item.updated`, `item.deleted` |
| `blueprint:item#{item_id}` | Detail-level | `item.updated`, `comment.created`, `item.assigned` |

### Event Flow

```
API mutation
  → outbox row written in same Postgres tx
  → poller reads outbox
  → publishes to NATS JetStream
  → NATS consumer picks up event
  → consumer calls Centrifugo HTTP API
  → Centrifugo pushes via WebSocket to subscribed clients
```

### Auth

- Centrifugo connection tokens generated by the API using a shared HMAC secret
- Token includes `tenant_id`; Centrifugo enforces channel namespace isolation
- Clients request a connection token from the API, then connect to Centrifugo with it
- Channel subscription is validated against the token's tenant claim

---

## 10. MCP Tools

9 tools, running in-process with the API server. Tools call Effect services directly — no HTTP overhead, shared transaction context.

| Tool | Parameters | Description |
|------|-----------|-------------|
| `blueprint_list_items` | `status?`, `priority?`, `tag?`, `search?`, `assigned_to?`, `cursor?`, `limit?` | List items with filters |
| `blueprint_get_item` | `id` | Full item with sub-items, tags, comments |
| `blueprint_create_item` | `title`, `description?`, `priority?`, `status?`, `assigned_to?`, `parent_id?`, `tag_ids?` | Create a new item |
| `blueprint_update_item` | `id`, `fields` | Partial update |
| `blueprint_delete_item` | `id` | Soft delete (sets `deleted_at`) |
| `blueprint_change_status` | `id`, `new_status` | Status transition with validation |
| `blueprint_add_comment` | `item_id`, `content` | Add a comment to an item |
| `blueprint_search_items` | `query`, `filters?` | Full-text search with optional filters |
| `blueprint_list_tags` | — | List all tags for the tenant |

### MCP Design Notes

- Tools share the same Effect service layer as HTTP routes — identical business logic, typed errors, and observability
- MCP auth uses the same API key mechanism; the MCP transport extracts the key and sets tenant context
- Tool descriptions are optimized for AI agent consumption (clear parameter semantics, explicit return shapes)

---

## 11. Frontend (React 19 + TanStack)

### Routes

| Path | View | Description |
|------|------|-------------|
| `/` | Dashboard | Counts by status, recent activity feed |
| `/items` | Item list | Data table with search, filter, inline status edit |
| `/items/:id` | Item detail | Sub-items, tags, comments, activity (tabbed) |
| `/tags` | Tag manager | CRUD with color picker |
| `/settings` | Settings | API key management — create with name/permissions, list with prefix+name+last_used, revoke. No rate-limit display or key rotation UI in blueprint scope. |

### Patterns

- **TanStack Router**: File-based routing with type-safe params and search params
- **TanStack Query**: Server state management with optimistic updates and cache invalidation
- **Centrifugo JS client**: Subscribes to tenant channel on mount, invalidates TanStack Query cache on incoming events for instant UI updates
- **Zod schema sharing**: Imports `@ctrlpane/shared` schemas for form validation — single source of truth
- **Data table**: Column sorting, multi-filter, cursor pagination with "load more" pattern
- **Optimistic updates**: Status changes and comment additions update the UI immediately, rolling back on server error

### UI Philosophy

The UI is deliberately minimal — the goal is to prove frontend patterns and real-time integration, not aesthetics. No design system, no polish. Functional and correct.

---

## 12. Testing

### 3-Tier Pyramid

| Tier | Tool | Scope | Coverage Target |
|------|------|-------|----------------|
| Unit | Vitest | Service logic (status transitions, validation, error mapping), Zod schemas, utilities | 90%+ for service layer |
| Integration | Vitest + testcontainers | Repository queries (real Postgres), Redis cache, NATS events, API routes end-to-end | Every endpoint + every query |
| Architecture | dependency-cruiser + ArchUnitTS + ts-morph | Hexagonal boundaries, import direction, file size limits, Effect patterns | All 31 existing rules + blueprint rules |

### Key Testing Patterns

- **TDD cycle**: Red-green-refactor for all service logic
- **testcontainers**: Spin up real Postgres, Redis, NATS per test suite — no mocks for infrastructure
- **Test isolation via tenant RLS**: Each test creates its own tenant, RLS ensures zero cross-test contamination
- **Co-located test files**: `service.test.ts` lives next to `service.ts`
- **No `mock.module()`**: Use Effect test Layers with mock repositories instead
- **Drizzle schema snapshots**: Verify migration correctness by comparing schema state
- **Every `describe` block**: Includes at least one failure/error case

---

## 13. Observability

### Traces

- **`@effect/opentelemetry`** instruments all Effect services and repositories automatically
- Traces exported via OTLP/HTTP to SigNoz (or dev-infra Grafana)
- `instrumentService` wraps every service method — no manual `Effect.withSpan()` needed

### Logs

- Structured JSON to stdout via Effect logger
- Every log line includes: `trace_id`, `tenant_id`, `request_id`
- Never log tokens, passwords, keys, or PII beyond `user_id`

### Metrics

- Request duration (p50, p95, p99)
- Error rate by route and error type
- Cache hit/miss ratio
- Outbox lag (time between event creation and publication)
- All via OpenTelemetry metrics

### Health

- `/health/ready` checks connectivity to Postgres, Redis, and NATS
- `/health/live` returns 200 if the process is running
- Health checks used by systemd watchdog and deployment scripts

### Trace Propagation

```
W3C traceparent on HTTP request
  → Effect spans for service + repository calls
  → outbox event row includes trace_id
  → NATS consumer extracts trace_id, creates child span
  → Centrifugo publish includes trace_id
```

End-to-end trace from HTTP request through async event processing to WebSocket push.

---

## 14. CI/CD & Deployment

### Pre-Commit (Lefthook)

Runs on every commit in parallel:

1. Biome lint + format (auto-fix and re-stage)
2. TypeScript typecheck
3. Unit tests
4. Architecture tests (dependency-cruiser + ArchUnitTS + ts-morph)

### GitHub Actions CI (on PR)

Sequential pipeline:

1. Branch name check (conventional format)
2. Commitlint (conventional commits)
3. Changeset check (version tracking)
4. Biome lint + format
5. TypeScript typecheck
6. Unit tests
7. Integration tests (testcontainers)
8. Build (all workspaces)
9. Architecture tests

### Deployment to Kali

```
Merge to main
  → Changesets version PR (auto-generated)
  → Merge version PR
  → Build on Kali (self-hosted runner)
  → pg_dump snapshot (backup before migration)
  → bun run db:migrate
  → Symlink release (new build dir)
  → systemctl restart ctrlpane-api ctrlpane-web
  → Health check (/health/ready)
  → Telegram notification (success/failure)
```

### Infrastructure on Kali

| Component | Configuration |
|-----------|--------------|
| Process management | systemd units: `ctrlpane-api.service`, `ctrlpane-web.service` |
| Infrastructure | `docker-compose.prod.yml` (Postgres, Redis, NATS, Centrifugo) |
| Bootstrap | `bootstrap.sh` for initial server setup |
| Backups | `rclone.conf.template` for off-site backup |

### Port Configuration

All ports follow the prefix-3 convention (ctrlpane = project prefix 3):

| Service | Port |
|---------|------|
| API | 33001 |
| Web | 33000 |
| PostgreSQL | 35432 |
| Redis | 36379 |
| NATS | 34222 |
| Centrifugo | 38000 |

---

## 15. Seed Data

Seed script available via `bun run db:seed`. Creates a fully functional demo environment:

| Entity | Count | Details |
|--------|-------|---------|
| Tenant | 1 | `tnt_blueprint` |
| API keys | 2 | Admin (full permissions) + read-only |
| Items | 10 | Varying statuses (`pending`, `in_progress`, `done`) and priorities; 2 with `deleted_at` set to demonstrate soft delete |
| Tags | 3 | With color codes, associated to items via junction table |
| Sub-items | 4+ | On 2 parent items |
| Comments | 10+ | On 5 items, mix of `user` and `agent` authored |
| Activity | N | One entry per mutation (auto-generated during seeding) |

Seed data is idempotent — running `db:seed` multiple times does not create duplicates.

---

## 16. Parallel Agent Team Structure

The blueprint implementation is designed for parallel agent execution. Teams are ordered by dependency — earlier teams must complete before dependent teams can start.

### Team Assignments

| Team | Scope | Key Deliverables |
|------|-------|-----------------|
| **A — Monorepo Scaffold** | Project structure, no domain code | `package.json` files, `tsconfig.json`, `turbo.json`, `biome.json`, `lefthook.yml`, `commitlint.config.ts`, `docker-compose.yml`, `process-compose.yml`, `.editorconfig`, `.gitignore` updates |
| **B — Database Layer** | Schema + migrations | Drizzle schema definitions (all 7 tables), migrations, RLS policies, seed script, DB client setup |
| **C — Shared Package** | Types + validation | Zod schemas for all entities, TypeScript types, enums, constants, pagination types, error types |
| **D — API Foundation** | Server + middleware | Hono server setup, middleware (auth, tenant context, error handling, request ID, CORS), health routes, infra clients (Postgres, Redis, NATS, Centrifugo), Effect layer composition |
| **E — Blueprint API Domain** | Domain logic | `routes.ts`, `service.ts`, `repository.ts`, `event-publisher.ts`, `cache-service.ts`, all domain logic, all endpoints |
| **F — MCP Server** | AI agent tools | MCP tool definitions, tool handlers calling Effect services directly |
| **G — Frontend** | Web UI | React app scaffold, TanStack Router, TanStack Query client, Centrifugo WebSocket client, all views (dashboard, items list, item detail, tags, settings) |
| **H — Testing** | Quality gates | Unit tests (service layer), integration tests (testcontainers), architecture test config updates |
| **I — CI/CD & Deployment** | Automation | GitHub Actions workflows, systemd units, `docker-compose.prod.yml`, `bootstrap.sh`, rclone config, Telegram notification |
| **Integration Agent** | End-to-end validation | Wires everything together, runs full test suite, fixes integration issues, validates end-to-end flow, deploys to Kali |

### Dependency Graph

```
A (scaffold) ──→ B (database)  ──→ E (blueprint API) ──→ F (MCP)
             ──→ C (shared)    ──→ E                  ──→ H (testing)
             ──→ D (API foundation) → E
             ──→ G (frontend, needs C only)
             ──→ I (CI/CD)
                                                          ↓
                                              Integration Agent
```

### Execution Order

1. **Wave 1**: Team A (scaffold) — must complete first
2. **Wave 2**: Teams B, C, D, I — run in parallel, all depend only on A
3. **Wave 3**: Team E — depends on B, C, D
4. **Wave 4**: Teams F, G, H — run in parallel, depend on E (F, H) or C (G)
5. **Wave 5**: Integration Agent — runs after all teams complete

---

## 17. What's NOT Included

The following are explicitly out of scope for the blueprint domain:

| Exclusion | Reason |
|-----------|--------|
| JWT / session auth | API key only — auth layer is upgradeable independently later |
| Goal / sprint FKs | Product-specific relationships, not architecture validation |
| Recurrence logic | Product-specific feature (tasks domain) |
| AI discussion / LLM calls | Needs LLM integration beyond MCP tool surface |
| Design system / polished UI | Blueprint proves patterns, not aesthetics |
| Cloudflare tunnel setup | Networking infrastructure, not architecture validation |

---

## 18. Success Criteria

The blueprint is "done" when all of the following are true:

| # | Criterion | Verification |
|---|-----------|-------------|
| 1 | All 7 database tables created with RLS, seed data loads | `bun run db:migrate && bun run db:seed` succeeds |
| 2 | All API endpoints return correct responses with proper auth | Integration tests pass for every endpoint |
| 3 | All events published to NATS via transactional outbox | Integration test verifies outbox -> NATS flow |
| 4 | Real-time updates arrive in frontend via Centrifugo WebSocket | Manual test: mutate via API, see update in browser |
| 5 | Redis caching works with proper invalidation | Integration test verifies cache hit/miss/invalidation |
| 6 | All MCP tools functional | Tested via MCP client (Claude, etc.) |
| 7 | Frontend renders all views with optimistic updates | Manual walkthrough of all 5 routes |
| 8 | Unit + integration + architecture tests all pass | `bun run test` + `bun run test:arch` green |
| 9 | CI/CD pipeline runs green on PR and deploys to Kali | GitHub Actions green, Kali deployment succeeds |
| 10 | Health endpoints report all dependencies healthy on Kali | `curl https://ctrlpane.com/health/ready` returns 200 |
| 11 | OpenTelemetry traces visible in observability stack | Traces appear in SigNoz / Grafana for API requests |
| 12 | Seed data provides a working demo out of the box | Fresh deploy + seed = fully functional demo |

---

## Related Documentation

- [Architecture Overview](../../architecture/README.md)
- [Domain Map](../../architecture/domains.md)
- [Data Model](../../architecture/data-model.md)
- [Security Architecture](../../architecture/security.md)
- [Development Conventions](../../guides/development-conventions.md)
- [CI/CD Design](../../architecture/cicd-design.md)
- [Deployment Architecture](../../architecture/deployment-architecture.md)
- [ADR-001 — Tech Stack](../../decisions/ADR-001-tech-stack.md)
- [ADR-002 — Auth Strategy](../../decisions/ADR-002-auth-strategy.md)
- [ADR-003 — Domain Pattern](../../decisions/ADR-003-domain-pattern.md)
- [ADR-004 — PM Hierarchy](../../decisions/ADR-004-pm-hierarchy.md)
- [ADR-005 — Agent-First Design](../../decisions/ADR-005-agent-first-design.md)
- [ADR-006 — Event Architecture](../../decisions/ADR-006-event-architecture.md)
- [ADR-007 — Resilience and Deployment](../../decisions/ADR-007-resilience-and-deployment.md)
- [ADR-008 — CI/CD Deployment](../../decisions/ADR-008-cicd-deployment.md)
- [ADR-009 — API Versioning](../../decisions/ADR-009-api-versioning.md)
- [ADR-010 — Backward Compatibility](../../decisions/ADR-010-backward-compatibility.md)
- [ADR-011 — Pagination & Filtering](../../decisions/ADR-011-pagination-and-filtering.md)
- [ADR-012 — Event Schema Versioning](../../decisions/ADR-012-event-schema-versioning.md)
- [ADR-013 — Idempotency Keys](../../decisions/ADR-013-idempotency-keys.md)
- [ADR-014 — CSRF & SSRF Mitigation](../../decisions/ADR-014-csrf-ssrf-mitigation.md)
- [ADR-015 — GDPR Erasure](../../decisions/ADR-015-gdpr-erasure.md)
- [ADR-016 — Data Consistency Model](../../decisions/ADR-016-data-consistency-model.md)
- [ADR-017 — SPOF Acceptance Register](../../decisions/ADR-017-spof-acceptance-register.md)
- [ADR-018 — OpenTelemetry Stack](../../decisions/ADR-018-opentelemetry-stack.md)
- [ADR-019 — Agent Safety Controls](../../decisions/ADR-019-agent-safety-controls.md)
- [ADR-020 — Agent Session Retention](../../decisions/ADR-020-agent-session-retention.md)
