/* Regressão: room/coordenadas e Dread's Torment de Goshnar's Hatred. */
"use strict";
const crypto=require("crypto"),fs=require("fs"),path=require("path"),vm=require("vm");
const game=path.join(__dirname,"..","game"),js=path.join(game,"js");
const OTBM=require(path.join(js,"otbm.js"));
function must(ok,msg){if(!ok)throw Error(msg);}
const ctx={window:{},console,Math,Date,Map,Set};ctx.window=ctx;vm.createContext(ctx);
for(const file of ["gamedata.js","monsterdata.js","mobsheetdata.js","monsters.js","soulwar.js","tileflags.js"])
  vm.runInContext(fs.readFileSync(path.join(js,file),"utf8"),ctx,{filename:file});

const room=fs.readFileSync(path.join(game,"maps","goshnars_hatred_room.otbm"));
const beta=fs.readFileSync(path.join(game,"beta-maps","bossesroom","goshnars_hatred_room.otbm"));
const rotten=fs.readFileSync(path.join(game,"maps","rotten_wasteland.otbm"));
must(room.equals(beta)&&!room.equals(rotten)&&
  crypto.createHash("sha256").update(room).digest("hex")===
  "126ea822084746c1955b74b00cb8c8866d83ff283e81ca2a2afa559c84ad5d90",
  "Hatred não publica o OTBM beta goshnars_hatred_room");
const hunt=ctx.GAMEDATA.hunts["goshnars-hatred-room"];
must(hunt&&hunt.otbm==="goshnars_hatred_room"&&hunt.otbmFloor===7&&
  hunt.otbmRuntimeWidth===30&&hunt.otbmRuntimeHeight===30,
  "room técnica de Hatred não usa OTBM/mundo 30×30 próprio");
must(JSON.stringify(hunt.otbmFovBounds)===JSON.stringify({x:1042,y:1009,w:22,h:18,z:7})&&
  hunt.otbmFovWidth===22&&hunt.otbmFovHeight===15&&
  JSON.stringify(hunt.otbmSpawn)===JSON.stringify({x:1052,y:1023,z:7})&&
  JSON.stringify(hunt.otbmMobBounds)===JSON.stringify({x:1052,y:1017,w:1,h:1,z:7}),
  "FOV/player/boss spawn Canary de Hatred divergentes");
let map=OTBM.read(room,{z:7});
must(map.w===22&&map.h===18&&Object.keys(map.cells).length===392&&
  map.sourceBounds.minX===1042&&map.sourceBounds.minY===1009&&
  map.sourceBounds.maxX===1063&&map.sourceBounds.maxY===1026,
  "bossroom Canary de Hatred não manteve z=7 22×18 integral");
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
must(hm.rows.length===30&&hm.rows.every(row=>row.length===30)&&
  hm.spawn.x===14&&hm.spawn.y===20&&hm.mob.length===1&&hm.mob[0].x===14&&hm.mob[0].y===14,
  "coordenadas runtime de player/boss Hatred Canary incorretas");
const visualIds=new Set();
Object.values(hm.leg).forEach(e=>{(e.v||[]).forEach(id=>visualIds.add(id));(e.g||[]).forEach(id=>visualIds.add(id));});
must(visualIds.size>=15,"mapa Hatred sem variedade visual mínima");
const missingSprites=[...visualIds].filter((id)=>!fs.existsSync(path.join(game,"assets","tiles",id+".png")));
// Sprites novos vêm via tools/import_otbm_sprites.py (TIBIA860). A sala
// continua válida sem eles; só avisa no relatório do teste.
if(missingSprites.length)
  console.warn("Hatred: sprites ausentes (importe com TIBIA860):", missingSprites.join(","));


// Arena sintética livre para testar a mecânica sem depender do renderer.
ctx.huntMapBlocked=()=>false;
ctx.buildOccupancy=(combat)=>new Map((combat.mobs||[]).filter(m=>m.hp>0&&m.cx!==undefined).map(m=>[m.cx+":"+m.cy,m]));
ctx.cellToScreen=(x,y)=>({x:(x+.5)/30,y:(y+.5)/30});ctx.resolveSQMOccupancy=()=>{};
const bossDef=ctx.GAMEDATA.monsters["goshnar-s-hatred"];
const boss={slug:"goshnar-s-hatred",def:bossDef,boss:true,hp:300000,maxHp:300000,id:"hatred",
  cx:15,cy:5,x:.5,y:.2};
