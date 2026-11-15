# Patch Notes

Histórico de alterações do jogo, mais recentes primeiro.

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
