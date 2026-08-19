/* Regressão: DEEPLING WORLD — 4 bosses do Deeplings World Change na mesma
 * sala (deeplinsroom.otbm), categoria 150+ no modal, cooldown 16h.
 *
 * Composições diretas do Canary (monsterdata.js / canarymonsters.json):
 *   Jaul   hp 90000 exp 30000 dano 2000 armor 40 def 40
 *   Obujos hp 35000 exp 20000 dano 1200 armor 40 def 40
 *   Tanjis hp 30000 exp 15000 dano 600  armor 40 def 40
 *   Brokul hp 50000 exp 23000 dano 500  armor 86 def 60
 * Loot oficial de cada chefe vem do monstro base; broccoli e true book of
 * death entram no catálogo (sell 0 — nenhum NPC compra).
 */
"use strict";
const fs = require("fs"), path = require("path"), vm = require("vm");
const game = path.join(__dirname, "..", "game");
const js = path.join(game, "js");
function must(v, m) { if (!v) throw Error(m); }

const engine = require("../server/authoritative_engine.js");
const OTBM = require(path.join(js, "otbm.js"));

/* ---------------- dados do cliente (vm, ordem do index) ---------------- */
const ctx = { window: {}, console, Math, Date, Map, Set, document: undefined };
ctx.window = ctx;
vm.createContext(ctx);
for (const f of ["gamedata.js", "monsterdata.js", "mobsheetdata.js", "monsters.js", "soulwar.js", "tileflags.js"])
  vm.runInContext(fs.readFileSync(path.join(js, f), "utf8"), ctx, { filename: f });
vm.runInContext("GAMEDATA=window.GAMEDATA;", ctx);
// patch dos deeplings registra itens + hunts + BOSS_DEFS
vm.runInContext("var BOSS_DEFS={};", ctx);
vm.runInContext(fs.readFileSync(path.join(js, "deepling-bosses.js"), "utf8"), ctx, { filename: "deepling-bosses.js" });

const M = ctx.GAMEDATA.monsters, items = ctx.GAMEDATA.items;
const EXPECTED = {
  jaul:   { hp: 90000, exp: 30000, damage: 2000, armor: 40, defense: 40 },
  obujos: { hp: 35000, exp: 20000, damage: 1200, armor: 40, defense: 40 },
  tanjis: { hp: 30000, exp: 15000, damage: 600,  armor: 40, defense: 40 },
  brokul: { hp: 50000, exp: 23000, damage: 500,  armor: 86, defense: 60 },
};
const COOLDOWN_16H = 16 * 60 * 60 * 1000;

for (const id of Object.keys(EXPECTED)) {
  const want = EXPECTED[id];
  const b = ctx.BOSS_DEFS[id];
  must(b, id + " sem BOSS_DEFS");
  must(b.hp === want.hp && b.exp === want.exp && b.damage === want.damage &&
       b.armor === want.armor && b.defense === want.defense,
    id + " com stats divergentes do Canary");
  must(b.baseMonster === id && b.sprite === id, id + " sem baseMonster/sprite");
  must(b.cooldown === COOLDOWN_16H, id + " sem cooldown de 16h");
  must(b.requirement && b.requirement.level === 150, id + " sem requisito de nível 150");
  must(b.hunt === id + "-room", id + " sem hunt da bossroom");
  // loot oficial do Canary vem do monstro base
  const base = M[id];
  must(base && Array.isArray(base.loot) && base.loot.length, id + " sem loot no monsterdata");
}

/* hunts técnicas invisíveis: sala compartilhada, coords absolutas RME */
for (const id of Object.keys(EXPECTED)) {
  const hu = ctx.GAMEDATA.hunts[id + "-room"];
  must(hu && hu.hidden === true, id + " sem hunt técnica invisível");
  must(hu.otbm === "deeplinsroom" && hu.otbmFloor === 7, id + " com otbm/floor errados");
  must(hu.otbmSpawn && hu.otbmSpawn.x === 1046 && hu.otbmSpawn.y === 1008 && hu.otbmSpawn.z === 7,
    id + " playerspawn errado (esperado {1046,1008,7})");
  must(hu.otbmMobBounds && hu.otbmMobBounds.x === 1047 && hu.otbmMobBounds.y === 998 &&
       hu.otbmMobBounds.z === 7 && hu.otbmMobBounds.w === 1 && hu.otbmMobBounds.h === 1,
    id + " bossspawn errado (esperado {1047,998,7})");
  must(hu.minLevel === 150 && hu.monsters[0] === id, id + " hunt com nível/monstro errados");
}

/* itens de loot que faltavam (nenhum NPC compra -> sell 0) */
must(items["broccoli"] && items["broccoli"].sell === 0 && items["broccoli"].w === 3,
  "broccoli fora do catálogo (sell 0, w 3)");
must(items["true-book-of-death"] && items["true-book-of-death"].sell === 0 &&
     items["true-book-of-death"].w === 13,
  "true book of death fora do catálogo (sell 0, w 13)");

