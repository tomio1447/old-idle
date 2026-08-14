/* Diamond arrow, quiver, bow vs crossbow vs arremesso — motor autoritativo. */
"use strict";
const engine=require("../server/authoritative_engine");
function must(ok,msg){if(!ok)throw Error(msg);}
function clone(v){return JSON.parse(JSON.stringify(v));}
function descriptor(p,mobs){
  const member={id:String(p.id),p:clone(p)};
  return {v:1,savedAt:1000,kind:"hunt",huntId:"rats",instanceMode:"non-pvp",activeCharacterId:String(p.id),
    members:[member],state:{gridW:30,gridH:30,players:[{id:String(p.id),p:member.p,cx:10,cy:10,x:10.5/30,y:10.5/30}],
      mobs:mobs||[{id:"rat-one",slug:"rat",cx:11,cy:10,x:11.5/30,y:10.5/30}],events:[]}};
}
function silence(auth){
  for(const mob of auth.mobs||[]){mob.damage=0;mob.attackAcc=-100000;mob.def=Object.assign({},mob.def,{skills:[]});}
}
function paladin(extra){
  return Object.assign({id:1,name:"RP",voc:"paladin",level:200,exp:engine.expForLevel(200),hp:2000,mp:800,gold:50000,ml:20,
    skills:{fist:10,sword:10,axe:10,club:10,dist:90,shield:40},
    equip:{weapon:{item:"bow"},shield:{item:"quiver"},ammo:{item:"arrow"}},
    supplies:{},lootPouch:{},kills:{},bosses:{},config:{spellAttack:false,combo:[]}},extra||{});
}

must(engine.weaponAmmoKind(engine.ITEMS.bow,"bow")==="arrow","bow atira flecha");
must(engine.weaponAmmoKind(engine.ITEMS.crossbow,"crossbow")==="bolt","crossbow atira bolt");
must(engine.weaponAmmoKind(engine.ITEMS.arbalest,"arbalest")==="bolt","arbalest é besta (bolt)");
must(engine.weaponAmmoKind(engine.ITEMS["thorn-spitter"],"thorn-spitter")==="bolt","thorn spitter é besta");
must(engine.weaponAmmoKind(engine.ITEMS.spear,"spear")===null,"spear é arremesso, sem quiver");
must(engine.ammoCompatibleWithWeapon(engine.ITEMS.arrow,"bow"),"flecha serve no arco");
must(!engine.ammoCompatibleWithWeapon(engine.ITEMS.bolt,"bow"),"bolt NÃO serve no arco");
must(engine.ammoCompatibleWithWeapon(engine.ITEMS.bolt,"crossbow"),"bolt serve na besta");
must(!engine.ammoCompatibleWithWeapon(engine.ITEMS.arrow,"crossbow"),"flecha NÃO serve na besta");
must(engine.ammoCompatibleWithWeapon(engine.ITEMS.bolt,"arbalest"),"bolt serve no arbalest");
must(!engine.ammoCompatibleWithWeapon(engine.ITEMS.arrow,"spear"),"flecha não casa com spear");

const diamond=engine.ITEMS["diamond-arrow"];
must(diamond&&diamond.areaMatrix&&diamond.noMiss&&diamond.atk===37&&Number(diamond.lvl||diamond.level)===150,
  "diamond arrow: atk 37, lvl 150, noMiss, matriz");
const cells=diamond.areaMatrix.reduce((n,row)=>n+row.filter(Boolean).length,0);
must(cells===21,"diamond arrow é 5x5 sem cantos = 21 SQM");
must(engine.ITEMS["burst-arrow"].areaMatrix.reduce((n,row)=>n+row.filter(Boolean).length,0)===9,
  "burst arrow é 3x3 = 9 SQM");

const dummyAuth={gridW:30,gridH:30};
const origin={cx:10,cy:10};
const pack=[];
for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){
  pack.push({id:"m"+dx+","+dy,hp:10,cx:origin.cx+dx,cy:origin.cy+dy});
}
const hit=engine.ammoMatrixTargets(dummyAuth,diamond.areaMatrix,origin,pack);
const hitSet=new Set(hit.map((m)=>m.id));
must(hit.length===21,"matriz diamond acerta 21 tiles no pack 5x5");
must(!hitSet.has("m-2,-2")&&!hitSet.has("m2,2")&&!hitSet.has("m-2,2")&&!hitSet.has("m2,-2"),
  "cantos do 5x5 ficam de fora da diamond");
must(hitSet.has("m0,0")&&hitSet.has("m0,2")&&hitSet.has("m1,1"),"centro e cruz da diamond entram");

const bowOk=engine.initializeAuthority(descriptor(paladin()),"a".repeat(64),1000);
silence(bowOk.authority);bowOk.authority.players[0].attackAcc=1200;
const bowAfter=JSON.parse(engine.advanceAuthorityState(JSON.stringify(bowOk),1000,2000).state);
must(bowAfter.state.events.some((e)=>e.t==="hit"&&e.dmg>0),"bow+quiver+arrow dispara");

