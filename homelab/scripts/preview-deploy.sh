#!/usr/bin/env bash
set -euo pipefail

# Preview deployment script for ctrlpane
# Usage: preview-deploy.sh <pr_number> <branch> <sha> <workspace_path>

PR_NUMBER="${1:?Usage: preview-deploy.sh <pr_number> <branch> <sha> <workspace_path>}"
BRANCH="${2:?Missing branch}"
SHA="${3:?Missing sha}"
WORKSPACE="${4:?Missing workspace_path}"

PREVIEW_BASE="/opt/previews"
SLOTS_DIR="$PREVIEW_BASE/slots"
DOCKER_DIR="$PREVIEW_BASE/docker"
PR_DIR="$PREVIEW_BASE/ctrlpane/pr-${PR_NUMBER}"

# Port blocks per slot: slot N uses ports N4000-N4005
# Slot 1: 34000(web) 34001(api) 34002(pg) 34003(redis) 34004(nats) 34005(centrifugo)
# Slot 2: 35000(web) 35001(api) 35002(pg) 35003(redis) 35004(nats) 35005(centrifugo)
# Slot 3: 36000(web) 36001(api) 36002(pg) 36003(redis) 36004(nats) 36005(centrifugo)

declare -A SLOT_PORTS
SLOT_PORTS[1_WEB]=34000; SLOT_PORTS[1_API]=34001; SLOT_PORTS[1_PG]=34002; SLOT_PORTS[1_REDIS]=34003; SLOT_PORTS[1_NATS]=34004; SLOT_PORTS[1_CENTRIFUGO]=34005
SLOT_PORTS[2_WEB]=35000; SLOT_PORTS[2_API]=35001; SLOT_PORTS[2_PG]=35002; SLOT_PORTS[2_REDIS]=35003; SLOT_PORTS[2_NATS]=35004; SLOT_PORTS[2_CENTRIFUGO]=35005
SLOT_PORTS[3_WEB]=36000; SLOT_PORTS[3_API]=36001; SLOT_PORTS[3_PG]=36002; SLOT_PORTS[3_REDIS]=36003; SLOT_PORTS[3_NATS]=36004; SLOT_PORTS[3_CENTRIFUGO]=36005

log() { echo "[preview-deploy] $*" >&2; }

find_existing_slot() {
  for i in 1 2 3; do
    if [ -f "$SLOTS_DIR/$i.lock" ]; then
      if grep -q "PR_NUMBER=$PR_NUMBER" "$SLOTS_DIR/$i.lock" 2>/dev/null; then
        echo "$i"
        return 0
      fi
    fi
  done
  return 1
}

allocate_slot() {
  for i in 1 2 3; do
    (
      flock -n 200 || exit 1
      if [ ! -f "$SLOTS_DIR/$i.lock" ]; then
        cat > "$SLOTS_DIR/$i.lock" << LOCK
PR_NUMBER=$PR_NUMBER
BRANCH=$BRANCH
SHA=$SHA
CREATED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)
LOCK
        echo "$i"
        exit 0
      fi
      exit 1
    ) 200>"$SLOTS_DIR/$i.flock" && return 0
  done
  return 1
}

stop_existing_services() {
  local slot="$1"
  for svc in "preview-${slot}-api" "preview-${slot}-web"; do
    if systemctl --user is-active "$svc.service" >/dev/null 2>&1; then
      log "Stopping $svc..."
      systemctl --user stop "$svc.service" 2>/dev/null || true
    fi
    # Also reset failed state so systemd-run can reuse the unit name
    systemctl --user reset-failed "$svc.service" 2>/dev/null || true
  done
}

# Step 1: Find existing slot or allocate new one
SLOT=""
if SLOT=$(find_existing_slot); then
  log "Found existing slot $SLOT for PR #$PR_NUMBER — re-deploying"
  stop_existing_services "$SLOT"
  # Update lock file with new SHA
  cat > "$SLOTS_DIR/$SLOT.lock" << LOCK
