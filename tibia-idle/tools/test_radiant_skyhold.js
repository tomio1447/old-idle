/* Regressão: hunt RADIANT SKYHOLD (categoria HUNTS 800+).
 * 6 criaturas Radiant do update 15.30, 8–10 por onda, OTBM próprio z=7.
 * Mapa: game/maps/radiant_skyhold.otbm publicado byte-igual a partir
 * de beta-maps/radiant_skyhold.otbm — 38×29, bounds
 * 1008..1045 × 1016..1044.
 *   centermap     {1026,1030,7} (caminhável → spawn do jogador)
 *   respawnradius {1016,1024,7} → {1034,1036,7} (19×13; 242 sqm
 *                 caminháveis conectados)
 * Fichas oficiais (TibiaWiki BR / TibiaRealm) em game/js/radiant-skyhold.js:
 *   Radiant Acolyte 34.600/32.960 · Radiant Paragon 36.000/34.780 ·
 *   Radiant Warden 38.500/35.540 · Devoted Acolyte 39.790/47.820 ·
 *   Devoted Paragon 41.400/50.560 · Devoted Warden 44.275/51.280.
 * Sprites base = looktypes do DAT convertido (1969/1966/1964, match
 * pixel a pixel vs GIFs oficiais); devoted = sheets montadas dos GIFs
 * oficiais (variantes ausentes do DAT convertido).
 * Loot: 8 itens registrados, todos sem comprador NPC → sell 0
 * (Lunar Ascension Orb é consumível do Weapon Proficiency;
 * Blank Imbuement Scroll e Blue Quiver são só VENDIDOS por NPC). */
"use strict";
const fs = require("fs"), path = require("path"), vm = require("vm");
const game = path.join(__dirname, "..", "game"), js = path.join(game, "js");
const OTBM = require(path.join(js, "otbm.js"));
function must(ok, msg) { if (!ok) throw Error(msg); }
const ctx = { window: {}, console, Math, Date, Map, Set };
ctx.window = ctx;
vm.createContext(ctx);
for (const file of ["gamedata.js", "monsterdata.js", "mobsheetdata.js",
  "accessorydata.js", "bashmuul-issavi.js", "braingrounds-venore.js",
  "true-asuras.js", "moonstone-castle.js", "radiant-skyhold.js",
  "hunt-sections.js", "tileflags.js"])
  vm.runInContext(fs.readFileSync(path.join(js, file), "utf8"), ctx, { filename: file });
ctx.addEventListener = () => {};
vm.runInContext(fs.readFileSync(path.join(js, "otbmhunt.js"), "utf8"), ctx);

const hunt = ctx.GAMEDATA.hunts["radiant-skyhold"];
must(hunt && hunt.name === "Radiant Skyhold", "hunt radiant-skyhold ausente/nome errado");
must(hunt.level === 800 && hunt.minLevel === 800, "nível deve ser 800");
const SPECIES = ["radiant-acolyte", "radiant-paragon", "radiant-warden",
  "devoted-radiant-acolyte", "devoted-radiant-paragon", "devoted-radiant-warden"];
must(JSON.stringify(hunt.monsters) === JSON.stringify(SPECIES), "monstros divergentes");
for (const slug of SPECIES)
  must(typeof hunt.spawnWeights[slug] === "number" && hunt.spawnWeights[slug] > 0,
    "spawnWeights ausente em " + slug);
must(hunt.pack === 10 && hunt.packMin === 8 && hunt.packMax === 10, "pack deve ser 8–10");
must(hunt.otbm === "radiant_skyhold" && hunt.otbmFloor === 7, "OTBM/piso errado");
must(JSON.stringify(hunt.otbmSpawn) === JSON.stringify({ x: 1026, y: 1030, z: 7 }),
  "spawn diverge do centermap informado");
must(JSON.stringify(hunt.otbmMobBounds) === JSON.stringify({ x: 1016, y: 1024, w: 19, h: 13, z: 7 }),
  "respawnradius diverge das coordenadas informadas");

