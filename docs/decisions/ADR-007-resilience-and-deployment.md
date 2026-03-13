# ADR-007: Resilience Patterns and Deployment Strategy

- Status: accepted (Decisions 1-4); Decision 5 superseded by ADR-008
- Date: 2026-03-12
- Decision-Makers: Anshul
- Consulted: AWS Builders Library (backoff/jitter), NATS JetStream documentation, Release It! (Nygard), Effect.ts scheduling documentation, macOS launchd documentation

## Context and Problem Statement

ctrlpane's architecture (ADR-001, ADR-006) defines the infrastructure stack (Postgres, Redis, NATS JetStream, Centrifugo) and event-driven communication model (transactional outbox). Five operational gaps remain undecided:

1. **Retry / backoff / jitter** policy for transient failures across all infrastructure boundaries
2. **Backpressure** mechanisms for async pipelines (outbox poller, NATS consumers)
3. **Bulkhead / failure domain isolation** to prevent one domain's failure from cascading
4. **SPOF acceptance register** format for consciously documenting single points of failure
5. **Deployment and rollback** strategy for the Mac Studio home lab environment

These gaps span sections 7, 15, and 17 of the [Superset Production Checklist](../superset-production-checklist.md) and are prerequisites for Silver-tier readiness per the [Production Governance Framework](../architecture/production-governance.md).

## Decision Drivers

- Effect.ts is the concurrency and error-handling primitive; solutions should compose with `Effect.retry`, `Schedule`, `Semaphore`, and `Scope`
- Single Mac Studio deployment (no multi-node orchestration)
- 8 domains share one Postgres, one Redis, one NATS — failure isolation must be application-level
- AI agents are the sole developers; operational procedures must be automatable
- Expand/contract migration pattern is already decided (ADR-006, development conventions)

---

## Decision 1: Standard Retry / Backoff / Jitter Policy

### Decision

Define three retry policy tiers as reusable Effect `Schedule` compositions. Every infrastructure boundary in ctrlpane uses one of these three policies, selected by the nature of the call.

### Retry Policy Tiers

| Tier | Use Case | Base Delay | Factor | Jitter | Max Attempts | Max Elapsed | Cap Per Attempt |
|------|----------|-----------|--------|--------|-------------|-------------|-----------------|
| **Fast** | Redis reads, Centrifugo token refresh, in-process cache | 50ms | 2 | Full | 3 | 1s | 400ms |
| **Standard** | Outbox poller -> NATS publish, NATS consumer -> processing, Drizzle transient errors | 200ms | 2 | Full | 5 | 30s | 5s |
| **Slow** | Integration HTTP calls (Jira, Slack, Google), webhook delivery, email/Telegram sends | 1s | 2 | Full | 8 | 5min | 30s |

### Effect.ts Implementation Pattern

```typescript
// packages/shared/src/retry-policies.ts
import { Schedule, Duration } from 'effect';

// Full jitter: uniform random between 0 and the calculated delay.
// This is the AWS-recommended strategy that eliminates thundering herds
// by spreading retries uniformly across the delay window.

export const FastRetry = Schedule.exponential(Duration.millis(50), 2).pipe(
  Schedule.jittered,                         // full jitter by default
  Schedule.either(Schedule.recurs(3)),       // max 3 attempts
  Schedule.upTo(Duration.seconds(1)),        // max 1s total elapsed
);

export const StandardRetry = Schedule.exponential(Duration.millis(200), 2).pipe(
  Schedule.jittered,
  Schedule.either(Schedule.recurs(5)),
  Schedule.upTo(Duration.seconds(30)),
);

export const SlowRetry = Schedule.exponential(Duration.seconds(1), 2).pipe(
  Schedule.jittered,
  Schedule.either(Schedule.recurs(8)),
  Schedule.upTo(Duration.minutes(5)),
);
```

### Application to Each Component

| Component | Policy | Retryable Errors | Non-Retryable Errors |
|-----------|--------|-----------------|---------------------|
| Outbox poller -> NATS publish | Standard | Connection refused, timeout, server unavailable | Malformed payload (-> dead letter) |
| NATS consumer -> processing | Standard | DB connection lost, lock contention, transient IO | Validation error, schema mismatch (-> NAK + dead letter after max deliver) |
| Redis reconnect | Fast | Connection reset, timeout | Auth failure |
| Centrifugo token refresh | Fast | HTTP 5xx, timeout | HTTP 401/403 (credential invalid) |
| Integration HTTP calls | Slow | HTTP 429, 500, 502, 503, 504, timeout, ECONNRESET | HTTP 400, 401, 403, 404, 422 (client errors) |
| Drizzle queries (transient) | Standard | Connection pool exhausted, serialization failure, deadlock | Constraint violation, syntax error |

