/* Diamond arrow hit FX, wand/rod missiles Canary, knight/monk basic hits. */
"use strict";
const engine=require("../server/authoritative_engine");
function must(ok,msg){if(!ok)throw Error(msg);}
function clone(v){return JSON.parse(JSON.stringify(v));}
function descriptor(p,mobs){
  const member={id:String(p.id),p:clone(p)};
  return {v:1,savedAt:1000,kind:"hunt",huntId:"rats",instanceMode:"non-pvp",activeCharacterId:String(p.id),
    members:[member],state:{gridW:30,gridH:30,players:[{id:String(p.id),p:member.p,cx:10,cy:10,x:10.5/30,y:10.5/30}],
      mobs:mobs||[{id:"rat-one",slug:"rat",cx:11,cy:10,x:11.5/30,y:10.5/30,hp:999999,maxHp:999999}],events:[]}};
}
function silence(auth){
  for(const mob of auth.mobs||[]){mob.damage=0;mob.attackAcc=-100000;mob.def=Object.assign({},mob.def,{skills:[]});}
}
function step(p,mobs){
  const live=engine.initializeAuthority(descriptor(p,mobs),"a".repeat(64),1000);
  silence(live.authority);
  for(const mob of live.authority.mobs||[]){mob.hp=999999;mob.maxHp=999999;}
  live.authority.players[0].attackAcc=8000;
  return JSON.parse(engine.advanceAuthorityState(JSON.stringify(live),1000,2000).state);
}
function hitsOf(state){return (state.state.events||[]).filter((e)=>e.t==="hit"&&!e.spellId);}

must(engine.ITEMS["diamond-arrow"].areaFx==="blue-electricity","diamond areaFx oficial é blue-electricity");
must(engine.wandMissileOf(engine.ITEMS["hailstorm-rod"],"ice")==="small-ice","hailstorm rod: CONST_ANI_SMALLICE");
must(engine.wandMissileOf(engine.ITEMS["snakebite-rod"],"earth")==="small-earth","snakebite rod: CONST_ANI_SMALLEARTH");
must(engine.wandMissileOf(engine.ITEMS["wand-of-vortex"],"energy")==="energy","wand of vortex: CONST_ANI_ENERGY");
must(engine.wandMissileOf(engine.ITEMS["wand-of-inferno"],"fire")==="fire","wand of inferno: CONST_ANI_FIRE");
must(engine.wandMissileOf(engine.ITEMS["eldritch-rod"],"ice")==="ice","eldritch rod usa ICE, não smallice");
must(engine.playerWeaponProfile({equip:{weapon:{item:"hailstorm-rod"}}}).missile==="small-ice",
  "profile da hailstorm rod não pode voar o missile ICE grande");
must(engine.playerWeaponProfile({equip:{weapon:{item:"wand-of-vortex"}}}).missile==="energy",
  "profile da wand of vortex");
must(engine.physicalHitFx("blood")==="draw-blood"&&engine.physicalHitFx("undead")==="hit-area",
  "golpe físico segue a raça (sangue vs hit-area)");

const paladin={id:1,name:"RP",voc:"paladin",level:200,exp:engine.expForLevel(200),hp:2000,mp:800,gold:50000,ml:20,
  skills:{fist:10,sword:10,axe:10,club:10,dist:90,shield:40},
  equip:{weapon:{item:"bow"},shield:{item:"quiver"},ammo:{item:"diamond-arrow"}},
  supplies:{},lootPouch:{},kills:{},bosses:{},config:{spellAttack:false,combo:[]}};
const dia=step(paladin,[{id:"center",slug:"rat",cx:11,cy:10,hp:99999,maxHp:99999},
  {id:"arm",slug:"rat",cx:12,cy:10,hp:99999,maxHp:99999}]);
const diaHits=hitsOf(dia);
must(diaHits.some((e)=>e.missile==="diamond-arrow"&&e.projectile),"diamond missile do voo permanece diamond-arrow");
must(diaHits.every((e)=>e.fx==="blue-electricity"),"hits da diamond usam Blue Electricity");
const diaArea=(dia.state.events||[]).find((e)=>e.t==="areafx");
must(diaArea&&diaArea.fx==="blue-electricity"&&diaArea.cells.length===21,"areafx 21 SQM blue-electricity");

const mage={id:1,name:"MS",voc:"sorcerer",level:40,exp:engine.expForLevel(40),hp:800,mp:800,gold:0,ml:20,
  skills:{fist:10,sword:10,axe:10,club:10,dist:10,shield:20},
  equip:{weapon:{item:"wand-of-vortex"}},supplies:{},lootPouch:{},kills:{},bosses:{},
  config:{spellAttack:false,combo:[]}};
