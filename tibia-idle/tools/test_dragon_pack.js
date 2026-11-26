/* Regressão: Dragon Pack (BOSSES 400+).
 *
 * Dragon Pack — boss oficial do update 13.30 ("20 Years a Cook Quest",
 * Nimmersatt's Breeding Ground; Archfoe, nome registrado no Bosstiary)
 * ausente do dump Canary: ficha oficial no patch dragon-pack-boss.js
 * (hp 50.000, exp 600.000 [tibiadb — a wiki.br diz 0 com disclaimer de
 * dados imprecisos], raceId 2466, looktype 1712 = MESMA sheet do Mega
 * Dragon, copiada para assets/mob/dragon-pack.png). Resist oficial:
 * fire 0% de dano recebido → imune (fire:100), earth 75% → earth:25;
 * demais neutros. Sente invisível, imune a paralisia. Skills no molde
 * do kit do mega-dragon escalado p/ 400+ (physical alvo ~450-700, fire
 * wave ~700-1100, fire UE ~600-900, death chain ~400-600). A mecânica
 * oficial — 7 dragons de levers que herdam habilidades — NÃO é
 * implementada: boss-room simples como o Brainstealer/Magmaoid.
 * Loot = tabela oficial do Dragon Pack/Dragon Hoard (40 entradas).
 * Sala dragon_pack_room.otbm 49×38 z=7 (byte-igual de
 * beta-maps/bossesroom/, bounds 1009..1057 × 1015..1052):
 *   bossspawn   {1032,1029,7} → local (23,14)
 *   playerspawn {1034,1037,7} → local (25,22)
 *   centermap   {1033,1034,7} → local (24,19)
 */
"use strict";
const fs = require("fs"), path = require("path"), vm = require("vm");
const game = path.join(__dirname, "..", "game");
const js = path.join(game, "js");
function must(v, m) { if (!v) throw Error(m); }

const engine = require("../server/authoritative_engine.js");
const OTBM = require(path.join(js, "otbm.js"));

const BOSS_ID = "dragon-pack", HUNT_ID = "dragon-pack-room";
const COOLDOWN_20H = 20 * 60 * 60 * 1000;

/* ---------------- dados do cliente (vm, ordem do index/engine) ------- */
const ctx = { console, Math, Date, Map, Set, document: undefined };
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext("var BOSS_DEFS={};", ctx);
// Mesma base do sandbox da engine + merges de equipamento antes dos
// patches de conteúdo novo (dragon-pack-boss.js fica por último, como no
// loop "Conteúdo novo" da authoritative_engine.js).
for (const f of ["gamedata.js", "monsterdata.js", "mobsheetdata.js", "monsters.js",
                 "hard-hunts.js", "soulwar.js", "yasir-prices.js",
                 "feast-of-souls.js", "buried-cathedral.js", "ingol-terrain.js",
                 "roshamuul.js", "prison.js", "salamander-cave.js",
                 "stonerefiner.js", "faceless-bane.js", "leiden.js",
                 "deathlings-sunken-temple.js", "deeplings-deeper.js",
                 "falcon-bastion.js", "grandmaster-oberon.js", "doctor-marrow.js",
                 "weapondata.js", "weapons.js", "accessorydata.js",
                 "tileflags.js",
                 "lion-sanctum.js", "rotworm-darashia.js", "elder-wyrm-darashia.js",
                 "lions-rock-darashia.js", "dl-darashia.js", "scarlett-boss.js",
                 "hyaena-lairs.js", "wyrm-lb.js", "medusa-tower-ph.js",
                 "carniphilas-ph.js", "glooth-cave.js", "buster-darashia.js",
                 "jade-roots.js", "putrefactory.js", "darklight-core.js",
                 "gloom-pillars.js", "asura-palace.js", "azzilon-castle.js",
                 "arbaziloth.js", "magma-bubble.js", "sugar-daddy.js",
                 "sugar-mommy.js", "gnomprona.js", "bloodrotten.js",
                 "urmahlullu.js", "bashmuul-issavi.js", "true-asuras.js",
                 "mimar-haffar.js", "moonstone-castle.js", "radiant-skyhold.js",
                 "final-radiant.js", "book-world.js", "sir-leonard.js",
                 "norcferatus-fortress.js", "unhallowed-crypt.js",
                 "roost-graveborn.js", "court-warlock.js", "warzone9.js",
                 "nimmersatt.js",
                 "brainstealer-boss.js", "mega-magmaoid-boss.js",
                 "dragon-pack-boss.js"])
  // Como no sandbox da engine: arquivos com DOM de verdade (listeners,
  // canvas) são tolerados — o que já registrou em GAMEDATA permanece.
  try { vm.runInContext(fs.readFileSync(path.join(js, f), "utf8"), ctx, { filename: f }); }
  catch (e) { /* opcional, mesmo padrão do loader do servidor */ }