### Rationale

- **Full jitter** (not equal or decorrelated) is chosen because AWS's analysis shows it provides the best spread and shortest total completion time across many competing clients. Effect.ts `Schedule.jittered` applies full jitter by default.
- **Three tiers** rather than one-size-fits-all because a 1s base delay is inappropriate for Redis reads, and 50ms is too aggressive for external HTTP APIs subject to rate limiting.
- **Max elapsed time caps** prevent retry storms from holding Effect fibers indefinitely — important because each retry consumes a slot in the domain's semaphore (see Decision 3).
- **Non-retryable errors bypass the schedule entirely** via `Effect.retry(effect, { schedule, while: isRetryable })` — validation errors, auth errors, and schema mismatches fail fast.

### Alternatives Considered

1. **Single universal policy (500ms, 5 attempts)** — Rejected. Too slow for Redis (users wait 2.5s+ for cache miss fallback), too fast for integration APIs (burns all retries in seconds during a rate limit window).
2. **Per-component custom policies** — Rejected. Leads to 10+ unique policies, hard to reason about system-wide retry load. Three tiers cover the range.
3. **No jitter (pure exponential)** — Rejected. Without jitter, all outbox poller instances (if scaled) and all NATS consumers retry at the same instants, creating thundering herds.

---

## Decision 2: Backpressure Mechanisms

### Decision

Use pull-based flow control at every async boundary. The outbox poller controls its own pace via batch size and poll interval. NATS consumers control their pace via pull batch size and max ack pending. Both degrade gracefully when overloaded.

### Outbox Poller Configuration

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| Poll interval | 200ms | Balances latency (~200ms avg delay) vs DB load (~5 queries/sec) |
| Batch size | 50 | Matches NATS publish throughput; avoids holding FOR UPDATE locks on too many rows |
| Max concurrent publish | 10 | Semaphore-limited; prevents overwhelming NATS during burst |
| Backoff on empty | 1s | When no pending events, wait longer to reduce idle DB queries |
| Circuit breaker threshold | 5 consecutive NATS failures | Stop polling, wait 30s, then probe with 1 event |

```typescript
// Outbox poller pseudo-pattern
const pollCycle = Effect.gen(function* () {
  const events = yield* outboxRepo.fetchPending({ limit: 50 }); // FOR UPDATE SKIP LOCKED
  if (events.length === 0) {
    yield* Effect.sleep(Duration.seconds(1)); // backoff on empty
    return;
  }
  // Publish concurrently with bounded parallelism
  yield* Effect.forEach(events, publishToNats, { concurrency: 10 });
  yield* Effect.sleep(Duration.millis(200)); // standard poll interval
});
```

### NATS JetStream Consumer Configuration

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| Fetch batch size | 20 | Small enough for fast processing, large enough to amortize network round trips |
| Max ack pending | 50 | Allows 50 unacknowledged messages in flight; NATS pauses delivery beyond this |
| Ack wait | 30s | Matches ADR-006; long enough for DB writes + exactly-once check |
| Max deliver | 10 | After 10 failed deliveries, message goes to advisory (dead letter behavior) |
| Idle heartbeat | 15s | Detects stale pull subscriptions; consumer re-fetches if heartbeat missed |

### Overload Signals and Response

| Signal | Detection | Response |
|--------|-----------|----------|
| Outbox table growing (pending count > 500) | Metric: `ctrlpane_outbox_pending_count` gauge | Alert; investigate slow consumer or NATS connectivity |
| Consumer lag (unprocessed > 100) | NATS consumer info: `num_pending` | Alert; consider increasing consumer concurrency |
| Processing time > ack wait | Consumer timeout; NATS redelivers | Increase `ack_wait` or optimize handler; never increase `max_deliver` |
| Memory pressure on consumer | Bun process RSS metric | Reduce fetch batch size from 20 to 5; reduce max ack pending from 50 to 10 |

### Rationale