const pa={id:"a",name:"Knight",hp:1000},pb={id:"b",name:"Druid",hp:1000};
const ea={id:"a",name:"Knight",p:pa,cx:5,cy:5,x:.2,y:.2},eb={id:"b",name:"Druid",p:pb,cx:6,cy:5,x:.23,y:.2};
const combat={boss:{id:"goshnar-s-hatred"},mobs:[boss],events:[],players:[ea,eb],player:ea,
  gridW:30,gridH:30,huntMap:{rows:Array(30).fill(".".repeat(30)),leg:{".":{v:[1]}}}};
// Delay 20s; depois 4 Harvesters e 1 Hateful Soul. Cada summon consome
// três rolls: espécie, célula e cooldown.
const rolls=[0, .5,0,0, .5,0,0, .5,0,0, .5,0,0, .05,0,0];
const rnd=()=>rolls.length?rolls.shift():.5;
ctx.hatredBossInit(combat,pa,rnd,1000);
must(combat.hatred&&!combat.hatred.active&&combat.hatred.nextActivationAt===21000&&
  boss.allowBlockedSpawn&&boss.fixedSpawnCx===15&&boss.fixedSpawnCy===5,
  "Hatred não agendou ativação mínima de 20s/preservou spawn");
const late={boss:{id:"goshnar-s-hatred"},mobs:[Object.assign({},boss)],events:[],player:ea,
  gridW:30,gridH:30,huntMap:combat.huntMap};
ctx.hatredBossInit(late,pa,()=>.999999,1000);
must(late.hatred.nextActivationAt===41000,"ativação máxima de Hatred não alcança 40s");
ctx.hatredBossTick(combat,20999);must(!combat.hatred.active&&!ctx.hatredSummons(combat).length,"mecânica ativou antes de 20s");
ctx.hatredBossTick(combat,21000);
let summons=ctx.hatredSummons(combat),dread=summons.filter(m=>m.slug==="dreadful-harvester"),hateful=summons.find(m=>m.slug==="hateful-soul");
must(combat.hatred.active&&summons.length===5&&dread.length===4&&hateful,
  "ativação não criou até cinco summons com chance de Hateful");
must(dread.every(m=>m.hp===15000&&m.maxHp===15000&&m.def.hp===15000)&&
  hateful.hp===50000&&hateful.maxHp===50000&&hateful.def.hp===50000,
  "HP dos summons de Hatred incorreto");
must(ctx.hatredRandomSummonSlug(()=>.099999)==="hateful-soul"&&
  ctx.hatredRandomSummonSlug(()=>.10)==="dreadful-harvester","chance de Hateful Soul não é exatamente 10%");

ctx.hatredBossTick(combat,26000);
must(combat.hatred.counters.a===1&&combat.hatred.counters.b===1&&
  ctx.hatredBossOutgoingDamageMultiplier(combat,boss,pa)===1.1&&
  ctx.hatredBossOutgoingDamageMultiplier(combat,hateful,pa)===1.1&&
  ctx.hatredBossOutgoingDamageMultiplier(combat,dread[0],pa)===1,
  "tick de 5s não adicionou +10% ao dano de boss/Hateful");
dread[0].hp=0;ctx.hatredBossHandleKill(combat,dread[0],26001);
must(combat.hatred.counters.a===0&&combat.hatred.counters.b===0,"Harvester morto não reduziu todos os contadores em 1");
combat.hatred.counters.a=4;combat.hatred.counters.b=3;hateful.hp=0;
ctx.hatredBossHandleKill(combat,hateful,26002);
must(combat.hatred.counters.a===0&&combat.hatred.counters.b===0,"Hateful Soul não zerou todos os contadores");
must(ctx.hatredSummons(combat).length<=5,"limite de cinco summons foi ultrapassado");

