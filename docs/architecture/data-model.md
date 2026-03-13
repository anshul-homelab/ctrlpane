# Data Model

> Common patterns, ID conventions, RLS templates, and cross-cutting table designs for ctrlpane.
> Individual domain tables are specified in `docs/specs/`. This document covers shared patterns.

---

## Common Column Patterns

Every domain table includes these standard columns:

```sql
CREATE TABLE {table} (
  id          TEXT PRIMARY KEY,           -- Prefixed ULID (e.g., tsk_01HQ...)
  tenant_id   TEXT NOT NULL REFERENCES tenants(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at  TIMESTAMPTZ,               -- Soft delete (NULL = active)
  created_by  TEXT REFERENCES users(id),  -- Where applicable
  -- domain-specific columns follow
);
```

### Column Notes

- `id`: Always a prefixed ULID. The prefix identifies the entity type for debugging and log correlation.
- `tenant_id`: Non-nullable on every domain table. Referenced by all RLS policies.
- `created_at` / `updated_at`: Auto-managed. `updated_at` uses a trigger or application-level update.
- `deleted_at`: Soft delete for user-facing data. Hard delete only for GDPR compliance, test cleanup, or infrastructure tables.
- `created_by`: Present on user-created entities (tasks, projects, notes). Absent on system-generated records (audit logs, processed events).

---

## ID Prefix Registry

Every entity type has a unique 3-4 character prefix followed by an underscore and a ULID. This makes IDs self-describing in logs, URLs, and debugging.

| Prefix | Entity | Domain |
|--------|--------|--------|
| `tnt_` | Tenant | auth |
| `usr_` | User | auth |
| `ses_` | Session | auth |
| `apk_` | API Key | auth |
| `rol_` | Role | auth |
| `perm_` | Permission | auth |
| `tsk_` | Task (personal) | tasks |
| `tcm_` | Task Comment | tasks |
| `tac_` | Task Activity | tasks |
| `prj_` | Project | projects |
| `pwi_` | Project Work Item | projects |
| `mst_` | Milestone | projects |
| `spr_` | Sprint | projects |
| `wfl_` | Workflow | projects |
| `wfs_` | Workflow Status | projects |
| `wft_` | Workflow Transition | projects |
| `lbl_` | Label | projects |
| `cmp_` | Component | projects |
| `cfd_` | Custom Field Definition | projects |
| `cfv_` | Custom Field Value | projects |
| `svw_` | Saved View | projects |
| `tls_` | Task Lease | projects |
| `dep_` | Task Dependency | projects |
| `elk_` | Entity Link | projects |
| `gol_` | Goal | goals |
| `dhi_` | Daily History | goals |
| `csp_` | Cognitive Sprint | goals |
| `eck_` | Energy Check-In | goals |
| `nfl_` | Note Folder | notes |
| `nte_` | Note | notes |
| `nvr_` | Note Version | notes |
| `ags_` | Agent Session | agents |
| `aga_` | Agent Activity | agents |
| `ntf_` | Notification | notifications |
| `ntp_` | Notification Preference | notifications |
| `igc_` | Integration Config | integrations |
| `igr_` | Integration Credential | integrations |
| `whk_` | Webhook | integrations |
| `obx_` | Outbox Event | infra |
| `pev_` | Processed Event | infra |
| `aud_` | Audit Log Entry | infra |
| `bpi_` | Blueprint Item | blueprint |
| `bpt_` | Blueprint Tag | blueprint |
| `bpc_` | Blueprint Comment | blueprint |
| `bpa_` | Blueprint Activity | blueprint |
| `ffg_` | Feature Flag | infra |

### Rules for New Prefixes

1. Always 3-4 lowercase characters + underscore
2. Must be unique across the entire registry
3. Register the prefix in this table before creating the migration
4. Use the prefix in both the Drizzle schema `$default` and the shared ID generation utility

### ID Generation

```typescript
// packages/shared/src/id.ts
import { ulid } from 'ulid';

export const createId = (prefix: string): string => `${prefix}${ulid()}`;

// Usage
const taskId = createId('tsk_');    // tsk_01HQ7Z3K4W...
const projectId = createId('prj_'); // prj_01HQ7Z3K4X...
```

---

## RLS Policy Template

Every domain table must have RLS enabled and forced. Use this template:

```sql
-- Enable + Force RLS
ALTER TABLE {table} ENABLE ROW LEVEL SECURITY;
ALTER TABLE {table} FORCE ROW LEVEL SECURITY;

-- Tenant isolation policy (covers SELECT, INSERT, UPDATE, DELETE)
CREATE POLICY tenant_isolation ON {table}
  USING (tenant_id = current_setting('app.tenant_id'))
  WITH CHECK (tenant_id = current_setting('app.tenant_id'));
```

### Per-Transaction Tenant Context

```sql
-- Set in every transaction (done by middleware before any query)
SET LOCAL app.tenant_id = 'tnt_01HQ...';
```

`SET LOCAL` is scoped to the transaction and automatically cleared on commit/rollback. This is safe with connection pooling.

### Postgres Roles

