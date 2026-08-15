/* Renew após soft-pause/401 não deve rearmar heartbeat nem invalidar sessão. */
"use strict";
const fs=require("fs"),path=require("path"),vm=require("vm");
const source=fs.readFileSync(path.join(__dirname,"..","game","js","account-client.js"),"utf8");
function must(ok,msg){if(!ok)throw Error(msg);}
function storage(initial){const data=new Map(Object.entries(initial||{}));return{
  getItem:key=>data.has(key)?data.get(key):null,
  setItem:(key,value)=>data.set(key,String(value)),removeItem:key=>data.delete(key),
  has:key=>data.has(key),value:key=>data.get(key),
};}
const sessionStorage=storage({
  "tibia-idle-token":"alive-token",
  "tibia-idle-account":"{\"id\":1}",
  "tibia-idle-lease-token-v1":"a".repeat(64),
  "tibia-idle-lease-holder-v1":"holder1",
  "tibia-idle-lease-expiry-v1":String(Date.now()+120000),
});
const localStorage=storage();
let fetches=0,forcedReasons=[],invalidEvents=0,nextTimer=1;
const timers=new Map();
class CustomEvent{constructor(type,options){this.type=type;this.detail=options&&options.detail;}}
class BroadcastChannel{constructor(){}postMessage(){}close(){}}
const window={GLOBAL_IDLE_SERVER_CONFIG:{online:true,testServer:false,apiUrl:"http://api",syncProtocol:"sse-v2"},
  location:{origin:"http://game"},
  dispatchEvent(event){if(event.type==="tibia-idle-session-invalid")invalidEvents++;}};
const ctx={window,location:{reload(){}},localStorage,sessionStorage,CustomEvent,BroadcastChannel,
  crypto:{randomUUID:()=>"00000000-0000-4000-8000-000000000001"},console,Date,Math,JSON,Map,Set,Promise,
  fetch:async(url)=>{
    fetches++;
    if(String(url).includes("/api/lease/renew"))
      return {status:401,json:async()=>({ok:false,msg:"Sessão inválida"})};
    return {status:200,json:async()=>({ok:true})};
  },
  setTimeout(fn){const id=nextTimer++;timers.set(id,fn);return id;},clearTimeout(id){timers.delete(id);},
  setInterval(){return 99;},clearInterval(){},toast(){},
};
vm.createContext(ctx);vm.runInContext(source,ctx);
vm.runInContext(`
  ACCOUNT_LEASE.active=true;ACCOUNT_LEASE.lost=false;ACCOUNT_LEASE.token=${JSON.stringify("a".repeat(64))};
  ACCOUNT_LEASE.sessionToken="alive-token";ACCOUNT_LEASE.holder="holder1";
  ACCOUNT_LEASE.expiresAt=Date.now()+120000;
  ACCOUNT_LEASE.timer=setTimeout(()=>{},1000);
  ACCOUNT_SERVER_FORCED_OFFLINE=false;
`,ctx);
const originalForce=ctx.accountForceServerDisconnect;
ctx.accountForceServerDisconnect=function(reason){forcedReasons.push(String(reason||""));return originalForce.call(this,reason);};

(async()=>{
  must(source.includes("skipInvalidate:true")&&source.includes("accountForceServerDisconnect(\"session\")"),
    "renew 401 não usa o caminho Reconnect sem invalidate");
  const first=await ctx.accountRenewLease("alive-token");
  must(first&&first.unauthorized&&!first.ok,"renew 401 deveria marcar unauthorized/lost");
  must(sessionStorage.value("tibia-idle-token")==="alive-token"&&invalidEvents===0,
    "renew 401 invalidou a sessão / disparou reload path");
  must(forcedReasons.includes("session"),"renew 401 não forçou disconnect SERVIDOR/Reconnect");
  must(vm.runInContext("!ACCOUNT_LEASE.active&&ACCOUNT_LEASE.lost&&!ACCOUNT_LEASE.token&&ACCOUNT_LEASE.timer===null",ctx),
    "renew 401 não parou o heartbeat/lease");
  const fetchesAfter401=fetches;
  const again=await ctx.accountRenewLease("alive-token");
  must(again&&again.ok===false&&fetches===fetchesAfter401,
    "renew após soft-pause/401 ainda bateu a rede");
  // Rede caída após soft-pause não pode rearmar o timer.
  vm.runInContext(`
    ACCOUNT_SERVER_FORCED_OFFLINE=true;ACCOUNT_LEASE.lost=true;ACCOUNT_LEASE.active=false;
    ACCOUNT_LEASE.token=${JSON.stringify("b".repeat(64))};ACCOUNT_LEASE.expiresAt=Date.now()+120000;
  `,ctx);
  sessionStorage.setItem("tibia-idle-lease-token-v1","b".repeat(64));
  ctx.fetch=async()=>{fetches++;throw new Error("offline");};
  const offline=await ctx.accountRenewLease("alive-token");
  must(offline&&offline.offline&&fetches===fetchesAfter401,
    "renew com SERVIDOR OFF ainda tentou fetch/retry");
  must(timers.size===0,"retry de rede rearmou timer sob soft-pause");
  console.log("OK: renew 401 força Reconnect sem storm nem invalidate prematuro.");
})().catch((error)=>{console.error(error);process.exitCode=1;});
