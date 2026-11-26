/* Regressão: The Mega Magmaoid (BOSSES 250+) + remodel da sala do
 * The Brainstealer.
 *
 * Mega Magmaoid — boss oficial do update 12.70 ("Too Hot to Handle",
 * Dwelling of the Forgotten; Archfoe, cooldown 20h) ausente do dump
 * Canary: ficha oficial no patch mega-magmaoid-boss.js (hp 104.000,
 * exp 80.000, raceId 2060, looktype 1413 = MESMA sheet do Magma Bubble,
 * copiada para assets/mob/the-mega-magmaoid.png). Resist oficial: earth
 * imune, fire CURA (−600% → aproximado como imune fire:100 — o motor não
 * tem cura-por-elemento), energy 90% (→10), death 110% (→-10). Skills
 * no molde do kit do magma-bubble escalado p/ 250+; a explosão "DOOM"
 * oficial e a explosão de morte NÃO são implementadas (boss-room simples
 * igual ao Brainstealer). Loot = a tabela do The Brainstealer do dump
 * (35 entradas idênticas). Sala mega_magmaoid.otbm 31×29 z=7 (byte-igual
 * de beta-maps/bossesroom/, bounds 1012..1042 × 1017..1045):
 *   bossspawn {1025,1027,7} → local (13,10)
 *   playerspawn {1026,1032,7} → local (14,15)
 *
 * Brainstealer room remodel — sala nova publicada byte-igual de
 * beta-maps/bossesroom/the_brainstealer_room.otbm (30×27 z=7, bounds
 * 1011..1040 × 1017..1043, 810 cells / 64 ids; componente 173 sqm):
 *   bossspawn {1025,1026,7} → local (14,9)
 *   playerspawn {1025,1033,7} → local (14,16)
 *   centermap {1025,1030,7} → local (14,13) — caminhável mais próxima do
 *   centro geométrico (1025.5, 1030). otbmBounds removido da hunt def
 *   (o .otbm novo já é o recorte da sala).
 */
"use strict";
const fs = require("fs"), path = require("path"), vm = require("vm");
const game = path.join(__dirname, "..", "game");
const js = path.join(game, "js");
function must(v, m) { if (!v) throw Error(m); }

const engine = require("../server/authoritative_engine.js");
const OTBM = require(path.join(js, "otbm.js"));

const BOSS_ID = "the-mega-magmaoid", HUNT_ID = "mega-magmaoid-room";
const COOLDOWN_20H = 20 * 60 * 60 * 1000;

/* ---------------- dados do cliente (vm, ordem do index) ---------------- */
const ctx = { console, Math, Date, Map, Set, document: undefined };
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext("var BOSS_DEFS={};", ctx);
for (const f of ["gamedata.js", "monsterdata.js", "mobsheetdata.js", "monsters.js",
                 "weapondata.js", "weapons.js", "yasir-prices.js", "gnomprona.js",
                 "glooth-cave.js", "buster-darashia.js", "soulwar.js", "tileflags.js",
                 // brainstealer-boss.js antes do magmaoid: o loot compartilhado
                 // (itens eldritch) é registrado por ele — mesma ordem do index.
                 "brainstealer-boss.js", "mega-magmaoid-boss.js"])
  vm.runInContext(fs.readFileSync(path.join(js, f), "utf8"), ctx, { filename: f });
vm.runInContext("GAMEDATA=window.GAMEDATA;", ctx);

const M = ctx.GAMEDATA.monsters, items = ctx.GAMEDATA.items;

/* ---------------- BOSS_DEFS ---------------- */
const b = ctx.BOSS_DEFS[BOSS_ID];
must(b, "boss sem BOSS_DEFS");
must(b.name === "The Mega Magmaoid" && b.title, "nome/título divergentes");
must(b.hp === 104000 && b.exp === 80000, "hp/exp oficiais divergentes (104k/80k)");
must(b.damage === 800 && b.armor === 60 && b.defense === 60,
  "stats divergentes do def (dano 800 / armor 60 / def 60)");
must(b.baseMonster === BOSS_ID && b.sprite === BOSS_ID, "sem baseMonster/sprite");
must(b.cooldown === COOLDOWN_20H, "cooldown oficial é 20h (não 16h)");
must(b.requirement && b.requirement.level === 250,
  "requisito deve ser nível 250+");
