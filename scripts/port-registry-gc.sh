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

echo "$content" > "${REGISTRY}.tmp"
mv "${REGISTRY}.tmp" "$REGISTRY"
echo "Cleaned ${cleaned} stale slot(s)"
