/* Regressão: Urmahlullu the Weakened — boss simples de Kilmaresh, 150+.
 *
 * Sem transformações: o def usa o primeiro estágio com 150.000 HP (a
 * pedido do jogador; Canary/Wiki: 100–150k) e o loot completo do monstro
 * base (MONSTERDATA, tabela oficial do Canary).
 *
 * Sala: game/maps/urmahlullu_room.otbm publicada byte-igual a partir de
 * beta-maps/bossesroom/"Urmahlullu the Weakened.otbm" — 29×22 em z=7,
 * bounds 1010..1038 × 1016..1037.
 *   centerroom  {1024,1026,7}  bossspawn {1024,1022,7}  playerspawn {1024,1029,7}
 *
 * Itens de loot novos (import_urmahlullu_assets.py):
 *   urmahlullu-s-mane (490k Yasir) / -paw (245k) / -tail (210k) — sprites
 *   31622/31623/31624; sun-medal / sunray-emblem / golden-bijou — quest
 *   items da Regalia of Suon, nenhum NPC compra → sell 0.
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
vm.runInContext("var BOSS_DEFS={};", ctx);
vm.runInContext(fs.readFileSync(path.join(js, "urmahlullu.js"), "utf8"), ctx, { filename: "urmahlullu.js" });

const M = ctx.GAMEDATA.monsters, items = ctx.GAMEDATA.items;
const BOSS_ID = "urmahlullu-the-weakened", HUNT_ID = "urmahlullu-the-weakened-room";
const COOLDOWN_20H = 20 * 60 * 60 * 1000;

/* ---------------- BOSS_DEFS ---------------- */
const b = ctx.BOSS_DEFS[BOSS_ID];
must(b, "boss sem BOSS_DEFS");
must(b.hp === 150000, "hp deve ser 150000 (1º estágio, pedido do jogador)");
must(b.exp === 55000 && b.damage === 1100 && b.armor === 84 && b.defense === 84,
  "stats divergentes do Canary (exp 55000 / dano 1100 / armor 84 / def 84)");
must(b.baseMonster === BOSS_ID && b.sprite === BOSS_ID, "sem baseMonster/sprite");
must(b.cooldown === COOLDOWN_20H, "cooldown oficial é 20h");
must(b.requirement && b.requirement.level === 150, "sem requisito de nível 150");
must(b.hunt === HUNT_ID, "sem hunt da bossroom");
must(!b.loot || !b.loot.length, "loot deve vir do monstro base (sem tabela própria)");

/* monstro base: sheet Canary (2x2 animado, 9 colunas) + loot oficial */
const base = M[BOSS_ID];
must(base && base.boss && Array.isArray(base.loot) && base.loot.length >= 30,
  "monstro base sem loot oficial no monsterdata");
must(ctx.MOBSHEETS[BOSS_ID] && ctx.MOBSHEETS[BOSS_ID].cols === 9 &&
     ctx.MOBSHEETS[BOSS_ID].cw === 64, "sheet do boss ausente/incompatível");
must(fs.existsSync(path.join(game, "assets", "mob", BOSS_ID + ".png")),
  "sprite do boss ausente");

/* ---------------- hunt técnica invisível ---------------- */
const hu = ctx.GAMEDATA.hunts[HUNT_ID];
must(hu && hu.hidden === true, "sem hunt técnica invisível");
must(hu.otbm === "urmahlullu_room" && hu.otbmFloor === 7, "otbm/floor errados");
must(hu.otbmSpawn && hu.otbmSpawn.x === 1024 && hu.otbmSpawn.y === 1029 && hu.otbmSpawn.z === 7,
  "playerspawn errado (esperado {1024,1029,7})");
must(hu.otbmMobBounds && hu.otbmMobBounds.x === 1024 && hu.otbmMobBounds.y === 1022 &&
     hu.otbmMobBounds.z === 7 && hu.otbmMobBounds.w === 1 && hu.otbmMobBounds.h === 1,
  "bossspawn errado (esperado {1024,1022,7})");
must(hu.minLevel === 150 && hu.monsters[0] === BOSS_ID, "hunt com nível/monstro errados");

