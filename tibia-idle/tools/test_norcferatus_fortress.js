/* Regressão: Norcferatus Fortress — hunt 400+ + boss Vladrukh +
 * Bloody Tusks Quest (update 15.10, ausente do dump Canary).
 *
 * Mapa: game/maps/norcferatus_fortress.otbm publicado byte-igual de
 * beta-maps/bossesroom/norcferatus_fortress.otbm — 25×25 z=7, bounds
 * 1009..1033 × 1015..1039.
 *   centerroom/playerspawn {1021,1028,7}
 *   zona de spawn          {1015,1024,7} → {1027,1031,7} (13×8, 94 sqm
 *                          caminháveis conectados — pós-import das flags)
 *   câmara sul (bossroom)  80 sqm conectados:
 *     playerspawn {1023,1039,7} · bossspawn {1027,1036,7} · center {1026,1037,7}
 *
 * Mecânica própria: respawn das ondas em 8s (hunt.respawnMs) + a cada
 * onda 3% de chance de 1 Varg EXTRA além do pack (hunt.extraSpawn) —
 * combat.spawnWave (cliente) e spawnHuntWave (autoridade) implementam
 * o mesmo roll.
 *
 * Monstros (fichas oficiais TibiaWiki, HP/Exp do pedido):
 *   dworc-shadowstalker    8900/8930  raceId 2667  sheet do GIF (looktype 215 fallback)
 *   gloom-maw              8700/8770  raceId 2669  sheet do GIF
 *   norcferatu-heartless   5700/5900  raceId 2664  looktype 1852 (DAT)
 *   norcferatu-nightweaver 6100/6370  raceId 2666  looktype 1851 (DAT)
 *   orclops-bloodbreaker  10300/10250 raceId 2668  looktype 1854 (DAT)
 *   varg                   5400/5630  raceId 2665  looktype 1855 (DAT)
 *   vladrukh             390000/450000 Archfoe     looktype 1862 (DAT)
 *
 * Bloody Tusks Quest: M1 = 5× Varg (MISSION_DEFS task monster) →
 * acesso ao Vladrukh (requirement.mission enforced). M2 = matar o
 * Vladrukh → montaria Gloom Maw (reward oficial; wardrobe.js já
 * concede em bosses.vladrukh.kills>0 — a quest dá o claim visual).
 */
"use strict";
const fs = require("fs"), path = require("path"), vm = require("vm");
const game = path.join(__dirname, "..", "game");
const js = path.join(game, "js");
function must(v, m) { if (!v) throw Error(m); }

const engine = require("../server/authoritative_engine.js");
const OTBM = require(path.join(js, "otbm.js"));

/* ---------------- dados do cliente (vm, ordem do index) ---------------- */
const ctx = { window: {}, console, Math, Date, Map, Set, document: undefined };
ctx.window = ctx;
vm.createContext(ctx);
for (const f of ["gamedata.js", "monsterdata.js", "mobsheetdata.js", "monsters.js",
                 "weapondata.js", "weapons.js", "yasir-prices.js", "gnomprona.js",
                 "glooth-cave.js", "buster-darashia.js", "soulwar.js", "tileflags.js",
                 "book-world.js", "sir-leonard.js"])
  vm.runInContext(fs.readFileSync(path.join(js, f), "utf8"), ctx, { filename: f });
vm.runInContext("GAMEDATA=window.GAMEDATA;", ctx);
vm.runInContext("var BOSS_DEFS={};var MISSION_DEFS={};var QUEST_DEFS={};", ctx);
vm.runInContext(fs.readFileSync(path.join(js, "norcferatus-fortress.js"), "utf8"),
  ctx, { filename: "norcferatus-fortress.js" });

const M = ctx.GAMEDATA.monsters;
const HUNT_ID = "norcferatus-fortress", BOSS_ID = "vladrukh";
const COOLDOWN_20H = 20 * 60 * 60 * 1000;
const REGULAR = ["dworc-shadowstalker", "gloom-maw", "norcferatu-heartless",
  "norcferatu-nightweaver", "orclops-bloodbreaker"];
