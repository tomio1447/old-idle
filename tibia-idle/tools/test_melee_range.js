/* Regressão: melee não bate à distância (jogador e monstro).
 *
 *  1) ENGINE: o ataque básico do jogador respeita playerAttackRangeSQM
 *     (knight = 1 SQM). Antes o `if(!acted)` atacava o alvo de qualquer
 *     distância — knight derrubava mob do outro lado da sala online.
 *  2) ENGINE+CLIENTE: skill de monstro SEM range usa o alcance de ataque
 *     do próprio monstro (melee = 1) em vez de "99 sem limite".
 *  3) O fluxo anda-até-o-alvo continua funcionando: longe não bate, colado
 *     volta a bater.
 */
"use strict";
const crypto=require("crypto"),fs=require("fs"),path=require("path"),vm=require("vm");
const engine=require("../server/authoritative_engine.js");
function must(ok,msg){if(!ok)throw Error(msg);}

/* ---------------- engine: range das skills de monstro ---------------- */
must(engine.mobSkillRangeSQM({max:100},{def:{targetDistance:1}})===1,
  "skill sem range em monstro melee deveria valer 1 SQM");
must(engine.mobSkillRangeSQM({max:100,range:7},{def:{targetDistance:1}})===7,
  "skill com range explícito não pode ser limitada a 1");
must(engine.mobSkillRangeSQM({max:100},{def:{targetDistance:4}})===4,
  "monstro ranged (targetDistance>1) deve manter o alcance de ataque dele");
must(engine.mobSkillRangeSQM({radius:2},{def:{targetDistance:1}})===2,
  "radius continua valendo como raio (sem mudança)");

/* ---------------- engine: knight NÃO bate de longe ---------------- */
function makeKnight(id,name,cx,cy){
  return {id,name,p:{id,name,voc:"knight",level:300,hp:20000,mp:3000,melee:110,shield:110,dist:20,
    equip:{weapon:{item:"test-blade"}},config:{attackMode:"full"},stamina:42*60,
    gold:0},cx,cy,x:(cx+.5)/30,y:(cy+.5)/30};
}
engine.ITEMS["test-blade"]={n:"test blade",t:"sword",type:"sword",attack:5000,atk:5000,s:"weapon"};
function knightBossDesc(){
  return engine.initializeAuthority({
    kind:"boss",bossId:"the-pale-worm",huntId:"the-pale-worm-room",instanceMode:"boss",
    activeCharacterId:"1",
    members:[makeKnight("1","K",15,25)],
    state:{gridW:30,gridH:30,
      players:[{id:"1",cx:15,cy:25,x:.5,y:.83}],
      mobs:[{id:"b",slug:"the-pale-worm",boss:true,hp:420000,maxHp:420000,cx:15,cy:5,x:.5,y:.17}],
      arenaBossSpawn:{spawned:true}},
  },crypto.randomBytes(8).toString("hex"),1000);
}
function bossHp(d){
  const b=(d.authority.mobs||[]).find((m)=>m.boss);
  return b?b.hp:0;
}
// 2 ticks iniciais: knight a ~20 SQM — NENHUM dano básico pode sair.
let d=knightBossDesc();
for(let i=0;i<2;i++){
  d=engine.advanceAuthorityState(d,1000,1000+i*1000);
  d=JSON.parse(d.state);
}
must(bossHp(d)===420000,
  "GRAVE: knight acertou o boss de longe (ataque básico sem gate de alcance)");
// Andando até o boss: em ~60 ticks o knight chega colado e volta a bater.
for(let i=2;i<62;i++){
  d=engine.advanceAuthorityState(d,1000,1000+i*1000);
  d=JSON.parse(d.state);
}
must(bossHp(d)<420000,
  "knight parou de bater mesmo depois de chegar ao alcance melee");
const kpos=d.authority.players[0],kboss=(d.authority.mobs||[]).find((m)=>m.boss);
must(kpos&&kboss&&Math.max(Math.abs(kpos.cx-kboss.cx),Math.abs(kpos.cy-kboss.cy))<=1,
  "knight deveria estar colado no boss antes do dano sair");

