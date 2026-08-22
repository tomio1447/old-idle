/* Teste: forja da CONTA — shared_inventory (apply/extract/merge/adoção) +
 * engine E2E (PT com 2 chars da mesma conta + 1 de outra: crédito único,
 * wallet propaga para todos da conta, snapshot reflete). */
"use strict";
const SI = require("../server/shared_inventory");
const engine = require("../server/authoritative_engine");

let fails = 0;
function must(ok, msg) { if (!ok) { fails++; console.log("  ✘ " + msg); } else console.log("  ✔ " + msg); }

/* ---------- 1) shared_inventory: round-trip apply/extract ---------- */
console.log("== shared_inventory ==");
let shared = SI.emptySharedInventory();
let p = { dust: 40, dustLimit: 200, slivers: 7, exaltedCores: 2, bag: { sword: 1 } };
SI.extractSharedFromPlayer(p, shared);
must(shared.forge.dust === 40 && shared.forge.slivers === 7 && shared.forge.exaltedCores === 2,
  "extract grava forge no shared (" + JSON.stringify(shared.forge) + ")");
must(p.dust === 0 && p.slivers === 0, "extract zera o p (mirror devolve no apply)");
SI.applySharedToPlayer(p, shared);
must(p.dust === 40 && p.dustLimit === 200 && p.slivers === 7 && p.exaltedCores === 2,
  "apply devolve o forge da conta para o p");

/* ---------- 2) legacy: shared sem forge NÃO zera o personagem ---------- */
let legacy = { v: 1, seq: 0, bag: {}, lootPouch: {}, depot: [], itemInstances: [],
  rewardChest: {}, rewardChestBundles: [] }; /* sem forge */
let pl = { dust: 33, dustLimit: 100, slivers: 5, exaltedCores: 1 };
SI.applySharedToPlayer(pl, legacy);
must(pl.dust === 33 && pl.slivers === 5, "legacy (forge null) adota o valor do personagem — nada zerado");
must(legacy.forge && legacy.forge.dust === 33, "adoção escreve o forge no shared para os próximos");

/* ---------- 3) adoção: soma todos os personagens ---------- */
let sharedAdopt = SI.emptySharedInventory(); sharedAdopt.forge = null;
SI.adoptCharForge(sharedAdopt, [
  { data: JSON.stringify({ dust: 30, dustLimit: 100, slivers: 4, exaltedCores: 1 }) },
  { data: JSON.stringify({ dust: 90, dustLimit: 250, slivers: 10, exaltedCores: 0 }) },
  { data: JSON.stringify({ dust: 999, _sharedInv: 1 }) }, /* mirror: ignorado */
]);
must(sharedAdopt.forge.dustLimit === 250, "dustLimit da conta = maior entre chars (250)");
must(sharedAdopt.forge.dust === 120, "dust somado dos chars (30+90=120, abaixo do cap 250)");
must(sharedAdopt.forge.slivers === 14 && sharedAdopt.forge.exaltedCores === 1, "slivers/cores somados (14 / 1)");

/* ---------- 4) merge terminal: máximo entre cópias ---------- */
let sharedM = SI.emptySharedInventory();
sharedM.forge = SI.normalizeForge({ dust: 50, dustLimit: 150, slivers: 5, exaltedCores: 1 });
SI.mergeSharedFromPlayer({ dust: 80, dustLimit: 200, slivers: 3, exaltedCores: 2 }, sharedM);
must(sharedM.forge.dust === 80 && sharedM.forge.dustLimit === 200 && sharedM.forge.slivers === 5 &&
  sharedM.forge.exaltedCores === 2, "merge terminal fica com o MAIOR valor por campo");

