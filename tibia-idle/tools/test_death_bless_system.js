/* Regressão: corpse layer, bless por level, wipe/retorno e penalidade PVP. */
"use strict";
const fs=require("fs"),path=require("path"),vm=require("vm");
const js=path.join(__dirname,"..","game","js");
const playerSrc=fs.readFileSync(path.join(js,"player.js"),"utf8");
const combatSrc=fs.readFileSync(path.join(js,"combat.js"),"utf8");
const gameSrc=fs.readFileSync(path.join(js,"game.js"),"utf8");
const renderSrc=fs.readFileSync(path.join(js,"render.js"),"utf8");
function must(ok,msg){if(!ok)throw Error(msg);}

const pc={};vm.createContext(pc);
let a=playerSrc.indexOf("function blessingPriceForLevel"),b=playerSrc.indexOf("\n\nfunction newPlayer",a);
vm.runInContext(playerSrc.slice(a,b),pc);
must(pc.blessingPriceForLevel(1)===500&&pc.blessingPriceForLevel(120)===60000&&
  pc.blessingPriceForLevel(121)===84700&&pc.blessingPriceForLevel(399)===279300&&
  pc.blessingPriceForLevel(400)===400000&&pc.blessingPriceForLevel(500)===500000,
  "faixas de preço da bless incorretas");

const cc={expForLevel:()=>0};vm.createContext(cc);
a=combatSrc.indexOf("function combatDeathCause");b=combatSrc.indexOf("\n\n/* Tick dos aliados",a);
vm.runInContext(combatSrc.slice(a,b),cc);
let p={exp:100000,level:100,blessed:true,deaths:0},c={pvp:false,stats:{deaths:0}};
let loss=cc.applyCharacterDeathConsequences(c,p);
must(loss.exp===0&&p.exp===100000&&!p.blessed&&p.deaths===1,"morte non-PVP perdeu EXP ou não consumiu bless");
p={exp:100000,level:100,blessed:7,deaths:0};c={pvp:true,instanceMode:"pvp",stats:{deaths:0}};
loss=cc.applyCharacterDeathConsequences(c,p,"monster");
must(loss.exp===3000&&p.exp===97000&&!p.blessed,"morte PVP para monstro não perdeu 3%");
p={exp:100000,level:100,blessed:true,deaths:0};c={pvp:true,instanceMode:"pvp",deathCause:"raid",stats:{deaths:0}};
loss=cc.applyCharacterDeathConsequences(c,p);
must(loss.exp===8000&&p.exp===92000&&!p.blessed&&loss.cause==="raid","morte PVP em raid não perdeu 8%");

const p1={id:"a",level:100,gold:300000,hp:0,mp:0,blessed:false};
const p2={id:"b",level:200,gold:0,hp:0,mp:0,blessed:false};
const e1={id:"a",p:p1,reviveAt:1,deathPos:{}},e2={id:"b",p:p2,reviveAt:1,deathPos:{}};
const old={huntId:"rats",instanceMode:"non-pvp",players:[e1,e2],player:e1,boss:null};
const gc={
  G:{p:p1,combat:old,inCity:false},ACTIVE_CHARACTER_KEY:"active",localStorage:{setItem(){}},
  combatSessionParticipants:c=>c.players,blessingPriceForLevel:pc.blessingPriceForLevel,
  spendGold(p,n){if(p.gold<n)return false;p.gold-=n;return true;},maxStats:()=>({hp:1000,mp:500}),
  saveCharacterToRoster(){},vipFullBless:()=>false,cleanupEncounterState(){},
  newCombat(){return {players:[e1,e2],player:e1,events:[]};},spawnWave(){},persistActiveInstance(){},save(){},
  addLog(){},toast(){},renderAll(){},stopHunt(){gc.stopped=true;gc.G.combat=null;},clearInstanceSession(){},fmtFull:String,
};
vm.createContext(gc);a=gameSrc.indexOf("function partyWipeBlessCost");b=gameSrc.indexOf("\n\n/* Avança combate",a);
vm.runInContext(gameSrc.slice(a,b),gc);
must(gc.partyWipeBlessCost(old)===190000,"custo total da bless da PT incorreto");
must(gc.returnPartyToInstanceAfterWipe(old,190000,true)===true&&p1.gold===110000&&
  p1.blessed===true&&p2.blessed===true&&p1.hp===1000&&p2.hp===1000&&gc.G.combat,
  "PT com gold não comprou bless/retornou à hunt");
const poor={id:"poor",level:500,gold:1000,hp:0,mp:0,blessed:false};
const poorEnt={id:"poor",p:poor};const poorCombat={huntId:"rats",instanceMode:"non-pvp",players:[poorEnt],player:poorEnt};
gc.G.p=poor;gc.G.combat=poorCombat;
must(gc.returnPartyToInstanceAfterWipe(poorCombat,500000,true)===false&&poor.gold===1000,
  "saldo insuficiente foi descontado/permitiu retorno");
gc.stopped=false;gc.G.p=poor;gc.G.combat=poorCombat;
must(gc.finishIdleInstance("party-wipe",true)===true&&gc.stopped&&gc.G.combat===null,
  "PT sem gold não foi enviada ao templo");

const ground=renderSrc.indexOf('drawTileCharMap(ctx, combat.huntMap, W, H, gridW, gridH, "ground")');
const body=renderSrc.indexOf('drawCombatPlayerCorpses(ctx,W,H,combat,player,"body")');
const entities=renderSrc.indexOf("const depthEntities = buildRenderEntities",body);
const objects=renderSrc.indexOf('drawTileCharMap(ctx, combat.huntMap, W, H, gridW, gridH, "objects")',entities);
const timer=renderSrc.indexOf('drawCombatPlayerCorpses(ctx,W,H,combat,player,"timer")',objects);
must(ground<body&&body<entities&&entities<objects&&objects<timer,
  "corpse não está entre ground e todo o restante da cena");

const rc={};vm.createContext(rc);a=renderSrc.indexOf("function drawSinisterDust");b=renderSrc.indexOf("\n\nRenderer.prototype.draw",a);
vm.runInContext(renderSrc.slice(a,b),rc);
const draw={n:0,save(){},restore(){},fillRect(){this.n++;},set fillStyle(v){},set shadowColor(v){},set shadowBlur(v){},set globalAlpha(v){}};
rc.drawSinisterDust(draw,{id:"i",influenced:true,sinisterStacks:3},100,100,32,1000);
const influenced=draw.n;draw.n=0;rc.drawSinisterDust(draw,{id:"f",fiendish:true,sinisterStacks:15},100,100,32,1000);
const fiendish=draw.n;draw.n=0;rc.drawSinisterDust(draw,{id:"n"},100,100,32,1000);
must(influenced>=5&&fiendish===12&&draw.n===0&&renderSrc.includes("drawSinisterDust(ctx,ent,cx,cy,tile,Date.now())"),
  "poeirinhas Influenced/Fiendish não são desenhadas");
console.log("OK: morte/bless, retorno da PT, penalidade PVP, corpse layer e poeirinhas validados.");
