# Goals & Planning

> Hierarchical goal management, AI-guided goal setting, daily planning rituals, cognitive sprint management, and adaptive day modes.

## Overview

Goals & Planning provides the high-level direction layer for ctrlpane. Goals represent aspirations or targets a user wants to achieve. Each goal supports sub-goals, target dates, categories, and a status lifecycle from initial exploration through completion.

AI is deeply integrated: a goal-setting chat mode guides users through a multi-phase interview to clarify and finalize goals. The system can propose goals based on conversations, which the user reviews and accepts or rejects as a batch. Goals link to tasks and project items, enabling automatic progress tracking.

This domain also incorporates the Life Protocol system — cognitive sprint management, adaptive day modes, energy gates, and structured rituals (morning planning, evening review, shutdown) — providing a complete daily productivity framework.

## Capabilities

### Goals
- Create, edit, and delete goals with title, description, category, target date, and status
- Hierarchical goals: `parent_goal_id` for sub-goal nesting (unlimited depth)
- Status lifecycle: `exploring` -> `active` -> `on_hold` -> `completed` -> `archived`
- Filter goals by status, category, and parent
- Goal proposals: AI proposes a batch of goals from a conversation; user finalizes (accept/reject each)
- Goal interview mode: AI-guided multi-phase conversation to refine a goal
- Task linking: tasks carry `goal_id` FK; briefing endpoint shows linked task counts and completion %
- Progress tracking: auto-computed from linked task completion rates

### Daily Planning
- Morning planning session: review today's tasks, set intentions, pick top 3 priorities
- Evening review session: reflect on progress, rate the day (energy, productivity, presence), capture insights
- Daily history: per-day record of tasks completed, mood, plan adherence, key insights
- Planning state: track whether today's plan exists and its completion status

### Sprint Manager
- Start/stop cognitive sprints (90-minute default, configurable per user)
- Timer display with current task prominently shown
- Sprint completion logging for productivity stats
- Integration with project sprints (cognitive sprint can be scoped to a project sprint)

### Day Mode System
- Three modes: **Normal**, **Disrupted**, **Crisis**
- Manual toggle or auto-detection from calendar data (e.g., late-night events trigger next-day Disrupted)
- Each mode adjusts the daily briefing: different sprint counts, different task priorities, different expectations
- Mode affects which prompts and nudges ctrlpane surfaces

### Energy Gate
- Prompted at configurable transition points (e.g., after a sprint, after shutdown ritual)
- Simple 1-5 energy rating
- Based on rating, surfaces appropriate task list:
  - **4-5**: Deep work tasks (high complexity, high story points)
  - **2-3**: Learning queue or light review tasks
  - **1**: "Take a break" — no tasks surfaced, only recovery suggestions

### Shutdown Ritual
- Triggered manually or at configured time
- Guided checklist: close open work, review tomorrow's calendar, capture open items, write top 3 priorities for tomorrow
- Bright-line signal that the work day is done

## Multi-Tenancy and Multi-User

All tables include `tenant_id` with RLS. Goals are scoped to individual users within a tenant — each user has their own goal hierarchy. Team goals can be created by admins and shared across users.

Daily history, rituals, and sprint data are per-user.

## Architecture

```
Routes (Hono.js)
  -> GoalService (Effect.ts)
    -> GoalRepository (Drizzle -> Postgres)
  -> PlanningService (Effect.ts)
    -> DailyHistoryRepository
  -> RitualService (Effect.ts)
    -> RitualAgent (streaming AI for guided sessions)
    -> SprintManager (timer state, completion tracking)
  -> EventBus (NATS JetStream)
```

Goals follow the full 3-layer pattern. Planning is a lightweight domain. Rituals orchestrate the RitualAgent for interactive AI-guided sessions. The Sprint Manager maintains timer state with server-side tracking and client-side display.

## API Endpoints

### Goals

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/goals` | List goals (filter: status, category, parent) |
| POST | `/api/goals` | Create a goal |
| GET | `/api/goals/:id` | Goal detail with sub-goals and linked task counts |
| PATCH | `/api/goals/:id` | Update a goal |
| DELETE | `/api/goals/:id` | Delete a goal (cascades sub-goals) |
| GET | `/api/goals/proposals/:conversationId` | Get AI-proposed goals from a conversation |
| POST | `/api/goals/finalize` | Accept/reject AI-proposed goals as a batch |
| GET | `/api/goals/:id/progress` | Computed progress from linked tasks |

### Planning

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/planning/today` | Check if today's plan exists, get plan details |
| POST | `/api/planning/today` | Create or update today's plan (top 3 priorities, intentions) |
| GET | `/api/planning/history` | Daily history list (paginated) |
| GET | `/api/planning/history/:date` | Specific day's history |
| PATCH | `/api/planning/history/:date` | Update day record (mood, insights, adherence) |

