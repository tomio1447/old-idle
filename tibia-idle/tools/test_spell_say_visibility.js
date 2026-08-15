/* Falas de magia (TALKTYPE_SPELL) no combate autoritativo: o caster diz as
 * palavras com whoId; Heal Friend inclui o nome do alvo; o lote não descarta
 * `say`; o cliente desenha a fala de todos os membros, não só sio. */
"use strict";
const fs=require("fs"),path=require("path");
const engine=require("../server/authoritative_engine");
const root=path.join(__dirname,"..");
const game=fs.readFileSync(path.join(root,"game","js","game.js"),"utf8");
const render=fs.readFileSync(path.join(root,"game","js","render.js"),"utf8");
const index=fs.readFileSync(path.join(root,"game","index.html"),"utf8");
function must(ok,msg){if(!ok)throw Error(msg);}
function clone(v){return JSON.parse(JSON.stringify(v));}
function directDescriptor(members,overrides){
  const list=Array.isArray(members)?members:[members];
  const first=list[0];
  return Object.assign({v:1,savedAt:1000,kind:"hunt",huntId:"rats",bossId:null,
    instanceMode:"non-pvp",activeCharacterId:String(first.id),
    members:list.map((p)=>({id:String(p.id),p:clone(p)})),
    state:{gridW:30,gridH:30,players:list.map((p,i)=>({id:String(p.id),p:clone(p),cx:10+i,cy:10,
      x:(10.5+i)/30,y:10.5/30})),
      mobs:[{id:"say-rat",slug:"rat",cx:11,cy:10,x:11.5/30,y:10.5/30,hp:999999,maxHp:999999}],
      events:[]}},overrides||{});
}
function quietMobs(auth){
  for(const mob of auth.mobs||[]){
    mob.damage=0;mob.hp=mob.maxHp=999999;mob.attackSpeed=Number.MAX_SAFE_INTEGER;
    mob.def=Object.assign({},mob.def,{skills:[]});
  }
}
function says(events,text,whoId){
  return (events||[]).filter((e)=>e&&e.t==="say"&&(!text||e.text===text)&&
    (whoId===undefined||String(e.whoId)===String(whoId)));
}

must(engine.ALL_SPELLS.exori&&engine.ALL_SPELLS.exori.words==="exori","exori sem words");
must(engine.ALL_SPELLS["exura-med-ico"]&&engine.ALL_SPELLS["exura-med-ico"].words==="exura med ico",
  "exura med ico sem words");
must(engine.ALL_SPELLS["exeta-amp-res"]&&engine.ALL_SPELLS["exeta-amp-res"].words==="exeta amp res",
  "exeta amp res sem words");
must(engine.ALL_SPELLS["exura-sio"]&&engine.ALL_SPELLS["exura-sio"].words==="exura sio","exura sio sem words");

const knight={id:10,name:"Kina",voc:"knight",level:400,exp:engine.expForLevel(400),
  hp:999999,mp:999999,gold:100000,ml:20,skills:{sword:100,axe:10,club:10,dist:10,fist:10,shield:80},
  equip:{weapon:{item:"sword"}},supplies:{},lootPouch:{},kills:{},bosses:{},
  config:{spellAttack:true,combo:[{kind:"spell",id:"exori",min:1}],
    healSpell:"exura-med-ico",healSpellAt:99,healAt:99,exetaAmpRes:true,exetaRes:false}};
const knightAuth=engine.initializeAuthority(directDescriptor(knight),"s".repeat(64),1000);
quietMobs(knightAuth.authority);
const kMax=engine.maxStats(knightAuth.authority.players[0].p);
knightAuth.authority.players[0].p.hp=Math.max(1,Math.floor(kMax.hp*.35));
knightAuth.authority.players[0].p.mp=kMax.mp;
knightAuth.authority.players[0].attackAcc=0;
const knightAfter=JSON.parse(engine.advanceAuthorityState(JSON.stringify(knightAuth),2000,3000).state);
const knightEvents=knightAfter.state.events||[];
const knightId=String(knightAfter.authority.players[0].id);
must(says(knightEvents,"exura med ico",knightId).length>=1,
  "heal do knight não emitiu say exura med ico com whoId: "+
  knightEvents.filter((e)=>e.t==="say").map((e)=>e.text+"@"+e.whoId).join("|"));
