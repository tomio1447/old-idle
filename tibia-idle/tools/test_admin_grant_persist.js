/* test_admin_grant_persist.js — grants do painel Admin devem sobreviver a
 * troca de instância (MySQL + authority + cache de versão).
 * Run: node tools/test_admin_grant_persist.js
 */
"use strict";
const fs=require("fs"),path=require("path"),vm=require("vm");
const root=path.join(__dirname,"..");
const server=fs.readFileSync(path.join(root,"server","server.js"),"utf8");
const client=fs.readFileSync(path.join(root,"game","js","account-client.js"),"utf8");
const admin=fs.readFileSync(path.join(root,"game","js","admin.js"),"utf8");
const index=fs.readFileSync(path.join(root,"game","index.html"),"utf8");
function must(ok,msg){if(!ok)throw Error(msg);}

must(server.includes("adminGrant")&&server.includes('body.admin_grant')&&
  server.includes("applyAdminPlayerToInstance"),
  "server sem caminho admin_grant / authority patch");
must(server.includes('adminGrant?"admin-grant":"save"')||server.includes('source:adminGrant?"admin-grant"'),
  "server não marca snapshot/sync como admin-grant");
must(server.includes("privileged")&&server.includes("payload.level=level")&&
  server.includes("Math.min(2000"),
  "repair admin ainda força level da coluna antiga");
must(client.includes("async function accountAdminSaveCharacter")&&
  client.includes("admin_grant:true"),
  "cliente sem accountAdminSaveCharacter");
must(client.includes("await accountLastSavePromise()"),
  "PUT /api/instance não espera grants pendentes");
must(admin.includes("async function adminPersist")&&
  admin.includes("accountAdminSaveCharacter"),
  "admin.js não persiste via admin grant");
must(index.includes("account-client.js?v=")&&
  index.includes("admin.js?v=admin-test-all-v1"),
  "index sem cache-bust admin-test-all-v1");
must(server.includes("function accountCanSelfAdmin")&&
  server.includes("adminGrant&&!accountCanSelfAdmin"),
  "server sem accountCanSelfAdmin para grants no TEST_SERVER");

const local=new Map(),session=new Map();
const storage=(map)=>({getItem:(k)=>map.has(k)?map.get(k):null,setItem:(k,v)=>map.set(k,String(v)),removeItem:(k)=>map.delete(k)});
const requests=[];
const ctx={console,Promise,Map,Set,JSON,Number,String,Object,Array,Math,Date,encodeURIComponent,URLSearchParams,
  setTimeout,clearTimeout,
  localStorage:storage(local),sessionStorage:storage(session),CustomEvent:function(type,init){this.type=type;this.detail=init.detail;},
  window:{GLOBAL_IDLE_SERVER_CONFIG:{online:true,testServer:true,apiUrl:"http://game"},location:{origin:"http://game"},dispatchEvent(){}},
  maxStats:()=>({hp:500,mp:300}),toast(){},
  fetch:async(url,options)=>{
    const body=JSON.parse(options.body||"{}");
    if(url.endsWith("/api/lease/acquire")||url.endsWith("/api/lease/takeover"))return {status:200,json:async()=>({ok:true,
      leaseToken:"a".repeat(64),holderId:body.holder_id,expiresAt:new Date(Date.now()+120000).toISOString(),renewAfterMs:30000})};
    if(url.endsWith("/api/lease/release"))return {status:200,json:async()=>({ok:true})};
    requests.push({url,body});
    if(String(url).includes("/api/characters/")&&options.method==="PUT"){
      must(body.admin_grant===true,"grant admin sem flag admin_grant");
      must(JSON.parse(body.data).level===500,"grant não enviou level no snapshot");
      return {status:200,json:async()=>({ok:true,saveVersion:Number(body.expected_version)+1,
        character:{id:1,name:"Admin",voc:"knight",level:500,saveVersion:Number(body.expected_version)+1,
          snapshot:JSON.parse(body.data)},
        account:{id:9,login:"1",role:"admin",coins:250,gold:Number(JSON.parse(body.data).gold)||0},
        instance:{id:"inst",version:7,status:"active"}})};
    }
    return {status:500,json:async()=>({ok:false})};
  },
};
vm.createContext(ctx);vm.runInContext(client,ctx);
ctx.accountCharacterCacheWrite([{id:1,name:"Admin",voc:"knight",level:8,saveVersion:2,snapshot:{level:8}}]);
(async()=>{
  must((await ctx.accountAcquireLease("token",false)).ok,"lease falhou");
  // Autosave comum continua em no-op com instância ativa.
  ctx.accountInstanceApply({id:"inst",version:6,status:"active"});
  const before=requests.length;
  must(await ctx.accountSaveCharacter("token","1",{id:"1",name:"Admin",voc:"knight",level:500,exp:1,gold:99})===true&&
    requests.length===before,"autosave comum disputou versão durante instância");
  // Grant admin DEVE enviar mesmo com instância ativa.
  must(await ctx.accountAdminSaveCharacter("token","1",{id:"1",name:"Admin",voc:"knight",level:500,exp:999,gold:12345,skills:{sword:80}})===true,
    "admin grant falhou com instância ativa");
  must(requests.some((r)=>r.body&&r.body.admin_grant===true),"nenhum PUT admin_grant registrado");
  must(ctx.accountCharacterCacheRead()[0].saveVersion===3&&ctx.accountCharacterCacheRead()[0].level===500,
    "cache não recebeu level/saveVersion do grant");
  must(vm.runInContext("ACCOUNT_INSTANCE.version",ctx)===7,
    "instância retornada pelo grant não atualizou ACCOUNT_INSTANCE");
  await ctx.accountReleaseLease("token");
  console.log("OK: admin grant persiste com instância ativa; autosave comum permanece no-op.");
})().catch((error)=>{console.error(error);process.exit(1);});
