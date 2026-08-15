# Alpha-test Global-Idle na SaveInCloud (Jelastic PaaS)

Guia rápido para o trial de 14 dias em **São Paulo**.
O jogo é **Node.js** (não PHP/Apache).

## 1. Wizard — o que escolher (vs tela PHP)

Na tela **Novo Ambiente**, **não** clique em Criar com a aba **PHP** ativa.

| Campo | Valor recomendado (alpha) |
| --- | --- |
| Aba superior | **Node.js** (não PHP, Java, etc.) |
| Application Server | Node.js **20.x LTS** (ou a LTS mais próxima disponível) |
| Horizontal | **1** nó (Stateful) |
| Cloudlets reservados | **1** |
| Limite de scaling | **4** (suficiente para alpha) |
| Disco | **5 GB** (ok) |
| SLB (Shared Load Balancer) | **ON** → URL HTTPS gratuita `*.sp1.br.saveincloud.net.br` |
| Public IPv4 | **OFF** no trial (ligue só se precisar de IP dedicado) |
| Public IPv6 | **OFF** |
| SQL / NoSQL | **Não adicionar** no alpha (storage JSON em disco) |
| Região | **São Paulo** (já selecionada) |
| Nome do ambiente | `global-idle-alpha` (se o painel permitir renomear) |

URL esperada após criar: `https://global-idle-alpha.sp1.br.saveincloud.net.br`

Custo no trial: gratuito durante o período de testes (o painel mostra estimativa só como referência).

### Por que não PHP?

O servidor do Global-Idle é `tibia-idle/server/server.js` (Node). Apache/PHP não executa esse processo nem o `package.json` de start.

## 2. Variáveis de ambiente (após Criar)

No nó Node.js → **Variáveis** (ou Configuração → Variables), defina:

| Variável | Valor | Motivo |
| --- | --- | --- |
| `TEST_SERVER` | `1` | Alpha: contas 1/1 e 2/2, Admin, cadastro liberado |
| `HOST` | `0.0.0.0` | Aceita tráfego externo (já é o default no código) |
| `NODE_ENV` | `production` | Runtime de produção |
| `TRUST_PROXY` | `1` | SLB encaminha `X-Forwarded-For`; rate-limit usa IP real |
| `MYSQL_HOST` | *(vazio)* | Usa JSON em disco, sem MySQL |
| `GLOBAL_IDLE_DATA_DIR` | `/data/global-idle` | Dados fora do webroot (ver Volumes) |
| `UPDATE_PACKAGES_ON_RESTART` | `true` | Roda `npm install` no restart |
| `PACKAGE_MANAGER` | `npm` | Default da plataforma |
| `APP_FILE` | `server.js` | Entrypoint PM2 na raiz do ROOT (shim → `server/server.js`) |
| `PROCESS_MANAGER` | `pm2` | Stack SaveInCloud `pm2-almalinux` |
| `PORT` | *(não fixe)* | A SaveInCloud injeta `PORT`; o server já lê `process.env.PORT` |

Opcional:

- `STATIC_DIR` — só se o jogo estático não estiver em `tibia-idle/game` relativo ao deploy.
- `ALLOWED_ORIGINS` — **não precisa** se amigos abrirem a mesma URL do SLB (same-origin).

Referência sem segredos: `tibia-idle/server/.env.example`.

## 3. Volume persistente (obrigatório no alpha com JSON)

Com `MYSQL_HOST` vazio, saves ficam em arquivos JSON (`accounts.json`, `characters.json`, etc.).

Redeploy/ZIP costuma **apagar** o conteúdo de `/home/jelastic/ROOT`. Por isso:

1. No nó Node → **Volumes** (ou no wizard, botão Volumes).
2. Monte um volume em `/data/global-idle` (caminho livre no container).
3. Confirme `GLOBAL_IDLE_DATA_DIR=/data/global-idle` nas variáveis.
4. Reinicie o nó após montar.

Sem volume, contas e personagens dos testers somem a cada deploy.

## 4. Como enviar o código

O webroot da plataforma é `/home/jelastic/ROOT`. O `package.json` de deploy fica em **`tibia-idle/`** (não na raiz do monorepo `ot-idle`).

### Opção A — ZIP (mais simples no trial)

No PowerShell, a partir de `ot-idle`:

```powershell
powershell -File tibia-idle\scripts\pack-alpha-zip.ps1
```

Isso gera `tibia-idle/dist/global-idle-alpha.zip` com:

- `package.json` + `Procfile`
- `server/` (sem `node_modules`, sem `.env`, sem `data/` local)
- `game/`

No painel SaveInCloud:

1. Abra o ambiente → **Deployment Manager** (gerenciador de deploy).
2. **Upload** do ZIP / Deploy from Archive.
3. Destino: Application Server (nó Node).
4. Aguarde o deploy; se não subir sozinho, **Restart** do nó.

### Opção B — Git (recomendado para iterar no alpha)

A SaveInCloud/Jelastic clona o repositório em `/home/jelastic/ROOT` e espera `package.json` **na raiz do ROOT**. O monorepo `ot-idle` tem o jogo em `tibia-idle/`, então use a branch de deploy abaixo (conteúdo de `tibia-idle/` promovido à raiz).

#### Branch pronta para colar no painel

| Campo | Valor |
| --- | --- |
| **Git Repo URL** | `https://github.com/tomio1447/old-idle.git` |
| **Branch** | `cursor/alpha-test-deploy` |
| **Login / User** | seu usuário GitHub |
| **Token** | Personal Access Token (repo read) — **não** compartilhe o token no chat |
| **Check and Auto-Deploy** | **ON** (redeploy a cada push nesta branch) |
| **Path / Context** | `ROOT` (único path válido para Node.js) |
| **Working Directory** | *(deixe vazio)* — nesta branch a raiz já é o app |