PR_NUMBER=$PR_NUMBER
BRANCH=$BRANCH
SHA=$SHA
CREATED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)
LOCK
elif SLOT=$(allocate_slot); then
  log "Allocated slot $SLOT for PR #$PR_NUMBER"
else
  log "ERROR: No preview slots available"
  echo "NO_SLOT"
  exit 1
fi

WEB_PORT=${SLOT_PORTS[${SLOT}_WEB]}
API_PORT=${SLOT_PORTS[${SLOT}_API]}
PG_PORT=${SLOT_PORTS[${SLOT}_PG]}
REDIS_PORT=${SLOT_PORTS[${SLOT}_REDIS]}
NATS_PORT=${SLOT_PORTS[${SLOT}_NATS]}
CENTRIFUGO_PORT=${SLOT_PORTS[${SLOT}_CENTRIFUGO]}

# Step 2: Start Docker infra
log "Starting Docker infra for slot $SLOT..."
docker compose -f "$DOCKER_DIR/preview-$SLOT.yml" up -d 2>&1 >&2

# Step 3: Wait for Postgres healthy
log "Waiting for Postgres on port $PG_PORT..."
for attempt in $(seq 1 30); do
  if pg_isready -h localhost -p "$PG_PORT" -U ctrlpane_app -d ctrlpane_preview >/dev/null 2>&1; then
    log "Postgres ready"
    break
  fi
  if [ "$attempt" -eq 30 ]; then
    log "ERROR: Postgres not ready after 30s"
    exit 1
  fi
  sleep 1
done

# Step 4: Copy workspace
log "Copying workspace to $PR_DIR/src..."
mkdir -p "$PR_DIR/src"
rsync -a --delete "$WORKSPACE/" "$PR_DIR/src/"

# Step 5: Install dependencies
log "Installing dependencies..."
cd "$PR_DIR/src"
bun install --frozen-lockfile 2>&1 >&2

# Step 6: Set environment variables and write .env file
PG_USER="ctrlpane_app"
PG_PASS="preview_dev"
PG_DB="ctrlpane_preview"
export NODE_ENV=preview
export DB_HOST="localhost"
export DB_PORT="$PG_PORT"
export DB_NAME="$PG_DB"
export DB_USER="$PG_USER"
export DB_PASSWORD="$PG_PASS"
export DATABASE_URL="postgres://${PG_USER}:${PG_PASS}@localhost:${PG_PORT}/${PG_DB}"
export REDIS_URL="redis://:preview_dev@localhost:${REDIS_PORT}"
export NATS_URL="nats://localhost:${NATS_PORT}"
export CENTRIFUGO_URL="http://localhost:${CENTRIFUGO_PORT}"
export API_PORT="$API_PORT"
export API_HOST="127.0.0.1"
export WEB_PORT="$WEB_PORT"
export VITE_API_URL="/api"

# Persist env vars for systemd-run (survives runner cleanup)
cat > "$PR_DIR/.env" << ENVFILE
NODE_ENV=preview
DB_HOST=localhost
DB_PORT=$PG_PORT
DB_NAME=$PG_DB
DB_USER=$PG_USER
DB_PASSWORD=$PG_PASS
DATABASE_URL=postgres://${PG_USER}:${PG_PASS}@localhost:${PG_PORT}/${PG_DB}
REDIS_URL=redis://:preview_dev@localhost:${REDIS_PORT}
NATS_URL=nats://localhost:${NATS_PORT}
CENTRIFUGO_URL=http://localhost:${CENTRIFUGO_PORT}
API_PORT=$API_PORT
API_HOST=127.0.0.1
WEB_PORT=$WEB_PORT
VITE_API_URL=/api
ENVFILE

# Step 7: Run migrations
log "Running database migrations..."
bun run --cwd packages/db migrate 2>&1 >&2

# Step 8: Build
log "Building..."
bun run build 2>&1 >&2

