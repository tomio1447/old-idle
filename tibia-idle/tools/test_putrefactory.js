/* Regressão: hunt PUTREFACTORY — BLOOD ROTTEN (nível 600+).
 * Meandering Mushroom + Oozing Carcass + Rotten Man-Maggot + Sopping
 * Carcass, 8–12 por onda, OTBM próprio z=7. O Sopping Carcass tem tabela
 * oficial própria (o Canary publica loot vazio) e os drops de mar/2025
 * (assassin dagger / stone skin amulet) entram como append. */
"use strict";
const fs = require("fs"), path = require("path"), vm = require("vm");
const game = path.join(__dirname, "..", "game"), js = path.join(game, "js");
const OTBM = require(path.join(js, "otbm.js"));
function must(ok, msg) { if (!ok) throw Error(msg); }
const ctx = { window: {}, console, Math, Date, Map, Set };
ctx.window = ctx;
vm.createContext(ctx);
for (const file of ["gamedata.js", "monsterdata.js", "mobsheetdata.js",
  "accessorydata.js", "putrefactory.js", "hunt-sections.js", "tileflags.js"])
  vm.runInContext(fs.readFileSync(path.join(js, file), "utf8"), ctx, { filename: file });
ctx.addEventListener = () => {};
vm.runInContext(fs.readFileSync(path.join(js, "otbmhunt.js"), "utf8"), ctx);

const MONSTERS = ["meandering-mushroom", "oozing-carcass",
  "rotten-man-maggot", "sopping-carcass"];
const hunt = ctx.GAMEDATA.hunts["putrefactory"];
must(hunt && hunt.name === "Putrefactory", "hunt putrefactory ausente/nome errado");
must(hunt.level === 600 && hunt.minLevel === 600, "nível deve ser 600");
must(JSON.stringify(hunt.monsters) === JSON.stringify(MONSTERS),
  "monstros divergentes");
must(hunt.pack === 12 && hunt.packMin === 8 && hunt.packMax === 12,
  "pack deve ser 8–12");
must(hunt.otbm === "putrefactory" && hunt.otbmFloor === 7, "OTBM/piso errado");
must(JSON.stringify(hunt.otbmSpawn) === JSON.stringify({ x: 1028, y: 1031, z: 7 }) &&
  JSON.stringify(hunt.otbmMobBounds) === JSON.stringify({ x: 1022, y: 1027, w: 13, h: 9, z: 7 }),
  "center/respawn divergem das coordenadas informadas");

// OTBM publicado: byte-identico à origem e só z=7.
const bytes = fs.readFileSync(path.join(game, "maps", "putrefactory.otbm"));
must(bytes.equals(fs.readFileSync(path.join(game, "beta-maps", "putrefactory.otbm"))),
  "OTBM publicado diverge de beta-maps");
const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
for (let z = 0; z < 16; z++) must(OTBM.read(ab, { z }).z === 7, "andar inesperado no OTBM");
const parsed = OTBM.read(ab, { z: 7 });
const b = parsed.sourceBounds;
must(parsed.w === 38 && parsed.h === 31 && b.minX === 1009 && b.minY === 1016 &&
  b.maxX === 1046 && b.maxY === 1046, "bounds reais do OTBM divergem");
for (const cell of Object.values(parsed.cells)) for (const id of [cell.g, ...cell.items])
  must(!id || fs.existsSync(path.join(game, "assets", "tiles", id + ".png")),
    "tile sem sprite: " + id);

// Zonas absolutas → locais; spawn e área de respawn caminháveis e conectadas.
ctx.applyHuntOtbmZones(parsed, hunt);
must(parsed.spawn.x === 19 && parsed.spawn.y === 15, "spawn local errado");
must(parsed.mob.length === 117, "zona de respawn deve cobrir 13×9 = 117 sqm");
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

// Seção BLOOD ROTTEN 600+ por último no catálogo e card no modal.
const sections = ctx.HUNT_MODAL_SECTIONS;
const sec = sections.find((s) => s.title === "BLOOD ROTTEN 600+");
must(sec && sec.ids.includes("putrefactory"), "putrefactory ausente do catálogo");
must(sections.indexOf(sec) === sections.length - 2 &&
  sections[sections.length - 1].title === "HUNTS 800+",
  "BLOOD ROTTEN 600+ deve ser a penúltima seção (HUNTS 800+ é a última)");
const ui = fs.readFileSync(path.join(js, "ui.js"), "utf8"), huntList = {};
Object.assign(ctx, { $: () => huntList, $$: () => [], HUNT_UI: { busca: "" },
  huntRisk: () => ({ cls: "high", txt: "600+" }), fmt: String,
  mobImg: (slug) => '<img src="assets/mob/' + slug + '.png">', G: { p: {} } });
vm.runInContext(ui.slice(ui.indexOf("function renderHunts(p)"),
  ui.indexOf("function openHuntsModal()")), ctx);
ctx.renderHunts(ctx.G.p);
must(huntList.innerHTML.includes('data-hunt="putrefactory"'), "card não renderiza no modal");

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

