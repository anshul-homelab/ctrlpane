# Notifications

> Multi-channel notification delivery with priority tiers, user preferences, quiet hours, and async processing via NATS events.

## Overview

Notifications is the event-driven delivery domain of ctrlpane. It consumes domain events from NATS JetStream (task assignments, goal deadlines, deploy completions, agent review requests) and routes them to users through their preferred channels: in-app stored notifications, Telegram (via Bot API), and future channels (Email, Slack).

Notifications are classified into three priority tiers — ACTION (requires a response), REVIEW (needs attention), and INFO (informational) — which determine delivery urgency, channel routing, and quiet hours bypass behavior. Users configure per-channel, per-type preferences with optional quiet hours to control when and how they receive notifications.

The domain is a pure consumer of other domains' events. It never modifies task, project, or goal data — it only reads event payloads and delivers formatted messages. Delivery is async with retry and backoff on failure.

## Capabilities

- In-app notification storage with read/unread status and bulk operations
- Telegram delivery via Bot API with structured message formatting
- Email delivery (future) via SMTP/transactional provider
- Slack delivery (future) via Slack Web API
- Three priority tiers: ACTION, REVIEW, INFO
- Per-user, per-channel, per-notification-type preference management
- Quiet hours with timezone support (ACTION tier bypasses quiet hours)
- Digest mode: batch INFO-tier notifications into periodic summaries
- Retry with exponential backoff on delivery failure (max 5 attempts)
- Dead letter handling for permanently failed deliveries
- Notification templates per type per channel
- Unsubscribe from specific notification types
- Notification badge count for in-app UI

## Multi-Tenancy and Multi-User

All tables include `tenant_id` with RLS. Notifications are scoped to individual users within a tenant.

- **Tenant isolation**: Users only see notifications for their own tenant
- **User targeting**: Each notification has a `recipient_id` — the user who receives it
- **Channel routing**: Delivery respects the recipient's channel preferences, not the sender's
- **Admin visibility**: Tenant admins can view notification delivery metrics but not individual notification content

## Architecture

```
NATS JetStream (domain events)
  -> NotificationConsumer (Effect.ts)
    -> NotificationRouter (determines recipients + channels per event type)
    -> PreferenceService (checks user preferences, quiet hours, digest eligibility)
    -> TemplateEngine (renders notification content per channel)
    -> DeliveryService (dispatches to channel adapters)
      -> InAppAdapter (Postgres insert + Centrifugo push)
      -> TelegramAdapter (Bot API HTTP calls)
      -> EmailAdapter (SMTP/transactional API) [future]
      -> SlackAdapter (Slack Web API) [future]
    -> NotificationRepository (Drizzle -> Postgres)
  -> EventBus (NATS JetStream for notification.* events)
```

The notifications domain is event-driven. It subscribes to domain events via NATS JetStream durable consumers. Each event type maps to a routing rule that determines recipients and eligible channels. Templates are rendered per channel (Markdown for in-app, HTML for Telegram, structured blocks for Slack). Delivery failures are retried with exponential backoff (1s, 2s, 4s, 8s, 16s).

## Notification Types

| Type | Priority | Description | Default Channels |
|------|----------|-------------|-----------------|
| `task.assigned` | ACTION | Task assigned to you | in-app, telegram |
| `task.due_soon` | REVIEW | Task due within 24 hours | in-app, telegram |
| `task.overdue` | ACTION | Task past due date | in-app, telegram |
| `task.commented` | INFO | New comment on your task or watched task | in-app |
| `task.status_changed` | INFO | Watched task status changed | in-app |
| `project_task.assigned` | ACTION | Project task assigned to you | in-app, telegram |
| `project_task.review_requested` | REVIEW | PR or task ready for your review | in-app, telegram |
| `sprint.started` | INFO | Sprint started in your project | in-app |
| `sprint.ending_soon` | REVIEW | Sprint ends within 24 hours | in-app, telegram |
| `milestone.completed` | INFO | Milestone completed in your project | in-app |
| `goal.deadline_approaching` | REVIEW | Goal deadline within 7 days | in-app, telegram |
| `goal.completed` | INFO | Goal marked as completed | in-app |
| `agent.needs_review` | ACTION | AI agent needs human review/approval | in-app, telegram |
| `agent.lease_expired` | REVIEW | Agent lease expired without completion | in-app, telegram |
| `deploy.completed` | INFO | Deployment completed | in-app |
| `deploy.failed` | ACTION | Deployment failed | in-app, telegram |
| `mention` | ACTION | You were mentioned in a comment or note | in-app, telegram |
| `member.invited` | INFO | You were invited to a tenant | in-app, telegram |

## Priority Tiers

