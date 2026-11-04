# Patch Notes

Histórico de alterações do jogo, mais recentes primeiro.

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
