/* Regressão: hunt ASURA PALACE (categoria HUNTS 250+).
 * Dawnfire/Midnight/Frost Flower Asura (40/40/20), pack 8 + 5 pontos fixos,
 * OTBM próprio z=7.
 * Mapa: game/maps/asura_palace.otbm publicado byte-igual a partir de
 * beta-maps/asura_palace.otbm — 63×41, bounds 1010..1072 × 1016..1056.
 *   centermap     {1044,1034,7}
 *   respawnradius {1040,1030,7} → {1049,1040,7} (10×11 = 110 sqm)
 *   fixos         {1030,1041} {1030,1034} {1030,1028} {1036,1041} {1054,1042}
 * Feature "fixed respawn points": cada ponto mantém 1 monstro extra (slug
 * via spawnWeights, id "fixed-"+i) que respawna na mesma célula na próxima
 * onda — cliente (combat.spawnWave) e autoridade (spawnHuntWave) em paridade. */
"use strict";
const fs = require("fs"), path = require("path"), vm = require("vm");
const game = path.join(__dirname, "..", "game"), js = path.join(game, "js");
const OTBM = require(path.join(js, "otbm.js"));
function must(ok, msg) { if (!ok) throw Error(msg); }
const ctx = { window: {}, console, Math, Date, Map, Set };
ctx.window = ctx;
vm.createContext(ctx);
for (const file of ["gamedata.js", "monsterdata.js", "mobsheetdata.js",
  "accessorydata.js", "asura-palace.js", "hunt-sections.js", "tileflags.js"])
  vm.runInContext(fs.readFileSync(path.join(js, file), "utf8"), ctx, { filename: file });
ctx.addEventListener = () => {};
vm.runInContext(fs.readFileSync(path.join(js, "otbmhunt.js"), "utf8"), ctx);

const hunt = ctx.GAMEDATA.hunts["asura-palace"];
must(hunt && hunt.name === "Asura Palace", "hunt asura-palace ausente/nome errado");
must(hunt.level === 250 && hunt.minLevel === 250, "nível deve ser 250");
const SPECIES = ["dawnfire-asura", "midnight-asura", "frost-flower-asura"];
must(JSON.stringify(hunt.monsters) === JSON.stringify(SPECIES), "monstros divergentes");
must(hunt.spawnWeights["dawnfire-asura"] === 40 &&
  hunt.spawnWeights["midnight-asura"] === 40 &&
  hunt.spawnWeights["frost-flower-asura"] === 20, "spawnWeights 40/40/20 ausente");
must(hunt.pack === 8 && hunt.packMin === 8 && hunt.packMax === 8, "pack deve ser 8");
must(hunt.otbm === "asura_palace" && hunt.otbmFloor === 7, "OTBM/piso errado");
must(JSON.stringify(hunt.otbmSpawn) === JSON.stringify({ x: 1044, y: 1034, z: 7 }),
  "otbmSpawn diverge do centermap informado");
must(JSON.stringify(hunt.otbmMobBounds) === JSON.stringify({ x: 1040, y: 1030, w: 10, h: 11, z: 7 }),
  "respawnradius diverge das coordenadas informadas");
must(!hunt.walkFloors, "walkFloors removido (piso antigo não existe no mapa novo)");
const FIXED_ABS = [
  { x: 1030, y: 1041, z: 7 }, { x: 1030, y: 1034, z: 7 }, { x: 1030, y: 1028, z: 7 },
  { x: 1036, y: 1041, z: 7 }, { x: 1054, y: 1042, z: 7 }];
must(JSON.stringify(hunt.otbmFixedSpawns) === JSON.stringify(FIXED_ABS),
  "otbmFixedSpawns diverge das 5 posições informadas");
// Locais esperadas (abs − minX 1010 / minY 1016).
const FIXED_LOCAL = [{ x: 20, y: 25 }, { x: 20, y: 18 }, { x: 20, y: 12 },
  { x: 26, y: 25 }, { x: 44, y: 26 }];

