#!/usr/bin/env bash
# deploy-oracle-alpha.sh — na própria VM: countdown → stop → (opcional pull) → start
# Uso:
#   MAINTENANCE_TOKEN=... ./scripts/deploy-oracle-alpha.sh
#   SKIP_COUNTDOWN=1 ./scripts/deploy-oracle-alpha.sh
set -euo pipefail
APP_DIR="${APP_DIR:-/opt/global-idle}"
COUNTDOWN_SEC="${COUNTDOWN_SEC:-30}"
SKIP_COUNTDOWN="${SKIP_COUNTDOWN:-0}"
TOKEN="${MAINTENANCE_TOKEN:-}"

cd "$APP_DIR"

notify() {
  local hdr=()
  if test -n "$TOKEN"; then
    hdr=(-H "X-Maintenance-Token: $TOKEN")
  fi
  curl -sS -X POST "http://127.0.0.1:3000/api/maintenance/schedule" \
    -H "Content-Type: application/json" \
    "${hdr[@]}" \
    -d "{\"seconds\":${COUNTDOWN_SEC}}" || true
  echo
}

if test "$SKIP_COUNTDOWN" != "1"; then
  echo "==> maintenance countdown ${COUNTDOWN_SEC}s"
  notify
  sleep "$COUNTDOWN_SEC"
fi

echo "==> pm2 stop"
pm2 stop global-idle || true

if test -d .git; then
  echo "==> git pull (if repo present)"
  git pull --ff-only || true
fi

echo "==> npm install + pm2 start"
npm install --omit=dev
if test -f ecosystem.config.js; then
  pm2 start ecosystem.config.js || pm2 restart global-idle
else
  pm2 start server/server.js --name global-idle || pm2 restart global-idle
fi
pm2 save || true
sleep 2
curl -sS http://127.0.0.1:3000/api/health || curl -sS http://127.0.0.1/api/health || true
echo
echo "deploy_local_done"
