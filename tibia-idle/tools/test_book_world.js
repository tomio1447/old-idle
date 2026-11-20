/* Regressão: hunt BOOK WORLD (categoria HUNTS 100–250).
 * 6 criaturas Inkborn do update 15.10, 6–8 por onda, OTBM próprio z=7.
 * Mapa: game/maps/book_world.otbm publicado byte-igual a partir de
 * beta-maps/book_world.otbm — 31×29, bounds 1010..1040 × 1014..1042.
 *   centermap     {1024,1029,7} (caminhável → spawn do jogador)
 *   respawnradius {1020,1023,7} → {1029,1035,7} (10×13; 127 sqm
 *                 caminháveis conectados — (10,13), (11,18) e (18,16)
 *                 locais bloqueados)
 * Fichas oficiais (TibiaWiki BR / TibiaData) em game/js/book-world.js:
 *   Bluebeak 2.430/2.330 · Bramble Wyrmling 2.350/2.350 ·
 *   Crusader 3.400/3.300 · Hawk Hopper 2.180/2.250 (Medium, 25 charm) ·
 *   Headwalker 2.460/2.250 · Lion Hydra 2.760/2.600.
 * Sprites: bluebeak 1849, crusader 1847, hawk-hopper 1858,
 *   headwalker 1880, lion-hydra 1859 do DAT convertido; bramble
 *   wyrmling ausente do DAT → sheet montada do GIF oficial.
 * Loot: 11 itens registrados — creature products vendem ao Yasir
 *   (paper boat 800, star ink 1250, dragon book 1800, torn page 340,
 *   pressed flower 570, cookbook 870, hourglass book 1450, sealing wax
 *   620, hydra head 600); grape e etcher sem comprador → sell 0. */
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
  "book-world.js", "hunt-sections.js", "tileflags.js"])
  vm.runInContext(fs.readFileSync(path.join(js, file), "utf8"), ctx, { filename: file });
ctx.addEventListener = () => {};
vm.runInContext(fs.readFileSync(path.join(js, "otbmhunt.js"), "utf8"), ctx);

const hunt = ctx.GAMEDATA.hunts["book-world"];
must(hunt && hunt.name === "Book World", "hunt book-world ausente/nome errado");
must(hunt.level === 150 && hunt.minLevel === 150, "nível deve ser 150");
const SPECIES = ["bluebeak", "bramble-wyrmling", "crusader",
  "hawk-hopper", "headwalker", "lion-hydra"];
must(JSON.stringify(hunt.monsters) === JSON.stringify(SPECIES), "monstros divergentes");
for (const slug of SPECIES)
  must(typeof hunt.spawnWeights[slug] === "number" && hunt.spawnWeights[slug] > 0,
    "spawnWeights ausente em " + slug);
must(hunt.pack === 8 && hunt.packMin === 6 && hunt.packMax === 8, "pack deve ser 6–8");
must(hunt.otbm === "book_world" && hunt.otbmFloor === 7, "OTBM/piso errado");
must(JSON.stringify(hunt.otbmSpawn) === JSON.stringify({ x: 1024, y: 1029, z: 7 }),
  "spawn diverge do centermap informado");
must(JSON.stringify(hunt.otbmMobBounds) === JSON.stringify({ x: 1020, y: 1023, w: 10, h: 13, z: 7 }),
  "respawnradius diverge das coordenadas informadas");

// OTBM publicado: byte-identico à origem e só z=7.
const bytes = fs.readFileSync(path.join(game, "maps", "book_world.otbm"));
must(bytes.equals(fs.readFileSync(path.join(game, "beta-maps", "book_world.otbm"))),
  "OTBM publicado diverge de beta-maps");
const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
for (let z = 0; z < 16; z++) must(OTBM.read(ab, { z }).z === 7, "andar inesperado no OTBM");
const parsed = OTBM.read(ab, { z: 7 });
const b = parsed.sourceBounds;
must(parsed.w === 31 && parsed.h === 29 && b.minX === 1010 && b.minY === 1014 &&
  b.maxX === 1040 && b.maxY === 1042, "bounds reais do OTBM divergem");
