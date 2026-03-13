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
