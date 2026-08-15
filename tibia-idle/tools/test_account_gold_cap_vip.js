/* Conta compartilhada de gold, cap no loot, VIP (autosell + walk manual). */
"use strict";
const fs = require("fs");
const path = require("path");
const engine = require("../server/authoritative_engine");

function must(ok, msg) { if (!ok) throw new Error(msg); }

const root = path.join(__dirname, "..");
const dbSrc = fs.readFileSync(path.join(root, "server", "db.js"), "utf8");
const srvSrc = fs.readFileSync(path.join(root, "server", "server.js"), "utf8");
const vipSrc = fs.readFileSync(path.join(root, "game", "js", "vip.js"), "utf8");
const playerSrc = fs.readFileSync(path.join(root, "game", "js", "player.js"), "utf8");
const uiSrc = fs.readFileSync(path.join(root, "game", "js", "ui.js"), "utf8");
const html = fs.readFileSync(path.join(root, "game", "index.html"), "utf8");

must(dbSrc.includes("migrateAccountGold") && dbSrc.includes("gold_migrated"),
  "db sem migrateAccountGold");
must(dbSrc.includes("vip_until") && srvSrc.includes("accountPublicView"),
  "VIP/account gold API ausente");
must(srvSrc.includes("ensureAccountWallet") && srvSrc.includes("canonical.gold"),
  "prepareInstanceState não injeta account gold");
must(vipSrc.includes("vipAutoSellAllowed") && vipSrc.includes("vipManualControlAllowed") &&
  vipSrc.includes("syncVipFromAccount"), "vip.js sem gates/sync");
must(playerSrc.includes("freeCapacity") && playerSrc.includes("supplyStash") &&
  playerSrc.includes("vipManualControlAllowed"), "player.js sem cap/VIP walk");
must(uiSrc.includes("vipAutoSellAllowed") && (uiSrc.includes("Exclusivo VIP") || uiSrc.includes("(VIP)")),
  "UI autoseller sem gate VIP");
must(html.includes("vip.js?v=account-gold-cap-vip-v1") &&
  (html.includes("player.js?v=cap-loot-fix-v1") ||
   html.includes("player.js?v=account-gold-cap-vip-v1") ||
   html.includes("player.js?v=loot-coins-analyser-v1")),
  "cache-bust account-gold-cap-vip ausente");
must(playerSrc.includes("ensurePlayerCapacity") && playerSrc.includes("DEFAULT_PLAYER_CAP"),
  "player.js sem ensurePlayerCapacity");
must(!/addMap\(p\.supplies\)/.test(playerSrc) && !/addMap\(p\.ammo\)/.test(playerSrc),
  "carriedWeight não deve pesar supplies/ammo");

function player(id, extra) {
  return Object.assign({
    id: id || 1, name: "Kina" + String(id || 1), voc: "knight", level: 50,
    exp: engine.expForLevel(50), hp: 800, mp: 200, gold: 1000, ml: 10,
    accountId: 1, vipUntil: Date.now() + 86400000,
    skills: { sword: 40, axe: 10, club: 10, dist: 10, fist: 10, shield: 30 },
    equip: { weapon: { item: "sword" } }, supplies: {}, lootPouch: {}, bag: {},
    ammo: {}, kills: {}, bosses: {},
    config: { spellAttack: false, noHealthPotions: true, noManaPotions: true, autoWalk: true },
  }, extra || {});
}
function desc(members) {
  const list = Array.isArray(members) ? members : [members];
  return {
    v: 1, savedAt: 1000, kind: "hunt", huntId: "rats", instanceMode: "non-pvp",
    activeCharacterId: String(list[0].id),
    members: list.map((p) => ({ id: String(p.id), accountId: p.accountId, p: JSON.parse(JSON.stringify(p)) })),
    state: {
      gridW: 30, gridH: 30,
      players: list.map((p, i) => ({
        id: String(p.id), p: JSON.parse(JSON.stringify(p)),
        cx: 10 + i, cy: 10, x: (10.5 + i) / 30, y: 10.5 / 30,
      })),
      mobs: [{ id: "rat-1", slug: "rat", hp: 1, maxHp: 1, damage: 0, cx: 20, cy: 20, x: 20.5 / 30, y: 20.5 / 30 }],
      events: [],
    },
  };
}

/* A) Gold compartilhado entre chars da mesma conta */
{
  const a = player(1, { gold: 5000, accountId: 7 });
  const b = player(2, { gold: 5000, accountId: 7, name: "Pally" });
  const start = engine.initializeAuthority(desc([a, b]), "a".repeat(64), 1000);
  start.authority.players[0].p.gold -= 1500;
  must(start.authority.players[1].p.gold === 3500,
    "gasto no char A não refletiu no char B (wallet compartilhada)");
  start.authority.players[1].p.gold += 200;
  must(start.authority.players[0].p.gold === 3700,
    "ganho no char B não refletiu no char A");
}

/* Contas diferentes não misturam gold */
{
  const a = player(1, { gold: 1000, accountId: 1 });
  const b = player(2, { gold: 9000, accountId: 2, name: "Other" });
  const start = engine.initializeAuthority(desc([a, b]), "b".repeat(64), 1000);
  start.authority.players[0].p.gold -= 100;
  must(start.authority.players[0].p.gold === 900, "conta 1 gold errado");
  must(start.authority.players[1].p.gold === 9000, "conta 2 não deveria mudar");
}

