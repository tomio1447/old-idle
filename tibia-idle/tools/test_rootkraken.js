/* Regressão: boss THE ROOTKRAKEN (BOSSES 400+, depois de dragon-pack) +
 * The Rise of Podzilla Quest.
 *
 * Sala: game/maps/rootkraken.otbm publicada byte-igual de
 * beta-maps/bossesroom/rootkraken.otbm — 44×37 z=7, bounds
 * 1009..1052 × 1016..1052.
 *   bossspawn   {1030,1029,7} → local (21,13)
 *   playerspawn {1030,1038,7} → local (21,22)
 *   centermap   {1030,1034,7} → local (21,18)
 * Boss: dump Canary verbatim (hp 360k, exp 600k, looktype 1765, loot de
 * 28 entradas). Cooldown 20h (padrão Archfoe).
 * Mecânica Root Deep (oficial): contador por jogador 100→1000+, dano
 * sofrido ×counter/100; até 9 Rotten Plant Thing → Angry → Frenzied;
 * golpe da Frenzied aumenta o contador. DESIGN CALLs (taxas) documentados
 * em rootkraken-boss.js: +25/8s passivo, +25 por golpe frenzied, spawn
 * 1/9s, transform 20s/estágio.
 * Loot: amber 20k (tibiadb valuables), root-tentacle 300k e fish-eye
 * 500k (Yasir oficial), strange-inedible-fruit sem comprador → 0; as 8
 * armas amber tinham NPC value oficial 0 → cid atribuído + sell 0.
 */
"use strict";
const fs = require("fs"), path = require("path"), vm = require("vm");
const game = path.join(__dirname, "..", "game"), js = path.join(game, "js");
const OTBM = require(path.join(js, "otbm.js"));
function must(ok, msg) { if (!ok) throw Error(msg); }
const L = (x, y) => ({ cx: x - 1009, cy: y - 1016 });   // abs → local

/* ---------------- cliente (vm, ordem do index) ---------------- */
const ctx = { window: {}, console, Math, Date, Map, Set, Object, JSON, Number,
              String, Array, sessionStorage: { getItem: () => null, setItem: () => {} },
              MISSION_DEFS: {}, QUEST_DEFS: {} };
ctx.window = ctx;
vm.createContext(ctx);
/* BOSS_MODAL_SECTIONS vive no game.js (arquivo pesado): extrai só o
 * literal, mesmo padrão do slice de ui.js no test_podzilla. */
const gameSrcAll = fs.readFileSync(path.join(js, "game.js"), "utf8");
const bmsStart = gameSrcAll.indexOf("const BOSS_MODAL_SECTIONS");
vm.runInContext(gameSrcAll.slice(bmsStart,
  gameSrcAll.indexOf("\n];", bmsStart) + 3), ctx);
vm.runInContext("var BOSS_DEFS={};", ctx);   // definido no game.js antes dos patches
for (const file of ["gamedata.js", "monsterdata.js", "mobsheetdata.js",
  "accessorydata.js", "deathlings-sunken-temple.js", "warzone9.js",
  "nimmersatt.js", "podzilla-bottom.js", "rootkraken-boss.js",
  "rise-of-podzilla-quest.js", "hunt-sections.js", "tileflags.js"])
  vm.runInContext(fs.readFileSync(path.join(js, file), "utf8"), ctx, { filename: file });
ctx.addEventListener = () => {};
vm.runInContext(fs.readFileSync(path.join(js, "otbmhunt.js"), "utf8"), ctx);
vm.runInContext("GAMEDATA=window.GAMEDATA;BOSS_DEFS=window.BOSS_DEFS||{};", ctx);

/* ---------------- room hunt ---------------- */
const hunt = ctx.GAMEDATA.hunts["the-rootkraken-room"];
must(hunt && hunt.hidden === true && hunt.pack === 1 && hunt.cat === "boss-room",
  "room hunt deve ser hidden pack 1 boss-room");
