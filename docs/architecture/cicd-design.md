# CI/CD, Release Pipeline & Multi-Agent Workflow Design

> **Owner:** Anshul Bisen
> **Date:** 2026-03-12
> **Status:** Draft
> **Supersedes:** ADR-007 Decision 5 (extends scope to cover full release pipeline, multi-agent workflow, and mechanical enforcement). The deployment-architecture.md replaces the single-machine Mac Studio model with a two-machine topology.
>
> **Note on existing docs:** ADR-007's Decision 5 describes a single Mac Studio with launchd and manual `deploy.sh` script. This spec defines the v2 deployment model -- production moves to Kali with systemd, backups move to Google Drive via rclone, and CI/CD via GitHub Actions is added. ADR-007 Decisions 1-4 (retry policies, backpressure, bulkheads, SPOF register) remain valid and unchanged.

---

## 1. Problem Statement

ctrlpane runs as dev servers on a Mac Studio, exposed via Cloudflare Tunnel as "production." During active multi-agent development (3-5 concurrent Claude Code sessions), these servers are unstable -- frequent restarts, hot-reload failures, occasional crashes. The "production" URL is unreliable for daily use.

Additionally, there is no release pipeline -- no versioning, no changelogs, no rollback mechanism. AI agents push directly to `main` with no mechanical guardrails beyond pre-commit hooks. As a multi-tenant application from day one, ctrlpane needs production-grade reliability earlier than a single-user app would.

### What This Spec Solves

1. **Stable production** -- isolated from dev churn, accessible from anywhere via `ctrlpane.com`
2. **Automated releases** -- semantic versioning, changelogs, per-app deploys, one-click rollback
3. **AI-agent-first workflow** -- branching strategy, mechanical enforcement, cloud agent support
4. **Off-site backups** -- Google Drive as geographic redundancy for database and config
5. **External monitoring** -- alerting that works even when the home lab is down
6. **PR preview environments** -- feature branches get temporary deployments for manual validation before merge
7. **Self-hosted build caching** -- Turborepo remote cache on Kali, no Vercel dependency
8. **TDD & documentation discipline** -- mechanical guardrails for test coverage and test co-location

---

## 2. Hardware & Network Topology

ctrlpane uses a two-machine home lab topology: Mac Studio (dev + AI inference) and Kali Mini PC (production + CI/CD + backups). See [Deployment Architecture](./deployment-architecture.md) for the complete topology diagram, port convention, machine utilization, and coexistence with LifeOS.

**Key points for CI/CD context:**
- CI runs on Kali's self-hosted GitHub Actions runner
- Production deploys target Kali via systemd
- Dev servers on Mac Studio are never exposed externally
- Cloudflare tunnel on Kali serves `ctrlpane.com` and `api.ctrlpane.com`

---

## 3. Domain Routing

