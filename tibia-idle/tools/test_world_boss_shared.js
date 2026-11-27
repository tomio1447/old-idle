/* Regressão: World Boss multiplayer = instância compartilhada (padrão Megalomania). */
"use strict";
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
function must(ok, msg) { if (!ok) throw Error(msg); }
function read(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }

const wb = require(path.join(root, "server", "world_boss.js"));
const engine = require(path.join(root, "server", "authoritative_engine.js"));

must(wb.WORLD_BOSS_MAX_MEMBERS === 20, "WORLD_BOSS_MAX_MEMBERS != 20");
must(wb.bossIdForWarzone("wz1") === "world-boss-wz1", "bossId wz1");
must(wb.bossIdForWarzone("wz2") === "world-boss-wz2", "bossId wz2");
must(wb.bossIdForWarzone("wz3") === "world-boss-wz3", "bossId wz3");
must(wb.isWorldBossBossId("world-boss-wz1") && wb.isWorldBossBossId("goshnar-s-megalomania") &&
  wb.isWorldBossBossId("phosphorus") && wb.isWorldBossBossId("bonelords-phylactery") &&
  !wb.isWorldBossBossId("mimar-haffar") && !wb.isWorldBossBossId("the-gravedigger"),
  "isWorldBossBossId");
must(wb.warzoneIdFromBossId("world-boss-wz2") === "wz2", "warzoneIdFromBossId");
must(wb.bossIdForWarzone("phylactery") === "bonelords-phylactery" &&
  wb.warzoneIdFromBossId("bonelords-phylactery") === "phylactery",
  "mapping phylactery↔bonelords-phylactery");

