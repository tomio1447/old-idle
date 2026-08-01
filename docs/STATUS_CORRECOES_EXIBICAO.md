# Status — Correções de Exibição (floaters, out of range, magias duplicadas)

## 1. "Fora de alcance" removido da tela

O evento `t: "range"` mostrava **"fora de alcance"** flutuando no meio da
cena sempre que um ataque não alcançava o alvo. Removido:

- `js/combat.js`: o push do evento `range` foi removido (a falha de alcance
  volta `false` silenciosamente, como antes — só sem o floater);
- `js/game.js`: o `case "range"` do `drainEvents` não desenha mais nada.

## 2. Dodge e Ruse agora sobem NO SQM do personagem

### Causa raiz
Os floaters eram posicionados com uma fórmula herdada do campo de batalha
fixo:

```js
// antes (errado)
const ex = (e) => e.screen ? (e.x || 0.5) : 0.42 + (e.x || 0.5) * 0.5;
const ey = (e) => e.y || 0.5;
```

O player ficava em x≈0.18 → `0.42 + 0.18*0.5 = 0.51` — o "RUSE!"/"errou"
**saía no meio da tela, à direita do personagem**. Com o mapa .otbm (grid
21×13) o player anda, e a fórmula deslocava também dano causado em mobs
próximos.

### Correção
Os eventos já carregam a posição REAL da entidade (`e.x/e.y` = player ou
mob). `ex/ey` agora devolvem essa posição direto (fallback: posição atual
do `c.player`):

```js
// depois (certo)
const ex = (e) => (e.x !== undefined && e.x !== null)
  ? e.x : (c.player ? c.player.x : 0.5);
const ey = (e) => (e.y !== undefined && e.y !== null)
  ? e.y : (c.player ? c.player.y : 0.5);
```

E o `case "miss"` (dodge/ruse/dazzle) usa `ey(e) - 0.06` para o texto subir
**sobre a cabeça** da entidade, como os demais números de dano.

## 3. Magias duplicadas no grimório (todas as vocações auditadas)

### Causa raiz
O `spelldata_1525.js` criava aliases:

```js
SD["exori-dir-san"] = SD["exevo-dir-san"];   // Divine Barrage
SD["exori-dir-moe"] = SD["exevo-dir-moe"];   // Ethereal Barrage
```

O import do Canary JÁ tinha as mesmas magias (sid 300/301) sob os ids
`exori-dir-*`. Resultado: **duas chaves apontando para o mesmo objeto** →
o grimório do Paladino listava cada Barrage 2× (47 linhas em vez de 45), e
qualquer iteração do SPELLDATA duplicava (combo, contadores etc.).

### Correção
- `js/spelldata_1525.js`: os ids antigos `exori-dir-san`/`exori-dir-moe`
  são **deletados** (fica só o id novo `exevo-dir-*`); aliases de
  SPELLFX/SPELLTARGET com o id antigo também removidos;
- `js/combo.js`: `ensureCombo` **migra saves** com o id antigo
  (`exori-dir-*` → `exevo-dir-*`) para não perder a rotação montada antes
  do update.

### Auditoria de exibição por vocação (navegador real)
| Vocação | Linhas no grimório | Problemas |
| --- | --- | --- |
| Knight | 33 | nenhum |
| Paladin | **45** (antes 47 com duplicatas) | nenhum |
| Sorcerer | 77 | nenhum |
| Druid | 79 | nenhum |
| Monk | 37 | nenhum |

Sem `undefined`/`NaN`/`null` no HTML do grimório; faixas de dano corretas
(ex.: Divine Barrage 172–228 e Ethereal Barrage 125–208 num paladino
lvl 300/dist 100).

## Arquivos alterados

| Arquivo | Mudança |
| --- | --- |
| `js/game.js` | `ex/ey` com posição real; `case "miss"` no sqm da entidade; `case "range"` sem floater |
| `js/combat.js` | remoção do push do evento `range` |
| `js/spelldata_1525.js` | dedup dos Barrages (delete `exori-dir-*` + aliases) |
| `js/combo.js` | migração `exori-dir-*` → `exevo-dir-*` no `ensureCombo` |

## Validação (navegador real, headless Chromium)

1. Sem duplicatas por `words` no SPELLDATA ✓
2. Paladino: 45 magias, Barrage 1× ✓
3. Combo com id antigo migra para o novo ✓
4. Evento `range` não gera floater ✓
5. **RUSE! no mesmo sqm do player** (x idêntico, y subindo sobre a cabeça) ✓
6. Dodge mostra "errou" no player ✓
7. Grimório das 5 vocações sem erros de render ✓
8. Regressão: combate real com dano, zero erros de console ✓
