/* Geometria 15.25 no motor autoritativo: ondas, AREA_BARRAGE e chain.
 * Execute: node tibia-idle/tools/test_spell_areas_chains.js */
"use strict";
const engine = require("../server/authoritative_engine");

function must(ok, msg) { if (!ok) throw Error(msg); }
function cell(cx, cy, extra) {
  return Object.assign({
    cx, cy, hp: 100,
    x: (cx + 0.5) / 30, y: (cy + 0.5) / 30,
  }, extra || {});
}
function idsOf(list) { return (list || []).map((m) => m.id); }
const auth = { gridW: 30, gridH: 30 };

must(engine.ALL_SPELLS["exevo-dir-san"]
  && engine.ALL_SPELLS["exevo-dir-san"].area === "AREA_BARRAGE"
  && engine.ALL_SPELLS["exevo-dir-san"].needTarget,
  "exevo-dir-san ausente em ALL_SPELLS após o patch 15.25");
must(engine.ALL_SPELLS["exori"].mana === 125 && engine.ALL_SPELLS["exori-gran"].mana === 360
  && engine.ALL_SPELLS["exori-mas"].mana === 200,
  "mana 15.25 de Berserk/Fierce/Groundshaker ausente no online");
must(engine.ALL_SPELLS["exura-ico"].mana === 60 && engine.ALL_SPELLS["exura-med-ico"].mana === 135
  && engine.ALL_SPELLS["exura-gran-ico"].mana === 300 && engine.ALL_SPELLS["exura-gran-ico"].cd === 120000,
  "curas de Knight 15.25 ausentes no online");
must(engine.ALL_SPELLS["exori-gran-flam"].f.flatMin > 16,
  "Strong Flame Strike não escalou o base power 15.25");
must(engine.ALL_SPELLS["exevo-max-mort"].lvl === 66, "Great Death Beam não virou magia comum no 66");
must(engine.ALL_SPELLS["exori-ico-scu"] && engine.ALL_SPELLS["exori-ico-scu"].shieldSpell
  && engine.ALL_SPELLS["exori-scu"] && engine.ALL_SPELLS["exori-mas-amp-pug"]
  && engine.ALL_SPELLS["utori-con"] && engine.ALL_SPELLS["uteta-flam"]
  && !engine.ALL_SPELLS["utito-tempo-san"] && !engine.ALL_SPELLS["uteta-tio"],
  "magias novas 15.25 (escudo/thousand fist/stances) ausentes no online");
must(engine.spellVisual(engine.ALL_SPELLS["exevo-dir-san"]).fx === "divine-barrage-effect"
  && engine.spellVisual(engine.ALL_SPELLS["exevo-dir-moe"]).fx === "ethereal-barrage-effect"
  && engine.spellVisual(engine.ALL_SPELLS["exori-ico-scu"]).fx === "shield-bash-effect"
  && engine.spellVisual(engine.ALL_SPELLS["exori-mas-amp-pug"]).fx === "thousand-fist-effect"
  && engine.spellVisual(engine.ALL_SPELLS["exevo-fur-frigo"]).fx === "forked-glacier-effect"
  && engine.ALL_SPELLS["exevo-tempo-mas-san"]
  && engine.spellVisual(engine.ALL_SPELLS["exevo-tempo-mas-san"]).fx === "divine-grenade-effect",
  "sprites 15.25 das magias novas não saem no evento online");
must(engine.RUNEDATA["explosion-rune"].areaNome === "AREA_SQUARE1X1"
  && engine.RUNEDATA["avalanche-rune"].f.flatMin > 7,
  "runas 15.25 (Explosion 3x3 / Avalanche power 50) ausentes no online");
must(engine.AREA_DATA.AREA_BARRAGE && engine.AREA_DATA.AREA_BARRAGE.sqm === 21
  && engine.AREA_DATA.AREA_ECHO && engine.AREA_DATA.AREA_ECHO.sqm === 25,
  "AREA_BARRAGE/AREA_ECHO não entraram em AREA_DATA");

