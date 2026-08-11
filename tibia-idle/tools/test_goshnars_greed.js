/* Regressão: bossroom e mini game de Goshnar's Greed. */
"use strict";
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const game = path.join(__dirname, "..", "game");
const js = path.join(game, "js");
const OTBM = require(path.join(js, "otbm.js"));
function must(value, message) { if (!value) throw new Error(message); }

const ctx = { window:{}, console, Map, Date, Math, addEventListener(){} };
ctx.window = ctx;
vm.createContext(ctx);
for (const file of ["gamedata.js", "monsterdata.js", "monsters.js", "soulwar.js",
  "tileflags.js", "tilepatterndata.js"])
  vm.runInContext(fs.readFileSync(path.join(js, file), "utf8"), ctx, {filename:file});

// --- mapa integral z=7 em runtime 30×30
const beta = fs.readFileSync(path.join(game, "beta-maps", "bossesroom", "goshnarsgreed.otbm"));
const runtime = fs.readFileSync(path.join(game, "maps", "goshnarsgreed.otbm"));
must(beta.equals(runtime), "bossroom publicada difere do beta-map");
must(crypto.createHash("sha256").update(runtime).digest("hex") ===
  "6388155756b9d3c98b20be2489ad085d1f11229d9bd3cdb6fc59b3d4a6d7e6c7",
  "SHA da bossroom Goshnar inesperado");
const hunt = ctx.GAMEDATA.hunts["goshnars-greed-room"];
must(hunt && hunt.otbm === "goshnarsgreed" && hunt.otbmFloor === 7 &&
     hunt.otbmRuntimeWidth === 30 && hunt.otbmRuntimeHeight === 30,
  "hunt técnica de Goshnar não usa mundo 30×30 z=7");
must(JSON.stringify(hunt.otbmSpawn) === JSON.stringify({x:1052,y:1022,z:7}) &&
     JSON.stringify(hunt.otbmMobBounds) === JSON.stringify({x:1052,y:1011,w:1,h:1,z:7}),
  "spawns globais da bossroom divergentes");
let map = OTBM.read(runtime, {z:7});
must(map.w === 21 && map.h === 18 && Object.keys(map.cells).length === 361 &&
     map.sourceBounds.minX === 1042 && map.sourceBounds.minY === 1008 &&
     map.sourceBounds.maxX === 1062 && map.sourceBounds.maxY === 1025,
  "piso z=7 da bossroom não foi preservado integralmente");
const loader = fs.readFileSync(path.join(js, "otbmhunt.js"), "utf8");
const zoneStart = loader.indexOf("function applyHuntOtbmZones");
const zoneEnd = loader.indexOf("\n\n/* Garante", zoneStart);
vm.runInContext(loader.slice(zoneStart, zoneEnd), ctx);
ctx.applyHuntOtbmZones(map, hunt);
map.idleTargetWidth = hunt.otbmRuntimeWidth;
map.idleTargetHeight = hunt.otbmRuntimeHeight;
const hm = OTBM.huntMapFromOtbm(map, ctx.TILEFLAGS);
must(hm.rows.length === 30 && hm.rows.every((row) => row.length === 30),
  "bossroom Goshnar não ficou 30×30");
must(hm.spawn.x === 14 && hm.spawn.y === 20 && hm.mob[0].x === 14 && hm.mob[0].y === 9,
  "player ou boss spawn runtime incorreto");
const visualIds = new Set();
Object.values(hm.leg).forEach((entry) => {
  (entry.v || []).forEach((id) => visualIds.add(id));
  (entry.g || []).forEach((id) => visualIds.add(id));
});
must(visualIds.size === 57, `bossroom usa ${visualIds.size}, não 57 sprites`);
for (const id of visualIds) {
  must(fs.existsSync(path.join(game, "assets", "tiles", id + ".png")),
    "sprite da bossroom ausente: " + id);
  if (ctx.TILE_PATTERNS[id])
    must(fs.existsSync(path.join(game, "assets", "tiles", id + "_pattern.png")),
      "pattern da bossroom ausente: " + id);
}
for (const slug of ["goshnar-s-greed", "dreadful-harvester", "soulsnatcher",
  "greedbeast", "powerful-soul"])
  must(ctx.GAMEDATA.monsters[slug] && fs.existsSync(path.join(game, "assets", "mob", slug + ".png")),
    "criatura/sprite ausente: " + slug);

// --- mini game: seis adds, quinta Greedbeast abre exatamente 20 segundos
ctx.huntMapBlocked = () => false;
ctx.buildOccupancy = () => new Map();
ctx.cellToScreen = (x, y) => ({x:(x+.5)/30,y:(y+.5)/30});
ctx.resolveSQMOccupancy = () => {};
const bossDef = ctx.GAMEDATA.monsters["goshnar-s-greed"];
const bossMob = {slug:"goshnar-s-greed",def:bossDef,boss:true,hp:550000,maxHp:550000,
  id:"boss-greed",cx:14,cy:9,x:.48,y:.32};
