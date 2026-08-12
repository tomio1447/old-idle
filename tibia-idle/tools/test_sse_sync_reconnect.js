/* Fase 8: SSE autenticado, replay por cursor, takeover e fallback snapshot. */
"use strict";
const fs=require("fs"),os=require("os"),path=require("path"),http=require("http"),EventEmitter=require("events");
const {spawn}=require("child_process");const {SyncBus}=require("../server/sync_bus");
const root=path.join(__dirname,".."),serverDir=path.join(root,"server");
const clientSource=fs.readFileSync(path.join(root,"game","js","account-client.js"),"utf8");
const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),"global-idle-sse-"));
const port=39800+(process.pid%400),base=`http://127.0.0.1:${port}`;let child=null,logs="";
function must(ok,msg){if(!ok)throw Error(msg);}
async function request(route,options){const response=await fetch(base+route,options),text=await response.text();let data;
  try{data=JSON.parse(text);}catch(e){data=text;}return {status:response.status,data};}
async function post(route,body){return request(route,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});}
async function put(route,body){return request(route,{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify(body)});}
async function start(){child=spawn(process.execPath,["server.js"],{cwd:serverDir,env:Object.assign({},process.env,{
  PORT:String(port),HOST:"127.0.0.1",MYSQL_HOST:"",TEST_SERVER:"0",LEASE_TTL_MS:"10000",GLOBAL_IDLE_DATA_DIR:dataDir,
}),stdio:["ignore","pipe","pipe"]});child.stdout.on("data",(c)=>{logs+=c;});child.stderr.on("data",(c)=>{logs+=c;});
  for(let i=0;i<100;i++){try{const r=await request("/api/health");if(r.data.ok)return;}catch(e){}await new Promise((r)=>setTimeout(r,35));}
  throw Error("servidor não iniciou: "+logs);}
async function stop(){if(!child)return;const p=child;child=null;await new Promise((resolve)=>{p.once("exit",resolve);p.kill("SIGTERM");setTimeout(resolve,1000).unref();});}
function openSse(ticket,lastId){const events=[],waiters=[];let buffer="";
  const req=http.get(base+"/api/sync/events?ticket="+encodeURIComponent(ticket)+(lastId?"&lastEventId="+lastId:""),(res)=>{
    res.setEncoding("utf8");res.on("data",(chunk)=>{buffer+=chunk;let at;
      while((at=buffer.indexOf("\n\n"))>=0){const frame=buffer.slice(0,at);buffer=buffer.slice(at+2);if(!frame||frame.startsWith(":" )||frame.startsWith("retry:"))continue;
        let id=0,type="message",data={};for(const line of frame.split("\n")){if(line.startsWith("id:"))id=Number(line.slice(3).trim());
          else if(line.startsWith("event:"))type=line.slice(6).trim();else if(line.startsWith("data:")){try{data=JSON.parse(line.slice(5).trim());}catch(e){}}}
        const event={id,type,data};events.push(event);for(const w of waiters.slice())if(w.type===type&&id>(w.afterId||0)){w.resolve(event);waiters.splice(waiters.indexOf(w),1);}
      }});
  });
  return {events,req,wait(type,timeout,afterId){const found=events.find((e)=>e.type===type&&e.id>(afterId||0));if(found)return Promise.resolve(found);
    return new Promise((resolve,reject)=>{const w={type,resolve,afterId:afterId||0};waiters.push(w);setTimeout(()=>{const i=waiters.indexOf(w);if(i>=0)waiters.splice(i,1);reject(Error("timeout SSE "+type));},timeout||4000);});},close(){req.destroy();}};
}
function descriptor(c){const p={id:String(c.id),name:c.name,voc:c.voc,level:1,hp:185,mp:5,skills:{sword:10},equip:{weapon:{item:"sword"}}};
  return {v:1,savedAt:Date.now(),kind:"hunt",huntId:"rats",instanceMode:"non-pvp",activeCharacterId:String(c.id),
    members:[{id:String(c.id),p}],state:{players:[{id:String(c.id),p}],mobs:[{id:"rat",slug:"rat",hp:20}],events:[]}};}
