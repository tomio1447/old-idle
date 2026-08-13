# Auditoria — HP Bars, Nome e Damage Logs vs Canary Base (OTClient)

## 1. Onde está a implementação no Canary base

Mesmo sem o repo Canary completo no projeto, a referência oficial é o **OTClient** (usado pelo Canary):

- `otclient/src/client/creature.cpp` → `Creature::drawInformation()`
- `otclient/src/client/animatedtext.cpp` → `AnimatedText::drawText()` e `AnimatedText::merge()`

Ambos foram localizados via `fetch` direto do GitHub `mehah/otclient` (branch master, commit atual 2026).  
Trechos relevantes copiados para esta auditoria.

### Canary/OTClient — cálculo da posição da criatura na tela

```cpp
// creature.cpp:drawInformation
const auto displacementX = g_game.getFeature(Otc::GameNegativeOffset) ? 0 : getDisplacementX();
const auto displacementY = g_game.getFeature(Otc::GameNegativeOffset) ? 0 : getDisplacementY();

const auto& creatureOffset = Point(16 - displacementX, -displacementY - 2) + getDrawOffset();

Point p = dest - mapRect.drawOffset;
p += (creatureOffset - Point(round(m_jumpOffset.x), round(m_jumpOffset.y))) * mapRect.scaleFactor;
p.x *= mapRect.horizontalStretchFactor;
p.y *= mapRect.verticalStretchFactor;
p += parentRect.topLeft();
```

- `dest` = posição do tile na tela + `m_walkOffset * scale`
- `getDrawOffset()` = offset do outfit (para sprites > 32px, ex: 2x2)
- `getDisplacementX/Y` = deslocamento do outfit (anchor da sprite)
- `m_jumpOffset` = pulo / bounce
- `16` = metade do tile padrão (32/2) – centraliza horizontalmente
- `-2` = pequeno ajuste vertical base

Result: `p` é o ponto de referência da **informação**, não o pé da criatura, mas o centro lógico da área de informação, já com walk e jump.

### Canary — HP bar / nome

```cpp
const auto& nameSize = m_name.getTextSize();
int cropSizeText = isAdjustCropSize ? getExactSize() : 12;
int cropSizeBackGround = isAdjustCropSize ? cropSizeText - nameSize.height() : 0;

auto backgroundRect = Rect(p.x - 15.5, p.y - cropSizeBackGround, 31, 4);
auto textRect = Rect(p.x - nameSize.width/2.0, p.y - cropSizeText, nameSize);

constexpr int minNameBarSpacing = 2;
if (backgroundRect.top() - textRect.bottom() < min) backgroundRect.moveTop(textRect.bottom()+2);

// clamp para não sair da tela
offset = 12 * scale; if(localPlayer) offset*=2;
if(textRect.top()==parent.top) backgroundRect.moveTop(textRect.top()+offset);
if(backgroundRect.bottom()==parent.bottom) textRect.moveTop(backgroundRect.top()-offset);

Rect healthRect = backgroundRect.expanded(-1);
healthRect.setWidth((healthPercent/100.0)*29);
```

- Barra: **31x4** background preto, **29** interno colorido (1px borda)
- Nome centralizado em `p.x`, acima da barra, com gap mínimo 2px
- `cropSizeText = getExactSize()` faz o offset vertical depender do tamanho real da sprite (criaturas grandes têm barra mais alta)
- Mana bar: `barsRect = backgroundRect; barsRect.moveTop(bottom)` → empilha imediatamente abaixo da HP, sem gap
- Ordem: `DrawPoolType::CREATURE_INFORMATION`, `DrawOrder::SECOND`, depois nome, depois ícones (skull, shield, etc)

### Canary — Damage / Floating Text

`animatedtext.cpp`:

