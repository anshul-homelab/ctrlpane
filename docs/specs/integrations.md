# Integrations

> External service connections with bidirectional sync, OAuth2 credential management, webhook delivery, and queue-based processing.

## Overview

Integrations is the external connectivity domain of ctrlpane. It manages connections to third-party services (Jira, Google Workspace, Slack, GitHub), handles OAuth2 credential lifecycle, provides bidirectional data synchronization, and exposes a webhook system for both inbound and outbound event delivery.

Each integration is configured per tenant and follows a common lifecycle: connect (OAuth2 flow), configure (field mappings, sync rules), sync (periodic or event-driven), and disconnect (credential cleanup). Integration credentials (OAuth tokens, API keys) are stored with AES-256-GCM column encryption using per-tenant keys.

All sync operations are processed asynchronously via NATS JetStream to avoid blocking API requests. Per-integration rate limits prevent API quota exhaustion, and a queue-based processing model ensures fair scheduling across tenants.

## Capabilities

- Jira: bidirectional issue/task sync with field mapping and conflict resolution
- Google Workspace: Calendar event -> task deadline sync, Gmail -> task creation, Drive file attachments
- Slack: message -> task creation, status update channels, slash commands
- GitHub: PR/issue sync, commit linking to tasks, deployment status tracking
- OAuth2 credential management with automatic token refresh
- Inbound webhooks: receive events from external services with signature verification
- Outbound webhooks: deliver ctrlpane events to external endpoints with HMAC signing
- Field mapping configuration per integration
- Conflict resolution strategy (ctrlpane-wins by default, configurable)
- Sync status monitoring with error reporting
- Per-integration rate limiting with queue-based processing

## Multi-Tenancy and Multi-User

All tables include `tenant_id` with RLS. Integrations are configured at the tenant level — individual users within a tenant share the same integration connections.

- **Tenant-scoped connections**: Each tenant has its own OAuth tokens and configuration per integration
- **User attribution**: Sync operations track which user initiated the sync or mapping
- **Permission requirements**: Only `owner` and `admin` roles can connect/disconnect integrations
- **Credential isolation**: Integration credentials are encrypted with per-tenant keys; cross-tenant credential access is impossible

## Architecture

```
Routes (Hono.js)
  -> IntegrationService (Effect.ts layer)
    -> IntegrationRepository (Drizzle -> Postgres)
    -> OAuthService (token exchange, refresh, revocation)
    -> SyncEngine (bidirectional sync orchestration)
      -> JiraAdapter (Jira REST API v3)
      -> GoogleAdapter (Google APIs client)
      -> SlackAdapter (Slack Web API)
      -> GitHubAdapter (GitHub REST/GraphQL API)
    -> WebhookService (inbound verification, outbound delivery)
    -> CredentialStore (AES-256-GCM encrypted storage)
  -> NATS JetStream (sync jobs, outbound webhook delivery)
```

The integrations domain follows the 3-layer pattern: `routes.ts` -> `service.ts` -> `repository.ts`. Each external service has a dedicated adapter that handles API specifics, field mapping, and rate limiting. The SyncEngine orchestrates bidirectional sync with a common conflict resolution strategy. All sync jobs and outbound webhooks are processed via NATS JetStream queues.

## Supported Integrations

### Jira

Bidirectional sync between ctrlpane tasks/project items and Jira issues.

| Feature | Direction | Description |
|---------|-----------|-------------|
| Issue sync | Bidirectional | Jira issues <-> ctrlpane project tasks |
| Status mapping | Bidirectional | Map Jira statuses to ctrlpane workflow statuses |
| Priority mapping | Bidirectional | Map Jira priorities to ctrlpane priority levels |
| Assignee mapping | Bidirectional | Map Jira users to ctrlpane users via email |
| Sprint sync | Jira -> ctrlpane | Import Jira sprints as ctrlpane sprints |
| Comment sync | Bidirectional | Sync comments between platforms |
| Attachment links | Jira -> ctrlpane | Link Jira attachments (not downloaded) |

**Conflict Resolution**: When the same field is modified on both sides between syncs, ctrlpane value wins by default. Configurable per tenant to: `ctrlpane_wins`, `jira_wins`, or `manual_review` (creates a conflict notification).

