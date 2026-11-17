/* Regressão: Mimar Haffar — boss simples de Moonstone Crater, 400+.
 *
 * Sem mecânica: apenas a forma final com 460.000 HP e 3.500.000 exp
 * (oficial, update 15.30 "Make Believe"; boss novo, ausente do dump
 * Canary e do crystalserver — ficha no patch mimar-haffar.js). Loot
 * oficial completo (32 drops, TibiaWiki) com Figurine of Mimar Haffar
 * (Yasir 2,8M), moonsilver visor/mask nível 800 e quest items sell 0.
 *
 * Sala: game/maps/minis_radiant.otbm publicada byte-igual a partir de
 * beta-maps/bossesroom/"minis radiant.otbm" — 29×26 em z=7, bounds
 * 1009..1037 × 1015..1040 (arena compartilhada com o Maior Domus).
 *   centermap  {1023,1030,7}  bossspawn {1023,1026,7}  playerspawn {1023,1034,7}
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
for (const f of ["gamedata.js", "monsterdata.js", "mobsheetdata.js", "monsters.js",
                 "weapondata.js", "weapons.js", "yasir-prices.js", "gnomprona.js",
                 "glooth-cave.js", "buster-darashia.js", "soulwar.js", "tileflags.js"])
  vm.runInContext(fs.readFileSync(path.join(js, f), "utf8"), ctx, { filename: f });
vm.runInContext("GAMEDATA=window.GAMEDATA;", ctx);
vm.runInContext("var BOSS_DEFS={};", ctx);
vm.runInContext(fs.readFileSync(path.join(js, "mimar-haffar.js"), "utf8"), ctx, { filename: "mimar-haffar.js" });

const M = ctx.GAMEDATA.monsters, items = ctx.GAMEDATA.items;
const BOSS_ID = "mimar-haffar", HUNT_ID = "mimar-haffar-room";
const COOLDOWN_20H = 20 * 60 * 60 * 1000;

/* ---------------- BOSS_DEFS ---------------- */
const b = ctx.BOSS_DEFS[BOSS_ID];
must(b, "boss sem BOSS_DEFS");
must(b.hp === 460000, "hp deve ser 460000 (forma final, oficial)");
must(b.exp === 3500000 && b.damage === 1600 && b.armor === 0 && b.defense === 80,
  "stats divergentes do def (exp 3.5M / dano 1600 / armor 0 / def 80)");
must(b.baseMonster === BOSS_ID && b.sprite === BOSS_ID, "sem baseMonster/sprite");
must(b.cooldown === COOLDOWN_20H, "cooldown oficial é 20h");
// Make Believe Quest: acesso via Missão 1 (2500 kills Moonstone Castle)
// + requisitos da quest (Doctor Marrow, nível 800+) — enforced.
must(b.requirement && b.requirement.level === 800 &&
     b.requirement.enforced === true &&
     b.requirement.mission === "moonstone-castle" &&
     JSON.stringify(b.requirement.killsRequired) === '["doctor-marrow"]',
  "sem gate Make Believe (800 + doctor-marrow + missão moonstone-castle)");
must(b.hunt === HUNT_ID, "sem hunt da bossroom");
must(!b.loot || !b.loot.length, "loot deve vir do monstro base (sem tabela própria)");

/* monstro novo (ausente do Canary): sheet 2x2 animado, 9 colunas + loot */
const base = M[BOSS_ID];
must(base && base.boss && base.looktype === 1953 && base.raceId === 2812,
  "monstro base sem looktype 1953 / raceId 2812");
must(Array.isArray(base.loot) && base.loot.length >= 30,
  "monstro base sem loot oficial completo");
must(ctx.MOBSHEETS[BOSS_ID] && ctx.MOBSHEETS[BOSS_ID].cols === 9 &&
     ctx.MOBSHEETS[BOSS_ID].cw === 64, "sheet do boss ausente/incompatível");
must(fs.existsSync(path.join(game, "assets", "mob", BOSS_ID + ".png")),
  "sprite do boss ausente");