const mix=paladin({equip:{weapon:{item:"bow"},shield:{item:"quiver"},ammo:{item:"bolt"}}});
const mixAuth=engine.initializeAuthority(descriptor(mix),"b".repeat(64),1000);
silence(mixAuth.authority);mixAuth.authority.players[0].attackAcc=1200;
const mixAfter=JSON.parse(engine.advanceAuthorityState(JSON.stringify(mixAuth),1000,2000).state);
must(mixAfter.state.events.some((e)=>e.t==="miss"&&e.reason==="ammo")&&
  !mixAfter.state.events.some((e)=>e.t==="hit"&&!e.spellId),
  "bow recusa bolt");

const xbow=paladin({equip:{weapon:{item:"crossbow"},shield:{item:"quiver"},ammo:{item:"bolt"}}});
const xAuth=engine.initializeAuthority(descriptor(xbow),"c".repeat(64),1000);
silence(xAuth.authority);xAuth.authority.players[0].attackAcc=8000;
const xAfter=JSON.parse(engine.advanceAuthorityState(JSON.stringify(xAuth),3000,4000).state);
must(xAfter.state.events.some((e)=>e.t==="hit"&&e.dmg>0),"crossbow+bolt dispara");

const arb=paladin({equip:{weapon:{item:"arbalest"},shield:{item:"quiver"},ammo:{item:"bolt"}}});
const arbAuth=engine.initializeAuthority(descriptor(arb),"d".repeat(64),1000);
silence(arbAuth.authority);arbAuth.authority.players[0].attackAcc=8000;
const arbAfter=JSON.parse(engine.advanceAuthorityState(JSON.stringify(arbAuth),3000,4000).state);
must(arbAfter.state.events.some((e)=>e.t==="hit"&&e.dmg>0),"arbalest+bolt dispara (besta sem 'crossbow' no nome)");

const spear=paladin({equip:{weapon:{item:"spear"}}});
const spearShot=engine.consumeDistanceAmmo({stats:{supplyUsed:{},supplyCost:0}},spear);
must(spearShot.ok&&spearShot.throwing,"spear é arremesso: consumeDistanceAmmo ok sem quiver");
must(spear.gold===50000,"arremesso não cobra gold na hora do tiro");
const spAuth=engine.initializeAuthority(descriptor(spear),"e".repeat(64),1000);
silence(spAuth.authority);spAuth.authority.players[0].attackAcc=1200;
const spAfter=JSON.parse(engine.advanceAuthorityState(JSON.stringify(spAuth),1000,2000).state);
must(!spAfter.state.events.some((e)=>e.reason==="ammo"),"spear em combate não falha por munição");
must((spAfter.authority.stats.supplyCost||0)===0,"arremesso não registra custo de munição");

const noQ=paladin({equip:{weapon:{item:"bow"},ammo:{item:"arrow"}}});
const nqAuth=engine.initializeAuthority(descriptor(noQ),"f".repeat(64),1000);
silence(nqAuth.authority);nqAuth.authority.players[0].attackAcc=1200;
const nqAfter=JSON.parse(engine.advanceAuthorityState(JSON.stringify(nqAuth),1000,2000).state);
must(nqAfter.state.events.some((e)=>e.t==="miss"&&e.reason==="ammo"),"bow sem quiver falha");

const low=paladin({level:50,exp:engine.expForLevel(50),
  equip:{weapon:{item:"bow"},shield:{item:"quiver"},ammo:{item:"diamond-arrow"}}});
const lowAuth=engine.initializeAuthority(descriptor(low),"g".repeat(64),1000);
silence(lowAuth.authority);lowAuth.authority.players[0].attackAcc=1200;
const lowAfter=JSON.parse(engine.advanceAuthorityState(JSON.stringify(lowAuth),1000,2000).state);
must(lowAfter.state.events.some((e)=>e.t==="miss"&&e.reason==="ammo"),
  "diamond arrow exige level 150");

const diaMobs=[{id:"center",slug:"rat",cx:11,cy:10,hp:99999,maxHp:99999},
  {id:"arm",slug:"rat",cx:12,cy:10,hp:99999,maxHp:99999},
  {id:"corner",slug:"rat",cx:13,cy:8,hp:99999,maxHp:99999}];