/* ---------------- seção BOSSES 1–250 no modal (game.js) ---------------- */
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
must(sec && sec.minLevel === 150, "boss fora da seção BOSSES 1–250 (150+)");

/* ---------------- loot: todo item tem catálogo + sprite + preço oficial --- */
/* Yasir (creature products): mane 490k, paw 245k, tail 210k. Regalia of
 * Suon (sun medal/emblem/golden bijou) e equipamentos/quest items sem
 * comprador NPC → sell 0. Corrigidos sell:1 placeholders → Rashid
 * (magma amulet 1500, magma monocle 2500, lightning pendant 1500),
 * Fiona (poções 500) e joalheria (gold ingot 5k, gems 50/70/90k). */
const EXPECTED_PRICES = {
  "urmahlullu-s-mane": 490000,
  "urmahlullu-s-paw": 245000,
  "urmahlullu-s-tail": 210000,
  "sun-medal": 0,
  "sunray-emblem": 0,
  "golden-bijou": 0,
  "energy-bar": 0,
  "flash-arrow": 0,
  "tagralt-blade": 0,
  "ring-of-secret-thoughts": 0,
  "winged-boots": 0,
  "enchanted-theurgic-amulet": 0,
  "rainbow-necklace": 0,
  "silver-token": 0,
  "royal-star": 0,
  "lightning-pendant": 1500,
  "magma-amulet": 1500,
  "magma-monocle": 2500,
  "berserk-potion": 500,
  "bullseye-potion": 500,
  "mastermind-potion": 500,
  "gold-ingot": 5000,
  "giant-sapphire": 50000,
  "giant-ruby": 70000,
  "giant-emerald": 90000,
};
for (const slug of Object.keys(EXPECTED_PRICES)) {
  const it = items[slug];
  must(it, slug + " fora do catálogo");
  must(Number(it.sell) === EXPECTED_PRICES[slug] && Number(it.npcSell) === EXPECTED_PRICES[slug],
    slug + " com preço errado (esperado " + EXPECTED_PRICES[slug] + ")");
  must(Number.isFinite(Number(it.cid)) && Number(it.cid) > 0, slug + " sem cid");
  must(fs.existsSync(path.join(game, "assets", "item", slug + ".png")),
    slug + " sem PNG em assets/item");
}
/* Toda entrada de loot do monstro base resolve no catálogo + sprite,
 * com preço definido (sell finito ≥ 0 — 0 = sem comprador, Sell All pula). */
for (const drop of base.loot) {
  const slug = drop.item;
  must(fs.existsSync(path.join(game, "assets", "item", slug + ".png")),
    "loot " + slug + " sem PNG em assets/item");
  const it = items[slug];
  must(it, "loot " + slug + " fora de GAMEDATA.items");
  must(Number.isFinite(Number(it.sell)) && Number(it.sell) >= 0,
    "loot " + slug + " sem sell válido");
}
/* itens novos: engine (Sell All online) também precisa precificar. */
for (const slug of Object.keys(EXPECTED_PRICES)) {
  const it = engine.ITEMS[slug];
  must(it && Number(it.sell) === EXPECTED_PRICES[slug],
    "engine: " + slug + " fora do ITEMS ou com sell errado");
}

/* ---------------- engine: monstro + hunt da bossroom ---------------- */
const em = engine.MONSTERS[BOSS_ID];
must(em && em.boss && Array.isArray(em.loot) && em.loot.length >= 30,
  "engine: monstro base sem loot");
must(engine.HUNTS[HUNT_ID] && engine.HUNTS[HUNT_ID].monsters[0] === BOSS_ID,
  "engine: hunt da bossroom ausente");
const engineSrc = fs.readFileSync(path.join(__dirname, "..", "server", "authoritative_engine.js"), "utf8");
must(engineSrc.includes('"urmahlullu.js"'), "engine não carrega urmahlullu.js no sandbox");
const boostSrc = fs.readFileSync(path.join(__dirname, "..", "server", "dailyboost.js"), "utf8");
must(boostSrc.includes('"' + BOSS_ID + '"'), "daily boost pool sem o boss");