| Role | Purpose | RLS Behavior |
|------|---------|-------------|
| `ctrlpane_app` | Application queries | RLS enforced (FORCE) |
| `ctrlpane_migrator` | Schema migrations | RLS enforced (FORCE) — migrations should not read/write user data |
| `ctrlpane_superadmin` | Break-glass access | BYPASSRLS — audit required for every query |

### RLS Test Pattern

```typescript
describe('RLS Isolation', () => {
  it('returns zero rows without SET LOCAL', async () => {
    const result = await db.select().from(tasks);
    expect(result).toHaveLength(0);
  });

  it('tenant A cannot see tenant B data', async () => {
    await db.execute(sql`SET LOCAL app.tenant_id = ${tenantA}`);
    await db.insert(tasks).values({ id: 'tsk_1', tenant_id: tenantA, title: 'A task' });

    await db.execute(sql`SET LOCAL app.tenant_id = ${tenantB}`);
    const result = await db.select().from(tasks);
    expect(result).toHaveLength(0);
  });

  it('soft-deleted rows excluded from queries', async () => {
    await db.execute(sql`SET LOCAL app.tenant_id = ${tenantA}`);
    const result = await db.select().from(tasks).where(isNull(tasks.deleted_at));
    // verify deleted rows are excluded
  });
});
```

---

## Soft Delete Pattern

User-facing data uses soft delete via the `deleted_at` column:

```sql
-- Soft delete a record
UPDATE tasks SET deleted_at = now() WHERE id = 'tsk_01HQ...';

-- Query active records (standard pattern — always include this WHERE clause)
SELECT * FROM tasks WHERE deleted_at IS NULL;

-- Partial index for performance
CREATE INDEX idx_tasks_active ON tasks (tenant_id, created_at)
  WHERE deleted_at IS NULL;
```

### When to Use Hard Delete

- **GDPR data erasure requests** — permanent deletion required by law
- **Test cleanup** — `afterEach`/`afterAll` hooks in tests
- **Infrastructure tables** — outbox events after successful publication, processed events after TTL

---

## JSONB Metadata Pattern

For extensible metadata that does not warrant dedicated columns:

```sql
-- Column definition
metadata JSONB NOT NULL DEFAULT '{}',

-- Index for key lookups
CREATE INDEX idx_{table}_metadata ON {table} USING GIN (metadata);
```

### Usage Guidelines

- Use JSONB for user-defined metadata, custom field values, widget configurations
- Do NOT use JSONB as a substitute for typed columns — if a field is queried frequently, it should be a column
- Always validate JSONB structure with Zod schemas at the application layer
- Never store sensitive data (passwords, tokens) in JSONB columns

---

## Indexing Strategy

### Required Indexes (Every Table)

1. **`tenant_id`**: Leading column in all composite indexes for tenant-scoped queries
2. **Foreign key columns**: Every FK column gets an index (prevents sequential scans on JOIN/DELETE)
3. **Soft delete partial index**: `WHERE deleted_at IS NULL` on tables with soft delete

### Composite Index Pattern

```sql
-- Tenant-scoped queries always lead with tenant_id
CREATE INDEX idx_tasks_tenant_status ON tasks (tenant_id, status) WHERE deleted_at IS NULL;
CREATE INDEX idx_tasks_tenant_assignee ON tasks (tenant_id, assigned_to) WHERE deleted_at IS NULL;
CREATE INDEX idx_tasks_tenant_created ON tasks (tenant_id, created_at DESC) WHERE deleted_at IS NULL;

-- FK indexes
CREATE INDEX idx_tasks_project_id ON tasks (project_id);
CREATE INDEX idx_tasks_goal_id ON tasks (goal_id);
CREATE INDEX idx_tasks_sprint_id ON tasks (sprint_id);
```

### Full-Text Search

```sql
-- Notes domain: tsvector column + GIN index
ALTER TABLE notes ADD COLUMN search_vector tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(content, '')), 'B')
  ) STORED;

CREATE INDEX idx_notes_search ON notes USING GIN (search_vector);
```

---

## Outbox Table Design

The transactional outbox guarantees at-least-once event delivery without distributed transactions:

```sql
CREATE TABLE outbox_events (
  id              TEXT PRIMARY KEY,           -- obx_ + ULID
  tenant_id       TEXT NOT NULL REFERENCES tenants(id),
  event_type      TEXT NOT NULL,              -- e.g., 'task.created', 'project.status_changed'
  aggregate_type  TEXT NOT NULL,              -- e.g., 'task', 'project', 'goal'
  aggregate_id    TEXT NOT NULL,              -- ID of the entity that triggered the event
  payload         JSONB NOT NULL,             -- Event payload (validated by Zod schema)
  trace_id        TEXT,                       -- OpenTelemetry trace ID for correlation
  status          TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'published', 'dead_letter'
  attempts        INT NOT NULL DEFAULT 0,
  published_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE outbox_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE outbox_events FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON outbox_events
  USING (tenant_id = current_setting('app.tenant_id'))
  WITH CHECK (tenant_id = current_setting('app.tenant_id'));

-- Indexes for the outbox poller
CREATE INDEX idx_outbox_pending ON outbox_events (created_at)
  WHERE status = 'pending';
CREATE INDEX idx_outbox_dead_letter ON outbox_events (created_at)
  WHERE status = 'dead_letter';
```