/* B) Cap: item pesado demais é descartado */
{
  const heavy = Object.keys(engine.ITEMS).find((slug) => {
    const it = engine.ITEMS[slug];
    return it && Number(it.w) > 50 && !engine.ITEMS[slug].s;
  }) || "dragon-scale-mail";
  const p = player(1, { level: 8, voc: "none", gold: 0, lootPouch: {}, bag: {}, supplies: {}, ammo: {} });
  // Enche a cap com lixo
  const unit = engine.itemUnitWeight(heavy);
  const max = engine.maxStats(p).cap;
  const fill = Math.max(1, Math.floor(max / Math.max(0.1, unit)) + 2);
  p.lootPouch[heavy] = fill;
  must(engine.freeCapacity(p) < unit, "setup cap deveria estar cheio");
  const r = engine.creditHuntLoot(p, heavy, 1);
  must(r && r.discarded === true, "loot over-cap deveria ser discarded");
}

/* Cap: gold coin sempre entra */
{
  const p = player(1, { level: 8, voc: "none", gold: 10, lootPouch: { sword: 9999 } });
  const before = p.gold;
  const r = engine.creditHuntLoot(p, "gold-coin", 5);
  must(r && r.ok && p.gold === before + 5, "gold-coin deveria ignorar cap");
}

/* Cap: supplies/ammo não pesam — stock de potions não bloqueia loot */
{
  const p = player(1, {
    level: 50, voc: "knight", gold: 0, lootPouch: {}, bag: {},
    supplies: { "ultimate-health-potion": 5000 },
    ammo: { "earth-arrow": 20000 },
  });
  must(engine.freeCapacity(p) > 100, "supplies/ammo não deveriam zerar CAP");
  const r = engine.creditHuntLoot(p, "sword", 1);
  must(r && r.ok && (p.lootPouch.sword || 0) === 1, "loot deveria entrar com stock de potions");
}

/* C) Autosell VIP */
{
  const p = player(1, {
    vipUntil: 0,
    lootPouch: { "leather-armor": 2 },
    config: { pouchAutoSell: true, pouchAutoSellPct: 10, autoWalk: true },
  });
  // leather-armor precisa ter sell
  if (engine.ITEMS["leather-armor"]) engine.ITEMS["leather-armor"].sell = engine.ITEMS["leather-armor"].sell || 12;
  const start = engine.initializeAuthority(desc(p), "c".repeat(64), 1000);
  for (const mob of start.authority.mobs || []) { mob.damage = 0; mob.attackAcc = -100000; }
  const after = JSON.parse(engine.advanceAuthorityState(JSON.stringify(start), 2000, 3000).state);
  const ent = after.authority.players[0];
  must(ent.p.config.pouchAutoSell === false, "sem VIP autosell deveria desligar");
}
{
  const p = player(1, {
    vipUntil: Date.now() + 86400000,
    gold: 0,
    lootPouch: {},
    config: { pouchAutoSell: true, pouchAutoSellPct: 1, autoWalk: true },
  });
  // Preenche slots suficientes
  for (let i = 0; i < 20; i++) {
    const slug = "loot-test-" + i;
    engine.ITEMS[slug] = { n: slug, sell: 10, w: 0.1, cls: 1 };
    p.lootPouch[slug] = 1;
  }
  const start = engine.initializeAuthority(desc(p), "d".repeat(64), 1000);
  for (const mob of start.authority.mobs || []) { mob.damage = 0; mob.attackAcc = -100000; }
  const gold0 = start.authority.players[0].p.gold;
  const after = JSON.parse(engine.advanceAuthorityState(JSON.stringify(start), 2000, 3000).state);
  must(after.authority.players[0].p.gold > gold0, "VIP autosell deveria vender");
}

/* C) Walk manual VIP */
{
  const p = player(1, { vipUntil: 0, config: { autoWalk: false } });
  const start = engine.initializeAuthority(desc(p), "e".repeat(64), 1000);
  for (const mob of start.authority.mobs || []) { mob.damage = 0; mob.attackAcc = -100000; }
  start.authority.players[0].p.config.autoWalk = false;
  start.authority.players[0].walkIntent = { dx: 1, dy: 0 };
  start.authority.players[0].walkAcc = 1000;
  const cx0 = start.authority.players[0].cx;
  const after = JSON.parse(engine.advanceAuthorityState(JSON.stringify(start), 200, 1200, {
    players: [{ id: "1", cx: cx0, cy: 10, x: (cx0 + 0.5) / 30, y: 10.5 / 30, autoWalk: false, walkIntent: { dx: 1, dy: 0 } }],
    mobs: [],
  }).state);
  must(after.authority.players[0].cx === cx0, "sem VIP walkIntent não deveria andar");
  must(after.authority.players[0].p.config.autoWalk !== false, "sem VIP deveria forçar AUTO");
}
{
  const p = player(1, { vipUntil: Date.now() + 86400000, config: { autoWalk: false } });
  const start = engine.initializeAuthority(desc(p), "f".repeat(64), 1000);
  for (const mob of start.authority.mobs || []) { mob.damage = 0; mob.attackAcc = -100000; }
  start.authority.players[0].p.config.autoWalk = false;
  start.authority.players[0].walkIntent = { dx: 1, dy: 0 };
  start.authority.players[0].walkAcc = 1000;
  const after = JSON.parse(engine.advanceAuthorityState(JSON.stringify(start), 200, 1200).state);
  must(after.authority.players[0].cx === 11, "VIP + walkIntent deveria andar 1 SQM");
}

console.log("OK: account gold, cap discard, VIP autosell/walk.");
