/* Regressão: hunt TRUE ASURAS - THALASSARA (categoria HUNTS 400+).
 * True Dawnfire/Midnight/Frost Flower/Feverbloom Asura, 8–10 por onda,
 * OTBM próprio z=7.
 * Mapa: game/maps/true_asuras_thalassara.otbm publicado byte-igual a
 * partir de beta-maps/true-asura-thalassara.otbm — 26×22, bounds
 * 1009..1034 × 1015..1036.
 *   centermap     {1022,1026,7} (célula bloqueada → spawn em 1023,1026)
 *   respawnradius {1015,1024,7} → {1027,1031,7} (13×8)
 * A True Feverbloom Asura (Forbidden Gardens 15.30) não existe no dump
 * Canary — a ficha oficial vem de game/js/true-asuras.js (8.600 hp,
 * 8.600 exp, armor 90, curada por fogo).
 * Creature products novos: peacock-feather-fan 350 / golden-lotus-brooch
 * 270 / wild-flowers 120 / pyrophyte-seed-pod 720 (Yasir, TibiaWiki);
 * oriental-shoes 15.000 (Rashid). */
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
  "true-asuras.js", "hunt-sections.js", "tileflags.js"])
  vm.runInContext(fs.readFileSync(path.join(js, file), "utf8"), ctx, { filename: file });
ctx.addEventListener = () => {};
vm.runInContext(fs.readFileSync(path.join(js, "otbmhunt.js"), "utf8"), ctx);

const hunt = ctx.GAMEDATA.hunts["true-asuras"];
must(hunt && hunt.name === "True Asuras - Thalassara", "hunt true-asuras ausente/nome errado");
must(hunt.level === 400 && hunt.minLevel === 400, "nível deve ser 400");
const SPECIES = ["true-dawnfire-asura", "true-midnight-asura",
  "true-frost-flower-asura", "true-feverbloom-asura"];
must(JSON.stringify(hunt.monsters) === JSON.stringify(SPECIES), "monstros divergentes");
for (const slug of SPECIES)
  must(hunt.spawnWeights[slug] === 25, "spawnWeights 25/25/25/25 ausente em " + slug);
must(hunt.pack === 10 && hunt.packMin === 8 && hunt.packMax === 10, "pack deve ser 8–10");
must(hunt.otbm === "true_asuras_thalassara" && hunt.otbmFloor === 7, "OTBM/piso errado");
must(JSON.stringify(hunt.otbmSpawn) === JSON.stringify({ x: 1023, y: 1026, z: 7 }),
  "spawn diverge da caminhável mais próxima do centermap informado");
must(JSON.stringify(hunt.otbmMobBounds) === JSON.stringify({ x: 1015, y: 1024, w: 13, h: 8, z: 7 }),
  "respawnradius diverge das coordenadas informadas");

// OTBM publicado: byte-identico à origem e só z=7.
const bytes = fs.readFileSync(path.join(game, "maps", "true_asuras_thalassara.otbm"));
must(bytes.equals(fs.readFileSync(path.join(game, "beta-maps", "true-asura-thalassara.otbm"))),
  "OTBM publicado diverge de beta-maps");
const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
for (let z = 0; z < 16; z++) must(OTBM.read(ab, { z }).z === 7, "andar inesperado no OTBM");
const parsed = OTBM.read(ab, { z: 7 });
const b = parsed.sourceBounds;
must(parsed.w === 26 && parsed.h === 22 && b.minX === 1009 && b.minY === 1015 &&
  b.maxX === 1034 && b.maxY === 1036, "bounds reais do OTBM divergem");
for (const cell of Object.values(parsed.cells)) for (const id of [cell.g, ...cell.items])
  must(!id || fs.existsSync(path.join(game, "assets", "tiles", id + ".png")),
    "tile sem sprite: " + id);