const mageHits=hitsOf(step(mage));
must(mageHits.length>=1&&mageHits[0].missile==="energy"&&mageHits[0].el==="energy"&&mageHits[0].fx==="energy-damage",
  "wand of vortex: missile energy + hit energy-damage, sem slash físico");
must(!mageHits.some((e)=>e.dual),"wand não parte em físico+elemento");

const druid={id:1,name:"ED",voc:"druid",level:40,exp:engine.expForLevel(40),hp:800,mp:800,gold:0,ml:20,
  skills:{fist:10,sword:10,axe:10,club:10,dist:10,shield:20},
  equip:{weapon:{item:"hailstorm-rod"}},supplies:{},lootPouch:{},kills:{},bosses:{},
  config:{spellAttack:false,combo:[]}};
const rodHits=hitsOf(step(druid));
must(rodHits.length>=1&&rodHits[0].missile==="small-ice"&&rodHits[0].el==="ice"&&rodHits[0].fx==="ice-attack",
  "hailstorm rod: missile small-ice + hit ice-attack");

const knight={id:1,name:"EK",voc:"knight",level:300,exp:engine.expForLevel(300),hp:5000,mp:500,gold:0,ml:10,
  skills:{fist:10,sword:90,axe:10,club:10,dist:10,shield:80},
  equip:{weapon:{item:"naga-sword"}},supplies:{},lootPouch:{},kills:{},bosses:{},
  config:{spellAttack:false,combo:[]}};
const nagaHits=hitsOf(step(knight));
const nagaFis=nagaHits.find((e)=>e.el==="physical");
const nagaIce=nagaHits.find((e)=>e.el==="ice"&&e.dual);
must(nagaFis&&nagaFis.fx==="draw-blood","naga sword: parcela física com FX da raça blood");
must(nagaIce&&nagaIce.fx==="ice-attack"&&!nagaIce.missile,"naga sword: segunda parcela gelo, sem missile");
must(!nagaHits.some((e)=>e.spellId),"naga sword é auto-ataque, não spell");

const skelKnight=Object.assign({},knight,{equip:{weapon:{item:"magic-sword"}}});
const skelHits=hitsOf(step(skelKnight,[{id:"sk",slug:"skeleton",cx:11,cy:10,hp:999999,maxHp:999999}]));
const skelFis=skelHits.find((e)=>e.el==="physical"&&!e.dual);
must(skelFis&&skelFis.fx===engine.physicalHitFx((engine.MONSTERS.skeleton&&engine.MONSTERS.skeleton.race)||"undead"),
  "knight em morto-vivo usa FX da raça, não sangue genérico forçado");

const monkBond={id:1,name:"EM",voc:"monk",level:150,exp:engine.expForLevel(150),hp:2000,mp:800,gold:0,ml:10,
  skills:{fist:80,sword:10,axe:10,club:10,dist:10,shield:40},
  equip:{weapon:{item:"depth-claws"}},supplies:{},lootPouch:{},kills:{},bosses:{},
  config:{spellAttack:false,combo:[]}};
must(engine.elementalBond(monkBond)==="energy","depth claws: bond energy");
must(engine.playerWeaponProfile(monkBond).element==="energy"&&!engine.playerWeaponProfile(monkBond).elemento2,
  "bond converte o auto-ataque inteiro, sem split");
const bondHits=hitsOf(step(monkBond));
must(bondHits.length>=1&&bondHits.every((e)=>e.el==="energy"),"monk bond energy: um elemento só");
must(bondHits[0].fx==="energy-damage"&&!bondHits.some((e)=>e.dual),
  "monk bond: um FX de energia, não físico+energia");

const monkFist={id:1,name:"EM",voc:"monk",level:20,exp:engine.expForLevel(20),hp:500,mp:200,gold:0,ml:8,
  skills:{fist:40,sword:10,axe:10,club:10,dist:10,shield:20},
  equip:{},supplies:{},lootPouch:{},kills:{},bosses:{},config:{spellAttack:false,combo:[]}};
const fistHits=hitsOf(step(monkFist));
must(fistHits.length>=1&&fistHits[0].el==="physical"&&fistHits[0].fx==="whirlwind-blow-white",
  "monk sem bond usa FX de punho, não draw-blood");

console.log("test_basic_attack_fx: ok");
