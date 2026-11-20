/* Regressão: Unhallowed Crypt — hunt 400+ (update 15.20, ausente do
 * dump Canary).
 *
 * Mapa: game/maps/unhallowed_crypt.otbm publicado byte-igual de
 * beta-maps/Unhallowed_Crypt.otbm — 34×27 z=7, bounds 1009..1042 ×
 * 1016..1042.
 *   centermap/playerspawn {1027,1030,7}
 *   zona de spawn         {1021,1028,7} → {1030,1034,7} (10×7, 60 sqm
 *                         caminháveis conectados — pós-import das flags)
 *   respawn               8 a 12 monstros por onda (pack 8–12)
 *
 * Monstros (fichas oficiais TibiaWiki/tibia.gg):
 *   creepy-crawler    27000/22380  raceId 2763  looktype 1890  sheet 9×4 (57×57)
 *   crypt-construct   25000/19730  raceId 2760  looktype 1887  sheet 9×4 (64×64)
 *   crypt-fiend       30000/19070  raceId 2758  looktype 1885  sheet 9×4 (64×64)
 *   Todas: Skeletons/Undead Challenging (200/2.000/5.000 → 100 charms,
 *   stars 5), melee, paraimmune + senseinvis.
 *   Fear (Crawler) segue o modelo Soul War: n:"fear" sem dano — a
 *   condição feared é aplicada no cliente; no servidor entra só o fx.
 *   Area Healing (Construct) vira defSkills {n:"healing"} 10000–13250.
 *
 * Itens novos (cids 15.20): amber 32626→20000, necromantic-core
 * 52705→10000, toe-nails 52706→4500, giant-tusk 52707→6000,
 * fetid-heart 52708→0 (sem comprador NPC — item de quest),
 * crystallized-death 52719→3000, cluster-of-crystallized-death
 * 52720→9000.
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
                 "glooth-cave.js", "buster-darashia.js", "soulwar.js", "tileflags.js"])
  vm.runInContext(fs.readFileSync(path.join(js, f), "utf8"), ctx, { filename: f });
vm.runInContext("GAMEDATA=window.GAMEDATA;", ctx);
vm.runInContext(fs.readFileSync(path.join(js, "unhallowed-crypt.js"), "utf8"),
  ctx, { filename: "unhallowed-crypt.js" });

const M = ctx.GAMEDATA.monsters;
const HUNT_ID = "unhallowed-crypt";
const ALL = ["creepy-crawler", "crypt-construct", "crypt-fiend"];

/* ---------------- hunt ---------------- */
const hu = ctx.GAMEDATA.hunts[HUNT_ID];
must(hu, "hunt ausente do GAMEDATA.hunts");
must(hu.level === 400 && hu.minLevel === 400, "hunt deve ser 400+");
must(hu.cat === "hard" && hu.packMin === 8 && hu.packMax === 12,
  "pack 8-12 / cat hard divergentes");
must(hu.monsters.length === 3 &&
  ALL.every((s) => hu.monsters.indexOf(s) !== -1),
  "os 3 monstros precisam estar em hunt.monsters");
must(hu.spawnWeights &&
  ALL.every((s) => hu.spawnWeights[s] === 20),
  "spawnWeights iguais (ocorrência Regular) divergentes");
must(hu.otbm === "unhallowed_crypt" && hu.otbmFloor === 7,
  "OTBM/piso errado");
must(JSON.stringify(hu.otbmSpawn) === JSON.stringify({ x: 1027, y: 1030, z: 7 }),
  "centermap/playerspawn diverge do informado");
must(hu.otbmMobBounds.x === 1021 && hu.otbmMobBounds.y === 1028 &&
  hu.otbmMobBounds.w === 10 && hu.otbmMobBounds.h === 7 && hu.otbmMobBounds.z === 7,
  "zona de spawn 10×7 diverge do informado");

/* ---------------- fichas oficiais ---------------- */
const STATS = {
  "creepy-crawler":   [27000, 22380, 2763, 6.60, 1890, 100],
  "crypt-construct":  [25000, 19730, 2760, 5.36, 1887, 100],
  "crypt-fiend":      [30000, 19070, 2758, 4.39, 1885, 140],
};
for (const slug of Object.keys(STATS)) {
  const [hp, exp, raceId, mit, lt, armor] = STATS[slug];
  const m = M[slug];
  must(m, slug + " ausente do GAMEDATA.monsters");
  must(m.hp === hp && m.exp === exp, slug + ": hp/exp divergentes");
  must(m.raceId === raceId, slug + ": raceId divergente");
  must(m.mitigation === mit, slug + ": mitigation divergente");
  must(m.looktype === lt, slug + ": looktype divergente");
  must(m.armor === armor, slug + ": armor divergente");
  must(m.imune.indexOf("paralyze") !== -1 && m.imune.indexOf("invisible") !== -1,
    slug + ": imunidades ausentes");
  must(m.best && m.best.charm === 100 && m.best.stars === 5 &&
    m.best.toKill === 5000, slug + ": bestiário Challenging ausente");
  must(Array.isArray(m.skills) && m.skills.length >= 2,
    slug + ": skills ausentes");
}
/* Mecânicas oficiais: Fear no Crawler, Area Healing no Construct,
 * som "Uhhh!" no Fiend. */