// Todos os ids usados constam no catálogo do editor RME.
{
  const rmeCtx = { window: {} }; rmeCtx.window = rmeCtx; vm.createContext(rmeCtx);
  vm.runInContext(fs.readFileSync(path.join(game, "rme", "data", "known_tiles.js"), "utf8"), rmeCtx);
  const unlisted = OTBM.missingTiles(parsed, rmeCtx.RME_KNOWN_TILES);
  must(unlisted.length === 0,
    "tiles do true_asuras_thalassara fora do catálogo RME: " + unlisted.join(", "));
}

// Zonas absolutas → locais; spawn e área de respawn caminháveis e conectadas.
ctx.applyHuntOtbmZones(parsed, hunt);
must(parsed.spawn.x === 14 && parsed.spawn.y === 11, "spawn local errado (esperado 14,11)");
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

// Categoria HUNTS 400+: recebe as hunts movidas e a nova; 250+ perde as duas.
const s400 = ctx.HUNT_MODAL_SECTIONS.find((s) => s.title === "HUNTS 400+");
must(s400, "seção HUNTS 400+ ausente");
for (const id of ["azzilon-castle", "bashmuul-issavi", "braingrounds-venore", "true-asuras"])
  must(s400.ids.includes(id), id + " ausente da categoria HUNTS 400+");
const s250 = ctx.HUNT_MODAL_SECTIONS.find((s) => s.title === "HUNTS 250+");
must(!s250.ids.includes("bashmuul-issavi") && !s250.ids.includes("azzilon-castle"),
  "hunts movidas ainda na categoria 250+");
const ui = fs.readFileSync(path.join(js, "ui.js"), "utf8"), huntList = {};
Object.assign(ctx, { $: () => huntList, $$: () => [], HUNT_UI: { busca: "" },
  huntRisk: () => ({ cls: "hard", txt: "400+" }), fmt: String,
  mobImg: (slug) => '<img src="assets/mob/' + slug + '.png">', G: { p: {} } });
vm.runInContext(ui.slice(ui.indexOf("function renderHunts(p)"),
  ui.indexOf("function openHuntsModal()")), ctx);
ctx.renderHunts(ctx.G.p);
must(huntList.innerHTML.includes('data-hunt="true-asuras"'), "card não renderiza no modal");

// Monstros: dados Canary + sprite compatível com o sheet. A Feverbloom é
// nova (15.30) — compara contra a ficha oficial do patch, não o dump.
const canary = JSON.parse(fs.readFileSync(path.join(game, "data", "canarymonsters.json"), "utf8"));
must(!canary["true-feverbloom-asura"], "feverbloom apareceu no dump Canary — revisar patch");
for (const slug of hunt.monsters) {
  const md = ctx.MONSTERDATA[slug], sheet = ctx.MOBSHEETS[slug];
  if (slug !== "true-feverbloom-asura")
    must(md && md.hp === canary[slug].hp && md.looktype === canary[slug].looktype,
      slug + ": dados divergentes do Canary");
  else
    must(md && md.hp === 8600 && md.exp === 8600 && md.armor === 90 &&
      md.resist.fire === 100 && md.resist.earth === 15 && md.resist.ice === -10 &&
      md.resist.death === -10 && md.resist.energy === -5 && md.resist.holy === -5 &&
      md.resist.physical === 0 && md.mitigation === 3.45 && md.speed === 175 &&
      md.element === "earth" && md.looktype === 1068 && (md.loot || []).length === 11,
      "feverbloom: ficha oficial divergente");
  const png = fs.readFileSync(path.join(game, "assets", "mob", slug + ".png"));
  must(sheet && png.readUInt32BE(16) === sheet.cw * sheet.cols &&
    png.readUInt32BE(20) === sheet.ch * sheet.rows,
    slug + ": sprite incompatível com metadados");
}

