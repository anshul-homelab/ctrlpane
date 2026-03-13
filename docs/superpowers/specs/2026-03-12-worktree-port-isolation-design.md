# Worktree Port Isolation Design

**Date:** 2026-03-12
**Status:** Approved
**Problem:** Multiple AI agents working in parallel git worktrees hit port conflicts when starting dev servers and infrastructure.

## Overview

A slot-based port registry that automatically allocates unique port sets per worktree, integrated into Claude Code's worktree lifecycle hooks. Portless (vercel-labs/portless) is an optional ergonomic layer providing named `.localhost` URLs for human debugging.

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Infrastructure isolation | Per-worktree | Agents run migrations/seeds/tests concurrently — shared DB causes data collisions |
| Port discovery | Slot-based registry | Deterministic, zero collision, single source of truth |
| Lifecycle trigger | Claude Code hooks (`EnterWorktree`/`ExitWorktree`) | Automatic, invisible to agents, no "remember to run" problem |
| Inter-service references | Direct port from `.env` | No hard dependency on portless proxy for automated workflows |
| Portless role | Optional convenience layer | Named URLs for humans, not load-bearing infrastructure |

## Port Registry

### Location

`$(git rev-parse --git-common-dir)/port-registry.json` — accessible from every worktree, never committed, tied to this repo.

### Format

```json
{
  "version": 1,
  "step": 100,
  "max_slots": 10,
  "base_ports": {
    "API_PORT": 33001,
    "WEB_PORT": 33000,
    "POSTGRES_PORT": 35432,
    "REDIS_PORT": 36379,
    "NATS_PORT": 34222,
    "NATS_MGMT_PORT": 38222,
    "CENTRIFUGO_PORT": 38000
  },
  "slots": {
    "0": {
      "worktree": "/Users/anshul/projects/personal/ctrlpane",
      "branch": "main",
      "allocated_at": "2026-03-12T10:00:00Z"
    }
  }
}
```

### Port Formula

```
actual_port = base_port + (slot × step)
```

With `step=100`, this supports 10 concurrent worktrees comfortably. All ports stay well under 65535 (highest slot 9 value: 39122).

### Port Allocation Table

| Service | Slot 0 | Slot 1 | Slot 2 | Slot 3 | Slot 4 | Slot 5 | Slot 6 | Slot 7 | Slot 8 | Slot 9 |
|---------|--------|--------|--------|--------|--------|--------|--------|--------|--------|--------|
| API | 33001 | 33101 | 33201 | 33301 | 33401 | 33501 | 33601 | 33701 | 33801 | 33901 |
| Web | 33000 | 33100 | 33200 | 33300 | 33400 | 33500 | 33600 | 33700 | 33800 | 33900 |
| Postgres | 35432 | 35532 | 35632 | 35732 | 35832 | 35932 | 36032 | 36132 | 36232 | 36332 |
| Redis | 36379 | 36479 | 36579 | 36679 | 36779 | 36879 | 36979 | 37079 | 37179 | 37279 |
| NATS | 34222 | 34322 | 34422 | 34522 | 34622 | 34722 | 34822 | 34922 | 35022 | 35122 |
| NATS Mgmt | 38222 | 38322 | 38422 | 38522 | 38622 | 38722 | 38822 | 38922 | 39022 | 39122 |
| Centrifugo | 38000 | 38100 | 38200 | 38300 | 38400 | 38500 | 38600 | 38700 | 38800 | 38900 |

### Concurrency Control

The registry is shared mutable state. All reads and writes MUST be wrapped in an exclusive file lock to prevent race conditions when multiple agents enter worktrees simultaneously:

```bash
exec 9>"${REGISTRY_DIR}/.port-registry.lock"
flock -x 9  # exclusive lock, blocks until acquired
# ... read, modify, write registry ...
exec 9>&-   # release
```

On macOS, `flock` is available via Homebrew (`brew install flock`) or can be approximated with `mkdir`-based locking as a fallback.

### Stale Entry Cleanup

