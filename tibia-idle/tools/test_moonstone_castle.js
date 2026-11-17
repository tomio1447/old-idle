/* Regressão: hunt MOONSTONE CASTLE (categoria HUNTS 400+).
 * Moonsilver Custodian (23.300 hp) e Moonstone Miner (16.500 hp),
 * 6–14 por onda, OTBM próprio z=7.
 * Mapa: game/maps/moonstone_castle.otbm publicado byte-igual a partir
 * de beta-maps/"moonstone castle.otbm" — 46×35, bounds
 * 1004..1049 × 1012..1046.
 *   centeroom     {1026,1032,7} (caminhável → spawn do jogador)
 *   respawnradius {1023,1027,7} → {1029,1037,7} (7×11; 70 sqm caminháveis)
 * Criaturas de quest do update 15.30 (adds do Mimar Haffar), ausentes
 * do dump Canary — fichas oficiais em game/js/moonstone-castle.js:
 * exp 0 das duas, resistências do TibiaWiki, loot do miner =
 * Moonsilver Crystals (quest item, sem comprador NPC → sell 0).
 * Sprite do custodian = looktype 1956 (match pixel a pixel contra o
 * GIF oficial); miner = sheet montada do GIF oficial (sprite real
 * ausente do DAT convertido). */
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
  "true-asuras.js", "moonstone-castle.js", "hunt-sections.js", "tileflags.js"])
  vm.runInContext(fs.readFileSync(path.join(js, file), "utf8"), ctx, { filename: file });
ctx.addEventListener = () => {};
vm.runInContext(fs.readFileSync(path.join(js, "otbmhunt.js"), "utf8"), ctx);

const hunt = ctx.GAMEDATA.hunts["moonstone-castle"];
must(hunt && hunt.name === "Moonstone Castle", "hunt moonstone-castle ausente/nome errado");
must(hunt.level === 400 && hunt.minLevel === 400, "nível deve ser 400");
const SPECIES = ["moonsilver-custodian", "moonstone-miner"];
must(JSON.stringify(hunt.monsters) === JSON.stringify(SPECIES), "monstros divergentes");
for (const slug of SPECIES)
  must(hunt.spawnWeights[slug] === 50, "spawnWeights 50/50 ausente em " + slug);
must(hunt.pack === 14 && hunt.packMin === 6 && hunt.packMax === 14, "pack deve ser 6–14");
must(hunt.otbm === "moonstone_castle" && hunt.otbmFloor === 7, "OTBM/piso errado");
must(JSON.stringify(hunt.otbmSpawn) === JSON.stringify({ x: 1026, y: 1032, z: 7 }),
  "spawn diverge do centeroom informado");
must(JSON.stringify(hunt.otbmMobBounds) === JSON.stringify({ x: 1023, y: 1027, w: 7, h: 11, z: 7 }),
  "respawnradius diverge das coordenadas informadas");

// OTBM publicado: byte-identico à origem e só z=7.
const bytes = fs.readFileSync(path.join(game, "maps", "moonstone_castle.otbm"));
must(bytes.equals(fs.readFileSync(path.join(game, "beta-maps", "moonstone castle.otbm"))),
  "OTBM publicado diverge de beta-maps");
const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
for (let z = 0; z < 16; z++) must(OTBM.read(ab, { z }).z === 7, "andar inesperado no OTBM");
const parsed = OTBM.read(ab, { z: 7 });
const b = parsed.sourceBounds;
must(parsed.w === 46 && parsed.h === 35 && b.minX === 1004 && b.minY === 1012 &&
  b.maxX === 1049 && b.maxY === 1046, "bounds reais do OTBM divergem");
