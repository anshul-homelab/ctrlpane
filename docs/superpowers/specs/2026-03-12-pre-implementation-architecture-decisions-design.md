# Pre-Implementation Architecture Decisions

**Date:** 2026-03-12 | **Status:** Proposed
**Author:** Claude Code + Anshul
**Context:** ctrlpane is a multi-tenant, AI-first project management platform at 0% implementation. These 21 decisions address gaps identified by auditing a 298-item superset production checklist against existing documentation. Each item is classified as irreversible (schema, API contract, or data model impact) and must be decided before any code is written.

**Launch Strategy:** Progressive rollout — private alpha → employee beta → public SaaS.
**Key Constraint:** No irreversible architectural decisions deferred. The design must be scalable and extensible to future requirements without costly rework.
**ADR-008 Note:** ADR-008 has been assigned to CI/CD Deployment Architecture ([ADR-008](../../decisions/ADR-008-cicd-deployment.md)). The ADRs proposed in this document start from ADR-009.

---

## Decision Summary

| # | Decision | Choice | ADR |
|---|----------|--------|-----|
| 1 | API Versioning | URL path `/api/v1/` | ADR-009 |
| 2 | Backward Compatibility | Additive-only + Sunset header, 90/180-day windows | ADR-010 |
| 3 | Pagination & Filtering | Cursor-based, opaque base64, max 100 per page | ADR-011 |
| 4 | Event Schema Versioning | CloudEvents-inspired envelope, version in type string | ADR-012 |
| 5 | Idempotency Keys | IETF `Idempotency-Key` header, tenant-scoped Redis, 24h TTL | ADR-013 |
| 6 | CSRF Mitigation | SameSite=Strict sufficient + Origin header check | ADR-014 |
| 7 | SSRF Prevention | SafeHttpClient with allowlist + private IP blocking + DNS pinning | ADR-014 |
| 8 | GDPR Erasure Cascade | Event-driven with ErasureCoordinator, nullify shared resources | ADR-015 |
| 9 | Data Consistency Model | Three-tier: strong (intra-domain), causal (UI), eventual (cross-domain) | ADR-016 |
| 10 | Retry / Backoff / Jitter | Three policy tiers (fast/standard/slow), full jitter | ADR-007 |
| 11 | Backpressure | Pull-based NATS consumers, Semaphore-limited outbox poller | ADR-007 |
| 12 | Bulkhead / Failure Isolation | Effect Semaphore pools + Postgres pool segmentation + circuit breakers | ADR-007 |
| 13 | SPOF Acceptance Register | YAML-based register at docs/operations/spof-register.yaml | ADR-017 |
| 14 | Deployment & Rollback | Superseded by ADR-008 (systemd + GitHub Actions + Changesets on Kali) | ADR-017 |
| 15 | OpenTelemetry Stack | @effect/opentelemetry + OTLP/HTTP + SigNoz | ADR-018 |
| 16 | Trace Propagation | W3C Traceparent across HTTP, outbox, NATS, Centrifugo | ADR-018 |
| 17 | Agent Action Risk Classification | Static 3-tier (normal/elevated/critical) per action | ADR-019 |
| 18 | Prompt/Instructions Versioning | Immutable versioned rows + per-project overrides | ADR-019 |
| 19 | Human Review Checkpoints | Async approval workflow, agent releases lease while pending | ADR-019 |
| 20 | Sensitive Data Controls | 3-layer progressive (classify → redact → consent) | ADR-019 |
| 21 | Agent Session Data Retention | Tiered: 6mo sessions, 3mo activity, 7d terminal output, file-based archive | ADR-020 |

---

## 1. API Versioning Strategy

**Category:** API
**Reversibility:** Irreversible — URL paths become part of every client integration, SDK, and agent tool definition. Changing the versioning scheme after launch requires coordinated migration across all consumers.

### Decision

URL path versioning at `/api/v1/`. All domain routes are mounted under this prefix via `app.route('/api/v1', routes)` in Hono. The MCP endpoint remains at `/mcp` without version prefix because MCP uses its own protocol-level capability negotiation. Internal health and metrics endpoints live outside the versioned prefix at `/health` and `/metrics`.

### Rationale

- **Agent-friendly**: AI agents work with URL strings directly. Header-based versioning requires agents to manipulate HTTP headers, which is error-prone and varies across HTTP client implementations.
- **Cacheable**: CDNs and reverse proxies can cache based on URL path. Header-based versioning requires `Vary` headers that defeat caching.
- **Industry standard**: Stripe (`/v1/`), GitHub (`/v3/`), Linear (`/v1/`), and Jira Cloud (`/rest/api/3/`) all use URL path versioning. Following established patterns reduces onboarding friction.
- **Simple routing**: Hono's `app.route()` makes prefix-based versioning a one-liner. No custom middleware needed to extract version from headers or query params.
- **MCP exception is clean**: MCP has its own protocol negotiation (`initialize` → `capabilities`), so a URL version prefix would be redundant and misleading.

### Alternatives Considered

| Option | Verdict | Reason |
|--------|---------|--------|
| Header-based (`Accept: application/vnd.ctrlpane.v1+json`) | Rejected | Hostile to AI agents — requires header manipulation, invisible in URL, defeats URL-based caching |
| Query parameter (`?version=1`) | Rejected | Non-standard, mixes versioning with filtering params, no major API uses this pattern |
| Versionless with additive-only evolution | Rejected | Works until the first breaking change, then becomes a trap with no migration path |
| Content negotiation (`Accept` media type) | Rejected | Over-engineered for a single-format JSON API, adds parsing complexity |

### Schema & Code Impact

- Hono router: all domain route files mounted under `/api/v1/` prefix
- Frontend API client: base URL set to `/api/v1/`
- MCP tool definitions: internal HTTP calls reference `/api/v1/` endpoints
- OpenAPI spec: `servers[0].url` set to `/api/v1`
- Documentation: all endpoint references include version prefix

### Phase Gate

| Phase | Behavior |
|-------|----------|
| Alpha | v1 only. All routes under `/api/v1/`. No version negotiation needed. |
| Beta | v1 + deprecation infrastructure. Sunset headers on deprecated endpoints. Version lifecycle documentation published. |
| GA | v1 + v2 coexistence. Both versions served simultaneously. v1 enters deprecation window when v2 stabilizes. |

---

## 2. Backward Compatibility Rules

**Category:** API
**Reversibility:** Irreversible — once clients depend on a compatibility contract, relaxing it breaks trust and integrations. The deprecation timeline becomes a contractual commitment.

### Decision

Additive-only evolution within a major version. Breaking changes require a new major version. Endpoint deprecation window is 90 days. Full version deprecation window is 180 days. Breaking changes are defined as: removing or renaming fields, making optional fields required, removing endpoints, removing enum values, tightening validation rules, or changing default values. Non-breaking changes are: adding optional fields (with defaults), adding new endpoints, adding enum values, loosening validation, or adding query parameters with sensible defaults. Deprecation is signaled via `Sunset` header (RFC 8594), `Deprecation: true` header, and `X-Ctrlpane-Deprecated: true` custom header. Per-tenant usage of deprecated endpoints is tracked in audit logs.

### Rationale

- **Predictable for agents**: AI agents parse API responses structurally. Removing or renaming fields causes silent failures that are hard to debug in agent pipelines.
- **RFC 8594 compliance**: The `Sunset` header is a standard mechanism that HTTP-aware clients can parse programmatically. Agents can be trained to watch for it.
- **Per-tenant tracking enables targeted migration**: Knowing which tenants still use deprecated endpoints allows targeted outreach instead of hoping everyone reads changelogs.
- **90/180-day windows are industry-standard**: Stripe uses 90-day endpoint deprecation. GitHub uses 12-month version deprecation. Our windows are conservative for alpha/beta but appropriate for the progressive rollout strategy.
- **Additive-only is the simplest contract**: Clients can safely ignore new fields. This eliminates the most common source of API breakage.

### Alternatives Considered

| Option | Verdict | Reason |
|--------|---------|--------|
| No formal compatibility rules | Rejected | Leads to ad-hoc breaking changes and erodes client trust. Especially dangerous when agents depend on stable schemas. |
| Shorter deprecation windows (30 days) | Rejected | Insufficient time for enterprise clients to update integrations. 90 days is the minimum industry standard. |
| Longer deprecation windows (12 months) | Deferred | Appropriate for GA with paying customers. Overkill for alpha/beta where the user base is controlled. |
| GraphQL-style deprecation directives | N/A | ctrlpane uses REST, not GraphQL. The `@deprecated` directive pattern inspired the header-based approach. |

### Schema & Code Impact

- New Hono middleware: `deprecation()` — injects `Sunset`, `Deprecation`, and `X-Ctrlpane-Deprecated` headers
- Audit log enrichment: `deprecated_endpoint_used` event type with tenant_id, endpoint, and sunset date
- Per-tenant deprecation usage dashboard query
- Documentation: deprecation policy page in developer docs
- API changelog: structured format with breaking/non-breaking classification

### Phase Gate

| Phase | Behavior |
|-------|----------|
| Alpha | Additive-only changes. No deprecation infrastructure needed — user base is controlled (solo dev). |
| Beta | Sunset headers active on any deprecated endpoints. Per-tenant usage tracking enabled. 90-day endpoint windows enforced. |
| GA | Full lifecycle management. 180-day version deprecation. Deprecation dashboard for support team. Automated tenant notification emails. |

---

## 3. Pagination, Filtering, and Sorting Conventions

**Category:** API
**Reversibility:** Irreversible — pagination format is baked into every list endpoint response shape. Changing from cursor-based to offset-based (or vice versa) breaks all client pagination loops.

### Decision

Cursor-based pagination using opaque base64-encoded cursors that encode `(sort_field_value, id)`. Standard query parameters: `limit` (1-100, default 25), `cursor` (opaque string), `sort` (field name, default `created_at`), `order` (`asc` or `desc`, default `desc`). Response envelope: `{ data: T[], pagination: { next_cursor: string | null, prev_cursor: string | null, has_more: boolean, limit: number } }`. Filtering supports: exact match (`?status=active`), multi-value OR (`?status=active,paused`), range (`?created_after=2026-01-01`), full-text search (`?q=search+term`), and foreign key filter (`?project_id=prj_xxx`). No field projection — agents need consistent response shapes to parse reliably.

