# Development Conventions

## Linting & Formatting

ctrlpane uses [Biome](https://biomejs.dev/) for both linting and formatting. Configuration is in `biome.json` at the root.

### Biome Settings

| Setting | Value |
|---|---|
| Indent style | spaces |
| Indent width | 2 |
| Line width | 100 characters |
| Quote style | single |
| Semicolons | always |
| Trailing commas | all |
| `noExplicitAny` | error |

Run checks:
```bash
bun run check        # lint + format check
bun run check:fix    # auto-fix issues
```

## Pre-Commit Hooks (Lefthook)

Checks run in parallel on every commit via `lefthook.yml`:

| Hook | Glob | Purpose |
|---|---|---|
| `biome-check` | `*.{js,ts,jsx,tsx,json,css}` | Auto-fix lint/format, re-stage fixed files |
| `syncpack-lint` | `**/package.json` | Dependency version consistency |
| `sherif` | `**/package.json` | Monorepo structural rules |

**Never use `--no-verify`**. Fix the underlying issue instead.

## File Size Limits

- **Source files**: 400 lines maximum
- **Test spec files**: 300 lines maximum

When a file approaches the limit, use the **re-export hub pattern**:
1. Create split files: `service-core.ts`, `service-features.ts`
2. Turn the original into a barrel: `export * from './service-core'; export * from './service-features'`
3. All existing consumers continue to import from the original path

## Naming Conventions

| Item | Convention | Example |
|---|---|---|
| Files | kebab-case | `task-service.ts`, `project-routes.ts` |
| Types / Interfaces | PascalCase | `TaskRow`, `ProjectServiceShape` |
| Functions / Variables | camelCase | `createTask`, `listProjects` |
| Domain files | lowercase, no prefix | `routes.ts`, `service.ts` |
| Layer files | suffix `-live.ts` | `service-live.ts`, `repository-live.ts` |
| Service object | `{Domain}Service` | `TaskService`, `ProjectService` |
| Routes export | `{domain}Routes` | `tasksRoutes`, `projectsRoutes` |
| Row types | `{Entity}Row` | `TaskRow`, `GoalRow` |
| Context.Tag files | in `repository.ts` or `service.ts` | never `effect-*.ts` |

## Test Conventions

- Bun tests import their APIs explicitly from `bun:test`
- Do not rely on Bun-provided global `describe` / `it` / `test` / `expect` names in test files
- **TDD**: Write tests before or alongside implementation (red-green-refactor)
- Use Effect test layers with mock repositories — not `mock.module()`
- Test data isolated: prefix with `test-` or use unique identifiers for cleanup
- Cleanup hooks present: `afterEach`/`afterAll` clean up created entities
- Tests are self-contained: no cross-test state dependencies
- Every `describe` block includes at least one failure case
- No `test.skip()` or `test.todo()` without a tracking task

Example:
```typescript
import { describe, expect, it } from 'bun:test';
```

## Domain 3-Layer Architecture

Every domain in `apps/api/src/domains/` follows this structure:

```
domains/<name>/
  routes.ts         — HTTP layer: Hono router, zValidator, runEffect()
  service.ts        — Business logic + Context.Tag interface + class
  repository.ts     — Data access (Drizzle ORM) + Context.Tag interface + class
  service-live.ts   — Live Effect Layer for service
  repository-live.ts— Live Effect Layer for repository
  layer.ts          — Layer composition (e.g. TaskLive = service + repo + infra)
  errors.ts         — Domain-specific Data.TaggedError classes
  types.ts          — Re-export barrel for shared row/result types
```

Variant domains:
- **Routes-only** (health, badges): Only `routes.ts`, no service/repo layers
- **Service-only** (auth): `service.ts` + `service-live.ts`, no repository

## Effect.ts Patterns

### Route Boundary
```typescript
// Always use runEffect — NEVER Effect.runPromise in routes
export const tasksRoutes = new Hono()
  .get('/', (c) =>
    runEffect(c, Effect.gen(function* () {
      const svc = yield* TaskService;
      return yield* svc.listTasks();
    }))
  );
```

### Context.Tag Pattern
```typescript
// CORRECT: separate interface + class names
export interface TaskServiceShape {
  create: (input: CreateTaskInput) => Effect.Effect<TaskRow, TaskError>;
}
export class TaskService extends Context.Tag('TaskService')<TaskService, TaskServiceShape>() {}

// WRONG: declaration merging
// export interface TaskService { ... }
// export class TaskService extends Context.Tag('TaskService')<TaskService, TaskService>() {}
```

### Service Layer
```typescript
// service-live.ts
export const TaskServiceLive = Layer.effect(
  TaskService,
  Effect.gen(function* () {
    const repo = yield* TaskRepository;
    const eventBus = yield* EffectEventBus;
    return {
      create: (input) => Effect.gen(function* () {
        const task = yield* repo.create(input);
        yield* eventBus.publish('task.created', task);
        return task;
      }),
    };
  })
);
```

### Instrumentation
```typescript
// Wrap services and repositories for auto-observability
// No manual Effect.withSpan() on service methods — instrumentService handles it
export const TaskServiceLive = Layer.effect(
  TaskService,
  Effect.gen(function* () {
    const repo = yield* TaskRepository;
    return instrumentService('tasks', {
      create: (input) => repo.create(input),
      // ...
    });
  })
);
```

## Schema Conventions

All Zod schemas live in `packages/shared/src/schemas/`. Key rules:
- Use `zod/v4` import path (NOT `zod`)
- Schema fields use `snake_case` to match API conventions
- Query string params need `z.coerce.number()` / `z.coerce.boolean()` (strings from HTTP)
- Exported as `create*Schema`, `update*Schema`, `*FiltersSchema`

## Error Handling

### Tagged Errors
```typescript
// errors.ts — define domain-specific errors
import { Data } from 'effect';

export class TaskNotFoundError extends Data.TaggedError('TaskNotFoundError')<{
  readonly taskId: string;
}> {}

export class TaskValidationError extends Data.TaggedError('TaskValidationError')<{
  readonly field: string;
  readonly message: string;
}> {}
```

### Error-to-HTTP Mapping

| Error | HTTP Status |
|---|---|
| `NotFoundError` | 404 |
| `ValidationError` | 422 |
| `AuthorizationError` | 403 |
| `AuthenticationError` | 401 |
| `ConflictError` | 409 |
| `RateLimitError` | 429 |

### Standard Error Response Format
```json
{
  "error": {
    "code": "TASK_NOT_FOUND",
    "message": "Task tsk_01HQ... not found",
    "details": {}
  }
}
```

## Dependency Management

```bash
bun run lint:deps        # check for violations
bun run lint:deps:fix    # auto-fix version mismatches
```

Rules enforced by syncpack + sherif:
- All workspaces must use the same version of shared deps
- Use caret ranges (`^x.y.z`) — never `latest` tags
- Add packages with `bun add --cwd <workspace>` to avoid lockfile conflicts

## Import Conventions

- **No direct cross-domain service imports for side effects** — use events via the transactional outbox
- Shared types/schemas live in `packages/shared`, not duplicated across domains
- `Context.Tag` defined in `service.ts` / `repository.ts`, layers in `*-live.ts`
- Tier 2 dependencies (NATS, Drizzle, Redis, Centrifugo, Hono) accessed only through `Context.Tag` port interfaces, never directly in domain code

## Logging

- Use `Effect.log` / `Effect.logWarning` / `Effect.logError` — no raw `console.log/warn/error`
- Structured logging with domain context
- Never log tokens, passwords, keys, or PII beyond `user_id`
- No high-cardinality values as metric labels (no user IDs, entity IDs)

## Database Conventions

- **Drizzle ORM** for all queries — no raw SQL outside migrations
- **Expand/contract migrations**: new columns nullable or with defaults; no renames/drops without a separate migration phase with at least one deployment in between
- **RLS on all tables**: `ENABLE ROW LEVEL SECURITY` + `FORCE ROW LEVEL SECURITY`
- **Soft delete**: `deleted_at` column for user-facing data (hard delete only for GDPR, test cleanup, infrastructure tables)
- **Prefixed IDs**: Every entity has a registered prefix (e.g., `tsk_` for tasks). See `docs/architecture/data-model.md`
- All list endpoints use pagination (limit + offset or cursor) — no unbounded queries

## Git Conventions

- Conventional commits: `feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`
- **Never use `--no-verify`** — fix the underlying issue
- Lefthook pre-commit hooks are the quality gates
- Check `git diff <file>` before editing any file when multiple agents work concurrently

## Anti-Patterns (Never Do These)

- No raw SQL outside migrations — use Drizzle ORM
- No manual request parsing — use `zValidator` with Zod schemas from `@ctrlpane/shared`
- No `--no-verify` on commits
- No files over 400 lines (source) or 300 lines (tests)
- No raw `console.log/warn/error` — use `Effect.log`
- No direct cross-domain service imports for side effects — use events
- No `latest` version tags — use caret ranges
- No `Effect.runPromise` in routes — use `runEffect` from `src/lib/run-effect.ts`
- No `mock.module()` in Effect tests — use test Layers with mock repos
- No declaration merging for `Context.Tag`
- No `effect-*.ts` file naming — Context.Tag lives in `repository.ts`/`service.ts`
- No manual `Effect.withSpan()` on service methods — `instrumentService` handles it
- No hardcoded infrastructure URLs, ports, or credentials in domain code — all via env vars