**Sync Trigger**: Jira webhook (inbound) for near-real-time sync. Periodic full sync every 15 minutes as a fallback to catch missed webhooks.

### Google Workspace

| Feature | Direction | Description |
|---------|-----------|-------------|
| Calendar -> Tasks | Google -> ctrlpane | Calendar events create tasks with scheduled_start/end |
| Task -> Calendar | ctrlpane -> Google | Tasks with due dates appear as calendar events |
| Gmail -> Tasks | Google -> ctrlpane | Create tasks from starred/labeled emails |
| Drive attachments | Google -> ctrlpane | Link Drive files to tasks or notes |
| Calendar sync scope | Configurable | Select which calendars to sync |

**OAuth Scopes**: `calendar.readonly`, `calendar.events`, `gmail.readonly`, `drive.readonly`. Minimal scopes requested; users grant only what they need.

### Slack

| Feature | Direction | Description |
|---------|-----------|-------------|
| Message -> Task | Slack -> ctrlpane | Create tasks from Slack messages via reaction or shortcut |
| Status updates | ctrlpane -> Slack | Post task/sprint/milestone updates to a configured channel |
| Slash commands | Slack -> ctrlpane | `/ctrlpane task create`, `/ctrlpane tasks`, `/ctrlpane status` |
| Thread linking | Bidirectional | Link Slack threads to tasks; task comments appear in thread |
| Notifications | ctrlpane -> Slack | Notification delivery via Slack channel (see notifications spec) |

**Bot Permissions**: `chat:write`, `commands`, `reactions:read`, `users:read`. The Slack app is installed per workspace and linked to a ctrlpane tenant.

### GitHub

| Feature | Direction | Description |
|---------|-----------|-------------|
| Issue sync | Bidirectional | GitHub issues <-> ctrlpane project tasks |
| PR linking | GitHub -> ctrlpane | Link PRs to tasks via branch name or commit message pattern |
| Commit linking | GitHub -> ctrlpane | Link commits to tasks via `[TSK-123]` patterns in messages |
| Deploy status | GitHub -> ctrlpane | GitHub Actions deployment status -> ctrlpane deploy tracking |
| PR review requests | GitHub -> ctrlpane | PR review requests trigger `project_task.review_requested` |
| Status checks | ctrlpane -> GitHub | Post task status as commit status checks |

**Linking Convention**: Tasks are linked to GitHub entities via patterns in branch names (`feature/tsk_01HQ...`) or commit messages (`[tsk_01HQ...]`). The integration scans incoming webhooks for these patterns.

## OAuth2 Flows

Each integration uses OAuth2 Authorization Code flow with PKCE:

```
1. User clicks "Connect {Service}" in ctrlpane UI
2. Server generates state + code_verifier, stores in Redis (5 min TTL)
3. Redirect to provider's authorization URL with requested scopes
4. User authorizes on provider site
5. Provider redirects back to /api/integrations/{provider}/callback with code + state
6. Server verifies state, exchanges code for access + refresh tokens
7. Tokens encrypted (AES-256-GCM) and stored in integration_credentials
8. Connection marked as active
```

**Token Refresh**: A background job checks for tokens expiring within 5 minutes and proactively refreshes them. Failed refreshes mark the integration as `needs_reauth` and notify the tenant admin.

**Revocation**: Disconnecting an integration revokes tokens at the provider (if supported) and deletes encrypted credentials from the database.

## Webhook System

### Inbound Webhooks

