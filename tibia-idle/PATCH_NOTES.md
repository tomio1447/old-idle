# Patch Notes

Histórico de alterações do jogo, mais recentes primeiro.

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