```cpp
Point p = dest; // dest = posição da criatura na tela
p.x += (24/scale - textWidth/2);
if (diagonalFeature) p.x -= (4*scale*t/tf) + (8*scale*t*t/tftf);
p.y += (8/scale + (-48*scale*t)/tf);
p += m_offset;
...
Color color = m_color;
if (t > tf/1.2) alpha = 1 - (t-t0)/(tf-t0);
```

- Posição inicial: `x = creatureX + 24 - width/2`, `y = creatureY + 8`
- Movimento: sobe **48px** ao longo de `tf` (animatedTextDuration, config, padrão 1000ms)
- Diagonal opcional: deriva -4px linear -8px quadrático
- Fade: opaco até 83% da duração (tf/1.2), depois alpha linear até 0
- Merge: `merge()` → se mesma cor, mesma fonte, e `t < tf/2.5` (~40%), soma números: `"-20" + "-30" => "-50"` em vez de sobrepor

---

## 2. Comparação com nossa implementação atual

### Cliente analisado: `tibia-idle/game/js/render.js` (Global-Idle)

**Posição da sprite:**
```js
function creatureTileOrigin(centerX, centerY, width, height, tile, anchor, scale) {
  if (anchor) return { x: centerX + tile/2 - anchor.sw*scale + anchor.ox*scale,
                       y: centerY + tile/2 - anchor.sh*scale + anchor.oy*scale }
  return { x: centerX - width/2, y: centerY + tile/2 - height }
}
```
- Similar ao Canary: usa anchor e centraliza, mais `tile/2` para pé. 
- Diferença: Canary usa `16 - displacement + drawOffset`, nós usamos `anchor.sw/sh/ox/oy`. Conceito equivalente, mas `informationOffset` não é separado – misturamos tudo no origin.

**HP bar:**
```js
const TIBIA_BAR_W = 27, H = 4; // Canary = 31x4, inner 29
function drawNameBars(ctx, x, yTop, ...) {
  const hpY = y + 2; // y = top -15
  drawNameText(ctx, x, y-3, name, hpColor);
  drawTibiaBar(ctx, x, hpY, hpPct, hpColor);
}
```
- Barra 27 vs 31 → 4px mais estreita, não idêntica
- Offset fixo `-15` + `+2` / `-3` vs Canary `cropSizeText = getExactSize()` variável → para sprites grandes (2x2) nosso offset fica 4-8px mais baixo
- Não há `minNameBarSpacing=2` enforcement, nem clamp contra borda da tela
- Mana bar no nosso cliente só para local player, mas empilhamento similar: `nextY = hpY + H +2` → correto, mas 2px gap vs Canary 0px (colado)
- Nome e barra não são recalculados com `getExactSize()`, então criaturas grandes (ex: Goshnar, bosses) ficam com barra invadindo sprite
- Ordem: desenhamos entidades (sprite), depois objetos do mapa por cima, depois **segunda passagem** para labels → similar ao Canary `CREATURE_INFORMATION` separado, mas nosso `occupiedLabels` empilha verticalmente com `Math.abs(prev.x - cx)<42 && Math.abs(prev.y - y)<20` → evita sobreposição entre criaturas próximas, **Canary não faz isso** – deixa sobrepor, só ajusta se encosta na borda

**Damage logs / Floaters:**
```js
vy: -0.007, vx: 0, life: damage?1300:1500
x = (f.x + vx * p *60)*W, y = (f.y + vy * p *22)*H
alpha = (1-p)^1.35
```
- Movimento só vertical, sem deriva diagonal, sem `24 - width/2` de centralização inicial (nosso `x` já é centro, mas não subtrai `width/2`)
- Sem merge de danos mesma cor dentro de 40% tempo → múltiplos `-20` e `-30` ocupam mesmo pixel, parecendo lag
- Sem `m_offset` configurável por criatura
- Fade desde início (`pow 1.35`) vs Canary opaco até 83% depois fade linear → nosso fade começa cedo, parece desaparecer mais rápido
- Posição inicial `y` é `ent.y` (pé) – 0.06 etc, enquanto Canary é `p.y + 8` (um pouco acima do pé, mas abaixo da barra). Nosso `y -0.06` está próximo, mas com `W/H` scaling pode descolar durante walking porque `ent.x/y` são interpolados mas floater `x/y` são fixos no spawn e não seguem walk (Canary `dest` é atualizado a cada frame com walkOffset)

