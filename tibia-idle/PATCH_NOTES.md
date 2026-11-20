# Patch Notes

Histórico de alterações do jogo, mais recentes primeiro.

---

## 2026-11-20 — Notificação "!" de recompensa de quest a coletar

- Sempre que uma missão de quest está concluída e a recompensa ainda
  não foi resgatada, um badge **"!"** dourado aparece:
  - no botão **QUESTS** da topbar (`#btn-quests`), e
  - no **card da quest** dentro do modal QUESTS (sobre o retrato).
- Detecção por quest via `rewardReady(p)` no `QUEST_DEFS`:
  - **Roost of the Graveborn** — Crypt Runes (M3, auto-resgate ao abrir)
  - **Order of the Stag** — Royal Bounacean Advisor Outfit (M3)
  - **Make Believe** — outfit/elmo/montaria/arma Moonsilver pendentes
  - **Book World** — Illuminator Outfit · **Bloody Tusks** — Gloom Maw
  - **Primal Ordeal** — Noxious Ripptor (Hazard 6, claim manual)
- O badge do botão atualiza em todo `renderAll`; o do card no render do
  modal. Some ao resgatar/receber a recompensa.

---

## 2026-11-20 — Dragon Ancestor Spirit: outfit corrigida + novo modal de troca

- **Outfit corrigida** — o retrato do NPC usava o looktype 1899, que é a
  Night Harpy (o NPC aparecia como uma ave). Agora usa o looktype 1883
  (dragão espectral sombrio). Importer atualizado para não regredir.
- **Modal dedicado** — a troca de Crypt Runes saiu do painel genérico
  para um layout próprio (`gi-crypt-*`): cabeçalho com retrato do NPC,
  citação, grade de 5 runas com destaque `.is-owned` nas que o jogador
  possui, caixa de recompensa com a roleta de armas Crypt, botão
  TROCAR que só habilita (`.is-ready`) com as 5 runas e status de
  bloqueio. O botão Fechar usa o fechamento padrão do modal de NPC.
- Regras inalteradas: 1 de cada runa → 1 arma Crypt aleatória com os
  mesmos pesos oficiais; débito antes do giro e crédito na Loot Pouch.

---

## 2026-11-20 — Roost of the Graveborn: Missão 1 reduzida para 500 kills

