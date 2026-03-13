# ADR-013: Idempotency Key Design

- Status: accepted
- Date: 2026-03-12
- Deciders: Anshul Bisen
- Categories: API

## Context

Idempotency key semantics are a contract with every API client. Changing the key scope, TTL, or fingerprinting algorithm after clients depend on replay behavior causes silent data corruption or unexpected 409s. In an AI-first platform, agents may retry operations hours later due to tool execution failures or session resumption — safe retry semantics are critical for agent reliability.

## Decision

IETF `Idempotency-Key` header (draft-ietf-httpapi-idempotency-key-header-07). Client-generated, recommended UUIDv4.

**Storage:** Tenant-scoped Redis at key `idem:{tenant_id}:{key}` with 24-hour TTL.

**Request fingerprint:** SHA-256 of `method + path + body`.

**Behavior:**
- Same key + same fingerprint = replay cached response (status code + headers + body)
- Same key + different fingerprint = `409 Conflict`

**Processing flow:** `SET NX` for atomic claim, status transitions `processing` → `completed`, key deleted on processing failure (allowing retry).

**Scope:** Required on all POST and PATCH endpoints (opt-in via `idempotent()` middleware). PUT and DELETE are inherently idempotent but optionally support the header.

**MCP integration:** MCP tools auto-generate idempotency keys per operation, ensuring agent retries are safe.

**Response header:** `Idempotency-Key-Status: hit|miss|processing` for debugging.

### Alternatives Rejected

| Option | Reason |
|--------|--------|
| Server-generated idempotency tokens | Requires an extra round-trip to obtain a token before the actual request. Adds latency and complexity. |
| Database-backed idempotency (Postgres) | Redis NX is atomic and faster. Postgres would require a dedicated table and advisory locks. |
| No fingerprint validation | Allows silent misuse where different requests accidentally share a key, causing data loss. |
| Longer TTL (7 days) | Increases Redis memory footprint 7x for marginal safety improvement. 24h covers all realistic retry scenarios. |
| Global (non-tenant-scoped) keys | Creates a global namespace collision risk and prevents per-tenant rate limiting on key creation. |

### Schema and Code Impact

- New Hono middleware: `idempotent()` wrapping POST/PATCH handlers
- New Redis namespace: `idem:{tenant_id}:{key}` with 24h TTL
- Cached response structure: `{ status: number, headers: Record<string, string>, body: string }`
- Approximate storage: ~1KB per cached response
- MCP tool wrapper: auto-generates `Idempotency-Key: <uuidv4>` per tool invocation
- Response headers: `Idempotency-Key-Status: hit|miss|processing` for debugging

## Consequences

### Positive

- IETF standard alignment: clients familiar with Stripe or other IETF-adopting APIs already know the semantics
- Tenant scoping prevents cross-tenant collision: key `idem:{tenant_id}:{key}` ensures tenant A's key never collides with tenant B's
- SHA-256 fingerprint detects misuse: reusing a key with different request content returns 409, preventing silent data inconsistency
- 24h TTL balances safety and storage: long enough for retry storms (agents may retry hours later), short enough to keep Redis memory bounded
- Delete-on-failure enables retry: if processing fails, the key is removed so the client can retry with the same key

### Negative

- Redis becomes a dependency for write endpoints — Redis unavailability degrades POST/PATCH to non-idempotent behavior (fail-open vs. fail-closed decision needed per endpoint)
- 24h TTL means clients cannot rely on idempotency for operations older than one day
- ~1KB per cached response accumulates during high-write periods (bounded by TTL)

### Neutral

- PUT and DELETE optionally support the header but do not require it, since they are inherently idempotent
- MCP auto-generation means agents never need to manage keys manually

## Phase Gates

| Phase | Behavior |
|-------|----------|
| Alpha | Implement for all POST/PATCH endpoints. Manual key generation by clients. Redis storage with 24h TTL. |
| Beta | MCP auto-generation of idempotency keys. Monitoring dashboard for hit/miss ratios. Alert on high 409 rates. |
| GA | Per-tenant metrics on idempotency key usage. Rate limiting on key creation to prevent abuse. Documentation for SDK integration. |

## More Information

- [Pre-Implementation Architecture Decisions](../superpowers/specs/2026-03-12-pre-implementation-architecture-decisions-design.md)
- [IETF draft-ietf-httpapi-idempotency-key-header-07](https://datatracker.ietf.org/doc/draft-ietf-httpapi-idempotency-key-header/)
- [ADR-009: API Versioning](./ADR-009-api-versioning.md)
