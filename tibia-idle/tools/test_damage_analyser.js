/* Damage / Damage Taken analysers: por personagem + por elemento, /h, sem EXP.
 * Best session damage: soma dual, crit/onslaught, classificação, reset. */
"use strict";
const fs = require("fs");
const path = require("path");
const game = path.join(__dirname, "..", "game");
const analyzers = require(path.join(game, "js", "analyzers.js"));

function must(ok, msg) { if (!ok) throw Error(msg); }

const html = fs.readFileSync(path.join(game, "index.html"), "utf8");
const src = fs.readFileSync(path.join(game, "js", "analyzers.js"), "utf8");
const gameSrc = fs.readFileSync(path.join(game, "js", "game.js"), "utf8");
const css = fs.readFileSync(path.join(game, "css", "layout.css"), "utf8");

must(html.includes("js/analyzers.js?v=hunt-analyser-death-v1") ||
  html.includes("js/analyzers.js?v=analyser-header-reset-v1"), "analyzers.js sem cache-bust header reset");
must(html.includes("css/layout.css?v=hunt-analyser-death-v1") ||
  html.includes("css/layout.css?v=analyser-header-reset-v1"), "layout.css sem cache-bust header reset");
must(html.includes('data-otc-session-reset'), "botão reset no header do painel");
must(/otc-live-badge[\s\S]*?data-otc-session-reset[\s\S]*?data-collapse="analysers"/.test(html) ||
  /otc-live-badge[\s\S]*?otc-analyser-session-reset/.test(html),
  "LIVE antes do reset no header");
must(gameSrc.includes("otcAnalyserIngestEvents"), "drainEvents não alimenta o damage analyser");
must(css.includes("otc-dmg-best"), "CSS do best session damage ausente");
must(css.includes("otc-loot-econ"), "CSS do loot economy ausente");
must(css.includes("otc-session-reset"), "CSS do reset no header");

must(!analyzers.OTC_ANALYSERS.some((e) => e.id === "xp"), "aba EXP ainda presente");
must(analyzers.OTC_ANALYSERS.some((e) => e.id === "damage"), "aba Damage ausente");
must(analyzers.OTC_ANALYSERS.some((e) => e.id === "taken"), "aba Damage Taken ausente");
must(analyzers.OTC_ANALYSERS.some((e) => e.id === "loot") && analyzers.OTC_ANALYSERS.some((e) => e.id === "supply"),
  "Loot/Supply devem permanecer");

must(analyzers.otcAnalyserNormalizeElement("frost") === "ice", "frost deve virar ice");
must(analyzers.otcAnalyserVocAbbr("druid") === "ED", "vocação ED");
must(analyzers.otcAnalyserVocAbbr("knight") === "EK", "vocação EK");
must(Math.round(analyzers.otcAnalyserRate(3600, 3600000)) === 3600, "rate deve ser /h");

const combat = {
  player: { id: "1", name: "Druidero", voc: "druid", p: { id: "1", name: "Druidero", voc: "druid" } },
  players: [
    { id: "1", name: "Druidero", voc: "druid", p: { id: "1", name: "Druidero", voc: "druid" } },
    { id: "2", name: "Kina", voc: "knight", p: { id: "2", name: "Kina", voc: "knight" } },
  ],
  stats: { startedAt: Date.now() - 3600000, damage: 0, taken: 0 },
};

analyzers.otcAnalyserIngestEvents([
  { t: "hit", dmg: 1000, el: "earth", whoId: "1" },
  { t: "hit", dmg: 500, el: "frost", whoId: "1" },
  { t: "hit", dmg: 2000, el: "physical", whoId: "2" },
  { t: "taken", dmg: 300, el: "fire", targetId: "2" },
  { t: "taken", dmg: 100, el: "physical", targetId: "1" },
], combat);

const dealt = combat.stats.damageTrack.byPlayer;
must(dealt["1"].total === 1500, "dano do ED agrega earth+ice");
must(dealt["1"].byElement.earth === 1000, "earth do ED");
must(dealt["1"].byElement.ice === 500, "frost→ice do ED");
must(dealt["2"].total === 2000, "dano do EK");
must(dealt["2"].byElement.physical === 2000, "physical do EK");

const taken = combat.stats.takenTrack.byPlayer;
must(taken["1"].total === 100 && taken["1"].byElement.physical === 100, "taken do ED");
must(taken["2"].total === 300 && taken["2"].byElement.fire === 300, "taken do EK");

const htmlDealt = analyzers.otcAnalyserDamageBody("damage", combat);
must(htmlDealt.includes("Druidero - ED"), "label Nome - VOC no damage");
must(htmlDealt.includes("Kina - EK"), "label do EK no damage");
must(htmlDealt.includes("/h -"), "taxa deve ser /h e não /s");
must(!htmlDealt.includes("/s -"), "não deve usar /s como Baiak");
must(htmlDealt.includes("otc-dmg-els"), "breakdown elemental por personagem");
must((htmlDealt.match(/otc-dmg-char/g) || []).length >= 2, "uma seção por personagem");
must(htmlDealt.includes("Best session damage"), "rodapé best session damage");
must(combat.stats.damageTrack.bestHit && combat.stats.damageTrack.bestHit.total === 2000,
  "best hit da sessão é o 2000 do EK");
