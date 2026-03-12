# Project Management

> Unified project management with Jira-like hierarchy, agent orchestration, gamification, and cross-domain integration.

## Overview

Project Management is the heart of ctrlpane. It provides a Linear/Jira-inspired project management system with built-in AI agent orchestration and gamification. It replaces the need for external project management tools by offering a complete hierarchy from strategic initiatives down to executable subtasks.

The domain is purpose-built for AI agents as first-class citizens. Agents can register sessions, claim tasks via a lease-based protocol, report progress via heartbeats, and complete work — all through MCP tools or REST APIs. Human users have the same capabilities through the web UI with board views, list views, timeline views, and a command palette.

## Constructs

6 core constructs forming a top-down hierarchy:

- **Initiative** — major business area or strategic theme (e.g., "MVP Build", "Go-to-Market", "Operations")
- **Epic** — a meaningful outcome within an initiative (e.g., "User Authentication", "Payment Integration")
- **Story** — a user-facing feature or deliverable within an epic
- **Task** — a concrete piece of work; supports dependencies, custom fields, agent assignment
- **Subtask** — small execution step within a task (max 2 levels of nesting)
- **Bug** — defect tracking with severity, reproduction steps, environment

Supporting constructs:
- **Project** — bounded container for related work with custom workflows, labels, components, custom fields
- **Milestone** — phase or checkpoint within a project; progress auto-computed from child items
- **Sprint** — time-boxed iteration (typically 1-2 weeks) for task scheduling
- **Workflow** — configurable status pipeline per project (system templates: Software Dev, Simple, Business, Custom)
- **Saved View** — named, persisted filter/sort/group configuration
- **Board View** — Kanban board with drag-and-drop status transitions
- **Timeline View** — Gantt-style view with dependencies and milestones

## Multi-Tenancy and Multi-User

Every table includes `tenant_id` with RLS policies. Users within a tenant have project-level roles:

| Role | Permissions |
|------|-------------|
| **Admin** | Full project configuration, user management, workflow editing |
| **PM** | Create/edit all items, manage milestones and sprints, assign work |
| **Engineer** | Create/edit tasks, claim work, update status, comment |
| **Tester** | Create bugs, verify fixes, update test status |
| **SME** | Comment, review, provide domain expertise |
| **Viewer** | Read-only access to project data |

## Schema

19+ tables organized by concern:

**Core:**
- `projects`, `initiatives`, `epics`, `stories`, `project_tasks`, `project_subtasks`, `bugs`
- `milestones`, `sprints`

**Configuration:**
- `project_labels`, `project_components`, `custom_field_definitions`, `custom_field_values`
- `workflows`, `workflow_statuses`, `workflow_transitions`

**Agent:**
- `agent_sessions`, `task_leases`

**Gamification:**
- `user_progression`, `user_achievements`, `xp_transactions`

**Integration:**
- `entity_links`, `domain_construct_mappings`
- `saved_views`
- `project_activity`

## API Endpoints

~40 endpoints organized by sub-module:

### Projects
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/projects` | List projects |
| POST | `/api/projects` | Create project |
| GET | `/api/projects/:id` | Project detail with stats |
| PATCH | `/api/projects/:id` | Update project |
| DELETE | `/api/projects/:id` | Archive/delete project |

### Initiatives and Epics
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/projects/:id/initiatives` | List initiatives |
| POST | `/api/projects/:id/initiatives` | Create initiative |
| GET | `/api/projects/:id/epics` | List epics (filter by initiative) |
| POST | `/api/projects/:id/epics` | Create epic |

### Stories and Tasks
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/projects/:id/tasks` | List project tasks (filter: status, assignee, sprint, milestone, label, priority) |
| POST | `/api/projects/:id/tasks` | Create task within project |
| GET | `/api/project-tasks/:taskId` | Task detail |
| PATCH | `/api/project-tasks/:taskId` | Update task |
| DELETE | `/api/project-tasks/:taskId` | Delete task |
| POST | `/api/project-tasks/:taskId/subtasks` | Create subtask |
| POST | `/api/project-tasks/:taskId/comments` | Add comment |
| GET | `/api/project-tasks/:taskId/activity` | Activity log |

### Milestones
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/projects/:id/milestones` | List milestones |
| POST | `/api/projects/:id/milestones` | Create milestone |
| PATCH | `/api/milestones/:id` | Update milestone |
| DELETE | `/api/milestones/:id` | Delete milestone |

