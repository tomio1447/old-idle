/* Regressão: um 401 autenticado encerra todos os loops uma única vez. */
"use strict";
const fs=require("fs"),path=require("path"),vm=require("vm");
const source=fs.readFileSync(path.join(__dirname,"..","game","js","account-client.js"),"utf8"),
  gameSource=fs.readFileSync(path.join(__dirname,"..","game","js","game.js"),"utf8");
function must(ok,msg){if(!ok)throw Error(msg);}
function storage(initial){const data=new Map(Object.entries(initial||{}));return{
  getItem:key=>data.has(key)?data.get(key):null,
  setItem:(key,value)=>data.set(key,String(value)),removeItem:key=>data.delete(key),
  has:key=>data.has(key),value:key=>data.get(key),
};}
const sessionStorage=storage({"tibia-idle-token":"dead-token","tibia-idle-account":"{\"id\":1}","tibia-idle-char":"1"}),
  localStorage=storage(),timers=new Map();
let nextTimer=1,fetches=0,partyStops=0,reloads=0,invalidEvents=0,restoredEvents=0,sourceCloses=0,intervalClears=0;
class CustomEvent{constructor(type,options){this.type=type;this.detail=options&&options.detail;}}
class BroadcastChannel{constructor(){}postMessage(){}close(){}}
const window={GLOBAL_IDLE_SERVER_CONFIG:{online:true,testServer:false,apiUrl:"http://api",syncProtocol:"sse-v2"},
  location:{origin:"http://game"},dispatchEvent(event){if(event.type==="tibia-idle-session-invalid")invalidEvents++;
    if(event.type==="tibia-idle-session-restored")restoredEvents++;}};
const ctx={window,location:{reload(){reloads++;}},localStorage,sessionStorage,CustomEvent,BroadcastChannel,
  crypto:{randomUUID:()=>"00000000-0000-4000-8000-000000000001"},console,Date,Math,JSON,Map,Set,Promise,
  fetch:async()=>{fetches++;return{status:401,json:async()=>({ok:false,error:"INVALID_SESSION",msg:"Sessão inválida"})};},
  setTimeout(fn){const id=nextTimer++;timers.set(id,fn);return id;},clearTimeout(id){timers.delete(id);},
  setInterval(){return 99;},clearInterval(){intervalClears++;},partyStopPolling(){partyStops++;},toast(){},
  syncSource:{close(){sourceCloses++;}},
};
vm.createContext(ctx);vm.runInContext(source,ctx);
vm.runInContext(`
  ACCOUNT_SYNC.stopped=false;ACCOUNT_SYNC.source=syncSource;
  ACCOUNT_SYNC.reconnect=setTimeout(()=>{},1000);ACCOUNT_SYNC.poll=setInterval(()=>{},1000);
  ACCOUNT_LEASE.active=true;ACCOUNT_LEASE.token="lease";ACCOUNT_LEASE.sessionToken="dead-token";
  ACCOUNT_LEASE.expiresAt=Date.now()+30000;ACCOUNT_LEASE.timer=setTimeout(()=>{},1000);
`,ctx);
(async()=>{
  must(gameSource.includes('addEventListener("tibia-idle-session-invalid"')&&
    gameSource.includes('addEventListener("tibia-idle-session-restored"')&&
    gameSource.includes("!ONLINE_SESSION_INVALID&&G&&G.combat")&&
    gameSource.includes("Sessão expirada — faça login novamente para retomar sua instância."),
    "loop autoritativo/login explícito não respondem à invalidação da sessão");
  const credentialFailure=await ctx._api("POST","/api/login",{login:"x",password:"wrong"});
  must(credentialFailure.code===401&&sessionStorage.value("tibia-idle-token")==="dead-token"&&invalidEvents===0,
    "401 de credenciais foi confundido com expiração de sessão");
  const first=await ctx._api("POST","/api/lease/acquire",{token:"dead-token"});
  must(first.code===401&&!sessionStorage.has("tibia-idle-token")&&!sessionStorage.has("tibia-idle-char")&&
    sessionStorage.value("tibia-idle-session-expired")==="1",
    "primeiro 401 não invalidou a sessão nem marcou o retorno ao login");
  const second=await ctx._api("GET","/api/sync/state",null,"dead-token");
  must(second.code===401&&fetches===2,"token já inválido ainda chegou à rede");
  const blocked=await ctx.accountAcquireLease("dead-token",false);
  must(blocked.unauthorized&&fetches===2,
    "lease/acquire com sessão morta ainda reabriu tempestade de requests");
  const stopped=vm.runInContext("ACCOUNT_SYNC.stopped&&ACCOUNT_SYNC.source===null&&ACCOUNT_SYNC.reconnect===null&&"+
    "ACCOUNT_SYNC.poll===null&&!ACCOUNT_LEASE.active&&ACCOUNT_LEASE.timer===null",ctx);
  must(stopped&&sourceCloses===1&&intervalClears===1&&timers.size===1,
    "SSE/fallback/reconnect/lease não foram encerrados atomicamente");
  must(partyStops===1&&invalidEvents===1,"401 repetiu shutdown/evento de sessão");
  for(const fn of [...timers.values()])fn();
  must(reloads===1,"shutdown não recarregou uma única vez para voltar ao login");
  ctx.fetch=async()=>({status:200,json:async()=>({ok:true,token:"new-token",account:{id:1},characters:[]})});
  const relogin=await ctx.accountLogin("x","right");
  must(relogin.ok&&restoredEvents===1&&!sessionStorage.has("tibia-idle-session-expired"),
    "novo login não reativou a sessão depois do 401");
  // Resposta atrasada do token antigo não pode apagar uma sessão recém-criada.
  sessionStorage.setItem("tibia-idle-token","new-token");
  must(ctx.accountInvalidateSession("older-token",{})===false&&sessionStorage.value("tibia-idle-token")==="new-token",
    "resposta 401 atrasada invalidou o login novo");
  console.log("OK: 401 encerra SSE, polling, lease e retries sem tempestade de requests.");
})().catch((error)=>{console.error(error);process.exitCode=1;});
