# VM de produção — Global-Idle

> **VM oficial a partir de 31/10/2026.** Todos os deploys devem ir para este IP.
> A VM Oracle (`204.216.132.197`) fica como ambiente legado/secundário.
>
> ⚠️ **Workflow atual: APENAS desenvolvimento/testes LOCAIS.**
> Não fazer deploy nesta VM até o usuário pedir explicitamente.
> (Decisão do usuário em 31/10/2026 — "apenas alterações locais agora".)

## Acesso

| | |
|---|---|
| **IP público** | `163.176.139.233` (`http://163.176.139.233/`) |
| **Hostname** | `warizi` |
| **Usuário SSH** | `ubuntu` |
| **Chave** | `C:\Users\Tomio\Downloads\ssh-key-2026-10-29.key` |

```bash
ssh -i "/c/Users/Tomio/Downloads/ssh-key-2026-10-29.key" ubuntu@163.176.139.233
```

## Arquitetura (diferente da VM Oracle!)

- **Docker** (`node:20-bookworm-slim`), container **`global-idle`**:
  - bind mount `/home/ubuntu/global-idle/tibia-idle` → `/app`;
  - `WorkingDir=/app/server`, comando `node server.js`;
  - **rede `host`** — o jogo responde direto na porta **80** do host;
  - `restart: unless-stopped` (sobe sozinho no reboot).
- **MariaDB** em outro container (`crystalserver-database-1`, porta 3306 no host) — **banco é MySQL de verdade** aqui (`MYSQL_*` no `tibia-idle/server/.env`).
- Sem pm2/node no host — tudo dentro do container.

## Deploy (fluxo testado 31/10/2026)

```bash
ssh -i KEY ubuntu@163.176.139.233

# 1. countdown pros jogadores (TEST_SERVER=1 libera o endpoint sem token)
curl -s -X POST http://127.0.0.1:80/api/maintenance/schedule \
  -H 'Content-Type: application/json' -d '{"seconds":60}'

# 2. código (repo = ~/global-idle, branch arena/01a1090d-old-idle)
cd ~/global-idle
git fetch origin arena/01a1090d-old-idle
git reset --hard origin/arena/01a1090d-old-idle

# 3. restart (após o countdown)
docker restart global-idle
```

- **Banco**: `ensureSchema` roda no boot — cria/migra tabelas (guilds, parties,
  `accounts.party_order`, `accounts.shared_inventory`, …) sozinho. Sem SQL manual.
- Estáticos de `game/` são lidos por request — mudança só de cliente pode ir com
  `git pull` **sem restart** (mas restart é o caminho seguro para server code).

## Verificação pós-deploy

```bash
curl -s http://127.0.0.1:80/api/health            # bootId novo, serverPower:on
curl -s http://127.0.0.1:80/api/daily-boost       # expBonus/lootBonus presentes
curl -s http://127.0.0.1:80/api/online-count
docker logs global-idle --tail 30
```

## Anúncios / manutenção

```bash
# popup global (SSE + health; dedup por anúncio no cliente)
curl -s -X POST http://127.0.0.1:80/api/admin/announce \
  -H 'Content-Type: application/json' \
  -d '{"title":"…","message":"…","ttlSec":7200,"button":"OK"}'
```

## VM legada (secundária) — Oracle

| | |
|---|---|
| IP | `204.216.132.197` |
| Usuário | `ubuntu` (chave `~/.ssh/oracle-global-idle`) |
| App | pm2 `global-idle`, código em `/opt/global-idle` (repo root) → `tibia-idle/` |
| Banco | **JsonStore** (MariaDB local morto desde 21/08/2026 por OOM — `MYSQL_*` comentado no `.env`) |
| Porta | 3000 |
