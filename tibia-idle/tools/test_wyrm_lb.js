/* Regressão: Wyrms — Liberty Bay (HUNTS 50+, categoria low).
 *
 * Hunt antiga registrada pelo patch game/js/wyrm-lb.js (não existe em
 * hunts.json nem no literal HUNTS da engine — hidratada na autoridade via
 * captureAuthHuntDef a partir do combat.hunt do cliente). A engine carrega
 * o arquivo no sandbox só para registrar itens de loot em GAMEDATA.items.
 *
 * Mapa wyrm_lb.otbm 41×38 z=7 (byte-igual de beta-maps/, bounds
 * 1010..1050 × 1014..1051):
 *   playerspawn {1029,1030,7} → local (19,16)
 *   respawn     {1023,1024,7} → {1032,1034,7} (10×11 → 110 cells locais
 *               x13..22, y10..20; 102 caminháveis e conectadas — 8 cells
 *               da lagoa interna ficam bloqueadas)
 * walkFloors libera as margens/água rasa (10553/21477/21478/21479/21481/
 * 21482 têm flag de bloqueio no .dat mas são pisos funcionais da hunt).
 */
"use strict";
const fs = require("fs"), path = require("path"), vm = require("vm");
const game = path.join(__dirname, "..", "game");
const js = path.join(game, "js");
function must(v, m) { if (!v) throw Error(m); }

const engine = require("../server/authoritative_engine.js");
const OTBM = require(path.join(js, "otbm.js"));

/* ---------------- definição da hunt (cliente) ------------------------ */
const ctx = { console, Math, Date, Map, Set };
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext("var GAMEDATA={};", ctx);
vm.runInContext(fs.readFileSync(path.join(js, "wyrm-lb.js"), "utf8"), ctx);

const hu = ctx.GAMEDATA.hunts["wyrm-lb"];
must(hu, "hunt wyrm-lb não registrada");
must(hu.name === "Wyrms" && hu.cat === "low" && hu.level === 50 &&
     hu.minLevel === 50, "nome/cat/nível divergentes");
must(hu.otbm === "wyrm_lb" && hu.otbmFloor === 7, "otbm/floor errados");
must(!hu.otbmBounds, "otbmBounds presente — o .otbm já é o recorte da área");
must(hu.otbmSpawn && hu.otbmSpawn.x === 1029 && hu.otbmSpawn.y === 1030 &&
     hu.otbmSpawn.z === 7, "playerspawn errado (esperado {1029,1030,7})");
must(hu.otbmMobBounds && hu.otbmMobBounds.x === 1023 &&
     hu.otbmMobBounds.y === 1024 && hu.otbmMobBounds.z === 7 &&
     hu.otbmMobBounds.w === 10 && hu.otbmMobBounds.h === 11,
  "respawn errado (esperado {1023,1024,7} w10 h11)");
must(Array.isArray(hu.monsters) && hu.monsters.length === 1 &&
     hu.monsters[0] === "wyrm", "monsters deve ser só wyrm");
must(hu.spawnWeights && hu.spawnWeights.wyrm === 100,
  "spawnWeights divergente");
must(hu.pack === 5 && hu.packMin === 4 && hu.packMax === 6,
  "pack divergente (esperado 4–6)");
for (const id of [21478, 21479])
  must(hu.walkFloors.includes(id),
    "walkFloors sem " + id + " (água rasa nova do mapa, flag-bloqueada)");

/* ---------------- mapa publicado byte-igual ao beta ------------------- */
const tfCtx = { console }; tfCtx.window = tfCtx; vm.createContext(tfCtx);
vm.runInContext(fs.readFileSync(path.join(js, "tileflags.js"), "utf8"), tfCtx);
const flags = tfCtx.TILEFLAGS || {};

const runtimeMap = path.join(game, "maps", "wyrm_lb.otbm");
const betaMap = path.join(game, "beta-maps", "wyrm_lb.otbm");
must(fs.existsSync(runtimeMap), "wyrm_lb.otbm não publicado");
must(fs.existsSync(betaMap), "OTBM beta ausente");
must(fs.readFileSync(runtimeMap).equals(fs.readFileSync(betaMap)),
  "wyrm_lb.otbm e beta divergentes");

const buf = fs.readFileSync(runtimeMap);
const map = OTBM.read(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), { z: 7 });
const sb = map.sourceBounds;
must(map.z === 7 && map.w === 41 && map.h === 38,
  "dimensões/andar errados (" + map.w + "x" + map.h + " z" + map.z + ")");
must(sb && sb.minX === 1010 && sb.minY === 1014 &&
     sb.maxX === 1050 && sb.maxY === 1051,
  "sourceBounds divergente");
must(Object.keys(map.cells).length === 1449,
  "contagem de cells divergente (" + Object.keys(map.cells).length + ")");
const used = new Set();
Object.values(map.cells).forEach((c) => {
  if (c.g) used.add(c.g);
  (c.items || []).forEach((id) => used.add(id));
});
must(used.size === 149,
  "quantidade de tile ids mudou (" + used.size + ")");