- **Pull consumers** (not push) give the application control over flow. The consumer requests messages when ready, rather than having NATS push messages at an uncontrollable rate.
- **`FOR UPDATE SKIP LOCKED`** on the outbox query means multiple poller instances (if ever scaled) do not contend — each picks up different rows.
- **Max ack pending = 50** is the primary backpressure lever. When all 50 slots are occupied, NATS stops delivering to this consumer. This prevents unbounded memory growth.
- **Batch size 20** for consumers (not 100+) keeps per-batch processing time under the 30s ack wait window with margin.

### Alternatives Considered

1. **Push consumers with rate limit** — Rejected. Push consumers require rate limiting configuration server-side and provide less fine-grained control. Pull consumers let the application decide exactly when to fetch.
2. **Large batch sizes (100-256)** — Rejected. With 30s ack wait, processing 256 messages risks timing out. Smaller batches with higher fetch frequency is more predictable.
3. **Dynamic batch sizing** — Deferred. Adaptive batch sizes based on processing time are elegant but add complexity. Start with fixed sizes, add dynamism if monitoring shows the need.

---

## Decision 3: Bulkhead / Failure Domain Isolation

### Decision

Isolate failure domains using three mechanisms: (1) per-domain Effect `Semaphore` pools that limit concurrent operations, (2) separate Drizzle connection pool limits per domain category, and (3) domain-level circuit breakers for external dependencies.

### Mechanism 1: Effect Semaphore Pools (Per-Domain Concurrency Limits)

Each domain gets a named semaphore that limits how many concurrent Effect fibers can perform I/O-bound work (DB queries, NATS publishes, external HTTP). This prevents one domain from monopolizing shared resources.

| Domain Category | Semaphore Permits | Rationale |
|----------------|-------------------|-----------|
| Core domains (auth, tasks, projects, goals, notes) | 20 each | High-traffic, user-facing; need responsive concurrency |
| Agent domain | 15 | Agent sessions are long-lived but fewer in number |
| Side-effect domains (notifications, integrations) | 10 each | Background processing; should not starve core domains |
| Outbox poller | 10 | Already bounded by batch size; semaphore adds defense-in-depth |

```typescript
// packages/shared/src/bulkhead.ts
import { Effect, Semaphore } from 'effect';

export const makeDomainBulkhead = (name: string, permits: number) =>
  Effect.gen(function* () {
    const semaphore = yield* Semaphore.make(permits);
    return {
      withPermit: <A, E, R>(effect: Effect.Effect<A, E, R>) =>
        semaphore.withPermits(1)(effect).pipe(
          Effect.timeoutFail({
            duration: Duration.seconds(10),
            onTimeout: () => new BulkheadTimeoutError({ domain: name }),
          }),
        ),
    };
  });
```

### Mechanism 2: Postgres Connection Pool Segmentation

Rather than one global pool, partition the Postgres connection pool by domain category. This prevents a slow-query domain from exhausting all connections.

| Pool | Max Connections | Domains |
|------|----------------|---------|
| `core` | 15 | auth, tasks, projects, goals, notes |
| `agents` | 5 | agents |
| `background` | 5 | notifications, integrations, outbox poller |
| `migrator` | 2 | Schema migrations (ctrlpane_migrator role) |
| **Total** | **27** | (of Postgres default 100; leaves headroom for superadmin, monitoring) |

Implementation: Create three `DrizzleLive` Layer variants (`DrizzleCoreLive`, `DrizzleAgentsLive`, `DrizzleBackgroundLive`) each backed by a separate `pg.Pool` with the configured `max` connections. Domain `layer.ts` files provide the appropriate pool.

### Mechanism 3: Domain-Level Circuit Breakers

For external dependencies that can hang or fail repeatedly, wrap calls in a circuit breaker built from Effect primitives (Ref + Schedule).

| Dependency | Failure Threshold | Open Duration | Half-Open Probes |
|------------|-------------------|---------------|-----------------|
| NATS JetStream | 5 failures in 30s | 30s | 1 probe |
| Redis | 5 failures in 15s | 15s | 1 probe |
| Centrifugo API | 3 failures in 30s | 60s | 1 probe |
| Jira API | 3 failures in 60s | 120s | 1 probe |
| Slack API | 3 failures in 60s | 120s | 1 probe |
| Telegram API | 3 failures in 60s | 120s | 1 probe |

