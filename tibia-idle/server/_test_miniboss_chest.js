/* E2E: mini boss de hunt (falcon) morto -> loot vai ao Reward Chest (bundle
 * próprio por morte), NADA na loot pouch, kill não encerra a hunt. */
"use strict";
const engine = require("../server/authoritative_engine");

let fails = 0;
const must = (ok, msg) => { if (!ok) { fails++; console.log("  ✘ " + msg); } else console.log("  ✔ " + msg); };

const p = {
  id: 1, name: "FalconTester", voc: "knight", level: 800, exp: engine.expForLevel(800),
  hp: 10_000_000, mp: 1000, gold: 0,
  skills: { sword: 130, axe: 10, club: 10, dist: 10, fist: 10, shield: 120 },
  ml: 20, equip: { weapon: { item: "sword" } }, supplies: {}, lootPouch: {},
  kills: {}, bosses: {}, config: {}, rewardChest: {}, rewardChestBundles: [],
  dust: 0, dustLimit: 100, slivers: 0, exaltedCores: 0,
};
const W = 30;
const desc = {
  v: 1, savedAt: 1000, kind: "hunt", huntId: "falcon-bastion", bossId: null,
  instanceMode: "non-pvp", activeCharacterId: "1",
  members: [{ id: "1", p: JSON.parse(JSON.stringify(p)) }],
  state: {
    players: [{ id: "1", p, cx: 16, cy: 15, x: 16.5 / W, y: 15.5 / W }],
    mobs: [{ id: "mb-1", slug: "grand-chaplain-gaunder", boss: true, cx: 15, cy: 15, x: 15.5 / W, y: 15.5 / W }],
    events: [], gridW: W, gridH: W,
  },
};
let auth = engine.initializeAuthority(desc, "a".repeat(64), 1000);
/* hp 1: mini boss morre no primeiro golpe */
auth.authority.mobs[0].hp = 1; auth.authority.mobs[0].maxHp = engine.MONSTERS["grand-chaplain-gaunder"].hp;
let clock = 1000, out = null;
for (let t = 0; t < 20_000; t += 1000) {
  out = engine.advanceAuthorityState(JSON.stringify(auth), 1000, clock + 1000);
  auth = JSON.parse(out.state); clock += 1000;
  const it = auth.authority.players[0];
  it.p.hp = engine.maxStats(it.p).hp; it.p.mp = engine.maxStats(it.p).mp; it.downUntil = 0;
  if (auth.authority.stats.kills > 0) break;
}
const leader = auth.authority.players[0].p;
const bundles = leader.rewardChestBundles || [];
const chest = leader.rewardChest || {};
console.log("kills:", auth.authority.stats.kills, "| terminal:", out.terminalReason);
must(auth.authority.stats.kills >= 1, "mini boss morreu");
must(out.terminalReason === null, "hunt NÃO encerra com morte de mini boss (continua caçando)");
must(bundles.length === 1, "1 bundle próprio criado no reward chest (achou " + bundles.length + ")");
if (bundles[0]) {
  must(String(bundles[0].sprite || "").includes("gaunder"), "bundle nomeado pelo mini boss (" + bundles[0].name + " / " + bundles[0].sprite + ")");
  must(leader.bosses && leader.bosses["grand-chaplain-gaunder"], "kill registrada no bosses[] do personagem");
}
const pouchHasBossLoot = Object.keys(leader.lootPouch || {}).length > 0;
must(!pouchHasBossLoot, "loot do mini boss NÃO vai para a loot pouch (" + JSON.stringify(leader.lootPouch) + ")");
const chestItems = Object.keys(chest).length;
console.log("  rewardChest itens:", JSON.stringify(chest), "| bundle items:", JSON.stringify(bundles[0] && bundles[0].items));
must(chestItems > 0, "drops entraram no reward chest (via bundle claim)");
console.log(fails ? "FALHAS: " + fails : "TUDO OK");
process.exit(fails ? 1 : 0);