See [Deployment Architecture — Domain Routing](./deployment-architecture.md#5-domain-routing) for the complete routing table.

Preview environments add additional routes:

| Domain | Points to | Purpose |
|--------|-----------|---------|
| `preview-1.ctrlpane.com` | Kali :34000 | PR preview slot 1 |
| `preview-2.ctrlpane.com` | Kali :35000 | PR preview slot 2 |
| `preview-3.ctrlpane.com` | Kali :36000 | PR preview slot 3 |

---

## 4. Release Pipeline

### Toolchain

| Concern | Tool | Rationale |
|---------|------|-----------|
| Commit format | **Conventional Commits** (Lefthook + commitlint) | Industry standard, machine-readable, required by changesets |
| Versioning & changelog | **Changesets** (`@changesets/cli`) | Built for Turborepo monorepos. Per-app versioning. Used by Vercel, Shopify, Atlassian |
| Build orchestration | **Turborepo** (`--filter`) | Selective builds via `--filter=...[origin/main]` |
| CI/CD orchestration | **GitHub Actions** (self-hosted runner on Kali) | Standard, well-documented, supports `workflow_dispatch` |
| GitHub Releases | **Changesets GitHub Action** | Auto-creates releases when Version Packages PR merges |
| Process management | **systemd** (Kali Linux) | Native, reliable, auto-restart, logging |
| Backup sync | **rclone** (-> Google Drive) | Standard tool for cloud storage sync, supports encryption |
| External monitoring | **Cloudflare Health Checks** + GitHub Actions cron | Free, runs outside home lab power domain |
| Remote build cache | **ducktors/turborepo-remote-cache** (self-hosted on Kali) | Free, avoids Vercel paid tier, cache shared between CI and dev |
| Test coverage | **Vitest** coverage reports + custom CI check | Enforces coverage thresholds on changed files |
| Notifications | **Telegram Bot API** | Already integrated, supports topics for categorization |

### How Changesets Works in This Monorepo

1. Agent/developer finishes a feature on a branch
2. Creates a changeset file:
   ```
   bun changeset
   -> Which packages changed? [api, web]
   -> Bump type? [minor]
   -> Summary? "Add workspace invitation flow"
   -> Creates .changeset/cool-dogs-fly.md
   ```
3. Pushes branch, creates PR
4. CI validates (including changeset check)
5. PR merges to `main`
6. Changesets GitHub Action auto-creates/updates a "Version Packages" PR containing:
   - `apps/api/CHANGELOG.md` updated
   - `apps/api/package.json` version bumped
   - GitHub Release draft
7. When Version Packages PR merges -> tags created -> deploy workflow triggers

### Per-App Versioning

Each app in the monorepo has its own version and changelog:

| App | Example Version | Deployed independently |
|-----|----------------|----------------------|
| `apps/api` | v0.5.0 | Yes -- Bun server on Kali |
| `apps/web` | v0.3.1 | Yes -- static build on Kali |
| `packages/shared` | v0.2.0 | No -- internal dependency |

When only `apps/api` changes, only `apps/api` gets a version bump and deployment. `apps/web` stays at its current version.

### Filesystem Layout on Kali

```
/opt/ctrlpane/
+-- api/
|   +-- releases/
|   |   +-- v0.1.0/
|   |   +-- v0.2.0/
|   +-- current -> releases/v0.2.0
+-- web/
|   +-- releases/
|   |   +-- v0.1.0/
|   |   +-- v0.1.1/
|   +-- current -> releases/v0.1.1
+-- previews/
|   +-- slot-1/            # Preview env for feat/* PR (ephemeral)
|   +-- slot-2/
|   +-- slot-3/
+-- turbo-cache/            # Turborepo remote cache storage (LRU, 10GB max)
+-- backups/
|   +-- api@v0.2.0-pre-deploy.sql.gz
|   +-- api@v0.1.0-pre-deploy.sql.gz
+-- .env
```

---

## 5. Deploy Pipeline

```
Version Packages PR merged to main
         |
         v
GitHub Actions: release.yml (runs on Kali)
         |
         v
+--- Determine what changed ----------------------------+
| turbo run build --filter=...[HEAD~1]                   |
| -> HEAD~1 is correct because Version Packages          |
|    PR is squash-merged into a single commit             |
| -> Only builds apps with version bumps                  |
+--------------------------------------------------------+
         |
         v
+--- Per-app deploy (sequential) -----------------------+
|                                                        |
| api@v0.2.0:                                            |
|   1. pg_dump -> backups/api@v0.2.0-pre-deploy.sql.gz   |
|   2. rclone sync backup to Google Drive                 |
|   3. bun run db:migrate                                 |
|   4. Copy build to api/releases/v0.2.0/                 |
|   5. systemctl stop ctrlpane-api                        |
|   6. ln -sfn releases/v0.2.0 api/current                |
|   7. systemctl start ctrlpane-api                       |
|   8. Health check: curl /health + /health/ready         |
|                                                        |
| web@v0.1.1:                                            |
|   1. Copy static build to web/releases/v0.1.1/          |
|   2. systemctl stop ctrlpane-web                        |
|   3. ln -sfn releases/v0.1.1 web/current                |
|   4. systemctl start ctrlpane-web                       |
|   5. Health check                                       |
|                                                        |
+--------------------------------------------------------+
         |
         v
GitHub Releases created per app
Telegram: "Deployed: api@v0.2.0, web@v0.1.1"
```

**Downtime window:** 5-10 seconds per app (stop -> swap symlink -> start). Acceptable for a home-lab-hosted multi-tenant app at early stage.

### Rollback: GitHub Workflow Dispatch

A dedicated `rollback.yml` with dropdown inputs:

```
GitHub -> Actions -> "Rollback Production" -> Run workflow

Inputs:
  1. App:              [api | web]
  2. Version:          [dropdown: v0.2.0 (current), v0.1.0, ...]
  3. Restore database? [yes | no]
```

**What the rollback does:**
1. Verifies `{app}/releases/{version}` exists on Kali
2. If "restore database" = yes: `pg_restore` from `backups/{app}@{current_version}-pre-deploy.sql.gz`
3. `systemctl stop ctrlpane-{app}`
4. `ln -sfn releases/{version} {app}/current`
5. `systemctl start ctrlpane-{app}`
6. Health check
7. Updates GitHub Release status
8. Telegram: "Rolled back api to v0.1.0"

**Release retention:** Last 20 releases per app on disk. Older releases archived to Google Drive.

---

## 6. Branching Strategy

### Branch Protection: `main` is Deploy-Only

- No direct pushes -- ever (server-side enforced)
- Requires PR with all CI checks passing
- Requires at least 1 approval (human or auto-merge rules)
- Requires linear history (squash-merge -- collapses branch commits into one clean commit on main)
- Force pushes forbidden
- Branch deletion forbidden
- "Do not allow bypassing the above settings" enabled -- even admins cannot override

### Branch Naming Convention

| Type | Pattern | Example | When |
|------|---------|---------|------|
| **Feature** | `feat/<scope>/<short-desc>` | `feat/tasks/bulk-assign` | New functionality |
| **Bug fix** | `fix/<scope>/<short-desc>` | `fix/api/pagination-off-by-one` | Bug in existing code |
| **Hotfix** | `hotfix/<short-desc>` | `hotfix/health-check-timeout` | Production emergency |
| **Docs** | `docs/<short-desc>` | `docs/api-reference-update` | Documentation only |
| **Refactor** | `refactor/<scope>/<short-desc>` | `refactor/shared/effect-error-types` | Code improvement, no behavior change |
| **Chore** | `chore/<short-desc>` | `chore/upgrade-effect-3.15` | Dependencies, config, tooling |
| **Test** | `test/<scope>/<short-desc>` | `test/tasks/e2e-bulk-flow` | Test additions or fixes |
| **CI** | `ci/<short-desc>` | `ci/add-rollback-workflow` | Pipeline changes |

**Rules:**
- `<scope>` = app or package name: `api`, `web`, `shared`, `tasks`, `projects`, `goals`, `notes`, `auth`, `agents`
- `<short-desc>` = kebab-case, max 5 words
- No nested scopes: `feat/api/jwt-refresh` not `feat/api/auth/jwt-refresh`
- Enforced mechanically (see Section 10)

### Branch Lifecycle

| Event | Action |
|-------|--------|
| PR merged | Branch auto-deleted by GitHub |
| PR closed without merge | Branch auto-deleted after 7 days |
| Stale branch (30 days no commits) | Telegram alert, auto-deleted after 7 more days |
| Hotfix deployed | Branch deleted immediately after merge |

---

## 7. AI Agent Workflow

### Standard Flow (Branch -> PR -> Merge -> Deploy)

```
AI Agent (local Claude Code, cloud Claude, Codex, etc.)
         |
         +-- 1. git checkout -b feat/tasks/bulk-assign
         +-- 2. Implement feature + write tests
         +-- 3. bun changeset (create changeset file)
         +-- 4. git push -u origin feat/tasks/bulk-assign
         +-- 5. gh pr create --title "feat(tasks): add bulk assign"
                  |
                  v
         GitHub Actions CI (runs on Kali)
         +-- branch-name-check
         +-- commitlint
         +-- changeset-check
         +-- build  (using Turborepo remote cache)
         +-- lint
         +-- typecheck
         +-- test-unit
         +-- test-integration
         +-- test-coverage  (80% on changed files)
         +-- test-colocation  (no orphan source files)
         +-- no-secrets
         +-- preview-deploy (feat/* only -> preview-N.ctrlpane.com)
                  | All pass
                  v
         Merge Decision
         +-- feat/* with preview -> Telegram: preview ready for testing
         +-- Safe PR (no protected files) -> auto-merge after 5-min grace
         +-- Risky PR (protected files) -> requires human approval
                  |
                  v
         Changesets creates "Version Packages" PR
                  |
                  v
         Merge Version PR -> deploy to production
                  |
                  v
         Telegram: "api@v0.5.0 deployed to ctrlpane.com"
```

### Cloud Agent Workflow (No Dev Server Required)

When traveling or using cloud-based AI agents:

1. Cloud agent clones repo from GitHub
2. Creates branch, implements feature, writes tests, creates changeset
3. Pushes branch, creates PR
4. CI runs on Kali (builds, runs full test suite against real Postgres/Redis/NATS)
5. CI posts results to PR
6. You review on phone -> approve -> merge
7. Changesets PR auto-created -> merge -> deploy
8. Telegram: "api@v0.6.0 deployed"

**The agent never needs a dev server.** CI is the complete validation layer.

### Hotfix Fast Path

For production emergencies:

1. Create branch: `hotfix/fix-critical-crash`
2. Implement fix
3. Push + create PR with label `hotfix`
4. Agent creates a changeset in the same commit (required -- `changeset-check` cannot be bypassed)
5. CI runs abbreviated suite (unit tests only, for speed)
6. Human approves immediately
7. Merge -> Changesets creates Version Packages PR -> merge immediately -> deploy

### Parallel Agents

When multiple agents work on features simultaneously:

```
main -------------------------------------------------->
  |
  +-- feat/tasks/bulk-assign       (Agent 1)
  +-- feat/web/command-palette     (Agent 2)
  +-- fix/api/rate-limit-bypass    (Agent 3)
  +-- feat/notes/full-text-search  (Agent 4)
  +-- docs/deployment-runbook      (Agent 5)
```

- Each agent works in its own branch -- no conflicts during development
- First PR to merge wins
- Subsequent PRs get merge conflicts -> agent rebases and resolves (or flags for human review)
- Standard GitHub flow -- well-understood by all AI agents

### Auto-Merge Rules

PRs auto-merge (after 5-minute grace period) when ALL conditions are true:

1. All CI checks green
2. No `requires-human-review` label
3. No migration files changed
4. No CODEOWNERS-protected files changed
5. PR has changeset (if `apps/` files changed)

You are always notified via Telegram before auto-merge executes. Reply `STOP` to cancel.

---

## 8. GitHub Actions Workflows

### Workflow Inventory

| Workflow | Trigger | Runner | Purpose |
|----------|---------|--------|---------|
| `ci.yml` | Push to any branch, PR to main | Self-hosted (Kali) | Lint, typecheck, test, build |
| `release.yml` | Version Packages PR merged | Self-hosted (Kali) | Deploy to Kali production |
| `rollback.yml` | `workflow_dispatch` | Self-hosted (Kali) | Symlink swap + optional DB restore |
| `preview-deploy.yml` | PR opened/updated (feat/* only) | Self-hosted (Kali) | Deploy preview to preview-{1,2,3}.ctrlpane.com |
| `health-monitor.yml` | Cron (every 5 min) | `ubuntu-latest` (GitHub hosted -- must work when Kali is down) | Health check, Telegram alert |
| `backup-check.yml` | Cron (daily) | Self-hosted (Kali) | Verify backup freshness, Telegram report |
| `auto-merge.yml` | PR checks pass | Self-hosted (Kali) | Enable auto-merge on qualifying PRs |
| `stale-branches.yml` | Cron (daily) | Self-hosted (Kali) | Alert and clean up stale branches |
| `daily-digest.yml` | Cron (9:00 AM) | Self-hosted (Kali) | Daily summary to Telegram |

### CI Workflow (`ci.yml`) -- Job Details

Every PR runs these jobs. Jobs marked **Required** block merge on failure. Jobs marked **Informational** run but do not block merge.

| Job | Type | Purpose |
|-----|------|---------|
| `branch-name-check` | Required | Rejects PR if branch doesn't match naming convention |
| `commitlint` | Required | Validates ALL commits in PR (catches `--no-verify` bypasses) |
| `changeset-check` | Required | Requires changeset if `apps/` files changed |
| `no-secrets` | Required | `secretlint` on all changed files |
| `build` | Required | `turbo run build --filter=...[origin/main]` |
| `lint` | Required | `turbo run lint --filter=...[origin/main]` |
| `typecheck` | Required | `turbo run typecheck --filter=...[origin/main]` |
| `test-unit` | Required | `turbo run test:unit --filter=...[origin/main]` |
| `test-integration` | Required | `turbo run test:integration --filter=...[origin/main]` |
| `test-coverage` | Required | Vitest coverage on changed files -- minimum 80% line coverage |
| `test-colocation` | Required | Every new source file must have a corresponding `*.test.ts` |
| `protected-files` | Informational | Adds `requires-human-review` label if sensitive paths touched |
| `docs-check` | Informational | Adds `needs-docs` label if routes/endpoints added without doc updates |
| `preview-deploy` | Informational | Deploys preview environment for `feat/*` branches |

---

## 9. PR Preview Environments

### Overview

Feature branches (`feat/*`) get temporary deployments on Kali for manual validation before merge. Non-feature branches get CI artifacts (screenshots, coverage reports) posted directly to the PR.

### Architecture: Port-Offset Preview Slots

Kali has 64GB RAM. Production (ctrlpane + LifeOS combined) uses ~6-12GB. Up to 3 concurrent ctrlpane preview environments run alongside production.

```
ctrlpane Production:  ports 33000-33001  (web, API)
Preview slot 1:       ports 34000-34001  (web, API)
Preview slot 2:       ports 35000-35001  (web, API)
Preview slot 3:       ports 36000-36001  (web, API)
```

Each preview slot runs:
- Its own Bun web server + API server on dedicated ports
- Its own Postgres schema (`CREATE SCHEMA preview_{slot}_{pr_number}`) -- same Postgres instance
- Its own Redis key prefix (`preview_{slot}:*`) and NATS subject prefix (`preview_{slot}.>`)
- Migrations run independently per slot -- a preview migration cannot break production

### What's Shared vs Dedicated

| Resource | Shared with production? | Isolation mechanism |
|----------|------------------------|-------------------|
| **Postgres container** | Shared (same instance) | Schema isolation (`preview_{slot}_{pr}`) |
| **Redis container** | Shared (same instance) | Key prefix isolation |
| **NATS container** | Shared (same instance) | Subject prefix isolation |
| **Centrifugo** | Shared (same instance on :38000) | Channel namespace prefix (`preview_{slot}_{pr}/...`) |
| **Grafana/observability** | Shared | `env=preview-{N}` label |
| **Bun processes** | Dedicated per slot | Separate ports, separate systemd units |
| **Filesystem** | Dedicated per slot | `/opt/ctrlpane/previews/slot-{N}/` |
| **Cloudflare tunnel** | Shared (Kali tunnel) | Hostname-based ingress rules |

### Which Branches Get Previews

| Branch type | Preview? | Validation method |
|-------------|----------|-------------------|
| `feat/*` | **Yes** -- full preview deployment | Manual testing via `preview-{N}.ctrlpane.com` + automated tests |
| `fix/*` | No -- CI only | Test results posted to PR comment |
| `hotfix/*` | No -- CI only (fast path) | Unit tests only |
| `docs/*` | No -- CI only | Build validation |
| `refactor/*` | No -- CI only | Full test suite + coverage diff in PR comment |
| `chore/*` | No -- CI only | Build + lint + typecheck results |
| `test/*` | No -- CI only | Test results in PR comment |
| `ci/*` | No -- CI only | Workflow syntax validation |

### Preview Lifecycle

```
feat/* PR created
    |
    v
CI runs all checks
    | All pass
    v
preview-deploy job:
    +-- Check slot availability (1-3)
    +-- If slot free:
    |   +-- Create Postgres schema: preview_{slot}_{pr}
    |   +-- Run migrations against preview schema
    |   +-- Deploy build to /opt/ctrlpane/previews/slot-{N}/
    |   +-- Start Bun processes on slot ports
    |   +-- Configure Cloudflare tunnel ingress
    |   +-- Health check preview endpoints
    |   +-- Post PR comment:
    |       "Preview ready
    |        Web: https://preview-1.ctrlpane.com
    |        Slot: 1/3 | Expires: 24h"
    |
    +-- If no slot free:
        +-- Post PR comment:
            "Preview queued -- 3/3 slots in use.
             Will deploy when a slot frees up."
```

**Teardown (on PR close -- merge or abandon):**
1. Stop Bun processes for the slot
2. Drop Postgres schema `preview_{slot}_{pr}`
3. Flush Redis keys with prefix `preview_{slot}:`
4. Remove `/opt/ctrlpane/previews/slot-{N}/`
5. Remove Cloudflare tunnel ingress rules for the slot
6. Post PR comment: "Preview torn down. Slot freed."

**Auto-expiry:** Previews with no new commits for 24 hours are automatically torn down and the slot is freed. Telegram notification sent.

### Resource Limits

- **Max concurrent previews:** 3 (configurable)
- **Memory budget per preview:** ~1.5GB (Bun API + Bun web + schema overhead)
- **Total preview memory:** ~4.5GB
- **Disk per preview:** ~100MB (build artifacts)
- **Auto-expiry:** 24 hours of inactivity

---

## 10. Mechanical Enforcement (Seven Layers)

Documentation is suggestions. Enforcement is guarantees. Every rule in this spec is mechanically enforced -- bypassing them is impossible, not just discouraged.

### Layer 1: Local Git Hooks (Lefthook)

| Hook | Enforces | Tool |
|------|----------|------|
| **commit-msg** | Conventional commit format | `commitlint` + `@commitlint/config-conventional` |
| **pre-push** | Branch name matches pattern | Regex: `^(feat\|fix\|hotfix\|docs\|refactor\|chore\|test\|ci)/` |
| **pre-push** | Cannot push to `main` directly | Hard block: rejects if current branch is `main` |
| **pre-push** | Changeset exists when `apps/` changed | Script: checks `.changeset/*.md` exists |
| **pre-commit** | No secrets in staged files | `secretlint` |
| **pre-commit** | Biome lint + format | Already configured |

### Layer 2: GitHub Branch Protection Rules (Server-Side)

```
Repository Settings -> Branches -> main:

[x] Require a pull request before merging
    +-- Required approving reviews: 1
    +-- Dismiss stale reviews on new commits
    +-- Require review from CODEOWNERS

[x] Require status checks to pass before merging
    +-- build
    +-- lint
    +-- typecheck
    +-- test-unit
    +-- test-integration
    +-- commitlint
    +-- changeset-check
    +-- branch-name-check
    +-- no-secrets
    +-- test-coverage
    +-- test-colocation

[x] Require branches to be up to date before merging
[x] Require linear history
[x] Allow squash merging only
[x] Do not allow bypassing the above settings
[x] Restrict who can push to matching branches: nobody
[x] Allow force pushes: NEVER
[x] Allow deletions: NO
```

### Layer 3: CI Status Checks (GitHub Actions)

See Section 8 for the full job list with Required vs Informational classification.

### Layer 4: CODEOWNERS

```
# .github/CODEOWNERS

# Infrastructure -- always human review
homelab/                    @anshulbisen
.github/workflows/          @anshulbisen
docker-compose*.yml         @anshulbisen

# Database -- always human review
**/migrations/              @anshulbisen

# Security -- always human review
**/auth/                    @anshulbisen
**/security/                @anshulbisen
.env.example                @anshulbisen

# Agent behavior -- always human review
CLAUDE.md                   @anshulbisen
AGENTS.md                   @anshulbisen
```

PRs touching CODEOWNERS-listed paths require explicit approval. Paths **not** listed are eligible for auto-merge.

### Layer 5: Auto-Merge Rules

Auto-merge is a GitHub Actions workflow that enables GitHub's auto-merge feature on qualifying PRs:

**Conditions (ALL must be true):**
1. All CI checks green
2. No `requires-human-review` label
3. No migration files changed
4. No CODEOWNERS-protected files changed
5. PR has changeset (if `apps/` changed)
6. 5-minute grace period elapsed

**Result:** PR squash-merges automatically. Telegram notification with cancel window.

### Layer 6: Telegram Notifications

Every significant event is reported with priority tiers. See Section 13 for the complete notification strategy.

### Layer 7: Production Health Checks

Post-deploy health checks are the final safety net:

| Check | Endpoint | Expected | Timeout |
|-------|----------|----------|---------|
| **API health** | `localhost:33001/health` | `200 OK` with `{"status":"healthy"}` | 10s |
| **API readiness** | `localhost:33001/health/ready` | `200 OK` with `{"db":"ok","redis":"ok","nats":"ok"}` | 15s |
| **Web health** | `localhost:33000/health` | `200 OK` (static page baked into build) | 5s |

If health checks fail after deploy, the deploy workflow automatically rolls back to the previous release and alerts via Telegram.

### Defense in Depth Summary

```
Local hooks (Lefthook)            -- first defense, fastest feedback (catches 90%)
         v
CI status checks (GitHub Actions)  -- second defense, catches --no-verify bypasses
         v
Branch protection (GitHub)         -- hard gate, impossible to bypass (server-side)
         v
CODEOWNERS (GitHub)                -- targeted protection for sensitive paths
         v
Auto-merge rules                   -- safe automation with 5-min grace period
         v
Telegram notifications             -- human visibility, can cancel auto-merge
         v
Production health checks           -- final safety net, auto-rollback on failure
```

---

## 11. Backup Strategy

See [Deployment Architecture — Backup and Recovery](./deployment-architecture.md#9-backup-and-recovery) for the complete backup schedule, retention policies, and recovery targets.

### Pre-Deploy Snapshots (CI/CD-Specific)

Every production deploy creates a `pg_dump` snapshot **before** running migrations. Named `{app}@{version}-pre-deploy.sql.gz`. Stored locally (last 10) and synced to Google Drive. This is the primary rollback mechanism for database changes.

### Estimated Storage

| Category | Daily growth | 30-day total |
|----------|-------------|--------------|
| pg_dump (compressed) | ~5-30MB | ~150MB-900MB |
| WAL archives | ~3-10MB | ~90-300MB |
| Redis/NATS snapshots | ~1-3MB | ~30-90MB |
| Build archives | ~15-30MB per deploy | ~300-600MB |
| **Total** | | **~600MB-2GB** |

Well within the 2TB Google Drive capacity (shared with LifeOS backups).

---

## 12. Multi-Agent Test Isolation (Dev Environment)

### Problem

3-5 AI agents work on features simultaneously on Mac Studio. They share one dev Postgres/Redis/NATS. They must not interfere with each other's test data, but spinning up separate containers per agent is wasteful overhead.

### Solution: Postgres Schema Isolation

Each git worktree gets its own Postgres schema. All worktrees share the same Postgres instance, Redis, and NATS.

**How it works:**
1. Agent creates a git worktree for their branch
2. The test harness detects the worktree name and sets `search_path = wt_{hash}`
3. Migrations run against that schema (creating tables in the schema namespace)
4. All queries are isolated -- Agent 1's test data is invisible to Agent 2
5. When the worktree is deleted, a cleanup hook drops the schema

**What's shared (safe to share):**
- Redis -- agents use key prefixes (`wt_{hash}:*`), no conflicts
- NATS -- agents use subject prefixes (`wt_{hash}.>`), no conflicts
- Docker containers -- one Postgres, one Redis, one NATS for all agents

**Overhead per agent:** One `CREATE SCHEMA` + migrations (~2 seconds). No containers, no ports, no configuration.

**CI on Kali also uses schema isolation:** When CI runs parallel test jobs, each job gets its own schema to prevent test interference.

---

## 13. Telegram Notification Strategy

### Priority Tiers

Every Telegram notification starts with a priority prefix for instant visual scanning:

| Tier | Prefix | Meaning | When to act |
|------|--------|---------|-------------|
| ACTION | `ACTION --` | Something is broken or blocked. Requires attention NOW. | Immediately |
| REVIEW | `REVIEW --` | Something is waiting for you. Requires attention soon. | Within the hour |
| INFO | `INFO --` | Informational. No action needed. | Read when convenient |

### Message Format

Every notification follows a consistent structure:

```
{priority} -- {title}
{context line}
+-- {detail 1}
+-- {detail 2}
+-- {detail N}

{quick actions (if applicable)}
```

### Complete Event -> Topic -> Priority Mapping

| Event | Topic | Priority | Rationale |
|-------|-------|----------|-----------|
| Production health check failed | **Alerts** | ACTION | Service impacting |
| Deploy failed mid-migration | **Alerts** | ACTION | Data integrity risk |
| Backup failed | **Alerts** | ACTION | Data safety risk |
| Cloudflare tunnel disconnected | **Alerts** | ACTION | Production unreachable |
| OOM event on Kali | **Alerts** | ACTION | Service degradation |
| PR needs approval (protected files) | **CI/CD** | REVIEW | Agent is blocked waiting for you |
| PR needs approval (feat/* with preview) | **CI/CD** | REVIEW | Feature ready for manual testing |
| Preview environment ready | **CI/CD** | REVIEW | You can now test the feature |
| Auto-merge pending (5-min grace) | **CI/CD** | REVIEW | Can cancel if needed |
| PR build/test failed | **CI/CD** | REVIEW | Agent may need guidance |
| Preview slot queued (all full) | **CI/CD** | REVIEW | May want to tear down a stale preview |
| Stale branch warning (30 days) | **CI/CD** | REVIEW | Cleanup needed |
| `needs-docs` label applied | **CI/CD** | REVIEW | Documentation update needed |
| Deploy succeeded | **Releases** | INFO | Good news, no action needed |
| Rollback completed (auto) | **Releases** | INFO | Automated recovery worked |
| Version Packages PR created | **Releases** | INFO | Informational |
| Rollback completed (manual) | **Releases** | INFO | Your rollback request completed |
| Auto-merge completed | **CI/CD** | INFO | Safe PR merged automatically |
| PR created by agent | **CI/CD** | INFO | Awareness |
| Preview torn down (expired/merged) | **CI/CD** | INFO | Slot freed |
| Daily backup success | **Backups** | INFO | Daily digest |
| Google Drive sync status | **Backups** | INFO | Storage health |
| Cache hit rate report | **Backups** | INFO | Weekly performance stats |
| Daily digest (9am summary) | **CI/CD** | INFO | Daily overview |

### Topic Structure

Four topics in the ctrlpane Telegram notification group:

| Topic | Events | Priority mix |
|-------|--------|-------------|
| **Alerts** | Production health, tunnel status, OOM, backup failures | Mostly ACTION |
| **CI/CD** | PR lifecycle, previews, auto-merge, build status, daily digest | Mix of REVIEW and INFO |
| **Releases** | Deploy success, rollback, changelog, version PRs | Mostly INFO |
| **Backups** | Daily backup status, Google Drive sync, storage, cache stats | Mostly INFO |

### Daily Digest

A scheduled summary posted to the CI/CD topic at 9:00 AM daily:

```
INFO -- Daily Digest (March 12)
+-- Open PRs: 3 (2 awaiting your review)
+-- Previews: 1/3 slots in use
+-- Deploys (24h): 2 successful, 0 failed
+-- Turbo cache hit rate: 87%
+-- Stale branches: 0
+-- Backup status: all healthy
```

---

## 14. Self-Hosted Turborepo Remote Cache

### Why

Turborepo's remote cache stores build/test artifacts keyed by content hash. When inputs have not changed, builds are instant cache hits. Vercel offers this as a paid service. We self-host for free.

### Tool: `ducktors/turborepo-remote-cache`

The most widely used open-source Turborepo remote cache.

### Setup

- **Server:** `ducktors/turborepo-remote-cache` running as a systemd service on Kali
- **Port:** `:39080`
- **Storage:** `/opt/ctrlpane/turbo-cache/` (local NVMe SSD)
- **Auth:** Shared token in `.env` (same token for CI and dev)
- **Eviction:** LRU with 10GB max size
- **No Docker needed** -- runs as a simple Node.js process
- **LAN-only** -- not exposed via Cloudflare tunnel. Accessed via `localhost` on CI and `kali.local` from Mac Studio over LAN

### Configuration

In `turbo.json`:
```json
{
  "remoteCache": {
    "enabled": true,
    "apiUrl": "http://localhost:39080"
  }
}
```

For Mac Studio dev builds (cache hits over LAN):
```
TURBO_API=http://kali.local:39080
TURBO_TOKEN=<shared-token>
```

### Cache Flow

```
Agent pushes feat/tasks/bulk-assign -> CI builds on Kali
    |
    +-- turbo run build --filter=apps/api
    |   Cache MISS -> builds api, stores artifact in remote cache
    |
    +-- turbo run build --filter=apps/web
    |   Cache HIT -> web unchanged, instant restore from cache
    |
    +-- Total build time: 15s (vs 45s without cache)

Agent 2 on Mac Studio switches to similar branch:
    |
    +-- turbo run build --filter=apps/api
        Cache HIT -> artifact restored from Kali cache over LAN (~50ms)
```

---

## 15. TDD & Documentation Enforcement

### TDD: Coverage Gate + Test Co-Location

Every PR that modifies source code must meet two mechanical checks:

**Coverage gate (`test-coverage` CI job):**
- Runs Vitest with `--coverage` on files changed in the PR
- Minimum **80% line coverage** on changed files
- Reports coverage diff as a PR comment
- Threshold applies to changed files only, not the entire codebase (avoids legacy debt blocking new work)
- Exception: files listed in `coverage.exclude` in `vitest.config.ts`

**Test co-location (`test-colocation` CI job):**
- Every new source file in `apps/*/src/**/*.ts` must have a corresponding `*.test.ts` file
- Excluded patterns (no test required): `index.ts`, `types.ts`, `constants.ts`, `*.d.ts`, files in `generated/`
- Reports orphan files in PR comment

**TDD in AGENTS.md:**
All AI agents are instructed:
1. Write the failing test first
2. Run it to confirm it fails (red)
3. Write minimal implementation to make it pass (green)
4. Refactor if needed
5. The CI coverage gate and co-location check are the mechanical backstop

### Documentation: Hygiene

**Documentation CI check (`docs-check` job):**

A heuristic-based check that flags PRs where documentation is likely needed but missing:

| Trigger (file added/modified) | Documentation expected |
|-------------------------------|----------------------|
| `apps/*/src/routes/**` | Route added -> docs guide or API reference expected |
| `apps/*/src/domains/*/` | New domain module -> architecture doc expected |
| `apps/api/src/**/handler*` | New API endpoint -> API reference expected |
| `**/migrations/**` | Schema change -> data model doc expected |
| New config files / env vars | Config reference expected |

The `needs-docs` label blocks auto-merge but does NOT block manual merge -- it is a strong nudge, not a hard gate.

---

## 16. External Monitoring

See [Deployment Architecture — Monitoring and Health](./deployment-architecture.md#10-monitoring-and-health) for health check endpoints and external monitoring configuration.

Both Cloudflare Health Checks and GitHub Actions cron monitoring are free, run outside the home lab power domain, and continue alerting even during a total power outage.

---

## 17. Extensibility: Adding Machines

The infrastructure is designed so adding a new machine is a config change, not an architecture change.

### What's in the repo

```
homelab/
+-- bootstrap.sh              # Provision any new machine
+-- hosts.yml                 # Inventory: machines and their roles
+-- docker-compose.prod.yml   # Production infra (portable)
+-- systemd/                  # Service units (portable to any Linux)
+-- rclone.conf.template      # Backup config template
+-- alloy/                    # Telemetry forwarder config
+-- cloudflare/               # Tunnel config templates
```

### Adding a Machine

1. Add entry to `hosts.yml` with role and IP
2. SSH in, run `./bootstrap.sh` (installs deps, registers GitHub runner, configures tunnel)
3. Done -- machine is operational

---

## 18. Open Questions

These are decisions that can be deferred but should be consciously revisited:

1. **Staging environment** -- currently no staging. Production deploys go straight from CI. Acceptable for early stage. Revisit when ctrlpane has paying customers.

2. **Database migration rollback** -- `pg_dump` restore is the rollback mechanism. No automated down-migrations. Expand/contract pattern reduces the need for rollbacks.

3. **Secrets rotation automation** -- secrets are in `.env` files, rotated manually quarterly. Automate when the number of secrets grows beyond manageable.

4. **Multi-tenant preview isolation** -- preview environments currently share the production tenant data with schema isolation. Consider full tenant isolation for previews when multi-tenant testing is needed.

5. **Zero-downtime deploys** -- current model has 5-10 seconds of downtime per deploy. Revisit when user count makes this unacceptable.

---

## 19. Success Criteria

This spec is complete when:

**Core CI/CD:**
- [ ] Pushing to `main` directly is impossible (branch protection verified)
- [ ] Branch naming is enforced (local hook + CI check)
- [ ] Commit messages are enforced (commitlint local + CI)
- [ ] Changesets are enforced (local hook + CI check)
- [ ] CI runs full test suite on every PR (self-hosted runner on Kali)
- [ ] Merging a Version Packages PR triggers production deploy
- [ ] Rollback works via GitHub workflow dispatch with version dropdown

**Production & Domains:**
- [ ] Production is accessible at `ctrlpane.com` and stable during dev work
- [ ] API is accessible at `api.ctrlpane.com`

**TDD & Documentation:**
- [ ] `test-coverage` CI check enforces 80% line coverage on changed files
- [ ] `test-colocation` CI check rejects PRs with orphan source files
- [ ] `docs-check` CI check flags PRs that add routes/endpoints without docs
- [ ] AGENTS.md includes documentation standards and TDD discipline sections

**PR Preview Environments:**
- [ ] `feat/*` PRs get temporary deployment on Kali with unique URL (`preview-{N}.ctrlpane.com`)
- [ ] Preview environments share Postgres/Redis/NATS with schema/key isolation
- [ ] Previews auto-expire after 24h of inactivity
- [ ] Max 3 concurrent previews, queuing when full

**Build Caching:**
- [ ] Turborepo remote cache running on Kali (self-hosted, no Vercel dependency)
- [ ] CI builds and Mac Studio dev builds share the same cache

**Notifications & Monitoring:**
- [ ] Telegram notifications use priority tiers (ACTION / REVIEW / INFO)
- [ ] Daily digest at 9am with PR/preview/deploy/cache summary
- [ ] External health checks alert when production is down
- [ ] Daily backups sync to Google Drive via rclone

**AI Agent Workflow:**
- [ ] An AI agent can create a branch, implement a feature, create PR, and have it deployed -- without a dev server
- [ ] Multiple agents can work on parallel features without interference