// Tabelas de loot efetivas (patches aplicados): Sopping Carcass completa,
// +assassin-dagger no Meandering, +stone-skin-amulet nos dois carcass.
must(!(canary["sopping-carcass"].loot || []).length,
  "canary do sopping-carcass mudou — revisar patch");
const effClient = ctx.GAMEDATA.monsters;
for (const slug of hunt.monsters) must(effClient[slug] && effClient[slug].loot,
  slug + ": def de loot ausente no cliente");
must(effClient["sopping-carcass"].loot.length === 12,
  "sopping-carcass deveria ter 12 drops oficiais");
must(effClient["meandering-mushroom"].loot.some((l) => l.item === "assassin-dagger"),
  "assassin-dagger ausente no meandering-mushroom");
must(effClient["oozing-carcass"].loot.some((l) => l.item === "stone-skin-amulet") &&
  effClient["sopping-carcass"].loot.some((l) => l.item === "stone-skin-amulet"),
  "stone-skin-amulet ausente nos carcass");
const E = require(path.join(__dirname, "..", "server", "authoritative_engine.js"));
must(E.MONSTERS["sopping-carcass"].loot.length === 12 &&
  E.MONSTERS["meandering-mushroom"].loot.some((l) => l.item === "assassin-dagger") &&
  E.MONSTERS["oozing-carcass"].loot.some((l) => l.item === "stone-skin-amulet"),
  "servidor sem as correções de loot");

// Loot: cada drop efetivo registrado no cliente e no servidor com preço e ícone.
const catalog = { console }; catalog.window = catalog; vm.createContext(catalog);
for (const file of ["gamedata.js", "weapondata.js", "weapons.js", "quiverdata.js",
  "core.js", "accessorydata.js", "supply-stash-data.js", "supplydata.js", "supplies.js",
  "yasir-prices.js", "hardcore-library.js", "magma-bubble.js", "gnomprona.js",
  "azzilon-castle.js", "bloodrotten.js", "glooth-cave.js", "jade-roots.js",
  "putrefactory.js", "urmahlullu.js", "bashmuul-issavi.js"]) {
  vm.runInContext(fs.readFileSync(path.join(js, file), "utf8"), catalog, { filename: file });
  if (file === "weapons.js") vm.runInContext("fundirWeaponData()", catalog);
}
const lootSlugs = new Set();
for (const slug of hunt.monsters)
  for (const drop of effClient[slug].loot) lootSlugs.add(drop.item);
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
// Preços oficiais confirmados (TibiaWiki): Yasir vende os produtos de
// criatura; lichen gobbler é item de quest sem comprador NPC (0).
for (const [slug, price] of Object.entries({
  "lichen-gobbler": 0, "worm-sponge": 4200, "decayed-finger-bone": 5100,
  "blooded-worm": 4700, "rotten-roots": 3800, "stone-skin-amulet": 500,
  "assassin-dagger": 20000, "skull-helmet": 40000, "ripper-lance": 500,
  "underworld-rod": 4400, "wand-of-decay": 1000, "terra-amulet": 1500,
})) for (const items of [catalog.GAMEDATA.items, E.ITEMS])
  must(items[slug] && (items[slug].npcSell ?? items[slug].sell) === price,
    slug + ": preço oficial incorreto");

// Servidor autoritativo: definição da hunt e pack 8–12.
must(E.HUNTS["putrefactory"] && E.HUNTS["putrefactory"].packMin === 8 &&
  E.HUNTS["putrefactory"].packMax === 12 &&
  JSON.stringify(E.HUNTS["putrefactory"].monsters) === JSON.stringify(MONSTERS),
  "HUNTS do servidor sem putrefactory ou pack errado");
const desc = { kind: "hunt", huntId: "putrefactory", instanceMode: "non-pvp",
  activeCharacterId: "1", state: { hunt, mobs: [], pendingSpawns: [], players: [] },
  members: [{ id: "1", p: { id: "1", voc: "knight", level: 700, hp: 30000, mp: 3000,
    gold: 0, skills: { fist: 130, sword: 130, axe: 130, club: 130, dist: 130, shield: 130 },
    ml: 20, config: {}, equip: {}, supplies: {}, stamina: 54000 } }] };
const seen = new Set();
for (let i = 0; i < 40; i++) {
  const d = E.initializeAuthority(JSON.parse(JSON.stringify(desc)),
    "test-putrefactory-" + i, Date.now());
  E.spawnHuntWave(d.authority, Date.now() + 1000, { force: true });
  const n = (d.authority.pendingSpawns || []).length;
  must(n >= 8 && n <= 12, "pack autoritativo fora de 8–12: " + n);
  must(d.authority.pendingSpawns.every((sp) => hunt.monsters.includes(sp.mob.slug)),
    "monstro fora da hunt no pack autoritativo");
  seen.add(n);
}
console.log("OK — Putrefactory: OTBM 38×31 z=7, " + available +
  " sqm de respawn conectado, pack " + Math.min(...seen) + "–" + Math.max(...seen) +
  ", " + lootSlugs.size + " itens de loot com sprite e preço.");
