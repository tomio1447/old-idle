/* Naga overdamage: basic_attack é name="combat" (não melee). O import copiava
 * max(skills) em damage e o engine somava melee extra todo attackSpeed.
 * Também cobre interval/chance, loot pouch (platinum/potions) e drops %. */
"use strict";
const engine=require("../server/authoritative_engine");
function must(ok,msg){if(!ok)throw Error(msg);}

function skillMax(def){
  let m=0;for(const sk of def.skills||[])m=Math.max(m,Number(sk.max)||0);return m;
}
function player(overrides){
  return Object.assign({id:1,name:"Tank",voc:"knight",level:400,exp:engine.expForLevel(400),
    hp:999999,mp:999999,gold:0,skills:{sword:80,axe:10,club:10,dist:10,fist:10,shield:80},
    equip:{weapon:{item:"sword"}},supplies:{},lootPouch:{},ammo:{},kills:{},bosses:{},config:{spellAttack:false}},overrides||{});
}
function desc(p,slug){
  const member={id:String(p.id),p:JSON.parse(JSON.stringify(p))};
  return {v:1,savedAt:1000,kind:"hunt",huntId:"marapur-nagas",instanceMode:"non-pvp",
    activeCharacterId:String(p.id),members:[member],
    state:{players:[{id:String(p.id),p:member.p,cx:10,cy:10,x:10.5/30,y:10.5/30}],
      mobs:[{id:"naga-one",slug,hp:999999,maxHp:999999,cx:11,cy:10,x:11.5/30,y:10.5/30}],events:[]}};
}
function tick(authJson,elapsed,at){
  return JSON.parse(engine.advanceAuthorityState(JSON.stringify(authJson),elapsed,at).state);
}

const archer=engine.MONSTERS["naga-archer"];
const warrior=engine.MONSTERS["naga-warrior"];
const makara=engine.MONSTERS.makara;
must(archer&&warrior&&makara,"catálogo sem naga-archer/warrior/makara");
must((archer.skills||[]).length>=4&&(warrior.skills||[]).length>=3&&(makara.skills||[]).length>=4,
  "nagas/makara sem a lista de attacks do Canary");
must(engine.mobHasExtractedMelee(archer)===false,
  "naga-archer deveria NÃO ter melee extraído (name=combat basic_attack)");
must(engine.mobHasExtractedMelee(warrior)===false,
  "naga-warrior deveria NÃO ter melee extraído");
must(engine.mobHasExtractedMelee(makara)===false,
  "makara deveria NÃO ter melee extraído");
must(Number(archer.damage)===skillMax(archer),
  "naga-archer.damage deveria ser cópia de max(skills) no JSON atual");

const rat=engine.MONSTERS.rat;
must(rat&&engine.mobHasExtractedMelee(rat)===true,
  "rato (name=melee) deveria manter o golpe básico extraído");

const plat=archer.loot&&archer.loot.find((l)=>l.item==="platinum-coin");
must(plat&&plat.chance<=100&&plat.chance>=90,
  "loot naga-archer platinum deveria estar em % Canary (100000→100), veio "+(plat&&plat.chance));
const scales=archer.loot&&archer.loot.find((l)=>l.item==="naga-archer-scales");
must(scales&&scales.chance>1&&scales.chance<30,
  "naga-archer-scales chance fora da faixa percent (Canary 15050→15.05)");

const tank=player({hp:999999});
const start=engine.initializeAuthority(desc(tank,"naga-archer"),"a".repeat(64),1000);
start.authority.players[0].attackAcc=-100000;
start.authority.mobs[0].hp=start.authority.mobs[0].maxHp=999999;
start.authority.mobs[0].attackAcc=0;

const after1s=tick(start,1000,2000);
const taken1s=after1s.state.events.filter((e)=>e.t==="taken");
must(taken1s.length===0,
  "naga-archer não pode bater no 1º segundo (attackSpeed 2000), veio "+taken1s.length);

const after2s=tick(after1s,1000,3000);
const taken2s=after2s.state.events.filter((e)=>e.t==="taken");
const extraMelee=taken2s.filter((e)=>e.el==="physical"&&e.missile==="small-stone");
must(extraMelee.length===0,
  "naga-archer disparou melee extra (small-stone) no turno de 2s: "+JSON.stringify(taken2s.map((e)=>({el:e.el,fx:e.fx,miss:e.missile,dmg:e.dmg}))));