must(M["creepy-crawler"].skills.some((s) => s.n === "fear"),
  "creepy-crawler sem a skill fear oficial");
must(M["crypt-construct"].defSkills &&
  M["crypt-construct"].defSkills.some((s) => s.n === "healing" &&
    s.min === 10000 && s.max === 13250),
  "crypt-construct sem Area Healing 10000-13250");
must(M["crypt-fiend"].voices &&
  M["crypt-fiend"].voices.list.some((v) => v.t === "Uhhh!"),
  "crypt-fiend sem o som oficial Uhhh!");

/* ---------------- contagens oficiais de loot ---------------- */
const LOOT_COUNT = {
  "creepy-crawler": 11, "crypt-construct": 13, "crypt-fiend": 12,
};
for (const slug of Object.keys(LOOT_COUNT)) {
  const m = M[slug];
  must(m.loot.length === LOOT_COUNT[slug],
    slug + ": " + LOOT_COUNT[slug] + " drops oficiais esperados, tem " + m.loot.length);
  must(m.loot[0].item === "crystal-coin",
    slug + ": crystal-coin comum ausente");
}

/* ---------------- itens novos: catálogo cliente+servidor ---------------- */
const NEW_ITEMS = {
  "amber": [32626, 20000],
  "necromantic-core": [52705, 10000],
  "toe-nails": [52706, 4500],
  "giant-tusk": [52707, 6000],
  "fetid-heart": [52708, 0],
  "crystallized-death": [52719, 3000],
  "cluster-of-crystallized-death": [52720, 9000],
};
const catalog = { console }; catalog.window = catalog; vm.createContext(catalog);
for (const file of ["gamedata.js", "weapondata.js", "weapons.js", "quiverdata.js",
  "core.js", "accessorydata.js", "supply-stash-data.js", "supplydata.js", "supplies.js",
  "yasir-prices.js", "hardcore-library.js", "hard-hunts.js", "magma-bubble.js", "gnomprona.js",
  "falcon-bastion.js", "deathlings-sunken-temple.js",
  "azzilon-castle.js", "bloodrotten.js", "glooth-cave.js", "buried-cathedral.js",
  "buster-darashia.js", "urmahlullu.js", "bashmuul-issavi.js", "true-asuras.js",
  "mimar-haffar.js", "moonstone-castle.js", "radiant-skyhold.js", "book-world.js",
  "sir-leonard.js", "norcferatus-fortress.js", "unhallowed-crypt.js"]) {
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
/* Fetid Heart: item de quest sem comprador NPC → sell 0 (mesmo
 * tratamento do unstable-darklight-matter). */
must(Number(catalog.GAMEDATA.items["fetid-heart"].sell) === 0,
  "fetid-heart: sem comprador oficial — sell deve ser 0");
const known = new Set(Object.keys(catalog.GAMEDATA.items)
  .concat(Object.keys(catalog.AMMODATA ? catalog.AMMODATA.ammo || {} : {}))
  .concat(Object.keys(catalog.QUIVERDATA ? catalog.QUIVERDATA.ammo || {} : {})));
for (const slug of ALL)
  for (const l of M[slug].loot)
    must(known.has(l.item), slug + ": drop fora do catálogo: " + l.item);

/* ---------------- sprites: MOBSHEETS casa com o PNG real ---------------- */
for (const slug of ALL) {
  const sheet = ctx.MOBSHEETS[slug];
  must(sheet && sheet.rows === 4 && sheet.cols >= 3,
    slug + ": MOBSHEETS divergente");
  const png = fs.readFileSync(path.join(game, "assets", "mob", slug + ".png"));
  must(png.readUInt32BE(16) === sheet.cw * sheet.cols &&
    png.readUInt32BE(20) === sheet.ch * sheet.rows,
    slug + ": dimensões do PNG não batem com o MOBSHEETS");
}
/* Looktypes reais do DAT: as 4 linhas de cada sheet são direções
 * distintas (validado no import — row hashes diferentes — e por
 * inspeção visual dos PNGs). */
const caCtx = { console }; caCtx.window = caCtx; vm.createContext(caCtx);
vm.runInContext(fs.readFileSync(path.join(js, "creatureanchordata.js"), "utf8"), caCtx);
for (const slug of ALL)
  must(caCtx.CREATURE_ANCHORS && caCtx.CREATURE_ANCHORS[slug] &&
    caCtx.CREATURE_ANCHORS[slug].sw === 64 && caCtx.CREATURE_ANCHORS[slug].sh === 64,
    slug + ": âncora CREATURE_ANCHORS ausente (canvas 64×64)");

/* ---------------- engine ---------------- */
for (const slug of ALL)
  must(E.MONSTERS[slug], "engine: " + slug + " ausente do MONSTERS");
const eh = E.HUNTS[HUNT_ID];
must(eh && eh.monsters.length === 3 && eh.packMin === 8 && eh.packMax === 12 &&
  ALL.every((s) => eh.spawnWeights[s] === 20),
  "engine: hunt sem pack 8-12/spawnWeights");
const engineSrc = fs.readFileSync(path.join(__dirname, "..", "server", "authoritative_engine.js"), "utf8");
must(engineSrc.includes('"unhallowed-crypt.js"'),
  "engine não carrega unhallowed-crypt.js no sandbox de itens");
must(engineSrc.includes('require("../game/js/unhallowed-crypt.js")'),
  "engine sem require/registerMonsters do patch");

/* ---------------- mapa publicado + caminhável ---------------- */
const runtimeMap = path.join(game, "maps", "unhallowed_crypt.otbm");
const betaMap = path.join(game, "beta-maps", "Unhallowed_Crypt.otbm");
must(fs.existsSync(runtimeMap), "unhallowed_crypt.otbm não publicado");
must(fs.existsSync(betaMap), "OTBM beta ausente");
must(fs.readFileSync(runtimeMap).equals(fs.readFileSync(betaMap)),
  "runtime e beta divergentes");
const tfCtx = { console }; tfCtx.window = tfCtx; vm.createContext(tfCtx);
vm.runInContext(fs.readFileSync(path.join(js, "tileflags.js"), "utf8"), tfCtx);
const mapBuf = fs.readFileSync(runtimeMap);
const map = OTBM.read(mapBuf.buffer.slice(mapBuf.byteOffset, mapBuf.byteOffset + mapBuf.byteLength), { z: 7 });
must(map.z === 7 && map.w === 34 && map.h === 27 && map.sourceBounds,
  "OTBM z=7 34×27 incorreto");
must(map.sourceBounds.minX === 1009 && map.sourceBounds.minY === 1016 &&
  map.sourceBounds.maxX === 1042 && map.sourceBounds.maxY === 1042,
  "sourceBounds divergente (1009..1042 × 1016..1042)");
/* Zonas absolutas → locais (espelho do applyHuntOtbmZones do cliente). */
map.spawn = { x: hu.otbmSpawn.x - 1009, y: hu.otbmSpawn.y - 1016 };
map.mob = [{
  x: hu.otbmMobBounds.x - 1009, y: hu.otbmMobBounds.y - 1016,
  w: hu.otbmMobBounds.w, h: hu.otbmMobBounds.h,
}];
const hm = OTBM.huntMapFromOtbm(map, tfCtx.TILEFLAGS || {});
const walk = (ax, ay) => {
  const x = ax - map.sourceBounds.minX, y = ay - map.sourceBounds.minY;
  if (x < 0 || y < 0 || x >= map.w || y >= map.h) return false;
  const entry = hm.leg[hm.rows[y][x]];
  return !!(entry && !entry.bloc && !hm.footprintBlocked[x + ":" + y]);
};
must(walk(1027, 1030), "centermap/playerspawn {1027,1030} bloqueado");
/* Zona de spawn 10×7: 60 sqm caminháveis, todos conectados. */
{
  let cells = 0;
  const W = hm.rows[0].length, H = hm.rows.length, seen = {};
  const sx = 1021 - 1009, sy = 1028 - 1016;
  for (let y = 0; y < 7; y++)
    for (let x = 0; x < 10; x++)
      if (walk(1021 + x, 1028 + y)) cells++;
  must(cells === 60, "zona de spawn deve ter 60 sqm caminháveis: " + cells);
  let start = null;
  for (let y = 0; y < 7 && !start; y++)
    for (let x = 0; x < 10 && !start; x++)
      if (walk(1021 + x, 1028 + y)) start = [sx + x, sy + y];
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
  for (let y = 0; y < 7; y++)
    for (let x = 0; x < 10; x++)
      if (walk(1021 + x, 1028 + y))
        must(seen[(sx + x) + "," + (sy + y)],
          "célula da zona de spawn desconectada: " + (1021 + x) + "," + (1028 + y));
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

/* ---------------- seções dos modais + index ---------------- */
const hs = fs.readFileSync(path.join(js, "hunt-sections.js"), "utf8");
const iUc = hs.indexOf('"unhallowed-crypt"');
must(iUc > -1, "hunt fora do HUNT_MODAL_SECTIONS");
must(hs.slice(0, iUc).lastIndexOf('title: "HUNTS 400+"') >
  hs.slice(0, iUc).lastIndexOf('title: "HUNTS 300+'),
  "unhallowed-crypt deveria estar na seção HUNTS 400+");
const html = fs.readFileSync(path.join(game, "index.html"), "utf8");
must(html.includes("js/unhallowed-crypt.js?v="),
  "unhallowed-crypt.js não carregado no index");

console.log("OK — Unhallowed Crypt: OTBM 34×27 z=7, zona 10×7 (60 sqm " +
  "conectados), pack 8-12, 3 monstros 15.20 (Creepy Crawler 27k + Fear, " +
  "Crypt Construct 25k + Area Heal 10-13.25k, Crypt Fiend 30k), " +
  "7 itens novos (fetid-heart sell 0), sheets reais 9×4 do DAT, " +
  "HUNTS 400+.");
