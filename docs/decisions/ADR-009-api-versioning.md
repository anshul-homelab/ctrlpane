# ADR-009: API Versioning Strategy

- Status: accepted
- Date: 2026-03-12
- Deciders: Anshul Bisen
- Categories: API

## Context

CtrlPane is a multi-tenant, AI-first project management platform where AI agents are first-class API consumers. The API versioning scheme is irreversible — URL paths become part of every client integration, SDK, and agent tool definition. Changing the versioning scheme after launch requires coordinated migration across all consumers. The strategy must be agent-friendly (agents work with URL strings directly), cacheable by CDNs, and consistent with industry standards.

## Decision

URL path versioning at `/api/v1/`. All domain routes are mounted under this prefix via `app.route('/api/v1', routes)` in Hono. The MCP endpoint remains at `/mcp` without version prefix because MCP uses its own protocol-level capability negotiation. Internal health and metrics endpoints live outside the versioned prefix at `/health` and `/metrics`.

### Alternatives Rejected

| Option | Reason |
|--------|--------|
| Header-based (`Accept: application/vnd.ctrlpane.v1+json`) | Hostile to AI agents — requires header manipulation, invisible in URL, defeats URL-based caching |
| Query parameter (`?version=1`) | Non-standard, mixes versioning with filtering params, no major API uses this pattern |
| Versionless with additive-only evolution | Works until the first breaking change, then becomes a trap with no migration path |
| Content negotiation (`Accept` media type) | Over-engineered for a single-format JSON API, adds parsing complexity |

### Schema and Code Impact

- Hono router: all domain route files mounted under `/api/v1/` prefix
- Frontend API client: base URL set to `/api/v1/`
- MCP tool definitions: internal HTTP calls reference `/api/v1/` endpoints
- OpenAPI spec: `servers[0].url` set to `/api/v1`
- Documentation: all endpoint references include version prefix

## Consequences

### Positive

- Agent-friendly: AI agents work with URL strings directly, no header manipulation needed
- Cacheable: CDNs and reverse proxies can cache based on URL path without `Vary` headers
- Industry standard: follows Stripe (`/v1/`), GitHub (`/v3/`), Linear (`/v1/`), Jira Cloud (`/rest/api/3/`) patterns, reducing onboarding friction
- Simple routing: Hono's `app.route()` makes prefix-based versioning a one-liner with no custom middleware
- Clean MCP exception: MCP has its own protocol negotiation (`initialize` → `capabilities`), so a URL version prefix would be redundant

### Negative

- URL paths are permanent commitments — every client, agent tool, and SDK will embed `/api/v1/`
- Version prefix adds visual noise to every endpoint reference in documentation and code

### Neutral

- MCP and health/metrics endpoints live outside the versioned prefix by design
- OpenAPI spec must declare the versioned base URL

## Phase Gates

| Phase | Behavior |
|-------|----------|
| Alpha | v1 only. All routes under `/api/v1/`. No version negotiation needed. |
| Beta | v1 + deprecation infrastructure. Sunset headers on deprecated endpoints. Version lifecycle documentation published. |
| GA | v1 + v2 coexistence. Both versions served simultaneously. v1 enters deprecation window when v2 stabilizes. |

## More Information

- [Pre-Implementation Architecture Decisions](../superpowers/specs/2026-03-12-pre-implementation-architecture-decisions-design.md)
- [ADR-010: Backward Compatibility](./ADR-010-backward-compatibility.md)