must(b.hunt === HUNT_ID, "sem hunt da bossroom");
must(!b.loot || !b.loot.length, "loot deve vir do monstro base (sem tabela própria)");

/* monstro novo (ausente do Canary): looktype 1413 = sheet do Magma Bubble */
const base = M[BOSS_ID];
must(base && base.boss && base.looktype === 1413 && base.raceId === 2060,
  "monstro base sem looktype 1413 / raceId 2060");
must(base.hp === 104000 && base.exp === 80000, "hp/exp do monstro divergentes");
must(base.resist && base.resist.earth === 100 && base.resist.fire === 100 &&
     base.resist.energy === 10 && base.resist.death === -10,
  "resist divergente (earth 100 / fire 100 aprox. cura / energy 10 / death -10)");
must(Array.isArray(base.imune) && base.imune.includes("paralyze") &&
     base.imune.includes("invisible"), "sem imunidade paralyze/invisible");
must(base.grupo === "bosses", "grupo deve ser 'bosses'");
must(Array.isArray(base.loot) && base.loot.length === 35,
  "monstro base sem as 35 entradas de loot");
/* Loot = tabela do The Brainstealer do dump — comparação estrita. */
must(JSON.stringify(base.loot) ===
     JSON.stringify(M["the-brainstealer"].loot),
  "loot não é idêntico à tabela do The Brainstealer");
must(ctx.MOBSHEETS[BOSS_ID] && ctx.MOBSHEETS[BOSS_ID].cols === 9 &&
     ctx.MOBSHEETS[BOSS_ID].cw === 57 && ctx.MOBSHEETS[BOSS_ID].ch === 57 &&
     ctx.MOBSHEETS[BOSS_ID].rows === 4,
  "sheet do boss ausente/incompatível (57×57 9×4, mesma do magma-bubble)");
const sheetPath = path.join(game, "assets", "mob", BOSS_ID + ".png");
must(fs.existsSync(sheetPath), "sprite do boss ausente");
must(fs.readFileSync(sheetPath).equals(
     fs.readFileSync(path.join(game, "assets", "mob", "magma-bubble.png"))),
  "sheet do boss deve ser cópia byte-igual da do magma-bubble (looktype 1413)");
must(ctx.MONSTERDATA[BOSS_ID] === base,
  "monstro não registrado no MONSTERDATA do cliente");

/* ---------------- hunt técnica invisível ---------------- */
const hu = ctx.GAMEDATA.hunts[HUNT_ID];
must(hu && hu.hidden === true, "sem hunt técnica invisível");
must(hu.otbm === "mega_magmaoid" && hu.otbmFloor === 7, "otbm/floor errados");
must(!hu.otbmBounds, "otbmBounds presente — o .otbm já é o recorte da sala");
must(hu.otbmSpawn && hu.otbmSpawn.x === 1026 && hu.otbmSpawn.y === 1032 &&
     hu.otbmSpawn.z === 7, "playerspawn errado (esperado {1026,1032,7})");
must(hu.otbmMobBounds && hu.otbmMobBounds.x === 1025 && hu.otbmMobBounds.y === 1027 &&
     hu.otbmMobBounds.z === 7 && hu.otbmMobBounds.w === 1 && hu.otbmMobBounds.h === 1,
  "bossspawn errado (esperado {1025,1027,7})");
must(hu.minLevel === 250 && hu.level === 250 && hu.monsters[0] === BOSS_ID &&
     hu.pack === 1 && hu.cat === "boss-room",
  "hunt com nível/monstro/pack/cat errados");

/* ---------------- seção BOSSES 250+ no modal (game.js) ---------------- */
const gameSrc = fs.readFileSync(path.join(js, "game.js"), "utf8");
const start = gameSrc.indexOf("const BOSS_MODAL_SECTIONS");
const fnEnd = gameSrc.indexOf("function renderBosses", start);
must(start >= 0 && fnEnd > start, "BOSS_MODAL_SECTIONS não encontrado");
const decl = gameSrc.slice(start, fnEnd);
const end = decl.indexOf("\n];");
must(end > 0, "fim da declaração não encontrado");
const secCtx = {};
vm.createContext(secCtx);
vm.runInContext(decl.slice(0, end + 3), secCtx);
const sections = vm.runInContext("BOSS_MODAL_SECTIONS", secCtx);
const sec = sections.find((s) => (s.ids || []).includes(BOSS_ID));
must(sec && sec.minLevel === 250 && sec.title === "BOSSES 250+",
  "boss fora da seção BOSSES 250+");