const fire = engine.ALL_SPELLS["exevo-flam-hur"];
must(fire && fire.area === "AREA_WAVE4", "Fire Wave sem AREA_WAVE4");
const casterW = cell(10, 10, { id: "caster" });
const aimEast = cell(20, 10, { id: "aim" });
const waveCells = engine.spellAreaCells(auth, fire, casterW, aimEast);
must(waveCells.length > 0, "WAVE4 não gerou células");
must(!waveCells.some((c) => c.cx === 10 && c.cy === 10), "WAVE4 não pulou [0,0] do caster");
must(waveCells.every((c) => c.cx > 10), "WAVE4 não projetou para o alvo a leste");
must(!waveCells.some((c) => c.cx === 20 && c.cy === 10),
  "WAVE4 ancorou no alvo em vez do caster");

const west = cell(8, 10, { id: "west" });
const east = cell(12, 10, { id: "east" });
const waveHits = engine.spellAreaTargets(auth, fire, casterW, aimEast, [west, east, aimEast]);
must(idsOf(waveHits).includes("east"), "WAVE4 não acertou o tile da onda");
must(!idsOf(waveHits).includes("west"), "WAVE4 caiu no fallback N-nearest fora da matriz");
must(!idsOf(waveHits).includes("aim"), "WAVE4 forçou o alvo longe da matriz");

const ice = engine.ALL_SPELLS["exevo-gran-frigo-hur"];
must(ice && ice.area === "AREA_WAVE7" && ice.cd === 4000,
  "Strong Ice Wave não usou AREA_WAVE7/cd 4s do 15.25");
const iceCells = engine.spellAreaCells(auth, ice, casterW, aimEast);
must(iceCells.length > waveCells.length, "WAVE7 deveria ser maior que WAVE4");
must(iceCells.every((c) => c.cx > 10) && !iceCells.some((c) => c.cx === 10 && c.cy === 10),
  "WAVE7 não nasceu no caster / não pulou [0,0]");

const barrage = engine.ALL_SPELLS["exevo-dir-san"];
const casterB = cell(5, 5, { id: "paladin" });
const focus = cell(15, 15, { id: "center" });
const barrageCells = engine.spellAreaCells(auth, barrage, casterB, focus);
must(barrageCells.length === 21, "AREA_BARRAGE deveria ter 21 tiles, obteve " + barrageCells.length);
must(barrageCells.some((c) => c.cx === 15 && c.cy === 15), "Divine Barrage não centrou no alvo");
must(!barrageCells.some((c) => c.cx === 5 && c.cy === 5), "Divine Barrage centrou no caster");
must(!barrageCells.some((c) => Math.abs(c.cx - 15) === 2 && Math.abs(c.cy - 15) === 2),
  "AREA_BARRAGE incluiu os cantos do 5x5");

const adj = cell(15, 14, { id: "adj" });
const corner = cell(13, 13, { id: "corner" });
const onCaster = cell(5, 5, { id: "caster-tile" });
const edge = cell(17, 15, { id: "edge" });
const barrageHits = engine.spellAreaTargets(auth, barrage, casterB, focus,
  [focus, adj, corner, onCaster, edge]);
const barrageIds = idsOf(barrageHits);
must(barrageIds.includes("center") && barrageIds.includes("adj") && barrageIds.includes("edge"),
  "Divine Barrage não acertou os tiles da diamond");
must(!barrageIds.includes("corner") && !barrageIds.includes("caster-tile"),
  "Divine Barrage acertou canto ou o tile do caster");

const echo = engine.ALL_SPELLS["exevo-mort-ora"];
must(echo && echo.area === "AREA_ECHO" && echo.echo === 0.5,
  "Death Echo ausente ou sem AREA_ECHO");
const echoCells = engine.spellAreaCells(auth, echo, casterB, focus);
must(echoCells.length === 25, "AREA_ECHO deveria ser 5x5 cheio (25), obteve " + echoCells.length);
must(echoCells.some((c) => c.cx === 13 && c.cy === 13), "AREA_ECHO deveria incluir os cantos");