// Loot: cada drop registrado no cliente e no servidor com preço e ícone.
const catalog = { console }; catalog.window = catalog; vm.createContext(catalog);
for (const file of ["gamedata.js", "weapondata.js", "weapons.js", "quiverdata.js",
  "core.js", "accessorydata.js", "supply-stash-data.js", "supplydata.js", "supplies.js",
  "yasir-prices.js", "hardcore-library.js", "hard-hunts.js", "magma-bubble.js", "gnomprona.js",
  "falcon-bastion.js", "deathlings-sunken-temple.js",
  "azzilon-castle.js", "bloodrotten.js", "glooth-cave.js", "buried-cathedral.js",
  "buster-darashia.js", "urmahlullu.js", "bashmuul-issavi.js", "true-asuras.js",
  "mimar-haffar.js"]) {
  vm.runInContext(fs.readFileSync(path.join(js, file), "utf8"), catalog, { filename: file });
  if (file === "weapons.js") vm.runInContext("fundirWeaponData()", catalog);
}
const E = require(path.join(__dirname, "..", "server", "authoritative_engine.js"));
const lootSlugs = new Set();
for (const slug of hunt.monsters) {
  const ref = canary[slug] || ctx.MONSTERDATA[slug];
  for (const drop of ref.loot) lootSlugs.add(drop.item);
}
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
// Preços oficiais: Yasir para os creature products; Rashid para as botas.
for (const [slug, price] of Object.entries({
  "peacock-feather-fan": 350, "golden-lotus-brooch": 270, "wild-flowers": 120,
  "pyrophyte-seed-pod": 720, "oriental-shoes": 15000, "platinum-coin": 100,
  "muck-rod": 6000, "seeds": 150,
})) for (const items of [catalog.GAMEDATA.items, E.ITEMS])
  must(items[slug] && (items[slug].npcSell ?? items[slug].sell) === price,
    slug + ": preço oficial incorreto");

// Servidor autoritativo: definição da hunt, pack 8–10, só as 4 espécies e
// ficha da Feverbloom presente no MONSTERS.
must(E.HUNTS["true-asuras"] && E.HUNTS["true-asuras"].packMin === 8 &&
  E.HUNTS["true-asuras"].packMax === 10 &&
  JSON.stringify(E.HUNTS["true-asuras"].monsters) === JSON.stringify(SPECIES),
  "HUNTS do servidor sem true-asuras ou pack errado");
must(E.MONSTERS && E.MONSTERS["true-feverbloom-asura"] &&
  E.MONSTERS["true-feverbloom-asura"].hp === 8600,
  "feverbloom ausente do MONSTERS do servidor");
const desc = { kind: "hunt", huntId: "true-asuras", instanceMode: "non-pvp",
  activeCharacterId: "1", state: { hunt, mobs: [], pendingSpawns: [], players: [] },
  members: [{ id: "1", p: { id: "1", voc: "knight", level: 400, hp: 9000, mp: 900,
    gold: 0, skills: { fist: 100, sword: 100, axe: 100, club: 100, dist: 100, shield: 100 },
    ml: 10, config: {}, equip: {}, supplies: {}, stamina: 54000 } }] };
const seen = new Set();
for (let i = 0; i < 40; i++) {
  const d = E.initializeAuthority(JSON.parse(JSON.stringify(desc)),
    "test-true-asuras-" + i, Date.now());
  E.spawnHuntWave(d.authority, Date.now() + 1000, { force: true });
  const n = (d.authority.pendingSpawns || []).length;
  must(n >= 8 && n <= 10, "pack autoritativo fora de 8–10: " + n);
  must(d.authority.pendingSpawns.every((sp) => SPECIES.includes(sp.mob.slug)),
    "monstro fora da hunt no pack autoritativo");
  seen.add(n);
}

// index.html carrega o patch.
const html = fs.readFileSync(path.join(game, "index.html"), "utf8");
must(html.includes("js/true-asuras.js?v="), "true-asuras.js não carregado no index");

console.log("OK — True Asuras - Thalassara: OTBM 26×22 z=7, " + available +
  " sqm de respawn conectado, pack " + Math.min(...seen) + "–" + Math.max(...seen) +
  ", " + lootSlugs.size + " itens de loot com sprite e preço, categoria HUNTS 400+.");