### Rationale

- **O(1) performance**: Keyset pagination (`WHERE (sort_field, id) > (cursor_value, cursor_id)`) uses index scans regardless of page depth. Offset pagination degrades to O(n) as offset increases.
- **Consistency during iteration**: Cursor-based pagination is stable when rows are inserted or deleted during iteration. Offset pagination can skip or duplicate rows.
- **Agent-friendly**: Agents follow `next_cursor` mechanically — no page number arithmetic needed. The `has_more` flag provides a clear termination signal.
- **Opaque cursors preserve flexibility**: Base64 encoding hides the internal format. We can change the underlying keyset columns without breaking client code.
- **No field projection simplifies agent development**: Agents expect consistent shapes. Allowing field selection creates a combinatorial explosion of possible response shapes that complicates agent prompt engineering.

### Alternatives Considered

| Option | Verdict | Reason |
|--------|---------|--------|
| Offset-based (`?page=3&per_page=25`) | Rejected | O(n) performance at depth, inconsistent during concurrent writes, requires total count query |
| Keyset with transparent cursors | Rejected | Exposes internal sort field names and types, coupling clients to schema details |
| GraphQL Relay-style connections | N/A | ctrlpane uses REST. The cursor concept is borrowed from Relay but adapted to REST conventions. |
| Field projection (`?fields=id,title,status`) | Rejected | Inconsistent response shapes break agent parsing. The bandwidth savings are negligible for typical payloads (<5KB). |

### Schema & Code Impact

- New shared schema: `paginationSchema` in `packages/shared/src/pagination.ts` — Zod schemas for request params and response envelope
- Repository pattern: all `list*` methods accept `PaginationParams` and return `PaginatedResult<T>`
- SQL pattern: `WHERE (sort_col, id) > ($cursor_sort, $cursor_id) ORDER BY sort_col, id LIMIT $limit + 1` — fetch limit+1 to detect `has_more`
- Cursor encoding/decoding utilities in `packages/shared/src/cursor.ts`
- Filter parsing middleware in Hono for standard filter params

### Phase Gate

| Phase | Behavior |
|-------|----------|
| Alpha | Full pagination contract implemented. All list endpoints use cursor-based pagination with the standard response envelope. |
| Beta | Same contract. Performance monitoring on keyset queries. Index coverage validation. |
| GA | Same contract. Consider adding `total_count` as opt-in header (`X-Total-Count`) for admin dashboards only — never in default response. |

---

## 4. Event Schema Versioning

**Category:** API
**Reversibility:** Irreversible — event schemas are persisted in the outbox table and consumed by multiple subscribers. Changing the envelope format requires migrating all stored events and updating all consumers simultaneously.

### Decision