const dia=paladin({equip:{weapon:{item:"bow"},shield:{item:"quiver"},ammo:{item:"diamond-arrow"}}});
const diaAuth=engine.initializeAuthority(descriptor(dia,diaMobs),"h".repeat(64),1000);
silence(diaAuth.authority);diaAuth.authority.players[0].attackAcc=1200;
const diaAfter=JSON.parse(engine.advanceAuthorityState(JSON.stringify(diaAuth),1000,2000).state);
const diaHits=diaAfter.state.events.filter((e)=>e.t==="hit");
const ids=new Set(diaHits.map((e)=>e.mobId||e.targetId));
must(ids.has("center")&&ids.has("arm"),"diamond acerta alvo e vizinho da cruz");
must(!ids.has("corner"),"diamond não acerta o canto do 5x5");
must(diaHits.some((e)=>e.missile==="diamond-arrow"),"diamond mantém o missile CONST_ANI_DIAMONDARROW");
must(diaHits.every((e)=>e.fx==="blue-electricity"),"diamond hit usa Blue Electricity, não sangue");
const diaArea=diaAfter.state.events.find((e)=>e.t==="areafx");
must(diaArea&&diaArea.fx==="blue-electricity"&&Array.isArray(diaArea.cells)&&diaArea.cells.length===21,
  "diamond pinta Blue Electricity nos 21 SQM da matriz");
must(!diaAfter.state.events.some((e)=>e.t==="burst"&&(!e.fx||e.fx==="explosion-area")),
  "diamond não cai no burst explosion-area");

const poison=paladin({equip:{weapon:{item:"bow"},shield:{item:"quiver"},ammo:{item:"poison-arrow"}}});
let poAuth=engine.initializeAuthority(descriptor(poison),"i".repeat(64),1000);
silence(poAuth.authority);poAuth.authority.mobs[0].hp=99999;poAuth.authority.players[0].attackAcc=1200;
let poAfter=null,poisoned=false;
for(let i=0;i<8&&!poisoned;i++){
  poAfter=JSON.parse(engine.advanceAuthorityState(JSON.stringify(poAuth),1000,2000+i*1000).state);
  poAuth=poAfter;
  silence(poAuth.authority);
  const mob=(poAuth.authority.mobs||[])[0];
  poisoned=!!(mob&&mob.conditions&&mob.conditions.poison);
}
must(poisoned,"poison arrow aplica condition de veneno");

must(engine.ITEMS["eldritch-quiver"]&&engine.ITEMS["eldritch-quiver"].shotDmg===20&&
  engine.ITEMS["eldritch-quiver"].shotRange===4,"eldritch quiver: perfect shot +20 @ 4 SQM");
const perfP=paladin({equip:{weapon:{item:"bow"},shield:{item:"eldritch-quiver"},ammo:{item:"sniper-arrow"}}});
must(engine.quiverPerfectShot(perfP,4)===20&&engine.quiverPerfectShot(perfP,3)===0,
  "perfect shot só na distância EXATA");
const perfMobs=[{id:"far",slug:"rat",cx:14,cy:10,hp:99999,maxHp:99999}];
const perfAuth=engine.initializeAuthority(descriptor(perfP,perfMobs),"j".repeat(64),1000);
silence(perfAuth.authority);
perfAuth.authority.mobs[0].hp=99999;perfAuth.authority.mobs[0].maxHp=99999;
perfAuth.authority.players[0].attackAcc=1200;
const hp0=perfAuth.authority.mobs[0].hp;
const perfAfter=JSON.parse(engine.advanceAuthorityState(JSON.stringify(perfAuth),1000,2000).state);
must(perfAfter.state.events.some((e)=>e.perfect===1)&&perfAfter.authority.mobs[0].hp<hp0-15,
  "perfect shot soma dano extra no alvo a 4 SQM");

must(engine.ALL_SPELLS["exori-san"],"exori-san precisa existir para o combo do paladino");
const comboP=paladin({
  mp:4000,
  equip:{weapon:{item:"bow"},shield:{item:"quiver"},ammo:{item:"diamond-arrow"}},
  config:{spellAttack:true,noHealthPotions:true,noManaPotions:true,
    combo:[{kind:"spell",id:"exori-san",min:1},null,null,null,null,null]},
});
const comboAuth=engine.initializeAuthority(descriptor(comboP,[
  {id:"center",slug:"rat",cx:11,cy:10,hp:99999,maxHp:99999}]),"k".repeat(64),1000);
silence(comboAuth.authority);
comboAuth.authority.mobs[0].hp=99999;comboAuth.authority.mobs[0].maxHp=99999;
comboAuth.authority.players[0].attackAcc=4000;
const comboAfter=JSON.parse(engine.advanceAuthorityState(JSON.stringify(comboAuth),2000,3000).state);
const comboStats=comboAfter.authority.stats||comboAfter.state.stats||{};
must(comboAfter.state.events.some((e)=>e.spellId==="exori-san"||e.spell),
  "combo do paladino não lançou magia");
must((comboStats.supplyUsed&&comboStats.supplyUsed["diamond-arrow"])>=1,
  "diamond arrow não entrou no analyser com magia em group CD");

console.log("test_ammo_distance: ok");