- A Missão 1 da quest (`MISSION_DEFS["unhallowed-crypt"]`) passa de
  **5.000 para 500 kills** na Unhallowed Crypt para liberar a cadeia de
  bosses (Adventurer Group → … → Bonelord's Phylactery). Label,
  descrição da quest, `roostState` (progresso/conclusão) e testes
  atualizados. Progresso já acumulado continua valendo — quem tinha
  ≥500 kills tem a missão completa automaticamente.
- `game/js/roost-graveborn.js` → `?v=roost-m1-500-v1`.

---

## 2026-11-20 — Reward Chest: loot de boss aparece na Loot Pouch na hora + correções de integridade

- **Bug corrigido**: ao recolher o loot de boss online, o item não
  aparecia na Loot Pouch até trocar de personagem. `rewardChestApplyServer`
  atualizava os dados mas nunca repintava o painel `#lootpouch` (na cidade
  não há loop de render — só `renderAll` o atualizava). Agora repinta
  Loot Pouch, mochila e Supply Stash no ato do claim.
- **Duplicação corrigida (servidor)**: o patch do claim dentro de
  instância ativa não rebasiava `_pouchBase` — o split
  terminal/dirty via `pouchDelta` somava o MESMO delta de novo e os
  itens entravam duplicados no shared. O patch agora rebasia a
  baseline de todos os membros que compartilham a pouch por
  referência (mesmo padrão de `syncInstancePouchCopies`).
- **Ressurreição de bundles corrigida**: `rewardChestBundles` é array
  compartilhado por referência entre os membros da conta na instância
  (`shareInstanceContainers`). Remover bundle via `filter()` trocava a
  ref só no personagem que clicou — o tick seguinte ressuscitava o
  pacote nos demais. Remoções agora são `splice` in-place
  (`rewardChestRemoveBundleIfEmpty`/`rewardChestCompactBundles`), com
  paridade no cliente.
- `tools/test_boss_reward_online.js` cobre: remoção in-place com ref
  compartilhada, rebase de `_pouchBase`, repaint e aplicação do estado
  do claim (pouch/stash/chest) num sandbox.
- `game/js/reward-chest.js` → `?v=reward-claim-repaint-v1`.

---

## 2026-11-20 — Modal de hunts: Ferumbras Ascendant movido para HUNTS 250+

- As 3 hunts de Ferumbras Ascendant (**Ferumbras Ascendant Way**,
  **Grounds of Damnation/Tafariel** e **Grounds of Destruction/
  Apocalypse** — todas minLevel 250) saíram da seção dedicada
  "FERUMBRAS ASCENDANT" e entram em **HUNTS 250+** no modal.
- `game/js/hunt-sections.js` → `?v=ferumbras-250-v1`. A `cat`
  `ferumbras-ascendant` dos hunts permanece (só a seção mudou).

---

## 2026-11-20 — The Roost of the Graveborn Quest — informações in-game atualizadas

A página da quest (QUEST_DEFS `roost-of-the-graveborn-quest`) agora
descreve as mecânicas realmente implementadas de cada encontro — não
mais só a cadeia nominal:

- **Descrição** reescrita: M1 5.000 kills na Unhallowed Crypt →
  cadeia de 4 bosses com as mecânicas de cada um (avatares + Bright
  Crystal + Fatal Bug; vulcões→Flame Totems/imortalidade; Ice
  Crawlers; Bonelord Totems invulneráveis) → Phylactery em 2 fases
  (Soulcages de pool compartilhado + dragon spirits; Phylactery + 4
  Enthralled Dragons sob os gazes) → 5 Crypt Runes.
- Novo painel **"MECÂNICAS DA CADEIA"** no detalhe da quest, com uma
  linha de estratégia por boss.
- `game/js/roost-graveborn.js` → `?v=roost-info-v1`. Nenhuma
  mecânica alterada — apenas a informação exibida.

---

## 2026-11-20 — The Order of the Stag Quest (350+) — 3 missões

A quest que amarra a região da Isle of Ada: duas missões de caça nos
hunts 400+ recém-lançados e o boss final, com recompensas oficiais.

### Missões (registradas como MISSION_DEFS dos hunts)

- **M1 — Stag Bastion**: eliminar **500 monstros** na hunt.
  Recompensa: **The Mariner's Compass from the Antoinette** ×1 —
  item oficial `itemid 52759`, `w 30`, **extra slot com arm 3**
  (a pedido do jogador; oficialmente é um extra-slot item).
  `npcvalue 0` → **sem comprador NPC → sell 0**.
- **M2 — Arean Outskirts**: eliminar **50 Night Harpies**
  (contador `monster:"night-harpy"` — só harpias contam).
  Recompensa: **acesso ao Court Warlock** (`bossAccess`); o
  requirement do boss agora é `level 400 + mission arean-outskirts
  + access court-warlock` — com migração automática para quem já
  tiver a missão completa.
- **M3 — Court Warlock**: derrotar o boss. Recompensa: **Royal
  Bounacean Advisor Outfit (addon 1 + 2)** — looktypes oficiais
  m=1436 / f=1437 (já presentes no `appearancedata`), concedida
  automaticamente ao abrir a quest após o kill
  (`missionsDone["order-of-stag:outfit"]`).

### Detalhes

- `QUEST_DEFS["order-of-the-stag-quest"]`: level 350, `questType:
  "boss"`, renderDetail próprio com barras de progresso das 3
  missões, ícone do compass, preview da outfit e requisito 350+.
- Paridade: progresso por hunt counter (`p.missions[huntId].progress`)
  — engine incrementa `.kills` e `.progress[slug]` a cada kill;
  claims/recompensas pelo fluxo genérico de missões
  (`tryCompleteMissionRewards`) + `missionsDone` sincronizado à conta.
- Kills já registrados nos hunts (progress acumulado desde o
  lançamento) contam retroativamente — mesmo comportamento da
  missão de 5.000 da Unhallowed Crypt.
- `game/js/court-warlock.js` (`?v=order-of-stag-v1`), ícone
  `assets/item/mariners-compass-from-the-antoinette.png` (cid 52759).

---

## 2026-11-20 — Court Warlock — boss 400+ final da The Order of the Stag (update 15.20)

### Ficha oficial

- **race_id 2741 · looktype OFICIAL 1903** (decodificado do bestiário
  do client 15.20) · **hp 120.000** · **exp 147.000** · Archfoe;
  walksthrough Fire/Energy/Poison, para-immune, sense-invis;
  cooldown 20h (oficial: resetável com Twisted Marionette).
- Sala `court_room.otbm` — center {1021,1025} / bossspawn {1021,1022} /
  playerspawn {1021,1028} (coords oficiais), z=7.

### Encontro oficial em 3 fases (Spoiler da quest)

- **F1 — Raubritters**: waves spawnam **na posição do jogador** —
  Poisoned (imune earth), Frozen (imune ice), Raging (imune fire),
  Energised (distance fighter, imune energy); hp oficial 35.000.
  **4 do mesmo tipo vivos → viram a versão enraivecida** (+hp/dano).
  Teleporte periódico pela sala + **terreno especial** (as 12 células
  de ground 500 do OTBM, anel central) causa **Death Damage alto por
  exposição**.
- **F2 — Falcons**: após as waves a sala enche de **Falcon Knights e
  Falcon Paladins**; o terreno especial some.
- **F3 — Court Warlock**: entra com **menos HP conforme a luta**
  (implementado: hp base + 15k por transformação forçada).
- Paridade: `tickCourtWarlock` + bind em `arenaBossBindMechanics` no
  engine; `courtWarlockBossInit/BossTick/Cleanup` no cliente
  (`court-warlock.js`), hooks em `combat.js`/`game.js`.

### Loot oficial completo

- **Stag Set** (10 peças, lvl 350, upgrade class 4, ids oficiais
  52348–52357): helmet/robe/plate/legs/shinguards/boots/footwraps/
  spellbook/scrolls/shield — "Negotiable", **sem comprador NPC →
  sell 0** (padrão das crypt weapons).
- **Twisted Marionette** 52746 — npcvalue 125.000 (Yasir), drop raro.
- **Wooden Spellbook** 25699 — npcvalue 12.000 (Talila/Valindara).
- Spellbook of Mind Control, Terra Hood, Lightning Headband, Magma
  Coat, Blue/Red Gem, moedas (até **500 cc very rare**), poções
  ultimate (health/mana/spirit).
- Looktypes dos Raubritters **estimados** do lote livre 15.20
  (não-bestiário, sem ficha pública): poisoned 1895, frozen 1890,
  raging 1910, energised 1909; enraivecidos 1888/1885/1919/1882.
  Valores de waves/teleporte/bônus de hp são design documentado.

### Stag Bastion — hunt 400+ (mesma sessão)

- `stag_bastion.otbm` (20×19, z=7): spawn radius oficial
  {1017,1020}–{1025,1028} (81/81 caminhável), center {1020,1024},
  **respawn 8–10** (pack 9).
- **3 Raubritters de hunt** (fichas OFICIAIS do wikitext):
  - **Skirmisher** — melee: hp 11.000, exp 8.550, armor 100, mit 3.92
  - **Chastener** — conjurador elemental + escudo: hp 10.000, exp 9.500,
    armor 80, mit 3.68
  - **Marksman** — distance fighter oficial: hp 10.500, exp 9.025,
    armor 90, mit 3.45
  - resistências oficiais (dmgMod→resist), walksthrough campos,
    para-immune + sense-invis; looktypes estimados (1908/1920/1889).
- **Loot oficial completo** — creature products novos: stag parchment
  (52664→3k), silver poniard (52662→2k), cuirass plate (52663→1k),
  bottle of raubritter lager (52745→sem comprador), marinated sturgeon
  (52638→sem comprador), crystalline arrow, rings plasma verde/laranja
  (23531/50150→8k); placeholders de preço corrigidos ao oficial
  (shockwave amulet 3k, magma amulet 1,5k, gold ingot 5k).

### Arean Outskirts — hunt 400+ (mesma sessão)

- `arean_outskirts.otbm` (39×41, z=7): spawn rect oficial
  {1015,1014}–{1023,1020} (63/63 caminhável), center {1020,1018},
  respawn 8–10 — hunt mista Isle of Ada.
- **Night Harpy** (ficha oficial): hp 14.000, exp 21.000, armor 90,
  mit 3.92, speed 190, Bird/Hard — resistente earth 40%/fire 30%,
  fraca a ice/death/holy; loot oficial: potions 8-12, **night harpy
  feathers** (52633→5k), gems gigantes e 100cc very rare.
- + os 3 Raubritters (mesma área oficial da Isle of Ada).
- Correções de preço: 5 giant gems placeholder → npcvalue oficial
  (50k–90k).

### Correções de looktype (staticdata do client 15.20)

- Adventurer Group: yorik 268 · percy 137 · grendel 144 ·
  fiona 1681 · nigel 1837 (estimativas anteriores substituídas).
- Zharvorin's Spirit → 1884 (1903 é o looktype oficial do
  Court Warlock — colisão resolvida).