vm.runInContext("GAMEDATA=window.GAMEDATA;", ctx);

const M = ctx.GAMEDATA.monsters, items = ctx.GAMEDATA.items;

/* ---------------- BOSS_DEFS ---------------- */
const b = ctx.BOSS_DEFS[BOSS_ID];
must(b, "boss sem BOSS_DEFS");
must(b.name === "Dragon Pack" && b.title, "nome/título divergentes");
must(b.hp === 50000 && b.exp === 600000,
  "hp/exp oficiais divergentes (50k hp / 600k exp)");
must(b.damage === 800 && b.armor === 80 && b.defense === 80,
  "stats divergentes do def (dano 800 / armor 80 / def 80)");
must(b.baseMonster === BOSS_ID && b.sprite === BOSS_ID, "sem baseMonster/sprite");
must(b.cooldown === COOLDOWN_20H, "cooldown deve ser 20h (padrão Archfoe)");
must(b.requirement && b.requirement.level === 400,
  "requisito deve ser nível 400+");
must(b.hunt === HUNT_ID, "sem hunt da bossroom");
must(!b.loot || !b.loot.length, "loot deve vir do monstro base (sem tabela própria)");

/* monstro novo (ausente do Canary): looktype 1712 = sheet do Mega Dragon */
const base = M[BOSS_ID];
must(base && base.boss && base.looktype === 1712 && base.raceId === 2466,
  "monstro base sem looktype 1712 / raceId 2466");
must(base.hp === 50000 && base.exp === 600000, "hp/exp do monstro divergentes");
must(base.resist && base.resist.fire === 100 && base.resist.earth === 25,
  "resist divergente (fire 100 imune / earth 25 = 75% dmg taken)");
must(Array.isArray(base.imune) && base.imune.includes("paralyze") &&
     base.imune.includes("invisible"), "sem imunidade paralyze/invisible");
must(base.grupo === "bosses", "grupo deve ser 'bosses'");
must(base.targetDistance === 1 && base.staticAttack === 90 && base.speed === 170,
  "melee td1 / staticAttack 90 / speed 170 (molde mega-dragon)");

/* Loot = tabela oficial do Dragon Pack — conjunto estrito de 40 slugs. */
const OFFICIAL_LOOT = [
  "gold-coin", "platinum-coin", "crystal-coin", "blue-gem", "ice-cube",
  "life-crystal", "yellow-gem", "broadsword", "demonic-essence", "white-gem",
  "divine-plate", "dragonbone-staff", "dragon-scale-mail", "dragon-shield",
  "dragon-slayer", "drakinata", "fire-sword", "giant-amethyst",
  "giant-emerald", "giant-topaz", "guardian-boots", "jade-hat",
  "royal-helmet", "serpent-sword", "shard", "spellweaver-s-robe",
  "strange-helmet", "tower-shield", "wand-of-inferno", "zaoan-helmet",
  "crystallized-blood", "exalted-seal", "gold-scaled-sentinel",
  "arcane-dragon-robe", "dauntless-dragon-scale-armor", "herald-s-insignia",
  "herald-s-wings", "merudri-battle-mail", "mystical-dragon-robe",
  "unerring-dragon-scale-armor",
];
must(Array.isArray(base.loot) && base.loot.length === OFFICIAL_LOOT.length,
  "monstro base sem as " + OFFICIAL_LOOT.length + " entradas de loot");