must(sec.ids[sec.ids.length - 1] === BOSS_ID,
  "boss deve ser o ÚLTIMO id da seção BOSSES 250+");
must(gameSrc.includes('"' + BOSS_ID + '"') &&
     gameSrc.includes('id: "the-mega-magmaoid"'),
  "entrada de catálogo ausente no BOSS_DEFS do game.js");

/* ---------------- canarymonsters.json (filtro do DAILY_BOSS_POOL) ------- */
const canary = JSON.parse(fs.readFileSync(
  path.join(game, "data", "canarymonsters.json"), "utf8"));
must(canary[BOSS_ID] && canary[BOSS_ID].boss === 1,
  "entrada ausente em canarymonsters.json (o pool diário filtra MONSTERS[slug].boss)");
must(canary[BOSS_ID].looktype === 1413 && canary[BOSS_ID].raceId === 2060 &&
     canary[BOSS_ID].hp === 104000 && canary[BOSS_ID].exp === 80000,
  "ficha em canarymonsters.json diverge do patch");
must(JSON.stringify(canary[BOSS_ID].loot) === JSON.stringify(base.loot),
  "loot do canarymonsters.json diverge do patch");

/* ---------------- loot: todo item tem catálogo + sprite + preço --------- */
for (const drop of base.loot) {
  const slug = drop.item;
  const it = items[slug];
  must(it, "loot " + slug + " fora de GAMEDATA.items");
  must(Number.isFinite(Number(it.cid)) && Number(it.cid) > 0,
    "loot " + slug + " sem cid (cid=" + (it && it.cid) + ")");
  must(Number.isFinite(Number(it.sell)) && Number(it.sell) >= 0,
    "loot " + slug + " sem sell válido");
  must(fs.existsSync(path.join(game, "assets", "item", slug + ".png")),
    "loot " + slug + " sem PNG em assets/item");
}
/* Paridade client×engine nos preços dos itens compartilhados do loot —
 * brainstealer-boss.js registra os oficiais nos dois lados (o engine o
 * carrega no loop "Conteúdo novo"). */
const SHARED_PRICES = {
  "violet-gem": 10000, "white-gem": 12000, "moonstone": 13000,
  "brainstealer-s-tissue": 240000, "brainstealer-s-brain": 300000,
  "brainstealer-s-brainwave": 440000, "eldritch-crystal": 48000,
  "eldritch-claymore": 0, "gilded-eldritch-bow": 0,
  "gilded-eldritch-crescent-moon-spade": 0, "eldritch-shield": 0,
};
for (const slug of Object.keys(SHARED_PRICES)) {
  const ci = items[slug], ei = engine.ITEMS[slug];
  must(ci && Number(ci.sell) === SHARED_PRICES[slug],
    "cliente: " + slug + " com sell errado (" + (ci && ci.sell) +
    ", esperado " + SHARED_PRICES[slug] + ")");
  must(ei && Number(ei.sell) === SHARED_PRICES[slug],
    "engine: " + slug + " com sell errado (" + (ei && ei.sell) +
    ", esperado " + SHARED_PRICES[slug] + ")");
}

/* ---------------- engine: monstro + hunt da bossroom ---------------- */
const em = engine.MONSTERS[BOSS_ID];
must(em && em.boss && Array.isArray(em.loot) && em.loot.length === 35,
  "engine: monstro base sem loot (registerMonsters não rodou?)");
must(em.looktype === 1413 && em.raceId === 2060,
  "engine: looktype/raceId divergentes");
must(engine.HUNTS[HUNT_ID] && engine.HUNTS[HUNT_ID].monsters[0] === BOSS_ID &&
     engine.HUNTS[HUNT_ID].cat === "boss-room",
  "engine: hunt da bossroom ausente do literal HUNTS");
const engineSrc = fs.readFileSync(
  path.join(__dirname, "..", "server", "authoritative_engine.js"), "utf8");
must(engineSrc.includes('"mega-magmaoid-boss.js"'),
  "engine não carrega mega-magmaoid-boss.js no sandbox");
must(engineSrc.includes('require("../game/js/mega-magmaoid-boss.js").registerMonsters(MONSTERS)'),
  "engine não registra o monstro via registerMonsters");
