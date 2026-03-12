# Domain Map

> Bounded domain definitions, responsibilities, and inter-domain relationships for ctrlpane.

## Domain Overview

ctrlpane is organized into 8 domains, each with clear boundaries and responsibilities. Every domain follows the 3-layer pattern (routes -> service -> repository) and all database tables include `tenant_id` for multi-tenancy.

```
+-------------------+     +-------------------+     +-------------------+
|       auth        |     |      tasks        |     |     projects      |
| Authentication,   |     | Personal tasks,   |     | Jira-like PM,     |
| sessions, RBAC,   |     | subtasks,         |     | milestones,       |
| multi-tenant      |     | recurrence,       |     | workflows,        |
|                   |     | activity logs     |     | sprints, boards   |
+-------------------+     +-------------------+     +-------------------+
         |                        |                        |
         |                        +------- goal_id FK -----+
         |                        |                        |
+-------------------+     +-------------------+     +-------------------+
|      goals        |     |      notes        |     |      agents       |
| Goals, rituals,   |     | Note-taking,      |     | Agent sessions,   |
| daily planning,   |     | folders, FTS,     |     | leasing, MCP,     |
| sprint manager,   |     | AI analysis,      |     | terminal capture  |
| day modes, energy |     | version history   |     |                   |
+-------------------+     +-------------------+     +-------------------+
                                                           |
+-------------------+     +-------------------+            |
|  notifications    |     |   integrations    |            |
| Telegram, Slack,  |     | Jira sync,        |            |
| email delivery,   |     | Google Workspace, |            |
| preference mgmt   |     | Slack, external   |            |
+-------------------+     +-------------------+            |
         |                        |                        |
         +-------------- events (NATS JetStream) ---------+
```

## auth

**Purpose**: Authentication, session management, multi-tenant administration, and RBAC.

**Responsibilities**:
- User registration and login (email/password, SSO)
- Session creation and validation (httpOnly cookies for web, API keys for agents)
- Tenant creation and configuration
- User-tenant membership and role assignment
- API key generation and management for agent access
- Password reset, email verification

**Key Tables**:
- `tenants` — tenant registry with configuration
- `users` — user accounts (global, not tenant-scoped)
- `tenant_memberships` — user-tenant relationship with role
- `sessions` — active user sessions
- `api_keys` — agent and integration API keys

**Roles**:
| Role | Scope | Description |
|------|-------|-------------|
| `owner` | Tenant | Full administrative control |
| `admin` | Tenant | User management, configuration |
| `member` | Tenant | Standard access to all domains |
| `viewer` | Tenant | Read-only access |
| `pm` | Project | Project management privileges |
| `engineer` | Project | Task execution privileges |
| `tester` | Project | QA and testing privileges |
| `sme` | Project | Subject matter expert (comment/review) |

**Events Published**: `user.created`, `user.invited`, `tenant.created`

**External Dependencies**: None (foundational domain)

---

## tasks

**Purpose**: Personal task management independent of projects.

**Responsibilities**:
- Task CRUD with rich metadata (priority, category, labels, components, story points)
- Subtask management (one level deep)
- Status lifecycle enforcement (`pending` -> `in_progress` -> `done` -> `archived`)
- Recurring task management (auto-spawn next instance on completion)
- Activity logging (field change history)
- Comment threading (user and agent)
- Daily briefing generation
- Goal linking via `goal_id` FK

**Key Tables**: `tasks`, `task_labels`, `task_components`, `task_watchers`, `task_comments`, `task_activity`

**Events Published**: `task.created`, `task.updated`, `task.completed`, `task.assigned`, `task.commented`, `task.deleted`

**Dependencies**: `auth` (user context), `goals` (goal linking)

**Spec**: [Task Management](../specs/task-management.md)

---

## projects

**Purpose**: Full-featured project management with Jira-like hierarchy and agent orchestration.

**Responsibilities**:
- Project lifecycle (active, paused, completed, archived)
- Initiative -> Epic -> Story/Task -> Subtask hierarchy
- Milestone management with auto-computed progress
- Sprint management (planning, active, review, completed)
- Custom workflows per project (configurable status pipelines)
- Labels, components, and custom fields
- Saved views (filter/sort/group configurations)
- Board view (Kanban), list view, timeline view
- Agent leasing protocol (claim, heartbeat, release)
- Gamification system (XP, levels, achievements, streaks)
- Entity links for cross-domain references
- Task dependency tracking

**Key Tables**: `projects`, `initiatives`, `epics`, `stories`, `project_tasks`, `project_subtasks`, `bugs`, `milestones`, `sprints`, `workflows`, `workflow_statuses`, `workflow_transitions`, `project_labels`, `project_components`, `custom_field_definitions`, `custom_field_values`, `saved_views`, `task_dependencies`, `task_leases`, `user_progression`, `user_achievements`, `xp_transactions`, `entity_links`, `project_activity`

**Events Published**: `project_task.created`, `project_task.updated`, `project_task.completed`, `project_task.assigned`, `project_task.commented`, `milestone.completed`, `project.status_changed`, `sprint.started`, `sprint.completed`, `agent.lease_expired`

**Dependencies**: `auth` (user/agent context), `agents` (session management), `goals` (goal linking)

**Spec**: [Project Management](../specs/project-management.md)

