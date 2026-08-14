/* Condition bar OTC + knight elemental melee FX (engine unit, no HTTP). */
"use strict";
const fs=require("fs"),path=require("path");
const engine=require("../server/authoritative_engine");
const root=path.join(__dirname,".."),game=path.join(root,"game");
function must(ok,msg){if(!ok)throw Error(msg);}

const html=fs.readFileSync(path.join(game,"index.html"),"utf8");
const layout=fs.readFileSync(path.join(game,"css","layout.css"),"utf8");
const ui=fs.readFileSync(path.join(game,"js","ui.js"),"utf8");
const icondata=fs.readFileSync(path.join(game,"js","icondata.js"),"utf8");
const otcHud=fs.readFileSync(path.join(game,"js","otc-hud.js"),"utf8");
const gameJs=fs.readFileSync(path.join(game,"js","game.js"),"utf8");

must(html.includes('id="cond-bar"')&&html.includes('id="status-bar"'),
  "index.html perdeu cond-bar/status-bar");
must(layout.includes(".status-bar")&&layout.includes(".sb-ico")&&layout.includes(".sb-tempo"),
  "layout.css sem barra/ícone/duração de condition");
must(ui.includes("paintConditionBar")&&ui.includes("collectConditionBarItems")&&
  ui.includes("cond-magic-shield")&&ui.includes("sb-tempo"),
  "ui.js não pinta a condition bar com overlay de duração");
must(icondata.includes("cond-poisoned")&&icondata.includes("cond-burning")&&
  icondata.includes("cond-electrified")&&icondata.includes("cond-magic-shield")&&
  icondata.includes("CONDITION_ICON_SLUG"),
  "icondata.js sem mapa OTC poison/fire/energy/magic-shield");
must(otcHud.includes("collectConditionBarItems")&&otcHud.includes("assets/ui/conditions/"),
  "otc-hud.js não usa os sprites OTC de condition");
must(gameJs.includes("renderStatusBar")&&gameJs.includes("renderPlayerStates")&&
  gameJs.includes("hudAcc"),
  "game.js não atualiza a condition bar no tick do HUD");
must(html.includes("otc-hud.js?v=cond-bar-v1")&&html.includes("ui.js?v=sqm-hud-v1")&&
  html.includes("icondata.js?v=cond-icons-v1"),
  "cache-bust da condition bar ausente no index.html");

function directDescriptor(p){
  const member={id:String(p.id),p:JSON.parse(JSON.stringify(p))};
  return {v:1,savedAt:1000,kind:"hunt",huntId:"rats",instanceMode:"non-pvp",
    activeCharacterId:String(p.id),members:[member],
    state:{players:[{id:String(p.id),p:member.p}],mobs:[{id:"direct-mob",slug:"rat"}],events:[]}};
}
const basePlayer={id:1,name:"KnightFx",voc:"knight",level:20,exp:1000,hp:300,mp:50,gold:5000,
  skills:{sword:40,axe:10,club:10,dist:10,fist:10,shield:30},equip:{weapon:{item:"sword"}},
  supplies:{},lootPouch:{},kills:{},bosses:{},config:{spellAttack:false}};

const sword=engine.ITEMS.sword||{};const swordPrev={el:sword.el,elDmg:sword.elDmg};
sword.el="fire";sword.elDmg=24;
const dualDesc=directDescriptor(Object.assign({},basePlayer,{id:31}));
const dualAuth=engine.initializeAuthority(dualDesc,"31".repeat(32),1000);
dualAuth.authority.mobs[0].hp=dualAuth.authority.mobs[0].maxHp=999999;
dualAuth.authority.mobs[0].damage=0;
dualAuth.authority.mobs[0].def=Object.assign({},dualAuth.authority.mobs[0].def,{skills:[],defSkills:[]});
dualAuth.authority.players[0].attackAcc=1200;
const dualAfter=JSON.parse(engine.advanceAuthorityState(JSON.stringify(dualAuth),1000,2000).state);
sword.el=swordPrev.el;sword.elDmg=swordPrev.elDmg;
const dualHits=dualAfter.state.events.filter((e)=>e.t==="hit"&&e.dual===1);
const physHits=dualAfter.state.events.filter((e)=>e.t==="hit"&&e.el==="physical"&&!e.dual);
must(physHits.length>=1&&dualHits.length>=1&&dualHits[0].el==="fire"&&dualHits[0].fx==="hit-by-fire",
  "knight fire weapon sem dual físico+fire/fx: "+JSON.stringify((dualAfter.state.events||[]).filter((e)=>e.t==="hit").map((e)=>({el:e.el,dual:e.dual,fx:e.fx}))));
must(dualAfter.authority.players[0].p.conditions!==undefined,
  "snapshot do player omitiu p.conditions");

const imbDesc=directDescriptor(Object.assign({},basePlayer,{id:32,
  imbuements:{"equip:weapon":[{key:"Scorch",tier:3}]}}));
const imbAuth=engine.initializeAuthority(imbDesc,"32".repeat(32),1000);
imbAuth.authority.mobs[0].hp=imbAuth.authority.mobs[0].maxHp=999999;
imbAuth.authority.mobs[0].damage=0;
imbAuth.authority.mobs[0].def=Object.assign({},imbAuth.authority.mobs[0].def,{skills:[],defSkills:[]});
imbAuth.authority.players[0].attackAcc=1200;
const imbAfter=JSON.parse(engine.advanceAuthorityState(JSON.stringify(imbAuth),1000,2000).state);
const imbDual=(imbAfter.state.events||[]).filter((e)=>e.t==="hit"&&e.dual===1);
must(imbDual.length>=1&&imbDual[0].el==="fire"&&imbDual[0].fx==="hit-by-fire",
  "Scorch melee sem fire+fx: "+JSON.stringify((imbAfter.state.events||[]).filter((e)=>e.t==="hit").map((e)=>({el:e.el,dual:e.dual,fx:e.fx}))));

console.log("OK: condition bar HTML/CSS/ícones OTC e knight elemental melee fx.");