```typescript
// packages/shared/src/circuit-breaker.ts
// Circuit breaker states: Closed -> Open -> HalfOpen -> Closed
// Implemented via Effect.Ref tracking failure count + last failure time
// When open: fail fast with CircuitOpenError (no retry, no resource consumption)
// When half-open: allow 1 probe; success -> close, failure -> re-open
```

### Cascade Prevention Summary

```
Request arrives at auth route
  -> Auth semaphore (20 permits) gates entry
    -> DrizzleCoreLive pool (15 connections) serves the query
      -> If auth query is slow, it consumes 1 of 20 permits + 1 of 15 connections
      -> At 20 concurrent slow auth requests: new auth requests queue (10s timeout)
      -> But tasks/projects/goals/notes are unaffected (different semaphore + same pool but separate permit budget)
      -> And notifications/integrations are fully isolated (different pool entirely)
```

### Rationale

- **Semaphores over separate processes**: ctrlpane runs as a single Bun process. Effect semaphores provide process-internal isolation without the operational complexity of separate microservices.
- **Connection pool segmentation**: The most common cascade failure mode is one domain running slow queries and exhausting the connection pool. Segmenting pools makes this impossible — a runaway integration query cannot starve the auth domain.
- **Circuit breakers for external deps only**: Internal infrastructure (Postgres, Redis) should retry and reconnect; external APIs (Jira, Slack) should fail fast when they're down to avoid holding semaphore permits.

### Alternatives Considered

1. **Separate Bun processes per domain** — Rejected. Adds process management complexity, IPC overhead, and deployment surface. The monolith is intentional (ADR-003). Application-level isolation via semaphores achieves the same goal.
2. **Single global connection pool with priority queuing** — Rejected. Priority queuing is complex to implement correctly and doesn't prevent starvation as reliably as hard pool segmentation.
3. **No bulkheads (rely on Postgres and NATS built-in limits)** — Rejected. Postgres connection limits are global (not per-domain), and NATS backpressure only protects the messaging layer, not the database layer.

---

## Decision 4: SPOF Acceptance Register

### Decision

Maintain a machine-readable SPOF register as a YAML file at `docs/operations/spof-register.yaml`, reviewed quarterly. Each entry documents the SPOF, its blast radius, accepted risk level, compensating controls, and conditions that would trigger mitigation investment.

### Register Format

