# Patch Notes

Histórico de alterações do jogo, mais recentes primeiro.

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
