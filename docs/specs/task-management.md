# Task Management

> Full-featured task management with subtasks, recurrence, multi-user assignment, sprint integration, and AI agent access.

## Overview

Task Management is the fundamental work-tracking domain of ctrlpane. Users and AI agents create, organize, and track tasks with rich metadata — priorities, story points, labels, components, categories, due dates, sprint assignments, and goal links. Subtasks enable breaking work into smaller units (one level deep), while recurring tasks automatically spawn the next instance when completed.

Tasks integrate with the project management domain (tasks can belong to projects as project tasks) and with the goals domain via `goal_id` FK. Calendar sync is available as an external integration rather than a built-in feature.

Each task carries a full activity log of field changes and supports threaded comments from both human users and AI agents. The web UI provides a searchable data table with quick filters, inline status editing, and a slide-out detail panel with comments, activity, and AI discussion tabs.

## Capabilities

- Create, edit, and delete tasks with title, description, priority, category, due date, and goal link
- Subtask nesting (one level deep) with automatic goal inheritance from parent
- Status lifecycle: `pending` -> `in_progress` -> `done` -> `archived`
- Priority levels: `critical`, `high`, `medium`, `low`
- Story points: Fibonacci scale (1, 2, 3, 5, 8, 13, 21) for effort estimation
- Labels and components for cross-cutting classification
- Sprint assignment: tasks can be assigned to a sprint within a project
- Recurring tasks: daily / weekly / monthly with JSONB recurrence rule; next instance auto-spawned on completion
- Goal linking via `goal_id` FK — tasks contribute to goal progress
- Multi-user: assignee, reporter, and watchers on every task
- Per-task comments (user and AI agent authored)
- Activity log tracking changes to status, priority, due date, category, goal, title, assignee, and story points
- AI discussion: start a conversation thread on any task with enriched context
- Daily briefing: overdue, due-today, in-progress task summary with goal progress
- Data table with search, multi-status filter, priority filter, category filter, label filter, column toggles
- Scheduled start/end for time-blocking
- External calendar sync via integrations domain

## Multi-Tenancy and Multi-User

Every table in this domain includes a `tenant_id` column with row-level security (RLS) policies enforced at the database level. All queries are scoped to the current tenant.

Users within a tenant have roles that determine their permissions:
- **Admin**: full CRUD on all tasks within the tenant
- **Member**: create tasks, edit own tasks, comment on any task
- **Viewer**: read-only access

Tasks support:
- `assignee_id` — the user or agent responsible for the task
- `reporter_id` — the user who created the task
- `watcher_ids` — users who receive notifications on task changes

## Architecture

```
Routes (Hono.js)
  -> TaskService (Effect.ts layer)
    -> TaskRepository (Drizzle ORM -> Postgres)
    -> EventBus (NATS JetStream for task.created, task.updated, task.completed events)
    -> NotificationService (watchers, assignee notifications)
```

