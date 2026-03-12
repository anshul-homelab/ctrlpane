# Preview Deployment System — Design Spec

**Date:** 2026-03-13
**Status:** Approved
**Problem:** PR branches need isolated, accessible preview environments for review without polluting production infrastructure.

## Overview

Script-based preview deployments for PR branches on the Kali mini PC (i7-12700H, 64GB RAM). Each `feat/*` PR gets an isolated environment with its own Docker infra stack, accessible via Cloudflare Tunnel at `preview-{N}.ctrlpane.dev`.

## Architecture

### Flow

- PR push (`feat/*`) -> CI preview-deploy job -> `preview-deploy.sh` on Kali
  - Allocate slot (1/2/3)
  - `docker compose -f preview-{N}.yml up` (isolated Postgres, Redis, NATS, Centrifugo)
  - Build and deploy API + Web
  - Run migrations on preview DB
  - Post preview URL as PR comment
- PR closed -> CI preview-cleanup job -> `preview-cleanup.sh` on Kali
  - Stop containers, remove artifacts, release slot lock
- Daily cron -> `preview-reap-stale.sh` — reap slots older than 48h where PR is closed/merged

### External Access

```
preview-1.ctrlpane.dev -> Cloudflare Tunnel -> localhost:34000 (web)
preview-2.ctrlpane.dev -> Cloudflare Tunnel -> localhost:35000 (web)
preview-3.ctrlpane.dev -> Cloudflare Tunnel -> localhost:36000 (web)
```

API routing: path-based proxy via Vite preview server — Web proxies `/api/*` to the local API port. No separate API subdomains needed.

Production routing (also in same tunnel):

```
ctrlpane.dev -> localhost:33000 (web)
api.ctrlpane.dev -> localhost:33001 (api)
```

## Port Allocation

Each preview slot has a contiguous port block `{base}000`-`{base}005`, avoiding all collisions with production ports.

| Slot | Web | API | Postgres | Redis | NATS | Centrifugo |
|------|-----|-----|----------|-------|------|------------|
| Production | 33000 | 33001 | 35432 | 36379 | 34222 (client) / 38222 (mgmt) | 38000 |
| Preview 1 | 34000 | 34001 | 34002 | 34003 | 34004 | 34005 |
| Preview 2 | 35000 | 35001 | 35002 | 35003 | 35004 | 35005 |
| Preview 3 | 36000 | 36001 | 36002 | 36003 | 36004 | 36005 |

## Slot Management

- Lock files at `/opt/previews/slots/{1,2,3}.lock`
- Lock file contains: `PR_NUMBER=123\nBRANCH=feat/my-feature\nSHA=abc123\nCREATED_AT=2026-03-13T10:00:00Z`
- **Atomic slot allocation:** use `flock /opt/previews/slots/{N}.lock` to prevent race conditions when concurrent CI jobs try to allocate slots. The deploy script acquires an exclusive lock before writing the slot metadata. If the lock is already held, skip to the next slot.
- Allocation: first unlocked slot. If all 3 taken, post "no slots available" comment on PR.
- Stale slot protection: slots older than 48h auto-reaped by cron.

## File Layout on Kali

```
/opt/previews/
├── slots/
│   ├── 1.lock
│   ├── 2.lock
│   └── 3.lock
├── docker/
│   ├── preview-1.yml
│   ├── preview-2.yml
│   └── preview-3.yml
├── ctrlpane/
│   ├── pr-123/
│   │   ├── api/        # Built API artifacts
│   │   ├── web/        # Built Web artifacts
│   │   ├── api.pid     # PID of running API process
│   │   ├── web.pid     # PID of running Web process
│   │   ├── api.log     # API stdout/stderr log
│   │   └── web.log     # Web stdout/stderr log
│   └── pr-456/
└── scripts/
    ├── preview-deploy.sh
    ├── preview-cleanup.sh
    └── preview-reap-stale.sh
```

## Cloudflare Tunnel Configuration

