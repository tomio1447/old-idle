/* Regressão: analytics da hunt ficam na lateral e Raw XP ignora bônus. */
"use strict";
const fs=require("fs"),path=require("path"),vm=require("vm");
const game=path.join(__dirname,"..","game"),js=path.join(game,"js");
const html=fs.readFileSync(path.join(game,"index.html"),"utf8");
const analyserSource=fs.readFileSync(path.join(js,"analyzers.js"),"utf8");
const combatSource=fs.readFileSync(path.join(js,"combat.js"),"utf8");
const gameSource=fs.readFileSync(path.join(js,"game.js"),"utf8");
function must(ok,msg){if(!ok)throw Error(msg);}

must(!html.includes('id="hunt-info"')&&!html.includes("Caçada atual")&&
  html.includes('id="otc-analyser-content"')&&html.includes('role="tablist"')&&
  html.includes('js/analyzers.js?v=hunt-session-v1')&&html.includes('js/combat.js?v=hunt-session-v1'),
  "Caçada atual não foi substituída/cache-bustada pelos analytics laterais");
must(!/getElementById\(["']modal["']\)|classList\.add\(["']show["']\)/.test(analyserSource)&&
  analyserSource.includes('activeOtcAnalyser = "hunting"')&&
  gameSource.includes('if (typeof renderOtcAnalyser === "function") renderOtcAnalyser()'),
  "analyser ainda abre modal ou não atualiza em tempo real");

const document={readyState:"loading",addEventListener(){},getElementById(){return null;}};
const analyserCtx={console,document,Date,Math,Number,String,Object,Array,GAMEDATA:{hunts:{rats:{name:"Rats"}}},
  fmtFull(n){return String(Math.round(n));}};
vm.createContext(analyserCtx);vm.runInContext(analyserSource,analyserCtx,{filename:"analyzers.js"});
const body=analyserCtx.otcAnalyserBody("hunting",{huntId:"rats",hunt:{name:"Rats"},instanceMode:"non-pvp",stats:{
  time:3600000,kills:2,exp:300,rawExp:100,rawHp:200,gold:20,monsters:{rat:{name:"Rat",kills:2,rawExp:100,rawHp:200}},
}});
must(body.includes("Raw XP/h")&&body.includes("Raw XP/HP")&&body.includes("100")&&body.includes("300")&&
  body.includes("stage, PvP, Prey, VIP, Soul War ou bônus de party"),
  "Hunt Session não separa XP obtida de Raw XP/h");

const start=combatSource.indexOf("function displayMonsterName");
const end=combatSource.indexOf("\nfunction applyBossMultiplier",start);
must(start>=0&&end>start,"coletor Raw XP não encontrado");
const combatCtx={GAMEDATA:{monsters:{rat:{name:"Rat",exp:50,hp:100}}},Math,Number,String};
vm.createContext(combatCtx);vm.runInContext(combatSource.slice(start,end),combatCtx);
const combat={stats:{}};
combatCtx.recordRawMonsterStats(combat,{slug:"rat",def:{name:"Influenced Rat",exp:999,hp:999},maxHp:999});
must(combat.stats.rawExp===50&&combat.stats.rawHp===100&&combat.stats.monsters.rat.kills===1,
  "Raw XP/HP usou bônus da criatura em vez dos valores originais");

// O modo online recebe a mesma telemetria do núcleo autoritativo.
const engine=require("../server/authoritative_engine");
const player={id:"1",name:"Analytics",voc:"knight",level:999,exp:999999999,hp:999999,mp:999999,
  gold:0,skills:{sword:200},equip:{weapon:{item:"magic-sword"}},supplies:{},lootPouch:{},kills:{},bosses:{}};
const member={id:"1",p:player};
const descriptor={v:1,savedAt:1000,kind:"hunt",huntId:"rats",instanceMode:"non-pvp",activeCharacterId:"1",
  members:[member],state:{players:[member],mobs:[{id:"rat",slug:"rat"}],events:[]}};
const online=engine.initializeAuthority(descriptor,"a".repeat(64),1000);
for(const mob of online.authority.mobs)mob.damage=0;
const advanced=JSON.parse(engine.advanceAuthorityState(JSON.stringify(online),5000,6000).state);
must(advanced.authority.stats.time===5000&&advanced.authority.stats.rawExp>0&&
  advanced.authority.stats.rawHp>0&&advanced.authority.stats.monsters.rat.kills>0,
  "combate online não materializou tempo e Raw XP/HP no analyser");
console.log("OK: Hunt Session lateral atualiza ao vivo e separa XP real de Raw XP/h sem multiplicadores.");