```yaml
# docs/operations/spof-register.yaml
# SPOF Acceptance Register — ctrlpane
# Review cadence: Quarterly (next: 2026-06-12)
# Owner: Anshul
# Last reviewed: 2026-03-12

entries:
  - id: SPOF-001
    component: "Kali Mini PC (i7-12700H)"
    category: hardware
    description: >
      Single Linux server runs all production services. Hardware failure
      takes down production but development continues on Mac Studio.
    blast_radius: "Production outage; dev environment on Mac Studio unaffected"
    probability: low          # dedicated server hardware
    impact: critical          # all production users lose access
    risk_score: medium        # low probability * critical impact
    accepted: true
    accepted_by: Anshul
    accepted_date: 2026-03-12
    compensating_controls:
      - "Automated Postgres backups to Google Drive (daily pg_dump + continuous WAL archiving)"
      - "Redis RDB snapshots to Google Drive (daily)"
      - "NATS JetStream file store snapshots to Google Drive (daily)"
      - "systemd auto-restart on service crash"
      - "Dev environment on Mac Studio can serve as emergency fallback"
      - "Cloudflare tunnel auto-reconnects on host reboot"
    recovery_procedure: |
      1. If disk failure: rebuild from Google Drive backups on replacement drive
      2. If total hardware failure: provision new Linux host, restore Postgres from
         Google Drive backup, rebuild Redis from Postgres state, NATS replays from outbox
      3. Estimated RTO: 4-8 hours (hardware procurement) + 1-2 hours (restore)
      4. Estimated RPO: 24 hours (daily backups), lower for Postgres WAL
    upgrade_trigger: >
      When monthly active users exceed 50 OR revenue exceeds $500/mo,
      evaluate migration to a secondary host with Postgres streaming replication.

  - id: SPOF-002
    component: "Cloudflare Tunnel"
    category: network
    description: >
      Single Cloudflare tunnel on Kali provides all external connectivity.
      Cloudflare outage or tunnel misconfiguration blocks all access.
    blast_radius: "External access lost; internal/local access unaffected"
    probability: very_low     # Cloudflare's global SLA
    impact: high              # external users and agents cannot connect
    risk_score: low
    accepted: true
    accepted_by: Anshul
    accepted_date: 2026-03-12
    compensating_controls:
      - "Local network access remains functional (development, local agents)"
      - "Cloudflare status page monitoring with alert"
      - "Tunnel auto-reconnects after transient failures"
    recovery_procedure: |
      1. Check Cloudflare status page
      2. If tunnel process crashed: systemd auto-restarts it
      3. If Cloudflare outage: wait for resolution (no local mitigation)
    upgrade_trigger: >
      If Cloudflare experiences >2 outages per quarter affecting ctrlpane,
      evaluate Tailscale or WireGuard as backup tunnel.

  - id: SPOF-003
    component: "Single Postgres Instance"
    category: data
    description: >
      One Postgres 17 instance serves all 8 domains. Instance failure
      loses all database access. No streaming replica.
    blast_radius: "All read/write operations fail; API returns 503"
    probability: very_low     # Postgres is mature; runs on reliable hardware
    impact: critical
    risk_score: low
    accepted: true
    accepted_by: Anshul
    accepted_date: 2026-03-12
    compensating_controls:
      - "Connection pool segmentation limits blast radius per domain (Decision 3)"
      - "Continuous WAL archiving to Google Drive via rclone"
      - "Daily pg_dump full backup to Google Drive via rclone"
      - "Monthly restore drill (required by deployment architecture)"
      - "Graceful degradation: API returns cached data from Redis for reads where possible"
    recovery_procedure: |
      1. Postgres process crash: launchd/Docker restarts automatically
      2. Data corruption: point-in-time recovery from WAL archive
      3. Full disk: alert at 80% threshold; extend volume or purge old data
    upgrade_trigger: >
      When write throughput exceeds 1000 TPS sustained OR when RPO requirement
      drops below 5 minutes, add a streaming replica.

  - id: SPOF-004
    component: "Single Bun API Process"
    category: application
    description: >
      One Bun process serves all API traffic. Process crash or OOM
      interrupts all requests in flight.
    blast_radius: "All API requests fail until process restarts"
    probability: low          # Bun is stable; Effect.ts prevents unhandled exceptions
    impact: high
    risk_score: medium
    accepted: true
    accepted_by: Anshul
    accepted_date: 2026-03-12
    compensating_controls:
      - "systemd Restart=on-failure restarts process within 5-10 seconds"
      - "Graceful shutdown handler drains in-flight requests on SIGTERM"
      - "Effect.ts structured concurrency prevents unhandled promise rejections"
      - "Memory limit alert at 80% of allocated RSS"
      - "Health check endpoint polled every 60s by Cloudflare and every 5min by GitHub Actions cron"
    recovery_procedure: |
      1. Process crash: systemd restarts automatically (RestartSec=5s)
      2. OOM: systemd restarts; investigate memory leak via heap snapshot
      3. Stuck process: health check fails -> Cloudflare alerts -> manual restart via systemctl
    upgrade_trigger: >
      When p99 latency during restart exceeds user tolerance (>5s)
      OR when request volume requires zero-downtime deploys,
      add a second process behind Caddy load balancer.

  - id: SPOF-005
    component: "Single Redis Instance"
    category: cache
    description: >
      One Redis 7 instance handles sessions, rate limiting, and ephemeral state.
      Instance failure degrades but should not hard-fail the system.
    blast_radius: "Rate limiting disabled; session cache cold; increased DB load"
    probability: very_low
    impact: medium            # degraded, not down
    risk_score: low
    accepted: true
    accepted_by: Anshul
    accepted_date: 2026-03-12
    compensating_controls:
      - "Fail-open rate limiting: if Redis down, use in-memory approximate counters"
      - "Sessions validated against Postgres (Redis is cache, not source of truth)"
      - "RDB snapshots daily to Google Drive via rclone"
      - "Docker restart policy: always"
    recovery_procedure: |
      1. Redis process crash: Docker restarts automatically
      2. Data loss: warm cache rebuilds from Postgres on demand
      3. Persistent failure: API continues with degraded rate limiting
    upgrade_trigger: >
      If cache miss rate causes Postgres query latency to exceed SLO,
      add Redis Sentinel or a second instance.

  - id: SPOF-006
    component: "Single NATS Instance"
    category: messaging
    description: >
      One NATS server with JetStream. Instance failure blocks event publishing
      but does not lose events (outbox retains them in Postgres).
    blast_radius: "Event delivery delayed; side effects (notifications, gamification) paused"
    probability: very_low     # NATS is extremely stable; single binary
    impact: medium            # core CRUD unaffected; async side effects delayed
    risk_score: low
    accepted: true
    accepted_by: Anshul
    accepted_date: 2026-03-12
    compensating_controls:
      - "Transactional outbox retains all events in Postgres until published"
      - "Outbox poller circuit breaker stops hammering NATS when it's down"
      - "On NATS recovery, poller catches up automatically (no manual intervention)"
      - "Docker restart policy: always"
    recovery_procedure: |
      1. NATS crash: Docker restarts; JetStream recovers from file store
      2. Prolonged outage: outbox accumulates; on recovery, poller drains backlog
      3. File store corruption: recreate stream; outbox replays all pending events
    upgrade_trigger: >
      If event delivery latency SLO requires <1s end-to-end,
      add a second NATS node in clustered mode.
```

