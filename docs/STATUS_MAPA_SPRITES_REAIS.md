# Status — Mapa da Sala de Exercise Weapons com Sprites Reais (15.x)

## Problema
O mapa `sala de exercise weapons.otbm` foi desenhado no editor RME com a
paleta do client 15.x (ids 53xxx/54xxx — piso de pedra cinza-azulado,
paredes azuis, pódio esverdeado, estátua dourada do Ferumbras).

O jogo, porém, só tinha os sprites da paleta 8.60 (`assets/tiles/`), e o
`otbm.js` fazia uma **conversão aproximada** 15.x→8.60 (ex.: piso → tile
481 dourado-marrom). Resultado (print1): o mapa renderizava com **tons
quentes/marrons**, diferente do que foi desenhado no editor (print2).

## Solução
### 1. Sprites reais 15.x extraídos dos atlases do editor
O editor RME do próprio jogo (`rme/data/atlas_0..5.png`) contém a paleta
15.x completa (4.075 tiles ≥ 50000) com o **pixel oficial do client**. Os
**51 tiles usados pelo mapa** foram recortados dos atlases (formato
`[id, walk, block, ground, page, idx]` do catálogo → célula `idx % 128,
floor(idx/128) % 64` de 32×32) e salvos em `assets/tiles/<id>.png`.

### 2. Conversão removida no otbm.js
O `huntMapFromOtbm` agora usa os **ids originais** do mapa — nada de
converter. O jogo desenha exatamente o que o editor mostrava.

### 3. Flags de colisão reais no tileflags.js
Adicionados os `[walk, block]` reais dos 51 ids (lidos do catálogo):
- piso 53882/53873/53910/53884 e pódio 42765 → andáveis;
- parede externa 54565 e degraus 53481..53489 → bloqueiam;
- pilares, tochas e decoração central → não bloqueiam (aparecem).

### 4. Dummy do mapa (sem GIF sobreposto)
A célula do dummy (10,5) contém os itens **28559 (estátua dourada) +
53586 (base cinza) + 54687 (plataforma)** que formam o Ferumbras Exercise
Dummy real do client — desenhados pelo próprio mapa. O `drawAcademy`
agora **não sobrepõe mais o GIF** quando o mapa está ativo (o GIF fica só
como fallback da cena procedural).

## Resultado (print2 = esperado)
- Piso **cinza-azulado** (214,223,225) — o piso de pedra do Tibia;
- Paredes externas **azuis** (33,139,222);
- Pódio **azul-esverdeado** (50,106,115) com pilares e tochas;
- **Estátua dourada do Ferumbras** na célula do dummy;
- Player parado no spawn (8,5).

## Arquivos alterados
| Arquivo | Mudança |
| --- | --- |
| `assets/tiles/*.png` (51) | **novos** — sprites reais 15.x recortados dos atlases do editor |
| `js/otbm.js` | removida conversão TILE_15_860 (usa ids originais) |
| `js/tileflags.js` | flags reais [walk, block] dos 51 ids |
| `js/render.js` | não sobrepõe o GIF do dummy quando o mapa já tem o dummy |

## Validação (navegador real, headless Chromium)
1. Mapa carrega com os ids originais ✓
2. Canvas: piso cinza-azulado (19.470 px), paredes azuis (7.379 px),
   pódio esverdeado (2.406 px), estátua dourada (1.042 px) ✓
3. Estrutura da grade: paredes nas bordas, pódio central com pilares,
   estátua no (10,5), player no spawn (8,5) ✓
4. Sem GIF duplicado sobre o dummy do mapa ✓
5. Zero erros de console ✓