/* ---------------- hunt técnica invisível ---------------- */
const hu = ctx.GAMEDATA.hunts[HUNT_ID];
must(hu && hu.hidden === true, "sem hunt técnica invisível");
must(hu.otbm === "minis_radiant" && hu.otbmFloor === 7, "otbm/floor errados");
must(hu.otbmSpawn && hu.otbmSpawn.x === 1023 && hu.otbmSpawn.y === 1034 && hu.otbmSpawn.z === 7,
  "playerspawn errado (esperado {1023,1034,7})");
must(hu.otbmMobBounds && hu.otbmMobBounds.x === 1023 && hu.otbmMobBounds.y === 1026 &&
     hu.otbmMobBounds.z === 7 && hu.otbmMobBounds.w === 1 && hu.otbmMobBounds.h === 1,
  "bossspawn errado (esperado {1023,1026,7})");
must(hu.minLevel === 800 && hu.monsters[0] === BOSS_ID, "hunt com nível/monstro errados");

/* ---------------- seção BOSSES 800+ no modal (game.js) ---------------- */
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
must(sec && sec.minLevel === 800 && sec.title === "BOSSES 800+",
  "boss fora da seção BOSSES 800+");

/* ---------------- loot: todo item tem catálogo + sprite + preço oficial --- */
/* Novos: figurine 2,8M Yasir; dragon figurine 45k e moonstone 13k
 * (joalheria). Sem comprador NPC → sell 0: moonsilver visor/mask,
 * scraps of a radiant attire, cloud in a bottle, wooden spellbook e as
 * poções (NPC só vende, não compra). Fixes: gold ring 8k (Rashid), wand
 * of defiance 6.5k, spellbook of mind control 13k (Alexander). */
const EXPECTED_PRICES = {
  "figurine-of-mimar-haffar": 2800000,
  "dragon-figurine": 45000,
  "moonstone": 13000,
  "moonsilver-battle-visor": 0,
  "moonsilver-spirit-mask": 0,
  "scraps-of-a-radiant-attire": 0,
  "cloud-in-a-bottle": 0,
  "supreme-health-potion": 0,
  "ultimate-spirit-potion": 0,
  /* wooden-spellbook é equipamento real (weapondata, npcSell 12000) —
   * coberto pelo loop de loot, fora do mapa de preços novos. */
  "strong-mana-potion": 0,
  "great-mana-potion": 0,
  "ultimate-mana-potion": 0,
  "gold-ring": 8000,
  "wand-of-defiance": 6500,
  "spellbook-of-mind-control": 13000,
};
for (const slug of Object.keys(EXPECTED_PRICES)) {
  const it = items[slug];
  must(it, slug + " fora do catálogo");
  must(Number(it.sell) === EXPECTED_PRICES[slug] &&
       Number(it.npcSell ?? it.sell) === EXPECTED_PRICES[slug],
    slug + " com preço errado (esperado " + EXPECTED_PRICES[slug] + ", achou " + it.sell + "/" + it.npcSell + ")");
  must(Number.isFinite(Number(it.cid)) && Number(it.cid) > 0, slug + " sem cid");
  must(fs.existsSync(path.join(game, "assets", "item", slug + ".png")),
    slug + " sem PNG em assets/item");
}
/* Toda entrada de loot do monstro resolve no catálogo + sprite. */
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
    "engine: " + slug + " fora do ITEMS ou com sell errado (" + (it && it.sell) + ")");
}

/* ---------------- engine: monstro + hunt da bossroom ---------------- */
const em = engine.MONSTERS[BOSS_ID];
must(em && em.boss && Array.isArray(em.loot) && em.loot.length >= 30,
  "engine: monstro base sem loot");
must(em.looktype === 1953, "engine: looktype divergente");
must(engine.HUNTS[HUNT_ID] && engine.HUNTS[HUNT_ID].monsters[0] === BOSS_ID,
  "engine: hunt da bossroom ausente");
