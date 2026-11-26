/* Regressão: mapa, missão, Distorted Phantom e Goshnar's Taints. */
"use strict";
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const game = path.join(__dirname, "..", "game");
const js = path.join(game, "js");
const OTBM = require(path.join(js, "otbm.js"));
function must(value, message) { if (!value) throw new Error(message); }
function pngSize(file) { const b=fs.readFileSync(file); return {w:b.readUInt32BE(16),h:b.readUInt32BE(20)}; }

const ctx = {window:{},console,Map,Date,Math,addEventListener(){}};
ctx.window=ctx;
vm.createContext(ctx);
for(const file of ["gamedata.js","monsterdata.js","monsters.js","soulwar.js",
  "tileflags.js","tilepatterndata.js"])
  vm.runInContext(fs.readFileSync(path.join(js,file),"utf8"),ctx,{filename:file});

// O mirrored_nightmare_sw.otbm antigo continua publicado — só não é mais
// o mapa da hunt (a Dark Thais migrou para dark_thais.otbm, coberto em
// test_dark_thais.js). O beta-map diverge do publicado desde a entrega
// (falha pré-existente): o guarda-chuva agora é o SHA do arquivo publicado.
const runtimeOld=fs.readFileSync(path.join(game,"maps","mirrored_nightmare_sw.otbm"));
must(crypto.createHash("sha256").update(runtimeOld).digest("hex")===
  "3a2dd6f60d7d5699617bb4cc29eccbab8d4ee0f582def30a99b700455274343b",
  "SHA de mirrored_nightmare_sw inesperado");
const hunt=ctx.GAMEDATA.hunts["dark-thais"];
must(hunt.otbm==="dark_thais"&&hunt.otbmFloor===7&&
  hunt.otbmRuntimeWidth===60&&hunt.otbmRuntimeHeight===55,
  "Dark Thais não usa o OTBM dark_thais z=7 em mundo 60×55");
must(JSON.stringify(hunt.otbmFovBounds)===JSON.stringify({x:1018,y:1023,w:32,h:31,z:7})&&
  hunt.otbmFovWidth===20&&hunt.otbmFovHeight===12&&
  JSON.stringify(hunt.otbmSpawn)===JSON.stringify({x:1029,y:1041,z:7})&&
  JSON.stringify(hunt.otbmMobBounds)===JSON.stringify({x:1018,y:1023,w:32,h:31,z:7})&&
  Array.isArray(hunt.otbmFixedSpawns)&&hunt.otbmFixedSpawns.length===11,
  "FOV, playerspawn, área customizada ou pontos fixos divergentes");
const runtime=fs.readFileSync(path.join(game,"maps","dark_thais.otbm"));
let map=OTBM.read(runtime,{z:7});
must(map.w===55&&map.h===49&&Object.keys(map.cells).length===2649&&
  map.sourceBounds.minX===1007&&map.sourceBounds.minY===1015&&
  map.sourceBounds.maxX===1061&&map.sourceBounds.maxY===1063,
  "piso z=7 de Dark Thais não foi preservado");
const loader=fs.readFileSync(path.join(js,"otbmhunt.js"),"utf8");
const zs=loader.indexOf("function applyHuntOtbmZones"),ze=loader.indexOf("\n\n/* Garante",zs);
vm.runInContext(loader.slice(zs,ze),ctx);
ctx.applyHuntOtbmZones(map,hunt);map.idleTargetWidth=60;map.idleTargetHeight=55;
map.idleFovWidth=hunt.otbmFovWidth;map.idleFovHeight=hunt.otbmFovHeight;
const hm=OTBM.huntMapFromOtbm(map,ctx.TILEFLAGS);
must(hm.rows.length===55&&hm.rows.every(row=>row.length===60)&&
  hm.spawn.x===24&&hm.spawn.y===29&&hm.fovWidth===20&&hm.fovHeight===12,
  "runtime/spawn/FOV Dark Thais incorreto");
