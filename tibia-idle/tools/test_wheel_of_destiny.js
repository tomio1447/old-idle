/* Wheel of Destiny: OTC assets + Canary gem/fragment bonuses. */
"use strict";
const fs = require("fs");
const path = require("path");
const engine = require("../server/authoritative_engine");
const wj = require("../game/js/wheel.js");
const wg = require("../game/js/wheel-gems.js");

function must(ok, msg) { if (!ok) throw Error(msg); }

const root = path.join(__dirname, "../game");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
must(html.includes("js/wheeldata.js?v=wod-2026-v1"), "index sem wheeldata cache-bust");
must(html.includes("js/wheel-gems.js?v=wod-2026-v1"), "index sem wheel-gems cache-bust");
must(html.includes("js/wheel.js?v=wod-2026-v1"), "index sem wheel.js cache-bust");
must(html.includes("js/wheel-data.js?v=wod-2026-v1"), "index sem wheel-data cache-bust");
must(html.includes("js/wheel-ui.js?v=wod-fit-v1"), "index sem wheel-ui cache-bust wod-fit");
must(html.includes("css/wheel-otc.css?v=wheelsave-v1"), "index sem wheel-otc.css cache-bust wheelsave");
must(!html.includes("js/wheel-ui.js?v=wheel-fit-screen-v1"), "wheel-ui ainda com cache antigo");

const redecl = /\b(?:var|let|const)\s+WHEEL_(?:SLOTS|POS|CONNECTED|ROOTS|CONFIG|HP|MP|CAP|SKILL|LEECH|MIT_PER_POINT|STAGE_ABILITY|SPELL_UPGRADES|COLORS)\b/;
for (const name of ["wheel.js", "wheel-gems.js", "wheel-ui.js"]) {
  const src = fs.readFileSync(path.join(root, "js", name), "utf8");
  must(!redecl.test(src), name + " ainda declara identificador WHEEL_* do wheeldata");
}

const vm = require("vm");
const concat = ["wheeldata.js", "wheel-gems.js", "wheel.js"].map(function (name) {
  return fs.readFileSync(path.join(root, "js", name), "utf8");
}).join("\n;\n");
const concatCtx = {};
vm.runInNewContext(concat, concatCtx, { filename: "wheel-browser-concat.js" });
must(typeof concatCtx.ensureWheel === "function", "concat: ensureWheel ausente");
const vmPlayer = { voc: "knight", level: 80, wheel: { slots: {}, scrolls: {} } };
must(concatCtx.wheelPoints(vmPlayer) === 30,
  "concat: wheelPoints=" + concatCtx.wheelPoints(vmPlayer));

const seqCtx = {};
vm.createContext(seqCtx);
for (const name of ["wheeldata.js", "wheel-gems.js", "wheel.js"]) {
  vm.runInContext(fs.readFileSync(path.join(root, "js", name), "utf8"), seqCtx, { filename: name });
}
must(typeof seqCtx.ensureWheel === "function", "seq: ensureWheel ausente após wheeldata+wheel.js");
must(seqCtx.wheelPoints(vmPlayer) === 30, "seq: wheelPoints=" + seqCtx.wheelPoints(vmPlayer));

const assets = [
  "assets/wheel/backdrop_skillwheel.png",
  "assets/wheel/vocations/backdrop_skillwheel_knight.png",
  "assets/wheel/backdrop_skillwheel_largebonus_front3_TL.png",
  "assets/wheel/backdrop_skillwheel_largebonus_front3_BR.png",
  "assets/wheel/backdrop_skillwheel_largebonus_light_TL.png",
  "assets/wheel/backdrop_skillwheel_largebonus_socketenabled_0.png",
  "assets/wheel/border/top_left/1.png",
  "assets/wheel/border/bottom_right/9.png",
  "assets/wheel/fragmentIcon.png",
  "assets/wheel/icon-gematelier.png",
  "assets/wheel/socket-gematelier.png",
  "assets/wheel/wheel-colors/top_left/vesselGem.png",
];
for (const rel of assets) {
  must(fs.existsSync(path.join(root, rel)), "asset ausente: " + rel);
}

const ui = fs.readFileSync(path.join(root, "js/wheel-ui.js"), "utf8");
must(ui.includes("wheelStageOverlays") && ui.includes("renderGemAtelier") && ui.includes("renderFragmentWorkshop"),
  "UI da wheel ainda é stub (sem overlays/atelier/fragments)");
