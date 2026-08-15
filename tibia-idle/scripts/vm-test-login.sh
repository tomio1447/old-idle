#!/usr/bin/env bash
set -euo pipefail
printf '%s' '{"login":"1","password":"1"}' > /tmp/login.json
curl -sS http://127.0.0.1:3000/api/login -H 'Content-Type: application/json' --data-binary @/tmp/login.json
echo
