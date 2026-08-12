/* Fase 4: uma única aba/dispositivo possui o direito de simular e salvar. */
"use strict";
const fs=require("fs"),os=require("os"),path=require("path");
const {spawn}=require("child_process");
const root=path.join(__dirname,".."),serverDir=path.join(root,"server");
const serverSource=fs.readFileSync(path.join(serverDir,"server.js"),"utf8");
const dbSource=fs.readFileSync(path.join(serverDir,"db.js"),"utf8");
const clientSource=fs.readFileSync(path.join(root,"game","js","account-client.js"),"utf8");
const gameSource=fs.readFileSync(path.join(root,"game","js","game.js"),"utf8");
const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),"global-idle-lease-"));
const port=37100+(process.pid%800),base=`http://127.0.0.1:${port}`;
let child=null,logs="";
function must(ok,msg){if(!ok)throw Error(msg);}
async function request(route,options){const response=await fetch(base+route,options),text=await response.text();
  let data;try{data=JSON.parse(text);}catch(e){data=text;}return {status:response.status,data};}
async function post(route,body){return request(route,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});}
async function put(route,body){return request(route,{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify(body)});}
async function start(){logs="";child=spawn(process.execPath,["server.js"],{cwd:serverDir,env:Object.assign({},process.env,{
  PORT:String(port),HOST:"127.0.0.1",TEST_SERVER:"0",MYSQL_HOST:"",LEASE_TTL_MS:"3000",GLOBAL_IDLE_DATA_DIR:dataDir,
}),stdio:["ignore","pipe","pipe"]});child.stdout.on("data",(c)=>{logs+=c;});child.stderr.on("data",(c)=>{logs+=c;});
  for(let i=0;i<100;i++){try{const r=await request("/api/health");if(r.data.ok)return;}catch(e){}
    await new Promise((resolve)=>setTimeout(resolve,40));}throw Error("servidor não iniciou: "+logs);}
async function stop(){if(!child)return;const proc=child;child=null;await new Promise((resolve)=>{
  proc.once("exit",resolve);proc.kill("SIGTERM");setTimeout(resolve,1000).unref();});}
async function account(login){await post("/api/register",{login,password:"x"});return (await post("/api/login",{login,password:"x"})).data;}
async function acquire(token,holder,leaseToken,takeover){return post(takeover?"/api/lease/takeover":"/api/lease/acquire",
  {token,holder_id:holder,lease_token:leaseToken||""});}
function leaseFields(result){return {holder_id:result.data.holderId,lease_token:result.data.leaseToken};}
function saveBody(token,c,version,marker,lease){return Object.assign({token,expected_version:version,level:1,
  data:JSON.stringify({id:String(c.id),name:c.name,voc:c.voc,level:1,marker,hp:100}),hp:100,mp:10,maxHp:100,maxMp:10},lease||{});}
async function summary(token,id){const me=await request("/api/me",{headers:{authorization:"Bearer "+token}});
  return me.data.characters.find((c)=>Number(c.id)===Number(id));}

