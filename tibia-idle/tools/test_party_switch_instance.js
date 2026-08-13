/* Regressão: trocar o personagem controlado não recria a instância da party. */
"use strict";
const fs=require("fs"),path=require("path"),vm=require("vm");
const root=path.join(__dirname,".."),partySource=fs.readFileSync(path.join(root,"game","js","party.js"),"utf8"),
  gameSource=fs.readFileSync(path.join(root,"game","js","game.js"),"utf8"),
  index=fs.readFileSync(path.join(root,"game","index.html"),"utf8");
function must(value,message){if(!value)throw Error(message);}
const start=partySource.indexOf("function partyCombatSwitchTo"),end=partySource.indexOf("\n\n/* Salva TODOS",start);
must(start>=0&&end>start,"partyCombatSwitchTo ausente");
const segment=partySource.slice(start,end);
const storage=new Map([["tibia-idle-online-autoload","stale"]]);
let saveAllCalls=0,targetSaves=0,instanceUpdates=0,authorityTicks=0,renders=0,persists=0;
const first={id:"10",name:"Royal",p:{id:"10",name:"Royal",hp:300,hunt:"cobra-bastion",instanceMode:"non-pvp"}},
  second={id:"20",name:"Druid",p:{id:"20",name:"Druid",hp:250,hunt:null,instanceMode:null}};
const combat={players:[first,second],player:first,huntId:"cobra-bastion",instanceMode:"non-pvp",mobs:[{id:"mob-1",hp:900}],boss:null};
const ctx={
  G:{p:first.p,combat},ACTIVE_CHARACTER_KEY:"active",AUTOLOGIN_KEY:"autoload",
  localStorage:{setItem:(key,value)=>storage.set(key,String(value))},
  sessionStorage:{setItem:(key,value)=>storage.set(key,String(value)),removeItem:(key)=>storage.delete(key)},
  partyCombatSaveAll:()=>{saveAllCalls++;},saveCharacterToRoster:(p)=>{must(p===second.p,"salvou personagem diferente do alvo");targetSaves++;},
  setActiveInstanceCharacter:(id)=>{must(id==="20","espelho recebeu personagem incorreto");instanceUpdates++;return true;},
  requestOnlineAuthorityTick:()=>{authorityTicks++;},renderAll:()=>{renders++;},toast:()=>{},
  persistActiveInstance:()=>{persists++;},Array,String,
};
vm.createContext(ctx);vm.runInContext(segment,ctx);
must(ctx.partyCombatSwitchTo("20")===true,"troca em memória falhou");
must(ctx.G.combat===combat&&ctx.G.combat.players===combat.players&&ctx.G.combat.mobs[0].id==="mob-1",
  "troca substituiu ou corrompeu o runtime ativo");
must(ctx.G.combat.player===second&&ctx.G.p===second.p,"controle não foi transferido para o membro escolhido");
must(second.p.hunt==="cobra-bastion"&&second.p.instanceMode==="non-pvp","hunt/modo não acompanharam o personagem ativo");
must(storage.get("active")==="20"&&storage.get("autoload")==="20"&&storage.get("tibia-idle-char")==="20"&&
  !storage.has("tibia-idle-online-autoload"),"seletores local/online ficaram apontando para personagens diferentes");
must(saveAllCalls===1&&targetSaves===1&&instanceUpdates===1&&authorityTicks===1&&renders===1,
  "troca não sincronizou exatamente uma vez");
must(persists===0,"troca chamou persistActiveInstance e tentou regravar o runtime inteiro");
must(gameSource.includes("function setActiveInstanceCharacter")&&
  gameSource.includes("session.activeCharacterId=activeId"),"espelho da instância não atualiza apenas activeCharacterId");
must(index.includes("js/party.js?v=party-runtime-v6")&&index.includes("js/game.js?v=party-runtime-v6"),
  "assets da correção não receberam cache-bust");
console.log("OK: troca da party transfere controle e preserva hunt, membros e runtime sem reload/checkpoint.");
