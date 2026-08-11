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
  "79b5f6034d0aa644e33da255bd0aad46ea532f08457fdd297af06d87cf2be991",
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
must(JSON.stringify(hunt.otbmBounds) ===
  JSON.stringify({ x:1009, y:1012, w:19, h:15, z:7 }),
  "coordenadas do contorno verde de Marapur foram alteradas");
must(JSON.stringify(hunt.otbmSpawn) ===
  JSON.stringify({ x:1017, y:1019, z:7 }),
  "playerspawn global Marapur foi alterado");

let map = OTBM.read(runtime, { z: hunt.otbmFloor });
must(map.z === 7 && map.w === 23 && map.h === 21 &&
     map.sourceBounds.minX === 1008 && map.sourceBounds.minY === 1008 &&
     map.sourceBounds.maxX === 1030 && map.sourceBounds.maxY === 1028,
  "leitor não selecionou o andar z=7 completo");
map = OTBM.crop(map, hunt.otbmBounds);
must(map.w === 19 && map.h === 15 && Object.keys(map.cells).length === 285,
  "recorte do contorno verde Marapur não ficou 19×15");

const otbmhunt = fs.readFileSync(path.join(js, "otbmhunt.js"), "utf8");
const start = otbmhunt.indexOf("function applyHuntOtbmZones");
const end = otbmhunt.indexOf("\n\n/* Garante", start);
vm.runInContext(otbmhunt.slice(start, end), context);
context.applyHuntOtbmZones(map, hunt);
must(map.spawn.x === 8 && map.spawn.y === 7 && map.mob.length === 285,
  "spawn local ou zona de mobs do contorno verde incorretos");

const hm = OTBM.huntMapFromOtbm(map, context.TILEFLAGS);
must(hm.rows.length === 15 && hm.rows.every((row) => row.length === 24),
  "runtime Marapur não ficou 24×15");
// O mapa 19×15 recebe 2 SQMs de padding à esquerda no runtime 24×15.
must(hm.spawn.x === 10 && hm.spawn.y === 7,
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
must(freeMobCells.length >= 200,
  `sala Marapur possui poucas posições livres: ${freeMobCells.length}`);

const visualIds = new Set();
Object.values(hm.leg).forEach((entry) => {
  (entry.v || []).forEach((id) => visualIds.add(id));
  (entry.g || []).forEach((id) => visualIds.add(id));
});
must(visualIds.size === 64, `contorno verde usa ${visualIds.size}, não 64 sprites`);
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
must(html.includes("js/otbm.js?v=cobra-loading-v10") &&
     html.includes("js/otbmhunt.js?v=cobra-loading-v10") &&
     html.includes("js/hard-hunts.js?v=cobra-loading-v10"),
  "scripts do novo mapa Marapur estão sem cache-busting v9");

console.log("OK: nagas_marapur z=7, contorno verde 1009,1012..1027,1026 e spawn 1017,1019 validados.");
