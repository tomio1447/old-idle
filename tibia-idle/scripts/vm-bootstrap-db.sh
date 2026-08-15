#!/usr/bin/env bash
set -euo pipefail
APP_DIR=/opt/global-idle
PASS="$(openssl rand -base64 24 | tr -d '/+=' | cut -c1-24)"
printf '%s\n' "$PASS" > /home/ubuntu/.mysql_app_pass
chmod 600 /home/ubuntu/.mysql_app_pass

sudo systemctl enable --now mariadb
sudo mysql -e "CREATE DATABASE IF NOT EXISTS global_idle CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

echo "Importing dump (may take a few minutes)..."
sudo mysql < /home/ubuntu/global_idle.sql

sudo mysql -e "CREATE USER IF NOT EXISTS 'globalidle'@'127.0.0.1' IDENTIFIED BY '${PASS}'; CREATE USER IF NOT EXISTS 'globalidle'@'localhost' IDENTIFIED BY '${PASS}'; GRANT ALL PRIVILEGES ON global_idle.* TO 'globalidle'@'127.0.0.1'; GRANT ALL PRIVILEGES ON global_idle.* TO 'globalidle'@'localhost'; FLUSH PRIVILEGES;"
sudo mysql -N -e "SELECT COUNT(*) FROM global_idle.accounts;" | awk '{print "accounts="$1}'
sudo mysql -N -e "SELECT COUNT(*) FROM global_idle.characters;" | awk '{print "characters="$1}'

umask 077
cat > "$APP_DIR/server/.env" <<EOF
HOST=0.0.0.0
PORT=3000
TEST_SERVER=1
NODE_ENV=production
TRUST_PROXY=1
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_USER=globalidle
MYSQL_PASS=${PASS}
MYSQL_DB=global_idle
EOF
chmod 600 "$APP_DIR/server/.env"
ls -la "$APP_DIR/server/.env"
echo "env_ready"