must(says(knightEvents,"exori",knightId).length>=1,
  "combo exori não emitiu say com whoId: "+
  knightEvents.filter((e)=>e.t==="say").map((e)=>e.text+"@"+e.whoId).join("|"));
must(says(knightEvents,"exeta amp res",knightId).length>=1,
  "challenge não emitiu say exeta amp res com whoId: "+
  knightEvents.filter((e)=>e.t==="say"||e.t==="challenge").map((e)=>e.t+":"+(e.text||e.id)+"@"+e.whoId).join("|"));
must(says(knightEvents,"exura med ico",knightId).every((e)=>Number.isFinite(Number(e.x))&&e.screen===true),
  "say de cura sem posição/screen do caster");

const druid={id:30,name:"Druideiro",voc:"druid",level:400,exp:engine.expForLevel(400),
  hp:999999,mp:999999,gold:100000,ml:80,skills:{sword:10,fist:10,shield:30},
  equip:{},supplies:{},lootPouch:{},kills:{},bosses:{},
  config:{spellAttack:false,healSpellAt:1,healAt:1,
    healFriend:{spells:{"exura-sio":{enabled:true,hpBelow:80}}}}};
const partyKnight=Object.assign(clone(knight),{id:10,name:"Kina",config:{spellAttack:false,exetaAmpRes:false,healSpellAt:1,healAt:1}});
const partyAuth=engine.initializeAuthority(directDescriptor([partyKnight,druid]),"h".repeat(64),1000);
quietMobs(partyAuth.authority);
for(const item of partyAuth.authority.players){
  const max=engine.maxStats(item.p);item.p.mp=max.mp;
  if(item.p.voc==="knight")item.p.hp=Math.max(1,Math.floor(max.hp*.40));
  else item.p.hp=max.hp;
  item.attackAcc=-100000;
}
const partyAfter=JSON.parse(engine.advanceAuthorityState(JSON.stringify(partyAuth),1000,2000).state);
const partyEvents=partyAfter.state.events||[];
const sio=says(partyEvents,null,"30").find((e)=>/exura (?:tio )?sio/.test(String(e.text)));
must(sio&&/^exura (?:tio )?sio "Kina"$/.test(String(sio.text))&&String(sio.whoId)==="30",
  "heal-friend não emitiu say parametrizado no caster: "+
  partyEvents.filter((e)=>e.t==="say"||e.t==="heal-friend").map((e)=>e.t+":"+(e.text||e.spell)+"@"+e.whoId).join("|"));
must(says(partyEvents,null,"30").filter((e)=>/exura (?:tio )?sio "Kina"/.test(String(e.text))).length===1,
  "say de heal-friend duplicado no mesmo tick");

const capDesc=engine.initializeAuthority(directDescriptor(knight),"c".repeat(64),1000);
capDesc.authority.events=Array.from({length:90},(_,i)=>({t:"hit",dmg:i+1,whoId:"10"}));
capDesc.authority.events.push({t:"say",text:"exori",whoId:"10",x:.3,y:.3,screen:true,ts:1000});
const capped=engine.materializeAuthority(capDesc);
must((capped.state.events||[]).some((e)=>e.t==="say"&&e.text==="exori"&&String(e.whoId)==="10"),
  "cap de eventos descartou say de magia sob lote de hits");

must(!game.includes("if (!selecionado) break"),
  "drainEvents ainda esconde a fala de quem não está selecionado");
must(game.includes("TALKTYPE_SPELL: palavras no caster"),
  "drainEvents não aplica fala no caster da party");
must(!game.includes("creatureSay(healedEnt"),
  "heal-friend ainda desenha as palavras no alvo em vez do caster");
must((render.includes("drawCreatureSpeech(ctx, info.ent, info.cx, y, null")||
      render.includes("drawCreatureSpeech(ctx, info.ent, info.cx, y, dt"))&&
  render.includes("info.ent === combat.player"),
  "renderer ainda desenha só playerTalk compartilhado nos players");
must(/js\/game\.js\?v=/.test(index)&&/js\/render\.js\?v=/.test(index),
  "index.html sem cache-bust de game.js/render.js");

console.log("OK: say de exura med ico / exori / exeta amp res e exura sio \"alvo\" com whoId visível para a party.");
