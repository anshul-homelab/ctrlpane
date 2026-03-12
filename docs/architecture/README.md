# Architecture Overview

> ctrlpane is a standalone project management and notes application designed for AI-first workflows, deployed independently at ctrlpane.com.

## System Overview

ctrlpane is a full-stack web application providing Jira-like project management, goal tracking, note-taking, and deep AI agent integration. It is deployed on a home lab (Mac Studio) with Cloudflare tunnel exposing it at `ctrlpane.com`.

The system is multi-tenant from day one with row-level security (RLS) enforced at the database level. It supports multiple users per tenant with role-based access control (RBAC).

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Runtime** | Bun | JavaScript/TypeScript runtime, package manager, test runner |
| **Language** | TypeScript (strict) | End-to-end type safety |
| **API Framework** | Hono.js | Lightweight HTTP framework with middleware |
| **Effect System** | Effect.ts | Typed errors, dependency injection, resource management |
| **Frontend** | React 19 | UI library |
| **Routing** | TanStack Router | Type-safe file-based routing |
| **Data Fetching** | TanStack Query | Server state management with caching |
| **Database** | PostgreSQL 17 | Primary data store with RLS |
| **ORM** | Drizzle ORM | Type-safe SQL builder and migrations |
| **Cache** | Redis | Session cache, rate limiting, ephemeral state |
| **Messaging** | NATS JetStream | Event streaming, transactional outbox |
| **Realtime** | Centrifugo | WebSocket server for live updates |
| **MCP Server** | Custom (Hono middleware) | Model Context Protocol for AI agent tools |

## Architecture Principles

### Multi-Tenant by Default
Every database table includes a `tenant_id` column. PostgreSQL RLS policies ensure queries are automatically scoped to the current tenant. The tenant context is extracted from the authenticated session and injected into every database query.

### Multi-User with RBAC
Users belong to tenants and have roles that determine their permissions. Roles are evaluated at the API layer before executing operations. Agent API keys also carry role context.

### 3-Layer Domain Pattern
Every domain follows a consistent structure:

```
routes.ts       -- HTTP endpoint definitions (Hono routes)
  -> service.ts    -- Business logic (Effect.ts layers)
    -> repository.ts  -- Database queries (Drizzle ORM)
```

- **Routes**: Input validation (Zod), authentication, authorization, HTTP response formatting
- **Service**: Business rules, event publishing, cross-domain coordination
- **Repository**: Pure database operations, query building, transaction management

### Event-Driven Architecture
Domain events are published to NATS JetStream using a transactional outbox pattern:

1. Business operation writes to the database within a transaction
2. An outbox record is written in the same transaction
3. An outbox poller publishes pending events to NATS JetStream
4. Consumers process events asynchronously (notifications, gamification, integrations)

This guarantees at-least-once delivery without distributed transactions.

### API-First
All functionality is accessible via REST API and MCP tools:
- **REST API**: Standard CRUD endpoints for web UI and external integrations
- **MCP Server**: Model Context Protocol tools for AI agent access
- Both share the same service layer — the API and MCP surfaces are thin adapters

### Realtime Updates
Centrifugo provides WebSocket-based realtime updates:
- Task status changes appear instantly across all connected clients
- Agent activity (session start, task claims, completions) streams live
- Terminal output from active agents can be viewed in real-time
- Channel structure: `tenant:<id>`, `project:<id>`, `agent:<session_id>`

## Deployment Architecture

```
Internet
  -> Cloudflare Tunnel
    -> ctrlpane.com
      -> Caddy (reverse proxy, TLS termination)
        -> ctrlpane-api  (Bun, port 3000)
        -> ctrlpane-web  (Bun, port 3001)
        -> Centrifugo    (port 38000)
      -> PostgreSQL      (port 35432)
      -> Redis           (port 36379)
      -> NATS            (port 34222)
```

### Port Convention

All ctrlpane services use port prefix `3`:

| Service | Port | Standard Port |
|---------|------|---------------|
| API | 3000 | 3000 |
| Web | 3001 | 3001 |
| PostgreSQL | 35432 | 5432 |
| Redis | 36379 | 6379 |
| NATS | 34222 | 4222 |
| NATS Management | 38222 | 8222 |
| Centrifugo | 38000 | 8000 |

### Infrastructure
- **Host**: Mac Studio (home lab)
- **Containers**: Docker Compose for all services
- **Process Management**: process-compose for development
- **Tunnel**: Cloudflare tunnel for public access at ctrlpane.com
- **Backups**: Automated PostgreSQL backups to external storage
- **Monitoring**: Structured logging, health checks, basic metrics

## Repository Structure

```
ctrlpane/
  AGENTS.md              -- Agent onboarding contract
  CLAUDE.md              -- Compatibility pointer to AGENTS.md
  apps/
    api/                 -- Backend API (Hono.js + Effect.ts)
      src/
        domains/         -- Domain modules
          auth/          -- Authentication, sessions, RBAC
          tasks/         -- Task management
          projects/      -- Project management, milestones, workflows
          goals/         -- Goals, planning, rituals, sprints
          notes/         -- Note-taking, folders, FTS
          agents/        -- Agent sessions, leasing, terminal capture
          notifications/ -- Telegram, Slack, email
          integrations/  -- External service connections
        db/
          schema/        -- Drizzle schema definitions
          migrations/    -- Database migrations
        mcp/             -- MCP server and tool definitions
    web/                 -- Frontend (React 19 + TanStack)
      src/
        components/      -- UI components by domain
        routes/          -- File-based routes
  packages/
    shared/              -- Shared types, schemas, constants
  docs/
    specs/               -- Feature specifications
    architecture/        -- Architecture documentation
  docker-compose.yml     -- Service orchestration
  process-compose.yml    -- Development process management
```

## Security Model

### Authentication
- Session-based auth for web UI (httpOnly cookies)
- API key auth for agent and external access
- SSO integration (future: OIDC/SAML for enterprise tenants)

### Authorization
- Tenant isolation via PostgreSQL RLS (enforced at DB level, not just application)
- Role-based access control checked at route/middleware level
- Agent API keys scoped to specific tenants and roles

### Data Protection
- All data encrypted at rest (PostgreSQL with disk encryption)
- TLS everywhere (Cloudflare tunnel + Caddy)
- Sensitive fields (API keys, tokens) encrypted in the database
- Audit logging for all write operations

## knowledgebase Integration

ctrlpane integrates with **[knowledgebase](https://github.com/anshulbisen/knowledgebase)** — a standalone, multi-tenant knowledge base service with workspace-based isolation. knowledgebase runs as a companion service alongside ctrlpane and LifeOS on the same home lab infrastructure.

### Workspace

ctrlpane creates a **`ctrlpane-project`** workspace in knowledgebase for project knowledge:
- Architecture decisions and design rationale
- Engineering preferences and conventions
- Learnings and retrospective insights
- Reusable patterns and reference material

### Integration Pattern

- **REST API:** Service-to-service integration with API key authentication. ctrlpane backend calls knowledgebase API to create, search, and query knowledge entries.
- **MCP tools:** AI agents working in ctrlpane can search project knowledge via the knowledgebase MCP server (mounted alongside ctrlpane's MCP server).
- **NATS events:** knowledgebase publishes to `KNOWLEDGEBASE_EVENTS` stream. ctrlpane can subscribe for knowledge-related side effects.

### Port Convention

knowledgebase uses port prefix `4`:

| Service | Port |
|---------|------|
| API | 43001 |
| PostgreSQL | 45432 |

---

## Related Documentation

- [Domain Map](./domains.md) — detailed domain descriptions and boundaries
- [Task Management](../specs/task-management.md) — task domain spec
- [Project Management](../specs/project-management.md) — project domain spec
- [Goals & Planning](../specs/goals-and-planning.md) — goals domain spec
- [Notes](../specs/notes.md) — notes domain spec
- [AI Agent Integration](../specs/ai-agent-integration.md) — agent contract and MCP spec
