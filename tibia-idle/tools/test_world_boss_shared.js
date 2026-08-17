/* Regressão: World Boss multiplayer = instância compartilhada (padrão Megalomania). */
"use strict";
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
function must(ok, msg) { if (!ok) throw Error(msg); }
function read(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }

const wb = require(path.join(root, "server", "world_boss.js"));
const engine = require(path.join(root, "server", "authoritative_engine.js"));

must(wb.WORLD_BOSS_MAX_MEMBERS === 30, "WORLD_BOSS_MAX_MEMBERS != 30");
must(wb.bossIdForWarzone("wz1") === "world-boss-wz1", "bossId wz1");
must(wb.bossIdForWarzone("wz2") === "world-boss-wz2", "bossId wz2");
must(wb.bossIdForWarzone("wz3") === "world-boss-wz3", "bossId wz3");
must(wb.isWorldBossBossId("world-boss-wz1") && !wb.isWorldBossBossId("goshnar-s-megalomania"),
  "isWorldBossBossId");
must(wb.warzoneIdFromBossId("world-boss-wz2") === "wz2", "warzoneIdFromBossId");

const serverSrc = read("server/server.js");
must(serverSrc.includes("createWorldBossSharedInstance") &&
  serverSrc.includes("syncWorldBossShared") &&
  serverSrc.includes("global.__WORLD_BOSS=WORLD_BOSS") &&
  serverSrc.includes("leaseAccountId:acc.id") &&
  serverSrc.includes("createSharedInstance:(event)=>createWorldBossSharedInstance"),
  "server.js sem wiring da instância compartilhada WB");

const wbSrc = read("server/world_boss.js");
must(wbSrc.includes("bindShare") && wbSrc.includes("sharedForAccount") &&
  wbSrc.includes("opts.createSharedInstance") && wbSrc.includes("opts.syncSharedBoss") &&
  wbSrc.includes("opts.endSharedInstance"),
  "world_boss.js sem share/create hooks");

const dbSrc = read("server/db.js");
must(dbSrc.includes("instanceEndForced") && dbSrc.includes("instanceReplaceForced") &&
  dbSrc.includes("leaseAccountId") && dbSrc.includes("wb-member-leased"),
  "db.js sem forced replace/end ou skip worker WB");

const engSrc = read("server/authoritative_engine.js");
must(engSrc.includes("authIsWorldBoss") && engSrc.includes("ensureWorldBossMonster") &&
  engSrc.includes("world-boss-wz"),
  "engine sem revive/stubs WB");

const gameSrc = read("game/js/game.js");
must(gameSrc.includes('"world-boss-wz1"') && gameSrc.includes('"world-boss-wz2"') &&
  gameSrc.includes('"world-boss-wz3"') &&
  !/function onlineAuthorityCombat\(\)\{\s*\/\/ World Boss skeleton/.test(gameSrc) &&
  gameSrc.includes("incomingWb&&!localWb") &&
  gameSrc.includes("!BOSS_DEFS[id].worldBoss"),
  "game.js sem BOSS_DEFS WB / online ticks / guard SSE");

const combatSrc = read("game/js/combat.js");
must(combatSrc.includes("worldBossPlaceholderMap") &&
  combatSrc.includes("boss.worldBoss") &&
  combatSrc.includes("skipParty: true"),
  "combat.js sem placeholder/mapa WB");

const uiSrc = read("game/js/world-boss-ui.js");
must(uiSrc.includes("wbEnterSharedCombat") && uiSrc.includes("accountLoadInstance") &&
  uiSrc.includes("resumeIdleInstance") && !uiSrc.includes("wbEnterCombatStub") &&
  !uiSrc.includes("wbBuildIsolatedCombat"),
  "world-boss-ui.js ainda usa combate isolado");

const html = read("game/index.html");
must(html.includes("world-boss-ui.js?v=wb-shared-v1") && html.includes("game.js?v=wb-shared-v1") &&
  html.includes("combat.js?v=wb-shared-v1"),
  "index.html sem cache-bust wb-shared-v1");

const wz1 = wb.WARZONES.find((w) => w.id === "wz1");
const desc = {
  v: 1, kind: "boss", huntId: null, bossId: "world-boss-wz1", instanceMode: "boss", worldBoss: true,
  activeCharacterId: "1",
  members: [{ id: "1", p: { id: "1", name: "T", voc: "knight", level: 100, hp: 1000, mp: 100, gold: 0, equip: {}, skills: {} } }],
  state: {
    worldBoss: true, gridW: 40, gridH: 40,
    players: [{ id: "1", p: { id: "1", name: "T", voc: "knight", level: 100, hp: 1000, mp: 100 }, cx: 20, cy: 28 }],
    mobs: [{ slug: wz1.baseMonster, boss: true, worldBoss: true, id: "boss-wb",
      hp: wz1.bossHp, maxHp: wz1.bossHp, cx: 20, cy: 16 }],
    arenaBossSpawn: { at: Date.now() + 10000, spawned: false },
  },
};
const authState = engine.initializeAuthority(desc, "a".repeat(64), Date.now());
const auth = authState.authority;
must(auth && auth.worldBoss, "authority.worldBoss ausente");
must(auth.bossId === "world-boss-wz1", "authority.bossId");
const pending = auth.arenaBossSpawn && auth.arenaBossSpawn.pending;
const bossHp = pending ? Number(pending.maxHp || pending.hp) :
  ((auth.mobs || []).find((m) => m && m.boss) || {}).maxHp;
must(Number(bossHp) === wz1.bossHp, "HP warzone não aplicado (" + bossHp + ")");

must(engSrc.includes("authIsBossFight(auth)&&!authIsWorldBoss(auth)") &&
  /if\(authIsWorldBoss\(auth\)\)\{\s*auth\.ended=true;auth\.terminalReason="party-wipe"/.test(engSrc),
  "engine sem revive 30s / wipe WB");

console.log("ok: world boss shared instance contract");
