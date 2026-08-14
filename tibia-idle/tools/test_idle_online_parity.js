/* Paridade idle → online: haste, cura, crítico/Strike, charms, bestiário, eco, perfect shot. */
"use strict";
const engine=require("../server/authoritative_engine");
function must(ok,msg){if(!ok)throw Error(msg);}

const now=10_000;
function basePlayer(extra){
  return Object.assign({id:1,name:"Parity",voc:"sorcerer",level:80,exp:engine.expForLevel(80),
    hp:800,mp:800,gold:999999,ml:40,skills:{sword:10,axe:10,club:10,dist:10,fist:10,shield:20},
    equip:{weapon:{item:"wand-of-cosmic-energy"}},supplies:{},lootPouch:{},kills:{},bosses:{},
    config:{},buffs:{},conditions:{},charms:{},bestiary:{},charmsPagos:{},charmPoints:0},extra||{});
}
function huntDesc(p,mob){
  const member={id:String(p.id),p:JSON.parse(JSON.stringify(p))};
  return {v:1,savedAt:now,kind:"hunt",huntId:"rats",instanceMode:"non-pvp",activeCharacterId:String(p.id),
    members:[member],state:{players:[{id:String(p.id),p:member.p,cx:8,cy:6}],
      mobs:[Object.assign({id:"parity-mob",slug:"rat",hp:5000,maxHp:5000,cx:10,cy:6},mob||{})],events:[]}};
}
function liveOf(p,mob){
  const desc=huntDesc(p,mob);
  const live=engine.initializeAuthority(desc,"b".repeat(64),now);
  live.authority.mobs[0].hp=5000;live.authority.mobs[0].maxHp=5000;
  live.authority.mobs[0].damage=0;
  live.authority.mobs[0].def=Object.assign({},live.authority.mobs[0].def,{skills:[],voices:{int:1000,ch:100,list:[{t:"Ribbit!"}]}});
  return live;
}

must(typeof engine.tryHaste==="function"&&typeof engine.tryCureCondition==="function",
  "helpers de haste/cura não exportados");
must(engine.playerCritChancePct({})===5&&engine.playerCritExtraPct({})===10,
  "crítico idle é 5% chance / +10% dano, não 10%/50%");

const imbP=basePlayer({equip:{weapon:{item:"eldritch-wand"}},imbuements:{weapon:[{key:"Strike",tier:3}]}});
must(engine.imbCombatTotals(imbP).crit===50&&engine.imbCombatTotals(imbP).critChance===10,
  "Strike powerful não entra no crítico online");
must(engine.playerCritChancePct(imbP)===15&&engine.playerCritExtraPct(imbP)===60,
  "Strike powerful: 15% chance e +60% extra");

const slashP=basePlayer({voc:"knight",skills:{sword:50,axe:10,club:10,dist:10,fist:10,shield:30},
  equip:{weapon:{item:"magic-sword"}},imbuements:{weapon:[{key:"Slash",tier:3}]}});
must(engine.gearSkillBonus(slashP,"sword")>=4,"Slash powerful não soma sword no online");

const charmP=basePlayer({charms:{enflame:true}});
must(engine.applyCharmDamage(charmP,"fire",100)===105,"charm Enflame não aplica +5% fogo");
must(engine.applyCharmDamage(charmP,"ice",100)===100,"charm de fogo não pode vazar para gelo");

must(engine.wandPerfectShot(basePlayer({equip:{weapon:{item:"eldritch-wand"}}}),4)===65,
  "Eldritch Wand perfect shot 4 SQM ausente no online");
must(engine.wandPerfectShot(basePlayer({equip:{weapon:{item:"eldritch-wand"}}}),3)===0,
  "perfect shot fora da distância exata não pode somar");

const hasteP=basePlayer({config:{hasteSpell:"utani-hur"},mp:800});
const hasteLive=liveOf(hasteP);
const hasteItem=hasteLive.authority.players[0];
must(engine.tryHaste(hasteLive.authority,hasteItem,hasteItem.p,now),"utani hur não conjurou no online");
must(engine.hasteActive(hasteItem.p,now)==="utani-hur","buff de haste não ficou ativo");
must(hasteLive.authority.events.some((e)=>e.t==="say"&&/utani hur/i.test(e.text)),
  "haste online não falou as palavras");
must(engine.authoritySpeedPts(hasteItem,true,now)>200,"haste não acelerou o passo online");
must(!engine.tryHaste(hasteLive.authority,hasteItem,hasteItem.p,now+100),
  "haste recastou com o buff ainda ativo");

