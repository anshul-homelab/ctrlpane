# Deployment Architecture

> **Date:** 2026-03-12 | **Status:** Draft
> **Scope:** Physical deployment model, service topology, networking, backup, and disaster recovery for ctrlpane
> **Supersedes:** ADR-007 Decision 5 (single-machine Mac Studio model with launchd). ADR-007's resilience patterns (Decisions 1-4) remain valid and are unchanged.
> **Related:** [ADR-001 Tech Stack](../decisions/ADR-001-tech-stack.md), [ADR-007 Resilience & Deployment](../decisions/ADR-007-resilience-and-deployment.md), [ADR-008 CI/CD Deployment](../decisions/ADR-008-cicd-deployment.md), [CI/CD Design](./cicd-design.md)

---

## 1. Deployment Model

ctrlpane runs on a two-machine home lab topology. The Mac Studio serves as the development environment and AI inference host. The Kali Mini PC serves as the production host, CI/CD runner, and backup agent. This separation ensures production stability during active multi-agent development.

Docker manages backing services (Postgres, Redis, NATS, Centrifugo) on both machines. Application processes (API, Web) run natively via Bun — managed by process-compose in development and systemd in production.

### Process Management

| Manager | Machine | Scope | Restart Policy |
|---------|---------|-------|---------------|
| **process-compose** | Mac Studio | Development orchestration (all services + infra) | `on_failure`, max 3 restarts, 2s backoff |
| **systemd** | Kali | Production app servers (API, Web) | `Restart=on-failure`, `RestartSec=5s` |
| **Docker Compose** | Both | Backing services (Postgres, Redis, NATS, Centrifugo) | `unless-stopped` |

**systemd** is the production supervisor on Kali. Service units live in `homelab/systemd/` and are installed via `bootstrap.sh`. systemd auto-restarts crashed processes, starts services at boot, and integrates with journald for log management.

**process-compose** is the development orchestrator on Mac Studio. It manages the full startup sequence (port cleanup, infra, API, web) with dependency ordering and health checks. Invoked via `bun run dev`.

---

## 2. Two-Machine Topology

```
+--------------- Mac Studio (M4 Max, 128GB) ----------------+
|                                                             |
|  DEV ENVIRONMENT                                            |
|  +-- Dev app servers (Bun)         :33000 web, :33001 API   |
|  +-- Dev Postgres/Redis/NATS       :35432, :36379, :34222   |
|  +-- Dev Centrifugo                :38000                    |
|  +-- process-compose orchestrator                            |
|  +-- Agent worktrees (shared dev infra)                      |
|                                                             |
|  AI INFERENCE (shared with LifeOS)                          |
|  +-- Ollama                        :11434                    |
|  +-- vllm-mlx                      :18000                    |
|                                                             |
|  OBSERVABILITY (shared, env-labeled)                        |
|  +-- Grafana                       :13030                    |
|  +-- Loki                          :13100                    |
|  +-- Alloy (OTLP collector)        :14317                    |
|  +-- Prometheus                    :19090                    |
|                                                             |
|  (Dev servers NOT exposed -- localhost only)                  |
+-------------------------------------------------------------+
          | LAN (AI inference calls, telemetry forwarding)
          |
+--------------- Kali Mini PC (i7-12700H, 64GB) ------------+
|                                                             |
|  PRODUCTION                                                 |
|  +-- Prod app servers (Bun)        :33000 web, :33001 API   |
|  +-- Prod Postgres 17              :35432                    |
|  +-- Prod Redis 7                  :36379                    |
|  +-- Prod NATS JetStream           :34222                    |
|  +-- Prod Centrifugo               :38000                    |
|  +-- systemd service units                                   |
|                                                             |
|  TELEMETRY FORWARDING                                       |
|  +-- Alloy forwarder -> Mac Studio :14317                    |
|      (~30MB RAM, buffers if LAN drops)                       |
|                                                             |
|  CI/CD                                                      |
|  +-- GitHub Actions self-hosted runner (ctrlpane repo)       |
|  +-- Runner user: `runner` with sudoers for systemctl        |
|  +-- /opt/ctrlpane/ owned by `runner` user                   |
|  +-- Build + test + migrate + deploy (all local)             |
|                                                             |
|  PR PREVIEW ENVIRONMENTS (up to 3 concurrent)               |
|  +-- Preview slot 1                :34000 web, :34001 API    |
|  +-- Preview slot 2                :35000 web, :35001 API    |
|  +-- Preview slot 3                :36000 web, :36001 API    |
|                                                             |
|  TURBOREPO REMOTE CACHE                                     |
|  +-- ducktors/turborepo-remote-cache :39080                  |
|                                                             |
|  BACKUP AGENT                                               |
|  +-- rclone -> Google Drive (scheduled)                      |
|  +-- Local backup retention (last 10 dumps)                  |
|                                                             |
|  Cloudflare Tunnel:                                         |
|    ctrlpane.com              -> :33000                       |
|    api.ctrlpane.com          -> :33001                       |
|    preview-{N}.ctrlpane.com  -> :34000/:35000/:36000         |
+-------------------------------------------------------------+
          |
          | Internet (rclone sync)
          v
+--------------- Google Drive (2TB) -------------------------+
|  /ctrlpane-backups/                                         |
|  +-- pg-dumps/        (daily, 30 day retention)              |
|  +-- wal-archives/    (continuous, 7 day retention)          |
|  +-- redis-snapshots/ (daily, 7 day retention)               |
|  +-- nats-snapshots/  (daily, 7 day retention)               |
|  +-- secrets/         (encrypted, on-change)                 |
|  +-- git-bundles/     (daily, 5 versions)                    |
|  +-- builds/          (last 20 production builds)            |
+-------------------------------------------------------------+

EXTERNAL MONITORING (outside home lab power domain)
+-- Cloudflare Health Checks -> ctrlpane.com (60s interval)
+-- GitHub Actions cron -> curl health endpoint (5 min)
+-- Alerts -> Telegram
```

