# Status — Anéis e Amuletos (TibiaWiki BR: /wiki/Anéis e /wiki/Amuletos_e_Colares)

**Fontes:**
- https://www.tibiawiki.com.br/wiki/Anéis
- https://www.tibiawiki.com.br/wiki/Amuletos_e_Colares
- Páginas individuais dos itens (descrição "You see" oficial de cada um)

## O que foi implementado

### 1. Sistema funcional de atributos (resistência por elemento)
Antes o campo `res` dos itens existia no gamedata mas **não era usado em
lugar nenhum** — anéis/amuletos de proteção não protegiam nada. Agora:

- `playerResistPct(p, element)` (combat.js): soma o `res[element]` de
  **todos os equipamentos** (anel, amuleto, armadura, escudo...);
- `applyPlayerResist(p, element, dano)`: aplica o % ao dano recebido —
  proteção positiva reduz, **negativa aumenta** (fraqueza, ex.: terra
  amulet −10% fogo);
- Aplicado em **todos os danos recebidos**: auto attack do mob (físico),
  skills elementais do mob e condições;
- Agony continua "true damage" (nunca reduz, regra oficial).

**Medição real no combate**: sem proteção o mob dava 54 de dano em 8s;
com Stone Skin Amulet (+80% físico) + Might Ring (+20% físico) o dano caiu
para 5 (−90,7%, o mínimo de 1 por golpe permanece).

### 2. Atributos oficiais da wiki aplicados aos itens existentes
Todos os anéis/amuletos do jogo receberam os atributos reais da wiki
(descrição "You see" oficial):
- **Life Ring** regen +6/+2 · **Time Ring** speed +30 · **Sword/Axe/Club
  Ring** skill +4 · **Power Ring** punho +4 · **Might Ring** proteção
  +20% em todos os elementos (20 cargas) · **Stone Skin Amulet** físico/
  morte +80% (5 cargas) · **Energy Ring** magic shield · **Garlic
  Necklace** life drain +20% · **Elven Amulet** +5% em todos os elementos
  · **Bronze Amulet** mana drain +20% · **Silver Amulet** terra +10% ·
  **Dragon Necklace** fogo +8% · **Protection Amulet** físico +6% · etc.

### 3. Novos itens adicionados (sprites oficiais já em assets/item/)
Mais de **35 anéis/amuletos** que tinham sprite mas não existiam no jogo
agora são itens equipáveis com atributos da wiki: anéis de plasma (blue/
green/orange/red — nv 100 por vocação), **Ring of Souls** (nv 200), **Ring
of Temptation** (mana drain +30%), **Death Ring**, **Star Ring**, **Terra/
Magma/Glacier Amulet** e **Lightning Pendant** (+20% com fraqueza −10%),
**Shockwave/Bonfire/Sacred Tree Amulet** (+60% físico), **Prismatic Ring/
Necklace**, **Lion Amulet/Ring**, **Glooth Amulet** (+10% tudo), **Alicorn/
Arboreal/Arcanomancer Sigil** (nv 400), **Spiritthorn/Ethereal Ring**,
**Gill Necklace**, **Necklace of the Deep**, **Harmony Amulet** (mantra 2),
**Candy Necklace**, **Beetle/Shrunken Head Necklace** (speed), etc.

### 4. Sprites brilhando quando equipado
- No painel de equipamento, os slots de **anel e amuleto com item equipado
  ganham a classe `.acc-glow`**: borda dourada pulsante + brilho (drop-
  shadow) no sprite com animação CSS — indica que os atributos estão
  ativos. Slots vazios não brilham.

## Arquivos alterados

| Arquivo | Mudança |
| --- | --- |
| `js/accessorydata.js` | **novo** — patches de atributos da wiki + ~35 itens novos (sobrevive à reimportação do gamedata) |
| `js/combat.js` | `playerResistPct` + `applyPlayerResist` aplicados em todos os danos recebidos |
| `js/ui.js` | `renderEquip` adiciona `.acc-glow` nos slots de anel/amuleto equipados |
| `css/style.css` | animações de brilho do sprite equipado |
| `index.html` | script `accessorydata.js` |

## Validação (navegador real, headless Chromium)

1. Atributos aplicados: life ring regen 6, time ring +30, sword ring +4,
   might ring res +20 todos, stone skin +80 físico/morte ✓
2. Itens novos existem com atributos (blue plasma, death ring, prismatic,
   alicorn...) ✓
3. `playerResistPct` soma equipamentos (20+80=100 físico) ✓
4. `applyPlayerResist`: 100 com 100% → 1; 100 com 20% → 80; fraqueza −20%
   → 120 ✓
5. Brilho: slots anel/amuleto equipados têm `.acc-glow`; vazio não ✓
6. Tooltip mostra as proteções ✓
7. **Combate real**: dano recebido caiu 54 → 5 com stone skin + might ✓
8. Zero erros de console ✓
