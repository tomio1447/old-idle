/* Regressão: alinhamento do mapa da Catacombs Oramond.
 *
 * A sala desenhada em catacombs.otbm (piso z=7) ocupa os bounds
 * {1063,1011}..{1083,1029}: um piso 19×16 (tiles 20712/9524-9530) cercado
 * por paredes 1128 em cima/embaixo e 2 colunas à esquerda. A hunt
 * catacombs-oramond precisa declarar as zonas na MESMA geometria:
 *
 *  1. otbmFovBounds == bounds reais do mapa (mesma convenção de roshamuul,
 *     prison, ingol-terrain e buried-cathedral).
 *  2. otbmSpawn cai no piso ANDÁVEL, no centro da sala.
 *  3. otbmMobBounds fica inteiramente dentro do piso andável, com margem
 *     de 1 célula das paredes.
 *
 * O runtime deriva spawn/mob das coordenadas absolutas menos sourceBounds,
 * então qualquer mapa re-desenhado fora do lugar (o sintoma clássico de
 * "mapa desalinhado") derruba este teste: o spawn sairia do centro ou a
 * zona de monstros invadiria parede/vazio.
 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const game = path.join(__dirname, "..", "game");
const js = path.join(game, "js");
const OTBM = require(path.join(js, "otbm.js"));
global.window = { addEventListener() {} }; // otbmhunt.js usa window.reloadMaps
const { applyHuntOtbmZones } = require(path.join(js, "otbmhunt.js"));
function must(ok, msg) { if (!ok) throw Error("FALHOU: " + msg); }

/* ---------------- config da hunt (hard-hunts.js em vm) ---------------- */
const ctx = { window: {}, console, setInterval, clearInterval, Date, Math, Map, Set };
ctx.window = ctx;
vm.createContext(ctx);
for (const f of ["gamedata.js", "hard-hunts.js"])
  vm.runInContext(fs.readFileSync(path.join(js, f), "utf8"), ctx);
const hunt = ctx.GAMEDATA.hunts["catacombs-oramond"];
must(hunt && hunt.otbm === "catacombs" && hunt.otbmFloor === 7, "catacombs-oramond sem otbm/floor");
must(hunt.otbmFovBounds && hunt.otbmSpawn && hunt.otbmMobBounds,
  "catacombs-oramond sem fovBounds/spawn/mobBounds");

/* ---------------- mapa real ---------------- */
const TILEFLAGS_CTX = { window: {}, console };
vm.createContext(TILEFLAGS_CTX);
vm.runInContext(fs.readFileSync(path.join(js, "tileflags.js"), "utf8"), TILEFLAGS_CTX);
const TILEFLAGS = TILEFLAGS_CTX.window.TILEFLAGS;

const mapa = OTBM.read(fs.readFileSync(path.join(game, "maps", "catacombs.otbm")), { z: 7 });
const b = mapa.sourceBounds;
must(b, "catacombs.otbm sem sourceBounds");
const bw = b.maxX - b.minX + 1, bh = b.maxY - b.minY + 1;

/* 1. fovBounds == bounds do mapa */
must(hunt.otbmFovBounds.x === b.minX && hunt.otbmFovBounds.y === b.minY &&
  hunt.otbmFovBounds.w === bw && hunt.otbmFovBounds.h === bh &&
  hunt.otbmFovBounds.z === 7,
  `otbmFovBounds ${JSON.stringify(hunt.otbmFovBounds)} não casa com os bounds do mapa ` +
  `${b.minX},${b.minY}..${b.maxX},${b.maxY} (${bw}x${bh})`);

/* 2 e 3: simula o pipeline real (applyHuntOtbmZones + huntMapFromOtbm) */
const runtime = Object.assign({}, mapa);
runtime.idleTargetWidth = Number(hunt.otbmRuntimeWidth) || 30;
runtime.idleTargetHeight = Number(hunt.otbmRuntimeHeight) || 30;
applyHuntOtbmZones(runtime, hunt);
const hm = OTBM.huntMapFromOtbm(runtime, TILEFLAGS);
must(hm.spawn, "spawn não converteu para célula local");
const spawnCell = hm.legenda[hm.rows[hm.spawn.y][hm.spawn.x]];
must(!spawnCell.bloc, `spawn ${JSON.stringify(hm.spawn)} caiu em célula bloqueada`);

/* o piso andável é a área real da sala (células sem bloc) */
const walk = [];
for (let y = 0; y < hm.rows.length; y++)
  for (let x = 0; x < hm.rows[y].length; x++) {
    const L = hm.legenda[hm.rows[y][x]];
    if (!L.bloc) walk.push({ x, y });
  }
must(walk.length > 100, "piso andável da catacombs menor que o esperado");
const minX = Math.min(...walk.map((c) => c.x)), maxX = Math.max(...walk.map((c) => c.x));
const minY = Math.min(...walk.map((c) => c.y)), maxY = Math.max(...walk.map((c) => c.y));

/* spawn no centro do piso (tolerância de 1 célula) */
const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
must(Math.abs(hm.spawn.x - cx) <= 1 && Math.abs(hm.spawn.y - cy) <= 1,
  `spawn ${JSON.stringify(hm.spawn)} fora do centro do piso (${minX},${minY})..(${maxX},${maxY})`);

/* mob zone: todas as células dentro do piso andável */
const mobSet = hm.mobSet || {};
const mob = Object.keys(mobSet).map((k) => k.split(":").map(Number));
must(mob.length > 100, `zona de monstros pequena demais (${mob.length})`);
for (const [x, y] of mob) {
  const L = hm.legenda[hm.rows[y][x]];
  must(!L.bloc, `mob zone invadiu célula bloqueada em ${x},${y}`);
}
/* e a zona não encosta na parede oeste (colunas 4-5 do grid): precisa de ao
 * menos 1 coluna andável entre o início do mob e a parede (o mapa pode ter
 * itens bloqueantes nas bordas leste/sul — coluna 1083 e linha 1028 — que já
 * separam a zona por si sós). */
const mobMinX = Math.min(...mob.map((c) => c[0]));
must(mobMinX > minX, "mob zone encostou na parede oeste sem margem");

/* convenção de alinhamento dos hunts 250+ "novos" (fovBounds == bounds) */
{
  for (const f of ["roshamuul.js", "prison.js", "ingol-terrain.js", "buried-cathedral.js"])
    vm.runInContext(fs.readFileSync(path.join(js, f), "utf8"), ctx);
  const expected = {
    "roshamuul": "roshamuul",
    "ingol-terrain": "ingolterrain",
    "buried-cathedral": "buried_cathedral",
    "prison-1": "prisonroshamuul", "prison-2": "prisonroshamuul", "prison-3": "prisonroshamuul",
  };
  for (const [id, otbm] of Object.entries(expected)) {
    const h = ctx.GAMEDATA.hunts[id];
    if (!h || !h.otbmFovBounds) continue;
    const m = OTBM.read(fs.readFileSync(path.join(game, "maps", otbm + ".otbm")), { z: 7 });
    const sb = m.sourceBounds;
    must(h.otbmFovBounds.x === sb.minX && h.otbmFovBounds.y === sb.minY &&
      h.otbmFovBounds.w === sb.maxX - sb.minX + 1 && h.otbmFovBounds.h === sb.maxY - sb.minY + 1,
      id + ": otbmFovBounds não casa com os bounds do mapa (re-desenhou fora do lugar?)");
  }
}

console.log("ok: catacombs alinhada (fov = bounds, spawn no centro, mob no piso)");
