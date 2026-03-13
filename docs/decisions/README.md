# Architecture Decision Records

> This directory contains Architecture Decision Records (ADRs) for ctrlpane.
> ADRs document significant technical decisions, their context, alternatives considered, and rationale.

## ADR Index

| ADR | Title | Status | Date |
|-----|-------|--------|------|
| [ADR-001](./ADR-001-tech-stack.md) | Tech Stack | Accepted | 2026-03-12 |
| [ADR-002](./ADR-002-auth-strategy.md) | Auth Strategy | Accepted | 2026-03-12 |
| [ADR-003](./ADR-003-domain-pattern.md) | Domain Pattern | Accepted | 2026-03-12 |
| [ADR-004](./ADR-004-pm-hierarchy.md) | PM Hierarchy | Accepted | 2026-03-12 |
| [ADR-005](./ADR-005-agent-first-design.md) | Agent-First Design | Accepted | 2026-03-12 |
| [ADR-006](./ADR-006-event-architecture.md) | Event Architecture | Accepted | 2026-03-12 |
| [ADR-007](./ADR-007-resilience-and-deployment.md) | Resilience Patterns & Deployment | Accepted (Decisions 1-4); Decision 5 superseded by ADR-008 | 2026-03-12 |
| [ADR-008](./ADR-008-cicd-deployment.md) | CI/CD & Two-Machine Deployment | Accepted | 2026-03-12 |
| [ADR-009](./ADR-009-api-versioning.md) | API Versioning | Accepted | 2026-03-12 |
| [ADR-010](./ADR-010-backward-compatibility.md) | Backward Compatibility | Accepted | 2026-03-12 |
| [ADR-011](./ADR-011-pagination-and-filtering.md) | Pagination & Filtering | Accepted | 2026-03-12 |
| [ADR-012](./ADR-012-event-schema-versioning.md) | Event Schema Versioning | Accepted | 2026-03-12 |
| [ADR-013](./ADR-013-idempotency-keys.md) | Idempotency Keys | Accepted | 2026-03-12 |
| [ADR-014](./ADR-014-csrf-ssrf-mitigation.md) | CSRF & SSRF Mitigation | Accepted | 2026-03-12 |
| [ADR-015](./ADR-015-gdpr-erasure.md) | GDPR Erasure Cascade | Accepted | 2026-03-12 |
| [ADR-016](./ADR-016-data-consistency-model.md) | Data Consistency Model | Accepted | 2026-03-12 |
| [ADR-017](./ADR-017-spof-acceptance-register.md) | SPOF Acceptance Register | Accepted | 2026-03-12 |
| [ADR-018](./ADR-018-opentelemetry-stack.md) | OpenTelemetry Stack | Accepted | 2026-03-12 |
| [ADR-019](./ADR-019-agent-safety-controls.md) | Agent Safety Controls | Accepted | 2026-03-12 |
| [ADR-020](./ADR-020-agent-session-retention.md) | Agent Session Data Retention | Accepted | 2026-03-12 |

## Template

When creating a new ADR, use this structure:

```markdown
# ADR-NNN: Title

- Status: proposed | accepted | deprecated | superseded
- Date: YYYY-MM-DD
- Decision-Makers: who decided
- Consulted: who was consulted

## Context and Problem Statement

What is the issue that we need to solve?

## Decision Drivers

- Driver 1
- Driver 2

## Considered Options

1. Option A
2. Option B

## Decision Outcome

Chosen option: "Option X", because [justification].

### Consequences

**Good:**
- ...

**Bad:**
- ...

## More Information

- Links to related ADRs, docs, external resources
```

## Conventions

- ADRs are numbered sequentially: `ADR-001`, `ADR-002`, etc.
- Status lifecycle: `proposed` -> `accepted` -> optionally `deprecated` or `superseded`
- Immutable once accepted: if a decision changes, create a new ADR that supersedes the old one
- Keep ADRs concise: focus on the decision, not the full design (link to design docs for details)
