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
must(html.includes("js/wheel-gems.js?v=wheel-otc-v1"), "index sem wheel-gems cache-bust");
must(html.includes("css/wheel-otc.css?v=wheel-otc-v1"), "index sem wheel-otc.css cache-bust");
must(html.includes("js/wheel.js?v=wheel-otc-v1"), "index sem wheel.js cache-bust");

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
must(css.includes("wheel-largebonus") && css.includes("background-size: contain"),
  "CSS sem overlays/bordas oficiais");

console.log("OK: wheel OTC assets, gem atelier, fragments, augments client+server.");
