/* Moedas → account gold (sem pouch); analyser qty + loot value NPC + profit. */
"use strict";
const fs = require("fs");
const path = require("path");
const engine = require("../server/authoritative_engine");
const analyzers = require("../game/js/analyzers");

function must(ok, msg) { if (!ok) throw new Error(msg); }

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "game", "index.html"), "utf8");
const playerSrc = fs.readFileSync(path.join(root, "game", "js", "player.js"), "utf8");
const stashSrc = fs.readFileSync(path.join(root, "game", "js", "supply-stash.js"), "utf8");
const analyzersSrc = fs.readFileSync(path.join(root, "game", "js", "analyzers.js"), "utf8");
const weapons = JSON.parse(fs.readFileSync(path.join(root, "game", "data", "weapons.json"), "utf8"));

must(html.includes("js/analyzers.js?v=hunt-analyser-death-v1") ||
  html.includes("js/analyzers.js?v=analyser-header-reset-v1"), "cache-bust analyzers");
must(html.includes("js/player.js?v=loot-coins-analyser-v1") ||
  html.includes("js/player.js?v=admin-forge-equip-v1"), "cache-bust player");
must(html.includes("js/supply-stash.js?v=loot-coins-analyser-v1"), "cache-bust supply-stash");
must(playerSrc.includes("lootNpcUnitValue") && playerSrc.includes("sessionLootValue"), "player sem lootNpcUnitValue");
must(stashSrc.includes("currencyValue(slug)"), "routeLootItem sem divert de moedas");
must(analyzersSrc.includes("otc-loot-econ") && analyzersSrc.includes("Valor do loot"), "loot analyser sem footer de economia");
must(analyzersSrc.includes("Best session damage"), "nao clobber best session damage");

must(engine.CURRENCY_GOLD["gold-coin"] === 1, "gold face");
must(engine.CURRENCY_GOLD["platinum-coin"] === 100, "platinum face");
must(engine.CURRENCY_GOLD["crystal-coin"] === 10000, "crystal face");

function player(extra) {
  return Object.assign({
    id: 1, name: "Looter", voc: "knight", level: 50,
    exp: engine.expForLevel(50), hp: 800, mp: 200, gold: 1000, ml: 10,
    accountId: 9, vipUntil: Date.now() + 86400000,
    skills: { sword: 40, axe: 10, club: 10, dist: 10, fist: 10, shield: 30 },
    equip: { weapon: { item: "sword" } }, supplies: {}, lootPouch: {}, bag: {},
    ammo: {}, kills: {}, bosses: {},
    config: { spellAttack: false, noHealthPotions: true, noManaPotions: true, autoWalk: true },
  }, extra || {});
}

/* A) creditHuntLoot: moedas → gold, pouch fica 0 */
{
  const p = player({ gold: 50, lootPouch: {} });
  const g = engine.creditHuntLoot(p, "gold-coin", 7);
  must(g && g.ok && g.currency && p.gold === 57, "gold-coin nao creditou face value");
  must(!(p.lootPouch["gold-coin"]), "gold-coin nao deveria ir pra pouch");

  const pt = engine.creditHuntLoot(p, "platinum-coin", 3);
  must(pt && pt.ok && p.gold === 57 + 300, "platinum-coin 3x100");
  must(!(p.lootPouch["platinum-coin"]), "platinum nao deveria ir pra pouch");

  const cr = engine.creditHuntLoot(p, "crystal-coin", 2);
  must(cr && cr.ok && p.gold === 57 + 300 + 20000, "crystal-coin 2x10000");
  must(!(p.lootPouch["crystal-coin"]), "crystal nao deveria ir pra pouch");
}

/* Cap cheia: moedas ainda entram */
{
  const p = player({ level: 8, voc: "none", gold: 0, lootPouch: { sword: 9999 } });
  const before = p.gold;
  const r = engine.creditHuntLoot(p, "platinum-coin", 2);
  must(r && r.ok && p.gold === before + 200, "platinum deveria ignorar cap");
  must(!(p.lootPouch["platinum-coin"]), "platinum over-cap ainda fora da pouch");
}

