# Alpha-test Global-Idle na Oracle Cloud Always Free

Guia rápido para deploy em Oracle Cloud (**Always Free**).
Região neste alpha: **Brazil Southeast (Vinhedo)** / `sa-vinhedo-1` (também válido para São Paulo `sa-sao-paulo-1`).
O jogo é **Node.js** (não PHP/Apache).

**Não compartilhe senhas Oracle, chaves privadas nem tokens neste chat.**  
Quando a VM estiver pronta, envie só o **IP público** para continuarmos com comandos SSH.

## 1. Criar a VM (console Oracle)

1. Entre em [Oracle Cloud Console](https://cloud.oracle.com) → região **Brazil East (Sao Paulo)** / `sa-sao-paulo-1`.
2. **Compute → Instances → Create instance**.
3. Escolha:
   - **Name:** `global-idle-alpha`
   - **Image:** Canonical Ubuntu **22.04**
   - **Shape (Always Free):**
     - Preferência: **VM.Standard.A1.Flex** (Ampere ARM) — 1 OCPU / 6 GB RAM (ou o mínimo Free Tier disponível)
     - Alternativa: **VM.Standard.E2.1.Micro** (x86) se Ampere estiver esgotado
   - **Networking:** VCN padrão + subnet pública; atribua **Public IPv4**
   - **SSH keys:** cole sua chave pública (`.pub`). Guarde a privada no seu PC.
4. Create → anote o **Public IP**.

### Security List / NSG — portas de entrada

No security list (ou NSG) da subnet/VNIC, libere **ingress** de `0.0.0.0/0` (ou só o seu IP para SSH):

| Porta | Protocolo | Uso |
| --- | --- | --- |
| 22 | TCP | SSH |
| 80 | TCP | HTTP (Certbot + redirect) |
| 443 | TCP | HTTPS (nginx) |
| 3000 | TCP | Opcional — app direto (só debug; em produção use nginx) |

Firewall da Oracle **não** abre automaticamente: sem regra, o site não responde de fora.

Além do Security List/NSG, imagens Ubuntu da Oracle costumam ter **iptables local** com `REJECT` no fim da chain `INPUT` (só 22 aberto). Depois de liberar 80/443 no console, na VM:

```bash
sudo iptables -I INPUT 5 -p tcp -m state --state NEW -m tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -p tcp -m state --state NEW -m tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save
```

Sem isso, `curl` local na 80 funciona e o acesso pelo IP público continua em timeout.

## 2. SSH inicial (no seu PC)

Substitua `SEU_IP` e o caminho da chave:

```bash
ssh -i ~/.ssh/sua_chave_oracle ubuntu@SEU_IP
```

No Windows PowerShell (exemplo):

```powershell
ssh -i $env:USERPROFILE\.ssh\sua_chave_oracle ubuntu@SEU_IP
```

Usuário padrão Ubuntu na Oracle: **`ubuntu`**.

## 3. Pacotes, Node 20, nginx, certbot

Cole na VM (sessão SSH):

```bash
sudo apt-get update
sudo apt-get install -y git nginx certbot python3-certbot-nginx curl ca-certificates gnupg
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
node -v
npm -v
sudo npm install -g pm2
```

## 4. Clonar o código

O deploy do alpha usa o pacote em **`tibia-idle/`** (jogo + API).  
No monorepo `old-idle`, a pasta útil é `tibia-idle/`.  
Na branch `cursor/alpha-test-deploy`, o conteúdo de `tibia-idle/` pode já ser a **raiz** do repo — o `package.json` descreve os dois casos.

```bash
sudo mkdir -p /opt/global-idle
sudo chown ubuntu:ubuntu /opt/global-idle
cd /opt/global-idle
git clone -b cursor/alpha-test-deploy --single-branch https://github.com/tomio1447/old-idle.git .
```

Detectar onde está o app:

```bash
# Se existir pasta tibia-idle com package.json:
test -f tibia-idle/package.json && APP_DIR=/opt/global-idle/tibia-idle
# Se o package.json já estiver na raiz (branch de deploy):
test -f package.json && test -f server/server.js && APP_DIR=/opt/global-idle
echo "APP_DIR=$APP_DIR"
cd "$APP_DIR"
npm install --omit=dev
```

## 5. Dados persistentes + env

### Opção A — MySQL (recomendado se o local já usa XAMPP)

No PC, gere o dump (XAMPP):

```powershell
$dump = "$env:USERPROFILE\Desktop\global_idle.sql"
& "C:\xampp\mysql\bin\mysqldump.exe" -u root -padmin --databases global_idle --single-transaction --routines --triggers -r $dump
```

Na VM: instale MariaDB/MySQL, copie o `.sql`, restaure e aponte o `.env`:

```bash
sudo apt-get install -y mariadb-server
sudo mysql -e "CREATE DATABASE IF NOT EXISTS global_idle CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
# após scp do dump:
sudo mysql global_idle < /home/ubuntu/global_idle.sql
```

Com PM2/`ecosystem.config.js`, o `cwd` é a raiz do pacote (`$APP_DIR`). O `dotenv` lê **`$APP_DIR/.env`** (não só `server/.env`). Crie o arquivo na raiz:

```bash
cat > "$APP_DIR/.env" <<'EOF'
HOST=0.0.0.0
PORT=3000
TEST_SERVER=1
NODE_ENV=production
TRUST_PROXY=1
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASS=TROQUE_A_SENHA
MYSQL_DB=global_idle
EOF
chmod 600 "$APP_DIR/.env"
# opcional: espelho para quem sobe o server de dentro de server/
cp "$APP_DIR/.env" "$APP_DIR/server/.env"
```

Checklist completo dump/restore: `docs/local-mysql.md`.

### Opção B — JSON em disco (sem MySQL)

JSON de contas/personagens deve ficar **fora** do clone (sobrevive a `git pull`):

```bash
sudo mkdir -p /var/lib/global-idle
sudo chown ubuntu:ubuntu /var/lib/global-idle
```

```bash
cat > "$APP_DIR/.env" <<'EOF'
HOST=0.0.0.0
PORT=3000
TEST_SERVER=1
NODE_ENV=production
TRUST_PROXY=1
MYSQL_HOST=
GLOBAL_IDLE_DATA_DIR=/var/lib/global-idle
EOF
```

Referência sem segredos: `tibia-idle/server/.env.example`.

## 6. PM2 — manter o Node no ar

A partir de `$APP_DIR` (onde estão `package.json` e `server/`):

```bash
cd "$APP_DIR"
# Entrypoint: server.js na raiz do pacote (shim) ou server/server.js
pm2 start server/server.js --name global-idle
# Se o start acima falhar e existir server.js na raiz:
# pm2 start server.js --name global-idle
pm2 save
pm2 startup systemd -u ubuntu --hp /home/ubuntu
# Execute o comando `sudo env PATH=...` que o pm2 imprimir
pm2 status
curl -sS http://127.0.0.1:3000/api/health
```

## 7. Nginx reverse proxy

```bash
sudo tee /etc/nginx/sites-available/global-idle <<'EOF'
server {
    listen 80;
    server_name SEU_IP_OU_DOMINIO;

    client_max_body_size 20m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF
sudo sed -i "s/SEU_IP_OU_DOMINIO/SEU_IP/" /etc/nginx/sites-available/global-idle
# Se tiver domínio, use o domínio no lugar de SEU_IP acima.

sudo ln -sf /etc/nginx/sites-available/global-idle /etc/nginx/sites-enabled/global-idle
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

Teste externo: `http://SEU_IP/` (deve servir o HTML do jogo).

## 8. HTTPS (Let's Encrypt) — domínio `global-idle.com`

**Cloudflare DNS (alpha):** registros A `global-idle.com` e `www` → IP da VM em **DNS only** (nuvem cinza). Só ligue o proxy laranja depois de HTTPS local estável (senão Certbot/validação e o certificado da origem confundem).

1. DNS A (gray cloud) apontando para o IP público.
2. Emitir o certificado (se ainda não existir):

```bash
sudo certbot certonly --nginx -d global-idle.com -d www.global-idle.com
```

3. Nginx: `server_name` com domínio + bloco `listen 443 ssl` usando `/etc/letsencrypt/live/global-idle.com/{fullchain,privkey}.pem`. Mantenha um `server` HTTP separado com `server_name` = IP se quiser acesso `http://IP/` sem redirect. Domínio em HTTP → `return 301 https://$host$request_uri;`.
4. Se o Certbot falhar no install (`Could not automatically find a matching server block`), ajuste o `server_name` e rode `sudo certbot install --cert-name global-idle.com`, ou monte o SSL manualmente como acima.
5. `sudo nginx -t` && `sudo systemctl reload nginx`
6. Teste: `https://global-idle.com/` e `https://global-idle.com/api/health`

Sem domínio, dá para jogar em **HTTP na porta 80** (ok para alpha fechado).  
Não peça certificados com IP puro de forma estável.

## 9. Checklist rápido

- [ ] VM Ubuntu 22.04 em `sa-sao-paulo-1` com IP público
- [ ] Ingress: 22, 80, 443 (+ 3000 opcional) no Security List/NSG **e** iptables local (seção 1)
- [ ] Node 20 + git + nginx + certbot + pm2 + MariaDB
- [ ] Clone `tomio1447/old-idle` branch `cursor/alpha-test-deploy`
- [ ] `$APP_DIR/.env` com `TEST_SERVER=1`, `HOST=0.0.0.0`, `PORT=3000` (PM2 usa cwd na raiz)
- [ ] MySQL: dump local → restore + `MYSQL_*` **ou** JSON: `GLOBAL_IDLE_DATA_DIR=/var/lib/global-idle` e `MYSQL_HOST` vazio
- [ ] Branch `cursor/alpha-test-deploy`
- [ ] `pm2` via `ecosystem.config.js` (ou `server/server.js`)
- [ ] nginx → `127.0.0.1:3000`
- [ ] `curl http://127.0.0.1:3000/api/health` e `http://SEU_IP/` OK

## 10. Atualizar código depois

### Opção A — git pull (só se o remoto já tiver o código)

```bash
cd /opt/global-idle
git fetch origin
git checkout cursor/alpha-test-deploy
git pull --ff-only
cd "$APP_DIR"
npm install --omit=dev
pm2 restart global-idle
```

### Opção B — sync do working tree local (Windows → VM, sem push)

Use quando as correções ainda estão só no PC (branch suja / não publicada). **Não sobrescreve `.env`.**

No PowerShell (sem `&&`):

```powershell
$tar = "$env:USERPROFILE\Desktop\_deploy-alpha.tar.gz"
# Empacota a pasta tibia-idle do monorepo (ajuste o -C se o package.json já for a raiz)
tar -czf $tar --exclude=node_modules --exclude=server/node_modules --exclude=.env --exclude=server/.env --exclude=server/data --exclude=tools/_wheel_src -C C:\Users\Tomio\Desktop\ot-idle\tibia-idle .
scp -i $env:USERPROFILE\.ssh\oracle-global-idle $tar ubuntu@SEU_IP:/home/ubuntu/_deploy-alpha.tar.gz
```

Na VM:

```bash
cp -a /opt/global-idle/.env ~/env.bak
cp -a /opt/global-idle/server/.env ~/env.server.bak 2>/dev/null || true
cd /opt/global-idle
tar -xzf /home/ubuntu/_deploy-alpha.tar.gz
cp -a ~/env.bak /opt/global-idle/.env
cp -a ~/env.server.bak /opt/global-idle/server/.env 2>/dev/null || cp -a /opt/global-idle/.env /opt/global-idle/server/.env
chmod 600 /opt/global-idle/.env /opt/global-idle/server/.env
npm install --omit=dev
pm2 restart global-idle
curl -sS http://127.0.0.1:3000/api/health
curl -sS http://127.0.0.1/api/health
rm -f /home/ubuntu/_deploy-alpha.tar.gz
```

Health com código novo costuma expor `bootId` e `startedAt`. Se o health **local** OK e o IP público der timeout, falta liberar TCP 80/443 no **Security List/NSG** da OCI (seção 1) — o iptables da VM sozinho não basta.

## 11. Próximo passo com o assistente

1. Crie a VM e abra as portas (seção 1).
2. Envie **apenas o IP público** (e, se quiser, a arquitetura: ARM ou x86).
3. **Não envie senhas** nem chave privada.
4. Continuamos com os comandos SSH exatos (copiar/colar) a partir daí.
