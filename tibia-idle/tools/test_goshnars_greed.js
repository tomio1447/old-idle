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
// Danos, defesas e quantidade de magias importados das cinco sources Canary.
const expectedCombat = {
  "goshnar-s-greed": {hp:300000,damage:5000,armor:160,defense:160,skills:[["death",1500,2000],["fire",1200,2200],["physical",1300,1700]],defSkills:2},
  "dreadful-harvester": {hp:25500,damage:320,armor:35,defense:35,skills:[["physical",0,165],["death",350,720],["physical",0,300],["death",225,275]],defSkills:2},
  "soulsnatcher": {hp:10000,damage:1500,armor:90,defense:80,skills:[["physical",1000,1500],["physical",1000,1500],["physical",500,1000]],defSkills:0},
  "greedbeast": {hp:10000,damage:500,armor:80,defense:70,skills:[["earth",50,90],["lifedrain",25,47],["physical",200,400],["physical",200,400],["physical",0,0]],defSkills:1},
  "powerful-soul": {hp:30000,damage:3000,armor:90,defense:80,skills:[["lifedrain",2000,3000]],defSkills:0},
};
for (const [slug, expected] of Object.entries(expectedCombat)) {
  const mob=ctx.GAMEDATA.monsters[slug];
  must(mob.hp===expected.hp&&mob.damage===expected.damage&&mob.armor===expected.armor&&mob.defense===expected.defense,
    slug+": stats do Canary divergentes");
  must(JSON.stringify((mob.skills||[]).map(s=>[s.el,s.min,s.max]))===JSON.stringify(expected.skills)&&
       (mob.defSkills||[]).length===expected.defSkills,
    slug+": danos/magias do Canary divergentes");
}

// --- mini game: seis adds, 30% Greedbeast e janela exata de 40 segundos
ctx.huntMapBlocked = () => false;
ctx.buildOccupancy = () => new Map();
ctx.cellToScreen = (x, y) => ({x:(x+.5)/30,y:(y+.5)/30});
ctx.resolveSQMOccupancy = () => {};
const bossDef = ctx.GAMEDATA.monsters["goshnar-s-greed"];
const bossMob = {slug:"goshnar-s-greed",def:bossDef,boss:true,greedImmune:true,hp:300000,maxHp:300000,
  id:"boss-greed",cx:14,cy:9,x:.48,y:.32};
const combat = {boss:{id:"goshnar-s-greed"},mobs:[bossMob],events:[],gridW:30,gridH:30,
  huntMap:{rows:Array(30).fill(".".repeat(30)),leg:{".":{v:[1]}}},player:{cx:14,cy:20}};
ctx.greedBossInit(combat, {}, () => 0.1);
must(combat.greed && combat.greed.immune && ctx.greedBossAdds(combat).length === 6,
  "luta não começou imune com seis adds");
must(ctx.greedBossAdds(combat).every((add) => add.def.armor === 0 &&
  add.def.defense === 0 && add.def.mitigation === 0 &&
  !Object.keys(add.def.resist).length && !add.def.imune.length && add.def.skills.length),
  "adds nasceram com defesa/imunidade ou perderam as magias do Canary");
must(ctx.greedRandomAddSlug(() => .299999) === "greedbeast" &&
  ctx.greedRandomAddSlug(() => .30) !== "greedbeast",
  "chance de nascimento da Greedbeast não é exatamente 30%");
must(combat.mobs[combat.mobs.length-1].boss,
  "boss imune ficou antes dos adds e impediu o auto-combate");
must(!ctx.greedBossCanTakePlayerDamage(combat, bossMob) &&
     ctx.greedBossOutgoingDamageMultiplier(combat, bossMob) === 0.7,
  "imunidade ou redução de 30% do dano causado pelo boss incorreta");
const openedAt = 123456;
for (let i=0;i<5;i++) {
  ctx.greedBossHandleKill(combat, {slug:"greedbeast"}, openedAt);
}
must(!combat.greed.immune && combat.greed.vulnerableUntil === openedAt + 40000 &&
     ctx.greedBossCanTakePlayerDamage(combat, bossMob) &&
     ctx.greedBossOutgoingDamageMultiplier(combat, bossMob) === 1,
  "quinta Greedbeast não abriu janela exata de 40s");
