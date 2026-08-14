/* Regressão: picker/painel online transferem controle dentro da party sem reload. */
"use strict";
const fs=require("fs"),path=require("path"),vm=require("vm");
const root=path.join(__dirname,".."),game=fs.readFileSync(path.join(root,"game","js","game.js"),"utf8"),
  partyUi=fs.readFileSync(path.join(root,"game","js","party-ui.js"),"utf8");
function must(value,message){if(!value)throw Error(message);}
function extract(source,begin,end){const a=source.indexOf(begin),b=source.indexOf(end,a);must(a>=0&&b>a,"segmento ausente: "+begin);return source.slice(a,b);}
const enterSegment=extract(game,"async function enterCharacter","\n  function paintCreatorVocations");
const panelSegment=extract(partyUi,"async function partySwitchToChar","let PARTY_PANEL_OPEN");

(async()=>{
  const session=new Map();let switches=0,closes=0,saves=0,reloads=0,allowSwitch=true;
  const pickerCtx={
    G:{p:{id:"10",name:"Royal",_partyOnline:{leader:{id:"10"},members:[{id:"20"}]}},
      combat:{players:[{id:"10",p:{id:"10"}}]}},
    partyCombatSwitchOnlineTo:async(id)=>{switches++;must(String(id)==="20","picker tentou controlar id incorreto");return allowSwitch;},
    closeAccountModal:()=>{closes++;},save:()=>{saves++;},
    sessionStorage:{setItem:(key,value)=>session.set(key,String(value))},location:{reload:()=>{reloads++;}},
    Array,String,
  };
  vm.createContext(pickerCtx);vm.runInContext(enterSegment,pickerCtx);
  let result=await pickerCtx.enterCharacter("token",{id:"20",name:"Druid"});
  must(result===true&&switches===1&&closes===1&&saves===0&&reloads===0&&
    !session.has("tibia-idle-online-autoload"),"picker online recarregou em vez de transferir o controle");

  // Mesmo ausente de c.players, um membro do roster remoto precisa seguir o
  // caminho de hidratação; nunca use reload como fallback.
  allowSwitch=false;result=await pickerCtx.enterCharacter("token",{id:"20",name:"Druid"});
  must(result===false&&switches===2&&closes===1&&saves===0&&reloads===0,
    "falha ao hidratar membro da instância caiu no caminho de reload");

  // Personagem que não pertence à party mantém o fluxo legado.
  result=await pickerCtx.enterCharacter("token",{id:"30",name:"Knight"});
  must(result===true&&saves===1&&reloads===1&&session.get("tibia-idle-online-autoload")==="30",
    "troca normal fora da party deixou de usar o reload isolado");

  let panelSwitches=0,panelReloads=0;const panelStore=new Map();
  const panelCtx={
    G:{p:{id:"10"},combat:{players:[{id:"10",p:{id:"10"}}]}},
    partyCombatSwitchOnlineTo:async(id)=>{panelSwitches++;return String(id)==="20";},
    localStorage:{setItem:(key,value)=>panelStore.set(key,String(value))},
    sessionStorage:{setItem:(key,value)=>panelStore.set(key,String(value))},
    location:{reload:()=>{panelReloads++;}},ACTIVE_CHARACTER_KEY:"active",AUTOLOGIN_KEY:"autoload",Array,String,
  };
  vm.createContext(panelCtx);vm.runInContext(panelSegment,panelCtx);
  must(await panelCtx.partySwitchToChar("20")===true&&panelSwitches===1&&panelReloads===0,
    "painel da party não hidratou/reutilizou o membro no runtime atual");
  must(await panelCtx.partySwitchToChar("99")===false&&panelReloads===0,
    "membro ausente durante combate abriu outro runtime");
  panelCtx.G.combat=null;
  must(await panelCtx.partySwitchToChar("30")===true&&panelReloads===1&&panelStore.get("tibia-idle-char")==="30"&&
    panelStore.get("tibia-idle-online-autoload")==="30",
    "troca fora de combate deixou de recarregar o personagem escolhido");

  // Party na cidade (sem G.combat): o membro pertence à PT, mas não há
  // runtime de hunt. Recarrega com autoload — nunca reabre o picker.
  pickerCtx.G.combat=null;saves=0;reloads=0;switches=0;
  result=await pickerCtx.enterCharacter("token",{id:"20",name:"Druid"});
  must(result===true&&switches===0&&saves===1&&reloads===1&&
    session.get("tibia-idle-online-autoload")==="20",
    "troca de personagem da party fora de combate voltou ao picker");

  must(enterSegment.includes("await partyCombatSwitchOnlineTo(summary.id)")&&
    enterSegment.includes("G.combat&&(partyEntity||partyMember)")&&
    panelSegment.includes("await partyCombatSwitchOnlineTo(id)")&&
    panelSegment.includes("tibia-idle-online-autoload"),
    "picker/painel não aguardam a hidratação no runtime atual");
  console.log("OK: picker e painel online preservam e hidratam a instância ao trocar personagens da party.");
})().catch((error)=>{console.error(error);process.exitCode=1;});
