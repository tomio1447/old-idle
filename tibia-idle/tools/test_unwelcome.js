/* The Unwelcome (Feast of Souls) — mecânica oficial:
 * - imune a TODO dano (resist 100 em todos os elementos; sem cura ao hit);
 * - Wormlings nascem segundos após entrar e respawnam sem parar; ao morrer
 *   explodem ~750 earth em raio 2;
 * - Brother Worm (290k, fraca a fire, cura com death) aparece/some na sala
 *   e divide a vida do boss — ela caindo, o Unwelcome cai (boss-defeated).
 */
"use strict";
const engine=require("../server/authoritative_engine");
function must(ok,msg){if(!ok)throw Error(msg);}

const PLAYER={id:"1",name:"Tank",voc:"knight",level:900,exp:engine.expForLevel(900),
  hp:13600,mp:5000,skills:{fist:10,sword:10,axe:10,club:10,dist:10,shield:80},
  equip:{},supplies:{},lootPouch:{},kills:{},bosses:{},config:{}};

function start(){
  const member={id:"1",p:JSON.parse(JSON.stringify(PLAYER))};
  return {v:1,savedAt:1000,kind:"boss",bossId:"the-unwelcome",
    huntId:"the-unwelcome-room",instanceMode:"boss",activeCharacterId:"1",
    members:[member],
    state:{gridW:30,gridH:30,
      players:[{id:"1",p:member.p,cx:15,cy:20,x:15.5/30,y:20.5/30}],
      mobs:[{id:"b",slug:"the-unwelcome",boss:true,hp:290000,maxHp:290000,
        cx:15,cy:15,x:15.5/30,y:15.5/30}],
      events:[]}};
}
function advance(cur,dt){
  return JSON.parse(engine.advanceAuthorityState(JSON.stringify(cur),dt,
    (cur.authority.clock||0)+dt).state);
}
/* Isola as mecânicas em teste: mobs não atacam (inclusive os recém-
 * spawnados a cada step) e o jogador não ataca — ninguém morre antes da
 * hora, o dano de explosão vem só do hook de morte. */
function silenceAll(a){
  for(const m of a.mobs||[]){m.damage=0;m.attackAcc=-1e9;
    if(m.def)m.def=Object.assign({},m.def,{skills:[]});}
  for(const s of a.pendingSpawns||[])if(s&&s.mob){s.mob.damage=0;s.mob.attackAcc=-1e9;
    if(s.mob.def)s.mob.def=Object.assign({},s.mob.def,{skills:[]});}
  for(const p of a.players||[])p.attackAcc=-1e9;
}
const brotherOf=(a)=>(a.mobs||[]).find((m)=>m&&m.unwelcomeLinked)||null;
const bossOf=(a)=>(a.mobs||[]).find((m)=>m&&m.boss)||null;

/* ---------- imunidade (def do engine) ---------- */
const desc=engine.initializeAuthority(start(),"b".repeat(64),1000);
const pend=desc.authority.arenaBossSpawn&&desc.authority.arenaBossSpawn.pending;
must(pend&&pend.def&&pend.def.resist&&pend.def.resist.physical===100&&
  pend.def.resist.death===100&&pend.def.resist.fire===100&&!pend.def.deathAbsorbs,
  "boss pending não está imune a todo dano (e sem deathAbsorbs)");

/* ---------- simulação (~steps externos de 1s; auth.clock é o tempo real) ---------- */
let cur=JSON.parse(JSON.stringify(desc));
silenceAll(cur.authority);
const line=[];
for(let i=0;i<120;i++){
  cur=advance(cur,1000);
  silenceAll(cur.authority);
  const a=cur.authority;
  line.push({clock:a.clock,
    inField:!!brotherOf(a),
    pending:!!(a.pendingSpawns||[]).find((s)=>s&&s.mob&&s.mob.unwelcomeLinked),
    wormlings:(a.mobs||[]).filter((m)=>m&&m.unwelcomeWormling).length});
  if(a.ended)break;
}
must(!cur.authority.ended,"luta não pode terminar sem a Brother Worm morrer");
must(bossOf(cur.authority),"boss sumiu dos mobs");
const startedAt=cur.authority.unwelcome.startedAt;

// Wormlings: primeira nascida segundos após a entrada (6s + blink ~2s).
const firstW=line.find((t)=>t.wormlings>0);
must(firstW&&firstW.clock>=startedAt+5000&&firstW.clock<=startedAt+20000,
  "wormling não nasceu segundos após a entrada (first="+(firstW&&firstW.clock)+
  " startedAt="+startedAt+")");
