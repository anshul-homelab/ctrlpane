# Polyglot Service Contract

**Status:** Accepted
**Scope:** All services in the LifeOS ecosystem (lifeos, ctrlpane, knowledgebase, future projects)

## Overview

The primary tech stack is TypeScript (Bun + Hono.js + Effect.ts), but the architecture is designed to support services in any language. All inter-service communication uses language-agnostic protocols: REST (HTTP/JSON), NATS JetStream, Postgres, and Redis.

This document defines the contract that any service — regardless of implementation language — must follow to integrate into the ecosystem.

## When to Use a Non-TypeScript Service

Use a different language when it provides a clear, measurable advantage:

| Scenario | Recommended Language | Rationale |
|----------|---------------------|-----------|
| PDF parsing, OCR | Python (tabula, camelot, pytesseract) | Mature libraries with no JS equivalent |
| ML/data science pipelines | Python (scikit-learn, pandas, PyTorch) | Ecosystem dominance, GPU support |
| High-throughput CLI tools | Go or Rust | Startup time, binary distribution |
| Custom embedding models | Python (sentence-transformers, ONNX) | Model ecosystem |
| Real-time stream processing | Go or Rust | Concurrency model, memory efficiency |
| Browser automation | Python (Playwright) or Go (chromedp) | When Bun Playwright support is insufficient |

**Default to TypeScript** for standard CRUD services, API endpoints, and business logic. Only introduce a new language when the TypeScript ecosystem genuinely cannot solve the problem.

## Service Contract

Every service in the ecosystem — TypeScript or otherwise — MUST implement:

### 1. Health Endpoints

```
GET /health/live   → 200 { "status": "ok" }              # Process is running
GET /health/ready  → 200 { "status": "ready" }            # Can accept traffic
GET /health        → 200 { "status": "ok", "version": "0.1.0", "uptime": 12345 }  # Detailed (authenticated)
```

- `/health/live` and `/health/ready` are public (no auth)
- `/health` is authenticated (returns version, uptime, dependency status)
- Return 503 if not ready (e.g., database connection lost)

### 2. Authentication

Accept the ecosystem's auth tokens:

**Service-to-service:**
```
Authorization: Bearer kb_key_xxx    # API key (knowledgebase)
Authorization: Bearer cp_key_xxx    # API key (ctrlpane)
Authorization: Bearer lo_key_xxx    # API key (lifeos)
```

**Human users:**
```
Authorization: Bearer eyJhbG...     # JWT access token (15-min expiry)
Cookie: refresh_token=xxx           # Device-bound refresh token (7-day)
```

**Validation:** Verify JWT signature using the shared signing key (via env var `JWT_SECRET`). For API keys, validate against the issuing service's API or shared Redis cache.

### 3. Tenant/Workspace Context

Every request must include tenant context:

- **HTTP header:** `X-Tenant-ID: tenant_xxx` or `X-Workspace-ID: ws_xxx`
- **Database:** Before any query, execute `SET LOCAL app.tenant_id = '...'` (or `app.workspace_id` for knowledgebase)
- **NATS events:** Include `tenant_id` or `workspace_id` in every event payload

### 4. Port Convention

| Prefix | Project | Example |
|--------|---------|---------|
| 1 | lifeos v1 (legacy) | 13001 |
| 2 | lifeos v2 | 23001 |
| 3 | ctrlpane | 33001 |
| 4 | knowledgebase | 43001 |
| 5 | Reserved (future project) | 53001 |
| 6-9 | Reserved (future projects / sidecars) | — |

Sidecar services use sub-ranges within their parent's prefix:
- Python ML sidecar for lifeos: 29001-29099
- Go CLI tools for ctrlpane: 39001-39099
- Python embedding service for knowledgebase: 49001-49099

### 5. NATS Event Integration

**Publishing events:**
```
Subject pattern: {project}.{domain}.{entity}.{action}
Examples:
  lifeos.health.biometric.created
  ctrlpane.tasks.task.completed
  knowledgebase.knowledge.entry.updated
```

**Event envelope:**
```json
{
  "id": "evt_xxx",
  "type": "knowledgebase.knowledge.entry.created",
  "timestamp": "2026-03-12T10:00:00Z",
  "tenant_id": "tenant_xxx",
  "data": { ... },
  "metadata": {
    "trace_id": "abc123",
    "source_service": "kb-api",
    "version": "1"
  }
}
```