### Sprints
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/projects/:id/sprints` | List sprints |
| POST | `/api/projects/:id/sprints` | Create sprint |
| PATCH | `/api/sprints/:id` | Update sprint (start, complete) |
| GET | `/api/sprints/:id/board` | Sprint board view |

### Workflows
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/projects/:id/workflow` | Get project workflow |
| PUT | `/api/projects/:id/workflow` | Update workflow configuration |
| GET | `/api/workflows/templates` | List system workflow templates |

### Saved Views
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/projects/:id/views` | List saved views |
| POST | `/api/projects/:id/views` | Create saved view |
| PATCH | `/api/views/:id` | Update saved view |
| DELETE | `/api/views/:id` | Delete saved view |

### Custom Fields
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/projects/:id/fields` | List custom field definitions |
| POST | `/api/projects/:id/fields` | Create custom field |
| PATCH | `/api/project-tasks/:taskId/fields` | Set custom field values |

### Agent Protocol
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/agents/register` | Register agent session |
| POST | `/api/agents/sessions/:id/project` | Set current project |
| POST | `/api/agents/sessions/:id/work-next` | Get next eligible task |
| POST | `/api/agents/claim/:taskId` | Claim task with lease |
| POST | `/api/agents/heartbeat/:taskId` | Extend lease TTL |
| POST | `/api/agents/complete/:taskId` | Complete task, release lease |
| POST | `/api/agents/release/:taskId` | Release task without completing |
| GET | `/api/agents/sessions` | List active agent sessions |
| GET | `/api/agents/sessions/:id` | Agent session detail |

### Gamification
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/gamification/profile` | User XP, level, streak |
| GET | `/api/gamification/leaderboard` | Tenant leaderboard |
| GET | `/api/gamification/achievements` | Available and earned achievements |
| GET | `/api/gamification/history` | XP transaction history |