(async()=>{
  must(serverSource.includes("LEASE_TTL_MS")&&serverSource.includes('error:"LEASE_REQUIRED"')&&
    dbSource.includes("CREATE TABLE IF NOT EXISTS account_leases")&&dbSource.includes("SELECT GET_LOCK")&&
    dbSource.includes("lockValidLease(conn,accountId,lease)"),
    "servidor/MySQL não implementam lease exclusivo e atômico");
  must(clientSource.includes("accountRenewLease")&&clientSource.includes("accountLeaseMarkLost")&&
    clientSource.includes('new BroadcastChannel("tibia-idle-account-lease-v1")')&&
    gameSource.includes("accountLeaseAllowsSimulation())return")&&gameSource.includes("acc-lease-takeover"),
    "cliente não renova, pausa ou oferece takeover controlado");
  must(!gameSource.includes('addEventListener("beforeunload",accountReleaseLease')&&
    !gameSource.includes('addEventListener("pagehide",accountReleaseLease'),
    "fechar/minimizar está liberando o lease e encerrando a instância");
  await start();
  const main=await account("lease-main");
  const created=await post("/api/characters",{token:main.token,name:"Lease Hero",voc:"knight",
    data:JSON.stringify({name:"Lease Hero",voc:"knight",level:1})});
  const c=created.data.character;

  let a=await acquire(main.token,"holderA0001");
  must(a.status===200&&a.data.leaseToken&&a.data.ttlMs===3000,"primeiro holder não adquiriu lease");
  let leaseA=leaseFields(a);const rawA=a.data.leaseToken;
  const resumed=await acquire(main.token,leaseA.holder_id,leaseA.lease_token);
  must(resumed.status===200&&resumed.data.resumed&&resumed.data.leaseToken===rawA,
    "reload da mesma aba não retomou o mesmo lease");
  const rotated=await post("/api/lease/acquire",{token:main.token,holder_id:"reloadhold03",
    previous_holder_id:leaseA.holder_id,lease_token:leaseA.lease_token});
  must(rotated.status===200&&rotated.data.resumed&&rotated.data.leaseToken===rawA,
    "reload/aba clonada não rotacionou o holder mantendo o segredo");
  const oldHolderRenew=await post("/api/lease/renew",Object.assign({token:main.token},leaseA));
  must(oldHolderRenew.status===409,"holder antigo continuou válido após rotação por documento");
  leaseA=leaseFields(rotated);
  let b=await acquire(main.token,"holderB0002");
  must(b.status===409&&b.data.error==="LEASE_HELD"&&b.data.expiresAt,
    "segunda aba adquiriu lease ativo sem confirmação");

  let r=await put("/api/characters/"+c.id,saveBody(main.token,c,1,"no-lease"));
  must(r.status===423&&r.data.error==="LEASE_REQUIRED","save sem lease foi aceito");
  r=await put("/api/characters/"+c.id,saveBody(main.token,c,1,"holder-a",leaseA));
  must(r.status===200&&r.data.saveVersion===2,"holder atual não conseguiu salvar");
  const renewed=await post("/api/lease/renew",Object.assign({token:main.token},leaseA));
  must(renewed.status===200&&renewed.data.resumed,"heartbeat não renovou o lease");

  b=await acquire(main.token,"holderB0002","",true);const leaseB=leaseFields(b);
  must(b.status===200&&leaseB.lease_token!==leaseA.lease_token,"takeover explícito não rotacionou o segredo");
  r=await post("/api/lease/renew",Object.assign({token:main.token},leaseA));
  must(r.status===409&&r.data.error==="LEASE_LOST","holder anterior continuou renovando após takeover");
  r=await put("/api/characters/"+c.id,saveBody(main.token,c,2,"stale-holder",leaseA));
  must(r.status===423,"holder anterior ainda conseguiu persistir recompensas");
  must((await summary(main.token,c.id)).saveVersion===2,"save recusado alterou a versão");
  r=await put("/api/characters/"+c.id,saveBody(main.token,c,2,"holder-b",leaseB));
  must(r.status===200&&r.data.saveVersion===3,"novo holder não assumiu o save");

  const concurrent=await account("lease-race");
  const raced=await Promise.all([acquire(concurrent.token,"raceholder01"),acquire(concurrent.token,"raceholder02")]);
  must(raced.filter((x)=>x.status===200).length===1&&raced.filter((x)=>x.status===409).length===1,
    "aquisição concorrente concedeu dois leases");
  const winner=raced.find((x)=>x.status===200),loserHolder=raced[0]===winner?"raceholder02":"raceholder01";
  r=await post("/api/lease/release",Object.assign({token:concurrent.token},leaseFields(winner)));
  must(r.status===200,"release explícito falhou");
  r=await acquire(concurrent.token,loserHolder);
  must(r.status===200,"release não liberou controle imediatamente");

  const expiring=await account("lease-expire");
  const old=await acquire(expiring.token,"expirehold01");must(old.status===200,"lease de expiração falhou");
  await new Promise((resolve)=>setTimeout(resolve,3150));
  const afterExpiry=await acquire(expiring.token,"expirehold02");
  must(afterExpiry.status===200&&afterExpiry.data.leaseToken!==old.data.leaseToken,
    "lease expirado não pôde ser recuperado por outro browser");

  const persistent=await account("lease-persist");
  const kept=await acquire(persistent.token,"persisthold1");must(kept.status===200,"lease persistente falhou");
  const keptFields=leaseFields(kept);await stop();await start();
  const blockedAfterRestart=await acquire(persistent.token,"persisthold2");
  must(blockedAfterRestart.status===409,"restart apagou lease ainda válido");
  const resumedAfterRestart=await acquire(persistent.token,keptFields.holder_id,keptFields.lease_token);
  must(resumedAfterRestart.status===200&&resumedAfterRestart.data.resumed&&
    resumedAfterRestart.data.leaseToken===keptFields.lease_token,"holder não retomou lease depois do restart");
  const disk=fs.readFileSync(path.join(dataDir,"leases.json"),"utf8");
  must(!disk.includes(keptFields.lease_token)&&disk.includes("secret_hash"),"segredo bruto do lease foi persistido");
  console.log("OK: Fase 4 — lease exclusivo, heartbeat, takeover, expiração e restart validados.");
})().catch((error)=>{console.error(error);process.exitCode=1;}).finally(async()=>{
  await stop();fs.rmSync(dataDir,{recursive:true,force:true});
});
