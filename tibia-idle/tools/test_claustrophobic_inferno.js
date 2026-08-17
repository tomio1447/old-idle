/* Regressão: Claustrophobic Inferno — mapa, 3 monstros Canary, missão 5min. */
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

const beta = fs.readFileSync(path.join(game, "beta-maps", "claustrophobic inferno.otbm"));
const runtime = fs.readFileSync(path.join(game, "maps", "claustrophobic_inferno.otbm"));
must(beta.equals(runtime), "Claustrophobic Inferno runtime difere do beta-map");
must(crypto.createHash("sha256").update(runtime).digest("hex") ===
  crypto.createHash("sha256").update(beta).digest("hex"),
  "SHA beta/runtime divergente");

const hunt = ctx.GAMEDATA.hunts["claustrophobic-inferno"];
must(hunt && hunt.otbm === "claustrophobic_inferno" && hunt.otbmFloor === 7 &&
  hunt.otbmRuntimeWidth === 30 && hunt.otbmRuntimeHeight === 30 &&
  JSON.stringify(hunt.monsters) === JSON.stringify([
    "brachiodemon", "infernal-demon", "infernal-phantom",
  ]), "hunt Claustrophobic Inferno/mapa/três monstros não registrados");
must(JSON.stringify(hunt.otbmFovBounds) ===
  JSON.stringify({ x: 1042, y: 1008, w: 26, h: 19, z: 7 }) &&
  hunt.otbmFovWidth === 26 && hunt.otbmFovHeight === 19 &&
  JSON.stringify(hunt.otbmSpawn) === JSON.stringify({ x: 1050, y: 1016, z: 7 }) &&
  JSON.stringify(hunt.otbmMobBounds) ===
  JSON.stringify({ x: 1048, y: 1014, w: 12, h: 9, z: 7 }),
  "FOV/spawn/zona de monstros de Claustrophobic Inferno incorretos");

let map = OTBM.read(runtime, { z: 7 });
must(map.w === 26 && map.h === 19 &&
  map.sourceBounds.minX === 1042 && map.sourceBounds.minY === 1008 &&
  map.sourceBounds.maxX === 1067 && map.sourceBounds.maxY === 1026,
  "piso z=7 de Claustrophobic Inferno não foi preservado");

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
  hm.spawn.x === 10 && hm.spawn.y === 13 && hm.mob.length === 108 &&
  hm.fovWidth === 26 && hm.fovHeight === 19,
  "Claustrophobic Inferno não resultou no mundo 30×30/FOV/spawns esperados");
const free = hm.mob.filter((p) => {
  const e = hm.leg[hm.rows[p.y][p.x]];
  return e && !e.bloc && !hm.footprintBlocked[p.x + ":" + p.y];
});
must(free.length >= 40, "zona Claustrophobic Inferno sem espaço útil para waves");

const visualIds = new Set();
Object.values(hm.leg).forEach((e) => {
  (e.v || []).forEach((id) => visualIds.add(id));
  (e.g || []).forEach((id) => visualIds.add(id));
});
for (const id of visualIds) {
  must(fs.existsSync(path.join(game, "assets", "tiles", id + ".png")),
    "sprite do mapa Claustrophobic Inferno ausente: " + id);
}
must(fs.existsSync(path.join(game, "assets", "tiles", "33276_anim.png")) &&
  fs.existsSync(path.join(game, "assets", "tiles", "33277_anim.png")),
  "animações de parede/lava (33276/33277) ausentes");

const expected = {
  "brachiodemon": {
    hp: 25000, exp: 15770, speed: 220, armor: 100, defense: 100, damage: 950,
    mitigation: 2.75, look: 1299, dist: 1,
  },
  "infernal-demon": {
    hp: 32000, exp: 17430, speed: 200, armor: 120, defense: 120, damage: 1450,
    mitigation: 3.33, look: 1313, dist: 1,
  },
  "infernal-phantom": {
    hp: 26000, exp: 15770, speed: 200, armor: 100, defense: 100, damage: 800,
    mitigation: 2.45, look: 1298, dist: 4,
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
must(ctx.GAMEDATA.monsters["infernal-phantom"].targetDistance === 4,
  "Infernal Phantom deve ser ranged (targetDistance 4)");

const gameSrc = fs.readFileSync(path.join(js, "game.js"), "utf8");
must(gameSrc.includes('"claustrophobic-inferno"') &&
  gameSrc.includes("surviveSec:300") &&
  gameSrc.includes("surviveMissionTick") &&
  gameSrc.includes("surviveMissionOnDeath") &&
  gameSrc.includes('bossAccess:"goshnar-s-megalomania"'),
  "missão de sobrevivência / acesso Megalomania ausentes");
must(gameSrc.includes('mission:"claustrophobic-inferno"') &&
  gameSrc.includes('access:"goshnar-s-megalomania"'),
  "Megalomania sem requisito da missão Inferno");

const ui = fs.readFileSync(path.join(js, "ui.js"), "utf8");
must(ui.includes("claustrophobic-inferno"),
  "Claustrophobic Inferno ausente do modal Soulwar");

const engine = fs.readFileSync(path.join(__dirname, "..", "server", "authoritative_engine.js"), "utf8");
must(engine.includes('"claustrophobic-inferno"') && engine.includes("brachiodemon"),
  "hunt ausente no authoritative_engine");

console.log("OK: Claustrophobic Inferno mapa/monstros/missão 5min/Megalomania validados.");
