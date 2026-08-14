/* Cliente da fase 5: servidor vence local e tombstone não ressuscita snapshot. */
"use strict";
const fs=require("fs"),path=require("path"),vm=require("vm");
const source=fs.readFileSync(path.join(__dirname,"..","game","js","account-client.js"),"utf8");
function must(ok,msg){if(!ok)throw Error(msg);}
const local=new Map(),session=new Map();
const storage=(map)=>({getItem:(k)=>map.has(k)?map.get(k):null,setItem:(k,v)=>map.set(k,String(v)),removeItem:(k)=>map.delete(k)});
const calls=[];let remote={id:"b".repeat(64),version:5,status:"active",state:{kind:"hunt",huntId:"rats",marker:"remote"}};
const ctx={console,Promise,Map,Set,JSON,Number,String,Object,Array,Math,Date,encodeURIComponent,URLSearchParams,
  setTimeout,clearTimeout,localStorage:storage(local),sessionStorage:storage(session),
  CustomEvent:function(type,init){this.type=type;this.detail=init&&init.detail;},
  window:{GLOBAL_IDLE_SERVER_CONFIG:{online:true,testServer:false,apiUrl:"http://game"},location:{origin:"http://game"},dispatchEvent(){}},
  G:{combat:{players:[{id:"1",x:.31,y:.62,cx:9,cy:18}],mobs:[{id:"rat-a",x:.74,y:.42,cx:22,cy:12}]}},
  toast(){},maxStats:()=>({hp:100,mp:50}),
  fetch:async(url,options)=>{
    const body=options.body?JSON.parse(options.body):null;calls.push({url,method:options.method,body});
    if(url.endsWith("/api/lease/acquire"))return response(200,{ok:true,leaseToken:"a".repeat(64),
      holderId:body.holder_id,expiresAt:new Date(Date.now()+120000).toISOString(),renewAfterMs:30000});
    if(url.endsWith("/api/lease/release"))return response(200,{ok:true});
    if(url.endsWith("/api/characters/1")&&options.method==="PUT")
      return response(200,{ok:true,character:{id:1,name:"Lease Hero",voc:"knight",level:10,saveVersion:8}});
    if(url.includes("/api/instance?")&&options.method==="GET")return response(200,{ok:true,instance:remote});
    if(url.endsWith("/api/instance")&&options.method==="PUT"){
      const next={id:body.instance_id||"c".repeat(64),version:body.expected_version+1,status:"active"};
      remote=Object.assign({},next,{state:body.state});return response(200,{ok:true,instance:next});
    }
    if(url.endsWith("/api/instance/end")){
      remote=Object.assign({},remote,{version:remote.version+1,status:"ended"});
      return response(200,{ok:true,instance:remote});
    }
    return response(404,{ok:false});
  },
};
function response(status,data){return {status,json:async()=>data};}
vm.createContext(ctx);vm.runInContext(source,ctx);
(async()=>{
  const visual=ctx.accountAuthorityVisualState();
  must(visual&&visual.players[0].x===.31&&visual.players[0].cx===9&&
    visual.mobs[0].id==="rat-a"&&visual.mobs[0].y===.42,
    "tick não coleta posições visuais compactas de players/mobs");
  must((await ctx.accountAcquireLease("token",false)).ok,"lease fake não adquirido");
  ctx.accountCharacterCacheWrite([{id:1,name:"Lease Hero",voc:"knight",level:10,saveVersion:7}]);
  must(await ctx.accountSaveCharacter("token",1,{id:"1",name:"Lease Hero",voc:"knight",level:10,hp:100,mp:50}),
    "save versionado com lease falhou");
  const characterPut=calls.find((c)=>c.url.endsWith("/api/characters/1")&&c.method==="PUT");
  must(characterPut&&characterPut.body.expected_version===7&&characterPut.body.holder_id&&
    characterPut.body.lease_token==="a".repeat(64),
    "save de personagem não enviou versão, holder e lease token");

  const loaded=await ctx.accountLoadInstance("token");
  must(loaded.ok&&loaded.instance.marker==="remote","cliente não carregou snapshot remoto");
  const state={kind:"hunt",huntId:"rats",marker:"updated"};
  must(await ctx.accountSaveInstance("token",state),"update remoto falhou");
  const firstPut=calls.find((c)=>c.url.endsWith("/api/instance")&&c.method==="PUT");
  must(firstPut.body.instance_id==="b".repeat(64)&&firstPut.body.expected_version===5,
    "save não usou id/versão carregados do servidor");

  const beforeEndCalls=calls.length;
  const ending=ctx.accountEndInstance("token","returned-city");
  const stale=ctx.accountSaveInstance("token",{kind:"hunt",marker:"stale-after-end"});
  must(await ending&&await stale===false,"snapshot pendente ressuscitou depois do tombstone");
  must(calls.slice(beforeEndCalls).filter((c)=>c.method==="PUT"&&c.url.endsWith("/api/instance")).length===0,
    "cliente enviou PUT de instância depois de encerrar");

  ctx.accountBeginInstance();
  must(await ctx.accountSaveInstance("token",{kind:"boss",bossId:"greed",marker:"new"}),
    "nova instância explícita não foi criada após tombstone");
  const puts=calls.filter((c)=>c.method==="PUT"&&c.url.endsWith("/api/instance"));
  must(puts[puts.length-1].body.expected_version===0&&!puts[puts.length-1].body.instance_id,
    "nova instância reutilizou id/versão terminal");

  // Transição hunt -> boss ocorre no mesmo tick: o begin novo pode chegar
  // antes de o POST /end anterior terminar, sem perder a permissão de create.
  const transitionEnd=ctx.accountEndInstance("token","switch-to-boss");
  ctx.accountBeginInstance();
  const transitionSave=ctx.accountSaveInstance("token",{kind:"boss",bossId:"hatred",marker:"transition"});
  must(await transitionEnd&&await transitionSave,
    "transição imediata entre instâncias perdeu a nova geração");
  await ctx.accountReleaseLease("token");
  console.log("OK: cliente usa snapshot remoto e não ressuscita instância encerrada.");
})().catch((error)=>{console.error(error);process.exit(1);});
