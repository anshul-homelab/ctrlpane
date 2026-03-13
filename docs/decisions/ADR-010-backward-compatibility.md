# ADR-010: Backward Compatibility Rules

- Status: accepted
- Date: 2026-03-12
- Deciders: Anshul Bisen
- Categories: API

## Context

Once clients depend on a compatibility contract, relaxing it breaks trust and integrations. The deprecation timeline becomes a contractual commitment. AI agents parse API responses structurally — removing or renaming fields causes silent failures that are hard to debug in agent pipelines. A formal backward compatibility policy must be established before the first API consumer exists.

## Decision

Additive-only evolution within a major version. Breaking changes require a new major version.

**Deprecation windows:**
- Endpoint deprecation: 90 days
- Full version deprecation: 180 days

**Breaking changes are defined as:** removing or renaming fields, making optional fields required, removing endpoints, removing enum values, tightening validation rules, or changing default values.

**Non-breaking changes are:** adding optional fields (with defaults), adding new endpoints, adding enum values, loosening validation, or adding query parameters with sensible defaults.

**Deprecation signaling:** `Sunset` header (RFC 8594), `Deprecation: true` header, and `X-Ctrlpane-Deprecated: true` custom header. Per-tenant usage of deprecated endpoints is tracked in audit logs.

### Alternatives Rejected

| Option | Reason |
|--------|--------|
| No formal compatibility rules | Leads to ad-hoc breaking changes and erodes client trust. Especially dangerous when agents depend on stable schemas. |
| Shorter deprecation windows (30 days) | Insufficient time for enterprise clients to update integrations. 90 days is the minimum industry standard. |
| Longer deprecation windows (12 months) | Appropriate for GA with paying customers. Overkill for alpha/beta where the user base is controlled. Deferred. |

### Schema and Code Impact

- New Hono middleware: `deprecation()` — injects `Sunset`, `Deprecation`, and `X-Ctrlpane-Deprecated` headers
- Audit log enrichment: `deprecated_endpoint_used` event type with tenant_id, endpoint, and sunset date
- Per-tenant deprecation usage dashboard query
- Documentation: deprecation policy page in developer docs
- API changelog: structured format with breaking/non-breaking classification

## Consequences

### Positive

- Predictable for agents: AI agents can rely on stable response shapes within a major version
- RFC 8594 compliance: the `Sunset` header is a standard mechanism that HTTP-aware clients can parse programmatically
- Per-tenant tracking enables targeted migration outreach instead of hoping everyone reads changelogs
- 90/180-day windows are conservative for alpha/beta but appropriate for the progressive rollout strategy
- Additive-only is the simplest contract: clients can safely ignore new fields

### Negative

- Additive-only evolution constrains API design — some improvements require waiting for a new major version
- Deprecation infrastructure (middleware, tracking, dashboards) has upfront implementation cost
- Per-tenant tracking adds audit log volume

### Neutral

- GraphQL-style `@deprecated` directive pattern inspired the header-based approach
- Windows may be extended to 12 months at GA when paying customers are involved

## Phase Gates

| Phase | Behavior |
|-------|----------|
| Alpha | Additive-only changes. No deprecation infrastructure needed — user base is controlled (solo dev). |
| Beta | Sunset headers active on any deprecated endpoints. Per-tenant usage tracking enabled. 90-day endpoint windows enforced. |
| GA | Full lifecycle management. 180-day version deprecation. Deprecation dashboard for support team. Automated tenant notification emails. |

## More Information

- [Pre-Implementation Architecture Decisions](../superpowers/specs/2026-03-12-pre-implementation-architecture-decisions-design.md)
- [ADR-009: API Versioning](./ADR-009-api-versioning.md)
- [RFC 8594 — The Sunset HTTP Header Field](https://www.rfc-editor.org/rfc/rfc8594)
