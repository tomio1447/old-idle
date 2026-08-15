#!/usr/bin/env bash
set -euo pipefail
PUBLIC_IP=204.216.132.197
sudo tee /etc/nginx/sites-available/global-idle >/dev/null <<EOF
server {
    listen 80;
    server_name ${PUBLIC_IP};

    client_max_body_size 20m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF
sudo ln -sf /etc/nginx/sites-available/global-idle /etc/nginx/sites-enabled/global-idle
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl enable --now nginx
sudo systemctl reload nginx
# open local firewall if ufw is active
if command -v ufw >/dev/null 2>&1; then
  if sudo ufw status | grep -qi 'Status: active'; then
    sudo ufw allow OpenSSH
    sudo ufw allow 80/tcp
    sudo ufw allow 443/tcp
  fi
fi
curl -sS -o /tmp/gi-home.html -w "local_http_code=%{http_code}\n" http://127.0.0.1/
head -c 200 /tmp/gi-home.html; echo
echo "nginx_ready"
