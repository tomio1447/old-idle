/* Regressão: room/FOV/spawns e mecânicas de Goshnar's Spite. */
"use strict";
const crypto=require("crypto"),fs=require("fs"),path=require("path"),vm=require("vm");
const game=path.join(__dirname,"..","game"),js=path.join(game,"js");
const OTBM=require(path.join(js,"otbm.js"));
function must(ok,msg){if(!ok)throw Error(msg);}
const ctx={window:{},console,Math,Date,Map,Set,document:undefined};ctx.window=ctx;vm.createContext(ctx);
for(const file of ["gamedata.js","monsterdata.js","mobsheetdata.js","monsters.js","soulwar.js","tileflags.js"])
  vm.runInContext(fs.readFileSync(path.join(js,file),"utf8"),ctx,{filename:file});

const room=fs.readFileSync(path.join(game,"maps","goshnars_spite_room.otbm"));
const beta=fs.readFileSync(path.join(game,"beta-maps","bossesroom","goshnars_spite_room.otbm"));
const canary=fs.readFileSync(path.join(game,"beta-maps","bossesroom","goshnar_spite_room.otbm"));
must(room.equals(beta)&&room.equals(canary)&&
  crypto.createHash("sha256").update(room).digest("hex")===
  "79604b83e269566d01a785141aa50e30e006d928101e105e1af99f2a79565077",
  "Spite não publica o OTBM Canary goshnar_spite_room");
const hunt=ctx.GAMEDATA.hunts["goshnars-spite-room"];
must(hunt&&hunt.otbm==="goshnars_spite_room"&&hunt.otbmFloor===7&&
  hunt.otbmRuntimeWidth===30&&hunt.otbmRuntimeHeight===30&&
  hunt.otbmFovWidth===22&&hunt.otbmFovHeight===13,
  "room técnica de Spite não usa OTBM/mundo 30×30 + FOV 22×13");
must(JSON.stringify(hunt.otbmFovBounds)===JSON.stringify({x:1040,y:1011,w:24,h:19,z:7})&&
  JSON.stringify(hunt.otbmSpawn)===JSON.stringify({x:1046,y:1020,z:7})&&
  JSON.stringify(hunt.otbmMobBounds)===JSON.stringify({x:1057,y:1020,w:1,h:1,z:7}),
  "FOV/player/boss spawn Map Editor de Spite divergentes");
let map=OTBM.read(room,{z:7});
must(map.w===24&&map.h===19&&
  map.sourceBounds.minX===1040&&map.sourceBounds.minY===1011&&
  map.sourceBounds.maxX===1063&&map.sourceBounds.maxY===1029,
  "bossroom Canary de Spite não manteve z=7 24×19 integral");
ctx.applyHuntOtbmZones=function(map,hunt){
  const bounds=map.sourceBounds||{};
  const ox=Number(bounds.x!==undefined?bounds.x:bounds.minX)||0;
  const oy=Number(bounds.y!==undefined?bounds.y:bounds.minY)||0;
  const sameFloor=(z)=>z===undefined||map.z===undefined||Number(z)===Number(map.z);
  const local=(point)=>point&&sameFloor(point.z)?{x:Number(point.x)-ox,y:Number(point.y)-oy}:null;
  const spawn=local(hunt.otbmSpawn);
  if(spawn&&spawn.x>=0&&spawn.y>=0&&spawn.x<map.w&&spawn.y<map.h) map.spawn=spawn;
  const zone=hunt.otbmMobBounds;
  if(zone&&sameFloor(zone.z)){
    const start=local(zone),w=Math.max(0,Math.floor(Number(zone.w)||0)),h=Math.max(0,Math.floor(Number(zone.h)||0));
    map.mob=[];
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      const px=start.x+x,py=start.y+y;
      if(px>=0&&py>=0&&px<map.w&&py<map.h) map.mob.push({x:px,y:py});
    }
  }
  return map;
};
ctx.applyHuntOtbmZones(map,hunt);
map.idleTargetWidth=30;map.idleTargetHeight=30;
const hm=OTBM.huntMapFromOtbm(map,ctx.TILEFLAGS);
// padX=floor((30-24)/2)=3, padY=floor((30-19)/2)=5
// player local (6,9) → runtime (9,14); boss local (17,9) → runtime (20,14)
must(hm.rows.length===30&&hm.rows.every(row=>row.length===30)&&
  hm.spawn.x===9&&hm.spawn.y===14&&hm.mob.length===1&&hm.mob[0].x===20&&hm.mob[0].y===14,
  "coordenadas runtime de player/boss Spite Map Editor incorretas");