// OTBM publicado: byte-idêntico à origem e só z=7.
const bytes = fs.readFileSync(path.join(game, "maps", "asura_palace.otbm"));
must(bytes.equals(fs.readFileSync(path.join(game, "beta-maps", "asura_palace.otbm"))),
  "OTBM publicado diverge de beta-maps");
const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
for (let z = 0; z < 16; z++) must(OTBM.read(ab, { z }).z === 7, "andar inesperado no OTBM");
const parsed = OTBM.read(ab, { z: 7 });
const b = parsed.sourceBounds;
must(parsed.w === 63 && parsed.h === 41 && b.minX === 1010 && b.minY === 1016 &&
  b.maxX === 1072 && b.maxY === 1056, "bounds reais do OTBM divergem");
for (const cell of Object.values(parsed.cells)) for (const id of [cell.g, ...cell.items])
  must(!id || fs.existsSync(path.join(game, "assets", "tiles", id + ".png")),
    "tile sem sprite: " + id);
// Todos os ids usados constam no catálogo do editor RME.
{
  const rmeCtx = { window: {} }; rmeCtx.window = rmeCtx; vm.createContext(rmeCtx);
  vm.runInContext(fs.readFileSync(path.join(game, "rme", "data", "known_tiles.js"), "utf8"), rmeCtx);
  const unlisted = OTBM.missingTiles(parsed, rmeCtx.RME_KNOWN_TILES);
  must(unlisted.length === 0,
    "tiles do asura_palace fora do catálogo RME: " + unlisted.join(", "));
}

// Zonas absolutas → locais; spawn, área de respawn e pontos fixos.
ctx.applyHuntOtbmZones(parsed, hunt);
must(parsed.spawn.x === 34 && parsed.spawn.y === 18, "spawn local errado (esperado 34,18)");
must(parsed.mob.length === 110, "zona de respawn deve cobrir 10×11 = 110 sqm");
must(Array.isArray(parsed.fixedMob) && parsed.fixedMob.length === 5,
  "fixedMob deve ter as 5 células");
for (let i = 0; i < 5; i++)
  must(parsed.fixedMob[i].x === FIXED_LOCAL[i].x && parsed.fixedMob[i].y === FIXED_LOCAL[i].y &&
    parsed.fixedMob[i].i === i, "fixedMob[" + i + "] local errada");

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
for (const c of parsed.mob) {
  must(walkable(c.x, c.y), "célula da zona bloqueada: " + c.x + "," + c.y);
  if (reached.has(c.x + "," + c.y)) available++;
}
must(available === 110, "zona de respawn não é toda conectada: " + available + "/110");
must(Array.isArray(runtime.fixedMob) && runtime.fixedMob.length === 5,
  "runtime.fixedMob ausente");
for (let i = 0; i < 5; i++) {
  const c = runtime.fixedMob[i];
  must(walkable(c.x, c.y), "ponto fixo bloqueado: " + c.x + "," + c.y);
  must(reached.has(c.x + "," + c.y), "ponto fixo desconectado: " + c.x + "," + c.y);
}

// Card no modal HUNTS 250+.
const s250 = ctx.HUNT_MODAL_SECTIONS.find((s) => s.title === "HUNTS 250+");
must(s250 && s250.ids.includes("asura-palace"), "asura-palace ausente da categoria HUNTS 250+");
const ui = fs.readFileSync(path.join(js, "ui.js"), "utf8"), huntList = {};
Object.assign(ctx, { $: () => huntList, $$: () => [], HUNT_UI: { busca: "" },
  huntRisk: () => ({ cls: "hard", txt: "250+" }), fmt: String,
  mobImg: (slug) => '<img src="assets/mob/' + slug + '.png">', G: { p: {} } });
vm.runInContext(ui.slice(ui.indexOf("function renderHunts(p)"),
  ui.indexOf("function openHuntsModal()")), ctx);
ctx.renderHunts(ctx.G.p);
must(huntList.innerHTML.includes('data-hunt="asura-palace"'), "card não renderiza no modal");

