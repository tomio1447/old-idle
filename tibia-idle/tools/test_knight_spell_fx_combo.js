/* Magias de ataque do knight (areafx no caster) + combo físico/elemento.
 * Execute: node tibia-idle/tools/test_knight_spell_fx_combo.js */
"use strict";
const fs=require("fs"),path=require("path"),vm=require("vm");
const engine=require("../server/authoritative_engine");
const game=path.join(__dirname,"..","game");
function must(ok,msg){if(!ok)throw Error(msg);}
function clone(v){return JSON.parse(JSON.stringify(v));}

const html=fs.readFileSync(path.join(game,"index.html"),"utf8");
must(html.includes("js/combat.js?v=knight-fx-combo-v2")&&
  html.includes("js/game.js?v=knight-fx-combo-v2")&&
  html.includes("js/player.js?v=knight-fx-combo-v1")&&
  html.includes("js/render.js?v=knight-fx-combo-v1")&&
  html.includes("js/grid.js?v=knight-fx-combo-v1"),
  "cache-bust knight-fx-combo ausente");
const gameJs=fs.readFileSync(path.join(game,"js","game.js"),"utf8");
must(gameJs.includes("addLog(\"hit\"")&&gameJs.includes("anchor===\"target\"")&&
  gameJs.includes("setGridSize(gw,gh)"),
  "cliente sem log físico/elemento, rebase de areafx ou setGridSize online");
const combatJs=fs.readFileSync(path.join(game,"js","combat.js"),"utf8");
must(combatJs.includes("groundshaker")&&combatJs.includes("anchor: fromCaster ? \"caster\" : \"target\""),
  "cliente não ancora FX de knight no conjurador");
const renderJs=fs.readFileSync(path.join(game,"js","render.js"),"utf8");
must(renderJs.includes("function mergeFloaterText")&&renderJs.includes("comboKey"),
  "combo visual Canary (mesmo alvo+elemento) ausente no floater");

must(engine.SPELL_TARGET.exori&&engine.SPELL_TARGET.exori.self===1&&
  engine.SPELL_TARGET["exori-gran"].self===1&&engine.SPELL_TARGET["exori-mas"].self===1&&
  engine.SPELL_TARGET["exori-min"].self===1,
  "berserk/fierce/groundshaker/front sweep sem self no SPELL_TARGET online");
must(engine.spellVisual(engine.ALL_SPELLS.exori).fx==="hit-area"&&
  engine.spellVisual(engine.ALL_SPELLS["exori-gran"]).fx==="hit-area"&&
  engine.spellVisual(engine.ALL_SPELLS["exori-mas"]).fx==="groundshaker"&&
  engine.spellVisual(engine.ALL_SPELLS["exori-min"]).fx==="hit-area",
  "FX das magias de knight não é hit-area/groundshaker");

function knight(id, extra){
  return Object.assign({
    id, name:"EK"+id, voc:"knight", level:100, exp:500000, hp:1500, mp:2000, gold:5000,
    skills:{sword:50,axe:10,club:10,dist:10,fist:10,shield:40}, ml:10,
    equip:{weapon:{item:"sword"}}, supplies:{}, lootPouch:{}, kills:{}, bosses:{},
    config:{spellAttack:true, combo:[{kind:"spell",id:"exori",min:1}]}
  }, extra||{});
}
function descriptor(players, mobs){
  const members=(players||[]).map((p)=>({id:String(p.id),p:clone(p)}));
  return {v:1,savedAt:1000,kind:"hunt",huntId:"rats",instanceMode:"non-pvp",
    activeCharacterId:String(players[0].id), members,
    state:{gridW:30,gridH:30,events:[],
      players:members.map((m,i)=>({id:m.id,p:m.p,cx:10+i,cy:10,x:(10.5+i)/30,y:10.5/30})),
      mobs:mobs||[{id:"near",slug:"rat",cx:11,cy:10,x:11.5/30,y:10.5/30}]}};
}
function prep(auth){
  for(const item of auth.authority.players)item.attackAcc=2000;
  for(const mob of auth.authority.mobs){
    mob.hp=mob.maxHp=999999;mob.damage=0;mob.walkAcc=-1e9;
    mob.def=Object.assign({},mob.def,{skills:[],defSkills:[]});
  }
  return auth;
}
function swing(p, extraMobs){
  const desc=descriptor([p], extraMobs);
  const live=prep(engine.initializeAuthority(desc, String(p.id).repeat(32), 1000));
  return JSON.parse(engine.advanceAuthorityState(JSON.stringify(live),1000,2000).state);
}