const cureP=basePlayer({config:{autoCure:true},conditions:{poison:{dmg:10,turns:5,acc:0}},mp:800});
const cureLive=liveOf(cureP);
const cureItem=cureLive.authority.players[0];
must(engine.tryCureCondition(cureLive.authority,cureItem,cureItem.p,now),"exana pox não conjurou");
must(!cureItem.p.conditions.poison,"condition de veneno não foi removida");
must(cureLive.authority.events.some((e)=>e.t==="cured"||(e.t==="say"&&/exana pox/i.test(e.text))),
  "cura de condition sem say/cured");

const buffP=basePlayer({voc:"monk",level:30,mp:800,config:{buff:"utito-virtu"},
  skills:{sword:10,axe:10,club:10,dist:10,fist:40,shield:20},equip:{}});
const buffLive=liveOf(buffP);
const buffItem=buffLive.authority.players[0];
must(engine.tryBuff(buffLive.authority,buffItem,buffItem.p,now),"virtude do monk não conjurou");
must(Number(buffItem.p.buffs["utito-virtu"])>now,"Virtue of Justice não persistiu");

const echoP=basePlayer({level:120,mp:2000,config:{combo:[{kind:"spell",id:"exevo-mort-ora"}]}});
const echoLive=liveOf(echoP,{slug:"rat",hp:200000,maxHp:200000});
echoLive.authority.mobs[0].hp=200000;
echoLive.authority.players[0].attackAcc=5000;
const echoAfter=JSON.parse(engine.advanceAuthorityState(JSON.stringify(echoLive),1000,now+1000).state);
must((echoAfter.authority.delayedHits||[]).length>0||
  echoAfter.state.events.some((e)=>e.echo||(e.spellId==="exevo-mort-ora")),
  "Death Echo não agendou o re-strike de 1s");
const echoLater=JSON.parse(engine.advanceAuthorityState(JSON.stringify(echoAfter),1000,now+2000).state);
must(echoLater.state.events.some((e)=>e.echo)||(echoLater.authority.delayedHits||[]).length===0,
  "re-strike do Death Echo não disparou no tick seguinte");

const bestP=basePlayer();
const gained=engine.bestiaryKill(bestP,"rat",1);
must(bestP.bestiary.rat>=2,"bestiário online não usa rate 2x");
must(typeof bestP.charmPoints==="number","charm points não foram inicializados");
const again=engine.bestiaryKill(bestP,"rat",5000);
must(again>=0&&bestP.charmPoints>=gained,"estágios do bestiário não creditam charm points");

const yellLive=liveOf(basePlayer());
const yellAfter=JSON.parse(engine.advanceAuthorityState(JSON.stringify(yellLive),1000,now+1000).state);
must(yellAfter.state.events.some((e)=>e.t==="say"&&e.monster&&e.text==="Ribbit!"),
  "yell do monstro não chegou no snapshot online");

must(engine.ALL_SPELLS["exura-gran-sio"]&&engine.ALL_SPELLS["exura-gran-sio"].cd===15000,
  "exura gran sio ainda está com CD de 60s no online");
must(!!engine.ALL_SPELLS["exura-gran-tio-sio"],"exura gran tio sio ausente no online");

must(engine.ITEMS["time-ring"]&&engine.ITEMS["time-ring"].chargeMode==="time",
  "time-ring sem chargeMode time no catálogo online");
must(engine.ITEMS["might-ring"]&&engine.ITEMS["might-ring"].chargeMode==="hits",
  "might-ring sem chargeMode hits no catálogo online");

const timeP=basePlayer({equip:{ring:{item:"time-ring",charges:200,maxCharges:200}}});
engine.tickAccessoryCharges({events:[],clock:now},timeP,3000,now);
must(timeP.equip.ring.charges===199,"anel de tempo não gasta 1 carga / 3s no online");

const mightP=basePlayer({equip:{ring:{item:"might-ring",charges:20,maxCharges:20}}});
engine.consumeAccessoryHitCharge({events:[],clock:now},mightP,now);
must(mightP.equip.ring.charges===19,"might ring não gasta carga por golpe no online");

const breakP=basePlayer({equip:{ring:{item:"might-ring",charges:1,maxCharges:20}}});
engine.consumeAccessoryHitCharge({events:[],clock:now,players:[]},breakP,now);
must(!breakP.equip.ring,"might ring não quebra ao zerar cargas");

