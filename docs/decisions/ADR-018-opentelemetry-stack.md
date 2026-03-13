# ADR-018: OpenTelemetry Stack and Trace Propagation

- Status: accepted
- Date: 2026-03-12
- Deciders: Anshul Bisen
- Categories: observability, architecture

## Context

The telemetry SDK is integrated into the Effect Layer composition. Changing the exporter protocol (OTLP/HTTP vs gRPC) or backend (SigNoz vs Grafana) requires updating the telemetry Layer in every service entry point. Additionally, trace propagation format is embedded in every inter-service communication boundary (HTTP, outbox, NATS, Centrifugo). Changing the format requires updating all producers and consumers simultaneously. These decisions must be made before implementation because retroactively instrumenting code is painful, and telemetry from day one provides debugging capability and performance baselines.

## Decision

### Telemetry Stack

`@effect/opentelemetry` + `@opentelemetry/sdk-trace-base` + `@opentelemetry/exporter-trace-otlp-http` exporting to self-hosted SigNoz via OTLP/HTTP. SigNoz provides unified traces, metrics, and logs in a single UI backed by ClickHouse. Ports follow the prefix-3 convention: SigNoz UI at `39080`, OTel collector at `34317` (gRPC, unused) and `34318` (HTTP, primary). Effect spans are automatically exported as OTel spans via `@effect/opentelemetry`'s `TracerProvider` integration.

**Stack alternatives rejected:**

- Grafana stack (Tempo + Prometheus + Loki): 4+ services to deploy and maintain, overkill for solo-dev alpha.
- Jaeger: traces only, no metrics or logs; would still need Prometheus + a log aggregator.
- Cloud-hosted (Datadog, New Relic): deferred to GA; adds cost and data sovereignty concerns.
- No telemetry (add later): retroactively instrumenting code is painful.
- OTLP/gRPC: requires protobuf compilation; Bun's protobuf support is less mature than Node's.

### Trace Context Propagation

W3C Traceparent (`traceparent` header, format: `00-{trace_id}-{span_id}-{flags}`) as the sole propagation format.

**Propagation chain:** HTTP request -> Hono middleware extracts `traceparent` -> Effect span created with trace context -> outbox INSERT includes `trace_id` column -> outbox poller reconstructs `traceparent` header from stored `trace_id` -> NATS message published with `traceparent` in NATS headers -> NATS consumer extracts `traceparent` and creates child span -> Centrifugo envelope includes `trace_id` in metadata for client-side correlation.

**Propagation alternatives rejected:**

- B3 propagation (Zipkin format): legacy format; W3C Traceparent is the industry standard successor.
- Multiple formats (W3C + B3): adds parsing complexity for zero benefit when all components are under our control.
- No outbox trace propagation: traces would fragment at the outbox boundary, making the most common debugging scenario (HTTP -> event -> consumer) invisible.
- Custom correlation ID instead of W3C: reinvents trace propagation; OTel tooling (SigNoz) natively understands W3C format.

### Schema & Code Impact

- New Effect Layer: `TelemetryLive` composing OTel `TracerProvider` with OTLP/HTTP exporter.
- Docker Compose: SigNoz services (signoz-otel-collector, signoz-clickhouse, signoz-query-service, signoz-frontend) at prefix-3 ports.
- Environment variables: `OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:34318`.
- Hono middleware: extract `traceparent` header, create Effect span with trace context.
- Outbox INSERT: `trace_id` column populated from current Effect span's trace ID.
- Outbox poller: read `trace_id`, reconstruct `traceparent` header (`00-{trace_id}-{new_span_id}-01`), create child span.
- NATS publisher: inject `traceparent` into NATS message headers.
- NATS consumer wrapper: extract `traceparent` from NATS headers, create child span.
- Centrifugo publisher: include `trace_id` in WebSocket message metadata.

## Consequences

### Positive

- Effect has first-class OTel integration: `@effect/opentelemetry` automatically converts Effect spans to OTel spans with no manual instrumentation needed.
- SigNoz is simpler than the Grafana stack: one service provides traces, metrics, and logs backed by ClickHouse.
- OTLP/HTTP uses JSON which is natively supported in Bun's TypeScript-first workflow, avoiding protobuf compilation.
- Self-hosted preserves data sovereignty during alpha/beta.
- W3C Traceparent is the OTel default, requiring no additional configuration.
- End-to-end tracing spanning HTTP -> outbox -> NATS -> consumer -> Centrifugo makes debugging cross-domain flows trivial.
- Single propagation format eliminates ambiguity and format conversion bugs.

### Negative

- SigNoz adds 4 Docker containers (collector, ClickHouse, query service, frontend) to the development environment.
- OTLP/HTTP has slightly higher overhead than gRPC due to JSON serialization (negligible at alpha scale).
- Self-hosted SigNoz requires maintenance (upgrades, ClickHouse disk management).

### Neutral

- Port prefix convention is consistent with all other ctrlpane services (prefix 3).
- Outbox `trace_id` column already exists in the design; this ADR documents how it is used.
- Frontend correlation (client logs include trace_id) is deferred to beta.

## Phase Gates

| Phase | Behavior |
|-------|----------|
| Alpha | Basic tracing active. All Effect spans exported to SigNoz. Service name and version in resource attributes. HTTP request spans via Hono middleware. End-to-end trace propagation: HTTP -> outbox -> NATS -> consumer. Centrifugo includes trace_id in metadata. |
| Beta | Metrics export (request latency histograms, error rates, queue depths). SigNoz dashboards for key operational metrics. Alert rules for error rate spikes. Frontend correlation: client logs include trace_id for support debugging. Trace-based alerting (e.g., alert on traces > 5s duration). |
| GA | Custom dashboards per domain. SLA monitoring dashboards. Log correlation with traces. Distributed tracing across all async boundaries. Trace sampling strategy (head-based, 10% default, 100% for errors). Trace retention policy aligned with ADR-020. |

## More Information

- [Pre-Implementation Architecture Decisions](../superpowers/specs/2026-03-12-pre-implementation-architecture-decisions-design.md)
- [ADR-006: Event Architecture](./ADR-006-event-architecture.md)
- [ADR-008: CI/CD and Deployment Architecture](./ADR-008-cicd-deployment.md)