const lightning = engine.ALL_SPELLS["exori-amp-vis"];
must(lightning && lightning.chain === 3 && lightning.range === 7 && !lightning.area,
  "Lightning sem chain:3 / range 7 do 15.25");
const glacier = engine.ALL_SPELLS["exevo-fur-frigo"];
must(glacier && glacier.chain === 7 && !glacier.area,
  "Forked Glacier deveria ser chain:7 sem matriz de área");
must(engine.ALL_SPELLS["exevo-fur-tera"] && engine.ALL_SPELLS["exevo-fur-tera"].chain === 6,
  "Forked Thorns sem chain:6");

const primary = cell(12, 10, { id: "p" });
const living = [primary];
for (let i = 1; i <= 8; i++) living.push(cell(12 + i, 10, { id: "m" + i }));
const casterC = cell(10, 10, { id: "mage" });
const litHits = engine.spellAreaTargets(auth, lightning, casterC, primary, living);
must(litHits.length === 3, "Lightning deveria encadear 3 alvos, obteve " + litHits.length);
must(litHits[0] === primary && litHits[1].id === "m1" && litHits[2].id === "m2",
  "Lightning não saltou para o vizinho mais próximo");
const glHits = engine.spellAreaTargets(auth, glacier, casterC, primary, living);
must(glHits.length === 7, "Forked Glacier deveria encadear 7 alvos, obteve " + glHits.length);
must(glHits[0] === primary && glHits[6].id === "m6",
  "Forked Glacier não percorreu a cadeia de vizinhos");

const caldera = engine.ALL_SPELLS["exevo-mas-san"];
must(caldera && caldera.area, "Divine Caldera ausente");
const far = cell(20, 20, { id: "far" });
const near = cell(10, 11, { id: "near" });
const calHits = engine.spellAreaTargets(auth, caldera, casterW, far, [far, near]);
must(idsOf(calHits).includes("near") && !idsOf(calHits).includes("far"),
  "Caldera self-target forçou o alvo fora da matriz");

function extrema(cells) {
  let maxFwd = 0, maxLat = 0;
  for (const c of cells) {
    maxFwd = Math.max(maxFwd, c.cx - 10);
    maxLat = Math.max(maxLat, Math.abs(c.cy - 10));
  }
  return { maxFwd, maxLat, n: cells.length };
}
must(waveCells.length === 11, "WAVE4 leste deveria ter 11 SQMs (origem pulada), obteve " + waveCells.length);
must(extrema(waveCells).maxFwd === 3 && extrema(waveCells).maxLat === 2,
  "WAVE4 length×width Canary é 3×5 no fim, não " + JSON.stringify(extrema(waveCells)));

const energyWave = engine.ALL_SPELLS["exevo-vis-hur"];
must(energyWave && energyWave.area === "AREA_SQUAREWAVE5"
  && engine.SPELL_TARGET["exevo-vis-hur"].areaNome === "AREA_SQUAREWAVE5",
  "Energy Wave sem AREA_SQUAREWAVE5");
const ewCells = engine.spellAreaCells(auth, energyWave, casterW, aimEast);
must(ewCells.length === 10, "SQUAREWAVE5 deveria ter 10 SQMs, obteve " + ewCells.length);
must(extrema(ewCells).maxFwd === 4 && extrema(ewCells).maxLat === 1,
  "Energy Wave length×width Canary é 4×3, não " + JSON.stringify(extrema(ewCells)));
must(!ewCells.some((c) => c.cx === 10 && c.cy === 10), "Energy Wave não pulou o caster");

const terra = engine.ALL_SPELLS["exevo-tera-hur"];
must(terra && terra.area === "AREA_SQUAREWAVE5", "Terra Wave sem AREA_SQUAREWAVE5");

