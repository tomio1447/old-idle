# Status — Sistema de Mitigation + revisão de Mantra e Perfect Shot

Fontes:
- https://tibia.fandom.com/wiki/Mitigation
- https://tibia.fandom.com/wiki/Mantra
- https://tibia.fandom.com/wiki/Perfect_Shot

## 1. Sistema de Mitigation (novo)

**Regra oficial:** Mitigation é uma propriedade defensiva que reduz **TODOS
os tipos de dano comuns** (Physical, Earth, Ice, Fire, Energy, Holy, Death)
por uma porcentagem. Agony (true damage) e DOT de condições **não** são
reduzidos.

### Monstros
- Os dados Canary já traziam `mitigation` para **881 criaturas** (0.01% a
  5.4%, média ~1.25%) — o valor **não era usado**.
- Novo `applyMonsterMitigation(mob, element, dano)`: reduz o golpe pela % da
  criatura em **todos os tipos comuns**, aplicado:
  - auto attack (`rollDamage`), após resistência;
  - magias (físico+elemental das armas e magias normais);
  - runas;
  - **não** em condições DOT nem em Agony.

### Jogador
- Novo `playerMitigationPct(p)`: calculada de **Shielding** + **Defense do
  escudo/spellbook** (ou da arma quando two-handed ou one-handed sem escudo,
  com penalidade para two-handed), teto 25% — fórmula aproximada (o client
  não divulga a exata).
- `applyPlayerMitigation(p, element, dano)` aplicado no dano recebido:
  - skills de monstros (`mobSkillHit`) — todos os tipos comuns;
  - auto attack corpo-a-corpo do monstro (físico).
- Ícone oficial `Mitigation_Icon` baixado e registrado
  (`WIKI_DAMAGE_ICONS.mitigation`) para a UI futura (Bestiary/Cyclopedia).

## 2. Mantra — revisado

**Regra oficial:** proteção elemental **fixa (flat)** contra Fogo, Gelo,
Energia e Terra (só Monk, equipamento defensivo); **não reduz dano over
time**; o valor **DOBRA na forma Serene**.

- Já estava: flat, só 4 elementos, só Monk, não reduz DOT ✓
- **Corrigido:** o valor agora **dobra quando o Monk está Sereno**
  (`mantraAbsorve(p, dano, elemento, c)` → `mantraTotal * 2`). Como o jogo é
  solo, o Monk está sempre sereno — o mantra efetivo dobra (oficial).
- Chamadas atualizadas com o contexto de combate (`c`).

## 3. Perfect Shot — revisado

**Regra oficial:** dano extra fixo aplicado a **um único alvo**, apenas
quando o alvo está **exatamente na distância** configurada; **bypassa a
Mitigation** de bosses; em área, só o alvo principal.

- Já estava: distância exata (Chebyshev) ✓, "nunca erra" quando ativo ✓,
  bônus somado **depois** da resistência/mitigation (bypassa) ✓, só o alvo
  principal (cleave/área não somam) ✓.
- **Adicionado: Perfect Shot em WANDS** (wiki): Eldritch Wand e Gilded
  Eldritch Wand → `+65 a 4 SQM` (sorcerers), além dos quivers já existentes
  (eldritch +20 @4, alicorn +20 @3).
- Tooltip de item agora mostra "Perfect shot: +X de dano a Y SQM" para
  quivers e wands.

## Arquivos alterados

| Arquivo | Mudança |
| --- | --- |
| `js/combat.js` | `monsterMitigationPct`/`applyMonsterMitigation`, `playerMitigationPct`/`applyPlayerMitigation`; aplicação em rollDamage, magias, runas e dano recebido; perfect shot de wands |
| `js/monk.js` | `mantraAbsorve` dobra em Serene (com contexto `c`) |
| `js/core.js` | dados oficiais de perfect shot das wands |
| `js/ui.js` | tooltip de item com "Perfect shot: +X a Y SQM" |
| `js/icondata.js` | `WIKI_DAMAGE_ICONS.mitigation` |
| `assets/ui/damage/mitigation.png` | novo (ícone oficial) |

## Validação (navegador real, headless Chromium)

1. Monstro com mitigation 2.0: golpe de 1000 → **980**; Agony intacto; sem
   mitigation → intacto ✓
2. `playerMitigationPct` com escudo (3.2) e sem escudo (2.4), teto 25 ✓
3. Mantra: sereno → 200−80=**120**; com `forceSerene:false` → 200−40=**160**;
   físico não reduz ✓
4. Perfect shot: eldritch wand `+65 @4` e quiver `+20 @4` nos dados; tooltip
   mostra ✓
5. Combate real 9s: kills ok, zero erros JS ✓