must(hunt.otbm === "rootkraken" && hunt.otbmFloor === 7 && !hunt.otbmBounds,
  "otbm deve ser rootkraken z=7 sem otbmBounds");
must(JSON.stringify(hunt.monsters) === '["the-rootkraken"]', "monsters diverge");
must(JSON.stringify(hunt.otbmSpawn) === JSON.stringify({ x: 1030, y: 1038, z: 7 }),
  "otbmSpawn deve ser o playerspawn {1030,1038,7}");
must(hunt.otbmMobBounds && hunt.otbmMobBounds.x === 1030 && hunt.otbmMobBounds.y === 1029 &&
  hunt.otbmMobBounds.w === 1 && hunt.otbmMobBounds.h === 1 && hunt.otbmMobBounds.z === 7,
  "otbmMobBounds deve ser o bossspawn {1030,1029,7}");

/* ---------------- OTBM publicado ---------------- */
const bytes = fs.readFileSync(path.join(game, "maps", "rootkraken.otbm"));
must(bytes.equals(fs.readFileSync(path.join(game, "beta-maps", "bossesroom", "rootkraken.otbm"))),
  "OTBM publicado diverge de beta-maps");
const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
const parsed = OTBM.read(ab, { z: 7 });
const bb = parsed.sourceBounds;
must(parsed.w === 44 && parsed.h === 37 && bb.minX === 1009 && bb.minY === 1016 &&
  bb.maxX === 1052 && bb.maxY === 1052, "bounds reais do OTBM divergem");
for (const cell of Object.values(parsed.cells)) for (const id of [cell.g, ...cell.items])
  must(!id || fs.existsSync(path.join(game, "assets", "tiles", id + ".png")),
    "tile sem sprite: " + id);
{
  const rmeCtx = { window: {} }; rmeCtx.window = rmeCtx; vm.createContext(rmeCtx);
  vm.runInContext(fs.readFileSync(path.join(game, "rme", "data", "known_tiles.js"), "utf8"), rmeCtx);
  const unlisted = OTBM.missingTiles(parsed, rmeCtx.RME_KNOWN_TILES);
  must(unlisted.length === 0, "tiles fora do catálogo RME: " + unlisted.join(", "));
}
/* spawn/boss/centro caminháveis + conectados. */
ctx.applyHuntOtbmZones(parsed, hunt);
const runtime = OTBM.huntMapFromOtbm(parsed, ctx.TILEFLAGS);
const walkable = (x, y) => runtime.rows[y] && runtime.rows[y][x] &&
  !runtime.leg[runtime.rows[y][x]].bloc;
const reached = new Set(), queue = [runtime.spawn];
for (let i = 0; i < queue.length; i++) {
  const { x, y } = queue[i], key = x + "," + y;
  if (reached.has(key) || !walkable(x, y)) continue;
  reached.add(key);
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]])
    queue.push({ x: x + dx, y: y + dy });
}
for (const [nome, abs] of [["playerspawn", L(1030, 1038)], ["bossspawn", L(1030, 1029)],
                           ["centermap", L(1030, 1034)]])
  must(walkable(abs.cx, abs.cy) && reached.has(abs.cx + "," + abs.cy),
    nome + " não caminhável/conectado (" + abs.cx + "," + abs.cy + ")");
must(reached.size >= 300, "componente conectado pequeno demais: " + reached.size);

/* ---------------- boss def vs dump + sheet ---------------- */
const canary = JSON.parse(fs.readFileSync(path.join(game, "data", "canarymonsters.json"), "utf8"));
const md = ctx.MONSTERDATA["the-rootkraken"];
must(md && canary["the-rootkraken"] && md.hp === 360000 && md.exp === 600000 &&
  md.looktype === 1765 && md.hp === canary["the-rootkraken"].hp,
  "the-rootkraken: dados divergentes do Canary");