class FakeResponse extends EventEmitter{constructor(){super();this.text="";this.destroyed=false;this.writableEnded=false;}write(s){this.text+=s;return true;}}
(async()=>{
  // Replay expirado força snapshot completo em vez de perder mutações.
  const bus=new SyncBus({historyLimit:2,ticketTtlMs:1000});bus.publish(1,"character",{n:1});bus.publish(1,"party",{n:2});
  bus.publish(1,"instance",{n:3});bus.publish(1,"lease",{n:4});
  const fake=new FakeResponse();const close=bus.subscribe(1,fake,1);must(fake.text.includes("event: snapshot-required")&&fake.text.includes("event: ready"),
    "cursor expirado não pediu snapshot/reabriu stream");close();fake.emit("close");
  must(clientSource.includes("new EventSource")&&clientSource.includes("/api/sync/ticket")&&
    clientSource.includes("/api/sync/state")&&clientSource.includes("accountSyncFallback")&&
    clientSource.includes('type==="sync-expired"')&&clientSource.includes("accountSyncProtocolSupported")&&
    clientSource.includes("ACCOUNT_SYNC.starting")&&clientSource.includes("lastEventId"),
    "cliente não implementa SSE/replay/fallback");

  await start();const health=await request("/api/health");
  must(health.data.sync&&health.data.sync.protocol==="sse-v2","servidor não anuncia protocolo SSE compatível");
  await post("/api/register",{login:"sync",password:"x"});const login=await post("/api/login",{login:"sync",password:"x"}),token=login.data.token;
  const ticket=await post("/api/sync/ticket",{token});must(ticket.status===200&&ticket.data.ticket,"ticket SSE não emitido");
  const stream=openSse(ticket.data.ticket);await stream.wait("ready");
  const created=await post("/api/characters",{token,name:"Sync Hero",voc:"knight",data:JSON.stringify({name:"Sync Hero",voc:"knight"})});
  const charEvent=await stream.wait("character");must(charEvent.data.id===created.data.character.id,"evento de personagem incorreto");
  const partyCreated=await post("/api/party/create",{token,char_id:created.data.character.id});must(partyCreated.status===201,"party para SSE não criada");
  const partyEvent=await stream.wait("party");must(partyEvent.data.action==="create"&&partyEvent.data.party.version===1,
    "versão/composição da party não foi transmitida");
  const acquired=await post("/api/lease/acquire",{token,holder_id:"syncholder01"}),lease={holder_id:acquired.data.holderId,lease_token:acquired.data.leaseToken};
  const leaseEvent=await stream.wait("lease");must(leaseEvent.data.action==="acquire","aquisição do lease não foi transmitida");
  const saved=await put("/api/instance",Object.assign({token,expected_version:0,instance_id:null,state:descriptor(created.data.character)},lease));
  const instanceEvent=await stream.wait("instance");must(instanceEvent.data.version===saved.data.instance.version,"versão da instância SSE divergente");

  // Reconecta do cursor do primeiro evento: lease/instance são reproduzidos,
  // character anterior não é duplicado.
  stream.close();const replay=openSse(ticket.data.ticket,charEvent.id);const replayParty=await replay.wait("party"),
    replayLease=await replay.wait("lease"),replayInstance=await replay.wait("instance");
  must(replayParty.id>charEvent.id&&replayLease.id>replayParty.id&&replayInstance.id>replayLease.id&&
    !replay.events.some((e)=>e.type==="character"&&e.id<=charEvent.id),"replay perdeu ordem ou duplicou evento confirmado");
  await replay.wait("ready");
  const takeover=await post("/api/lease/takeover",{token,holder_id:"syncholder02"});must(takeover.status===200,"takeover falhou");
  const takeoverEvent=await replay.wait("lease",4000,Math.max(replayLease.id,replayInstance.id));
  must(takeoverEvent.data.action==="takeover"&&takeoverEvent.data.holderId==="syncholder02","takeover não chegou em tempo real");
  const state=await request("/api/sync/state",{headers:{authorization:"Bearer "+token}});
  must(state.status===200&&state.data.cursor>=takeoverEvent.id&&state.data.instance.id===saved.data.instance.id&&
    state.data.characters[0].saveVersion>=1,"fallback snapshot não contém versões atuais");
  const invalid=await request("/api/sync/events?ticket=invalid");
  must(invalid.status===200&&String(invalid.data).includes("event: sync-expired"),
    "ticket inválido não foi renovável sem HTTP 401");
  replay.close();await stop();await start();
  const oldAfterRestart=await request("/api/sync/events?ticket="+ticket.data.ticket);
  must(oldAfterRestart.status===200&&String(oldAfterRestart.data).includes("event: sync-expired"),
    "ticket antigo após restart não solicitou renovação limpa");
  const renewedTicket=await post("/api/sync/ticket",{token}),afterRestart=openSse(renewedTicket.data.ticket,takeoverEvent.id);
  const reset=await afterRestart.wait("snapshot-required");await afterRestart.wait("ready");
  must(reset.data.reason==="server-reset","cursor antigo não forçou reconciliação depois do restart");
  const persisted=await request("/api/sync/state",{headers:{authorization:"Bearer "+token}});
  must(persisted.data.instance&&persisted.data.instance.id===saved.data.instance.id,
    "snapshot fallback perdeu instância após restart");afterRestart.close();
  console.log("OK: Fase 8 — SSE autenticado, replay ordenado, takeover e fallback validados.");
})().catch((error)=>{console.error(error);process.exitCode=1;}).finally(async()=>{await stop();fs.rmSync(dataDir,{recursive:true,force:true});});