/* ---------------- caminhável: walkFloors + zones ---------------------- */
const hm = OTBM.huntMapFromOtbm(map, flags);
const floors = new Set(hu.walkFloors.map(Number));
const freeLeg = (e) => e && e.bloc &&
  (e.v || []).some((id) => floors.has(id)) &&
  !(e.g || []).some((id) => flags[id] && flags[id][1]);
let freed = 0;
for (const k of Object.keys(hm.leg)) {
  const e = hm.leg[k];
  if (freeLeg(e)) { e.bloc = false; freed++; }
}
must(freed === 45, "walkFloors deve liberar 45 legs (" + freed + ")");
if (hm.footprintBlocked)
  for (const k of Object.keys(hm.footprintBlocked)) {
    const xy = k.split(":");
    const e = hm.leg[hm.rows[Number(xy[1])] &&
      hm.rows[Number(xy[1])][Number(xy[0])]];
    if (freeLeg(e)) delete hm.footprintBlocked[k];
  }
const walkL = (x, y) => {
  if (x < 0 || y < 0 || x >= map.w || y >= map.h) return false;
  const e = hm.leg[hm.rows[y][x]];
  return !!(e && !e.bloc &&
    !(hm.footprintBlocked && hm.footprintBlocked[x + ":" + y]));
};
const sp = { x: hu.otbmSpawn.x - sb.minX, y: hu.otbmSpawn.y - sb.minY };
must(sp.x === 19 && sp.y === 16, "playerspawn local divergente (19,16)");
must(walkL(sp.x, sp.y), "playerspawn bloqueado");
const seen = {}, q = [[sp.x, sp.y]];
seen[sp.x + "," + sp.y] = 1;
while (q.length) {
  const [x, y] = q.pop();
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const nx = x + dx, ny = y + dy, k = nx + "," + ny;
    if (nx < 0 || ny < 0 || nx >= map.w || ny >= map.h || seen[k]) continue;
    if (walkL(nx, ny)) { seen[k] = 1; q.push([nx, ny]); }
  }
}
must(Object.keys(seen).length === 189,
  "componente divergente (" + Object.keys(seen).length + " != 189)");
let rw = 0, rc = 0;
for (let x = 0; x < hu.otbmMobBounds.w; x++)
  for (let y = 0; y < hu.otbmMobBounds.h; y++) {
    const lx = hu.otbmMobBounds.x - sb.minX + x;
    const ly = hu.otbmMobBounds.y - sb.minY + y;
    if (walkL(lx, ly)) { rw++; if (seen[lx + "," + ly]) rc++; }
  }
must(rw === 102 && rc === 102,
  "respawn rect: " + rw + "/110 caminháveis, " + rc + " conectadas " +
  "(esperado 102/102 — 8 cells da lagoa ficam bloqueadas)");

/* applyHuntOtbmZones: spawn/mob locais (19,16) / 110 cells x13..22 y10..20 */
const zoneSrc = fs.readFileSync(path.join(js, "otbmhunt.js"), "utf8");
const zs = zoneSrc.indexOf("function applyHuntOtbmZones");
const ze = zoneSrc.indexOf("/* Garante", zs);
vm.runInContext(zoneSrc.slice(zs, ze), ctx);
ctx.applyHuntOtbmZones(map, hu);
must(map.spawn && map.spawn.x === 19 && map.spawn.y === 16,
  "applyHuntOtbmZones: spawn local divergente (19,16)");
must(Array.isArray(map.mob) && map.mob.length === 110,
  "applyHuntOtbmZones: mob deve ter 110 cells (" +
  (map.mob && map.mob.length) + ")");
must(Math.min(...map.mob.map((c) => c.x)) === 13 &&
     Math.max(...map.mob.map((c) => c.x)) === 22 &&
     Math.min(...map.mob.map((c) => c.y)) === 10 &&
     Math.max(...map.mob.map((c) => c.y)) === 20,
  "mob range local divergente (x13..22 y10..20)");

/* ---------------- sprites + catálogo RME ---------------------------- */
const missingPng = [];
for (const id of used)
  if (!fs.existsSync(path.join(game, "assets", "tiles", id + ".png")))
    missingPng.push(id);
must(missingPng.length === 0,
  "sem PNG em assets/tiles: " + missingPng.join(", "));
const rmeCtx = { window: {} }; rmeCtx.window = rmeCtx; vm.createContext(rmeCtx);
vm.runInContext(fs.readFileSync(
  path.join(game, "rme", "data", "known_tiles.js"), "utf8"), rmeCtx);
const unlisted = OTBM.missingTiles(map, rmeCtx.RME_KNOWN_TILES);
must(unlisted.length === 0,
  "fora do catálogo RME: " + unlisted.join(", "));

/* ---------------- engine: arquivo carregado no sandbox ---------------- */
const engineSrc = fs.readFileSync(
  path.join(__dirname, "..", "server", "authoritative_engine.js"), "utf8");
must(engineSrc.includes('"wyrm-lb.js"'),
  "engine não carrega wyrm-lb.js no sandbox");

console.log("ok: Wyrms LB — mapa 41×38 publicado, playerspawn {1029,1030,7} " +
  "local (19,16), respawn 102/110 conectadas (componente 189), walkFloors " +
  "+21478/21479, 149 ids com sprite/catálogo");
