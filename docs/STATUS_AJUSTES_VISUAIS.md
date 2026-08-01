# Status — Ajustes visuais e de movimento (fiendish, velocidade, floaters, crítico)

## Ajustes aplicados

### 1. Marca de Fiendish/Influenced na lateral direita da sprite
- **Antes:** o ícone + número/tag ficavam sobre a barra de HP e o nome do
  monstro (área central, sobreposta).
- **Depois:** a marca (ícone oficial + número de poeiras/stacks) fica na
  **lateral direita da sprite** (`mx + w/2 + 4`, altura do meio do corpo),
  como no client — sem encobrir o HP nem o nome.
- Fiendish: ícone `fiendish-creature` + número (stacks); Influenced: ícone
  `influenced-creature` + stacks. Removida a tag "FIENDISH" do centro.

### 2. Velocidade do personagem FIXA em 200
- **Antes:** `110 + (nível - 1)` — escalava com o nível.
- **Depois:** base **fixa em 200** (todas as vocações), melhorada apenas
  pelos modificadores de movimento (equipamento, montaria e magias de haste).
- `hasteDelta` agora usa base fixa (200−40=160) → o ganho da haste também é
  fixo (não escala com nível).
- `playerSpeedBreakdown`: `nivel: 0`.

### 3. Números de dano sobem em LINHA RETA
- **Antes:** `vx` aleatório (deriva lateral) e `vy` sorteado — os números
  "voavam" pela tela.
- **Depois:** `vx = 0` e `vy = -0.007` constante — sobem exatamente em cima
  do monstro, como no client (Canary).

### 4. Personagem sem flutuação e sem animação de ataque
- Removido o **bob senoidal** (flutuação) do personagem na caçada (`render.js`)
  e na cidade (`city-render.js`).
- Removida a **animação de ataque** (deslocamento lateral `atkPush`) do
  personagem na caçada. (Os monstros mantêm a animação de ataque deles.)

### 5. Crítico: azul só na cura, vermelho só no dano
- **Cura crítica:** SOMENTE a animação **azul** (`critical-heal-effect`) em
  cima do personagem que casta; removido o floater vermelho "CRITICAL HEAL!".
- **Dano crítico em monstros:** SOMENTE as animações **vermelhas**
  (`crit-text` + `critical-hit-effect`); nenhum efeito azul é disparado.

## Arquivos alterados

| Arquivo | Mudança |
| --- | --- |
| `js/render.js` | marca fiendish/influenced à direita; floaters retos (vx 0, vy fixo); bob=0 e atkPush=0 no player |
| `js/city-render.js` | bob=0 no jogador (cidade) |
| `js/speed.js` | base fixa 200 (sem nível); breakdown `nivel: 0` |
| `js/game.js` | cura crítica sem floater vermelho (só efeito azul) |

## Validação (navegador real, headless Chromium)

1. `playerBaseSpeed` = 200 no nível 1 e no 500; com haste = 248 ✓
2. Floater: `vx = 0`, `vy = -0.007` ✓
3. `render.js`: `bob = 0`, `atkPush = 0` ✓
4. Cura crítica: só `fx:critical-heal-effect` (+ "+79") — sem "CRITICAL HEAL!" ✓
5. Dano crítico: `fx:crit-text` + `fx:critical-hit-effect` — sem azul ✓
6. Marca: `markX = mx + w/2 + 4` ✓
7. Combate real 9s: 4 kills, zero erros ✓
