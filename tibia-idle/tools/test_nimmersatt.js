/* Regressão: hunt NIMMERSATT'S BREEDING GROUND (categoria HUNTS 400+,
 * última da seção). Dragolisk / Mega Dragon / Wardragon (34/33/33),
 * pack 8–10, OTBM próprio z=7.
 * Mapa: game/maps/nimmersatt_breeding_ground.otbm publicado byte-igual a
 * partir de beta-maps/Nimmersatt's Breeding Ground.otbm — 46×32, bounds
 * 1010..1055 × 1016..1047.
 *   playerspawn   {1030,1030,7}
 *   respawnradius {1023,1024,7} → {1037,1037,7} (15×14 = 210 sqm)
 * Creature products novos (Yasir): nimmersatt-s-seal 520 /
 * molten-dragon-essence 840 / mega-dragon-heart 1100 / dragolisk-eye 690 /
 * dragolisk-poison-gland 475 / wardragon-claw 550 / wardragon-tooth 730.
 * prismatic-quartz (joalheria 450), dragon-tongue (Yasir 550) e white-gem
 * (joalheria 12.000) já existiam no catálogo — não redeclarados.
 * exp vem do dump Canary (5050/7810/5810), não do wiki. */
"use strict";
const fs = require("fs"), path = require("path"), vm = require("vm");
const game = path.join(__dirname, "..", "game"), js = path.join(game, "js");
const OTBM = require(path.join(js, "otbm.js"));
function must(ok, msg) { if (!ok) throw Error(msg); }
const ctx = { window: {}, console, Math, Date, Map, Set };
ctx.window = ctx;
vm.createContext(ctx);
for (const file of ["gamedata.js", "monsterdata.js", "mobsheetdata.js",
  "accessorydata.js", "warzone9.js", "nimmersatt.js", "hunt-sections.js", "tileflags.js"])
  vm.runInContext(fs.readFileSync(path.join(js, file), "utf8"), ctx, { filename: file });
ctx.addEventListener = () => {};
vm.runInContext(fs.readFileSync(path.join(js, "otbmhunt.js"), "utf8"), ctx);

const hunt = ctx.GAMEDATA.hunts["nimmersatt-breeding-ground"];
must(hunt && hunt.name === "Nimmersatt's Breeding Ground", "hunt nimmersatt-breeding-ground ausente/nome errado");
must(hunt.level === 400 && hunt.minLevel === 400, "nível deve ser 400");
must(hunt.cat === "hard", "cat deve ser hard");
const SPECIES = ["dragolisk", "mega-dragon", "wardragon"];
must(JSON.stringify(hunt.monsters) === JSON.stringify(SPECIES), "monstros divergentes");
must(hunt.spawnWeights["dragolisk"] === 34 &&
  hunt.spawnWeights["mega-dragon"] === 33 &&
  hunt.spawnWeights["wardragon"] === 33, "spawnWeights 34/33/33 ausente");
must(hunt.pack === 10 && hunt.packMin === 8 && hunt.packMax === 10,
  "pack deve ser 8–10");
must(hunt.otbm === "nimmersatt_breeding_ground" && hunt.otbmFloor === 7, "OTBM/piso errado");
must(JSON.stringify(hunt.otbmSpawn) === JSON.stringify({ x: 1030, y: 1030, z: 7 }),
  "otbmSpawn diverge do playerspawn informado");
must(JSON.stringify(hunt.otbmMobBounds) === JSON.stringify({ x: 1023, y: 1024, w: 15, h: 14, z: 7 }),
  "respawnradius diverge das coordenadas informadas");

// OTBM publicado: byte-idêntico à origem e só z=7.
const bytes = fs.readFileSync(path.join(game, "maps", "nimmersatt_breeding_ground.otbm"));
must(bytes.equals(fs.readFileSync(path.join(game, "beta-maps", "Nimmersatt's Breeding Ground.otbm"))),
  "OTBM publicado diverge de beta-maps");
