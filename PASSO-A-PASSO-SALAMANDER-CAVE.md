# PASSO A PASSO — SALAMANDER'S CAVE (sprites + deploy)

Pasta local: `C:\Users\Tomio\Desktop\ot-idle` (no git bash: `/c/Users/Tomio/Desktop/ot-idle`)

O código da Salamander's Cave (hunt 0–100) está na arena (`arena/01a01237-old-idle`).
Faltam os sprites: **83 tiles do mapa** + **7 itens de loot novos**, extraídos
do client 15.x na SUA máquina, e depois o push para a main + deploy na VM.

---

## PASSO 1 — Abrir o Git Bash e sincronizar com o GitHub

```bash
cd /c/Users/Tomio/Desktop/ot-idle
git status --short
```

Se listar arquivos (mudanças suas não commitadas), commite antes:

```bash
git add -A
git commit -m "wip: mudancas locais"
```

Agora sincronize e traga o código da Salamander's Cave (a arena é fast-forward da main):

```bash
git fetch origin
git checkout main
git reset --hard origin/main
git merge --ff-only origin/arena/01a01237-old-idle
```

Depois disso, `git log --oneline -1` deve mostrar o commit da salamander cave.

---

## PASSO 2 — Conferir Python + Pillow

```bash
python3 -V
python3 -c "import PIL; print(PIL.__version__)"
```

Precisa mostrar uma versão (ex.: Python 3.12 / Pillow 10.x).
Se der erro, instalar: `pip install pillow` (ou usar o venv que você já tem).

---

## PASSO 3 — Localizar a pasta do client 15.x extraído

```bash
find /c/Users/Tomio -maxdepth 5 -name "Tibia.spr" 2>/dev/null
```

Anote a pasta que contém `Tibia.dat` e `Tibia.spr`
(ex.: `/c/tibia860/extracted` — a mesma que você usou na Prison).

---

## PASSO 4 — Extrair os tiles do mapa da Salamander's Cave

Troque `/c/PASTA/DO/CLIENT/extracted` pelo caminho real do passo 3:

```bash
TIBIA860="/c/PASTA/DO/CLIENT/extracted" python3 tools/import_otbm_sprites.py game/maps/salamandercave.otbm
```

Esperado: extrai ~83 PNGs em `game/assets/tiles/`, patterns em
`js/tilepatterndata.js`, nomes em `js/tiledata.js` e regenera
`game/rme/data/known_tiles.js`.

---

## PASSO 5 — Extrair os sprites dos itens de loot

Primeiro confira os caminhos do DAT/SPR no topo da ferramenta:

```bash
grep -n "^DAT\|^SPR" tools/add_missing_loot_items.py
```

Se mostrarem `/tmp/tibia860/...` (padrão do Linux), edite para o caminho
real da sua máquina (formato Windows, barra normal):

```bash
notepad tools/add_missing_loot_items.py
```

Troque as duas linhas para, por exemplo:

```
DAT = "C:/tibia860/extracted/Tibia.dat"
SPR = "C:/tibia860/extracted/Tibia.spr"
```

Salve e rode:

```bash
python3 tools/add_missing_loot_items.py tools/data/canary-items.xml game
```

Esperado: `adicionados:` com **7 itens da Salamander's Cave**
(swampling-moss, piece-of-swampling-wood, simple-jo-staff, damselfly-wing,
damselfly-eye, marsh-stalker-feather, marsh-stalker-beak) — e talvez mais
alguns de outras hunts antigas que também estavam sem ficha
(hellhound-slobber, hellspawn-tail, fiery-heart, blazing-bone etc. —
são bônus, deixa adicionar). O `salamander-cave.js` já corrige os
preços/tipos oficiais da TibiaWiki por cima.

---

## PASSO 6 — Rodar os testes

```bash
node tools/test_salamander_cave.js
node tools/test_hunts_modal.js
node tools/test_prison.js
```

`test_salamander_cave.js` deve terminar com:

```
ok: salamander cave (hunt 0–100, importação Canary, mapa e loot completos)
```

---

## PASSO 7 — Revisar o que mudou

```bash
git status --short
git diff --stat
```

Esperado (além do que já estava): PNGs novos em `assets/tiles/` e
`assets/item/`, e alterações em `gamedata.js`, `tiledata.js`,
`tilepatterndata.js` e `rme/data/known_tiles.js`.

---

## PASSO 8 — Commitar e subir para a main

```bash
git add -A
git commit -m "feat: salamander cave — sprites de tiles e loot (client 15.x)"
git push origin main
```

Se o push for rejeitado (non-fast-forward):

```bash
git fetch origin
git rebase origin/main
git push origin main
```

(Se o rebase acusar conflito: `git rebase --abort` e colar o erro no chat.)

---

## PASSO 9 — Deploy na VM (ubuntu@global-idle-alpha)

```bash
ssh ubuntu@global-idle-alpha

cd /opt/global-idle
cp -a .env /tmp/env.bak 2>/dev/null || true
cp -a server/.env /tmp/env.server.bak 2>/dev/null || true

cd /tmp
rm -rf old-idle-deploy
git clone --depth 1 -b main https://github.com/tomio1447/old-idle.git old-idle-deploy

cd /opt/global-idle
cp -a /tmp/old-idle-deploy/tibia-idle/. /opt/global-idle/

test -f /tmp/env.bak && cp -a /tmp/env.bak /opt/global-idle/.env
test -f /tmp/env.server.bak && cp -a /tmp/env.server.bak /opt/global-idle/server/.env

npm install --omit=dev
pm2 restart global-idle --update-env
pm2 save
sleep 3
curl -sS http://127.0.0.1:3000/api/health
```

Sucesso = resposta com `"ok":true`. Depois, Ctrl+F5 no navegador.

---

## SE ALGO FALHAR

Cole aqui no chat: (1) qual passo, (2) a saída completa do comando.
NÃO rode `git push --force origin main` em nenhuma hipótese.
