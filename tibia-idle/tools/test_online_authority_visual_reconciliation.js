/* Regressão: snapshots autoritativos não fazem criaturas/players piscarem ao trocar o ativo. */
"use strict";
const fs=require("fs"),path=require("path"),vm=require("vm");
const game=fs.readFileSync(path.join(__dirname,"..","game","js","game.js"),"utf8"),
  render=fs.readFileSync(path.join(__dirname,"..","game","js","render.js"),"utf8");
function must(value,message){if(!value)throw Error(message);}
const start=game.indexOf("function resolveLiveCombatEventPosition"),end=game.indexOf("\nfunction requestOnlineAuthorityTick",start);
must(start>=0&&end>start,"reancoragem/scheduler/applyOnlineAuthorityState ausente");

const p10={id:"10",name:"Kina",hp:7000},p20={id:"20",name:"Pally",hp:6000},
  p30={id:"30",name:"Druideiro",hp:5000},p40={id:"40",name:"Sorc",hp:4000};
const e10={id:"10",p:p10,cx:10,cy:8,x:.35,y:.45},e20={id:"20",p:p20,cx:11,cy:8,x:.38,y:.45},
  e30={id:"30",p:p30,cx:12,cy:8,x:.41,y:.45},e40={id:"40",p:p40,cx:13,cy:8,x:.44,y:.45};
const mobA={id:"a",slug:"retching-horror",hp:1000,cx:14,cy:8,x:.48,y:.45,
  sx:.47,sy:.45,tx:.50,ty:.45,moving:true,stepT:140,stepDur:600,frame:2,nextStepAt:9000},
  mobB={id:"b",slug:"demon",hp:900,cx:15,cy:8,x:.51,y:.45};
const players=[e10,e20,e30,e40],mobs=[mobA,mobB],combat={players,player:e20,mobs,gridW:30,gridH:20,
  hunt:{id:"mota-extension"},huntMap:{tiles:[]},events:[]};