const sheet = ctx.MOBSHEETS["the-rootkraken"];
const bossPng = fs.readFileSync(path.join(game, "assets", "mob", "the-rootkraken.png"));
must(sheet && bossPng.readUInt32BE(16) === sheet.cw * sheet.cols &&
  bossPng.readUInt32BE(20) === sheet.ch * sheet.rows, "sheet do boss incompatível");
must(fs.existsSync(path.join(game, "assets", "mob", "the-rootkraken.idle.png")),
  "idle do boss ausente");

/* ---------------- plant things: defs + sheets + sprites ---------------- */
const PLANTS = ["rotten-plant-thing", "angry-plant-thing", "frenzied-plant-thing"];
const PLANT_LT = { "rotten-plant-thing": 1767, "angry-plant-thing": 1768, "frenzied-plant-thing": 1769 };
const engine = require(path.join(__dirname, "..", "server", "authoritative_engine.js"));
for (const slug of PLANTS) {
  const c = ctx.GAMEDATA.monsters[slug], s = engine.MONSTERS[slug];
  must(c && s && c.looktype === PLANT_LT[slug] && s.looktype === PLANT_LT[slug],
    slug + ": def ausente/looktype errado (client ou servidor)");
  must(ctx.MOBSHEETS[slug] && ctx.MOBSHEETS[slug].cols === 9 && ctx.MOBSHEETS[slug].rows === 4,
    slug + ": MOBSHEETS ausente");
  const png = fs.readFileSync(path.join(game, "assets", "mob", slug + ".png"));
  must(png.readUInt32BE(16) === 576 && png.readUInt32BE(20) === 256,
    slug + ": sprite deve ser 576×256 (9×4 @64px)");
}

/* ---------------- BOSS_DEFS + seção do modal ---------------- */
const boss = ctx.BOSS_DEFS["the-rootkraken"];
must(boss, "BOSS_DEFS the-rootkraken ausente");
must(boss.hunt === "the-rootkraken-room" && boss.baseMonster === "the-rootkraken",
  "boss def sem hunt/baseMonster");
must(boss.hp === 360000 && boss.exp === 600000 && boss.damage === 1200 &&
  boss.armor === 85 && boss.defense === 85, "stats do boss divergem do dump");
must(boss.cooldown === 20 * 60 * 60 * 1000, "cooldown deve ser 20h");
must(boss.requirement && boss.requirement.level === 400 &&
  boss.requirement.enforced === true && boss.requirement.mission === "podzilla-bottom" &&
  JSON.stringify(boss.requirement.killsRequired) === '["doctor-marrow"]',
  "requirement deve ser level 400 + doctor-marrow + mission podzilla-bottom enforced");
const sect = vm.runInContext("BOSS_MODAL_SECTIONS", ctx)
  .find((s) => s.title === "BOSSES 400+");
must(sect && sect.ids.indexOf("the-rootkraken") === sect.ids.indexOf("dragon-pack") + 1,
  "the-rootkraken deve vir logo depois de dragon-pack na BOSSES 400+");

/* ---------------- loot audit (28 slugs do dump) ---------------- */
const catalog = { console }; catalog.window = catalog; vm.createContext(catalog);
/* Mesma ordem do loop do authoritative_engine (ordem do index.html —
 * último escritor vence; ex.: the-void marca potions sell 1 e bashmuul/
 * mimar zeram depois). */