### Key Design Decisions

1. **Same port numbers on both machines.** Production and dev use the same ports (prefix `3`). No conflicts because they are on different machines. App code, Docker Compose files, and env configs are identical -- only the machine changes.

2. **AI inference stays on Mac Studio.** Kali's production API calls Mac Studio over LAN for AI features. ~1ms LAN latency is negligible when inference takes 2-10 seconds. Only Mac Studio has 128GB for running LLMs.

3. **Observability is shared but collectors are local.** Each machine runs its own Alloy collector. Both forward telemetry to Mac Studio's Grafana stack. One dashboard with `env=prod` / `env=dev` and `app=ctrlpane` labels.

4. **Cloudflare tunnel on Kali only.** `ctrlpane.com` routes to Kali (production). Dev servers on Mac Studio are never exposed externally.

5. **Complete data isolation.** Kali runs its own Postgres/Redis/NATS. Dev operations (bad migrations, `docker compose down`, crashes) cannot affect production.

6. **Shared infrastructure with LifeOS on Kali.** Both projects run on the same Kali machine but with completely separate databases, Redis instances, NATS streams, and systemd units. Port prefix `2` for LifeOS, prefix `3` for ctrlpane.

---

## 3. Environment Strategy

### Port Prefix Convention

All ctrlpane services use port prefix `3`, derived by prepending `3` to each technology's default port:

| Service | Port | Standard Port |
|---------|------|---------------|
| Web app (React/Vite) | 33000 | 3000 |
| API server (Hono.js) | 33001 | 3001 |
| PostgreSQL 17 | 35432 | 5432 |
| Redis 7 | 36379 | 6379 |
| NATS JetStream | 34222 | 4222 |
| NATS Management | 38222 | 8222 |
| Centrifugo v5 | 38000 | 8000 |

### Environment Differentiation

Instead of separate staging/production environments, behavioral differences are controlled via environment variables:

| Variable | Dev Value | Prod Value | Effect |
|----------|----------|-----------|--------|
| `NODE_ENV` | `development` | `production` | Log verbosity, Vite HMR, source maps |
| `LOG_LEVEL` | `debug` | `info` | Structured log filtering |
| `FEATURE_FLAGS` | (per-feature) | (per-feature) | Graduated rollout via `feature_flags` table |

systemd units set `NODE_ENV=production`. process-compose dev environment uses development defaults.

