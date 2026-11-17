/* Regressão: hunt JADE ROOTS — BLOOD ROTTEN (nível 600+).
 * Bloated Man-Maggot + Mycobiontic Beetle + Sopping Corpus, 8–12 por onda,
 * OTBM próprio z=7. */
"use strict";
const fs = require("fs"), path = require("path"), vm = require("vm");
const game = path.join(__dirname, "..", "game"), js = path.join(game, "js");
const OTBM = require(path.join(js, "otbm.js"));
function must(ok, msg) { if (!ok) throw Error(msg); }
const ctx = { window: {}, console, Math, Date, Map, Set };
ctx.window = ctx;
vm.createContext(ctx);
for (const file of ["gamedata.js", "monsterdata.js", "mobsheetdata.js",
  "accessorydata.js", "jade-roots.js", "hunt-sections.js", "tileflags.js"])
  vm.runInContext(fs.readFileSync(path.join(js, file), "utf8"), ctx, { filename: file });
ctx.addEventListener = () => {};
vm.runInContext(fs.readFileSync(path.join(js, "otbmhunt.js"), "utf8"), ctx);

const hunt = ctx.GAMEDATA.hunts["jade-roots"];
must(hunt && hunt.name === "Jade Roots", "hunt jade-roots ausente/nome errado");
must(hunt.level === 600 && hunt.minLevel === 600, "nível deve ser 600");
must(JSON.stringify(hunt.monsters) ===
  JSON.stringify(["bloated-man-maggot", "mycobiontic-beetle", "sopping-corpus"]),
  "monstros divergentes");
must(hunt.pack === 12 && hunt.packMin === 8 && hunt.packMax === 12,
  "pack deve ser 8–12");
must(hunt.otbm === "jade_roots" && hunt.otbmFloor === 7, "OTBM/piso errado");
must(JSON.stringify(hunt.otbmSpawn) === JSON.stringify({ x: 1027, y: 1027, z: 7 }) &&
  JSON.stringify(hunt.otbmMobBounds) === JSON.stringify({ x: 1020, y: 1023, w: 15, h: 10, z: 7 }),
  "center/respawn divergem das coordenadas validadas");

// OTBM publicado: byte-identico à origem e só z=7.
const bytes = fs.readFileSync(path.join(game, "maps", "jade_roots.otbm"));
must(bytes.equals(fs.readFileSync(path.join(game, "beta-maps", "jade_roots.otbm"))),
  "OTBM publicado diverge de beta-maps");
const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
for (let z = 0; z < 16; z++) must(OTBM.read(ab, { z }).z === 7, "andar inesperado no OTBM");
const parsed = OTBM.read(ab, { z: 7 });
const b = parsed.sourceBounds;
must(parsed.w === 33 && parsed.h === 23 && b.minX === 1011 && b.minY === 1017 &&
  b.maxX === 1043 && b.maxY === 1039, "bounds reais do OTBM divergem");
for (const cell of Object.values(parsed.cells)) for (const id of [cell.g, ...cell.items])
  must(!id || fs.existsSync(path.join(game, "assets", "tiles", id + ".png")),
    "tile sem sprite: " + id);

// Zonas absolutas → locais; spawn e área de respawn caminháveis e conectadas.
ctx.applyHuntOtbmZones(parsed, hunt);
must(parsed.spawn.x === 16 && parsed.spawn.y === 10, "spawn local errado");
must(parsed.mob.length === 150, "zona de respawn deve cobrir 15×10 = 150 sqm");
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
must(sec && sec.ids.includes("jade-roots"), "jade-roots ausente do catálogo");
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
must(huntList.innerHTML.includes('data-hunt="jade-roots"'), "card não renderiza no modal");

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
// bloated-man-maggot tem animação idle oficial (.idle.png + IDLE_ANIMATIONS).
const idleSrc = fs.readFileSync(path.join(js, "idleanimdata.js"), "utf8");
must(idleSrc.includes('"bloated-man-maggot"'),
  "idle animation do bloated-man-maggot ausente");
must(fs.existsSync(path.join(game, "assets", "mob", "bloated-man-maggot.idle.png")),
  "sheet idle do bloated-man-maggot ausente");

