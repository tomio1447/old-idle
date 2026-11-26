/* Regressão: hunt WARZONE 9 (categoria HUNTS 400+, última da seção).
 * Cave Chimera / Tremendous Tyrant / Varnished Diremaw (34/33/33),
 * pack 8–10, OTBM próprio z=7.
 * Mapa: game/maps/warzone_9.otbm publicado byte-igual a partir de
 * beta-maps/warzone_9.otbm — 32×25, bounds 1011..1042 × 1017..1041.
 *   playerspawn   {1027,1029,7}
 *   respawnradius {1022,1024,7} → {1028,1033,7} (7×10 = 70 sqm)
 * Creature products novos (Yasir): chimera-leg 650 / chimera-head 1200 /
 * tyrant-shell 740 / tyrant-head 930 / diremaw-brainpan 750 /
 * diremaw-legs 670. warrior's shield: fix de paridade client×engine
 * (oficial 9.000 Rock in a Hard Place; deathlings zerava no cliente). */
"use strict";
const fs = require("fs"), path = require("path"), vm = require("vm");
const game = path.join(__dirname, "..", "game"), js = path.join(game, "js");
const OTBM = require(path.join(js, "otbm.js"));
function must(ok, msg) { if (!ok) throw Error(msg); }
const ctx = { window: {}, console, Math, Date, Map, Set };
ctx.window = ctx;
vm.createContext(ctx);
for (const file of ["gamedata.js", "monsterdata.js", "mobsheetdata.js",
  "accessorydata.js", "warzone9.js", "hunt-sections.js", "tileflags.js"])
  vm.runInContext(fs.readFileSync(path.join(js, file), "utf8"), ctx, { filename: file });
ctx.addEventListener = () => {};
vm.runInContext(fs.readFileSync(path.join(js, "otbmhunt.js"), "utf8"), ctx);

const hunt = ctx.GAMEDATA.hunts["warzone-9"];
must(hunt && hunt.name === "Warzone 9", "hunt warzone-9 ausente/nome errado");
must(hunt.level === 400 && hunt.minLevel === 400, "nível deve ser 400");
must(hunt.cat === "hard", "cat deve ser hard");
const SPECIES = ["cave-chimera", "tremendous-tyrant", "varnished-diremaw"];
must(JSON.stringify(hunt.monsters) === JSON.stringify(SPECIES), "monstros divergentes");
must(hunt.spawnWeights["cave-chimera"] === 34 &&
  hunt.spawnWeights["tremendous-tyrant"] === 33 &&
  hunt.spawnWeights["varnished-diremaw"] === 33, "spawnWeights 34/33/33 ausente");
must(hunt.pack === 10 && hunt.packMin === 8 && hunt.packMax === 10,
  "pack deve ser 8–10");
must(hunt.otbm === "warzone_9" && hunt.otbmFloor === 7, "OTBM/piso errado");
must(JSON.stringify(hunt.otbmSpawn) === JSON.stringify({ x: 1027, y: 1029, z: 7 }),
  "otbmSpawn diverge do playerspawn informado");
must(JSON.stringify(hunt.otbmMobBounds) === JSON.stringify({ x: 1022, y: 1024, w: 7, h: 10, z: 7 }),
  "respawnradius diverge das coordenadas informadas");

// OTBM publicado: byte-idêntico à origem e só z=7.
const bytes = fs.readFileSync(path.join(game, "maps", "warzone_9.otbm"));
must(bytes.equals(fs.readFileSync(path.join(game, "beta-maps", "warzone_9.otbm"))),
  "OTBM publicado diverge de beta-maps");
const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
for (let z = 0; z < 16; z++) must(OTBM.read(ab, { z }).z === 7, "andar inesperado no OTBM");
const parsed = OTBM.read(ab, { z: 7 });
const b = parsed.sourceBounds;
must(parsed.w === 32 && parsed.h === 25 && b.minX === 1011 && b.minY === 1017 &&
  b.maxX === 1042 && b.maxY === 1041, "bounds reais do OTBM divergem");
for (const cell of Object.values(parsed.cells)) for (const id of [cell.g, ...cell.items])
  must(!id || fs.existsSync(path.join(game, "assets", "tiles", id + ".png")),
    "tile sem sprite: " + id);
