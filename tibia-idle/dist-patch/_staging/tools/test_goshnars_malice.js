/* Regressão: room/FOV/spawns e mecânicas de Goshnar's Malice. */
"use strict";
const crypto=require("crypto"),fs=require("fs"),path=require("path"),vm=require("vm");
const game=path.join(__dirname,"..","game"),js=path.join(game,"js");
const OTBM=require(path.join(js,"otbm.js"));
function must(ok,msg){if(!ok)throw Error(msg);}
const ctx={window:{},console,Math,Date,Map,Set,document:undefined};ctx.window=ctx;vm.createContext(ctx);
for(const file of ["gamedata.js","monsterdata.js","mobsheetdata.js","monsters.js","soulwar.js","tileflags.js"])
  vm.runInContext(fs.readFileSync(path.join(js,file),"utf8"),ctx,{filename:file});

const room=fs.readFileSync(path.join(game,"maps","goshars_malice_room.otbm"));
const beta=fs.readFileSync(path.join(game,"beta-maps","bossesroom","goshars_malice_room.otbm"));
const canary=fs.readFileSync(path.join(game,"beta-maps","bossesroom","goshnar_malice_room.otbm"));
must(room.equals(beta)&&room.equals(canary)&&
  crypto.createHash("sha256").update(room).digest("hex")===
  "a4a8c5ed5f045b6cb4d89d33d5e5ca6e2eb161d3b7dea750ee47ab3d095991e1",
  "Malice não publica o OTBM goshars_malice_room");
const hunt=ctx.GAMEDATA.hunts["goshnars-malice-room"];
must(hunt&&hunt.otbm==="goshars_malice_room"&&hunt.otbmFloor===7&&
  hunt.otbmRuntimeWidth===30&&hunt.otbmRuntimeHeight===30&&
  hunt.otbmFovWidth===22&&hunt.otbmFovHeight===15,
  "room técnica de Malice não usa OTBM/mundo 30×30 + FOV 22×15");
must(JSON.stringify(hunt.otbmFovBounds)===JSON.stringify({x:1040,y:1009,w:24,h:22,z:7})&&
  JSON.stringify(hunt.otbmSpawn)===JSON.stringify({x:1046,y:1020,z:7})&&
  JSON.stringify(hunt.otbmMobBounds)===JSON.stringify({x:1057,y:1020,w:1,h:1,z:7}),
  "FOV/player/boss spawn Map Editor de Malice divergentes");
let map=OTBM.read(room,{z:7});
must(map.w===24&&map.h===22&&
  map.sourceBounds.minX===1040&&map.sourceBounds.minY===1009&&
  map.sourceBounds.maxX===1063&&map.sourceBounds.maxY===1030,
  "bossroom Canary de Malice não manteve z=7 24×22 integral");
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
// padX=floor((30-24)/2)=3, padY=floor((30-22)/2)=4
// player local (6,11) → runtime (9,15); boss local (17,11) → runtime (20,15)
must(hm.rows.length===30&&hm.rows.every(row=>row.length===30)&&
  hm.spawn.x===9&&hm.spawn.y===15&&hm.mob.length===1&&hm.mob[0].x===20&&hm.mob[0].y===15,
  "coordenadas runtime de player/boss Malice Map Editor incorretas");

ctx.huntMapBlocked=()=>false;
ctx.buildOccupancy=(combat)=>new Map((combat.mobs||[]).filter(m=>m.hp>0&&m.cx!==undefined).map(m=>[m.cx+":"+m.cy,m]));
ctx.cellToScreen=(x,y)=>({x:(x+.5)/30,y:(y+.5)/30});ctx.resolveSQMOccupancy=()=>{};
const bossDef=ctx.GAMEDATA.monsters["goshnar-s-malice"];
must(bossDef&&bossDef.hp===300000,"stats Canary de Malice ausentes");
for(const slug of ["dreadful-harvester","malicious-soul"])
  must(ctx.GAMEDATA.monsters[slug],"trash Malice ausente: "+slug);
const boss={slug:"goshnar-s-malice",def:Object.assign({},bossDef),boss:true,hp:300000,maxHp:300000,
  id:"malice",cx:20,cy:15,x:.67,y:.5};
const player={id:"p",name:"Knight",hp:12000};
const combat={boss:{id:"goshnar-s-malice"},mobs:[boss],events:[],player:{id:"p",p:player,cx:9,cy:15,x:.3,y:.5},
  gridW:30,gridH:30,hunt:hunt,huntMap:{rows:Array(30).fill(".".repeat(30)),leg:{".":{v:[1]}}}};
ctx.maliceBossInit(combat,player,()=>0.1,1000);
must(combat.malice&&combat.malice.qtePhase==="idle"&&
  ctx.maliceTrashMobs(combat).length===8,"Malice não encheu 8 trash no init");
ctx.maliceStartQte(combat,2000,()=>0.2);
must(combat.malice.qtePhase==="active"&&combat.malice.start&&combat.malice.goal,
  "QTE labirinto não iniciou");
must(combat.malice.qteUntil===2000+12000,"Malice QTE duration != 12s");
must(combat.malice.px===combat.malice.start.x&&combat.malice.py===combat.malice.start.y,
  "player do labirinto não nasce no azul");
// Move adjacente válido até o goal (limpa blocos para isolar a regra de vitória).
combat.malice.blocks=[];
combat.malice.px=combat.malice.goal.x-1;combat.malice.py=combat.malice.goal.y;
must(ctx.maliceTryMove(combat,combat.malice.goal.x,combat.malice.goal.y,3000),
  "movimento adjacente ao vermelho falhou");