for (const cell of Object.values(parsed.cells)) for (const id of [cell.g, ...cell.items])
  must(!id || fs.existsSync(path.join(game, "assets", "tiles", id + ".png")),
    "tile sem sprite: " + id);
{
  const rmeCtx = { window: {} }; rmeCtx.window = rmeCtx; vm.createContext(rmeCtx);
  vm.runInContext(fs.readFileSync(path.join(game, "rme", "data", "known_tiles.js"), "utf8"), rmeCtx);
  const unlisted = OTBM.missingTiles(parsed, rmeCtx.RME_KNOWN_TILES);
  must(unlisted.length === 0,
    "tiles da book_world fora do catálogo RME: " + unlisted.join(", "));
}

// Zonas absolutas → locais; spawn e área de respawn caminháveis e conectadas.
ctx.applyHuntOtbmZones(parsed, hunt);
must(parsed.spawn.x === 14 && parsed.spawn.y === 15, "spawn local errado (esperado 14,15)");
must(parsed.mob.length === 130, "zona de respawn deve cobrir 10×13 = 130 sqm");
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
must(available === 127, "respawn conectado diverge do analisado: " + available);
must(available >= 8 * 2, "respawn sem área conectada para o pack máximo");

// Categoria HUNTS 100–250: book-world é a última hunt da seção.
const s150 = ctx.HUNT_MODAL_SECTIONS.find((s) => s.title === "HUNTS 100–250");
must(s150, "seção HUNTS 100–250 ausente");
must(s150.ids.indexOf("book-world") === s150.ids.length - 1,
  "book-world não está no fim do HUNTS 100–250");
const ui = fs.readFileSync(path.join(js, "ui.js"), "utf8"), huntList = {};
Object.assign(ctx, { $: () => huntList, $$: () => [], HUNT_UI: { busca: "" },
  huntRisk: () => ({ cls: "mid", txt: "150+" }), fmt: String,
  mobImg: (slug) => '<img src="assets/mob/' + slug + '.png">', G: { p: {} } });
vm.runInContext(ui.slice(ui.indexOf("function renderHunts(p)"),
  ui.indexOf("function openHuntsModal()")), ctx);
ctx.renderHunts(ctx.G.p);
must(huntList.innerHTML.includes('data-hunt="book-world"'), "card não renderiza no modal");