const serverSrc = read("server/server.js");
must(serverSrc.includes("createWorldBossSharedInstance") &&
  serverSrc.includes("syncWorldBossShared") &&
  serverSrc.includes("global.__WORLD_BOSS=WORLD_BOSS") &&
  serverSrc.includes("leaseAccountId=acc.id") &&
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
  gameSrc.includes("b.worldBoss"),
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
must(html.includes("world-boss-ui.js?v=") && html.includes("game.js?v=") &&
  html.includes("combat.js?v="),
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

/* -------- Phylactery (Roost of the Graveborn) como World Boss -------- */
const phyWz = wb.WARZONES.find((w) => w.id === "phylactery");
must(phyWz && phyWz.maxChars === 5 && phyWz.minLevel === 450 &&
  phyWz.cooldownMs === 20 * 3600 * 1000 && phyWz.gridW === 29 && phyWz.gridH === 25,
  "WARZONES phylactery: lobby 5 / lvl 450 / cd 20h / grid 29x25");
const phyPlayer = { id: "1", name: "T", voc: "knight", level: 500,
  exp: engine.expForLevel(500), hp: 400000, mp: 20000, gold: 0,
  skills: { sword: 120 }, ml: 20, equip: {}, supplies: {}, lootPouch: {},
  kills: {}, bosses: {}, config: {} };
const phyDesc = {
  v: 1, kind: "boss", huntId: null, bossId: "bonelords-phylactery",
  instanceMode: "boss", worldBoss: true, activeCharacterId: "1",
  members: [{ id: "1", p: phyPlayer }],
  state: {
    worldBoss: true, gridW: phyWz.gridW, gridH: phyWz.gridH,
    players: [{ id: "1", p: phyPlayer, cx: phyWz.playerSpawn.x, cy: phyWz.playerSpawn.y }],
    mobs: [{ slug: phyWz.baseMonster, boss: true, worldBoss: true,
      id: "boss-bonelords-phylactery", hp: phyWz.bossHp, maxHp: phyWz.bossHp,
      cx: phyWz.bossSpawn.x, cy: phyWz.bossSpawn.y }],
    arenaBossSpawn: { at: Date.now() + 10000, spawned: false },
  },
};
const phyAuth = engine.initializeAuthority(phyDesc, "c".repeat(64), Date.now());
must(phyAuth.authority.worldBoss === true, "authority.worldBoss ausente (phylactery)");
must(phyAuth.authority.bossId === "bonelords-phylactery", "authority.bossId (phylactery)");
{
  const st = JSON.parse(engine.advanceAuthorityState(JSON.stringify(phyAuth), 20000,
    Number(phyAuth.authority.clock) + 20000).state);
  must(st.authority.bo && st.authority.bo.cagePool === 120000,
    "bo/cagePool não inicializou no spawn do boss compartilhado");
  must(st.authority.mobs.filter((m) => m.boCage).length === 4 &&
    !st.authority.mobs.some((m) => m.boss),
    "fase 1 deve abrir 4 Soulcages com o boss retido");
}

/* -------- E2E do controller real: gate de join + kill credit -------- */
process.env.WB_COUNTDOWN_MS = "1";
process.env.WB_SPAWN_DELAY_MS = "1";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const saves = [], published = [];
  let sharedEvent = null;
  const chainKills = { "adventurer-group": { kills: 1 }, "eldritch-dragon-lord": { kills: 1 },
    "ice-horror": { kills: 1 }, "the-gravedigger": { kills: 1 } };
  const mkChar = (data) => ({ id: 1, account_id: 1, name: "K", voc: "knight", level: 500, data });
  const fakeDb = {
    findAccountByToken: async () => ({ id: 1 }),
    findCharacter: async (id) => mkChar({ level: 500, voc: "knight", bosses: chainKills }),
    findAccountById: async () => ({ id: 1, gold: 0 }),
    updateCharacter: async (id, voc, level, p) => { saves.push(p); return { ok: true }; },
    accountSharedInventoryMutate: async (acc, fn) => { const s = {}; fn(s); return s; },
  };
  const ctrl = wb.createWorldBossController({
    testServer: true,
    createSharedInstance: async (ev) => { sharedEvent = ev; return { ok: true, instanceId: "i1", ownerAccountId: 1 }; },
    endSharedInstance: async () => ({ ok: true }),
    publishAll: (t, s) => published.push(["all", t, s]),
    publishAccount: (id, t, s) => published.push([id, t, s]),
    getDb: () => fakeDb,
  });
  // Gate 1: char sem a cadeia → BOSS_KILLS_REQUIRED (lobby cancela e fecha).
  const noKillsDb = Object.assign({}, fakeDb, {
    findCharacter: async (id) => mkChar({ level: 500, voc: "knight", bosses: {} }),
  });
  let r = await ctrl.createLobby(noKillsDb, { token: "t", warzoneId: "phylactery", lobbyType: "open", characterIds: [1] });
  must(r.code === 403 && r.body.error === "BOSS_KILLS_REQUIRED",
    "join sem a cadeia deve negar: " + JSON.stringify(r.body));
  // Gate 2: char com a cadeia mas level baixo → LEVEL_REQUIRED.
  const lowDb = Object.assign({}, fakeDb, {
    findCharacter: async (id) => mkChar({ level: 300, voc: "knight", bosses: chainKills }),
  });
  r = await ctrl.createLobby(lowDb, { token: "t", warzoneId: "phylactery", lobbyType: "open", characterIds: [1] });
  must(r.code === 403 && r.body.error === "LEVEL_REQUIRED",
    "join sem level deve negar: " + JSON.stringify(r.body));
  // Gate 3: lastFight recente (cooldown persistido 20h) → CHAR_COOLDOWN.
  const cdDb = Object.assign({}, fakeDb, {
    findCharacter: async (id) => mkChar({ level: 500, voc: "knight",
      bosses: Object.assign({}, chainKills, { "bonelords-phylactery": { kills: 2, lastFight: Date.now() - 3600000 } }) }),
  });
  r = await ctrl.createLobby(cdDb, { token: "t", warzoneId: "phylactery", lobbyType: "open", characterIds: [1] });
  must(r.code === 429 && r.body.error === "CHAR_COOLDOWN",
    "join em cooldown persistido deve negar: " + JSON.stringify(r.body));
  // OK: createLobby + join válidos → start → combat → teleport.
  r = await ctrl.createLobby(fakeDb, { token: "t", warzoneId: "phylactery", lobbyType: "open", characterIds: [1] });
  must(r.code === 200 && r.body.ok, "createLobby phylactery falhou: " + JSON.stringify(r.body));
  r = await ctrl.startFight(fakeDb, { token: "t" });
  must(r.code === 200, "startFight falhou: " + JSON.stringify(r.body));
  await sleep(10);
  ctrl.tick(fakeDb);
  await sleep(30);
  must(sharedEvent && sharedEvent.warzoneId === "phylactery" &&
    sharedEvent.bossMaxHp === 850000, "createSharedInstance não disparou p/ phylactery");
  // Vitória → grantSuccessRewards grava kill + lastFight no char.
  await ctrl.onSharedEnded("boss-defeated");
  must(saves.length >= 1, "grantSuccessRewards não persistiu o char");
  const p = saves[saves.length - 1];
  must(p.bosses && p.bosses["bonelords-phylactery"] &&
    p.bosses["bonelords-phylactery"].kills === 1 &&
    p.bosses["bonelords-phylactery"].lastFight > 0,
    "kill da phylactery não creditada: " + JSON.stringify(p.bosses || {}));
  console.log("ok: world boss shared instance contract");
})().catch((e) => { console.error(e); process.exit(1); });