const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
for (let z = 0; z < 16; z++) must(OTBM.read(ab, { z }).z === 7, "andar inesperado no OTBM");
const parsed = OTBM.read(ab, { z: 7 });
const b = parsed.sourceBounds;
must(parsed.w === 46 && parsed.h === 32 && b.minX === 1010 && b.minY === 1016 &&
  b.maxX === 1055 && b.maxY === 1047, "bounds reais do OTBM divergem");
for (const cell of Object.values(parsed.cells)) for (const id of [cell.g, ...cell.items])
  must(!id || fs.existsSync(path.join(game, "assets", "tiles", id + ".png")),
    "tile sem sprite: " + id);
// Todos os ids usados constam no catálogo do editor RME.
{
  const rmeCtx = { window: {} }; rmeCtx.window = rmeCtx; vm.createContext(rmeCtx);
  vm.runInContext(fs.readFileSync(path.join(game, "rme", "data", "known_tiles.js"), "utf8"), rmeCtx);
  const unlisted = OTBM.missingTiles(parsed, rmeCtx.RME_KNOWN_TILES);
  must(unlisted.length === 0,
    "tiles do nimmersatt_breeding_ground fora do catálogo RME: " + unlisted.join(", "));
}

// Zonas absolutas → locais; spawn e área de respawn caminháveis/conectadas.
ctx.applyHuntOtbmZones(parsed, hunt);
must(parsed.spawn.x === 20 && parsed.spawn.y === 14, "spawn local errado (esperado 20,14)");
must(parsed.mob.length === 210, "zona de respawn deve cobrir 15×14 = 210 sqm");
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
must(reached.size === 299, "componente conectado deve ter 299 sqm: " + reached.size);
let available = 0;
for (const c of parsed.mob) {
  must(walkable(c.x, c.y), "célula da zona bloqueada: " + c.x + "," + c.y);
  if (reached.has(c.x + "," + c.y)) available++;
}
must(available === 210, "zona de respawn não é toda conectada: " + available + "/210");

// Card no modal HUNTS 400+ (último da seção).
const s400 = ctx.HUNT_MODAL_SECTIONS.find((s) => s.title === "HUNTS 400+");
must(s400 && s400.ids[s400.ids.length - 1] === "nimmersatt-breeding-ground",
  "nimmersatt-breeding-ground deve ser o último id da categoria HUNTS 400+");
const ui = fs.readFileSync(path.join(js, "ui.js"), "utf8"), huntList = {};
Object.assign(ctx, { $: () => huntList, $$: () => [], HUNT_UI: { busca: "" },
  huntRisk: () => ({ cls: "hard", txt: "400+" }), fmt: String,
  mobImg: (slug) => '<img src="assets/mob/' + slug + '.png">', G: { p: {} } });
vm.runInContext(ui.slice(ui.indexOf("function renderHunts(p)"),
  ui.indexOf("function openHuntsModal()")), ctx);
ctx.renderHunts(ctx.G.p);
must(huntList.innerHTML.includes('data-hunt="nimmersatt-breeding-ground"'), "card não renderiza no modal");

