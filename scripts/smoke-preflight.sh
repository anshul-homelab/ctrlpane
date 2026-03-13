#!/usr/bin/env bash
set -euo pipefail

API_PORT="${API_PORT:-33001}"
WEB_PORT="${WEB_PORT:-33000}"

echo "Checking API server at 127.0.0.1:${API_PORT}..."
if ! curl -sf "http://127.0.0.1:${API_PORT}/health/live" > /dev/null 2>&1; then
  echo "ERROR: API server not running. Start with: bun run dev"
  exit 1
fi

echo "Checking web server at 127.0.0.1:${WEB_PORT}..."
if ! curl -sf "http://127.0.0.1:${WEB_PORT}/" > /dev/null 2>&1; then
  echo "ERROR: Web server not running. Start with: bun run dev"
  exit 1
fi

echo "All servers are running."