# Step 9: Copy build artifacts
log "Copying build artifacts..."
mkdir -p "$PR_DIR/api" "$PR_DIR/web"
cp -r apps/api/dist/* "$PR_DIR/api/" 2>/dev/null || cp -r apps/api/src "$PR_DIR/api/"
cp -r apps/web/dist/* "$PR_DIR/web/" 2>/dev/null || true

# Step 10: Create serve.js for web (static files + API proxy)
cat > "$PR_DIR/serve.js" << 'SERVE'
const { createServer } = require("http");
const { createReadStream, existsSync, statSync } = require("fs");
const { join, extname } = require("path");
const { request: httpRequest } = require("http");

const WEB_DIR = join(__dirname, "web");
const API_PORT = process.env.API_PORT || 34001;
const PORT = process.env.WEB_PORT || 34000;

const MIME_TYPES = {
  ".html": "text/html", ".js": "application/javascript", ".css": "text/css",
  ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg",
  ".svg": "image/svg+xml", ".ico": "image/x-icon", ".woff2": "font/woff2",
};

const server = createServer((req, res) => {
  // Proxy /api/* to API server
  if (req.url.startsWith("/api")) {
    const proxyReq = httpRequest(
      { hostname: "127.0.0.1", port: API_PORT, path: req.url, method: req.method, headers: req.headers },
      (proxyRes) => {
        res.writeHead(proxyRes.statusCode, proxyRes.headers);
        proxyRes.pipe(res);
      }
    );
    proxyReq.on("error", () => { res.writeHead(502); res.end("Bad Gateway"); });
    req.pipe(proxyReq);
    return;
  }

  // Serve static files
  let filePath = join(WEB_DIR, req.url === "/" ? "index.html" : req.url);
  if (existsSync(filePath) && statSync(filePath).isFile()) {
    const ext = extname(filePath);
    res.writeHead(200, { "Content-Type": MIME_TYPES[ext] || "application/octet-stream" });
    createReadStream(filePath).pipe(res);
  } else {
    // SPA fallback
    const indexPath = join(WEB_DIR, "index.html");
    if (existsSync(indexPath)) {
      res.writeHead(200, { "Content-Type": "text/html" });
      createReadStream(indexPath).pipe(res);
    } else {
      res.writeHead(404);
      res.end("Not Found");
    }
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Preview web server listening on http://127.0.0.1:${PORT}`);
});
SERVE

# Step 11: Start API via systemd-run (survives GH Actions runner cleanup)
log "Starting API on port $API_PORT..."
cd "$PR_DIR"
systemd-run --user \
  --unit="preview-${SLOT}-api" \
  --description="CtrlPane Preview ${SLOT} API" \
  --working-directory="$PR_DIR" \
  --property=Restart=on-failure \
  --property=RestartSec=2 \
  --property=StandardOutput=file:"$PR_DIR/api.log" \
  --property=StandardError=file:"$PR_DIR/api.log" \
  --property=EnvironmentFile="$PR_DIR/.env" \
  -- bun run api/index.js

# Step 12: Start Web via systemd-run (survives GH Actions runner cleanup)
log "Starting Web on port $WEB_PORT..."
systemd-run --user \
  --unit="preview-${SLOT}-web" \
  --description="CtrlPane Preview ${SLOT} Web" \
  --working-directory="$PR_DIR" \
  --property=Restart=on-failure \
  --property=RestartSec=2 \
  --property=StandardOutput=file:"$PR_DIR/web.log" \
  --property=StandardError=file:"$PR_DIR/web.log" \
  --property=EnvironmentFile="$PR_DIR/.env" \
  -- bun run "$PR_DIR/serve.js"

# Step 13: Health check
log "Running health check..."
sleep 2
for attempt in $(seq 1 10); do
  if curl -sf "http://localhost:${API_PORT}/health/live" >/dev/null 2>&1; then
    log "API healthy"
    break
  fi
  if [ "$attempt" -eq 10 ]; then
    log "WARNING: API health check failed, but continuing"
  fi
  sleep 1
done

# Step 14: Write result
PREVIEW_URL="https://preview-${SLOT}.ctrlpane.dev"
echo "PREVIEW_URL=$PREVIEW_URL" > "$PR_DIR/deploy-result.txt"
log "Preview deployed at $PREVIEW_URL"
