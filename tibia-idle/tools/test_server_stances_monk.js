/* Posturas 15.25, mantra e elemental bond no combate autoritativo. */
"use strict";
const engine=require("../server/authoritative_engine");
function must(ok,msg){if(!ok)throw Error(msg);}
function player(overrides){
  return Object.assign({id:1,name:"T",voc:"knight",level:100,exp:engine.expForLevel(100),hp:5000,mp:2000,gold:0,
    skills:{sword:80,axe:10,club:10,dist:80,fist:80,shield:60},ml:40,equip:{weapon:{item:"sword"}},
    supplies:{},lootPouch:{},kills:{},bosses:{},config:{spellAttack:false},stances:{}},overrides||{});
}
function desc(p,mob){
  const member={id:String(p.id),p:JSON.parse(JSON.stringify(p))};
  return {v:1,savedAt:1000,kind:"hunt",huntId:"rats",instanceMode:"non-pvp",activeCharacterId:String(p.id),
    members:[member],state:{players:[{id:String(p.id),p:member.p,cx:10,cy:10,x:10.5/30,y:10.5/30}],
      mobs:[{id:"mob-1",slug:mob||"rat",hp:999999,maxHp:999999,cx:11,cy:10,x:11.5/30,y:10.5/30}],events:[]}};
}
function stepOnce(p,mob,visual){
  const auth=engine.initializeAuthority(desc(p,mob),"a".repeat(64),1000);
  auth.authority.rngState=12345;auth.authority.mobs[0].hp=999999;auth.authority.mobs[0].maxHp=999999;
  auth.authority.mobs[0].damage=0;auth.authority.mobs[0].attackAcc=0;
  auth.authority.players[0].attackAcc=1200;
  const visualState=visual||{players:[{id:String(p.id),x:10.5/30,y:10.5/30,cx:10,cy:10,
    combo:[{kind:"spell",id:"exori",min:1},null,null,null,null,null],stances:p.stances}],
    mobs:[{id:"mob-1",x:11.5/30,y:10.5/30,cx:11,cy:10}]};
  return JSON.parse(engine.advanceAuthorityState(JSON.stringify(auth),1000,2000,visualState).state);
}

must(engine.stanceTotals({voc:"knight",stances:{"utito-tempo":true}}).meleePct===25&&
  engine.stanceTotals({voc:"knight",stances:{"utamo-tempo":true}}).dmgDealt===0.85&&
  engine.stanceTotals({voc:"paladin",stances:{"utori-con":true}}).healMul===0.75&&
  engine.stanceTotals({voc:"paladin",stances:{"utori-hur":true}}).dodgeRanged===0.12&&
  engine.stanceConvert({voc:"sorcerer",stances:{"uteta-flam":true}},"energy")==="fire"&&
  engine.stanceConvert({voc:"sorcerer",stances:{"uteta-vis":true}},"fire")==="energy"&&
  engine.stanceConvert({voc:"sorcerer",stances:{"uteta-mort":true}},"fire")==="death"&&
  engine.stanceTotals({voc:"sorcerer",stances:{"exori-kor-tempo":true}}).sapStr===0.10&&
  engine.stanceTotals({voc:"sorcerer",stances:{"exori-moe-tempo":true}}).expose===8&&
  engine.stanceTotals({voc:"druid",stances:{"utura-sio":true}}).healSelf===0.10&&
  engine.stanceTotals({voc:"druid",stances:{"utito-dru":true}}).iceEarthML===10,
  "tabela de posturas incompleta");

must(engine.sanitizeStances({"utito-tempo":true,"utamo-tempo":true},{voc:"knight"})["utito-tempo"]&&
  !engine.sanitizeStances({"utito-tempo":true,"utamo-tempo":true},{voc:"knight"})["utamo-tempo"]&&
  engine.sanitizeStances({"uteta-flam":true,"exori-kor-tempo":true},{voc:"sorcerer"})["uteta-flam"]&&
  engine.sanitizeStances({"uteta-flam":true,"exori-kor-tempo":true},{voc:"sorcerer"})["exori-kor-tempo"],
  "exclusividade de grupo das posturas falhou");

engine.ITEMS["test-monk-robe"]={mantra:40};engine.ITEMS["test-monk-katar"]={bond:"earth",type:"fist"};
const monk={voc:"monk",equip:{helmet:{item:"test-monk-robe"},weapon:{item:"test-monk-katar"}}};
must(engine.mantraTotal(monk)===40,"mantra não soma o equipamento defensivo");
must(engine.mantraAbsorve(monk,300,"fire")===300-80,"mantra sereno não dobra contra fogo");
must(engine.mantraAbsorve(monk,300,"physical")===300,"mantra absorveu dano físico");
must(engine.elementalBond(monk)==="earth","elemental bond não leu a arma");
must(engine.monkSpellElement(monk,{type:"attack",element:"physical"},"physical")==="earth",
  "bond não substituiu o elemento da magia");
must(engine.monkSpellElement(monk,{type:"heal",element:"physical"},"physical")==="physical",
  "bond converteu cura");

const bare=player({voc:"knight",stances:{}});
const rage=player({voc:"knight",stances:{"utito-tempo":true}});
const prot=player({voc:"knight",stances:{"utamo-tempo":true}});
const rageState=stepOnce(rage,"rat");const protState=stepOnce(prot,"rat");const bareState=stepOnce(bare,"rat");
const dmgOf=(state)=>{const hit=(state.state.events||[]).find((e)=>e.t==="hit");return hit?hit.dmg:0;};
must(dmgOf(rageState)>dmgOf(bareState),"Blood Rage não aumentou o dano melee");
must(dmgOf(protState)<dmgOf(bareState),"Protector não reduziu o dano causado");
must(rageState.authority.mobs[0].sapStrUntil===undefined,"Blood Rage aplicou debuff de sorcerer");

const ms=player({voc:"sorcerer",equip:{weapon:{item:"wand-of-cosmic-energy"}},
  stances:{"uteta-flam":true,"exori-moe-tempo":true},config:{spellAttack:true}});
const msState=stepOnce(ms,"rat",{players:[{id:"1",x:10.5/30,y:10.5/30,cx:10,cy:10,
  combo:[{kind:"spell",id:"exori-mort",min:1},null,null,null,null,null],stances:ms.stances}],
  mobs:[{id:"mob-1",x:11.5/30,y:11.5/30,cx:11,cy:10}]});
const msHit=(msState.state.events||[]).find((e)=>e.t==="hit");
must(msHit&&msHit.el==="fire","Master of Flames não converteu a magia para fogo");
must(msState.authority.mobs[0].exposeUntil>0,"Aura of Exposed Weakness não marcou o alvo");

const pal=player({voc:"paladin",stances:{"utori-hur":true},equip:{weapon:{item:"bow"}}});
must(engine.stanceTotals(pal).dodgeRanged===0.12,"Divine Defiance sem esquiva");

const synced=engine.normalizeVisualState({players:[{id:"1",x:.5,y:.5,cx:10,cy:10,
  stances:{"utito-tempo":true,"utori-con":true}}]});
must(synced.players[0].stances["utito-tempo"]===true,"visual_state não transporta posturas");

console.log("OK: posturas, mantra e elemental bond no servidor.");