The tasks domain follows the 3-layer pattern: `routes.ts` -> `service.ts` -> `repository.ts`. Business logic lives in the service layer with Effect.ts composition. Events are published via NATS JetStream using a transactional outbox pattern.

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/tasks/briefing` | Daily briefing with task counts and goal progress |
| GET | `/api/tasks` | List tasks (filters: status, priority, category, goal_id, label, assignee, sprint, search, dates) |
| POST | `/api/tasks` | Create a task |
| GET | `/api/tasks/:id` | Task detail with subtasks |
| PATCH | `/api/tasks/:id` | Update task fields |
| DELETE | `/api/tasks/:id` | Delete task |
| POST | `/api/tasks/:id/comments` | Add a comment |
| DELETE | `/api/tasks/comments/:commentId` | Delete a comment |
| GET | `/api/tasks/:id/activity` | Activity log |
| POST | `/api/tasks/:id/discuss` | Start AI discussion on a task |
| POST | `/api/tasks/recurrence/preview` | Preview recurrence dates |
| POST | `/api/tasks/:id/assign` | Assign task to user or agent |
| POST | `/api/tasks/:id/watch` | Add/remove watchers |
| GET | `/api/tasks/:id/watchers` | List watchers |

## Data Model

All tables are in the `tasks` schema and include `tenant_id` for multi-tenancy.

### `tasks`

| Column | Type | Notes |
|--------|------|-------|
| `id` | text PK | UUID |
| `tenant_id` | text FK | Required, RLS enforced |
| `title` | text | Required |
| `description` | text | Markdown |
| `status` | enum | `pending`, `in_progress`, `done`, `archived` |
| `priority` | enum | `critical`, `high`, `medium`, `low` |
| `story_points` | integer | Fibonacci scale, nullable |
| `category` | text | Free-form label |
| `goal_id` | text FK -> goals | Optional goal link |
| `assignee_id` | text FK -> users | User or agent assigned |
| `reporter_id` | text FK -> users | Creator of the task |
| `due_date` | timestamptz | |
| `completed_at` | timestamptz | Set by service on done |
| `is_recurring` | boolean | |
| `recurrence_rule` | jsonb | `{ frequency, interval, daysOfWeek? }` |
| `parent_task_id` | text FK -> tasks | Self-referential for subtasks (1 level) |
| `sprint_id` | text FK -> sprints | Optional sprint assignment |
| `scheduled_start` | timestamptz | Time-blocking start |
| `scheduled_end` | timestamptz | Time-blocking end |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

### `task_labels`

| Column | Type | Notes |
|--------|------|-------|
| `task_id` | text FK -> tasks | |
| `label_id` | text FK -> labels | |
| `tenant_id` | text | RLS enforced |

### `task_components`

| Column | Type | Notes |
|--------|------|-------|
| `task_id` | text FK -> tasks | |
| `component_id` | text FK -> components | |
| `tenant_id` | text | RLS enforced |

### `task_watchers`

| Column | Type | Notes |
|--------|------|-------|
| `task_id` | text FK -> tasks | |
| `user_id` | text FK -> users | |
| `tenant_id` | text | RLS enforced |

### `task_comments`

| Column | Type | Notes |
|--------|------|-------|
| `id` | text PK | |
| `tenant_id` | text | RLS enforced |
| `task_id` | text FK -> tasks | Cascade delete |
| `content` | text | Markdown |
| `author_id` | text FK -> users | User or agent |
| `author_type` | enum | `user`, `agent` |
| `created_at` | timestamptz | |

### `task_activity`

| Column | Type | Notes |
|--------|------|-------|
| `id` | text PK | |
| `tenant_id` | text | RLS enforced |
| `task_id` | text FK -> tasks | |
| `actor_id` | text | User or agent who made the change |
| `actor_type` | enum | `user`, `agent` |
| `field` | text | Field that changed |
| `old_value` | text | Previous value |
| `new_value` | text | New value |
| `created_at` | timestamptz | |

## MCP Tools

AI agents interact with tasks via the following MCP tools:

| Tool | Description |
|------|-------------|
| `list_tasks` | List tasks with filters (status, priority, assignee, sprint, search) |
| `get_task` | Get full task detail including subtasks, comments, activity |
| `create_task` | Create a new task with all fields |
| `update_task` | Update task fields (status, priority, description, etc.) |
| `add_task_comment` | Add a comment to a task |
| `assign_task` | Assign a task to a user or agent |
| `change_task_status` | Transition task status with validation |
| `get_daily_briefing` | Get today's task briefing |
| `search_tasks` | Full-text search across tasks |

## Events

The following events are published to NATS JetStream:

| Event | Trigger | Payload |
|-------|---------|---------|
| `task.created` | New task | Full task object |
| `task.updated` | Field change | Task ID, changed fields, old/new values |
| `task.completed` | Status -> done | Task ID, completed_at, assignee |
| `task.assigned` | Assignee change | Task ID, old/new assignee |
| `task.commented` | New comment | Task ID, comment ID, author |
| `task.deleted` | Task deleted | Task ID |

## Related Documentation

- [Project Management](./project-management.md) — projects can contain tasks as project tasks
- [Goals & Planning](./goals-and-planning.md) — tasks link to goals via goal_id
- [AI Agent Integration](./ai-agent-integration.md) — agent protocol for task operations
- [Notes](./notes.md) — entity links can connect tasks to notes