---

## 2026-11-20 — The Roost of the Graveborn Quest — boss quest 450+ (update 15.20)

### Progressão (oficial)

- **M1** — 5.000 kills na Unhallowed Crypt → libera **Adventurer Group**
  (The First Dragon, `first_dragon.otbm`).
- **M2** — cadeia sequencial de 4 bosses → libera **Bonelord's
  Phylactery** (boss final):
  1º Adventurer Group (first_dragon) → 2º Eldritch Dragon Lord
  (Under Fire, `eldritch_dl.otbm`) → 3º Ice Horror (The Frozen Hoard,
  `ice_horror.otbm`) → 4º The Gravedigger (The Last Dragon Soul,
  `gravedigger.otbm`).
- **M3** — derrotar a Phylactery (`bonelords_phylactery.otbm`) →
  **1 de cada Crypt Rune** (auto-resgate ao abrir a quest).

### Bosses (fichas oficiais 15.20)

- **Adventurer Group** (The First Dragon, `first_dragon.otbm`,
  center {1029,1031} / bossspawn {1030,1027} / playerspawn {1029,1034}) —
  encontro oficial **multi-membro**: a sala abre com **5 aventureiros
  por vocação** (Yorik=Knight 2712, Percy=Paladin 2713, Grendel=Druid
  2714, Fiona=Sorcerer 2715, Nigel=Monk 2716 — HP só Nigel é oficial,
  155k) + uma **Bright Crystal** estática (oficial: explode em Mana
  Drain AoE raio 2 ao morrer — drena 35% da mana máx.).
  - **Transformação oficial**: membro em vida vermelha (≤30%) vira o
    **avatar da vocação** — Steel 1593 / Light 1594 / Storm 1595 /
    Nature 1596 / Balance 1823 — que acerta **crítico em todos os
    ataques** (+30%) e **sofre 30% menos dano**
    (`def.damageTakenMul`, funnel único em `applyOutgoingDamage`;
    `mob.critAll` no melee + skills). Ordem de abate livre — a
    estratégia oficial é um avatar por vez.
  - Os 5 caem → **Fatal Bug** (race 2773, `lookItem 52836`, voices
    oficiais "BRRRRMM"/"I'm bugged!") entra na sala; matá-lo encerra e
    credita `adventurer-group`. Loot oficial dele: Ancient Crypt Rune
    + Worn Guide Book (rare). HP/XP ocultos — 520k/750k estimados.
- **Eldritch Dragon Lord** (Under Fire, `eldritch_dl.otbm`, center
  {1021,1028} / bossspawn {1021,1024} / playerspawn {1021,1030}) —
  race 2739, looktype 1879, exp 750.000, 680k hp; fire imune (oficial:
  se cura com fogo). **Vulcões oficiais**: 4 vents fixos
  ({1017,1024} {1026,1024} {1016,1034} {1026,1033}) que acumulam vida e
  evoluem **Pulsating Lava → Eruption → Flame Totem** (~18s/estágio,
  vent destruído respawna como lava em 30s). **3+ Flame Totems vivos →
  boss IMORTAL** (`mob.eldritchImmune` → dano 0 no funnel
  `applyOutgoingDamage`; totens atacam nova de fogo). Objetos oficiais:
  Eruption 51952 / Flame Totem 51953 (lookItem); Pulsating Lava sem
  objectID público → lava vent 391.
