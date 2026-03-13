# anshul-homelab Org-Wide CI/CD Convention

> **Owner:** Anshul Bisen
> **Date:** 2026-03-13
> **Status:** Active
> **Scope:** All repositories in the `anshul-homelab` GitHub organization
> **Reference implementation:** `anshul-homelab/ctrlpane` (this repo)

---

## 1. Overview

This document defines the standard CI/CD convention for all repositories in the `anshul-homelab` GitHub organization. The convention was validated on ctrlpane and is designed to be rolled out incrementally to all repos.

### Goals

- **Every repo has a merge gate** — no accidental merges, especially by AI agents
- **Consistent developer experience** — same branch naming, commit format, and PR workflow everywhere
- **Tiered enforcement** — full CI for code repos, lightweight CI for docs repos
- **Org-level governance** — single ruleset covers all repos automatically

### Org Plan

GitHub Team ($4/seat/month). Key capabilities used:

| Feature | Status |
|---------|--------|
| Org-level rulesets | Active — `merge-gate` required on all repos |
| Branch protection on private repos | Available |
| Environments for private repos | Available (but required reviewers are Enterprise-only for private repos) |
| CODEOWNERS enforcement on private repos | Available |
| Actions minutes | 3,000/month (unlimited for public repos) |

---

## 2. Repository Tiers

### Tier 1: Code Repos (have source code, build artifacts, tests)

**Current repos:** `ctrlpane`, `life-os`

Full CI/CD pipeline with lint, typecheck, tests, build, coverage, secret scanning, merge gate.

### Tier 2: Docs Repos (planning, documentation, specs only)

**Current repos:** `ai-gateway`, `lifeos` (v2), `knowledgebase`

Lightweight CI with commitlint, branch name validation, and merge gate only.

### Tier Assignment Rule

A repo is Tier 1 if it has a `package.json`, `go.mod`, `Cargo.toml`, or equivalent build manifest at the root. Otherwise, it's Tier 2.

---

## 3. Org-Level Enforcement (All Repos)

These rules are enforced at the GitHub org level and apply automatically to every repo, including future repos.

### 3.1 Org Ruleset: `Require merge-gate approval`

- **Target:** `refs/heads/main` on all repositories (`~ALL`)
- **Rule:** Required status check `merge-gate` (integration_id: 15368 = GitHub Actions)
- **Effect:** No PR can merge to `main` unless a CI job named `merge-gate` has passed

### 3.2 Branch Protection (per repo, but standardized)

Every repo's `main` branch must have:

| Setting | Value |
|---------|-------|
| Require PR before merging | Yes |
| Required approving reviews | 0 (merge-gate environment is the human gate) |
| Dismiss stale reviews on new commits | N/A |
| Require linear history | Yes |
| Allow force pushes | Never |
| Allow deletions | No |
| Enforce for admins | Yes |

**Note on environments:** Required reviewers on GitHub environments work for public repos on Team plan. For private repos, required reviewers on environments are Enterprise-only. For private repos, use branch protection's required PR reviews (set to 1) as the human gate instead, since the environment-based gate won't work.

**Solo engineer note:** For public repos where the merge-gate environment is the human gate, required PR reviews should be set to 0 (a solo engineer cannot approve their own PR). The merge-gate environment's required reviewer serves the same purpose.

### 3.3 Universal Branch Naming

Enforced by CI check and local pre-push hook:

```
^(feat|fix|hotfix|docs|refactor|chore|test|ci)/
```

Examples: `feat/auth/session-cookies`, `fix/api/rate-limit`, `docs/deployment-runbook`

### 3.4 Conventional Commits

All repos use Conventional Commits enforced by commitlint:

```
type(scope): subject
```

Types: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `ci`

Scopes are repo-specific (see per-repo configuration below).

---

## 4. Tier 1: Code Repo Convention

### 4.1 Required Files

| File | Purpose | Reuse from ctrlpane |
|------|---------|---------------------|
| `.github/workflows/ci.yml` | CI pipeline | Adapt (change jobs to match repo) |
| `.github/workflows/merge-gate.yml` | Reusable merge gate | Copy verbatim |
| `lefthook.yml` | Pre-commit hooks | Adapt (change commands) |
| `commitlint.config.ts` | Commit message validation | Adapt (change scope enum) |
| `.changeset/config.json` | Monorepo versioning | Copy verbatim |
| `biome.json` | Lint + format | Copy verbatim |
| `.editorconfig` | Editor settings | Copy verbatim |
| `.secretlintrc.json` | Secret scanning | Adapt (change allows/ignores) |

### 4.2 CI Workflow Structure (`ci.yml`)

Every Tier 1 repo's CI workflow follows this structure:

```yaml
name: CI

on:
  push:
    branches: ['**']
  pull_request:
    branches: [main]

# Minimum required jobs for Tier 1:
jobs:
  # ── Quality Gates (required) ──────────────────────────
  branch-name-check:    # PR only — validate branch naming
  commitlint:           # All — validate commit messages
  lint:                 # All — biome lint
  typecheck:            # All — tsc --noEmit
  test-unit:            # All — vitest/bun test
  build:                # All — turbo build
  no-secrets:           # PR only — secretlint on changed files

  # ── Optional but recommended ──────────────────────────
  changeset-check:      # PR only — require changeset when apps/ changes
  test-integration:     # All — testcontainers / real DB tests
  test-arch:            # All — architecture boundary tests
  test-coverage:        # PR only — 80% line coverage on changed files
  test-colocation:      # PR only — every source file has a test

  # ── Informational (don't block merge) ─────────────────
  protected-files:      # PR only — label requires-human-review
  docs-check:           # PR only — label needs-docs
  preview-deploy:       # PR only — deploy preview for feat/* branches

  # ── Merge Gate (REQUIRED — fan-in) ────────────────────
  merge-gate:
    name: merge-gate
    if: github.event_name == 'pull_request'
    needs: [lint, typecheck, test-unit, build]  # adjust per repo
    runs-on: ubuntu-latest
    environment: merge-gate  # only effective for public repos
    steps:
      - name: Approved for merge
        run: echo "Merge approved by reviewer"
```

**Key pattern:** The `merge-gate` job depends on all quality gate jobs via `needs`. Adding or removing CI jobs only requires updating the `needs` array — the org ruleset and branch protection don't need to change.

### 4.3 Merge Gate Reusable Workflow (`merge-gate.yml`)

```yaml
name: Merge Gate
on:
  workflow_call:
jobs:
  merge-gate:
    name: merge-gate
    runs-on: ubuntu-latest
    environment: merge-gate
    steps:
      - name: Approved for merge
        run: echo "Merge approved by reviewer"
```

Repos can call this via `workflow_call` instead of inlining the merge-gate job.

### 4.4 Local Hooks (`lefthook.yml`)

Standard hook structure:

```yaml
pre-commit:
  parallel: true
  commands:
    biome-check:      # lint + format staged files
    typecheck:        # tsc --noEmit
    test:             # unit tests
    secretlint:       # secret scanning

commit-msg:
  commands:
    commitlint:       # conventional commits

pre-push:
  commands:
    branch-name:      # block push to main, enforce naming
    changeset-check:  # require changeset when apps/ changed
```

---

## 5. Tier 2: Docs Repo Convention

### 5.1 Required Files

| File | Purpose | Reuse from ctrlpane |
|------|---------|---------------------|
| `.github/workflows/ci.yml` | Lightweight CI | New (minimal) |
| `.editorconfig` | Editor settings | Copy verbatim |
| `commitlint.config.ts` | Commit message validation | Adapt (scope: `docs`) |

### 5.2 CI Workflow Structure (`ci.yml`)

```yaml
name: CI

on:
  push:
    branches: ['**']
  pull_request:
    branches: [main]

jobs:
  branch-name-check:
    name: branch-name-check
    if: github.event_name == 'pull_request'
    runs-on: ubuntu-latest
    steps:
      - name: Check branch name
        run: |
          BRANCH="${{ github.head_ref }}"
          if [[ ! "$BRANCH" =~ ^(feat|fix|hotfix|docs|refactor|chore|test|ci)/ ]]; then
            echo "::error::Branch name must match pattern: (feat|fix|hotfix|docs|refactor|chore|test|ci)/<desc>"
            exit 1
          fi

  commitlint:
    name: commitlint
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: wagoid/commitlint-github-action@v6

  merge-gate:
    name: merge-gate
    if: github.event_name == 'pull_request'
    needs: [branch-name-check, commitlint]
    runs-on: ubuntu-latest
    steps:
      - name: Approved for merge
        run: echo "Merge approved by reviewer"
```

### 5.3 No Local Hooks for Docs Repos

Docs repos don't require lefthook or pre-commit hooks. The CI pipeline is sufficient enforcement. If an AI agent bypasses local hooks with `--no-verify`, the CI will catch it.

---

## 6. Per-Repo Configuration

### 6.1 ctrlpane (Tier 1, public)

