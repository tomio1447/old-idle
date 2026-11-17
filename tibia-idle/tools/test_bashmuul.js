/* Regressão: hunt BASHMUUL - ISSAVI (nível 250+).
 * Bashmu + Juvenile Bashmu, 8–10 por onda, OTBM próprio z=7.
 * Mapa: game/maps/bashmuul_issavi.otbm publicado byte-igual a partir de
 * beta-maps/Bashmu-issavi.otbm — 25×21, bounds 1009..1033 × 1015..1035.
 *   centerroom  {1023,1025,7}
 *   spawnradius {1018,1022,7} → {1030,1029,7} (13×8)
 * Creature products novos: bashmu-fang 600 / bashmu-tongue 400 /
 * bashmu-feather 350 (Yasir, TibiaWiki). */
"use strict";
const fs = require("fs"), path = require("path"), vm = require("vm");
const game = path.join(__dirname, "..", "game"), js = path.join(game, "js");
const OTBM = require(path.join(js, "otbm.js"));
function must(ok, msg) { if (!ok) throw Error(msg); }
const ctx = { window: {}, console, Math, Date, Map, Set };
ctx.window = ctx;
vm.createContext(ctx);
for (const file of ["gamedata.js", "monsterdata.js", "mobsheetdata.js",
  "accessorydata.js", "bashmuul-issavi.js", "hunt-sections.js", "tileflags.js"])
  vm.runInContext(fs.readFileSync(path.join(js, file), "utf8"), ctx, { filename: file });
ctx.addEventListener = () => {};
vm.runInContext(fs.readFileSync(path.join(js, "otbmhunt.js"), "utf8"), ctx);

const hunt = ctx.GAMEDATA.hunts["bashmuul-issavi"];
must(hunt && hunt.name === "Bashmuul - Issavi", "hunt bashmuul-issavi ausente/nome errado");
must(hunt.level === 250 && hunt.minLevel === 250, "nível deve ser 250");
must(JSON.stringify(hunt.monsters) ===
  JSON.stringify(["bashmu", "juvenile-bashmu"]), "monstros divergentes");
must(hunt.spawnWeights && hunt.spawnWeights.bashmu === 50 &&
  hunt.spawnWeights["juvenile-bashmu"] === 50, "spawnWeights 50/50 ausente");
must(hunt.pack === 10 && hunt.packMin === 8 && hunt.packMax === 10,
  "pack deve ser 8–10");
must(hunt.otbm === "bashmuul_issavi" && hunt.otbmFloor === 7, "OTBM/piso errado");
must(JSON.stringify(hunt.otbmSpawn) === JSON.stringify({ x: 1023, y: 1025, z: 7 }) &&
  JSON.stringify(hunt.otbmMobBounds) === JSON.stringify({ x: 1018, y: 1022, w: 13, h: 8, z: 7 }),
  "centerroom/spawnradius divergem das coordenadas informadas");

// OTBM publicado: byte-identico à origem e só z=7.
const bytes = fs.readFileSync(path.join(game, "maps", "bashmuul_issavi.otbm"));
must(bytes.equals(fs.readFileSync(path.join(game, "beta-maps", "Bashmu-issavi.otbm"))),
  "OTBM publicado diverge de beta-maps");
const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
for (let z = 0; z < 16; z++) must(OTBM.read(ab, { z }).z === 7, "andar inesperado no OTBM");
const parsed = OTBM.read(ab, { z: 7 });
const b = parsed.sourceBounds;
must(parsed.w === 25 && parsed.h === 21 && b.minX === 1009 && b.minY === 1015 &&
  b.maxX === 1033 && b.maxY === 1035, "bounds reais do OTBM divergem");
for (const cell of Object.values(parsed.cells)) for (const id of [cell.g, ...cell.items])
  must(!id || fs.existsSync(path.join(game, "assets", "tiles", id + ".png")),
    "tile sem sprite: " + id);
// Todos os ids usados constam no catálogo do editor RME.
{
  const rmeCtx = { window: {} }; rmeCtx.window = rmeCtx; vm.createContext(rmeCtx);
  vm.runInContext(fs.readFileSync(path.join(game, "rme", "data", "known_tiles.js"), "utf8"), rmeCtx);
  const unlisted = OTBM.missingTiles(parsed, rmeCtx.RME_KNOWN_TILES);
  must(unlisted.length === 0,
    "tiles do bashmuul_issavi fora do catálogo RME: " + unlisted.join(", "));
}

// Zonas absolutas → locais; spawn e área de respawn caminháveis e conectadas.
ctx.applyHuntOtbmZones(parsed, hunt);
must(parsed.spawn.x === 14 && parsed.spawn.y === 10, "spawn local errado (esperado 14,10)");
must(parsed.mob.length === 104, "zona de respawn deve cobrir 13×8 = 104 sqm");
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
must(available >= 10 * 2, "respawn sem área conectada para o pack máximo");

// Catálogo HUNTS 400+ e card no modal.
must(ctx.HUNT_MODAL_SECTIONS.find((s) => s.title === "HUNTS 400+").ids.includes("bashmuul-issavi"),
  "bashmuul-issavi ausente do catálogo");
