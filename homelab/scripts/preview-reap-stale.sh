#!/usr/bin/env bash
set -euo pipefail

# Reap stale preview deployments (>48h or PR closed)
# Run via cron: 0 3 * * * /opt/previews/scripts/preview-reap-stale.sh

PREVIEW_BASE="/opt/previews"
SLOTS_DIR="$PREVIEW_BASE/slots"
MAX_AGE_HOURS=48

log() { echo "[preview-reap] $(date -u +%Y-%m-%dT%H:%M:%SZ) $*"; }

for lock_file in "$SLOTS_DIR"/*.lock; do
  [ -f "$lock_file" ] || continue

  # Parse lock file
  PR_NUMBER=$(grep "^PR_NUMBER=" "$lock_file" | cut -d= -f2)
  CREATED_AT=$(grep "^CREATED_AT=" "$lock_file" | cut -d= -f2)

  if [ -z "$PR_NUMBER" ] || [ -z "$CREATED_AT" ]; then
    log "WARNING: Malformed lock file $lock_file — skipping"
    continue
  fi

  # Check age
  CREATED_EPOCH=$(date -d "$CREATED_AT" +%s 2>/dev/null || date -j -f "%Y-%m-%dT%H:%M:%SZ" "$CREATED_AT" +%s 2>/dev/null || echo 0)
  NOW_EPOCH=$(date +%s)
  AGE_HOURS=$(( (NOW_EPOCH - CREATED_EPOCH) / 3600 ))

  SHOULD_REAP=false

  if [ "$AGE_HOURS" -ge "$MAX_AGE_HOURS" ]; then
    log "Slot $(basename "$lock_file" .lock) for PR #$PR_NUMBER is ${AGE_HOURS}h old (>${MAX_AGE_HOURS}h)"
    SHOULD_REAP=true
  fi

  # Check if PR is still open (requires gh CLI)
  if command -v gh >/dev/null 2>&1; then
    PR_STATE=$(gh api "/repos/anshul-homelab/ctrlpane/pulls/$PR_NUMBER" --jq '.state' 2>/dev/null || echo "unknown")
    if [ "$PR_STATE" = "closed" ] || [ "$PR_STATE" = "merged" ]; then
      log "PR #$PR_NUMBER is $PR_STATE"
      SHOULD_REAP=true
    fi
  fi

  if [ "$SHOULD_REAP" = true ]; then
    log "Reaping PR #$PR_NUMBER..."
    "$PREVIEW_BASE/scripts/preview-cleanup.sh" "$PR_NUMBER" || log "WARNING: Cleanup failed for PR #$PR_NUMBER"
  fi
done

log "Reap complete"
