#!/usr/bin/env bash
set -euo pipefail

echo "=== ctrlpane Kali Bootstrap ==="

# Create directory structure
sudo mkdir -p /opt/ctrlpane/{api/releases,web/releases,backups,previews}
sudo chown -R anshul:anshul /opt/ctrlpane

# Install Bun
if ! command -v bun &> /dev/null; then
  curl -fsSL https://bun.sh/install | bash
fi

# Start infrastructure
cd "$(dirname "$0")"
docker compose -f docker-compose.prod.yml up -d

# Install systemd units
sudo cp systemd/ctrlpane-api.service /etc/systemd/system/
sudo cp systemd/ctrlpane-web.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable ctrlpane-api ctrlpane-web

echo "=== Bootstrap complete ==="
echo "Next steps:"
echo "  1. Copy .env to /opt/ctrlpane/.env"
echo "  2. Run migrations: bun run --cwd apps/api db:migrate"
echo "  3. Start services: sudo systemctl start ctrlpane-api ctrlpane-web"