On every allocation (inside the lock), the script sweeps existing slots and releases any whose `worktree` directory no longer exists. This handles crashed agents that never ran `ExitWorktree`.

## Config File Parameterization

### docker-compose.yml

All hardcoded ports become `${VAR:-default}` substitutions. Defaults match slot 0 so the main worktree works unchanged without a `.env`.

```yaml
name: ctrlpane-${COMPOSE_PROJECT_SUFFIX:-main}

services:
  postgres:
    ports:
      - "127.0.0.1:${POSTGRES_PORT:-35432}:5432"
  redis:
    ports:
      - "127.0.0.1:${REDIS_PORT:-36379}:6379"
  nats:
    ports:
      - "127.0.0.1:${NATS_PORT:-34222}:4222"
      - "127.0.0.1:${NATS_MGMT_PORT:-38222}:8222"
  centrifugo:
    ports:
      - "127.0.0.1:${CENTRIFUGO_PORT:-38000}:8000"
    environment:
      CENTRIFUGO_ALLOWED_ORIGINS: "http://localhost:${WEB_PORT:-33000}"
```

### process-compose.yml

Health probe ports become parameterized. Docker compose reads the worktree's `.env`.

```yaml
processes:
  infra:
    command: docker compose --env-file .env up
    shutdown:
      command: docker compose --env-file .env down

  api:
    readiness_probe:
      http_get:
        port: ${API_PORT:-33001}

  web:
    readiness_probe:
      http_get:
        port: ${WEB_PORT:-33000}
```

### .env.example

Stays as-is. Documents slot-0 defaults. The hook generates the real `.env` per worktree.

## Hook Lifecycle

### worktree-enter.sh (EnterWorktree)

1. Locate registry via `git rev-parse --git-common-dir`
2. Garbage collect stale slots (worktree directory no longer exists → release)
3. Find lowest available slot (0–9)
4. Claim it (write worktree path, branch name, timestamp)
5. Compute all ports via `base + (slot × 100)`
6. Generate `.env` in worktree root with full connection strings:
   ```
   # Auto-generated by worktree-enter.sh — slot 2
   API_PORT=33201
   API_HOST=127.0.0.1
   WEB_PORT=33200
   DATABASE_URL=postgres://ctrlpane_app:ctrlpane_dev@localhost:35632/ctrlpane
   POSTGRES_PORT=35632
   POSTGRES_PASSWORD=ctrlpane_dev
   REDIS_URL=redis://:ctrlpane_dev@localhost:36579
   REDIS_PORT=36579
   REDIS_PASSWORD=ctrlpane_dev
   NATS_URL=nats://localhost:34422
   NATS_PORT=34422
   NATS_MGMT_PORT=38422
   CENTRIFUGO_URL=http://localhost:38200
   CENTRIFUGO_PORT=38200
   CENTRIFUGO_API_KEY=ctrlpane_dev_api_key
   CENTRIFUGO_HMAC_SECRET=ctrlpane_dev_hmac_secret
   COMPOSE_PROJECT_SUFFIX=slot-2
   NODE_ENV=development
   LOG_LEVEL=debug
   ```
7. Generate `.worktree-info` with human-readable URLs
8. Print summary to stdout so the agent sees its allocation

### worktree-exit.sh (ExitWorktree)

1. Read `.env` to identify the slot (from `COMPOSE_PROJECT_SUFFIX`)
2. Stop Docker services: `docker compose -p ctrlpane-slot-N down -v` — the `-v` flag intentionally destroys volumes. Worktree infrastructure is ephemeral; re-entering a branch runs migrations/seeds from scratch. This is the correct trade-off for agent-driven workflows where data reproducibility matters more than persistence.
3. Release slot in registry (inside exclusive file lock)
4. Remove `.env` and `.worktree-info` from worktree

### Hook Registration

Registered in Claude Code hooks configuration:

```json
{
  "hooks": {
    "EnterWorktree": "scripts/worktree-enter.sh",
    "ExitWorktree": "scripts/worktree-exit.sh"
  }
}
```

### Edge Cases

