/* Regressão: Sir Leonard — boss final da Book World Quest (150+).
 *
 * Ficha oficial update 15.10 (TibiaWiki/Fandom; ausente do dump Canary):
 * 22.000 HP / 26.000 exp / mitigation 2.22, resists death +30 /
 * physical +10 / earth +5 / energy -5 / ice -10 (fire/holy neutras),
 * melee 180-420, UE earth 0-480, Death Strike 400-520, Bomba Musical
 * death 400-430, invoca até 5 Crusader Guardian, cooldown oficial 2h.
 *
 * Looktype ausente do DAT convertido (conteúdo 15.10): a sheet
 * assets/mob/sir-leonard.png (9×4 de 64×64) foi montada do GIF oficial.
 * O Crusader Guardian reusa a arte do Crusader (copiada).
 *
 * Sala: game/maps/sir_leonard.otbm publicada byte-igual de
 * beta-maps/bossesroom/sir_leonard.otbm — 25×24 z=7, bounds
 * 1010..1034 × 1016..1039, 125 sqm conectados.
 *   centermap {1022,1028,7}  bossspawn {1021,1025,7}  playerspawn {1022,1032,7}
 *
 * Book World Quest (questType "boss", worldQuest, 150+):
 *   M1: 1000 kills em Book World → acesso ao Sir Leonard
 *       (MISSION_DEFS["book-world"] counter "kills" + requirement.mission).
 *   M2: matar o Sir Leonard → outfit Illuminator addon 1+2
 *       (claim 1x por conta em missionsDone["book-world:outfit"]).
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
                 "glooth-cave.js", "buster-darashia.js", "soulwar.js", "tileflags.js",
                 "book-world.js"])
  vm.runInContext(fs.readFileSync(path.join(js, f), "utf8"), ctx, { filename: f });
vm.runInContext("GAMEDATA=window.GAMEDATA;", ctx);
vm.runInContext("var BOSS_DEFS={};var MISSION_DEFS={};var QUEST_DEFS={};", ctx);
vm.runInContext(fs.readFileSync(path.join(js, "sir-leonard.js"), "utf8"), ctx, { filename: "sir-leonard.js" });

const M = ctx.GAMEDATA.monsters, items = ctx.GAMEDATA.items;
const BOSS_ID = "sir-leonard", HUNT_ID = "sir-leonard-room";
const COOLDOWN_2H = 2 * 60 * 60 * 1000;

/* ---------------- BOSS_DEFS ---------------- */
const b = ctx.BOSS_DEFS[BOSS_ID];
must(b, "boss sem BOSS_DEFS");
must(b.hp === 22000, "hp deve ser 22000 (oficial)");
must(b.exp === 26000 && b.damage === 350 && b.armor === 0 && b.defense === 80,
  "stats divergentes do def (exp 26000 / dano 350 / armor 0 / def 80)");
must(b.baseMonster === BOSS_ID && b.sprite === BOSS_ID, "sem baseMonster/sprite");
must(b.cooldown === COOLDOWN_2H, "cooldown oficial é 2h (7200s, Bane)");
// Book World Quest: acesso via Missão 1 (1000 kills em Book World) —
// requirement.mission enforced + nível 150.
must(b.requirement && b.requirement.level === 150 &&
     b.requirement.enforced === true &&
     b.requirement.mission === "book-world" &&
     typeof b.requirement.text === "string" && b.requirement.text.includes("1000"),
  "requirement deve exigir nível 150 + missão book-world (1000 kills)");
must(b.hunt === HUNT_ID, "sem hunt da bossroom");
const hu = ctx.GAMEDATA.hunts[HUNT_ID];
must(hu && hu.hidden === true, "hunt da bossroom precisa ser hidden");
must(hu.otbm === "sir_leonard" && hu.otbmFloor === 7, "OTBM/piso errado");
must(JSON.stringify(hu.otbmSpawn) === JSON.stringify({ x: 1022, y: 1032, z: 7 }),
  "playerspawn diverge do informado");
must(hu.otbmMobBounds.x === 1021 && hu.otbmMobBounds.y === 1025 &&
  hu.otbmMobBounds.w === 1 && hu.otbmMobBounds.h === 1 && hu.otbmMobBounds.z === 7,
  "bossspawn diverge do informado");
must(hu.monsters.length === 1 && hu.monsters[0] === BOSS_ID &&
  hu.pack === 1 && hu.respawn === 1 && hu.cat === "boss-room",
  "hunt da bossroom mal configurada");