| Tier | Behavior | Quiet Hours | Digest Eligible |
|------|----------|-------------|-----------------|
| **ACTION** | Immediate delivery on all enabled channels. Requires user response or acknowledgment. | Bypasses quiet hours | No — always immediate |
| **REVIEW** | Delivered promptly on enabled channels. Needs attention but not an immediate response. | Respects quiet hours (queued until end) | No |
| **INFO** | Delivered on enabled channels. Informational, no response needed. | Respects quiet hours | Yes — can be batched into digest |

## Channels

### In-App

Stored notifications displayed in the ctrlpane web UI. Delivered by inserting into the `notifications` table and pushing a real-time update via Centrifugo to connected clients.

- Always enabled (cannot be disabled)
- Supports read/unread status
- Badge count pushed via Centrifugo channel `tenant:{tid}:user:{uid}:notifications`
- Retained for 90 days, then archived

### Telegram

Delivered via Telegram Bot API. Users connect their Telegram account by initiating a conversation with the ctrlpane bot and providing a one-time linking code.

- Messages formatted with Markdown V2
- Priority tier shown as prefix: `[ACTION]`, `[REVIEW]`, or `[INFO]`
- Deep links back to the relevant ctrlpane page
- Rate limited to Telegram Bot API limits (30 msgs/second globally, 1 msg/second per chat)

### Email (Future)

Delivered via transactional email provider (e.g., Resend, Postmark).

- HTML templates with plaintext fallback
- Unsubscribe link in footer (per notification type)
- Digest mode: daily summary email for INFO-tier notifications

### Slack (Future)

Delivered via Slack Web API to a connected workspace.

- Block Kit formatted messages
- Channel-based: notifications posted to a configured channel or as DMs
- Interactive buttons for ACTION-tier notifications (e.g., "Approve", "View Task")

## User Preferences

Users configure notification preferences at three levels of granularity:

1. **Global**: Enable/disable entire channels (e.g., turn off Telegram entirely)
2. **Per-type**: Enable/disable specific notification types per channel (e.g., `task.commented` only in-app, not Telegram)
3. **Quiet hours**: Time window when REVIEW and INFO notifications are held (ACTION still delivered)

Defaults are applied from the notification type table (see Default Channels above). Users override only what they want to change.

## API Endpoints

### Notifications

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/notifications` | List notifications (filters: read/unread, type, priority, date range) |
| GET | `/api/notifications/count` | Unread notification count (for badge) |
| PATCH | `/api/notifications/:id/read` | Mark notification as read |
| POST | `/api/notifications/read-all` | Mark all notifications as read |
| DELETE | `/api/notifications/:id` | Dismiss a notification |

### Preferences

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/notifications/preferences` | Get current user's notification preferences |
| PUT | `/api/notifications/preferences` | Update notification preferences |
| GET | `/api/notifications/preferences/channels` | List available channels and connection status |

### Channel Linking

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/notifications/channels/telegram/link` | Generate Telegram linking code |
| POST | `/api/notifications/channels/telegram/verify` | Verify Telegram linking code |
| DELETE | `/api/notifications/channels/telegram` | Disconnect Telegram |

## Data Model

All tables are in the `notifications` schema and include `tenant_id` for multi-tenancy.

### `notifications`

| Column | Type | Notes |
|--------|------|-------|
| `id` | text PK | `ntf_` + ULID |
| `tenant_id` | text FK | RLS enforced |
| `recipient_id` | text FK -> users | User who receives this notification |
| `type` | text | Notification type (e.g., `task.assigned`) |
| `priority` | enum | `action`, `review`, `info` |
| `title` | text | Short notification title |
| `body` | text | Notification body (Markdown) |
| `resource_type` | text | Entity type (e.g., `task`, `project_task`, `goal`) |
| `resource_id` | text | ID of the related entity |
| `actor_id` | text FK -> users | User or agent who triggered the event |
| `actor_type` | enum | `user`, `agent`, `system` |
| `read_at` | timestamptz | Null = unread |
| `dismissed_at` | timestamptz | Null = visible |
| `metadata` | jsonb | Additional context per notification type |
| `created_at` | timestamptz | |

**Indexes**: `(tenant_id, recipient_id, read_at)`, `(tenant_id, recipient_id, created_at DESC)`, `(type)`, `(resource_type, resource_id)`.

### `notification_preferences`

| Column | Type | Notes |
|--------|------|-------|
| `id` | text PK | `ntp_` + ULID |
| `tenant_id` | text FK | RLS enforced |
| `user_id` | text FK -> users | |
| `channel` | text | `in_app`, `telegram`, `email`, `slack` |
| `notification_type` | text | Notification type or `*` for global |
| `enabled` | boolean | Whether this type+channel combination is active |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

**Constraints**: Unique on (`tenant_id`, `user_id`, `channel`, `notification_type`).

### `notification_quiet_hours`

| Column | Type | Notes |
|--------|------|-------|
| `id` | text PK | ULID |
| `tenant_id` | text FK | RLS enforced |
| `user_id` | text FK -> users | |
| `start_time` | time | Start of quiet period (e.g., `22:00`) |
| `end_time` | time | End of quiet period (e.g., `08:00`) |
| `timezone` | text | IANA timezone (e.g., `America/New_York`) |
| `days_of_week` | integer[] | 0=Sunday through 6=Saturday; null = every day |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

### `notification_deliveries`

| Column | Type | Notes |
|--------|------|-------|
| `id` | text PK | ULID |
| `tenant_id` | text FK | RLS enforced |
| `notification_id` | text FK -> notifications | |
| `channel` | text | Channel this delivery targeted |
| `status` | enum | `pending`, `delivered`, `failed`, `dead_letter` |
| `attempts` | integer | Number of delivery attempts |
| `last_attempt_at` | timestamptz | |
| `delivered_at` | timestamptz | |
| `error` | text | Last error message on failure |
| `external_id` | text | Channel-specific ID (e.g., Telegram message_id) |
| `created_at` | timestamptz | |

**Indexes**: `(status, created_at)` where status = `pending`, `(notification_id)`.

### `notification_channel_links`

| Column | Type | Notes |
|--------|------|-------|
| `id` | text PK | ULID |
| `tenant_id` | text FK | RLS enforced |
| `user_id` | text FK -> users | |
| `channel` | text | `telegram`, `slack` |
| `external_id` | text | Channel-specific user/chat ID |
| `external_username` | text | Display name on the external platform |
| `linked_at` | timestamptz | |
| `created_at` | timestamptz | |

**Constraints**: Unique on (`tenant_id`, `user_id`, `channel`).

## Delivery Flow

```
1. Domain event arrives on NATS JetStream (e.g., task.assigned)
2. NotificationConsumer receives event
3. NotificationRouter resolves:
   a. Who should be notified? (assignee, watchers, mentioned users)
   b. What notification type does this map to?
   c. What priority tier?