### Startup Validation

Every expected environment variable is declared in a Zod schema. The server fails fast at startup if any variable is missing or malformed. `EnvSchema.parse(process.env)` runs at import time -- before any request is served.

---

## 4. Service Topology

### Service Inventory

| Service | Runtime | Port | Dev Manager | Prod Manager |
|---------|---------|------|-------------|-------------|
| Web app | Vite dev / static build (Bun) | 33000 | process-compose | systemd (`ctrlpane-web.service`) |
| API server | Hono on Bun | 33001 | process-compose | systemd (`ctrlpane-api.service`) |
| Postgres 17 | Docker | 35432 | Docker Compose | Docker Compose |
| Redis 7 | Docker | 36379 | Docker Compose | Docker Compose |
| NATS JetStream | Docker | 34222 | Docker Compose | Docker Compose |
| Centrifugo v5 | Docker | 38000 | Docker Compose | Docker Compose |

### Shared Services (Not ctrlpane-specific)

These run on Mac Studio and are shared across all projects:

| Service | Port | Owner |
|---------|------|-------|
| vllm-mlx (AI inference) | 18000 | Shared |
| Ollama | 11434 | Shared |
| Grafana | 13030 | dev-infra stack |
| Loki | 13100 | dev-infra stack |
| Alloy (OTLP) | 14317 | dev-infra stack |
| Prometheus | 19090 | dev-infra stack |

---

## 5. Domain Routing

| Domain | Points to | Machine | Purpose |
|--------|-----------|---------|---------|
| `ctrlpane.com` | Kali :33000 | Kali | Production web app |
| `api.ctrlpane.com` | Kali :33001 | Kali | Production API |
| `preview-1.ctrlpane.com` | Kali :34000 | Kali | PR preview environment slot 1 |
| `preview-2.ctrlpane.com` | Kali :35000 | Kali | PR preview environment slot 2 |
| `preview-3.ctrlpane.com` | Kali :36000 | Kali | PR preview environment slot 3 |

- Dev servers are **not exposed** -- accessed via `localhost` on Mac Studio only.
- Kali's Cloudflare tunnel uses hostname-based ingress rules.
- ctrlpane and LifeOS share the same Kali machine but use different tunnels and domains.

---

## 6. Configuration Management

### Hierarchy

Configuration resolves in order: **env vars > `.env` file > Postgres `config` table > code defaults**. Higher sources override lower ones.

### Env File Convention

- `.env` lives at the monorepo root. Never committed to Git (`.gitignore`d).
- Bun loads `.env` from cwd. Workspace scripts use `--env-file=../../.env` to reference the root file.
- systemd units do NOT load `.env` -- they reference an `EnvironmentFile` in the unit definition, pointing to `/opt/ctrlpane/.env`.

---

## 7. Startup and Shutdown

### Startup Sequence (process-compose, Dev)

```
port-cleanup          Clean stale listeners on ports 33000-33020
    |
    v
dev-infra             Ensure shared observability stack (Grafana/Loki/Alloy)
    |
    v
infra                 Docker Compose up (Postgres, Redis, NATS, Centrifugo)
    |                 Waits for Docker daemon + container health checks
    v
api                   Hono server on Bun
    |                 Readiness probe: GET http://127.0.0.1:33001/health
    |                 Depends on: infra completed
    v
web                   Vite dev server
                      Readiness probe: curl http://localhost:33000/
                      Depends on: api healthy
```

### Production Startup (systemd, Kali)

systemd units define dependencies:

```
docker-compose@ctrlpane.service     (Postgres, Redis, NATS, Centrifugo)
    |
    v
ctrlpane-api.service                (Hono on Bun, port 33001)
    |
    v
ctrlpane-web.service                (Bun static server, port 33000)
```

### Graceful Shutdown

On SIGTERM (systemd stop, process-compose shutdown):

1. **Stop accepting** new connections (server returns 503 on `/health`).
2. **Drain in-flight** requests with a configurable timeout (default 10s).
3. **Close pools** -- Drizzle/Postgres connection pool, Redis client, NATS connection.
4. **Flush telemetry** -- OTLP pipeline flush to ensure traces/metrics are persisted.
5. **Exit** with code 0.

