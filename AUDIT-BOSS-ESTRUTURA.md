# Auditoria: AOE dos monstros + healthbar dos bosses + estrutura dos scripts de boss

Data: 2026-08-22 · Branch: `arena/01a02a41-old-idle` · **Implementado nesta leva** (ver §4).

---

## 1. Magias AOE dos monstros — CAUSA RAIZ ENCONTRADA E CORRIGIDA

### Bug 1 (servidor): dano fantasma — AOE radius-alvo acertava qualquer player a QUALQUER distância
- **Onde**: `runMobSkills` (authoritative_engine.js). O filtro de vítimas chamava `mobSkillHitsTarget`
  por candidato, que REANCORAVA a explosão em cada candidato — e o centro de cada candidato sempre
  vale 1 na matriz de raio, então TODO player vivo era considerado "dentro da área".
- **Sintoma**: em party, skill `radius` com `alvo:1` + `range>1` (ex.: explosão de energia do
  falcon-paladin `r:2 rng:7 alvo:1`) atingia membros do outro lado do mapa, fora do FX pintado.
- **Prova pré-fix** (dummy sintético, ch:100, 60s): player a 9 células do centro da explosão levou
  30/30 casts. **Pós-fix**: 0/30 — só quem está nas células da área leva dano.
- **Fix**: vítimas por PERTENCIMENTO às células já computadas (âncora = alvo primário ou o próprio
  monstro — exatamente as células do `areafx` pintado). "O que você vê é o que te acerta."

### Bug 2 (client offline): AOE só atingia o alvo primário em party
- **Onde**: `mobCastSkill` (combat.js) chamava `mobSkillHit` apenas para o alvo do mob — o servidor
  acerta todos nas células; o client não.
- **Sintoma**: em hunt local com 2+ personagens, o FX da área pintava em cima de todos e só 1 levava dano.
- **Fix**: novo `mobSkillAreaVictims(c, mob, pl, sk)` (espelho do cálculo do servidor) + loop
  multi-vítima no `mobCastSkill`.
- **Prova pós-fix** (makara radius 3/5, party de 3 no VM): adjacente 262 hits (antes 0), longe 0 hits.

### Cenários verificados SEM bug (regressão pós-fix, números idênticos ao pré-fix):
| Hunt (servidor, 180s) | Dano AOE medido (hits por elemento) |
|---|---|
| marapur-nagas | earth 26, ice 23 |
| dragons | fire 237 |
| cobra-bastion | earth 159, death 10 |
| buried-cathedral | ice 193, fire 49, lifedrain 39 |
| ingol-terrain | energy 175, earth 51 |
| prison-1 | energy 146, earth 93 |
| falcon-bastion | lifedrain 117, earth 24, energy 8 |
| dark-thais | holy 294, ice 250 |
| library-fire | fire 206 |

Bosses de arena (servidor): dread-maiden/fear-feaster/unwelcome/oberon/timira/faceless-bane/goshnars/
ferumbras/megalomania/pale-worm todos causam dano AOE. doctor-marrow/leiden não têm skills de área no
catálogo (só melee/single) — não é bug. Scarlett quase não ataca por passar a maior parte do tempo
nos gates de 75/50/25% + QTE (mecânica).

---

## 2. Healthbar dos bosses — por que alguns descem em % fixas

A barra é UMA só para todos (`drawBossBar` em render.js): `pct = boss.hp / boss.maxHp` — **HP real**.
O comportamento "em degraus" vem das **mecânicas de alguns bosses**, que manipulam/travam o HP:

| Boss | Mecânica no HP | Como a barra aparece |
|---|---|---|
| **Scarlett Etzel** | Gates exatos em **75% / 50% / 25%** (`thresholds:[0.75,0.50,0.25]` no server 5318 e client scarlett-boss.js 124) + imunidade até o QTE da dança | **Descida em % fixas** — congela no gate, só desce após acertar a dança |
| **Grand Master Oberon** | 4 vidas: HP zera → **volta a 100%** + debate invulnerável | Barra reseta para o topo várias vezes |
| **Goshnar's Greed** | Imune até matar os Greedbeasts | Barra congelada; depois desce normal |
| **Goshnar's Megalomania** | Imune até matar os Aspects | Barra congelada; depois desce normal |
| Goshnar's Spite/Malice | Fases QTE (bolha/maldição) | Pausas durante as fases |
| Timira, Doctor Marrow, Faceless Bane, Leiden, Dread Maiden, Fear Feaster, Unwelcome, Ferumbras, Pale Worm, World Bosses | nenhuma trava | **HP real suave** (medido: quedas de 0,05%–1,6% por hit) |

Série de HP medida no servidor (120s): Timira 60,2% final, Faceless 55,3%, Oberon 52,5%, Leiden 1,8% —
deltas médios 0,4–1,6% com desvio-padrão baixo = tracking contínuo, sem degraus.

---

## 3. Estrutura dos scripts de boss — NÃO, não são todos iguais

Existem **6 arquiteturas** de boss rodando em paralelo:

| # | Arquitetura | Bosses | Registro/def | Ataques | HP |
|---|---|---|---|---|---|
| 1 | **Arena genérica** (sem mecânica) | the-monster, timira, ferumbras-mortal-shell, doctor-marrow, faceless-bane, leiden, the-dread-maiden, the-fear-feaster, the-unwelcome, deepling bosses | BOSS_DEFS (game.js) + arquivos de registro próprios (doctor-marrow.js, faceless-bane.js, leiden.js, feast-of-souls.js, deepling-bosses.js) | engine padrão (runMobSkills + melee) | real |
| 2 | **Soulwar custom** | goshnar-s-greed/hatred/spite/malice | BOSS_DEFS com `mechanic:` + soulwar.js (client) + hooks no engine (auth.greed/hatred/spite/malice) | engine + mecânica de imunidade/fase | real + congelamentos |
| 3 | **Scarlett** | scarlett-etzel | hardcode em combat.js:93 + scarlett-boss.js (client) + auth.scarlett (server) | engine + gates 75/50/25 + QTE rítmico | **degraus fixos** |
| 4 | **Oberon** | grand-master-oberon | grandmaster-oberon.js (client) + auth.oberon (server) | engine + 4 vidas + debate | reseta a 100% |
| 5 | **Lobbies multi-player** | goshnar-s-megalomania (megalomania_lobby.js), the-pale-worm (pale_worm_lobby.js) | BOSS_DEFS + lobby server + client | engine + aspects (mega) | real + imunidade (mega) |
| 6 | **World bosses** | world-boss-wz1/2/3 (2.5M/4M/6M HP) | BOSS_DEFS + world_boss.js (server) + world-boss-ui.js | **combate 100% local do client** (server só agrega dano reportado) | real (local) |
| — | **Mini bosses de hunt** (`bossMobs`) | 4 do Falcon Bastion | HUNTS.bossMobs (engine + falcon-bastion.js) | engine padrão com boss:true (loot → Reward Chest) | barra overhead de mob (real), sem bossbar |

Duplicações client/server (mesma mecânica escrita 2x):
- Gates da Scarlett: `scarlett-boss.js:440` (client) e `authoritative_engine.js:5636` (server)
- Greed/immunes: `soulwar.js` (client) e engine (server)
- Oberon lives/debate: `grandmaster-oberon.js` (client) e engine (server)

---

## 4. IMPLEMENTADO nesta leva

### A. AOE — corrigido (Opção "implementar os dois")
1. **Servidor** (`authoritative_engine.js` · `runMobSkills`): vítimas por pertencimento às células da
   área (âncora = alvo primário / monstro) — fim do dano fantasma através do mapa em party.
2. **Client** (`combat.js`): `mobSkillAreaVictims` + loop multi-vítima no `mobCastSkill` — party
   offline passa a levar AOE de verdade (espelho do servidor).

### B. Healthbar — Opção 2 (manter mecânicas + sinalizar; a barra continua HP real)
- `render.js` · `drawBossBar`:
  - **Marcos dourados** nos gates da Scarlett (75%/50%/25%) — o degrau fica visível como mecânica;
  - **Chip "IMUNE — ..."** à direita quando `qteImmune`/`greedImmune`/`megaImmune`/debate do Oberon;
  - **"VIDAS n"** à esquerda para o Oberon (`combat.oberon.lives`, publicado pelo servidor no snapshot).
- Os gates/vidas/imunidades NÃO foram removidos (são as mecânicas de assinatura dos bosses).

### C. Não feito (pendências conscientes)
- Unificação das duplicações client/server das mecânicas (Scarlett/Oberon/soulwar) — refactor maior,
  sem ganho de jogador imediato; manter como follow-up.

### D. Follow-up feito (2026-08-22, turno seguinte)
- **Hunts que só existiam no cliente agora registradas no HUNTS do servidor**: marapur-nagas,
  dt-seal, juggerseal, ferumbras-way, catacombs-oramond, minotaur-oramond-east,
  deathlings-sunken-temple, deeplings-deeper, elf-yalahar, grand-master-oberon-room, leiden-room,
  stonerefiner. Antes HUNTS[slug] era undefined: o pool congelava nas espécies da 1ª wave
  (monstros ausentes dela nunca nasciam — ex.: minotaur-oramond-east só via quem veio na leva 1) e
  os spawnWeights 33/33/25/13 do ferumbras-way nunca aplicavam (guards das linhas 564-568 eram
  no-ops). Validado: pesos do ferumbras-way ~31,7/31,7/24,0/12,5 (33/104 cada, proporção correta),
  pool do minotaur cobre as 6 espécies, waves 6-10 nos cinco hunts hard.

### Provas (rodar de novo a qualquer momento)
- `tibia-idle/server/_test_radius_pairs.js` — 0 casts fantasma pós-fix (era 30/30)
- `tibia-idle/server/_test_radius_alvo.js` / `_test_radius_alvo_far.js` — adjacente leva, distante não
- `tibia-idle/server/_test_client_aoe.js` — client solo + party (adjacente 262 hits, longe 0)
- `tibia-idle/server/_test_mob_aoe.js <huntId> <slugs>` — regressão de dano por hunt
- `tibia-idle/server/_test_boss_audit.js <bossIds>` — dano + série de HP por boss
