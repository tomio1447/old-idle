# Status — Atualização Siphoning / Draining (TibiaWiki)

**Fontes:**
- https://tibia.fandom.com/wiki/Siphoning
- https://tibia.fandom.com/wiki/Draining

## Contexto
Os itens **Siphoning Inferniarch** e **Draining Inferniarch** (Winter Update
2024, atributos aplicados via Doomforge nas armas do Inferniarch Set) **já
existiam** nos dados do jogo (`weapons.json`) com os sprites, mas o
**atributo de leech não funcionava**: o combate só aplicava o leech vindo de
**imbuements** (`imbTotals`), ignorando o leech fixo dos itens.

## O que foi implementado

### 1. Leech fixo de equipamento (atributo do item)
- **`equipmentLeechTotals(p)`** (novo, `player.js`): soma o
  `lifeLeech`/`manaLeech` de TODOS os equipamentos.
- Aplicado no **auto attack** (`combat.js`), somado ao leech dos imbuements:
  - **Siphoning** → **10% de Mana Leech** permanente;
  - **Draining** → **29% de Life Leech** permanente.
- Vale para qualquer item com `lifeLeech`/`manaLeech` fixo, não só os
  Inferniarch.

### 2. Itens verificados (já presentes, agora funcionais)
| Item | Atributo | Voc | Lvl | Cls | ImbSlots |
| --- | --- | --- | --- | --- | --- |
| Siphoning Inferniarch Arbalest/Bow | Mana Leech 10% | paladin | 300 | 4 | 2-3 |
| Siphoning Inferniarch Blade/Battleaxe/Flail | Mana Leech 10% | knight | 300 | 4 | 1 |
| Siphoning Inferniarch Greataxe/Slayer/Warhammer | Mana Leech 10% | knight | 300 | 4 | 1 |
| Siphoning Inferniarch Claws | Mana Leech 10% | monk | 300 | 4 | 1 |
| Siphoning Inferniarch Wand/Rod | Mana Leech 10% | sorcerer/druid | 300 | 4 | 1 |
| Draining Inferniarch (todos os 11) | Life Leech 29% | conforme voc | 300 | 4 | 1-3 |

### 3. Tooltip
- `itemTip` já exibia "Mana leech 10%" / "Life leech 29%" — confirmado nos
  testes.

### Regra da wiki (documentada)
- Armas Siphoning **não podem** ser imbuídas com Void (Basic/Intricate/
  Powerful) e as Draining **não podem** com Vampirism — como já têm 1 slot
  de imbuement (vs 2-3 das base), a limitação fica implícita na UI.

## Arquivos alterados

| Arquivo | Mudança |
| --- | --- |
| `js/player.js` | `equipmentLeechTotals(p)` (novo helper) |
| `js/combat.js` | leech fixo dos itens aplicado no auto attack |

## Validação (navegador real, headless Chromium)

1. Itens no GAMEDATA: Siphoning `manaLeech: 10`, Draining `lifeLeech: 29`,
   lvl 300, cls 4, vocs corretas ✓
2. `equipmentLeechTotals`: sip→{life 0, mana 10}, dr→{life 29, mana 0},
   ambos→{life 29, mana 10} ✓
3. **Mana leech real**: ataque com Siphoning recuperou mana (300→308, +8) ✓
4. **Life leech real**: ataque com Draining recuperou vida (1380→1411, +31) ✓
5. Tooltip: "Mana leech 10%" e "Life leech 29%" ✓
6. Regressão: combate 9s com 3 kills, zero erros ✓