const ALL = REGULAR.concat(["varg", "vladrukh"]);

/* ---------------- hunt ---------------- */
const hu = ctx.GAMEDATA.hunts[HUNT_ID];
must(hu, "hunt ausente do GAMEDATA.hunts");
must(hu.level === 400 && hu.minLevel === 400, "hunt deve ser 400+");
must(hu.cat === "hard" && hu.packMin === 8 && hu.packMax === 10,
  "pack 8-10 / cat hard divergentes");
must(hu.monsters.length === 5 &&
  REGULAR.every((s) => hu.monsters.indexOf(s) !== -1),
  "os 5 regulares precisam estar em hunt.monsters");
must(hu.monsters.indexOf("varg") === -1,
  "varg NÃO pode estar em monsters (é extraSpawn, nunca regular)");
must(hu.extraSpawn && hu.extraSpawn.slug === "varg" &&
  hu.extraSpawn.chance === 0.03, "extraSpawn varg 3% ausente");
must(hu.respawnMs === 8000, "respawnMs deve ser 8000 (respawn de 8 em 8s)");
must(hu.spawnWeights &&
  REGULAR.every((s) => hu.spawnWeights[s] === 20),
  "spawnWeights iguais (ocorrência Comum) divergentes");
must(hu.otbm === "norcferatus_fortress" && hu.otbmFloor === 7,
  "OTBM/piso errado");
must(JSON.stringify(hu.otbmSpawn) === JSON.stringify({ x: 1021, y: 1028, z: 7 }),
  "centerroom/playerspawn diverge do informado");
must(hu.otbmMobBounds.x === 1015 && hu.otbmMobBounds.y === 1024 &&
  hu.otbmMobBounds.w === 13 && hu.otbmMobBounds.h === 8 && hu.otbmMobBounds.z === 7,
  "zona de spawn 13×8 diverge do informado");

/* ---------------- boss room + BOSS_DEFS ---------------- */
const room = ctx.GAMEDATA.hunts["vladrukh-room"];
must(room && room.hidden === true && room.monsters[0] === BOSS_ID &&
  room.pack === 1 && room.cat === "boss-room", "hunt da bossroom mal configurada");
must(JSON.stringify(room.otbmSpawn) === JSON.stringify({ x: 1023, y: 1039, z: 7 }),
  "playerspawn da bossroom diverge");
must(room.otbmMobBounds.x === 1027 && room.otbmMobBounds.y === 1036 &&
  room.otbmMobBounds.w === 1 && room.otbmMobBounds.h === 1 && room.otbmMobBounds.z === 7,
  "bossspawn diverge");

const b = ctx.BOSS_DEFS[BOSS_ID];
must(b, "vladrukh sem BOSS_DEFS");
must(b.hp === 390000 && b.exp === 450000, "hp/exp oficiais divergentes");
must(b.baseMonster === BOSS_ID && b.sprite === BOSS_ID && b.hunt === "vladrukh-room",
  "boss sem baseMonster/sprite/hunt");
must(b.cooldown === COOLDOWN_20H, "cooldown oficial é 20h");
must(b.requirement && b.requirement.level === 400 &&
  b.requirement.enforced === true &&
  b.requirement.mission === "norcferatus-fortress",
  "requirement deve exigir nível 400 + missão norcferatus-fortress (5 Vargs)");