**Consuming events:**
- Use durable JetStream consumers with explicit ACK
- Implement exactly-once via `processed_events` table (event_id + consumer_name unique constraint)
- Dead-letter after 10 failed attempts

**Stream names:**
- `LIFEOS_EVENTS` — all lifeos domain events
- `CTRLPANE_EVENTS` — all ctrlpane domain events
- `KNOWLEDGEBASE_EVENTS` — all knowledgebase domain events

### 6. Error Response Format

All services return errors in the standard format:

```json
{
  "error": {
    "code": "ENTRY_NOT_FOUND",
    "message": "Knowledge entry with ID ent_xxx not found",
    "details": { "entry_id": "ent_xxx" }
  }
}
```

Standard HTTP status codes:
- 400 — Bad request / validation error
- 401 — Authentication required
- 403 — Insufficient permissions
- 404 — Resource not found
- 409 — Conflict (duplicate, version mismatch)
- 422 — Unprocessable entity (valid JSON, invalid semantics)
- 429 — Rate limited
- 500 — Internal server error

### 7. Logging

Structured JSON logs to stdout:

```json
{
  "level": "info",
  "timestamp": "2026-03-12T10:00:00.000Z",
  "message": "Entry created",
  "service": "kb-api",
  "trace_id": "abc123",
  "tenant_id": "tenant_xxx",
  "duration_ms": 45
}
```

- **NEVER** log secrets, tokens, passwords, or PII
- Include `trace_id` for distributed tracing (OpenTelemetry)
- Include `tenant_id` for tenant-scoped debugging
- Log levels: debug, info, warn, error

### 8. Configuration

All configuration via environment variables:

```bash
# Required for every service
PORT=43001
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
NATS_URL=nats://...
JWT_SECRET=...
NODE_ENV=production|development

# Optional
LOG_LEVEL=info
RATE_LIMIT_RPM=100
OTEL_EXPORTER_OTLP_ENDPOINT=http://...
```

No hardcoded URLs, ports, credentials, or infrastructure addresses in source code.

### 9. Database Access

- Connect to the project's Postgres instance (not another project's DB)
- Use RLS — execute `SET LOCAL app.tenant_id` before every transaction
- Migrations: expand/contract pattern (no destructive changes in same migration)
- For read-only analytics services: connect to a read replica or use a dedicated analytics schema

### 10. Deployment

- Package as a Docker container OR standalone binary
- Provide a systemd unit file for Kali production deployment
- Register with the project's Docker Compose for local development
- Health checks must pass within 30 seconds of startup

## Example: Go CLI Tool for Agent Terminal Capture

```
Service: cp-terminal-capture
Port: 39001
Language: Go 1.22
Purpose: Lightweight agent that captures terminal sessions and streams them to ctrlpane

Endpoints:
  POST /capture/start   — begin recording a terminal session
  POST /capture/stop    — stop recording and finalize
  GET  /capture/:id     — retrieve captured session data
  GET  /health/live     — liveness
  GET  /health/ready    — readiness

Integration:
  - Publishes: ctrlpane.agents.terminal.session_captured via NATS
  - Calls back: POST cp-api:33001/api/v1/tenants/:id/agents/:agentId/sessions
  - Runs as a standalone binary on managed machines (no container required)
  - Streams terminal output via NATS subjects for real-time display

Config:
  PORT=39001
  NATS_URL=nats://localhost:34222
  CP_API_URL=http://localhost:33001
  CP_API_KEY=cp_key_xxx
  CAPTURE_BUFFER_SIZE=4096
  MAX_SESSION_DURATION=3600
```

## Anti-Patterns

- **Don't share databases across projects** — each project owns its database. Cross-project data access goes through REST APIs.
- **Don't bypass NATS for cross-service communication** — no direct database queries from Service A into Service B's tables.
- **Don't hardcode service URLs** — use env vars. Service discovery is via configuration, not DNS.
- **Don't skip health endpoints** — monitoring depends on them.
- **Don't create project-specific protocols** — use REST + NATS. No gRPC, no custom binary protocols (unless benchmarked and justified via ADR).
- **Don't introduce a new language without an ADR** — document why TypeScript is insufficient for this specific use case.