for (const file of ["gamedata.js", "weapondata.js", "weapons.js", "quiverdata.js",
  "core.js", "accessorydata.js", "supply-stash-data.js", "supplydata.js", "supplies.js",
  "yasir-prices.js", "hardcore-library.js", "hard-hunts.js",
  "falcon-bastion.js", "deathlings-sunken-temple.js", "buried-cathedral.js",
  "scarlett-boss.js", "brain-head-boss.js", "feast-of-souls.js",
  "tentugly-boss.js", "brainstealer-boss.js", "mega-magmaoid-boss.js",
  "dragon-pack-boss.js", "dream-courts-bosses.js", "ratmiral-boss.js",
  "pirat-lower.js", "the-void.js", "glooth-cave.js", "buster-darashia.js",
  "bashmuul-issavi.js", "true-asuras.js", "mimar-haffar.js",
  "moonstone-castle.js", "radiant-skyhold.js", "book-world.js",
  "sir-leonard.js", "norcferatus-fortress.js", "unhallowed-crypt.js",
  "roost-graveborn.js", "court-warlock.js", "jade-roots.js", "putrefactory.js",
  "darklight-core.js", "gloom-pillars.js", "asura-palace.js", "magma-bubble.js",
  "gnomprona.js", "azzilon-castle.js", "warzone9.js", "nimmersatt.js",
  "podzilla-bottom.js", "rootkraken-boss.js", "umbral-creation.js",
  "urmahlullu.js", "bloodrotten.js"]) {
  try {
    vm.runInContext(fs.readFileSync(path.join(js, file), "utf8"), catalog, { filename: file });
  } catch (_e) { /* patch opcional: mesmo comportamento do sandbox do engine */ }
  if (file === "weapons.js") vm.runInContext("fundirWeaponData()", catalog);
}
const E = require(path.join(__dirname, "..", "server", "authoritative_engine.js"));
const lootSlugs = new Set();
for (const drop of canary["the-rootkraken"].loot) lootSlugs.add(drop.item);
must(lootSlugs.size === 29, "dump deve somar 29 slugs de loot: " + lootSlugs.size);
for (const slug of lootSlugs) {
  const client = catalog.GAMEDATA.items[slug], server = E.ITEMS[slug];
  must(client && server && client.cid === server.cid &&
    Number.isFinite(client.npcSell ?? client.sell) &&
    (client.npcSell ?? client.sell) === (server.npcSell ?? server.sell),
    slug + ": loot sem registro/preço consistente");
  const icon = fs.readFileSync(path.join(game, "assets", "item", slug + ".png"));
  must(icon.readUInt32BE(16) <= 64 && icon.readUInt32BE(20) <= 64,
    slug + ": ícone inválido");
}
/* Preços oficiais verificados (Yasir/tibiadb): amber 20k, root-tentacle
 * 300k, fish-eye 500k; strange-inedible-fruit sem comprador → 0; as 8
 * armas amber tinham NPC value oficial 0 → sell 0 + cid real. */
for (const [slug, price] of Object.entries({
  "amber": 20000, "root-tentacle": 300000, "fish-eye": 500000,
  "strange-inedible-fruit": 0,
})) for (const items of [catalog.GAMEDATA.items, E.ITEMS])
  must(items[slug] && (items[slug].npcSell ?? items[slug].sell) === price,
    slug + ": preço oficial incorreto");
const AMBER_CIDS = {
  "amber-slayer": 47368, "amber-greataxe": 47369, "amber-bludgeon": 47370,
  "amber-sabre": 47374, "amber-axe": 47375, "amber-cudgel": 47376,
  "amber-crossbow": 47377, "amber-kusarigama": 50239,
};
for (const slug in AMBER_CIDS)
  for (const items of [catalog.GAMEDATA.items, E.ITEMS])
    must(items[slug] && items[slug].cid === AMBER_CIDS[slug] &&
      (items[slug].npcSell ?? items[slug].sell) === 0,
      slug + ": cid/NPC value 0 divergente");

/* ---------------- servidor: HUNTS + DAILY_BOSS_POOL ---------------- */
must(E.HUNTS["the-rootkraken-room"] && E.HUNTS["the-rootkraken-room"].pack === 1 &&
  JSON.stringify(E.HUNTS["the-rootkraken-room"].monsters) === '["the-rootkraken"]',
  "HUNTS do servidor sem the-rootkraken-room");
const boost = require(path.join(__dirname, "..", "server", "dailyboost.js"));
must(boost.DAILY_BOSS_POOL.includes("the-rootkraken"),
  "DAILY_BOSS_POOL sem the-rootkraken");

/* ---------------- mecânica: wiring cliente ---------------- */
const combatSrc = fs.readFileSync(path.join(js, "combat.js"), "utf8");
must(combatSrc.includes('id === "the-rootkraken" && typeof rootkrakenBossInit'),
  "combat.js sem dispatch do init");