/* ---------------- fichas oficiais ---------------- */
const STATS = {
  "dworc-shadowstalker":    [8900, 8930, 2667, 2.99, 215],
  "gloom-maw":              [8700, 8770, 2669, 2.81, 1866],
  "norcferatu-heartless":   [5700, 5900, 2664, 2.44, 1852],
  "norcferatu-nightweaver": [6100, 6370, 2666, 2.81, 1851],
  "orclops-bloodbreaker":   [10300, 10250, 2668, 3.26, 1854],
  "varg":                   [5400, 5630, 2665, 2.67, 1855],
};
for (const slug of Object.keys(STATS)) {
  const [hp, exp, raceId, mit, lt] = STATS[slug];
  const m = M[slug];
  must(m, slug + " ausente do GAMEDATA.monsters");
  must(m.hp === hp && m.exp === exp, slug + ": hp/exp divergentes");
  must(m.raceId === raceId, slug + ": raceId divergente");
  must(m.mitigation === mit, slug + ": mitigation divergente");
  must(m.looktype === lt, slug + ": looktype divergente");
  must(m.imune.indexOf("paralyze") !== -1 && m.imune.indexOf("invisible") !== -1,
    slug + ": imunidades ausentes");
  must(m.best && m.best.charm === 50, slug + ": bestiário 50 charms ausente");
  must(Array.isArray(m.skills) && m.skills.length >= 2,
    slug + ": skills ausentes");
}
const vd = M[BOSS_ID];
must(vd && vd.hp === 390000 && vd.exp === 450000 && vd.looktype === 1862,
  "vladrukh: ficha divergente");
must(vd.loot.length === 33, "vladrukh deve ter 33 drops oficiais");
/* Raros oficiais (chance 1.5): Blood Sceptre + Blood Crown; muito raros
 * oficiais (chance 0.5): as 10 peças do set Norcferatu. */
const VLADRUKH_DROPS = {};
for (const l of vd.loot) VLADRUKH_DROPS[l.item] = l.chance;
must(VLADRUKH_DROPS["blood-sceptre"] === 1.5 &&
  VLADRUKH_DROPS["blood-crown"] === 1.5,
  "vladrukh: blood-sceptre/blood-crown devem ser raros (1.5)");
const NORC_SET = ["norcferatu-bloodhide", "norcferatu-bloodstrider",
  "norcferatu-bonecloak", "norcferatu-bonehood", "norcferatu-goretrampers",
  "norcferatu-thornwraps", "norcferatu-tuskplate", "norcferatu-skullguard",
  "norcferatu-fleshguards", "norcferatu-fangstompers"];
for (const s of NORC_SET)
  must(VLADRUKH_DROPS[s] === 0.5,
    "vladrukh: " + s + " deve ser muito raro (0.5)");

/* ---------------- contagens oficiais de loot ---------------- */
const LOOT_COUNT = {
  "dworc-shadowstalker": 13, "gloom-maw": 12, "norcferatu-heartless": 13,
  "norcferatu-nightweaver": 11, "orclops-bloodbreaker": 14, "varg": 9,
};
for (const slug of Object.keys(LOOT_COUNT)) {
  const m = M[slug];
  must(m.loot.length === LOOT_COUNT[slug],
    slug + ": " + LOOT_COUNT[slug] + " drops oficiais esperados, tem " + m.loot.length);
  must(m.loot[0].item === "platinum-coin" && m.loot[0].chance === 100,
    slug + ": platinum-coin comum ausente");
}

/* ---------------- itens novos: catálogo cliente+servidor ---------------- */
const NEW_ITEMS = {
  "blood-amulet": [51473, 1230], "bone-rattle": [51478, 790],
  "norcferatu-talisman": [51714, 670], "chain-leash": [51472, 970],
  "piece-of-frozen-night": [51474, 680], "tiny-bat-coffin": [51471, 3650],
  "heart-amphora": [51484, 930], "pot-of-orcish-warpaint": [51476, 1150],
  "spiked-gorget": [51486, 850], "greater-garlic-necklace": [51275, 10000],
  "blood-hood": [51480, 1550], "spiked-bracers": [51479, 1360],
  "orcish-toothbrush": [51477, 750], "bone-fibula": [51485, 580],
  "bloodshot-giant-eye": [51482, 1820], "ritual-bone-knife": [51475, 820],
  "greater-proficiency-catalyst": [51589, 0], "blood-sceptre": [51481, 178000],
  "blood-crown": [51483, 116000],
  "war-drum": [2966, 1000], "bone-toothpick": [24380, 150],
  "bast-skirt": [3560, 750],
};
/* Set Norcferatu: equipamentos do weapondata (guardam o client id no
 * campo `id`, não `cid`) — drops muito raros do Vladrukh. */