// Loot: cada drop Canary registrado no cliente e no servidor com preço e ícone.
const catalog = { console }; catalog.window = catalog; vm.createContext(catalog);
for (const file of ["gamedata.js", "weapondata.js", "weapons.js", "quiverdata.js",
  "core.js", "accessorydata.js", "supply-stash-data.js", "supplydata.js", "supplies.js",
  "yasir-prices.js", "hardcore-library.js", "magma-bubble.js", "gnomprona.js",
  "azzilon-castle.js", "bloodrotten.js", "glooth-cave.js", "jade-roots.js", "urmahlullu.js", "bashmuul-issavi.js"]) {
  vm.runInContext(fs.readFileSync(path.join(js, file), "utf8"), catalog, { filename: file });
  if (file === "weapons.js") vm.runInContext("fundirWeaponData()", catalog);
}
const E = require(path.join(__dirname, "..", "server", "authoritative_engine.js"));
const lootSlugs = new Set();
for (const slug of hunt.monsters)
  for (const drop of canary[slug].loot) lootSlugs.add(drop.item);
for (const slug of lootSlugs) {
  const client = catalog.GAMEDATA.items[slug], server = E.ITEMS[slug];
  // plasma rings têm variantes charged/base (23530/23532): cliente guarda
  // `id`, servidor `cid` — o que importa é haver um client id válido.
  must(client && server && Number.isFinite(client.cid ?? client.id) &&
    Number.isFinite(server.cid ?? server.id) &&
    Number.isFinite(client.npcSell ?? client.sell) &&
    (client.npcSell ?? client.sell) === (server.npcSell ?? server.sell),
    slug + ": loot sem registro/preço consistente");
  const icon = fs.readFileSync(path.join(game, "assets", "item", slug + ".png"));
  must(icon.readUInt32BE(16) <= 64 && icon.readUInt32BE(20) <= 64,
    slug + ": ícone inválido");
}
// Preços oficiais confirmados: Yasir/Rashid e sem comprador (0).
for (const [slug, price] of Object.entries({
  "bloated-maggot": 5200, "rotten-roots": 3800, "rotten-vermin-ichor": 4500,
  "terra-rod": 2000, "glacier-mask": 2500, "buckle": 7000,
  "organic-acid": 0, "crimson-sword": 0,
})) for (const items of [catalog.GAMEDATA.items, E.ITEMS])
  must(items[slug] && (items[slug].npcSell ?? items[slug].sell) === price,
    slug + ": preço oficial incorreto");

// Servidor autoritativo: definição da hunt e pack 8–12.
must(E.HUNTS["jade-roots"] && E.HUNTS["jade-roots"].packMin === 8 &&
  E.HUNTS["jade-roots"].packMax === 12 &&
  JSON.stringify(E.HUNTS["jade-roots"].monsters) ===
    JSON.stringify(["bloated-man-maggot", "mycobiontic-beetle", "sopping-corpus"]),
  "HUNTS do servidor sem jade-roots ou pack errado");
const desc = { kind: "hunt", huntId: "jade-roots", instanceMode: "non-pvp",
  activeCharacterId: "1", state: { hunt, mobs: [], pendingSpawns: [], players: [] },
  members: [{ id: "1", p: { id: "1", voc: "knight", level: 700, hp: 30000, mp: 3000,
    gold: 0, skills: { fist: 130, sword: 130, axe: 130, club: 130, dist: 130, shield: 130 },
    ml: 20, config: {}, equip: {}, supplies: {}, stamina: 54000 } }] };
const seen = new Set();
for (let i = 0; i < 40; i++) {
  const d = E.initializeAuthority(JSON.parse(JSON.stringify(desc)),
    "test-jade-" + i, Date.now());
  E.spawnHuntWave(d.authority, Date.now() + 1000, { force: true });
  const n = (d.authority.pendingSpawns || []).length;
  must(n >= 8 && n <= 12, "pack autoritativo fora de 8–12: " + n);
  must(d.authority.pendingSpawns.every((sp) => hunt.monsters.includes(sp.mob.slug)),
    "monstro fora da hunt no pack autoritativo");
  seen.add(n);
}
console.log("OK — Jade Roots: OTBM 33×23 z=7, " + available +
  " sqm de respawn conectado, pack " + Math.min(...seen) + "–" + Math.max(...seen) +
  ", " + lootSlugs.size + " itens de loot com sprite e preço.");