must(JSON.stringify(base.loot.map((d) => d.item).sort()) ===
     JSON.stringify(OFFICIAL_LOOT.slice().sort()),
  "conjunto de slugs do loot diverge da tabela oficial");
must(base.loot[0].chance === 100 && base.loot[0].max === 391 &&
     base.loot[0].item === "gold-coin" &&
     base.loot[1].chance === 100 && base.loot[1].max === 200 &&
     base.loot[1].item === "platinum-coin",
  "faixas comuns divergentes (0-391 gold / 0-200 platinum)");

must(ctx.MOBSHEETS[BOSS_ID] && ctx.MOBSHEETS[BOSS_ID].cols === 9 &&
     ctx.MOBSHEETS[BOSS_ID].cw === 63 && ctx.MOBSHEETS[BOSS_ID].ch === 60 &&
     ctx.MOBSHEETS[BOSS_ID].rows === 4,
  "sheet do boss ausente/incompatível (63×60 9×4, mesma do mega-dragon)");
const sheetPath = path.join(game, "assets", "mob", BOSS_ID + ".png");
must(fs.existsSync(sheetPath), "sprite do boss ausente");
must(fs.readFileSync(sheetPath).equals(
     fs.readFileSync(path.join(game, "assets", "mob", "mega-dragon.png"))),
  "sheet do boss deve ser cópia byte-igual da do mega-dragon (looktype 1712)");
must(ctx.MONSTERDATA[BOSS_ID] === base,
  "monstro não registrado no MONSTERDATA do cliente");
/* anchors/moves herdados do mega-dragon (mesmo looktype). */
const ancCtx = { window: {} }; ancCtx.window = ancCtx; vm.createContext(ancCtx);
for (const f of ["creatureanchordata.js", "monstermovedata.js"])
  vm.runInContext(fs.readFileSync(path.join(js, f), "utf8"), ancCtx);
must(ancCtx.CREATURE_ANCHORS[BOSS_ID] &&
     ancCtx.CREATURE_ANCHORS[BOSS_ID].sw === 64 &&
     ancCtx.CREATURE_ANCHORS[BOSS_ID].ox === 1 &&
     ancCtx.CREATURE_ANCHORS[BOSS_ID].oy === 4,
  "CREATURE_ANCHORS sem entrada do dragon-pack (molde mega-dragon)");
must(ancCtx.MONSTERMOVES[BOSS_ID] &&
     ancCtx.MONSTERMOVES[BOSS_ID].speed === 170 &&
     ancCtx.MONSTERMOVES[BOSS_ID].staticAttack === 90 &&
     ancCtx.MONSTERMOVES[BOSS_ID].targetDistance === 1,
  "MONSTERMOVES sem entrada do dragon-pack (molde mega-dragon)");

/* ---------------- hunt técnica invisível ---------------- */
const hu = ctx.GAMEDATA.hunts[HUNT_ID];
must(hu && hu.hidden === true, "sem hunt técnica invisível");
must(hu.otbm === "dragon_pack_room" && hu.otbmFloor === 7, "otbm/floor errados");
must(!hu.otbmBounds, "otbmBounds presente — o .otbm já é o recorte da sala");
must(hu.otbmSpawn && hu.otbmSpawn.x === 1034 && hu.otbmSpawn.y === 1037 &&
     hu.otbmSpawn.z === 7, "playerspawn errado (esperado {1034,1037,7})");
must(hu.otbmMobBounds && hu.otbmMobBounds.x === 1032 && hu.otbmMobBounds.y === 1029 &&
     hu.otbmMobBounds.z === 7 && hu.otbmMobBounds.w === 1 && hu.otbmMobBounds.h === 1,
  "bossspawn errado (esperado {1032,1029,7})");
must(hu.minLevel === 400 && hu.level === 400 && hu.monsters[0] === BOSS_ID &&
     hu.pack === 1 && hu.cat === "boss-room",
  "hunt com nível/monstro/pack/cat errados");