const NORC_SET_ITEMS = {
  "norcferatu-skullguard": [51260, 528], "norcferatu-bonehood": [51261, 304],
  "norcferatu-tuskplate": [51262, 1184], "norcferatu-bloodhide": [51263, 768],
  "norcferatu-bonecloak": [51264, 768], "norcferatu-thornwraps": [51265, 560],
  "norcferatu-bloodstrider": [51266, 1184], "norcferatu-fleshguards": [51267, 240],
  "norcferatu-goretrampers": [51268, 544], "norcferatu-fangstompers": [51269, 736],
};
const catalog = { console }; catalog.window = catalog; vm.createContext(catalog);
for (const file of ["gamedata.js", "weapondata.js", "weapons.js", "quiverdata.js",
  "core.js", "accessorydata.js", "supply-stash-data.js", "supplydata.js", "supplies.js",
  "yasir-prices.js", "hardcore-library.js", "hard-hunts.js", "magma-bubble.js", "gnomprona.js",
  "falcon-bastion.js", "deathlings-sunken-temple.js",
  "azzilon-castle.js", "bloodrotten.js", "glooth-cave.js", "buried-cathedral.js",
  "buster-darashia.js", "urmahlullu.js", "bashmuul-issavi.js", "true-asuras.js",
  "mimar-haffar.js", "moonstone-castle.js", "radiant-skyhold.js", "book-world.js",
  "sir-leonard.js", "norcferatus-fortress.js"]) {
  vm.runInContext(fs.readFileSync(path.join(js, file), "utf8"), catalog, { filename: file });
  if (file === "weapons.js") vm.runInContext("fundirWeaponData()", catalog);
}
const E = engine;
for (const slug of Object.keys(NEW_ITEMS)) {
  const [cid, sell] = NEW_ITEMS[slug];
  const client = catalog.GAMEDATA.items[slug], server = E.ITEMS[slug];
  must(client && server, slug + ": ausente no cliente ou no servidor");
  must(client.cid === cid && server.cid === cid,
    slug + ": cid divergente (" + cid + ")");
  must(Number(client.sell) === sell && Number(server.sell) === sell,
    slug + ": preço NPC divergente (" + sell + ")");
  must(fs.existsSync(path.join(game, "assets", "item", slug + ".png")),
    slug + ": ícone ausente");
}
for (const slug of Object.keys(NORC_SET_ITEMS)) {
  const [id, sell] = NORC_SET_ITEMS[slug];
  const client = catalog.GAMEDATA.items[slug], server = E.ITEMS[slug];
  must(client && server, slug + ": ausente no cliente ou no servidor");
  must(client.id === id && server.id === id,
    slug + ": id divergente (" + id + ")");
  must(Number(client.sell) === sell && Number(server.sell) === sell,
    slug + ": preço NPC divergente (" + sell + ")");
  must(fs.existsSync(path.join(game, "assets", "item", slug + ".png")),
    slug + ": ícone ausente");
}
/* Greater Proficiency Catalyst: sem comprador NPC → sell 0. Tiny Bat
 * Coffin (3650) e War Drum (1000) têm preço fixado por pedido. */
for (const slug of ["greater-proficiency-catalyst"]) {
  must(Number(catalog.GAMEDATA.items[slug].sell) === 0,
    slug + ": sem comprador oficial — sell deve ser 0");
}
const known = new Set(Object.keys(catalog.GAMEDATA.items)
  .concat(Object.keys(catalog.AMMODATA ? catalog.AMMODATA.ammo || {} : {}))
  .concat(Object.keys(catalog.QUIVERDATA ? catalog.QUIVERDATA.ammo || {} : {})));
for (const slug of ALL)
  for (const l of M[slug].loot)
    must(known.has(l.item), slug + ": drop fora do catálogo: " + l.item);