must(!ui.includes("Gem Atelier (WIP)"), "Gem Atelier ainda marcado WIP");

const p = {
  voc: "knight", level: 351, gold: 200000000,
  wheel: { slots: { GREEN_50: 50, GREEN_TOP_100: 100, GREEN_BOTTOM_150: 150 }, scrolls: {} },
};
wj.ensureWheel(p);
must(wg.wheelVesselResonance(p, "green") === 3, "resonance verde não é 3 com os 3 nós no máx");

p.wheel.gems.push({
  id: 1, affinity: "green", quality: "greater", revealed: true,
  lesser: "Vocation_Health", regular: "General_PhysicalResistance",
  supreme: "Knight_Fierce_Berserk_DamageIncrease",
});
p.wheel.nextGemId = 2;
must(wg.wheelSocketGem(p, 1, "green").ok, "socket falhou");

const tot = wj.wheelTotals(p);
must(tot.hp >= 300, "gem HP não entrou no wheelTotals (hp=" + tot.hp + ")");
must(Math.abs((tot.resist && tot.resist.physical) - 1) < 0.01, "resistência física da gem ausente");

const boost = wj.wheelApplySpellBoost(p, "exori-gran");
must(boost.damagePct >= 5, "augment Fierce Berserk não aplicou dano (pct=" + boost.damagePct + ")");

const engBoost = engine.wheelApplySpellBoost(p, "exori-gran");
must(engBoost.damagePct >= 5, "servidor não aplicou gem augment (pct=" + engBoost.damagePct + ")");

const max = engine.maxStats(p);
must(max.hp >= 300, "maxStats do servidor ignorou HP da gem (hp=" + max.hp + ")");

must(engine.playerResistPct(p, "physical") >= 1, "playerResistPct do servidor sem gem resist");

p.gold = 40000000;
p.wheel.lesserFrags = 50;
must(wg.wheelUpgradeMod(p, "Vocation_Health", false).ok, "upgrade G II falhou");
must(wg.wheelUpgradeMod(p, "Vocation_Health", false).ok, "upgrade G III falhou");
p.gold = 40000000;
p.wheel.lesserFrags = 50;
must(wg.wheelUpgradeMod(p, "Vocation_Health", false).ok, "upgrade G IV falhou");
must(wg.wheelModGrade(p, "Vocation_Health", false) === 3, "grade IV não persistiu");
must(wj.wheelPoints(p) >= (351 - 50) + 1, "Grade IV não deu +1 promotion point");

const totG4 = wj.wheelTotals(p);
must(totG4.hp >= 450, "Grade IV não multiplicou HP da gem (hp=" + totG4.hp + ")");

const buy = wg.wheelBuyGem(p, "lesser", "red");
must(buy.ok && buy.gem && buy.gem.revealed === false, "compra de gem não criou unrevealed");
const rev = wg.wheelRevealGem(p, buy.gem.id, function () { return 0; });
must(rev.ok && rev.gem.revealed && rev.gem.lesser, "reveal não rolou basic mod");

const smash = wg.wheelDestroyGem(p, buy.gem.id, function () { return 0; });
must(smash.ok && smash.kind === "lesser" && smash.amount >= 1, "dismantle não deu fragments");

const css = fs.readFileSync(path.join(root, "css/wheel-otc.css"), "utf8");
must(css.includes("wheel-largebonus") && css.includes("wheel-slice-fill") && css.includes("wod-wheel-container"),
  "CSS sem overlays/bordas oficiais");

/* Persistência da roda: espelho no tick + sanitize server-side + OK sem
 * fechar o modal. */
const ac = fs.readFileSync(path.join(root, "js/account-client.js"), "utf8");
must(ac.includes("visual.wheel=helperPresetClone(cfgSrc.wheel)"),
  "tick não espelha wheel para a autoridade");
const engSrc = fs.readFileSync(path.join(__dirname, "../server/authoritative_engine.js"), "utf8");
must(engSrc.includes("item.p.wheel=w"), "engine não aplica wheel do tick");
must(ui.includes('id="wheel-ok"') && !ui.includes('modal.classList.remove("show", "wide")'),
  "OK da roda não deve fechar o modal");