systemd `RestartSec=5s` prevents restart storms. process-compose `shutdown.timeout_seconds: 5` aligns with the drain window.

---

## 8. Networking and Exposure

### Cloudflare Tunnel

External access uses a Cloudflare Tunnel (`cloudflared`) on Kali connecting `ctrlpane.com` to local ports. No public-facing ports are opened on the Kali firewall.

```
Internet --> Cloudflare Edge --> cloudflared (Kali) --> localhost:33000 (web)
                                                   --> localhost:33001 (API)
```

**Benefits:**
- No port forwarding, no dynamic DNS, no public IP exposure.
- TLS termination at Cloudflare edge -- localhost traffic is plaintext (acceptable on loopback).
- Cloudflare Access policies for authentication before traffic reaches the application.
- DDoS protection and WAF at the edge layer.

### Internal Network

All Docker containers run on a bridge network with `127.0.0.1` port bindings. Container-to-container communication uses the Docker bridge. Application-to-container communication uses `localhost:{prefixed_port}`.

No service listens on `0.0.0.0` -- all bindings are `127.0.0.1` only.

---

## 9. Backup and Recovery

### Backup Strategy

| Service | Method | Frequency | Retention | Target |
|---------|--------|-----------|-----------|--------|
| Postgres | `pg_dump` | Daily | 30 days | Google Drive + local |
| Postgres | WAL archiving | Continuous | 7 days | Google Drive |
| Redis | RDB snapshot | Daily | 7 days | Google Drive + local |
| NATS JetStream | File store snapshot | Daily | 7 days | Google Drive + local |
| Secrets/env | `.env` file (encrypted) | On change | Versioned | Google Drive (rclone crypt) |
| Git bundle | Full repo | Daily | 5 versions | Google Drive |
| Production builds | Kali releases/ | Per deploy | Last 20 | Google Drive |

### Backup Tool

Backups are synced to Google Drive via **rclone** with encrypted secrets (rclone crypt remote). Scheduled via systemd timers on Kali.

### Recovery Targets

| Target | Value | Method |
|--------|-------|--------|
| **RTO** (Recovery Time Objective) | < 1 hour | Restore from most recent backup + replay WAL |
| **RPO** (Recovery Point Objective) | < 15 minutes | Continuous WAL archiving ensures max 15min data loss |

### Restore Procedure

1. **Postgres:** Restore `pg_dump` for logical backup or base backup + WAL replay for point-in-time recovery. Monthly drill required.
2. **Redis:** Restore from RDB snapshot. System degrades gracefully if Redis is lost entirely (auth fails closed, cache bypasses to Postgres, rate limiting uses in-memory approximation).
3. **NATS JetStream:** Restore file-backed store from snapshot. If stream data is lost, replay from the Postgres outbox table (events are retained until explicitly archived).
4. **Centrifugo:** No persistent state. Clients reconnect and resync from the API on recovery.

---

## 10. Monitoring and Health

### Health Check Endpoints

| Endpoint | Service | Checks | Returns |
|----------|---------|--------|---------|
| `GET /health` | API | Server alive | `200 { ok: true }` or `503` during shutdown |
| `GET /health/ready` | API | DB + Redis + NATS connectivity | `200 { db: true, redis: true, nats: true }` or `503` with failing components |
| `GET /health/live` | API | Process alive | `200 { ok: true }` |

### External Monitoring

| Monitor | Runs on | Checks | Alert channel |
|---------|---------|--------|---------------|
| Cloudflare Health Check | Cloudflare edge | HTTP GET `ctrlpane.com/health` every 60s | Email + webhook -> Telegram |
| GitHub Actions cron | GitHub infrastructure (NOT self-hosted) | `curl api.ctrlpane.com/health/ready` every 5 min | Telegram via bot API |

Both are free, run outside the home lab power domain, and continue alerting even during a total power outage.

---

## 11. Scaling Strategy

### Current: Vertical (Two Hosts)

The Mac Studio provides 128GB RAM for dev + AI inference. Kali provides 64GB RAM for production + CI. At current scale (multi-tenant but low traffic), this is vastly overprovisioned.

### Concurrency Model