// Monstros novos (15.10): fichas oficiais do patch + sheets válidos.
const canary = JSON.parse(fs.readFileSync(path.join(game, "data", "canarymonsters.json"), "utf8"));
for (const slug of SPECIES)
  must(!canary[slug], slug + ": criatura 15.10 apareceu no dump Canary — revisar patch");
{
  const blu = ctx.MONSTERDATA["bluebeak"];
  must(blu && blu.hp === 2430 && blu.exp === 2330 && blu.looktype === 1849 &&
    blu.resist.fire === -5 && blu.resist.energy === -5 && blu.resist.holy === 10 &&
    blu.best.charm === 50 && blu.best.ocor === 0 &&
    blu.loot.length === 13 && blu.loot[0].item === "gold-coin" &&
    blu.loot[1].item === "platinum-coin" && blu.loot[1].max === 11 &&
    blu.loot[12].item === "blue-gem",
    "bluebeak: ficha oficial divergente");
  const bra = ctx.MONSTERDATA["bramble-wyrmling"];
  must(bra && bra.hp === 2350 && bra.exp === 2350 &&
    bra.resist.earth === 20 && bra.resist.death === -10 && bra.resist.physical === 5 &&
    bra.best.charm === 50 &&
    bra.loot.length === 10 && bra.loot[4].item === "book-with-a-dragon" &&
    bra.loot[5].item === "terra-hood",
    "bramble-wyrmling: ficha oficial divergente");
  const cru = ctx.MONSTERDATA["crusader"];
  must(cru && cru.hp === 3400 && cru.exp === 3300 && cru.looktype === 1847 &&
    cru.resist.physical === 10 && cru.resist.ice === -10 && cru.resist.earth === -5 &&
    cru.best.charm === 50 &&
    cru.loot.length === 11 && cru.loot[3].item === "torn-page" &&
    cru.loot[8].item === "cookbook-creature-product" &&
    cru.loot[9].item === "warrior-helmet",
    "crusader: ficha oficial divergente");
  const haw = ctx.MONSTERDATA["hawk-hopper"];
  must(haw && haw.hp === 2180 && haw.exp === 2250 && haw.looktype === 1858 &&
    haw.resist.earth === 15 && haw.resist.fire === -10 && haw.best.charm === 25 &&
    haw.best.stars === 3 &&
    haw.loot.length === 13 && haw.loot[2].item === "earth-arrow" &&
    haw.loot[10].item === "butterfly-ring" && haw.loot[12].item === "elvish-bow",
    "hawk-hopper: ficha oficial divergente");
  const hea = ctx.MONSTERDATA["headwalker"];
  must(hea && hea.hp === 2460 && hea.exp === 2250 && hea.looktype === 1880 &&
    hea.resist.energy === 15 && hea.resist.death === -10 && hea.best.charm === 50 &&
    hea.loot.length === 11 && hea.loot[9].item === "blank-imbuement-scroll" &&
    hea.loot[10].item === "life-ring",
    "headwalker: ficha oficial divergente");
  const lio = ctx.MONSTERDATA["lion-hydra"];
  must(lio && lio.hp === 2760 && lio.exp === 2600 && lio.looktype === 1859 &&
    lio.resist.earth === -5 && lio.resist.death === -10 && lio.best.charm === 50 &&
    lio.loot.length === 12 && lio.loot[2].item === "sealing-wax" &&
    lio.loot[10].item === "medusa-shield" && lio.loot[11].item === "gold-ingot",
    "lion-hydra: ficha oficial divergente");
  for (const slug of SPECIES) {
    const m = ctx.MONSTERDATA[slug];
    must(m.best.classe === "Inkborn" && m.best.ocor === 0 &&
      m.imune.indexOf("paralyze") !== -1 && m.imune.indexOf("invisible") !== -1,
      slug + ": bestiário/imunidades divergentes");
  }
}
for (const slug of SPECIES) {
  const sheet = ctx.MOBSHEETS[slug];
  const png = fs.readFileSync(path.join(game, "assets", "mob", slug + ".png"));
  must(sheet && png.readUInt32BE(16) === sheet.cw * sheet.cols &&
    png.readUInt32BE(20) === sheet.ch * sheet.rows,
    slug + ": sprite incompatível com metadados");
}

// Loot: 11 itens novos registrados cliente e servidor com preço oficial
// + ícones presentes. Demais drops já existiam no catálogo.
const LOOT = { "paper-boat": [51420, 800], "star-ink": [51422, 1250],
  "grape": [3592, 0], "book-with-a-dragon": [51423, 1800],
  "torn-page": [51427, 340], "pressed-flower": [51428, 570],
  "cookbook-creature-product": [51424, 870],
  "book-with-an-hourglass": [51425, 1450], "sealing-wax": [51426, 620],
  "etcher": [51443, 30000], "hydra-head": [10282, 600] };