must(hu.scene === "lair", "scene deve ser 'lair' (mesma das hunts de dragão)");

/* ---------------- seção BOSSES 400+ no modal (game.js) ---------------- */
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
must(sec && sec.minLevel === 400 && sec.title === "BOSSES 400+",
  "boss fora da seção BOSSES 400+");
must(sec.ids[sec.ids.length - 1] === BOSS_ID,
  "boss deve ser o ÚLTIMO id da seção BOSSES 400+");
must(gameSrc.includes('"' + BOSS_ID + '"') &&
     gameSrc.includes('id: "dragon-pack"'),
  "entrada de catálogo ausente no BOSS_DEFS do game.js");

/* ---------------- canarymonsters.json (filtro do DAILY_BOSS_POOL) ------ */
const canary = JSON.parse(fs.readFileSync(
  path.join(game, "data", "canarymonsters.json"), "utf8"));
must(canary[BOSS_ID] && canary[BOSS_ID].boss === 1,
  "entrada ausente em canarymonsters.json (o pool diário filtra MONSTERS[slug].boss)");
must(canary[BOSS_ID].looktype === 1712 && canary[BOSS_ID].raceId === 2466 &&
     canary[BOSS_ID].hp === 50000 && canary[BOSS_ID].exp === 600000,
  "ficha em canarymonsters.json diverge do patch");
must(JSON.stringify(canary[BOSS_ID].loot) === JSON.stringify(base.loot),
  "loot do canarymonsters.json diverge do patch");

/* ---------------- loot: todo item tem catálogo + sprite + preço ------- */
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
/* Itens novos registrados pelo patch — cid/price oficiais. */
const NEW_ITEMS = {
  "crystallized-blood":  { cid: 44752, sell: 270000 }, // Yasir
  "exalted-seal":        { cid: 44750, sell: 190000 }, // Yasir
  "gold-scaled-sentinel":{ cid: 44751, sell: 380000 }, // Yasir
  "herald-s-insignia":   { cid: 44753, sell: 0 },      // addon outfit, sem comprador
  "herald-s-wings":      { cid: 44754, sell: 0 },      // addon outfit, sem comprador
};
for (const slug of Object.keys(NEW_ITEMS)) {
  const it = items[slug], want = NEW_ITEMS[slug];
  must(it && it.t === "loot", slug + " não registrado como loot");
  must(it.cid === want.cid, slug + " cid errado (" + it.cid + ")");
  must(it.sell === want.sell && it.npcSell === want.sell,
    slug + " preço errado (" + it.sell + "/" + it.npcSell + ")");
}
/* Paridade client×engine nos preços dos itens novos/reprecificados —
 * dragon-pack-boss.js roda por último no loop "Conteúdo novo" (depois do
 * merge do weapondata) para o sell 0 oficial não ser sobrescrito. */
const SHARED_PRICES = Object.assign({}, NEW_ITEMS, {
  "arcane-dragon-robe":           { cid: 44623, sell: 0 },
  "dauntless-dragon-scale-armor": { cid: 44621, sell: 0 },
  "unerring-dragon-scale-armor":  { cid: 44622, sell: 0 },
  "mystical-dragon-robe":         { cid: 44624, sell: 0 },
  "merudri-battle-mail":          { cid: 50264, sell: 0 },
});
for (const slug of Object.keys(SHARED_PRICES)) {
  const ci = items[slug], ei = engine.ITEMS[slug], want = SHARED_PRICES[slug];
  must(ci && Number(ci.sell) === want.sell,
    "cliente: " + slug + " com sell errado (" + (ci && ci.sell) +
    ", esperado " + want.sell + ")");
  must(ci && Number(ci.cid) === want.cid,
    "cliente: " + slug + " com cid errado (" + (ci && ci.cid) +
    ", esperado " + want.cid + ")");
  must(ei && Number(ei.sell) === want.sell,
    "engine: " + slug + " com sell errado (" + (ei && ei.sell) +
    ", esperado " + want.sell + ")");
}