Receive events from external services. Each integration type has a dedicated webhook endpoint.

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/webhooks/jira` | Jira webhook receiver |
| POST | `/api/webhooks/github` | GitHub webhook receiver |
| POST | `/api/webhooks/slack/events` | Slack Events API receiver |
| POST | `/api/webhooks/slack/commands` | Slack slash commands receiver |
| POST | `/api/webhooks/google/push` | Google Calendar push notifications |
| POST | `/api/webhooks/custom/:id` | Custom inbound webhook |

**Verification**:
- Jira: JWT verification with shared secret
- GitHub: `X-Hub-Signature-256` HMAC-SHA256 verification
- Slack: `X-Slack-Signature` verification with signing secret
- Google: OAuth token verification
- Custom: HMAC-SHA256 with webhook-specific secret

### Outbound Webhooks

Deliver ctrlpane events to external endpoints configured by tenants.

- **Signing**: All outbound payloads signed with HMAC-SHA256. Signature in `X-CtrlPane-Signature-256` header.
- **Delivery**: Async via NATS JetStream. Retry with exponential backoff (1s, 2s, 4s, 8s, 16s). Dead letter after 10 attempts.
- **Filtering**: Tenants configure which event types trigger outbound delivery.
- **Payload**: Standard envelope with `event_type`, `timestamp`, `tenant_id`, and domain-specific `data`.

## API Endpoints

### Integration Management

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/integrations` | List all integrations and their connection status |
| GET | `/api/integrations/:provider` | Get integration details and configuration |
| POST | `/api/integrations/:provider/connect` | Initiate OAuth2 flow (returns redirect URL) |
| GET | `/api/integrations/:provider/callback` | OAuth2 callback (handles code exchange) |
| POST | `/api/integrations/:provider/disconnect` | Disconnect integration (revoke + delete credentials) |
| PATCH | `/api/integrations/:provider/config` | Update integration configuration (field mappings, sync rules) |

### Sync

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/integrations/:provider/sync` | Trigger manual sync |
| GET | `/api/integrations/:provider/sync/status` | Current sync status and last sync timestamp |
| GET | `/api/integrations/:provider/sync/history` | Sync history with success/failure counts |
| GET | `/api/integrations/:provider/sync/conflicts` | List unresolved sync conflicts |
| POST | `/api/integrations/:provider/sync/conflicts/:id/resolve` | Resolve a sync conflict |

### Field Mappings

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/integrations/:provider/mappings` | Get field mappings |
| PUT | `/api/integrations/:provider/mappings` | Update field mappings |
| GET | `/api/integrations/:provider/mappings/preview` | Preview mapping with sample data |

