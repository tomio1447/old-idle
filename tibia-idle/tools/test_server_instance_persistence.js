/* Fase 5: snapshot de hunt/boss autoritativo no servidor e retomável. */
"use strict";
const fs=require("fs"),os=require("os"),path=require("path");
const {spawn}=require("child_process");
const root=path.join(__dirname,".."),serverDir=path.join(root,"server");
const dbSource=fs.readFileSync(path.join(serverDir,"db.js"),"utf8");
const serverSource=fs.readFileSync(path.join(serverDir,"server.js"),"utf8");
const clientSource=fs.readFileSync(path.join(root,"game","js","account-client.js"),"utf8");
const gameSource=fs.readFileSync(path.join(root,"game","js","game.js"),"utf8");
const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),"global-idle-instance-server-"));
const port=37900+(process.pid%700),base=`http://127.0.0.1:${port}`;
let child=null,logs="";
function must(ok,msg){if(!ok)throw Error(msg);}
async function request(route,options){const response=await fetch(base+route,options),text=await response.text();
  let data;try{data=JSON.parse(text);}catch(e){data=text;}return {status:response.status,data};}
async function post(route,body){return request(route,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});}
async function put(route,body){return request(route,{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify(body)});}
async function start(){logs="";child=spawn(process.execPath,["server.js"],{cwd:serverDir,env:Object.assign({},process.env,{
  PORT:String(port),HOST:"127.0.0.1",TEST_SERVER:"0",MYSQL_HOST:"",LEASE_TTL_MS:"10000",GLOBAL_IDLE_DATA_DIR:dataDir,
}),stdio:["ignore","pipe","pipe"]});child.stdout.on("data",(c)=>{logs+=c;});child.stderr.on("data",(c)=>{logs+=c;});
  for(let i=0;i<100;i++){try{const r=await request("/api/health");if(r.data.ok)return;}catch(e){}
    await new Promise((resolve)=>setTimeout(resolve,40));}throw Error("servidor não iniciou: "+logs);}
async function stop(){if(!child)return;const proc=child;child=null;await new Promise((resolve)=>{
  proc.once("exit",resolve);proc.kill("SIGTERM");setTimeout(resolve,1000).unref();});}
async function account(login){await post("/api/register",{login,password:"x"});return (await post("/api/login",{login,password:"x"})).data;}
async function create(token,name,voc){return (await post("/api/characters",{token,name,voc,
  data:JSON.stringify({name,voc,level:1,hp:100})})).data.character;}
async function acquire(token,holder,takeover){return post(takeover?"/api/lease/takeover":"/api/lease/acquire",{token,holder_id:holder});}
function lease(result){return {holder_id:result.data.holderId,lease_token:result.data.leaseToken};}
async function getInstance(token){return request("/api/instance",{headers:{authorization:"Bearer "+token}});}
function descriptor(chars,marker,kind){
  kind=kind||"hunt";const players=chars.map((c,index)=>({id:String(c.id),name:c.name,
    p:{id:String(c.id),name:c.name,voc:c.voc,level:1,hp:100-index*10,mp:30},hp:100-index*10,mp:30}));
  return {v:1,savedAt:Date.now()-5000,startedAt:Date.now()-60000,kind,
    huntId:kind==="hunt"?"rats-of-rookgaard":null,bossId:kind==="boss"?"goshnars-greed":null,
    instanceMode:kind==="boss"?"boss":"non-pvp",activeCharacterId:String(chars[0].id),
    members:players.map((p)=>({id:p.id,p:p.p,hp:p.hp,mp:p.mp})),
    state:{players,mobs:[{id:"rat-1",slug:"rat",hp:20}],wave:marker,marker,events:[]}};
}
function saveBody(token,state,expected,id,leaseFields){return Object.assign({token,state,
  expected_version:expected,instance_id:id||null},leaseFields||{});}