// OTBM publicado: byte-identico à origem e só z=7.
const bytes = fs.readFileSync(path.join(game, "maps", "radiant_skyhold.otbm"));
must(bytes.equals(fs.readFileSync(path.join(game, "beta-maps", "radiant_skyhold.otbm"))),
  "OTBM publicado diverge de beta-maps");
const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
for (let z = 0; z < 16; z++) must(OTBM.read(ab, { z }).z === 7, "andar inesperado no OTBM");
const parsed = OTBM.read(ab, { z: 7 });
const b = parsed.sourceBounds;
must(parsed.w === 38 && parsed.h === 29 && b.minX === 1008 && b.minY === 1016 &&
  b.maxX === 1045 && b.maxY === 1044, "bounds reais do OTBM divergem");
for (const cell of Object.values(parsed.cells)) for (const id of [cell.g, ...cell.items])
  must(!id || fs.existsSync(path.join(game, "assets", "tiles", id + ".png")),
    "tile sem sprite: " + id);
{
  const rmeCtx = { window: {} }; rmeCtx.window = rmeCtx; vm.createContext(rmeCtx);
  vm.runInContext(fs.readFileSync(path.join(game, "rme", "data", "known_tiles.js"), "utf8"), rmeCtx);
  const unlisted = OTBM.missingTiles(parsed, rmeCtx.RME_KNOWN_TILES);
  must(unlisted.length === 0,
    "tiles da radiant_skyhold fora do catálogo RME: " + unlisted.join(", "));
}

// Zonas absolutas → locais; spawn e área de respawn caminháveis e conectadas.
ctx.applyHuntOtbmZones(parsed, hunt);
must(parsed.spawn.x === 18 && parsed.spawn.y === 14, "spawn local errado (esperado 18,14)");
must(parsed.mob.length === 247, "zona de respawn deve cobrir 19×13 = 247 sqm");
const runtime = OTBM.huntMapFromOtbm(parsed, ctx.TILEFLAGS);
const walkable = (x, y) => runtime.rows[y] && runtime.rows[y][x] &&
  !runtime.leg[runtime.rows[y][x]].bloc;
must(walkable(runtime.spawn.x, runtime.spawn.y), "jogador nasce em célula bloqueada");
const reached = new Set(), queue = [runtime.spawn];
for (let i = 0; i < queue.length; i++) {
  const { x, y } = queue[i], key = x + "," + y;
  if (reached.has(key) || !walkable(x, y)) continue;
  reached.add(key);
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]])
    queue.push({ x: x + dx, y: y + dy });
}
let available = 0;
for (const c of parsed.mob) if (reached.has(c.x + "," + c.y)) available++;
must(available === 242, "respawn conectado diverge do analisado: " + available);
must(available >= 10 * 2, "respawn sem área conectada para o pack máximo");

// Categoria HUNTS 800+ (nova): radiant-skyhold é a última hunt da seção.
const s800 = ctx.HUNT_MODAL_SECTIONS.find((s) => s.title === "HUNTS 800+");
must(s800, "seção HUNTS 800+ ausente");
must(s800.ids.indexOf("radiant-skyhold") === s800.ids.length - 1,
  "radiant-skyhold não é a última hunt do HUNTS 800+");
const ui = fs.readFileSync(path.join(js, "ui.js"), "utf8"), huntList = {};
Object.assign(ctx, { $: () => huntList, $$: () => [], HUNT_UI: { busca: "" },
  huntRisk: () => ({ cls: "hard", txt: "800+" }), fmt: String,
  mobImg: (slug) => '<img src="assets/mob/' + slug + '.png">', G: { p: {} } });
vm.runInContext(ui.slice(ui.indexOf("function renderHunts(p)"),
  ui.indexOf("function openHuntsModal()")), ctx);
ctx.renderHunts(ctx.G.p);
must(huntList.innerHTML.includes('data-hunt="radiant-skyhold"'), "card não renderiza no modal");

