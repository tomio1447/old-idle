#!/usr/bin/env bash
set -euo pipefail
APP_DIR=/opt/global-idle
cd "$APP_DIR"
npm install --omit=dev

# Prefer ecosystem if present
if test -f ecosystem.config.js; then
  pm2 delete global-idle >/dev/null 2>&1 || true
  pm2 start ecosystem.config.js
else
  pm2 delete global-idle >/dev/null 2>&1 || true
  pm2 start server/server.js --name global-idle
fi
pm2 save
STARTUP_CMD="$(pm2 startup systemd -u ubuntu --hp /home/ubuntu | grep -E 'sudo env PATH' || true)"
if test -n "$STARTUP_CMD"; then
  eval "$STARTUP_CMD"
fi
pm2 status
sleep 2
curl -sS http://127.0.0.1:3000/api/health || true
echo
echo "pm2_ready"