const ctx={G:{p:p20,combat},Map,Object,Array,String,Number,Math,JSON,setTimeout:(fn)=>fn(),
  ONLINE_AUTH_APPLIED_VERSION:0,ONLINE_AUTH_APPLIED_INSTANCE:"",
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

const recycledSpecies={version:1,activeCharacterId:"10",state:{gridW:30,gridH:20,players:[
  {id:"10",p:{id:"10",name:"Kina",hp:6900}},{id:"20",p:{id:"20",name:"Pally",hp:6000}},
  {id:"30",p:{id:"30",name:"Druideiro",hp:4900}},{id:"40",p:{id:"40",name:"Sorc",hp:3900}},
],mobs:[{id:"a",slug:"retching-horror",hp:1000},{id:"b",slug:"floating-savant",hp:820,maxHp:820,x:.22,y:.31,
  def:{name:"Floating Savant",looktype:113}}],events:[]}};
must(ctx.applyOnlineAuthorityState(recycledSpecies,null),"snapshot de ID reciclado não foi aplicado");
const reused=ctx.G.combat.mobs.find((mob)=>mob.id==="b");
must(reused&&reused.slug==="floating-savant"&&reused!==mobB,
  "ID reciclado reusou o objeto visual do Demon");
must(reused.def&&reused.def.name==="Floating Savant",
  "Demon reciclado como Floating Savant conservou o def/nome antigo");
must(reused.x===.22&&reused.y===.31,
  "espécie nova no slot reciclado herdou a interpolação do Demon");
must(ctx.G.combat.mobs[0]===mobA&&mobA.moving===true&&mobA.x===.48,
  "reciclar o Demon quebrou a interpolação do Retching Horror");

const futureEventTs=Date.now()+10000;
const authoritative={activeCharacterId:"10",state:{gridW:30,gridH:20,players:[
  {id:"10",p:{id:"10",name:"Kina",hp:6800}},{id:"20",p:{id:"20",name:"Pally",hp:5800}},
  {id:"30",p:{id:"30",name:"Druideiro",hp:4800}},{id:"40",p:{id:"40",name:"Sorc",hp:3800}},
],mobs:[{id:"a",slug:"retching-horror",hp:700,cx:2,cy:2,x:.08,y:.1,
  sx:.02,sy:.02,tx:.09,ty:.1,moving:false,stepT:0,stepDur:2000,frame:0,nextStepAt:1},
  {id:"c",slug:"fury",hp:1200}],events:[
    {t:"hit",dmg:50,mobId:"a",targetId:"a",whoId:"20",x:.99,y:.99,sx:0,sy:0,ts:futureEventTs},
    {t:"taken",dmg:25,targetId:"20",sourceId:"a",x:.01,y:.01,ts:futureEventTs+200},
    {t:"burst",targetId:"a",fx:"hit-by-fire",x:.01,y:.01,ts:futureEventTs+800},
    {t:"say",whoId:"20",text:"exori flam",x:.01,y:.01,ts:futureEventTs+820}
  ]}};
const appliedAt=Date.now();
must(ctx.applyOnlineAuthorityState(authoritative,null),"segundo snapshot não foi aplicado");
must(ctx.G.combat===originalCombat&&ctx.G.combat.player===e20&&ctx.G.p===p20&&p20.hp===5800,
  "snapshot completo quebrou o controle selecionado");
must(ctx.G.combat.mobs.length===2&&ctx.G.combat.mobs[0]===mobA&&mobA.hp===700&&mobA.x===.48,
  "monstro existente foi recriado ou teleportado");
must(mobA.moving===true&&mobA.sx===.47&&mobA.tx===.50&&mobA.ty===.45&&
  mobA.stepT===140&&mobA.stepDur===600&&mobA.frame===2&&mobA.nextStepAt===9000,
  "snapshot de 1s sobrescreveu o passo interpolado e fez o monstro saltar");
const mobC=ctx.G.combat.mobs.find((mob)=>mob.id==="c");
must(mobC&&Number.isFinite(mobC.x)&&Number.isFinite(mobC.y),
  "novo monstro autoritativo nasceu sem posição renderizável");
must(ctx.G.combat.events!==authoritative.state.events&&ctx.G.combat.events.length===4&&
  ctx.G.combat.events[0].t==="hit",
  "fila de eventos foi aliasada ao snapshot e pode entrar em push infinito");
const [hit,taken,burst,say]=ctx.G.combat.events;
must(hit.x===mobA.x&&hit.y===mobA.y&&hit.sx===e20.x&&hit.sy===e20.y&&
  taken.x===e20.x&&taken.y===e20.y&&taken.sx===mobA.x&&taken.sy===mobA.y&&
  burst.x===mobA.x&&burst.y===mobA.y&&say.x===e20.x&&say.y===e20.y,
  "dano/spell não foi reancorado nas entidades visuais e ainda pode aparecer nos cantos");
// O lote só será drenado vários frames depois. O número/projétil deve usar a
// posição corrente, não a coordenada congelada no instante do recebimento.
mobA.x=.56;mobA.y=.47;e20.x=.40;e20.y=.46;
ctx.resolveLiveCombatEventPosition(ctx.G.combat,hit);
ctx.resolveLiveCombatEventPosition(ctx.G.combat,taken);
must(hit.x===.56&&hit.y===.47&&hit.sx===.40&&hit.sy===.46&&
  taken.x===.40&&taken.y===.46&&taken.sx===.56&&taken.sy===.47,
  "evento pendente não acompanhou alvo/origem durante a interpolação");
must(game.includes("const floaterX=ex(e)+(e.dual?0.022:0);"),
  "dano elemental comum continua deslocado para fora do alvo");
must(render.includes("let fx = baseX - textW / 2")&&
  render.includes("let fy = baseY - 64 * scale * p")&&!render.includes("baseX + (16 * scale"),
  "renderer ainda soma meio SQM a coordenadas que já representam o centro do alvo");
  must(hit.ts>=appliedAt&&hit.ts<=appliedAt+50&&taken.ts>hit.ts&&
  burst.ts>taken.ts&&say.ts>=burst.ts&&say.ts<=appliedAt+180,
  "lote autoritativo atrasou as spells ou perdeu a ordem dos efeitos");
const applySrc=game.slice(start,end);
must(!applySrc.includes("restoreCombatSessionState(")&&!applySrc.includes("normalizePlayer("),
  "applyOnlineAuthorityState ainda clona o roster via normalizePlayer no caminho de 1s");
must(ctx.applyOnlineAuthorityState({version:7,activeCharacterId:"10",state:{gridW:30,gridH:20,players:[
  {id:"10",p:{id:"10",name:"Kina",hp:6700}},{id:"20",p:{id:"20",name:"Pally",hp:5700}},
  {id:"30",p:{id:"30",name:"Druideiro",hp:4700}},{id:"40",p:{id:"40",name:"Sorc",hp:3700}},
],mobs:[{id:"a",slug:"retching-horror",hp:650}],events:[]}},null),"snapshot versionado não foi aplicado");
must(p10.hp===6700,"HP do snapshot v7 não entrou");
must(!ctx.applyOnlineAuthorityState({version:7,activeCharacterId:"10",state:{gridW:30,gridH:20,players:[
  {id:"10",p:{id:"10",name:"Kina",hp:1}},{id:"20",p:{id:"20",name:"Pally",hp:1}},
],mobs:[],events:[{t:"hit",dmg:9,mobId:"a",targetId:"a",whoId:"20",x:.1,y:.1,ts:Date.now()}]}},null),
  "mesmo version reaplicou snapshot (tick+SSE)");
must(p10.hp===6700&&ctx.G.combat.events.filter((e)=>e.dmg===9).length===0,
  "snapshot duplicado alterou HP ou enfileirou eventos de novo");
console.log("OK: ticks autoritativos preservam runtime, players ativos e continuidade visual dos monstros.");