// Monstros novos (15.30): fichas oficiais do patch + sheets válidos.
const canary = JSON.parse(fs.readFileSync(path.join(game, "data", "canarymonsters.json"), "utf8"));
for (const slug of SPECIES)
  must(!canary[slug], slug + ": criatura 15.30 apareceu no dump Canary — revisar patch");
{
  const aco = ctx.MONSTERDATA["radiant-acolyte"];
  must(aco && aco.hp === 34600 && aco.exp === 32960 && aco.looktype === 1969 &&
    aco.resist.fire === 40 && aco.resist.death === 30 && aco.resist.earth === -5 &&
    aco.resist.energy === -5 && aco.resist.ice === 10 &&
    aco.loot.length === 3 && aco.loot[0].item === "book-of-faith" &&
    aco.loot[1].item === "blank-imbuement-scroll" && aco.loot[2].item === "gilded-bell",
    "radiant-acolyte: ficha oficial divergente");
  const par = ctx.MONSTERDATA["radiant-paragon"];
  must(par && par.hp === 36000 && par.exp === 34780 && par.looktype === 1966 &&
    par.resist.earth === -15 && par.resist.energy === -10 &&
    par.loot.length === 3 && par.loot[0].item === "blue-quiver" &&
    par.loot[1].item === "broken-arrow" && par.loot[2].item === "gilded-bell",
    "radiant-paragon: ficha oficial divergente");
  const war = ctx.MONSTERDATA["radiant-warden"];
  must(war && war.hp === 38500 && war.exp === 35540 && war.looktype === 1964 &&
    war.resist.holy === -10 && war.resist.energy === -10 &&
    war.loot.length === 3 && war.loot[0].item === "crimson-sword" &&
    war.loot[1].item === "tatty-robe" && war.loot[2].item === "gilded-bell",
    "radiant-warden: ficha oficial divergente");
  const daco = ctx.MONSTERDATA["devoted-radiant-acolyte"];
  must(daco && daco.hp === 39790 && daco.exp === 47820 &&
    daco.loot.length === 3 && daco.loot[0].item === "book-of-faith" &&
    daco.loot[1].item === "cloud-familiar" && daco.loot[2].item === "lunar-ascension-orb",
    "devoted-radiant-acolyte: ficha oficial divergente");
  const dpar = ctx.MONSTERDATA["devoted-radiant-paragon"];
  must(dpar && dpar.hp === 41400 && dpar.exp === 50560 &&
    dpar.loot.length === 2 && dpar.loot[0].item === "cloud-familiar" &&
    dpar.loot[1].item === "lunar-ascension-orb",
    "devoted-radiant-paragon: ficha oficial divergente");
  const dwar = ctx.MONSTERDATA["devoted-radiant-warden"];
  must(dwar && dwar.hp === 44275 && dwar.exp === 51280 &&
    dwar.loot.length === 2 && dwar.loot[0].item === "cloud-familiar" &&
    dwar.loot[1].item === "lunar-ascension-orb",
    "devoted-radiant-warden: ficha oficial divergente");
  /* Devoted = resistências 100% neutras oficialmente. */
  must(Object.keys(daco.resist).length === 0 && Object.keys(dpar.resist).length === 0 &&
    Object.keys(dwar.resist).length === 0, "devoted devem ter resistências neutras");
}
for (const slug of hunt.monsters) {
  const sheet = ctx.MOBSHEETS[slug];
  const png = fs.readFileSync(path.join(game, "assets", "mob", slug + ".png"));
  must(sheet && png.readUInt32BE(16) === sheet.cw * sheet.cols &&
    png.readUInt32BE(20) === sheet.ch * sheet.rows,
    slug + ": sprite incompatível com metadados");
}

// Loot: 8 itens registrados cliente e servidor, todos sell 0
// (sem comprador NPC oficial) exceto blank-imbuement-scroll (25k,
// pedido do jogador) + ícones presentes.
const LOOT = { "book-of-faith": 54357, "cloud-familiar": 54361,
  "lunar-ascension-orb": 53695, "blank-imbuement-scroll": 51442,
  "gilded-bell": 54362, "broken-arrow": 54356, "tatty-robe": 54355,
  "blue-quiver": 35848 };