/* ---------- 5) E2E engine: PT 2 chars conta A + 1 char conta B ---------- */
console.log("== engine E2E (PT: A1 líder, A2 mesma conta, B1 outra conta) ==");
engine.MONSTERS["forge-dummy"] = {
  name: "Forge Dummy", hp: 1, exp: 0, damage: 0, armor: 0, defense: 0,
  element: "physical", attackSpeed: 60000, loot: [], best: { stars: 4 },
  skills: [],
};
function mkMember(id, name, account) {
  return { id, p: { id, name, voc: "knight", level: 800, exp: engine.expForLevel(800),
    hp: 10_000_000, mp: 1000, gold: 0, skills: { sword: 130, axe: 10, club: 10, dist: 10, fist: 10, shield: 120 },
    ml: 20, equip: { weapon: { item: "sword" } }, supplies: {}, lootPouch: {}, kills: {}, bosses: {},
    config: {}, dust: 0, dustLimit: 100, slivers: 0, exaltedCores: 0, accountId: account } };
}
const W = 30;
const A1 = mkMember("1", "LiderA", 777), A2 = mkMember("2", "SegundoA", 777), B1 = mkMember("3", "ConvidadoB", 999);
const waveMobs = () => [0, 1, 2].map((i) => ({
  id: "fd-" + i, slug: "forge-dummy", boss: false, fiendish: true, sinisterStacks: 15,
  cx: 15 + i, cy: 15, x: (15.5 + i) / W, y: 15.5 / W,
}));
let desc = {
  v: 1, savedAt: 1000, kind: "hunt", huntId: "frozen", bossId: null,
  instanceMode: "non-pvp", activeCharacterId: "1",
  members: [A1, A2, B1].map((m) => ({ id: m.id, p: JSON.parse(JSON.stringify(m.p)), accountId: m.p.accountId })),
  state: {
    players: [A1, A2, B1].map((m, i) => ({ id: m.id, p: m.p, cx: 14 + i, cy: 15, x: (14.5 + i) / W, y: 15.5 / W })),
    mobs: waveMobs(), events: [], gridW: W, gridH: W,
  },
};
let auth = engine.initializeAuthority(desc, "f".repeat(64), 1000);
let clock = 1000, kills = 0, snapshotsChecked = 0, sameAccountSynced = true, bUntouched = true;
for (let t = 0; t < 40_000; t += 2000) {
  const res = engine.advanceAuthorityState(JSON.stringify(auth), 2000, clock + 2000);
  auth = JSON.parse(res.state); clock += 2000;
  kills = auth.authority.stats.kills;
  const st = auth.state;
  const pa1 = st.players.find((x) => String(x.id) === "1").p;
  const pa2 = st.players.find((x) => String(x.id) === "2").p;
  const pb1 = st.players.find((x) => String(x.id) === "3").p;
  if (pa1.dust !== pa2.dust || pa1.slivers !== pa2.slivers) sameAccountSynced = false;
  if (pb1.dust !== 0 || pb1.slivers !== 0) bUntouched = false;
  snapshotsChecked++;
  /* repõe ondas de fiendish para continuar matando */
  if (!(auth.authority.mobs || []).length) {
    auth.authority.spawnPool = ["forge-dummy"];
    for (const m of waveMobs()) {
      const mob = { id: m.id, slug: m.slug, boss: false, fiendish: true, sinisterStacks: 15,
        cx: m.cx, cy: m.cy, def: engine.MONSTERS["forge-dummy"], damage: 0, attackSpeed: 60000,
        hp: 1, maxHp: 1, x: m.x, y: m.y, sx: m.x, sy: m.y, attackAcc: 0 };
      auth.authority.mobs.push(mob);
    }
  }
  for (const it of auth.authority.players) {
    it.p.hp = engine.maxStats(it.p).hp; it.p.mp = engine.maxStats(it.p).mp; it.downUntil = 0;
  }
}
const finalA1 = auth.state.players[0].p, finalA2 = auth.state.players[1].p, finalB = auth.state.players[2].p;
console.log("  kills:", kills, "| snapshots:", snapshotsChecked);
must(kills > 0, "a PT matou os fiendish (" + kills + " kills)");
must(finalA1.dust > 0 && finalA1.slivers > 0, "líder acumulou dust E slivers (dust=" + finalA1.dust + ", slivers=" + finalA1.slivers + ")");
must(finalA1.dust === finalA2.dust && finalA1.slivers === finalA2.slivers &&
  finalA1.exaltedCores === finalA2.exaltedCores,
  "2º personagem DA MESMA CONTA espelha a forja em tempo real (dust=" + finalA2.dust + ", slivers=" + finalA2.slivers + ")");
must(sameAccountSynced, "wallet sincronizou a conta em TODOS os snapshots");
must(finalB.dust === 0 && finalB.slivers === 0 && bUntouched,
  "personagem de OUTRA conta não ganha (1 crédito por kill — sem duplicar)");

/* extração de qualquer cópia dá o mesmo forge */
let s1 = SI.emptySharedInventory(); SI.extractSharedFromPlayer(JSON.parse(JSON.stringify(finalA1)), s1);
let s2 = SI.emptySharedInventory(); SI.extractSharedFromPlayer(JSON.parse(JSON.stringify(finalA2)), s2);
must(JSON.stringify(s1.forge) === JSON.stringify(s2.forge),
  "extrair da cópia do líder ou do 2º char grava o MESMO forge da conta (" + JSON.stringify(s1.forge) + ")");

console.log(fails ? "FALHAS: " + fails : "TUDO OK");
process.exit(fails ? 1 : 0);