must(hm.mob.length===992,"área de respawn deveria conter 32×31 posições");
must(hm.fixedMob&&hm.fixedMob.length===11,"faltam os 11 pontos fixos de respawn");
const free=hm.mob.filter(p=>{const e=hm.leg[hm.rows[p.y][p.x]];return e&&!e.bloc&&!hm.footprintBlocked[p.x+":"+p.y];});
must(free.length===470,`área customizada deveria ter 470 spawns livres, recebeu ${free.length}`);
const ids=new Set();Object.values(hm.leg).forEach(e=>{(e.v||[]).forEach(id=>ids.add(id));(e.g||[]).forEach(id=>ids.add(id));});
must(ids.size===152,`Dark Thais usa ${ids.size}, não 152 sprites`);
for(const id of ids){must(fs.existsSync(path.join(game,"assets","tiles",id+".png")),"sprite ausente: "+id);if(ctx.TILE_PATTERNS[id])must(fs.existsSync(path.join(game,"assets","tiles",id+"_pattern.png")),"pattern ausente: "+id);}

const expectedMonsters=["many-faces","knight-s-apparition","paladin-s-apparition",
 "sorcerer-s-apparition","druid-s-apparition","monk-s-apparition","distorted-phantom"];
must(JSON.stringify(hunt.monsters)===JSON.stringify(expectedMonsters),
  "Distorted Phantom não foi adicionado ao respawn de Mirrored Nightmare");
const distorted=ctx.GAMEDATA.monsters["distorted-phantom"];
must(distorted&&distorted.hp===26000&&distorted.exp===18870&&distorted.targetDistance===4&&
  fs.existsSync(path.join(game,"assets","mob","distorted-phantom.png")),
  "Distorted Phantom não preserva dados/sprite do Canary");

// Missão: 25 de cada um dos sete monstros e acesso ao boss como recompensa.
const gameSrc=fs.readFileSync(path.join(js,"game.js"),"utf8");
const ms=gameSrc.indexOf("const MISSION_DEFS = {");
const me=gameSrc.indexOf("function missionForHunt",ms);
vm.runInContext(gameSrc.slice(ms,me)+"\nwindow.__MISSIONS=MISSION_DEFS;",ctx);
const mission=ctx.__MISSIONS["dark-thais"];
must(mission.tasks.length===7&&mission.tasks.every(t=>t.target===25)&&
  mission.tasks.some(t=>t.monster==="distorted-phantom")&&
  mission.completeReward.bossAccess==="goshnar-s-malice",
  "missão Mirrored Nightmare não exige 25 de cada monstro/acesso ao boss");

// Ícones 22..26 extraídos do OTClient oficial têm 18×18.
const iconHashes=[
 "c1a0d5e109bd6c9fe43b44ce27f5f3f375cf94e0988dd3041817d39256c638e1",
 "9fd586171b915aada7731744873b8b7846eac0f112a119601df2fcf769087974",
 "42b5f8b2cd3efbd4f12ef5fc643ebc5a6b29529e12db6bc4bc4b93c387333184",
 "8a4c731a09b3635796f17b0822255dfb2334e2eeafc365074505be709ab75b25",
 "db342fb268e9a2e32a20bcc4abceb71cdcdd2dd776ba5d843c89b7bb22f2d03a",
];
for(let level=1;level<=5;level++){
 const file=path.join(game,"assets","ui","conditions",`cond-goshnar-taint-${level}.png`);
 const bytes=fs.readFileSync(file),size=pngSize(file);
 must(size.w===18&&size.h===18&&crypto.createHash("sha256").update(bytes).digest("hex")===iconHashes[level-1],
  "ícone OTC da mácula "+level+" inválido");
}

// Port das cinco penalidades e bônus de experiência do Canary.
ctx.buildOccupancy=()=>new Map();
ctx.placeFree=(ent,occ,x,y)=>{ent.cx=x+1;ent.cy=y;return true;};
ctx.cellToScreen=(x,y)=>({x:(x+.5)/30,y:(y+.5)/30});
const player={hp:1000,mp:500,soulWarTaints:{level:5,firstAt:Date.now(),bosses:{}}};
const combat={hunt:{soulWarZone:true,soulWarZoneMonster:"many-faces"},mobs:[],events:[],player:{x:.5,y:.5,cx:10,cy:10},gridW:30,gridH:30};
must(ctx.soulwarTaintLevel(player)===5&&ctx.soulwarTaintDamageMultiplier(combat,player)===1.15&&
  ctx.soulwarTaintExpMultiplier(combat,player)===1.246,
  "terceira mácula ou bônus de EXP por mácula incorreto");
