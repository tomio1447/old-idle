/* Fase 3: optimistic concurrency + save atômico de todos os chars da party. */
"use strict";
const fs=require("fs"),os=require("os"),path=require("path");
const {spawn}=require("child_process");
const root=path.join(__dirname,".."),serverDir=path.join(root,"server");
const source=fs.readFileSync(path.join(serverDir,"db.js"),"utf8");
const client=fs.readFileSync(path.join(root,"game","js","account-client.js"),"utf8");
const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),"global-idle-versioned-save-"));
const port=36200+(process.pid%900),base=`http://127.0.0.1:${port}`;
let child=null,logs="",lease={};
function must(ok,msg){if(!ok)throw Error(msg);}
async function request(route,options){
  const response=await fetch(base+route,options),text=await response.text();
  let data;try{data=JSON.parse(text);}catch(e){data=text;}return {status:response.status,data};
}
async function post(route,body){return request(route,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});}
async function put(route,body){return request(route,{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify(body)});}
async function start(){
  logs="";child=spawn(process.execPath,["server.js"],{cwd:serverDir,env:Object.assign({},process.env,{
    PORT:String(port),HOST:"127.0.0.1",TEST_SERVER:"0",MYSQL_HOST:"",GLOBAL_IDLE_DATA_DIR:dataDir,
  }),stdio:["ignore","pipe","pipe"]});
  child.stdout.on("data",(c)=>{logs+=c;});child.stderr.on("data",(c)=>{logs+=c;});
  for(let i=0;i<100;i++){try{const r=await request("/api/health");if(r.data.ok)return;}catch(e){}
    await new Promise((resolve)=>setTimeout(resolve,40));}
  throw Error("servidor não iniciou: "+logs);
}
async function stop(){if(!child)return;const proc=child;child=null;
  await new Promise((resolve)=>{proc.once("exit",resolve);proc.kill("SIGTERM");setTimeout(resolve,1000).unref();});}
async function create(token,name,voc){
  const r=await post("/api/characters",{token,name,voc,data:JSON.stringify({name,voc,level:1,hp:100})});
  must(r.status===201&&r.data.character.saveVersion===1,"personagem novo não começa na versão 1");return r.data.character;
}
async function load(token,id){
  const r=await request("/api/characters/"+id,{headers:{authorization:"Bearer "+token}});
  must(r.status===200,"falha ao carregar char "+id);return Object.assign({},r.data.character,{snapshot:JSON.parse(r.data.character.data)});
}
async function me(token){return (await request("/api/me",{headers:{authorization:"Bearer "+token}})).data;}
async function state(token,id){return (await request("/api/party/state?char_id="+id,{headers:{authorization:"Bearer "+token}})).data.state;}
function singleBody(token,c,version,marker){return Object.assign({token,expected_version:version,voc:c.voc,level:c.level,
  data:JSON.stringify({id:String(c.id),name:c.name,voc:c.voc,level:c.level,marker,hp:100}),hp:100,mp:20,maxHp:100,maxMp:20},lease);}
function partyEntry(c,marker){return {id:Number(c.id),expected_version:Number(c.saveVersion),voc:c.voc,level:c.level,
  data:JSON.stringify({id:String(c.id),name:c.name,voc:c.voc,level:c.level,marker,hp:100}),hp:100,mp:20,maxHp:100,maxMp:20};}
function withLease(body){return Object.assign({},body,lease);}