must(Math.max(...line.map((t)=>t.wormlings))<=4,
  "cap de wormlings estourado (>4 simultâneos)");
must(line.filter((t)=>t.wormlings>0).length>20,
  "wormlings não continuam respawnando durante a luta");

// Brother Worm: aparece ~15s após entrar (com blink ~2s → até ~20s).
const firstB=line.find((t)=>t.inField||t.pending);
must(firstB&&firstB.clock>=startedAt+14000&&firstB.clock<=startedAt+35000,
  "Brother Worm não apareceu na janela esperada (first="+(firstB&&firstB.clock)+")");
// some e reaparece: janela contígua fora de campo após estar em campo.
let seenIn=false,gapStart=0,gaps=[],reappeared=false;
for(const t of line){
  const present=t.inField||t.pending;
  if(present){
    if(gapStart){gaps.push(t.clock-gapStart);gapStart=0;if(seenIn)reappeared=true;}
    seenIn=true;
  }else if(seenIn&&!gapStart)gapStart=t.clock;
}
must(gaps.some((g)=>g>=15000),
  "Brother Worm nunca saiu de campo após aparecer (oficial: some/reaparece) — gaps:"+
  JSON.stringify(gaps));
must(reappeared,"Brother Worm não reapareceu após a janela escondida");

// Stats oficiais da Brother Worm.
const bro=brotherOf(cur.authority)||(cur.authority.unwelcome&&cur.authority.unwelcome.brother);
must(bro&&bro.maxHp===290000,"Brother Worm sem 290k hp");
must(bro.def&&bro.def.resist&&bro.def.resist.fire===-10,
  "Brother Worm sem fraqueza a fire (-10)");
must(bro.def&&bro.def.absorbs&&bro.def.absorbs.death===100,
  "Brother Worm sem cura por death (-100%)");
must(bro.exp===0,"Brother Worm não deveria dar exp (oficial: 0)");

/* ---------- vida compartilhada ---------- */
const liveBro=brotherOf(cur.authority);
must(liveBro,"Brother Worm fora de campo no ponto do teste de pool");
liveBro.hp=50000; // desserializar → reconciliação pelo flag unwelcomeLinked
// silencia a cura própria (defSkills) para o assert de espelho ser exato —
// ela rola no intervalo próprio e pode regenerar dentro do advance.
if(liveBro.def)liveBro.def=Object.assign({},liveBro.def,{skills:[],defSkills:[]});
cur=advance(cur,1000);
must(bossOf(cur.authority).hp===50000&&bossOf(cur.authority).maxHp===290000,
  "barra do boss não espelha a vida compartilhada da Brother Worm");

/* ---------- explosão do Wormling (~750 earth, raio 2) ---------- */
const wormling=cur.authority.mobs.find((m)=>m.unwelcomeWormling);
must(wormling,"sem wormling vivo para o teste de explosão");
wormling.cx=14;wormling.cy=20;wormling.x=14.5/30;wormling.y=20.5/30;
wormling.hp=0;
const hpBefore=cur.authority.players[0].p.hp;
cur=advance(cur,1000);
const hpAfter=cur.authority.players[0].p.hp;
must(hpBefore-hpAfter>=500&&hpBefore-hpAfter<=750,
  "explosão do wormling fora de ~750 earth (delta="+(hpBefore-hpAfter)+")");
must((cur.state.events||[]).some((e)=>e.t==="taken"&&e.el==="earth"),
  "explosão não emitiu evento taken de earth");

/* ---------- Brother Worm morta → boss cai (vida compartilhada) ---------- */
// A Brother pode estar escondida neste instante — a pool morre do mesmo
// jeito (o tick reconcilia via auth.unwelcome.brother).
const bro2=brotherOf(cur.authority)||
  (cur.authority.unwelcome&&cur.authority.unwelcome.brother);
must(bro2,"Brother Worm não existe para o teste de morte");
bro2.hp=0;
cur=advance(cur,1000);
must(!brotherOf(cur.authority)&&(!bossOf(cur.authority)||bossOf(cur.authority).hp<=0),
  "morte da Brother Worm não derrubou o boss (vida compartilhada)");
cur=advance(cur,1000);
must(cur.authority.ended===true&&cur.authority.terminalReason==="boss-defeated"&&
  cur.authority.bossDefeated===true,
  "kill do boss não encerrou como boss-defeated (crédito/reward do Unwelcome)");

console.log("ok: the unwelcome — imunidade, wormlings (cap+respawn+explosão 750), " +
  "brother worm (290k, fire-10, cura death, ciclo aparece/some), vida compartilhada");
