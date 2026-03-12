# ADR-005: Agent-First Design

- Status: accepted
- Date: 2026-03-12
- Decision-Makers: Anshul
- Consulted: MCP specification, LifeOS agent integration patterns

## Context and Problem Statement

ctrlpane is designed to be used by both humans and AI agents. AI agents (Claude Code, Codex CLI, Gemini CLI) are first-class citizens that create tasks, claim work, report progress, and monitor other agents. The system must support concurrent agent sessions with lease-based coordination, full MCP tool access to every entity operation, and real-time monitoring of agent activity. How should we design the agent integration?

## Decision Drivers

- Every entity operation must be available via MCP tools (not just CRUD — also status transitions, comments, leasing)
- Multiple agents must work concurrently without conflicts (lease-based coordination)
- Humans need real-time visibility into what agents are doing (terminal output capture, activity feed)
- Agent sessions must be auditable (who did what, when, for how long)
- Agent API keys must be scoped to tenants and carry role context

## Considered Options

1. **Agent-first with MCP + leasing protocol** — dedicated agent domain, lease coordination, terminal capture
2. **API-only** — agents use the same REST API as the web frontend, no special handling
3. **Webhook-based** — agents register webhooks and get push notifications

## Decision Outcome

Chosen option: "Agent-first with MCP + leasing protocol", because AI agents need structured tool interfaces (MCP) for reliable operation, lease-based coordination prevents conflicts when 5-10 agents work simultaneously, and terminal output capture provides the visibility humans need to trust agent work.

### MCP Tool Surface

Every domain exposes its operations as MCP tools. The MCP server is a thin adapter over the same service layer used by REST routes:

```
REST route  ->  service.ts  <-  MCP tool
                    |
              repository.ts
```

Example MCP tools for the projects domain:
```
project_task_create     — Create a task in a project
project_task_update     — Update task fields
project_task_transition — Move task to a new status
project_task_comment    — Add a comment to a task
project_task_claim      — Claim a task via leasing protocol
project_task_release    — Release a lease on a task
project_task_list       — List tasks with filters
project_work_next       — Get the next available task (topological sort)
```

### Agent Leasing Protocol

Prevents multiple agents from working on the same task simultaneously:

```
1. Agent calls project_task_claim(task_id)
2. System creates a lease: { agent_session_id, task_id, expires_at: now + 30min }
3. Agent sends heartbeats every 15 minutes to extend the lease
4. On completion: agent calls project_task_release(task_id) with a completion comment
5. On timeout: lease expires, task becomes available for other agents
6. On failure: agent calls project_task_release(task_id) with failure reason
```

### Agent Session Model

```sql
CREATE TABLE agent_sessions (
  id              TEXT PRIMARY KEY,           -- ags_ + ULID
  tenant_id       TEXT NOT NULL REFERENCES tenants(id),
  api_key_id      TEXT NOT NULL REFERENCES api_keys(id),
  agent_name      TEXT NOT NULL,              -- e.g., 'claude-code', 'codex-cli'
  model           TEXT,                       -- e.g., 'opus-4', 'o3-pro'
  project_id      TEXT REFERENCES projects(id),
  status          TEXT NOT NULL DEFAULT 'active', -- 'active', 'idle', 'completed', 'failed'
  started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_heartbeat  TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at        TIMESTAMPTZ,
  summary         TEXT,                       -- Agent-provided summary of work done
  metadata        JSONB NOT NULL DEFAULT '{}'
);
```

### Terminal Output Capture

Agents can stream their terminal output to ctrlpane for real-time monitoring:

```
1. Agent calls agent_terminal_start(session_id) to begin capture
2. Terminal output is streamed via Centrifugo channel: agent:<session_id>:terminal
3. Human can view live output in the Agent Dashboard
4. On session end, terminal output is stored as a compressed artifact
```

### Agent API Key Authentication

```sql
CREATE TABLE api_keys (
  id          TEXT PRIMARY KEY,             -- apk_ + ULID
  tenant_id   TEXT NOT NULL REFERENCES tenants(id),
  user_id     TEXT NOT NULL REFERENCES users(id), -- Owner of the key
  name        TEXT NOT NULL,                -- Human-readable label
  key_hash    TEXT NOT NULL,                -- Salted hash of the actual key
  role        TEXT NOT NULL DEFAULT 'engineer', -- Role context for this key
  scopes      TEXT[],                       -- Optional: restrict to specific MCP tools
  last_used   TIMESTAMPTZ,
  expires_at  TIMESTAMPTZ,
  revoked_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

- API keys carry role context (`engineer`, `pm`, `admin`)
- Key is shown once at creation, stored only as a salted hash
- Revocation is immediate (checked on every request)
- All API key usage is audit-logged

### Consequences

**Good:**
- Every operation available via MCP — agents can do anything the web UI can do
- Lease-based coordination prevents conflicts without complex distributed locking
- Terminal capture provides trust and transparency for human oversight
- API key role scoping enforces least-privilege for agent access
- Agent activity is fully auditable

**Bad:**
- MCP tool surface is large (50+ tools across all domains) — requires maintenance
- Terminal output storage can be voluminous — needs retention policy
- Lease heartbeat adds operational overhead for agent implementations

## More Information

- [AI Agent Integration Spec](../specs/ai-agent-integration.md) — full MCP tool catalog
- [ADR-004 PM Hierarchy](./ADR-004-pm-hierarchy.md) — work item types and agent execution ordering
- [Security Architecture](../architecture/security.md) — API key auth, audit logging
- [Data Model](../architecture/data-model.md) — agent session and activity table schemas