CloudEvents-inspired envelope with the following fields: `specversion` (always `"1.0"`), `id` (the outbox event's prefixed ULID, e.g., `obx_01HXYZ...` — maintains consistency with the data-model convention while remaining CloudEvents-compatible), `source` (domain name, e.g., `ctrlpane.tasks`), `type` (dot-separated with version suffix, e.g., `ctrlpane.tasks.task.completed.v1`), `dataschemaversion` (semver of the data payload schema), `tenantid` (tenant UUID), `traceid` (W3C trace ID for correlation), `data` (the domain event payload). Version is embedded in the `type` string. No external schema registry — Zod schemas in `packages/shared/src/events/` are the single source of truth. Evolution rules: adding an optional field keeps the same version; removing, renaming, or retyping a field requires a new version (e.g., `.v2`). During transitions, consumers subscribe with NATS wildcards (`ctrlpane.tasks.task.completed.>`) to receive both versions.

### Rationale

- **Monorepo advantage**: All producers and consumers share the same Zod schemas from `packages/shared`. A registry would add infrastructure without adding value in a monorepo.
- **NATS wildcards enable version routing**: Consumers can subscribe to `ctrlpane.tasks.task.completed.>` to receive all versions, or `ctrlpane.tasks.task.completed.v1` for a specific version. This makes gradual migration seamless.
- **CloudEvents alignment**: Following CloudEvents field naming (`specversion`, `type`, `source`) means future integration with CloudEvents-compatible systems requires no translation.
- **Version in type string is grep-friendly**: Searching for `task.completed.v1` in code instantly reveals all producers and consumers of that specific version.
- **Zod schemas provide runtime validation**: Consumers validate incoming events against Zod schemas, catching schema drift immediately rather than silently processing malformed data.

### Alternatives Considered

| Option | Verdict | Reason |
|--------|---------|--------|
| External schema registry (Confluent, Buf) | Rejected | Adds infrastructure dependency for a monorepo where all code shares the same package. Overkill until there are external event consumers. |
| Version in separate header/field | Rejected | Separating version from type complicates NATS subject routing. Version-in-type enables native NATS subject filtering. |
| Avro/Protobuf schemas | Rejected | Binary formats add compilation steps incompatible with Bun's TypeScript-first workflow. JSON + Zod is sufficient for expected throughput. |
| No versioning (always additive) | Rejected | Works until the first required breaking change, then causes cascading consumer failures. |

### Schema & Code Impact

- Outbox table `payload` column stores the full CloudEvents envelope as JSONB
- Event type strings gain `.v1` suffix: `ctrlpane.tasks.task.completed.v1`
- NATS subjects mirror event types: `ctrlpane.tasks.task.completed.v1`
- New directory: `packages/shared/src/events/` with per-domain event Zod schemas
- Event envelope Zod schema: `packages/shared/src/events/envelope.ts`
- Outbox publisher serializes envelope; consumer deserializes and validates

### Phase Gate

| Phase | Behavior |
|-------|----------|
| Alpha | All events at v1. Full envelope format from day one. Zod schemas for every event type. |
| Beta | Version evolution process documented. First v2 events expected as API matures. Wildcard subscriptions for transition periods. |
| GA | Event catalog published. External consumers (webhooks) receive CloudEvents-formatted payloads. Schema compatibility checks in CI. |

---

## 5. Idempotency Key Design

**Category:** API
**Reversibility:** Irreversible — idempotency key semantics are a contract with every API client. Changing the key scope, TTL, or fingerprinting algorithm after clients depend on replay behavior causes silent data corruption or unexpected 409s.

### Decision

IETF `Idempotency-Key` header (draft-ietf-httpapi-idempotency-key-header-07). Client-generated, recommended UUIDv4. Tenant-scoped Redis storage at key `idem:{tenant_id}:{key}`. Request fingerprint computed as SHA-256 of `method + path + body`. Behavior: same key + same fingerprint = replay cached response (status code + headers + body). Same key + different fingerprint = `409 Conflict`. TTL is 24 hours. Processing flow: `SET NX` for atomic claim, status transitions `processing` → `completed`, key deleted on processing failure (allowing retry). Required on all POST and PATCH endpoints (opt-in via `idempotent()` middleware). PUT and DELETE are inherently idempotent but optionally support the header. MCP tools auto-generate idempotency keys per operation, ensuring agent retries are safe.

### Rationale

- **IETF standard alignment**: Following draft-07 means clients familiar with Stripe or other IETF-adopting APIs already know the semantics.
- **Tenant scoping prevents cross-tenant collision**: Key `idem:{tenant_id}:{key}` ensures tenant A's idempotency key never collides with tenant B's, even if both use the same UUID.
- **SHA-256 fingerprint detects misuse**: If a client reuses a key with different request content, the 409 response prevents silent data inconsistency.
- **24h TTL balances safety and storage**: Long enough for retry storms (agents may retry hours later). Short enough that Redis memory stays bounded (~1KB per entry).
- **Delete-on-failure enables retry**: If processing fails, the key is removed so the client can retry with the same key. This avoids permanent "stuck" keys.

### Alternatives Considered

| Option | Verdict | Reason |
|--------|---------|--------|
| Server-generated idempotency tokens | Rejected | Requires an extra round-trip to obtain a token before the actual request. Adds latency and complexity. |
| Database-backed idempotency (Postgres) | Rejected | Redis NX is atomic and faster. Postgres would require a dedicated table and advisory locks. |
| No fingerprint validation | Rejected | Allows silent misuse where different requests accidentally share a key, causing data loss. |
| Longer TTL (7 days) | Rejected | Increases Redis memory footprint 7x for marginal safety improvement. 24h covers all realistic retry scenarios. |
| Global (non-tenant-scoped) keys | Rejected | Creates a global namespace collision risk and prevents per-tenant rate limiting on key creation. |

### Schema & Code Impact

- New Hono middleware: `idempotent()` wrapping POST/PATCH handlers
- New Redis namespace: `idem:{tenant_id}:{key}` with 24h TTL
- Cached response structure: `{ status: number, headers: Record<string, string>, body: string }`
- Approximate storage: ~1KB per cached response
- MCP tool wrapper: auto-generates `Idempotency-Key: <uuidv4>` per tool invocation
- Response headers: `Idempotency-Key-Status: hit|miss|processing` for debugging

### Phase Gate

| Phase | Behavior |
|-------|----------|
| Alpha | Implement for all POST/PATCH endpoints. Manual key generation by clients. Redis storage with 24h TTL. |
| Beta | MCP auto-generation of idempotency keys. Monitoring dashboard for hit/miss ratios. Alert on high 409 rates. |
| GA | Per-tenant metrics on idempotency key usage. Rate limiting on key creation to prevent abuse. Documentation for SDK integration. |

---

## 6. CSRF Mitigation

**Category:** Security
**Reversibility:** Irreversible — security architecture decisions set the threat model baseline. Adding CSRF tokens later requires coordinating frontend, backend, and all API clients simultaneously.

### Decision

`SameSite=Strict` on the refresh token cookie is sufficient. Add Origin header validation as defense-in-depth (~15 lines of Hono middleware). No Double Submit Cookie pattern. No Synchronizer Token pattern. No CSRF tokens in forms or headers. The access token is stored in memory only (not a cookie), so it cannot be sent by cross-origin requests. The refresh token uses `SameSite=Strict; HttpOnly; Secure; Path=/api/v1/auth/refresh`. CORS is locked to `ctrlpane.com` and `localhost:3001`. MCP and API-key authentication use `Authorization` headers, which are immune to CSRF by design.

### Rationale

- **Access token is not in a cookie**: CSRF exploits automatic cookie attachment. Since the access token lives in JavaScript memory and is sent via `Authorization` header, cross-origin requests cannot include it.
- **Refresh token is SameSite=Strict**: The browser will not send the refresh cookie on any cross-origin request, including top-level navigations. This is the strongest SameSite policy.
- **Origin header validation is cheap insurance**: A 15-line middleware that rejects requests where `Origin` does not match the allowed list adds defense-in-depth at zero complexity cost.
- **Double Submit Cookie and Synchronizer Token add complexity for a mitigated threat**: These patterns are designed for cookie-based session authentication. They are unnecessary when the authentication token is not in a cookie.
- **CORS is the primary defense for API endpoints**: Browsers enforce CORS preflight for non-simple requests. The API only allows requests from known origins.

### Alternatives Considered

| Option | Verdict | Reason |
|--------|---------|--------|
| Double Submit Cookie | Rejected | Adds frontend complexity (reading cookie, attaching header) for a threat already mitigated by non-cookie auth. |
| Synchronizer Token (server-side) | Rejected | Requires server-side session state for token storage. Adds latency and state management for a mitigated threat. |
| SameSite=Lax (instead of Strict) | Rejected | Lax allows cookies on top-level GET navigations. Strict is more secure and the refresh endpoint only uses POST. |
| No Origin check (rely solely on SameSite) | Rejected | Origin check is trivial to implement and provides defense-in-depth against browser bugs in SameSite enforcement. |

### Schema & Code Impact

- New Hono middleware: `csrfOriginCheck()` — validates `Origin` header against allowlist
- Refresh token cookie attributes: `SameSite=Strict; HttpOnly; Secure; Path=/api/v1/auth/refresh`
- Zero schema changes
- Documentation: CSRF subsection in security architecture docs

### Phase Gate

| Phase | Behavior |
|-------|----------|
| Alpha | Origin check middleware active. SameSite=Strict on refresh cookie. No additional CSRF tokens needed. |
| Beta | Same. Security audit validates CSRF posture. |
| GA | Same. Penetration test scope includes CSRF vectors. |

---

## 7. SSRF Prevention

**Category:** Security
**Reversibility:** Irreversible — the outbound HTTP abstraction becomes a dependency of every integration. Changing the trust model after integrations are built requires auditing and updating all outbound call sites.

### Decision

`SafeHttpClient` as an Effect `Context.Tag` service wrapping all outbound HTTP fetches. Three defense layers: (1) **Provider allowlist** for known integrations — Jira: `*.atlassian.net`, Slack: `slack.com`, Google: `*.googleapis.com`, Telegram: `api.telegram.org`. (2) **URL validation** — HTTPS only, block private IP ranges (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `127.0.0.0/8`, `169.254.0.0/16`, `::1`, `fc00::/7`). (3) **DNS resolution pinning** — resolve hostname to IP, validate IP is not private, then connect to the resolved IP directly (preventing DNS rebinding). Architecture enforcement: dependency-cruiser rule and convention test block raw `fetch()` usage in domain code — all outbound HTTP must go through `SafeHttpClient`.

### Rationale

- **Integration domains are the SSRF attack surface**: Webhook URLs, Jira callback URLs, and custom integration endpoints are user-supplied. Without validation, an attacker can probe internal services.
- **DNS rebinding bypasses URL-only validation**: A hostname can resolve to a public IP during validation and a private IP during connection. DNS pinning (resolve-then-validate-then-connect) closes this gap.
- **Effect Context.Tag makes it enforceable**: Domain code declares `SafeHttpClient` as a dependency. The compiler ensures it is provided. Raw `fetch` usage is caught by architecture tests.
- **Allowlist + blocklist is defense-in-depth**: Known integrations are allowlisted (positive security). Unknown URLs are validated against the blocklist (negative security). Both layers must pass.
- **HTTPS-only prevents credential leakage**: HTTP connections can be intercepted. Requiring HTTPS for all outbound calls prevents accidental credential exposure in integration payloads.

### Alternatives Considered

| Option | Verdict | Reason |
|--------|---------|--------|
| Network-level egress firewall only | Deferred to GA | Requires infrastructure (iptables/nftables) that adds operational complexity. Application-level controls are sufficient for alpha/beta. |
| No DNS pinning (URL validation only) | Rejected | Vulnerable to DNS rebinding attacks. Industry best practice (OWASP) recommends resolution pinning. |
| Allow HTTP for localhost development | Rejected | Creates a code path that could leak into production. Use HTTPS everywhere, including local dev (mkcert). |
| Per-request allowlist prompt | Rejected | Breaks agent automation. Agents need to make integration calls without human approval for non-critical actions. |

### Schema & Code Impact

- New Context.Tag service: `SafeHttpClient` in `packages/shared/src/http/safe-client.ts`
- Provider allowlist configuration: `packages/shared/src/http/providers.ts`
- IP validation utility: `packages/shared/src/http/ip-validator.ts`
- DNS resolution pinning: `packages/shared/src/http/dns-pinner.ts`
- dependency-cruiser rule: ban `fetch` import in `packages/*/src/domain/` and `packages/*/src/application/`
- Convention test: ts-morph test scanning for raw `fetch()` calls outside `SafeHttpClient`
- All integration adapters (`packages/integrations/src/adapters/`) use `SafeHttpClient`

### Phase Gate

| Phase | Behavior |
|-------|----------|
| Alpha | SafeHttpClient implemented for integrations domain. Provider allowlist for Jira, Slack, Google, Telegram. DNS pinning active. |
| Beta | Custom webhook URL validation through SafeHttpClient. User-supplied URLs undergo full validation chain. Rate limiting on outbound calls per tenant. |
| GA | Network-level egress controls as additional layer. Outbound call audit logging. Anomaly detection on unusual outbound patterns. |

---

## 8. GDPR Right-to-Erasure Cascade

**Category:** Security
**Reversibility:** Irreversible — the erasure model determines foreign key design (nullable vs. non-nullable), sentinel value conventions, and audit log retention policy. Retrofitting erasure into a schema designed without it requires migrating every FK relationship.

### Decision

Event-driven cascade via NATS. The `ErasureCoordinator` service (in the auth domain) orchestrates the process. Flow: user requests erasure → user marked `erasure_pending` → all active sessions invalidated → domain-specific erase commands published to NATS → per-domain consumers handle their data → completion events published → auth domain anonymizes user record to sentinel values. Key rules: shared resources (tasks, projects, comments) are NOT deleted — `created_by` and `assignee_id` fields are nullified to the sentinel value `usr_DELETED`. Exclusively-owned resources (notification preferences, personal notes, API keys) are hard deleted. Audit logs are pseudonymized (replace `actor_id` with `usr_DELETED_<hash>`) but NOT deleted, citing GDPR Recital 65 exemption for legal obligation retention. Target SLA: 30 days from request to completion. New schema: `erasure_jobs` table (prefix `erj_`) tracking per-domain completion status. New user status enum: `active` | `suspended` | `erasure_pending` | `erased`. Sentinel user row `usr_DELETED` exists in the users table for FK integrity.

### Rationale

- **Event-driven decouples domains**: Each domain knows how to erase its own data. The coordinator only tracks completion, not implementation details. Adding a new domain requires only a new consumer.
- **Shared resources must survive erasure**: Deleting a task because its creator requested erasure would destroy data belonging to the entire team. Nullifying the FK preserves the resource while removing the personal association.
- **Sentinel value maintains FK integrity**: Setting `created_by = NULL` loses the information that a deletion occurred. `usr_DELETED` is a concrete user row that FKs can reference, and UIs can display "[Deleted User]".
- **Audit log pseudonymization satisfies Recital 65**: GDPR allows retention of records necessary for legal compliance. Pseudonymizing (not deleting) audit logs preserves the audit trail while removing personal identifiers.
- **30-day SLA is GDPR-compliant**: Article 17 requires erasure "without undue delay" which case law interprets as 30 days maximum.

### Alternatives Considered

| Option | Verdict | Reason |
|--------|---------|--------|
| Synchronous cascade (single transaction) | Rejected | Cross-domain transaction would create tight coupling and risk timeout failures on large datasets. |
| Hard delete everything | Rejected | Destroys shared resources (tasks, projects) that belong to the team, not the individual. |
| Soft delete (mark as deleted, keep data) | Rejected | Does not satisfy GDPR right to erasure. Data must be actually removed or anonymized. |
| NULL instead of sentinel for FKs | Rejected | NULL is ambiguous (never set vs. deleted). Sentinel value `usr_DELETED` is explicit and enables UI display logic. |
| Delete audit logs | Rejected | Violates legal obligation retention exemption. Audit logs are required for security incident investigation. |

### Schema & Code Impact

- New table: `erasure_jobs` (`erj_` prefix) with columns: `id`, `tenant_id` (NOT NULL, FK to tenants), `user_id`, `status`, `domains_pending`, `domains_completed`, `requested_at`, `updated_at` (NOT NULL, default now()), `completed_at`
- New column: `users.status` enum (`active`, `suspended`, `erasure_pending`, `erased`)
- Sentinel row: `usr_DELETED` user with status `erased`
- All `created_by` and `assignee_id` FKs must be nullable (ON DELETE SET NULL or application-managed)
- 7 domain erasure consumers (one per domain: tasks, agents, integrations, notifications, gamification, goals, sprints)
- New event types: `erasure.requested.v1`, `erasure.domain.completed.v1`, `erasure.completed.v1`
- ErasureCoordinator service in auth domain
- Audit log pseudonymization function

### Phase Gate

| Phase | Behavior |
|-------|----------|
| Alpha | Schema supports erasure from day one: `users.status` field present, all FKs nullable, sentinel user row exists. No erasure flow implemented (solo dev's own data). |
| Beta | Full erasure cascade implemented. ErasureCoordinator active. 30-day SLA enforced. Employee data subject to erasure requests. |
| GA | GDPR compliance documentation published. Data Protection Impact Assessment completed. Erasure SLA monitoring and alerting. |

---

## 9. Data Consistency Model

**Category:** Resilience
**Reversibility:** Irreversible — the consistency model determines transaction boundaries, event flow design, and UI optimistic update strategy. Changing from eventual to strong consistency for a cross-domain flow requires redesigning the entire event pipeline.

### Decision

Three-tier consistency model, documented explicitly for every data flow. **Tier 1 (Strong):** Within a single domain, single Postgres transaction — the outbox pattern guarantees atomic business write + event publish. Used for: auth token issuance, refresh token rotation, lease acquisition, audit log writes, idempotency key checks. **Tier 2 (Causal / Read-your-writes):** UI optimistic updates + Centrifugo real-time push. The user sees their own write immediately (optimistic), and the server confirms within ~1 second via WebSocket push. Used for: task updates, status changes, any user-initiated mutation displayed in the UI. **Tier 3 (Eventual):** Cross-domain side effects via outbox → NATS. Typical latency 100ms–30s. Used for: goal progress aggregation, notification delivery, XP/gamification calculation, Jira sync, cross-domain projections. Failure recovery includes: dead letter queue alerting, manual replay API endpoint, scheduled reconciliation jobs, and full audit trail for debugging.

### Rationale

- **Explicit tiers prevent ambiguity**: Without documenting which tier applies where, developers make inconsistent assumptions. Explicit tiers create a shared vocabulary ("this is a Tier 3 flow").
- **Strong consistency where correctness matters**: Auth, leases, and idempotency cannot tolerate eventual consistency. A double-issued token or double-claimed lease is a security/correctness bug.
- **Eventual consistency where latency is acceptable**: Goal progress does not need to update in the same transaction as a task completion. Decoupling enables independent scaling and failure isolation.
- **Causal consistency satisfies user expectations**: Users expect to see their own writes immediately. Optimistic updates + WebSocket confirmation achieves this without cross-domain strong consistency.
- **Reconciliation jobs heal drift**: Eventual consistency means temporary inconsistency is expected. Reconciliation jobs detect and correct drift, turning "eventually consistent" into a guarantee rather than a hope.

### Alternatives Considered

| Option | Verdict | Reason |
|--------|---------|--------|
| Strong consistency everywhere (distributed transactions) | Rejected | Requires 2PC or Saga orchestration across domains. Adds latency, complexity, and tight coupling for minimal benefit on non-critical flows. |
| Eventual consistency everywhere | Rejected | Auth and lease operations require strong consistency. Eventual consistency for token issuance creates security vulnerabilities. |
| CQRS with separate read models | Deferred | Appropriate when read and write patterns diverge significantly. Premature for alpha where the data model is still evolving. |
| No explicit model (ad-hoc per feature) | Rejected | Leads to inconsistent assumptions and hard-to-debug consistency bugs. The model must be documented up front. |

### Schema & Code Impact

- New documentation: `docs/architecture/consistency-model.md` — tier definitions, flow classification table, failure recovery procedures
- JSDoc annotations on `EffectEventBus` methods indicating consistency tier
- Reconciliation job skeletons per consuming domain (e.g., `GoalProgressReconciler`, `GamificationReconciler`)
- Dead letter queue monitoring: alerts when DLQ depth > 0
- Manual replay API endpoint: `POST /api/v1/admin/events/{id}/replay`
- Audit trail enrichment: consistency tier tag on event processing logs

### Phase Gate

| Phase | Behavior |
|-------|----------|
| Alpha | Tier 1 (strong) and Tier 3 (eventual) implemented. Outbox pattern active. Reconciliation job skeletons in place. |
| Beta | Tier 2 (causal) via Centrifugo. Reconciliation jobs running on schedule. Dead letter alerting active. |
| GA | SLAs on eventual consistency latency (p99 < 30s). Reconciliation job metrics and dashboards. Consistency tier documented per API endpoint. |

---

## 10. Retry / Backoff / Jitter Patterns

**Category:** Resilience
**Reversibility:** Irreversible — retry policies are embedded in every service integration point. Changing retry semantics after deployment risks retry storms or silent data loss during the transition.

### Decision

Three retry policy tiers using `Effect.retry` + `Schedule` combinators, all with full jitter (`Schedule.jittered`). **Fast** (50ms base, 3 attempts, 1s cap): Redis operations, Centrifugo token refresh, in-memory cache misses. **Standard** (200ms base, 5 attempts, 30s cap): Outbox → NATS publishing, NATS consumer processing, Drizzle transient errors (connection reset, deadlock). **Slow** (1s base, 8 attempts, 5min cap): Integration HTTP calls (Jira, Slack, Google), webhook delivery, email sending. Non-retryable errors (validation failures, authentication errors, schema violations, business rule violations) bypass retry via the `while` predicate on `Effect.retry`. All retry attempts are logged with attempt number, delay, and error classification.

### Rationale

- **Three tiers match three latency profiles**: In-process operations (Redis) should retry fast. Network operations (NATS) need moderate delays. External APIs (Jira) need long delays because their outages last minutes, not milliseconds.
- **Full jitter prevents thundering herd**: Without jitter, all retrying clients synchronize their retry attempts, creating periodic load spikes. Full jitter (`Math.random() * delay`) distributes retries uniformly.
- **Effect Schedule composability**: Effect's `Schedule` combinators allow expressing `exponentialBackoff | jitter | maxAttempts | maxDuration` as a single composed value. No custom retry loop needed.
- **Non-retryable classification prevents waste**: Retrying a 400 Bad Request or 401 Unauthorized wastes resources and delays error propagation. The `while` predicate short-circuits on these.
- **Caps prevent infinite wait**: Without caps, exponential backoff grows unbounded. A 5-minute cap on slow retries means the worst case for an integration call is ~40 minutes total (8 attempts), which is acceptable.

### Alternatives Considered

| Option | Verdict | Reason |
|--------|---------|--------|
| Single retry policy for everything | Rejected | A 1s base delay on Redis retries wastes 3s on transient failures. A 50ms base on Jira calls causes unnecessary rapid-fire requests during outages. |
| No jitter (deterministic backoff) | Rejected | Causes thundering herd on recovery. Industry best practice (AWS, Google) mandates jitter. |
| Linear backoff | Rejected | Exponential backoff reduces load on failing services more effectively. Linear backoff applies too much pressure during extended outages. |
| Circuit breaker instead of retry | Complementary | Circuit breakers (Decision #12) complement retries. Retries handle transient failures; circuit breakers handle sustained failures. Both are needed. |

### Schema & Code Impact

- New shared module: `packages/shared/src/retry.ts` — exports `RetryPolicy.fast`, `RetryPolicy.standard`, `RetryPolicy.slow`
- Each policy is an `Effect.Schedule` value composed with `Schedule.exponential`, `Schedule.jittered`, `Schedule.recurs`, `Schedule.upTo`
- Non-retryable error type: `NonRetryableError` tagged union in `packages/shared/src/errors.ts`
- Applied at call sites: `Effect.retry(operation, RetryPolicy.standard)` or `pipe(operation, Effect.retry({ schedule: RetryPolicy.slow, while: isRetryable }))`
- Retry attempt logging: structured log with `{ attempt, delay_ms, error_type, operation }` fields

### Phase Gate

| Phase | Behavior |
|-------|----------|
| Alpha | All three retry tiers implemented. Applied to all Effect service operations. Retry logging active. |
| Beta | Retry metrics exported to SigNoz. Alert on retry rate > threshold per operation. Tune base delays based on observed p50/p99 latencies. |
| GA | Per-tenant retry budget tracking. Adaptive retry policies based on real-time error rates. |

---

## 11. Backpressure Mechanisms

**Category:** Resilience
**Reversibility:** Irreversible — backpressure semantics are baked into the outbox poller and NATS consumer design. Switching from pull-based to push-based consumers requires redesigning the entire message consumption layer.

### Decision

Pull-based NATS consumers with explicit flow control. **Outbox poller**: 50-event batch size, 200ms polling interval, `Semaphore(10)` limiting concurrent NATS publishes, 1-second backoff on empty batch, circuit breaker opens after 5 consecutive NATS publish failures. **NATS consumers**: pull-based `fetch` with batch size 20, `max_ack_pending: 50` (primary backpressure lever — consumer cannot have more than 50 unacknowledged messages), `ack_wait: 30s` (message redelivered if not acknowledged within 30s), `idle_heartbeat: 15s` (detect stalled consumers). Overload signals triggering alerts: outbox pending count > 500, consumer lag > 100 messages, individual message processing time approaching `ack_wait`.

### Rationale

- **Pull-based prevents consumer overwhelm**: Push-based consumers receive messages at the rate the server sends them. Pull-based consumers request messages only when ready, providing natural backpressure.
- **`max_ack_pending` is the primary lever**: This single setting caps the number of in-flight messages per consumer. Reducing it immediately reduces consumer load. Increasing it allows higher throughput. It is the simplest and most effective backpressure control.
- **Semaphore on outbox poller prevents NATS flooding**: Without concurrency limiting, the outbox poller could publish hundreds of events simultaneously during a burst, overwhelming NATS and downstream consumers.
- **Circuit breaker prevents cascade during NATS outage**: If NATS is down, the outbox poller should stop trying after 5 failures rather than filling up logs and wasting CPU on doomed publishes. Events remain safely in the outbox table.
- **Empty-batch backoff reduces idle polling**: When the outbox is empty, increasing the poll interval from 200ms to 1s reduces unnecessary database queries by 5x.

### Alternatives Considered

| Option | Verdict | Reason |
|--------|---------|--------|
| Push-based NATS consumers | Rejected | No consumer-side flow control. A burst of events can overwhelm a consumer, causing cascading ack timeouts and redeliveries. |
| Rate limiting instead of backpressure | Complementary | Rate limiting caps throughput. Backpressure adapts to capacity. Both are useful but backpressure is the primary mechanism. |
| Queue depth auto-scaling | Deferred | Appropriate for multi-instance deployments. Single-process alpha cannot scale horizontally. Vertical backpressure is sufficient. |
| No outbox batching (single-event polling) | Rejected | Creates excessive database round-trips. Batch polling amortizes query overhead across multiple events. |

### Schema & Code Impact

- Configuration constants in `packages/shared/src/constants.ts`: `OUTBOX_BATCH_SIZE`, `OUTBOX_POLL_INTERVAL_MS`, `OUTBOX_PUBLISH_CONCURRENCY`, `NATS_FETCH_BATCH`, `NATS_MAX_ACK_PENDING`, `NATS_ACK_WAIT_S`
- Outbox poller: `packages/shared/src/outbox/poller.ts` — uses `Effect.Semaphore` for publish concurrency
- NATS consumer wrapper: `packages/shared/src/nats/consumer.ts` — enforces pull-based model with configurable batch/ack settings
- Metrics: `outbox_pending_count`, `consumer_lag`, `processing_duration_ms` exported to SigNoz
- Alert thresholds defined in monitoring configuration

### Phase Gate

| Phase | Behavior |
|-------|----------|
| Alpha | Implement with default constants. Pull-based NATS consumers. Semaphore-limited outbox poller. Basic overload logging. |
| Beta | Tune constants based on observed load patterns. Add SigNoz dashboards for backpressure metrics. Configure alerts on overload signals. |
| GA | Dynamic tuning based on real-time metrics. Auto-adjusting batch sizes within configured bounds. |

---

## 12. Bulkhead / Failure Domain Isolation

**Category:** Resilience
**Reversibility:** Irreversible — pool segmentation requires configuring separate database connection pools at startup. The Semaphore-per-domain pattern becomes part of the Effect Layer composition. Changing isolation boundaries after deployment requires restructuring the Layer dependency graph.

### Decision

> **Note:** Domain groupings and circuit breaker thresholds align with existing ADR-007. Where values differ, ADR-007 is authoritative until explicitly superseded.

Three isolation mechanisms. **(1) Effect Semaphore pools** per domain category: `core` (auth, tasks) = 20 permits, `agents` = 15 permits, `background` (notifications, gamification, integrations) = 10 permits. Each request acquires a permit with 10-second timeout; if unavailable, the request fails fast with 503. **(2) Postgres connection pool segmentation**: `core` = 15 connections, `agents` = 5 connections, `background` = 5 connections (total = 25, within Postgres default of 100). Each category gets its own Drizzle instance with its own connection pool. **(3) Circuit breakers** per external dependency: NATS (5 failures → open, 30s half-open), Redis (3 failures → open, 10s half-open), Centrifugo (5 failures → open, 30s half-open), each integration service (3 failures → open, 60s half-open).

### Rationale

- **Single Bun process by design (ADR-003)**: Without microservice-level isolation, a runaway agent query could exhaust all Postgres connections, blocking auth and task operations. Pool segmentation is the most effective cascade prevention in a monolith.
- **Semaphore pools are lightweight**: Effect Semaphores are in-memory counters with zero allocation overhead. They provide concurrency limiting without the complexity of thread pools or process isolation.
- **Pool segmentation prevents the "noisy neighbor" problem**: If agent sessions consume all database connections, core operations (auth, task CRUD) continue unaffected because they use a separate pool.
- **Circuit breakers prevent cascade from external failures**: If NATS goes down, the circuit breaker stops all NATS operations immediately rather than letting every request timeout individually (potentially exhausting Semaphore permits).
- **10-second Semaphore timeout enables fast failure**: Waiting longer than 10 seconds for a permit means the system is overloaded. Failing fast with 503 allows clients to retry or degrade gracefully.

### Alternatives Considered

| Option | Verdict | Reason |
|--------|---------|--------|
| Single shared connection pool | Rejected | No isolation. A single domain's load spike can starve all other domains of database connections. |
| Microservice decomposition | Rejected | Overkill for solo-dev alpha. Adds deployment, networking, and operational complexity. Monolith with bulkheads achieves similar isolation at lower cost. |
| OS-level process isolation (worker_threads) | Rejected | Bun's worker_threads support is immature. Effect's Fiber model provides sufficient concurrency isolation within a single process. |
| No circuit breakers (rely on retries only) | Rejected | Retries without circuit breakers cause cascading timeouts. Each retry attempt holds a Semaphore permit, potentially exhausting the pool. |

### Schema & Code Impact

- Drizzle pool configuration: three Drizzle instances (`coreDrizzle`, `agentsDrizzle`, `backgroundDrizzle`) with separate `pg.Pool` configurations
- Effect Layer composition: each domain's Layer includes its category's Semaphore
- Circuit breaker implementation: `packages/shared/src/circuit-breaker.ts` using Effect Ref for state management
- Service dependencies: NATS publisher, Redis client, Centrifugo client each wrapped with circuit breaker
- Health endpoint reports pool utilization and circuit breaker states
- Configuration: pool sizes in environment variables for tunability

### Phase Gate

| Phase | Behavior |
|-------|----------|
| Alpha | Postgres pool segmentation (three pools). Basic Semaphore limits per domain category. Circuit breaker skeletons with conservative thresholds. |
| Beta | Circuit breakers fully active. Pool utilization metrics in SigNoz. Alert on pool exhaustion (>80% utilization). Tune Semaphore limits based on load testing. |
| GA | Dynamic Semaphore limit adjustment based on real-time metrics. Circuit breaker dashboard. Per-tenant resource quota enforcement. |

---

## 13. SPOF Acceptance Register

**Category:** Resilience
**Reversibility:** Irreversible — the register format becomes the reference for operational runbooks, monitoring configuration, and upgrade planning. Changing the format after teams depend on it requires migrating all operational documentation.

### Decision

YAML-based register at `docs/operations/spof-register.yaml`. Six documented Single Points of Failure for alpha: Mac Studio hardware, Cloudflare tunnel, PostgreSQL (single instance), Bun API process (single instance), Redis (single instance), NATS JetStream (single instance). Each entry includes: `description`, `blast_radius` (what breaks when this fails), `probability` (1-5 scale), `impact` (1-5 scale), `risk_score` (probability x impact), `compensating_controls` (what mitigates the risk today), `recovery_procedure` (step-by-step restore), `upgrade_trigger` (quantitative threshold, e.g., "when MAU > 50 or revenue > $500/mo"). Quarterly review cadence with date tracking.

### Rationale

- **Explicit acceptance prevents surprise**: Solo-dev alpha has inherent SPOFs. Documenting them explicitly (rather than pretending they do not exist) enables informed risk acceptance and planned mitigation.
- **Quantitative upgrade triggers prevent boiling-frog syndrome**: "When MAU > 50" is actionable. "When we feel like it" is not. Triggers create automatic review points.
- **YAML is machine-parseable**: The register can be consumed by monitoring configuration, CI checks (validate all entries have recovery procedures), and dashboard generators.
- **Recovery procedures are the most valuable artifact**: When the Mac Studio crashes at 2 AM, a step-by-step recovery procedure is worth more than any architecture diagram.
- **Quarterly review prevents staleness**: Risk profiles change as usage grows. Quarterly review ensures upgrade triggers are evaluated against current metrics.

### Alternatives Considered

| Option | Verdict | Reason |
|--------|---------|--------|
| No register (accept risk implicitly) | Rejected | Implicit risk acceptance leads to surprise outages with no recovery plan. |
| Markdown-based register | Rejected | Not machine-parseable. Cannot be consumed by CI or monitoring tools. |
| Full HA from day one | Rejected | Over-engineering for solo-dev alpha. The cost of HA infrastructure exceeds the cost of occasional downtime at this scale. |
| Risk register in external tool (Notion, Jira) | Rejected | Must live in the repo for version control, CI integration, and co-location with recovery scripts. |

### Schema & Code Impact

- New file: `docs/operations/spof-register.yaml`
- New directory: `docs/operations/`
- No code changes — documentation only
- Future: CI validation that all entries have non-empty `recovery_procedure` and `upgrade_trigger`
- Future: monitoring configuration generated from register entries

### Phase Gate

| Phase | Behavior |
|-------|----------|
| Alpha | Initial register with 6 SPOFs. Recovery procedures tested manually. Quarterly review schedule established. |
| Beta | Review triggers evaluated against beta metrics. Add new SPOFs as architecture evolves. Recovery procedures automated where possible. |
| GA | Mitigation implementations for high-risk SPOFs (e.g., Postgres replication). Register drives SLA commitments. Automated failover for critical services. |

---

## 14. Deployment & Rollback Strategy

> **Note:** This decision has been superseded by [ADR-008 CI/CD Deployment](../../decisions/ADR-008-cicd-deployment.md) and the [CI/CD Design spec](../../architecture/cicd-design.md). Production now uses a two-machine topology (Mac Studio dev + Kali production) with systemd, GitHub Actions, and Changesets versioning. The expand/contract migration pattern described here remains valid — it is now executed by the CI/CD pipeline instead of a manual script.

**Category:** Resilience
**Reversibility:** Irreversible — the deployment model determines process management, migration strategy, and rollback capability. Switching from launchd to containers or from git-based deploys to image-based deploys requires rearchitecting the entire deployment pipeline.

### Decision

`launchd` as the process manager (native macOS, `KeepAlive`, boot-time startup). Three-phase deployment model: **Expand** — run database migration via `ctrlpane_migrator` (separate Postgres user with DDL permissions). **Deploy** — `git checkout v{tag} && bun install && launchctl kickstart -k system/com.ctrlpane.api` + health check + smoke test. **Contract** — run cleanup migration (drop old columns, remove deprecated tables) days or weeks after deploy is confirmed stable. Rollback: `git checkout v{prev} && bun install && launchctl kickstart -k system/com.ctrlpane.api` (sub-1-minute). Deploy orchestrated by `scripts/deploy.sh [expand|deploy|contract|rollback]` with automatic rollback if health check fails within 30 seconds. Backing services (Postgres, Redis, NATS, Centrifugo, SigNoz) run in Docker Compose.

### Rationale

- **launchd is native macOS**: No additional process manager needed. `KeepAlive` restarts the process on crash. `RunAtLoad` starts on boot. Zero-dependency process management.
- **Three-phase deploy enables safe migrations**: Expand-first means the database schema is always forward-compatible. If the deploy fails, the old code still works with the expanded schema. Contract-later means destructive schema changes (drops) are deferred until the new code is confirmed stable.
- **Git tags are the artifact**: In a single-server deployment, the git repository IS the artifact store. Tags provide immutable, auditable release markers. No container registry needed.
- **Sub-1-minute rollback**: `git checkout + bun install + process restart` takes seconds. No image pulls, no container orchestration. This is the fastest possible rollback for a single-server deployment.
- **Docker Compose for backing services**: Postgres, Redis, NATS, Centrifugo, and SigNoz are infrastructure, not application code. Docker Compose provides reproducible, version-pinned infrastructure without contaminating the host system.

### Alternatives Considered

| Option | Verdict | Reason |
|--------|---------|--------|
| Docker/container-based deployment | Rejected for alpha | Adds image build, registry, and orchestration complexity. A single Bun process on bare metal is simpler and faster to deploy/rollback. |
| PM2 or systemd | Rejected | PM2 is Node-specific and adds a dependency. systemd is Linux-only. launchd is the native macOS solution. |
| Blue-green deployment | Deferred to GA | Requires two full environments. Overkill for single-server alpha. Three-phase expand/deploy/contract achieves similar safety. |
| Database migration in application startup | Rejected | Couples migration to application lifecycle. Separate migrator user with DDL permissions follows principle of least privilege. |

### Schema & Code Impact

- New file: `com.ctrlpane.api.plist` (launchd service definition)
- New script: `scripts/deploy.sh` with subcommands: `expand`, `deploy`, `contract`, `rollback`
- New script: `scripts/health-check.sh` — HTTP health endpoint check with timeout
- New script: `scripts/smoke-test.sh` — critical path validation post-deploy
- Git tagging convention: `v{semver}` (e.g., `v0.1.0`)
- Docker Compose file: `docker-compose.yml` for backing services with port prefix 3 convention
- Separate Postgres user: `ctrlpane_migrator` with CREATE/ALTER/DROP permissions

### Phase Gate

| Phase | Behavior |
|-------|----------|
| Alpha | Full deploy pipeline implemented. launchd process management. Three-phase deploy with automatic rollback. Manual smoke tests. |
| Beta | Automated smoke test suite. Deploy notifications (Telegram/Slack). Deploy audit log. Rollback metrics tracking. |
| GA | Canary deployment (percentage-based traffic splitting). Automated rollback on error rate spike. Deploy approval workflow for production. |

---

## 15. OpenTelemetry Stack

**Category:** Observability
**Reversibility:** Irreversible — the telemetry SDK is integrated into the Effect Layer composition. Changing the exporter protocol (OTLP/HTTP vs gRPC) or backend (SigNoz vs Grafana) requires updating the telemetry Layer in every service entry point.

### Decision

`@effect/opentelemetry` + `@opentelemetry/sdk-trace-base` + `@opentelemetry/exporter-trace-otlp-http` exporting to self-hosted SigNoz via OTLP/HTTP. SigNoz provides unified traces, metrics, and logs in a single UI backed by ClickHouse. Ports follow the prefix-3 convention: SigNoz UI at `39080`, OTel collector at `34317` (gRPC, unused) and `34318` (HTTP, primary). Effect spans are automatically exported as OTel spans via `@effect/opentelemetry`'s `TracerProvider` integration.

### Rationale

- **Effect has first-class OTel integration**: `@effect/opentelemetry` automatically converts Effect spans to OTel spans. No manual instrumentation needed for Effect-based code.
- **SigNoz is simpler than the Grafana stack**: Grafana requires Tempo (traces) + Prometheus (metrics) + Loki (logs) + Grafana (UI) = 4+ services. SigNoz provides all three signal types in one service backed by ClickHouse.
- **OTLP/HTTP over gRPC**: gRPC requires protobuf compilation which is problematic in Bun's TypeScript-first workflow. OTLP/HTTP uses JSON, which is natively supported.
- **Self-hosted preserves data sovereignty**: Telemetry data contains tenant information and operational details. Self-hosting keeps this data on-premises during alpha/beta.
- **Port prefix convention maintains consistency**: All ctrlpane services use prefix 3 (e.g., API at 33000, Postgres at 35432). SigNoz at 39080 follows the same pattern.

### Alternatives Considered

| Option | Verdict | Reason |
|--------|---------|--------|
| Grafana stack (Tempo + Prometheus + Loki) | Rejected | 4+ services to deploy and maintain. More powerful but overkill for solo-dev alpha. Can migrate to Grafana at GA if needed. |
| Jaeger | Rejected | Traces only, no metrics or logs. Would still need Prometheus + a log aggregator. |
| Cloud-hosted (Datadog, New Relic) | Deferred to GA | Adds cost and data sovereignty concerns. Self-hosted is free and keeps data local. |
| No telemetry (add later) | Rejected | Retroactively instrumenting code is painful. Telemetry from day one provides debugging capability and performance baselines. |
| OTLP/gRPC | Rejected | Requires protobuf compilation. Bun's protobuf support is less mature than Node's. OTLP/HTTP avoids this entirely. |

### Schema & Code Impact

- New packages: `@effect/opentelemetry`, `@opentelemetry/sdk-trace-base`, `@opentelemetry/exporter-trace-otlp-http`, `@opentelemetry/resources`, `@opentelemetry/semantic-conventions`
- New Effect Layer: `TelemetryLive` composing OTel `TracerProvider` with OTLP/HTTP exporter
- Layer composition: `TelemetryLive` included in the main application Layer
- Docker Compose: SigNoz services (signoz-otel-collector, signoz-clickhouse, signoz-query-service, signoz-frontend) at prefix-3 ports
- Environment variables: `OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:34318`

### Phase Gate

| Phase | Behavior |
|-------|----------|
| Alpha | Basic tracing active. All Effect spans exported to SigNoz. Service name and version in resource attributes. HTTP request spans via Hono middleware. |
| Beta | Metrics export (request latency histograms, error rates, queue depths). SigNoz dashboards for key operational metrics. Alert rules for error rate spikes. |
| GA | Custom dashboards per domain. SLA monitoring dashboards. Log correlation with traces. Distributed tracing across all async boundaries. |

---

## 16. Trace Context Propagation

**Category:** Observability
**Reversibility:** Irreversible — trace propagation format is embedded in every inter-service communication boundary (HTTP, outbox, NATS, Centrifugo). Changing the format requires updating all producers and consumers simultaneously.

### Decision

W3C Traceparent (`traceparent` header, format: `00-{trace_id}-{span_id}-{flags}`) as the sole propagation format. Propagation chain: HTTP request → Hono middleware extracts `traceparent` → Effect span created with trace context → outbox INSERT includes `trace_id` column → outbox poller reconstructs `traceparent` header from stored `trace_id` → NATS message published with `traceparent` in NATS headers → NATS consumer extracts `traceparent` and creates child span → Centrifugo envelope includes `trace_id` in metadata for client-side correlation.

### Rationale

- **W3C Traceparent is the OTel default**: `@effect/opentelemetry` uses W3C propagation by default. No additional configuration needed.
- **NATS supports arbitrary headers**: NATS message headers can carry `traceparent` natively, enabling seamless trace propagation across the message bus.
- **Outbox already has `trace_id` column**: The outbox table design (from existing architecture docs) includes a `trace_id` column. This decision documents how it is used for trace reconstruction.
- **Single format eliminates ambiguity**: Supporting multiple propagation formats (B3, Jaeger, X-Ray) adds parsing complexity and format conversion bugs. W3C is sufficient when all components are under our control.
- **End-to-end tracing is the killer feature**: A single trace spanning HTTP → outbox → NATS → consumer → Centrifugo makes debugging cross-domain flows trivial. Without propagation, traces fragment at every async boundary.

### Alternatives Considered

| Option | Verdict | Reason |
|--------|---------|--------|
| B3 propagation (Zipkin format) | Rejected | Legacy format. W3C Traceparent is the industry standard successor. No reason to use B3 in a greenfield project. |
| Multiple formats (W3C + B3) | Rejected | Adds parsing complexity for zero benefit when all components are under our control. |
| No outbox trace propagation | Rejected | Traces would fragment at the outbox boundary. The most common debugging scenario (HTTP → event → consumer) would be invisible. |
| Custom correlation ID instead of W3C | Rejected | Reinventing trace propagation. OTel tooling (SigNoz) natively understands W3C format. Custom IDs would require manual correlation. |

### Schema & Code Impact

- Hono middleware: extract `traceparent` header, create Effect span with trace context
- Outbox INSERT: `trace_id` column populated from current Effect span's trace ID
- Outbox poller: read `trace_id`, reconstruct `traceparent` header (`00-{trace_id}-{new_span_id}-01`), create child span
- NATS publisher: inject `traceparent` into NATS message headers
- NATS consumer wrapper: extract `traceparent` from NATS headers, create child span
- Centrifugo publisher: include `trace_id` in WebSocket message metadata
- Frontend (future): log `trace_id` from Centrifugo messages for client-side correlation

### Phase Gate

| Phase | Behavior |
|-------|----------|
| Alpha | End-to-end trace propagation: HTTP → outbox → NATS → consumer. Full trace visibility in SigNoz. Centrifugo includes trace_id in metadata. |
| Beta | Frontend correlation: client logs include trace_id for support debugging. Trace-based alerting (e.g., alert on traces > 5s duration). |
| GA | Trace sampling strategy (head-based, 10% default, 100% for errors). Trace retention policy aligned with data retention decision (#21). |

---

## 17. Agent Action Risk Classification

**Category:** AI
**Reversibility:** Irreversible — the risk classification determines which actions require human approval, which are logged at elevated levels, and which are freely executable. Changing an action's classification after agents are deployed requires updating all agent instruction sets and approval workflows.

### Decision

Static per-action risk classification with three tiers, defined in a TypeScript const map `ACTION_RISK_MAP`. **Normal**: create task, add comment, update task fields, claim task, log time, create note. **Elevated**: bulk operations (bulk update, bulk assign), sprint complete, role assignment, workflow state transition, integration configuration. **Critical**: delete project, modify workflow definition, bulk delete, role escalation (promoting to admin), API key generation, instruction template modification. Classification aligns with the existing `audit_logs.risk_level` column. The risk map is the single source of truth — both the approval workflow (Decision #19) and audit logging reference it.

### Rationale

- **Static classification is predictable**: Agents and humans can reason about risk levels without runtime context. "Delete project is always critical" is simpler and safer than "delete project is critical if the project has > 10 tasks."
- **Three tiers map to three response patterns**: Normal = execute immediately. Elevated = execute + alert. Critical = require approval before execution. Clean mapping reduces implementation complexity.
- **TypeScript const map is type-safe**: The risk map is a `Record<ActionType, RiskLevel>` that TypeScript can verify at compile time. Missing actions cause type errors.
- **Alignment with existing audit_logs.risk_level**: The outbox/audit system already has a `risk_level` field. Using the same classification avoids a second risk taxonomy.
- **Conservative defaults**: When in doubt, classify higher. It is easier to downgrade a risk level than to upgrade one after an incident.

### Alternatives Considered

| Option | Verdict | Reason |
|--------|---------|--------|
| Dynamic risk scoring (ML-based) | Rejected | Requires training data that does not exist yet. Static classification is sufficient for known action types. ML can be layered on later for anomaly detection. |
| Two tiers (normal/critical) | Rejected | No intermediate level for bulk operations that are impactful but not destructive. Three tiers provide better granularity. |
| Per-tenant configurable risk levels | Deferred to GA | Adds complexity for alpha. Start with sensible defaults, allow customization when tenants request it. |
| Risk level in database (runtime configurable) | Deferred to Beta | Alpha uses compile-time const map for simplicity. Beta can add a database overlay for per-tenant customization. |

### Schema & Code Impact

- New module: `packages/shared/src/agent-risk.ts` — exports `ACTION_RISK_MAP`, `RiskLevel` enum, `getActionRisk()` function
- Service layer: before executing agent-requested actions, check `getActionRisk(action)` and route to appropriate handler (execute/alert/approve)
- Audit log enrichment: `risk_level` populated from `ACTION_RISK_MAP` on every agent action
- No new tables — uses existing `audit_logs.risk_level` column

### Phase Gate

| Phase | Behavior |
|-------|----------|
| Alpha | Full risk map implemented. Critical actions require human approval (Decision #19). Elevated actions logged with alert flag. Normal actions execute freely. |
| Beta | Elevated action alerts visible in dashboard. Risk level statistics per agent session. Review and adjust classifications based on usage patterns. |
| GA | Per-tenant risk level customization. ML-based anomaly detection layered on top of static classification. Risk level change requires admin approval. |

---

## 18. Prompt/Instructions Versioning

**Category:** AI
**Reversibility:** Irreversible — the instruction template schema determines how agent behavior is configured, versioned, and audited. Changing the template structure after agents are deployed requires migrating all existing templates and updating all agent session initialization code.

### Decision

Immutable versioned rows in `instruction_templates` table (prefix `itp_`). Columns: `id`, `slug` (e.g., `pm-agent`, `qa-agent`), `version` (integer, auto-incrementing per slug), `role` (agent role enum), `content` (Markdown template with `{{variable}}` placeholders), `variables` (JSONB schema defining available variables and defaults), `status` (`draft` | `published` | `deprecated`), `created_at`, `created_by`. Per-project customization via `instruction_overrides` table (prefix `ito_`). Columns: `id`, `project_id`, `template_id`, `variable_overrides` (JSONB), `extra_sections` (Markdown appended to template), `created_at`, `updated_by`. Resolution: find latest `published` template for the agent's role → merge project overrides (variables + extra sections) → render Markdown with resolved variables. Agent sessions record `instruction_template_id` in session metadata for full auditability.

### Rationale

- **Immutable rows enable rollback**: If a new template version causes agent misbehavior, reverting to the previous version is a single-row status change (`deprecated` → `published`). No data is lost.
- **Per-project overrides separate concerns**: The base template defines agent behavior. Project overrides customize variables (team conventions, domain terminology) without forking the template.
- **`{{variable}}` placeholders are LLM-native**: Markdown with placeholders is the standard format for LLM prompts. No custom DSL needed.
- **Version + slug is the natural key**: `pm-agent@v3` uniquely identifies a template version. Integer versions are simpler than semver for prompt templates.
- **Session → template linkage enables debugging**: When an agent behaves unexpectedly, the exact instruction template version used in that session is immediately retrievable.

### Alternatives Considered

| Option | Verdict | Reason |
|--------|---------|--------|
| Mutable templates (edit in place) | Rejected | No audit trail of what changed. No rollback capability. Agent behavior changes are invisible. |
| File-based templates (in repo) | Rejected | Cannot be customized per-project at runtime. Requires a deploy to update prompts. |
| Template inheritance hierarchy | Rejected | Over-engineered. Two-level (template + project override) is sufficient. Deep inheritance creates hard-to-debug prompt resolution. |
| No per-project overrides | Rejected | Different projects have different conventions (sprint length, estimation scale). Agents need project-specific context. |

### Schema & Code Impact

- New table: `instruction_templates` (`itp_` prefix) in agents domain
- New table: `instruction_overrides` (`ito_` prefix) in agents domain
- New ID prefixes: `itp_` and `ito_` added to ID generation utilities
- New API endpoints: `POST/GET/PATCH /api/v1/instruction-templates`, `POST/GET/PATCH /api/v1/projects/:id/instruction-overrides`
- Agent session initialization: resolve template → apply overrides → render → inject into LLM context
- Session metadata: `instruction_template_id` field for auditability

### Phase Gate

| Phase | Behavior |
|-------|----------|
| Alpha | Default templates per agent role (PM, QA, Dev). No per-project overrides. Template CRUD API. Sessions record template version. |
| Beta | Per-project overrides enabled. Template versioning UI. Override management per project. Template diff viewer. |
| GA | Template marketplace (share templates across tenants). Template analytics (which versions perform best). A/B testing of template variations. |

---

## 19. Human Review Checkpoints (Approval Workflow)

**Category:** AI
**Reversibility:** Irreversible — the approval workflow determines how agents interact with critical operations. The agent's behavior (submit-and-release vs. submit-and-wait) is baked into the agent loop design. Changing it requires redesigning the agent execution model.

### Decision

Async approval via `pending_approvals` table (prefix `apr_`). Flow: agent encounters a critical action → service layer creates approval row with action details, risk level, and requesting agent session → returns `{ status: 'pending_approval', approval_id: 'apr_xxx' }` to agent → agent releases its lease (does NOT block waiting) → notification sent to project admins via Centrifugo + configured channels → human reviews and approves/rejects via UI or API (`POST /api/v1/approvals/:id/approve` or `/reject`) → **system** (not agent) executes the approved action → result event published. Approval expiry: 24 hours → auto-reject with `expired` status. Key invariant: the system executes the approved action, not the agent. The agent never holds a lease while waiting for approval.

### Rationale

- **Agent releases lease**: An agent blocking on approval holds resources (memory, lease, context) for potentially hours. Releasing the lease allows the agent to work on other tasks or shut down cleanly.
- **System executes, not agent**: If the agent executed after approval, it would need to reconstruct its context (potentially hours later). The system has the full action specification in the approval row and can execute it deterministically.
- **24h expiry prevents stale approvals**: A week-old approval for "delete project" may no longer be appropriate. 24h is long enough for business-hours review and short enough to prevent stale actions.
- **Centrifugo notification is real-time**: Admins see approval requests immediately in the UI. No polling required. Additional channels (email, Telegram) ensure visibility even when not in the app.
- **UI + API dual interface**: Admins can approve via the web UI (convenient) or API (automatable). CLI and chatbot integrations can use the API.

### Alternatives Considered

| Option | Verdict | Reason |
|--------|---------|--------|
| Synchronous approval (agent waits) | Rejected | Agent holds lease and resources for potentially hours. Wastes compute and creates timeout issues. |
| Agent executes after approval | Rejected | Agent must reconstruct context after potentially hours. Risk of context drift. System execution is more reliable. |
| No expiry (pending forever) | Rejected | Stale approvals accumulate and may be approved when no longer appropriate. 24h expiry forces timely review. |
| Slack-based approval (reaction-based) | Deferred | Nice UX but adds Slack dependency. Can be layered on top of the API-based approval system later. |
| Dual approval (two admins) | Deferred to GA | Over-engineering for alpha/beta where the admin is the solo dev. Add as an option for enterprise tenants. |

### Schema & Code Impact

- New table: `pending_approvals` (`apr_` prefix) with columns: `id`, `tenant_id`, `project_id`, `agent_session_id`, `action_type`, `action_payload` (JSONB), `risk_level`, `status` (`pending` | `approved` | `rejected` | `expired`), `requested_at`, `decided_at`, `decided_by`, `expiry_at`, `reason` (optional text). Note: `requested_at` serves as `created_at` per convention — a separate `created_at` column is not needed.
- New ID prefix: `apr_`
- New API endpoints: `POST /api/v1/approvals/:id/approve`, `POST /api/v1/approvals/:id/reject`, `GET /api/v1/approvals?status=pending`
- Expiry reaper: scheduled job running every 5 minutes, expiring approvals past their `expiry_at`
- Centrifugo channel: `approvals:{tenant_id}` for real-time approval notifications
- New event types: `approval.requested.v1`, `approval.approved.v1`, `approval.rejected.v1`, `approval.expired.v1`
- Agent loop modification: on `pending_approval` response, release lease and log approval_id

### Phase Gate

| Phase | Behavior |
|-------|----------|
| Alpha | Critical actions require approval. Approve/reject via API. 24h expiry. Basic Centrifugo notification. |
| Beta | Approval dashboard in UI. Configurable: which elevated actions also require approval (per project). Approval audit trail. |
| GA | Dual-approval option for enterprise tenants. Slack/Teams integration for approval notifications. Approval SLA tracking (time-to-decision metrics). |

---

## 20. Sensitive Data Controls for Agent Prompts

**Category:** AI
**Reversibility:** Irreversible — the data classification schema determines which fields agents can access. Changing classification levels after agents have been trained on certain data shapes requires retraining and re-auditing all agent behaviors.

### Decision

Three-layer progressive model. **Layer 1 (Alpha):** Field-level sensitivity classification in TypeScript code. Four levels: `public` (project names, task titles), `internal` (user emails, team membership), `pii` (full names, phone numbers, addresses), `restricted` (API keys, terminal raw output streams, passwords). `restricted` fields are NEVER included in agent context — filtered at the instructions rendering layer before any LLM call. **Layer 2 (Beta):** Configurable redaction rules per tenant via `data_redaction_configs` table (prefix `drc_`). Tenants can promote fields to higher classification (e.g., mark task descriptions as `pii` if they contain customer data). **Layer 3 (GA):** Explicit consent tracking via `data_processing_consents` table (prefix `dpc_`). Users consent to specific data categories being processed by agents. Consent withdrawal triggers field reclassification.

### Rationale

- **Alpha is solo dev's own data**: Field-level classification in code is sufficient when the only data subject is the developer. No tenant configuration UI needed.
- **Infrastructure must exist for beta**: When employees join in beta, their data is subject to classification. The code-level classification from alpha provides the foundation; the database overlay adds configurability.
- **Restricted fields NEVER reach agents**: This is a hard architectural constraint, not a policy. The rendering layer strips restricted fields before composing the LLM prompt. No amount of prompt injection can access restricted data because it is never in the context.
- **Progressive model matches progressive rollout**: Each layer adds capability as the user base and regulatory requirements grow. No layer is wasted — each builds on the previous.
- **Four classification levels provide sufficient granularity**: Public/internal/pii/restricted maps to common data handling tiers in security frameworks (ISO 27001, SOC 2).

### Alternatives Considered

| Option | Verdict | Reason |
|--------|---------|--------|
| No classification (all data accessible to agents) | Rejected | API keys and passwords in agent context is a security vulnerability. Even for solo dev, restricted data must be excluded. |
| Two levels (public/restricted) | Rejected | Insufficient granularity. PII requires different handling than internal data (GDPR implications). |
| Database-only classification (no code-level) | Rejected | Code-level classification provides compile-time guarantees. Database-only is runtime-only and can be misconfigured. |
| Per-field encryption | Deferred | Appropriate for field-level encryption at rest. Orthogonal to agent context filtering. Can be added independently. |

### Schema & Code Impact

- New module: `packages/shared/src/data-classification.ts` — exports `DataClassification` enum, field-level classification registry, `filterForAgent()` function
- Instructions rendering service: calls `filterForAgent()` before composing agent context, stripping `restricted` fields and optionally redacting `pii` fields
- Beta table: `data_redaction_configs` (`drc_` prefix) with columns: `id`, `tenant_id`, `field_path` (e.g., `tasks.description`), `classification_override`, `created_at`, `updated_by`
- GA table: `data_processing_consents` (`dpc_` prefix) with columns: `id`, `user_id`, `tenant_id`, `data_category`, `consent_status` (`granted` | `withdrawn`), `granted_at`, `withdrawn_at`
- New ID prefixes: `drc_`, `dpc_`

### Phase Gate

| Phase | Behavior |
|-------|----------|
| Alpha | Code-level classification. `restricted` fields stripped from all agent contexts. `filterForAgent()` enforced at instructions rendering layer. |
| Beta | `data_redaction_configs` table. Per-tenant classification overrides. Admin UI for managing redaction rules. |
| GA | `data_processing_consents` table. User consent management. Consent withdrawal triggers re-classification. GDPR Article 7 compliance. |

---

## 21. Agent Session Data Retention

**Category:** AI
**Reversibility:** Irreversible — data retention tiers determine table partitioning strategy, archive file format, and cleanup job design. Changing partition boundaries on a live table requires `pg_partman` migration and potential downtime.

### Decision

Tiered retention with Postgres range partitioning (monthly). **Sessions** (`agent_sessions` table): 6 months hot (in Postgres), 6-24 months warm (compressed JSON export to `data/session-archives/`), deleted after 24 months. **Activity** (`agent_activity` table): 3 months hot, 3-12 months warm (compressed export), deleted after 12 months. **Terminal output**: 7 days hot (streamed via Centrifugo, metadata in Postgres), 7-90 days warm (gzip files at `data/terminal-archives/{tenant_id}/{session_id}.gz`), deleted after 90 days. Rationale for terminal output being file-based: volume is 1-10 MB per session, 10-500 MB per day at moderate usage. Storing this in Postgres would bloat the database and degrade query performance. Cleanup is handled by cron jobs (daily for terminal archives, weekly for session/activity archives). `pg_partman` manages monthly partition creation and old partition detachment.

### Rationale

- **Terminal output volume demands file storage**: At 10-500 MB/day, terminal output in Postgres would double database size monthly. File-based storage with gzip compression reduces this to manageable levels.
- **Monthly partitioning enables efficient cleanup**: Dropping a partition is O(1) regardless of row count. DELETE operations on large tables are O(n) and create bloat. Partitioning is the only scalable cleanup strategy.
- **Retroactive partitioning is painful**: Adding partitioning to an existing table requires exclusive locks, data migration, and downtime. Implementing partitioning from day one avoids this entirely.
- **Three retention tiers match three data sensitivity levels**: Sessions (metadata, configuration) are low-volume and useful long-term. Activity (actions, decisions) is medium-volume. Terminal output (raw streams) is high-volume and useful only for recent debugging.
- **Warm tier preserves data for compliance**: Exporting to compressed JSON preserves data accessibility while removing it from the hot database path. Compliance audits can access warm archives without impacting production query performance.

### Alternatives Considered

| Option | Verdict | Reason |
|--------|---------|--------|
| All data in Postgres (no partitioning) | Rejected | Terminal output volume would bloat the database. No efficient cleanup path for old data. |
| S3/object storage for archives | Deferred to GA | Adds cloud dependency. Local file storage is sufficient for single-server alpha/beta. S3 is appropriate when offsite backup is required. |
| No retention limits (keep everything) | Rejected | Storage grows unbounded. Query performance degrades as tables grow. GDPR requires data minimization. |
| Time-series database for terminal output | Rejected | Adds another database to operate. File-based storage is simpler and sufficient for the access pattern (rarely read, bulk write). |
| Shorter retention (30 days hot) | Rejected | Debugging agent behavior often requires reviewing sessions from weeks ago. 3-6 months provides adequate investigation window. |

### Schema & Code Impact

- `agent_sessions` table: range-partitioned by `created_at` (monthly)
- `agent_activity` table: range-partitioned by `created_at` (monthly)
- `pg_partman` configuration for automatic partition management
- New directory: `data/terminal-archives/` with tenant-scoped subdirectories
- New directory: `data/session-archives/` for warm-tier compressed exports
- Archive export script: `scripts/archive-sessions.sh` — exports old partitions to compressed JSON, detaches partition
- Terminal archive job: writes gzip files during session, metadata row in `agent_activity`
- Cleanup cron jobs: daily (terminal archives > 90d), weekly (session archives > 24mo, activity archives > 12mo)
- `.gitignore`: exclude `data/` directory from version control

### Phase Gate

| Phase | Behavior |
|-------|----------|
| Alpha | Implement partitioning and file-based terminal storage from day one. Monthly partitions on `agent_sessions` and `agent_activity`. Terminal output written to gzip files. Basic cleanup cron jobs. |
| Beta | Archive export automation. Warm-tier query API for compliance. Retention policy documented for employees. Storage usage monitoring and alerting. |
| GA | Configurable retention per tenant. S3 offsite backup for warm tier. Retention policy enforcement audit. Data subject access requests include archived data. |

---

All new ID prefixes (itp_, ito_, apr_, erj_, drc_, dpc_) must be registered in the ID Prefix Registry at docs/architecture/data-model.md before implementing the corresponding migration.

## New Schema Objects Summary

| Object | Type | Prefix | Domain | Phase |
|--------|------|--------|--------|-------|
| `instruction_templates` | table | `itp_` | agents | Alpha |
| `instruction_overrides` | table | `ito_` | agents | Alpha |
| `pending_approvals` | table | `apr_` | agents | Alpha |
| `erasure_jobs` | table | `erj_` | auth | Beta |
| `data_redaction_configs` | table | `drc_` | auth | Beta |
| `data_processing_consents` | table | `dpc_` | auth | GA |
| `users.status` | column | — | auth | Alpha |
| `usr_DELETED` | sentinel row | — | auth | Alpha |

## New ADRs Required

| ADR | Title | Decisions Covered |
|-----|-------|-------------------|
| ADR-007 | Resilience and Deployment (already exists) | #10, #11, #12, #13, #14 — reference, don't recreate |
| ADR-009 | API Versioning Strategy | #1 |
| ADR-010 | Backward Compatibility and Deprecation Policy | #2 |
| ADR-011 | Pagination, Filtering, and Sorting Conventions | #3 |
| ADR-012 | Event Schema Versioning | #4 |
| ADR-013 | Idempotency Key Design | #5 |
| ADR-014 | CSRF and SSRF Mitigation | #6, #7 |
| ADR-015 | GDPR Data Erasure Cascade | #8 |
| ADR-016 | Data Consistency Model | #9 |
| ADR-017 | Deployment, Rollback, and SPOF Register | #13, #14 (extends ADR-007) |
| ADR-018 | Observability Stack and Trace Propagation | #15, #16 |
| ADR-019 | AI Agent Controls (Risk, Approval, Instructions, Data) | #17, #18, #19, #20 |
| ADR-020 | Agent Session Data Retention | #21 |

## Checklist Audit Summary

| Category | Design Now | Alpha Impl | Beta | Future | N/A | Total |
|----------|-----------|------------|------|--------|-----|-------|
| Sections 1-9 | 8 | 33 | 39 | 14 | 5 | 99 |
| Sections 10-18 | 27 | 35 | 38 | 26 | 5 | 131 |
| Sections 19-25 | 7 | 10 | 18 | 11 | 22 | 68 |
| **Total** | **42** | **78** | **95** | **51** | **32** | **298** |

- **Already covered by existing docs:** ~50% of items
- **New decisions in this document:** 21 (all previously undocumented ALPHA-DESIGN gaps)
- **Items not applicable:** 32 (mostly FinOps/cloud, team/org items for solo dev)

---

*This document is a living reference. Each decision will be extracted into individual ADRs during implementation planning. All decisions are designed to be scalable from solo-dev alpha to enterprise SaaS without architectural rework.*
