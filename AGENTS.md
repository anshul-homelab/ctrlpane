# ctrlpane Agent Contract

This repository is designed for AI agents in general, not a single provider. Claude, Codex, Gemini, and other agent runtimes should treat this file as the canonical repository contract.

## Project Overview

ctrlpane is a standalone project management and notes application with AI agents as first-class citizens. It provides Jira-like project management, goal tracking, note-taking, and deep agent integration. Deployed independently at ctrlpane.com.

## Canonical Sources

- `AGENTS.md` — root contract (this file)
- `docs/architecture/README.md` — system architecture
- `docs/architecture/domains.md` — domain map and boundaries
- `docs/specs/` — feature specifications
- Provider-specific files (`CLAUDE.md`, `GEMINI.md`) are thin pointers back here

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Bun |
| Language | TypeScript (strict) |
| API | Hono.js |
| Effect System | Effect.ts |
| Frontend | React 19 + TanStack Router + TanStack Query |
| Database | PostgreSQL 17 (Drizzle ORM) |
| Cache | Redis |
| Messaging | NATS JetStream |
| Realtime | Centrifugo |
| Formatting/Linting | Biome |
| Testing | Bun test runner |

## Domain Structure

8 domains, each following the 3-layer pattern:

| Domain | Purpose |
|--------|---------|
| `auth` | Authentication, sessions, multi-tenant, RBAC |
| `tasks` | Personal task management, subtasks, recurrence |
| `projects` | Jira-like PM, milestones, workflows, sprints, gamification |
| `goals` | Goals, daily planning, rituals, cognitive sprints, day modes |
| `notes` | Note-taking, folders, FTS, AI analysis |
| `agents` | Agent sessions, leasing, MCP tools, terminal capture |
| `notifications` | Telegram, Slack, email delivery |
| `integrations` | Jira sync, Google Workspace, Slack, external connections |

## Development Conventions

### Code Organization

Every domain follows:
```
domains/<name>/
  routes.ts        -- Hono HTTP endpoints
  service.ts       -- Business logic (Effect.ts)
  repository.ts    -- Drizzle queries
  errors.ts        -- Domain-specific error types
```

### Formatting and Linting

- **Biome** for formatting and linting (not ESLint/Prettier)
- Run `bun run check` before committing
- No unused imports, no `any` types, strict TypeScript

### Testing

- **TDD**: Write tests before or alongside implementation
- Test runner: `bun test`
- Unit tests: service layer logic
- Integration tests: API endpoints with test database
- Test files: `*.test.ts` co-located with source

### Database

- All tables include `tenant_id` with RLS policies
- Migrations via Drizzle Kit (`bun run db:migrate`)
- UUIDs for all primary keys
- `created_at` / `updated_at` on all tables
- Transactional outbox for event publishing

### API Design

- REST endpoints under `/api/<domain>/`
- MCP tools for agent access
- Zod schemas for request/response validation
- Effect.ts for typed error handling
- Consistent error response format

### Git

- Conventional commits: `feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`
- Feature branches off `main`
- PR-based workflow

## Port Convention

All ctrlpane services use port prefix `3`:

| Service | Port |
|---------|------|
| API | 3000 |
| Web | 3001 |
| PostgreSQL | 35432 |
| Redis | 36379 |
| NATS | 34222 |
| NATS Management | 38222 |
| Centrifugo | 38000 |

## Multi-Agent Safety Rules

When multiple agents work concurrently:

1. **Lease before work**: Always claim a task via the leasing protocol before starting work
2. **Heartbeat regularly**: Send heartbeats every 15 minutes to maintain your lease
3. **Comment before status change**: Add a comment explaining what was done before transitioning status
4. **Respect boundaries**: Never modify files or tasks claimed by another agent
5. **Release on failure**: If you cannot complete a task, release the lease explicitly
6. **Scope to project**: Set your project context before operating on project-specific items
7. **Preserve changes**: Do not overwrite or revert work made by other agents or users

## Working Rules

- Preserve unexpected user changes. Do not overwrite or revert work you did not make.
- Update shared docs when changing repo-wide conventions or architecture.
- Prefer provider-agnostic wording in shared documentation.

## Start Here

1. `docs/architecture/README.md` — system architecture
2. `docs/architecture/domains.md` — domain map
3. `docs/specs/` — feature specifications
4. `docs/specs/ai-agent-integration.md` — agent contract and MCP tools
