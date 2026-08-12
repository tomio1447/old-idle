/* Regressão: party online da mesma conta entra completa e mantém voc/presets. */
"use strict";
const fs=require("fs"),path=require("path"),vm=require("vm");
const js=path.join(__dirname,"..","game","js");
const party=fs.readFileSync(path.join(js,"party.js"),"utf8");
const combat=fs.readFileSync(path.join(js,"combat.js"),"utf8");
const game=fs.readFileSync(path.join(js,"game.js"),"utf8");
const admin=fs.readFileSync(path.join(js,"admin.js"),"utf8");
const server=fs.readFileSync(path.join(__dirname,"..","server","server.js"),"utf8");
function must(ok,msg){if(!ok)throw Error(msg);}
const start=party.indexOf("function partyCombatLoad"),end=party.indexOf("\n\n/* Posiciona",start);
const leader={id:"1",name:"Kina",voc:"knight",level:500,sex:"male",config:{combo:["ek"]},equip:{weapon:{item:"sword"}},
  _partyOnline:{isLeader:true,leader:{id:"1"},members:[{id:"2"},{id:"3"}]}};
const cache=[
  {id:"1",name:"Kina",voc:"knight",level:500,sex:"male",snapshot:{id:"1",name:"Kina",voc:"knight",level:500,config:{combo:["ek"]},equip:{weapon:{item:"sword"}}}},
  {id:"2",name:"Pally",voc:"paladin",level:500,sex:"female",snapshot:{id:"2",name:"Pally",voc:"paladin",level:500,config:{combo:["rp"]},equip:{weapon:{item:"bow"}}}},
  {id:"3",name:"Druidero",voc:"druid",level:500,sex:"male",snapshot:{id:"3",name:"Druidero",voc:"druid",level:500,config:{combo:["ed"]},equip:{weapon:{item:"rod"}}}},
];
const ctx={
  console,Math,Set,partyOnlineMode:()=>true,accountCharacterCacheRead:()=>cache,
  normalizePlayer:p=>p,characterId:p=>p.id,maxStats:()=>({hp:1000,mp:1000}),
};
vm.createContext(ctx);vm.runInContext(party.slice(start,end),ctx);
const entities=ctx.partyCombatLoad(leader);
must(entities&&entities.length===3,"apenas um personagem online foi carregado na hunt");
must(entities.map(e=>e.p.voc).join(",")==="knight,paladin,druid",
  "vocations da party vieram do personagem ativo");
must(entities[1].p.config.combo[0]==="rp"&&entities[1].p.equip.weapon.item==="bow"&&
  entities[2].p.config.combo[0]==="ed"&&entities[2].p.equip.weapon.item==="rod",
  "presets/equipamentos individuais não foram preservados");
must(!combat.includes('if (typeof partyOnlineMode === "function" && partyOnlineMode()) return;')&&
  combat.includes("if(online&&(!player._partyOnline||!player._partyOnline.isLeader))return;"),
  "newCombat ainda bloqueia party online ou não exige líder");
must(party.includes("accountSaveCharacter(token,String(ent.id),ent.p)")&&
  game.includes('typeof partyCombatSaveAll==="function")partyCombatSaveAll()'),
  "autosave não persiste todos os membros por id próprio");
must(admin.includes("await accountRepairCharacter(sessionToken(),String(p.id),newVoc,p)")&&
  server.includes("async function repairCharacterIdentity"),
  "Admin não usa rota autorizada para trocar vocation-base");
must(server.includes("snapshot:data"),"API /me não fornece snapshots completos para a party");
console.log("OK: Admin troca vocation e party online carrega todos com presets/equip próprios.");