(async()=>{
  must(source.includes("save_version=save_version+1")&&source.includes("FOR UPDATE")&&
    source.includes("beginTransaction")&&source.includes("savePartyCharactersVersioned")&&
    source.includes("roster_version=roster_version+1"),"MySQL não usa versão/transação/lock pessimista");
  must(client.includes("ACCOUNT_SAVE_QUEUE")&&client.includes("ACCOUNT_SAVE_CONFLICTS")&&
    client.includes('"/api/party/save"'),"cliente não serializa saves nem bloqueia conflito");
  await start();
  await post("/api/register",{login:"versioned",password:"x"});
  const login=await post("/api/login",{login:"versioned",password:"x"});
  const token=login.data.token;
  const acquired=await post("/api/lease/acquire",{token,holder_id:"phase3holder0001"});
  must(acquired.status===200&&acquired.data.leaseToken,"lease para os saves não foi concedido");
  lease={holder_id:acquired.data.holderId,lease_token:acquired.data.leaseToken};
  const leader=await create(token,"Version Leader","knight");
  const second=await create(token,"Version Second","druid");
  const third=await create(token,"Version Third","paladin");

  let r=await put("/api/characters/"+leader.id,Object.assign({},singleBody(token,leader,1,"missing"),{expected_version:undefined}));
  must(r.status===428&&r.data.error==="SAVE_VERSION_REQUIRED","save sem precondition/version não foi recusado");

  const simultaneous=await Promise.all([
    put("/api/characters/"+leader.id,singleBody(token,leader,1,"winner-a")),
    put("/api/characters/"+leader.id,singleBody(token,leader,1,"winner-b")),
  ]);
  must(simultaneous.filter((x)=>x.status===200).length===1&&
    simultaneous.filter((x)=>x.status===409&&x.data.error==="SAVE_VERSION_CONFLICT").length===1,
    "duas gravações da mesma versão foram aceitas");
  let loaded=await load(token,leader.id);
  must(loaded.saveVersion===2&&/^winner-/.test(loaded.snapshot.marker),"vencedor não ficou autoritativo na versão 2");
  r=await put("/api/characters/"+leader.id,singleBody(token,leader,1,"stale-overwrite"));
  must(r.status===409&&r.data.characters[0].saveVersion===2,"save obsoleto não devolveu snapshot autoritativo");
  loaded=await load(token,leader.id);
  must(loaded.snapshot.marker!=="stale-overwrite","save obsoleto sobrescreveu o vencedor");
  r=await put("/api/characters/"+leader.id,singleBody(token,leader,2,"sequential"));
  must(r.status===200&&r.data.saveVersion===3,"save sequencial não avançou exatamente uma versão");

  r=await post("/api/party/create",{token,char_id:leader.id});must(r.status===201,"party não criada");
  for(const c of [leader,second,third])await post("/api/party/zone",{token,char_id:c.id,zone:"city"});
  for(const c of [second,third]){
    const invite=await post("/api/party/invite",{token,char_id:leader.id,invitee_name:c.name});
    const accepted=await post("/api/party/accept",{token,invite_id:invite.data.invite.id});
    must(accepted.status===200,"membro não entrou na party");
  }
  let partyState=await state(token,leader.id);
  must(partyState.version===3,"versão do roster não avançou em cada alteração de composição");
  let summaries=(await me(token)).characters;
  const before=new Map(summaries.map((c)=>[Number(c.id),c.saveVersion]));
  const entries=summaries.map((c)=>partyEntry(c,"atomic-attempt"));
  entries.find((e)=>e.id===Number(second.id)).expected_version=0;
  r=await post("/api/party/save",withLease({token,party_id:partyState.id,party_version:partyState.version,
    party_order:partyState.order,characters:entries}));
  must(r.status===409&&r.data.error==="SAVE_VERSION_CONFLICT","party com um char obsoleto não gerou conflito");
  summaries=(await me(token)).characters;
  must(summaries.every((c)=>c.saveVersion===before.get(Number(c.id))),
    "falha de um membro causou save parcial nos demais");

  const validEntries=summaries.map((c)=>partyEntry(c,"atomic-success"));
  r=await post("/api/party/save",withLease({token,party_id:partyState.id,party_version:partyState.version,
    party_order:partyState.order,characters:validEntries}));
  must(r.status===200&&r.data.characters.every((c)=>c.saveVersion===before.get(Number(c.id))+1),
    "transação válida não avançou todos os personagens exatamente uma versão");
  for(const c of r.data.characters){loaded=await load(token,c.id);must(loaded.snapshot.marker==="atomic-success","snapshot da transação não persistiu");}

  const oldPartyVersion=partyState.version,oldOrder=partyState.order.slice();
  r=await post("/api/party/reorder",{token,char_id:second.id,expected_version:partyState.version,
    character_ids:[leader.id,third.id,second.id]});
  must(r.status===200&&r.data.state.version===oldPartyVersion+1,"reorder não incrementou roster_version");
  partyState=r.data.state;
  const staleReorder=await post("/api/party/reorder",{token,char_id:second.id,expected_version:oldPartyVersion,
    character_ids:[leader.id,second.id,third.id]});
  must(staleReorder.status===409&&staleReorder.data.error==="PARTY_VERSION_CONFLICT",
    "reorder obsoleto não foi recusado pela versão do roster");
  summaries=(await me(token)).characters;
  const versionsAfterAtomic=new Map(summaries.map((c)=>[Number(c.id),c.saveVersion]));
  r=await post("/api/party/save",withLease({token,party_id:partyState.id,party_version:oldPartyVersion,
    party_order:oldOrder,characters:summaries.map((c)=>partyEntry(c,"stale-party"))}));
  must(r.status===409&&r.data.error==="PARTY_VERSION_CONFLICT","save com composição antiga não foi recusado");
  summaries=(await me(token)).characters;
  must(summaries.every((c)=>c.saveVersion===versionsAfterAtomic.get(Number(c.id))),
    "conflito do roster alterou versões de personagens");

  const partial=summaries.slice(0,-1).map((c)=>partyEntry(c,"partial"));
  r=await post("/api/party/save",withLease({token,party_id:partyState.id,party_version:partyState.version,
    party_order:partyState.order,characters:partial}));
  must(r.status===409&&r.data.error==="PARTY_SAVE_SET_MISMATCH","save parcial da party foi aceito");

  const finalEntries=summaries.map((c)=>partyEntry(c,"after-reorder"));
  r=await post("/api/party/save",withLease({token,party_id:partyState.id,party_version:partyState.version,
    party_order:partyState.order,characters:finalEntries}));
  must(r.status===200,"save atômico após reorder válido falhou");
  const finalVersions=new Map(r.data.characters.map((c)=>[Number(c.id),c.saveVersion]));
  await stop();await start();
  partyState=await state(token,third.id);
  must(partyState.version===oldPartyVersion+1&&JSON.stringify(partyState.order)===JSON.stringify([leader.id,third.id,second.id]),
    "versão/ordem da party não sobreviveram ao restart");
  summaries=(await me(token)).characters;
  must(summaries.every((c)=>c.saveVersion===finalVersions.get(Number(c.id))),
    "versões dos personagens não sobreviveram ao restart");
  console.log("OK: Fase 3 — saves versionados; party salva tudo ou nada em uma transação.");
})().catch((error)=>{console.error(error);process.exitCode=1;}).finally(async()=>{
  await stop();fs.rmSync(dataDir,{recursive:true,force:true});
});