must(!engine.energyRingOn(basePlayer({voc:"knight",equip:{ring:{item:"energy-ring"}}})),
  "knight ainda recebe Magic Shield de energy ring no online");
must(engine.energyRingOn(basePlayer({voc:"paladin",equip:{ring:{item:"energy-ring"}}})),
  "RP deveria poder usar energy ring no online");

const emP=basePlayer({
  hp:100,equip:{ring:{item:"time-ring",charges:200}},
  bag:{"might-ring":1},
  config:{equipHelper:{ring:{enabled:true,emergency:"might-ring",normal:"time-ring",equipBelow:50,restoreAbove:80}}}});
engine.tryAccessoryHelper({events:[],clock:now},emP,now);
must(emP.equip.ring&&emP.equip.ring.item==="might-ring",
  "Helper de emergência não trocou o anel com HP baixo");

function partyHunt(players,mobs){
  return {v:1,savedAt:now,kind:"hunt",huntId:"rats",instanceMode:"non-pvp",activeCharacterId:String(players[0].id),
    members:players.map((p)=>({id:String(p.id),p:JSON.parse(JSON.stringify(p))})),
    state:{gridW:21,gridH:13,
      players:players.map((p)=>({id:String(p.id),p:JSON.parse(JSON.stringify(p)),cx:p._cx,cy:p._cy})),
      mobs:mobs,events:[]}};
}
const boxK=basePlayer({id:1,voc:"knight",config:{attackMode:"box"}});boxK._cx=10;boxK._cy=6;
const boxR=basePlayer({id:2,voc:"paladin",config:{attackMode:"box"},
  equip:{weapon:{item:"bow"}}});boxR._cx=1;boxR._cy=1;
const boxM=basePlayer({id:3,voc:"sorcerer",config:{attackMode:"box"}});boxM._cx=18;boxM._cy=1;
const boxMobs=[];
for(let i=0;i<6;i++)boxMobs.push({id:"box-mob-"+i,slug:"rat",hp:5000,maxHp:5000,cx:10,cy:6});
const boxLive=engine.initializeAuthority(partyHunt([boxK,boxR,boxM],boxMobs),"c".repeat(64),now);
boxLive.authority.gridW=21;boxLive.authority.gridH=13;
const occ0=new Set();
const kCell=engine.boxTargetCell(boxLive.authority,boxLive.authority.players[0],occ0);
const rCell=engine.boxTargetCell(boxLive.authority,boxLive.authority.players[1],occ0);
const mCell=engine.boxTargetCell(boxLive.authority,boxLive.authority.players[2],occ0);
must(kCell&&Math.max(Math.abs(kCell.cx-10),Math.abs(kCell.cy-6))<=3,
  "BOX do knight não escolheu o melhor spot perto da box");
must(rCell&&((rCell.cx===kCell.cx&&Math.abs(rCell.cy-kCell.cy)===2)||
  (rCell.cy===kCell.cy&&Math.abs(rCell.cx-kCell.cx)===2)),
  "BOX do RP não ficou a 2 SQM na reta do knight");
must(mCell&&((mCell.cx===kCell.cx&&Math.abs(mCell.cy-kCell.cy)===3)||
  (mCell.cy===kCell.cy&&Math.abs(mCell.cx-kCell.cx)===3)),
  "BOX do mage não ficou a 3 SQM na reta do knight");

const safeP=basePlayer({id:4,voc:"sorcerer",config:{attackMode:"safe"}});safeP._cx=10;safeP._cy=6;
const safeLive=engine.initializeAuthority(partyHunt([safeP],[{id:"safe-mob",slug:"rat",hp:5000,maxHp:5000,cx:10,cy:6}]),
  "d".repeat(64),now);
safeLive.authority.gridW=21;safeLive.authority.gridH=13;
const safeCell=engine.safeTargetCell(safeLive.authority,safeLive.authority.players[0],new Set());
must(safeCell&&(safeCell.cx<=3||safeCell.cx>=18)&&(safeCell.cy<=3||safeCell.cy>=10),
  "SAFE não escolheu um canto da tela");

must(engine.playerAttackRangeSQM(basePlayer({voc:"paladin",equip:{weapon:{item:"bow"}}}))>=4,
  "alcance de distância do RP ficou melee no online");
must(engine.huntModeOf(boxLive.authority,boxLive.authority.players[0])==="box",
  "huntMode BOX não persistiu na autoridade");

