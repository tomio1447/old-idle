/* Regressão: modal Party local não referencia variáveis da aba Heal Friend. */
"use strict";
const fs=require("fs"),path=require("path"),vm=require("vm");
const src=fs.readFileSync(path.join(__dirname,"..","game","js","party-ui.js"),"utf8");
function must(ok,msg){if(!ok)throw Error(msg);}
const start=src.indexOf("function renderPartyModal");
const end=src.indexOf("\n/* ------------------------------------------------------------------ */\n/* HEAL FRIEND",start);
must(start>0&&end>start,"renderPartyModal não encontrado");
const segment=src.slice(start,end);
must(!segment.includes("for (const m of alvos)"),"renderPartyModal ainda usa `alvos` fora do escopo");
const box={innerHTML:"",querySelector(){return null;}};
const p={id:"leader",name:"Leader",voc:"knight",level:100,
  party:{members:[],shareExp:false}};
const ctx={
  console,Date,Object,
  G:{p},
  $(sel){return sel==="#party-content"?box:null;},$$(sel){return [];},
  partyOnlineMode(){return false;},partyLocalData(){return {leaderId:"leader",leaderName:"Leader",members:[]};},
  ensureParty(){},partyCanShare(){return {ok:false,msg:"Adicione membros"};},
  partyIsLeaderLocal(){return true;},partyIsMemberLocal(){return false;},
  getCharacters(){return [p];},characterId(x){return x.id;},partyCanInviteNow(){return true;},
  partyPendingInvites(){return [];},partyPendingInvitesAll(){return [];},partyAvailableMembers(){return [];},
  partyExpBonusPct(){return 0;},partyVocations(){return new Set(["knight"]);},
  partyAnalyserSession(){return null;},partyVocName(v){return v;},fmtFull(n){return String(n||0);},
  toast(){},renderAll(){},partyLeave(){return {ok:true,msg:"ok"};},openPartyAnalyserModal(){},
};
vm.createContext(ctx);vm.runInContext(segment,ctx);ctx.renderPartyModal(p);
must(box.innerHTML.includes("Party Hunt Analyser"),"modal Party local não terminou de renderizar");
console.log("OK: modal Party local renderiza sem ReferenceError de `alvos`.");
