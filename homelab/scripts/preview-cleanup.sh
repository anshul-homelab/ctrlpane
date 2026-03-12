#!/usr/bin/env bash
set -euo pipefail

# Preview cleanup script
# Usage: preview-cleanup.sh <pr_number>

PR_NUMBER="${1:?Usage: preview-cleanup.sh <pr_number>}"

PREVIEW_BASE="/opt/previews"
SLOTS_DIR="$PREVIEW_BASE/slots"
DOCKER_DIR="$PREVIEW_BASE/docker"
PR_DIR="$PREVIEW_BASE/ctrlpane/pr-${PR_NUMBER}"

log() { echo "[preview-cleanup] $*" >&2; }

# Find slot for this PR
SLOT=""
for i in 1 2 3; do
  if [ -f "$SLOTS_DIR/$i.lock" ] && grep -q "PR_NUMBER=$PR_NUMBER" "$SLOTS_DIR/$i.lock" 2>/dev/null; then
    SLOT="$i"
    break
  fi
done

if [ -z "$SLOT" ]; then
  log "No preview slot found for PR #$PR_NUMBER — nothing to clean up"
  exit 0
fi

log "Cleaning up slot $SLOT for PR #$PR_NUMBER..."

# Kill processes
for pidfile in "$PR_DIR/api.pid" "$PR_DIR/web.pid"; do
  if [ -f "$pidfile" ]; then
    pid=$(cat "$pidfile")
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
      sleep 1
      kill -9 "$pid" 2>/dev/null || true
    fi
    rm -f "$pidfile"
  fi
done

# Stop Docker infra
docker compose -f "$DOCKER_DIR/preview-$SLOT.yml" down -v 2>&1 >&2 || true

# Remove PR directory
rm -rf "$PR_DIR"

# Remove lock file
rm -f "$SLOTS_DIR/$SLOT.lock" "$SLOTS_DIR/$SLOT.flock"

log "Cleanup complete for slot $SLOT, PR #$PR_NUMBER"