### Review Process

- **Quarterly review**: Walk through each entry. Update probability/impact based on incidents. Evaluate upgrade triggers against current metrics.
- **Incident-triggered review**: Any incident caused by a registered SPOF triggers an immediate review of that entry and its upgrade trigger.
- **New SPOF registration**: When adding new infrastructure or external dependencies, add an entry before deployment.

### Rationale

- **YAML over Markdown table**: Machine-readable for future automation (dashboard rendering, metric-based upgrade trigger evaluation). Still human-readable.
- **Upgrade triggers are quantitative**: "When X exceeds Y" is actionable; "when it becomes a problem" is not.
- **Compensating controls are specific**: Each control references an existing mechanism (outbox, connection pools, launchd), not aspirational mitigations.
- **Blast radius per SPOF**: Makes it clear that NATS failure is "delayed side effects" while Postgres failure is "total outage" — very different severity despite both being infrastructure.

### Alternatives Considered

1. **Risk register in a spreadsheet** — Rejected. Not version-controlled; cannot be reviewed in PRs.
2. **Entries inside the existing production checklist** — Rejected. SPOFs are operational concerns, not feature-level checklist items. They need their own lifecycle (quarterly review, upgrade triggers).
3. **No formal register (address SPOFs when they cause incidents)** — Rejected. The entire point is conscious acceptance before incidents occur.

---

## Decision 5: Deployment and Rollback Strategy

> **Superseded:** This decision has been replaced by [ADR-008 CI/CD Deployment](./ADR-008-cicd-deployment.md), which moves production to Kali Linux with systemd, GitHub Actions CI/CD, and Changesets versioning. The content below is retained for historical context. ADR-007 Decisions 1-4 remain active and unchanged.

### Decision

Use **launchd** as the production process manager for the Bun API on macOS, with a **Git-tag-based release** workflow and a **three-phase deployment** process that separates database migration from application deployment. Rollback is achieved by deploying a previous Git tag.

### Process Management: launchd

The Bun API process runs natively (not containerized) on macOS. `launchd` is the native macOS service manager with automatic restart, log management, and boot-time startup.

```xml
<!-- ~/Library/LaunchAgents/com.ctrlpane.api.plist -->
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.ctrlpane.api</string>
  <key>ProgramArguments</key>
  <array>
    <string>/Users/anshul/.bun/bin/bun</string>
    <string>run</string>
    <string>start</string>
  </array>
  <key>WorkingDirectory</key>
  <string>/Users/anshul/projects/personal/ctrlpane</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>NODE_ENV</key>
    <string>production</string>
    <key>PORT</key>
    <string>33001</string>
  </dict>
  <key>KeepAlive</key>
  <true/>
  <key>RunAtLoad</key>
  <true/>
  <key>StandardOutPath</key>
  <string>/Users/anshul/logs/ctrlpane/api.stdout.log</string>
  <key>StandardErrorPath</key>
  <string>/Users/anshul/logs/ctrlpane/api.stderr.log</string>
  <key>ThrottleInterval</key>
  <integer>5</integer>
</dict>
</plist>
```

### Infrastructure Services: Docker Compose

Postgres, Redis, NATS, and Centrifugo continue to be managed by Docker Compose (already decided in ADR-001). Docker's `restart: always` policy handles crashes. Docker Compose is started via a separate launchd agent.

