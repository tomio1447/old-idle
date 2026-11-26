/* Regressão: hunt DARK THAIS — Mirrored Nightmare (SOULWAR 400+).
 * Mapa novo game/maps/dark_thais.otbm publicado byte-igual de
 * beta-maps/dark_thais.otbm — 55×49 z=7, bounds 1007..1061 × 1015..1063.
 * O mirrored_nightmare_sw.otbm antigo continua publicado no disco, só não
 * é mais referenciado pela hunt.
 *   playerspawn   {1029,1041,7} → local (22,26) → runtime (24,29)
 *   mobbounds     {1018,1023,7} → {1049,1053,7} (32×31 — bbox do componente
 *                 caminhável; células bloqueadas do retângulo são puladas
 *                 pelo seletor de respawn)
 *   fovbounds     mesmo retângulo (câmera 20×12, padrão Soul War)
 *   fixos         11 pontos (otbmFixedSpawns) — cada célula mantém 1 monstro
 *                 extra com id "fixed-"+i → onda = pack 8–10 + 11 fixos
 *                 (até 21 mobs).
 * Componente caminhável conectado ao spawn: 418 sqm. */
"use strict";
const fs = require("fs"), path = require("path"), vm = require("vm");
const game = path.join(__dirname, "..", "game"), js = path.join(game, "js");
const OTBM = require(path.join(js, "otbm.js"));
function must(ok, msg) { if (!ok) throw Error(msg); }
const ctx = { window: {}, console, Math, Date, Map, Set };
ctx.window = ctx;
vm.createContext(ctx);
for (const file of ["gamedata.js", "monsterdata.js", "monsters.js",
  "mobsheetdata.js", "soulwar.js", "hunt-sections.js", "tileflags.js",
  "tilepatterndata.js"])
  vm.runInContext(fs.readFileSync(path.join(js, file), "utf8"), ctx, { filename: file });
ctx.addEventListener = () => {};
vm.runInContext(fs.readFileSync(path.join(js, "otbmhunt.js"), "utf8"), ctx);

// ---- Definição da hunt: só o mapa/zonas mudaram — o resto é intocado ----
const hunt = ctx.GAMEDATA.hunts["dark-thais"];
must(hunt && hunt.name === "Dark Thais — Mirrored Nightmare", "hunt dark-thais ausente/nome errado");
must(hunt.level === 550 && hunt.minLevel === 550 && hunt.cat === "hardcore",
  "nível/categoria divergentes");
must(hunt.scene === "dark-thais" && hunt.mapa === "dark-thais",
  "scene/mapa (fallback estático) divergentes");
const SPECIES = ["many-faces", "knight-s-apparition", "paladin-s-apparition",
  "sorcerer-s-apparition", "druid-s-apparition", "monk-s-apparition",
  "distorted-phantom"];
must(JSON.stringify(hunt.monsters) === JSON.stringify(SPECIES),
  "monstros divergentes");
must(hunt.otbm === "dark_thais" && hunt.otbmFloor === 7,
  "OTBM/piso errado: " + hunt.otbm);
must(JSON.stringify(hunt.otbmSpawn) === JSON.stringify({ x: 1029, y: 1041, z: 7 }),
  "otbmSpawn diverge do playerspawn informado");
must(JSON.stringify(hunt.otbmMobBounds) === JSON.stringify({ x: 1018, y: 1023, w: 32, h: 31, z: 7 }),
  "otbmMobBounds diverge do bbox caminhável");
must(JSON.stringify(hunt.otbmFovBounds) === JSON.stringify({ x: 1018, y: 1023, w: 32, h: 31, z: 7 }) &&
  hunt.otbmFovWidth === 20 && hunt.otbmFovHeight === 12,
  "FOV diverge do padrão Soul War");
must(hunt.otbmRuntimeWidth === 60 && hunt.otbmRuntimeHeight === 55,
  "runtime 60×55 divergente");
