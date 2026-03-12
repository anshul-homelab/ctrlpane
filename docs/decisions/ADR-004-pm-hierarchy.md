# ADR-004: 5-Level Project Management Hierarchy

- Status: accepted
- Date: 2026-03-12
- Decision-Makers: Anshul
- Consulted: Jira data model, LifeOS ADR-036 (Unified Work Item Hierarchy)

## Context and Problem Statement

ctrlpane needs a project management hierarchy that supports large initiatives spanning months with multiple milestones, epics, and hundreds of tasks. The hierarchy must support cascading progress aggregation, sequenced execution ordering for parallel agent work, and a unified view of multi-month efforts. The user's mental model is Jira — a typed hierarchy where all work items have a type discriminator.

## Decision Drivers

- Jira-level hierarchy depth (5 levels) for managing large initiatives
- Cascading progress aggregation from leaf to root
- Sequenced execution ordering for parallel agent work (topological sort)
- Single-table design for simple queries and efficient agent ordering
- Comments, descriptions, and full CRUD on every construct
- Minimal schema complexity — reuse existing infrastructure (activity stream, custom fields, workflows, gamification)

## Considered Options

1. **Unified Work Items** — Single `project_tasks` table with `type` discriminator
2. **Separate Tables** — Individual tables for initiatives, epics, stories, tasks, subtasks
3. **Goals-as-Initiatives** — Use Goals domain as the initiative layer

## Decision Outcome

Chosen option: "Unified Work Items", because a single table with type discrimination provides the simplest query patterns, fastest agent execution ordering (topological sort on one table), and natural cascading progress via recursive CTEs.

### Type Hierarchy

```
initiative  -> can contain: milestone, epic
milestone   -> can contain: epic, task
epic        -> can contain: task
task        -> can contain: subtask
subtask     -> leaf node (no children)
```

### Schema

All work items live in a single `project_tasks` table with a `type` column:

```sql
ALTER TABLE project_tasks
  ADD COLUMN type TEXT NOT NULL DEFAULT 'task',
  ADD COLUMN sequence INTEGER,
  ADD COLUMN target_date DATE;

-- Type values: 'initiative', 'milestone', 'epic', 'task', 'subtask'

CREATE INDEX idx_project_tasks_type ON project_tasks (tenant_id, type);
CREATE INDEX idx_project_tasks_sequence ON project_tasks (parent_task_id, sequence);
```

### Nesting Rules (Application-Enforced)

```typescript
const VALID_CHILDREN: Record<string, string[]> = {
  initiative: ['milestone', 'epic'],
  milestone: ['epic', 'task'],
  epic: ['task'],
  task: ['subtask'],
  subtask: [], // leaf node
};
```

### Progress Cascading

```sql
-- Recursive CTE for progress aggregation
WITH RECURSIVE tree AS (
  SELECT id, parent_task_id, type, status, 1 as depth
  FROM project_tasks WHERE id = :root_id
  UNION ALL
  SELECT pt.id, pt.parent_task_id, pt.type, pt.status, t.depth + 1
  FROM project_tasks pt JOIN tree t ON pt.parent_task_id = t.id
)
SELECT
  count(*) FILTER (WHERE status = 'done') AS completed,
  count(*) AS total,
  round(100.0 * count(*) FILTER (WHERE status = 'done') / count(*), 1) AS progress_pct
FROM tree WHERE type IN ('task', 'subtask');
```

### Agent Execution Ordering

```sql
-- Next work item for an agent: topological sort + sequence
SELECT id, title, type FROM project_tasks
WHERE project_id = :project_id
  AND status = 'ready'
  AND type IN ('task', 'subtask')
  AND deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM task_dependencies td
    JOIN project_tasks dep ON td.depends_on_id = dep.id
    WHERE td.task_id = project_tasks.id AND dep.status != 'done'
  )
ORDER BY sequence ASC NULLS LAST, created_at ASC
LIMIT 1;
```

### Consequences

**Good:**
- All work items queryable with a single `SELECT ... WHERE type = ?`
- Progress computation via simple recursive CTE
- Agent `work_next` is a single-table query with topological sort
- No cross-table joins for hierarchy traversal
- Existing activity stream, custom fields, workflows, labels, gamification all work unchanged

**Bad:**
- Type-specific fields (e.g., milestone `target_date`) become nullable columns
- Nesting rules are application-enforced, not schema-enforced
- The `type` column adds a filter dimension to all queries

## More Information

- [Project Management Spec](../specs/project-management.md) — full feature specification
- [ADR-005 Agent-First Design](./ADR-005-agent-first-design.md) — agent leasing and task claiming
- [Data Model](../architecture/data-model.md) — common column patterns, ID prefixes