const ui = fs.readFileSync(path.join(js, "ui.js"), "utf8"), huntList = {};
Object.assign(ctx, { $: () => huntList, $$: () => [], HUNT_UI: { busca: "" },
  huntRisk: () => ({ cls: "hard", txt: "250+" }), fmt: String,
  mobImg: (slug) => '<img src="assets/mob/' + slug + '.png">', G: { p: {} } });
vm.runInContext(ui.slice(ui.indexOf("function renderHunts(p)"),
  ui.indexOf("function openHuntsModal()")), ctx);
ctx.renderHunts(ctx.G.p);
must(huntList.innerHTML.includes('data-hunt="bashmuul-issavi"'), "card não renderiza no modal");

// Monstros: dados Canary + sprite compatível com o sheet.
const canary = JSON.parse(fs.readFileSync(path.join(game, "data", "canarymonsters.json"), "utf8"));
for (const slug of hunt.monsters) {
  const md = ctx.MONSTERDATA[slug], sheet = ctx.MOBSHEETS[slug];
  must(md && md.hp === canary[slug].hp && md.looktype === canary[slug].looktype,
    slug + ": dados divergentes do Canary");
  const png = fs.readFileSync(path.join(game, "assets", "mob", slug + ".png"));
  must(sheet && png.readUInt32BE(16) === sheet.cw * sheet.cols &&
    png.readUInt32BE(20) === sheet.ch * sheet.rows,
    slug + ": sprite incompatível com metadados");
}

// Loot: cada drop Canary registrado no cliente e no servidor com preço e ícone.
const catalog = { console }; catalog.window = catalog; vm.createContext(catalog);
for (const file of ["gamedata.js", "weapondata.js", "weapons.js", "quiverdata.js",
  "core.js", "accessorydata.js", "supply-stash-data.js", "supplydata.js", "supplies.js",
  "yasir-prices.js", "hardcore-library.js", "magma-bubble.js", "gnomprona.js",
  "azzilon-castle.js", "bloodrotten.js", "glooth-cave.js", "buried-cathedral.js",
  "buster-darashia.js", "urmahlullu.js", "bashmuul-issavi.js"]) {
  vm.runInContext(fs.readFileSync(path.join(js, file), "utf8"), catalog, { filename: file });
  if (file === "weapons.js") vm.runInContext("fundirWeaponData()", catalog);
}
const E = require(path.join(__dirname, "..", "server", "authoritative_engine.js"));
const lootSlugs = new Set();
for (const slug of hunt.monsters)
  for (const drop of canary[slug].loot) lootSlugs.add(drop.item);
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
// Preços oficiais (Yasir para os creature products; poções sem comprador
// NPC → 0; equipamentos com comprador confirmado).
for (const [slug, price] of Object.entries({
  "bashmu-fang": 600, "bashmu-tongue": 400, "bashmu-feather": 350,
  "great-spirit-potion": 0, "ultimate-health-potion": 0,
  "platinum-coin": 100, "lightning-pendant": 1500, "magma-amulet": 1500,
})) for (const items of [catalog.GAMEDATA.items, E.ITEMS])
  must(items[slug] && (items[slug].npcSell ?? items[slug].sell) === price,
    slug + ": preço oficial incorreto");

// Servidor autoritativo: definição da hunt e pack 8–10 só com as espécies.
must(E.HUNTS["bashmuul-issavi"] && E.HUNTS["bashmuul-issavi"].packMin === 8 &&
  E.HUNTS["bashmuul-issavi"].packMax === 10 &&
  JSON.stringify(E.HUNTS["bashmuul-issavi"].monsters) ===
    JSON.stringify(["bashmu", "juvenile-bashmu"]),
  "HUNTS do servidor sem bashmuul-issavi ou pack errado");
const desc = { kind: "hunt", huntId: "bashmuul-issavi", instanceMode: "non-pvp",
  activeCharacterId: "1", state: { hunt, mobs: [], pendingSpawns: [], players: [] },
  members: [{ id: "1", p: { id: "1", voc: "knight", level: 250, hp: 9000, mp: 900,
    gold: 0, skills: { fist: 100, sword: 100, axe: 100, club: 100, dist: 100, shield: 100 },
    ml: 10, config: {}, equip: {}, supplies: {}, stamina: 54000 } }] };
const seen = new Set();
for (let i = 0; i < 40; i++) {
  const d = E.initializeAuthority(JSON.parse(JSON.stringify(desc)),
    "test-bashmuul-" + i, Date.now());
  E.spawnHuntWave(d.authority, Date.now() + 1000, { force: true });
  const n = (d.authority.pendingSpawns || []).length;
  must(n >= 8 && n <= 10, "pack autoritativo fora de 8–10: " + n);
  must(d.authority.pendingSpawns.every((sp) => hunt.monsters.includes(sp.mob.slug)),
    "monstro fora da hunt no pack autoritativo");
  seen.add(n);
}

// index.html carrega o patch.
const html = fs.readFileSync(path.join(game, "index.html"), "utf8");
must(html.includes("js/bashmuul-issavi.js?v="), "bashmuul-issavi.js não carregado no index");

console.log("OK — Bashmuul - Issavi: OTBM 25×21 z=7, " + available +
  " sqm de respawn conectado, pack " + Math.min(...seen) + "–" + Math.max(...seen) +
  ", " + lootSlugs.size + " itens de loot com sprite e preço.");
