/* Regressão: hunt GLOOM PILLARS — BLOOD ROTTEN (nível 600+).
 * Converter + Darklight Construct + Darklight Emitter + Wandering
 * Pillar, 8–12 por onda, OTBM próprio z=7. As tabelas Canary já cobrem a
 * maior parte do loot oficial; os drops ausentes do dump (might ring /
 * ultimate mana potion / lightning legs / green gem) entram como append
 * nos dois catálogos. */
"use strict";
const fs = require("fs"), path = require("path"), vm = require("vm");
const game = path.join(__dirname, "..", "game"), js = path.join(game, "js");
const OTBM = require(path.join(js, "otbm.js"));
function must(ok, msg) { if (!ok) throw Error(msg); }
const ctx = { window: {}, console, Math, Date, Map, Set };
ctx.window = ctx;
vm.createContext(ctx);
for (const file of ["gamedata.js", "monsterdata.js", "mobsheetdata.js",
  "accessorydata.js", "gloom-pillars.js", "hunt-sections.js", "tileflags.js"])
  vm.runInContext(fs.readFileSync(path.join(js, file), "utf8"), ctx, { filename: file });
ctx.addEventListener = () => {};
vm.runInContext(fs.readFileSync(path.join(js, "otbmhunt.js"), "utf8"), ctx);

const MONSTERS = ["converter", "darklight-construct",
  "darklight-emitter", "wandering-pillar"];
const hunt = ctx.GAMEDATA.hunts["gloom-pillars"];
must(hunt && hunt.name === "Gloom Pillars", "hunt gloom-pillars ausente/nome errado");
must(hunt.level === 600 && hunt.minLevel === 600, "nível deve ser 600");
must(JSON.stringify(hunt.monsters) === JSON.stringify(MONSTERS),
  "monstros divergentes");
must(hunt.pack === 12 && hunt.packMin === 8 && hunt.packMax === 12,
  "pack deve ser 8–12");
must(hunt.otbm === "gloom_pillars" && hunt.otbmFloor === 7, "OTBM/piso errado");
must(JSON.stringify(hunt.otbmSpawn) === JSON.stringify({ x: 1025, y: 1025, z: 7 }) &&
  JSON.stringify(hunt.otbmMobBounds) === JSON.stringify({ x: 1021, y: 1019, w: 9, h: 12, z: 7 }),
  "center/respawn divergem das coordenadas informadas");

// OTBM publicado: byte-identico à origem e só z=7.
const bytes = fs.readFileSync(path.join(game, "maps", "gloom_pillars.otbm"));
must(bytes.equals(fs.readFileSync(path.join(game, "beta-maps", "gloom_pillars.otbm"))),
  "OTBM publicado diverge de beta-maps");
const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
for (let z = 0; z < 16; z++) must(OTBM.read(ab, { z }).z === 7, "andar inesperado no OTBM");
const parsed = OTBM.read(ab, { z: 7 });
const b = parsed.sourceBounds;
must(parsed.w === 26 && parsed.h === 21 && b.minX === 1012 && b.minY === 1016 &&
  b.maxX === 1037 && b.maxY === 1036, "bounds reais do OTBM divergem");
for (const cell of Object.values(parsed.cells)) for (const id of [cell.g, ...cell.items])
  must(!id || fs.existsSync(path.join(game, "assets", "tiles", id + ".png")),
    "tile sem sprite: " + id);

// Zonas absolutas → locais; spawn e área de respawn caminháveis e conectadas.
ctx.applyHuntOtbmZones(parsed, hunt);
must(parsed.spawn.x === 13 && parsed.spawn.y === 9, "spawn local errado");
must(parsed.mob.length === 108, "zona de respawn deve cobrir 9×12 = 108 sqm");
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
must(sec && sec.ids.includes("gloom-pillars"), "gloom-pillars ausente do catálogo");
must(sections.indexOf(sec) === sections.length - 1,
  "BLOOD ROTTEN 600+ deve ser a última seção");
const ui = fs.readFileSync(path.join(js, "ui.js"), "utf8"), huntList = {};
Object.assign(ctx, { $: () => huntList, $$: () => [], HUNT_UI: { busca: "" },
  huntRisk: () => ({ cls: "high", txt: "600+" }), fmt: String,
  mobImg: (slug) => '<img src="assets/mob/' + slug + '.png">', G: { p: {} } });
vm.runInContext(ui.slice(ui.indexOf("function renderHunts(p)"),
  ui.indexOf("function openHuntsModal()")), ctx);
ctx.renderHunts(ctx.G.p);
must(huntList.innerHTML.includes('data-hunt="gloom-pillars"'), "card não renderiza no modal");

