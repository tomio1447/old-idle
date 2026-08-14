/* Regressão: snapshots autoritativos não fazem criaturas/players piscarem ao trocar o ativo. */
"use strict";
const fs=require("fs"),path=require("path"),vm=require("vm");
const game=fs.readFileSync(path.join(__dirname,"..","game","js","game.js"),"utf8");
function must(value,message){if(!value)throw Error(message);}
const start=game.indexOf("function applyOnlineAuthorityState"),end=game.indexOf("\nfunction requestOnlineAuthorityTick",start);
must(start>=0&&end>start,"applyOnlineAuthorityState ausente");

const p10={id:"10",name:"Kina",hp:7000},p20={id:"20",name:"Pally",hp:6000},
  p30={id:"30",name:"Druideiro",hp:5000},p40={id:"40",name:"Sorc",hp:4000};
const e10={id:"10",p:p10,cx:10,cy:8,x:.35,y:.45},e20={id:"20",p:p20,cx:11,cy:8,x:.38,y:.45},
  e30={id:"30",p:p30,cx:12,cy:8,x:.41,y:.45},e40={id:"40",p:p40,cx:13,cy:8,x:.44,y:.45};
const mobA={id:"a",slug:"retching-horror",hp:1000,cx:14,cy:8,x:.48,y:.45},
  mobB={id:"b",slug:"demon",hp:900,cx:15,cy:8,x:.51,y:.45};
const players=[e10,e20,e30,e40],mobs=[mobA,mobB],combat={players,player:e20,mobs,gridW:30,gridH:20,
  hunt:{id:"mota-extension"},huntMap:{tiles:[]},events:[]};
const ctx={G:{p:p20,combat},Map,Object,Array,String,Number,Math,JSON,setTimeout:(fn)=>fn(),
  restoreCombatSessionState:(fresh,descriptor)=>{ctx.G.p=descriptor.state.players[0].p;return descriptor.state;},
  clearInstanceSession:()=>{},stopHunt:()=>{},console};
vm.createContext(ctx);vm.runInContext(game.slice(start,end),ctx);

const originalCombat=combat,originalPlayers=players,originalMobs=mobs;
const lagging={activeCharacterId:"10",state:{gridW:30,gridH:20,players:[
  {id:"10",p:{id:"10",name:"Kina",hp:6900}},{id:"30",p:{id:"30",name:"Druideiro",hp:4900}},
  {id:"40",p:{id:"40",name:"Sorc",hp:3900}},
],mobs:[],events:[]}};
must(ctx.applyOnlineAuthorityState(lagging,null),"snapshot defasado não foi aplicado");
must(ctx.G.combat===originalCombat&&ctx.G.combat.players===originalPlayers&&ctx.G.combat.mobs===originalMobs,
  "tick substituiu o runtime ou os arrays visuais");
must(ctx.G.combat.players.length===4&&ctx.G.combat.player===e20&&ctx.G.p===p20,
  "membro selecionado sumiu ou voltou ao personagem remoto anterior");
must(ctx.G.combat.mobs.length===2&&ctx.G.combat.mobs[0]===mobA&&ctx.G.combat.mobs[1]===mobB,
  "tick vazio fez a onda inteira piscar");
must(e10.p===p10&&p10.hp===6900&&e10.x===.35&&e20.x===.38,
  "reconciliação perdeu referência, status ou posição dos players");

const futureEventTs=Date.now()+10000;
const authoritative={activeCharacterId:"10",state:{gridW:30,gridH:20,players:[
  {id:"10",p:{id:"10",name:"Kina",hp:6800}},{id:"20",p:{id:"20",name:"Pally",hp:5800}},
  {id:"30",p:{id:"30",name:"Druideiro",hp:4800}},{id:"40",p:{id:"40",name:"Sorc",hp:3800}},
],mobs:[{id:"a",slug:"retching-horror",hp:700,cx:2,cy:2,x:.08,y:.1},
  {id:"c",slug:"fury",hp:1200}],events:[{t:"hit",dmg:50,mobId:"a",ts:futureEventTs}]}};
must(ctx.applyOnlineAuthorityState(authoritative,null),"segundo snapshot não foi aplicado");
must(ctx.G.combat===originalCombat&&ctx.G.combat.player===e20&&ctx.G.p===p20&&p20.hp===5800,
  "snapshot completo quebrou o controle selecionado");
must(ctx.G.combat.mobs.length===2&&ctx.G.combat.mobs[0]===mobA&&mobA.hp===700&&mobA.x===.48,
  "monstro existente foi recriado ou teleportado");
const mobC=ctx.G.combat.mobs.find((mob)=>mob.id==="c");
must(mobC&&Number.isFinite(mobC.x)&&Number.isFinite(mobC.y),
  "novo monstro autoritativo nasceu sem posição renderizável");
must(ctx.G.combat.events!==authoritative.state.events&&ctx.G.combat.events.length===1&&
  ctx.G.combat.events[0].t==="hit",
  "fila de eventos foi aliasada ao snapshot e pode entrar em push infinito");
must(ctx.G.combat.events[0].ts<futureEventTs&&ctx.G.combat.events[0].ts<=Date.now()+200,
  "timestamp futuro manteve latência artificial mesmo em servidor local");
console.log("OK: ticks autoritativos preservam runtime, players ativos e continuidade visual dos monstros.");