// Monstros: dados Canary + sprite compatível com o sheet.
const canary = JSON.parse(fs.readFileSync(path.join(game, "data", "canarymonsters.json"), "utf8"));
const DUMP = {
  "dragolisk": { hp: 6180, exp: 5050 },
  "mega-dragon": { hp: 7920, exp: 7810 },
  "wardragon": { hp: 6960, exp: 5810 },
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

// Loot: cada drop registrado no cliente e no servidor com preço e ícone.
// Mesma ordem do loop "Conteúdo novo" da authoritative_engine — patches
// que reprecificam itens compartilhados (white-gem etc.) precisam rodar
// na sequência em que o servidor os carrega.
const catalog = { console }; catalog.window = catalog; vm.createContext(catalog);
for (const file of ["gamedata.js", "weapondata.js", "weapons.js", "quiverdata.js",
  "core.js", "accessorydata.js", "supply-stash-data.js", "supplydata.js", "supplies.js",
  "yasir-prices.js", "hardcore-library.js", "hard-hunts.js", "magma-bubble.js", "gnomprona.js",
  "falcon-bastion.js", "deathlings-sunken-temple.js",
  "azzilon-castle.js", "bloodrotten.js", "glooth-cave.js", "buried-cathedral.js",
  "buster-darashia.js", "urmahlullu.js", "bashmuul-issavi.js", "true-asuras.js",
  "mimar-haffar.js", "moonstone-castle.js", "radiant-skyhold.js", "book-world.js",
  "sir-leonard.js", "norcferatus-fortress.js", "unhallowed-crypt.js",
  "roost-graveborn.js", "court-warlock.js", "warzone9.js", "nimmersatt.js",
  "brainstealer-boss.js", "mega-magmaoid-boss.js"]) {
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
// prismatic-quartz 450 (joalheria), dragon-tongue 550 (Yasir),
// white-gem 12.000 (joalheria), platinum-coin 100.
for (const [slug, price] of Object.entries({
  "nimmersatt-s-seal": 520, "molten-dragon-essence": 840,
  "mega-dragon-heart": 1100, "dragolisk-eye": 690,
  "dragolisk-poison-gland": 475, "wardragon-claw": 550,
  "wardragon-tooth": 730, "dragon-tongue": 550,
  "prismatic-quartz": 450, "white-gem": 12000,
  "platinum-coin": 100,
})) for (const items of [catalog.GAMEDATA.items, E.ITEMS])
  must(items[slug] && (items[slug].npcSell ?? items[slug].sell) === price,
    slug + ": preço oficial incorreto");

// Servidor autoritativo: definição da hunt e pack 8–10 só com as espécies.
must(E.HUNTS["nimmersatt-breeding-ground"] && E.HUNTS["nimmersatt-breeding-ground"].packMin === 8 &&
  E.HUNTS["nimmersatt-breeding-ground"].packMax === 10 &&
  JSON.stringify(E.HUNTS["nimmersatt-breeding-ground"].monsters) === JSON.stringify(SPECIES),
  "HUNTS do servidor sem nimmersatt-breeding-ground ou pack errado");
const desc = { kind: "hunt", huntId: "nimmersatt-breeding-ground", instanceMode: "non-pvp",
  activeCharacterId: "1", state: { hunt, mobs: [], pendingSpawns: [], players: [] },
  members: [{ id: "1", p: { id: "1", voc: "knight", level: 400, hp: 12000, mp: 1200,
    gold: 0, skills: { fist: 100, sword: 100, axe: 100, club: 100, dist: 100, shield: 100 },
    ml: 10, config: {}, equip: {}, supplies: {}, stamina: 54000 } }] };
const seen = new Set();
for (let i = 0; i < 40; i++) {
  const d = E.initializeAuthority(JSON.parse(JSON.stringify(desc)),
    "test-nimmersatt-" + i, Date.now());
  E.spawnHuntWave(d.authority, Date.now() + 1000, { force: true });
  const n = (d.authority.pendingSpawns || []).length;
  must(n >= 8 && n <= 10, "pack autoritativo fora de 8–10: " + n);
  must(d.authority.pendingSpawns.every((sp) => SPECIES.includes(sp.mob.slug)),
    "monstro fora da hunt no pack autoritativo");
  seen.add(n);
}

// index.html carrega o patch depois de warzone9.js.
const html = fs.readFileSync(path.join(game, "index.html"), "utf8");
must(html.includes("js/nimmersatt.js?v="), "nimmersatt.js não carregado no index");
must(html.indexOf("js/warzone9.js") < html.indexOf("js/nimmersatt.js"),
  "nimmersatt.js deve carregar depois de warzone9.js");

console.log("OK — Nimmersatt's Breeding Ground: OTBM 46×32 z=7, " + available +
  " sqm de respawn conectado, pack " + Math.min(...seen) + "–" + Math.max(...seen) +
  ", " + lootSlugs.size + " itens de loot com sprite e preço, HUNTS 400+.");
