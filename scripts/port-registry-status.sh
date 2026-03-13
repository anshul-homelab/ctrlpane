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