- **Main worktree**: Slot 0 is pre-seeded or claimed on first `bun run dev`. Works without hooks via defaults.
- **Agent crash**: Stale slots cleaned by GC sweep on next allocation.
- **No `.env` yet**: All config files have `:-default` fallbacks matching slot 0.
- **Max slots exceeded**: Script exits with error: "All 10 port slots occupied. Run `scripts/port-registry-gc.sh` or stop a worktree."

## Review URL Output

### .worktree-info File

Generated by `worktree-enter.sh` alongside `.env`:

```
# Worktree: feat/auth-system (slot 2)
# Web:  http://localhost:33200
# API:  http://localhost:33201/health/live
```

### AGENTS.md Review Protocol

Added to AGENTS.md so every Claude Code instance knows to output URLs:

```markdown
## Worktree Review Protocol

When your work is ready for review, output the following at the bottom of your message:

---
**Ready for review**
- Web: http://localhost:${WEB_PORT}
- API: http://localhost:${API_PORT}

Ports are in `.env` at the worktree root.
---
```

### Portless Named URLs (Optional)

If portless is active, `.worktree-info` also includes:
```
# Portless: http://web.auth-system.localhost:1355
# Portless: http://api.auth-system.localhost:1355
```

## Portless Integration (Optional)

Portless is an optional ergonomic layer, not a requirement.

### Setup (One-Time)

```bash
npm install -g portless
portless proxy start
```

### Registration Script (scripts/portless-register.sh)

1. Derive name from branch: `feat/auth-system` → `auth-system`
2. Read `.env` for ports
3. Register aliases:
   ```bash
   portless alias api.auth-system $API_PORT
   portless alias web.auth-system $WEB_PORT
   ```

### process-compose Integration (Opt-In)

```yaml
  portless:
    command: scripts/portless-register.sh
    depends_on:
      web:
        condition: process_healthy
    availability:
      restart: "no"
```

### What Portless Does NOT Do

- Does not allocate ports (registry does that)
- Does not proxy Docker/TCP services (Postgres, Redis, NATS)
- Does not wrap app startup commands (apps read ports from `.env`)
- Is not required for any automated workflow

## File Map

### New Files

| File | Purpose | ~Lines |
|------|---------|--------|
| `scripts/worktree-enter.sh` | Hook: allocate slot, generate `.env` and `.worktree-info` | ~80 |
| `scripts/worktree-exit.sh` | Hook: stop Docker, release slot, clean up | ~40 |
| `scripts/portless-register.sh` | Optional: register named URLs with portless | ~25 |
| `scripts/port-registry-gc.sh` | Manual cleanup of stale registry slots | ~30 |
| `scripts/port-registry-status.sh` | Pretty-print current slot allocations for debugging | ~20 |

### Modified Files

| File | Change |
|------|--------|
| `docker-compose.yml` | Hardcoded ports → `${VAR:-default}`, dynamic project name |
| `process-compose.yml` | Hardcoded probe ports → `${VAR:-default}`, optional portless process |
| `.gitignore` | Add `.worktree-info` (`.env` already present) |
| `.claude/settings.json` | Register `EnterWorktree`/`ExitWorktree` hooks |
| `AGENTS.md` | Add Worktree Review Protocol section |

### Unchanged

- `.env.example` — stays as slot-0 documentation
- App source code — already reads from env vars
- `package.json` scripts — `bun run dev` still runs `process-compose up`

## Invariants

1. **Main worktree unchanged**: No hooks fired → all defaults are slot 0 → works exactly as today
2. **Self-contained worktrees**: `.env` is the single source of truth for all ports
3. **Single shared state**: Registry is the only shared mutable state, accessed only during enter/exit
4. **No container collisions**: Docker project names namespaced by slot (`ctrlpane-slot-N`)
5. **No new runtime dependencies**: ~195 lines of shell script. Portless is the only optional global install.
7. **Configurable limits**: `max_slots` is read from the registry file, not hardcoded — adjustable by editing one file.
6. **Resource efficient**: ~100-170 MB RAM per worktree infra stack. 10 stacks ≈ 1-1.7 GB total.