for (const cell of Object.values(parsed.cells)) for (const id of [cell.g, ...cell.items])
  must(!id || fs.existsSync(path.join(game, "assets", "tiles", id + ".png")),
    "tile sem sprite: " + id);
{
  const rmeCtx = { window: {} }; rmeCtx.window = rmeCtx; vm.createContext(rmeCtx);
  vm.runInContext(fs.readFileSync(path.join(game, "rme", "data", "known_tiles.js"), "utf8"), rmeCtx);
  const unlisted = OTBM.missingTiles(parsed, rmeCtx.RME_KNOWN_TILES);
  must(unlisted.length === 0,
    "tiles da moonstone_castle fora do catálogo RME: " + unlisted.join(", "));
}

// Zonas absolutas → locais; spawn e área de respawn caminháveis e conectadas.
ctx.applyHuntOtbmZones(parsed, hunt);
must(parsed.spawn.x === 22 && parsed.spawn.y === 20, "spawn local errado (esperado 22,20)");
must(parsed.mob.length === 77, "zona de respawn deve cobrir 7×11 = 77 sqm");
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
must(available >= 14 * 2, "respawn sem área conectada para o pack máximo");

// Categoria HUNTS 400+: moonstone-castle é a última hunt da seção.
const s400 = ctx.HUNT_MODAL_SECTIONS.find((s) => s.title === "HUNTS 400+");
must(s400, "seção HUNTS 400+ ausente");
must(s400.ids.indexOf("moonstone-castle") === s400.ids.length - 1,
  "moonstone-castle não é a última hunt do HUNTS 400+");
const ui = fs.readFileSync(path.join(js, "ui.js"), "utf8"), huntList = {};
Object.assign(ctx, { $: () => huntList, $$: () => [], HUNT_UI: { busca: "" },
  huntRisk: () => ({ cls: "hard", txt: "400+" }), fmt: String,
  mobImg: (slug) => '<img src="assets/mob/' + slug + '.png">', G: { p: {} } });
vm.runInContext(ui.slice(ui.indexOf("function renderHunts(p)"),
  ui.indexOf("function openHuntsModal()")), ctx);
ctx.renderHunts(ctx.G.p);
must(huntList.innerHTML.includes('data-hunt="moonstone-castle"'), "card não renderiza no modal");

// Monstros novos (15.30): fichas oficiais do patch + sheets válidos.
const canary = JSON.parse(fs.readFileSync(path.join(game, "data", "canarymonsters.json"), "utf8"));
must(!canary["moonsilver-custodian"] && !canary["moonstone-miner"],
  "criaturas de quest apareceram no dump Canary — revisar patch");
{
  const cust = ctx.MONSTERDATA["moonsilver-custodian"];
  must(cust && cust.hp === 23300 && cust.exp === 0 && cust.looktype === 1956 &&
    cust.resist.earth === 20 && cust.resist.fire === 10 && cust.resist.energy === -4 &&
    (cust.loot || []).length === 0, "custodian: ficha oficial divergente");
  const miner = ctx.MONSTERDATA["moonstone-miner"];
  must(miner && miner.hp === 16500 && miner.exp === 0 &&
    miner.resist.earth === 100 && miner.resist.death === 50 &&
    miner.resist.fire === -5 && miner.resist.energy === -7 &&
    (miner.loot || []).length === 1 && miner.loot[0].item === "moonsilver-crystals",
    "miner: ficha oficial divergente");
}
for (const slug of hunt.monsters) {
  const sheet = ctx.MOBSHEETS[slug];
  const png = fs.readFileSync(path.join(game, "assets", "mob", slug + ".png"));
  must(sheet && png.readUInt32BE(16) === sheet.cw * sheet.cols &&
    png.readUInt32BE(20) === sheet.ch * sheet.rows,
    slug + ": sprite incompatível com metadados");
}

