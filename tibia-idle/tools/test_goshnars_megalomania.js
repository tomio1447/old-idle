/* Regressão: room/FOV/spawns, taints gate e mecânicas de Megalomania. */
"use strict";
const crypto=require("crypto"),fs=require("fs"),path=require("path"),vm=require("vm");
const game=path.join(__dirname,"..","game"),js=path.join(game,"js");
const OTBM=require(path.join(js,"otbm.js"));
function must(ok,msg){if(!ok)throw Error(msg);}
const ctx={window:{},console,Math,Date,Map,Set,document:undefined};ctx.window=ctx;vm.createContext(ctx);
for(const file of ["gamedata.js","monsterdata.js","mobsheetdata.js","monsters.js","soulwar.js","tileflags.js"])
  vm.runInContext(fs.readFileSync(path.join(js,file),"utf8"),ctx,{filename:file});

const room=fs.readFileSync(path.join(game,"maps","goshnars_megalomania.otbm"));
const beta=fs.readFileSync(path.join(game,"beta-maps","bossesroom","goshnars_megalomania.otbm"));
must(room.equals(beta)&&
  crypto.createHash("sha256").update(room).digest("hex")===
  "824dacccef8c1bc4439cbc915e654e4612d6867f25253b7504ebf14ed73694ab",
  "Megalomania não publica o OTBM goshnars_megalomania");
const hunt=ctx.GAMEDATA.hunts["goshnars-megalomania-room"];
must(hunt&&hunt.otbm==="goshnars_megalomania"&&hunt.otbmFloor===7&&
  hunt.otbmRuntimeWidth===30&&hunt.otbmRuntimeHeight===30&&
  hunt.otbmFovWidth===22&&hunt.otbmFovHeight===15,
  "room técnica de Megalomania não usa OTBM/mundo 30×30 + FOV 22×15");
must(JSON.stringify(hunt.otbmFovBounds)===JSON.stringify({x:1039,y:1010,w:24,h:21,z:7})&&
  JSON.stringify(hunt.otbmSpawn)===JSON.stringify({x:1051,y:1022,z:7})&&
  JSON.stringify(hunt.otbmMobBounds)===JSON.stringify({x:1051,y:1014,w:1,h:1,z:7}),
  "FOV/player/boss spawn Map Editor de Megalomania divergentes");
let map=OTBM.read(room,{z:7});
must(map.w===24&&map.h===21&&
  map.sourceBounds.minX===1039&&map.sourceBounds.minY===1010&&
  map.sourceBounds.maxX===1062&&map.sourceBounds.maxY===1030,
  "bossroom Canary de Megalomania não manteve z=7 24×21 integral");
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
// padX=floor((30-24)/2)=3, padY=floor((30-21)/2)=4
// player local (12,12) → runtime (15,16); boss local (12,4) → runtime (15,8)
must(hm.rows.length===30&&hm.rows.every(row=>row.length===30)&&
  hm.spawn.x===15&&hm.spawn.y===16&&hm.mob.length===1&&hm.mob[0].x===15&&hm.mob[0].y===8,
  "coordenadas runtime de player/boss Megalomania Map Editor incorretas");

for(const slug of ["goshnar-s-megalomania-purple","goshnar-s-megalomania-green",
  "goshnar-s-megalomania-blue","aspect-of-power"])
  must(ctx.GAMEDATA.monsters[slug],"monstro Megalomania ausente: "+slug);
const green=ctx.GAMEDATA.monsters["goshnar-s-megalomania-green"];
must(green.hp===620000&&green.exp===3000000,"stats Canary Green de Megalomania ausentes");
const bag=(green.loot||[]).find((d)=>d.item==="bag-you-desire");
must(bag&&Math.abs(Number(bag.chance)-0.15)<1e-9,
  "Bag You Desire de Megalomania não está em 0.15% (+50%)");

const bosses={
  "goshnar-s-malice":true,"goshnar-s-spite":true,"goshnar-s-greed":true,
  "goshnar-s-hatred":true,"goshnar-s-cruelty":true,
};
must(!ctx.soulwarHasAllBossTaints({soulWarTaints:{level:4,firstAt:Date.now(),bosses}}),
  "gate aceitou sem level 5");
