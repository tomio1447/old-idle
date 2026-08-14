/* Skills/dano online vs Canary (weapons.cpp + vocation.cpp). */
"use strict";
const engine=require("../server/authoritative_engine");
function must(ok,msg){if(!ok)throw Error(msg);}

const ek={voc:"knight",level:20,ml:0,manaSpent:0,skills:{sword:40,axe:10,club:10,dist:10,fist:10,shield:30},
  skillTries:{sword:0,axe:0,club:0,dist:0,fist:0,shield:0},equip:{weapon:{item:"sword"}}};
const rp={voc:"paladin",level:20,ml:0,manaSpent:0,skills:{sword:10,axe:10,club:10,dist:40,fist:10,shield:30},
  skillTries:{sword:0,dist:0,shield:0,fist:0,axe:0,club:0},equip:{weapon:{item:"bow"},ammo:{item:"arrow"}}};
const ms={voc:"sorcerer",level:20,ml:10,manaSpent:0,skills:{sword:10,dist:10,fist:10,shield:10,axe:10,club:10},
  skillTries:{sword:0,dist:0,fist:0,shield:0,axe:0,club:0},equip:{weapon:{item:"wooden-wand"}}};
const ed={voc:"druid",level:20,ml:10,manaSpent:0,skills:{sword:10,dist:10,fist:10,shield:10,axe:10,club:10},
  skillTries:{},equip:{weapon:{item:"wooden-wand"}}};
const mk={voc:"monk",level:20,ml:0,manaSpent:0,skills:{fist:40,sword:10,axe:10,club:10,dist:10,shield:20},
  skillTries:{fist:0},equip:{}};

must(engine.attackSkillName(ek)==="sword","knight com sword usa skill sword");
must(engine.attackSkillName(rp)==="dist","paladin com bow usa distance");
must(engine.attackSkillName(ms)==="magic","sorc com wand não usa melee");
must(engine.attackSkillName(mk)==="fist","monk desarmado usa fist");

must(engine.skillTriesNeeded(ek,"sword")===Math.floor(50*Math.pow(1.1,30)),
  "knight sword 40: 50 * 1.1^(40-10)");
must(engine.skillTriesNeeded({voc:"paladin",skills:{dist:10}},"dist")===30,
  "paladin dist 10: base 30");
must(engine.skillTriesNeeded({voc:"sorcerer",skills:{sword:10}},"sword")===50,
  "sorc melee 10: base 50 * 2.0^0");
must(engine.skillTriesNeeded({voc:"knight",skills:{shield:10}},"shield")===100,
  "shield base 100");
must(engine.mlTriesNeeded({voc:"sorcerer",ml:0})===1600,"sorc ML 0→1 custa 1600");
must(engine.mlTriesNeeded({voc:"knight",ml:0})===1600,"knight ML 0→1 custa 1600");
must(engine.mlTriesNeeded({voc:"sorcerer",ml:1})===Math.floor(1600*1.1),"sorc ML 1→2 = 1600*1.1");
must(engine.mlTriesNeeded({voc:"knight",ml:1})===Math.floor(1600*3),"knight ML 1→2 = 1600*3.0");

const dMelee=engine.meleeDamage(40,20,1,20);
must(dMelee.min===4&&dMelee.max===72,"melee Canary: min=level/5, max=round(0.085*atk*skill+level/5)");
const dDist=engine.distanceDamage(40,30,1,20,false);
must(dDist.min===4&&dDist.max===Math.round(0.09*40*30+4),"distance Canary: 0.09*skill*atk + level/5");
const dEl=engine.distanceDamage(40,30,1,20,true);
must(dEl.min===Math.floor(4/2)&&dEl.max===Math.floor(Math.round(0.09*40*30+4)/2),"munição elemental divide min/max por 2");

