# Status — Visual da Wheel of Destiny (Roda do Destino)

## Resumo

Reconstrui a Wheel of Destiny e implementei o **visual fiel ao cliente oficial
do Tibia**, usando os assets e o layout extraídos do **otclient do OpenTibiaBR**
(`modules/game_wheel/`) e a lógica de bônus do **Canary**
(`io_wheel.cpp` / `player_wheel.cpp`).

> Nota: a implementação anterior (mensagem interrompida) tinha a lógica e o
> botão, mas o **layout visual era genérico** (nós em círculo simples). Esta
> versão substitui pelo layout **exato** do cliente.

## Layout visual (do cliente oficial)

- **Fundo por vocação**: `assets/wheel/vocations/backdrop_skillwheel_<voc>.png`
  (522×522) — a arte oficial de cada vocação (Knight/Paladin/Sorcerer/Druid/
  Monk), como no planner oficial do Tibia. O fundo troca conforme a vocação do
  personagem (mapeamento do otclient `wheelclass.lua`:
  knight/paladin/sorcerer/druid/monk).
- **Posições dos 36 nós**: calculadas com a **mesma fórmula do otclient**
  (`buttons.lua` + `geometry.lua`):
  ```
  ang = (slice + 0.5) * 360 / totalSlice
  x = 261 + radius * cos(ang)   |   y = 261 + radius * sin(ang)
  ```
  com raios `261 / 215 / 160 / 106 / 53` (200/150/100/75/50) e centro `261,261`.
  → `WHEEL_POS` em `wheeldata.js`.
- **Conexões entre nós**: linhas SVG desenhadas a partir das adjacências reais
  do cliente (`wheelnode.lua` `connecteds`).
- **Cores por quadrante**: verde (superior-esq), vermelho (superior-dir),
  azul (inferior-esq), roxo (inferior-dir). Nós acendem na cor ao serem
  preenchidos e ficam brancos brilhantes quando no máximo.

## Regra de desbloqueio (do cliente)

Um nó só pode receber pontos se existir um **caminho dele até uma raiz** (nó
`_50`) passando por nós totalmente maximizados — portado da função
`canReachRootNodeFromNode` do otclient (`wheelReachesRoot` no `wheel.js`).
Raízes (`GREEN_50`, `RED_50`, `BLUE_50`, `PURPLE_50`) são sempre selecionáveis
a partir do nível 50.

## Correção do bonus de Life/Mana Leech

**Bug:** o display mostrava `Math.round(0.75 * 100)` = **75%** de life leech,
mas o valor realmente aplicado no combate é `raw * 0.75 / 100` = **0.75%**.

**Correção (`wheel-ui.js`):** o display agora mostra o valor de leech **como a
porcentagem real** (0.75% life, 0.25% mana), via helper `wheelPct()`. Aplicado
no rótulo de cada nó (`wheelSlotLabel`) e no resumo de bônus (`wheelSummaryHtml`).
A lógica de combate não mudou — o leech aplicado sempre foi 0.75%/0.25%.

## Lógica (do Canary, mantida)

- Pontos: `(nível − 50) × 1` + promotion scrolls (compra com ouro).
- Bônus por nó/vocação (HP/Mana/Cap, mitigação, leech, skill, magias,
  instants, estágios/Revelation, avatares, Gift of Life).
- Upgrade de 5 magias da wheel por vocação.

## Arquivos alterados / criados

| Arquivo | Mudança |
| --- | --- |
| `assets/wheel/backdrop_skillwheel.png` | **novo** — fundo oficial da roda (fallback) |
| `assets/wheel/vocations/backdrop_skillwheel_{knight,paladin,sorcerer,druid,monk}.png` | **novos** — fundos oficiais por vocação |
| `assets/wheel/border/<quad>/{1..9}.png` | **novo** — 36 imagens de borda/conexão do cliente |
| `js/wheeldata.js` | **novo** — 36 nós com posição exata (`WHEEL_POS`), conexões (`WHEEL_CONNECTED`), bônus |
| `js/wheel.js` | **novo** — lógica + regra de desbloqueio por caminho até a raiz |
| `js/wheel-ui.js` | **novo** — modal visual (fundo + SVG + nós interativos) |
| `js/player.js` | integração HP/MP/Cap + skills + magic level |
| `js/combat.js` | integração mitiga/leech/dano%/cura%/magias/Gift of Life |
| `js/game.js` | botão WHEEL no `bindControls` |
| `index.html` | botão `#btn-wheel` + `<script>` dos `wheel*.js` |
| `css/style.css` | CSS do modal e da roda |

## Validação (navegador real, headless Chromium) — 16/16

1. 36 nós renderizados + fundo + SVG de conexões ✓
2. Bloqueado abaixo do nível 50 ✓
3. Nível 300 → 250 pontos ✓
4. `GREEN_50` (raiz) alocável; `GREEN_TOP_75` bloqueado sem caminho; liberado
   após `GREEN_50` no máximo ✓
5. `GREEN_BOTTOM_75` no máximo → +1 melee e `effSkill` reflete ✓
6. `maxStats` inclui o Cap da wheel (+250 no knight) ✓
7. Estágio verde: 125 pts → 0; 1000 pts → estágio 3 (+20% dano/cura) ✓
8. `GREEN_50` renderiza exatamente em (223.5, 223.5), como no cliente oficial ✓
9. Hunt real roda com a wheel ativa, sem erros de página ✓