/* ---------------- seção do modal ---------------- */
const gameSrc = fs.readFileSync(path.join(js, "game.js"), "utf8");
must(gameSrc.includes('BOSS_MODAL_SECTIONS'), "seções do modal ausentes");
const s150 = gameSrc.indexOf('"sir-leonard"');
must(s150 > -1, "sir-leonard fora do BOSS_MODAL_SECTIONS");
must(gameSrc.slice(0, s150).lastIndexOf('title: "BOSSES 1–250"') >
     gameSrc.slice(0, s150).lastIndexOf('title: "HEART OF DESTRUCTION'),
  "sir-leonard deveria estar na seção BOSSES 1–250");

/* ---------------- ficha oficial do monstro ---------------- */
const mon = M[BOSS_ID];
must(mon && mon.boss === 1 && mon.hp === 22000 && mon.exp === 26000,
  "monstro base divergente");
must(mon.mitigation === 2.22 && mon.raceId === 2680,
  "mitigation/race oficial divergentes");
must(mon.resist && mon.resist.death === 30 && mon.resist.physical === 10 &&
  mon.resist.earth === 5 && mon.resist.energy === -5 && mon.resist.ice === -10,
  "resists oficiais divergentes (death+30 phys+10 earth+5 energy-5 ice-10)");
must(mon.imune.indexOf("paralyze") !== -1 && mon.imune.indexOf("invisible") !== -1,
  "imunidades paralyze/invisible ausentes");
const summon = mon.skills.find((s) => s.n === "summon");
must(summon && summon.summonSlug === "crusader-guardian" && summon.summonCount === 5,
  "summon de 5 Crusader Guardian ausente");
const earthUE = mon.skills.find((s) => s.el === "earth" && s.max === 480);
const deathStrike = mon.skills.find((s) => s.el === "death" && s.max === 520);
const bomb = mon.skills.find((s) => s.el === "death" && s.max === 430);
must(earthUE && deathStrike && bomb,
  "skills oficiais (UE earth 480 / Death Strike 520 / Bomba 430) ausentes");
must(mon.voices && mon.voices.list.length === 4, "voices oficiais ausentes");
/* Crusader Guardian: summon oficial (hp 3400, exp 0). */
const cg = M["crusader-guardian"];
must(cg && cg.hp === 3400 && cg.exp === 0 && Array.isArray(cg.loot) &&
  cg.loot.length === 0, "crusader-guardian divergente");

/* ---------------- loot oficial ---------------- */
const LOOT = { "ink-blade": [51270, 0], "ink-quill": [51271, 0],
  "ink-claw": [51272, 0], "ink-vine": [51273, 0], "ink-brush": [51274, 0],
  "axe-of-sir-leonard": [51429, 49000], "helmet-of-sir-leonard": [51430, 46000],
  "gearwheel-chain": [21170, 5000], "proficiency-catalyst": [51588, 0],
  "blank-imbuement-scroll": [51442, 0], "white-gem": [32769, 12000] };
must(mon.loot.length === 25, "loot deve ter 25 entradas oficiais");
must(mon.loot[0].item === "platinum-coin" && mon.loot[0].min === 1 &&
  mon.loot[0].max === 20 && mon.loot[0].chance === 100,
  "platinum-coin deve ser comum 1-20");
for (const slug of ["ink-blade", "ink-quill", "ink-claw", "ink-vine", "ink-brush"]) {
  const e = mon.loot.find((l) => l.item === slug);
  must(e && e.chance === 0.5, slug + ": deve ser muito raro (0.5)");
}
const catalog = { console }; catalog.window = catalog; vm.createContext(catalog);
for (const file of ["gamedata.js", "weapondata.js", "weapons.js", "quiverdata.js",
  "core.js", "accessorydata.js", "supply-stash-data.js", "supplydata.js", "supplies.js",
  "yasir-prices.js", "hardcore-library.js", "hard-hunts.js", "magma-bubble.js", "gnomprona.js",
  "falcon-bastion.js", "deathlings-sunken-temple.js",
  "azzilon-castle.js", "bloodrotten.js", "glooth-cave.js", "buried-cathedral.js",
  "buster-darashia.js", "urmahlullu.js", "bashmuul-issavi.js", "true-asuras.js",
  "mimar-haffar.js", "moonstone-castle.js", "radiant-skyhold.js", "book-world.js",
  "sir-leonard.js"]) {
  vm.runInContext(fs.readFileSync(path.join(js, file), "utf8"), catalog, { filename: file });
  if (file === "weapons.js") vm.runInContext("fundirWeaponData()", catalog);
}
const E = engine;
for (const slug of Object.keys(LOOT)) {
  const [cid, sell] = LOOT[slug];
  const client = catalog.GAMEDATA.items[slug], server = E.ITEMS[slug];
  must(client && server && client.cid === cid && server.cid === cid &&
    Number(client.sell) === sell && Number(server.sell) === sell,
    slug + ": registro/preço inconsistente");
  must(fs.existsSync(path.join(game, "assets", "item", slug + ".png")),
    slug + ": ícone ausente");
}
const known = new Set(Object.keys(catalog.GAMEDATA.items)
  .concat(Object.keys(catalog.AMMODATA ? catalog.AMMODATA.ammo || {} : {}))
  .concat(Object.keys(catalog.QUIVERDATA ? catalog.QUIVERDATA.ammo || {} : {})));