### Outbox Flow

1. Service writes business data + outbox event in the same Postgres transaction
2. Outbox poller queries `SELECT ... FROM outbox_events WHERE status = 'pending' ORDER BY created_at LIMIT 100 FOR UPDATE SKIP LOCKED`
3. Poller publishes to NATS JetStream, then marks status = 'published'
4. On failure, increment `attempts`. After 10 attempts, mark as `dead_letter` and alert

---

## Processed Events Table

Ensures exactly-once consumer processing:

```sql
CREATE TABLE processed_events (
  id              TEXT PRIMARY KEY,           -- pev_ + ULID
  event_id        TEXT NOT NULL UNIQUE,       -- The outbox event ID being processed
  consumer_name   TEXT NOT NULL,              -- e.g., 'notifications.task_completed'
  processed_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (event_id, consumer_name)
);

-- No RLS needed — infrastructure table, not tenant-scoped
-- Cleanup: delete entries older than 30 days (events cannot be redelivered after NATS retention)
```

### Consumer Pattern

```typescript
// Before processing, check if already handled
const existing = await db.select().from(processedEvents)
  .where(and(
    eq(processedEvents.eventId, event.id),
    eq(processedEvents.consumerName, 'notifications.task_completed')
  ));

if (existing.length > 0) {
  // Already processed — ack and skip
  msg.ack();
  return;
}

// Process the event, then record
await db.transaction(async (tx) => {
  await handleTaskCompleted(tx, event.payload);
  await tx.insert(processedEvents).values({
    id: createId('pev_'),
    eventId: event.id,
    consumerName: 'notifications.task_completed',
  });
});

msg.ack();
```

---

## Audit Log Table

Append-only, immutable audit log:

```sql
CREATE TABLE audit_logs (
  id              TEXT PRIMARY KEY,           -- aud_ + ULID
  tenant_id       TEXT NOT NULL REFERENCES tenants(id),
  actor_id        TEXT,                       -- User or agent ID performing the action
  actor_type      TEXT NOT NULL,              -- 'user', 'agent', 'system'
  action          TEXT NOT NULL,              -- e.g., 'task.created', 'role.assigned', 'session.started'
  resource_type   TEXT NOT NULL,              -- e.g., 'task', 'project', 'role'
  resource_id     TEXT,                       -- ID of the affected entity
  risk_level      TEXT NOT NULL DEFAULT 'normal', -- 'normal', 'elevated', 'critical'
  component       TEXT NOT NULL,              -- Source domain (e.g., 'auth', 'projects', 'agents')
  details         JSONB NOT NULL DEFAULT '{}',-- Structured event details (no secrets!)
  ip_address      TEXT,
  user_agent      TEXT,
  device_id       TEXT,
  trace_id        TEXT,                       -- OpenTelemetry trace ID
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
) PARTITION BY RANGE (created_at);

-- Monthly partitions
CREATE TABLE audit_logs_2026_03 PARTITION OF audit_logs
  FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');

-- RLS
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON audit_logs
  USING (tenant_id = current_setting('app.tenant_id'));

-- Immutability enforcement
REVOKE UPDATE, DELETE ON audit_logs FROM ctrlpane_app;

CREATE OR REPLACE FUNCTION prevent_audit_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only: UPDATE and DELETE are prohibited';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_immutability
  BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_modification();

-- Indexes
CREATE INDEX idx_audit_tenant_action ON audit_logs (tenant_id, action, created_at DESC);
CREATE INDEX idx_audit_resource ON audit_logs (tenant_id, resource_type, resource_id);
CREATE INDEX idx_audit_risk ON audit_logs (risk_level, created_at DESC)
  WHERE risk_level IN ('elevated', 'critical');
CREATE INDEX idx_audit_trace ON audit_logs (trace_id) WHERE trace_id IS NOT NULL;
```

---

## Feature Flags Table

```sql
CREATE TABLE feature_flags (
  id          TEXT PRIMARY KEY,             -- ffg_ + ULID
  key         TEXT NOT NULL UNIQUE,         -- e.g., 'agents.terminal_capture', 'integrations.jira_sync'
  description TEXT,
  enabled     BOOLEAN NOT NULL DEFAULT false,
  tenant_ids  TEXT[],                       -- NULL = global, array = per-tenant override
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Feature flags control what features *exist* (visibility). Authorization controls what users *may do* (permissions). These are separate systems.

---

## Cross-References

- [Security Architecture](./security.md) — RLS enforcement, audit logging, tenant isolation
- [Production Checklist](./production-checklist.md) — data-related verification items
- [Development Conventions](../guides/development-conventions.md) — Drizzle ORM, migration patterns
- [ADR-006 Event Architecture](../decisions/ADR-006-event-architecture.md) — outbox pattern, NATS JetStream
- Domain-specific table schemas: `docs/specs/task-management.md`, `docs/specs/project-management.md`, etc.