const combat = {boss:{id:"goshnar-s-greed"},mobs:[bossMob],events:[],gridW:30,gridH:30,
  huntMap:{rows:Array(30).fill(".".repeat(30)),leg:{".":{v:[1]}}},player:{cx:14,cy:20}};
ctx.greedBossInit(combat, {}, () => 0.1);
must(combat.greed && combat.greed.immune && ctx.greedBossAdds(combat).length === 6,
  "luta não começou imune com seis adds");
must(combat.mobs[combat.mobs.length-1].boss,
  "boss imune ficou antes dos adds e impediu o auto-combate");
must(!ctx.greedBossCanTakePlayerDamage(combat, bossMob) &&
     ctx.greedBossOutgoingDamageMultiplier(combat, bossMob) === 0.7,
  "imunidade ou redução de 30% do dano causado pelo boss incorreta");
const openedAt = 123456;
for (let i=0;i<5;i++) {
  ctx.greedBossHandleKill(combat, {slug:"greedbeast"}, openedAt);
}
must(!combat.greed.immune && combat.greed.vulnerableUntil === openedAt + 20000 &&
     ctx.greedBossCanTakePlayerDamage(combat, bossMob) &&
     ctx.greedBossOutgoingDamageMultiplier(combat, bossMob) === 1,
  "quinta Greedbeast não abriu janela exata de 20s");
must(combat.mobs[0].boss, "boss vulnerável não recebeu prioridade de ataque");
ctx.greedBossTick(combat, openedAt + 20000);
must(combat.greed.immune && bossMob.greedImmune &&
     ctx.greedBossOutgoingDamageMultiplier(combat, bossMob) === 0.7,
  "boss não voltou à imunidade ao final dos 20s");

// --- missão Mirrored Nightmare recompensa e requisito obrigatório
const gameSrc = fs.readFileSync(path.join(js, "game.js"), "utf8");
const missionStart = gameSrc.indexOf("const MISSION_DEFS = {");
const missionEnd = gameSrc.indexOf("\n\nfunction missionForHunt", missionStart);
vm.runInContext(gameSrc.slice(missionStart, missionEnd) +
  "\nwindow.__MISSION_DEFS=MISSION_DEFS;", ctx);
const mission = ctx.__MISSION_DEFS["dark-thais"];
must(mission && mission.tasks.length === 6 &&
     mission.completeReward.bossAccess === "goshnar-s-greed",
  "Mirrored Nightmare não recompensa acesso ao boss");
const bossStart = gameSrc.indexOf("const BOSS_DEFS = {");
const bossEnd = gameSrc.indexOf("\n\n/* Quivers", bossStart);
ctx.BOSS_COOLDOWN = 0;
vm.runInContext(gameSrc.slice(bossStart, bossEnd) + "\nwindow.__BOSS_DEFS=BOSS_DEFS;", ctx);
const boss = ctx.__BOSS_DEFS["goshnar-s-greed"];
must(boss.hunt === "goshnars-greed-room" && boss.requirement.enforced &&
     boss.requirement.mission === "dark-thais" && boss.requirement.access === "goshnar-s-greed",
  "Goshnar não exige acesso da Mirrored Nightmare");
must(gameSrc.includes("p.bossAccess[reward.bossAccess] = true") &&
     gameSrc.includes("BOSS_REQUIREMENTS_ENABLED || boss.requirement.enforced"),
  "recompensa/requisito obrigatório não foi implementado");

const combatSrc = fs.readFileSync(path.join(js, "combat.js"), "utf8");
const scarlettSrc = fs.readFileSync(path.join(js, "scarlett-boss.js"), "utf8");
const renderSrc = fs.readFileSync(path.join(js, "render.js"), "utf8");
for (const marker of ["greedBossInit(c, player)", "greedBossTick(c, now)",
  "greedBossHandleKill(c, m, now)", "greedBossAfterDeaths(c)",
  "greedBossOutgoingDamageMultiplier(c, mob)"])
  must(combatSrc.includes(marker), "combat.js sem hook: " + marker);
must(scarlettSrc.includes("greedBossCanTakePlayerDamage(c, target)"),
  "gate global não protege a imunidade de Goshnar");
must(renderSrc.includes("Greedbeasts ${combat.greed.greedbeastKills}/5") &&
     renderSrc.includes("VULNERÁVEL"),
  "bossbar não informa o progresso do mini game");
const html = fs.readFileSync(path.join(game, "index.html"), "utf8");
for (const script of ["combat", "render", "soulwar", "scarlett-boss"])
  must(html.includes(`js/${script}.js?v=goshnar-greed-v1`),
    script + ".js sem cache-busting da mecânica");

console.log("OK: Goshnar's Greed — acesso Mirrored Nightmare, 6 adds, 5 Greedbeasts e vulnerabilidade de 20s.");