const engineSrc = fs.readFileSync(path.join(__dirname, "..", "server", "authoritative_engine.js"), "utf8");
must(engineSrc.includes('"mimar-haffar.js"'), "engine não carrega mimar-haffar.js no sandbox");
const boostSrc = fs.readFileSync(path.join(__dirname, "..", "server", "dailyboost.js"), "utf8");
must(boostSrc.includes('"' + BOSS_ID + '"'), "daily boost pool sem o boss");

/* ---------------- mapa publicado + caminhável ---------------- */
const runtimeMap = path.join(game, "maps", "minis_radiant.otbm");
const betaMap = path.join(game, "beta-maps", "bossesroom", "minis radiant.otbm");
must(fs.existsSync(runtimeMap), "minis_radiant.otbm não publicado em game/maps/");
must(fs.existsSync(betaMap), "OTBM beta minis radiant ausente");
must(fs.readFileSync(runtimeMap).equals(fs.readFileSync(betaMap)),
  "runtime e beta divergentes");
const tfCtx = { console }; tfCtx.window = tfCtx; vm.createContext(tfCtx);
vm.runInContext(fs.readFileSync(path.join(js, "tileflags.js"), "utf8"), tfCtx);
const map = OTBM.read(fs.readFileSync(runtimeMap), { z: 7 });
must(map.z === 7 && map.w === 29 && map.h === 26 && map.sourceBounds,
  "OTBM z=7 29×26 incorreto");
must(map.sourceBounds.minX === 1009 && map.sourceBounds.minY === 1015 &&
     map.sourceBounds.maxX === 1037 && map.sourceBounds.maxY === 1040,
  "sourceBounds divergente do esperado (1009..1037 × 1015..1040)");
/* Zonas absolutas → locais (espelho do applyHuntOtbmZones do cliente). */
map.spawn = { x: hu.otbmSpawn.x - 1009, y: hu.otbmSpawn.y - 1015 };
map.mob = [{ x: hu.otbmMobBounds.x - 1009, y: hu.otbmMobBounds.y - 1015 }];
const hm = OTBM.huntMapFromOtbm(map, tfCtx.TILEFLAGS || {});
const walk = (ax, ay) => {
  const x = ax - map.sourceBounds.minX, y = ay - map.sourceBounds.minY;
  if (x < 0 || y < 0 || x >= map.w || y >= map.h) return false;
  const entry = hm.leg[hm.rows[y][x]];
  return !!(entry && !entry.bloc && !hm.footprintBlocked[x + ":" + y]);
};
must(walk(1023, 1034), "playerspawn {1023,1034} bloqueado");
must(walk(1023, 1026), "bossspawn {1023,1026} bloqueado");
must(walk(1023, 1030), "centermap {1023,1030} bloqueado");
must(hm.spawn.x === 14 && hm.spawn.y === 19, "playerspawn local divergente (14,19)");
must(hm.mob.length === 1 && hm.mob[0].x === 14 && hm.mob[0].y === 11,
  "bossspawn local divergente (14,11)");
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
  must(seen["14,11"] && seen["14,15"], "playerspawn não alcança bossspawn/centermap");
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
    "tiles da minis_radiant sem PNG em assets/tiles: " + missingPng.join(", "));
  const rmeCtx = { window: {} }; rmeCtx.window = rmeCtx; vm.createContext(rmeCtx);
  vm.runInContext(fs.readFileSync(path.join(game, "rme", "data", "known_tiles.js"), "utf8"), rmeCtx);
  const unlisted = OTBM.missingTiles(map, rmeCtx.RME_KNOWN_TILES);
  must(unlisted.length === 0,
    "tiles da minis_radiant fora do catálogo RME: " + unlisted.join(", "));
}

/* ---------------- index.html ---------------- */
const html = fs.readFileSync(path.join(game, "index.html"), "utf8");
must(html.includes("js/mimar-haffar.js?v="), "mimar-haffar.js não carregado no index");

console.log("ok: Mimar Haffar — boss 800+ (460k HP, cooldown 20h), sala minis_radiant 29×26, loot oficial completo (figurine Yasir 2,8M + moonsilver/quest items sell 0)");