### Entity Links
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/entity-links` | List entity links |
| POST | `/api/entity-links` | Create bidirectional link |
| DELETE | `/api/entity-links/:id` | Remove link |

## Agent Orchestration Protocol

When a task has `assignee_type = 'agent'`, the agent protocol activates:

```
1. register_session(agent_id, capabilities[], role)  -> session_id
2. set_current_project(session_id, project_id)
3. work_next(session_id)  -> next eligible task (priority + deps + capabilities match)
4. claim_task(task_id, session_id)  -> atomic lease + status transition to in_progress
5. heartbeat(task_id, session_id)  -> extends lease TTL (default: 30 min)
6. complete_task(task_id, session_id, result)  -> release lease, status -> done
```

### Task Scheduling Algorithm

Priority ordering for `work_next`:
1. Priority (critical > high > medium > low)
2. Unblocks count DESC (tasks that unblock the most dependents)
3. Story points ASC (smaller tasks first for throughput)
4. Created at ASC (FIFO within same tier)

### Lease Management

- Default TTL: 30 minutes
- Heartbeat extends TTL by the full duration
- Lease reaper runs every 60 seconds
- Expired leases: task status reverts to previous state, lease released
- An agent can hold at most one active lease per session

### Agent Roles

| Role | Capabilities | Typical Agent |
|------|-------------|---------------|
| PM | Create items, assign work, manage sprints, review | Claude Code (planning mode) |
| Engineer | Claim tasks, write code, update status, comment | Claude Code, Codex CLI, Gemini CLI |
| Tester | Create bugs, verify fixes, run tests | Claude Code (test mode) |
| SME | Comment, review, provide expertise | Any agent with domain context |
| Reviewer | Review PRs, approve/reject, comment | Claude Code (review mode) |

## Gamification System

Positive-only XP system for engagement and progress tracking:

### XP Formula
```
earned_xp = base_xp * difficulty_multiplier * streak_multiplier * overdue_penalty
```

- **base_xp**: Derived from story points (1 pt = 10 XP, 2 pt = 25 XP, ... 21 pt = 500 XP)
- **difficulty_multiplier**: 1.0 (low) / 1.25 (medium) / 1.5 (high) / 2.0 (critical)
- **streak_multiplier**: 1.0 + (0.1 * consecutive_days, max 2.0)
- **overdue_penalty**: 0.5 if completed after due date

### Leveling

```
xp_for_level(n) = floor(50 * 1.15^n)
```

Level titles: Apprentice (1-4) -> Journeyman (5-9) -> Artisan (10-14) -> Master (15-19) -> Grandmaster (20-24) -> Legend (25+)

### Features
- **Streaks**: Daily completion tracking with freeze tokens (miss a day without penalty)
- **Combos**: Multiplier for rapid consecutive completions (max 2.0x, decays after 5 min)
- **Achievements**: Registry pattern with 20+ badges (First Task, Sprint Hero, Bug Squasher, etc.)
- **Leaderboard**: Tenant-wide ranking by XP, level, and streak
- **Event-driven**: XP awarded automatically via `gamification-xp` event consumer

## MCP Tools

30+ tools across multiple categories:

### Project and Task Tools
| Tool | Description |
|------|-------------|
| `list_projects` | List all projects in tenant |
| `get_project` | Project detail with stats |
| `create_project` | Create new project |
| `list_project_tasks` | List tasks with filters |
| `get_project_task` | Full task detail |
| `create_project_task` | Create task in project |
| `update_project_task` | Update task fields |
| `add_task_comment` | Comment on a task |
| `change_task_status` | Transition task through workflow |
| `create_subtask` | Create subtask under a task |
| `list_milestones` | List project milestones |
| `create_milestone` | Create milestone |

### Agent Orchestration Tools
| Tool | Description |
|------|-------------|
| `register_agent_session` | Register with capabilities and role |
| `set_agent_project` | Focus on a specific project |
| `work_next` | Get next eligible task |
| `claim_task` | Claim task with lease |
| `heartbeat` | Extend lease TTL |
| `complete_task` | Mark task done and release lease |
| `release_task` | Release without completing |
| `get_agent_session` | Session status and active leases |
| `list_agent_sessions` | All active sessions |

### Configuration Tools
| Tool | Description |
|------|-------------|
| `list_saved_views` | List saved views for project |
| `create_saved_view` | Create filter/sort configuration |
| `list_custom_fields` | List custom field definitions |
| `set_custom_field` | Set custom field value on task |
| `get_workflow` | Get project workflow |

### Gamification Tools
| Tool | Description |
|------|-------------|
| `get_xp_profile` | Current XP, level, streak |
| `get_leaderboard` | Tenant leaderboard |
| `get_achievements` | Achievement list and progress |

### Integration Tools
| Tool | Description |
|------|-------------|
| `create_entity_link` | Link two entities across domains |
| `list_entity_links` | List links for an entity |

## Events

Published to NATS JetStream:

| Event | Trigger |
|-------|---------|
| `project_task.created` | New task created |
| `project_task.updated` | Task fields changed |
| `project_task.completed` | Task marked done |
| `project_task.assigned` | Assignee changed |
| `project_task.commented` | New comment added |
| `milestone.completed` | All milestone items done |
| `project.status_changed` | Project status transition |
| `agent.lease_expired` | Agent lease TTL exceeded |
| `agent.session_registered` | New agent session started |
| `sprint.started` | Sprint activated |
| `sprint.completed` | Sprint closed |

## Frontend Components

### Views
- **Project List** (`/projects`) — all projects with status, progress bars, recent activity
- **Project Detail** (`/projects/:id`) — task list view with filter bar, milestone groups, sprint selector
- **Board View** (`/projects/:id/board`) — Kanban board with workflow columns, drag-and-drop
- **Timeline View** (`/projects/:id/timeline`) — Gantt chart with dependencies and milestones
- **Task Full Page** (`/projects/:id/tasks/:taskId`) — detailed task view with all metadata
- **Task Sidebar** — slide-out detail panel for quick editing
- **Sprint Board** (`/projects/:id/sprints/:sprintId`) — sprint-specific board view

### Widgets
- Agent console: live agent session monitoring with terminal output
- Gamification: XP bar, level-up modal, combo/achievement toasts, leaderboard, profile card
- Command palette: full project navigation and task operations via keyboard

## Related Documentation

- [Task Management](./task-management.md) — standalone tasks (non-project)
- [Goals & Planning](./goals-and-planning.md) — goal linking for project tasks
- [AI Agent Integration](./ai-agent-integration.md) — common agent contract and MCP server spec
- [Notes](./notes.md) — entity links can connect project items to notes