| Component | Model | Details |
|-----------|-------|---------|
| API server | Bun event loop | Single-threaded async I/O; handles thousands of concurrent connections |
| Event consumers | `FOR UPDATE SKIP LOCKED` | Multiple worker instances can process outbox events concurrently |
| AI inference | vllm-mlx (Mac Studio) | Batched inference with continuous batching; GPU-bound |
| Database | Connection pool | Segmented pools per domain category (see ADR-007 Decision 3) |

---

## 12. Security

### Network Security

- **No public ports.** All external access via Cloudflare Tunnel (outbound connection from host).
- **Localhost binding.** All services bind `127.0.0.1`, not `0.0.0.0`.
- **Docker network isolation.** Containers on a bridge network. Port mappings expose only to localhost.
- **Cloudflare Access.** Authentication at the tunnel edge before traffic reaches the application.
- **Multi-tenant RLS.** PostgreSQL row-level security policies enforce tenant isolation at the database level.

### Secret Management

| Secret Type | Storage | Rotation |
|-------------|---------|----------|
| Database credentials | `.env` file (not in Git) | Quarterly |
| JWT signing key | `.env` file | 90 days with overlap period |
| Redis password | `.env` file | Quarterly |
| NATS credentials | `.env` file | Quarterly |
| Cloudflare Tunnel token | `.env` file | On compromise |
| Telegram bot token | `.env` file | On compromise |

Secrets never appear in logs (PII redaction enforced), config files committed to Git, or error responses.

---

## 13. Disaster Recovery

### Failure Scenarios

| Scenario | Impact | Recovery | Estimated Time |
|----------|--------|----------|---------------|
| **API process crash** | Service interruption | systemd auto-restart | < 10 seconds |
| **Docker container crash** | Backing service outage | Docker `unless-stopped` restart | < 30 seconds |
| **Kali reboot** | Full production outage | systemd starts all services at boot; Docker auto-starts | < 5 minutes |
| **Disk failure (Kali)** | Full data loss | Restore from Google Drive backups + WAL replay | < 1 hour (RTO target) |
| **Kali hardware failure** | Extended outage | Provision new machine, restore from backups | 4-8 hours |
| **Cloudflare Tunnel failure** | External access lost; local access unaffected | Restart cloudflared or recreate tunnel | < 15 minutes |
| **Mac Studio failure** | AI inference unavailable; dev down | Production unaffected (runs on Kali). AI features degrade. | Dev: restore from backup. AI: wait for hardware |

---

## 14. Data Isolation

ctrlpane shares the Kali machine with LifeOS but maintains complete data isolation:

| Resource | ctrlpane | LifeOS | Isolation |
|----------|----------|--------|-----------|
| Postgres | `ctrlpane` database, port 35432 | `lifeos` database, port 25432 | Separate Docker containers |
| Redis | Port 36379 | Port 26379 | Separate Docker containers |
| NATS | `CTRLPANE_EVENTS` stream, port 34222 | `LIFEOS_EVENTS` stream, port 24222 | Separate Docker containers |
| Centrifugo | Port 38000 | Port 28000 | Separate Docker containers |
| Filesystem | `/opt/ctrlpane/` | `/opt/lifeos/` | Separate directories |
| systemd units | `ctrlpane-*.service` | `lifeos-*.service` | Separate units |
| Cloudflare tunnel | `ctrlpane.com` | `sdfsdf.in` | Separate tunnel configs |
| GitHub runner | Shared runner, labeled `ctrlpane` | Shared runner, labeled `lifeos` | Job-level isolation |

A bad migration, restart, or crash in one project cannot affect the other.

---

## Cross-References

- [CI/CD Design](./cicd-design.md) -- Full release pipeline, branching strategy, preview environments
- [ADR-007 Resilience & Deployment](../decisions/ADR-007-resilience-and-deployment.md) -- Retry policies, backpressure, bulkheads, SPOF register
- [ADR-008 CI/CD Deployment](../decisions/ADR-008-cicd-deployment.md) -- Decision record for two-machine topology
- [Deployment Runbook](../runbooks/deployment.md) -- Operational commands and procedures
- [Architecture README](./README.md) -- System overview and tech stack