const kiteP=basePlayer({voc:"paladin",config:{attackMode:"kiting",kiteDistance:3},equip:{weapon:{item:"bow"}}});
const kiteLive=liveOf(kiteP);
kiteLive.authority.players[0].cx=8;kiteLive.authority.players[0].cy=6;
kiteLive.authority.mobs[0].cx=10;kiteLive.authority.mobs[0].cy=6;
kiteLive.authority.players[0].walkAcc=5000;
engine.advanceAuthorityMovement(kiteLive.authority,now);
const kiteHere={cx:kiteLive.authority.players[0].cx,cy:kiteLive.authority.players[0].cy};
const kiteDist=Math.max(Math.abs(kiteHere.cx-10),Math.abs(kiteHere.cy-6));
must(kiteDist>=3,"kiting online não recuou para a distância configurada");

const comboP=basePlayer({voc:"sorcerer",level:80,mp:2000,
  supplies:{"sudden-death-rune":20},
  config:{combo:[
    {kind:"spell",id:"exori-flam",min:1},
    {kind:"rune",id:"sudden-death-rune",min:1},
    {kind:"spell",id:"exevo-flam-hur",min:1}]}});
const comboLive=liveOf(comboP);
const comboItem=comboLive.authority.players[0];
comboItem.p._spellCd={"exori-flam":now+20000};
const pick=engine.nextComboSpell(comboLive.authority,comboItem,comboItem.p,now,
  comboLive.authority.mobs[0],comboLive.authority.mobs);
must(pick&&pick.id==="exevo-flam-hur"&&!pick.rune,
  "combo usou runa no meio tendo spell com cooldown disponível");
comboItem.p._spellCd={"exori-flam":now+20000,"exevo-flam-hur":now+20000};
const pickRune=engine.nextComboSpell(comboLive.authority,comboItem,comboItem.p,now,
  comboLive.authority.mobs[0],comboLive.authority.mobs);
must(pickRune&&pickRune.rune&&pickRune.id==="sudden-death-rune",
  "combo deveria usar a runa só quando todas as spells estão em CD");

engine.ITEMS["test-knight-shield"]={t:"shield",def:36};
const bashP=basePlayer({voc:"knight",level:40,mp:800,
  skills:{sword:50,axe:10,club:10,dist:10,fist:10,shield:40},
  equip:{weapon:{item:"magic-sword"},shield:{item:"test-knight-shield"}},
  config:{combo:[{kind:"spell",id:"exori-ico-scu",min:1}],spellAttack:true}});
const bashLive=liveOf(bashP);
bashLive.authority.players[0].cx=9;bashLive.authority.players[0].cy=6;
bashLive.authority.mobs[0].cx=10;bashLive.authority.mobs[0].cy=6;
bashLive.authority.players[0].attackAcc=2000;
bashLive.authority.mobs[0].attackAcc=0;
const bashState=JSON.parse(engine.advanceAuthorityState(JSON.stringify(bashLive),now,now+1000,{
  players:[{id:String(bashP.id),x:9.5/30,y:6.5/30,cx:9,cy:6,
    combo:[{kind:"spell",id:"exori-ico-scu",min:1}]}],
  mobs:[{id:"parity-mob",x:10.5/30,y:6.5/30,cx:10,cy:6}]}).state);
must((bashState.state.events||[]).some((e)=>e.t==="say"&&/exori ico scu/i.test(e.text)),
  "Shield Bash não conjurou no online");
must((bashState.authority.mobs[0].weakNextUntil>0)
  || (bashState.state.events||[]).some((e)=>e.t==="taken"),
  "Shield Bash não marcou weakNext no alvo");

const noShield=basePlayer({voc:"knight",level:40,mp:800,
  skills:{sword:50,axe:10,club:10,dist:10,fist:10,shield:40},
  equip:{weapon:{item:"magic-sword"}},
  config:{combo:[{kind:"spell",id:"exori-ico-scu",min:1}]}});
const noShieldLive=liveOf(noShield);
const noPick=engine.nextComboSpell(noShieldLive.authority,noShieldLive.authority.players[0],
  noShieldLive.authority.players[0].p,now,noShieldLive.authority.mobs[0],noShieldLive.authority.mobs);
must(!noPick||noPick.id!=="exori-ico-scu","Shield Bash saiu sem escudo no online");

console.log("test_idle_online_parity: ok");