### Deployment Process: Three Phases

Every deployment follows these three phases. Phases are separated by a verification step to catch issues early.

```
Phase 1: EXPAND (database migration)
  1. git pull origin main
  2. bun install
  3. bun run db:migrate          # Drizzle runs expand migration under ctrlpane_migrator role
  4. Verify: bun run db:verify   # Check migration applied cleanly
  5. DO NOT proceed if verification fails — rollback migration if needed

Phase 2: DEPLOY (application code)
  1. git tag v$(date +%Y%m%d.%H%M%S)   # Tag the release
  2. launchctl kickstart -k gui/$(id -u)/com.ctrlpane.api  # Restart API process
  3. Verify: curl -sf http://localhost:3000/health
  4. Verify: check structured logs for startup errors
  5. Verify: run smoke tests (bun run test:smoke)
  6. If any verification fails: rollback (see below)

Phase 3: CONTRACT (cleanup migration — separate deployment, days/weeks later)
  1. Confirm new code has been stable for >= 1 deployment cycle
  2. bun run db:migrate          # Drizzle runs contract migration (drop old columns/tables)
  3. This phase is irreversible — only run after confidence in the expand phase
```

### Rollback Procedure

| Scenario | Rollback Action | Estimated Time |
|----------|----------------|----------------|
| Bad application code (Phase 2) | `git checkout v{previous-tag} && bun install && launchctl kickstart -k gui/$(id -u)/com.ctrlpane.api` | < 1 minute |
| Bad expand migration (Phase 1) | Run reverse migration: `bun run db:rollback` (Drizzle down migration) | < 2 minutes |
| Bad contract migration (Phase 3) | **Cannot rollback** — this is why contract runs only after expand is proven stable | N/A |
| Process won't start after deploy | launchd auto-restarts; if persistent, rollback to previous tag | < 1 minute |

### Deployment Script

```bash
#!/bin/bash
# scripts/deploy.sh — orchestrates the three-phase deployment
set -euo pipefail

PHASE="${1:?Usage: deploy.sh [expand|deploy|contract|rollback]}"
PREVIOUS_TAG=$(git describe --tags --abbrev=0 2>/dev/null || echo "none")

case "$PHASE" in
  expand)
    echo "Phase 1: EXPAND — running database migration"
    git pull origin main
    bun install --frozen-lockfile
    bun run db:migrate
    bun run db:verify
    echo "Expand complete. Run 'deploy.sh deploy' when ready."
    ;;
  deploy)
    echo "Phase 2: DEPLOY — restarting application"
    TAG="v$(date +%Y%m%d.%H%M%S)"
    git tag "$TAG"
    echo "Tagged: $TAG (previous: $PREVIOUS_TAG)"
    launchctl kickstart -k "gui/$(id -u)/com.ctrlpane.api"
    sleep 3
    if curl -sf http://localhost:3000/health > /dev/null; then
      echo "Health check passed. Running smoke tests..."
      bun run test:smoke
      echo "Deploy complete: $TAG"
    else
      echo "Health check FAILED. Rolling back to $PREVIOUS_TAG"
      git checkout "$PREVIOUS_TAG"
      bun install --frozen-lockfile
      launchctl kickstart -k "gui/$(id -u)/com.ctrlpane.api"
      git tag -d "$TAG"
      exit 1
    fi
    ;;
  contract)
    echo "Phase 3: CONTRACT — running cleanup migration"
    echo "WARNING: This is irreversible. Ensure expand has been stable."
    read -p "Continue? (y/N) " -n 1 -r
    echo
    [[ $REPLY =~ ^[Yy]$ ]] || exit 0
    bun run db:migrate
    echo "Contract complete."
    ;;
  rollback)
    echo "Rolling back to: $PREVIOUS_TAG"
    git checkout "$PREVIOUS_TAG"
    bun install --frozen-lockfile
    launchctl kickstart -k "gui/$(id -u)/com.ctrlpane.api"
    echo "Rollback complete. Verify with: curl http://localhost:3000/health"
    ;;
esac
```

### Rationale