### Outbound Webhooks

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/webhooks/outbound` | List outbound webhook endpoints |
| POST | `/api/webhooks/outbound` | Create outbound webhook endpoint |
| PATCH | `/api/webhooks/outbound/:id` | Update webhook configuration (URL, events, enabled) |
| DELETE | `/api/webhooks/outbound/:id` | Delete outbound webhook endpoint |
| POST | `/api/webhooks/outbound/:id/test` | Send test payload to webhook |
| GET | `/api/webhooks/outbound/:id/deliveries` | Delivery history for a webhook |

## Data Model

All tables are in the `integrations` schema and include `tenant_id` for multi-tenancy.

### `integrations`

| Column | Type | Notes |
|--------|------|-------|
| `id` | text PK | `igc_` + ULID |
| `tenant_id` | text FK | RLS enforced |
| `provider` | enum | `jira`, `google`, `slack`, `github` |
| `status` | enum | `active`, `inactive`, `needs_reauth`, `error` |
| `config` | jsonb | Provider-specific configuration (project keys, calendar IDs, channels) |
| `connected_by` | text FK -> users | User who authorized the connection |
| `last_sync_at` | timestamptz | Last successful sync |
| `sync_error` | text | Last sync error message |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

**Constraints**: Unique on (`tenant_id`, `provider`).

### `integration_credentials`

| Column | Type | Notes |
|--------|------|-------|
| `id` | text PK | `igr_` + ULID |
| `tenant_id` | text FK | RLS enforced |
| `integration_id` | text FK -> integrations | |
| `access_token` | text | AES-256-GCM encrypted |
| `refresh_token` | text | AES-256-GCM encrypted |
| `token_type` | text | `bearer`, `bot` |
| `scopes` | text[] | Granted OAuth scopes |
| `expires_at` | timestamptz | Access token expiry |
| `provider_account_id` | text | Provider-specific account/workspace ID |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

**Encryption**: All token columns encrypted at rest with AES-256-GCM using per-tenant encryption keys. Tokens are decrypted only in memory during API calls and never logged.

### `sync_mappings`

| Column | Type | Notes |
|--------|------|-------|
| `id` | text PK | ULID |
| `tenant_id` | text FK | RLS enforced |
| `integration_id` | text FK -> integrations | |
| `ctrlpane_entity_type` | text | `task`, `project_task`, `sprint`, `milestone` |
| `ctrlpane_entity_id` | text | ID of the ctrlpane entity |
| `external_entity_type` | text | `jira_issue`, `github_issue`, `github_pr`, `calendar_event` |
| `external_entity_id` | text | ID on the external platform |
| `external_url` | text | URL to the entity on the external platform |
| `field_mapping` | jsonb | Field-level mapping configuration |
| `sync_direction` | enum | `bidirectional`, `inbound`, `outbound` |
| `last_synced_at` | timestamptz | |
| `last_sync_hash` | text | Hash of last synced state (change detection) |
| `conflict_status` | enum | `none`, `pending`, `resolved` |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

**Indexes**: `(tenant_id, integration_id, external_entity_id)`, `(tenant_id, ctrlpane_entity_type, ctrlpane_entity_id)`, `(conflict_status)` where status = `pending`.

### `sync_history`

| Column | Type | Notes |
|--------|------|-------|
| `id` | text PK | ULID |
| `tenant_id` | text FK | RLS enforced |
| `integration_id` | text FK -> integrations | |
| `sync_type` | enum | `full`, `incremental`, `webhook` |
| `direction` | enum | `inbound`, `outbound`, `bidirectional` |
| `status` | enum | `running`, `completed`, `failed` |
| `entities_created` | integer | Count of new entities synced |
| `entities_updated` | integer | Count of updated entities |
| `entities_failed` | integer | Count of failed entity syncs |
| `conflicts_detected` | integer | Count of conflicts found |
| `error` | text | Error message on failure |
| `started_at` | timestamptz | |
| `completed_at` | timestamptz | |

### `webhook_endpoints`

| Column | Type | Notes |
|--------|------|-------|
| `id` | text PK | `whk_` + ULID |
| `tenant_id` | text FK | RLS enforced |
| `url` | text | Target URL for outbound delivery |
| `secret` | text | AES-256-GCM encrypted HMAC signing secret |
| `event_types` | text[] | Array of event types to deliver (e.g., `task.created`) |
| `enabled` | boolean | Default true |
| `description` | text | User-assigned description |
| `created_by` | text FK -> users | |
| `last_delivery_at` | timestamptz | |
| `failure_count` | integer | Consecutive failures (reset on success) |
| `disabled_reason` | text | Set when auto-disabled after repeated failures |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

### `webhook_deliveries`

| Column | Type | Notes |
|--------|------|-------|
| `id` | text PK | ULID |
| `tenant_id` | text FK | RLS enforced |
| `webhook_id` | text FK -> webhook_endpoints | |
| `event_type` | text | Event that triggered delivery |
| `payload` | jsonb | Delivered payload |
| `status` | enum | `pending`, `delivered`, `failed`, `dead_letter` |
| `response_status` | integer | HTTP response status code |
| `response_body` | text | Truncated response body (first 1KB) |
| `attempts` | integer | Delivery attempts |
| `last_attempt_at` | timestamptz | |
| `delivered_at` | timestamptz | |
| `created_at` | timestamptz | |

**Indexes**: `(webhook_id, created_at DESC)`, `(status)` where status = `pending`.

## Sync Engine

### Bidirectional Sync Flow

```
1. Sync triggered (webhook event, manual trigger, or periodic schedule)
2. SyncEngine fetches changes from external service since last_synced_at
3. For each external change:
   a. Look up sync_mapping for this external entity
   b. If no mapping: create ctrlpane entity + mapping (inbound)
   c. If mapping exists: compare last_sync_hash to detect ctrlpane-side changes
   d. If both sides changed: apply conflict resolution strategy
   e. Apply field mapping and update ctrlpane entity
4. Fetch ctrlpane changes since last_synced_at
5. For each ctrlpane change:
   a. Look up sync_mapping for this ctrlpane entity
   b. If no mapping and outbound enabled: create external entity + mapping
   c. If mapping exists: apply field mapping and update external entity
