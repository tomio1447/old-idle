/* Fase 6: worker reivindica relógio idle sem lease e sem duplicar intervalos. */
"use strict";
const fs=require("fs"),os=require("os"),path=require("path");
const {spawn}=require("child_process");
const {advanceInstanceClock,startInstanceWorker}=require("../server/instance_worker");
const root=path.join(__dirname,".."),serverDir=path.join(root,"server");
const workerSource=fs.readFileSync(path.join(serverDir,"instance_worker.js"),"utf8");
const dbSource=fs.readFileSync(path.join(serverDir,"db.js"),"utf8");
const gameSource=fs.readFileSync(path.join(root,"game","js","game.js"),"utf8");
const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),"global-idle-worker-"));
const port=38600+(process.pid%600),base=`http://127.0.0.1:${port}`;
let child=null,logs="";
function must(ok,msg){if(!ok)throw Error(msg);}
async function request(route,options){const response=await fetch(base+route,options),text=await response.text();
  let data;try{data=JSON.parse(text);}catch(e){data=text;}return {status:response.status,data};}
async function post(route,body){return request(route,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});}
async function put(route,body){return request(route,{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify(body)});}
async function start(){logs="";child=spawn(process.execPath,["server.js"],{cwd:serverDir,env:Object.assign({},process.env,{
  PORT:String(port),HOST:"127.0.0.1",TEST_SERVER:"0",MYSQL_HOST:"",GLOBAL_IDLE_DATA_DIR:dataDir,
  LEASE_TTL_MS:"700",INSTANCE_WORKER_INTERVAL_MS:"100",INSTANCE_WORKER_MAX_STEP_MS:"250",INSTANCE_WORKER_STARTUP_GRACE_MS:"0",
}),stdio:["ignore","pipe","pipe"]});child.stdout.on("data",(c)=>{logs+=c;});child.stderr.on("data",(c)=>{logs+=c;});
  for(let i=0;i<100;i++){try{const r=await request("/api/health");if(r.data.ok)return;}catch(e){}
    await new Promise((resolve)=>setTimeout(resolve,35));}throw Error("servidor não iniciou: "+logs);}
async function stop(){if(!child)return;const proc=child;child=null;await new Promise((resolve)=>{
  proc.once("exit",resolve);proc.kill("SIGTERM");setTimeout(resolve,1000).unref();});}
async function getInstance(token){return request("/api/instance",{headers:{authorization:"Bearer "+token}});}
async function acquire(token,holder){return post("/api/lease/acquire",{token,holder_id:holder});}
function lease(r){return {holder_id:r.data.holderId,lease_token:r.data.leaseToken};}
function state(c,marker){return {v:1,savedAt:Date.now(),kind:"hunt",huntId:"rats-of-rookgaard",
  instanceMode:"non-pvp",activeCharacterId:String(c.id),members:[{id:String(c.id),
    p:{id:String(c.id),name:c.name,voc:c.voc,level:1,hp:100,mp:20}}],
  state:{players:[{id:String(c.id),p:{id:String(c.id),name:c.name,voc:c.voc,level:1,hp:100,mp:20}}],
    mobs:[{id:"rat",slug:"rat",hp:20}],marker}};}