// Loot: moonsilver-crystals registrado cliente e servidor, quest item sell 0.
const catalog = { console }; catalog.window = catalog; vm.createContext(catalog);
for (const file of ["gamedata.js", "weapondata.js", "weapons.js", "quiverdata.js",
  "core.js", "accessorydata.js", "supply-stash-data.js", "supplydata.js", "supplies.js",
  "yasir-prices.js", "hardcore-library.js", "hard-hunts.js", "magma-bubble.js", "gnomprona.js",
  "falcon-bastion.js", "deathlings-sunken-temple.js",
  "azzilon-castle.js", "bloodrotten.js", "glooth-cave.js", "buried-cathedral.js",
  "buster-darashia.js", "urmahlullu.js", "bashmuul-issavi.js", "true-asuras.js",
  "mimar-haffar.js", "moonstone-castle.js"]) {
  vm.runInContext(fs.readFileSync(path.join(js, file), "utf8"), catalog, { filename: file });
  if (file === "weapons.js") vm.runInContext("fundirWeaponData()", catalog);
}
const E = require(path.join(__dirname, "..", "server", "authoritative_engine.js"));
{
  const client = catalog.GAMEDATA.items["moonsilver-crystals"],
    server = E.ITEMS["moonsilver-crystals"];
  must(client && server && client.cid === 54267 && server.cid === 54267 &&
    Number(client.sell) === 0 && Number(server.sell) === 0,
    "moonsilver-crystals: registro/preço inconsistente (quest item → sell 0)");
  const icon = fs.readFileSync(path.join(game, "assets", "item", "moonsilver-crystals.png"));
  must(icon.readUInt32BE(16) <= 64 && icon.readUInt32BE(20) <= 64,
    "moonsilver-crystals: ícone inválido");
}

// Servidor autoritativo: definição da hunt, pack 6–14, só as 2 espécies
// e fichas presentes no MONSTERS.
must(E.HUNTS["moonstone-castle"] && E.HUNTS["moonstone-castle"].packMin === 6 &&
  E.HUNTS["moonstone-castle"].packMax === 14 &&
  JSON.stringify(E.HUNTS["moonstone-castle"].monsters) === JSON.stringify(SPECIES),
  "HUNTS do servidor sem moonstone-castle ou pack errado");
must(E.MONSTERS["moonsilver-custodian"] && E.MONSTERS["moonsilver-custodian"].hp === 23300 &&
  E.MONSTERS["moonstone-miner"] && E.MONSTERS["moonstone-miner"].hp === 16500,
  "criaturas ausentes do MONSTERS do servidor");
const desc = { kind: "hunt", huntId: "moonstone-castle", instanceMode: "non-pvp",
  activeCharacterId: "1", state: { hunt, mobs: [], pendingSpawns: [], players: [] },
  members: [{ id: "1", p: { id: "1", voc: "knight", level: 400, hp: 9000, mp: 900,
    gold: 0, skills: { fist: 100, sword: 100, axe: 100, club: 100, dist: 100, shield: 100 },
    ml: 10, config: {}, equip: {}, supplies: {}, stamina: 54000 } }] };
const seen = new Set();
for (let i = 0; i < 40; i++) {
  const d = E.initializeAuthority(JSON.parse(JSON.stringify(desc)),
    "test-moonstone-castle-" + i, Date.now());
  E.spawnHuntWave(d.authority, Date.now() + 1000, { force: true });
  const n = (d.authority.pendingSpawns || []).length;
  must(n >= 6 && n <= 14, "pack autoritativo fora de 6–14: " + n);
  must(d.authority.pendingSpawns.every((sp) => SPECIES.includes(sp.mob.slug)),
    "monstro fora da hunt no pack autoritativo");
  seen.add(n);
}

// index.html carrega o patch.
const html = fs.readFileSync(path.join(game, "index.html"), "utf8");
must(html.includes("js/moonstone-castle.js?v="), "moonstone-castle.js não carregado no index");

console.log("OK — Moonstone Castle: OTBM 46×35 z=7, " + available +
  " sqm de respawn conectado, pack " + Math.min(...seen) + "–" + Math.max(...seen) +
  ", 2 criaturas de quest 15.30 (exp 0) + moonsilver-crystals sell 0, última do HUNTS 400+.");