const authDummy={gridW:30,gridH:30};
const caster={cx:10,cy:10,x:10.5/30,y:10.5/30};
const far={cx:20,cy:20,x:20.5/30,y:20.5/30};
const berserkCells=engine.spellAreaCells(authDummy,engine.ALL_SPELLS.exori,caster,far);
must(berserkCells.length===9&&berserkCells.some((c)=>c.cx===10&&c.cy===10)&&
  !berserkCells.some((c)=>c.cx===20&&c.cy===20),
  "Berserk não ancorou 3x3 no caster: "+JSON.stringify(berserkCells));
const gsCells=engine.spellAreaCells(authDummy,engine.ALL_SPELLS["exori-mas"],caster,far);
must(gsCells.length>9&&gsCells.some((c)=>c.cx===10&&c.cy===10)&&
  !gsCells.some((c)=>c.cx===20&&c.cy===20),
  "Groundshaker não ancorou no caster");

const berserk=swing(knight(1));
const bFx=berserk.state.events.find((e)=>e.t==="areafx"&&e.spellId==="exori");
must(bFx&&bFx.fx==="hit-area"&&bFx.anchor==="caster"&&bFx.whoId==="1"&&
  bFx.base&&bFx.base.cx===10&&bFx.base.cy===10&&bFx.cells.length===9,
  "exori online sem areafx hit-area no caster: "+JSON.stringify(bFx));
must(berserk.state.events.some((e)=>e.t==="hit"&&e.exori===1&&e.fx==="hit-area"),
  "hit de exori sem flag/fx hit-area");

const fierce=swing(knight(2,{config:{spellAttack:true,combo:[{kind:"spell",id:"exori-gran",min:1}]}}));
must(fierce.state.events.some((e)=>e.t==="areafx"&&e.spellId==="exori-gran"&&e.fx==="hit-area"&&e.anchor==="caster"),
  "Fierce Berserk sem areafx hit-area no caster");

const shake=swing(knight(3,{config:{spellAttack:true,combo:[{kind:"spell",id:"exori-mas",min:1}]}}));
must(shake.state.events.some((e)=>e.t==="areafx"&&e.spellId==="exori-mas"&&e.fx==="groundshaker"&&e.anchor==="caster"),
  "Groundshaker sem areafx groundshaker no caster");

const naga=engine.ITEMS["naga-sword"];
must(naga&&naga.el==="ice"&&naga.elDmg>0,"naga-sword ausente no catálogo do servidor");
const nagaProf=engine.playerWeaponProfile({voc:"knight",equip:{weapon:{item:"naga-sword"}}});
must(nagaProf.elemento2==="ice"&&nagaProf.element==="physical"&&!nagaProf.bond,
  "naga-sword deveria ser melee dual físico+gelo");
const nagaHit=swing(knight(4,{equip:{weapon:{item:"naga-sword"}},config:{spellAttack:false}}));
const nagaEvents=(nagaHit.state.events||[]).filter((e)=>e.t==="hit");
must(nagaEvents.some((e)=>e.el==="physical"&&!e.dual)&&nagaEvents.some((e)=>e.el==="ice"&&e.dual===1&&e.fx==="ice-attack"),
  "hit básico da naga-sword sem físico+gelo: "+JSON.stringify(nagaEvents.map((e)=>({el:e.el,dual:e.dual,fx:e.fx}))));

const wand=engine.ITEMS["wand-of-vortex"];
must(wand&&engine.isMagicWeapon(wand),"wand-of-vortex não é arma mágica");
const wandProf=engine.playerWeaponProfile({voc:"sorcerer",equip:{weapon:{item:"wand-of-vortex"}}});
must(wandProf.type==="magic"&&wandProf.element==="energy"&&!wandProf.elemento2,
  "wand não pode dual-split");
const wandHit=swing(Object.assign(knight(5,{voc:"sorcerer",ml:40,equip:{weapon:{item:"wand-of-vortex"}},
  config:{spellAttack:false}})));