must(typeof engine.sanitizeWheelState === "function", "engine sem sanitizeWheelState");
const clean = engine.sanitizeWheelState(
  { slots: { GREEN_50: 75, FAKE_SLOT: 99, RED_50: 20 }, scrolls: {}, gems: [] },
  { level: 500, voc: "knight" });
must(clean && clean.slots.GREEN_50 === 50, "sanitize não clampeou spec.max (GREEN_50=" + (clean && clean.slots.GREEN_50) + ")");
must(clean.slots.FAKE_SLOT === undefined, "sanitize manteve slot desconhecido");
must(clean.slots.RED_50 === 20, "sanitize removeu slot válido");
must(engine.sanitizeWheelState("x", p) === null, "sanitize aceitou payload não-objeto");
// budget: lvl 80 knight = 30 pts — mais que isso é truncado
const over = engine.sanitizeWheelState({ slots: { GREEN_50: 50, RED_50: 50 } }, { level: 80, voc: "knight" });
const overSpent = Object.values(over.slots).reduce((a, b) => a + b, 0);
must(overSpent <= 30, "sanitize não respeitou o budget de pontos (" + overSpent + ")");

/* === Winter Update 2026: mitigação + augments por vocação === */
const wdData = require("../game/js/wheeldata.js");
must(wdData.WHEEL_MIT_PER_POINT === 0.0003,
  "mitigação por ponto != 0.0003 (oficial MITIGATION_INCREASE 0.03)");
must(Math.abs(0.0003 * 800 - 0.24) < 1e-9, "mitigação máxima != 24% em 800 pontos");

/* Stage ability: sorcerer azul = Lord of Destruction (era Drain Body) */
must(wdData.WHEEL_STAGE_ABILITY.blue.sorcerer === "Lord of Destruction",
  "stage azul do sorcerer não é Lord of Destruction");
must(wdData.WHEEL_STAGE_ABILITY.blue.druid === "Twin Bursts", "stage azul do druid errado");

/* Toda spell mapeada nos slots existe no catálogo ou é pseudo-grupo */
const wd = require("../game/js/wheeldata.js");
global.window = global.window || {};
require("../game/js/spelldata.js");
require("../game/js/spelldata_1525.js");
const allSpells = global.window.SPELLDATA || {};
for (const slotId of Object.keys(wd.WHEEL_SLOTS)) {
  const spec = wd.WHEEL_SLOTS[slotId];
  if (!spec.spell) continue;
  for (const voc of Object.keys(spec.spell)) {
    const sp = spec.spell[voc];
    if (wd.WHEEL_PSEUDO_SPELLS[sp]) continue;
    must(allSpells[sp], "spell da wheel inexistente no catálogo: " + sp + " (" + voc + "/" + slotId + ")");
  }
}

/* Todo augment listado tem exatamente 2 fatias na roda (grade I + II) */
for (const voc of Object.keys(wd.WHEEL_SPELL_UPGRADES)) {
  for (const u of wd.WHEEL_SPELL_UPGRADES[voc]) {
    const count = Object.values(wd.WHEEL_SLOTS).filter(function (s) {
      return s.spell && s.spell[voc] === u.name;
    }).length;
    must(count === 2, "augment " + u.name + " (" + voc + ") tem " + count + " fatias (esperado 2)");
  }
}