/* ---------------- mapa publicado + caminhável ---------------- */
const runtimeMap = path.join(game, "maps", "urmahlullu_room.otbm");
const betaMap = path.join(game, "beta-maps", "bossesroom", "Urmahlullu the Weakened.otbm");
must(fs.existsSync(runtimeMap), "urmahlullu_room.otbm não publicado em game/maps/");
must(fs.existsSync(betaMap), "OTBM beta do Urmahlullu ausente");
must(fs.readFileSync(runtimeMap).equals(fs.readFileSync(betaMap)),
  "runtime e beta divergentes (rode import_urmahlullu_assets.py --publish-map)");
const tfCtx = { console }; tfCtx.window = tfCtx; vm.createContext(tfCtx);
vm.runInContext(fs.readFileSync(path.join(js, "tileflags.js"), "utf8"), tfCtx);
const map = OTBM.read(fs.readFileSync(runtimeMap), { z: 7 });
must(map.z === 7 && map.w === 29 && map.h === 22 && map.sourceBounds,
  "OTBM z=7 29×22 incorreto");
must(map.sourceBounds.minX === 1010 && map.sourceBounds.minY === 1016 &&
     map.sourceBounds.maxX === 1038 && map.sourceBounds.maxY === 1037,
  "sourceBounds divergente do esperado (1010..1038 × 1016..1037)");
/* Zonas absolutas → locais (espelho do applyHuntOtbmZones do cliente). */
map.spawn = { x: hu.otbmSpawn.x - 1010, y: hu.otbmSpawn.y - 1016 };
map.mob = [{ x: hu.otbmMobBounds.x - 1010, y: hu.otbmMobBounds.y - 1016 }];
const hm = OTBM.huntMapFromOtbm(map, tfCtx.TILEFLAGS || {});
const walk = (ax, ay) => {
  const x = ax - map.sourceBounds.minX, y = ay - map.sourceBounds.minY;
  if (x < 0 || y < 0 || x >= map.w || y >= map.h) return false;
  const entry = hm.leg[hm.rows[y][x]];
  return !!(entry && !entry.bloc && !hm.footprintBlocked[x + ":" + y]);
};
must(walk(1024, 1029), "playerspawn {1024,1029} bloqueado");
must(walk(1024, 1022), "bossspawn {1024,1022} bloqueado");
must(walk(1024, 1026), "centerroom {1024,1026} bloqueado");
must(hm.spawn.x === 14 && hm.spawn.y === 13, "playerspawn local divergente (14,13)");
must(hm.mob.length === 1 && hm.mob[0].x === 14 && hm.mob[0].y === 6,
  "bossspawn local divergente (14,6)");
/* Conectividade: playerspawn alcança bossspawn e centerroom. */
{
  const W = hm.rows[0].length, H = hm.rows.length, seen = {};
  const q = [[hm.spawn.x, hm.spawn.y]]; seen[hm.spawn.x + "," + hm.spawn.y] = 1;
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
  must(seen["14,6"] && seen["14,10"], "playerspawn não alcança bossspawn/centerroom");
}

/* TODOS os tiles usados pelo mapa têm sprite físico + catálogo do editor. */
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
    "tiles do urmahlullu_room sem PNG em assets/tiles: " + missingPng.join(", "));
  const rmeCtx = { window: {} }; rmeCtx.window = rmeCtx; vm.createContext(rmeCtx);
  vm.runInContext(fs.readFileSync(path.join(game, "rme", "data", "known_tiles.js"), "utf8"), rmeCtx);
  const unlisted = OTBM.missingTiles(map, rmeCtx.RME_KNOWN_TILES);
  must(unlisted.length === 0,
    "tiles do urmahlullu_room fora do catálogo RME: " + unlisted.join(", "));
}

/* ---------------- index.html ---------------- */
const html = fs.readFileSync(path.join(game, "index.html"), "utf8");
must(html.includes("js/urmahlullu.js?v="), "urmahlullu.js não carregado no index");

console.log("ok: Urmahlullu the Weakened — boss 150+ (150k HP, cooldown 20h), sala urmahlullu_room 29×22, loot oficial Canary completo (3 partes Yasir + 3 quest items sell 0)");