must(combatSrc.includes("rootkrakenBossTick(c, now)"), "combat.js sem dispatch do tick");
must((combatSrc.match(/rootkrakenBossOutgoingDamageMultiplier\(c, mob, p\)/g) || []).length >= 2,
  "multiplicador de dano deve estar nos 2 caminhos (skill + melee)");
const gameSrc = fs.readFileSync(path.join(js, "game.js"), "utf8");
must(gameSrc.includes("rootkrakenBossCleanup"), "game.js sem cleanup do combate");
const engineSrc = fs.readFileSync(path.join(__dirname, "..", "server", "authoritative_engine.js"), "utf8");
must(engineSrc.includes("auth.rootkraken") && engineSrc.includes("tickRootkraken(auth,now)") &&
  engineSrc.includes("descriptor.state.rootkraken"),
  "engine sem init/tick/serialização do rootkraken");
must(engineSrc.includes("dmg=Math.max(0,Math.floor(dmg*n/RK_COUNTER_START))"),
  "engine sem escala de dano counter/100");

/* ---------------- mecânica: mini-run autoritativo ---------------- */
{
  const bcell = L(1030, 1029), pcell = L(1030, 1038);
  const lvl = 450;
  const player = { id: "1", name: "T", voc: "knight", level: lvl,
    exp: engine.expForLevel(lvl), hp: 300000, mp: 20000, gold: 0,
    skills: { sword: 120 }, ml: 20, equip: {}, supplies: {}, lootPouch: {},
    kills: {}, bosses: {}, config: {} };
  const bossMob = { id: "boss-1", slug: "the-rootkraken", boss: true,
    hp: 360000, maxHp: 360000, def: engine.MONSTERS["the-rootkraken"],
    cx: bcell.cx, cy: bcell.cy, x: .5, y: .5, damage: 0,
    attackSpeed: Number.MAX_SAFE_INTEGER, attackAcc: 0 };
  const desc = { v: 1, savedAt: 1000, kind: "boss", huntId: null,
    bossId: "the-rootkraken", instanceMode: "boss", activeCharacterId: "1",
    members: [{ id: "1", p: player }],
    state: { players: [{ id: "1", p: player, cx: pcell.cx, cy: pcell.cy, x: .5, y: .5 }],
      mobs: [bossMob], events: [] } };
  let auth = engine.initializeAuthority(desc, "a".repeat(64), 1000);
  const adv = (ms) => JSON.parse(engine.advanceAuthorityState(
    JSON.stringify(auth), ms, Number(auth.authority.clock) + ms).state);
  const silence = () => { for (const m of auth.authority.mobs) {
    m.damage = 0; m.attackSpeed = Number.MAX_SAFE_INTEGER; m.attackAcc = 0;
    for (const s of m.skills || []) { s.min = 0; s.max = 0; } } };
  const refill = () => { for (const it of auth.authority.players) {
    it.p.hp = 1e9; it.downUntil = 0; }
    // Mantém boss e plants vivos: o teste mede spawn/transformação,
    // não DPS do jogador.
    for (const m of auth.authority.mobs || []) m.hp = m.maxHp; };
  const stepAdv = (ms, step = 1500) => {
    for (let t = 0; t < ms; t += step) {
      auth = adv(Math.min(step, ms - t)); silence(); refill();
      if (auth.authority.ended) break;
    }
  };
  auth = adv(6000);   // atravessa o spawn delay
  silence(); refill();
  must(auth.authority.rootkraken &&
    auth.authority.rootkraken.counters["1"] === 100,
    "Root Deep deve iniciar o contador em 100");
  stepAdv(40000);
  const n1 = auth.authority.rootkraken.counters["1"];
  must(n1 >= 175, "contador deve crescer (+25/8s): " + n1);
  const plants1 = auth.authority.mobs.filter((m) => m.rkPlant && m.hp > 0);
  must(plants1.length >= 4, "plants devem estar spawnando (1/9s): " + plants1.length);
  stepAdv(60000);
  const plants2 = auth.authority.mobs.filter((m) => m.rkPlant && m.hp > 0);
  must(plants2.length <= 9, "cap de 9 plant things excedido: " + plants2.length);
  must(plants2.length >= 8, "plants devem chegar perto do cap: " + plants2.length);
  must(plants2.some((m) => m.slug === "angry-plant-thing" || m.slug === "frenzied-plant-thing"),
    "transform rotten→angry/frenzied não aconteceu");
  must(auth.authority.rootkraken.counters["1"] > n1,
    "contador deve continuar crescendo");
}