/* ---------------- sprites 9×4 de 64×64 ---------------- */
for (const slug of ALL) {
  const sheet = ctx.MOBSHEETS[slug];
  const png = fs.readFileSync(path.join(game, "assets", "mob", slug + ".png"));
  must(sheet && sheet.cw === 64 && sheet.ch === 64 && sheet.cols === 9 &&
    sheet.rows === 4, slug + ": MOBSHEETS divergente (9×4 de 64×64)");
  must(png.readUInt32BE(16) === 576 && png.readUInt32BE(20) === 256,
    slug + ": sheet deve ser 576×256");
}

/* ---------------- engine ---------------- */
for (const slug of ALL)
  must(E.MONSTERS[slug], "engine: " + slug + " ausente do MONSTERS");
const eh = E.HUNTS[HUNT_ID];
must(eh && eh.monsters.length === 5 && eh.extraSpawn &&
  eh.extraSpawn.slug === "varg" && eh.extraSpawn.chance === 0.03 &&
  eh.respawnMs === 8000 && eh.packMin === 8 && eh.packMax === 10,
  "engine: hunt sem extraSpawn/respawnMs/pack");
must(E.HUNTS["vladrukh-room"] && E.HUNTS["vladrukh-room"].monsters[0] === BOSS_ID,
  "engine: vladrukh-room ausente");
const engineSrc = fs.readFileSync(path.join(__dirname, "..", "server", "authoritative_engine.js"), "utf8");
must(engineSrc.includes('"norcferatus-fortress.js"'),
  "engine não carrega norcferatus-fortress.js no sandbox de itens");
must(engineSrc.includes('require("../game/js/norcferatus-fortress.js")'),
  "engine sem require/registerMonsters do patch");
must(engineSrc.includes("extraSpawn") && engineSrc.includes("respawnMs"),
  "engine sem suporte a extraSpawn/respawnMs");
must(engineSrc.includes("progress.varg") ||
  engineSrc.includes("mission.progress[mob.slug]"),
  "engine precisa incrementar progress por slug (5 Vargs)");
/* Varg kills contam na missão via mission.progress[mob.slug] — o mesmo
 * handler cobre huntId = norcferatus-fortress. */
must(engineSrc.includes("progress[mob.slug]"),
  "engine sem incremento de progress por monstro");

/* ---------------- spawnWave do cliente ---------------- */
const combatSrc = fs.readFileSync(path.join(js, "combat.js"), "utf8");
must(combatSrc.includes("extraSpawn") && combatSrc.includes("wantTotal"),
  "combat.spawnWave sem a mecânica do extraSpawn");
must(combatSrc.includes("respawnMs"),
  "combat.js sem respawnMs por hunt");

/* ---------------- mapa publicado + caminhável ---------------- */
const runtimeMap = path.join(game, "maps", "norcferatus_fortress.otbm");
const betaMap = path.join(game, "beta-maps", "bossesroom", "norcferatus_fortress.otbm");
must(fs.existsSync(runtimeMap), "norcferatus_fortress.otbm não publicado");
must(fs.existsSync(betaMap), "OTBM beta ausente");
must(fs.readFileSync(runtimeMap).equals(fs.readFileSync(betaMap)),
  "runtime e beta divergentes");
const tfCtx = { console }; tfCtx.window = tfCtx; vm.createContext(tfCtx);
vm.runInContext(fs.readFileSync(path.join(js, "tileflags.js"), "utf8"), tfCtx);
const mapBuf = fs.readFileSync(runtimeMap);
const map = OTBM.read(mapBuf.buffer.slice(mapBuf.byteOffset, mapBuf.byteOffset + mapBuf.byteLength), { z: 7 });
must(map.z === 7 && map.w === 25 && map.h === 25 && map.sourceBounds,
  "OTBM z=7 25×25 incorreto");
must(map.sourceBounds.minX === 1009 && map.sourceBounds.minY === 1015 &&
  map.sourceBounds.maxX === 1033 && map.sourceBounds.maxY === 1039,
  "sourceBounds divergente (1009..1033 × 1015..1039)");
