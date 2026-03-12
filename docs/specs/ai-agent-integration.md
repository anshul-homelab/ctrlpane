# AI Agent Integration

> Common agent contract, MCP server specification, agent session management, and instructions generation for AI-first project management.

## Overview

AI agent integration is ctrlpane's core differentiator. Every feature in ctrlpane is designed with the assumption that AI agents are equal participants alongside human users. This spec defines the common contract that any AI agent — regardless of provider — uses to interact with ctrlpane.

The integration covers:
1. **MCP Server** — Model Context Protocol tools for task CRUD, project navigation, comments, and status changes
2. **Agent Roles** — typed roles with scoped permissions (PM, Engineer, Tester, SME, Reviewer)
3. **Session Tracking** — which agent is working on what, terminal output capture, activity history
4. **Leasing Protocol** — claim-based task assignment with heartbeat TTL to prevent stale locks
5. **Instructions Generation** — ctrlpane generates AGENTS.md-style instruction files for any project
6. **Webhook/Event Notifications** — real-time notifications for agent actions

## Common Agent Contract

Every AI agent that interacts with ctrlpane must follow this contract:

### Authentication
- Agents authenticate via API key scoped to a tenant
- Each agent instance gets a unique `agent_id` (e.g., `claude-code-terminal-1`, `codex-cli-pr-review`)
- API keys carry tenant context — all operations are tenant-scoped

### Session Lifecycle
```
1. REGISTER   -> Announce presence, capabilities, and role
2. FOCUS      -> Set current project context
3. DISCOVER   -> Browse available work (tasks, bugs, reviews)
4. CLAIM      -> Lease a task (atomic lock)
5. WORK       -> Execute the task, sending heartbeats
6. REPORT     -> Update task with results, comments, status
7. RELEASE    -> Release the lease (on completion or abandonment)
8. DISCONNECT -> End session gracefully
```

