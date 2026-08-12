/* Cliente: saves da aba são serializados e conflito bloqueia overwrite futuro. */
"use strict";
const fs=require("fs"),path=require("path"),vm=require("vm");
const source=fs.readFileSync(path.join(__dirname,"..","game","js","account-client.js"),"utf8"),
  indexSource=fs.readFileSync(path.join(__dirname,"..","game","index.html"),"utf8");
function must(ok,msg){if(!ok)throw Error(msg);}
const local=new Map(),session=new Map();
const storage=(map)=>({getItem:(k)=>map.has(k)?map.get(k):null,setItem:(k,v)=>map.set(k,String(v)),removeItem:(k)=>map.delete(k)});
let active=0,maxActive=0,mode="success";const requests=[];
const ctx={console,Promise,Map,Set,JSON,Number,String,Object,Array,Math,Date,encodeURIComponent,URLSearchParams,
  setTimeout,clearTimeout,
  localStorage:storage(local),sessionStorage:storage(session),CustomEvent:function(type,init){this.type=type;this.detail=init.detail;},
  window:{GLOBAL_IDLE_SERVER_CONFIG:{online:true,testServer:false,apiUrl:"http://game"},location:{origin:"http://game"},dispatchEvent(){}},
  maxStats:()=>({hp:500,mp:300}),toast(){},
  fetch:async(url,options)=>{
    const body=JSON.parse(options.body||"{}");
    if(url.endsWith("/api/lease/acquire")||url.endsWith("/api/lease/takeover"))return {status:200,json:async()=>({ok:true,
      leaseToken:"a".repeat(64),holderId:body.holder_id,expiresAt:new Date(Date.now()+120000).toISOString(),renewAfterMs:30000})};
    if(url.endsWith("/api/lease/release"))return {status:200,json:async()=>({ok:true})};
    requests.push({url,body});active++;maxActive=Math.max(maxActive,active);
    await new Promise((resolve)=>setTimeout(resolve,8));active--;
    if(url.endsWith("/api/instance/end"))return {status:200,json:async()=>({ok:true})};
    if(url.endsWith("/api/party/save"))return {status:200,json:async()=>({ok:true,characters:[]})};
    if(mode==="conflict")return {status:409,json:async()=>({ok:false,error:"SAVE_VERSION_CONFLICT",msg:"conflito",
      characters:[{id:1,name:"Queue",voc:"knight",level:1,saveVersion:4,snapshot:{id:"1",name:"Queue",marker:"remote"}}]})};
    return {status:200,json:async()=>({ok:true,saveVersion:body.expected_version+1,
      character:{id:1,name:"Queue",voc:"knight",level:1,saveVersion:body.expected_version+1,
        snapshot:JSON.parse(body.data)}})};
  },
};
vm.createContext(ctx);vm.runInContext(source,ctx);
ctx.accountCharacterCacheWrite([{id:1,name:"Queue",voc:"knight",level:1,saveVersion:1,snapshot:{}}]);
(async()=>{
  must(indexSource.includes('js/account-client.js?v=online-sync-v6'),
    "index não invalida o cache do cliente com a correção de party-save");
  must((await ctx.accountAcquireLease("token",false)).ok,"cliente não adquiriu lease antes do save");
  const p={id:"1",name:"Queue",voc:"knight",level:1,hp:100,mp:50};
  const results=await Promise.all([
    ctx.accountSaveCharacter("token","1",p),ctx.accountSaveCharacter("token","1",p),
  ]);
  must(results.every(Boolean)&&maxActive===1,"autosaves da mesma aba executaram em paralelo");
  must(requests[0].body.expected_version===1&&requests[1].body.expected_version===2,
    "fila não propagou a versão confirmada para o save seguinte");
  const beforeParty=requests.length;ctx.accountInstanceApply({id:"i",version:3,status:"active"});
  must(await ctx.accountSaveParty("token",{id:7,version:1,order:[1]},[{id:"1",p}])===true&&requests.length===beforeParty,
    "troca de personagem enviou party-save redundante durante instância autoritativa");
  const checkpointStart=requests.length,ending=ctx.accountEndInstance("token","temple"),
    checkpoint=ctx.accountSaveParty("token",{id:7,version:1,order:[1]},[{id:"1",p}]);
  must(await checkpoint===true&&await ending===true&&
    requests.slice(checkpointStart).map((r)=>r.url).join("|").endsWith("/api/instance/end|http://game/api/party/save"),
    "checkpoint da party não aguardou o encerramento autoritativo: "+requests.slice(checkpointStart).map((r)=>r.url).join("|"));
  mode="conflict";const before=requests.length;
  must(await ctx.accountSaveCharacter("token","1",p)===false,"conflito externo foi tratado como sucesso");
  must(ctx.accountCharacterCacheRead()[0].saveVersion===4,"snapshot autoritativo do conflito não atualizou o cache");
  must(await ctx.accountSaveCharacter("token","1",p)===false&&requests.length===before+1,
    "autosave posterior tentou sobrescrever novamente após conflito");
  await ctx.accountReleaseLease("token");
  console.log("OK: cliente serializa versões e bloqueia overwrite depois de conflito.");
})().catch((error)=>{console.error(error);process.exit(1);});