/* B) Preços NPC: npcSell (best buy_price Canary) e creature products */
global.GAMEDATA = { items: {} };
const dem = weapons.items["demon-shield"];
must(dem && dem.npcSell === 30000, "demon-shield npcSell Canary/Rashid-like");
global.GAMEDATA.items["demon-shield"] = Object.assign({}, dem);
global.GAMEDATA.items["giant-sword"] = Object.assign({}, weapons.items["giant-sword"]);
global.GAMEDATA.items["boots-of-haste"] = Object.assign({}, weapons.items["boots-of-haste"]);
global.GAMEDATA.items["small-sapphire"] = { n: "small sapphire", sell: 250, slot: null, s: null };
global.GAMEDATA.items["fire-mushroom"] = { n: "fire mushroom", sell: 30, slot: null };
global.GAMEDATA.items["gold-coin"] = { n: "gold coin", sell: 1 };
global.GAMEDATA.items["platinum-coin"] = { n: "platinum coin", sell: 100 };
global.GAMEDATA.items["crystal-coin"] = { n: "crystal coin", sell: 10000 };
/* equip sem npcSell → 0 */
global.GAMEDATA.items["mystery-plate"] = { n: "mystery plate", s: "armor", sell: 9999 };

must(analyzers.otcAnalyserLootUnitValue("demon-shield") === 30000, "demon-shield usa npcSell");
must(analyzers.otcAnalyserLootUnitValue("giant-sword") === 17000, "giant-sword npcSell");
must(analyzers.otcAnalyserLootUnitValue("boots-of-haste") === 30000, "boots-of-haste npcSell");
must(analyzers.otcAnalyserLootUnitValue("small-sapphire") === 250, "sapphire creature product");
must(analyzers.otcAnalyserLootUnitValue("fire-mushroom") === 30, "fire mushroom");
must(analyzers.otcAnalyserLootUnitValue("gold-coin") === 1, "gold face no analyser");
must(analyzers.otcAnalyserLootUnitValue("platinum-coin") === 100, "plat face");
must(analyzers.otcAnalyserLootUnitValue("crystal-coin") === 10000, "crystal face");
must(analyzers.otcAnalyserLootUnitValue("mystery-plate") === 0, "equip sem npcSell = 0");

const lootMap = {
  "gold-coin": 10,
  "platinum-coin": 2,
  "crystal-coin": 1,
  "demon-shield": 1,
  "small-sapphire": 4,
  "mystery-plate": 3,
};
const lootValue = analyzers.otcAnalyserSessionLootValue(lootMap);
const expected = 10 * 1 + 2 * 100 + 1 * 10000 + 30000 + 4 * 250 + 0;
must(lootValue === expected, "session loot value errado: " + lootValue + " != " + expected);

/* C) Footer HTML do loot analyser */
const combat = {
  huntId: "rats",
  stats: {
    startedAt: Date.now() - 60000,
    gold: expected,
    loot: lootMap,
    supplyUsed: { "health-potion": 3 },
    supplyCost: 135,
  },
};
const htmlLoot = analyzers.otcAnalyserBody("loot", combat);
must(htmlLoot.includes("Valor do loot"), "footer valor");
must(htmlLoot.includes("Supply gasto"), "footer supply");
must(htmlLoot.includes("Profit"), "footer profit");
must(htmlLoot.includes("otc-loot-econ"), "classe otc-loot-econ");
must(htmlLoot.includes("gold coin") || htmlLoot.includes("gold-coin") || htmlLoot.includes("Gold"), "lista deve mencionar gold");
/* quantidades no analyser */
must(htmlLoot.includes(">10<") || htmlLoot.includes("×10") || /strong>10</.test(htmlLoot), "qty gold no analyser");

const profit = expected - 135;
must(htmlLoot.includes(String(profit).replace(/\B(?=(\d{3})+(?!\d))/g, ".")) ||
  htmlLoot.includes(String(profit)) ||
  htmlLoot.includes((profit).toLocaleString("pt-BR")),
  "profit numerico no HTML");

console.log("OK: coins→account gold, analyser qty, NPC loot value + profit.");
