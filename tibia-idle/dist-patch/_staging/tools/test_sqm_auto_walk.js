/* SQM (sem micro-passo) + botão AUTO: predição visual e autoridade. */
"use strict";
const fs=require("fs"),path=require("path"),vm=require("vm");
const engine=require("../server/authoritative_engine");
const game=path.join(__dirname,"..","game");

function must(ok,msg){if(!ok)throw Error(msg);}
function clone(v){return JSON.parse(JSON.stringify(v));}

const html=fs.readFileSync(path.join(game,"index.html"),"utf8");
must(html.includes('id="btn-auto-walk"')&&html.includes('id="sqm-walk-hud"')&&
  html.includes("js/grid.js?v=")&&
  html.includes("js/gridai.js?v=")&&html.includes("js/game.js?v=")&&
  html.includes("js/party-ui.js?v=")&&html.includes("js/player.js?v=")&&
  html.includes("css/layout.css?v="),
  "botão AUTO na tela / cache-bust SQM ausente");
must(!/panel\.bag[\s\S]{0,200}btn-auto-walk/.test(html),
  "AUTO ainda escondido só no título da Mochila");
must(fs.readFileSync(path.join(game,"js","gridai.js"),"utf8").includes("manualThinkStep")&&
  fs.readFileSync(path.join(game,"js","gridai.js"),"utf8").includes("playerAutoWalkOn")&&
  fs.readFileSync(path.join(game,"js","gridai.js"),"utf8").includes("!playerAutoWalkOn(ent.p)"),
  "IA visual não respeita AUTO off (ativo + aliado park)");
must(fs.readFileSync(path.join(game,"js","party-ui.js"),"utf8").includes("data-auto-walk-char")&&
  fs.readFileSync(path.join(game,"js","player.js"),"utf8").includes("togglePlayerAutoWalk")&&
  fs.readFileSync(path.join(game,"js","player.js"),"utf8").includes("resolvePlayerById"),
  "toggle AUTO por personagem ausente");
must(fs.readFileSync(path.join(game,"js","account-client.js"),"utf8").includes("walkGoal")&&
  fs.readFileSync(path.join(game,"js","ui.js"),"utf8").includes("sqm-walk-hint"),
  "HUD SQM / walkGoal online ausentes");
must(fs.readFileSync(path.join(game,"js","render.js"),"utf8").includes("function monsterAttackTypeIcon")&&
  fs.readFileSync(path.join(game,"js","render.js"),"utf8").includes("melee-atk")&&
  fs.readFileSync(path.join(game,"js","ui.js"),"utf8").includes("iconWiki"),
  "ícones OTC melee/aura ausentes");

const gridSrc=fs.readFileSync(path.join(game,"js","grid.js"),"utf8");
const ctx={console,Math,Map,Set,Date};vm.createContext(ctx);vm.runInContext(gridSrc,ctx);
must(typeof ctx.snapIdleToCell==="function"&&typeof ctx.combatKeyDir==="function",
  "snapIdleToCell / combatKeyDir ausentes");
const idle={cx:4,cy:3,x:0.41,y:0.22,moving:false};
ctx.GRID_W=21;ctx.GRID_H=13;
ctx.snapIdleToCell(idle);
must(Math.abs(idle.x-(4.5)/21)<1e-9&&Math.abs(idle.y-(3.5)/13)<1e-9,
  "parado não centraliza no SQM");
const dir=ctx.combatKeyDir({up:true,right:true});
must(dir&&dir.dx===1&&dir.dy===-1,"WASD diagonal não virou 1 SQM");

const playerSrc=fs.readFileSync(path.join(game,"js","player.js"),"utf8");
const pctx={console,Math,Map,Set,Date,VOCATIONS:{},PROMOTION_NAMES:{},SKILL_NAMES:{}};
vm.createContext(pctx);
try{vm.runInContext(playerSrc,pctx);}catch(e){/* player.js puxa globals; só precisamos das helpers */}
must(typeof pctx.playerAutoWalkOn==="function"||playerSrc.includes("function playerAutoWalkOn"),
  "playerAutoWalkOn ausente");
must(playerSrc.includes("function togglePlayerAutoWalk")&&playerSrc.includes("function resolvePlayerById"),
  "helpers de park por personagem ausentes");

