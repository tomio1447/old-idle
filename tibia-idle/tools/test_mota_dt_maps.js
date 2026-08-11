/* Regressão dos mundos 30×30 de MOTA Extension e DT Seal. */
"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const game = path.join(__dirname, "..", "game");
const js = path.join(game, "js");
const OTBM = require(path.join(js, "otbm.js"));
function must(value, message) { if (!value) throw new Error(message); }

const context = { window:{}, console };
context.window = context;
vm.createContext(context);
for (const file of ["gamedata.js", "monsterdata.js", "monsters.js",
  "hard-hunts.js", "tileflags.js", "tilepatterndata.js"])
  vm.runInContext(fs.readFileSync(path.join(js, file), "utf8"), context,
    { filename:file });
const loader = fs.readFileSync(path.join(js, "otbmhunt.js"), "utf8");
const zoneStart = loader.indexOf("function applyHuntOtbmZones");
const zoneEnd = loader.indexOf("\n\n/* Garante", zoneStart);
vm.runInContext(loader.slice(zoneStart, zoneEnd), context);

const specs = {
  "mota-extension": {
    file:"MOTA", sha:"514cec47f4fc5f3d2b2e71be5bc68690be9b819b573879bcddd1c53812d475ab",
    source:{minX:1040,minY:1006,maxX:1064,maxY:1025,w:25,h:20,cells:446},
    fov:{x:1042,y:1009,w:21,h:16,z:7}, spawnGlobal:{x:1051,y:1016,z:7},
    spawnLocal:{x:11,y:10}, spawnRuntime:{x:13,y:15}, mobs:500,
    minFree:200, sprites:59,
  },
  "dt-seal": {
    file:"dt_seal", sha:"33d47677b3e1a34f0e092d8a0b1695f31fff4c06c9c1d93b1cc5378c9ffcde2f",
    source:{minX:1006,minY:1008,maxX:1030,maxY:1028,w:25,h:21,cells:471},
    fov:{x:1009,y:1010,w:19,h:15,z:7}, spawnGlobal:{x:1018,y:1018,z:7},
    spawnLocal:{x:12,y:10}, spawnRuntime:{x:14,y:14}, mobs:525,
    minFree:190, sprites:54,
  },
};

for (const [huntId, spec] of Object.entries(specs)) {
  const hunt = context.GAMEDATA.hunts[huntId];
  must(hunt && hunt.otbm === spec.file && hunt.otbmFloor === 7,
    `${huntId}: hunt não aponta para ${spec.file} z=7`);
  must(!hunt.otbmBounds && JSON.stringify(hunt.otbmFovBounds) === JSON.stringify(spec.fov),
    `${huntId}: FOV virou recorte do mapa`);
  must(hunt.otbmRuntimeWidth === 30 && hunt.otbmRuntimeHeight === 30,
    `${huntId}: mundo não está configurado como 30×30`);
  must(JSON.stringify(hunt.otbmSpawn) === JSON.stringify(spec.spawnGlobal),
    `${huntId}: playerspawn global divergente`);

  const beta = fs.readFileSync(path.join(game, "beta-maps", spec.file + ".otbm"));
  const runtime = fs.readFileSync(path.join(game, "maps", spec.file + ".otbm"));
  must(beta.equals(runtime), `${huntId}: mapa publicado difere do beta`);
  must(crypto.createHash("sha256").update(runtime).digest("hex") === spec.sha,
    `${huntId}: SHA do OTBM divergente`);

  const map = OTBM.read(runtime, {z:7});
  must(map.w === spec.source.w && map.h === spec.source.h &&
       Object.keys(map.cells).length === spec.source.cells &&
       map.sourceBounds.minX === spec.source.minX && map.sourceBounds.minY === spec.source.minY &&
       map.sourceBounds.maxX === spec.source.maxX && map.sourceBounds.maxY === spec.source.maxY,
    `${huntId}: piso z=7 não foi preservado integralmente`);
  context.applyHuntOtbmZones(map, hunt);
  must(map.spawn.x === spec.spawnLocal.x && map.spawn.y === spec.spawnLocal.y &&
       map.mob.length === spec.mobs,
    `${huntId}: spawn local ou zona integral incorretos`);
  map.idleTargetWidth = hunt.otbmRuntimeWidth;
  map.idleTargetHeight = hunt.otbmRuntimeHeight;
  const hm = OTBM.huntMapFromOtbm(map, context.TILEFLAGS);
  must(hm.rows.length === 30 && hm.rows.every((row) => row.length === 30),
    `${huntId}: runtime não ficou 30×30`);
  must(hm.spawn.x === spec.spawnRuntime.x && hm.spawn.y === spec.spawnRuntime.y,
    `${huntId}: spawn runtime incorreto`);
  const spawnEntry = hm.leg[hm.rows[hm.spawn.y][hm.spawn.x]];
  must(spawnEntry && !spawnEntry.bloc &&
       !hm.footprintBlocked[hm.spawn.x + ":" + hm.spawn.y],
    `${huntId}: player nasce bloqueado`);

  const free = hm.mob.filter((point) => {
    const entry = hm.leg[hm.rows[point.y][point.x]];
    return entry && !entry.bloc && !hm.footprintBlocked[point.x + ":" + point.y];
  });
  must(free.length >= spec.minFree, `${huntId}: somente ${free.length} spawns livres`);
  const visualIds = new Set();
  Object.values(hm.leg).forEach((entry) => {
    (entry.v || []).forEach((id) => visualIds.add(id));
    (entry.g || []).forEach((id) => visualIds.add(id));
  });
  must(visualIds.size === spec.sprites,
    `${huntId}: ${visualIds.size} sprites, esperado ${spec.sprites}`);
  for (const id of visualIds) {
    must(fs.existsSync(path.join(game, "assets", "tiles", id + ".png")),
      `${huntId}: sprite ausente ${id}`);
    if (context.TILE_PATTERNS[id])
      must(fs.existsSync(path.join(game, "assets", "tiles", id + "_pattern.png")),
        `${huntId}: pattern ausente ${id}`);
  }
}

must(JSON.stringify(context.GAMEDATA.hunts["mota-extension"].monsters) ===
  JSON.stringify(["floating-savant", "retching-horror", "fury", "hellhound", "demon"]),
  "MOTA Extension não usa as criaturas oficiais da área");
must(loader.includes("mapa.idleTargetWidth = Number(hunt.otbmRuntimeWidth) || 0") &&
     loader.includes("mapa.idleTargetHeight = Number(hunt.otbmRuntimeHeight) || 0"),
  "loader não encaminha o tamanho 30×30 ao conversor");
const html = fs.readFileSync(path.join(game, "index.html"), "utf8");
must(html.includes("js/otbm.js?v=cobra-loading-v12") &&
     html.includes("js/otbmhunt.js?v=cobra-loading-v12") &&
     html.includes("js/hard-hunts.js?v=cobra-loading-v12"),
  "scripts dos mundos 30×30 estão sem cache-busting v11");

console.log("OK: MOTA Extension e DT Seal preservam mapas integrais 30×30; FOV não recorta o mundo.");