const LOOT_SELL = { "blank-imbuement-scroll": 25000 };
const catalog = { console }; catalog.window = catalog; vm.createContext(catalog);
for (const file of ["gamedata.js", "weapondata.js", "weapons.js", "quiverdata.js",
  "core.js", "accessorydata.js", "supply-stash-data.js", "supplydata.js", "supplies.js",
  "yasir-prices.js", "hardcore-library.js", "hard-hunts.js", "magma-bubble.js", "gnomprona.js",
  "falcon-bastion.js", "deathlings-sunken-temple.js",
  "azzilon-castle.js", "bloodrotten.js", "glooth-cave.js", "buried-cathedral.js",
  "buster-darashia.js", "urmahlullu.js", "bashmuul-issavi.js", "true-asuras.js",
  "mimar-haffar.js", "moonstone-castle.js", "radiant-skyhold.js"]) {
  vm.runInContext(fs.readFileSync(path.join(js, file), "utf8"), catalog, { filename: file });
  if (file === "weapons.js") vm.runInContext("fundirWeaponData()", catalog);
}
const E = require(path.join(__dirname, "..", "server", "authoritative_engine.js"));
for (const slug of Object.keys(LOOT)) {
  const client = catalog.GAMEDATA.items[slug], server = E.ITEMS[slug];
  const sell = LOOT_SELL[slug] || 0;
  must(client && server && client.cid === LOOT[slug] && server.cid === LOOT[slug] &&
    Number(client.sell) === sell && Number(server.sell) === sell,
    slug + ": registro/preço inconsistente");
  must(fs.existsSync(path.join(game, "assets", "item", slug + ".png")),
    slug + ": ícone ausente");
}

// Servidor autoritativo: definição da hunt, pack 8–10, só as 6 espécies
// e fichas presentes no MONSTERS.
must(E.HUNTS["radiant-skyhold"] && E.HUNTS["radiant-skyhold"].packMin === 8 &&
  E.HUNTS["radiant-skyhold"].packMax === 10 &&
  JSON.stringify(E.HUNTS["radiant-skyhold"].monsters) === JSON.stringify(SPECIES),
  "HUNTS do servidor sem radiant-skyhold ou pack errado");
for (const slug of SPECIES)
  must(E.MONSTERS[slug] && E.MONSTERS[slug].hp > 30000,
    slug + ": ausente do MONSTERS do servidor");
const desc = { kind: "hunt", huntId: "radiant-skyhold", instanceMode: "non-pvp",
  activeCharacterId: "1", state: { hunt, mobs: [], pendingSpawns: [], players: [] },
  members: [{ id: "1", p: { id: "1", voc: "knight", level: 800, hp: 15000, mp: 1500,
    gold: 0, skills: { fist: 100, sword: 100, axe: 100, club: 100, dist: 100, shield: 100 },
    ml: 10, config: {}, equip: {}, supplies: {}, stamina: 54000 } }] };
const seen = new Set();
for (let i = 0; i < 40; i++) {
  const d = E.initializeAuthority(JSON.parse(JSON.stringify(desc)),
    "test-radiant-skyhold-" + i, Date.now());
  E.spawnHuntWave(d.authority, Date.now() + 1000, { force: true });
  const n = (d.authority.pendingSpawns || []).length;
  must(n >= 8 && n <= 10, "pack autoritativo fora de 8–10: " + n);
  must(d.authority.pendingSpawns.every((sp) => SPECIES.includes(sp.mob.slug)),
    "monstro fora da hunt no pack autoritativo");
  seen.add(n);
}

// index.html carrega o patch.
const html = fs.readFileSync(path.join(game, "index.html"), "utf8");
must(html.includes("js/radiant-skyhold.js?v="), "radiant-skyhold.js não carregado no index");

console.log("OK — Radiant Skyhold: OTBM 38×29 z=7, " + available +
  " sqm de respawn conectado, pack " + Math.min(...seen) + "–" + Math.max(...seen) +
  ", 6 criaturas 15.30 + 8 itens sell 0, seção HUNTS 800+.");