/* Valores oficiais por vocação — player com as 2 fatias maximizadas = grade II */
function maxed(voc, spellId) {
  const slots = {};
  for (const id of Object.keys(wd.WHEEL_SLOTS)) {
    const s = wd.WHEEL_SLOTS[id];
    if (s.spell && s.spell[voc] === spellId) slots[id] = s.max;
  }
  return { voc: voc, level: 700, wheel: { slots: slots, scrolls: {}, gems: [] } };
}
// knight
let b = wj.wheelApplySpellBoost(maxed("knight", "exori-min"), "exori-min");
must(b.damagePct === 40 && b.area === true, "Front Sweep knight: " + JSON.stringify(b));
b = wj.wheelApplySpellBoost(maxed("knight", "exori-mas"), "exori-mas");
must(b.cooldownMs === 2000 && b.damagePct === 12.5, "Groundshaker: " + JSON.stringify(b));
b = wj.wheelApplySpellBoost(maxed("knight", "exori-scu"), "exori-scu");
must(b.lifeLeech === 15, "Shield Slam leech: " + JSON.stringify(b));
b = wj.wheelApplySpellBoost(maxed("knight", "exura-gran-ico"), "exura-gran-ico");
must(b.healPct === 125 && b.cooldownMs === 300000, "IWC: " + JSON.stringify(b));
b = wj.wheelApplySpellBoost(maxed("knight", "exori-gran"), "exori-gran");
must(b.manaFlat === 30 && b.damagePct === 10, "Fierce Berserk manaFlat: " + JSON.stringify(b));
// paladin
b = wj.wheelApplySpellBoost(maxed("paladin", "exevo-dir-san"), "exevo-dir-san");
must(b.damagePct === 20, "Divine Barrage: " + JSON.stringify(b));
b = wj.wheelApplySpellBoost(maxed("paladin", "exevo-dir-moe"), "exevo-dir-moe");
must(b.lifeLeech === 10 && b.critChance === 10, "Ethereal Barrage: " + JSON.stringify(b));
b = wj.wheelApplySpellBoost(maxed("paladin", "exori-gran-con"), "exori-gran-con");
must(b.cooldownMs === 2000 && b.damagePct === 380, "Strong Ethereal Spear: " + JSON.stringify(b));
b = wj.wheelApplySpellBoost(maxed("paladin", "exana-amp-res"), "exana-amp-res");
must(b.extraTarget === 2 && b.cooldownMs === 8000, "Divine Dazzle: " + JSON.stringify(b));
b = wj.wheelApplySpellBoost(maxed("paladin", "exevo-mas-san"), "exevo-mas-san");
must(b.manaFlat === 20 && b.damagePct === 10, "Divine Caldera: " + JSON.stringify(b));
// sorcerer — grupos multi-magia
b = wj.wheelApplySpellBoost(maxed("sorcerer", "exevo-mort-ora"), "exevo-mort-ora");
must(b.cooldownMs === 2000 && b.damagePct === 12, "Death Echo: " + JSON.stringify(b));
const sorcP = maxed("sorcerer", "__special__");
b = wj.wheelApplySpellBoost(sorcP, "exori-amp-vis");
must(b.cooldownMs === 4000 && b.damagePct === 50, "Special Spells (Lightning): " + JSON.stringify(b));
b = wj.wheelApplySpellBoost(sorcP, "exori-gran-flam");
must(b.damagePct === 50, "Special Spells (Strong Flame): " + JSON.stringify(b));
const sorcF = maxed("sorcerer", "__focus__");
b = wj.wheelApplySpellBoost(sorcF, "exevo-gran-mas-flam");
must(b.damagePct === 5 && b.cooldownMs === 4000, "Focus (Hell's Core): " + JSON.stringify(b));
b = wj.wheelApplySpellBoost(sorcF, "exevo-gran-mas-vis");
must(b.damagePct === 5, "Focus (Rage of the Skies): " + JSON.stringify(b));
b = wj.wheelApplySpellBoost(sorcF, "exori-flam");
must(b.damagePct === 0, "Flame Strike não pode pegar Focus: " + JSON.stringify(b));
b = wj.wheelApplySpellBoost(maxed("sorcerer", "exevo-gran-flam-hur"), "exevo-gran-flam-hur");
must(b.critDamage === 15 && b.critChance === 10 && b.damagePct === 4, "Great Fire Wave: " + JSON.stringify(b));
b = wj.wheelApplySpellBoost(maxed("sorcerer", "exevo-vis-hur"), "exevo-vis-hur");
must(b.area === true && b.damagePct === 10, "Energy Wave: " + JSON.stringify(b));
// druid — forked grupo
const druP = maxed("druid", "__forked__");
b = wj.wheelApplySpellBoost(druP, "exevo-fur-frigo");
must(b.cooldownMs === 2000 && b.extraTarget === 1, "Forked Glacier: " + JSON.stringify(b));
b = wj.wheelApplySpellBoost(druP, "exevo-fur-tera");
must(b.extraTarget === 1, "Forked Thorns: " + JSON.stringify(b));
b = wj.wheelApplySpellBoost(druP, "exevo-tera-hur");
must(b.extraTarget === 0, "Terra Wave não pode pegar Forked");
b = wj.wheelApplySpellBoost(maxed("druid", "exura-sio"), "exura-sio");
must(b.healPct === 10, "Heal Friend: " + JSON.stringify(b));
b = wj.wheelApplySpellBoost(maxed("druid", "exevo-gran-frigo-hur"), "exevo-gran-frigo-hur");
must(b.damagePct === 6 && b.area === true, "Strong Ice Wave: " + JSON.stringify(b));
b = wj.wheelApplySpellBoost(maxed("druid", "exevo-tera-hur"), "exevo-tera-hur");
must(b.damagePct === 6.5 && b.lifeLeech === 10, "Terra Wave: " + JSON.stringify(b));
// monk
b = wj.wheelApplySpellBoost(maxed("monk", "exori-mas-amp-pug"), "exori-mas-amp-pug");
must(b.critDamage === 40 && b.cooldownMs === 4000, "Thousand Fist: " + JSON.stringify(b));
b = wj.wheelApplySpellBoost(maxed("monk", "exori-med-pug"), "exori-med-pug");
must(b.damagePct === 5 && b.extraTarget === 1, "Chained Penance: " + JSON.stringify(b));
b = wj.wheelApplySpellBoost(maxed("monk", "exura-mas-nia"), "exura-mas-nia");
must(b.healPct === 8 && b.cooldownMs === 4000, "Mass Spirit Mend: " + JSON.stringify(b));