6. Update last_synced_at and last_sync_hash for all processed mappings
7. Record sync_history entry
```

### Conflict Resolution Strategies

| Strategy | Behavior |
|----------|----------|
| `ctrlpane_wins` | ctrlpane value overwrites external. Default. |
| `external_wins` | External value overwrites ctrlpane. |
| `manual_review` | Create a conflict notification; both values preserved until user resolves. |
| `latest_wins` | Compare timestamps; most recent edit wins. |

### Rate Limiting

Each integration adapter enforces per-provider rate limits:

| Provider | Rate Limit | Strategy |
|----------|-----------|----------|
| Jira | 100 req/min per tenant | Token bucket, queue overflow |
| Google | 300 req/min per tenant | Token bucket, exponential backoff on 429 |
| Slack | 50 req/min per workspace | Tier-based per Slack API tiers |
| GitHub | 5000 req/hour per installation | Token bucket with remaining-header tracking |

When a rate limit is hit, pending requests are queued in NATS JetStream and retried after the rate limit window resets.

## MCP Tools

AI agents interact with integrations via these MCP tools:

| Tool | Description |
|------|-------------|
| `list_integrations` | List connected integrations and their status |
| `get_integration_status` | Get sync status and last sync time for a provider |
| `trigger_sync` | Trigger a manual sync for a specific integration |
| `get_sync_conflicts` | List unresolved sync conflicts |
| `resolve_sync_conflict` | Resolve a sync conflict with a chosen strategy |
| `get_external_link` | Get the external URL for a synced entity |

## Events

The following events are published to NATS JetStream:

| Event | Trigger | Payload |
|-------|---------|---------|
| `integration.connected` | OAuth2 flow completed | Integration ID, provider, tenant_id |
| `integration.disconnected` | Integration disconnected | Integration ID, provider, tenant_id |
| `integration.needs_reauth` | Token refresh failed | Integration ID, provider, tenant_id |
| `integration.sync.started` | Sync job began | Integration ID, sync_type, direction |
| `integration.sync.completed` | Sync job finished | Integration ID, entities_created, entities_updated, conflicts |
| `integration.sync.failed` | Sync job failed | Integration ID, error |
| `integration.sync.conflict` | Conflict detected during sync | Integration ID, ctrlpane_entity_id, external_entity_id |
| `integration.webhook.received` | Inbound webhook received | Provider, event_type |
| `integration.webhook.delivered` | Outbound webhook delivered | Webhook ID, event_type |
| `integration.webhook.failed` | Outbound webhook permanently failed | Webhook ID, event_type, error |
| `integration.error` | General integration error | Integration ID, error_type, message |

## Events Consumed

The integrations domain subscribes to ctrlpane events for outbound sync and webhook delivery:

| Source Event | Action |
|-------------|--------|
| `task.created` / `task.updated` / `task.completed` | Sync to Jira (if mapped), deliver to outbound webhooks |
| `project_task.created` / `project_task.updated` | Sync to Jira/GitHub (if mapped), deliver to outbound webhooks |
| `goal.completed` | Deliver to outbound webhooks |
| `note.created` / `note.updated` | Deliver to outbound webhooks |
| All domain events | Deliver to matching outbound webhook endpoints |

## Security Considerations

- **Credential encryption**: All OAuth tokens and API secrets encrypted at rest with AES-256-GCM using per-tenant keys
- **Webhook signature verification**: Every inbound webhook is verified against provider-specific signing mechanisms before processing
- **Outbound webhook signing**: All outbound payloads signed with HMAC-SHA256 to prevent tampering
- **Minimal OAuth scopes**: Request only the scopes required for configured features
- **Token refresh isolation**: Token refresh failures for one tenant do not affect other tenants
- **Audit trail**: All integration connections, disconnections, and sync operations are logged in the audit log
- **No credential exposure**: API endpoints never return tokens or secrets — only metadata (provider, scopes, expiry)
- **Webhook endpoint validation**: Outbound webhook URLs are validated against a denylist (no internal/private IPs)

## Related Documentation

- [Auth](./auth.md) — OAuth2 credential storage, API key management, tenant context
- [Task Management](./task-management.md) — tasks synced with Jira, GitHub
- [Project Management](./project-management.md) — project tasks synced with Jira, GitHub
- [Notifications](./notifications.md) — Slack delivery channel, sync conflict notifications
- [AI Agent Integration](./ai-agent-integration.md) — agent access to integration data
- [Domain Map](../architecture/domains.md) — integrations domain definition
- [Security Architecture](../architecture/security.md) — credential encryption, webhook security
- [Data Model](../architecture/data-model.md) — ID prefix registry (igc_, igr_, whk_)
