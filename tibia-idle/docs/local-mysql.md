# MySQL local (Windows)

O jogo **não precisa de rewrite** para MySQL: `server/db.js` já tem `MysqlStore` + `ensureSchema()`. Com `MYSQL_HOST` vazio, continua no JSON em `server/data/`.

## Pré-requisitos neste PC

- XAMPP MariaDB em `C:\xampp\mysql` (porta **3306**)
- Credenciais usadas no `.env` local: `root` / `admin`
- Banco: `global_idle` (criado se não existir; tabelas no boot)
- `server/.env` gitignored — copie de `server/.env.example` e preencha `MYSQL_*`

Subir MySQL:

```powershell
Start-Process -FilePath 'C:\xampp\mysql_start.bat' -WindowStyle Minimized
```

## Migrar JSON → MySQL (uma vez)

Com MySQL no ar e `.env` apontando para ele:

```powershell
cd C:\Users\Tomio\Desktop\ot-idle\tibia-idle\server
node ../tools/migrate_json_to_mysql.js
```

Importa contas (incl. **1/1**, **2/2**, Rox + `missions`/`missionsDone`), personagens (IDs preservados), party e instances. Histórico antigo de invites é ignorado (índice único). Snapshots grandes do JSON **não** são migrados.

## Subir o servidor com MySQL (dia a dia)

Script recomendado (checa MySQL, carrega `.env`, sobe na 8001):

```powershell
cd C:\Users\Tomio\Desktop\ot-idle
powershell -ExecutionPolicy Bypass -File tibia-idle\scripts\start-local-mysql.ps1
```

Se a porta 8001 já estiver ocupada:

```powershell
powershell -ExecutionPolicy Bypass -File tibia-idle\scripts\start-local-mysql.ps1 -KillExisting
```

Manual (equivalente):

```powershell
cd C:\Users\Tomio\Desktop\ot-idle\tibia-idle\server
# com server/.env preenchido:
node server.js
```

Log esperado: `[db] MySQL conectado em 127.0.0.1:3306/global_idle`.

Smoke rápido:

```powershell
Invoke-RestMethod http://127.0.0.1:8001/api/health
Invoke-RestMethod http://127.0.0.1:8001/api/login -Method POST -ContentType 'application/json' -Body '{"login":"1","password":"1"}'
```

## Voltar para JSON

1. Pare o processo na porta 8001.
2. Esvazie `MYSQL_HOST=` no `.env` (ou `$env:MYSQL_HOST=''`).
3. Suba de novo — usa `server/data/*.json` (os arquivos JSON **não** são apagados pela migração).

## Dump / restore (migração para a VM)

Ferramentas XAMPP:

- `C:\xampp\mysql\bin\mysqldump.exe`
- `C:\xampp\mysql\bin\mysql.exe`

### No PC (dump)

```powershell
$dump = "$env:USERPROFILE\Desktop\global_idle.sql"
& "C:\xampp\mysql\bin\mysqldump.exe" -u root -padmin --databases global_idle --single-transaction --routines --triggers -r $dump
Get-Item $dump
```

Copie `global_idle.sql` para a VM (scp/sftp). **Não** commite o dump no git.

### Na VM (restore + env)

```bash
# MySQL/MariaDB já instalado e rodando
sudo mysql -e "CREATE DATABASE IF NOT EXISTS global_idle CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
mysql -u root -p global_idle < /caminho/global_idle.sql
```

No `.env` da app (mesmo formato do local; senha da VM):

```bash
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASS=<senha-da-vm>
MYSQL_DB=global_idle
HOST=0.0.0.0
PORT=3000
TEST_SERVER=1
NODE_ENV=production
TRUST_PROXY=1
```

Branch de deploy: `cursor/alpha-test-deploy`. Detalhes de VM/nginx/pm2: `docs/alpha-test-oracle-cloud.md`.

## Checklist rápido → Oracle VM

1. Local estável: health OK, login `1/1` e `2/2`, personagem carrega, lease ok.
2. `mysqldump` do `global_idle` (comando acima).
3. VM: clone branch `cursor/alpha-test-deploy`, `npm install`, MySQL com o mesmo schema (restore do dump).
4. Mesmas variáveis `MYSQL_*` (+ `HOST`/`PORT`/`TEST_SERVER`/`TRUST_PROXY`).
5. `pm2` + nginx conforme `docs/alpha-test-oracle-cloud.md`.
6. `curl` health na VM e login de teste.

## Notas

- Missões **por conta** (`missions` / `missionsDone`) persistem no MySQL (`accounts.missions`, `accounts.missions_done`).
- Progresso de missão **no personagem** continua em `characters.data` (JSON).
