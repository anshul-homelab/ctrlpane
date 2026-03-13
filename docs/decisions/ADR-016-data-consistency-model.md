# ADR-016: Data Consistency Model

- Status: accepted
- Date: 2026-03-12
- Deciders: Anshul Bisen
- Categories: resilience, architecture, data-model

## Context

The consistency model determines transaction boundaries, event flow design, and UI optimistic update strategy. Changing from eventual to strong consistency for a cross-domain flow requires redesigning the entire event pipeline. Without an explicit model, developers make inconsistent assumptions about consistency guarantees, leading to hard-to-debug bugs. CtrlPane's hexagonal architecture with an outbox-based event system requires explicit decisions about which operations get strong consistency and which tolerate eventual consistency.

## Decision

Three-tier consistency model, documented explicitly for every data flow.

**Tier 1 (Strong):** Within a single domain, single Postgres transaction. The outbox pattern guarantees atomic business write + event publish. Used for: auth token issuance, refresh token rotation, lease acquisition, audit log writes, idempotency key checks.

**Tier 2 (Causal / Read-your-writes):** UI optimistic updates + Centrifugo real-time push. The user sees their own write immediately (optimistic), and the server confirms within ~1 second via WebSocket push. Used for: task updates, status changes, any user-initiated mutation displayed in the UI.

**Tier 3 (Eventual):** Cross-domain side effects via outbox -> NATS. Typical latency 100ms-30s. Used for: goal progress aggregation, notification delivery, XP/gamification calculation, Jira sync, cross-domain projections.

**Failure recovery includes:** dead letter queue alerting, manual replay API endpoint (`POST /api/v1/admin/events/{id}/replay`), scheduled reconciliation jobs, and full audit trail for debugging.

**Alternatives rejected:**

- Strong consistency everywhere (distributed transactions): requires 2PC or Saga orchestration across domains, adding latency, complexity, and tight coupling for minimal benefit on non-critical flows.
- Eventual consistency everywhere: auth and lease operations require strong consistency; eventual consistency for token issuance creates security vulnerabilities.
- CQRS with separate read models: deferred; appropriate when read and write patterns diverge significantly, premature for alpha.
- No explicit model (ad-hoc per feature): leads to inconsistent assumptions and hard-to-debug consistency bugs.

## Consequences

### Positive

- Explicit tiers create a shared vocabulary ("this is a Tier 3 flow"), preventing ambiguity in consistency assumptions.
- Strong consistency where correctness matters (auth, leases, idempotency) prevents security and correctness bugs like double-issued tokens or double-claimed leases.
- Eventual consistency where latency is acceptable enables independent scaling and failure isolation across domains.
- Causal consistency satisfies user expectations (see own writes immediately) without requiring cross-domain strong consistency.
- Reconciliation jobs heal drift, turning "eventually consistent" into a guarantee rather than a hope.

### Negative

- Three tiers add conceptual overhead: every new data flow must be classified into a tier.
- Reconciliation jobs require ongoing maintenance and monitoring for each consuming domain.
- Dead letter queue management adds operational burden.

### Neutral

- JSDoc annotations on `EffectEventBus` methods will indicate consistency tier.
- New documentation at `docs/architecture/consistency-model.md` with tier definitions, flow classification table, and failure recovery procedures.
- Audit trail enrichment adds a consistency tier tag on event processing logs.

## Phase Gates

| Phase | Behavior |
|-------|----------|
| Alpha | Tier 1 (strong) and Tier 3 (eventual) implemented. Outbox pattern active. Reconciliation job skeletons in place. |
| Beta | Tier 2 (causal) via Centrifugo. Reconciliation jobs running on schedule. Dead letter alerting active. |
| GA | SLAs on eventual consistency latency (p99 < 30s). Reconciliation job metrics and dashboards. Consistency tier documented per API endpoint. |

## More Information

- [Pre-Implementation Architecture Decisions](../superpowers/specs/2026-03-12-pre-implementation-architecture-decisions-design.md)
- [ADR-006: Event Architecture](./ADR-006-event-architecture.md)
- [ADR-007: Resilience and Deployment](./ADR-007-resilience-and-deployment.md)
