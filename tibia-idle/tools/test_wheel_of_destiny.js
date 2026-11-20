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
must(html.includes("js/wheeldata.js?v=wheel-seq-v1"), "index sem wheeldata cache-bust");
must(html.includes("js/wheel-gems.js?v=wheel-otc-v2"), "index sem wheel-gems cache-bust v2");
must(html.includes("js/wheel.js?v=wheel-active-v1"), "index sem wheel.js cache-bust");
must(html.includes("js/wheel-ui.js?v=wod-save-v1"), "index sem wheel-ui cache-bust wod-save");
must(html.includes("css/wheel-otc.css?v=wod-modal-v1"), "index sem wheel-otc.css cache-bust wod-modal");
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

console.log("OK: wheel OTC assets, gem atelier, fragments, augments client+server.");
