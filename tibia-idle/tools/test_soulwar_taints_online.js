/* Regressão: Goshnar's Taints no caminho autoritativo online. */
"use strict";
const engine=require("../server/authoritative_engine");
function must(ok,msg){if(!ok)throw Error(msg);}

must(engine.HUNTS["dark-thais"]&&engine.HUNTS["dark-thais"].soulWarZone===true&&
  engine.HUNTS["dark-thais"].soulWarZoneMonster==="many-faces","dark-thais sem soulWarZone online");
must(engine.HUNTS["rotten-wasteland"]&&engine.HUNTS["rotten-wasteland"].soulWarZone===true,
  "rotten-wasteland sem soulWarZone online");
must(engine.SOULWAR_TAINTS.length===5&&engine.SOULWAR_TAINTS[4].exp===1.246,
  "tabela de máculas online divergente do idle");

function player(overrides){
  return Object.assign({id:1,name:"TaintTester",voc:"knight",level:800,exp:engine.expForLevel(800),
    hp:5000,mp:2000,gold:1000,skills:{sword:100,axe:10,club:10,dist:10,fist:10,shield:80},
    ml:20,equip:{weapon:{item:"sword"}},supplies:{},lootPouch:{},kills:{},bosses:{},config:{},
    soulWarTaints:{level:0,firstAt:0,bosses:{}}},overrides||{});
}
function huntDesc(p,huntId,taints){
  const member={id:String(p.id),p:JSON.parse(JSON.stringify(p))};
  if(taints)member.p.soulWarTaints=taints;
  return {v:1,savedAt:1000,kind:"hunt",huntId,bossId:null,instanceMode:"non-pvp",
    activeCharacterId:String(p.id),members:[member],
    state:{players:[{id:String(p.id),p:member.p,cx:10,cy:10,x:10.5/30,y:10.5/30}],
      mobs:[{id:"m1",slug:(engine.HUNTS[huntId].soulWarZoneMonster)||"many-faces",
        boss:false,cx:12,cy:10,x:12.5/30,y:10.5/30}],events:[],gridW:30,gridH:30}};
}
function silence(auth){
  for(const mob of auth.authority.mobs||[]){mob.damage=0;mob.attackSpeed=Number.MAX_SAFE_INTEGER;mob.attackAcc=0;
    if(mob.def)mob.def={...mob.def,skills:[],defSkills:[]};}
  for(const item of auth.authority.players||[]){item.p.hp=engine.maxStats(item.p).hp;item.p.mp=engine.maxStats(item.p).mp;item.p.conditions={};}
}

const p0=player();
must(engine.soulwarGrantBossTaint(p0,"goshnar-s-greed",1000)===1&&
  engine.soulwarGrantBossTaint(p0,"goshnar-s-greed",1000)===1&&
  engine.soulwarGrantBossTaint(p0,"goshnar-s-hatred",1000)===2,
  "grant de mácula online não é idempotente/progressivo");
must(engine.soulwarTaintLevel(p0,1000)===2,"nível de mácula após 2 bosses incorreto");

const expired=player({soulWarTaints:{level:5,firstAt:1,bosses:{"goshnar-s-greed":true}}});
must(engine.soulwarTaintLevel(expired,1+14*24*60*60*1000+1)===0,"mácula não expirou em 14 dias");

const zone={huntId:"dark-thais",bossId:null};
must(engine.soulwarInTaintZone(zone)===true&&engine.soulwarInTaintZone({huntId:"cobra-bastion"})===false,
  "detecção de zona Soul War online falhou");
must(engine.soulwarInTaintZone({bossId:"goshnar-s-greed"})===true,
  "boss Goshnar não conta como zona de mácula");

const tainted3=player({soulWarTaints:{level:3,firstAt:1000,bosses:{}}});
must(engine.soulwarTaintDamageMultiplier({huntId:"dark-thais",clock:1000},tainted3)===1.15&&
  engine.soulwarTaintDamageMultiplier({huntId:"cobra-bastion",clock:1000},tainted3)===1,
  "Taint of Pain (+15% recebido) offline da zona");
must(engine.soulwarTaintExpMultiplier({huntId:"dark-thais",clock:1000},
  player({soulWarTaints:{level:5,firstAt:1000,bosses:{}}}))===1.246,
  "EXP da 5ª mácula divergente");

const auth=engine.initializeAuthority(
  huntDesc(player(), "dark-thais", {level:4,firstAt:1000,bosses:{a:true}}),
  "f".repeat(64),1000);
silence(auth);
auth.authority.rngState=1;
const mob=auth.authority.mobs[0];
mob.hp=0;mob.maxHp=1000;mob.boss=false;mob.exp=100;
let prevented=false;
for(let i=0;i<40&&!prevented;i++){
  auth.authority.rngState=i+7;
  mob.hp=0;
  prevented=engine.soulwarTaintPreventMonsterDeath(auth.authority,mob,auth.authority.players[0].p);
}
must(prevented&&mob.hp===mob.maxHp,"Taint of Renewal não restaurou HP do monstro online");

const lossAuth=engine.initializeAuthority(
  huntDesc(player({hp:1000,mp:500}),"dark-thais",{level:5,firstAt:1000,bosses:{}}),
  "g".repeat(64),1000);
silence(lossAuth);
lossAuth.authority.soulwarLossAcc=9999;
const beforeHp=lossAuth.authority.players[0].p.hp;
const beforeMp=lossAuth.authority.players[0].p.mp;
engine.soulwarTaintTick(lossAuth.authority,1,lossAuth.authority.clock);
must(lossAuth.authority.players[0].p.hp===beforeHp-Math.ceil(beforeHp*.10)&&
  lossAuth.authority.players[0].p.mp===beforeMp-Math.ceil(beforeMp*.10),
  "Taint of Loss não tirou 10% HP/MP a cada 10s");

const spawnAuth=engine.initializeAuthority(
  huntDesc(player(),"dark-thais",{level:2,firstAt:1000,bosses:{}}),
  "h".repeat(64),1000);
silence(spawnAuth);
const beforeCount=spawnAuth.authority.mobs.length;
let spawned=false;
for(let i=0;i<80&&!spawned;i++){
  spawnAuth.authority.rngState=i+3;
  spawnAuth.authority.soulwarTaintSpawnCd=0;
  spawned=engine.soulwarTaintSpawnNearPlayer(spawnAuth.authority,spawnAuth.authority.players[0],
    spawnAuth.authority.clock+1000);
}
must(spawned&&spawnAuth.authority.mobs.length===beforeCount+1,
  "Taint of Duplication não spawnou criatura perto do player");

const dmgAuth=engine.initializeAuthority(
  huntDesc(player({soulWarTaints:{level:3,firstAt:1000,bosses:{}}}),"dark-thais",
    {level:3,firstAt:1000,bosses:{}}),
  "i".repeat(64),1000);
silence(dmgAuth);
const item=dmgAuth.authority.players[0];
const attacker={slug:"many-faces",boss:false,def:{}};
const base=engine.absorbIncomingDamage(dmgAuth.authority,item,item.p,1000,dmgAuth.authority.clock,
  {x:.5,y:.5},"physical",attacker);
item.p.soulWarTaints={level:0,firstAt:0,bosses:{}};
const clean=engine.absorbIncomingDamage(dmgAuth.authority,item,item.p,1000,dmgAuth.authority.clock,
  {x:.5,y:.5},"physical",attacker);
must(base>clean,"dano recebido com mácula 3 não aumentou online");

console.log("OK: Soul War taints online — zona, grant/expiração, dano, EXP, renewal, loss e duplication.");
