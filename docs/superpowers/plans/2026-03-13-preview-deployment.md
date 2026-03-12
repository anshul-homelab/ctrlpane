# Preview Deployment Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement script-based preview deployments for feat/* PRs with isolated Docker infra per slot, accessible via Cloudflare Tunnel at preview-{1,2,3}.ctrlpane.dev

**Architecture:** 3 preview slots on Kali mini PC, each with isolated Docker stack (Postgres, Redis, NATS, Centrifugo) on contiguous port blocks (34000-34005, 35000-35005, 36000-36005). Shell scripts manage lifecycle. Cloudflare Tunnel provides external HTTPS access. CI workflow triggers deploy on feat/* PRs and cleanup on PR close.

**Tech Stack:** Bash, Docker Compose, Cloudflare Tunnel (cloudflared), GitHub Actions, Bun

---

## Table of Contents

- [Chunk 1: Infrastructure Setup (Tasks 1-3)](#chunk-1-infrastructure-setup-tasks-1-3)
  - [Task 1: Install cloudflared and create tunnel on Kali](#task-1-install-cloudflared-and-create-tunnel-on-kali)
  - [Task 2: Configure Cloudflare DNS and Tunnel](#task-2-configure-cloudflare-dns-and-tunnel)
  - [Task 3: Create directory structure and Docker Compose templates](#task-3-create-directory-structure-and-docker-compose-templates)
- [Chunk 2: Scripts (Tasks 4-6)](#chunk-2-scripts-tasks-4-6)
  - [Task 4: Write preview-deploy.sh](#task-4-write-preview-deploysh)
  - [Task 5: Write preview-cleanup.sh](#task-5-write-preview-cleanupsh)
  - [Task 6: Write preview-reap-stale.sh](#task-6-write-preview-reap-stalesh)
- [Chunk 3: CI Integration (Tasks 7-8)](#chunk-3-ci-integration-tasks-7-8)
  - [Task 7: Update CI workflow — replace preview-deploy placeholder](#task-7-update-ci-workflow--replace-preview-deploy-placeholder)
  - [Task 8: Add preview-cleanup workflow](#task-8-add-preview-cleanup-workflow)
- [Chunk 4: Deploy Scripts and Verify (Tasks 9-10)](#chunk-4-deploy-scripts-and-verify-tasks-9-10)
  - [Task 9: Deploy scripts and Docker templates to Kali](#task-9-deploy-scripts-and-docker-templates-to-kali)
  - [Task 10: End-to-end verification](#task-10-end-to-end-verification)

---

## Chunk 1: Infrastructure Setup (Tasks 1-3)

### Task 1: Install cloudflared and create tunnel on Kali

**Scope:** Install cloudflared binary on Kali, authenticate with Cloudflare, create a tunnel for ctrlpane. This is a manual/interactive task — the user must run these commands directly on Kali because `cloudflared login` opens a browser for OAuth approval.

**Prerequisite:** SSH access to Kali (`ssh kali`), Cloudflare account owns `ctrlpane.dev` and `ctrlpane.com`.

---

**Steps:**

- [ ] SSH into Kali
  ```bash
  ssh kali
  ```

- [ ] Install cloudflared
  ```bash
  # Option A: apt (if cloudflare repo is configured)
  curl -L --output cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
  sudo dpkg -i cloudflared.deb
  rm cloudflared.deb

  # Verify
  cloudflared --version
  ```

- [ ] Authenticate cloudflared with Cloudflare account
  ```bash
  cloudflared login
  # This opens a browser on Kali (or prints a URL to open manually).
  # Select the ctrlpane.dev zone when prompted.
  # After approval, credentials are saved to ~/.cloudflared/cert.pem
  ```

- [ ] Create the ctrlpane tunnel
  ```bash
  cloudflared tunnel create ctrlpane
  # Output will show:
  #   Tunnel credentials written to /home/anshul/.cloudflared/<TUNNEL_ID>.json
  #   Created tunnel ctrlpane with id <TUNNEL_ID>
  ```

- [ ] Record the tunnel ID for use in Task 2
  ```bash
  # Save tunnel ID to a known location for reference
  cloudflared tunnel list | grep ctrlpane
  # Note: TUNNEL_ID will be a UUID like a1b2c3d4-e5f6-7890-abcd-ef1234567890
  ```

**Commit:** None (manual infrastructure setup, no repo changes).

---

### Task 2: Configure Cloudflare DNS and Tunnel

**Scope:** Add CNAME DNS records pointing preview subdomains and production domains to the tunnel, write the tunnel config file, install cloudflared as a systemd service.

**Prerequisite:** Task 1 complete — tunnel ID and credentials file path known.

---

**Steps:**

- [ ] Add DNS CNAME records via cloudflared CLI (run on Kali)
  ```bash
  TUNNEL_ID="<tunnel-id-from-task-1>"

  # Production
  cloudflared tunnel route dns ctrlpane ctrlpane.dev
  cloudflared tunnel route dns ctrlpane api.ctrlpane.dev

  # Previews
  cloudflared tunnel route dns ctrlpane preview-1.ctrlpane.dev
  cloudflared tunnel route dns ctrlpane preview-2.ctrlpane.dev
  cloudflared tunnel route dns ctrlpane preview-3.ctrlpane.dev
  ```
  Each command creates a proxied CNAME record `<hostname> -> <TUNNEL_ID>.cfargotunnel.com`.

- [ ] Write tunnel configuration file
  ```bash
  cat > /home/anshul/.cloudflared/config-ctrlpane.yml << 'YAML'
  tunnel: <TUNNEL_ID>
  credentials-file: /home/anshul/.cloudflared/<TUNNEL_ID>.json

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
    # Catch-all (required by cloudflared)
    - service: http_status:404
  YAML
  ```
  Replace `<TUNNEL_ID>` with the actual tunnel UUID from Task 1.

- [ ] Test tunnel connectivity before installing as service
  ```bash
  cloudflared tunnel --config /home/anshul/.cloudflared/config-ctrlpane.yml run ctrlpane
  # Verify it connects (look for "Connection registered" in output)
  # Ctrl-C to stop
  ```

- [ ] Install cloudflared as a systemd service
  ```bash
  sudo cloudflared service install --config /home/anshul/.cloudflared/config-ctrlpane.yml
  sudo systemctl enable cloudflared
  sudo systemctl start cloudflared
  sudo systemctl status cloudflared
  ```

- [ ] Verify tunnel is active
  ```bash
  # Check tunnel status from Cloudflare side
  cloudflared tunnel info ctrlpane

  # Verify DNS resolution (from any machine)
  dig preview-1.ctrlpane.dev CNAME
  ```

**Commit:** None (manual infrastructure setup, no repo changes).

---

### Task 3: Create directory structure and Docker Compose templates

**Scope:** Create the `/opt/previews/` directory tree on Kali and write 3 Docker Compose files into the repo at `homelab/docker/`. Also update `homelab/bootstrap.sh` to create the full preview directory structure.

**Files:**
- Create: `homelab/docker/preview-1.yml`
- Create: `homelab/docker/preview-2.yml`
- Create: `homelab/docker/preview-3.yml`
- Modify: `homelab/bootstrap.sh`

---

**Steps:**

- [ ] Create directory structure on Kali (manual, run via `ssh kali`)
  ```bash
  sudo mkdir -p /opt/previews/{slots,docker,ctrlpane,scripts}
  sudo chown -R anshul:anshul /opt/previews
  ```

- [ ] Create `homelab/docker/` directory in the repo
  ```bash
  mkdir -p homelab/docker
  ```

- [ ] Write `homelab/docker/preview-1.yml`

  **Code — `homelab/docker/preview-1.yml`:**
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

- [ ] Write `homelab/docker/preview-2.yml`

  **Code — `homelab/docker/preview-2.yml`:**
  ```yaml
  name: preview-2

  services:
    postgres:
      image: postgres:17-alpine
      ports:
        - "127.0.0.1:35002:5432"
      environment:
        POSTGRES_DB: ctrlpane_preview
        POSTGRES_USER: ctrlpane_app
        POSTGRES_PASSWORD: preview_dev
      volumes:
        - preview-2-pg:/var/lib/postgresql/data
      healthcheck:
        test: ["CMD-SHELL", "pg_isready -U ctrlpane_app -d ctrlpane_preview"]
        interval: 5s
        timeout: 3s
        retries: 5

    redis:
      image: redis:7-alpine
      ports:
        - "127.0.0.1:35003:6379"
      command: redis-server --requirepass preview_dev --maxmemory 128mb --maxmemory-policy allkeys-lru

    nats:
      image: nats:2-alpine
      ports:
        - "127.0.0.1:35004:4222"
      command: --jetstream --store_dir /data
      volumes:
        - preview-2-nats:/data

    centrifugo:
      image: centrifugo/centrifugo:v5
      ports:
        - "127.0.0.1:35005:8000"
      command: centrifugo --health
      environment:
        CENTRIFUGO_API_KEY: preview_dev_api_key
        CENTRIFUGO_HMAC_SECRET: preview_dev_hmac_secret
        CENTRIFUGO_ALLOWED_ORIGINS: "https://preview-2.ctrlpane.dev"

  volumes:
    preview-2-pg:
    preview-2-nats:
  ```

- [ ] Write `homelab/docker/preview-3.yml`

  **Code — `homelab/docker/preview-3.yml`:**
  ```yaml
  name: preview-3

  services:
    postgres:
      image: postgres:17-alpine
      ports:
        - "127.0.0.1:36002:5432"
      environment:
        POSTGRES_DB: ctrlpane_preview
        POSTGRES_USER: ctrlpane_app
        POSTGRES_PASSWORD: preview_dev
      volumes:
        - preview-3-pg:/var/lib/postgresql/data
      healthcheck:
        test: ["CMD-SHELL", "pg_isready -U ctrlpane_app -d ctrlpane_preview"]
        interval: 5s
        timeout: 3s
        retries: 5

    redis:
      image: redis:7-alpine
      ports:
        - "127.0.0.1:36003:6379"
      command: redis-server --requirepass preview_dev --maxmemory 128mb --maxmemory-policy allkeys-lru

    nats:
      image: nats:2-alpine
      ports:
        - "127.0.0.1:36004:4222"
      command: --jetstream --store_dir /data
      volumes:
        - preview-3-nats:/data

    centrifugo:
      image: centrifugo/centrifugo:v5
      ports:
        - "127.0.0.1:36005:8000"
      command: centrifugo --health
      environment:
        CENTRIFUGO_API_KEY: preview_dev_api_key
        CENTRIFUGO_HMAC_SECRET: preview_dev_hmac_secret
        CENTRIFUGO_ALLOWED_ORIGINS: "https://preview-3.ctrlpane.dev"

  volumes:
    preview-3-pg:
    preview-3-nats:
  ```

- [ ] Update `homelab/bootstrap.sh` to create the full preview directory structure

  Add after the existing `sudo mkdir -p /opt/ctrlpane/{api/releases,web/releases,backups,previews}` line:

  ```bash
  # Preview deployment directories
  sudo mkdir -p /opt/previews/{slots,docker,ctrlpane,scripts}
  sudo chown -R anshul:anshul /opt/previews
  ```

**Commit:** `feat(deploy): add Docker Compose templates for preview slots`

---

## Chunk 2: Scripts (Tasks 4-6)

### Task 4: Write preview-deploy.sh

**Scope:** Full deployment script that allocates a preview slot, starts Docker infra, builds the app, runs migrations, starts API and Web processes, and writes the result file.

**Files:**
- Create: `homelab/scripts/preview-deploy.sh`

**Prerequisite:** Task 3 complete (Docker Compose files and directory structure exist).

---

**Steps:**

- [ ] Create `homelab/scripts/` directory
  ```bash
  mkdir -p homelab/scripts
  ```

- [ ] Write `homelab/scripts/preview-deploy.sh`

  **Code — `homelab/scripts/preview-deploy.sh`:**
  ```bash
  #!/usr/bin/env bash
  set -euo pipefail

  # preview-deploy.sh — Deploy a PR to a preview slot
  # Usage: preview-deploy.sh <pr_number> <branch> <sha> <workspace_path>
  #
  # All build output goes to stderr. Results written to deploy-result.txt.
  # Designed to run directly on Kali (self-hosted runner, no SSH).

  log() { echo "[preview-deploy] $*" >&2; }
  die() { log "FATAL: $*"; exit 1; }

  # ------------------------------------------------------------------
  # 1. Parse args
  # ------------------------------------------------------------------
  PR_NUMBER="${1:?Usage: preview-deploy.sh <pr_number> <branch> <sha> <workspace_path>}"
  BRANCH="${2:?Missing branch}"
  SHA="${3:?Missing sha}"
  WORKSPACE="${4:?Missing workspace_path}"

  PREVIEWS_ROOT="/opt/previews"
  SLOTS_DIR="${PREVIEWS_ROOT}/slots"
  DOCKER_DIR="${PREVIEWS_ROOT}/docker"
  PR_DIR="${PREVIEWS_ROOT}/ctrlpane/pr-${PR_NUMBER}"
  SRC_DIR="${PR_DIR}/src"

  # Port bases per slot (slot 1 = 34xxx, slot 2 = 35xxx, slot 3 = 36xxx)
  SLOT_BASES=(0 34 35 36) # index 0 unused; slots are 1-indexed

  log "Deploying PR #${PR_NUMBER} (${BRANCH} @ ${SHA:0:7})"

  # ------------------------------------------------------------------
  # 2. Check for existing slot (re-deploy flow)
  # ------------------------------------------------------------------
  EXISTING_SLOT=""
  for SLOT in 1 2 3; do
    LOCK_FILE="${SLOTS_DIR}/${SLOT}.lock"
    if [ -f "${LOCK_FILE}" ] && grep -q "^PR_NUMBER=${PR_NUMBER}$" "${LOCK_FILE}" 2>/dev/null; then
      EXISTING_SLOT="${SLOT}"
      log "Found existing slot ${SLOT} for PR #${PR_NUMBER} — re-deploying"
      break
    fi
  done

  # If re-deploying, kill old processes first
  if [ -n "${EXISTING_SLOT}" ]; then
    log "Stopping old processes for PR #${PR_NUMBER}"
    for PID_FILE in "${PR_DIR}/api.pid" "${PR_DIR}/web.pid"; do
      if [ -f "${PID_FILE}" ]; then
        OLD_PID=$(cat "${PID_FILE}")
        if kill -0 "${OLD_PID}" 2>/dev/null; then
          kill "${OLD_PID}" 2>/dev/null || true
          log "Killed process ${OLD_PID}"
        fi
        rm -f "${PID_FILE}"
      fi
    done
    # Small delay to let ports free up
    sleep 2
  fi

  # ------------------------------------------------------------------
  # 3. Allocate slot using flock (if no existing slot)
  # ------------------------------------------------------------------
  SLOT="${EXISTING_SLOT}"

  if [ -z "${SLOT}" ]; then
    for CANDIDATE in 1 2 3; do
      LOCK_FILE="${SLOTS_DIR}/${CANDIDATE}.lock"

      # Try to acquire exclusive lock (non-blocking)
      # flock -n will fail immediately if lock is held by another process.
      # We also check if the lock file has content (meaning a deployment owns it).
      if [ -f "${LOCK_FILE}" ] && [ -s "${LOCK_FILE}" ]; then
        log "Slot ${CANDIDATE} is occupied ($(head -1 "${LOCK_FILE}"))"
        continue
      fi

      # Try to atomically claim the slot
      exec 200>"${LOCK_FILE}"
      if flock -n 200; then
        SLOT="${CANDIDATE}"
        log "Allocated slot ${SLOT}"
        flock -u 200
        exec 200>&-
        break
      fi
      exec 200>&-
    done
  fi

  if [ -z "${SLOT}" ]; then
    # No slots available — write result and exit
    mkdir -p "${PR_DIR}"
    echo "NO_SLOT" > "${PR_DIR}/deploy-result.txt"
    die "No preview slots available. All 3 slots are in use."
  fi

  # ------------------------------------------------------------------
  # 4. Write lock file metadata
  # ------------------------------------------------------------------
  LOCK_FILE="${SLOTS_DIR}/${SLOT}.lock"
  cat > "${LOCK_FILE}" << EOF
  PR_NUMBER=${PR_NUMBER}
  BRANCH=${BRANCH}
  SHA=${SHA}
  CREATED_AT=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  EOF
  log "Lock file written: ${LOCK_FILE}"

  # ------------------------------------------------------------------
  # 5. Compute port block for this slot
  # ------------------------------------------------------------------
  BASE="${SLOT_BASES[${SLOT}]}"
  WEB_PORT="${BASE}000"
  API_PORT="${BASE}001"
  PG_PORT="${BASE}002"
  REDIS_PORT="${BASE}003"
  NATS_PORT="${BASE}004"
  CENTRIFUGO_PORT="${BASE}005"

  log "Slot ${SLOT} ports: web=${WEB_PORT} api=${API_PORT} pg=${PG_PORT} redis=${REDIS_PORT} nats=${NATS_PORT} centrifugo=${CENTRIFUGO_PORT}"

  # ------------------------------------------------------------------
  # 6. Start Docker infra
  # ------------------------------------------------------------------
  COMPOSE_FILE="${DOCKER_DIR}/preview-${SLOT}.yml"
  log "Starting Docker infra: ${COMPOSE_FILE}"
  docker compose -f "${COMPOSE_FILE}" up -d >&2

  # ------------------------------------------------------------------
  # 7. Wait for Postgres healthy (max 30s)
  # ------------------------------------------------------------------
  log "Waiting for Postgres to be healthy..."
  RETRIES=0
  MAX_RETRIES=30
  until docker compose -f "${COMPOSE_FILE}" exec -T postgres pg_isready -U ctrlpane_app -d ctrlpane_preview >/dev/null 2>&1; do
    RETRIES=$((RETRIES + 1))
    if [ "${RETRIES}" -ge "${MAX_RETRIES}" ]; then
      die "Postgres not healthy after ${MAX_RETRIES}s"
    fi
    sleep 1
  done
  log "Postgres is healthy"

  # ------------------------------------------------------------------
  # 8. Copy workspace to PR source directory
  # ------------------------------------------------------------------
  mkdir -p "${SRC_DIR}"
  log "Copying workspace from ${WORKSPACE} to ${SRC_DIR}"
  rsync -a --delete \
    --exclude node_modules \
    --exclude .git \
    --exclude dist \
    --exclude coverage \
    --exclude .turbo \
    "${WORKSPACE}/" "${SRC_DIR}/"

  # ------------------------------------------------------------------
  # 9. Install dependencies
  # ------------------------------------------------------------------
  log "Installing dependencies..."
  cd "${SRC_DIR}"
  bun install --frozen-lockfile >&2

  # ------------------------------------------------------------------
  # 10. Set env vars for preview
  # ------------------------------------------------------------------
  export NODE_ENV=preview
  export DATABASE_URL="postgres://ctrlpane_app:preview_dev@localhost:${PG_PORT}/ctrlpane_preview"
  export REDIS_URL="redis://:preview_dev@localhost:${REDIS_PORT}"
  export NATS_URL="nats://localhost:${NATS_PORT}"
  export CENTRIFUGO_URL="http://localhost:${CENTRIFUGO_PORT}"
  export API_PORT="${API_PORT}"
  export API_HOST="127.0.0.1"
  export WEB_PORT="${WEB_PORT}"
  export VITE_API_URL="/api"

  # ------------------------------------------------------------------
  # 11. Run database migrations
  # ------------------------------------------------------------------
  log "Running database migrations..."
  bun run --cwd packages/db migrate >&2

  # ------------------------------------------------------------------
  # 12. Build all packages
  # ------------------------------------------------------------------
  log "Building..."
  bun run build >&2

  # ------------------------------------------------------------------
  # 13. Copy build artifacts
  # ------------------------------------------------------------------
  mkdir -p "${PR_DIR}/api" "${PR_DIR}/web"

  # API build output
  cp -r "${SRC_DIR}/apps/api/dist/"* "${PR_DIR}/api/"
  # Also copy node_modules needed at runtime (bun needs them for imports)
  cp -r "${SRC_DIR}/node_modules" "${PR_DIR}/api/node_modules" 2>/dev/null || true
  cp -r "${SRC_DIR}/packages" "${PR_DIR}/api/packages" 2>/dev/null || true

  # Web build output (Vite outputs to apps/web/dist/)
  cp -r "${SRC_DIR}/apps/web/dist/"* "${PR_DIR}/web/"

  log "Build artifacts copied"

  # ------------------------------------------------------------------
  # 14. Start API process
  # ------------------------------------------------------------------
  log "Starting API on port ${API_PORT}..."
  nohup bun run "${PR_DIR}/api/index.js" \
    > "${PR_DIR}/api.log" 2>&1 &
  API_PID=$!
  echo "${API_PID}" > "${PR_DIR}/api.pid"
  log "API started (PID: ${API_PID})"

  # ------------------------------------------------------------------
  # 15. Write serve.js and start Web process
  # ------------------------------------------------------------------
  cat > "${PR_DIR}/web/serve.js" << 'SERVEJS'
  // serve.js — Static file server with /api proxy for preview deployments
  // Serves Vite build output and proxies /api/* to the local API port.

  const path = require("path");
  const http = require("http");
  const fs = require("fs");

  const WEB_PORT = parseInt(process.env.WEB_PORT || "34000", 10);
  const API_PORT = parseInt(process.env.API_PORT || "34001", 10);
  const STATIC_DIR = __dirname; // serve.js lives in the web build dir

  const MIME_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".js":   "application/javascript; charset=utf-8",
    ".mjs":  "application/javascript; charset=utf-8",
    ".css":  "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png":  "image/png",
    ".jpg":  "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif":  "image/gif",
    ".svg":  "image/svg+xml",
    ".ico":  "image/x-icon",
    ".woff": "font/woff",
    ".woff2":"font/woff2",
    ".ttf":  "font/ttf",
    ".map":  "application/json",
  };

  function proxyToApi(req, res) {
    const options = {
      hostname: "127.0.0.1",
      port: API_PORT,
      path: req.url,
      method: req.method,
      headers: { ...req.headers, host: `127.0.0.1:${API_PORT}` },
    };

    const proxy = http.request(options, (proxyRes) => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res, { end: true });
    });

    proxy.on("error", (err) => {
      console.error(`[serve.js] API proxy error: ${err.message}`);
      res.writeHead(502, { "Content-Type": "text/plain" });
      res.end("Bad Gateway — API not available");
    });

    req.pipe(proxy, { end: true });
  }

  function serveStatic(req, res) {
    let filePath = path.join(STATIC_DIR, req.url === "/" ? "index.html" : req.url);

    // Security: prevent path traversal
    if (!filePath.startsWith(STATIC_DIR)) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }

    fs.stat(filePath, (err, stats) => {
      if (err || !stats.isFile()) {
        // SPA fallback: serve index.html for non-file routes
        filePath = path.join(STATIC_DIR, "index.html");
      }

      fs.readFile(filePath, (readErr, data) => {
        if (readErr) {
          res.writeHead(404);
          res.end("Not Found");
          return;
        }
        const ext = path.extname(filePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || "application/octet-stream";

        // Cache hashed assets aggressively, everything else short-cache
        const cacheControl = filePath.includes("/assets/")
          ? "public, max-age=31536000, immutable"
          : "public, max-age=60";

        res.writeHead(200, {
          "Content-Type": contentType,
          "Content-Length": data.length,
          "Cache-Control": cacheControl,
        });
        res.end(data);
      });
    });
  }

  const server = http.createServer((req, res) => {
    if (req.url.startsWith("/api")) {
      proxyToApi(req, res);
    } else {
      serveStatic(req, res);
    }
  });

  server.listen(WEB_PORT, "127.0.0.1", () => {
    console.log(`[serve.js] Listening on http://127.0.0.1:${WEB_PORT}`);
    console.log(`[serve.js] Proxying /api/* -> http://127.0.0.1:${API_PORT}`);
  });
  SERVEJS

  log "Starting Web server on port ${WEB_PORT}..."
  nohup bun run "${PR_DIR}/web/serve.js" \
    > "${PR_DIR}/web.log" 2>&1 &
  WEB_PID=$!
  echo "${WEB_PID}" > "${PR_DIR}/web.pid"
  log "Web started (PID: ${WEB_PID})"

  # ------------------------------------------------------------------
  # 16. Health check
  # ------------------------------------------------------------------
  log "Running health check..."
  sleep 3 # Give processes a moment to start

  HEALTH_RETRIES=0
  HEALTH_MAX=10
  until curl -sf "http://localhost:${API_PORT}/health/live" >/dev/null 2>&1; do
    HEALTH_RETRIES=$((HEALTH_RETRIES + 1))
    if [ "${HEALTH_RETRIES}" -ge "${HEALTH_MAX}" ]; then
      log "WARNING: API health check failed after ${HEALTH_MAX} attempts"
      log "API log tail:"
      tail -20 "${PR_DIR}/api.log" >&2 || true
      break
    fi
    sleep 1
  done

  if [ "${HEALTH_RETRIES}" -lt "${HEALTH_MAX}" ]; then
    log "Health check passed"
  fi

  # ------------------------------------------------------------------
  # 17. Write deploy result
  # ------------------------------------------------------------------
  PREVIEW_URL="https://preview-${SLOT}.ctrlpane.dev"
  echo "PREVIEW_URL=${PREVIEW_URL}" > "${PR_DIR}/deploy-result.txt"
  log "Deploy complete! Preview at: ${PREVIEW_URL}"
  ```

- [ ] Make the script executable
  ```bash
  chmod +x homelab/scripts/preview-deploy.sh
  ```

- [ ] Verify script syntax
  ```bash
  bash -n homelab/scripts/preview-deploy.sh
  ```

**Commit:** `feat(deploy): add preview-deploy.sh script`

---

### Task 5: Write preview-cleanup.sh

**Scope:** Script to tear down a preview deployment — stop processes, destroy Docker containers, remove artifacts, release slot lock.

**Files:**
- Create: `homelab/scripts/preview-cleanup.sh`

**Prerequisite:** Task 4 complete (shared conventions established).

---

**Steps:**

- [ ] Write `homelab/scripts/preview-cleanup.sh`

  **Code — `homelab/scripts/preview-cleanup.sh`:**
  ```bash
  #!/usr/bin/env bash
  set -euo pipefail

  # preview-cleanup.sh — Clean up a preview deployment
  # Usage: preview-cleanup.sh <pr_number>
  #
  # Finds the slot for the given PR, stops processes, tears down Docker,
  # removes artifacts, and releases the slot lock.

  log() { echo "[preview-cleanup] $*" >&2; }
  die() { log "FATAL: $*"; exit 1; }

  # ------------------------------------------------------------------
  # 1. Parse args
  # ------------------------------------------------------------------
  PR_NUMBER="${1:?Usage: preview-cleanup.sh <pr_number>}"

  PREVIEWS_ROOT="/opt/previews"
  SLOTS_DIR="${PREVIEWS_ROOT}/slots"
  DOCKER_DIR="${PREVIEWS_ROOT}/docker"
  PR_DIR="${PREVIEWS_ROOT}/ctrlpane/pr-${PR_NUMBER}"

  log "Cleaning up PR #${PR_NUMBER}"

  # ------------------------------------------------------------------
  # 2. Find slot for this PR
  # ------------------------------------------------------------------
  SLOT=""
  for CANDIDATE in 1 2 3; do
    LOCK_FILE="${SLOTS_DIR}/${CANDIDATE}.lock"
    if [ -f "${LOCK_FILE}" ] && grep -q "^PR_NUMBER=${PR_NUMBER}$" "${LOCK_FILE}" 2>/dev/null; then
      SLOT="${CANDIDATE}"
      break
    fi
  done

  if [ -z "${SLOT}" ]; then
    log "No slot found for PR #${PR_NUMBER} — may already be cleaned up"
    exit 0
  fi

  log "Found PR #${PR_NUMBER} in slot ${SLOT}"

  # ------------------------------------------------------------------
  # 3. Kill API and Web processes
  # ------------------------------------------------------------------
  for SERVICE in api web; do
    PID_FILE="${PR_DIR}/${SERVICE}.pid"
    if [ -f "${PID_FILE}" ]; then
      PID=$(cat "${PID_FILE}")
      if kill -0 "${PID}" 2>/dev/null; then
        log "Stopping ${SERVICE} (PID: ${PID})"
        kill "${PID}" 2>/dev/null || true
        # Wait up to 5s for graceful shutdown
        for _ in $(seq 1 5); do
          kill -0 "${PID}" 2>/dev/null || break
          sleep 1
        done
        # Force kill if still running
        if kill -0 "${PID}" 2>/dev/null; then
          log "Force killing ${SERVICE} (PID: ${PID})"
          kill -9 "${PID}" 2>/dev/null || true
        fi
      else
        log "${SERVICE} process ${PID} already stopped"
      fi
      rm -f "${PID_FILE}"
    fi
  done

  # ------------------------------------------------------------------
  # 4. Tear down Docker infra
  # ------------------------------------------------------------------
  COMPOSE_FILE="${DOCKER_DIR}/preview-${SLOT}.yml"
  if [ -f "${COMPOSE_FILE}" ]; then
    log "Stopping Docker containers for slot ${SLOT}"
    docker compose -f "${COMPOSE_FILE}" down -v >&2 2>/dev/null || true
  fi

  # ------------------------------------------------------------------
  # 5. Remove PR directory (artifacts, PID files, logs, result file)
  # ------------------------------------------------------------------
  if [ -d "${PR_DIR}" ]; then
    log "Removing ${PR_DIR}"
    rm -rf "${PR_DIR}"
  fi

  # ------------------------------------------------------------------
  # 6. Remove lock file
  # ------------------------------------------------------------------
  LOCK_FILE="${SLOTS_DIR}/${SLOT}.lock"
  rm -f "${LOCK_FILE}"
  log "Released slot ${SLOT}"

  log "Cleanup complete for PR #${PR_NUMBER}"
  ```

- [ ] Make the script executable
  ```bash
  chmod +x homelab/scripts/preview-cleanup.sh
  ```

- [ ] Verify script syntax
  ```bash
  bash -n homelab/scripts/preview-cleanup.sh
  ```

**Commit:** `feat(deploy): add preview-cleanup.sh script`

---

### Task 6: Write preview-reap-stale.sh

**Scope:** Cron-friendly script that scans for stale preview slots (>48h old with closed/merged PRs) and cleans them up.

**Files:**
- Create: `homelab/scripts/preview-reap-stale.sh`

**Prerequisite:** Task 5 complete (cleanup script exists to delegate to).

---

**Steps:**

- [ ] Write `homelab/scripts/preview-reap-stale.sh`

  **Code — `homelab/scripts/preview-reap-stale.sh`:**
  ```bash
  #!/usr/bin/env bash
  set -euo pipefail

  # preview-reap-stale.sh — Reap stale preview deployments
  # Usage: preview-reap-stale.sh (no args, run via cron)
  #
  # Scans all lock files. If a slot is older than 48h AND the PR is
  # closed/merged, runs preview-cleanup.sh for that PR.

  log() { echo "[preview-reap] $(date -u +"%Y-%m-%dT%H:%M:%SZ") $*" >&2; }

  PREVIEWS_ROOT="/opt/previews"
  SLOTS_DIR="${PREVIEWS_ROOT}/slots"
  SCRIPTS_DIR="${PREVIEWS_ROOT}/scripts"
  STALE_THRESHOLD_SECONDS=$((48 * 60 * 60)) # 48 hours

  REPO="ctrlpane/ctrlpane" # GitHub owner/repo for gh api calls

  log "Starting stale preview reap"

  REAPED=0

  for SLOT in 1 2 3; do
    LOCK_FILE="${SLOTS_DIR}/${SLOT}.lock"

    if [ ! -f "${LOCK_FILE}" ] || [ ! -s "${LOCK_FILE}" ]; then
      continue
    fi

    # Parse lock file
    PR_NUMBER=""
    CREATED_AT=""
    while IFS='=' read -r KEY VALUE; do
      # Trim leading whitespace from KEY
      KEY=$(echo "${KEY}" | xargs)
      case "${KEY}" in
        PR_NUMBER) PR_NUMBER="${VALUE}" ;;
        CREATED_AT) CREATED_AT="${VALUE}" ;;
      esac
    done < "${LOCK_FILE}"

    if [ -z "${PR_NUMBER}" ] || [ -z "${CREATED_AT}" ]; then
      log "Slot ${SLOT}: malformed lock file, skipping"
      continue
    fi

    # Check age
    CREATED_EPOCH=$(date -d "${CREATED_AT}" +%s 2>/dev/null || date -j -f "%Y-%m-%dT%H:%M:%SZ" "${CREATED_AT}" +%s 2>/dev/null || echo "0")
    NOW_EPOCH=$(date +%s)
    AGE_SECONDS=$((NOW_EPOCH - CREATED_EPOCH))

    if [ "${AGE_SECONDS}" -lt "${STALE_THRESHOLD_SECONDS}" ]; then
      log "Slot ${SLOT}: PR #${PR_NUMBER} is ${AGE_SECONDS}s old (< 48h), skipping"
      continue
    fi

    log "Slot ${SLOT}: PR #${PR_NUMBER} is older than 48h (${AGE_SECONDS}s)"

    # Check PR status via GitHub API
    PR_STATE=$(gh api "repos/${REPO}/pulls/${PR_NUMBER}" --jq '.state' 2>/dev/null || echo "unknown")

    if [ "${PR_STATE}" = "open" ]; then
      log "Slot ${SLOT}: PR #${PR_NUMBER} is still open, skipping"
      continue
    fi

    log "Slot ${SLOT}: PR #${PR_NUMBER} state=${PR_STATE}, reaping"
    "${SCRIPTS_DIR}/preview-cleanup.sh" "${PR_NUMBER}" || {
      log "WARNING: cleanup failed for PR #${PR_NUMBER}"
    }
    REAPED=$((REAPED + 1))
  done

  log "Reap complete. Cleaned ${REAPED} stale slot(s)."
  ```

- [ ] Make the script executable
  ```bash
  chmod +x homelab/scripts/preview-reap-stale.sh
  ```

- [ ] Verify script syntax
  ```bash
  bash -n homelab/scripts/preview-reap-stale.sh
  ```

**Commit:** `feat(deploy): add preview-reap-stale.sh cron script`

---

## Chunk 3: CI Integration (Tasks 7-8)

### Task 7: Update CI workflow — replace preview-deploy placeholder

**Scope:** Replace the placeholder `preview-deploy` job in `.github/workflows/ci.yml` (lines 311-325) with the real implementation that runs `preview-deploy.sh`, reads the result file, and posts/updates a PR comment with the preview URL.

**Files:**
- Modify: `.github/workflows/ci.yml`

**Prerequisite:** Task 4 complete (preview-deploy.sh exists in repo).

---

**Steps:**

- [ ] Replace the `preview-deploy` job in `.github/workflows/ci.yml`

  **Replace lines 311-325** (the entire `preview-deploy` job) with:

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

- [ ] Verify YAML syntax
  ```bash
  # Quick YAML validation (requires yq or python)
  python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml'))"
  ```

**Commit:** `feat(ci): implement preview-deploy job in CI workflow`

---

### Task 8: Add preview-cleanup workflow

**Scope:** Create a new GitHub Actions workflow that triggers when a PR is closed and runs the cleanup script.

**Files:**
- Create: `.github/workflows/preview-cleanup.yml`

**Prerequisite:** Task 5 complete (preview-cleanup.sh exists in repo).

---

**Steps:**

- [ ] Write `.github/workflows/preview-cleanup.yml`

  **Code — `.github/workflows/preview-cleanup.yml`:**
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

- [ ] Verify YAML syntax
  ```bash
  python3 -c "import yaml; yaml.safe_load(open('.github/workflows/preview-cleanup.yml'))"
  ```

**Commit:** `feat(ci): add preview-cleanup workflow for PR close events`

---

## Chunk 4: Deploy Scripts and Verify (Tasks 9-10)

### Task 9: Deploy scripts and Docker templates to Kali

**Scope:** Copy the repo's `homelab/scripts/` and `homelab/docker/` files to `/opt/previews/` on Kali. Set up cron for the reap script. This is a manual/interactive task.

**Prerequisite:** Tasks 3-6 complete (all scripts and Docker Compose files written and committed). Task 2 complete (cloudflared running).

---

**Steps:**

- [ ] Copy scripts to Kali (run from repo root on Kali, or via SSH)
  ```bash
  # If running on Kali directly (e.g., after git pull):
  cp homelab/scripts/preview-deploy.sh /opt/previews/scripts/
  cp homelab/scripts/preview-cleanup.sh /opt/previews/scripts/
  cp homelab/scripts/preview-reap-stale.sh /opt/previews/scripts/
  chmod +x /opt/previews/scripts/*.sh
  ```

- [ ] Copy Docker Compose templates to Kali
  ```bash
  cp homelab/docker/preview-1.yml /opt/previews/docker/
  cp homelab/docker/preview-2.yml /opt/previews/docker/
  cp homelab/docker/preview-3.yml /opt/previews/docker/
  ```

- [ ] Set up cron for stale reaping (daily at 3:00 AM)
  ```bash
  # Add to crontab
  (crontab -l 2>/dev/null; echo "0 3 * * * /opt/previews/scripts/preview-reap-stale.sh >> /opt/previews/reap.log 2>&1") | crontab -
  # Verify
  crontab -l | grep preview-reap
  ```

- [ ] Create empty slot lock files (touch, so flock can operate)
  ```bash
  touch /opt/previews/slots/1.lock
  touch /opt/previews/slots/2.lock
  touch /opt/previews/slots/3.lock
  ```

- [ ] Verify directory structure
  ```bash
  find /opt/previews -type f | sort
  # Expected:
  # /opt/previews/docker/preview-1.yml
  # /opt/previews/docker/preview-2.yml
  # /opt/previews/docker/preview-3.yml
  # /opt/previews/scripts/preview-cleanup.sh
  # /opt/previews/scripts/preview-deploy.sh
  # /opt/previews/scripts/preview-reap-stale.sh
  # /opt/previews/slots/1.lock
  # /opt/previews/slots/2.lock
  # /opt/previews/slots/3.lock
  ```

**Commit:** None (manual infrastructure deployment, no repo changes).

---

### Task 10: End-to-end verification

**Scope:** Verify the entire preview deployment pipeline works end-to-end: push a feat branch, observe CI deploys preview, check the URL, close PR, observe cleanup.

**Prerequisite:** All previous tasks complete. CI has the updated workflows. Scripts are deployed to `/opt/previews/`. Cloudflare Tunnel is running.

---

**Steps:**

- [ ] Verify Cloudflare Tunnel is running on Kali
  ```bash
  ssh kali "sudo systemctl status cloudflared"
  cloudflared tunnel info ctrlpane
  ```

- [ ] Verify Docker images are pulled (pre-pull to speed up first deploy)
  ```bash
  ssh kali "docker pull postgres:17-alpine && docker pull redis:7-alpine && docker pull nats:2-alpine && docker pull centrifugo/centrifugo:v5"
  ```

- [ ] Test preview-deploy.sh manually (dry run on Kali)
  ```bash
  # On Kali, from a checkout of the repo:
  cd /tmp
  git clone <repo-url> test-preview
  cd test-preview
  /opt/previews/scripts/preview-deploy.sh 9999 feat/test-preview abc1234 /tmp/test-preview
  # Check result file
  cat /opt/previews/ctrlpane/pr-9999/deploy-result.txt
  # Verify processes are running
  cat /opt/previews/ctrlpane/pr-9999/api.pid
  cat /opt/previews/ctrlpane/pr-9999/web.pid
  # Check web responds
  curl -I http://localhost:34000/
  # Check API health
  curl http://localhost:34001/health/live
  ```

- [ ] Verify preview is accessible via Cloudflare Tunnel
  ```bash
  curl -I https://preview-1.ctrlpane.dev/
  ```

- [ ] Test cleanup
  ```bash
  /opt/previews/scripts/preview-cleanup.sh 9999
  # Verify slot is released
  cat /opt/previews/slots/1.lock  # Should be empty or missing
  # Verify Docker containers are gone
  docker ps | grep preview-1  # Should return nothing
  # Verify PR directory is removed
  ls /opt/previews/ctrlpane/pr-9999  # Should not exist
  ```

- [ ] Push a real feat/* PR and observe CI
  ```bash
  # Create a test branch
  git checkout -b feat/test-preview-ci
  echo "# test" >> README.md
  git add README.md
  git commit -m "test: verify preview deployment"
  git push -u origin feat/test-preview-ci
  # Open PR via gh cli
  gh pr create --title "test: preview deployment verification" --body "Testing preview deployment pipeline"
  ```

- [ ] Verify CI preview-deploy job runs
  ```bash
  # Watch the CI run
  gh run list --branch feat/test-preview-ci
  # Wait for completion, check the PR for preview URL comment
  gh pr view --comments
  ```

- [ ] Verify the preview URL is accessible
  ```bash
  # URL from PR comment, e.g.:
  curl -I https://preview-1.ctrlpane.dev/
  ```

- [ ] Close the test PR and verify cleanup
  ```bash
  gh pr close feat/test-preview-ci
  # Wait for preview-cleanup workflow to trigger
  gh run list --workflow=preview-cleanup.yml
  # After cleanup completes, verify slot is released
  ssh kali "ls /opt/previews/slots/ && cat /opt/previews/slots/1.lock"
  ```

- [ ] Clean up test branch
  ```bash
  git checkout main
  git branch -D feat/test-preview-ci
  git push origin --delete feat/test-preview-ci
  ```

**Commit:** None (verification only).

---

## Notes

### Keeping scripts in sync

Scripts live in two places:
1. **Source of truth:** `homelab/scripts/preview-*.sh` (in the repo)
2. **Runtime location:** `/opt/previews/scripts/` (on Kali)

After modifying scripts in the repo, re-deploy them to Kali:
```bash
# From repo root on Kali:
cp homelab/scripts/preview-*.sh /opt/previews/scripts/
chmod +x /opt/previews/scripts/*.sh
```

A future improvement could add a CI step that auto-syncs scripts to `/opt/previews/scripts/` on pushes to main that modify `homelab/scripts/`.

### Lock file format

Lock files at `/opt/previews/slots/{1,2,3}.lock` use simple key=value format:
```
PR_NUMBER=123
BRANCH=feat/my-feature
SHA=abc123def456
CREATED_AT=2026-03-13T10:00:00Z
```

An empty or missing lock file means the slot is free. The deploy script writes metadata after allocation; the cleanup script removes the file to release the slot.

### Cloudflare Tunnel static routes

The tunnel config has static ingress rules for all 3 preview slots. When no preview is running on a slot, requests to that hostname return 502 Bad Gateway from cloudflared. This is expected — not an error condition.

### serve.js design

The `serve.js` file is generated inline by `preview-deploy.sh` into each PR's `web/` directory. It uses only Node.js built-in modules (http, fs, path) — no external dependencies. Key features:
- Serves Vite build static files with SPA fallback (all non-file routes serve `index.html`)
- Proxies `/api/*` requests to the API port (same slot's port block)
- Sets aggressive caching for hashed assets (`/assets/`), short cache for everything else
- Binds to `127.0.0.1` only (external access via Cloudflare Tunnel)

### Migration command

The database migration runs via the `@ctrlpane/db` package: `bun run --cwd packages/db migrate`. This is different from the release workflow which uses `bun run --cwd apps/api db:migrate` (a convention that may need aligning — but the preview script uses the actual package script location).

### GitHub repo reference for reap script

The `preview-reap-stale.sh` script uses `gh api` to check PR status. The `REPO` variable is hardcoded to `ctrlpane/ctrlpane` — update this if the GitHub org/repo name differs. The `gh` CLI must be authenticated on Kali (the self-hosted runners should already have this configured).