const FIXED_ABS = [
  { x: 1025, y: 1041, z: 7 }, { x: 1028, y: 1036, z: 7 }, { x: 1032, y: 1038, z: 7 },
  { x: 1035, y: 1036, z: 7 }, { x: 1035, y: 1041, z: 7 }, { x: 1034, y: 1044, z: 7 },
  { x: 1035, y: 1048, z: 7 }, { x: 1040, y: 1046, z: 7 }, { x: 1024, y: 1047, z: 7 },
  { x: 1026, y: 1051, z: 7 }, { x: 1019, y: 1037, z: 7 }];
must(JSON.stringify(hunt.otbmFixedSpawns) === JSON.stringify(FIXED_ABS),
  "otbmFixedSpawns diverge das 11 posições informadas");
must(hunt.respawn === .7 && hunt.pack === 10 && hunt.packMin === 8 && hunt.packMax === 10 &&
  hunt.influencedMul === 2 && hunt.fiendishMul === 2 && hunt.color === "#38274e" &&
  hunt.soulWarZone === true && hunt.soulWarZoneMonster === "many-faces",
  "campos Soul War/pack divergentes");
// Locais esperadas: abs − minX 1007 / minY 1015.
const FIXED_LOCAL = [{ x: 18, y: 26 }, { x: 21, y: 21 }, { x: 25, y: 23 },
  { x: 28, y: 21 }, { x: 28, y: 26 }, { x: 27, y: 29 }, { x: 28, y: 33 },
  { x: 33, y: 31 }, { x: 17, y: 32 }, { x: 19, y: 36 }, { x: 12, y: 22 }];
// Runtime 60×55: padX = 2, padY = 3 (padding central de huntMapFromOtbm).
const FIXED_RT = FIXED_LOCAL.map((c, i) => ({ x: c.x + 2, y: c.y + 3, i }));

// OTBM publicado: byte-idêntico à origem e só z=7.
const bytes = fs.readFileSync(path.join(game, "maps", "dark_thais.otbm"));
must(bytes.equals(fs.readFileSync(path.join(game, "beta-maps", "dark_thais.otbm"))),
  "OTBM publicado diverge de beta-maps");
const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
for (let z = 0; z < 16; z++) must(OTBM.read(ab, { z }).z === 7, "andar inesperado no OTBM");
const parsed = OTBM.read(ab, { z: 7 });
const b = parsed.sourceBounds;
must(parsed.w === 55 && parsed.h === 49 && Object.keys(parsed.cells).length === 2649 &&
  b.minX === 1007 && b.minY === 1015 && b.maxX === 1061 && b.maxY === 1063,
  "bounds reais do OTBM divergem");
for (const cell of Object.values(parsed.cells)) for (const id of [cell.g, ...cell.items])
  must(!id || fs.existsSync(path.join(game, "assets", "tiles", id + ".png")),
    "tile sem sprite: " + id);
// Todos os ids usados constam no catálogo do editor RME.
{
  const rmeCtx = { window: {} }; rmeCtx.window = rmeCtx; vm.createContext(rmeCtx);
  vm.runInContext(fs.readFileSync(path.join(game, "rme", "data", "known_tiles.js"), "utf8"), rmeCtx);
  const unlisted = OTBM.missingTiles(parsed, rmeCtx.RME_KNOWN_TILES);
  must(unlisted.length === 0,
    "tiles do dark_thais fora do catálogo RME: " + unlisted.join(", "));
}

// Zonas absolutas → locais; spawn, área de respawn e pontos fixos.
ctx.applyHuntOtbmZones(parsed, hunt);
must(parsed.spawn.x === 22 && parsed.spawn.y === 26, "spawn local errado (esperado 22,26)");
must(parsed.mob.length === 32 * 31, "zona de respawn deve cobrir 32×31 = 992 sqm");
must(Array.isArray(parsed.fixedMob) && parsed.fixedMob.length === 11,
  "fixedMob deve ter as 11 células");