/* ---------------- seção DEEPLING WORLD no modal (game.js) ---------------- */
const gameSrc = fs.readFileSync(path.join(js, "game.js"), "utf8");
const start = gameSrc.indexOf("const BOSS_MODAL_SECTIONS");
const fnEnd = gameSrc.indexOf("function renderBosses", start);
must(start >= 0 && fnEnd > start, "BOSS_MODAL_SECTIONS não encontrado");
const decl = gameSrc.slice(start, fnEnd);
const end = decl.lastIndexOf("];");
must(end > 0, "fim da declaração não encontrado");
const secCtx = {};
vm.createContext(secCtx);
vm.runInContext(decl.slice(0, end + 2), secCtx);
const sections = vm.runInContext("BOSS_MODAL_SECTIONS", secCtx);
must(sections && Array.isArray(sections), "BOSS_MODAL_SECTIONS inválido");
const dw = sections.find((s) => s.title === "DEEPLING WORLD");
must(dw && dw.minLevel === 150, "seção DEEPLING WORLD ausente ou sem nível 150");
must(JSON.stringify(dw.ids) === JSON.stringify(["jaul", "obujos", "tanjis", "brokul"]),
  "ids da seção DEEPLING WORLD divergentes");
must(sections[0] === dw, "DEEPLING WORLD deveria ser a primeira categoria (150+)");

/* ---------------- servidor (engine lê canarymonsters.json) ---------------- */
for (const id of Object.keys(EXPECTED)) {
  const em = engine.MONSTERS[id];
  must(em && Array.isArray(em.loot) && em.loot.length, "engine: " + id + " sem loot");
  must(em.hp === EXPECTED[id].hp, "engine: " + id + " hp divergente do Canary");
}
must(engine.ITEMS["broccoli"] && Number(engine.ITEMS["broccoli"].sell) === 0,
  "engine: broccoli fora do ITEMS (sell 0)");
must(engine.ITEMS["true-book-of-death"] && Number(engine.ITEMS["true-book-of-death"].sell) === 0,
  "engine: true book of death fora do ITEMS (sell 0)");

/* ---------------- mapa publicado + caminhável ---------------- */
const runtimeMap = path.join(game, "maps", "deeplinsroom.otbm");
const betaMap = path.join(game, "beta-maps", "bossesroom", "deeplinsroom.otbm");
must(fs.existsSync(runtimeMap), "deeplinsroom.otbm não publicado em game/maps/");
must(fs.existsSync(betaMap), "deeplinsroom.otbm beta ausente");
must(fs.readFileSync(runtimeMap).equals(fs.readFileSync(betaMap)),
  "runtime e beta divergentes (copiar o beta para maps/)");
const tfCtx = { console }; tfCtx.window = tfCtx; vm.createContext(tfCtx);
vm.runInContext(fs.readFileSync(path.join(js, "tileflags.js"), "utf8"), tfCtx);
const map = OTBM.read(fs.readFileSync(runtimeMap), { z: 7 });
must(map.z === 7 && map.sourceBounds, "deeplinsroom sem andar 7/bounds");
const hm = OTBM.huntMapFromOtbm(map, tfCtx.TILEFLAGS || {});
const walk = (ax, ay) => {
  const x = ax - map.sourceBounds.minX, y = ay - map.sourceBounds.minY;
  if (x < 0 || y < 0 || x >= map.w || y >= map.h) return false;
  const entry = hm.leg[hm.rows[y][x]];
  return !!(entry && !entry.bloc && !hm.footprintBlocked[x + ":" + y]);
};
must(walk(1046, 1008), "playerspawn {1046,1008} bloqueado");
must(walk(1047, 998), "bossspawn {1047,998} bloqueado");
must(walk(1047, 1003), "centro {1047,1003} bloqueado");

/* TODOS os tiles usados pelo mapa têm sprite físico (regressão dos 404s
 * de assets/tiles — o mapa Deepling usava 48 ids sem PNG no jogo). */
{
  const used = new Set();
  Object.values(map.cells).forEach((c) => {
    if (c.g) used.add(c.g);
    (c.items || []).forEach((id) => used.add(id));
  });
  const missingPng = [];
  for (const id of used)
    if (!fs.existsSync(path.join(game, "assets", "tiles", id + ".png")))
      missingPng.push(id);
  must(missingPng.length === 0,
    "tiles do deeplinsroom sem PNG em assets/tiles: " + missingPng.join(", "));
  // o catálogo do editor (known_tiles) também precisa listar os ids
  const rmeCtx = { window: {} }; rmeCtx.window = rmeCtx; vm.createContext(rmeCtx);
  vm.runInContext(fs.readFileSync(path.join(game, "rme", "data", "known_tiles.js"), "utf8"), rmeCtx);
  const unlisted = OTBM.missingTiles(map, rmeCtx.RME_KNOWN_TILES);
  must(unlisted.length === 0,
    "tiles do deeplinsroom fora do catálogo RME: " + unlisted.join(", "));
}

/* ---------------- sprites ---------------- */
for (const id of Object.keys(EXPECTED))
  must(fs.existsSync(path.join(game, "assets", "mob", id + ".png")), "sprite do boss " + id + " ausente");
for (const it of ["broccoli", "true-book-of-death"])
  must(fs.existsSync(path.join(game, "assets", "item", it + ".png")), "sprite do item " + it + " ausente");

/* ---------------- index.html ---------------- */
const html = fs.readFileSync(path.join(game, "index.html"), "utf8");
must(html.includes("js/deepling-bosses.js?v=deepling-v1"), "deepling-bosses.js não carregado no index");
must(html.includes("js/game.js?v="), "game.js sem cache-bust da categoria");
const engineSrc = fs.readFileSync(path.join(__dirname, "..", "server", "authoritative_engine.js"), "utf8");
must(engineSrc.includes('"deepling-bosses.js"'), "engine não carrega deepling-bosses.js no sandbox");

console.log("ok: DEEPLING WORLD — Jaul/Obujos/Tanjis/Brokul (Canary, 16h, 150+), sala deeplinsroom compartilhada, loot oficial e catálogo completo");