/* Engine: mesma fonte de dados (wheeldata) + grupos mapeados */
const eb = engine.wheelApplySpellBoost(sorcP, "exori-gran-vis");
must(eb.damagePct === 50 && eb.cooldownMs === 4000, "engine Special Spells: " + JSON.stringify(eb));
const eb2 = engine.wheelApplySpellBoost(druP, "exevo-fur-frigo");
must(eb2.cooldownMs === 2000, "engine Forked: " + JSON.stringify(eb2));
const eb3 = engine.wheelApplySpellBoost(maxed("knight", "exori-gran"), "exori-gran");
must(eb3.manaFlat === 30, "engine Fierce Berserk manaFlat: " + JSON.stringify(eb3));

/* Camada de display (wheel-data.js): augs novos + monk real */
const wdata = JSON.parse(
  fs.readFileSync(path.join(root, "js/wheel-data.js"), "utf8")
    .match(/window\.WHEEL_DATA = (\{.*?\});/s)[1]);
const convNames = wdata.conviction.map(function (c) { return c.name || ""; });
for (const n of ["Augmented Shield Slam", "Augmented Divine Barrage", "Augmented Ethereal Barrage",
                 "Augmented Death Echo", "Augmented Special Spells", "Augmented Forked Spells",
                 "Augmented Thousand Fist Blows", "Augmented Chained Penance"]) {
  must(convNames.indexOf(n) !== -1, "wheel-data sem " + n);
}
for (const gone of ["Augmented Sharpshooter", "Augmented Swift Foot", "Augmented Chivalrous Challenge",
                    "Augmented Sap Strength", "Augmented Magic Shield", "Augmented Sweeping Takedown"]) {
  must(convNames.indexOf(gone) === -1, "wheel-data ainda tem aug removido " + gone);
}
const revNames = wdata.revelation.map(function (r) { return r.name || ""; });
must(revNames.indexOf("Lord of Destruction") !== -1, "sem Lord of Destruction");
must(revNames.indexOf("Drain Body") === -1, "Drain Body ainda na revelation");
must(revNames.indexOf("Ascetic") !== -1 && revNames.indexOf("Spiritual Outburst") !== -1, "revelations do monk ausentes");
must(wdata.perks.revelation.monk[0] === revNames.indexOf("Avatar of Balance"), "monk revelation[0] não é Avatar of Balance");
// druid forked: GREEN_50(idx2) + BLUE_BOTTOM_150(idx26) apontam pro Augmented Forked Spells
const forkedIdx = convNames.indexOf("Augmented Forked Spells");
must(wdata.perks.conviction.druid[2] === forkedIdx && wdata.perks.conviction.druid[26] === forkedIdx,
  "druid conviction não mapeia Forked nos slots certos");
// monk conviction tem aug real (não copia do knight)
must(wdata.perks.conviction.monk[35] === convNames.indexOf("Augmented Thousand Fist Blows"),
  "monk RED_200 não mapeia Thousand Fist");
must(wdata.perks.conviction.monk.join(",") !== wdata.perks.conviction.knight.join(","),
  "monk conviction ainda é cópia do knight");

console.log("OK: wheel OTC assets, gem atelier, fragments, augments client+server + Winter Update 2026.");