### Required Behaviors
- **Always heartbeat**: Agents must send heartbeats at least every 15 minutes during active work
- **Always comment**: Before changing task status, add a comment explaining what was done
- **Always update status**: Move tasks through the workflow (don't leave tasks in limbo)
- **Respect leases**: Never work on tasks leased to other agents
- **Scope to project**: Set project context before operating on project-specific items

## MCP Server Specification

ctrlpane exposes an MCP server that any compatible agent can connect to. The server implements the Model Context Protocol standard.

### Connection
```json
{
  "mcpServers": {
    "ctrlpane": {
      "url": "https://ctrlpane.com/mcp",
      "headers": {
        "Authorization": "Bearer <api-key>"
      }
    }
  }
}
```

For local development:
```json
{
  "mcpServers": {
    "ctrlpane": {
      "url": "http://localhost:3000/mcp",
      "headers": {
        "Authorization": "Bearer <api-key>"
      }
    }
  }
}
```

### Tool Categories

#### Session Management
| Tool | Input | Output | Description |
|------|-------|--------|-------------|
| `register_session` | `{ agent_id, capabilities[], role }` | `{ session_id }` | Register agent presence |
| `end_session` | `{ session_id }` | `{ ok }` | Graceful disconnect |
| `get_session_status` | `{ session_id }` | `{ session, active_leases }` | Current session state |

#### Project Navigation
| Tool | Input | Output | Description |
|------|-------|--------|-------------|
| `list_projects` | `{ status? }` | `{ projects[] }` | Browse available projects |
| `get_project` | `{ project_id }` | `{ project, stats }` | Project detail |
| `set_project_focus` | `{ session_id, project_id }` | `{ ok }` | Set working project |
| `list_milestones` | `{ project_id }` | `{ milestones[] }` | Project milestones |
| `get_sprint` | `{ sprint_id }` | `{ sprint, tasks[] }` | Sprint detail with tasks |

#### Task Operations
| Tool | Input | Output | Description |
|------|-------|--------|-------------|
| `list_tasks` | `{ filters }` | `{ tasks[] }` | List tasks with rich filters |
| `get_task` | `{ task_id }` | `{ task, subtasks, comments, activity }` | Full task detail |
| `create_task` | `{ project_id, title, ... }` | `{ task }` | Create new task |
| `update_task` | `{ task_id, fields }` | `{ task }` | Update task fields |
| `change_status` | `{ task_id, new_status, comment }` | `{ task }` | Workflow transition |
| `create_subtask` | `{ parent_task_id, title, ... }` | `{ subtask }` | Add subtask |
| `add_comment` | `{ task_id, content }` | `{ comment }` | Add comment to task |
| `search_tasks` | `{ query, project_id? }` | `{ tasks[] }` | Full-text search |

#### Work Assignment
| Tool | Input | Output | Description |
|------|-------|--------|-------------|
| `work_next` | `{ session_id }` | `{ task }` | Get next eligible task |
| `claim_task` | `{ task_id, session_id }` | `{ lease }` | Claim with lease |
| `heartbeat` | `{ task_id, session_id, progress? }` | `{ lease }` | Extend TTL |
| `complete_task` | `{ task_id, session_id, result? }` | `{ task }` | Mark done, release |
| `release_task` | `{ task_id, session_id, reason? }` | `{ ok }` | Release without completing |

#### Goals
| Tool | Input | Output | Description |
|------|-------|--------|-------------|
| `list_goals` | `{ status?, category? }` | `{ goals[] }` | Browse goals |
| `get_goal` | `{ goal_id }` | `{ goal, progress }` | Goal detail with progress |
| `link_task_to_goal` | `{ task_id, goal_id }` | `{ ok }` | Connect task to goal |

#### Notes
| Tool | Input | Output | Description |
|------|-------|--------|-------------|
| `list_notes` | `{ folder_id?, search? }` | `{ notes[] }` | Browse notes |
| `get_note` | `{ note_id }` | `{ note }` | Full note content |
| `create_note` | `{ title, content, folder_id? }` | `{ note }` | Create note |
| `update_note` | `{ note_id, content }` | `{ note }` | Update note |
| `search_notes` | `{ query }` | `{ notes[] }` | Full-text search |

#### Daily Briefing
| Tool | Input | Output | Description |
|------|-------|--------|-------------|
| `get_briefing` | `{}` | `{ tasks, goals, sprint }` | Today's work summary |
| `get_daily_plan` | `{}` | `{ plan }` | Today's priorities |

## Agent Roles

| Role | Capabilities | Typical Use |
|------|-------------|-------------|
| **PM** | Create/edit all items, manage sprints/milestones, assign work, review, close sprints | Planning sessions, backlog grooming, sprint management |
| **Engineer** | Claim tasks, write code, update status, comment, create subtasks, create bugs | Implementation work, code changes, refactoring |
| **Tester** | Create bugs, verify fixes, update test status, comment, run test suites | QA, test writing, verification |
| **SME** | Comment, review, provide expertise, update descriptions | Architecture review, domain expertise, documentation |
| **Reviewer** | Review PRs, approve/reject, comment, suggest changes | Code review, PR management |

Roles are assigned per agent session. A single agent (e.g., Claude Code) can register multiple sessions with different roles for different contexts.

## Agent Session Tracking

### Session State

Each agent session is tracked in the `agent_sessions` table:

| Field | Type | Description |
|-------|------|-------------|
| `id` | text PK | Session UUID |
| `tenant_id` | text | RLS enforced |
| `agent_id` | text | Agent identifier (e.g., `claude-code-1`) |
| `role` | enum | PM, Engineer, Tester, SME, Reviewer |
| `capabilities` | jsonb | What the agent can do |
| `current_project_id` | text FK | Currently focused project |
| `status` | enum | `active`, `idle`, `disconnected` |
| `terminal_id` | text | Reference to terminal session for live viewing |
| `started_at` | timestamptz | |
| `last_heartbeat` | timestamptz | |
| `metadata` | jsonb | Provider-specific metadata |

### Terminal Output Capture

When an agent is working on a task, ctrlpane can capture and display the agent's terminal output in real-time:

1. Agent registers with a `terminal_id` (e.g., tmux session name, PTY identifier)
2. ctrlpane streams terminal output via Centrifugo WebSocket channel
3. Human user can view the live terminal in the ctrlpane web UI
4. Terminal view supports scroll-back, search, and direct input (for guidance)

This enables a "mission control" view where a PM can see all active agents and what they're doing.

### Activity History

All agent actions are logged in `agent_activity`:

| Field | Type | Description |
|-------|------|-------------|
| `id` | text PK | |
| `tenant_id` | text | RLS enforced |
| `session_id` | text FK | Agent session |
| `action` | text | What happened (claimed, commented, completed, etc.) |
| `entity_type` | text | What was acted on (task, comment, milestone) |
| `entity_id` | text | ID of the entity |
| `details` | jsonb | Action-specific data |
| `created_at` | timestamptz | |

## Leasing Protocol

The lease system prevents multiple agents from working on the same task simultaneously.

### Lease Lifecycle

```
AVAILABLE -> CLAIMED -> (HEARTBEAT...) -> RELEASED
                                       -> EXPIRED (reaper)
```

### Lease Rules
- One lease per task at a time
- One active lease per agent session
- Default TTL: 30 minutes
- Heartbeat extends TTL by full duration
- Lease reaper runs every 60 seconds, expires stale leases
- On expiry: task status reverts, lease removed, `agent.lease_expired` event published
- Agents should release tasks they cannot complete

### Lease Table

| Field | Type | Description |
|-------|------|-------------|
| `id` | text PK | |
| `tenant_id` | text | RLS enforced |
| `task_id` | text FK | Leased task |
| `session_id` | text FK | Agent session holding the lease |
| `acquired_at` | timestamptz | When lease was acquired |
| `expires_at` | timestamptz | Current expiry (updated on heartbeat) |
| `previous_status` | text | Task status before claim (for rollback on expiry) |

## Instructions Generation

ctrlpane can generate `AGENTS.md`-style instruction files for any project. These instructions tell AI agents how to work within the project's context.

### Generated Content
- Project overview and goals
- Active sprint scope and priorities
- Coding conventions and standards
- Workflow rules (status transitions, required fields)
- Domain-specific context (architecture, patterns, key files)
- Agent role expectations
- MCP connection configuration

### API

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/projects/:id/instructions` | Generate current instructions for project |
| GET | `/api/projects/:id/instructions/:role` | Role-specific instructions |
| POST | `/api/projects/:id/instructions/export` | Export as AGENTS.md file |

### Usage in CLI Agents

Agents can fetch instructions at session start:
```bash
# In a project's .claude/commands or similar
curl -s https://ctrlpane.com/api/projects/PROJECT_ID/instructions/engineer \
  -H "Authorization: Bearer $CTRLPANE_API_KEY" > AGENTS.md
```

## Provider Integration

### Claude Code
```json
{
  "mcpServers": {
    "ctrlpane": {
      "url": "https://ctrlpane.com/mcp",
      "headers": { "Authorization": "Bearer $CTRLPANE_API_KEY" }
    }
  }
}
```

Claude Code can use all MCP tools directly. Recommended setup:
- Register as Engineer role for implementation work
- Register as Reviewer role for PR reviews
- Use `work_next` to get assigned tasks
- Use `get_task` to understand requirements before starting

### Codex CLI
Same MCP configuration. Codex CLI supports MCP natively and can use all ctrlpane tools.

### Gemini CLI
Same MCP configuration. Gemini CLI supports MCP and can interact with ctrlpane identically.

### Custom Agents
Any agent that speaks MCP or REST can integrate:
- MCP: connect to `https://ctrlpane.com/mcp` with API key
- REST: use the standard REST endpoints at `https://ctrlpane.com/api/*`

## Webhook and Event Notifications

ctrlpane publishes events that external systems can subscribe to:

### Webhook Configuration

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/webhooks` | Register webhook endpoint |
| GET | `/api/webhooks` | List registered webhooks |
| DELETE | `/api/webhooks/:id` | Remove webhook |

### Event Types

| Event | Description |
|-------|-------------|
| `agent.session_started` | Agent registered a new session |
| `agent.session_ended` | Agent disconnected |
| `agent.task_claimed` | Agent claimed a task |
| `agent.task_completed` | Agent completed a task |
| `agent.lease_expired` | Agent lease timed out |
| `agent.comment_added` | Agent commented on a task |
| `task.status_changed` | Any task status transition |
| `task.assigned` | Task assigned to agent or user |
| `sprint.started` | Sprint activated |
| `sprint.completed` | Sprint closed |

### Real-time via Centrifugo

For web UI and live dashboards, events are also pushed via Centrifugo WebSocket:
- Channel per project: `project:<id>:activity`
- Channel per agent session: `agent:<session_id>:terminal`
- Channel for tenant-wide events: `tenant:<id>:events`

## Related Documentation

- [Task Management](./task-management.md) — task CRUD operations
- [Project Management](./project-management.md) — project hierarchy and agent orchestration protocol
- [Goals & Planning](./goals-and-planning.md) — goal operations
- [Notes](./notes.md) — note operations
- [Architecture Overview](../architecture/README.md) — system architecture