const auth={rngState:1};
const knDmg=engine.playerDamage(auth,ek,{slug:"rat",armor:0});
must(knDmg>=4&&knDmg<=80,"knight melee cai na faixa Canary (atk 14 *1.2 *1.3 knight)");
const wandDmg=engine.playerDamage({rngState:2},ms,{slug:"rat"});
must(wandDmg===8+4,"wand Canary: magicDamage + level/5, sem ML");

const kTries=Object.assign({},ek,{skills:{sword:10},skillTries:{sword:0}});
engine.addSkillTries(kTries,"sword",1);
must(kTries.skillTries.sword===10,"rate 10x até skill 80: 1 hit = 10 tries");
must(kTries.skills.sword===10,"1 hit não sobe skill 10→11 (precisa 50)");
engine.addSkillTries(kTries,"sword",4);
must(kTries.skills.sword===11&&kTries.skillTries.sword===0,"5 hits *10 = 50 tries sobem knight sword");

const pTries={voc:"paladin",skills:{dist:10},skillTries:{dist:0}};
engine.addSkillTries(pTries,"dist",3);
must(pTries.skills.dist===11,"paladin dist: 3 hits *10 = 30 tries (base 30)");

const sMana={voc:"sorcerer",ml:0,manaSpent:0};
engine.addManaSpent(sMana,160);
must(sMana.ml===1&&sMana.manaSpent===0,"sorc: 160 mana * rate 10 = 1600 sobe ML");
const kMana={voc:"knight",ml:0,manaSpent:0};
engine.addManaSpent(kMana,160);
must(kMana.ml===1,"knight também sobe ML pelo mana gasto, só que o próximo nível custa 3x");
engine.addManaSpent(kMana,160);
must(kMana.ml===1,"knight ML 1→2 precisa 1600*3 / 10 = 480 mana efetivo");

const wandSkill={voc:"sorcerer",skills:{sword:10},skillTries:{sword:0},ml:5,manaSpent:0,equip:{weapon:{item:"wooden-wand"}}};
must(engine.progressAttack(wandSkill)===false&&wandSkill.skills.sword===10&&wandSkill.manaSpent===0,
  "tiro de wand não sobe sword nem ML");

const ring={voc:"knight",skills:{sword:10},equip:{weapon:{item:"sword"},ring:{item:"sword-ring"}}};
must(engine.playerSkill(ring)===10+engine.gearSkillBonus(ring,"sword"),
  "sword ring entra no skill efetivo do dano");

const desc={v:1,savedAt:1000,kind:"hunt",huntId:"rats",instanceMode:"non-pvp",activeCharacterId:"1",
  members:[{id:"1",p:{id:1,name:"K",voc:"knight",level:20,exp:engine.expForLevel(20),hp:400,mp:50,gold:0,ml:0,manaSpent:0,
    skills:{sword:10,axe:10,club:10,dist:10,fist:10,shield:10},skillTries:{sword:0,shield:0},
    config:{spellAttack:false},equip:{weapon:{item:"sword"}}}}],
  state:{players:[{id:"1",p:null,cx:8,cy:6}],mobs:[{id:"rat-one",slug:"rat",hp:999999,maxHp:999999,cx:8,cy:7}]}};
desc.state.players[0].p=desc.members[0].p;
const live=engine.initializeAuthority(desc,"a".repeat(64),1000);
live.authority.mobs[0].damage=5;live.authority.mobs[0].cx=8;live.authority.mobs[0].cy=7;
live.authority.mobs[0].def=Object.assign({},live.authority.mobs[0].def,{skills:[]});
const after=JSON.parse(engine.advanceAuthorityState(JSON.stringify(live),2000,3000).state);
const p=after.authority.players[0].p;
must(p.skillTries.sword>0,"ataque básico online progride sword, não ML falso");
must(!(Number(p.manaSpent)>0)&&(Number(p.ml)||0)===0,"wand/spell não rodou no knight com spellAttack false");
must(p.skillTries.shield>0,"bloquear melee online progride shielding");

console.log("test_skill_canary: ok");