(async()=>{
  must(dbSource.includes("CREATE TABLE IF NOT EXISTS account_instances")&&
    dbSource.includes("CREATE TABLE IF NOT EXISTS market_offers")&&
    dbSource.includes("ALTER TABLE accounts ADD COLUMN market_gold")&&
    dbSource.includes("instanceSave(accountId,instanceId,expectedVersion")&&
    dbSource.includes("instanceEnd(accountId,instanceId,expectedVersion")&&
    dbSource.includes("meta.started_at||meta.startedAt")&&
    serverSource.includes('url==="/api/instance"')&&serverSource.includes('url==="/api/instance/end"')&&
    serverSource.includes("started_at:new Date(now)")&&!serverSource.includes("startedAt:new Date(now)"),
    "API/schema da instância server-side ausentes");
  must(clientSource.includes("accountLoadInstance")&&clientSource.includes("accountSaveInstance")&&
    clientSource.includes("accountEndInstance")&&gameSource.includes("remote.lastStatus===\"ended\"")&&
    gameSource.includes("accountSaveInstance(sessionToken(),descriptor)"),
    "cliente não usa servidor como fonte da instância");
  await start();
  const owner=await account("instance-owner"),other=await account("instance-other");
  const hero=await create(owner.token,"Instance Hero","knight");
  const foreign=await create(other.token,"Foreign Hero","sorcerer");
  const a=await acquire(owner.token,"instanceholdA"),leaseA=lease(a);
  let r=await getInstance(owner.token);
  must(r.status===200&&r.data.instance===null&&r.data.lastStatus===null,"conta nova já possui instância");

  const first=descriptor([hero],1);
  r=await put("/api/instance",saveBody(owner.token,first,0,null));
  must(r.status===423&&r.data.error==="LEASE_REQUIRED","snapshot sem lease foi aceito");
  r=await put("/api/instance",saveBody(owner.token,first,0,null,leaseA));
  must(r.status===200&&r.data.instance.version===1&&r.data.instance.id,"instância inicial não foi criada");
  const id=r.data.instance.id;
  r=await getInstance(owner.token);
  must(r.status===200&&r.data.instance.id===id&&r.data.instance.state.state.wave===1&&
    r.data.instance.state.savedAt>Date.now()-3000,"GET não devolveu snapshot server-side autoritativo");

  const second=descriptor([hero],2);
  r=await put("/api/instance",saveBody(owner.token,second,1,id,leaseA));
  must(r.status===200&&r.data.instance.version===2,"update não avançou a versão da instância");
  const stale=await put("/api/instance",saveBody(owner.token,descriptor([hero],99),1,id,leaseA));
  must(stale.status===409&&stale.data.error==="INSTANCE_VERSION_CONFLICT"&&stale.data.instance.version===2,
    "snapshot obsoleto sobrescreveu a instância");

  await stop();await start();
  r=await getInstance(owner.token);
  must(r.status===200&&r.data.instance.version===2&&r.data.instance.state.state.wave===2,
    "instância não sobreviveu ao restart do servidor");
  const b=await acquire(owner.token,"instanceholdB",true),leaseB=lease(b);
  r=await put("/api/instance",saveBody(owner.token,descriptor([hero],3),2,id,leaseA));
  must(r.status===423,"holder anterior persistiu instância após takeover");
  r=await put("/api/instance",saveBody(owner.token,descriptor([hero],3),2,id,leaseB));
  must(r.status===200&&r.data.instance.version===3,"novo dispositivo não retomou snapshot existente");

  const crossed=descriptor([hero],4);crossed.members[0].p.name="Foreign Hero";
  r=await put("/api/instance",saveBody(owner.token,crossed,3,id,leaseB));
  must(r.status===409&&r.data.error==="INSTANCE_IDENTITY_MISMATCH","identidade cruzada entrou no snapshot");
  const alien=descriptor([hero],4);alien.members.push({id:String(foreign.id),p:{id:String(foreign.id),name:foreign.name}});
  alien.state.players.push({id:String(foreign.id),p:{id:String(foreign.id),name:foreign.name}});
  r=await put("/api/instance",saveBody(owner.token,alien,3,id,leaseB));
  must(r.status===403&&r.data.error==="INSTANCE_CHARACTER_NOT_OWNED","char de outra conta entrou na instância");
  must((await getInstance(owner.token)).data.instance.version===3,"snapshot inválido alterou versão autoritativa");

  r=await post("/api/instance/end",Object.assign({token:owner.token,instance_id:id,expected_version:3,reason:"returned-city"},leaseB));
  must(r.status===200&&r.data.instance.status==="ended"&&r.data.instance.version===4,"encerramento terminal não persistiu");
  r=await getInstance(owner.token);
  must(r.data.instance===null&&r.data.lastStatus==="ended"&&r.data.terminalReason==="returned-city",
    "tombstone terminal não impede retomada local antiga");

  const ally=await create(owner.token,"Instance Ally","druid");
  await post("/api/party/create",{token:owner.token,char_id:hero.id});
  for(const c of [hero,ally])await post("/api/party/zone",{token:owner.token,char_id:c.id,zone:"city"});
  const invite=await post("/api/party/invite",{token:owner.token,char_id:hero.id,invitee_name:ally.name});
  await post("/api/party/accept",{token:owner.token,char_id:ally.id,invite_id:invite.data.invite.id});
  const partyBoss=descriptor([hero,ally],1,"boss");
  r=await put("/api/instance",saveBody(owner.token,partyBoss,0,null,leaseB));
  must(r.status===200&&r.data.instance.version===1&&r.data.instance.partyId,
    "instância de boss da party não foi vinculada ao roster");
  const partyId=r.data.instance.id;
  const partial=descriptor([hero],2,"boss");
  r=await put("/api/instance",saveBody(owner.token,partial,1,partyId,leaseB));
  must(r.status===409&&r.data.error==="INSTANCE_PARTY_MISMATCH","snapshot parcial da party foi aceito");

  const disk=JSON.parse(fs.readFileSync(path.join(dataDir,"instances.json"),"utf8"));
  must(disk.length===1&&disk[0].status==="active"&&disk[0].state.includes("goshnars-greed"),
    "snapshot completo não foi persistido no storage");
  console.log("OK: Fase 5 — hunts/bosses persistem no servidor, retomam e encerram com tombstone.");
})().catch((error)=>{console.error(error);process.exitCode=1;}).finally(async()=>{
  await stop();fs.rmSync(dataDir,{recursive:true,force:true});
});
