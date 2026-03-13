# Blueprint Vertical Slice Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development to implement this plan. Each wave deploys parallel agent teams in isolated git worktrees. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the blueprint domain as a complete production-grade vertical slice — proving every architectural layer works end-to-end before building real product domains.

**Architecture:** 9 parallel agent teams organized in 5 waves, with an integration agent that wires everything together after all teams complete. Each team works in an isolated git worktree to prevent conflicts. Teams are sequenced by dependency: scaffold first, then database/shared/CI in parallel, then API foundation, then domain/frontend/MCP/testing in parallel, then integration.

**Tech Stack:** Bun, TypeScript (strict), Hono.js, Effect.ts, Drizzle ORM, PostgreSQL 17 (RLS), Redis 7, NATS JetStream, Centrifugo v5, React 19, TanStack Router/Query, Vitest, testcontainers, Biome, Lefthook, Turborepo, GitHub Actions, systemd

---

## Table of Contents

- [Wave 1: Foundation](#wave-1-foundation)
  - [Team A — Monorepo Scaffold](#team-a--monorepo-scaffold)
- [Wave 2: Parallel Foundation Layers](#wave-2-parallel-foundation-layers)
  - [Team B — Database Layer](#team-b--database-layer)
  - [Team C — Shared Package](#team-c--shared-package)
  - [Team I — CI/CD & Deployment](#team-i--cicd--deployment)
  - [Team G Phase 1 — Frontend Scaffold](#team-g-phase-1--frontend-scaffold)
  - [Team H Phase 1 — Test Infrastructure](#team-h-phase-1--test-infrastructure)
- [Wave 3: API Foundation](#wave-3-api-foundation)
  - [Team D — API Foundation](#team-d--api-foundation)
- [Wave 4: Parallel Domain Work](#wave-4-parallel-domain-work)
  - [Team E — Blueprint API Domain](#team-e--blueprint-api-domain)
  - [Team F — MCP Server](#team-f--mcp-server)
  - [Team G Phase 2 — Frontend API Integration](#team-g-phase-2--frontend-api-integration)
  - [Team H Phase 2 — Full Test Suite](#team-h-phase-2--full-test-suite)
- [Wave 5: Integration](#wave-5-integration)
  - [Integration Agent](#integration-agent)

---

## Wave 1: Foundation

### Team A — Monorepo Scaffold

**Scope:** Project structure, tooling, dev infrastructure. No domain code.
**Branch:** `feat/tooling/monorepo-scaffold`
**Dependency:** None (first to run).

---

#### A1. Initialize Bun workspace root

**Files:**
- Create: `package.json`
- Modify: `.gitignore`

**Steps:**
- [ ] Create root `package.json` with workspace configuration
- [ ] Update `.gitignore` with comprehensive ignores for the monorepo
- [ ] Verify `bun install` runs cleanly

**Code — `package.json`:**
```json
{
  "name": "ctrlpane",
  "private": true,
  "workspaces": ["apps/*", "packages/*"],
  "scripts": {
    "build": "turbo run build",
    "dev": "process-compose up",
    "lint": "turbo run lint",
    "lint:fix": "turbo run lint:fix",
    "check": "turbo run check",
    "check:fix": "turbo run check:fix",
    "typecheck": "turbo run typecheck",
    "test": "turbo run test",
    "test:unit": "turbo run test:unit",
    "test:integration": "turbo run test:integration",
    "test:arch": "turbo run test:arch",
    "changeset": "changeset",
    "version": "changeset version"
  },
  "devDependencies": {
    "@changesets/cli": "^2.27.0",
    "@commitlint/cli": "^19.0.0",
    "@commitlint/config-conventional": "^19.0.0",
    "@biomejs/biome": "^1.9.0",
    "lefthook": "^1.6.0",
    "turbo": "^2.3.0",
    "typescript": "^5.7.0"
  }
}
```

**Code — `.gitignore` additions:**
```
# Dependencies
node_modules/

# Build outputs
dist/
.turbo/

# Environment
.env
.env.local
.env.*.local

# IDE
.idea/
.vscode/
*.swp
*.swo

# OS
.DS_Store
Thumbs.db

# Test
coverage/

# Drizzle
drizzle/meta/

# Bun
bun.lockb
```

**Commands:**
```bash
bun install
```

---

#### A2. Create apps/api package

**Files:**
- Create: `apps/api/package.json`
- Create: `apps/api/tsconfig.json`
- Create: `apps/api/src/index.ts` (stub)

**Steps:**
- [ ] Create `apps/api/` directory
- [ ] Write `package.json` with api-specific deps
- [ ] Write strict `tsconfig.json`
- [ ] Write minimal `src/index.ts` entry point stub
- [ ] Verify `bun run --cwd apps/api typecheck` passes

**Code — `apps/api/package.json`:**
```json
{
  "name": "@ctrlpane/api",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "bun run --watch src/index.ts",
    "build": "bun build src/index.ts --outdir dist --target bun",
    "start": "bun run dist/index.js",
    "typecheck": "tsc --noEmit",
    "lint": "biome check src/",
    "lint:fix": "biome check --write src/",
    "check": "biome check src/",
    "check:fix": "biome check --write src/",
    "test": "bun test",
    "test:unit": "bun test --grep 'unit'",
    "test:integration": "bun test --grep 'integration'"
  },
  "dependencies": {
    "@ctrlpane/shared": "workspace:*",
    "hono": "^4.7.0",
    "effect": "^3.12.0",
    "@effect/platform": "^0.72.0",
    "@effect/schema": "^0.75.0",
    "drizzle-orm": "^0.38.0",
    "postgres": "^3.4.0",
    "ioredis": "^5.4.0",
    "nats": "^2.28.0",
    "ulid": "^2.3.0",
    "zod": "^3.24.0"
  },
  "devDependencies": {
    "@types/bun": "^1.2.0",
    "drizzle-kit": "^0.30.0",
    "typescript": "^5.7.0"
  }
}
```

**Code — `apps/api/tsconfig.json`:**
```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noEmit": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "jsx": "react-jsx",
    "types": ["bun-types"],
    "paths": {
      "@ctrlpane/shared": ["../../packages/shared/src"],
      "@ctrlpane/shared/*": ["../../packages/shared/src/*"]
    },
    "baseUrl": ".",
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist"]
}
```

**Code — `apps/api/src/index.ts` (stub):**
```typescript
console.log('ctrlpane API server starting...');
```

---

#### A3. Create apps/web package

**Files:**
- Create: `apps/web/package.json`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/vite.config.ts`
- Create: `apps/web/index.html`
- Create: `apps/web/src/main.tsx` (stub)

**Steps:**
- [ ] Create `apps/web/` directory structure
- [ ] Write `package.json` with React 19 + TanStack deps
- [ ] Write strict `tsconfig.json` for frontend
- [ ] Write Vite config with React plugin
- [ ] Write `index.html` and `src/main.tsx` stubs
- [ ] Verify `bun run --cwd apps/web typecheck` passes

**Code — `apps/web/package.json`:**
```json
{
  "name": "@ctrlpane/web",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite --port 33000",
    "build": "tsc && vite build",
    "preview": "vite preview --port 33000",
    "typecheck": "tsc --noEmit",
    "lint": "biome check src/",
    "lint:fix": "biome check --write src/",
    "check": "biome check src/",
    "check:fix": "biome check --write src/",
    "test": "bun test",
    "test:unit": "bun test --grep 'unit'"
  },
  "dependencies": {
    "@ctrlpane/shared": "workspace:*",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "@tanstack/react-router": "^1.95.0",
    "@tanstack/react-query": "^5.64.0",
    "centrifuge": "^5.2.0",
    "zod": "^3.24.0"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.3.0",
    "vite": "^6.1.0",
    "typescript": "^5.7.0"
  }
}
```

**Code — `apps/web/vite.config.ts`:**
```typescript
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 33000,
    proxy: {
      '/api': {
        target: 'http://localhost:33001',
        changeOrigin: true,
      },
    },
  },
  resolve: {
    alias: {
      '@': '/src',
    },
  },
});
```

**Code — `apps/web/tsconfig.json`:**
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noEmit": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "jsx": "react-jsx",
    "paths": {
      "@/*": ["./src/*"],
      "@ctrlpane/shared": ["../../packages/shared/src"],
      "@ctrlpane/shared/*": ["../../packages/shared/src/*"]
    },
    "baseUrl": "."
  },
  "include": ["src/**/*.ts", "src/**/*.tsx"],
  "exclude": ["node_modules", "dist"]
}
```

**Code — `apps/web/index.html`:**
```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>ctrlpane</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

**Code — `apps/web/src/main.tsx`:**
```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Root element not found');

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <div>ctrlpane</div>
  </React.StrictMode>,
);
```

---

#### A4. Create packages/shared package

**Files:**
- Create: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`
- Create: `packages/shared/src/index.ts` (stub barrel)

**Steps:**
- [ ] Create `packages/shared/` directory structure
- [ ] Write `package.json` with shared deps (zod, ulid)
- [ ] Write strict `tsconfig.json`
- [ ] Write stub `src/index.ts` barrel export
- [ ] Verify `bun run --cwd packages/shared typecheck` passes

**Code — `packages/shared/package.json`:**
```json
{
  "name": "@ctrlpane/shared",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "src/index.ts",
  "types": "src/index.ts",
  "scripts": {
    "typecheck": "tsc --noEmit",
    "lint": "biome check src/",
    "lint:fix": "biome check --write src/",
    "check": "biome check src/",
    "check:fix": "biome check --write src/",
    "test": "bun test",
    "test:unit": "bun test"
  },
  "dependencies": {
    "zod": "^3.24.0",
    "ulid": "^2.3.0"
  },
  "devDependencies": {
    "@types/bun": "^1.2.0",
    "typescript": "^5.7.0"
  }
}
```

**Code — `packages/shared/tsconfig.json`:**
```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noEmit": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist"]
}
```

**Code — `packages/shared/src/index.ts`:**
```typescript
// @ctrlpane/shared — barrel export
// Schemas, types, and constants shared between api + web
export {};
```

---

#### A5. Configure Turborepo

**Files:**
- Create: `turbo.json`

**Steps:**
- [ ] Write `turbo.json` with build/test/lint/typecheck pipelines
- [ ] Verify `bun run build` runs (even if workspaces have no build yet)

**Code — `turbo.json`:**
```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "lint": {
      "dependsOn": ["^build"]
    },
    "lint:fix": {
      "dependsOn": ["^build"],
      "cache": false
    },
    "check": {
      "dependsOn": ["^build"]
    },
    "check:fix": {
      "dependsOn": ["^build"],
      "cache": false
    },
    "typecheck": {
      "dependsOn": ["^build"]
    },
    "test": {
      "dependsOn": ["^build"]
    },
    "test:unit": {
      "dependsOn": ["^build"]
    },
    "test:integration": {
      "dependsOn": ["^build"],
      "cache": false
    },
    "test:arch": {
      "dependsOn": ["^build"]
    }
  }
}
```

---

#### A6. Configure Biome

**Files:**
- Create: `biome.json`

**Steps:**
- [ ] Write `biome.json` matching conventions doc settings
- [ ] Verify `bunx biome check .` runs without config errors

**Code — `biome.json`:**
```json
{
  "$schema": "https://biomejs.dev/schemas/1.9.0/schema.json",
  "organizeImports": {
    "enabled": true
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100
  },
  "javascript": {
    "formatter": {
      "quoteStyle": "single",
      "semicolons": "always",
      "trailingCommas": "all"
    }
  },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
      "suspicious": {
        "noExplicitAny": "error"
      },
      "correctness": {
        "noUnusedImports": "error",
        "noUnusedVariables": "error"
      },
      "style": {
        "noNonNullAssertion": "warn",
        "useConst": "error"
      }
    }
  },
  "files": {
    "ignore": [
      "node_modules",
      "dist",
      ".turbo",
      "coverage",
      "*.gen.ts"
    ]
  }
}
```

---

#### A7. Configure Lefthook

**Files:**
- Create: `lefthook.yml`

**Steps:**
- [ ] Write `lefthook.yml` with pre-commit and commit-msg hooks
- [ ] Verify `bunx lefthook install` succeeds

**Code — `lefthook.yml`:**
```yaml
pre-commit:
  parallel: true
  commands:
    biome-check:
      glob: "*.{js,ts,jsx,tsx,json,css}"
      run: bunx biome check --write --staged {staged_files} && git add {staged_files}
      stage_fixed: true
    typecheck:
      run: bun run typecheck
    test:
      run: bun run test:unit
    arch:
      run: bun run test:arch

commit-msg:
  commands:
    commitlint:
      run: bunx commitlint --edit {1}
```

---

#### A8. Configure commitlint

**Files:**
- Create: `commitlint.config.ts`

**Steps:**
- [ ] Write `commitlint.config.ts` with conventional commits and ctrlpane scopes
- [ ] Verify `echo "feat(api): test" | bunx commitlint` passes

**Code — `commitlint.config.ts`:**
```typescript
import type { UserConfig } from '@commitlint/types';

const config: UserConfig = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'scope-enum': [
      2,
      'always',
      [
        'api',
        'web',
        'shared',
        'blueprint',
        'auth',
        'deps',
        'docs',
        'ci',
        'tooling',
        'db',
        'infra',
        'mcp',
        'testing',
        'deploy',
        'config',
        'security',
        'telemetry',
      ],
    ],
    'scope-empty': [1, 'never'],
    'subject-case': [2, 'always', 'lower-case'],
    'header-max-length': [2, 'always', 100],
  },
};

export default config;
```

---

#### A9. Create docker-compose.yml

**Files:**
- Create: `docker-compose.yml`

**Steps:**
- [ ] Write `docker-compose.yml` with Postgres 17, Redis 7, NATS, Centrifugo
- [ ] Use prefix-3 ports (35432, 36379, 34222, 38000)
- [ ] Add health checks and named volumes
- [ ] Verify `docker compose config` validates

**Code — `docker-compose.yml`:**
```yaml
name: ctrlpane

services:
  postgres:
    image: postgres:17-alpine
    ports:
      - "127.0.0.1:35432:5432"
    environment:
      POSTGRES_DB: ctrlpane
      POSTGRES_USER: ctrlpane_app
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-ctrlpane_dev}
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ctrlpane_app -d ctrlpane"]
      interval: 5s
      timeout: 5s
      retries: 5
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    ports:
      - "127.0.0.1:36379:6379"
    command: redis-server --requirepass ${REDIS_PASSWORD:-ctrlpane_dev}
    volumes:
      - redisdata:/data
    healthcheck:
      test: ["CMD", "redis-cli", "-a", "${REDIS_PASSWORD:-ctrlpane_dev}", "ping"]
      interval: 5s
      timeout: 5s
      retries: 5
    restart: unless-stopped

  nats:
    image: nats:2-alpine
    ports:
      - "127.0.0.1:34222:4222"
      - "127.0.0.1:38222:8222"
    command: --jetstream --store_dir /data
    volumes:
      - natsdata:/data
    healthcheck:
      test: ["CMD", "wget", "--spider", "-q", "http://localhost:8222/healthz"]
      interval: 5s
      timeout: 5s
      retries: 5
    restart: unless-stopped

  centrifugo:
    image: centrifugo/centrifugo:v5
    ports:
      - "127.0.0.1:38000:8000"
    environment:
      CENTRIFUGO_API_KEY: ${CENTRIFUGO_API_KEY:-ctrlpane_dev_api_key}
      CENTRIFUGO_TOKEN_HMAC_SECRET_KEY: ${CENTRIFUGO_HMAC_SECRET:-ctrlpane_dev_hmac_secret}
      CENTRIFUGO_ALLOWED_ORIGINS: "http://localhost:33000"
      CENTRIFUGO_API_INSECURE: "true"
    command: centrifugo --health
    healthcheck:
      test: ["CMD", "wget", "--spider", "-q", "http://localhost:8000/health"]
      interval: 5s
      timeout: 5s
      retries: 5
    restart: unless-stopped

volumes:
  pgdata:
  redisdata:
  natsdata:
```

---

#### A10. Create process-compose.yml

**Files:**
- Create: `process-compose.yml`

**Steps:**
- [ ] Write `process-compose.yml` with dev orchestration (infra, api, web)
- [ ] Configure dependency ordering and health checks

**Code — `process-compose.yml`:**
```yaml
version: "0.5"

processes:
  infra:
    command: docker compose up
    readiness_probe:
      exec:
        command: docker compose ps --status=healthy --format '{{.Name}}' | wc -l | grep -q '4'
      initial_delay_seconds: 5
      period_seconds: 5
    shutdown:
      command: docker compose down
      timeout_seconds: 15

  api:
    command: bun run --cwd apps/api dev
    depends_on:
      infra:
        condition: process_healthy
    readiness_probe:
      http_get:
        host: 127.0.0.1
        port: 33001
        path: /health/live
      initial_delay_seconds: 3
      period_seconds: 5
    availability:
      restart: on_failure
      max_restarts: 3
      backoff_seconds: 2

  web:
    command: bun run --cwd apps/web dev
    depends_on:
      api:
        condition: process_healthy
    readiness_probe:
      http_get:
        host: 127.0.0.1
        port: 33000
        path: /
      initial_delay_seconds: 3
      period_seconds: 5
    availability:
      restart: on_failure
      max_restarts: 3
      backoff_seconds: 2
```

---

#### A11. Add .editorconfig

**Files:**
- Create: `.editorconfig`

**Steps:**
- [ ] Write `.editorconfig` matching conventions (UTF-8, LF, 2-space indent)

**Code — `.editorconfig`:**
```ini
root = true

[*]
charset = utf-8
end_of_line = lf
indent_style = space
indent_size = 2
insert_final_newline = true
trim_trailing_whitespace = true

[*.md]
trim_trailing_whitespace = false

[Makefile]
indent_style = tab
```

---

#### A12. Create .env.example

**Files:**
- Create: `.env.example`

**Steps:**
- [ ] Create `.env.example` with all required environment variables documented
- [ ] Ensure `.env` is in `.gitignore` (added in A1)

**Code — `.env.example`:**
```bash
# Database
DATABASE_URL=postgres://ctrlpane_app:ctrlpane_dev@localhost:35432/ctrlpane
POSTGRES_PASSWORD=ctrlpane_dev

# Redis
REDIS_URL=redis://:ctrlpane_dev@localhost:36379
REDIS_PASSWORD=ctrlpane_dev

# NATS
NATS_URL=nats://localhost:34222

# Centrifugo
CENTRIFUGO_URL=http://localhost:38000
CENTRIFUGO_API_KEY=ctrlpane_dev_api_key
CENTRIFUGO_HMAC_SECRET=ctrlpane_dev_hmac_secret

# API
API_PORT=33001
API_HOST=127.0.0.1

# Web
WEB_PORT=33000

# Environment
NODE_ENV=development
LOG_LEVEL=debug
```

---

#### A13. Final commit

**Steps:**
- [ ] Run `bun install` to generate lockfile
- [ ] Run `bun run typecheck` to verify all workspaces
- [ ] Run `bunx biome check .` to verify formatting
- [ ] Commit: `feat(tooling): initialize monorepo scaffold`

---

## Wave 2: Parallel Foundation Layers

### Team B — Database Layer

**Scope:** Drizzle schemas, migrations, RLS policies, seed script, DB client.
**Branch:** `feat/db/schema-and-migrations`
**Dependency:** Team A (Wave 1) must be complete.

---

#### B1. Install Drizzle ORM + drizzle-kit + postgres driver

**Files:**
- Modify: `apps/api/package.json`

**Steps:**
- [ ] Add drizzle-orm, drizzle-kit, postgres driver to api package
- [ ] Run `bun install --cwd apps/api`
- [ ] Create `apps/api/drizzle.config.ts`

**Code — `apps/api/drizzle.config.ts`:**
```typescript
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/schema/index.ts',
  out: './src/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://ctrlpane_app:ctrlpane_dev@localhost:35432/ctrlpane',
  },
});
```

**Modify `apps/api/package.json` scripts:**
```json
{
  "scripts": {
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "db:seed": "bun run src/db/seed.ts",
    "db:studio": "drizzle-kit studio"
  }
}
```

---

#### B2. Create DB client infrastructure

**Files:**
- Create: `apps/api/src/infra/db.ts`
- Create: `apps/api/src/infra/db.test.ts`

**Steps:**
- [ ] Write failing test: DB client can connect and execute a simple query
- [ ] Run test to verify failure (no implementation yet)
- [ ] Write Effect-wrapped Drizzle client with connection pool
- [ ] Run test to verify pass
- [ ] Commit: `feat(api): add Effect-wrapped database client`

**Code — `apps/api/src/infra/db.ts`:**
```typescript
import { Context, Effect, Layer } from 'effect';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../db/schema/index.js';

export interface DatabaseClientShape {
  readonly db: ReturnType<typeof drizzle<typeof schema>>;
  readonly sql: ReturnType<typeof postgres>;
}

export class DatabaseClient extends Context.Tag('DatabaseClient')<
  DatabaseClient,
  DatabaseClientShape
>() {}

export const DatabaseClientLive = Layer.scoped(
  DatabaseClient,
  Effect.gen(function* () {
    const databaseUrl =
      process.env.DATABASE_URL ??
      'postgres://ctrlpane_app:ctrlpane_dev@localhost:35432/ctrlpane';

    const sql = postgres(databaseUrl, {
      max: 20,
      idle_timeout: 20,
      connect_timeout: 10,
    });

    const db = drizzle(sql, { schema });

    yield* Effect.addFinalizer(() =>
      Effect.promise(() => sql.end({ timeout: 5 })),
    );

    return { db, sql };
  }),
);
```

**Code — `apps/api/src/infra/db.test.ts`:**
```typescript
import { describe, expect, it } from 'bun:test';
import { Effect } from 'effect';
import { DatabaseClient, DatabaseClientLive } from './db.js';

describe('DatabaseClient [integration]', () => {
  it('should connect and execute a query', async () => {
    const program = Effect.gen(function* () {
      const { db } = yield* DatabaseClient;
      const result = yield* Effect.promise(() => db.execute('SELECT 1 as ok'));
      return result;
    });

    const result = await Effect.runPromise(
      program.pipe(Effect.provide(DatabaseClientLive)),
    );

    expect(result).toBeDefined();
  });

  it('should fail with invalid connection string', async () => {
    // Error case: invalid URL should fail
    const badSql = await import('postgres').then((m) =>
      m.default('postgres://invalid:invalid@localhost:99999/invalid', {
        connect_timeout: 1,
      }),
    );

    await expect(
      badSql`SELECT 1`.catch((e: unknown) => {
        throw e;
      }),
    ).rejects.toThrow();
    await badSql.end();
  });
});
```

---

#### B3. Create Drizzle schema: tenants table

**Files:**
- Create: `apps/api/src/db/schema/tenants.ts`

**Steps:**
- [ ] Write tenants table schema with all columns from spec Section 3
- [ ] Verify schema compiles with typecheck

**Code — `apps/api/src/db/schema/tenants.ts`:**
```typescript
import { pgTable, text, timestamp, jsonb } from 'drizzle-orm/pg-core';

export const tenants = pgTable('tenants', {
  id: text('id').primaryKey(), // tnt_ prefix ULID
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  settings: jsonb('settings').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
```

---

#### B4. Create Drizzle schema: api_keys table

**Files:**
- Create: `apps/api/src/db/schema/api-keys.ts`

**Steps:**
- [ ] Write api_keys table schema referencing tenants
- [ ] Verify schema compiles with typecheck

**Code — `apps/api/src/db/schema/api-keys.ts`:**
```typescript
import { pgTable, text, timestamp, jsonb } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';

export const apiKeys = pgTable('api_keys', {
  id: text('id').primaryKey(), // apk_ prefix ULID
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  name: text('name').notNull(),
  keyHash: text('key_hash').notNull(),
  keyPrefix: text('key_prefix').notNull(),
  permissions: jsonb('permissions').notNull().$type<string[]>(),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
```

---

#### B5. Create Drizzle schema: blueprint_items table

**Files:**
- Create: `apps/api/src/db/schema/blueprint/items.ts`

**Steps:**
- [ ] Write blueprint_items table with all columns from spec Section 4
- [ ] Include self-referential FK for parent_id
- [ ] Include indexes for tenant-scoped queries
- [ ] Verify schema compiles

**Code — `apps/api/src/db/schema/blueprint/items.ts`:**
```typescript
import { pgTable, text, timestamp, jsonb, index } from 'drizzle-orm/pg-core';
import { tenants } from '../tenants.js';

export const blueprintItems = pgTable(
  'blueprint_items',
  {
    id: text('id').primaryKey(), // bpi_ prefix ULID
    tenantId: text('tenant_id').notNull().references(() => tenants.id),
    title: text('title').notNull(), // Max 500 chars (validated at app layer)
    description: text('description'), // Nullable, Markdown
    status: text('status').notNull().default('pending'), // pending | in_progress | done
    priority: text('priority').notNull().default('medium'), // critical | high | medium | low
    parentId: text('parent_id'), // FK to self, nullable — set via .references() below
    createdBy: text('created_by').notNull(), // API key ID
    assignedTo: text('assigned_to'), // Nullable
    dueDate: timestamp('due_date', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    metadata: jsonb('metadata').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }), // Soft delete
  },
  (table) => [
    index('idx_blueprint_items_tenant_status').on(table.tenantId, table.status),
    index('idx_blueprint_items_tenant_priority').on(table.tenantId, table.priority),
    index('idx_blueprint_items_tenant_created').on(table.tenantId, table.createdAt),
    index('idx_blueprint_items_parent').on(table.parentId),
    index('idx_blueprint_items_assigned').on(table.tenantId, table.assignedTo),
  ],
);

// Self-referential FK must be added after table definition
// Drizzle handles this via the table reference:
// parentId references blueprintItems.id — added in migration SQL
```

---

#### B6. Create Drizzle schema: blueprint_tags + blueprint_item_tags tables

**Files:**
- Create: `apps/api/src/db/schema/blueprint/tags.ts`

**Steps:**
- [ ] Write blueprint_tags table
- [ ] Write blueprint_item_tags junction table with composite PK
- [ ] Include cascade delete on junction table FKs
- [ ] Verify schema compiles

**Code — `apps/api/src/db/schema/blueprint/tags.ts`:**
```typescript
import { pgTable, text, timestamp, primaryKey, index } from 'drizzle-orm/pg-core';
import { tenants } from '../tenants.js';
import { blueprintItems } from './items.js';

export const blueprintTags = pgTable(
  'blueprint_tags',
  {
    id: text('id').primaryKey(), // bpt_ prefix ULID
    tenantId: text('tenant_id').notNull().references(() => tenants.id),
    name: text('name').notNull(),
    color: text('color').notNull(), // Hex color code
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_blueprint_tags_tenant_name').on(table.tenantId, table.name),
  ],
);

export const blueprintItemTags = pgTable(
  'blueprint_item_tags',
  {
    itemId: text('item_id')
      .notNull()
      .references(() => blueprintItems.id, { onDelete: 'cascade' }),
    tagId: text('tag_id')
      .notNull()
      .references(() => blueprintTags.id, { onDelete: 'cascade' }),
    tenantId: text('tenant_id').notNull().references(() => tenants.id),
  },
  (table) => [
    primaryKey({ columns: [table.itemId, table.tagId] }),
    index('idx_blueprint_item_tags_tenant').on(table.tenantId),
  ],
);
```

---

#### B7. Create Drizzle schema: blueprint_comments table

**Files:**
- Create: `apps/api/src/db/schema/blueprint/comments.ts`

**Steps:**
- [ ] Write blueprint_comments table with all columns from spec Section 4
- [ ] No cascade delete on item FK (comments survive soft delete for audit)
- [ ] Verify schema compiles

**Code — `apps/api/src/db/schema/blueprint/comments.ts`:**
```typescript
import { pgTable, text, timestamp, index } from 'drizzle-orm/pg-core';
import { tenants } from '../tenants.js';
import { blueprintItems } from './items.js';

export const blueprintComments = pgTable(
  'blueprint_comments',
  {
    id: text('id').primaryKey(), // bpc_ prefix ULID
    tenantId: text('tenant_id').notNull().references(() => tenants.id),
    itemId: text('item_id').notNull().references(() => blueprintItems.id), // No cascade
    content: text('content').notNull(), // Markdown
    authorId: text('author_id').notNull(),
    authorType: text('author_type').notNull(), // user | agent | system
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_blueprint_comments_item').on(table.itemId),
    index('idx_blueprint_comments_tenant').on(table.tenantId),
  ],
);
```

---

#### B8. Create Drizzle schema: blueprint_activity table

**Files:**
- Create: `apps/api/src/db/schema/blueprint/activity.ts`

**Steps:**
- [ ] Write blueprint_activity table with all columns from spec Section 4
- [ ] No cascade delete on item FK (activity is append-only, survives soft delete)
- [ ] Verify schema compiles

**Code — `apps/api/src/db/schema/blueprint/activity.ts`:**
```typescript
import { pgTable, text, timestamp, index } from 'drizzle-orm/pg-core';
import { tenants } from '../tenants.js';
import { blueprintItems } from './items.js';

export const blueprintActivity = pgTable(
  'blueprint_activity',
  {
    id: text('id').primaryKey(), // bpa_ prefix ULID
    tenantId: text('tenant_id').notNull().references(() => tenants.id),
    itemId: text('item_id').notNull().references(() => blueprintItems.id), // No cascade
    actorId: text('actor_id').notNull(),
    actorType: text('actor_type').notNull(), // user | agent | system
    action: text('action').notNull(), // created | updated | deleted | status_changed | assigned | commented
    field: text('field'), // Nullable — which field changed
    oldValue: text('old_value'), // Nullable
    newValue: text('new_value'), // Nullable
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_blueprint_activity_item').on(table.itemId),
    index('idx_blueprint_activity_tenant').on(table.tenantId, table.createdAt),
  ],
);
```

---

#### B9. Create Drizzle schema: outbox_events table

**Files:**
- Create: `apps/api/src/db/schema/outbox.ts`

**Steps:**
- [ ] Write outbox_events table matching data-model.md spec
- [ ] Include pending and dead_letter indexes
- [ ] Verify schema compiles

**Code — `apps/api/src/db/schema/outbox.ts`:**
```typescript
import { pgTable, text, timestamp, jsonb, integer, index } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';

export const outboxEvents = pgTable(
  'outbox_events',
  {
    id: text('id').primaryKey(), // obx_ prefix ULID
    tenantId: text('tenant_id').notNull().references(() => tenants.id),
    eventType: text('event_type').notNull(), // e.g., 'blueprint.item.created'
    aggregateType: text('aggregate_type').notNull(), // e.g., 'blueprint_item'
    aggregateId: text('aggregate_id').notNull(), // Entity ID that triggered the event
    payload: jsonb('payload').notNull(),
    traceId: text('trace_id'), // OpenTelemetry trace ID
    status: text('status').notNull().default('pending'), // pending | published | dead_letter
    attempts: integer('attempts').notNull().default(0),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_outbox_pending').on(table.createdAt).where('status = \'pending\''),
    index('idx_outbox_dead_letter').on(table.createdAt).where('status = \'dead_letter\''),
  ],
);
```

---

#### B10. Create schema barrel export

**Files:**
- Create: `apps/api/src/db/schema/index.ts`

**Steps:**
- [ ] Create barrel export re-exporting all schema tables
- [ ] Verify typecheck passes

**Code — `apps/api/src/db/schema/index.ts`:**
```typescript
// Auth tables
export { tenants } from './tenants.js';
export { apiKeys } from './api-keys.js';

// Blueprint domain tables
export { blueprintItems } from './blueprint/items.js';
export { blueprintTags, blueprintItemTags } from './blueprint/tags.js';
export { blueprintComments } from './blueprint/comments.js';
export { blueprintActivity } from './blueprint/activity.js';

// Infrastructure tables
export { outboxEvents } from './outbox.js';
```

---

#### B11. Generate initial migration

**Steps:**
- [ ] Run `bun run --cwd apps/api db:generate`
- [ ] Verify migration files created in `apps/api/src/db/migrations/`
- [ ] Inspect generated SQL for correctness

**Commands:**
```bash
cd apps/api && bun run db:generate
```

---

#### B12. Create RLS policy migration

**Files:**
- Create: `apps/api/src/db/migrations/0001_rls_policies.sql` (custom migration)

**Steps:**
- [ ] Write SQL migration enabling RLS + FORCE RLS on all blueprint tables
- [ ] Write tenant_isolation policy for each table
- [ ] Add self-referential FK for blueprint_items.parent_id
- [ ] Add updated_at trigger function

**Code — `apps/api/src/db/migrations/0001_rls_policies.sql`:**
```sql
-- Self-referential FK for blueprint_items
ALTER TABLE blueprint_items
  ADD CONSTRAINT fk_blueprint_items_parent
  FOREIGN KEY (parent_id) REFERENCES blueprint_items(id);

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at trigger to tables that have it
CREATE TRIGGER trigger_tenants_updated_at
  BEFORE UPDATE ON tenants
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trigger_blueprint_items_updated_at
  BEFORE UPDATE ON blueprint_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS: Enable + Force on all tables with tenant_id
-- tenants table: no RLS (looked up by slug before tenant context is set)

ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON api_keys
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE blueprint_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE blueprint_items FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON blueprint_items
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE blueprint_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE blueprint_tags FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON blueprint_tags
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE blueprint_item_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE blueprint_item_tags FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON blueprint_item_tags
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE blueprint_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE blueprint_comments FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON blueprint_comments
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE blueprint_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE blueprint_activity FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON blueprint_activity
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE outbox_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE outbox_events FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON outbox_events
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
```

---

#### B13. Create seed script

**Files:**
- Create: `apps/api/src/db/seed.ts`

**Steps:**
- [ ] Write idempotent seed script creating demo data per spec Section 15
- [ ] 1 tenant, 2 API keys, 10 items, 3 tags, sub-items, comments, activity
- [ ] Verify `bun run --cwd apps/api db:seed` succeeds

**Code — `apps/api/src/db/seed.ts` (structure):**
```typescript
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { ulid } from 'ulid';
import * as schema from './schema/index.js';
import { createHash, randomBytes } from 'node:crypto';

const createId = (prefix: string): string => `${prefix}${ulid()}`;

const databaseUrl =
  process.env.DATABASE_URL ??
  'postgres://ctrlpane_app:ctrlpane_dev@localhost:35432/ctrlpane';

const sql = postgres(databaseUrl);
const db = drizzle(sql, { schema });

async function seed() {
  console.log('Seeding database...');

  // Idempotency: check if tenant already exists
  const existingTenant = await sql`
    SELECT id FROM tenants WHERE slug = 'blueprint'
  `;
  if (existingTenant.length > 0) {
    console.log('Seed data already exists. Skipping.');
    await sql.end();
    return;
  }

  // 1. Tenant
  const tenantId = 'tnt_blueprint000000000000000';
  await db.insert(schema.tenants).values({
    id: tenantId,
    name: 'Blueprint Demo',
    slug: 'blueprint',
    settings: {},
  });

  // Set tenant context for RLS
  await sql`SET LOCAL app.tenant_id = ${tenantId}`;

  // 2. API Keys (admin + read-only)
  const adminKeyRaw = `cpk_${randomBytes(32).toString('hex')}`;
  const readOnlyKeyRaw = `cpk_${randomBytes(32).toString('hex')}`;

  const adminKeyId = createId('apk_');
  const readOnlyKeyId = createId('apk_');

  await db.insert(schema.apiKeys).values([
    {
      id: adminKeyId,
      tenantId,
      name: 'Admin Key',
      keyHash: createHash('sha256').update(adminKeyRaw).digest('hex'),
      keyPrefix: adminKeyRaw.slice(0, 8),
      permissions: ['read', 'write', 'admin'],
    },
    {
      id: readOnlyKeyId,
      tenantId,
      name: 'Read-Only Key',
      keyHash: createHash('sha256').update(readOnlyKeyRaw).digest('hex'),
      keyPrefix: readOnlyKeyRaw.slice(0, 8),
      permissions: ['read'],
    },
  ]);

  console.log(`Admin API Key:     ${adminKeyRaw}`);
  console.log(`Read-Only API Key: ${readOnlyKeyRaw}`);

  // 3. Tags
  const tagIds = [createId('bpt_'), createId('bpt_'), createId('bpt_')];
  await db.insert(schema.blueprintTags).values([
    { id: tagIds[0]!, tenantId, name: 'frontend', color: '#3B82F6' },
    { id: tagIds[1]!, tenantId, name: 'backend', color: '#10B981' },
    { id: tagIds[2]!, tenantId, name: 'urgent', color: '#EF4444' },
  ]);

  // 4. Items (10 total, varying statuses/priorities, 2 with deleted_at)
  const itemIds: string[] = [];
  const statuses = ['pending', 'in_progress', 'done'] as const;
  const priorities = ['critical', 'high', 'medium', 'low'] as const;

  for (let i = 0; i < 10; i++) {
    const itemId = createId('bpi_');
    itemIds.push(itemId);
    await db.insert(schema.blueprintItems).values({
      id: itemId,
      tenantId,
      title: `Blueprint Item ${i + 1}`,
      description: `Description for item ${i + 1}. Supports **Markdown**.`,
      status: statuses[i % 3]!,
      priority: priorities[i % 4]!,
      createdBy: adminKeyId,
      assignedTo: i % 2 === 0 ? adminKeyId : null,
      deletedAt: i >= 8 ? new Date() : null, // Items 9-10 are soft-deleted
    });
  }

  // 5. Sub-items (4 sub-items on first 2 parent items)
  for (let i = 0; i < 4; i++) {
    const parentIdx = i < 2 ? 0 : 1;
    await db.insert(schema.blueprintItems).values({
      id: createId('bpi_'),
      tenantId,
      title: `Sub-item ${i + 1} of Item ${parentIdx + 1}`,
      description: `Sub-item description`,
      status: 'pending',
      priority: 'medium',
      parentId: itemIds[parentIdx]!,
      createdBy: adminKeyId,
    });
  }

  // 6. Item-tag associations
  await db.insert(schema.blueprintItemTags).values([
    { itemId: itemIds[0]!, tagId: tagIds[0]!, tenantId },
    { itemId: itemIds[0]!, tagId: tagIds[2]!, tenantId },
    { itemId: itemIds[1]!, tagId: tagIds[1]!, tenantId },
    { itemId: itemIds[2]!, tagId: tagIds[0]!, tenantId },
    { itemId: itemIds[2]!, tagId: tagIds[1]!, tenantId },
  ]);

  // 7. Comments (10+ on 5 items)
  for (let i = 0; i < 5; i++) {
    for (let j = 0; j < 2; j++) {
      await db.insert(schema.blueprintComments).values({
        id: createId('bpc_'),
        tenantId,
        itemId: itemIds[i]!,
        content: `Comment ${j + 1} on item ${i + 1}. This is a ${j === 0 ? 'user' : 'agent'} comment.`,
        authorId: j === 0 ? adminKeyId : 'agent_blueprint_01',
        authorType: j === 0 ? 'user' : 'agent',
      });
    }
  }

  // 8. Activity entries (auto-generated "created" events for all items)
  for (const itemId of itemIds) {
    await db.insert(schema.blueprintActivity).values({
      id: createId('bpa_'),
      tenantId,
      itemId,
      actorId: adminKeyId,
      actorType: 'user',
      action: 'created',
    });
  }

  console.log('Seed complete.');
  await sql.end();
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
```

---

#### B14. Test: RLS isolation with testcontainers

**Files:**
- Create: `apps/api/src/db/rls.test.ts`

**Steps:**
- [ ] Write failing test: verify RLS returns zero rows without SET LOCAL
- [ ] Write failing test: tenant A cannot see tenant B data
- [ ] Run tests to verify failure
- [ ] Start Postgres via testcontainers, run migration, run tests
- [ ] Run tests to verify pass
- [ ] Commit: `test(db): verify RLS tenant isolation`

**Code — `apps/api/src/db/rls.test.ts`:**
```typescript
import { describe, expect, it, beforeAll, afterAll } from 'bun:test';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { GenericContainer, Wait } from 'testcontainers';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as schema from './schema/index.js';
import { ulid } from 'ulid';

const createId = (prefix: string): string => `${prefix}${ulid()}`;

describe('RLS Isolation [integration]', () => {
  let sql: ReturnType<typeof postgres>;
  let db: ReturnType<typeof drizzle>;
  let container: Awaited<ReturnType<typeof GenericContainer.prototype.start>>;

  const tenantA = createId('tnt_');
  const tenantB = createId('tnt_');

  beforeAll(async () => {
    container = await new GenericContainer('postgres:17-alpine')
      .withEnvironment({
        POSTGRES_DB: 'ctrlpane_test',
        POSTGRES_USER: 'ctrlpane_app',
        POSTGRES_PASSWORD: 'test',
      })
      .withExposedPorts(5432)
      .withWaitStrategy(Wait.forLogMessage('database system is ready to accept connections'))
      .start();

    const port = container.getMappedPort(5432);
    sql = postgres(`postgres://ctrlpane_app:test@localhost:${port}/ctrlpane_test`);
    db = drizzle(sql, { schema });

    // Run migrations
    // (In real test, use drizzle-kit migrate or apply migration files)
    // For now, apply schema directly
  }, 60_000);

  afterAll(async () => {
    await sql?.end();
    await container?.stop();
  });

  it('returns zero rows without SET LOCAL', async () => {
    const result = await db.select().from(schema.blueprintItems);
    expect(result).toHaveLength(0);
  });

  it('tenant A cannot see tenant B data', async () => {
    // Insert as tenant A
    await sql`SET LOCAL app.tenant_id = ${tenantA}`;
    await db.insert(schema.tenants).values({ id: tenantA, name: 'A', slug: `a-${ulid()}` });
    await db.insert(schema.blueprintItems).values({
      id: createId('bpi_'),
      tenantId: tenantA,
      title: 'Tenant A item',
      status: 'pending',
      priority: 'medium',
      createdBy: 'test',
    });

    // Query as tenant B — should see nothing
    await sql`SET LOCAL app.tenant_id = ${tenantB}`;
    const result = await db.select().from(schema.blueprintItems);
    expect(result).toHaveLength(0);
  });
});
```

---

#### B15. Final commit

**Steps:**
- [ ] Run `bun run --cwd apps/api typecheck`
- [ ] Run migration against local Docker Postgres: `bun run --cwd apps/api db:migrate`
- [ ] Run seed: `bun run --cwd apps/api db:seed`
- [ ] Commit: `feat(db): add database schema, migrations, RLS policies, and seed data`

---

### Team C — Shared Package

**Scope:** Zod schemas, TypeScript types, enums, constants shared between api + web.
**Branch:** `feat/shared/schemas-and-types`
**Dependency:** Team A (Wave 1) must be complete.

---

#### C1. Create TypeScript enums and types

**Files:**
- Create: `packages/shared/src/types/enums.ts`

**Steps:**
- [ ] Define ItemStatus, ItemPriority, AuthorType as const objects + type unions
- [ ] Verify typecheck passes

**Code — `packages/shared/src/types/enums.ts`:**
```typescript
export const ItemStatus = {
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  DONE: 'done',
} as const;

export type ItemStatus = (typeof ItemStatus)[keyof typeof ItemStatus];

export const ItemPriority = {
  CRITICAL: 'critical',
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low',
} as const;

export type ItemPriority = (typeof ItemPriority)[keyof typeof ItemPriority];

export const AuthorType = {
  USER: 'user',
  AGENT: 'agent',
  SYSTEM: 'system',
} as const;

export type AuthorType = (typeof AuthorType)[keyof typeof AuthorType];

export const ActivityAction = {
  CREATED: 'created',
  UPDATED: 'updated',
  DELETED: 'deleted',
  STATUS_CHANGED: 'status_changed',
  ASSIGNED: 'assigned',
  COMMENTED: 'commented',
} as const;

export type ActivityAction = (typeof ActivityAction)[keyof typeof ActivityAction];

/** Valid status transitions: Map<from_status, Set<to_status>> */
export const VALID_STATUS_TRANSITIONS: Record<ItemStatus, readonly ItemStatus[]> = {
  pending: ['in_progress'],
  in_progress: ['done', 'pending'],
  done: ['in_progress'],
} as const;
```

---

#### C2. Create pagination types

**Files:**
- Create: `packages/shared/src/types/pagination.ts`

**Steps:**
- [ ] Define CursorPaginationRequest and CursorPaginationResponse types
- [ ] Verify typecheck passes

**Code — `packages/shared/src/types/pagination.ts`:**
```typescript
export interface CursorPaginationRequest {
  readonly cursor?: string;
  readonly limit?: number;
  readonly sort?: string;
  readonly order?: 'asc' | 'desc';
}

export interface CursorPaginationResponse {
  readonly next_cursor: string | null;
  readonly prev_cursor: string | null;
  readonly has_more: boolean;
  readonly limit: number;
}

export const DEFAULT_PAGE_LIMIT = 25;
export const MAX_PAGE_LIMIT = 100;
```

---

#### C3. Create API response types

**Files:**
- Create: `packages/shared/src/types/api.ts`

**Steps:**
- [ ] Define ApiResponse, ApiError, PaginatedResponse types
- [ ] Verify typecheck passes

**Code — `packages/shared/src/types/api.ts`:**
```typescript
import type { CursorPaginationResponse } from './pagination.js';

export interface ApiResponse<T> {
  readonly data: T;
}

export interface ApiErrorDetail {
  readonly code: string;
  readonly message: string;
  readonly details?: Record<string, unknown>;
}

export interface ApiErrorResponse {
  readonly error: ApiErrorDetail;
}

export interface PaginatedResponse<T> {
  readonly data: T[];
  readonly pagination: CursorPaginationResponse;
}
```

---

#### C4. Create constants

**Files:**
- Create: `packages/shared/src/constants.ts`

**Steps:**
- [ ] Define ID prefixes, max lengths, fibonacci story points
- [ ] Verify typecheck passes

**Code — `packages/shared/src/constants.ts`:**
```typescript
/** ID prefix registry for blueprint domain entities */
export const ID_PREFIX = {
  TENANT: 'tnt_',
  API_KEY: 'apk_',
  BLUEPRINT_ITEM: 'bpi_',
  BLUEPRINT_TAG: 'bpt_',
  BLUEPRINT_COMMENT: 'bpc_',
  BLUEPRINT_ACTIVITY: 'bpa_',
  OUTBOX_EVENT: 'obx_',
} as const;

/** Max lengths for text fields */
export const MAX_LENGTHS = {
  ITEM_TITLE: 500,
  TAG_NAME: 100,
  API_KEY_NAME: 100,
  TENANT_NAME: 200,
  TENANT_SLUG: 50,
} as const;

/** API versioning */
export const API_VERSION = 'v1';
export const API_BASE_PATH = `/api/${API_VERSION}`;
```

---

#### C5. Create Zod schemas for blueprint_items

**Files:**
- Create: `packages/shared/src/schemas/blueprint-item.ts`
- Create: `packages/shared/src/schemas/blueprint-item.test.ts`

**Steps:**
- [ ] Write failing tests for valid and invalid item creation inputs
- [ ] Run tests to verify failure
- [ ] Write Zod schemas: createBlueprintItemSchema, updateBlueprintItemSchema, blueprintItemFiltersSchema
- [ ] Run tests to verify pass
- [ ] Commit: `feat(shared): add blueprint item Zod schemas`

**Code — `packages/shared/src/schemas/blueprint-item.ts`:**
```typescript
import { z } from 'zod';
import { MAX_LENGTHS } from '../constants.js';

export const createBlueprintItemSchema = z.object({
  title: z.string().min(1).max(MAX_LENGTHS.ITEM_TITLE),
  description: z.string().optional(),
  status: z.enum(['pending', 'in_progress', 'done']).optional().default('pending'),
  priority: z.enum(['critical', 'high', 'medium', 'low']).optional().default('medium'),
  parent_id: z.string().startsWith('bpi_').optional(),
  assigned_to: z.string().optional(),
  due_date: z.string().datetime().optional(),
  metadata: z.record(z.unknown()).optional().default({}),
  tag_ids: z.array(z.string().startsWith('bpt_')).optional(),
});

export type CreateBlueprintItemInput = z.infer<typeof createBlueprintItemSchema>;

export const updateBlueprintItemSchema = z.object({
  title: z.string().min(1).max(MAX_LENGTHS.ITEM_TITLE).optional(),
  description: z.string().nullable().optional(),
  status: z.enum(['pending', 'in_progress', 'done']).optional(),
  priority: z.enum(['critical', 'high', 'medium', 'low']).optional(),
  assigned_to: z.string().nullable().optional(),
  due_date: z.string().datetime().nullable().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export type UpdateBlueprintItemInput = z.infer<typeof updateBlueprintItemSchema>;

export const blueprintItemFiltersSchema = z.object({
  status: z.enum(['pending', 'in_progress', 'done']).optional(),
  priority: z.enum(['critical', 'high', 'medium', 'low']).optional(),
  tag: z.string().optional(),
  search: z.string().optional(),
  assigned_to: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).optional().default(25),
  sort: z.enum(['created_at', 'updated_at', 'title', 'priority', 'status']).optional().default('created_at'),
  order: z.enum(['asc', 'desc']).optional().default('desc'),
});

export type BlueprintItemFilters = z.infer<typeof blueprintItemFiltersSchema>;
```

**Code — `packages/shared/src/schemas/blueprint-item.test.ts`:**
```typescript
import { describe, expect, it } from 'bun:test';
import {
  createBlueprintItemSchema,
  updateBlueprintItemSchema,
  blueprintItemFiltersSchema,
} from './blueprint-item.js';

describe('createBlueprintItemSchema [unit]', () => {
  it('accepts valid input with required fields only', () => {
    const result = createBlueprintItemSchema.safeParse({ title: 'Test Item' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe('pending');
      expect(result.data.priority).toBe('medium');
    }
  });

  it('accepts valid input with all fields', () => {
    const result = createBlueprintItemSchema.safeParse({
      title: 'Full Item',
      description: 'Description here',
      status: 'in_progress',
      priority: 'high',
      parent_id: 'bpi_01HQ7Z3K4W',
      assigned_to: 'apk_01HQ7Z3K4X',
      due_date: '2026-04-01T00:00:00.000Z',
      tag_ids: ['bpt_01HQ7Z3K4Y'],
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty title', () => {
    const result = createBlueprintItemSchema.safeParse({ title: '' });
    expect(result.success).toBe(false);
  });

  it('rejects title exceeding max length', () => {
    const result = createBlueprintItemSchema.safeParse({ title: 'a'.repeat(501) });
    expect(result.success).toBe(false);
  });

  it('rejects invalid status', () => {
    const result = createBlueprintItemSchema.safeParse({
      title: 'Test',
      status: 'invalid_status',
    });
    expect(result.success).toBe(false);
  });

  it('rejects parent_id without bpi_ prefix', () => {
    const result = createBlueprintItemSchema.safeParse({
      title: 'Test',
      parent_id: 'invalid_id',
    });
    expect(result.success).toBe(false);
  });
});

describe('updateBlueprintItemSchema [unit]', () => {
  it('accepts partial updates', () => {
    const result = updateBlueprintItemSchema.safeParse({ title: 'Updated' });
    expect(result.success).toBe(true);
  });

  it('accepts empty object (no changes)', () => {
    const result = updateBlueprintItemSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('rejects invalid priority', () => {
    const result = updateBlueprintItemSchema.safeParse({ priority: 'super_high' });
    expect(result.success).toBe(false);
  });
});

describe('blueprintItemFiltersSchema [unit]', () => {
  it('applies defaults for limit, sort, order', () => {
    const result = blueprintItemFiltersSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(25);
      expect(result.data.sort).toBe('created_at');
      expect(result.data.order).toBe('desc');
    }
  });

  it('coerces limit from string (query param)', () => {
    const result = blueprintItemFiltersSchema.safeParse({ limit: '50' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(50);
    }
  });

  it('rejects limit over 100', () => {
    const result = blueprintItemFiltersSchema.safeParse({ limit: 101 });
    expect(result.success).toBe(false);
  });
});
```

---

#### C6. Create Zod schemas for blueprint_tags

**Files:**
- Create: `packages/shared/src/schemas/blueprint-tag.ts`
- Create: `packages/shared/src/schemas/blueprint-tag.test.ts`

**Steps:**
- [ ] Write failing tests for tag creation schemas
- [ ] Write createBlueprintTagSchema, addTagToItemSchema
- [ ] Run tests to verify pass

**Code — `packages/shared/src/schemas/blueprint-tag.ts`:**
```typescript
import { z } from 'zod';
import { MAX_LENGTHS } from '../constants.js';

export const createBlueprintTagSchema = z.object({
  name: z.string().min(1).max(MAX_LENGTHS.TAG_NAME),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Must be a hex color code (#RRGGBB)'),
});

export type CreateBlueprintTagInput = z.infer<typeof createBlueprintTagSchema>;

export const addTagToItemSchema = z.object({
  tag_id: z.string().startsWith('bpt_'),
});

export type AddTagToItemInput = z.infer<typeof addTagToItemSchema>;
```

**Code — `packages/shared/src/schemas/blueprint-tag.test.ts`:**
```typescript
import { describe, expect, it } from 'bun:test';
import { createBlueprintTagSchema } from './blueprint-tag.js';

describe('createBlueprintTagSchema [unit]', () => {
  it('accepts valid tag', () => {
    const result = createBlueprintTagSchema.safeParse({ name: 'frontend', color: '#3B82F6' });
    expect(result.success).toBe(true);
  });

  it('rejects empty name', () => {
    const result = createBlueprintTagSchema.safeParse({ name: '', color: '#3B82F6' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid hex color', () => {
    const result = createBlueprintTagSchema.safeParse({ name: 'test', color: 'red' });
    expect(result.success).toBe(false);
  });

  it('rejects color without hash', () => {
    const result = createBlueprintTagSchema.safeParse({ name: 'test', color: '3B82F6' });
    expect(result.success).toBe(false);
  });
});
```

---

#### C7. Create Zod schemas for blueprint_comments

**Files:**
- Create: `packages/shared/src/schemas/blueprint-comment.ts`
- Create: `packages/shared/src/schemas/blueprint-comment.test.ts`

**Steps:**
- [ ] Write failing tests for comment creation schemas
- [ ] Write createBlueprintCommentSchema
- [ ] Run tests to verify pass

**Code — `packages/shared/src/schemas/blueprint-comment.ts`:**
```typescript
import { z } from 'zod';

export const createBlueprintCommentSchema = z.object({
  content: z.string().min(1).max(10_000),
  author_type: z.enum(['user', 'agent', 'system']).optional().default('user'),
});

export type CreateBlueprintCommentInput = z.infer<typeof createBlueprintCommentSchema>;
```

**Code — `packages/shared/src/schemas/blueprint-comment.test.ts`:**
```typescript
import { describe, expect, it } from 'bun:test';
import { createBlueprintCommentSchema } from './blueprint-comment.js';

describe('createBlueprintCommentSchema [unit]', () => {
  it('accepts valid comment with default author_type', () => {
    const result = createBlueprintCommentSchema.safeParse({ content: 'Great work!' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.author_type).toBe('user');
    }
  });

  it('accepts comment with agent author_type', () => {
    const result = createBlueprintCommentSchema.safeParse({
      content: 'Automated comment',
      author_type: 'agent',
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty content', () => {
    const result = createBlueprintCommentSchema.safeParse({ content: '' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid author_type', () => {
    const result = createBlueprintCommentSchema.safeParse({
      content: 'Test',
      author_type: 'robot',
    });
    expect(result.success).toBe(false);
  });
});
```

---

#### C8. Create auth schemas

**Files:**
- Create: `packages/shared/src/schemas/auth.ts`
- Create: `packages/shared/src/schemas/auth.test.ts`

**Steps:**
- [ ] Write createApiKeySchema for the auth/keys endpoint
- [ ] Write tests
- [ ] Run tests to verify pass

**Code — `packages/shared/src/schemas/auth.ts`:**
```typescript
import { z } from 'zod';
import { MAX_LENGTHS } from '../constants.js';

export const createApiKeySchema = z.object({
  name: z.string().min(1).max(MAX_LENGTHS.API_KEY_NAME),
  permissions: z.array(z.enum(['read', 'write', 'admin'])).min(1),
  expires_at: z.string().datetime().optional(),
});

export type CreateApiKeyInput = z.infer<typeof createApiKeySchema>;
```

---

#### C9. Create ID utility

**Files:**
- Create: `packages/shared/src/id.ts`
- Create: `packages/shared/src/id.test.ts`

**Steps:**
- [ ] Write createId utility function
- [ ] Write tests verifying prefix format
- [ ] Run tests

**Code — `packages/shared/src/id.ts`:**
```typescript
import { ulid } from 'ulid';

export const createId = (prefix: string): string => `${prefix}${ulid()}`;
```

**Code — `packages/shared/src/id.test.ts`:**
```typescript
import { describe, expect, it } from 'bun:test';
import { createId } from './id.js';

describe('createId [unit]', () => {
  it('generates ID with correct prefix', () => {
    const id = createId('bpi_');
    expect(id.startsWith('bpi_')).toBe(true);
    expect(id.length).toBeGreaterThan(4);
  });

  it('generates unique IDs', () => {
    const ids = new Set(Array.from({ length: 100 }, () => createId('tnt_')));
    expect(ids.size).toBe(100);
  });

  it('fails with wrong prefix check', () => {
    const id = createId('bpi_');
    expect(id.startsWith('bpt_')).toBe(false);
  });
});
```

---

#### C10. Create cursor encoding utility

**Files:**
- Create: `packages/shared/src/cursor.ts`
- Create: `packages/shared/src/cursor.test.ts`

**Steps:**
- [ ] Write encodeCursor and decodeCursor functions
- [ ] Write tests for round-trip encoding
- [ ] Run tests

**Code — `packages/shared/src/cursor.ts`:**
```typescript
export interface CursorPayload {
  readonly sort_value: string;
  readonly id: string;
}

export const encodeCursor = (payload: CursorPayload): string => {
  return btoa(JSON.stringify(payload));
};

export const decodeCursor = (cursor: string): CursorPayload | null => {
  try {
    const decoded = JSON.parse(atob(cursor));
    if (typeof decoded.sort_value === 'string' && typeof decoded.id === 'string') {
      return decoded as CursorPayload;
    }
    return null;
  } catch {
    return null;
  }
};
```

---

#### C11. Barrel exports

**Files:**
- Modify: `packages/shared/src/index.ts`
- Create: `packages/shared/src/schemas/index.ts`
- Create: `packages/shared/src/types/index.ts`

**Steps:**
- [ ] Create barrel exports for schemas/, types/, and root index.ts
- [ ] Verify all imports work from `@ctrlpane/shared`

**Code — `packages/shared/src/schemas/index.ts`:**
```typescript
export * from './blueprint-item.js';
export * from './blueprint-tag.js';
export * from './blueprint-comment.js';
export * from './auth.js';
```

**Code — `packages/shared/src/types/index.ts`:**
```typescript
export * from './enums.js';
export * from './pagination.js';
export * from './api.js';
```

**Code — `packages/shared/src/index.ts`:**
```typescript
export * from './schemas/index.js';
export * from './types/index.js';
export * from './constants.js';
export * from './id.js';
export * from './cursor.js';
```

---

#### C12. Final commit

**Steps:**
- [ ] Run `bun run --cwd packages/shared test`
- [ ] Run `bun run --cwd packages/shared typecheck`
- [ ] Commit: `feat(shared): add Zod schemas, types, and constants`

---

### Team I — CI/CD & Deployment

**Scope:** GitHub Actions workflows, systemd units, Kali deployment config.
**Branch:** `feat/ci/workflows-and-deployment`
**Dependency:** Team A (Wave 1) must be complete.

---

#### I1. Create CI workflow

**Files:**
- Create: `.github/workflows/ci.yml`

**Steps:**
- [ ] Write CI workflow with all required jobs from CI/CD design spec
- [ ] Include branch-name-check, commitlint, changeset-check, lint, typecheck, test-unit, test-integration, build, architecture tests

**Code — `.github/workflows/ci.yml`:**
```yaml
name: CI

on:
  push:
    branches: ['**']
  pull_request:
    branches: [main]

jobs:
  branch-name-check:
    runs-on: self-hosted
    if: github.event_name == 'pull_request'
    steps:
      - name: Check branch name
        run: |
          BRANCH="${{ github.head_ref }}"
          if [[ ! "$BRANCH" =~ ^(feat|fix|hotfix|docs|refactor|chore|test|ci)/ ]]; then
            echo "Branch name '$BRANCH' does not follow convention"
            exit 1
          fi

  commitlint:
    runs-on: self-hosted
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: oven-sh/setup-bun@v2
      - run: bun install --frozen-lockfile
      - name: Validate commits
        run: bunx commitlint --from ${{ github.event.pull_request.base.sha || 'HEAD~1' }} --to HEAD

  changeset-check:
    runs-on: self-hosted
    if: github.event_name == 'pull_request'
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: oven-sh/setup-bun@v2
      - run: bun install --frozen-lockfile
      - name: Check changeset
        run: |
          CHANGED=$(git diff --name-only ${{ github.event.pull_request.base.sha }}...HEAD)
          if echo "$CHANGED" | grep -q "^apps/"; then
            if ! ls .changeset/*.md 2>/dev/null | grep -v README; then
              echo "Changes to apps/ require a changeset. Run: bun changeset"
              exit 1
            fi
          fi

  lint:
    runs-on: self-hosted
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install --frozen-lockfile
      - run: bun run lint

  typecheck:
    runs-on: self-hosted
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install --frozen-lockfile
      - run: bun run typecheck

  test-unit:
    runs-on: self-hosted
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install --frozen-lockfile
      - run: bun run test:unit

  test-integration:
    runs-on: self-hosted
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install --frozen-lockfile
      - run: bun run test:integration

  build:
    runs-on: self-hosted
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install --frozen-lockfile
      - run: bun run build

  test-arch:
    runs-on: self-hosted
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install --frozen-lockfile
      - run: bun run test:arch
```

---

#### I2. Create release workflow

**Files:**
- Create: `.github/workflows/release.yml`

**Steps:**
- [ ] Write release workflow triggered by Version Packages PR merge
- [ ] Include build, db migration, symlink deploy, health check

**Code — `.github/workflows/release.yml`:**
```yaml
name: Release

on:
  push:
    branches: [main]
    paths:
      - 'apps/*/package.json'
      - '.changeset/**'

jobs:
  release:
    runs-on: self-hosted
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 2
      - uses: oven-sh/setup-bun@v2
      - run: bun install --frozen-lockfile

      - name: Check if Version Packages commit
        id: check
        run: |
          MSG=$(git log -1 --pretty=%s)
          if [[ "$MSG" == "Version Packages"* ]]; then
            echo "is_release=true" >> $GITHUB_OUTPUT
          else
            echo "is_release=false" >> $GITHUB_OUTPUT
          fi

      - name: Build
        if: steps.check.outputs.is_release == 'true'
        run: bun run build

      - name: Backup database
        if: steps.check.outputs.is_release == 'true'
        run: |
          VERSION=$(node -p "require('./apps/api/package.json').version")
          pg_dump -h localhost -p 35432 -U ctrlpane_app ctrlpane | gzip > /opt/ctrlpane/backups/api@v${VERSION}-pre-deploy.sql.gz

      - name: Run migrations
        if: steps.check.outputs.is_release == 'true'
        run: bun run --cwd apps/api db:migrate

      - name: Deploy API
        if: steps.check.outputs.is_release == 'true'
        run: |
          VERSION=$(node -p "require('./apps/api/package.json').version")
          mkdir -p /opt/ctrlpane/api/releases/v${VERSION}
          cp -r apps/api/dist/* /opt/ctrlpane/api/releases/v${VERSION}/
          ln -sfn releases/v${VERSION} /opt/ctrlpane/api/current
          sudo systemctl restart ctrlpane-api

      - name: Deploy Web
        if: steps.check.outputs.is_release == 'true'
        run: |
          VERSION=$(node -p "require('./apps/web/package.json').version")
          mkdir -p /opt/ctrlpane/web/releases/v${VERSION}
          cp -r apps/web/dist/* /opt/ctrlpane/web/releases/v${VERSION}/
          ln -sfn releases/v${VERSION} /opt/ctrlpane/web/current
          sudo systemctl restart ctrlpane-web

      - name: Health check
        if: steps.check.outputs.is_release == 'true'
        run: |
          sleep 3
          curl -f http://localhost:33001/health/ready || exit 1
          curl -f http://localhost:33000/ || exit 1
```

---

#### I3. Create rollback workflow

**Files:**
- Create: `.github/workflows/rollback.yml`

**Steps:**
- [ ] Write workflow_dispatch rollback with app/version/db-restore inputs

**Code — `.github/workflows/rollback.yml`:**
```yaml
name: Rollback Production

on:
  workflow_dispatch:
    inputs:
      app:
        description: 'App to rollback'
        required: true
        type: choice
        options: [api, web]
      version:
        description: 'Version to rollback to (e.g., v0.1.0)'
        required: true
        type: string
      restore_database:
        description: 'Restore database from pre-deploy backup?'
        required: true
        type: boolean
        default: false

jobs:
  rollback:
    runs-on: self-hosted
    steps:
      - name: Verify release exists
        run: |
          if [ ! -d "/opt/ctrlpane/${{ inputs.app }}/releases/${{ inputs.version }}" ]; then
            echo "Release ${{ inputs.version }} not found for ${{ inputs.app }}"
            exit 1
          fi

      - name: Restore database
        if: inputs.restore_database
        run: |
          BACKUP="/opt/ctrlpane/backups/${{ inputs.app }}@${{ inputs.version }}-pre-deploy.sql.gz"
          if [ -f "$BACKUP" ]; then
            gunzip -c "$BACKUP" | psql -h localhost -p 35432 -U ctrlpane_app ctrlpane
          else
            echo "Backup not found: $BACKUP"
            exit 1
          fi

      - name: Rollback
        run: |
          sudo systemctl stop ctrlpane-${{ inputs.app }}
          ln -sfn releases/${{ inputs.version }} /opt/ctrlpane/${{ inputs.app }}/current
          sudo systemctl start ctrlpane-${{ inputs.app }}

      - name: Health check
        run: |
          sleep 3
          if [ "${{ inputs.app }}" = "api" ]; then
            curl -f http://localhost:33001/health/ready || exit 1
          else
            curl -f http://localhost:33000/ || exit 1
          fi
```

---

#### I4. Create CODEOWNERS

**Files:**
- Create: `.github/CODEOWNERS`

**Code — `.github/CODEOWNERS`:**
```
# Infrastructure — always human review
homelab/                    @anshulbisen
.github/workflows/          @anshulbisen
docker-compose*.yml         @anshulbisen

# Database — always human review
**/migrations/              @anshulbisen

# Security — always human review
**/auth/                    @anshulbisen
.env.example                @anshulbisen

# Agent behavior — always human review
CLAUDE.md                   @anshulbisen
AGENTS.md                   @anshulbisen
```

---

#### I5. Create systemd units

**Files:**
- Create: `homelab/systemd/ctrlpane-api.service`
- Create: `homelab/systemd/ctrlpane-web.service`

**Code — `homelab/systemd/ctrlpane-api.service`:**
```ini
[Unit]
Description=ctrlpane API server
After=docker.service
Requires=docker.service

[Service]
Type=simple
User=runner
WorkingDirectory=/opt/ctrlpane/api/current
ExecStart=/usr/local/bin/bun run index.js
Restart=on-failure
RestartSec=5s
EnvironmentFile=/opt/ctrlpane/.env
Environment=NODE_ENV=production
Environment=API_PORT=33001
Environment=API_HOST=127.0.0.1

# Hardening
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/opt/ctrlpane

[Install]
WantedBy=multi-user.target
```

**Code — `homelab/systemd/ctrlpane-web.service`:**
```ini
[Unit]
Description=ctrlpane Web server
After=ctrlpane-api.service

[Service]
Type=simple
User=runner
WorkingDirectory=/opt/ctrlpane/web/current
ExecStart=/usr/local/bin/bun run serve.js
Restart=on-failure
RestartSec=5s
EnvironmentFile=/opt/ctrlpane/.env
Environment=NODE_ENV=production
Environment=WEB_PORT=33000

# Hardening
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/opt/ctrlpane

[Install]
WantedBy=multi-user.target
```

---

#### I6. Create production docker-compose

**Files:**
- Create: `homelab/docker-compose.prod.yml`

**Steps:**
- [ ] Write production Docker Compose with same services as dev, but production-ready settings

**Code — `homelab/docker-compose.prod.yml`:**
```yaml
name: ctrlpane-prod

services:
  postgres:
    image: postgres:17-alpine
    ports:
      - "127.0.0.1:35432:5432"
    environment:
      POSTGRES_DB: ctrlpane
      POSTGRES_USER: ctrlpane_app
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ctrlpane_app -d ctrlpane"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped
    deploy:
      resources:
        limits:
          memory: 4G

  redis:
    image: redis:7-alpine
    ports:
      - "127.0.0.1:36379:6379"
    command: redis-server --requirepass ${REDIS_PASSWORD} --maxmemory 512mb --maxmemory-policy allkeys-lru
    volumes:
      - redisdata:/data
    healthcheck:
      test: ["CMD", "redis-cli", "-a", "${REDIS_PASSWORD}", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped

  nats:
    image: nats:2-alpine
    ports:
      - "127.0.0.1:34222:4222"
      - "127.0.0.1:38222:8222"
    command: --jetstream --store_dir /data --max_mem_store 256MB
    volumes:
      - natsdata:/data
    healthcheck:
      test: ["CMD", "wget", "--spider", "-q", "http://localhost:8222/healthz"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped

  centrifugo:
    image: centrifugo/centrifugo:v5
    ports:
      - "127.0.0.1:38000:8000"
    environment:
      CENTRIFUGO_API_KEY: ${CENTRIFUGO_API_KEY}
      CENTRIFUGO_TOKEN_HMAC_SECRET_KEY: ${CENTRIFUGO_HMAC_SECRET}
      CENTRIFUGO_ALLOWED_ORIGINS: "https://ctrlpane.com"
    command: centrifugo --health
    healthcheck:
      test: ["CMD", "wget", "--spider", "-q", "http://localhost:8000/health"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped

volumes:
  pgdata:
  redisdata:
  natsdata:
```

---

#### I7. Create bootstrap script

**Files:**
- Create: `homelab/bootstrap.sh`

**Steps:**
- [ ] Write first-time Kali setup script

**Code — `homelab/bootstrap.sh`:**
```bash
#!/usr/bin/env bash
set -euo pipefail

echo "=== ctrlpane Kali Bootstrap ==="

# Create directory structure
sudo mkdir -p /opt/ctrlpane/{api/releases,web/releases,backups,previews}
sudo chown -R runner:runner /opt/ctrlpane

# Install Bun
if ! command -v bun &> /dev/null; then
  curl -fsSL https://bun.sh/install | bash
fi

# Start infrastructure
cd "$(dirname "$0")"
docker compose -f docker-compose.prod.yml up -d

# Install systemd units
sudo cp systemd/ctrlpane-api.service /etc/systemd/system/
sudo cp systemd/ctrlpane-web.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable ctrlpane-api ctrlpane-web

echo "=== Bootstrap complete ==="
echo "Next steps:"
echo "  1. Copy .env to /opt/ctrlpane/.env"
echo "  2. Run migrations: bun run --cwd apps/api db:migrate"
echo "  3. Start services: sudo systemctl start ctrlpane-api ctrlpane-web"
```

---

#### I8. Create rclone config template

**Files:**
- Create: `homelab/rclone.conf.template`

**Code — `homelab/rclone.conf.template`:**
```ini
[gdrive]
type = drive
client_id = <your-client-id>
client_secret = <your-client-secret>
scope = drive
root_folder_id = <folder-id>
token = <token-json>

[gdrive-crypt]
type = crypt
remote = gdrive:ctrlpane-backups/secrets
password = <encrypted-password>
```

---

#### I9. Configure Changesets

**Files:**
- Create: `.changeset/config.json`

**Code — `.changeset/config.json`:**
```json
{
  "$schema": "https://unpkg.com/@changesets/config@3.0.0/schema.json",
  "changelog": "@changesets/cli/changelog",
  "commit": false,
  "fixed": [],
  "linked": [],
  "access": "restricted",
  "baseBranch": "main",
  "updateInternalDependencies": "patch",
  "ignore": []
}
```

---

#### I10. Final commit

**Steps:**
- [ ] Verify all workflow YAML is valid syntax
- [ ] Verify systemd units have correct paths
- [ ] Commit: `ci: add GitHub Actions workflows, systemd units, and Kali deployment`

---

### Team G Phase 1 — Frontend Scaffold

**Scope:** React scaffold, routing, API client, WebSocket client (no API integration yet).
**Branch:** `feat/web/scaffold-and-routing`
**Dependency:** Team A (Wave 1) and Team C (shared schemas) must be complete.

---

#### G1. React 19 + Vite scaffold

**Files:**
- Modify: `apps/web/src/main.tsx`
- Create: `apps/web/src/app.tsx`

**Steps:**
- [ ] Set up React 19 root with StrictMode
- [ ] Create App component wrapper
- [ ] Verify `bun run --cwd apps/web dev` starts

**Code — `apps/web/src/app.tsx`:**
```tsx
import React from 'react';
import { RouterProvider, createRouter } from '@tanstack/react-router';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './lib/query-client.js';
import { routeTree } from './routes/__root.js';

const router = createRouter({ routeTree });

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}
```

---

#### G2. TanStack Router setup

**Files:**
- Create: `apps/web/src/routes/__root.tsx`
- Create: `apps/web/src/routes/index.tsx` (dashboard stub)
- Create: `apps/web/src/routes/items/index.tsx` (stub)
- Create: `apps/web/src/routes/items/$id.tsx` (stub)
- Create: `apps/web/src/routes/tags/index.tsx` (stub)
- Create: `apps/web/src/routes/settings/index.tsx` (stub)

**Steps:**
- [ ] Create root layout with navigation sidebar
- [ ] Create route stubs for all 5 views
- [ ] Verify routes load in browser

**Code — `apps/web/src/routes/__root.tsx`:**
```tsx
import React from 'react';
import { createRootRoute, Link, Outlet } from '@tanstack/react-router';

export const Route = createRootRoute({
  component: RootLayout,
});

function RootLayout() {
  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <nav style={{ width: 200, padding: 16, borderRight: '1px solid #e5e7eb' }}>
        <h2 style={{ marginBottom: 16 }}>ctrlpane</h2>
        <ul style={{ listStyle: 'none', padding: 0 }}>
          <li><Link to="/">Dashboard</Link></li>
          <li><Link to="/items">Items</Link></li>
          <li><Link to="/tags">Tags</Link></li>
          <li><Link to="/settings">Settings</Link></li>
        </ul>
      </nav>
      <main style={{ flex: 1, padding: 16 }}>
        <Outlet />
      </main>
    </div>
  );
}
```

---

#### G3. API client

**Files:**
- Create: `apps/web/src/lib/api-client.ts`
- Create: `apps/web/src/lib/api-client.test.ts`

**Steps:**
- [ ] Write typed fetch wrapper with X-API-Key header
- [ ] Use shared Zod schemas for response validation
- [ ] Write unit tests for error handling

**Code — `apps/web/src/lib/api-client.ts`:**
```typescript
import type { ApiErrorResponse, ApiResponse, PaginatedResponse } from '@ctrlpane/shared';

const API_BASE = '/api/v1/blueprint';

let apiKey = localStorage.getItem('ctrlpane_api_key') ?? '';

export const setApiKey = (key: string) => {
  apiKey = key;
  localStorage.setItem('ctrlpane_api_key', key);
};

export const getApiKey = () => apiKey;

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': apiKey,
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error: ApiErrorResponse = await response.json();
    throw new ApiClientError(response.status, error.error.code, error.error.message);
  }

  return response.json() as Promise<T>;
}

export class ApiClientError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};
```

---

#### G4. TanStack Query setup

**Files:**
- Create: `apps/web/src/lib/query-client.ts`

**Code — `apps/web/src/lib/query-client.ts`:**
```typescript
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000, // 30 seconds
      retry: 1,
    },
  },
});
```

---

#### G5. Centrifugo WebSocket client

**Files:**
- Create: `apps/web/src/lib/ws-client.ts`

**Steps:**
- [ ] Create Centrifugo client wrapper that subscribes to tenant channel
- [ ] On incoming events, invalidate relevant TanStack Query cache keys

**Code — `apps/web/src/lib/ws-client.ts`:**
```typescript
import { Centrifuge } from 'centrifuge';
import { queryClient } from './query-client.js';

let centrifuge: Centrifuge | null = null;

export const connectWebSocket = (token: string, tenantId: string) => {
  if (centrifuge) {
    centrifuge.disconnect();
  }

  centrifuge = new Centrifuge('ws://localhost:38000/connection/websocket', {
    token,
  });

  // Subscribe to tenant-level item updates
  const itemsSub = centrifuge.newSubscription(`blueprint:items#${tenantId}`);
  itemsSub.on('publication', (ctx) => {
    const event = ctx.data as { type: string; item_id?: string };
    // Invalidate items list cache
    queryClient.invalidateQueries({ queryKey: ['blueprint', 'items'] });
    // Invalidate specific item if applicable
    if (event.item_id) {
      queryClient.invalidateQueries({ queryKey: ['blueprint', 'item', event.item_id] });
    }
  });
  itemsSub.subscribe();

  centrifuge.connect();
};

export const disconnectWebSocket = () => {
  centrifuge?.disconnect();
  centrifuge = null;
};
```

---

#### G6. Layout component with navigation

**Files:**
- Create: `apps/web/src/components/layout.tsx`

**Steps:**
- [ ] Create layout with sidebar navigation matching spec Section 11 routes
- [ ] Commit: `feat(web): add React scaffold, TanStack Router, API and WebSocket clients`

---

### Team H Phase 1 — Test Infrastructure

**Scope:** Vitest config, testcontainers helpers, architecture test setup.
**Branch:** `feat/testing/infrastructure-and-arch-tests`
**Dependency:** Team A (Wave 1) must be complete.

---

#### H1. Configure Vitest for apps/api

**Files:**
- Create: `apps/api/vitest.config.ts`

**Code — `apps/api/vitest.config.ts`:**
```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/db/migrations/**', 'src/db/seed.ts'],
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80,
      },
    },
    testTimeout: 30_000,
  },
});
```

---

#### H2. Set up testcontainers helper

**Files:**
- Create: `apps/api/src/test-helpers/containers.ts`

**Steps:**
- [ ] Create reusable testcontainers setup for Postgres, Redis, NATS
- [ ] Export helper for creating isolated test databases

**Code — `apps/api/src/test-helpers/containers.ts`:**
```typescript
import { GenericContainer, Wait } from 'testcontainers';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import Redis from 'ioredis';
import * as schema from '../db/schema/index.js';

export interface TestInfra {
  readonly db: ReturnType<typeof drizzle<typeof schema>>;
  readonly sql: ReturnType<typeof postgres>;
  readonly redis: Redis;
  readonly cleanup: () => Promise<void>;
}

export async function createTestInfra(): Promise<TestInfra> {
  const pgContainer = await new GenericContainer('postgres:17-alpine')
    .withEnvironment({
      POSTGRES_DB: 'ctrlpane_test',
      POSTGRES_USER: 'ctrlpane_app',
      POSTGRES_PASSWORD: 'test',
    })
    .withExposedPorts(5432)
    .withWaitStrategy(Wait.forLogMessage('database system is ready to accept connections'))
    .start();

  const redisContainer = await new GenericContainer('redis:7-alpine')
    .withExposedPorts(6379)
    .withWaitStrategy(Wait.forLogMessage('Ready to accept connections'))
    .start();

  const pgPort = pgContainer.getMappedPort(5432);
  const redisPort = redisContainer.getMappedPort(6379);

  const sql = postgres(`postgres://ctrlpane_app:test@localhost:${pgPort}/ctrlpane_test`);
  const db = drizzle(sql, { schema });
  const redis = new Redis({ host: 'localhost', port: redisPort });

  return {
    db,
    sql,
    redis,
    cleanup: async () => {
      await sql.end();
      redis.disconnect();
      await pgContainer.stop();
      await redisContainer.stop();
    },
  };
}
```

---

#### H3. Configure architecture tests

**Files:**
- Create: `tests/architecture/hexagonal-boundaries.test.ts`
- Create: `tests/architecture/import-direction.test.ts`

**Steps:**
- [ ] Write architecture test: domains don't import from other domains
- [ ] Write architecture test: routes -> service -> repository (never reverse)
- [ ] Commit: `test(testing): add test infrastructure and architecture tests`

**Code — `tests/architecture/hexagonal-boundaries.test.ts`:**
```typescript
import { describe, expect, it } from 'bun:test';
import { Project } from 'ts-morph';

describe('Hexagonal Boundaries [architecture]', () => {
  const project = new Project({
    tsConfigFilePath: 'apps/api/tsconfig.json',
  });

  it('blueprint domain does not import from other domains', () => {
    const blueprintFiles = project.getSourceFiles('apps/api/src/domains/blueprint/**/*.ts');
    const violations: string[] = [];

    for (const file of blueprintFiles) {
      for (const imp of file.getImportDeclarations()) {
        const moduleSpecifier = imp.getModuleSpecifierValue();
        if (
          moduleSpecifier.includes('/domains/') &&
          !moduleSpecifier.includes('/domains/blueprint/')
        ) {
          violations.push(
            `${file.getFilePath()}: imports from ${moduleSpecifier}`,
          );
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
```

**Code — `tests/architecture/import-direction.test.ts`:**
```typescript
import { describe, expect, it } from 'bun:test';
import { Project } from 'ts-morph';

describe('Import Direction [architecture]', () => {
  const project = new Project({
    tsConfigFilePath: 'apps/api/tsconfig.json',
  });

  it('repository files do not import from routes or service', () => {
    const repoFiles = project.getSourceFiles('apps/api/src/domains/**/repository*.ts');
    const violations: string[] = [];

    for (const file of repoFiles) {
      for (const imp of file.getImportDeclarations()) {
        const specifier = imp.getModuleSpecifierValue();
        if (specifier.includes('routes') || specifier.includes('service')) {
          violations.push(`${file.getFilePath()}: imports ${specifier}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it('service files do not import from routes', () => {
    const serviceFiles = project.getSourceFiles('apps/api/src/domains/**/service*.ts');
    const violations: string[] = [];

    for (const file of serviceFiles) {
      for (const imp of file.getImportDeclarations()) {
        const specifier = imp.getModuleSpecifierValue();
        if (specifier.includes('routes')) {
          violations.push(`${file.getFilePath()}: imports ${specifier}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
```

---

## Wave 3: API Foundation

### Team D — API Foundation

**Scope:** Hono server, auth middleware, infra clients, Effect layers.
**Branch:** `feat/api/foundation-and-middleware`
**Dependency:** Team A (Wave 1) + Team C (shared package) must be complete.

---

#### D1. Create Hono app with health routes

**Files:**
- Create: `apps/api/src/index.ts` (replace stub)
- Create: `apps/api/src/routes/health.ts`
- Create: `apps/api/src/routes/health.test.ts`

**Steps:**
- [ ] Write failing test: GET /health/live returns 200
- [ ] Write failing test: GET /health/ready returns 200 when all deps healthy
- [ ] Write Hono app entry point with health routes
- [ ] Run tests to verify pass

**Code — `apps/api/src/routes/health.ts`:**
```typescript
import { Hono } from 'hono';
import { Effect } from 'effect';
import { DatabaseClient } from '../infra/db.js';
import { RedisClient } from '../infra/redis.js';
import { NatsClient } from '../infra/nats.js';

export const healthRoutes = new Hono()
  .get('/health', (c) => c.json({ status: 'healthy', timestamp: new Date().toISOString() }))
  .get('/health/live', (c) => c.json({ ok: true }))
  .get('/health/ready', async (c) => {
    // Check connectivity to all dependencies
    // This will be wired up when infrastructure clients are available
    // For now, return a basic response
    return c.json({
      db: true,
      redis: true,
      nats: true,
    });
  });
```

**Code — `apps/api/src/index.ts`:**
```typescript
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { healthRoutes } from './routes/health.js';
import { requestIdMiddleware } from './middleware/request-id.js';
import { errorHandlerMiddleware } from './middleware/error-handler.js';

const app = new Hono();

// Global middleware
app.use('*', requestIdMiddleware);
app.use('*', errorHandlerMiddleware);
app.use(
  '/api/*',
  cors({
    origin: ['http://localhost:33000'],
    allowHeaders: ['Content-Type', 'X-API-Key', 'Idempotency-Key'],
    allowMethods: ['GET', 'POST', 'PATCH', 'DELETE'],
  }),
);

// Health routes (outside /api/v1, no auth)
app.route('/', healthRoutes);

const port = Number(process.env.API_PORT ?? 33001);
const hostname = process.env.API_HOST ?? '127.0.0.1';

console.log(`ctrlpane API starting on ${hostname}:${port}`);

export default {
  port,
  hostname,
  fetch: app.fetch,
};
```

**Code — `apps/api/src/routes/health.test.ts`:**
```typescript
import { describe, expect, it } from 'bun:test';
import { Hono } from 'hono';
import { healthRoutes } from './health.js';

const app = new Hono().route('/', healthRoutes);

describe('Health Routes [unit]', () => {
  it('GET /health returns 200 with status', async () => {
    const res = await app.request('/health');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('healthy');
  });

  it('GET /health/live returns 200', async () => {
    const res = await app.request('/health/live');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it('GET /health/ready returns 200 with dependency status', async () => {
    const res = await app.request('/health/ready');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('db');
    expect(body).toHaveProperty('redis');
    expect(body).toHaveProperty('nats');
  });
});
```

---

#### D2. Create request ID middleware

**Files:**
- Create: `apps/api/src/middleware/request-id.ts`
- Create: `apps/api/src/middleware/request-id.test.ts`

**Steps:**
- [ ] Write failing test: response contains X-Request-ID header
- [ ] Implement middleware that generates ULID and sets header
- [ ] Run tests to verify pass

**Code — `apps/api/src/middleware/request-id.ts`:**
```typescript
import type { MiddlewareHandler } from 'hono';
import { ulid } from 'ulid';

export const requestIdMiddleware: MiddlewareHandler = async (c, next) => {
  const requestId = c.req.header('X-Request-ID') ?? `req_${ulid()}`;
  c.set('requestId', requestId);
  c.header('X-Request-ID', requestId);
  await next();
};
```

---

#### D3. Create error handling middleware

**Files:**
- Create: `apps/api/src/middleware/error-handler.ts`
- Create: `apps/api/src/middleware/error-handler.test.ts`

**Steps:**
- [ ] Write failing test: unhandled errors return structured JSON
- [ ] Implement middleware that catches errors and maps to HTTP status codes
- [ ] Run tests to verify pass

**Code — `apps/api/src/middleware/error-handler.ts`:**
```typescript
import type { MiddlewareHandler } from 'hono';
import { Data } from 'effect';

// Domain error base classes for HTTP mapping
export class NotFoundError extends Data.TaggedError('NotFoundError')<{
  readonly resource: string;
  readonly id: string;
}> {}

export class ValidationError extends Data.TaggedError('ValidationError')<{
  readonly field: string;
  readonly message: string;
}> {}

export class AuthenticationError extends Data.TaggedError('AuthenticationError')<{
  readonly message: string;
}> {}

export class AuthorizationError extends Data.TaggedError('AuthorizationError')<{
  readonly message: string;
}> {}

const errorToStatus = (error: unknown): number => {
  if (error instanceof NotFoundError) return 404;
  if (error instanceof ValidationError) return 422;
  if (error instanceof AuthenticationError) return 401;
  if (error instanceof AuthorizationError) return 403;
  return 500;
};

const errorToCode = (error: unknown): string => {
  if (error instanceof Data.TaggedError) {
    return (error as { _tag: string })._tag
      .replace(/([A-Z])/g, '_$1')
      .toUpperCase()
      .replace(/^_/, '');
  }
  return 'INTERNAL_ERROR';
};

export const errorHandlerMiddleware: MiddlewareHandler = async (c, next) => {
  try {
    await next();
  } catch (error) {
    const status = errorToStatus(error);
    const code = errorToCode(error);
    const message = error instanceof Error ? error.message : 'An unexpected error occurred';

    return c.json(
      {
        error: {
          code,
          message,
          details: {},
        },
      },
      status as 400,
    );
  }
};
```

---

#### D4. Create API key auth middleware

**Files:**
- Create: `apps/api/src/middleware/auth.ts`
- Create: `apps/api/src/middleware/auth.test.ts`

**Steps:**
- [ ] Write failing test: missing X-API-Key returns 401
- [ ] Write failing test: invalid key returns 401
- [ ] Write failing test: valid key sets tenant context
- [ ] Implement auth middleware with SHA-256 hash + constant-time compare
- [ ] Run tests to verify pass

**Code — `apps/api/src/middleware/auth.ts`:**
```typescript
import type { MiddlewareHandler } from 'hono';
import { createHash, timingSafeEqual } from 'node:crypto';
import { Effect } from 'effect';
import { DatabaseClient } from '../infra/db.js';
import { eq } from 'drizzle-orm';
import { apiKeys } from '../db/schema/api-keys.js';

export const authMiddleware: MiddlewareHandler = async (c, next) => {
  const rawKey = c.req.header('X-API-Key');

  if (!rawKey) {
    return c.json(
      { error: { code: 'AUTHENTICATION_ERROR', message: 'Missing X-API-Key header', details: {} } },
      401,
    );
  }

  const keyHash = createHash('sha256').update(rawKey).digest('hex');
  const keyPrefix = rawKey.slice(0, 8);

  // Look up key by prefix first (fast filter), then constant-time compare hash
  // In production this uses the Effect-provided DB client
  // For now, we store the lookup result on the context
  try {
    const db = c.get('db'); // Set by the Effect layer composition
    const results = await db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.keyPrefix, keyPrefix))
      .limit(1);

    if (results.length === 0) {
      return c.json(
        { error: { code: 'AUTHENTICATION_ERROR', message: 'Invalid API key', details: {} } },
        401,
      );
    }

    const key = results[0]!;

    // Constant-time comparison of hashes
    const storedHash = Buffer.from(key.keyHash, 'hex');
    const providedHash = Buffer.from(keyHash, 'hex');

    if (storedHash.length !== providedHash.length || !timingSafeEqual(storedHash, providedHash)) {
      return c.json(
        { error: { code: 'AUTHENTICATION_ERROR', message: 'Invalid API key', details: {} } },
        401,
      );
    }

    // Check expiration
    if (key.expiresAt && new Date(key.expiresAt) < new Date()) {
      return c.json(
        { error: { code: 'AUTHENTICATION_ERROR', message: 'API key expired', details: {} } },
        401,
      );
    }

    // Set tenant context for RLS
    await db.execute(`SET LOCAL app.tenant_id = '${key.tenantId}'`);

    // Store auth context on request
    c.set('tenantId', key.tenantId);
    c.set('apiKeyId', key.id);
    c.set('permissions', key.permissions);

    // Update last_used_at (fire-and-forget)
    db.update(apiKeys)
      .set({ lastUsedAt: new Date() })
      .where(eq(apiKeys.id, key.id))
      .catch(() => {});

    await next();
  } catch (error) {
    return c.json(
      { error: { code: 'AUTHENTICATION_ERROR', message: 'Authentication failed', details: {} } },
      401,
    );
  }
};
```

---

#### D5. Create tenant context Effect service

**Files:**
- Create: `apps/api/src/shared/tenant-context.ts`

**Steps:**
- [ ] Create Effect Context.Tag for TenantContext
- [ ] Include tenant_id, api_key_id, permissions

**Code — `apps/api/src/shared/tenant-context.ts`:**
```typescript
import { Context, Effect, Layer } from 'effect';

export interface TenantContextShape {
  readonly tenantId: string;
  readonly apiKeyId: string;
  readonly permissions: readonly string[];
}

export class TenantContext extends Context.Tag('TenantContext')<
  TenantContext,
  TenantContextShape
>() {}

/**
 * Creates a TenantContext Layer from Hono request context.
 * Called per-request in the route handler after auth middleware runs.
 */
export const makeTenantContextLayer = (
  tenantId: string,
  apiKeyId: string,
  permissions: readonly string[],
): Layer.Layer<TenantContext> =>
  Layer.succeed(TenantContext, { tenantId, apiKeyId, permissions });
```

---

#### D6. Create Redis client infrastructure

**Files:**
- Create: `apps/api/src/infra/redis.ts`

**Code — `apps/api/src/infra/redis.ts`:**
```typescript
import { Context, Effect, Layer } from 'effect';
import Redis from 'ioredis';

export interface RedisClientShape {
  readonly redis: Redis;
}

export class RedisClient extends Context.Tag('RedisClient')<
  RedisClient,
  RedisClientShape
>() {}

export const RedisClientLive = Layer.scoped(
  RedisClient,
  Effect.gen(function* () {
    const redisUrl = process.env.REDIS_URL ?? 'redis://:ctrlpane_dev@localhost:36379';
    const redis = new Redis(redisUrl);

    yield* Effect.addFinalizer(() =>
      Effect.sync(() => redis.disconnect()),
    );

    return { redis };
  }),
);
```

---

#### D7. Create NATS client infrastructure

**Files:**
- Create: `apps/api/src/infra/nats.ts`

**Code — `apps/api/src/infra/nats.ts`:**
```typescript
import { Context, Effect, Layer } from 'effect';
import { connect, type NatsConnection, type JetStreamClient } from 'nats';

export interface NatsClientShape {
  readonly nc: NatsConnection;
  readonly js: JetStreamClient;
}

export class NatsClient extends Context.Tag('NatsClient')<
  NatsClient,
  NatsClientShape
>() {}

export const NatsClientLive = Layer.scoped(
  NatsClient,
  Effect.gen(function* () {
    const natsUrl = process.env.NATS_URL ?? 'nats://localhost:34222';
    const nc = yield* Effect.promise(() => connect({ servers: natsUrl }));
    const js = nc.jetstream();

    yield* Effect.addFinalizer(() =>
      Effect.promise(() => nc.drain()),
    );

    return { nc, js };
  }),
);
```

---

#### D8. Create Centrifugo client infrastructure

**Files:**
- Create: `apps/api/src/infra/centrifugo.ts`

**Code — `apps/api/src/infra/centrifugo.ts`:**
```typescript
import { Context, Effect, Layer } from 'effect';

export interface CentrifugoClientShape {
  readonly publish: (channel: string, data: unknown) => Effect.Effect<void, Error>;
}

export class CentrifugoClient extends Context.Tag('CentrifugoClient')<
  CentrifugoClient,
  CentrifugoClientShape
>() {}

export const CentrifugoClientLive = Layer.succeed(
  CentrifugoClient,
  {
    publish: (channel: string, data: unknown) =>
      Effect.tryPromise({
        try: () =>
          fetch(`${process.env.CENTRIFUGO_URL ?? 'http://localhost:38000'}/api/publish`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `apikey ${process.env.CENTRIFUGO_API_KEY ?? 'ctrlpane_dev_api_key'}`,
            },
            body: JSON.stringify({ channel, data }),
          }).then((res) => {
            if (!res.ok) throw new Error(`Centrifugo publish failed: ${res.status}`);
          }),
        catch: (error) => new Error(`Centrifugo publish error: ${error}`),
      }),
  },
);
```

---

#### D9. Create runEffect utility

**Files:**
- Create: `apps/api/src/shared/run-effect.ts`

**Steps:**
- [ ] Create utility that runs an Effect program in Hono context
- [ ] Maps Effect failures to HTTP responses

**Code — `apps/api/src/shared/run-effect.ts`:**
```typescript
import type { Context as HonoContext } from 'hono';
import { Effect, Exit, Cause } from 'effect';

/**
 * Runs an Effect program within a Hono route handler.
 * Maps typed failures to JSON error responses.
 * NEVER use Effect.runPromise directly in routes — always use this.
 */
export const runEffect = async <A, E>(
  c: HonoContext,
  effect: Effect.Effect<A, E, never>,
): Promise<Response> => {
  const exit = await Effect.runPromiseExit(effect);

  if (Exit.isSuccess(exit)) {
    return c.json(exit.value as Record<string, unknown>);
  }

  const cause = exit.cause;

  if (Cause.isFailType(cause)) {
    const error = cause.error;
    // Check for tagged errors with _tag property
    if (error && typeof error === 'object' && '_tag' in error) {
      const tag = (error as { _tag: string })._tag;
      const message = error instanceof Error ? error.message : String(error);

      switch (tag) {
        case 'ItemNotFoundError':
          return c.json({ error: { code: 'ITEM_NOT_FOUND', message, details: {} } }, 404);
        case 'InvalidStatusTransitionError':
          return c.json({ error: { code: 'INVALID_STATUS_TRANSITION', message, details: {} } }, 422);
        case 'DuplicateTagError':
          return c.json({ error: { code: 'DUPLICATE_TAG', message, details: {} } }, 409);
        case 'AuthenticationError':
          return c.json({ error: { code: 'AUTHENTICATION_ERROR', message, details: {} } }, 401);
        case 'AuthorizationError':
          return c.json({ error: { code: 'AUTHORIZATION_ERROR', message, details: {} } }, 403);
        default:
          return c.json({ error: { code: tag, message, details: {} } }, 500);
      }
    }
  }

  return c.json(
    { error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred', details: {} } },
    500,
  );
};
```

---

#### D10. Create Effect main layer composition

**Files:**
- Create: `apps/api/src/shared/layers.ts`

**Code — `apps/api/src/shared/layers.ts`:**
```typescript
import { Layer } from 'effect';
import { DatabaseClientLive } from '../infra/db.js';
import { RedisClientLive } from '../infra/redis.js';
import { NatsClientLive } from '../infra/nats.js';
import { CentrifugoClientLive } from '../infra/centrifugo.js';

/**
 * Composes all infrastructure layers into a single live layer.
 * Domain layers depend on this.
 */
export const InfraLive = Layer.mergeAll(
  DatabaseClientLive,
  RedisClientLive,
  NatsClientLive,
  CentrifugoClientLive,
);
```

---

#### D11. Final commit

**Steps:**
- [ ] Run all health endpoint tests
- [ ] Run typecheck
- [ ] Commit: `feat(api): add Hono server, auth middleware, infrastructure clients`

---

## Wave 4: Parallel Domain Work

### Team E — Blueprint API Domain

**Scope:** All blueprint domain logic, all 22 endpoints, event publishing, caching.
**Branch:** `feat/blueprint/api-domain`
**Dependency:** Team D (API Foundation) + Team B (Database) + Team C (Shared) must be complete.

---

#### E1. Create domain error types

**Files:**
- Create: `apps/api/src/domains/blueprint/errors.ts`
- Create: `apps/api/src/domains/blueprint/errors.test.ts`

**Steps:**
- [ ] Write failing test: errors have correct _tag
- [ ] Define all domain-specific errors
- [ ] Run tests to verify pass

**Code — `apps/api/src/domains/blueprint/errors.ts`:**
```typescript
import { Data } from 'effect';

export class ItemNotFoundError extends Data.TaggedError('ItemNotFoundError')<{
  readonly itemId: string;
}> {
  get message() {
    return `Blueprint item ${this.itemId} not found`;
  }
}

export class InvalidStatusTransitionError extends Data.TaggedError('InvalidStatusTransitionError')<{
  readonly itemId: string;
  readonly from: string;
  readonly to: string;
}> {
  get message() {
    return `Cannot transition item ${this.itemId} from '${this.from}' to '${this.to}'`;
  }
}

export class DuplicateTagError extends Data.TaggedError('DuplicateTagError')<{
  readonly tagName: string;
  readonly tenantId: string;
}> {
  get message() {
    return `Tag '${this.tagName}' already exists for this tenant`;
  }
}

export class TagNotFoundError extends Data.TaggedError('TagNotFoundError')<{
  readonly tagId: string;
}> {
  get message() {
    return `Tag ${this.tagId} not found`;
  }
}

export class CommentNotFoundError extends Data.TaggedError('CommentNotFoundError')<{
  readonly commentId: string;
}> {
  get message() {
    return `Comment ${this.commentId} not found`;
  }
}

export class ParentItemNotFoundError extends Data.TaggedError('ParentItemNotFoundError')<{
  readonly parentId: string;
}> {
  get message() {
    return `Parent item ${this.parentId} not found`;
  }
}
```

---

#### E2. Create BlueprintItemRepository

**Files:**
- Create: `apps/api/src/domains/blueprint/repository.ts`
- Create: `apps/api/src/domains/blueprint/repository-live.ts`
- Create: `apps/api/src/domains/blueprint/repository.test.ts`

**Steps:**
- [ ] Write failing tests for CRUD operations
- [ ] Define repository Context.Tag interface
- [ ] Implement with Drizzle queries including cursor pagination and multi-table joins
- [ ] Run tests to verify pass

**Code — `apps/api/src/domains/blueprint/repository.ts`:**
```typescript
import { Context, Effect } from 'effect';
import type {
  CreateBlueprintItemInput,
  UpdateBlueprintItemInput,
  BlueprintItemFilters,
} from '@ctrlpane/shared';
import type { InferSelectModel } from 'drizzle-orm';
import type { blueprintItems } from '../../db/schema/blueprint/items.js';

export type BlueprintItemRow = InferSelectModel<typeof blueprintItems>;

export interface ItemDetail extends BlueprintItemRow {
  readonly subItems: BlueprintItemRow[];
  readonly tags: Array<{ id: string; name: string; color: string }>;
  readonly comments: Array<{
    id: string;
    content: string;
    authorId: string;
    authorType: string;
    createdAt: Date;
  }>;
}

export interface PaginatedItems {
  readonly items: BlueprintItemRow[];
  readonly nextCursor: string | null;
  readonly hasMore: boolean;
}

export interface BlueprintItemRepositoryShape {
  readonly findById: (id: string) => Effect.Effect<BlueprintItemRow | null>;
  readonly findDetailById: (id: string) => Effect.Effect<ItemDetail | null>;
  readonly list: (filters: BlueprintItemFilters) => Effect.Effect<PaginatedItems>;
  readonly create: (
    input: CreateBlueprintItemInput & { id: string; tenantId: string; createdBy: string },
  ) => Effect.Effect<BlueprintItemRow>;
  readonly update: (
    id: string,
    input: UpdateBlueprintItemInput,
  ) => Effect.Effect<BlueprintItemRow | null>;
  readonly softDelete: (id: string) => Effect.Effect<BlueprintItemRow | null>;
  readonly listSubItems: (parentId: string) => Effect.Effect<BlueprintItemRow[]>;
}

export class BlueprintItemRepository extends Context.Tag('BlueprintItemRepository')<
  BlueprintItemRepository,
  BlueprintItemRepositoryShape
>() {}
```

**Code — `apps/api/src/domains/blueprint/repository-live.ts`:**
```typescript
import { Effect, Layer } from 'effect';
import {
  eq,
  and,
  isNull,
  ilike,
  desc,
  asc,
  sql,
  inArray,
} from 'drizzle-orm';
import { BlueprintItemRepository } from './repository.js';
import { DatabaseClient } from '../../infra/db.js';
import { blueprintItems } from '../../db/schema/blueprint/items.js';
import { blueprintTags, blueprintItemTags } from '../../db/schema/blueprint/tags.js';
import { blueprintComments } from '../../db/schema/blueprint/comments.js';
import { decodeCursor, encodeCursor } from '@ctrlpane/shared';

export const BlueprintItemRepositoryLive = Layer.effect(
  BlueprintItemRepository,
  Effect.gen(function* () {
    const { db } = yield* DatabaseClient;

    return {
      findById: (id) =>
        Effect.tryPromise({
          try: async () => {
            const results = await db
              .select()
              .from(blueprintItems)
              .where(and(eq(blueprintItems.id, id), isNull(blueprintItems.deletedAt)))
              .limit(1);
            return results[0] ?? null;
          },
          catch: (error) => error as Error,
        }),

      findDetailById: (id) =>
        Effect.tryPromise({
          try: async () => {
            const [item] = await db
              .select()
              .from(blueprintItems)
              .where(and(eq(blueprintItems.id, id), isNull(blueprintItems.deletedAt)))
              .limit(1);

            if (!item) return null;

            // Parallel fetch sub-items, tags, comments
            const [subItems, tagRows, comments] = await Promise.all([
              db
                .select()
                .from(blueprintItems)
                .where(
                  and(eq(blueprintItems.parentId, id), isNull(blueprintItems.deletedAt)),
                ),
              db
                .select({
                  id: blueprintTags.id,
                  name: blueprintTags.name,
                  color: blueprintTags.color,
                })
                .from(blueprintItemTags)
                .innerJoin(blueprintTags, eq(blueprintItemTags.tagId, blueprintTags.id))
                .where(eq(blueprintItemTags.itemId, id)),
              db
                .select()
                .from(blueprintComments)
                .where(eq(blueprintComments.itemId, id))
                .orderBy(desc(blueprintComments.createdAt)),
            ]);

            return { ...item, subItems, tags: tagRows, comments };
          },
          catch: (error) => error as Error,
        }),

      list: (filters) =>
        Effect.tryPromise({
          try: async () => {
            const limit = filters.limit ?? 25;
            const conditions = [isNull(blueprintItems.deletedAt)];

            if (filters.status) {
              conditions.push(eq(blueprintItems.status, filters.status));
            }
            if (filters.priority) {
              conditions.push(eq(blueprintItems.priority, filters.priority));
            }
            if (filters.assigned_to) {
              conditions.push(eq(blueprintItems.assignedTo, filters.assigned_to));
            }
            if (filters.search) {
              conditions.push(ilike(blueprintItems.title, `%${filters.search}%`));
            }

            // Cursor-based pagination
            if (filters.cursor) {
              const cursor = decodeCursor(filters.cursor);
              if (cursor) {
                conditions.push(
                  sql`(${blueprintItems.createdAt}, ${blueprintItems.id}) < (${cursor.sort_value}, ${cursor.id})`,
                );
              }
            }

            const orderFn = filters.order === 'asc' ? asc : desc;
            const results = await db
              .select()
              .from(blueprintItems)
              .where(and(...conditions))
              .orderBy(orderFn(blueprintItems.createdAt), desc(blueprintItems.id))
              .limit(limit + 1); // Fetch one extra to detect has_more

            const hasMore = results.length > limit;
            const items = hasMore ? results.slice(0, limit) : results;
            const lastItem = items[items.length - 1];
            const nextCursor = hasMore && lastItem
              ? encodeCursor({
                  sort_value: lastItem.createdAt.toISOString(),
                  id: lastItem.id,
                })
              : null;

            return { items, nextCursor, hasMore };
          },
          catch: (error) => error as Error,
        }),

      create: (input) =>
        Effect.tryPromise({
          try: async () => {
            const [item] = await db
              .insert(blueprintItems)
              .values({
                id: input.id,
                tenantId: input.tenantId,
                title: input.title,
                description: input.description,
                status: input.status ?? 'pending',
                priority: input.priority ?? 'medium',
                parentId: input.parent_id,
                createdBy: input.createdBy,
                assignedTo: input.assigned_to,
                dueDate: input.due_date ? new Date(input.due_date) : undefined,
                metadata: input.metadata ?? {},
              })
              .returning();
            return item!;
          },
          catch: (error) => error as Error,
        }),

      update: (id, input) =>
        Effect.tryPromise({
          try: async () => {
            const values: Record<string, unknown> = {};
            if (input.title !== undefined) values.title = input.title;
            if (input.description !== undefined) values.description = input.description;
            if (input.status !== undefined) values.status = input.status;
            if (input.priority !== undefined) values.priority = input.priority;
            if (input.assigned_to !== undefined) values.assignedTo = input.assigned_to;
            if (input.due_date !== undefined)
              values.dueDate = input.due_date ? new Date(input.due_date) : null;
            if (input.metadata !== undefined) values.metadata = input.metadata;

            const [updated] = await db
              .update(blueprintItems)
              .set(values)
              .where(and(eq(blueprintItems.id, id), isNull(blueprintItems.deletedAt)))
              .returning();
            return updated ?? null;
          },
          catch: (error) => error as Error,
        }),

      softDelete: (id) =>
        Effect.tryPromise({
          try: async () => {
            const [deleted] = await db
              .update(blueprintItems)
              .set({ deletedAt: new Date() })
              .where(and(eq(blueprintItems.id, id), isNull(blueprintItems.deletedAt)))
              .returning();
            return deleted ?? null;
          },
          catch: (error) => error as Error,
        }),

      listSubItems: (parentId) =>
        Effect.tryPromise({
          try: async () =>
            db
              .select()
              .from(blueprintItems)
              .where(
                and(eq(blueprintItems.parentId, parentId), isNull(blueprintItems.deletedAt)),
              ),
          catch: (error) => error as Error,
        }),
    };
  }),
);
```

---

#### E3. Create BlueprintEventPublisher

**Files:**
- Create: `apps/api/src/domains/blueprint/event-publisher.ts`

**Code — `apps/api/src/domains/blueprint/event-publisher.ts`:**
```typescript
import { Context, Effect } from 'effect';
import { createId } from '@ctrlpane/shared';
import { DatabaseClient } from '../../infra/db.js';
import { outboxEvents } from '../../db/schema/outbox.js';

export interface BlueprintEventPublisherShape {
  readonly publish: (event: {
    eventType: string;
    aggregateType: string;
    aggregateId: string;
    tenantId: string;
    payload: unknown;
  }) => Effect.Effect<void>;
}

export class BlueprintEventPublisher extends Context.Tag('BlueprintEventPublisher')<
  BlueprintEventPublisher,
  BlueprintEventPublisherShape
>() {}

/** Writes event to the outbox table within the current transaction */
export const makeBlueprintEventPublisher = Effect.gen(function* () {
  const { db } = yield* DatabaseClient;

  return {
    publish: (event) =>
      Effect.tryPromise({
        try: () =>
          db.insert(outboxEvents).values({
            id: createId('obx_'),
            tenantId: event.tenantId,
            eventType: event.eventType,
            aggregateType: event.aggregateType,
            aggregateId: event.aggregateId,
            payload: event.payload,
          }),
        catch: (error) => error as Error,
      }).pipe(Effect.asVoid),
  };
});
```

---

#### E4. Create BlueprintItemService with status state machine

**Files:**
- Create: `apps/api/src/domains/blueprint/service.ts`
- Create: `apps/api/src/domains/blueprint/service-live.ts`
- Create: `apps/api/src/domains/blueprint/service.test.ts`

**Steps:**
- [ ] Write failing tests for status state machine (all valid + invalid transitions)
- [ ] Write failing tests for CRUD operations
- [ ] Define service Context.Tag interface
- [ ] Implement service with business logic, cache invalidation, event publishing
- [ ] Run tests to verify pass

**Code — `apps/api/src/domains/blueprint/service.ts`:**
```typescript
import { Context, Effect } from 'effect';
import type {
  CreateBlueprintItemInput,
  UpdateBlueprintItemInput,
  BlueprintItemFilters,
} from '@ctrlpane/shared';
import type { BlueprintItemRow, ItemDetail, PaginatedItems } from './repository.js';
import type {
  ItemNotFoundError,
  InvalidStatusTransitionError,
  ParentItemNotFoundError,
} from './errors.js';

export interface BlueprintItemServiceShape {
  readonly list: (
    filters: BlueprintItemFilters,
  ) => Effect.Effect<PaginatedItems>;
  readonly getById: (
    id: string,
  ) => Effect.Effect<ItemDetail, ItemNotFoundError>;
  readonly create: (
    input: CreateBlueprintItemInput,
  ) => Effect.Effect<BlueprintItemRow>;
  readonly update: (
    id: string,
    input: UpdateBlueprintItemInput,
  ) => Effect.Effect<BlueprintItemRow, ItemNotFoundError | InvalidStatusTransitionError>;
  readonly remove: (
    id: string,
  ) => Effect.Effect<BlueprintItemRow, ItemNotFoundError>;
  readonly assign: (
    id: string,
    assignedTo: string | null,
  ) => Effect.Effect<BlueprintItemRow, ItemNotFoundError>;
  readonly listSubItems: (
    parentId: string,
  ) => Effect.Effect<BlueprintItemRow[], ItemNotFoundError>;
  readonly createSubItem: (
    parentId: string,
    input: CreateBlueprintItemInput,
  ) => Effect.Effect<BlueprintItemRow, ParentItemNotFoundError>;
}

export class BlueprintItemService extends Context.Tag('BlueprintItemService')<
  BlueprintItemService,
  BlueprintItemServiceShape
>() {}
```

**Code — `apps/api/src/domains/blueprint/service-live.ts`:**
```typescript
import { Effect, Layer } from 'effect';
import { VALID_STATUS_TRANSITIONS, createId, type ItemStatus } from '@ctrlpane/shared';
import { BlueprintItemService } from './service.js';
import { BlueprintItemRepository } from './repository.js';
import { BlueprintEventPublisher } from './event-publisher.js';
import { TenantContext } from '../../shared/tenant-context.js';
import { RedisClient } from '../../infra/redis.js';
import {
  ItemNotFoundError,
  InvalidStatusTransitionError,
  ParentItemNotFoundError,
} from './errors.js';

export const BlueprintItemServiceLive = Layer.effect(
  BlueprintItemService,
  Effect.gen(function* () {
    const repo = yield* BlueprintItemRepository;
    const eventPublisher = yield* BlueprintEventPublisher;
    const tenant = yield* TenantContext;
    const { redis } = yield* RedisClient;

    const invalidateListCache = async () => {
      const keys = await redis.keys(`bp:${tenant.tenantId}:items:list:*`);
      if (keys.length > 0) await redis.del(...keys);
    };

    const invalidateItemCache = async (itemId: string) => {
      await redis.del(`bp:${tenant.tenantId}:item:${itemId}`);
      await invalidateListCache();
    };

    return {
      list: (filters) => repo.list(filters),

      getById: (id) =>
        Effect.gen(function* () {
          const detail = yield* repo.findDetailById(id);
          if (!detail) return yield* new ItemNotFoundError({ itemId: id });
          return detail;
        }),

      create: (input) =>
        Effect.gen(function* () {
          const itemId = createId('bpi_');
          const item = yield* repo.create({
            ...input,
            id: itemId,
            tenantId: tenant.tenantId,
            createdBy: tenant.apiKeyId,
          });

          yield* eventPublisher.publish({
            eventType: 'blueprint.item.created',
            aggregateType: 'blueprint_item',
            aggregateId: itemId,
            tenantId: tenant.tenantId,
            payload: item,
          });

          yield* Effect.promise(() => invalidateListCache());

          return item;
        }),

      update: (id, input) =>
        Effect.gen(function* () {
          // Validate status transition if status is changing
          if (input.status) {
            const existing = yield* repo.findById(id);
            if (!existing) return yield* new ItemNotFoundError({ itemId: id });

            const validTransitions = VALID_STATUS_TRANSITIONS[existing.status as ItemStatus];
            if (!validTransitions?.includes(input.status as ItemStatus)) {
              return yield* new InvalidStatusTransitionError({
                itemId: id,
                from: existing.status,
                to: input.status,
              });
            }

            // Auto-set completedAt when transitioning to done
            if (input.status === 'done') {
              (input as Record<string, unknown>).completed_at = new Date().toISOString();
            }
          }

          const updated = yield* repo.update(id, input);
          if (!updated) return yield* new ItemNotFoundError({ itemId: id });

          yield* eventPublisher.publish({
            eventType: input.status
              ? input.status === 'done'
                ? 'blueprint.item.completed'
                : 'blueprint.item.updated'
              : 'blueprint.item.updated',
            aggregateType: 'blueprint_item',
            aggregateId: id,
            tenantId: tenant.tenantId,
            payload: updated,
          });

          yield* Effect.promise(() => invalidateItemCache(id));

          return updated;
        }),

      remove: (id) =>
        Effect.gen(function* () {
          const deleted = yield* repo.softDelete(id);
          if (!deleted) return yield* new ItemNotFoundError({ itemId: id });

          yield* eventPublisher.publish({
            eventType: 'blueprint.item.deleted',
            aggregateType: 'blueprint_item',
            aggregateId: id,
            tenantId: tenant.tenantId,
            payload: { id },
          });

          yield* Effect.promise(() => invalidateItemCache(id));

          return deleted;
        }),

      assign: (id, assignedTo) =>
        Effect.gen(function* () {
          const existing = yield* repo.findById(id);
          if (!existing) return yield* new ItemNotFoundError({ itemId: id });

          const updated = yield* repo.update(id, { assigned_to: assignedTo });
          if (!updated) return yield* new ItemNotFoundError({ itemId: id });

          yield* eventPublisher.publish({
            eventType: 'blueprint.item.assigned',
            aggregateType: 'blueprint_item',
            aggregateId: id,
            tenantId: tenant.tenantId,
            payload: {
              id,
              old_assignee: existing.assignedTo,
              new_assignee: assignedTo,
            },
          });

          yield* Effect.promise(() => invalidateItemCache(id));

          return updated;
        }),

      listSubItems: (parentId) =>
        Effect.gen(function* () {
          const parent = yield* repo.findById(parentId);
          if (!parent) return yield* new ItemNotFoundError({ itemId: parentId });
          return yield* repo.listSubItems(parentId);
        }),

      createSubItem: (parentId, input) =>
        Effect.gen(function* () {
          const parent = yield* repo.findById(parentId);
          if (!parent) return yield* new ParentItemNotFoundError({ parentId });

          const itemId = createId('bpi_');
          const item = yield* repo.create({
            ...input,
            parent_id: parentId,
            id: itemId,
            tenantId: tenant.tenantId,
            createdBy: tenant.apiKeyId,
          });

          yield* eventPublisher.publish({
            eventType: 'blueprint.item.created',
            aggregateType: 'blueprint_item',
            aggregateId: itemId,
            tenantId: tenant.tenantId,
            payload: item,
          });

          return item;
        }),
    };
  }),
);
```

**Code — `apps/api/src/domains/blueprint/service.test.ts` (status state machine tests):**
```typescript
import { describe, expect, it } from 'bun:test';
import { VALID_STATUS_TRANSITIONS, type ItemStatus } from '@ctrlpane/shared';

describe('Status State Machine [unit]', () => {
  it('allows pending -> in_progress', () => {
    expect(VALID_STATUS_TRANSITIONS.pending).toContain('in_progress');
  });

  it('allows in_progress -> done', () => {
    expect(VALID_STATUS_TRANSITIONS.in_progress).toContain('done');
  });

  it('allows in_progress -> pending (reassign)', () => {
    expect(VALID_STATUS_TRANSITIONS.in_progress).toContain('pending');
  });

  it('allows done -> in_progress (reopen)', () => {
    expect(VALID_STATUS_TRANSITIONS.done).toContain('in_progress');
  });

  it('rejects pending -> done (must go through in_progress)', () => {
    expect(VALID_STATUS_TRANSITIONS.pending).not.toContain('done');
  });

  it('rejects done -> pending (must reopen first)', () => {
    expect(VALID_STATUS_TRANSITIONS.done).not.toContain('pending');
  });

  it('covers all statuses in transition map', () => {
    const allStatuses: ItemStatus[] = ['pending', 'in_progress', 'done'];
    for (const status of allStatuses) {
      expect(VALID_STATUS_TRANSITIONS).toHaveProperty(status);
    }
  });
});
```

---

#### E5. Create Hono routes for all 22 endpoints

**Files:**
- Create: `apps/api/src/domains/blueprint/routes.ts`

**Steps:**
- [ ] Write routes for all endpoints from spec Section 5
- [ ] Use zValidator with shared Zod schemas
- [ ] Use runEffect for Effect program execution
- [ ] Wire routes into main app

**Code — `apps/api/src/domains/blueprint/routes.ts`:**
```typescript
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { Effect } from 'effect';
import {
  createBlueprintItemSchema,
  updateBlueprintItemSchema,
  blueprintItemFiltersSchema,
  createBlueprintTagSchema,
  addTagToItemSchema,
  createBlueprintCommentSchema,
} from '@ctrlpane/shared';
import { BlueprintItemService } from './service.js';
import { runEffect } from '../../shared/run-effect.js';

export const blueprintRoutes = new Hono()
  // Items
  .get('/items', zValidator('query', blueprintItemFiltersSchema), (c) =>
    runEffect(
      c,
      Effect.gen(function* () {
        const svc = yield* BlueprintItemService;
        const filters = c.req.valid('query');
        const result = yield* svc.list(filters);
        return {
          data: result.items,
          pagination: {
            next_cursor: result.nextCursor,
            prev_cursor: null,
            has_more: result.hasMore,
            limit: filters.limit ?? 25,
          },
        };
      }),
    ),
  )
  .post('/items', zValidator('json', createBlueprintItemSchema), (c) =>
    runEffect(
      c,
      Effect.gen(function* () {
        const svc = yield* BlueprintItemService;
        const input = c.req.valid('json');
        const item = yield* svc.create(input);
        return { data: item };
      }),
    ),
  )
  .get('/items/:id', (c) =>
    runEffect(
      c,
      Effect.gen(function* () {
        const svc = yield* BlueprintItemService;
        const detail = yield* svc.getById(c.req.param('id'));
        return { data: detail };
      }),
    ),
  )
  .patch('/items/:id', zValidator('json', updateBlueprintItemSchema), (c) =>
    runEffect(
      c,
      Effect.gen(function* () {
        const svc = yield* BlueprintItemService;
        const updated = yield* svc.update(c.req.param('id'), c.req.valid('json'));
        return { data: updated };
      }),
    ),
  )
  .delete('/items/:id', (c) =>
    runEffect(
      c,
      Effect.gen(function* () {
        const svc = yield* BlueprintItemService;
        const deleted = yield* svc.remove(c.req.param('id'));
        return { data: deleted };
      }),
    ),
  )
  .post('/items/:id/assign', (c) =>
    runEffect(
      c,
      Effect.gen(function* () {
        const svc = yield* BlueprintItemService;
        const body = await c.req.json<{ assigned_to: string | null }>();
        const updated = yield* svc.assign(c.req.param('id'), body.assigned_to);
        return { data: updated };
      }),
    ),
  )
  // Sub-items
  .get('/items/:id/sub-items', (c) =>
    runEffect(
      c,
      Effect.gen(function* () {
        const svc = yield* BlueprintItemService;
        const subItems = yield* svc.listSubItems(c.req.param('id'));
        return { data: subItems };
      }),
    ),
  )
  .post('/items/:id/sub-items', zValidator('json', createBlueprintItemSchema), (c) =>
    runEffect(
      c,
      Effect.gen(function* () {
        const svc = yield* BlueprintItemService;
        const subItem = yield* svc.createSubItem(c.req.param('id'), c.req.valid('json'));
        return { data: subItem };
      }),
    ),
  );
  // Tags, Comments, Activity, and Auth routes follow the same pattern
  // (see remaining route definitions below)
```

> **Note to implementing agent:** The routes file above shows the pattern for items. The implementing agent must add the remaining routes for tags (GET /tags, POST /tags, DELETE /tags/:id, POST /items/:id/tags, DELETE /items/:id/tags/:tagId), comments (GET /items/:id/comments, POST /items/:id/comments, DELETE /comments/:id), activity (GET /items/:id/activity), and auth keys (POST /auth/keys, GET /auth/keys, DELETE /auth/keys/:id). Each follows the identical pattern: zValidator for input, runEffect wrapping an Effect.gen that yields the appropriate service and calls its method.

---

#### E6. Create outbox poller

**Files:**
- Create: `apps/api/src/infra/outbox-poller.ts`

**Steps:**
- [ ] Write poller that reads pending outbox events
- [ ] Publishes to NATS JetStream
- [ ] Marks as published or increments attempts on failure
- [ ] Marks as dead_letter after 10 attempts

**Code — `apps/api/src/infra/outbox-poller.ts`:**
```typescript
import { Effect } from 'effect';
import { DatabaseClient } from './db.js';
import { NatsClient } from './nats.js';
import { outboxEvents } from '../db/schema/outbox.js';
import { eq, and, sql, asc, lte } from 'drizzle-orm';
import { StringCodec } from 'nats';

const sc = StringCodec();
const MAX_ATTEMPTS = 10;
const POLL_INTERVAL_MS = 1_000;
const BATCH_SIZE = 100;

export const startOutboxPoller = Effect.gen(function* () {
  const { db } = yield* DatabaseClient;
  const { js } = yield* NatsClient;

  const poll = async () => {
    // SELECT ... WHERE status = 'pending' ORDER BY created_at LIMIT 100 FOR UPDATE SKIP LOCKED
    const pendingEvents = await db
      .select()
      .from(outboxEvents)
      .where(eq(outboxEvents.status, 'pending'))
      .orderBy(asc(outboxEvents.createdAt))
      .limit(BATCH_SIZE);

    for (const event of pendingEvents) {
      try {
        // Publish to NATS JetStream
        await js.publish(
          event.eventType,
          sc.encode(JSON.stringify({
            specversion: '1.0',
            id: event.id,
            source: 'ctrlpane.blueprint',
            type: `ctrlpane.${event.eventType}.v1`,
            tenantid: event.tenantId,
            traceid: event.traceId,
            data: event.payload,
          })),
        );

        // Mark as published
        await db
          .update(outboxEvents)
          .set({ status: 'published', publishedAt: new Date() })
          .where(eq(outboxEvents.id, event.id));
      } catch (error) {
        const newAttempts = event.attempts + 1;
        const newStatus = newAttempts >= MAX_ATTEMPTS ? 'dead_letter' : 'pending';

        await db
          .update(outboxEvents)
          .set({ attempts: newAttempts, status: newStatus })
          .where(eq(outboxEvents.id, event.id));
      }
    }
  };

  // Start polling loop
  const interval = setInterval(poll, POLL_INTERVAL_MS);

  yield* Effect.addFinalizer(() =>
    Effect.sync(() => clearInterval(interval)),
  );
});
```

---

#### E7. Create Centrifugo publisher (NATS consumer)

**Files:**
- Create: `apps/api/src/infra/centrifugo-publisher.ts`

**Code — `apps/api/src/infra/centrifugo-publisher.ts`:**
```typescript
import { Effect } from 'effect';
import { NatsClient } from './nats.js';
import { CentrifugoClient } from './centrifugo.js';
import { StringCodec, type JetStreamSubscription } from 'nats';

const sc = StringCodec();

export const startCentrifugoPublisher = Effect.gen(function* () {
  const { js } = yield* NatsClient;
  const centrifugo = yield* CentrifugoClient;

  // Subscribe to all blueprint events
  const sub = await js.subscribe('blueprint.>', {
    durable: 'centrifugo-publisher',
  });

  const processMessages = async () => {
    for await (const msg of sub) {
      try {
        const event = JSON.parse(sc.decode(msg.data));
        const tenantId = event.tenantid;
        const eventType = event.type;

        // Publish to tenant-level channel
        await Effect.runPromise(
          centrifugo.publish(`blueprint:items#${tenantId}`, {
            type: eventType,
            data: event.data,
            item_id: event.data?.id,
          }),
        );

        // Publish to item-level channel if applicable
        if (event.data?.id) {
          await Effect.runPromise(
            centrifugo.publish(`blueprint:item#${event.data.id}`, {
              type: eventType,
              data: event.data,
            }),
          );
        }

        msg.ack();
      } catch (error) {
        // Redeliver on failure
        msg.nak();
      }
    }
  };

  // Start processing in background
  processMessages();

  yield* Effect.addFinalizer(() =>
    Effect.promise(() => sub.drain()),
  );
});
```

---

#### E8. Create Effect layer composition for blueprint domain

**Files:**
- Create: `apps/api/src/domains/blueprint/layer.ts`

**Code — `apps/api/src/domains/blueprint/layer.ts`:**
```typescript
import { Layer } from 'effect';
import { BlueprintItemServiceLive } from './service-live.js';
import { BlueprintItemRepositoryLive } from './repository-live.js';
import { BlueprintEventPublisher, makeBlueprintEventPublisher } from './event-publisher.js';
import { DatabaseClient } from '../../infra/db.js';
import { RedisClient } from '../../infra/redis.js';
import { TenantContext } from '../../shared/tenant-context.js';

/**
 * Complete blueprint domain layer.
 * Requires: DatabaseClient, RedisClient, TenantContext (provided per-request)
 */
export const BlueprintLive = Layer.mergeAll(
  BlueprintItemServiceLive,
  BlueprintItemRepositoryLive,
  Layer.effect(BlueprintEventPublisher, makeBlueprintEventPublisher),
);
```

---

#### E9. Integration tests for all endpoints

**Files:**
- Create: `apps/api/src/domains/blueprint/routes.test.ts`

**Steps:**
- [ ] Write integration tests for all 22 endpoints (happy path + error cases)
- [ ] Test cursor pagination (forward, empty, boundary)
- [ ] Test multi-table retrieval (item with sub-items + tags + comments)
- [ ] Test outbox event publishing
- [ ] Test cache invalidation

> **Note to implementing agent:** Each test should:
> 1. Spin up testcontainers (Postgres, Redis)
> 2. Run migrations
> 3. Create a test tenant and API key
> 4. Execute the API request
> 5. Verify response shape and status code
> 6. Verify side effects (outbox events, cache state)

---

#### E10. Final commit

**Steps:**
- [ ] Run full test suite: `bun run --cwd apps/api test`
- [ ] Run typecheck: `bun run --cwd apps/api typecheck`
- [ ] Commit: `feat(blueprint): add complete blueprint API domain`

---

### Team F — MCP Server

**Scope:** In-process MCP server with 9 blueprint tools.
**Branch:** `feat/mcp/blueprint-tools`
**Dependency:** Team E (Blueprint API Domain) must be complete.

---

#### F1. Create MCP server setup

**Files:**
- Create: `apps/api/src/mcp/server.ts`

**Steps:**
- [ ] Set up in-process MCP server registration
- [ ] Register all 9 tools from spec Section 10

**Code — `apps/api/src/mcp/server.ts`:**
```typescript
import { Effect } from 'effect';
import { BlueprintItemService } from '../domains/blueprint/service.js';
import type { BlueprintItemServiceShape } from '../domains/blueprint/service.js';

export interface McpTool {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Record<string, unknown>;
  readonly handler: (params: Record<string, unknown>) => Effect.Effect<unknown>;
}

export const createBlueprintMcpTools = (svc: BlueprintItemServiceShape): McpTool[] => [
  {
    name: 'blueprint_list_items',
    description: 'List blueprint items with optional filters and cursor pagination',
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['pending', 'in_progress', 'done'] },
        priority: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
        search: { type: 'string' },
        assigned_to: { type: 'string' },
        cursor: { type: 'string' },
        limit: { type: 'number', minimum: 1, maximum: 100 },
      },
    },
    handler: (params) => svc.list(params),
  },
  {
    name: 'blueprint_get_item',
    description: 'Get a blueprint item by ID with sub-items, tags, and comments',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
    },
    handler: (params) => svc.getById(params.id as string),
  },
  {
    name: 'blueprint_create_item',
    description: 'Create a new blueprint item',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        description: { type: 'string' },
        priority: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
        status: { type: 'string', enum: ['pending', 'in_progress', 'done'] },
        assigned_to: { type: 'string' },
        parent_id: { type: 'string' },
        tag_ids: { type: 'array', items: { type: 'string' } },
      },
      required: ['title'],
    },
    handler: (params) => svc.create(params as Parameters<typeof svc.create>[0]),
  },
  {
    name: 'blueprint_update_item',
    description: 'Update an existing blueprint item (partial update)',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        fields: { type: 'object' },
      },
      required: ['id', 'fields'],
    },
    handler: (params) =>
      svc.update(params.id as string, params.fields as Parameters<typeof svc.update>[1]),
  },
  {
    name: 'blueprint_delete_item',
    description: 'Soft delete a blueprint item (sets deleted_at)',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
    },
    handler: (params) => svc.remove(params.id as string),
  },
  {
    name: 'blueprint_change_status',
    description: 'Transition item status with validation (pending->in_progress->done)',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        new_status: { type: 'string', enum: ['pending', 'in_progress', 'done'] },
      },
      required: ['id', 'new_status'],
    },
    handler: (params) =>
      svc.update(params.id as string, { status: params.new_status as string }),
  },
  {
    name: 'blueprint_add_comment',
    description: 'Add a comment to a blueprint item',
    inputSchema: {
      type: 'object',
      properties: {
        item_id: { type: 'string' },
        content: { type: 'string' },
      },
      required: ['item_id', 'content'],
    },
    // Comment creation goes through a separate service method (see below)
    handler: (params) => Effect.succeed({ item_id: params.item_id, content: params.content }),
  },
  {
    name: 'blueprint_search_items',
    description: 'Full-text search across blueprint items with optional filters',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        status: { type: 'string', enum: ['pending', 'in_progress', 'done'] },
        priority: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
      },
      required: ['query'],
    },
    handler: (params) =>
      svc.list({ search: params.query as string, ...(params as Record<string, unknown>) }),
  },
  {
    name: 'blueprint_list_tags',
    description: 'List all tags for the current tenant',
    inputSchema: { type: 'object', properties: {} },
    // Tag listing goes through a separate tag service (see below)
    handler: () => Effect.succeed({ tags: [] }),
  },
];
```

---

#### F2. Integration tests for MCP tools

**Files:**
- Create: `apps/api/src/mcp/server.test.ts`

**Steps:**
- [ ] Write integration tests: each MCP tool invocation returns expected shape
- [ ] Test error handling (invalid ID returns error, not crash)
- [ ] Commit: `feat(mcp): add MCP server with blueprint tools`

---

### Team G Phase 2 — Frontend API Integration

**Scope:** All frontend views with live API integration.
**Branch:** `feat/web/blueprint-views`
**Dependency:** Team E (Blueprint API) must be complete for full integration.

---

#### G7. Dashboard view

**Files:**
- Create: `apps/web/src/routes/index.tsx` (replace stub)

**Steps:**
- [ ] Fetch item counts by status using TanStack Query
- [ ] Display recent activity feed
- [ ] Show summary cards

---

#### G8. Items list view

**Files:**
- Modify: `apps/web/src/routes/items/index.tsx`

**Steps:**
- [ ] Implement data table with search, filter by status/priority
- [ ] Inline status edit with optimistic updates
- [ ] Cursor pagination with "Load more" button
- [ ] Real-time updates via WebSocket invalidation

**Code pattern — TanStack Query hook:**
```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import type { PaginatedResponse } from '@ctrlpane/shared';
import type { BlueprintItemRow } from './types';

export const useItems = (filters: Record<string, string>) =>
  useQuery({
    queryKey: ['blueprint', 'items', filters],
    queryFn: () => api.get<PaginatedResponse<BlueprintItemRow>>(`/items?${new URLSearchParams(filters)}`),
  });

export const useUpdateItemStatus = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.patch(`/items/${id}`, { status }),
    onMutate: async ({ id, status }) => {
      // Optimistic update
      await queryClient.cancelQueries({ queryKey: ['blueprint', 'items'] });
      queryClient.setQueriesData(
        { queryKey: ['blueprint', 'items'] },
        (old: PaginatedResponse<BlueprintItemRow> | undefined) => {
          if (!old) return old;
          return {
            ...old,
            data: old.data.map((item) =>
              item.id === id ? { ...item, status } : item,
            ),
          };
        },
      );
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['blueprint', 'items'] });
    },
  });
};
```

---

#### G9. Item detail view

**Files:**
- Modify: `apps/web/src/routes/items/$id.tsx`

**Steps:**
- [ ] Display item details with sub-items, tags, comments in tabs
- [ ] Real-time comment updates via WebSocket
- [ ] Optimistic comment addition

---

#### G10. Tag manager view

**Files:**
- Modify: `apps/web/src/routes/tags/index.tsx`

**Steps:**
- [ ] CRUD for tags with color picker
- [ ] Associate/dissociate tags from items

---

#### G11. Settings view (API key management)

**Files:**
- Modify: `apps/web/src/routes/settings/index.tsx`

**Steps:**
- [ ] Create API key with name + permissions
- [ ] List keys (showing prefix + name + last used)
- [ ] Revoke keys

---

#### G12. Final commit

**Steps:**
- [ ] Run typecheck: `bun run --cwd apps/web typecheck`
- [ ] Verify all routes render in browser
- [ ] Commit: `feat(web): add complete blueprint frontend`

---

### Team H Phase 2 — Full Test Suite

**Scope:** Full integration tests, schema snapshots, coverage verification.
**Branch:** `feat/testing/full-test-suite`
**Dependency:** Team E + Team G must be substantially complete.

---

#### H6. Drizzle schema snapshot tests

**Files:**
- Create: `apps/api/src/db/schema-snapshot.test.ts`

**Steps:**
- [ ] Write snapshot test that captures current schema state
- [ ] Verify migration produces expected tables and columns

---

#### H7. Run full integration test suite

**Steps:**
- [ ] Run `bun run test` across all workspaces
- [ ] Fix any failures
- [ ] Verify all 22 API endpoints have test coverage

---

#### H8. Verify coverage

**Steps:**
- [ ] Run `bun run test --coverage`
- [ ] Verify service layer meets 90% coverage target
- [ ] Fix gaps if any

---

#### H9. Final commit

**Steps:**
- [ ] Commit: `test: add architecture tests, snapshots, and coverage verification`

---

## Wave 5: Integration

### Integration Agent

**Scope:** Wire all teams together, run full validation, deploy to Kali.
**Branch:** `feat/blueprint/integration`
**Dependency:** All teams (A through I, including F, G, H) must be complete.

---

#### INT1. Merge all team worktrees

**Steps:**
- [ ] Merge Team A branch into integration branch
- [ ] Merge Team B branch
- [ ] Merge Team C branch
- [ ] Merge Team D branch
- [ ] Merge Team E branch
- [ ] Merge Team F branch
- [ ] Merge Team G branch
- [ ] Merge Team H branch
- [ ] Merge Team I branch
- [ ] Resolve any merge conflicts (most likely: `apps/api/src/index.ts` route mounting, `package.json` dependency versions)

---

#### INT2. Wire blueprint routes into main app

**Files:**
- Modify: `apps/api/src/index.ts`

**Steps:**
- [ ] Import and mount `blueprintRoutes` under `/api/v1/blueprint`
- [ ] Add auth middleware to `/api/v1/*` routes
- [ ] Verify health routes remain outside auth

**Code — updated `apps/api/src/index.ts`:**
```typescript
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { healthRoutes } from './routes/health.js';
import { blueprintRoutes } from './domains/blueprint/routes.js';
import { requestIdMiddleware } from './middleware/request-id.js';
import { errorHandlerMiddleware } from './middleware/error-handler.js';
import { authMiddleware } from './middleware/auth.js';

const app = new Hono();

// Global middleware
app.use('*', requestIdMiddleware);
app.use('*', errorHandlerMiddleware);
app.use(
  '/api/*',
  cors({
    origin: ['http://localhost:33000', 'https://ctrlpane.com'],
    allowHeaders: ['Content-Type', 'X-API-Key', 'Idempotency-Key'],
    allowMethods: ['GET', 'POST', 'PATCH', 'DELETE'],
  }),
);

// Health routes (no auth)
app.route('/', healthRoutes);

// Authenticated API routes
app.use('/api/v1/*', authMiddleware);
app.route('/api/v1/blueprint', blueprintRoutes);

const port = Number(process.env.API_PORT ?? 33001);
const hostname = process.env.API_HOST ?? '127.0.0.1';

console.log(`ctrlpane API starting on ${hostname}:${port}`);

export default {
  port,
  hostname,
  fetch: app.fetch,
};
```

---

#### INT3. Run full validation suite

**Steps:**
- [ ] Run full build: `bun run build`
- [ ] Run full test suite: `bun run test`
- [ ] Run architecture tests: `bun run test:arch`
- [ ] Run lint: `bun run lint`
- [ ] Run typecheck: `bun run typecheck`
- [ ] Fix any failures

---

#### INT4. Start all services locally

**Steps:**
- [ ] Copy `.env.example` to `.env` and fill values
- [ ] Run `bun run dev` (process-compose up)
- [ ] Verify health: `curl http://localhost:33001/health/ready`
- [ ] Verify web: `curl http://localhost:33000/`

---

#### INT5. End-to-end smoke test

**Steps:**
- [ ] Create API key via seed or POST /api/v1/blueprint/auth/keys
- [ ] Create an item: `curl -X POST -H "X-API-Key: <key>" http://localhost:33001/api/v1/blueprint/items -d '{"title":"Smoke test"}'`
- [ ] Verify item appears in list: `curl -H "X-API-Key: <key>" http://localhost:33001/api/v1/blueprint/items`
- [ ] Update status: `curl -X PATCH -H "X-API-Key: <key>" http://localhost:33001/api/v1/blueprint/items/<id> -d '{"status":"in_progress"}'`
- [ ] Verify outbox event was created (query outbox_events table)
- [ ] Verify NATS received the event (check NATS management: http://localhost:38222)
- [ ] Open web frontend at http://localhost:33000 and verify items display
- [ ] Verify WebSocket updates arrive when mutating via API
- [ ] Add a comment and verify it appears in item detail
- [ ] Create and assign a tag
- [ ] Delete an item (soft delete) and verify it disappears from list

---

#### INT6. Verify MCP tools

**Steps:**
- [ ] Test each MCP tool via direct invocation or MCP client
- [ ] Verify `blueprint_list_items` returns items
- [ ] Verify `blueprint_create_item` creates an item
- [ ] Verify `blueprint_change_status` validates transitions
- [ ] Verify `blueprint_search_items` finds items by title

---

#### INT7. Deploy to Kali

**Steps:**
- [ ] SSH to Kali
- [ ] Run `homelab/bootstrap.sh` (first-time setup)
- [ ] Copy `.env` to `/opt/ctrlpane/.env`
- [ ] Start infrastructure: `docker compose -f homelab/docker-compose.prod.yml up -d`
- [ ] Build: `bun run build`
- [ ] Run migrations: `bun run --cwd apps/api db:migrate`
- [ ] Run seed: `bun run --cwd apps/api db:seed`
- [ ] Deploy API:
  ```bash
  mkdir -p /opt/ctrlpane/api/releases/v0.1.0
  cp -r apps/api/dist/* /opt/ctrlpane/api/releases/v0.1.0/
  ln -sfn releases/v0.1.0 /opt/ctrlpane/api/current
  sudo systemctl start ctrlpane-api
  ```
- [ ] Deploy Web:
  ```bash
  mkdir -p /opt/ctrlpane/web/releases/v0.1.0
  cp -r apps/web/dist/* /opt/ctrlpane/web/releases/v0.1.0/
  ln -sfn releases/v0.1.0 /opt/ctrlpane/web/current
  sudo systemctl start ctrlpane-web
  ```
- [ ] Verify health: `curl http://localhost:33001/health/ready`
- [ ] Verify external: `curl https://api.ctrlpane.com/health/ready`

---

#### INT8. Final commit

**Steps:**
- [ ] Commit: `feat: complete blueprint vertical slice integration`
- [ ] Create PR to main
- [ ] Verify CI passes

---

## Appendix: File Index

Complete list of files created by this plan, organized by team:

### Team A (Monorepo Scaffold)
```
package.json
.gitignore
.editorconfig
.env.example
turbo.json
biome.json
lefthook.yml
commitlint.config.ts
docker-compose.yml
process-compose.yml
apps/api/package.json
apps/api/tsconfig.json
apps/api/src/index.ts
apps/web/package.json
apps/web/tsconfig.json
apps/web/vite.config.ts
apps/web/index.html
apps/web/src/main.tsx
packages/shared/package.json
packages/shared/tsconfig.json
packages/shared/src/index.ts
```

### Team B (Database)
```
apps/api/drizzle.config.ts
apps/api/src/infra/db.ts
apps/api/src/infra/db.test.ts
apps/api/src/db/schema/index.ts
apps/api/src/db/schema/tenants.ts
apps/api/src/db/schema/api-keys.ts
apps/api/src/db/schema/blueprint/items.ts
apps/api/src/db/schema/blueprint/tags.ts
apps/api/src/db/schema/blueprint/comments.ts
apps/api/src/db/schema/blueprint/activity.ts
apps/api/src/db/schema/outbox.ts
apps/api/src/db/migrations/0001_rls_policies.sql
apps/api/src/db/seed.ts
apps/api/src/db/rls.test.ts
```

### Team C (Shared)
```
packages/shared/src/index.ts
packages/shared/src/constants.ts
packages/shared/src/id.ts
packages/shared/src/id.test.ts
packages/shared/src/cursor.ts
packages/shared/src/cursor.test.ts
packages/shared/src/types/index.ts
packages/shared/src/types/enums.ts
packages/shared/src/types/pagination.ts
packages/shared/src/types/api.ts
packages/shared/src/schemas/index.ts
packages/shared/src/schemas/blueprint-item.ts
packages/shared/src/schemas/blueprint-item.test.ts
packages/shared/src/schemas/blueprint-tag.ts
packages/shared/src/schemas/blueprint-tag.test.ts
packages/shared/src/schemas/blueprint-comment.ts
packages/shared/src/schemas/blueprint-comment.test.ts
packages/shared/src/schemas/auth.ts
packages/shared/src/schemas/auth.test.ts
```

### Team D (API Foundation)
```
apps/api/src/index.ts
apps/api/src/routes/health.ts
apps/api/src/routes/health.test.ts
apps/api/src/middleware/request-id.ts
apps/api/src/middleware/request-id.test.ts
apps/api/src/middleware/error-handler.ts
apps/api/src/middleware/error-handler.test.ts
apps/api/src/middleware/auth.ts
apps/api/src/middleware/auth.test.ts
apps/api/src/shared/tenant-context.ts
apps/api/src/shared/run-effect.ts
apps/api/src/shared/layers.ts
apps/api/src/infra/redis.ts
apps/api/src/infra/nats.ts
apps/api/src/infra/centrifugo.ts
```

### Team E (Blueprint API)
```
apps/api/src/domains/blueprint/errors.ts
apps/api/src/domains/blueprint/errors.test.ts
apps/api/src/domains/blueprint/repository.ts
apps/api/src/domains/blueprint/repository-live.ts
apps/api/src/domains/blueprint/repository.test.ts
apps/api/src/domains/blueprint/service.ts
apps/api/src/domains/blueprint/service-live.ts
apps/api/src/domains/blueprint/service.test.ts
apps/api/src/domains/blueprint/event-publisher.ts
apps/api/src/domains/blueprint/routes.ts
apps/api/src/domains/blueprint/routes.test.ts
apps/api/src/domains/blueprint/layer.ts
apps/api/src/domains/blueprint/types.ts
apps/api/src/infra/outbox-poller.ts
apps/api/src/infra/centrifugo-publisher.ts
```

### Team F (MCP)
```
apps/api/src/mcp/server.ts
apps/api/src/mcp/server.test.ts
```

### Team G (Frontend)
```
apps/web/src/app.tsx
apps/web/src/routes/__root.tsx
apps/web/src/routes/index.tsx
apps/web/src/routes/items/index.tsx
apps/web/src/routes/items/$id.tsx
apps/web/src/routes/tags/index.tsx
apps/web/src/routes/settings/index.tsx
apps/web/src/lib/api-client.ts
apps/web/src/lib/api-client.test.ts
apps/web/src/lib/query-client.ts
apps/web/src/lib/ws-client.ts
apps/web/src/components/layout.tsx
```

### Team H (Testing)
```
apps/api/vitest.config.ts
apps/api/src/test-helpers/containers.ts
apps/api/src/db/schema-snapshot.test.ts
tests/architecture/hexagonal-boundaries.test.ts
tests/architecture/import-direction.test.ts
```

### Team I (CI/CD)
```
.github/workflows/ci.yml
.github/workflows/release.yml
.github/workflows/rollback.yml
.github/CODEOWNERS
.changeset/config.json
homelab/systemd/ctrlpane-api.service
homelab/systemd/ctrlpane-web.service
homelab/docker-compose.prod.yml
homelab/bootstrap.sh
homelab/rclone.conf.template
```

---

## Appendix: Dependency Version Matrix

Exact versions to use across all workspaces:

| Package | Version | Used by |
|---------|---------|---------|
| `typescript` | `^5.7.0` | all |
| `effect` | `^3.12.0` | api |
| `@effect/platform` | `^0.72.0` | api |
| `hono` | `^4.7.0` | api |
| `@hono/zod-validator` | `^0.4.0` | api |
| `drizzle-orm` | `^0.38.0` | api |
| `drizzle-kit` | `^0.30.0` | api (dev) |
| `postgres` | `^3.4.0` | api |
| `ioredis` | `^5.4.0` | api |
| `nats` | `^2.28.0` | api |
| `zod` | `^3.24.0` | shared, api, web |
| `ulid` | `^2.3.0` | shared, api |
| `react` | `^19.0.0` | web |
| `react-dom` | `^19.0.0` | web |
| `@tanstack/react-router` | `^1.95.0` | web |
| `@tanstack/react-query` | `^5.64.0` | web |
| `centrifuge` | `^5.2.0` | web |
| `vite` | `^6.1.0` | web (dev) |
| `@vitejs/plugin-react` | `^4.3.0` | web (dev) |
| `@biomejs/biome` | `^1.9.0` | root (dev) |
| `turbo` | `^2.3.0` | root (dev) |
| `lefthook` | `^1.6.0` | root (dev) |
| `@changesets/cli` | `^2.27.0` | root (dev) |
| `@commitlint/cli` | `^19.0.0` | root (dev) |
| `testcontainers` | `^10.16.0` | api (dev) |
| `ts-morph` | `^24.0.0` | tests (dev) |