// Todos os ids usados constam no catálogo do editor RME.
{
  const rmeCtx = { window: {} }; rmeCtx.window = rmeCtx; vm.createContext(rmeCtx);
  vm.runInContext(fs.readFileSync(path.join(game, "rme", "data", "known_tiles.js"), "utf8"), rmeCtx);
  const unlisted = OTBM.missingTiles(parsed, rmeCtx.RME_KNOWN_TILES);
  must(unlisted.length === 0,
    "tiles do warzone_9 fora do catálogo RME: " + unlisted.join(", "));
}

// Zonas absolutas → locais; spawn e área de respawn caminháveis/conectadas.
ctx.applyHuntOtbmZones(parsed, hunt);
must(parsed.spawn.x === 16 && parsed.spawn.y === 12, "spawn local errado (esperado 16,12)");
must(parsed.mob.length === 70, "zona de respawn deve cobrir 7×10 = 70 sqm");
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
must(reached.size === 149, "componente conectado deve ter 149 sqm: " + reached.size);
let available = 0;
for (const c of parsed.mob) {
  must(walkable(c.x, c.y), "célula da zona bloqueada: " + c.x + "," + c.y);
  if (reached.has(c.x + "," + c.y)) available++;
}
must(available === 70, "zona de respawn não é toda conectada: " + available + "/70");

// Card no modal HUNTS 400+ (último da seção).
const s400 = ctx.HUNT_MODAL_SECTIONS.find((s) => s.title === "HUNTS 400+");
must(s400 && s400.ids[s400.ids.length - 1] === "warzone-9",
  "warzone-9 deve ser o último id da categoria HUNTS 400+");
const ui = fs.readFileSync(path.join(js, "ui.js"), "utf8"), huntList = {};
Object.assign(ctx, { $: () => huntList, $$: () => [], HUNT_UI: { busca: "" },
  huntRisk: () => ({ cls: "hard", txt: "400+" }), fmt: String,
  mobImg: (slug) => '<img src="assets/mob/' + slug + '.png">', G: { p: {} } });
vm.runInContext(ui.slice(ui.indexOf("function renderHunts(p)"),
  ui.indexOf("function openHuntsModal()")), ctx);
ctx.renderHunts(ctx.G.p);
must(huntList.innerHTML.includes('data-hunt="warzone-9"'), "card não renderiza no modal");

// Monstros: dados Canary + sprite compatível com o sheet.
const canary = JSON.parse(fs.readFileSync(path.join(game, "data", "canarymonsters.json"), "utf8"));
const DUMP = {
  "cave-chimera": { hp: 8000, exp: 6800 },
  "tremendous-tyrant": { hp: 11500, exp: 6100 },
  "varnished-diremaw": { hp: 9000, exp: 5900 },
};
for (const slug of hunt.monsters) {
  const md = ctx.MONSTERDATA[slug], sheet = ctx.MOBSHEETS[slug];
  must(md && canary[slug] && md.hp === canary[slug].hp && md.exp === canary[slug].exp &&
    md.looktype === canary[slug].looktype &&
    md.hp === DUMP[slug].hp && md.exp === DUMP[slug].exp,
    slug + ": dados divergentes do Canary");
  const png = fs.readFileSync(path.join(game, "assets", "mob", slug + ".png"));
  must(sheet && png.readUInt32BE(16) === sheet.cw * sheet.cols &&
    png.readUInt32BE(20) === sheet.ch * sheet.rows,
    slug + ": sprite incompatível com metadados");
}
// Idle sheet do Tremendous Tyrant (presente nos assets).
must(fs.existsSync(path.join(game, "assets", "mob", "tremendous-tyrant.idle.png")),
  "tremendous-tyrant.idle.png ausente");

