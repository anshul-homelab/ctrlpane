# ADR-001: Tech Stack

- Status: accepted
- Date: 2026-03-12
- Decision-Makers: Anshul
- Consulted: LifeOS ecosystem patterns, industry research

## Context and Problem Statement

ctrlpane needs a technology stack for building a multi-tenant project management and notes platform with deep AI agent integration. The stack must support multi-agent parallel development, real-time collaboration, event-driven side effects, and deployment on a home lab (Mac Studio). It should share architectural knowledge with the LifeOS ecosystem for cross-project learning.

## Decision Drivers

- Multi-tenant from day one with strong data isolation
- AI-agent-friendly: self-documenting, explicit, small isolated units
- Real-time updates for agent activity monitoring and collaborative editing
- Event-driven architecture for decoupled domain interactions
- Bun-native (no Node.js-only dependencies)
- Flat-rate AI subscriptions only — no per-token billing
- Same stack as LifeOS ecosystem for shared knowledge and proven patterns

## Considered Options

1. Bun + Hono + Effect.ts + React 19 + Postgres + NATS (LifeOS-aligned stack)
2. Node.js + NestJS + Prisma + Next.js + Postgres + Redis Streams
3. Go backend + React frontend + Postgres + NATS

## Decision Outcome

Chosen option: "Bun + Hono + Effect.ts + React 19 + Postgres + NATS", because it provides the strongest type safety (Effect.ts typed errors + Zod + TypeScript strict), proven patterns from the LifeOS ecosystem, and maximum AI-agent compatibility (self-documenting Context.Tag DI, explicit error channels, structured concurrency).

### Full Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| **Runtime** | Bun | 3-10x faster than Node for installs/scripts, native ESM, built-in test runner |
| **Monorepo** | Bun workspaces + Turborepo | Workspace isolation + cached builds across apps |
| **Frontend** | React 19 + Vite 6 + TanStack Router/Query + Zustand v5 | Type-safe file-based routing, server state + client state separation |
| **Styling** | Tailwind CSS v4 + shadcn/ui | Utility-first + composable, ownable component primitives |
| **Backend** | Hono.js + Effect.ts | Lightweight Bun-native HTTP + structured concurrency, typed errors, DI, auto-observability |
| **Database** | Postgres 17 + Drizzle ORM | Battle-tested relational + type-safe zero-overhead ORM |
| **Cache** | Redis 7 | Sub-ms reads, distributed locks, rate limiting |
| **Events** | NATS JetStream | Durable, ordered, exactly-once delivery — lightweight alternative to Kafka |
| **Realtime** | Centrifugo v5 | Scalable WebSocket/SSE pub-sub with presence and history |
| **Schema Validation** | Zod v4 | Runtime validation + TypeScript type inference |
| **Observability** | Effect OTLP -> Grafana stack (Tempo + Prometheus + Loki) | Auto-instrumented traces/metrics/logs via Effect layers |
| **Formatting/Linting** | Biome | Single tool for lint + format, faster than ESLint + Prettier |

### Infrastructure

| Component | Details |
|-----------|---------|
| **Host** | Mac Studio (M4 Max, 128GB RAM) — runs all services 24/7 |
| **Deployment** | Docker Compose for services, Bun dev servers via launchd |
| **Tunnel** | Cloudflare Tunnel to `ctrlpane.com` |
| **CI/CD** | None — pre-commit hooks ARE the quality gates |
| **AI Agents** | Multiple Claude Code agents in parallel (sole code contributors) |
| **AI Billing** | Flat-rate subscriptions only — no per-token API billing |

### Port Convention

All ctrlpane services use port prefix `3`:

| Port | Service |
|------|---------|
| 3000 | API (Hono.js) |
| 3001 | Web (Vite dev server) |
| 35432 | PostgreSQL |
| 36379 | Redis |
| 34222 | NATS |
| 38222 | NATS Management |
| 38000 | Centrifugo |

### Consequences

**Good:**
- Shared knowledge with LifeOS ecosystem — patterns, conventions, and solutions transfer directly
- Effect.ts provides typed errors, structured concurrency, and auto-observability
- Bun-native stack eliminates Node.js compatibility issues
- NATS JetStream is lightweight (single binary, ~30MB memory) vs Kafka (~1GB+)
- Drizzle ORM is zero-overhead with full TypeScript inference

**Bad:**
- Effect.ts has a learning curve for new contributors (mitigated by explicit patterns in conventions docs)
- Bun ecosystem is smaller than Node.js (mitigated by ESM compatibility)
- Self-hosted infrastructure requires operational attention

## More Information

- [Development Conventions](../guides/development-conventions.md) — coding patterns and anti-patterns
- [Architecture Overview](../architecture/README.md) — system architecture
- [Production Governance](../architecture/production-governance.md) — enforcement pyramid