/* ---------------- mecânica: tick offline do cliente ---------------- */
{
  const cctx = { window: {}, console, Math, Date, Map, Set, Object };
  cctx.window = cctx; vm.createContext(cctx);
  for (const f of ["gamedata.js", "monsterdata.js", "mobsheetdata.js",
                   "podzilla-bottom.js", "rootkraken-boss.js"])
    vm.runInContext(fs.readFileSync(path.join(js, f), "utf8"), cctx, { filename: f });
  cctx.GAMEDATA = cctx.window.GAMEDATA;
  const c = { mobs: [{ slug: "the-rootkraken", boss: true, hp: 360000 }],
              pendingSpawns: [], events: [],
              player: { id: "p1", p: { id: "p1", hp: 5000, name: "T" } } };
  cctx.c = c;
  vm.runInContext("rootkrakenBossInit(c);", cctx);
  must(c.rootkraken && c.rootkraken.counters["p1"] === 100,
    "init do cliente deve começar o contador em 100");
  const t0 = Date.now();
  vm.runInContext(`rootkrakenBossTick(c, ${t0} + 40000);`, cctx);
  must(c.rootkraken.counters["p1"] >= 200,
    "contador do cliente deve crescer (+25/8s): " + c.rootkraken.counters["p1"]);
  must((c.pendingSpawns || []).length + c.mobs.filter((m) => m.rkPlant).length >= 4,
    "plants devem spawnar no cliente");
  must(c.mobs.filter((m) => m.rkPlant).length <= 9, "cap de 9 excedido no cliente");
  // dano ×counter/100: counter 200 → 2×
  const mul = cctx.rootkrakenBossOutgoingDamageMultiplier(c, c.mobs[0], c.player.p);
  must(Math.abs(mul - c.rootkraken.counters["p1"] / 100) < 1e-9,
    "multiplicador deve ser counter/100: " + mul);
  // frenzied bump: +25 ao contador
  const before = c.rootkraken.counters["p1"];
  cctx.rootkrakenBossOutgoingDamageMultiplier(c, { slug: "frenzied-plant-thing" }, c.player.p);
  must(c.rootkraken.counters["p1"] === before + 25, "frenzied deve somar +25");
  cctx.rootkrakenBossCleanup(c);
  must(!c.rootkraken, "cleanup deve remover o estado");
}

/* ---------------- quest: defs + estado ---------------- */
const ROP = require(path.join(js, "rise-of-podzilla-quest.js"));
const m1 = ctx.MISSION_DEFS["podzilla-bottom"];
must(m1 && m1.tasks.length === 1 && m1.tasks[0].counter === "kills" &&
  m1.tasks[0].target === 1500 && !m1.tasks[0].monster,
  "MISSION_DEFS podzilla-bottom deve ser counter kills x1500");
must(m1.completeReward && m1.completeReward.bossAccess === "the-rootkraken",
  "recompensa da missão deve liberar o boss");
