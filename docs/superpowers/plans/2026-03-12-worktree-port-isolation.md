# Worktree Port Isolation Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate port conflicts when multiple AI agents run dev servers in parallel git worktrees.

**Architecture:** A slot-based port registry (`port-registry.json` in git's common dir) assigns each worktree a unique offset (0–9 × 100) applied to all service ports. Claude Code hooks auto-allocate on worktree entry and clean up on exit. Portless is an optional named-URL layer.

**Tech Stack:** Bash scripts, jq (JSON manipulation), process-compose, docker-compose env var substitution, Bun/TypeScript (app configs)

**Spec:** `docs/superpowers/specs/2026-03-12-worktree-port-isolation-design.md`

**Prerequisites:** `jq` must be installed (`brew install jq` on macOS)

---

## Chunk 1: Config Parameterization

### Task 1: Parameterize docker-compose.yml

**Files:**
- Modify: `docker-compose.yml` (lines 1, 7, 24, 38-39, 53, 57)

- [ ] **Step 1: Add dynamic project name and parameterize all ports**

Replace the current `name: ctrlpane` line and all hardcoded port mappings. Every value gets a `${VAR:-default}` fallback matching current slot-0 values so the main worktree works unchanged.

```yaml
name: ctrlpane-${COMPOSE_PROJECT_SUFFIX:-main}

services:
  postgres:
    image: postgres:17-alpine
    ports:
      - "127.0.0.1:${POSTGRES_PORT:-35432}:5432"
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
      - "127.0.0.1:${REDIS_PORT:-36379}:6379"
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
      - "127.0.0.1:${NATS_PORT:-34222}:4222"
      - "127.0.0.1:${NATS_MGMT_PORT:-38222}:8222"
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
      - "127.0.0.1:${CENTRIFUGO_PORT:-38000}:8000"
    environment:
      CENTRIFUGO_API_KEY: ${CENTRIFUGO_API_KEY:-ctrlpane_dev_api_key}
      CENTRIFUGO_TOKEN_HMAC_SECRET_KEY: ${CENTRIFUGO_HMAC_SECRET:-ctrlpane_dev_hmac_secret}
      CENTRIFUGO_ALLOWED_ORIGINS: "http://localhost:${WEB_PORT:-33000}"
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

- [ ] **Step 2: Verify docker-compose.yml parses correctly**

Run: `docker compose config --quiet`
Expected: exits 0 with no errors (defaults are applied)

- [ ] **Step 3: Commit**

```bash
git add docker-compose.yml
git commit -m "feat(tooling): parameterize docker-compose ports for worktree isolation"
```

---

### Task 2: Parameterize process-compose.yml

**Files:**
- Modify: `process-compose.yml` (lines 5, 12, 23, 40)

- [ ] **Step 1: Add --env-file and parameterize probe ports**

```yaml
version: "0.5"

processes:
  infra:
    command: docker compose --env-file .env up
    readiness_probe:
      exec:
        command: docker compose ps --status=healthy --format '{{.Name}}' | wc -l | grep -q '4'
      initial_delay_seconds: 5
      period_seconds: 5
    shutdown:
      command: docker compose --env-file .env down
      timeout_seconds: 15

  api:
    command: bun run --cwd apps/api dev
    depends_on:
      infra:
        condition: process_healthy
    readiness_probe:
      http_get:
        host: 127.0.0.1
        port: ${API_PORT:-33001}
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
        port: ${WEB_PORT:-33000}
        path: /
      initial_delay_seconds: 3
      period_seconds: 5
    availability:
      restart: on_failure
      max_restarts: 3
      backoff_seconds: 2
```

- [ ] **Step 2: Commit**

```bash
git add process-compose.yml
git commit -m "feat(tooling): parameterize process-compose ports for worktree isolation"
```

---

### Task 3: Parameterize app source code

**Files:**
- Modify: `apps/api/src/index.ts` (line 20 — CORS origin)
- Modify: `apps/web/vite.config.ts` (lines 7, 10 — port and proxy target)

- [ ] **Step 1: Parameterize CORS origin in API**

In `apps/api/src/index.ts`, replace line 20:

```typescript
// Before:
    origin: ['http://localhost:33000'],

// After:
    origin: [`http://localhost:${process.env.WEB_PORT ?? 33000}`],
```

- [ ] **Step 2: Parameterize Vite port and API proxy target**

In `apps/web/vite.config.ts`, replace lines 7 and 10:

```typescript
// Before:
    port: 33000,
    proxy: {
      '/api': {
        target: 'http://localhost:33001',

// After:
    port: Number(process.env.WEB_PORT ?? 33000),
    proxy: {
      '/api': {
        target: `http://localhost:${process.env.API_PORT ?? 33001}`,
```

- [ ] **Step 3: Run existing tests to verify no regression**

Run: `bun run test:unit`
Expected: All tests pass (139 tests across 3 packages)

- [ ] **Step 4: Run typecheck**

Run: `bun run typecheck`
Expected: No type errors

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/index.ts apps/web/vite.config.ts
git commit -m "feat(tooling): parameterize app ports for worktree isolation"
```

---

### Task 4: Update .gitignore and AGENTS.md

**Files:**
- Modify: `.gitignore` (add `.worktree-info`)
- Modify: `AGENTS.md` (fix port table lines 103-104, add review protocol after line 109)

- [ ] **Step 1: Add .worktree-info to .gitignore**

Add after the existing `.env` entries (around line 13):

```
.worktree-info
```

Note: `.env` is already in `.gitignore` (line 11). Do NOT add a duplicate.

- [ ] **Step 2: Fix stale port numbers in AGENTS.md**

In `AGENTS.md`, replace lines 103-104:

```markdown
# Before:
| API | 3000 |
| Web | 3001 |

# After:
| API | 33001 |
| Web | 33000 |
```

- [ ] **Step 3: Add Worktree Review Protocol to AGENTS.md**

Insert after line 109 (after the port table, before `## Multi-Agent Safety Rules`):

```markdown

## Worktree Review Protocol

When your work is ready for review, read `.worktree-info` from the worktree root and output the URLs at the bottom of your message:

```
---
**Ready for review**
- Web: http://localhost:${WEB_PORT}
- API: http://localhost:${API_PORT}

Ports are in `.env` at the worktree root.
---
```

If `.worktree-info` does not exist, read `WEB_PORT` and `API_PORT` from `.env` instead. If neither file exists (main worktree without hooks), use the defaults: Web=33000, API=33001.
```

- [ ] **Step 4: Commit**

```bash
git add .gitignore AGENTS.md
git commit -m "docs(tooling): update gitignore and AGENTS.md for worktree port isolation"
```

---

## Chunk 2: Port Registry Scripts

### Task 5: Write worktree-enter.sh

**Files:**
- Create: `scripts/worktree-enter.sh`

**Dependencies:** `jq` must be installed

- [ ] **Step 1: Create scripts directory**

```bash
mkdir -p scripts
```

- [ ] **Step 2: Write worktree-enter.sh**

```bash
#!/usr/bin/env bash
set -euo pipefail

# --- Configuration ---
WORKTREE_ROOT=$(git rev-parse --show-toplevel)
GIT_COMMON_DIR=$(git rev-parse --git-common-dir)
REGISTRY="${GIT_COMMON_DIR}/port-registry.json"
LOCK_DIR="${GIT_COMMON_DIR}/.port-registry.lock"
BRANCH=$(git branch --show-current 2>/dev/null || echo "detached")

# --- Prerequisite check ---
if ! command -v jq &>/dev/null; then
  echo "ERROR: jq is required. Install with: brew install jq" >&2
  exit 1
fi

# --- Initialize registry if missing ---
init_registry() {
  if [ ! -f "$REGISTRY" ]; then
    cat > "$REGISTRY" << 'JSON'
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
  "slots": {}
}
JSON
  fi
}

# --- File locking (mkdir-based, portable) ---
acquire_lock() {
  local attempts=0
  while ! mkdir "$LOCK_DIR" 2>/dev/null; do
    attempts=$((attempts + 1))
    if [ $attempts -gt 50 ]; then
      echo "ERROR: Could not acquire registry lock after 5s" >&2
      exit 1
    fi
    sleep 0.1
  done
  trap 'rmdir "$LOCK_DIR" 2>/dev/null || true' EXIT
}

# --- Garbage-collect stale slots ---
gc_stale_slots() {
  local content
  content=$(cat "$REGISTRY")
  local changed=false

  for slot in $(echo "$content" | jq -r '.slots | keys[]'); do
    local wt
    wt=$(echo "$content" | jq -r ".slots[\"$slot\"].worktree")
    if [ ! -d "$wt" ]; then
      content=$(echo "$content" | jq "del(.slots[\"$slot\"])")
      changed=true
      echo "GC: released stale slot ${slot} (${wt})"
    fi
  done

  if [ "$changed" = true ]; then
    echo "$content" > "$REGISTRY"
  fi
}

# --- Check if this worktree already has a slot ---
check_existing_slot() {
  jq -r --arg wt "$WORKTREE_ROOT" \
    '.slots | to_entries[] | select(.value.worktree == $wt) | .key' \
    "$REGISTRY" | head -1
}

# --- Find lowest available slot ---
find_available_slot() {
  local max_slots
  max_slots=$(jq -r '.max_slots // 10' "$REGISTRY")

  for i in $(seq 0 $((max_slots - 1))); do
    if ! jq -e ".slots[\"$i\"]" "$REGISTRY" >/dev/null 2>&1; then
      echo "$i"
      return 0
    fi
  done

  echo "ERROR: All ${max_slots} port slots occupied." >&2
  echo "Run: scripts/port-registry-gc.sh" >&2
  return 1
}

# --- Claim a slot ---
claim_slot() {
  local slot=$1
  local ts
  ts=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

  jq --arg slot "$slot" \
     --arg wt "$WORKTREE_ROOT" \
     --arg branch "$BRANCH" \
     --arg ts "$ts" \
     '.slots[$slot] = {worktree: $wt, branch: $branch, allocated_at: $ts}' \
     "$REGISTRY" > "${REGISTRY}.tmp"
  mv "${REGISTRY}.tmp" "$REGISTRY"
}

# --- Generate .env ---
generate_env() {
  local slot=$1
  local step
  step=$(jq -r '.step // 100' "$REGISTRY")
  local offset=$((slot * step))

  local api_port=$((33001 + offset))
  local web_port=$((33000 + offset))
  local pg_port=$((35432 + offset))
  local redis_port=$((36379 + offset))
  local nats_port=$((34222 + offset))
  local nats_mgmt_port=$((38222 + offset))
  local centrifugo_port=$((38000 + offset))

  cat > "${WORKTREE_ROOT}/.env" << ENV
# Auto-generated by worktree-enter.sh — slot ${slot}
# DO NOT EDIT — managed by port registry

# Database
DATABASE_URL=postgres://ctrlpane_app:ctrlpane_dev@localhost:${pg_port}/ctrlpane
POSTGRES_PORT=${pg_port}
POSTGRES_PASSWORD=ctrlpane_dev

# Redis
REDIS_URL=redis://:ctrlpane_dev@localhost:${redis_port}
REDIS_PORT=${redis_port}
REDIS_PASSWORD=ctrlpane_dev

# NATS
NATS_URL=nats://localhost:${nats_port}
NATS_PORT=${nats_port}
NATS_MGMT_PORT=${nats_mgmt_port}

# Centrifugo
CENTRIFUGO_URL=http://localhost:${centrifugo_port}
CENTRIFUGO_PORT=${centrifugo_port}
CENTRIFUGO_API_KEY=ctrlpane_dev_api_key
CENTRIFUGO_HMAC_SECRET=ctrlpane_dev_hmac_secret

# API
API_PORT=${api_port}
API_HOST=127.0.0.1

# Web
WEB_PORT=${web_port}

# Docker Compose
COMPOSE_PROJECT_SUFFIX=slot-${slot}

# Environment
NODE_ENV=development
LOG_LEVEL=debug
ENV
}

# --- Generate .worktree-info ---
generate_worktree_info() {
  local slot=$1
  local step
  step=$(jq -r '.step // 100' "$REGISTRY")
  local offset=$((slot * step))

  local api_port=$((33001 + offset))
  local web_port=$((33000 + offset))

  cat > "${WORKTREE_ROOT}/.worktree-info" << INFO
# Worktree: ${BRANCH} (slot ${slot})
# Web:  http://localhost:${web_port}
# API:  http://localhost:${api_port}/health/live
INFO
}

# --- Main ---
main() {
  init_registry
  acquire_lock
  gc_stale_slots

  local slot
  slot=$(check_existing_slot)

  if [ -n "$slot" ]; then
    echo "Worktree already allocated to slot ${slot}"
  else
    slot=$(find_available_slot) || exit 1
    claim_slot "$slot"
  fi

  generate_env "$slot"
  generate_worktree_info "$slot"

  echo "=== Port Allocation ==="
  echo "Slot:   ${slot}"
  echo "Branch: ${BRANCH}"
  cat "${WORKTREE_ROOT}/.worktree-info"
  echo "======================="
}

main
```

- [ ] **Step 3: Make executable**

```bash
chmod +x scripts/worktree-enter.sh
```

- [ ] **Step 4: Test — run in current worktree and verify output**

```bash
scripts/worktree-enter.sh
```

Expected: prints slot allocation summary. Verify:
- `.env` exists at worktree root with correct slot-0 ports (33001, 33000, 35432, etc.)
- `.worktree-info` exists with URLs
- `$(git rev-parse --git-common-dir)/port-registry.json` has slot 0 claimed

```bash
cat .env | grep API_PORT   # should show 33001
cat .worktree-info          # should show localhost URLs
jq '.slots' "$(git rev-parse --git-common-dir)/port-registry.json"  # should show slot "0"
```

- [ ] **Step 5: Clean up test artifacts**

```bash
rm -f .env .worktree-info
jq 'del(.slots["0"])' "$(git rev-parse --git-common-dir)/port-registry.json" > /tmp/reg.json && mv /tmp/reg.json "$(git rev-parse --git-common-dir)/port-registry.json"
```

- [ ] **Step 6: Commit**

```bash
git add scripts/worktree-enter.sh
git commit -m "feat(tooling): add worktree-enter.sh for port allocation"
```

---

### Task 6: Write worktree-exit.sh

**Files:**
- Create: `scripts/worktree-exit.sh`

- [ ] **Step 1: Write worktree-exit.sh**

```bash
#!/usr/bin/env bash
set -euo pipefail

WORKTREE_ROOT=$(git rev-parse --show-toplevel)
GIT_COMMON_DIR=$(git rev-parse --git-common-dir)
REGISTRY="${GIT_COMMON_DIR}/port-registry.json"
LOCK_DIR="${GIT_COMMON_DIR}/.port-registry.lock"

# --- Prerequisite check ---
if ! command -v jq &>/dev/null; then
  echo "ERROR: jq is required. Install with: brew install jq" >&2
  exit 1
fi

# --- File locking ---
acquire_lock() {
  local attempts=0
  while ! mkdir "$LOCK_DIR" 2>/dev/null; do
    attempts=$((attempts + 1))
    if [ $attempts -gt 50 ]; then
      echo "ERROR: Could not acquire registry lock after 5s" >&2
      exit 1
    fi
    sleep 0.1
  done
  trap 'rmdir "$LOCK_DIR" 2>/dev/null || true' EXIT
}

# --- Main ---
main() {
  # Read slot from .env
  if [ ! -f "${WORKTREE_ROOT}/.env" ]; then
    echo "No .env found — nothing to clean up"
    exit 0
  fi

  local suffix
  suffix=$(grep '^COMPOSE_PROJECT_SUFFIX=' "${WORKTREE_ROOT}/.env" | cut -d= -f2 || true)

  if [ -z "$suffix" ]; then
    echo "No COMPOSE_PROJECT_SUFFIX in .env — nothing to clean up"
    exit 0
  fi

  # Stop Docker services (volumes destroyed intentionally — worktree infra is ephemeral)
  local project_name="ctrlpane-${suffix}"
  echo "Stopping Docker services for ${project_name}..."
  docker compose -p "$project_name" down -v 2>/dev/null || true

  # Release slot in registry
  if [ -f "$REGISTRY" ]; then
    acquire_lock

    local slot
    slot=$(jq -r --arg wt "$WORKTREE_ROOT" \
      '.slots | to_entries[] | select(.value.worktree == $wt) | .key' \
      "$REGISTRY" | head -1)

    if [ -n "$slot" ]; then
      jq --arg slot "$slot" 'del(.slots[$slot])' "$REGISTRY" > "${REGISTRY}.tmp"
      mv "${REGISTRY}.tmp" "$REGISTRY"
      echo "Released slot ${slot}"
    fi
  fi

  # Clean up generated files
  rm -f "${WORKTREE_ROOT}/.env" "${WORKTREE_ROOT}/.worktree-info"
  echo "Cleanup complete"
}

main
```

- [ ] **Step 2: Make executable**

```bash
chmod +x scripts/worktree-exit.sh
```

- [ ] **Step 3: Test — round-trip enter → exit**

```bash
# Enter
scripts/worktree-enter.sh
# Verify files exist
test -f .env && echo ".env exists" || echo "FAIL: .env missing"
test -f .worktree-info && echo ".worktree-info exists" || echo "FAIL: .worktree-info missing"

# Exit (skip docker down for testing — no containers running)
scripts/worktree-exit.sh
# Verify cleanup
test ! -f .env && echo ".env removed" || echo "FAIL: .env still exists"
test ! -f .worktree-info && echo ".worktree-info removed" || echo "FAIL: .worktree-info still exists"
jq '.slots | length' "$(git rev-parse --git-common-dir)/port-registry.json"  # should be 0
```

Expected: all checks pass, slot count returns to 0.

- [ ] **Step 4: Commit**

```bash
git add scripts/worktree-exit.sh
git commit -m "feat(tooling): add worktree-exit.sh for port deallocation"
```

---

### Task 7: Write utility scripts

**Files:**
- Create: `scripts/port-registry-gc.sh`
- Create: `scripts/port-registry-status.sh`

- [ ] **Step 1: Write port-registry-gc.sh**

```bash
#!/usr/bin/env bash
set -euo pipefail

GIT_COMMON_DIR=$(git rev-parse --git-common-dir)
REGISTRY="${GIT_COMMON_DIR}/port-registry.json"
LOCK_DIR="${GIT_COMMON_DIR}/.port-registry.lock"

if [ ! -f "$REGISTRY" ]; then
  echo "No registry found at ${REGISTRY}"
  exit 0
fi

if ! command -v jq &>/dev/null; then
  echo "ERROR: jq is required. Install with: brew install jq" >&2
  exit 1
fi

# Acquire lock
attempts=0
while ! mkdir "$LOCK_DIR" 2>/dev/null; do
  attempts=$((attempts + 1))
  if [ $attempts -gt 50 ]; then
    echo "ERROR: Could not acquire lock" >&2
    exit 1
  fi
  sleep 0.1
done
trap 'rmdir "$LOCK_DIR" 2>/dev/null || true' EXIT

# Sweep stale entries
content=$(cat "$REGISTRY")
cleaned=0

for slot in $(echo "$content" | jq -r '.slots | keys[]'); do
  wt_path=$(echo "$content" | jq -r ".slots[\"$slot\"].worktree")
  if [ ! -d "$wt_path" ]; then
    content=$(echo "$content" | jq "del(.slots[\"$slot\"])")
    echo "Released stale slot ${slot} (${wt_path})"
    cleaned=$((cleaned + 1))
  fi
done

echo "$content" > "$REGISTRY"
echo "Cleaned ${cleaned} stale slot(s)"
```

- [ ] **Step 2: Write port-registry-status.sh**

```bash
#!/usr/bin/env bash
set -euo pipefail

GIT_COMMON_DIR=$(git rev-parse --git-common-dir)
REGISTRY="${GIT_COMMON_DIR}/port-registry.json"

if [ ! -f "$REGISTRY" ]; then
  echo "No registry found at ${REGISTRY}"
  exit 0
fi

if ! command -v jq &>/dev/null; then
  echo "ERROR: jq is required. Install with: brew install jq" >&2
  exit 1
fi

step=$(jq -r '.step' "$REGISTRY")
max=$(jq -r '.max_slots // 10' "$REGISTRY")
used=$(jq '.slots | length' "$REGISTRY")

echo "=== Port Registry Status ==="
echo "Slots: ${used}/${max} used (step: ${step})"
echo ""

if [ "$used" -gt 0 ]; then
  jq -r '.slots | to_entries | sort_by(.key | tonumber) | .[] |
    "  Slot \(.key): \(.value.branch) — \(.value.worktree) (since \(.value.allocated_at))"' \
    "$REGISTRY"
else
  echo "  (no active allocations)"
fi

echo ""
echo "Available: $((max - used)) slot(s)"
```

- [ ] **Step 3: Make executable**

```bash
chmod +x scripts/port-registry-gc.sh scripts/port-registry-status.sh
```

- [ ] **Step 4: Commit**

```bash
git add scripts/port-registry-gc.sh scripts/port-registry-status.sh
git commit -m "feat(tooling): add port registry utility scripts (gc, status)"
```

---

### Task 8: Write portless-register.sh

**Files:**
- Create: `scripts/portless-register.sh`

- [ ] **Step 1: Write portless-register.sh**

```bash
#!/usr/bin/env bash
set -euo pipefail

WORKTREE_ROOT=$(git rev-parse --show-toplevel)

# Portless is optional — exit gracefully if not installed
if ! command -v portless &>/dev/null; then
  echo "Portless not installed — skipping named URL registration"
  exit 0
fi

if [ ! -f "${WORKTREE_ROOT}/.env" ]; then
  echo "No .env found — run worktree-enter.sh first"
  exit 1
fi

# Read ports from .env
API_PORT=$(grep '^API_PORT=' "${WORKTREE_ROOT}/.env" | cut -d= -f2)
WEB_PORT=$(grep '^WEB_PORT=' "${WORKTREE_ROOT}/.env" | cut -d= -f2)

# Derive name from branch (strip conventional prefix, replace / with -)
BRANCH=$(git branch --show-current 2>/dev/null || echo "detached")
NAME=$(echo "$BRANCH" | sed 's|^feat/||; s|^fix/||; s|^chore/||; s|/|-|g')

# Register aliases
portless alias "api.${NAME}" "$API_PORT"
portless alias "web.${NAME}" "$WEB_PORT"

echo "Registered portless aliases:"
echo "  http://api.${NAME}.localhost:1355"
echo "  http://web.${NAME}.localhost:1355"

# Append to .worktree-info if it exists
if [ -f "${WORKTREE_ROOT}/.worktree-info" ]; then
  cat >> "${WORKTREE_ROOT}/.worktree-info" << INFO
# Portless: http://web.${NAME}.localhost:1355
# Portless: http://api.${NAME}.localhost:1355
INFO
fi
```

- [ ] **Step 2: Make executable**

```bash
chmod +x scripts/portless-register.sh
```

- [ ] **Step 3: Commit**

```bash
git add scripts/portless-register.sh
git commit -m "feat(tooling): add optional portless registration script"
```

---

## Chunk 3: Hooks, Verification & Documentation

### Task 9: Register Claude Code hooks

**Files:**
- Create or modify: `.claude/settings.json`

- [ ] **Step 1: Verify Claude Code hook format**

Check the Claude Code documentation for the correct hook registration format. The hooks should fire `scripts/worktree-enter.sh` after `EnterWorktree` and `scripts/worktree-exit.sh` before `ExitWorktree`.

The expected format (verify against current Claude Code docs):

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "EnterWorktree",
        "command": "./scripts/worktree-enter.sh"
      }
    ],
    "PreToolUse": [
      {
        "matcher": "ExitWorktree",
        "command": "./scripts/worktree-exit.sh"
      }
    ]
  }
}
```

**IMPORTANT:** The exact hook schema may differ. Test by entering a worktree and confirming the hook fires. If the format is wrong, hooks will silently not fire — validate explicitly.

- [ ] **Step 2: Create .claude/settings.json**

Write the hooks configuration (using the verified format from step 1). If `.claude/settings.json` already exists, merge the hooks key into it.

- [ ] **Step 3: Commit**

```bash
git add .claude/settings.json
git commit -m "feat(tooling): register worktree port allocation hooks"
```

---

### Task 10: End-to-end verification

- [ ] **Step 1: Verify config parameterization with defaults**

```bash
# Docker compose should resolve all defaults
docker compose config --quiet && echo "PASS: docker-compose.yml valid" || echo "FAIL"

# Check no hardcoded ports remain (except in comments/defaults)
grep -n '35432\|36379\|34222\|38222\|38000\|33000\|33001' docker-compose.yml | grep -v ':-' | grep -v '^#'
# Expected: no output (all ports are behind ${VAR:-default})
```

- [ ] **Step 2: Run full test suite to confirm no regressions**

```bash
bun run check
```

Expected: all linting, typecheck, unit tests, and architecture tests pass.

- [ ] **Step 3: Test enter → status → exit round-trip**

```bash
# Allocate
scripts/worktree-enter.sh
# Check status
scripts/port-registry-status.sh
# Verify .env has correct values
grep 'API_PORT=33001' .env && echo "PASS" || echo "FAIL"
grep 'COMPOSE_PROJECT_SUFFIX=slot-0' .env && echo "PASS" || echo "FAIL"
# Deallocate
scripts/worktree-exit.sh
# Verify clean
scripts/port-registry-status.sh  # should show 0 slots used
```

- [ ] **Step 4: Clean up any remaining test artifacts**

```bash
rm -f "$(git rev-parse --git-common-dir)/port-registry.json"
```