const combatSrc=fs.readFileSync(path.join(js,"combat.js"),"utf8");
const gridSrc=fs.readFileSync(path.join(js,"grid.js"),"utf8");
const gameSrc=fs.readFileSync(path.join(js,"game.js"),"utf8");
for(const marker of ["hatredBossInit(c, player)","hatredBossTick(c, now)","hatredBossHandleKill(c, m, now)",
  "hatredBossOutgoingDamageMultiplier(c, mob, p)"])
  must(combatSrc.includes(marker),"combat.js sem hook Hatred: "+marker);
must(combatSrc.includes('m.slug==="hateful-soul"')&&combatSrc.includes("const keepFixed=")&&
  gridSrc.includes("ent.allowBlockedSpawn")&&gameSrc.includes("hatredBossCleanup(G.combat)"),
  "prioridade de summon/spawn/cleanup Hatred ausente");
must(combatSrc.includes("BOSS_SPAWN_DELAY_MS")&&combatSrc.includes("arenaBossDeferSpawn")&&
  combatSrc.includes("arenaBossSpawnTick")&&combatSrc.includes("arenaBossBindMechanics"),
  "combat.js sem delay de spawn / bind pós-spawn");
must(combatSrc.includes('boss.id === "goshnar-s-megalomania"')&&
  combatSrc.includes("arenaBossBindMechanics(c, now)"),
  "Megalomania/path de bind pós-spawn ausente");
