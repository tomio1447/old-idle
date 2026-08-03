# Status — Wheel of Destiny (Roda do Destino)

## O que foi implementado

Sistema completo da **Wheel of Destiny** (Roda do Destino), portado do servidor
Canary (`src/creatures/players/components/wheel/` + `src/io/io_wheel.cpp` +
`data/scripts/actions/items/wheel_scrolls.lua`).

### Botão
- Novo botão **☸ WHEEL** ao lado do **⚒ FORGE** na topbar (`index.html`),
  ligado no `game.js` (bindControls).

### 36 nós em 4 cores
Cada cor (verde / vermelho / azul / roxo) tem 9 nós formando a roda:

| Custo máx | Nós por cor | Descrição |
| --- | --- | --- |
| 50 | 1 (entrada) | sempre liberado a partir do nível 50 |
| 75 | 2 | bonus de stat + skill/leech |
| 100 | 3 | stat + spell/leech/skill |
| 150 | 2 | stat + mitiga/leech |
| 200 | 1 (externo) | spell/instant + stats |

Dados completos em `wheeldata.js` (`WHEEL_SLOTS`), fiéis ao `io_wheel.cpp`
(stats de HP/Mana/Capacidade por vocação, mitigation, leech, skill, spells e
instants por nó, por vocação).

### Pontos
- `(nível − 50) × 1` ponto por nível (config `pointsPerLevel = 1`).
- **Promotion Scrolls** (Abridged +3, Basic +5, Revised +9, Extended +13,
  Advanced +20) compráveis por ouro no modal (espelham o `wheel_scrolls.lua`).

### Regras de alocação (espelham o `canSelectSlot` do Canary)
- Pré-requisito: para gastar num nó, precisa de **pelo menos um vizinho no
  máximo** (grafo de adjacência em `wheel.js`).
- Limite de pontos **totais** por faixa (50→50, 75→50, 100→125, 150→225,
  200→375) como o `getWheelPoints()` do servidor.
- Clique = gasta 1 ponto; clique direito = remove 1 ponto.

### Estágios / Revelation
Cada cor soma os pontos dos seus 9 nós; nos limiares **250/500/1000** concede
o estágio 1/2/3, dando **+dano% e +cura%** de `{4,4}/{9,9}/{20,20}` (somados
entre as cores) e a habilidade de estágio da vocação (Gift of Life, avatares,
etc. — `WHEEL_STAGE_ABILITY`).

### Upgrade de magias da wheel
Cada vocação tem 5 magias "da wheel" com 2 grades de upgrade (portado do
`io_wheel.cpp`): dano, cura, cooldown, custo de mana, leech, crítico, área e
alvos extras (`WHEEL_SPELL_UPGRADES`).

## Integração com os sistemas do jogo

| Sistema | Onde | Efeito |
| --- | --- | --- |
| HP / Mana / Cap | `maxStats` (player.js) | soma os bonus da wheel |
| Skills (melee/dist/magic/fist) | `effSkill` / `effMagic` (player.js) | soma o bonus de skill da wheel |
| Mitigação | `playerMitigationPct` (combat.js) | +0,03% por ponto nos nós de mitiga |
| Life/Mana leech | `playerAttack` (combat.js) | leech dos nós de leech |
| Dano % (Revelation) | `playerAttack` + magias + runas (combat.js) | multiplica o dano |
| Cura % (Revelation) | `tryHeal` (combat.js) | multiplica a cura |
| Upgrade de magias | `castSpellById`/`tryHeal` (combat.js) | dano/cura/cooldown/mana/leech/crítico da magia |
| Gift of Life (estágio verde) | `playerDeath` (combat.js) | revive automático 1×/2h sem perda |
| Avatares (estágio roxo) | UI | mostra o nível de avatar da vocação |

## Arquivos alterados / criados

| Arquivo | Mudança |
| --- | --- |
| `tibia-idle/game/js/wheeldata.js` | **novo** — 36 nós, pontos, scrolls, magias e estágios |
| `tibia-idle/game/js/wheel.js` | **novo** — pontos, alocação, pré-requisitos, `wheelTotals` e hooks |
| `tibia-idle/game/js/wheel-ui.js` | **novo** — modal da roda (CSS wheel), resumo de bonus, scrolls |
| `tibia-idle/game/js/player.js` | `maxStats` (HP/MP/Cap), `effSkill`/`effMagic` (skills) |
| `tibia-idle/game/js/combat.js` | mitiga, leech, dano%/cura%, upgrade de magias, Gift of Life |
| `tibia-idle/game/js/game.js` | botão WHEEL ligado no `bindControls` |
| `tibia-idle/game/index.html` | botão `#btn-wheel` ao lado da FORGE + `<script>` dos novos JS |
| `tibia-idle/game/css/style.css` | CSS do modal da roda |

## Validação (navegador real, headless Chromium)

1. Botão WHEEL ao lado da FORGE ✓ (geometria não sobrepõe)
2. Modal abre com os **36 nós** nas 4 cores ✓
3. Nível < 50 → wheel bloqueada (0 pontos) ✓
4. Nível 300 → 250 pontos ✓
5. Alocar GREEN_50 ✓; GREEN_TOP_75 bloqueado até GREEN_50 no máx ✓; depois liberado ✓
6. GREEN_BOTTOM_75 no máx → +1 skill melee (knight) e `effSkill` reflete ✓
7. `maxStats` inclui o Cap da wheel (GREEN_50 cheio = +250 cap no knight) ✓
8. Estágio verde: 125 pts → 0; 1000 pts → estágio 3 (+20% dano / +20% cura) ✓
9. Magias da wheel desbloqueadas e upgrade (Groundshaker G1 +13% dano) ✓
10. Hunt real roda com a wheel ativa, sem erros de console ✓

Obs.: os únicos erros de console são 404 **pré-existentes** de
`assets/mob/*.png` (carregamento normal do jogo), nenhum relacionado à wheel.