const boost = require("../server/dailyboost.js");
must(boost.DAILY_BOSS_POOL.includes(BOSS_ID),
  "DAILY_BOSS_POOL sem o boss (filtro MONSTERS[slug].boss não passou)");
must(boost.DAILY_BOSS_POOL.includes("the-brainstealer"),
  "DAILY_BOSS_POOL perdeu o brainstealer");

/* ---------------- mapa publicado + caminhável (magmaoid) ---------------- */
const tfCtx = { console }; tfCtx.window = tfCtx; vm.createContext(tfCtx);
vm.runInContext(fs.readFileSync(path.join(js, "tileflags.js"), "utf8"), tfCtx);
function mapCheck(runtimeMap, betaMap, dims, bounds, cells, idsCount, zones) {
  must(fs.existsSync(runtimeMap), path.basename(runtimeMap) + " não publicado");
  must(fs.existsSync(betaMap), "OTBM beta ausente: " + betaMap);
  must(fs.readFileSync(runtimeMap).equals(fs.readFileSync(betaMap)),
    path.basename(runtimeMap) + " e beta divergentes");
  const map = OTBM.read(fs.readFileSync(runtimeMap), { z: 7 });
  must(map.z === 7 && map.w === dims[0] && map.h === dims[1],
    path.basename(runtimeMap) + ": dimensões/andar errados");
  must(map.sourceBounds &&
       map.sourceBounds.minX === bounds[0] && map.sourceBounds.minY === bounds[1] &&
       map.sourceBounds.maxX === bounds[2] && map.sourceBounds.maxY === bounds[3],
    path.basename(runtimeMap) + ": sourceBounds divergente");
  must(Object.keys(map.cells).length === cells,
    path.basename(runtimeMap) + ": contagem de cells divergente");
  const hm = OTBM.huntMapFromOtbm(map, tfCtx.TILEFLAGS || {});
  const walk = (ax, ay) => {
    const x = ax - map.sourceBounds.minX, y = ay - map.sourceBounds.minY;
    if (x < 0 || y < 0 || x >= map.w || y >= map.h) return false;
    const entry = hm.leg[hm.rows[y][x]];
    return !!(entry && !entry.bloc && !hm.footprintBlocked[x + ":" + y]);
  };
  const W = hm.rows[0].length, H = hm.rows.length;
  const startL = { x: zones.spawn[0] - map.sourceBounds.minX,
                   y: zones.spawn[1] - map.sourceBounds.minY };
  const seen = {};
  const q = [[startL.x, startL.y]]; seen[startL.x + "," + startL.y] = 1;
  while (q.length) {
    const [x, y] = q.pop();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy, k = nx + "," + ny;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H || seen[k]) continue;
      const e = hm.leg[hm.rows[ny][nx]];
      if ((e && e.bloc) || hm.footprintBlocked[nx + ":" + ny]) continue;
      seen[k] = 1; q.push([nx, ny]);
    }
  }
  for (const pt of [zones.spawn, zones.boss].concat(zones.extra || [])) {
    must(walk(pt[0], pt[1]),
      path.basename(runtimeMap) + ": ponto bloqueado " + JSON.stringify(pt));
    must(seen[(pt[0] - map.sourceBounds.minX) + "," + (pt[1] - map.sourceBounds.minY)],
      path.basename(runtimeMap) + ": ponto desconectado " + JSON.stringify(pt));
  }
  must(Object.keys(seen).length === zones.component,
    path.basename(runtimeMap) + ": componente divergente (" +
    Object.keys(seen).length + " != " + zones.component + ")");
  const used = new Set();
  Object.values(map.cells).forEach((c) => {
    if (c.g) used.add(c.g);
    (c.items || []).forEach((id) => used.add(id));
  });
  must(used.size === idsCount,
    path.basename(runtimeMap) + ": quantidade de tile ids mudou (" + used.size + ")");
  const missingPng = [];
  for (const id of used)
    if (!fs.existsSync(path.join(game, "assets", "tiles", id + ".png")))
      missingPng.push(id);
  must(missingPng.length === 0,
    path.basename(runtimeMap) + " sem PNG em assets/tiles: " + missingPng.join(", "));
  const rmeCtx = { window: {} }; rmeCtx.window = rmeCtx; vm.createContext(rmeCtx);
  vm.runInContext(fs.readFileSync(path.join(game, "rme", "data", "known_tiles.js"), "utf8"), rmeCtx);
  const unlisted = OTBM.missingTiles(map, rmeCtx.RME_KNOWN_TILES);
  must(unlisted.length === 0,
    path.basename(runtimeMap) + " fora do catálogo RME: " + unlisted.join(", "));
  return { map, hm, walk };
}

