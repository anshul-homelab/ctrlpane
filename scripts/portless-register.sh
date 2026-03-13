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