// Monstros: dados Canary + sprite compatível com o sheet.
const canary = JSON.parse(fs.readFileSync(path.join(game, "data", "canarymonsters.json"), "utf8"));
for (const slug of hunt.monsters) {
  const md = ctx.MONSTERDATA[slug], sheet = ctx.MOBSHEETS[slug];
  must(md && canary[slug] && md.hp === canary[slug].hp && md.looktype === canary[slug].looktype,
    slug + ": dados divergentes do Canary");
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
// Preços oficiais já validados (Asura compartilha a tabela do Buried
// Cathedral): amostra representativa.
for (const [slug, price] of Object.entries({ "platinum-coin": 100 }))
  for (const items of [catalog.GAMEDATA.items, E.ITEMS])
    must(items[slug] && (items[slug].npcSell ?? items[slug].sell) === price,
      slug + ": preço oficial incorreto");

// ---- Autoridade: pack 8 regular + 5 fixos nas células certas ----
const desc = { kind: "hunt", huntId: "asura-palace", instanceMode: "non-pvp",
  activeCharacterId: "1",
  state: { hunt, mobs: [], pendingSpawns: [], players: [],
    gridW: runtime.w || 63, gridH: runtime.h || 41,
    fixedSpawnCells: runtime.fixedMob.map((c) => ({ x: c.x, y: c.y, i: c.i })) },
  members: [{ id: "1", p: { id: "1", voc: "knight", level: 250, hp: 9000, mp: 900,
    gold: 0, skills: { fist: 100, sword: 100, axe: 100, club: 100, dist: 100, shield: 100 },
    ml: 10, config: {}, equip: {}, supplies: {}, stamina: 54000 } }] };
const d = E.initializeAuthority(JSON.parse(JSON.stringify(desc)),
  "test-asura-palace", Date.now());
const auth = d.authority;
must(JSON.stringify(auth.fixedSpawnCells.map((c) => ({ x: c.x, y: c.y, i: c.i }))) ===
  JSON.stringify(FIXED_LOCAL.map((c, i) => ({ x: c.x, y: c.y, i }))),
  "fixedSpawnCells da autoridade diverge");
E.spawnHuntWave(auth, Date.now() + 1000, { force: true });
const pend = auth.pendingSpawns || [];
must(pend.length === 13, "onda autoritativa deve ter 8 regular + 5 fixos: " + pend.length);
const fixedPend = pend.filter((sp) => /^fixed-\d+$/.test(String(sp.mob.id)));
must(fixedPend.length === 5, "faltam spawns fixos na onda autoritativa");
for (let i = 0; i < 5; i++) {
  const sp = fixedPend.find((s) => s.mob.id === "fixed-" + i);
  must(sp, "fixed-" + i + " ausente na onda");
  must(sp.cx === FIXED_LOCAL[i].x && sp.cy === FIXED_LOCAL[i].y,
    "fixed-" + i + " fora da célula designada: " + sp.cx + "," + sp.cy);
  must(SPECIES.includes(sp.mob.slug), "fixed-" + i + " com slug fora da hunt");
}
const regularPend = pend.filter((sp) => !/^fixed-\d+$/.test(String(sp.mob.id)));
must(regularPend.length === 8 && regularPend.every((sp) => SPECIES.includes(sp.mob.slug)),
  "pack regular autoritativo errado");

// Respawn: todos vivos menos fixed-2 → só fixed-2 volta, na mesma célula.
for (const sp of pend) auth.mobs.push(sp.mob);
auth.pendingSpawns = [];
const dead = auth.mobs.find((m) => m.id === "fixed-2");
must(dead, "fixed-2 não virou mob vivo");
dead.hp = 0;
E.spawnHuntWave(auth, Date.now() + 2000, { force: true, keepPack: true }); // respawn()
const pend2 = auth.pendingSpawns || [];
must(pend2.length === 1, "respawn deve repor apenas fixed-2: " +
  pend2.map((s) => s.mob.id).join(","));
must(pend2[0].mob.id === "fixed-2" && pend2[0].cx === FIXED_LOCAL[2].x &&
  pend2[0].cy === FIXED_LOCAL[2].y, "fixed-2 respawnou fora da célula");
must(auth.mobs.filter((m) => /^fixed-\d+$/.test(String(m.id))).length === 4,
  "fixos vivos duplicados");

// ---- Hidratação da 1ª onda: mobs do cliente incluem fixed-0..4 ----
// auth.pack e spawnIds não podem contar os fixos — senão a onda nasce com
// menos regulares (ou 13 regulares no keepPack).
{
  const mkMob = (id, cx, cy) => ({ id, slug: "dawnfire-asura",
    cx, cy, x: (cx + .5) / 63, y: (cy + .5) / 41, sx: (cx + .5) / 63, sy: (cy + .5) / 41 });
  const clientMobs = FIXED_LOCAL.map((c, i) => mkMob("fixed-" + i, c.x, c.y))
    .concat([0, 1, 2, 3, 4, 5, 6, 7].map((i) => mkMob("cli-" + i, 40 + i, 30)));
  const d2 = E.initializeAuthority(JSON.parse(JSON.stringify(
    Object.assign({}, desc, { state: Object.assign({}, desc.state,
      { mobs: clientMobs }) }))), "test-asura-palace-hyd", Date.now());
  const a2 = d2.authority;
  must(a2.pack === 8, "pack hidratado deve ser 8 (fixos são extras): " + a2.pack);
  E.spawnHuntWave(a2, Date.now() + 1000, { force: true, keepPack: true });
  must(!(a2.spawnIds || []).some((id) => String(id).startsWith("fixed-")),
    "spawnIds não pode conter ids fixed-");
  must((a2.pendingSpawns || []).length === 0,
    "todos vivos: nenhum spawn extra na onda");
  // Mata os 13 → onda nova (sem keepPack): pack recalculado, 8+5 pending.
  for (const m of a2.mobs) m.hp = 0;
  a2.pendingSpawns = [];
  E.spawnHuntWave(a2, Date.now() + 2000, { force: true });
  const pw = a2.pendingSpawns || [];
  must(pw.length === 13 &&
    pw.filter((s) => /^fixed-\d+$/.test(String(s.mob.id))).length === 5,
    "onda pós-wipe deve ser 8 regular + 5 fixos: " + pw.length);
  // Mata fixed-1 e dois regulares → respawn repõe só os 3.
  for (const sp of pw) a2.mobs.push(sp.mob);
  a2.pendingSpawns = [];
  a2.mobs.find((m) => m.id === "fixed-1").hp = 0;
  let killed = 0;
  for (const m of a2.mobs) {
    if (killed >= 2 || /^fixed-\d+$/.test(String(m.id))) continue;
    m.hp = 0; killed++;
  }
  const aliveBefore = a2.mobs.filter((m) => m.hp > 0).length;
  E.spawnHuntWave(a2, Date.now() + 3000, { force: true, keepPack: true }); // respawn()
  const pw2 = a2.pendingSpawns || [];
  must(pw2.length === 3, "respawn deve repor 2 regular + fixed-1: " +
    pw2.map((s) => s.mob.id).join(","));
  must(pw2.filter((s) => /^fixed-\d+$/.test(String(s.mob.id))).length === 1 &&
    pw2.some((s) => s.mob.id === "fixed-1"), "fixed-1 ausente no respawn");
  must(aliveBefore + pw2.length === 13,
    "vivos+pending deve fechar em 13: " + (aliveBefore + pw2.length));
  console.log("  servidor: hidratação com fixed-0..4 mantém pack 8 e respawn correto");
}

// ---- Cliente: spawnWave com fixedSpawnCells em paridade ----
// combat.js carrega em vm com stubs mínimos (sem jsdom no ambiente).
{
  const w = { console, Math, Date, JSON, Object, Array, Number, String, Set, Map,
    Promise, setTimeout, clearTimeout, setInterval, clearInterval,
    requestAnimationFrame: (cb) => setTimeout(cb, 16),
    document: { getElementById: () => null, querySelector: () => null,
      querySelectorAll: () => [],
      createElement: () => ({ getContext: () => null, style: {} }),
      addEventListener: () => {}, body: { appendChild: () => {} } },
    addEventListener: () => {},
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    location: { href: "", reload: () => {} }, navigator: { userAgent: "" },
    Image: function () { return {}; },
    fetch: () => Promise.resolve({}), performance: { now: () => Date.now() } };
  w.window = w; w.globalThis = w;
  const cctx = vm.createContext(w);
  w.GAMEDATA = { hunts: {},
    monsters: Object.fromEntries(SPECIES.map((s) => [s, ctx.MONSTERDATA[s]])) };
  w.MOBSHEETS = Object.fromEntries(SPECIES.map((s) => [s, ctx.MOBSHEETS[s]]));
  w.HUNTMAPS = { "otbm:asura_palace": runtime };
  const h2 = JSON.parse(JSON.stringify(hunt)); h2.mapa = "otbm:asura_palace";
  w.GAMEDATA.hunts["asura-palace"] = h2;
  for (const f of ["js/grid.js", "js/gridai.js", "js/combat.js"])
    vm.runInContext(fs.readFileSync(path.join(game, f), "utf8"), cctx, { filename: f });
  const p = { name: "T", voc: "knight", level: 250, hp: 9000, mp: 900, stamina: 54000,
    skills: { fist: 100, sword: 100, axe: 100, club: 100, dist: 100, shield: 100 },
    ml: 10, bag: {}, equip: {}, config: {}, supplies: {} };
  const c = w.newCombat(p, "asura-palace", "non-pvp");
  must(JSON.stringify(c.fixedSpawnCells.map((x) => ({ x: x.x, y: x.y, i: x.i }))) ===
    JSON.stringify(FIXED_LOCAL.map((x, i) => ({ x: x.x, y: x.y, i }))),
    "fixedSpawnCells do combate diverge");
  w.spawnWave(c, p);
  const cpend = c.pendingSpawns || [];
  must(cpend.length === 13, "onda do cliente deve ter 8 regular + 5 fixos: " + cpend.length);
  for (let i = 0; i < 5; i++) {
    const sp = cpend.find((s) => s.mob.id === "fixed-" + i);
    must(sp && sp.cx === FIXED_LOCAL[i].x && sp.cy === FIXED_LOCAL[i].y,
      "fixed-" + i + " do cliente ausente/fora da célula");
    must(SPECIES.includes(sp.mob.slug), "fixed-" + i + " com slug fora da hunt");
  }
  // Mata fixed-2 → próxima onda repõe só ele, na mesma célula.
  for (const sp of cpend) c.mobs.push(sp.mob);
  c.pendingSpawns = [];
  c.mobs = c.mobs.filter((m) => m.id !== "fixed-2");
  w.spawnWave(c, p);
  const cpend2 = c.pendingSpawns || [];
  must(cpend2.length === 1 && cpend2[0].mob.id === "fixed-2" &&
    cpend2[0].cx === FIXED_LOCAL[2].x && cpend2[0].cy === FIXED_LOCAL[2].y,
    "respawn do cliente deve repor só fixed-2 na célula: " +
    cpend2.map((s) => s.mob.id).join(","));
  console.log("  cliente: spawnWave com 8 regular + 5 fixos e respawn de fixed-2 OK");
}

// index.html carrega o patch.
const html = fs.readFileSync(path.join(game, "index.html"), "utf8");
must(html.includes("js/asura-palace.js?v="), "asura-palace.js não carregado no index");

console.log("OK — Asura Palace: OTBM 63×41 z=7, " + available +
  " sqm de respawn conectado, 8 regular + 5 fixos (" +
  lootSlugs.size + " itens de loot com sprite e preço), HUNTS 250+.");