4. For each recipient:
   a. PreferenceService checks: is this type+channel enabled for this user?
   b. PreferenceService checks: is quiet hours active? (ACTION bypasses)
   c. If digest-eligible and digest enabled: queue for next digest batch
5. TemplateEngine renders content per channel
6. Notification row inserted into `notifications` table
7. DeliveryService dispatches to each enabled channel adapter:
   a. InAppAdapter: Centrifugo push to user's notification channel
   b. TelegramAdapter: HTTP POST to Telegram Bot API
8. Delivery result recorded in `notification_deliveries`
9. On failure: retry with exponential backoff (1s, 2s, 4s, 8s, 16s)
10. After 5 failed attempts: mark as `dead_letter`, publish notification.failed event
```

## MCP Tools

AI agents interact with notifications via these MCP tools:

| Tool | Description |
|------|-------------|
| `list_notifications` | List notifications for the authenticated agent's user |
| `get_notification_count` | Get unread notification count |
| `mark_notification_read` | Mark a notification as read |
| `send_notification` | Trigger a notification to a specific user (agent-initiated) |

## Events

The following events are published to NATS JetStream:

| Event | Trigger | Payload |
|-------|---------|---------|
| `notification.created` | New notification stored | Notification ID, recipient_id, type, priority |
| `notification.delivered` | Successfully delivered to a channel | Notification ID, channel, external_id |
| `notification.read` | User marked notification as read | Notification ID, recipient_id |
| `notification.failed` | Delivery permanently failed (dead letter) | Notification ID, channel, error, attempts |
| `notification.preferences.updated` | User changed notification preferences | User ID, changes summary |

## Events Consumed

The notifications domain subscribes to events from all other domains:

| Source Event | Notification Type | Recipients |
|-------------|-------------------|------------|
| `task.assigned` | `task.assigned` | Assignee |
| `task.completed` | `task.status_changed` | Watchers |
| `task.commented` | `task.commented` | Assignee + watchers |
| `project_task.assigned` | `project_task.assigned` | Assignee |
| `project_task.commented` | `task.commented` | Assignee + watchers |
| `milestone.completed` | `milestone.completed` | Project members |
| `sprint.started` | `sprint.started` | Project members |
| `goal.completed` | `goal.completed` | Goal owner |
| `agent.lease_expired` | `agent.lease_expired` | Project admins |
| `auth.user.invited` | `member.invited` | Invited user |

## Related Documentation

- [Task Management](./task-management.md) — task events that trigger notifications
- [Project Management](./project-management.md) — project events, sprint events, milestone events
- [Goals & Planning](./goals-and-planning.md) — goal events that trigger notifications
- [AI Agent Integration](./ai-agent-integration.md) — agent events requiring human review
- [Auth](./auth.md) — user preferences, tenant membership
- [Domain Map](../architecture/domains.md) — notifications domain definition
- [Security Architecture](../architecture/security.md) — rate limiting, audit logging
