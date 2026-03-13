# ADR-015: GDPR Right-to-Erasure Cascade

- Status: accepted
- Date: 2026-03-12
- Deciders: Anshul Bisen
- Categories: security, data-model, compliance

## Context

The erasure model determines foreign key design (nullable vs. non-nullable), sentinel value conventions, and audit log retention policy. Retrofitting erasure into a schema designed without it requires migrating every FK relationship. CtrlPane is a multi-tenant platform that will process personal data for employees (beta) and external users (GA). GDPR Article 17 requires erasure "without undue delay," which case law interprets as 30 days maximum. The erasure design must be decided before any schema is written because it affects every FK relationship in the data model.

## Decision

Event-driven cascade via NATS. The `ErasureCoordinator` service (in the auth domain) orchestrates the process.

**Flow:** User requests erasure -> user marked `erasure_pending` -> all active sessions invalidated -> domain-specific erase commands published to NATS -> per-domain consumers handle their data -> completion events published -> auth domain anonymizes user record to sentinel values.

**Key rules:**

- Shared resources (tasks, projects, comments) are NOT deleted. `created_by` and `assignee_id` fields are nullified to the sentinel value `usr_DELETED`.
- Exclusively-owned resources (notification preferences, personal notes, API keys) are hard deleted.
- Audit logs are pseudonymized (replace `actor_id` with `usr_DELETED_<hash>`) but NOT deleted, citing GDPR Recital 65 exemption for legal obligation retention.
- Target SLA: 30 days from request to completion.

**New schema:**

- `erasure_jobs` table (prefix `erj_`) tracking per-domain completion status with columns: `id`, `tenant_id` (NOT NULL, FK to tenants), `user_id`, `status`, `domains_pending`, `domains_completed`, `requested_at`, `updated_at` (NOT NULL, default now()), `completed_at`.
- New column: `users.status` enum (`active` | `suspended` | `erasure_pending` | `erased`).
- Sentinel user row `usr_DELETED` exists in the users table for FK integrity.
- All `created_by` and `assignee_id` FKs must be nullable (ON DELETE SET NULL or application-managed).
- 7 domain erasure consumers (one per domain: tasks, agents, integrations, notifications, gamification, goals, sprints).
- New event types: `erasure.requested.v1`, `erasure.domain.completed.v1`, `erasure.completed.v1`.

**Alternatives rejected:**

- Synchronous cascade (single transaction): cross-domain transaction would create tight coupling and risk timeout failures on large datasets.
- Hard delete everything: destroys shared resources (tasks, projects) that belong to the team, not the individual.
- Soft delete (mark as deleted, keep data): does not satisfy GDPR right to erasure.
- NULL instead of sentinel for FKs: NULL is ambiguous (never set vs. deleted). Sentinel value `usr_DELETED` is explicit and enables UI display logic.
- Delete audit logs: violates legal obligation retention exemption.

## Consequences

### Positive

- Event-driven approach decouples domains: each domain knows how to erase its own data, and adding a new domain requires only a new consumer.
- Shared resources survive erasure, preserving team data while removing personal associations.
- Sentinel value `usr_DELETED` maintains FK integrity and enables UIs to display "[Deleted User]".
- Audit log pseudonymization satisfies Recital 65 while preserving the audit trail.
- 30-day SLA is GDPR-compliant per Article 17 case law.

### Negative

- All `created_by` and `assignee_id` FKs must be nullable from day one, even though erasure flow is not implemented until beta.
- 7 domain-specific erasure consumers must be maintained, one per domain.
- Pseudonymized audit logs retain structural information that could theoretically be correlated (mitigated by hash-based pseudonymization).

### Neutral

- Sentinel user row `usr_DELETED` is a permanent fixture in the users table.
- The `erasure_jobs` table adds a small operational overhead for tracking erasure progress.

## Phase Gates

| Phase | Behavior |
|-------|----------|
| Alpha | Schema supports erasure from day one: `users.status` field present, all FKs nullable, sentinel user row exists. No erasure flow implemented (solo dev's own data). |
| Beta | Full erasure cascade implemented. ErasureCoordinator active. 30-day SLA enforced. Employee data subject to erasure requests. |
| GA | GDPR compliance documentation published. Data Protection Impact Assessment completed. Erasure SLA monitoring and alerting. |

## More Information

- [Pre-Implementation Architecture Decisions](../superpowers/specs/2026-03-12-pre-implementation-architecture-decisions-design.md)
- [ADR-006: Event Architecture](./ADR-006-event-architecture.md)
- [ADR-002: Auth Strategy](./ADR-002-auth-strategy.md)
