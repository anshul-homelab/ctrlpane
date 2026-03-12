# ADR-006: NATS JetStream + Transactional Outbox Event Architecture

- Status: accepted
- Date: 2026-03-12
- Decision-Makers: Anshul
- Consulted: NATS documentation, transactional outbox pattern literature, LifeOS event architecture

## Context and Problem Statement

ctrlpane has 8 domains that need to communicate asynchronously. When a task is completed, the notifications domain must send alerts, the gamification system must award XP, and the goals domain must update progress. These side effects must not block the primary operation, must not be lost if a service crashes, and must not execute twice. How should we implement cross-domain event communication?

## Decision Drivers

- At-least-once delivery: events must not be lost even if NATS or the consumer crashes
- Exactly-once processing: consumers must be idempotent (via `processed_events` table)
- Transactional consistency: event publication must be atomic with the business write
- No new infrastructure: use existing Postgres + NATS (already in the stack)
- Durable consumers: consumer position must survive restarts
- Ordered delivery: events for a given aggregate should be processed in order
- Technology independence: domain code publishes events via `Context.Tag` port, not direct NATS calls

## Considered Options

1. **NATS JetStream + transactional outbox** — write event to Postgres outbox in same TX, poll and publish
2. **Direct NATS publish** — publish to NATS directly from service code (no outbox)
3. **Redis Streams** — use Redis as the event bus
4. **Postgres LISTEN/NOTIFY** — use Postgres native pub-sub

## Decision Outcome

Chosen option: "NATS JetStream + transactional outbox", because the outbox guarantees transactional consistency (event written in same TX as business data), NATS JetStream provides durable ordered delivery with exactly-once consumer semantics, and the `processed_events` table prevents duplicate processing.

### Event Flow

```
1. Service writes business data + outbox event in same Postgres TX
2. Outbox poller: SELECT ... FROM outbox_events WHERE status = 'pending'
                  FOR UPDATE SKIP LOCKED
3. Poller publishes to NATS JetStream subject
4. On success: UPDATE outbox_events SET status = 'published'
5. On failure: INCREMENT attempts; after 10 -> mark 'dead_letter'
6. Consumer receives event from NATS JetStream (durable subscription)
7. Consumer checks processed_events table (exactly-once guard)
8. Consumer processes event, records in processed_events, ACKs NATS
```

### Event Subject Pattern

```
ctrlpane.{domain}.{entity}.{action}

Examples:
  ctrlpane.tasks.task.created
  ctrlpane.tasks.task.completed
  ctrlpane.projects.task.assigned
  ctrlpane.projects.sprint.started
  ctrlpane.goals.goal.completed
  ctrlpane.agents.session.started
  ctrlpane.agents.lease.expired
```

### Typed EventMap

```typescript
// packages/shared/src/events.ts
export interface EventMap {
  'task.created': { task: TaskRow };
  'task.completed': { task: TaskRow; completed_by: string };
  'task.assigned': { task: TaskRow; assigned_to: string; assigned_by: string };
  'project_task.completed': { task: ProjectTaskRow; project_id: string };
  'project.status_changed': { project: ProjectRow; old_status: string; new_status: string };
  'sprint.started': { sprint: SprintRow; project_id: string };
  'sprint.completed': { sprint: SprintRow; velocity: number };
  'goal.completed': { goal: GoalRow };
  'goal.progress_updated': { goal: GoalRow; old_progress: number; new_progress: number };
  'note.created': { note: NoteRow };
  'agent.session_started': { session: AgentSessionRow };
  'agent.session_ended': { session: AgentSessionRow; summary: string };
  'agent.lease_expired': { lease: TaskLeaseRow; task_id: string };
}
```

### Publishing via Effect

```typescript
// Service publishes events through the EffectEventBus Context.Tag
export const TaskServiceLive = Layer.effect(
  TaskService,
  Effect.gen(function* () {
    const repo = yield* TaskRepository;
    const eventBus = yield* EffectEventBus;
    return {
      complete: (taskId: string) => Effect.gen(function* () {
        const task = yield* repo.complete(taskId); // DB write + outbox in same TX
        yield* eventBus.publish('task.completed', { task, completed_by: 'usr_...' });
        return task;
      }),
    };
  })
);
```

### Consumer Pattern

```typescript
// apps/api/src/consumers/notifications/task-completed.ts
export const taskCompletedConsumer = createConsumer({
  subject: 'ctrlpane.tasks.task.completed',
  durableName: 'notifications-task-completed',
  handler: (event: EventMap['task.completed']) =>
    Effect.gen(function* () {
      // Exactly-once guard is handled by createConsumer wrapper
      const notificationSvc = yield* NotificationService;
      yield* notificationSvc.send({
        user_id: event.task.assigned_to,
        type: 'task_completed',
        payload: { task_id: event.task.id, title: event.task.title },
      });
    }),
});
```

### NATS JetStream Configuration

```
Stream: CTRLPANE_EVENTS
  Subjects: ctrlpane.>
  Retention: WorkQueue (each message delivered to one consumer per consumer group)
  Storage: File
  Max Age: 7 days
  Replicas: 1 (single-node deployment)

Consumer pattern:
  Durable name: {consumer_domain}-{event_type}
  Ack Policy: Explicit
  Max Deliver: 10
  Ack Wait: 30s
  Filter Subject: ctrlpane.{domain}.{entity}.{action}
```

### Consequences

**Good:**
- Transactional outbox guarantees event is written atomically with business data
- `processed_events` table provides exactly-once consumer processing
- NATS JetStream is lightweight (30MB memory) with durable ordered delivery
- Typed `EventMap` provides compile-time safety for event payloads
- Technology independence: `EffectEventBus` Context.Tag can be swapped to a different transport

**Bad:**
- Outbox poller adds latency (polling interval, typically 100-500ms)
- Dead letter handling requires operational attention (monitoring, alerting)
- `processed_events` table grows and needs periodic cleanup (30-day TTL)
- Two databases involved in the flow (Postgres outbox + NATS delivery)

## More Information

- [Data Model](../architecture/data-model.md) — outbox table and processed events table schemas
- [Production Checklist](../architecture/production-checklist.md) — reliability verification items
- [ADR-001 Tech Stack](./ADR-001-tech-stack.md) — NATS JetStream rationale