---

## goals

**Purpose**: Goal management, daily planning, cognitive sprint management, and life protocol.

**Responsibilities**:
- Goal CRUD with hierarchical nesting (parent/sub-goal)
- Goal status lifecycle (`exploring` -> `active` -> `on_hold` -> `completed` -> `archived`)
- AI-guided goal setting (proposal generation, goal interview)
- Progress tracking from linked tasks
- Daily planning (morning intentions, top 3 priorities)
- Evening review (reflection, ratings, insights)
- Daily history tracking (completion, mood, adherence)
- Cognitive sprint management (90-min focused work blocks)
- Day mode system (Normal, Disrupted, Crisis)
- Energy gate check-ins with task recommendations
- Shutdown ritual (guided end-of-day checklist)

**Key Tables**: `goals`, `daily_history`, `cognitive_sprints`, `energy_check_ins`, `day_mode_log`

**Events Published**: `goal.created`, `goal.completed`, `goal.progress_updated`, `ritual.completed`, `sprint.started`, `sprint.completed`, `energy.checked_in`, `day_mode.changed`

**Dependencies**: `auth` (user context), `tasks` (linked task progress), `projects` (linked project task progress)

**Spec**: [Goals & Planning](../specs/goals-and-planning.md)

---

## notes

**Purpose**: Note-taking with folder organization, full-text search, and AI analysis.

**Responsibilities**:
- Note CRUD with Markdown content
- Folder management (single-level organization)
- Pinning for quick access
- Full-text search via PostgreSQL tsvector with GIN index
- Tag-based cross-folder organization
- AI-powered analysis (summarize, extract action items, extract structured data)
- Version history with restore capability
- Soft delete
- Entity links to tasks, project items, and goals

**Key Tables**: `note_folders`, `notes`, `note_versions`

**Events Published**: `note.created`, `note.updated`, `note.deleted`, `note.analyzed`

**Dependencies**: `auth` (user context)

**Spec**: [Notes](../specs/notes.md)

---

## agents

**Purpose**: AI agent session management, leasing coordination, MCP server, and terminal capture.

**Responsibilities**:
- Agent session registration and lifecycle
- Session tracking (which agent, which project, what role, what's being worked on)
- Lease coordination across all domains (central lease authority)
- MCP server implementation (tool registration, request routing)
- Terminal output capture and streaming
- Agent activity logging
- Instructions generation (AGENTS.md export for projects)
- Agent health monitoring (heartbeat tracking, stale session cleanup)

**Key Tables**: `agent_sessions`, `agent_activity` (lease tables owned by `projects` domain)

**Events Published**: `agent.session_started`, `agent.session_ended`, `agent.task_claimed`, `agent.task_completed`, `agent.lease_expired`, `agent.comment_added`

**Dependencies**: `auth` (API key validation), `projects` (lease protocol), `tasks` (task operations)

**Spec**: [AI Agent Integration](../specs/ai-agent-integration.md)

---

## notifications

**Purpose**: Multi-channel notification delivery and preference management.

**Responsibilities**:
- Notification routing (determine who gets notified and via which channel)
- Channel delivery: Telegram, Slack, email
- User notification preferences (per-event-type, per-channel opt-in/out)
- Notification history and read status
- Rate limiting (prevent notification storms)
- Digest mode (batch notifications into periodic summaries)

**Key Tables**: `notification_preferences`, `notification_history`, `notification_channels`

**Events Consumed**: All domain events that trigger notifications (task assignments, completions, comments, lease expirations, goal completions, etc.)

**Dependencies**: `auth` (user preferences), external services (Telegram Bot API, Slack API, SMTP)

---

## integrations

**Purpose**: External service connections for data sync and interoperability.

**Responsibilities**:
- Integration configuration and credential management
- Jira sync (bidirectional: import Jira issues as ctrlpane tasks, push ctrlpane changes back)
- Google Workspace integration (Calendar events as tasks, Drive for document links)
- Slack integration (slash commands, task creation from messages, status updates)
- Webhook management (outbound event delivery to external systems)
- External calendar sync (import/export tasks as calendar events)
- LifeOS Knowledge Base read access (entity links to knowledge entries)

**Key Tables**: `integration_configs`, `integration_credentials`, `sync_state`, `webhooks`

**Events Consumed**: Domain events that trigger sync operations

**Dependencies**: `auth` (tenant/user context), external APIs

---

## Cross-Domain Patterns

### Entity Links
Any entity in any domain can be linked to any other entity via the `entity_links` table (owned by `projects` but usable across all domains). This enables:
- Linking a note to a task
- Linking a goal to a project
- Linking a project task to an external Jira issue

### Event Bus
All domains publish events to NATS JetStream. Events follow the pattern `<domain>.<entity>.<action>` (e.g., `tasks.task.completed`). Consumers are decoupled from publishers.

### Shared Schema Patterns
All domains share these column patterns:
- `id`: text (UUID), primary key
- `tenant_id`: text, FK to tenants, RLS enforced
- `created_at` / `updated_at`: timestamptz, auto-managed
- `created_by`: text, FK to users (where applicable)

## Related Documentation

- [Architecture Overview](./README.md) — system architecture and tech stack
- Feature specs in [docs/specs/](../specs/)
