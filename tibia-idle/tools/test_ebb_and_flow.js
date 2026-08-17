/* Regressão: Ebb and Flow — mapa, quatro monstros oficiais, Fear 15× → Greed. */
"use strict";
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const game = path.join(__dirname, "..", "game");
const js = path.join(game, "js");
const OTBM = require(path.join(js, "otbm.js"));
function must(ok, msg) { if (!ok) throw new Error(msg); }
function pngSize(file) {
  const b = fs.readFileSync(file);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

const ctx = { window: {}, console, Math, Date, Map, Set, addEventListener() {} };
ctx.window = ctx;
ctx.document = { addEventListener() {}, getElementById() { return null; } };
vm.createContext(ctx);
for (const file of [
  "gamedata.js", "weapondata.js", "weapons.js", "monsterdata.js", "mobsheetdata.js",
  "monsters.js", "hard-hunts.js", "soulwar.js", "tileflags.js",
]) {
  vm.runInContext(fs.readFileSync(path.join(js, file), "utf8"), ctx, { filename: file });
}

const betaPath = path.join(game, "beta-maps", "ebb&flow.otbm");
const runtime = fs.readFileSync(path.join(game, "maps", "ebb_and_flow.otbm"));
must(fs.existsSync(betaPath), "beta-map ebb&flow.otbm ausente");
const beta = fs.readFileSync(betaPath);
must(beta.equals(runtime), "Ebb and Flow runtime difere do beta-map");
must(crypto.createHash("sha256").update(runtime).digest("hex") ===
  crypto.createHash("sha256").update(beta).digest("hex"),
  "SHA beta/runtime divergente");

const hunt = ctx.GAMEDATA.hunts["ebb-and-flow"];
must(hunt && hunt.otbm === "ebb_and_flow" && hunt.otbmFloor === 7 &&
  hunt.otbmRuntimeWidth === 30 && hunt.otbmRuntimeHeight === 30 &&
  hunt.soulWarFear === true &&
  JSON.stringify(hunt.monsters) === JSON.stringify([
    "bony-sea-devil", "capricious-phantom", "hazardous-phantom", "turbulent-elemental",
  ]), "hunt Ebb and Flow/mapa/quatro monstros/Fear não registrados");
must(hunt.soulWarZoneMonster === "bony-sea-devil",
  "taint de Ebb and Flow deve ser Bony Sea Devil");
must(JSON.stringify(hunt.otbmFovBounds) ===
  JSON.stringify({ x: 1041, y: 1004, w: 27, h: 24, z: 7 }) &&
  hunt.otbmFovWidth === 21 && hunt.otbmFovHeight === 13 &&
  JSON.stringify(hunt.otbmSpawn) === JSON.stringify({ x: 1052, y: 1016, z: 7 }) &&
  JSON.stringify(hunt.otbmMobBounds) ===
  JSON.stringify({ x: 1048, y: 1012, w: 12, h: 9, z: 7 }),
  "FOV/spawn/zona de monstros de Ebb and Flow incorretos");

let map = OTBM.read(runtime, { z: 7 });
must(map.w === 27 && map.h === 24 &&
  map.sourceBounds.minX === 1041 && map.sourceBounds.minY === 1004 &&
  map.sourceBounds.maxX === 1067 && map.sourceBounds.maxY === 1027,
  "piso z=7 de Ebb and Flow não foi preservado");

const loader = fs.readFileSync(path.join(js, "otbmhunt.js"), "utf8");
const zs = loader.indexOf("function applyHuntOtbmZones");
const ze = loader.indexOf("\n\n/* Garante", zs);
vm.runInContext(loader.slice(zs, ze), ctx);
ctx.applyHuntOtbmZones(map, hunt);
map.idleTargetWidth = 30;
map.idleTargetHeight = 30;
map.idleFovWidth = hunt.otbmFovWidth;
map.idleFovHeight = hunt.otbmFovHeight;
const hm = OTBM.huntMapFromOtbm(map, ctx.TILEFLAGS);
must(hm.rows.length === 30 && hm.rows.every((r) => r.length === 30) &&
  hm.spawn.x === 12 && hm.spawn.y === 15 && hm.mob.length === 108 &&
  hm.fovWidth === 21 && hm.fovHeight === 13,
  "Ebb and Flow não resultou no mundo 30×30/FOV 21×13/spawns esperados");
const free = hm.mob.filter((p) => {
  const e = hm.leg[hm.rows[p.y][p.x]];
  return e && !e.bloc && !hm.footprintBlocked[p.x + ":" + p.y];
});
must(free.length >= 40, "zona Ebb and Flow sem espaço útil para waves");

const visualIds = new Set();
Object.values(hm.leg).forEach((e) => {
  (e.v || []).forEach((id) => visualIds.add(id));
  (e.g || []).forEach((id) => visualIds.add(id));
});
for (const id of visualIds) {
  must(fs.existsSync(path.join(game, "assets", "tiles", id + ".png")),
    "sprite do mapa Ebb and Flow ausente: " + id);
}

const expected = {
  "bony-sea-devil": {
    hp: 24000, exp: 19470, speed: 220, armor: 100, defense: 100, damage: 900,
    mitigation: 3.34, look: 1294, dist: 1,
  },
  "capricious-phantom": {
    hp: 30000, exp: 19360, speed: 240, armor: 100, defense: 100, damage: 900,
    mitigation: 2.45, look: 1298, dist: 4,
  },
  "hazardous-phantom": {
    hp: 70000, exp: 66000, speed: 100, armor: 100, defense: 100, damage: 1100,
    mitigation: 4.45, look: 1298, dist: 4,
  },
  "turbulent-elemental": {
    hp: 28000, exp: 19360, speed: 180, armor: 105, defense: 105, damage: 900,
    mitigation: 2.72, look: 1314, dist: 1,
  },
};
for (const [slug, e] of Object.entries(expected)) {
  const m = ctx.GAMEDATA.monsters[slug];
  must(m, slug + " ausente");
  for (const k of ["hp", "exp", "speed", "armor", "defense", "damage", "mitigation"])
    must(m[k] === e[k], `${slug}.${k} divergente do Canary (${m[k]}!=${e[k]})`);
  must(m.looktype === e.look && (m.targetDistance || 1) === e.dist,
    slug + ": look/targetDistance divergente");
  const sheet = path.join(game, "assets", "mob", slug + ".png");
  const sz = pngSize(sheet);
  const meta = ctx.MOBSHEETS[slug];
  must(meta && meta.cols === 9 && sz.w === meta.cw * 9 && sz.h === meta.ch * 4,
    slug + ": moving sheet inválido");
  for (const loot of m.loot || []) {
    must(ctx.GAMEDATA.items[loot.item], `${slug}: loot sem definição: ${loot.item}`);
    must(fs.existsSync(path.join(game, "assets", "item", loot.item + ".png")),
      `${slug}: loot sem sprite: ${loot.item}`);
  }
}
must(ctx.GAMEDATA.monsters["capricious-phantom"].targetDistance === 4 &&
  ctx.GAMEDATA.monsters["hazardous-phantom"].targetDistance === 4,
  "Capricious/Hazardous Phantom devem ser ranged (targetDistance 4)");
must((ctx.GAMEDATA.monsters["capricious-phantom"].skills || [])
  .some((s) => String(s.n || "").toLowerCase() === "soulwars fear"),
  "Capricious Phantom deve ter soulwars fear (wiki)");

const combat = fs.readFileSync(path.join(js, "combat.js"), "utf8");
must(combat.includes("feared:") && combat.includes("applySoulwarFear") &&
  combat.includes("tryEbbFearOnHit") && combat.includes("playerIsFeared") &&
  combat.includes("EBB_FEAR_ON_HIT_CHANCE"),
  "condition Fear / hooks Canary ausentes em combat.js");

const gridai = fs.readFileSync(path.join(js, "gridai.js"), "utf8");
must(gridai.includes("fearThinkStep") && gridai.includes("playerIsFeared"),
  "fuga Feared ausente em gridai.js");

const gameSrc = fs.readFileSync(path.join(js, "game.js"), "utf8");
must(gameSrc.includes('"ebb-and-flow"') &&
  gameSrc.includes('counter:"fear"') &&
  gameSrc.includes("recordFearHit") &&
  gameSrc.includes('bossAccess:"goshnar-s-greed"') &&
  gameSrc.includes('mission:"ebb-and-flow"') &&
  gameSrc.includes('access:"goshnar-s-greed"') &&
  gameSrc.includes("fear-compact"),
  "missão Fear 15× / acesso Greed / HUD compacto ausentes");

const ui = fs.readFileSync(path.join(js, "ui.js"), "utf8");
must(ui.includes("ebb-and-flow"), "Ebb and Flow ausente do modal Soulwar");

const engine = fs.readFileSync(path.join(__dirname, "..", "server", "authoritative_engine.js"), "utf8");
must(engine.includes('"ebb-and-flow"') && engine.includes("soulWarFear") &&
  engine.includes("bony-sea-devil") && engine.includes("turbulent-elemental"),
  "hunt ausente no authoritative_engine");

console.log("OK: Ebb and Flow mapa/monstros/Fear 15×/Greed validados.");