ctx.soulwarTaintTick(combat,player,10000,10000,()=>1);
must(player.hp===900&&player.mp===450,"quinta mácula não removeu 10% de HP/mana em 10s");
const teleportMob={slug:"many-faces",def:ctx.GAMEDATA.monsters["many-faces"],hp:100,maxHp:100,cx:2,cy:2,x:.1,y:.1};
const teleportCombat={hunt:{soulWarZone:true},mobs:[teleportMob],events:[],player:{cx:10,cy:10,x:.5,y:.5},gridW:30,gridH:30};
const taintOne={hp:100,mp:100,soulWarTaints:{level:1,firstAt:Date.now(),bosses:{}}};
const rolls=[.05,0];ctx.soulwarTaintTick(teleportCombat,taintOne,2000,2000,()=>rolls.shift());
must(teleportMob.cx===11&&teleportMob.cy===10,"primeira mácula não teleportou criatura com chance de 10%");
const spawnCombat={hunt:{soulWarZone:true,soulWarZoneMonster:"many-faces"},mobs:[],events:[],player:{cx:10,cy:10,x:.5,y:.5},gridW:30,gridH:30};
const taintTwo={hp:100,mp:100,soulWarTaints:{level:2,firstAt:Date.now(),bosses:{}}};
must(ctx.soulwarTaintSpawnNearPlayer(spawnCombat,taintTwo,5000,()=>.001)&&
  spawnCombat.mobs.length===1&&spawnCombat.mobs[0].slug==="many-faces"&&
  spawnCombat.soulwarTaintSpawnCd===35000,
  "segunda mácula não criou criatura com chance 0,5%/cooldown 30s");
const phantom={slug:"distorted-phantom",def:distorted,hp:0,maxHp:26000,x:.4,y:.4};
must(ctx.soulwarTaintPreventMonsterDeath(combat,phantom,player,()=>.05)&&phantom.hp===26000,
  "quarta mácula não restaurou o monstro com chance de 10%");
player.soulWarTaints={level:0,firstAt:0,bosses:{}};
must(ctx.soulwarGrantBossTaint(player,"goshnar-s-greed")===1&&
  ctx.soulwarGrantBossTaint(player,"goshnar-s-greed")===1,
  "boss repetido concedeu mais de uma mácula");

must(loader.includes("mapa.idleFovWidth")&&loader.includes("mapa.idleFovHeight"),
  "loader não encaminha a FOV reduzida ao runtime");
const gridSrc=fs.readFileSync(path.join(js,"grid.js"),"utf8");
const renderSrc=fs.readFileSync(path.join(js,"render.js"),"utf8");
must(gridSrc.includes("fovCols, fovRows")&&renderSrc.includes("mapFov && mapFov.fovWidth"),
  "renderer não usa FOV específica por mapa");
const combatSrc=fs.readFileSync(path.join(js,"combat.js"),"utf8");
for(const hook of ["soulwarTaintTick(c, p, dt, now)","soulwarTaintSpawnNearPlayer(c, p, Date.now())",
 "soulwarTaintPreventMonsterDeath(c, m, p)","soulwarTaintExpMultiplier(c, p)",
 "soulwarGrantBossTaint(p, c.boss.id)"])
 must(combatSrc.includes(hook),"combat.js sem hook Canary: "+hook);
// Ícones das máculas: catálogo em icondata.js + renderização em ui.js.
const icons=fs.readFileSync(path.join(js,"icondata.js"),"utf8");
const uiSrc2=fs.readFileSync(path.join(js,"ui.js"),"utf8");
must(icons.includes("cond-goshnar-taint-")&&(uiSrc2.includes("taint.icon")||uiSrc2.includes("goshnar-taint-")),
  "HUD não renderiza ícone de mácula");
// Cache-busting: os arquivos Soul War precisam de ?v= (o valor muda a cada
// deploy — a convenção atual é deploy-DDMM-vN).
const html=fs.readFileSync(path.join(game,"index.html"),"utf8");
for(const script of ["icondata","otc-hud","combat","grid","soulwar","render","game"])
 must(html.includes(`js/${script}.js?v=`),script+" sem cache-busting no index");

console.log("OK: Mirrored Nightmare (dark_thais.otbm 55×49 → runtime 60×55), 7 monstros/tasks e cinco Goshnar's Taints do Canary.");