---

## 3. Diferenças estruturais críticas

| Aspecto | Canary | Nosso |
|---|---|---|
| Largura barra | 31 bg / 29 fill | 27 total |
| Altura | 4 | 4 (ok) |
| Offset vertical | `p.y - cropSize` onde crop = `getExactSize()` | `top -15` fixo |
| Horizontal | `p.x -15.5` centralizado | `cx` (centro tile) – ok, mas sem `15.5` |
| Gap nome-barra | min 2px enforcement | 5px fixo (y-3 vs hpY+2 = 5px) – maior que Canary |
| Mana bar | colada `moveTop(bottom)` | 2px gap |
| Info segue walk | `dest + walkOffset` incluído em `p` | sim, via `ent.x/y` interpolado, mas floater não segue |
| Damage inicial | `x+24 - w/2, y+8` | `x, y-0.06` – não centraliza por largura |
| Damage movimento | -48px up + diagonal opcional | - (0.007*22*life) ≈ -10% H, sem diagonal |
| Damage merge | soma se mesma cor <40% duração | não existe → sobreposição |
| Ordem render | MAP → CREATURE → CREATURE_INFORMATION (SECOND) → name/icons | MAP ground → corpse → entities → objects → bossbar → labels (segunda passagem) → projectiles/effects → floaters – similar mas bossbar entre objects e labels pode cobrir barra |

---

## 4. Arquivos a alterar (mínimo)

- `tibia-idle/game/js/render.js` – principal
  - `TIBIA_BAR_W` 27→31, inner 29
  - `creatureTileOrigin` já ok, mas criar função `getInformationOffset` similar ao Canary usando `anchor`/`exactSize`
  - `drawTibiaBar`/`drawNameBars`: usar `p.x -15.5`, `p.y - cropSize`, gap 2px, clamp borda
  - `draw` loop: segunda passagem de labels deve usar mesmo `p` base, não `top-15`
  - floaters: implementar `merge`, centralização `24 - width/2`, movimento `-48`, fade só após 83%, e seguir `ent` durante walk (atualizar x/y do floater com posição atual da criatura)

- `tibia-idle/game/js/city-render.js` – se quiser consistência na cidade (usa mesma `creatureTileOrigin`, mas desenha sem barra)

- `base/src/screen-element-character.js` e `base/src/canvas.js` – se for para corrigir cliente antigo Forby (opcional, foco pedido é Global-Idle). Pode deixar para segunda fase.

**Por que cada alteração:**
- Largura 31/29 → reprodução pixel-perfect do Canary
- Offset baseado em `getExactSize()` / `anchor.sh` → corrige deslocamento para sprites grandes/pequenos e estabilidade durante walking
- Gap 2px e clamp → evita nome colado na barra e barra cortada na borda, igual Canary
- Merge de damage → evita múltiplos números no mesmo ponto, comportamento oficial
- Movimento -48px e centralização 24 → alinha com Canary e evita barra sendo coberta por dano

---

## 5. Critério de aceitação após correção

- HP bar centralizada horizontalmente em `p.x`, verticalmente `p.y - getExactSize()` (ou `origin.y + offset`), 31x4
- Nome 2px acima da barra, nunca sobrepondo
- Mana bar colada abaixo da HP, sem gap
- Damage nasce em `x+24 - w/2, y+8`, sobe 48px, fade só final, mergeia se mesma cor <40%
- Tudo acompanha walk: sprite, barra, nome e damage movem juntos sem lag
- Funciona para player, monster, boss, 1x1 e 2x2
