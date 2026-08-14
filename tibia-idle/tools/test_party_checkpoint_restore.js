/* Regressão: party nunca entra/sai de safe checkpoint com membro morto. */
"use strict";
const fs=require("fs"),path=require("path"),vm=require("vm");
const game=path.join(__dirname,"..","game"),js=path.join(game,"js");
function must(v,m){if(!v)throw Error(m);}
const partySrc=fs.readFileSync(path.join(js,"party.js"),"utf8");
const gameSrc=fs.readFileSync(path.join(js,"game.js"),"utf8");
const trainingSrc=fs.readFileSync(path.join(js,"training.js"),"utf8");
const html=fs.readFileSync(path.join(game,"index.html"),"utf8");
must(html.includes("js/party.js?v=outfit-mount-v1")&&html.includes("js/training.js?v=party-checkpoint-v1"),
  "scripts de checkpoint da party sem cache-busting");
const start=partySrc.indexOf("function partyRestoreCharacterFull");
const end=partySrc.indexOf("\n\n/* Carrega as entidades",start);
const liveLeader={id:"leader",hp:0,mp:0,level:10};
const liveMember={id:"member",hp:0,mp:0,level:20};
const rosterLeader={id:"leader",hp:0,mp:0,level:10};
const rosterMember={id:"member",hp:0,mp:0,level:20};
const saved=[];
const ctx={
 console,G:{p:liveLeader,combat:{dead:true,deadUntil:999,deathPos:{},players:[
  {id:"leader",p:liveLeader,permadead:true,reviveAt:999,deathPos:{},downedAt:1,moving:true},
  {id:"member",p:liveMember,permadead:true,reviveAt:999,deathPos:{},downedAt:1,moving:true},
 ]}},
 maxStats(p){return {hp:p.level*100,mp:p.level*10};},
 saveCharacterToRoster(p){saved.push({id:p.id,hp:p.hp,mp:p.mp});},
 partyOnlineMode(){return false;},partyLocalData(){return {members:[{id:"member"}]};},
 getCharacters(){return [rosterLeader,rosterMember];},characterId(p){return p.id;},Set,
};
vm.createContext(ctx);vm.runInContext(partySrc.slice(start,end),ctx);
const count=ctx.partyCombatRestoreAll("teste");
must(count===2&&liveLeader.hp===1000&&liveLeader.mp===100&&
  liveMember.hp===2000&&liveMember.mp===200,"entidades vivas não foram restauradas");
for(const ent of ctx.G.combat.players)
 must(!ent.permadead&&!ent.reviveAt&&!ent.deathPos&&!ent.downedAt&&!ent.moving,
  "estado inconsciente/permadead permaneceu na entidade");
must(!ctx.G.combat.dead&&!ctx.G.combat.deadUntil&&!ctx.G.combat.deathPos,
  "instância continuou marcada como morta");
must(rosterLeader.hp===1000&&rosterMember.hp===2000&&
  saved.some(x=>x.id==="member"&&x.hp===2000),"roster da party não foi curado/persistido");
must(partySrc.includes("pp.hp = mx.hp; pp.mp = mx.mp;"),
  "partyCombatLoad ainda permite criar entidade morta");

for(const marker of [
 'partyCombatRestoreAll("entrada da hunt")',
 'partyCombatRestoreAll("entrada do boss")',
 'partyCombatRestoreAll("templo")',
 'partyCombatRestoreAll("training room")',
 'partyCombatRestoreAll("retorno do treino")',
]) must(gameSrc.includes(marker)||trainingSrc.includes(marker),"checkpoint sem cura da party: "+marker);
const templeRestore=gameSrc.indexOf('partyCombatRestoreAll("templo")');
const templeSave=gameSrc.indexOf("partyCombatSaveAll()",templeRestore);
must(templeRestore>=0&&templeSave>templeRestore,
  "templo salva a party morta antes de restaurá-la");
console.log("OK: templo, training e entrada de arena restauram HP/MP e estados mortos da party.");
