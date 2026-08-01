# Status — Auditoria e atualização do Damage System (TibiaWiki/Damage)

**Fonte:** https://tibia.fandom.com/wiki/Damage

## Auditoria: o que já estava correto

| Regra da wiki | Jogo | Situação |
| --- | --- | --- |
| Armor reduz dano FÍSICO (sempre) | `mitigate()` aplicado no auto attack físico | ✅ já correto |
| Dano MÁGICO ignora armor | spells/runas usam só `applyResist` | ✅ já correto |
| Shielding bloqueia dano físico | `mitigate()` usa shielding no físico; `mobSkillHit` (mágico) não usa | ✅ já correto |
| Magic Shield / Energy Ring convertem dano em mana | `applyMagicShieldAbsorb` | ✅ já correto |
| Resistências por elemento | `applyResist` (percentual, 100 = imune) | ✅ já correto |

## O que foi atualizado

### 1. Cores oficiais de dano (Damage Colors)

| Tipo | Wiki | Antes | Depois |
| --- | --- | --- | --- |
| Físico | **Vermelho** | `#d8d8d8` (cinza) ❌ | **`#ff3c3c`** ✅ |
| Fogo | Laranja | `#ff8a3c` | ✅ (já correto) |
| Terra | Verde | `#8ac83c` | ✅ |
| Energia | Roxo | `#c07cff` | ✅ |
| Gelo | Azul-mar | `#7ec8ff` | ✅ |
| Morte | Vermelho-escuro | `#8b0000` | ✅ |
| Sagrado | Amarelo | `#ffe680` | ✅ |
| Afogamento | Ciano | — | **`#3ad6d6`** (novo) |
| Mana Drain | Azul | — | **`#3c66ff`** (novo) |
| Life Drain | Vermelho | — | **`#c03030`** (novo) |
| Agony | Marrom | — | **`#9a6a3a`** (novo, true damage) |

### 2. Agony = true damage
- Novo elemento `agony` (flag `trueDamage`): **não pode ser mitigado nem reduzido**.
- `applyResist` devolve o dano intacto para agony (nem resist 100 reduz);
- `mobSkillHit` pula proteção %, proteção de imbuement e mantra do Monk;
- `rollDamage` (jogador) pula a armor do mob;
- condition `agony` adicionada — **o Magic Shield não protege contra ela** (wiki: "can not be cured or protected against").

### 3. Imunidades de criaturas
- `applyResist` agora respeita o array `imune` com ELEMENTOS (ex.: `imune: ["fire"]` → dano 0).
- Ghost, Pirate Ghost, Spectre, Phantasm etc. já tinham `resist.physical: 100` (funcionava); a nova regra cobre também imunidade declarada.

### 4. Mana Drain e Life Drain (skills de monstros)
- Skills com nome `mana drain`/`manadrain` (ex.: Timira the Many-Headed, Soulsnatcher) agora **drenam MANA** (cor azul) em vez de vida, e transferem metade ao atacante;
- Skills `life drain`/`lifedrain` (ex.: Soulsnatcher, Eradicator) causam dano (cor vermelha) e **curam o mob** pelo valor causado;
- Detectados pelo nome da skill (o import do Canary não traz o tipo, só o nome).

### 5. Ícones oficiais de Damage Types
- 5 ícones novos baixados da wiki (`assets/ui/damage/`: physical, holy, mana-drain, life-drain, agony) + os de condição já existentes;
- `WIKI_DAMAGE_ICONS` no icondata.js (11 tipos mapeados);
- Tooltip de itens: as resistências agora mostram o **ícone oficial** de cada tipo de dano (ex.: `+2% Físico` com ícone vermelho).

## Arquivos alterados

| Arquivo | Mudança |
| --- | --- |
| `js/core.js` | `ELEMENTS`: físico vermelho + drown/manadrain/lifedrain/agony |
| `js/combat.js` | `applyResist` (agony true damage + imune por elemento); `mobSkillHit` (mana/life drain + agony ignora reduções); `rollDamage` (agony ignora armor); condition agony (fura magic shield) |
| `js/icondata.js` | `WIKI_DAMAGE_ICONS` + helper `dmgIconImg` |
| `js/ui.js` | tooltip de resistências com ícones |
| `assets/ui/damage/*.png` (5) | novos (oficiais da wiki) |

## Validação (navegador real, headless Chromium)

1. Cores da tabela oficial (físico `#ff3c3c`, agony/drown/manadrain/lifedrain presentes) ✓
2. Ghost (resist physical 100) → dano físico **0** ✓
3. Agony vs resist 100 → dano **intacto** ✓ · imune `["fire"]` → 0 ✓ · resist 25% → 75 ✓
4. Skill "manadrain-ball" → drena MANA, evento `el: manadrain` ✓
5. Skill "lifedrain-beam" → dano + **cura o mob** ✓
6. Condition agony com Magic Shield ativo → **HP cai mesmo assim** (fura o shield) ✓
7. 11 ícones registrados; itemTip mostra `+2% Físico` com ícone e cor vermelha ✓
8. Combate real 10s: 4 kills, zero erros JS ✓