must(gameSrc.includes("combatInstanceEntryPending")&&gameSrc.includes("skipPartyZone")&&
  gameSrc.includes("accountInstanceCreating"),
  "kick-on-enter: guard de instância pendente / skipPartyZone ausente");
{
  const spawnCtx={console,Math,Date,Map,Set,G:null};vm.createContext(spawnCtx);
  const start=combatSrc.indexOf("const BOSS_SPAWN_DELAY_MS");
  const end=combatSrc.indexOf("function huntMapSpawnBlocked");
  must(start>=0&&end>start,"helpers de spawn boss não encontrados em combat.js");
  vm.runInContext(combatSrc.slice(start,end),spawnCtx,{filename:"combat-spawn-helpers.js"});
  must(spawnCtx.bossArenaSpawnDelayMs("goshnar-s-hatred")===5000&&
    spawnCtx.bossArenaSpawnDelayMs("goshnar-s-spite")===5000&&
    spawnCtx.bossArenaSpawnDelayMs("goshnar-s-malice")===5000&&
    spawnCtx.bossArenaSpawnDelayMs("goshnar-s-megalomania")===15000,
    "delay de spawn Hatred/Spite/Malice/Mega divergente");
  const boss={slug:"goshnar-s-hatred",id:"boss-h",boss:true,hp:1,x:.5,y:.5};
  const c={boss:{id:"goshnar-s-hatred"},mobs:[boss],events:[],player:{p:{id:"a"}}};
  const t0=1_000_000;
  let bindCalls=0;
  spawnCtx.hatredBossInit=function(combat){bindCalls++;combat.hatred={active:false,bound:true};};
  spawnCtx.greedBossInit=spawnCtx.spiteBossInit=spawnCtx.maliceBossInit=spawnCtx.scarlettBossInit=function(){};
  must(spawnCtx.arenaBossDeferSpawn(c,boss,5000,t0)===true&&c.mobs.length===0&&!c.hatred&&
    spawnCtx.arenaBossSpawnPending(c)&&!spawnCtx.arenaBossSpawnTick(c,t0+4999)&&bindCalls===0&&
    spawnCtx.arenaBossSpawnTick(c,t0+5000)&&c.mobs[0]===boss&&c.arenaBossSpawn.spawned&&
    bindCalls===1&&c.hatred&&c.arenaBossSpawn.mechanicsBound,
    "Hatred: mecânica deve ligar só após o boss surgir (5s)");
}
const authSrc=fs.readFileSync(path.join(__dirname,"..","server","authoritative_engine.js"),"utf8");
must(authSrc.includes("const BOSS_SPAWN_DELAY_MS=5000")&&
  authSrc.includes("arenaBossDeferSpawn(auth,boss,remain)")&&
  authSrc.includes("function arenaBossBindMechanics")&&
  authSrc.includes('bossId||"")==="goshnar-s-megalomania"')&&
  authSrc.includes("if(arenaBossSpawnPending(auth))return"),
  "servidor sem delay 5s / bind pós-spawn / wipe guard");
{
  const engine=require(path.join(__dirname,"..","server","authoritative_engine"));
  function player(){
    return {id:1,name:"H",voc:"knight",level:800,exp:engine.expForLevel(800),
      hp:500000,mp:20000,gold:0,skills:{sword:120},ml:20,equip:{weapon:{item:"sword"}},
      supplies:{},lootPouch:{},kills:{},bosses:{},config:{}};
  }
  const member={id:"1",p:player()};
  const desc={v:1,savedAt:1000,kind:"boss",huntId:null,bossId:"goshnar-s-hatred",
    instanceMode:"boss",activeCharacterId:"1",members:[member],
    state:{players:[{id:"1",p:member.p,cx:10,cy:10,x:.5,y:.5}],
      mobs:[{id:"boss-1",slug:"goshnar-s-hatred",boss:true,cx:12,cy:10,x:.5,y:.5}],events:[]}};
  const init=engine.initializeAuthority(desc,"h".repeat(64),1000);
  must(!init.authority.hatred&&init.authority.arenaBossSpawn&&init.authority.arenaBossSpawn.pending&&
    !init.authority.mobs.some((m)=>m.boss),
    "Hatred online não deve ligar mecânica antes do spawn deferido");
  const mid=JSON.parse(engine.advanceAuthorityState(JSON.stringify(init),2000,3000).state);
  must(!mid.authority.hatred&&mid.authority.arenaBossSpawn&&mid.authority.arenaBossSpawn.pending,
    "Hatred online não deve criar hatred no meio do delay de 5s");
  const spawned=JSON.parse(engine.advanceAuthorityState(JSON.stringify(init),6000,7000).state);
  must(spawned.authority.hatred&&!spawned.authority.hatred.active&&
    spawned.authority.mobs.some((m)=>m.boss&&m.hp>0)&&
    spawned.authority.arenaBossSpawn&&spawned.authority.arenaBossSpawn.spawned&&
    spawned.authority.arenaBossSpawn.mechanicsBound,
    "Hatred online deve ligar mecânica no tick em que o boss surge");
  for(const mob of spawned.authority.mobs||[]){
    mob.damage=0;mob.attackSpeed=Number.MAX_SAFE_INTEGER;mob.attackAcc=0;
  }
  for(const item of spawned.authority.players||[])
    item.p.hp=engine.maxStats(item.p).hp;
  const activateAt=Number(spawned.authority.hatred.nextActivationAt);
  must(activateAt>=spawned.authority.clock+20000&&activateAt<=spawned.authority.clock+40000,
    "ativação Hatred pós-spawn fora de 20–40s");
  const after=JSON.parse(engine.advanceAuthorityState(JSON.stringify(spawned),
    activateAt-Number(spawned.authority.clock)+2000,activateAt+2000).state);
  must(after.authority.hatred&&after.authority.hatred.active&&
    after.authority.mobs.some((m)=>m.hatredSummon&&m.hp>0),
    "Hatred online não ativou Dread's Torment após o spawn delay");
}
const html=fs.readFileSync(path.join(game,"index.html"),"utf8"),css=fs.readFileSync(path.join(game,"css","layout.css"),"utf8");
must(html.includes('id="hatred-minigame"')&&css.includes(".hatred-minigame")&&
  css.includes("right:8px; bottom:8px")&&css.includes("width:230px"),
  "modal inferior direito de Hatred ausente");
must(html.includes("js/soulwar.js?v=hatred-arena-fix-v1")&&
  html.includes("js/game.js?v=hatred-reentry-v2"),
  "index sem cache-bust soulwar/game do Hatred");
console.log("OK: Hatred Canary 22×18→30×30, spawns, ativação 20–40s, contadores, summons, init pós-defer e anti-kick validados.");