let cursor=after2s;
let totalDmg=0,takenN=0,maxBurst=0;
for(let i=0;i<18;i++){
  cursor=tick(cursor,1000,4000+i*1000);
  const hits=cursor.state.events.filter((e)=>e.t==="taken");
  const burst=hits.reduce((s,e)=>s+(Number(e.dmg)||0),0);
  totalDmg+=burst;takenN+=hits.length;maxBurst=Math.max(maxBurst,burst);
  const extraMelee=hits.filter((e)=>e.el==="physical"&&e.missile==="small-stone");
  must(extraMelee.length===0,"naga-archer melee extra no tick "+i+": "+extraMelee.length);
}
must(totalDmg<10*Number(archer.damage),
  "DPS naga-archer ainda parece golpe cheio a cada swing: total="+totalDmg+" cap="+10*archer.damage);
must(maxBurst<Number(archer.damage)*3.5,
  "burst de um turno naga-archer acima do teto das skills: "+maxBurst);

const wStart=engine.initializeAuthority(desc(player({id:2}),"naga-warrior"),"b".repeat(64),1000);
wStart.authority.players[0].attackAcc=-100000;
wStart.authority.mobs[0].hp=wStart.authority.mobs[0].maxHp=999999;
wStart.authority.mobs[0].attackAcc=0;
const w1=tick(wStart,1000,2000);
must(w1.state.events.filter((e)=>e.t==="taken").length===0,"naga-warrior bateu em 1s");
const w2=tick(w1,1000,3000);
const wHits=w2.state.events.filter((e)=>e.t==="taken");
must(wHits.length<=3,
  "naga-warrior no 1º swing deveria respeitar chance/interval, veio "+wHits.length+" hits");

const fireInt=5000;
const skillPlayer=player({id:3});
const skillDesc=desc(skillPlayer,"naga-archer");
const skillAuth=engine.initializeAuthority(skillDesc,"c".repeat(64),1000);
const skillMob=skillAuth.authority.mobs[0];
skillMob.damage=0;skillMob.attackSpeed=1000;skillMob.attackAcc=1000;
skillMob.def=Object.assign({},skillMob.def,{skills:[{el:"death",min:40,max:40,int:fireInt,ch:100,range:7,n:"nagadeathattack"}],defSkills:[]});
skillAuth.authority.players[0].attackAcc=-100000;
const s1=tick(skillAuth,1000,2000);
const deathOnce=s1.state.events.filter((e)=>e.t==="taken"&&e.el==="death").length;
const s2=tick(s1,1000,3000);
const deathTwice=s2.state.events.filter((e)=>e.t==="taken"&&e.el==="death").length;
must(deathOnce===1&&deathTwice===0,
  "skill naga ignorou interval (int=5000): "+deathOnce+" depois "+deathTwice);

const lootP=player({id:4,gold:0,supplies:{},lootPouch:{}});
engine.creditHuntLoot(lootP,"platinum-coin",5);
engine.creditHuntLoot(lootP,"strong-health-potion",2);
engine.creditHuntLoot(lootP,"hunting-spear",1);
engine.creditHuntLoot(lootP,"gold-coin",10);
must(lootP.gold===5*100+10,"platinum/gold não viraram gold: "+lootP.gold);
must(!lootP.lootPouch["platinum-coin"]&&!lootP.lootPouch["gold-coin"],
  "moedas ocuparam a loot pouch");
must((lootP.supplies["strong-health-potion"]||0)===2,
  "potion de hunt não foi para supplies");
must((lootP.lootPouch["hunting-spear"]||0)===1,
  "equipamento de hunt não foi para a loot pouch");

const ratDef=engine.MONSTERS.rat;
const oldLoot=ratDef.loot;
ratDef.loot=[{item:"platinum-coin",chance:100,max:2,min:2},
  {item:"strong-health-potion",chance:100,max:1},
  {item:"sword",chance:100,max:1}];
const killP=player({id:5,gold:0,supplies:{},lootPouch:{}});
const killDesc=desc(killP,"rat");
killDesc.huntId="rats";
const killAuth=engine.initializeAuthority(killDesc,"d".repeat(64),1000);
killAuth.authority.mobs[0].hp=1;killAuth.authority.mobs[0].damage=0;
killAuth.authority.mobs[0].def=Object.assign({},killAuth.authority.mobs[0].def,{skills:[],defSkills:[],loot:ratDef.loot});
killAuth.authority.players[0].attackAcc=5000;
const killed=tick(killAuth,1000,2000);
ratDef.loot=oldLoot;
const kp=killed.authority.players[0].p;
must(kp.gold>=200,"kill autoritativo não creditou platinum como gold: "+kp.gold);
must((kp.supplies["strong-health-potion"]||0)>=1,"kill não enviou potion para supplies");
must((kp.lootPouch.sword||0)>=1,"kill não enviou sword para a loot pouch");
must(!kp.lootPouch["platinum-coin"],"platinum ficou na pouch após o kill");

console.log("OK: naga interval/chance, sem melee extra, loot pouch platinum/potion/equip.");