/* Zonas absolutas → locais (espelho do applyHuntOtbmZones do cliente). */
map.spawn = { x: hu.otbmSpawn.x - 1009, y: hu.otbmSpawn.y - 1015 };
map.mob = [{
  x: hu.otbmMobBounds.x - 1009, y: hu.otbmMobBounds.y - 1015,
  w: hu.otbmMobBounds.w, h: hu.otbmMobBounds.h,
}];
const hm = OTBM.huntMapFromOtbm(map, tfCtx.TILEFLAGS || {});
const walk = (ax, ay) => {
  const x = ax - map.sourceBounds.minX, y = ay - map.sourceBounds.minY;
  if (x < 0 || y < 0 || x >= map.w || y >= map.h) return false;
  const entry = hm.leg[hm.rows[y][x]];
  return !!(entry && !entry.bloc && !hm.footprintBlocked[x + ":" + y]);
};
must(walk(1021, 1028), "centerroom/playerspawn {1021,1028} bloqueado");
must(walk(1023, 1039), "playerspawn bossroom {1023,1039} bloqueado");
must(walk(1027, 1036), "bossspawn {1027,1036} bloqueado");
/* Zona de spawn 13×8: 96 sqm caminháveis, todos conectados. */
{
  let cells = 0;
  const W = hm.rows[0].length, H = hm.rows.length, seen = {};
  const sx = 1015 - 1009, sy = 1024 - 1015;
  for (let y = 0; y < 8; y++)
    for (let x = 0; x < 13; x++)
      if (walk(1015 + x, 1024 + y)) cells++;
  must(cells === 94, "zona de spawn deve ter 94 sqm caminháveis: " + cells);
  let start = null;
  for (let y = 0; y < 8 && !start; y++)
    for (let x = 0; x < 13 && !start; x++)
      if (walk(1015 + x, 1024 + y)) start = [sx + x, sy + y];
  const q = [start]; seen[start[0] + "," + start[1]] = 1;
  while (q.length) {
    const [x, y] = q.pop();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy, k = nx + "," + ny;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H || seen[k]) continue;
      const e = hm.leg[hm.rows[ny][nx]];
      if ((e && e.bloc) || hm.footprintBlocked[nx + ":" + ny]) continue;
      seen[k] = 1; q.push([nx, ny]);
    }
  }
  for (let y = 0; y < 8; y++)
    for (let x = 0; x < 13; x++)
      if (walk(1015 + x, 1024 + y))
        must(seen[(sx + x) + "," + (sy + y)],
          "célula da zona de spawn desconectada: " + (1015 + x) + "," + (1024 + y));
}
/* Bossroom: playerspawn alcança bossspawn/centro (80 sqm conectados). */
{
  const W = hm.rows[0].length, H = hm.rows.length, seen = {};
  const start = [1023 - 1009, 1039 - 1015];
  const q = [start]; seen[start[0] + "," + start[1]] = 1;
  while (q.length) {
    const [x, y] = q.pop();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy, k = nx + "," + ny;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H || seen[k]) continue;
      const e = hm.leg[hm.rows[ny][nx]];
      if ((e && e.bloc) || hm.footprintBlocked[nx + ":" + ny]) continue;
      seen[k] = 1; q.push([nx, ny]);
    }
  }
  must(seen[(1027 - 1009) + "," + (1036 - 1015)],
    "playerspawn não alcança o bossspawn");
  must(seen[(1026 - 1009) + "," + (1037 - 1015)],
    "playerspawn não alcança o centerroom");
}
/* TODOS os tiles usados pelo mapa têm sprite físico + catálogo do editor. */
{
  const used = new Set();
  Object.values(map.cells).forEach((c) => {
    if (c.g) used.add(c.g);
    (c.items || []).forEach((id) => used.add(id));
  });
  const missingPng = [];
  for (const id of used)
    if (!fs.existsSync(path.join(game, "assets", "tiles", id + ".png")))
      missingPng.push(id);
  must(missingPng.length === 0, "tiles sem sprite: " + missingPng.join(","));
  const rmeCtx = { window: {} }; rmeCtx.window = rmeCtx; vm.createContext(rmeCtx);
  vm.runInContext(fs.readFileSync(path.join(game, "rme", "data", "known_tiles.js"), "utf8"), rmeCtx);
  const unlisted = OTBM.missingTiles(map, rmeCtx.RME_KNOWN_TILES);
  must(unlisted.length === 0,
    "tiles fora do catálogo RME: " + unlisted.join(", "));
}