// Monstros: dados Canary + sprite compatível com o sheet + idle animation.
const canary = JSON.parse(fs.readFileSync(path.join(game, "data", "canarymonsters.json"), "utf8"));
const idleSrc = fs.readFileSync(path.join(js, "idleanimdata.js"), "utf8");
for (const slug of hunt.monsters) {
  const md = ctx.MONSTERDATA[slug], sheet = ctx.MOBSHEETS[slug];
  must(md && md.hp === canary[slug].hp && md.looktype === canary[slug].looktype,
    slug + ": dados divergentes do Canary");
  const png = fs.readFileSync(path.join(game, "assets", "mob", slug + ".png"));
  must(sheet && png.readUInt32BE(16) === sheet.cw * sheet.cols &&
    png.readUInt32BE(20) === sheet.ch * sheet.rows,
    slug + ": sprite incompatível com metadados");
  must(idleSrc.includes('"' + slug + '"') &&
    fs.existsSync(path.join(game, "assets", "mob", slug + ".idle.png")),
    slug + ": animação idle ausente");
}

// Tabelas de loot efetivas (patches aplicados): drops oficiais ausentes do
// dump entram nos dois catálogos.
const effClient = ctx.GAMEDATA.monsters;
for (const slug of hunt.monsters) must(effClient[slug] && effClient[slug].loot,
  slug + ": def de loot ausente no cliente");
for (const item of ["might-ring", "ultimate-mana-potion", "lightning-legs"])
  must(effClient["converter"].loot.some((l) => l.item === item),
    item + " ausente no converter");
for (const slug of ["darklight-construct", "darklight-emitter"])
  must(effClient[slug].loot.some((l) => l.item === "green-gem"),
    "green-gem ausente no " + slug);
const E = require(path.join(__dirname, "..", "server", "authoritative_engine.js"));
must(["might-ring", "ultimate-mana-potion", "lightning-legs"]
    .every((i) => E.MONSTERS["converter"].loot.some((l) => l.item === i)) &&
  E.MONSTERS["darklight-construct"].loot.some((l) => l.item === "green-gem") &&
  E.MONSTERS["darklight-emitter"].loot.some((l) => l.item === "green-gem"),
  "servidor sem as correções de loot");

// Loot: cada drop efetivo registrado no cliente e no servidor com preço e ícone.
const catalog = { console }; catalog.window = catalog; vm.createContext(catalog);
for (const file of ["gamedata.js", "weapondata.js", "weapons.js", "quiverdata.js",
  "core.js", "accessorydata.js", "supply-stash-data.js", "supplydata.js", "supplies.js",
  "yasir-prices.js", "hardcore-library.js", "magma-bubble.js", "gnomprona.js",
  "azzilon-castle.js", "bloodrotten.js", "glooth-cave.js", "jade-roots.js",
  "putrefactory.js", "darklight-core.js", "gloom-pillars.js"]) {
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
// Preços oficiais confirmados (TibiaWiki): basalt crumbs/core vendem para
// o Yasir; darklight obsidian axe é item de quest sem comprador NPC (0);
// zaoan armor/shoes usam o preço oficial do Esrik (paridade corrigida).
for (const [slug, price] of Object.entries({
  "darklight-obsidian-axe": 0, "basalt-crumbs": 3000, "basalt-core": 5800,
  "zaoan-armor": 14000, "zaoan-shoes": 5000, "might-ring": 250,
  "ultimate-mana-potion": 0, "lightning-legs": 11000, "green-gem": 5000,
})) for (const items of [catalog.GAMEDATA.items, E.ITEMS])
  must(items[slug] && (items[slug].npcSell ?? items[slug].sell) === price,
    slug + ": preço oficial incorreto");

// Servidor autoritativo: definição da hunt e pack 8–12.
must(E.HUNTS["gloom-pillars"] && E.HUNTS["gloom-pillars"].packMin === 8 &&
  E.HUNTS["gloom-pillars"].packMax === 12 &&
  JSON.stringify(E.HUNTS["gloom-pillars"].monsters) === JSON.stringify(MONSTERS),
  "HUNTS do servidor sem gloom-pillars ou pack errado");
const desc = { kind: "hunt", huntId: "gloom-pillars", instanceMode: "non-pvp",
  activeCharacterId: "1", state: { hunt, mobs: [], pendingSpawns: [], players: [] },
  members: [{ id: "1", p: { id: "1", voc: "knight", level: 700, hp: 30000, mp: 3000,
    gold: 0, skills: { fist: 130, sword: 130, axe: 130, club: 130, dist: 130, shield: 130 },
    ml: 20, config: {}, equip: {}, supplies: {}, stamina: 54000 } }] };
const seen = new Set();
for (let i = 0; i < 40; i++) {
  const d = E.initializeAuthority(JSON.parse(JSON.stringify(desc)),
    "test-gloom-pillars-" + i, Date.now());
  E.spawnHuntWave(d.authority, Date.now() + 1000, { force: true });
  const n = (d.authority.pendingSpawns || []).length;
  must(n >= 8 && n <= 12, "pack autoritativo fora de 8–12: " + n);
  must(d.authority.pendingSpawns.every((sp) => hunt.monsters.includes(sp.mob.slug)),
    "monstro fora da hunt no pack autoritativo");
  seen.add(n);
}
console.log("OK — Gloom Pillars: OTBM 26×21 z=7, " + available +
  " sqm de respawn conectado, pack " + Math.min(...seen) + "–" + Math.max(...seen) +
  ", " + lootSlugs.size + " itens de loot com sprite e preço.");