const q = ctx.QUEST_DEFS["the-rise-of-podzilla"];
must(q && q.level === 400 && q.questType === "boss" && q.worldQuest === true &&
  q.playable === false && q.bossSprite === "the-rootkraken" &&
  typeof q.renderDetail === "function" && typeof q.rewardReady === "function",
  "QUEST_DEFS the-rise-of-podzilla incorreta");
{
  const p = { level: 400, bosses: {}, missions: {}, missionsDone: {} };
  let st = ROP.riseOfPodzillaState(p);
  must(!st.requirementsMet && !st.m1.done && !st.m2.done && !st.complete,
    "estado inicial deve ter tudo pendente");
  p.bosses["doctor-marrow"] = { kills: 1 };
  st = ROP.riseOfPodzillaState(p);
  must(st.requirementsMet === true, "reqs: marrow+400 deve passar");
  p.missions["podzilla-bottom"] = { progress: { kills: 1499 } };
  must(ROP.riseOfPodzillaState(p).m1.done === false, "M1 1499 não deve completar");
  p.missions["podzilla-bottom"].progress.kills = 1500;
  must(ROP.riseOfPodzillaState(p).m1.done === true, "M1 1500 deve completar");
  must(ROP.riseOfPodzillaState({ level: 400, bosses: { "doctor-marrow": { kills: 1 }, "the-rootkraken": { kills: 1 } }, missions: {}, missionsDone: {} }).m2.done,
    "M2 = kill the-rootkraken");
  p.missionsDone["rise-of-podzilla:outfit"] = true;
  must(ROP.riseOfPodzillaState(p).claimed.outfit === true,
    "claim do outfit deve persistir em missionsDone");
  /* Grant do outfit: wardrobe m/f + cosmetics da conta, 1x só. */
  const gp = { wardrobe: {}, missionsDone: {} };
  ROP.riseOfPodzillaGrantOutfit(gp);
  must(gp.wardrobe.outfits["rootwalker-m"] === 2 && gp.wardrobe.outfits["rootwalker-f"] === 2,
    "grant deve liberar rootwalker m/f addon 1+2");
  ROP.riseOfPodzillaClaim(gp, "outfit");
  must(gp.missionsDone["rise-of-podzilla:outfit"] === true, "claim deve ser 1x/conta");
}
/* Rootwalker catalogada com os ids esperados (verificação msg:
 * rootwalker-m 1774 / rootwalker-f 1775). */
{
  const appCtx = { window: {} }; appCtx.window = appCtx; vm.createContext(appCtx);
  vm.runInContext(fs.readFileSync(path.join(js, "appearancedata.js"), "utf8"), appCtx);
  const APP = appCtx.APPEARANCES;
  const rm = APP.outfits.find((o) => o.id === "rootwalker-m");
  const rf = APP.outfits.find((o) => o.id === "rootwalker-f");
  must(rm && rf && rm.looktype === 1774 && rf.looktype === 1775,
    "outfit rootwalker-m/f ausente/looktype errado");
  for (const f of ["rootwalker-m.base.png", "rootwalker-m-a1.base.png",
                   "rootwalker-m-a2.base.png", "rootwalker-f.base.png"])
    must(fs.existsSync(path.join(game, "assets", "appearance", "outfit", f)),
      "sprite rootwalker ausente: " + f);
}

/* ---------------- index.html: ordem de carga ---------------- */
const html = fs.readFileSync(path.join(game, "index.html"), "utf8");
must(html.includes("js/rootkraken-boss.js?v="), "rootkraken-boss.js não carregado");
must(html.includes("js/rise-of-podzilla-quest.js?v="), "rise-of-podzilla-quest.js não carregado");
must(html.indexOf("js/podzilla-bottom.js") < html.indexOf("js/rootkraken-boss.js"),
  "rootkraken-boss.js deve carregar depois de podzilla-bottom.js");
must(html.indexOf("js/weapondata.js") < html.indexOf("js/rootkraken-boss.js"),
  "rootkraken-boss.js deve carregar depois do weapondata (fix das armas amber)");

console.log("OK — The Rootkraken: sala 44×37 z=7 (" + reached.size +
  " sqm conectados), Root Deep (contador 100→" +
  (lootSlugs.size) + " slugs de loot com sprite+preço, 3 plant things, quest Rise of Podzilla).");