// Loot: cada drop registrado no cliente e no servidor com preço e ícone.
// deathlings-sunken-temple.js vem antes de warzone9.js — mesma ordem do
// index.html (o fix de warrior-s-shield precisa rodar por último).
const catalog = { console }; catalog.window = catalog; vm.createContext(catalog);
for (const file of ["gamedata.js", "weapondata.js", "weapons.js", "quiverdata.js",
  "core.js", "accessorydata.js", "supply-stash-data.js", "supplydata.js", "supplies.js",
  "yasir-prices.js", "hardcore-library.js", "hard-hunts.js", "magma-bubble.js", "gnomprona.js",
  "falcon-bastion.js", "deathlings-sunken-temple.js", "warzone9.js",
  "azzilon-castle.js", "bloodrotten.js", "glooth-cave.js", "buried-cathedral.js",
  "buster-darashia.js", "urmahlullu.js", "bashmuul-issavi.js", "true-asuras.js",
  "mimar-haffar.js", "asura-palace.js"]) {
  vm.runInContext(fs.readFileSync(path.join(js, file), "utf8"), catalog, { filename: file });
  if (file === "weapons.js") vm.runInContext("fundirWeaponData()", catalog);
}
const E = require(path.join(__dirname, "..", "server", "authoritative_engine.js"));
const lootSlugs = new Set();
for (const slug of hunt.monsters) for (const drop of canary[slug].loot) lootSlugs.add(drop.item);
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
// Preços oficiais já validados: Yasir p/ os creature products novos,
// warrior's shield 9.000 (Rock in a Hard Place — paridade com o engine),
// poções sem comprador NPC → 0.
for (const [slug, price] of Object.entries({
  "cave-chimera-leg": 650, "cave-chimera-head": 1200,
  "tremendous-tyrant-shell": 740, "tremendous-tyrant-head": 930,
  "varnished-diremaw-brainpan": 750, "varnished-diremaw-legs": 670,
  "brown-crystal-splinter": 400, "warrior-s-shield": 9000,
  "great-spirit-potion": 0, "ultimate-health-potion": 0,
  "platinum-coin": 100,
})) for (const items of [catalog.GAMEDATA.items, E.ITEMS])
  must(items[slug] && (items[slug].npcSell ?? items[slug].sell) === price,
    slug + ": preço oficial incorreto");

// Servidor autoritativo: definição da hunt e pack 8–10 só com as espécies.
must(E.HUNTS["warzone-9"] && E.HUNTS["warzone-9"].packMin === 8 &&
  E.HUNTS["warzone-9"].packMax === 10 &&
  JSON.stringify(E.HUNTS["warzone-9"].monsters) === JSON.stringify(SPECIES),
  "HUNTS do servidor sem warzone-9 ou pack errado");
const desc = { kind: "hunt", huntId: "warzone-9", instanceMode: "non-pvp",
  activeCharacterId: "1", state: { hunt, mobs: [], pendingSpawns: [], players: [] },
  members: [{ id: "1", p: { id: "1", voc: "knight", level: 400, hp: 12000, mp: 1200,
    gold: 0, skills: { fist: 100, sword: 100, axe: 100, club: 100, dist: 100, shield: 100 },
    ml: 10, config: {}, equip: {}, supplies: {}, stamina: 54000 } }] };
const seen = new Set();
for (let i = 0; i < 40; i++) {
  const d = E.initializeAuthority(JSON.parse(JSON.stringify(desc)),
    "test-warzone9-" + i, Date.now());
  E.spawnHuntWave(d.authority, Date.now() + 1000, { force: true });
  const n = (d.authority.pendingSpawns || []).length;
  must(n >= 8 && n <= 10, "pack autoritativo fora de 8–10: " + n);
  must(d.authority.pendingSpawns.every((sp) => SPECIES.includes(sp.mob.slug)),
    "monstro fora da hunt no pack autoritativo");
  seen.add(n);
}

// index.html carrega o patch depois de deathlings-sunken-temple.js.
const html = fs.readFileSync(path.join(game, "index.html"), "utf8");
must(html.includes("js/warzone9.js?v="), "warzone9.js não carregado no index");
must(html.indexOf("js/deathlings-sunken-temple.js") < html.indexOf("js/warzone9.js"),
  "warzone9.js deve carregar depois de deathlings-sunken-temple.js");

console.log("OK — Warzone 9: OTBM 32×25 z=7, " + available +
  " sqm de respawn conectado, pack " + Math.min(...seen) + "–" + Math.max(...seen) +
  ", " + lootSlugs.size + " itens de loot com sprite e preço, HUNTS 400+.");