for (let i = 0; i < 11; i++)
  must(parsed.fixedMob[i].x === FIXED_LOCAL[i].x && parsed.fixedMob[i].y === FIXED_LOCAL[i].y &&
    parsed.fixedMob[i].i === i, "fixedMob[" + i + "] local errada");

parsed.idleTargetWidth = hunt.otbmRuntimeWidth;
parsed.idleTargetHeight = hunt.otbmRuntimeHeight;
parsed.idleFovWidth = hunt.otbmFovWidth;
parsed.idleFovHeight = hunt.otbmFovHeight;
const runtime = OTBM.huntMapFromOtbm(parsed, ctx.TILEFLAGS);
must(runtime.rows.length === 55 && runtime.rows.every((r) => r.length === 60) &&
  runtime.fovWidth === 20 && runtime.fovHeight === 12,
  "runtime 60×55 / FOV 20×12 divergentes");
must(runtime.spawn.x === 24 && runtime.spawn.y === 29,
  "spawn runtime errado (esperado 24,29)");
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
must(reached.size === 418, "componente conectado ao spawn diverge: " + reached.size);
// O componente inteiro cabe dentro do retângulo mobbounds 32×31.
for (const key of reached) {
  const [x, y] = key.split(",").map(Number);
  must(runtime.mobSet && runtime.mobSet[x + ":" + y],
    "célula caminhável fora da zona de respawn: " + key);
}
must(Array.isArray(runtime.fixedMob) && runtime.fixedMob.length === 11,
  "runtime.fixedMob ausente");
for (let i = 0; i < 11; i++) {
  const c = runtime.fixedMob[i];
  must(c.x === FIXED_RT[i].x && c.y === FIXED_RT[i].y && c.i === i,
    "fixedMob runtime [" + i + "] errada: " + JSON.stringify(c));
  must(walkable(c.x, c.y), "ponto fixo bloqueado: " + c.x + "," + c.y);
  must(reached.has(c.x + "," + c.y), "ponto fixo desconectado: " + c.x + "," + c.y);
}

// Card no modal SOULWAR 400+ (primeiro da seção — inalterado).
const soul = ctx.HUNT_MODAL_SECTIONS.find((s) => s.title === "SOULWAR 400+");
must(soul && soul.ids[0] === "dark-thais", "dark-thais não abre a seção SOULWAR 400+");
const ui = fs.readFileSync(path.join(js, "ui.js"), "utf8"), huntList = {};
Object.assign(ctx, { $: () => huntList, $$: () => [], HUNT_UI: { busca: "" },
  huntRisk: () => ({ cls: "hardcore", txt: "550+" }), fmt: String,
  mobImg: (slug) => '<img src="assets/mob/' + slug + '.png">', G: { p: {} } });
vm.runInContext(ui.slice(ui.indexOf("function renderHunts(p)"),
  ui.indexOf("function openHuntsModal()")), ctx);
ctx.renderHunts(ctx.G.p);
must(huntList.innerHTML.includes('data-hunt="dark-thais"'), "card não renderiza no modal");

// ---- Autoridade: pack 8–10 regular + 11 fixos nas células certas ----
const E = require(path.join(__dirname, "..", "server", "authoritative_engine.js"));
must(E.HUNTS["dark-thais"] && E.HUNTS["dark-thais"].cat === "hardcore" &&
  E.HUNTS["dark-thais"].pack === 10 && E.HUNTS["dark-thais"].packMin === 8 &&
  E.HUNTS["dark-thais"].packMax === 10 && E.HUNTS["dark-thais"].soulWarZone === true &&
  E.HUNTS["dark-thais"].soulWarZoneMonster === "many-faces" &&
  JSON.stringify(E.HUNTS["dark-thais"].monsters) === JSON.stringify(SPECIES),
  "HUNTS['dark-thais'] da autoridade diverge");
must(!E.HUNTS["dark-thais"].otbmFixedSpawns && !E.HUNTS["dark-thais"].fixedSpawnCells,
  "fixos não devem ser declarados no literal do servidor (vem do snapshot)");