const beam = engine.ALL_SPELLS["exevo-vis-lux"];
must(beam && beam.area === "AREA_BEAM5" && engine.SPELL_TARGET["exevo-vis-lux"].areaNome === "AREA_BEAM5",
  "Energy Beam sem AREA_BEAM5");
const beamCells = engine.spellAreaCells(auth, beam, casterW, aimEast);
must(beamCells.length === 4, "BEAM5 deveria ter 4 SQMs à frente, obteve " + beamCells.length);
must(beamCells.every((c) => c.cy === 10 && c.cx >= 11 && c.cx <= 14),
  "Energy Beam não é 1 de largura × 4 de comprimento");
must(!beamCells.some((c) => c.cx === 10 && c.cy === 10), "Energy Beam não pulou o caster");

const geb = engine.ALL_SPELLS["exevo-gran-vis-lux"];
must(geb && geb.area === "AREA_BEAM8", "Great Energy Beam sem AREA_BEAM8");
const gebCells = engine.spellAreaCells(auth, geb, casterW, aimEast);
must(gebCells.length === 7, "BEAM8 deveria ter 7 SQMs à frente, obteve " + gebCells.length);
must(extrema(gebCells).maxFwd === 7 && extrema(gebCells).maxLat === 0,
  "Great Energy Beam length×width Canary é 7×1");

must(iceCells.length === 16, "WAVE7 deveria ter 16 SQMs (origem pulada), obteve " + iceCells.length);
must(extrema(iceCells).maxFwd === 4 && extrema(iceCells).maxLat === 2,
  "Strong Ice Wave / Great Fire Wave length×width Canary é 4×5");

const onWave = cell(13, 10, { id: "on" }), offWave = cell(13, 13, { id: "off" });
const gfwHits = engine.spellAreaTargets(auth, engine.ALL_SPELLS["exevo-gran-flam-hur"],
  casterW, aimEast, [onWave, offWave, aimEast]);
must(idsOf(gfwHits).includes("on") && !idsOf(gfwHits).includes("off") && !idsOf(gfwHits).includes("aim"),
  "Great Fire Wave não respeitou a matriz WAVE7");

must(typeof engine.authorityStepDuration === "function"
  && engine.authorityStepDuration(220, false, false) < engine.authorityStepDuration(80, false, false),
  "passo Canary não escala com speed");
must(engine.authorityStepDuration(220, true, false) > engine.authorityStepDuration(220, false, false),
  "diagonal Canary não custa extra");

const authMove = {
  gridW: 30, gridH: 30, _stepDt: 1000,
  players: [cell(10, 10, { id: "p1", p: { hp: 100, voc: "knight" } })],
  mobs: [
    cell(16, 10, { id: 2, hp: 100, def: { speed: 240, targetDistance: 1 } }),
    cell(16, 12, { id: 3, hp: 100, def: { speed: 80, targetDistance: 1 } }),
    cell(12, 10, { id: 4, hp: 100, def: { speed: 200, targetDistance: 3 } }),
  ],
};
const beforeFast = authMove.mobs[0].cx, beforeSlow = authMove.mobs[1].cx, beforeRange = authMove.mobs[2].cx;
engine.advanceAuthorityMovement(authMove, 1000);
must(authMove.mobs[0].cx < beforeFast, "melee rápido não perseguiu o player");
must(authMove.mobs[0].cx !== authMove.players[0].cx || authMove.mobs[0].cy !== authMove.players[0].cy,
  "monstro entrou no SQM do player");
must(authMove.mobs[1].cx <= beforeSlow, "melee lento andou para trás");
must((beforeFast - authMove.mobs[0].cx) >= (beforeSlow - authMove.mobs[1].cx),
  "speed não diferenciou o número de passos no tick de 1s");
must(authMove.mobs[2].cx >= beforeRange, "ranged targetDistance=3 avançou em cima do player");

console.log("OK: WAVE4/WAVE7/SQUAREWAVE5/BEAM no caster, AREA_BARRAGE 21 no alvo, chains, chase Canary.");