/* ---------------- engine: monstro melee NÃO bate de longe ---------------- */
function mobFightDesc(mobDist,hp){
  hp=hp||500;
  return engine.initializeAuthority({
    kind:"hunt",huntId:"rats",instanceMode:"non-pvp",activeCharacterId:"1",
    members:[makeKnight("1","K",15,15)],
    state:{gridW:30,gridH:30,
      players:[{id:"1",cx:15,cy:15,x:.5,y:.5}],
      mobs:[{id:"m1",slug:"cave-rat",boss:false,hp,maxHp:hp,cx:15+mobDist,cy:15,x:.5,y:.5}]},
  },crypto.randomBytes(8).toString("hex"),1000);
}
function playerHp(d){return (d.authority.players||[])[0].p.hp;}
// hp de referência: o engine clamp pelo maxStats da vocação/nível.
let base=JSON.parse(JSON.stringify(mobFightDesc(0)));
base=engine.initializeAuthority(base,crypto.randomBytes(8).toString("hex"),1000);
const hpBase=(base.authority.players||[])[0].p.hp;
d=mobFightDesc(8);
for(let i=0;i<2;i++){
  d=engine.advanceAuthorityState(d,1000,1000+i*1000);
  d=JSON.parse(d.state);
}
must(playerHp(d)===hpBase,
  "GRAVE: monstro melee acertou o jogador de longe no engine");
// cave-rat tem skills sem range? garante o caso: skill física sem range.
engine.MONSTERS["cave-rat"].skills=[{el:"physical",min:10,max:20,int:1000,ch:100}];
d=mobFightDesc(8);
for(let i=0;i<2;i++){
  d=engine.advanceAuthorityState(d,1000,1000+i*1000);
  d=JSON.parse(d.state);
}
must(playerHp(d)===hpBase,
  "skill física sem range do monstro acertou de longe no engine (deveria ser melee)");
// Colado: melee + skill física saem. Dano alto temporário para o teste
// não depender da rolagem de mitigaçao (armor/shield do knight).
const oldDmg=engine.MONSTERS["cave-rat"].damage;
engine.MONSTERS["cave-rat"].damage=500;
d=mobFightDesc(1,500000);
for(let i=0;i<6;i++){
  d=engine.advanceAuthorityState(d,1000,1000+i*1000);
  d=JSON.parse(d.state);
}
must(playerHp(d)<hpBase,
  "monstro não atacou nem colado no jogador (regressão do gate)");
engine.MONSTERS["cave-rat"].damage=oldDmg;
delete engine.MONSTERS["cave-rat"].skills;

/* ---------------- cliente (vm): mesma regra no combat.js ---------------- */
const js=path.join(__dirname,"..","game","js");
const ctx={window:{},console,Math,Date,Map,Set,document:undefined};ctx.window=ctx;vm.createContext(ctx);
for(const f of ["gamedata.js","monsterdata.js","mobsheetdata.js","monsters.js","soulwar.js","tileflags.js"])
  vm.runInContext(fs.readFileSync(path.join(js,f),"utf8"),ctx,{filename:f});
// moveInfo/monsterRangeSQM reais do gridai (mesma regra do jogo)
ctx.moveInfo=(slug)=>({speed:100});
ctx.monsterTargetDistance=(mob)=>Number(mob&&mob.def&&mob.def.targetDistance)||1;
ctx.monsterRangeSQM=(mob)=>{
  const mi=ctx.moveInfo(mob.slug);
  const td=ctx.monsterTargetDistance(mob);
  if(td>1)return Math.max(td,mi.atkRange?Math.min(mi.atkRange,7):4);
  return 1;
};
vm.runInContext(fs.readFileSync(path.join(js,"combat.js"),"utf8"),ctx,{filename:"combat.js"});
must(ctx.mobSkillRangeSQM({max:100},{slug:"cave-rat",def:{targetDistance:1}})===1,
  "cliente: skill sem range em monstro melee deveria valer 1 SQM");
must(ctx.mobSkillRangeSQM({max:100,range:7},{slug:"cave-rat",def:{targetDistance:1}})===7,
  "cliente: skill com range explícito não pode ser limitada a 1");
must(ctx.mobSkillRangeSQM({max:100},{slug:"hunter",def:{targetDistance:4}})===4,
  "cliente: monstro ranged deve manter o alcance de ataque dele");

console.log("ok: melee não bate à distância (jogador e monstro, engine + cliente)");