(async()=>{
  const advanced=JSON.parse(advanceInstanceClock(JSON.stringify({savedAt:1000,workerElapsedMs:200}),300,1300));
  must(advanced.workerElapsedMs===500&&advanced.savedAt===1300,"núcleo do worker não acumula relógio determinístico");
  must(workerSource.includes("runInstanceWorkerOnce")&&workerSource.includes("instanceWorkerClaim")&&
    dbSource.includes("worker_cursor_at")&&dbSource.includes("SELECT GET_LOCK")&&
    gameSource.includes("workerElapsed+residual")&&gameSource.includes("Recarrega o snapshot antes"),
    "worker/checkpoint/reconciliação do cliente ausentes");
  let startupClaims=0;const startupWorker=startInstanceWorker({
    instanceWorkerCandidates:async()=>[1],instanceWorkerClaim:async()=>{startupClaims++;return {ok:false};},
  },{intervalMs:100,startupGraceMs:180,minStepMs:50});
  await new Promise((resolve)=>setTimeout(resolve,120));
  must(startupClaims===0,"worker processou instância antes da janela de reconexão do restart");
  await new Promise((resolve)=>setTimeout(resolve,140));startupWorker.stop();
  must(startupClaims>0,"worker não retomou depois da janela de reconexão");
  await start();
  await post("/api/register",{login:"worker",password:"x"});
  const logged=await post("/api/login",{login:"worker",password:"x"}),token=logged.data.token;
  const created=await post("/api/characters",{token,name:"Worker Hero",voc:"knight",
    data:JSON.stringify({name:"Worker Hero",voc:"knight",level:1})}),c=created.data.character;
  let leaseResponse=await acquire(token,"workerhold01"),fields=lease(leaseResponse);
  let r=await put("/api/instance",Object.assign({token,expected_version:0,instance_id:null,state:state(c,"initial")},fields));
  must(r.status===200&&r.data.instance.version===1,"instância para o worker não foi criada");
  const id=r.data.instance.id;

  await new Promise((resolve)=>setTimeout(resolve,350));
  r=await getInstance(token);
  must(r.data.instance.version===1&&!r.data.instance.state.workerElapsedMs,
    "worker processou enquanto o browser ainda tinha lease");

  await new Promise((resolve)=>setTimeout(resolve,850));
  r=await getInstance(token);
  const claimed=r.data.instance;
  must(claimed.version>1&&claimed.workerTotalMs>0&&
    (claimed.state.workerElapsedMs>0||(claimed.state.authority&&claimed.state.authority.clock>0)),
    "worker não reivindicou tempo após expiração do lease");
  const firstCarry=claimed.workerTotalMs,firstCursor=claimed.workerCursorAt;

  leaseResponse=await acquire(token,"workerhold02");fields=lease(leaseResponse);
  const leasedVersion=(await getInstance(token)).data.instance.version;
  await new Promise((resolve)=>setTimeout(resolve,350));
  must((await getInstance(token)).data.instance.version===leasedVersion,
    "worker e browser processaram a instância simultaneamente");

  // Simula o cliente aplicando o carry no motor completo: o novo snapshot não
  // mantém workerElapsedMs, portanto o mesmo intervalo não pode reaparecer.
  const applied=claimed.state;delete applied.workerElapsedMs;delete applied.workerCheckpointAt;
  applied.state.marker="applied-once";
  r=await put("/api/instance",Object.assign({token,instance_id:id,expected_version:leasedVersion,state:applied},fields));
  must(r.status===200,"cliente não conseguiu confirmar checkpoint do worker");
  const afterApply=await getInstance(token);
  must(!afterApply.data.instance.state.workerElapsedMs&&afterApply.data.instance.workerTotalMs>=firstCarry&&
    (!claimed.state.authority||afterApply.data.instance.state.authority),
    "checkpoint aplicado não limpou carry/autoridade mantendo auditoria acumulada");

  await post("/api/lease/release",Object.assign({token},fields));
  await new Promise((resolve)=>setTimeout(resolve,420));
  const beforeRestart=(await getInstance(token)).data.instance;
  const beforeProgress=beforeRestart.state.authority?beforeRestart.state.authority.clock:beforeRestart.state.workerElapsedMs;
  must(beforeProgress>0&&beforeRestart.workerCursorAt>firstCursor,
    "worker não retomou após release/fechamento");
  await stop();await start();
  await new Promise((resolve)=>setTimeout(resolve,320));
  const afterRestart=(await getInstance(token)).data.instance;
  const afterProgress=afterRestart.state.authority?afterRestart.state.authority.clock:afterRestart.state.workerElapsedMs;
  must(afterProgress>=beforeProgress&&afterRestart.workerCursorAt>=beforeRestart.workerCursorAt,
    "restart perdeu cursor/carry ou voltou no tempo");
  must(afterRestart.workerTotalMs<beforeRestart.workerTotalMs+2000,
    "restart reprocessou todo o intervalo histórico");

  leaseResponse=await acquire(token,"workerhold03");fields=lease(leaseResponse);
  const finalActive=(await getInstance(token)).data.instance;
  r=await post("/api/instance/end",Object.assign({token,instance_id:id,
    expected_version:finalActive.version,reason:"test-terminal"},fields));
  must(r.status===200&&r.data.instance.status==="ended","worker não permitiu encerramento terminal");
  const terminalVersion=r.data.instance.version;
  await post("/api/lease/release",Object.assign({token},fields));
  await new Promise((resolve)=>setTimeout(resolve,350));
  r=await getInstance(token);
  must(r.data.instance===null&&r.data.lastStatus==="ended","worker reabriu instância terminal");
  const disk=JSON.parse(fs.readFileSync(path.join(dataDir,"instances.json"),"utf8"))[0];
  must(disk.version===terminalVersion&&disk.status==="ended","worker alterou tombstone depois do terminal");
  console.log("OK: Fase 6 — worker contabiliza tempo sem browser com lock e checkpoint exatamente uma vez.");
})().catch((error)=>{console.error(error);process.exitCode=1;}).finally(async()=>{
  await stop();fs.rmSync(dataDir,{recursive:true,force:true});
});