/* Mega Magmaoid room: 31×29 z=7 bounds 1012..1042 × 1017..1045, 842 cells,
 * 47 ids; spawn (14,15) / boss (13,10) no componente de 240. */
mapCheck(path.join(game, "maps", "mega_magmaoid.otbm"),
         path.join(game, "beta-maps", "bossesroom", "mega_magmaoid.otbm"),
         [31, 29], [1012, 1017, 1042, 1045], 842, 47,
         { spawn: [1026, 1032], boss: [1025, 1027],
           extra: [[1027, 1031]], component: 240 });

/* Brainstealer room remodel: 30×27 z=7 bounds 1011..1040 × 1017..1043,
 * 810 cells, 64 ids; spawn (14,16) / boss (14,9) / center (14,13) no
 * componente de 173. */
const bs = mapCheck(path.join(game, "maps", "brainstealer.otbm"),
         path.join(game, "beta-maps", "bossesroom", "the_brainstealer_room.otbm"),
         [30, 27], [1011, 1017, 1040, 1043], 810, 64,
         { spawn: [1025, 1033], boss: [1025, 1026],
           extra: [[1025, 1030]], component: 173 });
must(fs.existsSync(path.join(game, "assets", "tiles", "36589.png")),
  "sprite 36589 (único novo da sala) não importado");

/* hunt def da sala remodelada: sem otbmBounds, novos spawns. */
const bsHunt = ctx.GAMEDATA.hunts["brainstealer-room"];
must(bsHunt && bsHunt.otbm === "brainstealer" && bsHunt.otbmFloor === 7 &&
     bsHunt.hidden, "hunt brainstealer-room divergente");
must(!bsHunt.otbmBounds,
  "brainstealer-room com otbmBounds obsoleto (o .otbm novo já é o recorte)");
must(JSON.stringify(bsHunt.otbmSpawn) === JSON.stringify({ x: 1025, y: 1033, z: 7 }),
  "playerspawn do brainstealer-room divergente");
must(bsHunt.otbmMobBounds && bsHunt.otbmMobBounds.x === 1025 &&
     bsHunt.otbmMobBounds.y === 1026 && bsHunt.otbmMobBounds.z === 7 &&
     bsHunt.otbmMobBounds.w === 1 && bsHunt.otbmMobBounds.h === 1,
  "bossspawn do brainstealer-room divergente");
/* applyHuntOtbmZones: playerspawn/bossspawn locais (14,16)/(14,9). */
const zoneSrc = fs.readFileSync(path.join(js, "otbmhunt.js"), "utf8");
const zs = zoneSrc.indexOf("function applyHuntOtbmZones");
const ze = zoneSrc.indexOf("/* Garante", zs);
vm.runInContext(zoneSrc.slice(zs, ze), ctx);
ctx.applyHuntOtbmZones(bs.map, bsHunt);
const runtime = OTBM.huntMapFromOtbm(bs.map, tfCtx.TILEFLAGS || {});
must(JSON.stringify(runtime.spawn) === JSON.stringify({ x: 14, y: 16 }),
  "playerspawn local do brainstealer divergente (14,16)");
must(runtime.mob.length === 1 &&
     JSON.stringify(runtime.mob[0]) === JSON.stringify({ x: 14, y: 9 }),
  "bossspawn local do brainstealer divergente (14,9)");

/* ---------------- index.html ---------------- */
const html = fs.readFileSync(path.join(game, "index.html"), "utf8");
must(html.includes("js/mega-magmaoid-boss.js?v="),
  "mega-magmaoid-boss.js não carregado no index");
must(html.indexOf("js/mega-magmaoid-boss.js?v=") >
     html.indexOf("js/brainstealer-boss.js?v="),
  "mega-magmaoid-boss.js deve carregar DEPOIS do brainstealer-boss.js (loot compartilhado)");

console.log("ok: The Mega Magmaoid — boss 250+ (104k HP, cooldown 20h, looktype 1413), sala mega_magmaoid 31×29 publicada; sala do Brainstealer remodelada 30×27 com spawns novos conectados");
