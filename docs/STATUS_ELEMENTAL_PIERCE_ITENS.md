# Status — Elemental Pierce + Novos Itens (Crypt, Moonsilver, Stellar) + Augments aplicados

## 1. Sistema de Elemental Pierce (novo — TibiaWiki/Elemental_Pierce)

**Fonte:** https://tibia.fandom.com/wiki/Elemental_Pierce (Winter Update 2025)

O **Elemental Pierce** aumenta a sensibilidade de um inimigo por uma
porcentagem. Regras oficiais implementadas em `js/combat.js`:

| Regra | Implementação |
| --- | --- |
| O aumento é **metade** acima de sensibilidade 100% (arredondado p/ cima) | `sens > 100 → sens + ceil(pierce/2)`; `extra > 100 → 100 + ceil((extra-100)/2)` |
| Sensibilidade **0% nunca aumenta** | `sens <= 0 → sem efeito` |
| No máximo **dobra** a sensibilidade | `min(novo, 2*sens)` |
| **Não afeta** dano de Charms | aplicado dentro do `applyResist` (charm é somado antes, fora) |

Validado com os exemplos da própria wiki:
- Holy 90% + 6% → 96% ✓ · Holy 104% + 6% → 107% ✓ · Holy 96% + 8% → 102% ✓
- Physical 4% + 20% → 8% (dobro) ✓ · Ice 0% + 20% → 0% ✓

Funções novas:
- `playerPiercePct(p, element)`: soma o pierce dos itens equipados;
- `applyPierceToResist(pc, piercePct)`: aplica as regras a uma resistência;
- `applyResist(mob, element, dano, piercePct)`: 4º parâmetro opcional.

Aplicado em **todas** as fontes de dano do jogador: auto attack (incluindo
imbuement elemental), magias (dual físico+elemental e normal) e runas.

## 2. Novos itens (33) — com sprites oficiais da TibiaWiki

Baixados os `.gif` oficiais (convertidos para PNG 32×32 com transparência) e
implementados com **requisitos, atributos, resistências, augments e pierce**.

### Crypt Set (lvl 450, cls 4, drop/quest)
| Item | Voc | Atk/Def | Attr | Pierce |
| --- | --- | --- | --- | --- |
| Crypt Slicer | knight | 58/33 2H | sword+4 | Earth 10% |
| Crypt Splitter | knight | 58/33 2H | axe+4 | Energy 10% |
| Crypt Breaker | knight | 58/33 2H | club+4 | Fire 10% |
| Crypt Strike | monk | 45/20 2H | fist+4, ml+1 | Physical 8% |
| Crypt Spine | paladin | dist+3 | — | Holy 2% |
| Crypt Jaw | druid | ml+4 | — | Earth 10% |
| Crypt Bile | sorcerer | ml+4 | — | Fire 10% |

### Moonsilver Weapons (lvl 1000, cls 4)
| Item | Voc | Atk/Def | Attr | Pierce |
| --- | --- | --- | --- | --- |
| Moonsilver Epee | knight | 6+50 terra / 33+3 | sword+6 | Earth 4% |
| Moonsilver Axe | knight | 6+50 terra / 33+3 | axe+6 | Earth 4% |
| Moonsilver Crusher | knight | 6+50 terra / 33 | club+6 | Earth 4% |
| Moonsilver Claymore | knight | 6+54 fogo / 36 2H | sword+6 | Fire 5% |
| Moonsilver Chopper | knight | 6+54 fogo / 36 2H | axe+6 | Fire 5% |
| Moonsilver Mace | knight | 6+54 fogo / 36 2H | club+6 | Fire 5% |
| Moonsilver Katar | monk | 46/22 2H | fist+6, ml+2, bond energy | Energy 4% |
| Moonsilver Bow | paladin | dist+5 | res fire+7% | Fire 3% |
| Moonsilver Crossbow | paladin | dist+5 | res holy+7% | Holy 3% |
| Moonsilver Channeler | sorcerer | ml+6 | res energy+7% | Energy 3% |
| Moonsilver Sceptre | druid | ml+6 | res earth+7% | Earth 3% |

### Stellar Moonsilver (lvl 1000) — versões forjadas, pierce +1
Epee/Axe/Crusher (Earth 5%), Claymore/Chopper/Mace (Fire 6%), Katar (Energy
5%), Bow (Fire 4%), Crossbow (Holy 4%). Atk elemental maior (+55/+60).

### Moonsilver Helmets (lvl 800, cls 4) + Ink Blade — com Augments
- Moonsilver Battle Visor (knight): Groundshaker +12% crit extra
- Moonsilver Nimbus Hat (sorcerer): Death Echo +8% crit extra
- Moonsilver Spirit Mask (druid): Forked Glacier +8% crit extra
- Moonsilver Strike Helm (monk): Thousand Fist Blows +12% crit extra,
  Restore Balance +10% cura base
- Moonsilver Trail Hood (paladin): Divine Barrage +8% crit extra
- Ink Blade (knight): Summon Knight Familiar −300s cooldown

## 3. Atualização de Augments aplicada

O pacote anterior (Sistema de Augments) foi **incluído** nesta entrega
(`js/augments.js` + aplicação no combate + tooltip) — o GitHub ainda não o
tinha.

## Arquivos alterados

| Arquivo | Mudança |
| --- | --- |
| `js/combat.js` | Elemental Pierce (playerPiercePct, applyPierceToResist, applyResist com pierce) + augments (base damage/heal, crit, cooldown, leech) |
| `js/augments.js` | **novo** (motor de augments) |
| `js/ui.js` | tooltip com pierce + augmentLabel |
| `js/cyclopedia-ui.js` | augmentLabel |
| `js/weapondata.js` | **regenerado** com os 33 itens novos |
| `data/weapons.json` | 33 itens novos (stats, requisitos, pierce, aug) |
| `index.html` | `<script src="js/augments.js">` |
| `assets/item/*.png` (33) | sprites oficiais convertidos |

## Validação (navegador real, headless Chromium)

1. 19/19 itens-chave no GAMEDATA com pierce/lvl/augments ✓
2. Zero 404 nos sprites dos itens ✓
3. Todos os exemplos de regras da wiki conferem (96/107/102/8/0/80/155/205) ✓
4. `playerPiercePct` soma apenas o elemento equipado (earth 4, fire 0) ✓
5. Dano real: mob −30% terra recebe 1300 sem pierce e 1340 com pierce 4 ✓
6. Tooltip: `4% Terra pierce` ✓
7. Augments dos helmets funcionando (Thousand Fist Blows) ✓
8. Combate real 9s: 3 kills, zero erros JS ✓
