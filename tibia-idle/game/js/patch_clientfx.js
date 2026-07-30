/* =========================================================================
 * patch_clientfx.js — efeitos de distancia e ancora de area como no client
 *
 * Dois desvios faziam a animacao sair errada:
 *
 * 1) As magias de skill do knight ancoram no ALVO e ainda emitem o
 *    projetil "small-stone" do fallback fisico — o exori parece "voar"
 *    no inimigo. No Canary (Combat::doCombat), magia sem needTarget ancora
 *    em QUEM LANCA, e berserk/fierce berserk/groundshaker/front sweep nao
 *    declaram COMBAT_PARAM_DISTANCEEFFECT nos .lua (data/scripts/spells/
 *    attack/): o golpe acontece no SQM atingido, no pe do knight. Marcamos
 *    o self no SPELLTARGET e o combate deixa de inventar projetil.
 *
 * 2) O DISTANCEEFFECT declarado por magia faltava ou divergia da sprite
 *    disponivel:
 *      - exori ico / exori gran ico / exori hur / exori amp kor usam
 *        CONST_ANI_WEAPONTYPE (brutal_strike.lua, annihilation.lua,
 *        whirlwind_throw.lua, executioners_throw.lua): o client arremessa
 *        uma copia giratoria da arma equipada. Guardamos "$weapon" e o
 *        castSpellById resolve para whirlwind-sword/axe/club.
 *      - exori con / exori gran con usam CONST_ANI_ETHEREALSPEAR
 *        (ethereal_spear.lua, strong_ethereal_spear.lua). O importador
 *        antigo marcou "spear"; existe sprite propria ethereal-spear.
 *      - sudden death: CONST_ANI_SUDDENDEATH + CONST_ME_MORTAREA
 *        (runes/sudden_death.lua); explosion: CONST_ANI_EXPLOSION +
 *        CONST_ME_EXPLOSIONAREA (runes/explosion.lua). As demais runas de
 *        ataque ja saem certas pelo projetil do elemento.
 *
 * Precisa rodar DEPOIS dos data-sets gerados (spelltargetdata,
 * spellfxdata, runedata) e ANTES do core.js montar SPELLS/SUPPLIES —
 * mesma posicao do spelldata_1525.js no index.html.
 * ========================================================================= */
"use strict";

(function () {
  const W = typeof window !== "undefined" ? window : globalThis;

  // 1) ancora no conjurador (berserk/fierce berserk/groundshaker/front
  //    sweep — nenhum tem needTarget nem distance effect no .lua)
  if (W.SPELLTARGET) {
    for (const id of ["exori", "exori-gran", "exori-mas", "exori-min"]) {
      if (W.SPELLTARGET[id]) W.SPELLTARGET[id].self = 1;
    }
  }

  // 2) projetil por magia (chave de SPELLFX.words sao as palavras)
  if (W.SPELLFX && W.SPELLFX.words) {
    const fxw = W.SPELLFX.words;
    function entry(words) {
      if (!fxw[words]) fxw[words] = {};
      return fxw[words];
    }
    entry("exori ico").miss = "$weapon";          // brutal_strike.lua
    entry("exori gran ico").miss = "$weapon";     // annihilation.lua
    entry("exori hur").miss = "$weapon";          // whirlwind_throw.lua
    entry("exori amp kor").miss = "$weapon";      // executioners_throw.lua
    entry("exori con").miss = "ethereal-spear";   // ethereal_spear.lua
    entry("exori gran con").miss = "ethereal-spear";
  }

  // 3) runas: efeito de impacto + arremessavel oficiais
  if (W.RUNEDATA) {
    if (W.RUNEDATA["sudden-death-rune"]) {
      W.RUNEDATA["sudden-death-rune"].missile = "sudden-death";
      W.RUNEDATA["sudden-death-rune"].fx = "mort-area";
    }
    if (W.RUNEDATA["explosion-rune"]) {
      W.RUNEDATA["explosion-rune"].missile = "explosion";
      W.RUNEDATA["explosion-rune"].fx = "explosion-area";
    }
  }
})();