must(!ctx.soulwarHasAllBossTaints({soulWarTaints:{level:5,firstAt:Date.now(),
  bosses:{"goshnar-s-malice":true,"goshnar-s-spite":true,"goshnar-s-greed":true,
    "goshnar-s-hatred":true}}}),
  "gate aceitou sem Cruelty");
must(ctx.soulwarHasAllBossTaints({soulWarTaints:{level:5,firstAt:Date.now(),bosses}}),
  "gate rejeitou personagem com 5 máculas");

ctx.huntMapBlocked=()=>false;
ctx.buildOccupancy=(combat)=>new Map((combat.mobs||[]).filter(m=>m.hp>0&&m.cx!==undefined).map(m=>[m.cx+":"+m.cy,m]));
ctx.cellToScreen=(x,y)=>({x:(x+.5)/30,y:(y+.5)/30});ctx.resolveSQMOccupancy=()=>{};
const purple=ctx.GAMEDATA.monsters["goshnar-s-megalomania-purple"];
const boss={slug:"goshnar-s-megalomania-purple",def:Object.assign({},purple),boss:true,
  hp:620000,maxHp:620000,id:"mega",cx:15,cy:8,x:.5,y:.27};
const player={id:"p",name:"Knight",hp:12000};
const combat={boss:{id:"goshnar-s-megalomania"},mobs:[boss],events:[],
  player:{id:"p",p:player,cx:15,cy:16,x:.5,y:.53},
  gridW:30,gridH:30,hunt:hunt,huntMap:{rows:Array(30).fill(".".repeat(30)),leg:{".":{v:[1]}}}};
ctx.megaBossInit(combat,player,()=>0.1,1000);
must(combat.mega&&!combat.mega.bossSpawned&&combat.mega.bossSpawnAt===1000+15000,
  "Megalomania não agendou spawn de 15s");
must(!(combat.mobs||[]).some((m)=>m.boss),"Boss não deveria estar nos mobs antes do spawn");
must(combat.mega.pendingBoss&&combat.mega.pendingBoss.boss,"pendingBoss ausente");
ctx.megaBossTick(combat,1000+14999);
must(!combat.mega.bossSpawned,"Boss nasceu cedo demais");
ctx.megaBossTick(combat,1000+15000);
must(combat.mega.bossSpawned&&(combat.mobs||[]).some((m)=>m.boss&&m.hp>0),
  "Boss não nasceu após 15s");
must(!combat.mega.immune,"Boss deveria nascer vulnerável");

const slot=combat.mega.personal&&combat.mega.personal.p;
must(slot&&slot.nextAt>0,"Scheduler pessoal ausente");
slot.nextAt=1000+15000;
ctx.megaStartPersonal(combat,"p",1000+15000,()=>0.0); // type scarlett (index 0)
must(slot.active&&slot.active.type==="scarlett","QTE scarlett pessoal não iniciou");
const hpBefore=player.hp;
ctx.megaResolvePersonal(combat,"p",false,1000+16000);
must(!slot.active&&player.hp<hpBefore&&player.hp>=hpBefore-6000&&player.hp<=hpBefore-3000,
  "Falha pessoal não aplicou 3k–6k death");

const engine=require("../server/authoritative_engine");
must(engine.HUNTS["goshnars-megalomania-room"],"HUNTS server sem megalomania-room");

const lobbyMod=require("../server/megalomania_lobby");
must(lobbyMod.MAX_SLOTS===5&&lobbyMod.MAX_CHARS_PER_ACCOUNT_24H===2,
  "constantes de lobby Megalomania divergentes");
const ctrl=lobbyMod.createMegalomaniaLobbyController({publishAccount:()=>{}});
must(typeof ctrl.createLobby==="function"&&typeof ctrl.bindShare==="function",
  "controller de lobby incompleto");

console.log("ok: goshnars megalomania room + taints + spawn15s + personal QTE + lobby");
