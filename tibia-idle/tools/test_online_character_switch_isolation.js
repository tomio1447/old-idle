/* Regressão: trocar personagem online não salva RP por cima do Druid alvo. */
"use strict";
const fs=require("fs"),path=require("path"),vm=require("vm");
const game=fs.readFileSync(path.join(__dirname,"..","game","js","game.js"),"utf8");
const party=fs.readFileSync(path.join(__dirname,"..","game","js","party-ui.js"),"utf8");
function must(ok,msg){if(!ok)throw Error(msg);}
must(game.includes('const cid = G.p && G.p.id ? String(G.p.id) : sessionCharId();'),
  "autosave online ainda confia no id mutável da sessão");
const start=party.indexOf("async function partySwitchToChar"),end=party.indexOf("\n\n/* Estado de colapso",start);
const segment=party.slice(start,end);
must(segment.includes('sessionStorage.setItem("tibia-idle-online-autoload"')&&
  !segment.includes('sessionStorage.setItem("tibia-idle-char"'),
  "switch online altera o char alvo antes de salvar o atual");
const store=new Map([["tibia-idle-char","10"]]);let saved=null,reloads=0,saveCalls=0;
const ctx={
  G:{p:{id:"10",name:"Royal",voc:"paladin"},combat:null},
  partyOnlineMode:()=>true,sessionToken:()=>"tok",sessionCharId:()=>store.get("tibia-idle-char"),
  save:()=>{saveCalls++;},accountSaveCharacter:async(token,id,p)=>{saved={token,id,voc:p.voc};return true;},
  sessionStorage:{setItem:(k,v)=>store.set(k,String(v))},localStorage:{setItem(){}},
  location:{reload:()=>{reloads++;}},ACTIVE_CHARACTER_KEY:"active",AUTOLOGIN_KEY:"auto",
};
vm.createContext(ctx);vm.runInContext(segment,ctx);
ctx.partySwitchToChar("20").then(ok=>{
  must(ok&&saveCalls===1&&saved&&saved.id==="10"&&saved.voc==="paladin",
    "personagem atual não foi salvo com seu próprio id");
  must(store.get("tibia-idle-char")==="10"&&store.get("tibia-idle-online-autoload")==="20"&&reloads===1,
    "target substituiu sessionCharId antes do reload seguro");
  console.log("OK: troca online salva o atual e só ativa o alvo após o reload.");
}).catch(e=>{console.error(e);process.exitCode=1;});