must(combat.mobs[0].boss, "boss vulnerável não recebeu prioridade de ataque");
ctx.greedBossTick(combat, openedAt + 40000);
must(combat.greed.immune && bossMob.greedImmune &&
     ctx.greedBossOutgoingDamageMultiplier(combat, bossMob) === 0.7,
  "boss não voltou à imunidade ao final dos 40s");

// --- missão Mirrored Nightmare recompensa e requisito obrigatório
const gameSrc = fs.readFileSync(path.join(js, "game.js"), "utf8");
const missionStart = gameSrc.indexOf("const MISSION_DEFS = {");
const missionEnd = gameSrc.indexOf("\n\nfunction missionForHunt", missionStart);
vm.runInContext(gameSrc.slice(missionStart, missionEnd) +
  "\nwindow.__MISSION_DEFS=MISSION_DEFS;", ctx);
const mission = ctx.__MISSION_DEFS["dark-thais"];
must(mission && mission.tasks.length === 7 &&
     mission.tasks.some((task) => task.monster === "distorted-phantom") &&
     mission.completeReward.bossAccess === "goshnar-s-greed",
  "Mirrored Nightmare não recompensa acesso ao boss");
const bossStart = gameSrc.indexOf("const BOSS_DEFS = {");
const bossEnd = gameSrc.indexOf("\n\n/* Quivers", bossStart);
ctx.BOSS_COOLDOWN = 0;
vm.runInContext(gameSrc.slice(bossStart, bossEnd) + "\nwindow.__BOSS_DEFS=BOSS_DEFS;", ctx);
const boss = ctx.__BOSS_DEFS["goshnar-s-greed"];
must(boss.hunt === "goshnars-greed-room" && boss.requirement.enforced === false &&
     boss.requirement.mission === "dark-thais" && boss.requirement.access === "goshnar-s-greed" &&
     boss.cooldown === 0,
  "Goshnar não ficou livre de requisito/cooldown durante os testes");
must(boss.hp === 300000 && boss.exp === 150000 && boss.damage === 5000 &&
     boss.armor === 160 && boss.defense === 160,
  "stats de Goshnar divergem do Canary");

const combatSrc = fs.readFileSync(path.join(js, "combat.js"), "utf8");
const scarlettSrc = fs.readFileSync(path.join(js, "scarlett-boss.js"), "utf8");
const renderSrc = fs.readFileSync(path.join(js, "render.js"), "utf8");
for (const marker of ["greedBossInit(c, player)", "greedBossTick(c, now)",
  "greedBossHandleKill(c, m, now)", "greedBossAfterDeaths(c)",
  "greedBossOutgoingDamageMultiplier(c, mob)"])
  must(combatSrc.includes(marker), "combat.js sem hook: " + marker);
must(scarlettSrc.includes("greedBossCanTakePlayerDamage(c, target)"),
  "gate global não protege a imunidade de Goshnar");
must(!renderSrc.includes("Greedbeasts ${combat.greed.greedbeastKills}/5"),
  "contagem de Greedbeasts ainda aparece na bossbar");
const html = fs.readFileSync(path.join(game, "index.html"), "utf8");
const css = fs.readFileSync(path.join(game, "css", "layout.css"), "utf8");
must(html.includes('id="greed-minigame"') && css.includes('.greed-minigame') &&
     fs.readFileSync(path.join(js,"soulwar.js"),"utf8").includes('GREEDBEASTS <b>${c.greed.greedbeastKills}'),
  "modal separado com contagem de Greedbeasts não foi criado");
must(html.includes("js/combat.js?v=boss-priority-v1"), "combat sem cache-busting Greed v2");
must(html.includes("js/render.js?v=interface-sharp-v1"), "render sem cache-busting visual");
must(html.includes("js/soulwar.js?v=mirrored-nightmare-v1"), "soulwar sem cache-busting Mirrored Nightmare");
must(html.includes("js/scarlett-boss.js?v=goshnar-greed-v1"),
  "gate compartilhado sem cache-busting");
must(html.includes("css/layout.css?v=interface-sharp-v1"),
  "CSS do modal Greedbeast sem cache-busting");

console.log("OK: Goshnar's Greed — testes livres, adds sem defesa, Greedbeast 30% e vulnerabilidade de 40s.");