Single tunnel `ctrlpane` on Kali:

```yaml
tunnel: <ctrlpane-tunnel-id>
credentials-file: /home/anshul/.cloudflared/<ctrlpane-tunnel-id>.json

ingress:
  # Production
  - hostname: ctrlpane.dev
    service: http://localhost:33000
  - hostname: api.ctrlpane.dev
    service: http://localhost:33001
  # Previews
  - hostname: preview-1.ctrlpane.dev
    service: http://localhost:34000
  - hostname: preview-2.ctrlpane.dev
    service: http://localhost:35000
  - hostname: preview-3.ctrlpane.dev
    service: http://localhost:36000
  # Catch-all
  - service: http_status:404
```

**Note:** Tunnel routes for preview slots are static — they always exist in the config. When no preview is running on a given slot, requests to that hostname will return a 502 Bad Gateway. This is expected behavior and not an error condition.

DNS records (all CNAME -> `<tunnel-id>.cfargotunnel.com`, proxied):

- `ctrlpane.dev`
- `api.ctrlpane.dev`
- `preview-1.ctrlpane.dev`
- `preview-2.ctrlpane.dev`
- `preview-3.ctrlpane.dev`

## Script Specifications

### preview-deploy.sh

**Args:** `<pr_number> <branch> <sha> <workspace_path>`

The script receives the runner workspace path (already checked out by `actions/checkout` in the CI job) instead of cloning the repo itself. This avoids redundant clones and ensures the workspace matches the CI checkout.

**stdout/stderr contract:** All build output and log messages go to **stderr**. The script writes its result to a file at `/opt/previews/ctrlpane/pr-{PR}/deploy-result.txt` (e.g., `PREVIEW_URL=https://preview-{N}.ctrlpane.dev`). The CI step reads this file rather than capturing stdout.

**Flow:**

1. Check for existing slot for this PR (re-deploy if found)
2. If re-deploying: stop old API and Web processes (read PIDs from `api.pid` / `web.pid`, `kill` them, remove PID files)
3. If no existing slot, allocate first free slot using `flock`
4. If no free slots, write `NO_SLOT` to result file and exit 1
5. Write lock file metadata
6. `docker compose -f /opt/previews/docker/preview-{N}.yml up -d`
7. Wait for Postgres healthy (max 30s)
8. Copy source from `<workspace_path>` to `/opt/previews/ctrlpane/pr-{PR}/src`
9. `cd /opt/previews/ctrlpane/pr-{PR}/src && bun install --frozen-lockfile`
10. Set env vars (`DATABASE_URL`, `REDIS_URL`, etc. pointing to preview ports)
11. `bun run --cwd apps/api db:migrate`
12. `bun run build`
13. Copy build artifacts to `/opt/previews/ctrlpane/pr-{PR}/{api,web}/`
14. Start API: `nohup bun run /opt/previews/ctrlpane/pr-{PR}/api/index.js > /opt/previews/ctrlpane/pr-{PR}/api.log 2>&1 &` — write PID to `/opt/previews/ctrlpane/pr-{PR}/api.pid`
15. Start Web: serve built static files via `serve.js` (a small Node/Bun script that serves the Web build on `WEB_PORT` and proxies `/api/*` requests to `localhost:{API_PORT}`). See "Vite Proxy Configuration" section below. Write PID to `/opt/previews/ctrlpane/pr-{PR}/web.pid`. Logs go to `web.log`.
16. Health check: `curl -sf http://localhost:{api_port}/health/live`
17. Write `PREVIEW_URL=https://preview-{N}.ctrlpane.dev` to `/opt/previews/ctrlpane/pr-{PR}/deploy-result.txt`

### preview-cleanup.sh

**Args:** `<pr_number>`

**Flow:**