// sanitizeFixedSpawnCells: as 11 células locais cabem no grid 60×55.
const san = E.sanitizeFixedSpawnCells(FIXED_RT.map((c) => ({ x: c.x, y: c.y, i: c.i })), 60, 55);
must(Array.isArray(san) && san.length === 11 &&
  JSON.stringify(san) === JSON.stringify(FIXED_RT),
  "sanitizeFixedSpawnCells rejeitou célula válida do grid 60×55");
const desc = { kind: "hunt", huntId: "dark-thais", instanceMode: "non-pvp",
  activeCharacterId: "1",
  state: { hunt, mobs: [], pendingSpawns: [], players: [],
    gridW: 60, gridH: 55,
    fixedSpawnCells: runtime.fixedMob.map((c) => ({ x: c.x, y: c.y, i: c.i })) },
  members: [{ id: "1", p: { id: "1", voc: "knight", level: 600, hp: 30000, mp: 9000,
    gold: 0, skills: { fist: 100, sword: 100, axe: 100, club: 100, dist: 100, shield: 100 },
    ml: 10, config: {}, equip: {}, supplies: {}, stamina: 54000 } }] };
const d = E.initializeAuthority(JSON.parse(JSON.stringify(desc)),
  "test-dark-thais", Date.now());
const auth = d.authority;
must(JSON.stringify(auth.fixedSpawnCells.map((c) => ({ x: c.x, y: c.y, i: c.i }))) ===
  JSON.stringify(FIXED_RT),
  "fixedSpawnCells da autoridade diverge");
E.spawnHuntWave(auth, Date.now() + 1000, { force: true });
const pend = auth.pendingSpawns || [];
must(auth.pack >= 8 && auth.pack <= 10, "pack rolado fora de 8–10: " + auth.pack);
must(pend.length === auth.pack + 11,
  "onda autoritativa deve ter pack + 11 fixos: " + pend.length);