| Attribute | Value |
|-----------|-------|
| Visibility | Public |
| Runner | Self-hosted (Kali) |
| Merge gate | Environment-based (required reviewer) + org ruleset |
| Commitlint scopes | `api`, `web`, `shared`, `blueprint`, `auth`, `deps`, `docs`, `ci`, `tooling`, `db`, `infra`, `mcp`, `testing`, `deploy`, `config`, `security`, `telemetry` |
| CI jobs | Full: 15 jobs (see `docs/architecture/cicd-design.md`) |
| Preview deploys | Yes (feat/* branches, 3 slots) |
| Changesets | Yes |
| Status | Implemented, validated, and merged (PR #1) |

### 6.2 life-os (Tier 1, private)

| Attribute | Value |
|-----------|-------|
| Visibility | Private |
| Runner | Self-hosted (Kali) or `ubuntu-latest` |
| Merge gate | Branch protection required reviews + org ruleset (no environment gate — private repo) |
| Commitlint scopes | TBD — based on apps/packages in the monorepo |
| CI jobs | lint, typecheck, test-unit, build, merge-gate (minimum); add test-integration, test-arch as available |
| Preview deploys | No (ctrlpane-specific) |
| Changesets | Recommended (monorepo) |
| Status | Not yet implemented |
| Existing tooling | lefthook, biome, turbo, playwright — needs GitHub-level enforcement |

### 6.3 ai-gateway (Tier 2, private)

| Attribute | Value |
|-----------|-------|
| Visibility | Private |
| Runner | `ubuntu-latest` |
| Merge gate | Branch protection required reviews + org ruleset |
| Commitlint scopes | `docs`, `specs`, `plans` |
| CI jobs | branch-name-check, commitlint, merge-gate |
| Status | Not yet implemented |

### 6.4 lifeos v2 (Tier 2, private)

| Attribute | Value |
|-----------|-------|
| Visibility | Private |
| Runner | `ubuntu-latest` |
| Merge gate | Branch protection required reviews + org ruleset |
| Commitlint scopes | `docs`, `specs`, `decisions`, `guides`, `runbooks` |
| CI jobs | branch-name-check, commitlint, merge-gate |
| Status | Not yet implemented |

### 6.5 knowledgebase (Tier 2, private)

| Attribute | Value |
|-----------|-------|
| Visibility | Private |
| Runner | `ubuntu-latest` |
| Merge gate | Branch protection required reviews + org ruleset |
| Commitlint scopes | `docs`, `specs`, `decisions`, `guides`, `runbooks` |
| CI jobs | branch-name-check, commitlint, merge-gate |
| Status | Not yet implemented |

---

## 7. Security Baseline

### Free for Public Repos (enable immediately)

- Secret scanning + push protection
- Dependabot alerts + security updates
- Code scanning (CodeQL)

### Requires Add-On for Private Repos

- GitHub Secret Protection ($19/month/active committer) — secret scanning for private repos
- GitHub Code Security ($30/month/active committer) — code scanning for private repos

**Recommendation:** Enable free features on ctrlpane now. Evaluate paid add-ons when private repos have active code.

---

## 8. Directly Reusable Components

These files can be copied verbatim from ctrlpane to any repo:

| Component | Source file | Notes |
|-----------|------------|-------|
| Merge gate workflow | `.github/workflows/merge-gate.yml` | Universal |
| EditorConfig | `.editorconfig` | Universal |
| Biome config | `biome.json` | Universal for TS projects |
| Changeset config | `.changeset/config.json` | Universal for monorepos |

---

## 9. GitHub Team Plan Limitations

Features that are **not available** on Team (require Enterprise):

| Feature | Workaround |
|---------|------------|
| Required reviewers on environments (private repos) | Use branch protection required PR reviews instead |
| Wait timers on environments (private repos) | Not needed for current workflow |
| Required workflows at org level | Use org ruleset requiring `merge-gate` status check instead |
| Ruleset metadata restrictions (commit message format) | Use commitlint in CI instead |
| Audit log streaming | Not needed at current scale |

---

## 10. Rollout Plan

### Phase 1: Merge ctrlpane PR #1 (prerequisite)

PR #1 contains the validated CI/CD pipeline. Must merge first so:
- Reusable `merge-gate.yml` workflow exists on the remote
- Branch protection status checks have workflow definitions to run

### Phase 2: Enable security features on ctrlpane

- Enable secret scanning + push protection
- Enable Dependabot alerts + security updates
- Enable CodeQL code scanning

### Phase 3: Set up Tier 2 repos (ai-gateway, lifeos v2, knowledgebase)

Per repo:
1. Create `.github/workflows/ci.yml` (Tier 2 template)
2. Copy `.editorconfig` from ctrlpane
3. Set up branch protection on `main` (standardized settings from Section 3.2)
4. Create `merge-gate` environment (for any public repos; skip for private)

### Phase 4: Set up life-os (Tier 1)

1. Create `.github/workflows/ci.yml` (adapted from ctrlpane)
2. Copy `.github/workflows/merge-gate.yml`, `.editorconfig`, `biome.json`
3. Create `commitlint.config.ts` with life-os-specific scopes
4. Set up branch protection on `main`
5. Migrate existing lefthook config to match org convention

### Phase 5: Enable security add-ons (when needed)

Evaluate GitHub Secret Protection and Code Security add-ons when private repos have active codebases.

---

## 11. Maintenance

- **Adding a new repo:** Follow Tier 1 or Tier 2 setup from this document. The org-level ruleset automatically covers new repos.
- **Adding a CI job:** Add the job to `ci.yml` and add it to the `merge-gate` job's `needs` array. No org-level changes needed.
- **Changing required checks:** Only the `merge-gate` status check is required at the org level. Individual repos control their own quality gates via the `needs` array on the `merge-gate` job.
- **Upgrading to Enterprise:** If upgraded, migrate private repo merge gates from branch protection reviews to environment-based required reviewers for consistency with public repos.
