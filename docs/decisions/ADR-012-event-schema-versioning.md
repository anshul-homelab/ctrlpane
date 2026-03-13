# ADR-012: Event Schema Versioning

- Status: accepted
- Date: 2026-03-12
- Deciders: Anshul Bisen
- Categories: API

## Context

Event schemas are persisted in the outbox table and consumed by multiple subscribers. Changing the envelope format requires migrating all stored events and updating all consumers simultaneously. The versioning strategy must support gradual consumer migration, runtime validation, and efficient routing via NATS subjects — all within a monorepo where producers and consumers share the same codebase.

## Decision

CloudEvents-inspired envelope with the following fields:
- `specversion` — always `"1.0"`
- `id` — the outbox event's prefixed ULID (e.g., `obx_01HXYZ...`), maintaining consistency with the data-model convention while remaining CloudEvents-compatible
- `source` — domain name (e.g., `ctrlpane.tasks`)
- `type` — dot-separated with version suffix (e.g., `ctrlpane.tasks.task.completed.v1`)
- `dataschemaversion` — semver of the data payload schema
- `tenantid` — tenant UUID
- `traceid` — W3C trace ID for correlation
- `data` — the domain event payload

Version is embedded in the `type` string. No external schema registry — Zod schemas in `packages/shared/src/events/` are the single source of truth.

**Evolution rules:** adding an optional field keeps the same version; removing, renaming, or retyping a field requires a new version (e.g., `.v2`). During transitions, consumers subscribe with NATS wildcards (`ctrlpane.tasks.task.completed.>`) to receive both versions.

### Alternatives Rejected

| Option | Reason |
|--------|--------|
| External schema registry (Confluent, Buf) | Adds infrastructure dependency for a monorepo where all code shares the same package. Overkill until there are external event consumers. |
| Version in separate header/field | Separating version from type complicates NATS subject routing. Version-in-type enables native NATS subject filtering. |
| Avro/Protobuf schemas | Binary formats add compilation steps incompatible with Bun's TypeScript-first workflow. JSON + Zod is sufficient for expected throughput. |
| No versioning (always additive) | Works until the first required breaking change, then causes cascading consumer failures. |

### Schema and Code Impact

- Outbox table `payload` column stores the full CloudEvents envelope as JSONB
- Event type strings gain `.v1` suffix: `ctrlpane.tasks.task.completed.v1`
- NATS subjects mirror event types: `ctrlpane.tasks.task.completed.v1`
- New directory: `packages/shared/src/events/` with per-domain event Zod schemas
- Event envelope Zod schema: `packages/shared/src/events/envelope.ts`
- Outbox publisher serializes envelope; consumer deserializes and validates

## Consequences

### Positive

- Monorepo advantage: all producers and consumers share the same Zod schemas from `packages/shared`, eliminating the need for a registry
- NATS wildcards enable version routing: consumers can subscribe to `ctrlpane.tasks.task.completed.>` for all versions, or `.v1` for a specific version, enabling seamless gradual migration
- CloudEvents alignment: following CloudEvents field naming (`specversion`, `type`, `source`) means future integration with CloudEvents-compatible systems requires no translation
- Version in type string is grep-friendly: searching for `task.completed.v1` in code instantly reveals all producers and consumers
- Zod schemas provide runtime validation: consumers validate incoming events against Zod schemas, catching schema drift immediately

### Negative

- Version suffix in type strings adds verbosity to every event reference
- Breaking changes require coordinating producer and consumer updates, even within the monorepo
- Stored events in the outbox cannot be retroactively upgraded to a new envelope format without migration

### Neutral

- NATS subject hierarchy mirrors the event type hierarchy by design
- CloudEvents `specversion: "1.0"` is a fixed field that may need updating if CloudEvents releases a new spec version

## Phase Gates

| Phase | Behavior |
|-------|----------|
| Alpha | All events at v1. Full envelope format from day one. Zod schemas for every event type. |
| Beta | Version evolution process documented. First v2 events expected as API matures. Wildcard subscriptions for transition periods. |
| GA | Event catalog published. External consumers (webhooks) receive CloudEvents-formatted payloads. Schema compatibility checks in CI. |

## More Information

- [Pre-Implementation Architecture Decisions](../superpowers/specs/2026-03-12-pre-implementation-architecture-decisions-design.md)
- [ADR-006: Event Architecture](./ADR-006-event-architecture.md)
- [CloudEvents Specification](https://cloudevents.io/)