const fixedPend = pend.filter((sp) => /^fixed-\d+$/.test(String(sp.mob.id)));
must(fixedPend.length === 11, "faltam spawns fixos na onda autoritativa");
for (let i = 0; i < 11; i++) {
  const sp = fixedPend.find((s) => s.mob.id === "fixed-" + i);
  must(sp, "fixed-" + i + " ausente na onda");
  must(sp.cx === FIXED_RT[i].x && sp.cy === FIXED_RT[i].y,
    "fixed-" + i + " fora da célula designada: " + sp.cx + "," + sp.cy);
  must(SPECIES.includes(sp.mob.slug), "fixed-" + i + " com slug fora da hunt");
}
const regularPend = pend.filter((sp) => !/^fixed-\d+$/.test(String(sp.mob.id)));
must(regularPend.length === auth.pack &&
  regularPend.every((sp) => SPECIES.includes(sp.mob.slug)),
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
must(pend2[0].mob.id === "fixed-2" && pend2[0].cx === FIXED_RT[2].x &&
  pend2[0].cy === FIXED_RT[2].y, "fixed-2 respawnou fora da célula");
must(auth.mobs.filter((m) => /^fixed-\d+$/.test(String(m.id))).length === 10,
  "fixos vivos duplicados");

// ---- Hidratação da 1ª onda: mobs do cliente incluem fixed-0..10 ----
// auth.pack e spawnIds não podem contar os fixos — senão a onda nasce com
// menos regulares (ou pack+11 regulares no keepPack).
{
  const mkMob = (id, cx, cy) => ({ id, slug: "many-faces",
    cx, cy, x: (cx + .5) / 60, y: (cy + .5) / 55, sx: (cx + .5) / 60, sy: (cy + .5) / 55 });
  const clientMobs = FIXED_RT.map((c, i) => mkMob("fixed-" + i, c.x, c.y))
    .concat([0, 1, 2, 3, 4, 5, 6, 7].map((i) => mkMob("cli-" + i, 20 + i, 30)));
  const d2 = E.initializeAuthority(JSON.parse(JSON.stringify(
    Object.assign({}, desc, { state: Object.assign({}, desc.state,
      { mobs: clientMobs }) }))), "test-dark-thais-hyd", Date.now());
  const a2 = d2.authority;
  must(a2.pack === 8, "pack hidratado deve ser 8 (fixos são extras): " + a2.pack);
  E.spawnHuntWave(a2, Date.now() + 1000, { force: true, keepPack: true });
  must(!(a2.spawnIds || []).some((id) => String(id).startsWith("fixed-")),
    "spawnIds não pode conter ids fixed-");
  must((a2.pendingSpawns || []).length === 0,
    "todos vivos: nenhum spawn extra na onda");
  // Mata todos → onda nova (sem keepPack): pack recalculado, pack+11 pending.
  for (const m of a2.mobs) m.hp = 0;
  a2.pendingSpawns = [];
  E.spawnHuntWave(a2, Date.now() + 2000, { force: true });
  const pw = a2.pendingSpawns || [];
  must(pw.length === a2.pack + 11 &&
    pw.filter((s) => /^fixed-\d+$/.test(String(s.mob.id))).length === 11,
    "onda pós-wipe deve ser pack regular + 11 fixos: " + pw.length);
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
  must(aliveBefore + pw2.length === a2.pack + 11,
    "vivos+pending deve fechar em pack+11: " + (aliveBefore + pw2.length));
  console.log("  servidor: hidratação com fixed-0..10 mantém pack regular e respawn correto");
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
    monsters: Object.fromEntries(SPECIES.map((s) => [s, ctx.GAMEDATA.monsters[s]])) };
  w.MOBSHEETS = Object.fromEntries(SPECIES.map((s) => [s, ctx.MOBSHEETS[s]]));
  w.HUNTMAPS = { "otbm:dark_thais": runtime };
  const h2 = JSON.parse(JSON.stringify(hunt)); h2.mapa = "otbm:dark_thais";
  w.GAMEDATA.hunts["dark-thais"] = h2;
  for (const f of ["js/grid.js", "js/gridai.js", "js/combat.js"])
    vm.runInContext(fs.readFileSync(path.join(game, f), "utf8"), cctx, { filename: f });
  const p = { name: "T", voc: "knight", level: 600, hp: 30000, mp: 9000, stamina: 54000,
    skills: { fist: 100, sword: 100, axe: 100, club: 100, dist: 100, shield: 100 },
    ml: 10, bag: {}, equip: {}, config: {}, supplies: {} };
  const c = w.newCombat(p, "dark-thais", "non-pvp");
  must(c.gridW === 60 && c.gridH === 55, "grid do combate deve ser 60×55");
  must(JSON.stringify(c.fixedSpawnCells.map((x) => ({ x: x.x, y: x.y, i: x.i }))) ===
    JSON.stringify(FIXED_RT),
    "fixedSpawnCells do combate diverge");
  w.spawnWave(c, p);
  const cpend = c.pendingSpawns || [];
  must(cpend.length >= 19 && cpend.length <= 21,
    "onda do cliente deve ter pack 8–10 + 11 fixos: " + cpend.length);
  for (let i = 0; i < 11; i++) {
    const sp = cpend.find((s) => s.mob.id === "fixed-" + i);
    must(sp && sp.cx === FIXED_RT[i].x && sp.cy === FIXED_RT[i].y,
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
    cpend2[0].cx === FIXED_RT[2].x && cpend2[0].cy === FIXED_RT[2].y,
    "respawn do cliente deve repor só fixed-2 na célula: " +
    cpend2.map((s) => s.mob.id).join(","));
  console.log("  cliente: spawnWave com pack 8–10 + 11 fixos e respawn de fixed-2 OK");
}

console.log("OK — Dark Thais: OTBM 55×49 z=7, componente " + reached.size +
  " sqm conectado, pack 8–10 + 11 fixos (até 21 por onda), SOULWAR 400+.");
