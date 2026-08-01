# Status — Critical Heal System + CRIT em vermelho

## 1. Critical Heal (Vocation Adjustments 2026)

**Fonte:** https://tibia.fandom.com/wiki/Critical_Heal

- **Druid com o perk "Blessing of the Grove"** (Revelation Perk) pode curar
  além do normal: a cura usa a MESMA chance de Critical Hit e o MESMO dano
  crítico extra do personagem.
- Aplicado em **magias de cura** (exura, exura gran, exura vita...) e em
  **runas de cura** (UH/IH rune — são magias conjuradas). **Potions NÃO
  críticam** (como no oficial).

### Fontes de crítico (Critical Hit — Summer Update 2025)

**Fonte:** https://tibia.fandom.com/wiki/Critical_Hit

- Todo personagem tem **5% de chance intrínseca de 10% de dano extra**
  (Summer Update 2025);
- **Strike imbuement** soma chance fixa (10%) e bônus de dano (15/25/50%);
- O roll agora é centralizado em `playerCritChancePct()` /
  `playerCritExtraPct()` / `rollPlayerCrit()` e usado em:
  - auto attack (crítico intrínseco + Strike);
  - magias (quando a stance não deu crítico);
  - **critical heal** (`criticalHealChancePct` / `criticalHealExtraPct` /
    `tryCriticalHeal` — exclusivo do Druid).

### Visual

- Cura crítica mostra o efeito oficial **Critical Heal Effect**
  (`assets/effects/critical-heal-effect.png`, 14 frames, TibiaWiki) + floater
  **"CRITICAL HEAL!"** em vermelho sobre o "+X".

## 2. Sprite do hit CRITICAL agora é VERMELHA

- O sprite `assets/fx/crit-text.png` ("CRIT!") era **azul/ciano** — foi
  **recolorido para vermelho** (como no client oficial), preservando o
  contorno escuro e o brilho branco.
- O golpe crítico agora também dispara o efeito oficial **Critical Hit
  Effect** (`assets/effects/critical-hit-effect.png`, 14 frames) sobre o
  alvo, junto do texto "CRIT!".

## Arquivos alterados

| Arquivo | Mudança |
| --- | --- |
| `assets/fx/crit-text.png` | recolorido azul → VERMELHO |
| `js/combat.js` | `playerCrit*`/`rollPlayerCrit` (intrínseco 5%/10% + Strike), crítico no auto attack e nas magias, `criticalHeal*`/`tryCriticalHeal`, aplicação na cura de spell e runa |
| `js/game.js` | floater "CRITICAL HEAL!" + efeito `critical-heal-effect`; `critical-hit-effect` junto do crit-text |

Obs.: os sprites `critical-hit-effect.png` e `critical-heal-effect.png` já
existiam no projeto (update oficial de effects) e o registro no
`CLIENT_EFFECTS` também — nada novo a baixar, só a integração.

## Validação (navegador real, headless Chromium)

1. `fxFrameCount` dos dois efeitos = 14 ✓
2. `criticalHealChancePct` = 5% (intrínseco) / 15% com Strike; extra = 10% / 60% ✓
3. `criticalHealEnabled(knight)` = false (só Druid) ✓
4. `tryHeal` com spell (exura) → evento `{crit: true, critExtraPct: 10}` e HP sobe ✓
5. Render: `fx:critical-heal-effect` + floater `CRITICAL HEAL!` ✓
6. Golpe crítico: `fx:crit-text` + `fx:critical-hit-effect` ✓
7. `crit-text.png` servido com cor média RGB (150, 62, 54) — vermelho ✓
8. Runa de cura (UH) critica; **potion NÃO critica** ✓
9. Zero 404 / zero erros de console ✓