/* ---------------- engine: monstro + hunt da bossroom ------------------ */
const em = engine.MONSTERS[BOSS_ID];
must(em && em.boss && Array.isArray(em.loot) && em.loot.length === OFFICIAL_LOOT.length,
  "engine: monstro base sem loot (registerMonsters não rodou?)");
must(em.looktype === 1712 && em.raceId === 2466,
  "engine: looktype/raceId divergentes");
must(engine.HUNTS[HUNT_ID] && engine.HUNTS[HUNT_ID].monsters[0] === BOSS_ID &&
     engine.HUNTS[HUNT_ID].cat === "boss-room",
  "engine: hunt da bossroom ausente do literal HUNTS");
const engineSrc = fs.readFileSync(
  path.join(__dirname, "..", "server", "authoritative_engine.js"), "utf8");
must(engineSrc.includes('"dragon-pack-boss.js"'),
  "engine não carrega dragon-pack-boss.js no sandbox");
must(engineSrc.includes('require("../game/js/dragon-pack-boss.js").registerMonsters(MONSTERS)'),
  "engine não registra o monstro via registerMonsters");
const boost = require("../server/dailyboost.js");
must(boost.DAILY_BOSS_POOL.includes(BOSS_ID),
  "DAILY_BOSS_POOL sem o boss (filtro MONSTERS[slug].boss não passou)");
must(boost.DAILY_BOSS_POOL.includes("the-mega-magmaoid"),
  "DAILY_BOSS_POOL perdeu o mega-magmaoid");

/* ---------------- mapa publicado + caminhável ------------------------- */
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

/* Dragon Pack room: 49×38 z=7 bounds 1009..1057 × 1015..1052, 1764 cells,
 * 60 ids; spawn (25,22) / boss (23,14) / center (24,19) no componente de
 * 326. */
const dp = mapCheck(path.join(game, "maps", "dragon_pack_room.otbm"),
         path.join(game, "beta-maps", "bossesroom", "dragon_pack_room.otbm"),
         [49, 38], [1009, 1015, 1057, 1052], 1764, 60,
         { spawn: [1034, 1037], boss: [1032, 1029],
           extra: [[1033, 1034]], component: 326 });
must(fs.existsSync(path.join(game, "assets", "tiles", "7739.png")),
  "sprite 7739 (único novo da sala) não importado");

/* applyHuntOtbmZones: playerspawn/bossspawn locais (25,22)/(23,14). */
const zoneSrc = fs.readFileSync(path.join(js, "otbmhunt.js"), "utf8");
const zs = zoneSrc.indexOf("function applyHuntOtbmZones");
const ze = zoneSrc.indexOf("/* Garante", zs);
vm.runInContext(zoneSrc.slice(zs, ze), ctx);
ctx.applyHuntOtbmZones(dp.map, hu);
const runtime = OTBM.huntMapFromOtbm(dp.map, tfCtx.TILEFLAGS || {});
must(JSON.stringify(runtime.spawn) === JSON.stringify({ x: 25, y: 22 }),
  "playerspawn local divergente (25,22)");
must(runtime.mob.length === 1 &&
     JSON.stringify(runtime.mob[0]) === JSON.stringify({ x: 23, y: 14 }),
  "bossspawn local divergente (23,14)");

/* ---------------- index.html ---------------- */
const html = fs.readFileSync(path.join(game, "index.html"), "utf8");
must(html.includes("js/dragon-pack-boss.js?v="),
  "dragon-pack-boss.js não carregado no index");
must(html.indexOf("js/dragon-pack-boss.js?v=") >
     html.indexOf("js/mega-magmaoid-boss.js?v="),
  "dragon-pack-boss.js deve carregar DEPOIS do mega-magmaoid-boss.js");

console.log("ok: Dragon Pack — boss 400+ (50k HP, 600k exp, cooldown 20h, looktype 1712 = mega-dragon), sala dragon_pack_room 49×38 publicada; 5 itens novos (3 Yasir 190k/270k/380k, 2 sell 0) + 5 dragon scale armors com cid/sell 0");
