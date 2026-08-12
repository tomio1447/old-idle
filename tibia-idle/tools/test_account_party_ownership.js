/* Fase 2: party pertencente à conta, ordem persistida e corrida bloqueada. */
"use strict";
const fs=require("fs"),os=require("os"),path=require("path");
const {spawn}=require("child_process");
const root=path.join(__dirname,".."),serverDir=path.join(root,"server");
const dbSource=fs.readFileSync(path.join(serverDir,"db.js"),"utf8");
const schema=fs.readFileSync(path.join(serverDir,"database.sql"),"utf8");
const accountClient=fs.readFileSync(path.join(root,"game","js","account-client.js"),"utf8");
const partyUi=fs.readFileSync(path.join(root,"game","js","party-ui.js"),"utf8");
const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),"global-idle-party-owner-"));
const port=35200+(process.pid%1000),base=`http://127.0.0.1:${port}`;
let child=null,logs="";
function must(ok,msg){if(!ok)throw Error(msg);}
async function request(route,options){
  const response=await fetch(base+route,options),text=await response.text();
  let data;try{data=JSON.parse(text);}catch(e){data=text;}
  return {status:response.status,data};
}
async function post(route,body){return request(route,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});}
async function start(){
  logs="";child=spawn(process.execPath,["server.js"],{cwd:serverDir,env:Object.assign({},process.env,{
    PORT:String(port),HOST:"127.0.0.1",TEST_SERVER:"0",MYSQL_HOST:"",GLOBAL_IDLE_DATA_DIR:dataDir,
  }),stdio:["ignore","pipe","pipe"]});
  child.stdout.on("data",(c)=>{logs+=c;});child.stderr.on("data",(c)=>{logs+=c;});
  for(let i=0;i<100;i++){
    try{const r=await request("/api/health");if(r.data.ok)return;}catch(e){}
    await new Promise((resolve)=>setTimeout(resolve,40));
  }
  throw Error("servidor não iniciou: "+logs);
}
async function stop(){
  if(!child)return;const proc=child;child=null;
  await new Promise((resolve)=>{proc.once("exit",resolve);proc.kill("SIGTERM");setTimeout(resolve,1000).unref();});
}
async function account(login){
  await post("/api/register",{login,password:"x"});
  const r=await post("/api/login",{login,password:"x"});must(r.status===200,"login falhou: "+login);return r.data;
}
async function character(token,name,voc){
  const r=await post("/api/characters",{token,name,voc,data:JSON.stringify({name,voc,level:10})});
  must(r.status===201,"char falhou: "+name);return r.data.character;
}
async function state(token,charId){return request("/api/party/state?char_id="+charId,{headers:{authorization:"Bearer "+token}});}

(async()=>{
  must(dbSource.includes("UNIQUE KEY uq_parties_owner (owner_account_id)")&&
    dbSource.includes("ORDER BY m.position ASC")&&schema.includes("position      TINYINT UNSIGNED"),
    "schema/migração MySQL não persistem proprietário e posição");
  must(accountClient.includes("function accountPartyReorder")&&
    partyUi.includes('data-party-order="up"')&&partyUi.includes('data-party-order="down"'),
    "cliente online não permite à conta salvar a ordem no servidor");
  await start();
  const owner=await account("owner"),stranger=await account("stranger"),racer=await account("racer");
  const leader=await character(owner.token,"Owner Leader","knight");
  const first=await character(owner.token,"Owner First","paladin");
  const second=await character(owner.token,"Owner Second","druid");
  const outsider=await character(stranger.token,"Other Account","sorcerer");
  const raceA=await character(racer.token,"Race A","knight");
  const raceB=await character(racer.token,"Race B","druid");

  const raced=await Promise.all([
    post("/api/party/create",{token:racer.token,char_id:raceA.id}),
    post("/api/party/create",{token:racer.token,char_id:raceB.id}),
  ]);
  must(raced.filter((r)=>r.status===201).length===1&&raced.filter((r)=>r.status===409).length===1,
    "duas criações simultâneas produziram duas parties na mesma conta");

  let r=await post("/api/party/create",{token:owner.token,char_id:leader.id});
  must(r.status===201&&r.data.state.isOwner&&r.data.state.isLeader&&
    r.data.state.ownedByAccount===owner.account.id,"party não foi atribuída à conta criadora");
  r=await post("/api/party/create",{token:owner.token,char_id:first.id});
  must(r.status===409&&r.data.error==="ACCOUNT_PARTY_EXISTS",
    "outro personagem da conta criou um roster concorrente");
  r=await state(owner.token,first.id);
  must(r.status===200&&r.data.state&&r.data.state.isOwner&&!r.data.state.isMember,
    "conta dona não recupera sua party ao trocar para char fora do roster");

  for(const c of [leader,first,second])await post("/api/party/zone",{token:owner.token,char_id:c.id,zone:"city"});
  for(const c of [first,second]){
    r=await post("/api/party/invite",{token:owner.token,char_id:leader.id,invitee_name:c.name});
    must(r.status===201,"convite falhou para "+c.name);
    const accepted=await post("/api/party/accept",{token:owner.token,invite_id:r.data.invite.id});
    must(accepted.status===200,"aceite falhou para "+c.name);
  }
  r=await state(owner.token,leader.id);
  must(JSON.stringify(r.data.state.order)===JSON.stringify([leader.id,first.id,second.id]),
    "ordem inicial não segue a entrada dos membros");

  const invalid=await post("/api/party/reorder",{token:owner.token,char_id:first.id,
    character_ids:[second.id,leader.id,first.id]});
  must(invalid.status===400&&invalid.data.error==="PARTY_LEADER_FIXED",
    "reorder permitiu retirar o líder da primeira posição");
  const missing=await post("/api/party/reorder",{token:owner.token,char_id:first.id,
    character_ids:[leader.id,second.id]});
  must(missing.status===400&&missing.data.error==="INVALID_PARTY_ORDER",
    "reorder parcial apagou membro da composição");
  const denied=await post("/api/party/reorder",{token:stranger.token,char_id:outsider.id,
    character_ids:[leader.id,second.id,first.id]});
  must(denied.status===404&&denied.data.error==="ACCOUNT_PARTY_NOT_FOUND",
    "outra conta conseguiu selecionar/reordenar a party alheia");

  r=await post("/api/party/reorder",{token:owner.token,char_id:first.id,
    character_ids:[leader.id,second.id,first.id]});
  must(r.status===200&&JSON.stringify(r.data.state.order)===JSON.stringify([leader.id,second.id,first.id]),
    "conta dona não conseguiu persistir a nova ordem");
  const partyFile=JSON.parse(fs.readFileSync(path.join(dataDir,"parties.json"),"utf8"));
  const stored=partyFile.parties.find((p)=>Number(p.owner_account_id)===Number(owner.account.id));
  must(stored&&stored.members.find((m)=>m.character_id===second.id).position===1&&
    stored.members.find((m)=>m.character_id===first.id).position===2,
    "owner_account_id/position não foram gravados no storage");

  await stop();await start();
  r=await state(owner.token,second.id);
  must(r.status===200&&r.data.state.isOwner&&r.data.state.isMember&&
    JSON.stringify(r.data.state.order)===JSON.stringify([leader.id,second.id,first.id]),
    "propriedade/ordem não sobreviveram ao restart do servidor");
  console.log("OK: Fase 2 — uma party por conta, ordem autoritativa e persistente.");
})().catch((error)=>{console.error(error);process.exitCode=1;}).finally(async()=>{
  await stop();fs.rmSync(dataDir,{recursive:true,force:true});
});