No Deployment Manager:

1. Ambiente Node → **Deployments** / **Deployment Manager**.
2. Aba **GIT / SVN** → **Add Repo** (ou editar repo existente).
3. Cole os campos da tabela acima → **Add**.
4. No nó Application Server → **Deploy** a partir desse repositório (branch `cursor/alpha-test-deploy`).
5. Marque **Check and Auto-Deploy** se quiser atualizar a cada `git push`.
6. **Restart** do nó Node se o processo não subir sozinho.

Variáveis do app (além das da plataforma): ver seção 2. Em especial `TEST_SERVER=1`, `TRUST_PROXY=1`, `MYSQL_HOST` vazio, `GLOBAL_IDLE_DATA_DIR=/data/global-idle`, `UPDATE_PACKAGES_ON_RESTART=true`, `APP_FILE=server/server.js`.

#### Alternativa (monorepo completo — menos confiável)

Se o painel permitir alterar o webroot:

- Branch: ex. `cursor/fix-online-save-pvp-admin`
- Variável `ROOT_DIR` = `/home/jelastic/ROOT/tibia-idle`

Sem `ROOT_DIR` apontando para `tibia-idle`, o Node não acha o `package.json` correto. Prefira a branch `cursor/alpha-test-deploy`.

#### Git-Push-Deploy (add-on)

Mesmos URL/branch/token; o add-on só atualiza o contexto **ROOT** (não há subdirectory nativo). Use a branch `cursor/alpha-test-deploy`.

### Opção C — Web SSH / SFTP

1. Abra **Web SSH** no nó Node.
2. Vá em `/home/jelastic/ROOT`.
3. Envie arquivos (SFTP do painel ou scp) espelhando a estrutura do ZIP.
4. `npm install` (ou reinicie com `UPDATE_PACKAGES_ON_RESTART=true`).
5. Restart.

## 5. Como os amigos abrem o alpha

1. Compartilhe a URL do ambiente, por exemplo:
   `https://global-idle-alpha.sp1.br.saveincloud.net.br`
2. Contas de teste com `TEST_SERVER=1`: **1 / 1** e **2 / 2** (ambas admin).
3. Cadastro de novas contas fica liberado no modo test.
4. Não precisa Cloudflare Tunnel: o SLB já expõe HTTPS público.
5. Health check: `https://SEU-AMBIENTE.../api/health` deve responder `ok` e `testServer: true`.

Same-origin: o Node serve o jogo estático e a API na mesma porta — sem CORS extra.

## 6. Checklist depois de clicar em Criar

- [ ] Aba era **Node.js** (não PHP/Apache)
- [ ] Ambiente criado; URL `*.sp1.br.saveincloud.net.br` no painel
- [ ] Variáveis: `TEST_SERVER=1`, `TRUST_PROXY=1`, `MYSQL_HOST` vazio, `UPDATE_PACKAGES_ON_RESTART=true`
- [ ] Volume montado em `/data/global-idle` + `GLOBAL_IDLE_DATA_DIR`
- [ ] ZIP/Git deployado com `package.json` na raiz do ROOT (`tibia-idle/`)
- [ ] Restart do nó Node
- [ ] Logs sem erro de bind / `Cannot find module`
- [ ] Abrir URL no browser → tela do jogo
- [ ] `/api/health` → `testServer: true`
- [ ] Login **1/1** ou criar conta nova
- [ ] Enviar URL aos testers; lembrar que o trial tem prazo (14 dias)

## 7. Arquivos no repositório para este deploy

| Arquivo | Função |
| --- | --- |
| `tibia-idle/package.json` | `npm start` → `node server/server.js` (webroot SaveInCloud) |
| `tibia-idle/Procfile` | Entrypoint compatível com stacks tipo Heroku/Jelastic |
| `tibia-idle/server/.env.example` | Modelo de variáveis (sem segredos) |
| `tibia-idle/scripts/pack-alpha-zip.ps1` | Gera ZIP implantável |
| `tibia-idle/docs/alpha-test-saveincloud.md` | Este guia |

O servidor já escuta `HOST`/`PORT` (`0.0.0.0` + `process.env.PORT`) e serve `../game` por padrão.

## 8. “Temporarily unavailable” (NGINX) — Node parado

A página padrão do Jelastic/NGINX significa: o **LB está no ar**, mas o **Node/PM2 não responde** na `PORT`.

### Web SSH (nó Node.js)

```bash
cd /home/jelastic/ROOT
ls -la package.json server.js ecosystem.config.js server/server.js game/index.html
echo "PORT=$PORT"
npm install
pm2 list
pm2 logs --lines 80
# ou:
node server.js
# em outro SSH:
curl -sS "http://127.0.0.1:${PORT}/api/health"
```

Se `GLOBAL_IDLE_DATA_DIR=/data/global-idle` e o volume não existir:

```bash
mkdir -p /data/global-idle
# ou remova a variável e use server/data
```

Depois: **Restart** do nó Node (ou `pm2 restart all`) → abrir  
`http://global-idle.sp1.br.saveincloud.net.br/api/health` (HTTP no trial).

## 9. O que não fazer

- Não criar ambiente **PHP + Apache** para este jogo.
- Não fazer push direto em `origin/main` por causa deste trial.
- Não commitar `.env` nem `server/data/*.json` com saves reais (já estão no `.gitignore`).
- Não depender do Cloudflare Tunnel local como “servidor alpha” permanente — o PaaS é o caminho certo para imersão de test-server.
- No trial, use **HTTP** se SSL pago não estiver disponível.
