"use strict";
/* test_supply_items.js — supplies como itens reais (CARGAS removido).
 * Cobre:
 *   - ITEMS do engine com sell = preço de compra do NPC (autoseller paga o
 *     mesmo valor que o NPC cobra: ultimate-spirit 488, supreme-health 625)
 *   - loot de supply cai na lootPouch (não num contador) → vendível
 *   - sellAuthPouchItem/sellAuthAllPouch pagam o preço NPC
 *   - consumo no engine: legado supplies → bag → pouch; estoque 0 compra a
 *     unidade no uso (gold direto, sem criar item)
 *   - consumo no cliente (combat.js): mesma ordem + auto-compra no uso
 *   - migração normalizePlayer: cargas antigas viram itens na bag,
 *     mana-fluid→mana-potion, slug desconhecido é descartado
 * Uso: node tools/test_supply_items.js
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const root = path.join(__dirname, "..");
const engine = require(path.join(root, "server", "authoritative_engine.js"));

let passed = 0, failed = 0;
function check(cond, label, extra) {
  if (cond) { passed++; console.log("  ok:", label); }
  else { failed++; console.log("  FALHOU:", label, extra !== undefined ? JSON.stringify(extra).slice(0, 400) : ""); }
}

/* ---------- 1. sell = preço NPC no engine (autoseller) ---------- */
console.log("\n[1] ITEMS do engine: sell = buy do NPC");
for (const [slug, price] of [
  ["ultimate-spirit-potion", 488], ["supreme-health-potion", 625],
  ["health-potion", 45], ["mana-potion", 50],
  ["ultimate-mana-potion", 438], ["sudden-death-rune", 162],
  ["avalanche-rune", 57], ["ultimate-healing-rune", 175],
]) {
  const it = engine.ITEMS[slug];
  check(it && it.sell === price && it.buy === price, `${slug}: sell=buy=${price}`, it);
}
check(!engine.ITEMS["paralyze-rune"] || engine.ITEMS["paralyze-rune"].sell !== 700,
  "runa de suporte fora da tabela não ganha sell inflado", engine.ITEMS["paralyze-rune"]);

/* ---------- 2. loot de supply → lootPouch ---------- */
console.log("\n[2] creditHuntLoot: supply drop → pouch");
{
  const p = { id: "t", level: 130, voc: "paladin", gold: 0, cap: 50000,
    bag: {}, lootPouch: {}, supplies: {}, equip: {}, itemInstances: [],
    config: {}, skills: {} };
  const r = engine.creditHuntLoot(p, "ultimate-spirit-potion", 5);
  check(r.ok && !r.discarded, "drop de potion aceito", r);
  check(p.lootPouch["ultimate-spirit-potion"] === 5, "5 unidades na pouch", p.lootPouch);
  check(!p.supplies["ultimate-spirit-potion"], "nenhum contador de carga criado", p.supplies);
  const g = engine.sellAuthPouchItem(p, "ultimate-spirit-potion");
  check(g === 5 * 488, `sellAuthPouchItem paga 488/unid (=${5 * 488})`, g);
}

/* ---------- 3. sellAll da pouch paga preço NPC ---------- */
console.log("\n[3] sellAuthAllPouch com supplies");
{
  const p = { gold: 0, lootPouch: { "supreme-health-potion": 3, "avalanche-rune": 10 }, bag: {}, itemInstances: [] };
  const g = engine.sellAuthAllPouch(p);
  check(g === 3 * 625 + 10 * 57, `total ${3 * 625 + 10 * 57}`, g);
  check(p.gold === g && Object.keys(p.lootPouch).length === 0, "gold creditado e pouch limpa", p);
}

/* ---------- 4. consumo no engine: supplies→bag→pouch + autobuy ---------- */
console.log("\n[4] usePotion/consumeSupply: ordem e auto-compra");
function mkPlayer(extra) {
  return Object.assign({ id: "t", name: "T", voc: "knight", level: 130,
    exp: 0, hp: 10, mp: 10, gold: 0, bag: {}, lootPouch: {}, supplies: {},
    itemInstances: [], equip: {}, cap: 50000,
    skills: { fist: 10, sword: 10, axe: 10, club: 10, dist: 10, shield: 10 },
    config: { healSupply: "health-potion", healItemAt: 90, manaAt: 0 } }, extra);
}
function mkAuth(p) {
  return { clock: Date.now(), events: [], kind: "hunt",
    players: [{ p, id: "t", x: 5, y: 5 }],
    stats: { supplyUsed: {}, supplyBought: {}, supplyCost: 0 } };
}
{
  // legado p.supplies primeiro
  const p = mkPlayer({ supplies: { "health-potion": 2 }, bag: { "health-potion": 3 } });
  const a = mkAuth(p);
  check(engine.usePotion(a, p) && p.supplies["health-potion"] === 1 && p.bag["health-potion"] === 3,
    "consome do contador legado antes da bag", p);
  p.hp = 10; p._potionCd = 0; a.clock += 2000;
  check(engine.usePotion(a, p) && !p.supplies["health-potion"] && p.bag["health-potion"] === 3,
    "esgota o legado antes de tocar na bag", p);
  // depois a bag
  p.hp = 10; p._potionCd = 0; a.clock += 2000;
  check(engine.usePotion(a, p) && p.bag["health-potion"] === 2,
    "sem legado, consome da bag", p.bag);
}
{
  // depois a pouch
  const p = mkPlayer({ lootPouch: { "health-potion": 4 } });
  const a = mkAuth(p);
  check(engine.usePotion(a, p) && p.lootPouch["health-potion"] === 3,
    "sem bag, consome da pouch", p.lootPouch);
}
{
  // estoque 0 → compra a unidade no uso (gold, sem criar item)
  const p = mkPlayer({ gold: 200 });
  const a = mkAuth(p);
  check(engine.usePotion(a, p), "autobuy com gold suficiente funciona", p);
  check(p.gold === 200 - 45, "debita o preço NPC (45)", p.gold);
  check(!p.bag["health-potion"] && !p.lootPouch["health-potion"],
    "unidade comprada é gasta na hora (não vira item)", p);
  check(a.stats.supplyBought["health-potion"] === 1, "stats.supplyBought registra", a.stats);
}
{
  // sem seleção no Helper → sem autobuy
  const p = mkPlayer({ gold: 200, config: { healItemAt: 90, manaAt: 0 } });
  const a = mkAuth(p);
  check(engine.usePotion(a, p) === false && p.gold === 200,
    "sem potion selecionada não compra nem bebe", p);
}