function desc(members){
  const list=Array.isArray(members)?members:[members];
  return {v:1,savedAt:1000,kind:"hunt",huntId:"rats",instanceMode:"non-pvp",
    activeCharacterId:String(list[0].id),
    members:list.map((p)=>({id:String(p.id),p:clone(p)})),
    state:{gridW:30,gridH:30,
      players:list.map((p,i)=>({id:String(p.id),p:clone(p),cx:10+i,cy:10,x:(10.5+i)/30,y:10.5/30})),
      mobs:[{id:"rat-1",slug:"rat",hp:999999,maxHp:999999,damage:0,cx:20,cy:20,x:20.5/30,y:20.5/30}],
      events:[]}};
}
function player(id,extra){
  return Object.assign({id:id||1,name:"Kina"+String(id||1),voc:"knight",level:50,exp:engine.expForLevel(50),
    hp:800,mp:200,gold:1000,ml:10,
    skills:{sword:40,axe:10,club:10,dist:10,fist:10,shield:30},
    equip:{weapon:{item:"sword"}},supplies:{},lootPouch:{},kills:{},bosses:{},
    config:{spellAttack:false,noHealthPotions:true,noManaPotions:true,autoWalk:true}},extra||{});
}

const snapStart=engine.initializeAuthority(desc(player()),"a".repeat(64),1000);
for(const mob of snapStart.authority.mobs||[]){mob.damage=0;mob.attackAcc=-100000;}
const vis={players:[{id:"1",x:0.41,y:0.52,cx:10,cy:10}],mobs:[]};
const snapAfter=JSON.parse(engine.advanceAuthorityState(JSON.stringify(snapStart),200,1200,vis).state);
const snapped=snapAfter.authority.players[0];
must(Math.abs(snapped.x-(10.5)/30)<1e-9&&Math.abs(snapped.y-(10.5)/30)<1e-9,
  "autoridade copiou x/y interpolado em vez do centro do SQM");

const manual=player();manual.config.autoWalk=false;
const manStart=engine.initializeAuthority(desc(manual),"b".repeat(64),1000);
for(const mob of manStart.authority.mobs||[]){mob.damage=0;mob.attackAcc=-100000;}
const cx0=manStart.authority.players[0].cx;
const manAfter=JSON.parse(engine.advanceAuthorityState(JSON.stringify(manStart),2000,3000).state);
must(manAfter.authority.players[0].cx===cx0,
  "AUTO off ainda perseguiu o monstro sozinho");

const stepP=player();stepP.config.autoWalk=false;
const stepStart=engine.initializeAuthority(desc(stepP),"c".repeat(64),1000);
for(const mob of stepStart.authority.mobs||[]){mob.damage=0;mob.attackAcc=-100000;}
stepStart.authority.players[0].p.config.autoWalk=false;
stepStart.authority.players[0].walkIntent={dx:1,dy:0};
stepStart.authority.players[0].walkAcc=1000;
const stepAfter=JSON.parse(engine.advanceAuthorityState(JSON.stringify(stepStart),200,1200).state);
must(stepAfter.authority.players[0].cx===11,
  "AUTO off + walkIntent não andou 1 SQM");

/* Park de 1 membro da party: AUTO off nele, AUTO on no outro — o parado
 * não é puxado de volta para o monstro. */
const hunter=player(1);const parked=player(2,{name:"Parked",config:{spellAttack:false,
  noHealthPotions:true,noManaPotions:true,autoWalk:false}});
const partyStart=engine.initializeAuthority(desc([hunter,parked]),"d".repeat(64),1000);
for(const mob of partyStart.authority.mobs||[]){mob.damage=0;mob.attackAcc=-100000;}
const parkEnt=partyStart.authority.players.find((e)=>String(e.id)==="2");
must(parkEnt&&parkEnt.p.config.autoWalk===false,"membro park sem autoWalk false");
const parkCx=parkEnt.cx,parkCy=parkEnt.cy;
const partyVis={players:[
  {id:"1",cx:10,cy:10,x:10.5/30,y:10.5/30,autoWalk:true},
  {id:"2",cx:parkCx,cy:parkCy,x:(parkCx+.5)/30,y:(parkCy+.5)/30,autoWalk:false},
],mobs:[]};
const partyAfter=JSON.parse(engine.advanceAuthorityState(JSON.stringify(partyStart),2500,3500,partyVis).state);
const still=partyAfter.authority.players.find((e)=>String(e.id)==="2");
must(still&&still.cx===parkCx&&still.cy===parkCy,
  "AUTO da party puxou o membro estacionado de volta");

console.log("OK: SQM HUD, park por personagem, AUTO off na IA, WASD 1 SQM.");
