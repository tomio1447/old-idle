/* Regressão: Monk na mesma conta completa as 5 vocações e dá 102% de bônus. */
"use strict";
const fs=require("fs"),path=require("path"),vm=require("vm");
const source=fs.readFileSync(path.join(__dirname,"..","game","js","party.js"),"utf8"),
  partyUi=fs.readFileSync(path.join(__dirname,"..","game","js","party-ui.js"),"utf8"),
  index=fs.readFileSync(path.join(__dirname,"..","game","index.html"),"utf8");
const start=source.indexOf("function partyVocations"),end=source.indexOf("\nfunction partyApplyToMember",start);
function must(ok,msg){if(!ok)throw Error(msg);}
const ctx={Set,Math,ensureParty(p){p.party=p.party||{members:[],shareExp:false};return p.party;}};
vm.createContext(ctx);vm.runInContext(source.slice(start,end),ctx);
const leader={id:"1",voc:"knight",level:500,party:{shareExp:true,members:[
  {id:"2",voc:"paladin",level:500},{id:"3",voc:"druid",level:500},
  {id:"4",voc:"sorcerer",level:500},{id:"5",voc:"monk",level:500,account_id:1},
]}};
must(ctx.partyVocations(leader).size===5&&ctx.partyExpBonusPct(leader)===102,
  "EK/RP/ED/MS/Monk não formaram as cinco vocações");
const shared=ctx.partyShareExp(leader,100);
must(shared&&shared.bonusPct===102&&shared.S===2.02&&shared.P===5&&shared.leaderExp===40&&
  shared.members.every((member)=>member.exp===40),"pool de 202% não foi dividido igualmente entre cinco");
leader.party.members[3].level=100;
must(!ctx.partyCanShare(leader).ok&&ctx.partyShareExp(leader,100)===null,
  "regra de nível mínimo 2/3 não bloqueou o bônus");
must(partyUi.includes('expBonus=expVocs.size>=5?102')&&partyUi.includes('composição completa EK/RP/ED/MS/Monk')&&
  index.includes('js/party-ui.js?v=party-exp-v1')&&index.includes('js/party.js?v=five-vocations-v1'),
  "party online não exibe/cache-busta a composição completa e seu bônus");
console.log("OK: Monk da mesma conta completa a party e libera bônus de EXP de 102% dentro das regras.");