1. Find slot for PR number (scan lock files)
2. Read PIDs from `/opt/previews/ctrlpane/pr-{PR}/api.pid` and `web.pid`, kill processes (ignore errors if already stopped)
3. `docker compose -f /opt/previews/docker/preview-{N}.yml down -v`
4. Remove `/opt/previews/ctrlpane/pr-{PR}/` (artifacts, PID files, logs, result file — all cleaned)
5. Remove lock file
6. Output cleanup confirmation

### preview-reap-stale.sh

**Flow:**

1. For each lock file, check `CREATED_AT`
2. If older than 48h, check if PR is still open (via `gh api`)
3. If PR is closed/merged or slot is stale, run cleanup

## CI Workflow Changes

Since the self-hosted runners run directly on Kali, no SSH is needed — the CI job executes scripts directly.

### Updated preview-deploy job (ci.yml)

```yaml
preview-deploy:
  runs-on: self-hosted
  if: github.event_name == 'pull_request' && startsWith(github.head_ref, 'feat/')
  steps:
    - uses: actions/checkout@v4
    - name: Deploy preview
      id: deploy
      run: |
        # Use pull_request.head.sha — github.sha is the merge commit SHA
        # for PR events, which won't exist in a fresh clone.
        /opt/previews/scripts/preview-deploy.sh \
          ${{ github.event.pull_request.number }} \
          ${{ github.head_ref }} \
          ${{ github.event.pull_request.head.sha }} \
          ${{ github.workspace }}
        # Read result from the deploy-result file (not stdout)
        PR_NUM=${{ github.event.pull_request.number }}
        RESULT_FILE="/opt/previews/ctrlpane/pr-${PR_NUM}/deploy-result.txt"
        if [ -f "$RESULT_FILE" ]; then
          echo "result=$(cat $RESULT_FILE)" >> $GITHUB_OUTPUT
        fi
    - name: Post preview URL
      if: success()
      uses: actions/github-script@v7
      with:
        script: |
          const result = '${{ steps.deploy.outputs.result }}';
          const urlMatch = result.match(/PREVIEW_URL=(.*)/);
          if (urlMatch) {
            // Find and update existing comment or create new
            const comments = await github.rest.issues.listComments({
              owner: context.repo.owner,
              repo: context.repo.repo,
              issue_number: context.issue.number,
            });
            const botComment = comments.data.find(c =>
              c.body.includes('Preview deployment')
            );
            const sha = '${{ github.event.pull_request.head.sha }}'.slice(0, 7);
            const body = `### Preview deployment\n\n` +
              `Live at: ${urlMatch[1]}\n\n` +
              `Commit: \`${sha}\``;
            if (botComment) {
              await github.rest.issues.updateComment({
                owner: context.repo.owner,
                repo: context.repo.repo,
                comment_id: botComment.id,
                body,
              });
            } else {
              await github.rest.issues.createComment({
                owner: context.repo.owner,
                repo: context.repo.repo,
                issue_number: context.issue.number,
                body,
              });
            }
          }
    - name: Handle no slots
      if: failure()
      uses: actions/github-script@v7
      with:
        script: |
          await github.rest.issues.createComment({
            owner: context.repo.owner,
            repo: context.repo.repo,
            issue_number: context.issue.number,
            body: 'No preview slots available. All 3 preview environments are in use. Close another PR to free a slot.',
          });
```

### New preview-cleanup workflow

```yaml
name: Preview Cleanup

on:
  pull_request:
    types: [closed]

jobs:
  cleanup:
    runs-on: self-hosted
    steps:
      - name: Cleanup preview
        run: |
          /opt/previews/scripts/preview-cleanup.sh \
            ${{ github.event.pull_request.number }} || true
```

## Docker Compose Template (per slot)

Example for preview-1 (`/opt/previews/docker/preview-1.yml`):

```yaml
name: preview-1