ctx.huntMapBlocked=()=>false;
ctx.buildOccupancy=(combat)=>new Map((combat.mobs||[]).filter(m=>m.hp>0&&m.cx!==undefined).map(m=>[m.cx+":"+m.cy,m]));
ctx.cellToScreen=(x,y)=>({x:(x+.5)/30,y:(y+.5)/30});ctx.resolveSQMOccupancy=()=>{};
const bossDef=ctx.GAMEDATA.monsters["goshnar-s-spite"];
must(bossDef&&bossDef.hp===300000,"stats Canary de Spite ausentes");
for(const slug of ["dreadful-harvester","spiteful-spitter","weeping-soul"])
  must(ctx.GAMEDATA.monsters[slug],"trash Spite ausente: "+slug);
const boss={slug:"goshnar-s-spite",def:Object.assign({},bossDef),boss:true,hp:300000,maxHp:300000,
  id:"spite",cx:20,cy:14,x:.67,y:.48};
const player={id:"p",name:"Knight",hp:1000};
const combat={boss:{id:"goshnar-s-spite"},mobs:[boss],events:[],player:{id:"p",p:player,cx:9,cy:14},
  gridW:30,gridH:30,hunt:hunt,huntMap:{rows:Array(30).fill(".".repeat(30)),leg:{".":{v:[1]}}}};
ctx.spiteBossInit(combat,player,()=>0.1,1000);
must(combat.spite&&combat.spite.qtePhase==="idle"&&!combat.spite.qtePenalty&&
  ctx.spiteTrashMobs(combat).length===8,"Spite não encheu 8 trash no init");
must(ctx.spiteIncomingDamageMultiplier(combat,boss)===1,"penalidade QTE ativa sem falha");
ctx.spiteStartQte(combat,2000,()=>0.2);
must(combat.spite.qtePhase==="active"&&combat.spite.bubblesLeft===7,"QTE não iniciou com 7 bolhas");
for(let i=0;i<7;i++)ctx.spitePopBubble(combat,i,2100+i);
must(combat.spite.qtePhase==="idle"&&!combat.spite.qtePenalty,"sucesso QTE não limpou fase");
ctx.spiteStartQte(combat,50000,()=>0.3);
ctx.spiteResolveQte(combat,false,56000);
must(combat.spite.qtePenalty&&ctx.spiteIncomingDamageMultiplier(combat,boss)===0.75,
  "falha QTE não aplicou −25% dano no boss");
const trash=ctx.spiteTrashMobs(combat)[0];trash.hp=0;
ctx.spiteBossHandleKill(combat,trash,60000);
must(combat.spite.pendingRespawns.length===1&&
  combat.spite.pendingRespawns[0].at===75000,"respawn trash não agenda +15s");
ctx.spiteBossTick(combat,75000);
must(ctx.spiteTrashMobs(combat).length===8,"tick não respawna trash após 15s");

const playerTaint={soulWarTaints:{level:0,firstAt:0,bosses:{}}};
must(ctx.soulwarGrantBossTaint(playerTaint,"goshnar-s-spite")===1&&
  playerTaint.soulWarTaints.bosses["goshnar-s-spite"]===true,
  "kill de Spite não concede mácula Soul War");

const gameSrc=fs.readFileSync(path.join(js,"game.js"),"utf8");
const combatSrc=fs.readFileSync(path.join(js,"combat.js"),"utf8");
must(gameSrc.includes('"goshnar-s-spite":{hunt:"goshnars-spite-room",otbm:"goshnars_spite_room"}')&&
  gameSrc.includes('cooldown:0')&&gameSrc.includes("spiteBossCleanup"),
  "boss def/rota/cleanup Spite ausentes");
for(const marker of ["spiteBossInit(c, player)","spiteBossTick(c, now)",
  "spiteBossHandleKill(c, m, now)","spiteIncomingDamageMultiplier(c, target)"])
  must(combatSrc.includes(marker),"combat.js sem hook Spite: "+marker);
const html=fs.readFileSync(path.join(game,"index.html"),"utf8");
const css=fs.readFileSync(path.join(game,"css","layout.css"),"utf8");
must(html.includes('id="spite-qte"')&&html.includes('id="spite-minigame"')&&
  css.includes(".spite-qte")&&css.includes(".spite-bubble"),
  "UI QTE/minigame Spite ausente");
console.log("OK: Spite Map Editor spawns, FOV 22×13, trash 8/15s, QTE −25%, taint e CD off validados.");