const catalog = { console }; catalog.window = catalog; vm.createContext(catalog);
for (const file of ["gamedata.js", "weapondata.js", "weapons.js", "quiverdata.js",
  "core.js", "accessorydata.js", "supply-stash-data.js", "supplydata.js", "supplies.js",
  "yasir-prices.js", "hardcore-library.js", "hard-hunts.js", "magma-bubble.js", "gnomprona.js",
  "falcon-bastion.js", "deathlings-sunken-temple.js",
  "azzilon-castle.js", "bloodrotten.js", "glooth-cave.js", "buried-cathedral.js",
  "buster-darashia.js", "urmahlullu.js", "bashmuul-issavi.js", "true-asuras.js",
  "mimar-haffar.js", "moonstone-castle.js", "radiant-skyhold.js", "book-world.js"]) {
  vm.runInContext(fs.readFileSync(path.join(js, file), "utf8"), catalog, { filename: file });
  if (file === "weapons.js") vm.runInContext("fundirWeaponData()", catalog);
}
const E = require(path.join(__dirname, "..", "server", "authoritative_engine.js"));
for (const slug of Object.keys(LOOT)) {
  const [cid, sell] = LOOT[slug];
  const client = catalog.GAMEDATA.items[slug], server = E.ITEMS[slug];
  must(client && server && client.cid === cid && server.cid === cid &&
    Number(client.sell) === sell && Number(server.sell) === sell,
    slug + ": registro/preço inconsistente");
  must(fs.existsSync(path.join(game, "assets", "item", slug + ".png")),
    slug + ": ícone ausente");
}
/* O cookbook cid 3234 (item de quest antigo) continua intacto — o do
 * Book World é um slug separado. */
must(catalog.GAMEDATA.items["cookbook"] && catalog.GAMEDATA.items["cookbook"].cid === 3234,
  "cookbook antigo (3234) foi sobrescrito");
/* Todos os slugs referenciados nas loot tables resolvem no catálogo. */
const known = new Set(Object.keys(catalog.GAMEDATA.items)
  .concat(Object.keys(catalog.AMMODATA ? catalog.AMMODATA.ammo || {} : {}))
  .concat(Object.keys(catalog.QUIVERDATA ? catalog.QUIVERDATA.ammo || {} : {})));
for (const slug of SPECIES) for (const l of ctx.MONSTERDATA[slug].loot)
  must(known.has(l.item), slug + " dropa item fora do catálogo: " + l.item);

// Servidor autoritativo: definição da hunt, pack 6–8, só as 6 espécies
// e fichas presentes no MONSTERS.
must(E.HUNTS["book-world"] && E.HUNTS["book-world"].packMin === 6 &&
  E.HUNTS["book-world"].packMax === 8 &&
  JSON.stringify(E.HUNTS["book-world"].monsters) === JSON.stringify(SPECIES),
  "HUNTS do servidor sem book-world ou pack errado");
for (const slug of SPECIES)
  must(E.MONSTERS[slug] && E.MONSTERS[slug].hp > 2000,
    slug + ": ausente do MONSTERS do servidor");
const desc = { kind: "hunt", huntId: "book-world", instanceMode: "non-pvp",
  activeCharacterId: "1", state: { hunt, mobs: [], pendingSpawns: [], players: [] },
  members: [{ id: "1", p: { id: "1", voc: "knight", level: 150, hp: 3000, mp: 500,
    gold: 0, skills: { fist: 100, sword: 100, axe: 100, club: 100, dist: 100, shield: 100 },
    ml: 10, config: {}, equip: {}, supplies: {}, stamina: 54000 } }] };
const seen = new Set();
for (let i = 0; i < 40; i++) {
  const d = E.initializeAuthority(JSON.parse(JSON.stringify(desc)),
    "test-book-world-" + i, Date.now());
  E.spawnHuntWave(d.authority, Date.now() + 1000, { force: true });
  const n = (d.authority.pendingSpawns || []).length;
  must(n >= 6 && n <= 8, "pack autoritativo fora de 6–8: " + n);
  must(d.authority.pendingSpawns.every((sp) => SPECIES.includes(sp.mob.slug)),
    "monstro fora da hunt no pack autoritativo");
  for (const sp of d.authority.pendingSpawns) seen.add(sp.mob.slug);
}
for (const slug of SPECIES)
  must(seen.has(slug), slug + " nunca spawnou na wave autoritativa");

// index.html carrega o patch.
const html = fs.readFileSync(path.join(game, "index.html"), "utf8");
must(html.includes("js/book-world.js?v="), "book-world.js não carregado no index");

console.log("OK — Book World: OTBM 31×29 z=7, " + available +
  " sqm de respawn conectado, pack 6–8, 6 criaturas 15.10 + " +
  "11 itens novos, seção HUNTS 100–250.");