/* ---------- 5. cliente: supplyStockCount/consumeSupplyCharge ---------- */
console.log("\n[5] combat.js: estoque e consumo no cliente");
{
  const src = fs.readFileSync(path.join(root, "game", "js", "combat.js"), "utf8");
  const grab = (name) => {
    const i = src.indexOf(`function ${name}(`);
    if (i < 0) throw new Error(name + " ausente");
    let d = 0, j = src.indexOf("{", i);
    for (let k = j; k < src.length; k++) {
      if (src[k] === "{") d++; else if (src[k] === "}" && !--d) return src.slice(i, k + 1);
    }
    throw new Error(name + " sem fechamento");
  };
  const sandbox = {
    SUPPLIES: { "health-potion": { name: "Health Potion", lvl: 1, type: "heal", vocs: [] } },
    supplyPrice: () => 45,
    spendGold: (p, n) => (p.gold >= n ? (p.gold -= n, true) : false),
  };
  vm.createContext(sandbox);
  for (const fn of ["supplyStockCount", "consumeSupplyUnit", "supplyStockSlugs",
                    "hasSelectedSupply", "canRechargeSupply", "consumeSupplyCharge"])
    vm.runInContext(grab(fn), sandbox);
  const r = (code) => vm.runInContext(code, sandbox);
  const p = { level: 50, gold: 100, bag: { "health-potion": 2 },
    lootPouch: { "health-potion": 3 }, supplies: { "health-potion": 1 },
    config: { healSupply: "health-potion" } };
  check(r("supplyStockCount") (p, "health-potion") === 6, "stock = supplies+bag+pouch (6)", p);
  const c = { stats: { supplyUsed: {}, supplyBought: {}, supplyCost: 0 }, events: [] };
  r("consumeSupplyCharge")(c, p, "health-potion");
  check(!p.supplies["health-potion"] && p.bag["health-potion"] === 2,
    "cliente consome legado primeiro", p);
  r("consumeSupplyCharge")(c, p, "health-potion");
  check(p.bag["health-potion"] === 1 && p.lootPouch["health-potion"] === 3,
    "depois a bag", p);
  p.bag = {}; r("consumeSupplyCharge")(c, p, "health-potion");
  check(p.lootPouch["health-potion"] === 2, "depois a pouch", p.lootPouch);
  p.lootPouch = {};
  check(r("consumeSupplyCharge")(c, p, "health-potion") && p.gold === 55,
    "estoque 0 → compra a unidade no uso (45g)", p);
  check(c.stats.supplyBought["health-potion"] === 1, "supplyBought registrado", c.stats);
  p.config.healSupply = "";
  check(r("consumeSupplyCharge")(c, p, "health-potion") === false && p.gold === 55,
    "sem seleção não compra", p);
}

/* ---------- 6. migração normalizePlayer ---------- */
console.log("\n[6] normalizePlayer: cargas antigas → itens na bag");
{
  const src = fs.readFileSync(path.join(root, "game", "js", "game.js"), "utf8");
  const i = src.indexOf("function normalizePlayer(");
  let d = 0, end = -1;
  for (let k = src.indexOf("{", i); k < src.length; k++) {
    if (src[k] === "{") d++; else if (src[k] === "}" && !--d) { end = k + 1; break; }
  }
  const sandbox = {
    GAMEDATA: { items: { "health-potion": {}, "mana-potion": {}, "ultimate-spirit-potion": {} } },
    SUPPLIES: { "health-potion": {}, "mana-potion": {} },
    FULL_STAMINA_SECONDS: 15 * 3600,
    migrateAmmoToCounter: () => {}, ensureOutfit: () => {},
    grantMissingStarterItems: () => {},
  };
  vm.createContext(sandbox);
  vm.runInContext(src.slice(i, end), sandbox);
  const p = { name: "Old", voc: "knight", level: 50, gold: 0,
    supplies: { "health-potion": 20, "mana-fluid": 5, "lixo-antigo": 3 },
    bag: { sword: 1 }, config: { manaSupply: "mana-fluid" } };
  const out = vm.runInContext("normalizePlayer", sandbox)(p);
  check(out.bag["health-potion"] === 20, "20 cargas → 20 potions na bag", out.bag);
  check(out.bag["mana-potion"] === 5, "mana-fluid → mana-potion", out.bag);
  check(!out.bag["lixo-antigo"], "slug desconhecido descartado", out.bag);
  check(out.supplies === undefined, "p.supplies removido", out);
  check(out.config.manaSupply === "mana-potion", "config.manaSupply migrada", out.config);
}

console.log(`\n${passed} ok, ${failed} falharam`);
process.exit(failed ? 1 : 0);
