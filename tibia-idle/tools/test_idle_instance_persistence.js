/* Regressão: instância idle continua em aba oculta/reload e stamina fica cheia. */
"use strict";
const fs=require("fs"),path=require("path"),vm=require("vm");
const game=path.join(__dirname,"..","game"),src=fs.readFileSync(path.join(game,"js","game.js"),"utf8");
const combat=fs.readFileSync(path.join(game,"js","combat.js"),"utf8");
function must(ok,msg){if(!ok)throw Error(msg);}

const storage=new Map();
const ctx={
  console,JSON,Math,Date,Map,Set,Promise,setTimeout,clearTimeout,
  INSTANCE_SESSION_KEY:"idle-instance-test",ACTIVE_CHARACTER_KEY:"active-test",
  FULL_STAMINA_SECONDS:42*3600,TICK:100,
  localStorage:{
    getItem:k=>storage.has(k)?storage.get(k):null,
    setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k),
  },
  G:{p:null,combat:null},GAMEDATA:{hunts:{rats:{name:"Rats"}},monsters:{}},
  readRoster:()=>({}),writeRoster:()=>{},normalizePlayer:p=>p,
  maxStats:p=>({hp:p.maxHp||100,mp:p.maxMp||100}),ensureCell:()=>{},
  addLog:()=>{},saveCharacterToRoster:()=>{},tickAccessoryCharges:()=>{},
  imbTickAll:()=>{},preyTick:()=>{},blessingPriceForLevel:l=>Math.max(1,l||1)*500,
  spendGold(p,n){if((p.gold||0)<n)return false;p.gold-=n;return true;},
};
ctx.window=ctx;vm.createContext(ctx);
const sessionStart=src.indexOf("function clearInstanceSession");
const sessionEnd=src.indexOf("\nfunction save()",sessionStart);
must(sessionStart>0&&sessionEnd>sessionStart,"funções de sessão não encontradas");
vm.runInContext(src.slice(sessionStart,sessionEnd),ctx);

const p1={id:"p1",name:"Knight",level:100,gold:0,hp:90,mp:50,stamina:1};
const p2={id:"p2",name:"Druid",level:100,gold:0,hp:80,mp:60,stamina:2};
const e1={id:"p1",name:"Knight",p:p1},e2={id:"p2",name:"Druid",p:p2};
ctx.G.p=p1;ctx.G.combat={huntId:"rats",instanceMode:"non-pvp",huntMap:{rows:["huge"]},
  players:[e1,e2],player:e1,events:[{t:"hit"}],mobs:[{id:"m1",slug:"rat",target:e2}],
  stats:{startedAt:1}};
// Reproduz o ciclo visto após um tick autoritativo antigo.
const authorityDescriptor={state:ctx.G.combat};ctx.G.combat._authorityDescriptor=authorityDescriptor;
const saved=ctx.persistActiveInstance();
must(saved&&saved.members.length===2,"snapshot não preserva toda a party");
must(p1.stamina===42*3600&&p2.stamina===42*3600,"snapshot não mantém stamina cheia");
const disk=JSON.parse(storage.get("idle-instance-test"));
must(disk.state&&!disk.state.huntMap&&!disk.state.events&&!disk.state._authorityDescriptor,
  "snapshot persistiu mapa/eventos pesados ou ciclo autoritativo");
must(disk.state.mobs[0].target.__targetId==="p2","identidade do alvo não foi serializada");
must(ctx.readInstanceSession().huntId==="rats","sessão persistida não pode ser relida");

const advanceStart=src.indexOf("function reviveDownedParty");
const advanceEnd=src.indexOf("\n/* ------------------------------------------------------------ loop */",advanceStart);
must(advanceStart>0&&advanceEnd>advanceStart,"motor idle não encontrado");
vm.runInContext(src.slice(advanceStart,advanceEnd),ctx);
let ticks=0,moves=0,stops=0,saves=0;
ctx.combatTick=(c,p,dt,now)=>{ticks++;c.stats.time=(c.stats.time||0)+dt;};
ctx.updateGridMovement=()=>{moves++;};ctx.stopHunt=()=>{stops++;ctx.G.combat=null;};ctx.save=()=>{saves++;};
ctx.G.p=p1;ctx.G.combat={players:[e1,e2],player:e1,events:[],stats:{}};
let result=ctx.advanceIdleInstance(1000,10000,{silent:true,step:100});
must(result.processed===1000&&ticks===10&&moves===10,"background não avança combate + movimento em tempo real");
must(p1.stamina===42*3600&&p2.stamina===42*3600,"combate em background gastou stamina");

// Wipe simultâneo encerra a instância antes de qualquer revive agendado.
p1.hp=100;p2.hp=100;e1.reviveAt=0;e2.reviveAt=0;ticks=0;
ctx.G.p=p1;ctx.G.combat={players:[e1,e2],player:e1,events:[],stats:{}};
ctx.combatTick=(c)=>{ticks++;for(const e of c.players)e.p.hp=0;};
result=ctx.advanceIdleInstance(500,20000,{silent:true,step:100});
must(result.ended&&result.reason==="party-wipe"&&ticks===1&&stops===1&&saves===1,
  "wipe da party não encerrou imediatamente a instância");

must(!/p\.stamina\s*=\s*Math\.max\(0,\s*p\.stamina\s*-/.test(combat+src),
  "ainda existe gasto de stamina em combate/offline");
must(combat.includes('const spawnNow=(c&&c._tickNow)||Date.now()')&&
  combat.includes('startedAt: spawnNow')&&combat.includes('tickSpawnQueue(c,now)'),
  "waves novas não usam o relógio histórico durante o catch-up");
must(src.includes('document.hidden){G.last=ts;return;}')&&
  src.includes('advanceIdleInstance(elapsed')&&src.includes('window.addEventListener("pagehide",save)')&&
  src.includes('resumeIdleInstance(instanceSession).then(startRuntime)'),
  "aba oculta/fechamento/reload não estão ligados ao motor persistente");
console.log("OK: instância persiste, background move/combate, wipe encerra e stamina permanece em 42h.");