services:
  postgres:
    image: postgres:17-alpine
    ports:
      - "127.0.0.1:34002:5432"
    environment:
      POSTGRES_DB: ctrlpane_preview
      POSTGRES_USER: ctrlpane_app
      POSTGRES_PASSWORD: preview_dev
    volumes:
      - preview-1-pg:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ctrlpane_app -d ctrlpane_preview"]
      interval: 5s
      timeout: 3s
      retries: 5

  redis:
    image: redis:7-alpine
    ports:
      - "127.0.0.1:34003:6379"
    command: redis-server --requirepass preview_dev --maxmemory 128mb --maxmemory-policy allkeys-lru

  nats:
    image: nats:2-alpine
    ports:
      - "127.0.0.1:34004:4222"
    command: --jetstream --store_dir /data
    volumes:
      - preview-1-nats:/data

  centrifugo:
    image: centrifugo/centrifugo:v5
    ports:
      - "127.0.0.1:34005:8000"
    command: centrifugo --health
    environment:
      CENTRIFUGO_API_KEY: preview_dev_api_key
      CENTRIFUGO_HMAC_SECRET: preview_dev_hmac_secret
      CENTRIFUGO_ALLOWED_ORIGINS: "https://preview-1.ctrlpane.dev"

volumes:
  preview-1-pg:
  preview-1-nats:
```

## Environment Variables Per Preview

Set by `preview-deploy.sh` before building/starting:

```bash
NODE_ENV=preview
DATABASE_URL=postgres://ctrlpane_app:preview_dev@localhost:34002/ctrlpane_preview
REDIS_URL=redis://:preview_dev@localhost:34003
NATS_URL=nats://localhost:34004
CENTRIFUGO_URL=http://localhost:34005
API_PORT=34001
API_HOST=127.0.0.1
WEB_PORT=34000
VITE_API_URL=/api  # Relative path — Vite proxy handles routing
```

## Vite Proxy Configuration

The preview Web build uses `VITE_API_URL=/api` so the frontend makes relative API requests. Since the built static files are served by a simple HTTP server (not Vite dev server), a small `serve.js` script handles both static file serving and API proxying:

```js
// /opt/previews/ctrlpane/pr-{PR}/web/serve.js
// Serves static build files on WEB_PORT
// Proxies /api/* requests to localhost:{API_PORT}
```

Key points:
- `VITE_API_URL=/api` is baked into the build at compile time (Vite env var)
- `serve.js` listens on `WEB_PORT` (e.g., 34000) and proxies any request matching `/api/*` to `http://localhost:{API_PORT}` (e.g., 34001)
- All other requests serve static files from the Web build output directory
- This eliminates the need for separate API subdomains per preview slot

## Security Considerations

- All preview ports bound to `127.0.0.1` (no external access except via tunnel)
- Preview databases use non-production credentials (`preview_dev`)
- Cloudflare Tunnel provides TLS termination
- Preview data is ephemeral (destroyed on cleanup)
- 48h auto-reap prevents abandoned environments
- Consider adding Cloudflare Access policy on preview subdomains (restrict to team members)

## Resource Budget

| Component | Per Slot | 3 Slots Total |
|-----------|----------|---------------|
| Postgres | 512MB | 1.5GB |
| Redis | 128MB | 384MB |
| NATS | 64MB | 192MB |
| Centrifugo | 64MB | 192MB |
| API (Bun) | 128MB | 384MB |
| Web (serve) | 64MB | 192MB |
| **Total** | **~960MB** | **~2.8GB** |

With 64GB RAM, production using ~8GB, and runners ~4GB, this leaves ~49GB headroom. No concerns.

## Dependencies / Prerequisites

1. Install `cloudflared` on Kali
2. Create Cloudflare Tunnel for ctrlpane
3. Add DNS CNAME records for `ctrlpane.dev`, `api.ctrlpane.dev`, `preview-{1,2,3}.ctrlpane.dev`
4. Create `/opt/previews/` directory structure
5. Self-hosted runners already run on Kali — scripts execute directly, no SSH needed

## Out of Scope

- Preview environments for non-feat branches
- Multi-repo preview (only ctrlpane for now, but structure supports adding more)
- Database seeding for previews (empty DB with just migrations)
- Custom preview domain per PR (always uses slot-based naming)