const wandEvents=(wandHit.state.events||[]).filter((e)=>e.t==="hit");
must(wandEvents.length>=1&&wandEvents.every((e)=>e.el==="energy"&&!e.dual),
  "wand emitiu dual ou elemento errado: "+JSON.stringify(wandEvents.map((e)=>({el:e.el,dual:e.dual}))));

const rod=engine.ITEMS["hailstorm-rod"];
must(rod&&engine.isMagicWeapon(rod)&&engine.playerWeaponProfile({voc:"druid",equip:{weapon:{item:"hailstorm-rod"}}}).element==="ice",
  "hailstorm-rod deveria ser magia de gelo sem dual");

const fistProf=engine.playerWeaponProfile({voc:"knight",equip:{}});
must(fistProf.type==="melee"&&fistProf.element==="physical"&&!fistProf.elemento2,
  "punho sem arma deveria ser só físico");
const fistHit=swing(knight(6,{equip:{},config:{spellAttack:false}}));
const fistEvents=(fistHit.state.events||[]).filter((e)=>e.t==="hit");
must(fistEvents.length>=1&&fistEvents.every((e)=>e.el==="physical"&&!e.dual),
  "punho de knight sem arma não ficou só físico");

must(engine.ITEMS["naga-katar"]&&engine.ITEMS["naga-katar"].bond==="earth","naga-katar sem elemental bond");
const monkProf=engine.playerWeaponProfile({voc:"monk",equip:{weapon:{item:"naga-katar"}}});
must(monkProf.bond&&monkProf.element==="earth"&&!monkProf.elemento2,
  "monk com naga-katar deveria converter o golpe inteiro para terra");
const monkHit=swing(Object.assign(knight(7,{voc:"monk",level:300,skills:{fist:50,sword:10,axe:10,club:10,dist:10,shield:30},
  equip:{weapon:{item:"naga-katar"}},config:{spellAttack:false}})));
const monkEvents=(monkHit.state.events||[]).filter((e)=>e.t==="hit");
must(monkEvents.length>=1&&monkEvents.every((e)=>e.el==="earth"&&!e.dual),
  "bond do monk não converteu o auto-attack: "+JSON.stringify(monkEvents.map((e)=>({el:e.el,dual:e.dual}))));

const pA=knight(10,{equip:{weapon:{item:"naga-sword"}},config:{spellAttack:false}});
const pB=knight(11,{equip:{weapon:{item:"naga-sword"}},config:{spellAttack:false}});
const partyDesc=descriptor([pA,pB],[{id:"shared",slug:"rat",cx:11,cy:10,x:11.5/30,y:10.5/30}]);
partyDesc.state.players[1].cx=12;partyDesc.state.players[1].x=12.5/30;
const partyLive=prep(engine.initializeAuthority(partyDesc,"aa".repeat(16),1000));
const partyAfter=JSON.parse(engine.advanceAuthorityState(JSON.stringify(partyLive),1000,2000).state);
const iceHits=(partyAfter.state.events||[]).filter((e)=>e.t==="hit"&&e.el==="ice"&&String(e.targetId)==="shared");
must(iceHits.length>=2,
  "dois knights com naga-sword não geraram dois hits de gelo no mesmo alvo: "+
  JSON.stringify((partyAfter.state.events||[]).filter((e)=>e.t==="hit").map((e)=>({el:e.el,who:e.whoId,id:e.targetId}))));

const visualStart=gameJs.indexOf("function normalizedCombatElement");
const visualEnd=gameJs.indexOf("\nfunction drainEvents",visualStart);
const visualCtx={};vm.createContext(visualCtx);vm.runInContext(gameJs.slice(visualStart,visualEnd),visualCtx);
const grouped=visualCtx.aggregateCombatVisualEvents([
  {t:"hit",targetId:"shared",el:"physical",dmg:40},
  {t:"hit",targetId:"shared",el:"ice",dmg:80},
  {t:"hit",targetId:"shared",el:"ice",dmg:70},
]);
const iceGroup=[...grouped.groups.values()].find((g)=>g.channel==="ice");
const physGroup=[...grouped.groups.values()].find((g)=>g.channel==="physical");
must(physGroup&&physGroup.total===40&&iceGroup&&iceGroup.total===150&&grouped.groups.size===2,
  "combo visual não somou gelo de dois personagens nem manteve físico separado");

console.log("OK: magias de knight com areafx no caster; combo físico+gelo; wands/rods/punhos.");
