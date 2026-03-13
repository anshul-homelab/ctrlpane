#!/usr/bin/env bash
# Readiness probe for process-compose: checks all 4 docker containers are healthy
count=$(docker compose ps --format '{{.Health}}' 2>/dev/null | grep -c healthy)
[ "$count" -eq 4 ]