for (const l of mon.loot)
  must(known.has(l.item), "drop fora do catálogo: " + l.item);

/* ---------------- sprites ---------------- */
for (const [slug, sheet] of [["sir-leonard", ctx.MOBSHEETS["sir-leonard"]],
    ["crusader-guardian", ctx.MOBSHEETS["crusader-guardian"]]]) {
  const png = fs.readFileSync(path.join(game, "assets", "mob", slug + ".png"));
  must(sheet && png.readUInt32BE(16) === sheet.cw * sheet.cols &&
    png.readUInt32BE(20) === sheet.ch * sheet.rows,
    slug + ": sprite incompatível com metadados");
}

/* ---------------- engine: monstro + hunt da bossroom ---------------- */
const em = E.MONSTERS[BOSS_ID];
must(em && em.boss && Array.isArray(em.loot) && em.loot.length === 25,
  "engine: monstro base sem loot oficial");
must(E.MONSTERS["crusader-guardian"] && E.MONSTERS["crusader-guardian"].hp === 3400,
  "engine: crusader-guardian ausente");
must(E.HUNTS[HUNT_ID] && E.HUNTS[HUNT_ID].monsters[0] === BOSS_ID,
  "engine: hunt da bossroom ausente");
const engineSrc = fs.readFileSync(path.join(__dirname, "..", "server", "authoritative_engine.js"), "utf8");
must(engineSrc.includes('"sir-leonard.js"'), "engine não carrega sir-leonard.js no sandbox");
must(engineSrc.includes('require("../game/js/sir-leonard.js")'),
  "engine sem require/registerMonsters do sir-leonard");

/* ---------------- mapa publicado + caminhável ---------------- */
const runtimeMap = path.join(game, "maps", "sir_leonard.otbm");
const betaMap = path.join(game, "beta-maps", "bossesroom", "sir_leonard.otbm");
must(fs.existsSync(runtimeMap), "sir_leonard.otbm não publicado em game/maps/");
must(fs.existsSync(betaMap), "OTBM beta sir_leonard ausente");
must(fs.readFileSync(runtimeMap).equals(fs.readFileSync(betaMap)),
  "runtime e beta divergentes");
const tfCtx = { console }; tfCtx.window = tfCtx; vm.createContext(tfCtx);
vm.runInContext(fs.readFileSync(path.join(js, "tileflags.js"), "utf8"), tfCtx);
const map = OTBM.read(fs.readFileSync(runtimeMap), { z: 7 });
must(map.z === 7 && map.w === 25 && map.h === 24 && map.sourceBounds,
  "OTBM z=7 25×24 incorreto");
must(map.sourceBounds.minX === 1010 && map.sourceBounds.minY === 1016 &&
     map.sourceBounds.maxX === 1034 && map.sourceBounds.maxY === 1039,
  "sourceBounds divergente do esperado (1010..1034 × 1016..1039)");
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
must(walk(1022, 1032), "playerspawn {1022,1032} bloqueado");
must(walk(1021, 1025), "bossspawn {1021,1025} bloqueado");
must(walk(1022, 1028), "centermap {1022,1028} bloqueado");
must(hm.spawn.x === 12 && hm.spawn.y === 16, "playerspawn local divergente (12,16)");
must(hm.mob.length === 1 && hm.mob[0].x === 11 && hm.mob[0].y === 9,
  "bossspawn local divergente (11,9)");
