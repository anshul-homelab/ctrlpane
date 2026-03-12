# ADR-003: 3-Layer Domain Pattern with Effect.ts DI

- Status: accepted
- Date: 2026-03-12
- Decision-Makers: Anshul
- Consulted: Effect.ts documentation, hexagonal architecture patterns, LifeOS conventions

## Context and Problem Statement

ctrlpane has 8 domains (auth, tasks, projects, goals, notes, agents, notifications, integrations) that need a consistent internal architecture. The pattern must support Effect.ts dependency injection, testability without mocks, and clear separation of HTTP, business logic, and data access concerns. How should we structure each domain?

## Decision Drivers

- Consistency: every domain follows the same pattern — agents can work on any domain without relearning
- Testability: services must be testable with mock repositories via Effect Layers, not `mock.module()`
- Observability: auto-instrumentation via `instrumentService()` and `instrumentRepository()`
- Technology independence: domain code accesses infrastructure through `Context.Tag` ports, not direct imports
- File size limits: 400 LOC source, 300 LOC test — pattern must encourage small files

## Considered Options

1. 3-layer domain pattern (routes -> service -> repository) with Effect.ts DI
2. 2-layer pattern (routes -> repository) — skip service layer
3. NestJS-style controllers + services + providers

## Decision Outcome

Chosen option: "3-layer domain pattern with Effect.ts DI", because it provides clear separation of concerns, makes testing trivial via Layer substitution, and scales to complex domains without accumulating logic in route handlers.

### Domain File Structure

Every domain in `apps/api/src/domains/<name>/` follows:

```
domains/<name>/
  routes.ts         — HTTP layer: Hono router, zValidator, runEffect()
  service.ts        — Business logic interface + Context.Tag class
  service-live.ts   — Live Effect Layer implementation
  repository.ts     — Data access interface + Context.Tag class
  repository-live.ts— Live Effect Layer (Drizzle ORM)
  layer.ts          — Layer composition (e.g., TaskLive = service + repo + infra)
  errors.ts         — Domain-specific Data.TaggedError classes
  types.ts          — Re-export barrel for shared row/result types
  __tests__/        — Unit and integration tests
```

### Variant Domains

Not every domain needs the full stack:

- **Routes-only** (health, badges): Only `routes.ts`. No business logic or data access.
- **Service-only** (auth): `service.ts` + `service-live.ts`. Business logic without a dedicated repository (may use another domain's auth tables).

### Effect.ts Patterns

**Context.Tag**: Separate interface and class names. Interface uses `*Shape` suffix:

```typescript
export interface TaskServiceShape {
  create: (input: CreateTaskInput) => Effect.Effect<TaskRow, TaskNotFoundError | TaskValidationError>;
  list: (filters: TaskFilters) => Effect.Effect<PaginatedResult<TaskRow>>;
}
export class TaskService extends Context.Tag('TaskService')<TaskService, TaskServiceShape>() {}
```

**Route boundary**: Always `runEffect(c, effect)` — never `Effect.runPromise`:

```typescript
export const tasksRoutes = new Hono()
  .get('/', (c) =>
    runEffect(c, Effect.gen(function* () {
      const svc = yield* TaskService;
      return yield* svc.list(c.req.valid('query'));
    }))
  );
```

**Test layers**: `makeTestLayer(mockRepo)` factory — no `mock.module()`:

```typescript
const TestTaskLayer = Layer.succeed(TaskRepository, {
  create: () => Effect.succeed(mockTask),
  findById: () => Effect.succeed(mockTask),
});

const program = Effect.gen(function* () {
  const svc = yield* TaskService;
  return yield* svc.create(input);
});

const result = await Effect.runPromise(
  program.pipe(Effect.provide(TaskServiceLive), Effect.provide(TestTaskLayer))
);
```

### Layer Composition

```typescript
// layer.ts — composes all dependencies for the domain
export const TaskLive = TaskServiceLive.pipe(
  Layer.provide(TaskRepositoryLive),
  Layer.provide(EffectEventBusLive),
  Layer.provide(DrizzleLive),
);
```

### Consequences

**Good:**
- Every domain follows the same pattern — agents learn once, apply everywhere
- Testing via Layer substitution is deterministic and fast (no I/O mocking)
- `instrumentService()` provides auto-observability without manual `Effect.withSpan()`
- File size stays manageable: logic is split across service, repository, and route files
- Technology independence: swapping Drizzle for another ORM only changes `repository-live.ts`

**Bad:**
- More files per domain (7-8 files) than a simpler 2-layer pattern
- Effect.ts patterns have a learning curve

## More Information

- [Development Conventions](../guides/development-conventions.md) — full pattern details and anti-patterns
- [ADR-001 Tech Stack](./ADR-001-tech-stack.md) — Effect.ts rationale
- [Production Checklist](../architecture/production-checklist.md) — maintainability and modularity checks
