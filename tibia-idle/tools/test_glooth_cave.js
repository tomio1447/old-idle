/* Regressão: hunt GLOOTH CAVE — ORAMOND (nível 150+).
 * Glooth Bandit + Glooth Brigand, 6–12 por onda, OTBM próprio z=7. */
"use strict";
const fs = require("fs"), path = require("path"), vm = require("vm");
const game = path.join(__dirname, "..", "game"), js = path.join(game, "js");
const OTBM = require(path.join(js, "otbm.js"));
function must(ok, msg) { if (!ok) throw Error(msg); }
const ctx = { window: {}, console, Math, Date, Map, Set };
ctx.window = ctx;
vm.createContext(ctx);
for (const file of ["gamedata.js", "monsterdata.js", "mobsheetdata.js",
  "accessorydata.js", "glooth-cave.js", "hunt-sections.js", "tileflags.js"])
  vm.runInContext(fs.readFileSync(path.join(js, file), "utf8"), ctx, { filename: file });
ctx.addEventListener = () => {};
vm.runInContext(fs.readFileSync(path.join(js, "otbmhunt.js"), "utf8"), ctx);

const hunt = ctx.GAMEDATA.hunts["glooth-cave"];
must(hunt && hunt.name === "Glooth Cave - Oramond", "hunt glooth-cave ausente/nome errado");
must(hunt.level === 150 && hunt.minLevel === 150, "nível deve ser 150");
must(JSON.stringify(hunt.monsters) ===
  JSON.stringify(["glooth-bandit", "glooth-brigand"]), "monstros divergentes");
must(hunt.pack === 12 && hunt.packMin === 6 && hunt.packMax === 12,
  "pack deve ser 6–12");
must(hunt.otbm === "glooths_cave" && hunt.otbmFloor === 7, "OTBM/piso errado");
must(JSON.stringify(hunt.otbmSpawn) === JSON.stringify({ x: 1025, y: 1030, z: 7 }) &&
  JSON.stringify(hunt.otbmMobBounds) === JSON.stringify({ x: 1019, y: 1025, w: 17, h: 9, z: 7 }),
  "center/respawn divergem das coordenadas informadas");

// OTBM publicado: byte-identico à origem e só z=7.
const bytes = fs.readFileSync(path.join(game, "maps", "glooths_cave.otbm"));
must(bytes.equals(fs.readFileSync(path.join(game, "beta-maps", "glooths_cave.otbm"))),
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

// Zonas absolutas → locais; spawn e área de respawn caminháveis e conectadas.
ctx.applyHuntOtbmZones(parsed, hunt);
must(parsed.spawn.x === 17 && parsed.spawn.y === 14, "spawn local errado");
must(parsed.mob.length === 153, "zona de respawn deve cobrir 17×9 = 153 sqm");
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
must(available >= 12 * 2, "respawn sem área conectada para o pack máximo");

// Catálogo HUNTS 100–250 e card no modal.
must(ctx.HUNT_MODAL_SECTIONS.find((s) => s.title === "HUNTS 100–250").ids.includes("glooth-cave"),
  "glooth-cave ausente do catálogo");
const ui = fs.readFileSync(path.join(js, "ui.js"), "utf8"), huntList = {};
Object.assign(ctx, { $: () => huntList, $$: () => [], HUNT_UI: { busca: "" },
  huntRisk: () => ({ cls: "mid", txt: "150+" }), fmt: String,
  mobImg: (slug) => '<img src="assets/mob/' + slug + '.png">', G: { p: {} } });
vm.runInContext(ui.slice(ui.indexOf("function renderHunts(p)"),
  ui.indexOf("function openHuntsModal()")), ctx);
ctx.renderHunts(ctx.G.p);
must(huntList.innerHTML.includes('data-hunt="glooth-cave"'), "card não renderiza no modal");

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
  "azzilon-castle.js", "bloodrotten.js", "glooth-cave.js", "urmahlullu.js", "bashmuul-issavi.js",
  "true-asuras.js", "mimar-haffar.js"]) {
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
// Preços oficiais confirmados (TibiaWiki): vendíveis e os sem comprador (0).
for (const [slug, price] of Object.entries({
  "glooth-blade": 1500, "glooth-club": 1500, "glooth-axe": 1500,
  "glooth-cape": 7000, "glooth-amulet": 2000, "heat-core": 10000,
  "terra-amulet": 1500, "terra-hood": 2500, "beastslayer-axe": 1500,
  "dreaded-cleaver": 15000, "butcher-s-axe": 18000, "war-axe": 12000,
  "skull-staff": 6000, "giant-shimmering-pearl": 3000, "small-topaz": 200,
  "glooth-spear": 0, "glooth-bag": 0, "glooth-capsule": 0,
  "tainted-glooth-capsule": 0, "glooth-sandwich": 0, "glooth-steak": 0,
})) for (const items of [catalog.GAMEDATA.items, E.ITEMS])
  must(items[slug] && (items[slug].npcSell ?? items[slug].sell) === price,
    slug + ": preço oficial incorreto");
// Amuletos novos: acessórios com cargas, não podem ser registrados como loot.
for (const items of [catalog.GAMEDATA.items, E.ITEMS]) {
  must(items["glooth-amulet"].s === "amulet" && items["glooth-amulet"].t === "accessory" &&
    items["glooth-amulet"].charges === 20, "glooth-amulet sem atributos de acessório");
  must(items["terra-amulet"].s === "amulet" && items["terra-amulet"].t === "accessory" &&
    items["terra-amulet"].charges === 200 && items["terra-amulet"].res.earth === 20,
    "terra-amulet sem atributos de acessório");
}

// Servidor autoritativo: definição da hunt e pack 6–12.
must(E.HUNTS["glooth-cave"] && E.HUNTS["glooth-cave"].packMin === 6 &&
  E.HUNTS["glooth-cave"].packMax === 12 &&
  JSON.stringify(E.HUNTS["glooth-cave"].monsters) ===
    JSON.stringify(["glooth-bandit", "glooth-brigand"]),
  "HUNTS do servidor sem glooth-cave ou pack errado");
const desc = { kind: "hunt", huntId: "glooth-cave", instanceMode: "non-pvp",
  activeCharacterId: "1", state: { hunt, mobs: [], pendingSpawns: [], players: [] },
  members: [{ id: "1", p: { id: "1", voc: "knight", level: 200, hp: 9000, mp: 900,
    gold: 0, skills: { fist: 100, sword: 100, axe: 100, club: 100, dist: 100, shield: 100 },
    ml: 10, config: {}, equip: {}, supplies: {}, stamina: 54000 } }] };
const seen = new Set();
for (let i = 0; i < 40; i++) {
  const d = E.initializeAuthority(JSON.parse(JSON.stringify(desc)),
    "test-glooth-" + i, Date.now());
  E.spawnHuntWave(d.authority, Date.now() + 1000, { force: true });
  const n = (d.authority.pendingSpawns || []).length;
  must(n >= 6 && n <= 12, "pack autoritativo fora de 6–12: " + n);
  must(d.authority.pendingSpawns.every((sp) => hunt.monsters.includes(sp.mob.slug)),
    "monstro fora da hunt no pack autoritativo");
  seen.add(n);
}
console.log("OK — Glooth Cave - Oramond: OTBM 38×29 z=7, " + available +
  " sqm de respawn conectado, pack " + Math.min(...seen) + "–" + Math.max(...seen) +
  ", " + lootSlugs.size + " itens de loot com sprite e preço.");