must(combat.malice.qtePhase==="idle","sucesso QTE não limpou fase");
must(player.hp===12000,"sucesso QTE aplicou dano indevido");
must(!ctx.maliceTryMove(combat,0,0,3100),"movimento fora do QTE ativo deveria falhar");
ctx.maliceStartQte(combat,50000,()=>0.3);
// Sequência WASD local: vários passos sem depender de tick online.
combat.malice.blocks=[];
const pathX=combat.malice.px;
must(ctx.maliceTryMove(combat,pathX+1,combat.malice.py,50100),"passo 1 falhou");
must(ctx.maliceTryMove(combat,pathX+2,combat.malice.py,50150),"passo 2 falhou");
must(combat.malice.px===pathX+2,"posição local não avançou após 2 passos");
// Clique longe: um passo guloso em direção ao goal.
const beforePx=combat.malice.px,beforePy=combat.malice.py;
must(ctx.maliceMoveTo(combat,combat.malice.goal.x,combat.malice.goal.y,50200),
  "clique longe não deu passo guloso");
must(Math.abs(combat.malice.px-beforePx)+Math.abs(combat.malice.py-beforePy)===1,
  "passo guloso não foi adjacente");
// Online com instância: aplica local + enfileira intents (não engole o movimento).
ctx.onlineAuthorityCombat=()=>true;ctx.accountInstanceActive=()=>true;
const onlinePx=combat.malice.px,onlinePy=combat.malice.py;
must(ctx.maliceTryMove(combat,onlinePx+1,onlinePy,50300),"online não moveu localmente");
must(combat.malice.px===onlinePx+1,"online sem feedback local");
must(Array.isArray(combat._malicePendingMoves)&&combat._malicePendingMoves.length===1,
  "online não enfileirou maliceIntent");
ctx.onlineAuthorityCombat=()=>false;ctx.accountInstanceActive=()=>false;
combat._malicePendingMoves=[];
// Reciclo de bloco não cai na coluna do start/goal/jogador.
const boardN=ctx.MALICE_QTE_SIZE||30;
combat.malice.blocks=[{x:combat.malice.start.x,y:boardN-1,len:2}];
ctx.maliceSlideBlocks(combat.malice);
must(combat.malice.blocks[0].x!==combat.malice.start.x&&
  combat.malice.blocks[0].x!==combat.malice.goal.x&&
  combat.malice.blocks[0].x!==combat.malice.px,
  "bloco reciclado na coluna protegida");
ctx.maliceResolveQte(combat,false,56000);
must(player.hp===12000-6000,"falha QTE não aplicou 6000 death");
const trash=ctx.maliceTrashMobs(combat)[0];trash.hp=0;
ctx.maliceBossHandleKill(combat,trash,60000);
must(combat.malice.pendingRespawns.length===1&&
  combat.malice.pendingRespawns[0].at===80000,"respawn trash não agenda +20s");
ctx.maliceBossTick(combat,80000);
must(ctx.maliceTrashMobs(combat).length===8,"tick não respawna trash após 20s");

const playerTaint={soulWarTaints:{level:0,firstAt:0,bosses:{}}};
must(ctx.soulwarGrantBossTaint(playerTaint,"goshnar-s-malice")===1&&
  playerTaint.soulWarTaints.bosses["goshnar-s-malice"]===true,
  "kill de Malice não concede mácula Soul War");

const gameSrc=fs.readFileSync(path.join(js,"game.js"),"utf8");
const combatSrc=fs.readFileSync(path.join(js,"combat.js"),"utf8");
must(gameSrc.includes('"goshnar-s-malice":{hunt:"goshnars-malice-room",otbm:"goshars_malice_room"}')&&
  gameSrc.includes('cooldown:0')&&gameSrc.includes("maliceBossCleanup"),
  "boss def/rota/cleanup Malice ausentes");
for(const marker of ["maliceBossInit(c, player)","maliceBossTick(c, now)",
  "maliceBossHandleKill(c, m, now)"])
  must(combatSrc.includes(marker),"combat.js sem hook Malice: "+marker);
must(combatSrc.includes("BOSS_SPAWN_DELAY_MS")&&combatSrc.includes("arenaBossDeferSpawn")&&
  gameSrc.includes("combatInstanceEntryPending")&&gameSrc.includes("skipPartyZone"),
  "Malice compartilhou path de spawn 5s / anti-kick");
const html=fs.readFileSync(path.join(game,"index.html"),"utf8");
const css=fs.readFileSync(path.join(game,"css","layout.css"),"utf8");
must(html.includes('id="malice-qte"')&&html.includes('id="malice-minigame"')&&
  css.includes(".malice-qte")&&css.includes(".malice-cell"),
  "UI QTE/minigame Malice ausente");
const auth=fs.readFileSync(path.join(__dirname,"..","server","authoritative_engine.js"),"utf8");
must(auth.includes('"goshnars-malice-room"')&&auth.includes("tickMalice")&&
  auth.includes("goshnar-s-malice")&&auth.includes("maliceIntent")&&
  auth.includes("MALICE_QTE_DURATION=12000")&&auth.includes("BOSS_SPAWN_DELAY_MS=5000"),
  "autoritativo sem Malice online / QTE 12s / spawn 5s");
console.log("OK: Malice Map Editor spawns, FOV 22×15, trash 8/20s, maze QTE 12s ±6000, taint, CD off e spawn 5s validados.");