- **Ice Horror** — race 2733, looktype 1881, **hp oficial 542.700**,
  exp 259.000; ice 0% (imune), Death Ring 950+, Great Energy Wave 1300+.
  Sala `ice_horror.otbm` nas coords oficiais (center {1030,1029},
  boss {1030,1025}, player {1030,1031}). **Invoca Ice Crawlers**
  durante a batalha — sprite da Crystal Spider oficial ("looks the
  same as a Crystal Spider"), até 3 vivos, um a cada 12s
  (`tickIceHorror` no engine + `iceHorrorBossInit/BossTick/Cleanup`
  no cliente).
- **The Gravedigger** — race 2721, looktype 1880, exp 750.000;
  Fire Ball 600–800 (oficial). Sala `gravedigger.otbm` nas coords
  oficiais (center {1023,1032}, boss {1023,1029}, player {1023,1035}).
  **Invoca Bonelord Totems ×2** (oficial `Summon amount=2`) — objetos
  `lookItem 51192` **invulneráveis** (todos os dmg mods 0% →
  `damageTakenMul 0` no funil) que fazem área de morte; cooldown oficial
  resetável com Shrunken Head.
- **Bonelord's Phylactery / Bone Overlord** — race 2771,
  `lookItem 52831`, exp 1.000.000, 850k hp; earth 110% (fraco).
  Batalha máx. oficial 900s. Sala `bonelords_phylactery.otbm`
  (boss {1026,1025}, player {1026,1035}). Encontro oficial em
  **2 fases** (`tickBoneOverlord` + `boneOverlordBossInit/BossTick/
  Cleanup`):
  - **Fase 1** — 4 **Soulcages** (`objectID 52546`, hp oficial 120.000
    cada, **pool compartilhado**: dano em qualquer uma drena todas —
    propagado por delta de sync, nunca min() das vivas) + 4 **dragon
    Spirits imunes a todo dano** (Zharvorin/rooted, Myzareth/feared,
    Scarith/drunk, Elyrax/slowed — Energy Missile 450+ e Bleed
    Explosion 800+ oficiais); espírito a ≤2 sqm da sua cage **cura o
    pool** (~5.000/turno oficial) e teleporta à cage quando o pool
    cai abaixo de 50%. Resistências oficiais das cages: Zharvorin
    fraco Death+Physical, Myzareth fraco Energy, Scarith fraco Ice
    (mitigation 3.45 oficial), Elyrax fraco Death+Holy + Holy Chain
    1600+.
  - **Fase 2** — pool zerado → a **Phylactery entra** junto de **4
    Enthralled Dragons** ao sul (atravessam Fire/Energy/Poison —
    resist 100% oficial; life drain vital). Até 4 de cada invocável,
    como pedido.
  - **Gazes** durante toda a luta (~20s): *An Eye* (fuse 5s → 30% maxHP
    agony raio 2), *Wraithfire* (15% hp atual + campo 52441), *Mana
    Drain* (5% maxMP ×5), *Curse* (4 explosões físicas), *Bone Barrier*
    (4 barreiras objectID 6972 hp 10.000 ao redor do jogador —
    simplificação documentada do teleport à sala lateral).
  - Looktypes dos summons são **estimados** do lote livre 15.20
    (dragão 1883; espíritos 1886/1903/1904/1905) — o appearances.dat
    não traz nomes.
- Cooldown **20h** em todos; gates `enforced` + `killsRequired`
  sequencial (boss modal "ROOST OF THE GRAVEBORN 450+").

### NPC Dragon Ancestor Spirit

- `crypt-exchange` (catálogo de NPCs): exige **1 de cada Crypt Rune**
  (fiery/icy/deathly/ancient/necromantic) e troca por **1 arma Crypt
  aleatória** — debita antes do giro (troca persistida).
- Roleta gif igual à do Make Believe: preview ciclando ícones + giro
  que desacelera até o sorteado. Pesos oficiais (Crypt Runes
  Statistics): Spine 82/15,8% · Slicer 79/15,3% · Bile 76/14,7% ·
  Strike 75/14,5% · Splitter 73/14,1% · Breaker 69/13,3% ·
  Jaw 64/12,4%.

### Itens novos (12, cids oficiais 15.20)

- 7 **Crypt weapons** lvl 450 cls 4 — sell 0 ("Negotiable", sem
  comprador NPC): spine (bow pal, atk+8 hit+5 dist+3 range6 ice+5%),
  slicer/splitter/breaker (sword/axe/club knight, atk 58 def 33 +4),
  strike (fist monk, atk 45 def 20 fist+4 ml+1), bile (wand sorc,
  85-135 physical, range 7, ml+4, fire+6%), jaw (rod druid, range 5,
  ml+4, energy+6%). **ids 52332–52338 corrigidos** (estavam 51309–15
  no weapondata).
- 5 **Crypt Runes** — sell 0 (quest, npcvalue 0): cids 52657–52661.
- Creature products novos (Yasir, npcvalue oficial): worn-guide-book
  250k, golden-claw 250k, shrunken-head 250k, ancient-scales 400k,
  soul-trap 250k, skull-tendril 650k, bone-spikes 1,5M, icy-scales
  250k, icy-horns 250k, frozen-crapace 500k, dragon-tongue 550, shard
  2.000 (id 7290 — item antigo que faltava no catálogo).

### Sprites e mapas

- Sheets 9×4 reais do DAT: eldritch (1879), gravedigger (1880),
  ice-horror (1881); sheets estáticos dos `lookItem` 52836/52831;
  portrait do NPC (looktype 1899); 166+ tiles importados dos 5 OTBMs
  (2 ids invisíveis: 33720/51935 metadata).
- Paridade cliente/servidor: `roost-graveborn.js` carrega no sandbox
  do engine + `registerMonsters(MONSTERS)` + 5 HUNTS `*-room`.

### Teste

- `node tools/test_roost_graveborn.js` — OTBM bounds/spawns conectados,
  cadeia de gates, fichas oficiais, cids/preços, sheets, âncoras,
  roleta ponderada (40k giros), troca 5-runas, paridade engine.

---

## 2026-11-20 — Unhallowed Crypt — nova hunt 400+ (update 15.20)

### Hunt

- **Unhallowed Crypt** (HUNTS 400+): mapa oficial OTBM 34×27 z=7
  (bounds 1009–1042 × 1016–1042), centermap {1027,1030,7}, zona de
  spawn {1021,1028}→{1030,1034} 10×7 = 60 sqm conectados, respawn de
  **8 a 12 monstros por onda**.

### Monstros (fichas oficiais TibiaWiki/tibia.gg)

- **Creepy Crawler** — 27.000 hp / 22.380 exp, armor 100, mit 6.60,
  speed 260, raceId 2763, looktype 1890. Ability oficial **Fear (2s)**
  (mesmo modelo do Soul War: condição no cliente, fx no servidor).
- **Crypt Construct** — 25.000 hp / 19.730 exp, armor 100, mit 5.36,
  speed 240, raceId 2760, looktype 1887. **Area Healing oficial**
  10.000–13.250 (uncommon) como defSkill de cura.
- **Crypt Fiend** — 30.000 hp / 19.070 exp, armor 140, mit 4.39,
  speed 240, raceId 2758, looktype 1885, som oficial "Uhhh!".
- Todas: Skeletons/Undead **Challenging** (200/2.000/5.000 → 100
  charms), melee, paraimmune + veem invisível, sprites 9×4 reais
  (4 direções) renderizadas do DAT convertido.

### Itens novos (7, cids do update 15.20)

- amber 20.000 · necromantic-core 10.000 · giant-tusk 6.000 ·
  toe-nails 4.500 · crystallized-death 3.000 ·
  cluster-of-crystallized-death 9.000 (Yasir)
- **fetid-heart: sell 0** — item de quest (5 Ancestral Charges), sem
  comprador NPC oficial.

---

## 2026-11-20 — Prey Cards: seleção paga de criatura + 3º slot na Store

### Prey

- **SELECIONAR (qualquer criatura)** — novo botão em cada slot de prey
  (ativo ou inativo) abre o picker com todas as criaturas caçáveis,
  com busca: escolhe qualquer uma — mesmo fora da grade de 9 — por
  **1 Prey Card** (o `ListAll_Cards` oficial; `isPreyExclusive` só entra
  nesse pool). O bônus rola normalmente e o timer de 2h começa. Serve
  também para trocar a criatura de uma prey ativa.
- **3º slot de prey por conta** — compra permanente na **Store → Preys**
  por **50 Prey Cards** (`/api/store/prey-slot`, débito + grant em um
  único UPDATE atômico). Desbloqueia o slot 3 em todos os personagens
  da conta via `cosmetics.preySlot` (o unlock por 250k de gold por
  personagem segue valendo).

### Fix

- **Make Believe — Illuminated Warrior/Radiant Nimbus** — os claims
  persistiam só `missionsDone` no servidor enquanto o cosmético ficava
  no sessionStorage; `wardrobe.migrate()` agora deriva os cosméticos por
  conta dos claims (outfit com addons 1+2, montaria) em toda leitura do
  wardrobe — cura retroativa de quem já resgatou.
- `test_store.js` — `adminSummary` exige role admin real (TEST_SERVER
  não é bypass); assert desatualizado corrigido.

---

## 2026-11-19 (v2) — Savestate global sem desconexão + visual gótico do login

### Server save → savestate global

- **Fim da desconexão das 00h** — o server save não derruba mais o
  processo: às 00:00 (America/Sao_Paulo) o servidor executa um savestate
  global — libera a recompensa diária de exercise weapon, marca o cache
  quente de PvP como sujo (o próximo tick commita o blob inteiro da
  batalha no banco) e flusha o runtime do JsonStore. Jogadores seguem
  online, sem countdown de manutenção.
- `SERVER_SAVE_EXIT=1` restaura o restart legado supervisionado (uso
  exclusivo de ops/deploy). A topbar passa a exibir "DAILY RESET IN".

### Visual da entrada (login / seleção / loading)

- **Background Verão 2026** — novo wallpaper global
  (`backgroundverao2026.webp`), sem filtros escuros sobre a imagem
  (`#login-bg`/`#login-overlay` transparentes).
- **Login sem modal** — caixa transparente integrada ao ambiente;
  logo e botões LOGIN/CREATE ACCOUNT (arte) mantidos, sem moldura
  amarela atrás da arte.
- **Seleção de party gótica** — moldura dourada com ornamentos de canto
  em SVG, header "Selecione sua Party • Global Idle" + saldo de TC,
  cards com alça de arraste, badge 👑 LÍDER, level verde e botão ENTRAR
  outlined; rodapé com botões primário/secundário/danger.
- **Loading bestiário** — mesmo padrão gótico: pedestal iluminado com
  sprite flutuante, badge elemental colorido (HOLY/FIRE/ICE/DEATH/
  EARTH/ENERGY), pills HP/EXP/ARMOR e barra de progresso dourada com
  contador fixo `N/M` (tabular-nums).

### Outras correções acumuladas

- **Phosphorus** — mapa OTBM com bounds reais (crop correto), sem
  cooldown, mecânica Agony em área 3000–5000 (20% a cada 8s, true
  damage), missile físico corrigido (fim do 404 physical_w.png).
- **PvP multi-guerras** — cache de batalhas sem thrash (PVP_AUTH_CACHE_MAX),
  pool MySQL configurável (MYSQL_POOL_LIMIT=25) e lock de conta com 1 query
  (fim do N+1 de rosters).
- **Topbar** — botões padronizados (mesmo tamanho/espaçamento/ícones).
- **FOV +1 coluna** em todas as hunts — laterais do combate sem faixas
  pretas.
- Regressões de testes corrigidas (pillar-of-dark-energy restaurado no
  mobsheetdata, asserts de cache-bust/SHA atualizadas).

---

## 2026-11-19 — RMT: recompra oficial de Tibia Coins via PIX

### Novo módulo (economia)

- **Market → aba RMT** — o servidor passa a recomprar Tibia Coins dos
  jogadores com pagamento manual via PIX: dashboard (saldo, cotação,
  reservadas, últimas transações), formulário de venda com simulação e
  confirmação, cadastro de dados PIX do titular (CPF/CNPJ/e-mail/
  telefone/chave aleatória) e histórico de tickets com linha do tempo.
- **Reserva atômica de TC** — ao criar a solicitação as TC são debitadas
  na mesma transação de banco (FOR UPDATE + UPDATE condicional); TC
  reservadas não podem ser usadas em market, transferências ou outras
  solicitações. Devolução idempotente em cancelamento/reprovação.
- **Cotação fixa configurável** — padrão 1.000 TC = R$ 10,00; cada
  ticket grava snapshot imutável da cotação e dos dados de recebimento.
  Valores sempre em centavos inteiros (nunca ponto flutuante).
- **Máquina de estados** — pending → under_review → approved →
  payment_processing → paid, com rejected/cancelled; comprovante PIX
  (upload jpg/png/pdf com SHA-256) é obrigatório para concluir.
- **Painel admin → aba RMT** — tesouraria (TC compradas/reservadas,
  comprometido, caixa disponível), fila com filtros, tela do ticket com
  ações por permissão, configurações com histórico e auditoria.
- **Segurança** — permissões granulares RMT_* (nova coluna
  accounts.admin_perms; role=admin continua super), PIX/CPF cifrados
  AES-256-GCM (RMT_ENC_KEY) e exibidos mascarados, logs administrativos
  append-only em rmt_admin_logs, ledger reusa coin_ledger, rate limits,
  elegibilidade (idade da conta, bans, rejeições repetidas, fila aberta).
- **Backend**: server/rmt.js + tabelas rmt_requests, rmt_payment_profiles,
  rmt_settings(+history), rmt_admin_logs, rmt_receipts — MySQL only;
  em modo JSON o módulo responde indisponível.

---

## 2026-11-17 (v2) — Norcferatus Fortress, Vladrukh e Bloody Tusks Quest

### Novo conteúdo

- **Norcferatus Fortress (400+, hunt)** — a fortaleza dos vampiros do
  update 15.10: Dworc Shadowstalker, Gloom Maw, Norcferatu Heartless,
  Norcferatu Nightweaver e Orclops Bloodbreaker (pack 8–10, **respawn
  de 8 em 8 segundos**). Mecânica própria: a cada respawn há **3% de
  chance de nascer 1 Varg extra** além do pack. Loot completo com os
  creature products do update — Blood Amulet, Norcferatu Talisman,
  Chain Leash, Piece of Frozen Night, Heart Amphora, Pot of Orcish
  Warpaint, Spiked Gorget/Bracers, Blood Hood, Orcish Toothbrush,
  Bone Fibula, Bloodshot Giant Eye, Ritual Bone Knife, Bone Rattle e
  Greater Garlic Necklace (10k no Haroun).
- **Vladrukh (400+, boss)** — o lorde Norcferatu: 390.000 HP, sala
  própria na câmara sul da fortaleza, cooldown de 20h. Loot com
  **Blood Sceptre** (178k no Yasir), Greater Proficiency Catalyst,
  Blood Preservation, catalisadores de proficiência e poções supreme/
  ultimate em quantidade.
- **Bloody Tusks Quest (400+)** — Missão 1: derrotar **5 Vargs** na
  Norcferatus Fortress libera o acesso ao Vladrukh; Missão 2:
  derrotá-lo concede a **montaria Gloom Maw** (resgate único por
  conta).

### Ajustes

- **Urmahlullu the Weakened** — HP reduzido de 500k para **150k**.
- **Mimar Haffar** — movido para a seção **BOSSES 800+** (o requisito
  oficial já era nível 800 + Doctor Marrow + Make Believe M1).

---

## 2026-11-17 — Book World, Sir Leonard, Make Believe Quest e 8 novas hunts/bosses

### Novo conteúdo

- **Book World (150+, hunt)** — a biblioteca viva do update 15.10:
  Bluebeak, Bramble Wyrmling, Crusader, Hawk Hopper, Headwalker e
  Lion Hydra (respawn 6–8), todos Inkborn com loot oficial — incluindo
  Paper Boat, Star Ink, Book with a Dragon/Hourglass, Sealing Wax e o
  novo Cookbook (produto de criatura, vende no Yasir).
- **Sir Leonard (150+, boss)** — o centauro-menestrel guardião da Book
  World: sala própria, melee + UE de terra + Death Strike + Bomba
  Musical, invoca até 5 Crusader Guardians, cooldown 2h. Loot com os
  raros **Ink Blade/Quill/Claw/Vine/Brush**, Axe e Helmet of Sir
  Leonard, Gearwheel Chain e Proficiency Catalyst.
- **Book World Quest (150+)** — Missão 1: derrotar 1.000 monstros em
  Book World libera o acesso ao Sir Leonard; Missão 2: derrotá-lo
  concede a **outfit Illuminator com addons 1 e 2** (resgate único por
  conta).
- **Urmahlullu the Weakened (150+, boss)** — estágio único de 500k HP
  com a sala própria e loot completo.
- **Bashmuul - Issavi (250+)** e **True Asuras - Thalassara (400+)** —
  novas hunts OTBM com sprites e loot oficiais.
- **Moonstone Castle (400+, hunt)** — os cavaleiros de pedra-lua da
  Make Believe, porta de entrada da quest 800+.
- **Make Believe Quest (800+)** — quest em 4 missões encadeadas:
  2.500 kills em Moonstone Castle liberam os bosses **Mimar Haffar** e
  **Maior Domus**; matá-los libera a hunt **Radiant Skyhold (800+)**;
  5.000 kills lá liberam o World Boss **Phosphorus** (lobby até 5,
  level 800+). Recompensas finais por conta: outfit **Illuminated
  Warrior** com addons, montaria **Radiant Nimbus** e sorteio com
  animação de roleta de **1 arma + 1 equipamento Moonsilver**.
- **4 hunts OTBM anteriores** também entram neste deploy: **Buster
  Spectre - Darashia (150+)** e **Putrefactory, Darklight Core e Gloom
  Pillars (BLOOD ROTTEN 600+)** — a ala da Blood Rotten Quest com
  Wandering Pillar, Darklight Matter e Basalt.
- **HP oficial dos World Bosses** — Deathstrike 200k, Gnomevil 250k,
  Abyssador 340k, Baron/Count/Duke 350k, World Devourer 25k, Pale Worm
  420k, Goshnar's Megalomania 620k (valores de teste removidos).
- **Urmahlullu entrou no sorteio de boss do dia** (daily boost).

### Melhorias e correções

- **Cadeado nas hunts com requisito** — o modal de hunts mostra 🔒 com
  o motivo (nível, boss ou missão pendente) e o jogo bloqueia o início
  até cumprir.
- **Contador de kills de missão no servidor** — hunts online agora
  progridem as missões `kills` no engine autoritativo, em paridade com
  o contador do cliente.
- **Gate de Phosphorus por missão** — o join valida a Missão 3 da Make
  Believe (5.000 kills em Radiant Skyhold) além dos kills de Maior
  Domus e Mimar Haffar.
- **Outfit Illuminator masculina corrigida** — a variante estava com a
  sprite feminina duplicada; agora usa o looktype 1860 correto.
- **Brain Grounds - Venore** movida para a seção HUNTS 400+.
- **Cobra Bastion**: ajuste de células bloqueadas no mapa.
- **Preview de outfit nas quests** respeita o nº de colunas da sheet
  (corrige frames cortados nas outfits novas).
- Preços NPC oficiais de **40+ itens novos** (loot de todas as hunts e
  bosses acima) com paridade cliente/servidor.

---

## 2026-11-06 — Prey por conta, proteção no templo/treiners e PvP fluido

### Mudanças

- **Prey agora é DA CONTA** — slots, criaturas selecionadas, bônus
  (exp/dano/defesa/loot) e wildcards passam a ser compartilhados entre
  **todos os personagens da conta**, como stamina e inventário. O estado
  mora em `accounts.shared_inventory.prey`; qualquer personagem que
  hidratar recebe o mesmo objeto (`applySharedToPlayer`), e rerolls,
  seleções e uso de wildcards feitos em um char valem para os demais
  (`extractSharedFromPlayer`/`mergeSharedFromPlayer` persistem de volta).
  Migração automática: o primeiro personagem com prey já preenchida
  semeia o estado compartilhado da conta.
- **Templo e treiners protegem cargas e timers** — enquanto o personagem
  está na cidade (templo) ou nos treiners/dummies, **itens não perdem
  cargas** (soft boots, time rings etc.), **imbuements não perdem tempo**
  (eles já só decaem por tempo de combate) e **o relógio de 2h da prey
  congela** — a expiração desliza junto, então a prey só gasta tempo
  caçando de verdade.
- **PvP: opção 3v3** no modal de criação de batalha (3 contas por time,
  ~12–15 personagens) além de 5/10/15/20/50/100; **zoom da arena maior**
  (FOV 15×11, estilo Tibia clássico).
- **PvP: início rápido de teste em 3s** (somente TEST_SERVER).

### Correções de performance/estabilidade (PvP)

- **Servidor destravado**: o tick autoritativo segurava `FOR UPDATE` na
  mesma linha por ~35 req/s e afogava o pool do MySQL (menus travavam em
  "Carregando"). Agora o avanço é serializado por mutex em processo com
  persistência por compare-and-swap de `version` — menus voltam a
  responder em ms.
- **Chars remotos não "teleportam" mais**: merges descartados por
  `version` (só bumpava a cada ~4s com o hot-persistence) congelavam os
  personagens simulados; em batalha PvP o dedupe é dispensado (requests já
  são ordenadas na fila da conta), respostas duplicadas mantêm a
  interpolação e deslocamentos de até 4 SQMs deslizam em vez de saltar.
- **Render mais leve**: cache de sprites de texto (nomes/floaters/falas),
  janela de células visíveis no tilemap (FOV+margem em vez do mapa inteiro),
  cache de `maxStats` e da ocupação do grid.
- **Modal "ASSUMIR O CONTROLE"**: logar numa conta já em batalha PvP não
  trava mais numa tela escura — aparece aviso e botão para tomar o lease.
- **Regressão de mapa preto corrigida** (cache offscreen do chão
  removido; o culling por janela visível permanece).

---

## 2026-11-05 — Buraco nas paredes corrigido, telas com cara da cidade

### Correções

- **Espaço vazio nas paredes da Lion Sanctum (e de ~25 mapas)** — grounds
  como `16866` (swamp clay mountain) têm grupo 2×2 no .dat, mas só 1 dos 4
  sprites tem pixels (quadrante superior-esquerdo). Ancorados no canto
  inferior-direito, a textura caía um SQM para cima/esquerda e as células
  da borda ficavam vazias (buraco preto / parede "comendo" a sprite).
  Os **11 ids** afetados (`1128, 4415, 4416, 9246, 16866, 26995, 32570,
  32638, 36565, 36566, 36571`) foram recortados para o 1×1 real e o
  `import_otbm_sprites.py` agora detecta esses "grupos fake multi-SQM"
  automaticamente em imports futuros.
- **Bordas de ground border** (brainstealer, grimvale etc.) passam a
  renderizar exatamente na célula onde foram pintadas no RME.
- **Annihilator: grupo teleportado para a entrada** — o servidor teleporta
  ao disparar a alavanca, mas o merge de checkpoint preservava a posição
  local e o teleporte era descartado (o grupo ficava travado nos SQMs de
  preparo). O evento `annihilator-lever` agora também posiciona os
  personagens na entrada, na mesma ordem esq→dir do servidor.
- **Annihilator: líder caminha ao SQM de preparo** — o `walkGoal`
  scriptado (botão "Posicionar") era ignorado para `c.player`; se o líder
  não estava num SQM de preparo, a alavanca nunca disparava.

### Interface

- **Login, patch notes e tela de loading** agora usam a estética da
  cidade — paleta escura quente (`#1c1a16`/`#4b493e`/`#d8d0bc`) com
  acentos dourados (`#ffe680`/`#8a7a40`/`#d4af37`), no padrão
  `.ranking-table`/`.market-tabs`.
- **Seleção de personagens e modais pré-jogo** (login, patch notes,
  social, ui-mode) na mesma estética da cidade: botões `.primary` dourados,
  secundários escuros, cartões com bevel `#4b493e`/`#17150f`.

### Bosses

- **4 novos Archfoe na seção BOSSES 1–250** (últimos da lista): **Katex
  Blood Tongue** (6.300 HP / 5.000 exp), **Srezz Yellow Eyes** (6.200 /
  4.800), **Utua Stone Sting** (6.400 / 5.100) e **Yirkas Blue Scales**
  (6.300 / 4.900) — stats e loot oficiais do Canary/TibiaWiki.
- Sala dos 4: `lion_sanctum.otbm` (a própria sala do Sanctum) — spawn do
  jogador `{1024,1031,7}`, boss `{1023,1024,7}`, com `walkFloors` de
  areia/trilha igual à hunt.
- **20 itens novos** no catálogo (creature products + Spellweaver's Robe,
  Warrior's Axe, Ring of Green Plasma) com sprites extraídos do DAT e
  preços oficiais de NPC onde existem; itens sem comprador oficial ficam
  com valor 0.
- **14 itens sem preço ganham venda a NPC** (valores oficiais Rashid):
  Skull Helmet 40k, Mercenary Sword 43k, Demonrage Sword 36k, Jade
  Hammer 25k, Assassin Dagger 20k, Ornate Crossbow 12k, Spellweaver's
  Robe 12k, Alloy/Magma/Lightning Legs e Glacier Kilt/Robe 11k, Noble
  Axe 10k, Chaos Mace e Guardian Axe 9k.

---

## 2026-11-04 (b) — Annihilator jogável, abas no personagem, bosses em breve

### Quests

- **Annihilator vira Party Quest** — sem lobby: INICIAR entra direto com os
  4 personagens elegíveis da conta (sem seletor, sem countdown).
- **Modal de explicação** ao entrar na quest com os 5 passos
  (preparo → alavanca → 6 Demons → saída → recompensa).
- Correções: `kind:'quest'` aceito no schema de instâncias (bug que fazia a
  quest falhar instantaneamente), spawnCells com fallback, lobbys órfãs
  removidas ao criar nova.
- **Sprites do mapa**: 25 tiles faltantes extraídos (pisos de fogo, paredes)
  — os SQMs "quebrados" agora renderizam.

### Personagem (UI)

- **LOYALTY, CHARMS, PROFICIÊNCIA e WHEEL** saíram da topbar e viraram
  **abas** do modal do personagem (junto de Proficiência, Roda do Destino).
- Botão **Personagem** ampliado na topbar.
- **Wheel**: botões **OK** (salva pontos) e **RESET** (zera a roda).
- Helper → Ataque → Echo Raid: ícone agora usa a **sprite oficial** do
  portal (Exploraid_Trigger.gif).

### Bosses

- Nova seção **EM BREVE** no modal: The Primal Menace, Magma Bubble,
  Court Warlock, Maior Domus, Phosphorus, Mitmah Vanguard, Bakragore e
  Vladrukh (preview, entrada bloqueada).
- **GRIMVALE 100+** é a segunda seção do modal de bosses.
- Bosses da Grimvale exigem nível 100 + as 2 missões da hunt — o botão
  fica travado sem os requisitos (sem cooldown indevido).

### Correções

- **Bossbar não fica mais sob o corpse** — corpos de jogadores mortos
  passam a desenhar antes da barra do boss.
- **Templo/treino curam** — ao entrar na cidade ou área de treino, o
  personagem recupera HP e mana completos.

---

## 2026-11-04 — Echo Raid, Oberon sem falas, Annihilator no modal

### Novidades

- **Sistema de Echo Raid** (novo). Ao matar monstros comuns/incomuns
  (bestiário 1–2★, sem boss/summon/forge stack), 0,05% de chance de nascer
  um **portal** no SQM do cadáver 30s após a morte, disponível por 2min.
  Pisar no portal arma a raid: **60s de espera** e nascem o **Echo Warden**
  (mesmo monstro, 4x HP) + **7–12 minions** (1,5x HP). Abater o warden
  concede **charm points** por estrelas do bestiário (1x por espécie por
  personagem): 1★→10, 2★→15, 3★→20, 4★→25, 5★→30.
  - **Helper → Ataque → Echo Raid**: checkbox ativa/desativa e modos
    **AUTO** (corre para pisar assim que aparece) e **SAFE** (só pisa sem
    monstros vivos). Funciona offline e online (servidor autoritativo).
  - Arquivos: `game/js/echo-raid.js` (novo), `combat.js`, `gridai.js`,
    `render.js`, `game.js`, `ui.js`, `helper-presets.js`, `index.html`,
    `server/authoritative_engine.js`.

### Mudanças

- **Grand Master Oberon — mecânica de debate removida.** As falas/modal de
  réplicas foram retirados. A luta agora é direta: Oberon precisa ser
  **morto 4 vezes** e **cada morte invoca 4 falcons** (2 Falcon Knights +
  2 Falcon Paladins — ou 10% de chance de 1 mini boss do Falcon Bastion).
  A quarta morte é a morte real. Sem invulnerabilidade/debate.
  - `spawnMobAt` implementado no cliente (helpers agora nascem de verdade
    também no modo offline).
- **Annihilator Quest jogável no modal QUESTS** (nível 100, até 4
  jogadores, rewards: demon armor / magic sword / stonecutter axe /
  demonbone). Mecânica dedicada implementada no servidor: os personagens
  nascem nos **4 SQMs de preparo** — quando todos ficam parados neles por
  3s a **alavanca dispara**: o grupo é teleportado para a entrada e
  **6 Demons** nascem em posições fixas. Mortos todos, fase de **saída**:
  os sobreviventes caminham para os SQMs ao norte e a quest termina
  (`quest-completed` → escolha de recompensa por personagem). O mapa
  `annihilator.otbm` foi copiado para `game/maps/`.

---