- **launchd over PM2**: launchd is the native macOS process manager. It handles boot-time startup, automatic restart (KeepAlive), and log rotation without installing additional software. PM2 adds a Node.js dependency and a long-running daemon process — unnecessary overhead when launchd provides the same capabilities natively.
- **launchd over process-compose**: process-compose is designed for development orchestration (managing multiple processes together). In production, the API process lifecycle should be managed by the OS init system, and infrastructure services by Docker. Mixing process-compose into production adds a non-standard layer.
- **Git tags over Docker images**: The Bun API runs natively (not containerized). Git tags provide immutable release identifiers without requiring a Docker build step. `git checkout v{tag}` is the rollback mechanism.
- **Three-phase separation**: Expand/contract is already the migration strategy (development conventions). Making the separation explicit in the deploy script prevents accidental contract migrations before the code is stable.
- **Script over CI/CD**: ADR-001 states "No CI/CD — pre-commit hooks ARE the quality gates." The deployment script is manually triggered but automated in execution. This fits the single-operator home lab model.

### Alternatives Considered

1. **PM2** — Rejected. Adds a Node.js process manager dependency. PM2's clustering mode (multi-process) is unnecessary for a single Bun process. PM2's `startup` command generates a launchd plist anyway — using launchd directly is simpler.
2. **Docker for the API process** — Rejected. Containerizing adds build time, image management, and a layer of indirection for debugging. Native Bun execution is faster to deploy and easier to inspect.
3. **systemd** — Not available on macOS. Would be the choice on Linux.
4. **Fully automated CI/CD pipeline** — Deferred. Pre-commit hooks are the quality gates. When the project has multiple contributors or a staging environment, invest in GitHub Actions.

---

## Consequences

### Good

- **Consistent retry behavior**: Three tiers cover all infrastructure boundaries with predictable timing. Developers pick a tier, not design a custom policy.
- **Backpressure prevents cascades**: Pull-based consumers and bounded concurrency mean the system degrades gracefully under load rather than falling over.
- **Bulkhead isolation**: Connection pool segmentation + semaphores ensure one domain's failure cannot exhaust resources for others.
- **Conscious risk acceptance**: SPOF register makes every single point of failure visible with quantitative upgrade triggers.
- **Simple deployment**: One script, three phases, sub-minute rollback. No CI/CD infrastructure to maintain.

### Bad

- **Three connection pools increase total Postgres connections**: 27 reserved connections (vs ~15 with a single pool). Acceptable given Postgres default of 100.
- **Semaphore permits need tuning**: Initial values are estimates. Will need adjustment based on production load patterns.
- **launchd plist files are verbose XML**: Less ergonomic than PM2's JSON config. Mitigated by the deploy script abstracting launchctl commands.
- **No zero-downtime deploy**: Restarting the Bun process causes 2-5 seconds of downtime. Acceptable for a home lab with a single user (upgrade trigger documented in SPOF-004).

---

## More Information

- [ADR-008 CI/CD Deployment](./ADR-008-cicd-deployment.md) — supersedes Decision 5
- [ADR-001 Tech Stack](./ADR-001-tech-stack.md) — infrastructure choices and port conventions
- [ADR-006 Event Architecture](./ADR-006-event-architecture.md) — outbox pattern, NATS JetStream configuration
- [Production Governance](../architecture/production-governance.md) — Bronze/Silver/Gold tiers
- [Production Checklist](../architecture/production-checklist.md) — reliability and deployability items
- [Data Model](../architecture/data-model.md) — outbox table schema, connection pool roles
- [Development Conventions](../guides/development-conventions.md) — expand/contract migration rules
- [AWS Builders Library: Timeouts, retries, and backoff with jitter](https://aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter/)
- [NATS JetStream Consumers](https://docs.nats.io/nats-concepts/jetstream/consumers)
- [NATS Pull Consumer Limits](https://natsbyexample.com/examples/jetstream/pull-consumer-limits/go)
- [Effect.ts Scheduling Documentation](https://effect.website/docs/scheduling/examples/)
- [Effect.ts Retrying Documentation](https://effect.website/docs/error-management/retrying/)
- [Expand and Contract Pattern](https://www.prisma.io/dataguide/types/relational/expand-and-contract-pattern)
- [Bulkhead Pattern — Azure Architecture Center](https://learn.microsoft.com/en-us/azure/architecture/patterns/bulkhead)
- [Bun with PM2](https://bun.com/docs/guides/ecosystem/pm2)
- [macOS launchd Documentation](https://developer.apple.com/library/archive/documentation/MacOSX/Conceptual/BPSystemStartup/Chapters/CreatingLaunchdJobs.html)