must(htmlDealt.includes("Kina"), "best hit deve citar o personagem do maior golpe");
must(htmlDealt.includes("ataque básico"), "hit sem spell/rune = ataque básico");
must(htmlDealt.includes(analyzers.otcAnalyserNumber(2000)), "UI mostra o valor formatado do best");

const htmlTaken = analyzers.otcAnalyserDamageBody("taken", combat);
must(htmlTaken.includes("Druidero - ED"), "label Nome - VOC no taken");
must(htmlTaken.includes("Session"), "session timer no taken");
must(!htmlTaken.includes("data-otc-dmg-reset"), "reset saiu do corpo; fica no header LIVE|↻|–");
must(!htmlTaken.includes("Best session damage"), "best hit só na aba Damage");
must(src.includes("otcAnalyserResetSession"), "reset de sessão no header do painel");

must(src.includes('id: "damage"') && src.includes('id: "taken"'), "IDs damage/taken no fonte");
must(!/\{\s*id:\s*"xp"/.test(src), "fonte ainda declara aba xp");

/* --- Best session damage: dual / crit / fatal / tipos / reset --- */
global.SPELLDATA = {
  "exori-gran-ico": { id: "exori-gran-ico", name: "Annihilation", words: "exori gran ico" },
};

const bestCombat = {
  player: { id: "2", name: "Kina", voc: "knight", p: { id: "2", name: "Kina", voc: "knight" } },
  players: [
    { id: "2", name: "Kina", voc: "knight", p: { id: "2", name: "Kina", voc: "knight" } },
  ],
  stats: { startedAt: Date.now(), damage: 0, taken: 0 },
};

analyzers.otcAnalyserIngestEvents([
  { t: "hit", dmg: 540, el: "physical", whoId: "2", targetId: "m1",
    spell: "Annihilation", spellId: "exori-gran-ico", crit: true, fatal: true, ts: 100 },
  { t: "hit", dmg: 1000, el: "ice", whoId: "2", targetId: "m1", dual: 1,
    spell: "Annihilation", spellId: "exori-gran-ico", crit: true, fatal: true, ts: 100 },
  { t: "hit", dmg: 900, el: "death", whoId: "2", targetId: "m2",
    rune: "Sudden Death Rune", crit: true, ts: 200 },
], bestCombat);

const best = bestCombat.stats.damageTrack.bestHit;
must(best, "bestHit deve existir");
must(best.total === 1540, "dual phys+ice soma para o best (não 1000 nem 540)");
must(best.el === "ice", "headline elemental do dual híbrido");
must(best.crit === true, "crit registrado no best");
must(best.fatal === true, "fatal/onslaught registrado no best");
must(best.hitType === "exori gran ico", "tipo usa words da spell");
must(best.parts && best.parts.length === 2, "breakdown dual com 2 partes");

const bestHtml = analyzers.otcAnalyserDamageBody("damage", bestCombat);
must(bestHtml.includes(analyzers.otcAnalyserNumber(1540)), "UI mostra total combinado");
must(bestHtml.includes(analyzers.otcAnalyserNumber(540)) && bestHtml.includes(analyzers.otcAnalyserNumber(1000)),
  "UI mostra breakdown fisico+ice");
must(bestHtml.includes("fisico"), "breakdown usa rótulo fisico");
must(bestHtml.includes("Critical"), "badge Critical");
must(bestHtml.includes("Onslaught"), "badge Onslaught (fatal)");
must(bestHtml.includes("exori gran ico"), "UI mostra words da spell");

must(analyzers.otcAnalyserHitTypeLabel({ rune: "Sudden Death Rune" }) === "SD", "SD classification");
must(analyzers.otcAnalyserHitTypeLabel({}) === "ataque básico", "basic classification");
must(analyzers.otcAnalyserHitTypeLabel({ spellId: "exori-gran-ico" }) === "exori gran ico",
  "spellId resolve words");

/* Dual em lotes separados (phys num drain, dual no próximo) */
const splitCombat = {
  player: { id: "2", name: "Kina", voc: "knight", p: { id: "2", name: "Kina", voc: "knight" } },
  players: [{ id: "2", name: "Kina", voc: "knight", p: { id: "2", name: "Kina", voc: "knight" } }],
  stats: { startedAt: Date.now(), damage: 0, taken: 0 },
};
analyzers.otcAnalyserIngestEvents([
  { t: "hit", dmg: 400, el: "physical", whoId: "2", targetId: "m9", ts: 50 },
], splitCombat);
must(splitCombat.stats.damageTrack.bestHit.total === 400, "pending phys entra provisoriamente");
analyzers.otcAnalyserIngestEvents([
  { t: "hit", dmg: 800, el: "fire", whoId: "2", targetId: "m9", dual: 1, ts: 50 },
], splitCombat);
must(splitCombat.stats.damageTrack.bestHit.total === 1200, "dual cross-batch soma");

/* Reset limpa best */
global.G = { combat: splitCombat };
analyzers.otcAnalyserResetTrack("damage");
const resetHtml = analyzers.otcAnalyserDamageBody("damage", splitCombat);
must(resetHtml.includes("Best session damage"), "rodapé permanece após reset");
must(resetHtml.includes("—"), "best vazio mostra traço");
must(!splitCombat.stats.damageTrack.bestHit, "reset remove bestHit");
must(!resetHtml.includes("data-otc-dmg-reset"), "reset não fica mais no corpo do damage");

console.log("OK: damage/taken + best session damage (dual/crit/onslaught/tipos/reset).");
