/* Regressão: roster online ausente de c.players é hidratado sem trocar runtime. */
"use strict";
const fs=require("fs"),path=require("path"),vm=require("vm");
const root=path.join(__dirname,".."),party=fs.readFileSync(path.join(root,"game","js","party.js"),"utf8"),
  client=fs.readFileSync(path.join(root,"game","js","account-client.js"),"utf8"),
  html=fs.readFileSync(path.join(root,"game","index.html"),"utf8");
function must(value,message){if(!value)throw Error(message);}
function segment(begin,end){const a=party.indexOf(begin),b=party.indexOf(end,a);must(a>=0&&b>a,"segmento ausente: "+begin);return party.slice(a,b);}

(async()=>{
  const state={leader:{id:"10",name:"Kina",voc:"knight",level:494,account_id:7,hp:900,mp:100},members:[
    {id:"20",name:"Pally",voc:"paladin",level:500,account_id:7,hp:800,mp:500},
    {id:"30",name:"Druideiro",voc:"druid",level:494,account_id:7,hp:700,mp:900},
    {id:"40",name:"Sorc",voc:"sorcerer",level:489,account_id:7,hp:650,mp:950},
  ]};
  const snapshots=state.members.concat([state.leader]).map((member)=>Object.assign({},member,{
    snapshot:{id:String(member.id),name:member.name,voc:member.voc,level:member.level,hp:member.hp,mp:member.mp,config:{}}
  }));

  // Uma nova hunt já deve nascer com os quatro personagens da conta.
  const loadCtx={partyOnlineMode:()=>true,accountCharacterCacheRead:()=>snapshots,
    normalizePlayer:(p)=>Object.assign({},p),characterId:(p)=>p.id,maxStats:()=>({hp:1000,mp:1000}),Set,Array,String,Number,Math};
  vm.createContext(loadCtx);vm.runInContext(segment("function partyCombatLoad","\n\n/* Posiciona"),loadCtx);
  const current=Object.assign({},snapshots.find((item)=>item.id==="10").snapshot,{_partyOnline:state});
  const entities=loadCtx.partyCombatLoad(current);
  must(entities&&entities.length===4&&new Set(entities.map((ent)=>String(ent.id))).size===4,
    "partyCombatLoad online não materializou o roster da conta");

  // Sessão antiga com apenas o líder: o clique hidrata o alvo na mesma arena.
  const active={cx:8,cy:8,x:.4,y:.4,dir:"e"},mobs=[{id:"mob",hp:1234}],combat={
    player:active,players:null,mobs,huntId:"mota-extension",instanceMode:"pvp",gridW:30,gridH:30,huntMap:{}
  };
  let saves=0,loads=0,switches=0,legacyCheckpoints=0;
  const hydrationCtx={
    G:{p:Object.assign({},current,{id:"10"}),combat},partyOnlineMode:()=>true,
    accountCharacterCacheRead:()=>snapshots,sessionAccount:()=>({id:7}),sessionToken:()=>"token",
    accountLoadCharacter:async()=>{loads++;return {ok:false};},accountSaveCharacter:async(token,id,p)=>{saves++;must(id===String(p.id),"save cruzou identidades");return true;},
    onlineAuthorityCombat:()=>false,persistActiveInstance:()=>{legacyCheckpoints++;},
    normalizePlayer:(p)=>Object.assign({},p),maxStats:()=>({hp:1000,mp:1000}),
    huntMapBlocked:()=>false,cellToScreen:(cx,cy)=>({x:(cx+.5)/30,y:(cy+.5)/30}),
    partyCombatSwitchTo:(id)=>{const ent=hydrationCtx.partyCombatFindPlayer(id);if(!ent)return false;
      hydrationCtx.G.combat.player=ent;hydrationCtx.G.p=ent.p;switches++;return true;},
    toast:()=>{},Set,Array,String,Number,Math,JSON,
  };
  vm.createContext(hydrationCtx);
  vm.runInContext(segment("function partyCombatFindPlayer","\n\n/* Troca o personagem ATIVO"),hydrationCtx);
  const originalCombat=hydrationCtx.G.combat,originalMobs=hydrationCtx.G.combat.mobs;
  must(await hydrationCtx.partyCombatSwitchOnlineTo("20")===true,"hidratação do membro falhou");
  must(hydrationCtx.G.combat===originalCombat&&hydrationCtx.G.combat.mobs===originalMobs&&originalMobs[0].hp===1234,
    "hidratação substituiu a hunt/mobs/runtime");
  must(hydrationCtx.G.combat.players.length===2&&hydrationCtx.G.p.id==="20"&&
    hydrationCtx.G.p._partyOnline&&hydrationCtx.G.p._partyOnline.isLeader===false&&
    switches===1&&loads===0&&saves===1&&legacyCheckpoints===1,
    "alvo em cache não foi anexado/controlado corretamente");
  must(await hydrationCtx.partyCombatSwitchOnlineTo("10")===true&&hydrationCtx.G.combat.players.length===2&&
    new Set(hydrationCtx.G.combat.players.map((ent)=>String(ent.id))).size===2,
    "troca de volta duplicou membros no runtime");

  // Follow ainda pendente do personagem recém-controlado deve ser somente
  // confirmado; startHunt destruiria a instância que acabamos de preservar.
  must(await hydrationCtx.partyCombatSwitchOnlineTo("20")===true,"segunda transferência falhou");
  let follows=0,restarts=0;
  Object.assign(hydrationCtx,{sessionCharId:()=>String(hydrationCtx.G.p.id),
    accountPartyFollow:async(id,nonce)=>{follows++;must(id===20&&nonce==="follow-20","follow incorreto");return {ok:true};},
    startHunt:()=>{restarts++;},startBoss:()=>{restarts++;},addLog:()=>{},renderAll:()=>{}});
  vm.runInContext(segment("const PARTY_FOLLOW_USED = {}","\n\n/* ======================================================================\n * HEAL FRIEND"),hydrationCtx);
  const beforeFollowCombat=hydrationCtx.G.combat;
  await hydrationCtx.partyApplyFollow({nonce:"follow-20",hunt:"mota-extension",instance:"pvp"});
  must(follows===1&&restarts===0&&hydrationCtx.G.combat===beforeFollowCombat,
    "follow pendente reiniciou a hunt após transferência de controle");

  must(client.includes("function accountCharacterCacheRead")&&client.includes("function accountMergeCharacterCache")&&
    client.includes("accountMergeCharacterCache([{id:character.id"),"cliente não mantém snapshots para a party online");
  must(html.includes("js/account-client.js?v=online-fix-v10")&&html.includes("js/party.js?v=party-xp-v1")&&
    html.includes("js/party-ui.js?v=party-runtime-v7")&&html.includes("js/game.js?v=online-fix-v11"),
    "assets da hidratação sem cache-bust");
  console.log("OK: membro online é materializado e controlado na mesma instância, sem reload ou duplicação.");
})().catch((error)=>{console.error(error);process.exitCode=1;});