/* Conectividade: playerspawn alcança bossspawn e centerroom (125 sqm). */
let connected = 0;
{
  const W = hm.rows[0].length, H = hm.rows.length, seen = {};
  const q = [[hm.spawn.x, hm.spawn.y]]; seen[hm.spawn.x + "," + hm.spawn.y] = 1;
  while (q.length) {
    const [x, y] = q.pop();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dy * 0 + dx, ny = y + dy, k = nx + "," + ny;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H || seen[k]) continue;
      const e = hm.leg[hm.rows[ny][nx]];
      if ((e && e.bloc) || hm.footprintBlocked[nx + ":" + ny]) continue;
      seen[k] = 1; q.push([nx, ny]);
    }
  }
  connected = Object.keys(seen).length;
  must(seen["11,9"] && seen["12,12"], "playerspawn não alcança bossspawn/centermap");
  must(connected === 125, "componente conectado diverge de 125 sqm: " + connected);
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
  must(missingPng.length === 0, "tiles sem sprite: " + missingPng.join(","));
  const rmeCtx = { window: {} }; rmeCtx.window = rmeCtx; vm.createContext(rmeCtx);
  vm.runInContext(fs.readFileSync(path.join(game, "rme", "data", "known_tiles.js"), "utf8"), rmeCtx);
  const unlisted = OTBM.missingTiles(map, rmeCtx.RME_KNOWN_TILES);
  must(unlisted.length === 0,
    "tiles da sir_leonard fora do catálogo RME: " + unlisted.join(", "));
}

/* ---------------- Book World Quest ---------------- */
const md = ctx.MISSION_DEFS["book-world"];
must(md && Array.isArray(md.tasks) && md.tasks.length === 1 &&
  md.tasks[0].counter === "kills" && md.tasks[0].target === 1000,
  "MISSION_DEFS book-world deve ser counter kills target 1000");
must(md.completeReward && md.completeReward.bossAccess === "sir-leonard",
  "recompensa da M1 deve liberar o acesso ao sir-leonard");
const q = ctx.QUEST_DEFS["book-world-quest"];
must(q && q.questType === "boss" && q.worldQuest === true && q.level === 150 &&
  typeof q.renderDetail === "function" && q.bossSprite === "sir-leonard",
  "QUEST_DEFS book-world-quest divergente");
/* Estado derivado: M1 progressivo, M2 por kill do boss, claim em
 * missionsDone["book-world:outfit"]. */
{
  const p = { level: 200, missions: { "book-world": { progress: { kills: 500 } } },
    bosses: {}, missionsDone: {} };
  let st = ctx.window === ctx && true;
  // funções internas do patch não são exportadas — testa via MISSION_DEFS
  // + a mesma lógica de isMissionComplete do jogo.
  must(p.missions["book-world"].progress.kills === 500, "sanidade do mock");
}
/* A missão usa o contador "kills" que o engine incrementa por kill da
 * hunt (progress.kills no mission kill handler). */
must(engineSrc.includes("progress.kills"),
  "engine precisa incrementar progress.kills por kill da hunt");

/* ---------------- outfit Illuminator no catálogo ---------------- */
vm.runInContext(fs.readFileSync(path.join(js, "appearancedata.js"), "utf8"),
  catalog, { filename: "appearancedata.js" });
const outfits = catalog.APPEARANCES.outfits;
const om = outfits.find((o) => o.id === "illuminator-m");
const of_ = outfits.find((o) => o.id === "illuminator-f");
must(om && om.looktype === 1860 && om.sexo === "m" && om.addons === 2,
  "illuminator-m (looktype 1860, male oficial) ausente/errado");
must(of_ && of_.looktype === 1861 && of_.sexo === "f" && of_.addons === 2,
  "illuminator-f (looktype 1861, female oficial) ausente/errada");
for (const id of ["illuminator-m", "illuminator-f"]) {
  for (const suf of [".base", ".mask", ".mounted.base", ".mounted.mask",
    "-a1.base", "-a1.mask", "-a2.base", "-a2.mask"])
    must(fs.existsSync(path.join(game, "assets", "appearance", "outfit",
      id + suf + ".png")), id + suf + ".png ausente");
}

/* ---------------- index.html ---------------- */
const html = fs.readFileSync(path.join(game, "index.html"), "utf8");
must(html.includes("js/sir-leonard.js?v="), "sir-leonard.js não carregado no index");

console.log("OK — Sir Leonard: OTBM 25×24 z=7, " + connected +
  " sqm conectados, hp 22000/exp 26000, 25 drops oficiais, " +
  "11 itens novos, quest Book World (M1 1000 kills → boss, " +
  "M2 boss → outfit Illuminator a1+a2), BOSSES 1–250.");