### Rituals

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/rituals/today` | Today's ritual status (planning done, review done) |
| POST | `/api/rituals/start` | Start a ritual (`planning`, `review`, `task_discussion`, `shutdown`) |
| POST | `/api/rituals/stream` | Stream tokens from active ritual conversation |
| DELETE | `/api/rituals/:id` | End ritual session |

### Sprint Manager

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/sprints/cognitive/start` | Start a cognitive sprint (optional task_id) |
| POST | `/api/sprints/cognitive/stop` | Stop current sprint |
| GET | `/api/sprints/cognitive/active` | Get active sprint status and timer |
| POST | `/api/sprints/cognitive/heartbeat` | Client heartbeat to keep sprint alive |
| GET | `/api/sprints/cognitive/stats` | Sprint completion stats (daily, weekly, monthly) |

### Day Mode

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/day-mode` | Current day mode |
| PUT | `/api/day-mode` | Set day mode (Normal, Disrupted, Crisis) |
| GET | `/api/day-mode/suggestion` | AI-suggested mode based on calendar/sleep data |

### Energy Gate

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/energy/check-in` | Record energy level (1-5) |
| GET | `/api/energy/check-ins` | Energy check-in history |
| GET | `/api/energy/recommended-tasks` | Tasks appropriate for current energy level |

## Data Model

All tables include `tenant_id` for multi-tenancy.

### `goals`

| Column | Type | Notes |
|--------|------|-------|
| `id` | text PK | UUID |
| `tenant_id` | text FK | RLS enforced |
| `user_id` | text FK -> users | Goal owner |
| `title` | text | Required |
| `description` | text | Markdown |
| `category` | text | Free-form |
| `status` | enum | `exploring`, `active`, `on_hold`, `completed`, `archived` |
| `parent_goal_id` | text FK -> goals | Self-referential; cascade delete |
| `target_date` | timestamptz | |
| `source_conversation_id` | text | If created from AI interview |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

### `daily_history`

| Column | Type | Notes |
|--------|------|-------|
| `id` | text PK | UUID |
| `tenant_id` | text | RLS enforced |
| `user_id` | text FK -> users | |
| `date` | date | Unique per user per day |
| `tasks_completed` | integer | |
| `tasks_total` | integer | |
| `summary` | text | AI-written day summary |
| `plan_adherence_pct` | real | 0-100 |
| `mood` | text | User-reported |
| `energy_avg` | real | Average energy across check-ins |
| `key_insights` | text | AI-extracted insights |
| `top_priorities` | jsonb | Array of top 3 priority descriptions |
| `intentions` | text | Morning intentions |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

### `cognitive_sprints`

| Column | Type | Notes |
|--------|------|-------|
| `id` | text PK | UUID |
| `tenant_id` | text | RLS enforced |
| `user_id` | text FK -> users | |
| `task_id` | text FK -> tasks | Optional: task being worked on |
| `started_at` | timestamptz | |
| `ended_at` | timestamptz | Null if active |
| `duration_minutes` | integer | Configured duration (default 90) |
| `day_mode` | enum | Mode active during sprint |
| `energy_before` | integer | 1-5 energy at start |
| `energy_after` | integer | 1-5 energy at end |
| `completed` | boolean | Did sprint run to completion? |

### `energy_check_ins`

| Column | Type | Notes |
|--------|------|-------|
| `id` | text PK | UUID |
| `tenant_id` | text | RLS enforced |
| `user_id` | text FK -> users | |
| `level` | integer | 1-5 |
| `context` | text | Where in the day (post-sprint, morning, etc.) |
| `created_at` | timestamptz | |

### `day_mode_log`

| Column | Type | Notes |
|--------|------|-------|
| `id` | text PK | UUID |
| `tenant_id` | text | RLS enforced |
| `user_id` | text FK -> users | |
| `date` | date | |
| `mode` | enum | `normal`, `disrupted`, `crisis` |
| `reason` | text | Why this mode was set |
| `set_by` | enum | `user`, `system` |
| `created_at` | timestamptz | |

## MCP Tools

| Tool | Description |
|------|-------------|
| `list_goals` | List goals with filters |
| `get_goal` | Goal detail with progress |
| `create_goal` | Create a new goal |
| `update_goal` | Update goal fields |
| `get_daily_plan` | Get today's plan and priorities |
| `update_daily_plan` | Set today's priorities and intentions |
| `start_cognitive_sprint` | Start a focused work sprint |
| `stop_cognitive_sprint` | End current sprint |
| `record_energy` | Record an energy check-in |
| `get_day_mode` | Get current day mode |
| `set_day_mode` | Change day mode |

## Events

| Event | Trigger |
|-------|---------|
| `goal.created` | New goal |
| `goal.completed` | Goal status -> completed |
| `goal.progress_updated` | Linked task completed |
| `ritual.completed` | Morning/evening ritual finished |
| `sprint.started` | Cognitive sprint begun |
| `sprint.completed` | Cognitive sprint ended |
| `energy.checked_in` | Energy level recorded |
| `day_mode.changed` | Day mode switched |

## Related Documentation

- [Task Management](./task-management.md) — tasks link to goals via goal_id
- [Project Management](./project-management.md) — project tasks can also link to goals
- [AI Agent Integration](./ai-agent-integration.md) — agent contract for goal and planning operations