/* ---------------- Bloody Tusks Quest ---------------- */
const md = ctx.MISSION_DEFS[HUNT_ID];
must(md && Array.isArray(md.tasks) && md.tasks.length === 1 &&
  md.tasks[0].monster === "varg" && md.tasks[0].target === 5,
  "MISSION_DEFS deve ser task monster varg target 5");
must(md.completeReward && md.completeReward.bossAccess === "vladrukh",
  "recompensa da M1 deve liberar o acesso ao Vladrukh");
const q = ctx.QUEST_DEFS["bloody-tusks-quest"];
must(q && q.questType === "boss" && q.worldQuest === true && q.level === 400 &&
  typeof q.renderDetail === "function" && q.bossSprite === "vladrukh",
  "QUEST_DEFS bloody-tusks-quest divergente");
/* Reward oficial: montaria Gloom Maw (não existe Varg mount) — catálogo
 * de cosméticos com requirement vladrukh + assets + grant no wardrobe. */
const cosmeticSrc = fs.readFileSync(path.join(js, "cosmetic-npcs-data.js"), "utf8");
must(cosmeticSrc.includes('target: "gloom-maw"') &&
  cosmeticSrc.includes('requirement: "vladrukh"'),
  "montaria gloom-maw com requirement vladrukh ausente do catálogo");
must(fs.existsSync(path.join(game, "assets", "appearance", "mount", "gloom-maw.base.png")),
  "asset da montaria gloom-maw ausente");
const wardrobeSrc = fs.readFileSync(path.join(__dirname, "..", "server", "wardrobe.js"), "utf8");
must(wardrobeSrc.includes("vladrukh") && wardrobeSrc.includes('"gloom-maw"'),
  "wardrobe.js deve conceder gloom-maw em kill do vladrukh");

/* ---------------- seções dos modais + index ---------------- */
const hs = fs.readFileSync(path.join(js, "hunt-sections.js"), "utf8");
const iNf = hs.indexOf('"norcferatus-fortress"');
must(iNf > -1, "hunt fora do HUNT_MODAL_SECTIONS");
must(hs.slice(0, iNf).lastIndexOf('title: "HUNTS 400+"') >
  hs.slice(0, iNf).lastIndexOf('title: "HUNTS 300+'),
  "norcferatus-fortress deveria estar na seção HUNTS 400+");
const gameSrc = fs.readFileSync(path.join(js, "game.js"), "utf8");
const iSec = gameSrc.indexOf('title: "BOSSES 400+"');
must(iSec > -1, "seção BOSSES 400+ ausente");
must(gameSrc.indexOf('"vladrukh"', iSec) > -1 &&
  gameSrc.indexOf('"vladrukh"', iSec) < gameSrc.indexOf('title:', iSec + 10),
  "vladrukh deveria estar na seção BOSSES 400+");
const html = fs.readFileSync(path.join(game, "index.html"), "utf8");
must(html.includes("js/norcferatus-fortress.js?v="),
  "norcferatus-fortress.js não carregado no index");

console.log("OK — Norcferatus Fortress: OTBM 25×25 z=7, zona 13×8 (94 sqm " +
  "conectados), 5 regulares + Varg extra 3%/onda + respawn 8s, " +
  "Vladrukh 390k/450k cooldown 20h (33 drops: raros blood-sceptre/" +
  "blood-crown + set Norcferatu muito raro), Bloody Tusks Quest " +
  "(M1 5 Vargs → boss, M2 boss → montaria Gloom Maw), " +
  "22 itens novos, BOSSES/HUNTS 400+.");
