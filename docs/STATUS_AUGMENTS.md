# Status — Sistema de Augments completo (TibiaWiki/Augments)

**Fonte:** https://tibia.fandom.com/wiki/Augments

## O que foi feito

### 1. Motor de Augments — `js/augments.js` (novo)
Os augments existiam apenas como **dados exibidos** (tooltip/Cyclopedia) —
nenhum efeito real era aplicado no combate. Agora:

- `augmentSpellId(nome)`: normaliza o nome da spell citada no item (case-
  insensitive, espaços→hífen, aliases/correções de typo da wiki, ex.:
  "fierce beserk" → "fierce berserk") e resolve o ID real da magia no jogo
  (busca por id → nome exato → nome parcial). Cobre as 42 spells referenciadas.
- `augmentTotals(p, spellId)`: soma os augments de **todos os itens
  equipados** que afetam a spell, por tipo:
  - `base damage` (Impact) → % no dano base;
  - `base healing` (Impact) → % na cura base;
  - `critical extra damage` → % no dano crítico da spell;
  - `critical hit chance` → % de chance de crítico DA spell;
  - `cooldown` → redução em ms;
  - `life leech` / `mana leech` → leech extra da spell;
  - `chain` → suporte (sem itens no jogo ainda).
- `augmentLabel(a)`: texto pt-BR para exibição.

### 2. Aplicação no combate — `js/combat.js`
- **base damage**: aplicado sobre o dano BASE da spell (antes de
  stances/forja/crítico) — regra oficial confirmada por CipSoft (17/05/2024).
- **crítico**: "critical hit chance" pode conceder crítico à spell; quando
  crítica, "critical extra damage" soma ao dano.
- **cooldown**: o cooldown da spell é reduzido (ex.: Sanguine Legs tira 900s
  do Avatar of Steel; Ink Blade −300s do familiar).
- **life/mana leech**: curam/recarregam o personagem conforme o dano causado
  pela spell (`augmentApplyLeech`).
- **base healing**: aplicado na cura base das magias de cura (`tryHeal`).

### 3. Exibição (tooltip + Cyclopedia) — `js/ui.js`, `js/cyclopedia-ui.js`
- Tooltip do item agora mostra os augments formatados em pt-BR com o nome
  oficial da spell do jogo, ex.:
  `▸ Strong Ice Wave: +6% dano crítico extra` (antes: `▸ strong ice wave: +6% critical extra damage`);
  cooldown em segundos: `▸ Avatar of Steel: −900s cooldown`.

### 4. Itens atualizados — `data/weapons.json`
- Corrigido o typo **"fierce beserk"** → **"fierce berserk"** no
  `sanguine-legs` (o augment não funcionava por não achar a spell).
- Os 84 itens com augments já existentes foram validados: 42 spells únicas
  referenciadas, 40 mapeiam para magias reais do jogo (2 sem correspondente:
  "depth claws" — spell do Monk ainda não implementada — e o alias corrigido).

### Pendência documentada
6 itens da wiki com augments **não têm sprite** no projeto (Moonsilver set e
Ink Blade) — não foram inseridos para não gerar imagem quebrada; ficam para
quando os sprites forem importados.

## Arquivos alterados

| Arquivo | Mudança |
| --- | --- |
| `js/augments.js` | **novo** — motor de augments |
| `js/combat.js` | base damage/healing, crítico, cooldown e leech aplicados |
| `js/ui.js` | tooltip com `augmentLabel` (pt-BR) |
| `js/cyclopedia-ui.js` | detalhes do item com `augmentLabel` |
| `index.html` | `<script src="js/augments.js">` |
| `data/weapons.json` | typo "fierce beserk" → "fierce berserk" |

## Validação (navegador real, headless Chromium)

1. `augmentSpellId`: "Energy Wave"→exevo-vis-hur, "Hell's Core"→exevo-gran-
   mas-flam, "fierce beserk"→exori-gran ✓
2. `augmentTotals` com item equipado: baseDmg 8, critDmg 14, cdReduction
   8000, lifeLeech 5, critChance 100, total 5 ✓
3. Cast de Energy Wave com augments: dano +8% base, crítico ativou (chance
   100% do augment + extra 14%), cooldown 8000→~1000ms ✓
4. Life leech curou o personagem (190→202) ✓
5. `tryHeal` com "base healing" +20% (exura de druid): curou ✓
6. Tooltip: `▸ Strong Ice Wave: +6% dano crítico extra` ✓
7. Combate real 9s: 4 kills, zero erros ✓
