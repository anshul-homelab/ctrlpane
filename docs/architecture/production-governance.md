# Production Governance Framework

**Date:** 2026-03-12 | **Status:** Accepted

## Problem Statement

ctrlpane will grow to 8+ bounded contexts (auth, tasks, projects, goals, notes, agents, notifications, integrations). Architecture rules must be mechanically enforced from day one to prevent drift as multiple AI agents build features in parallel.

## Goals

1. **Prevent architectural drift** through automated fitness functions that run on every test execution
2. **Graduate readiness requirements** into Bronze (must-ship) / Silver (operationally mature) / Gold (aspirational) tiers
3. **Equip every AI agent** with the governance context needed to build production-grade features
4. **Detect code health issues early** via dead code detection and dependency validation

## Architecture Overview

```
Enforcement Pyramid
====================

       +----------+
       |   GOLD   |  Quarterly audit
       |  (Audit) |  Full checklist review
       +----------+  Maturity scorecard per domain
       |  SILVER  |
       | (Guide)  |  Agent skills during design/planning
       |          |  Production checklist review
       +----------+  Architecture review
       |  BRONZE  |
       | (Block)  |  Fitness functions (ArchUnitTS tests)
       |          |  Biome noRestrictedImports
       |          |  Knip dead code detection
       |          |  dependency-cruiser rules
       |          |  Pre-commit hooks (Lefthook)
       +----------+
```

## Graduated Maturity Model

Every checklist item is classified into one of three tiers:

| Tier | Definition | Enforcement | Example Items |
|------|-----------|-------------|---------------|
| **Bronze** | Must-ship. Violation = broken build or blocked task | Automated tests, hooks, lint rules | Domain isolation, RLS policies, TDD, file sizes, no console.log |
| **Silver** | Operationally mature. Required before public launch | Agent guidance during design | Circuit breakers, fallback paths, observability completeness, API versioning |
| **Gold** | Aspirational. Reviewed quarterly | Audit | Chaos testing, load testing, penetration testing |

The [Production Readiness Checklist](./production-checklist.md) contains all Bronze items. Silver and Gold items are documented below.

### Silver Items (Required Before Launch)

- Contract tests validate event schemas, API request/response schemas, and realtime envelope schemas against Zod
- Event consumers tested: correct processing + idempotent redelivery + malformed event rejection
- Idempotency-Key header support on all mutating endpoints
- Outbox dead letter handling: events with `attempts > 10` marked `dead_letter` and alerted
- Consumer retry policy documented: backoff strategy, max retries, dead letter behavior
- Feature flag exists as a kill switch for each domain/feature
- Graceful degradation documented: what happens if NATS/Redis/Centrifugo is down
- No N+1 queries: batch/join queries used for list endpoints
- Audit logging added for sensitive operations (role changes, data export, agent sessions)
- Escalation prevention: users cannot grant roles equal to or above their own
- `trace_id` propagated: API edge -> outbox -> NATS header -> consumer -> Centrifugo envelope
- Validation errors include field-level details for client display
- Redis caching strategy documented: what is cached, TTL, invalidation trigger
- Failure modes documented for each external dependency
- Data included in automated backup strategy

### Gold Items (Quarterly Audit)

- Load/stress testing baselines
- Penetration testing schedule
- Formal risk register
- Restore drill verifies backup integrity
- Outbox replay tested after NATS outage
- OWASP ASVS level 2 verification

## Architecture Fitness Functions (Bronze)

Tests in `tests/architecture/` that run as part of `bun run test:arch`:

### Domain Isolation (ArchUnitTS)

```typescript
// tests/architecture/domain-isolation.test.ts
describe('Domain Isolation', () => {
  it('domains must not import other domains directly', async () => {
    // tasks/ cannot import projects/, goals/ cannot import notes/, etc.
    const rule = projectFiles()
      .inFolder('apps/api/src/domains/*/**')
      .should().not().dependOnFiles()
      .matchingPattern('apps/api/src/domains/(?!$1)');
    await expect(rule).toPassAsync();
  });

  it('domain code must not import *-live.ts from other domains', async () => {
    const rule = projectFiles()
      .inFolder('apps/api/src/domains/**')
      .should().not().dependOnFiles()
      .matchingPattern('*-live.ts')
      .thatAreNotInSameFolder();
    await expect(rule).toPassAsync();
  });

  it('no circular dependencies in src', async () => {
    const rule = projectFiles()
      .inFolder('apps/*/src/**')
      .should().haveNoCycles();
    await expect(rule).toPassAsync();
  });
});
```

