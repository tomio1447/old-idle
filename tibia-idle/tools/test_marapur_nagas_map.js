/* Regressão do mapa nagas_marapur publicado a partir do RME. */
"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const game = path.join(__dirname, "..", "game");
const js = path.join(game, "js");
const betaPath = path.join(game, "beta-maps", "nagas_marapur.otbm");
const runtimePath = path.join(game, "maps", "nagas_marapur.otbm");
const OTBM = require(path.join(js, "otbm.js"));
function must(value, message) { if (!value) throw new Error(message); }

const beta = fs.readFileSync(betaPath);
const runtime = fs.readFileSync(runtimePath);
must(beta.equals(runtime), "nagas_marapur publicado difere de beta-maps");
must(crypto.createHash("sha256").update(runtime).digest("hex") ===
  "0302d541bad667026840855f3beda4283de8c0235562306663cd078cfba4719f",
  "SHA do OTBM nagas_marapur inesperado");

const context = { window: {}, console };
context.window = context;
vm.createContext(context);
for (const file of ["gamedata.js", "monsterdata.js", "monsters.js",
  "hard-hunts.js", "tileflags.js", "tilepatterndata.js"])
  vm.runInContext(fs.readFileSync(path.join(js, file), "utf8"), context,
    { filename: file });

const hunt = context.GAMEDATA.hunts["marapur-nagas"];
must(hunt.otbm === "nagas_marapur" && hunt.otbmFloor === 7,
  "hunt Marapur não seleciona nagas_marapur no piso z=7");
must(!hunt.otbmBounds && JSON.stringify(hunt.otbmFovBounds) ===
  JSON.stringify({ x:1009, y:1012, w:19, h:15, z:7 }) &&
  hunt.otbmRuntimeWidth === 30 && hunt.otbmRuntimeHeight === 30,
  "FOV Marapur foi usada como recorte ou o mundo deixou de ser 30×30");
must(JSON.stringify(hunt.otbmSpawn) ===
  JSON.stringify({ x:1017, y:1019, z:7 }),
  "playerspawn global Marapur foi alterado");

let map = OTBM.read(runtime, { z: hunt.otbmFloor });
must(map.z === 7 && map.w === 23 && map.h === 21 &&
     Object.keys(map.cells).length === 433 &&
     map.sourceBounds.minX === 1008 && map.sourceBounds.minY === 1008 &&
     map.sourceBounds.maxX === 1030 && map.sourceBounds.maxY === 1028,
  "leitor não preservou o andar z=7 completo");

const otbmhunt = fs.readFileSync(path.join(js, "otbmhunt.js"), "utf8");
const start = otbmhunt.indexOf("function applyHuntOtbmZones");
const end = otbmhunt.indexOf("\n\n/* Garante", start);
vm.runInContext(otbmhunt.slice(start, end), context);
context.applyHuntOtbmZones(map, hunt);
must(map.spawn.x === 9 && map.spawn.y === 11 && map.mob.length === 483,
  "spawn local ou zona integral de mobs Marapur incorretos");
map.idleTargetWidth = hunt.otbmRuntimeWidth;
map.idleTargetHeight = hunt.otbmRuntimeHeight;

const hm = OTBM.huntMapFromOtbm(map, context.TILEFLAGS);
must(hm.rows.length === 30 && hm.rows.every((row) => row.length === 30),
  "mundo Marapur não ficou 30×30");
must(hm.spawn.x === 12 && hm.spawn.y === 15,
  "playerspawn runtime não corresponde ao global 1017,1019,7");
const spawnEntry = hm.leg[hm.rows[hm.spawn.y][hm.spawn.x]];
must(spawnEntry && !spawnEntry.bloc &&
     !hm.footprintBlocked[hm.spawn.x + ":" + hm.spawn.y],
  "playerspawn Marapur está bloqueado");

const freeMobCells = hm.mob.filter((point) => {
  const entry = hm.leg[hm.rows[point.y][point.x]];
  return entry && !entry.bloc &&
    !hm.footprintBlocked[point.x + ":" + point.y];
});
must(freeMobCells.length >= 180,
  `mundo Marapur possui poucas posições livres: ${freeMobCells.length}`);

const visualIds = new Set();
Object.values(hm.leg).forEach((entry) => {
  (entry.v || []).forEach((id) => visualIds.add(id));
  (entry.g || []).forEach((id) => visualIds.add(id));
});
must(visualIds.size === 107, `mundo integral usa ${visualIds.size}, não 107 sprites`);
for (const id of visualIds) {
  must(fs.existsSync(path.join(game, "assets", "tiles", id + ".png")),
    "sprite Marapur ausente: " + id);
  if (context.TILE_PATTERNS[id])
    must(fs.existsSync(path.join(game, "assets", "tiles", id + "_pattern.png")),
      "pattern Marapur ausente: " + id);
}

must(otbmhunt.includes("OTBM.read(buf, { z: hunt.otbmFloor })"),
  "loader não encaminha otbmFloor ao parser");
const html = fs.readFileSync(path.join(game, "index.html"), "utf8");
must(html.includes("js/otbm.js?v=cobra-loading-v14") &&
     html.includes("js/otbmhunt.js?v=cobra-loading-v14") &&
     html.includes("js/hard-hunts.js?v=cobra-loading-v14"),
  "scripts do novo mapa Marapur estão sem cache-busting v11");

console.log("OK: nagas_marapur integral em mundo 30×30; FOV não recorta o mapa.");