### Layer Direction (ArchUnitTS)

```typescript
// tests/architecture/layer-direction.test.ts
describe('Layer Direction', () => {
  it('repositories must not import routes', async () => {
    const rule = projectFiles()
      .matchingPattern('**/repository.ts')
      .should().not().dependOnFiles()
      .matchingPattern('**/routes.ts');
    await expect(rule).toPassAsync();
  });

  it('services must not import routes', async () => {
    const rule = projectFiles()
      .matchingPattern('**/service.ts')
      .should().not().dependOnFiles()
      .matchingPattern('**/routes.ts');
    await expect(rule).toPassAsync();
  });
});
```

### Convention Checks (Custom Bun Tests)

```typescript
// tests/architecture/conventions.test.ts
describe('Conventions', () => {
  it('no console.log in backend code', () => {
    // grep-based check for console.log usage
  });

  it('no hardcoded ports in domain code', () => {
    // regex scan for port numbers in domain files
  });

  it('all domain directories follow 3-layer pattern', () => {
    // verify routes.ts + service.ts + repository.ts exist
  });

  it('all source files under 400 lines', () => {
    // line count check for all .ts files in src/
  });

  it('all test files under 300 lines', () => {
    // line count check for all .test.ts files
  });
});
```

## Dead Code Detection (Bronze)

Knip configuration for the monorepo:

```json
{
  "workspaces": {
    "apps/api": {
      "entry": ["src/index.ts"],
      "project": ["src/**/*.ts"]
    },
    "apps/web": {
      "entry": ["src/main.tsx"],
      "project": ["src/**/*.{ts,tsx}"]
    },
    "packages/shared": {
      "entry": ["src/index.ts"],
      "project": ["src/**/*.ts"]
    }
  },
  "ignore": ["**/*.test.ts", "**/__tests__/**"],
  "ignoreDependencies": ["@types/*"]
}
```

## Dependency Rules (Bronze)

### Biome Configuration

```json
{
  "linter": {
    "rules": {
      "style": {
        "noRestrictedImports": {
          "level": "error",
          "options": {
            "paths": {
              "console": "Use Effect.log instead"
            },
            "patterns": [
              {
                "group": ["apps/api/src/domains/*/repository-live*"],
                "message": "Domain code must not import *-live.ts directly — use Context.Tag ports"
              }
            ]
          }
        }
      }
    }
  }
}
```

### dependency-cruiser Configuration

```javascript
// .dependency-cruiser.mjs
export default {
  forbidden: [
    {
      name: 'no-cross-domain-imports',
      severity: 'error',
      comment: 'Domains must not import other domains directly. Use events via outbox.',
      from: { path: '^apps/api/src/domains/([^/]+)/' },
      to: { path: '^apps/api/src/domains/(?!\\1)' }
    },
    {
      name: 'no-circular-deps',
      severity: 'error',
      from: {},
      to: { circular: true }
    }
  ]
};
```

## Package.json Scripts

```json
{
  "scripts": {
    "test:arch": "bun test tests/architecture/",
    "lint:dead": "knip",
    "deps:check": "depcruise apps/api/src apps/web/src packages/shared/src --output-type err",
    "deps:graph": "depcruise apps/api/src --include-only '^apps/api/src' --output-type dot | dot -T svg > docs/architecture/dependency-graph.svg",
    "governance": "bun run test:arch && bun run lint:dead && bun run deps:check",
    "check:sizes": "bun run scripts/check-file-sizes.ts"
  }
}
```

## Fitness Functions for ctrlpane

The following architectural invariants are mechanically enforced:

| Invariant | What it Checks | Tool |
|-----------|---------------|------|
| Domain isolation | `tasks/` cannot import `projects/`, `goals/` cannot import `notes/`, etc. | ArchUnitTS, dependency-cruiser |
| Layer direction | Repositories cannot import routes; services cannot import routes | ArchUnitTS |
| No circular deps | No import cycles anywhere in `src/` | ArchUnitTS, dependency-cruiser |
| No console.log | Backend code must use `Effect.log` | Convention test, Biome rule |
| 3-layer pattern | Every domain has `routes.ts` + `service.ts` + `repository.ts` | Convention test |
| File size limits | Source files <= 400 LOC, test files <= 300 LOC | Convention test |
| No hardcoded ports | Domain code cannot contain literal port numbers | Convention test |
| No cross-domain *-live.ts imports | Live layers are internal to their domain | ArchUnitTS |
| Dead code | No unused exports, no orphan files | Knip |
