/* Regressão: Cobra online não gera snapshot circular nem transição party 400. */
"use strict";
const fs=require("fs"),os=require("os"),path=require("path"),{spawn}=require("child_process");
const root=path.join(__dirname,".."),serverDir=path.join(root,"server"),dataDir=fs.mkdtempSync(path.join(os.tmpdir(),"cobra-online-"));
const client=fs.readFileSync(path.join(root,"game","js","account-client.js"),"utf8"),game=fs.readFileSync(path.join(root,"game","js","game.js"),"utf8"),
  partyUi=fs.readFileSync(path.join(root,"game","js","party-ui.js"),"utf8");
const port=40700+(process.pid%200),base=`http://127.0.0.1:${port}`;let child,logs="";
function must(v,m){if(!v)throw Error(m);}async function request(route,options){const response=await fetch(base+route,options),text=await response.text();let data;
  try{data=JSON.parse(text);}catch(e){data=text;}return {status:response.status,data};}
async function post(route,body){return request(route,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});}
async function put(route,body){return request(route,{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify(body)});}
async function start(){child=spawn(process.execPath,["server.js"],{cwd:serverDir,env:Object.assign({},process.env,{PORT:String(port),HOST:"127.0.0.1",MYSQL_HOST:"",TEST_SERVER:"1",GLOBAL_IDLE_DATA_DIR:dataDir}),stdio:["ignore","pipe","pipe"]});
  child.stdout.on("data",c=>logs+=c);child.stderr.on("data",c=>logs+=c);for(let i=0;i<100;i++){try{if((await request("/api/health")).data.ok)return;}catch(e){}await new Promise(r=>setTimeout(r,35));}throw Error(logs);}
function descriptor(chars){const players=chars.map(c=>({id:String(c.id),p:{id:String(c.id),name:c.name,voc:c.voc,level:1,hp:185,mp:5}}));
  return {v:1,savedAt:Date.now(),kind:"hunt",huntId:"cobra-bastion",instanceMode:"non-pvp",activeCharacterId:String(chars[0].id),
    members:players.map(e=>({id:e.id,p:e.p,hp:e.p.hp,mp:e.p.mp})),state:{players,mobs:[],events:[]}};}
(async()=>{
  const normalizeStart=client.indexOf("function accountNormalizeInstanceMembers"),normalizeEnd=client.indexOf("\nfunction accountSaveInstance",normalizeStart);
  const normalizeCtx={Map,Object,Array,String};require("vm").createContext(normalizeCtx);
  require("vm").runInContext(client.slice(normalizeStart,normalizeEnd),normalizeCtx);
  const normalized=normalizeCtx.accountNormalizeInstanceMembers({members:[{id:"1",p:{name:"EK"}},{id:"2",p:{name:"MS"}}],
    state:{players:[null,{id:"2",p:{name:"MS antigo"}}]}});
  must(normalized.state.players.map((e)=>e.id).join(",")==="1,2"&&normalized.state.players[0].p.name==="EK",
    "account-client não reconstrói membros antes do PUT");
  await start();const login=await post("/api/login",{login:"2",password:"2"}),token=login.data.token;
  const guestLogin=await post("/api/login",{login:"1",password:"1"}),guestToken=guestLogin.data.token;
  const a=(await post("/api/characters",{token,name:"Cobra EK",voc:"knight",data:JSON.stringify({name:"Cobra EK",voc:"knight"})})).data.character;
  const b=(await post("/api/characters",{token,name:"Cobra RP",voc:"paladin",data:JSON.stringify({name:"Cobra RP",voc:"paladin"})})).data.character;
  const c=(await post("/api/characters",{token,name:"Cobra ED",voc:"druid",data:JSON.stringify({name:"Cobra ED",voc:"druid"})})).data.character;
  const d=(await post("/api/characters",{token,name:"Cobra Monk",voc:"monk",data:JSON.stringify({name:"Cobra Monk",voc:"monk"})})).data.character;
  const guest=(await post("/api/characters",{token:guestToken,name:"Cobra MS",voc:"sorcerer",data:JSON.stringify({name:"Cobra MS",voc:"sorcerer"})})).data.character;
  const roster=[a,b,c,d];await post("/api/party/create",{token,char_id:a.id});
  for(const character of roster)await post("/api/party/zone",{token,char_id:character.id,zone:"city"});
  await post("/api/party/zone",{token:guestToken,char_id:guest.id,zone:"city"});
  for(const [character,acceptToken] of [[b,token],[c,token],[d,token],[guest,guestToken]]){
    const invite=await post("/api/party/invite",{token,char_id:a.id,invitee_name:character.name});
    await post("/api/party/accept",{token:acceptToken,char_id:character.id,invite_id:invite.data.invite.id});}
  let noOp=await post("/api/party/zone",{token,char_id:a.id,zone:"unknown"});
  must(noOp.status===200&&noOp.data.ignored,"zona transitória ainda gera HTTP 400");
  noOp=await post("/api/party/zone",{token,char_id:a.id,zone:"hunt"});
  must(noOp.status===200&&noOp.data.ignored,"hunt ainda incompleta gera HTTP 400");
  let r=await post("/api/party/zone",{token,char_id:a.id,zone:"boss",boss:"goshnar-s-greed",cooldownMs:0});
  must(r.status===200,"entrada boss inicial falhou: "+JSON.stringify(r.data));
  r=await post("/api/party/zone",{token,char_id:a.id,zone:"hunt",hunt:"cobra-bastion",instance:"non-pvp",otbm:"cobra_bastion"});
  must(r.status===200,"boss -> hunt idempotente retornou 400: "+JSON.stringify(r.data));
  r=await post("/api/party/zone",{token,char_id:a.id,zone:"boss",boss:"goshnar-s-greed",cooldownMs:0});
  must(r.status===200,"hunt -> boss idempotente retornou 400");
  r=await post("/api/party/zone",{token,char_id:a.id,zone:"city"});must(r.status===200,"checkpoint city falhou");
  r=await post("/api/party/zone",{token,char_id:a.id,zone:"hunt",hunt:"cobra-bastion",instance:"non-pvp",otbm:"cobra_bastion"});
  must(r.status===200,"boss -> city -> Cobra retornou 400: "+JSON.stringify(r.data));
  const acquired=await post("/api/lease/acquire",{token,holder_id:"cobratransition"}),lease={holder_id:acquired.data.holderId,lease_token:acquired.data.leaseToken};
  const emptyTick=await post("/api/instance/tick",Object.assign({token},lease));
  must(emptyTick.status===200&&emptyTick.data.instance===null,"tick sem instância ainda retorna HTTP 410");
  const snapshot=descriptor(roster);snapshot.state.players=[null,snapshot.state.players[1]];
  r=await put("/api/instance",Object.assign({token,instance_id:null,expected_version:0,state:snapshot},lease));
  must(r.status===200,"snapshot Cobra recuperável retornou "+r.status+": "+JSON.stringify(r.data));
  const sharedId=r.data.instance.id;
  let loaded=await request("/api/instance",{headers:{authorization:"Bearer "+token}});
  must(loaded.status===200&&loaded.data.instance.id===sharedId&&loaded.data.instance.state.state.players.length===5&&
    loaded.data.instance.state.state.players.every(Boolean)&&new Set(loaded.data.instance.state.state.players.map((p)=>String(p.id))).size===5,
    "party Cobra não entrou completa na única instância autoritativa");
  await new Promise((resolve)=>setTimeout(resolve,1100));
  const ownerTick=await post("/api/instance/tick",Object.assign({token,char_id:a.id,
    expected_version:loaded.data.instance.version},lease));
  must(ownerTick.status===200&&ownerTick.data.characters.length===4&&ownerTick.data.instance.state.state.players.length===5,
    "tick compartilhado não projetou a party sem vazar personagens externos no cache do líder");
  loaded=await request("/api/instance?char_id="+a.id,{headers:{authorization:"Bearer "+token}});
  const ammoSwap=await post("/api/instance/ammo",Object.assign({token,char_id:b.id,ammo:"bolt",instance_id:sharedId,
    expected_version:loaded.data.instance.version},lease));
  const rpAuthority=ammoSwap.data.instance&&ammoSwap.data.instance.state.authority.players.find((item)=>Number(item.id)===Number(b.id));
  must(ammoSwap.status===200&&ammoSwap.data.instance.id===sharedId&&rpAuthority&&rpAuthority.p.equip.ammo.item==="bolt",
    "RP não trocou arrow por bolt autoritativamente dentro da mesma instância");
  loaded=await request("/api/instance?char_id="+a.id,{headers:{authorization:"Bearer "+token}});
  const guestCharacter=await request("/api/characters/"+guest.id,{headers:{authorization:"Bearer "+guestToken}});
  must(guestCharacter.status===200&&guestCharacter.data.character.saveVersion>guest.saveVersion,
    "autoridade compartilhada não persistiu o membro de outra conta");
  const guestLeaseRaw=await post("/api/lease/acquire",{token:guestToken,holder_id:"cobraguestholder"}),
    guestLease={holder_id:guestLeaseRaw.data.holderId,lease_token:guestLeaseRaw.data.leaseToken};
  let guestView=await request("/api/instance?char_id="+guest.id,{headers:{authorization:"Bearer "+guestToken}});
  must(guestView.status===200&&guestView.data.instance.id===sharedId&&
    guestView.data.instance.state.activeCharacterId===String(guest.id),"membro de outra conta não recebeu a instância compartilhada");
  const guestTick=await post("/api/instance/tick",Object.assign({token:guestToken,char_id:guest.id,
    expected_version:guestView.data.instance.version},guestLease));
  must(guestTick.status===200&&guestTick.data.shared&&guestTick.data.instance.id===sharedId&&guestTick.data.elapsed===0&&
    guestTick.data.characters.length===1&&Number(guestTick.data.characters[0].id)===Number(guest.id),
    "membro externo abriu/tickou uma segunda instância ou recebeu cache alheio");
  const blockedMarket=await post("/api/market/deposit",Object.assign({token:guestToken,amount:1,char_id:guest.id,
    expected_version:guestTick.data.characters[0].saveVersion},guestLease));
  must(blockedMarket.status===409&&blockedMarket.data.error==="MARKET_IN_INSTANCE",
    "membro externo usou Market dentro da instância compartilhada");
  const guestSolo=descriptor([guest]);
  const guestSave=await put("/api/instance",Object.assign({token:guestToken,char_id:guest.id,instance_id:null,
    expected_version:0,state:guestSolo},guestLease));
  must(guestSave.status===200&&guestSave.data.shared&&guestSave.data.instance.id===sharedId,
    "follow externo criou instância própria em vez de aderir à party");
  const guestEnd=await post("/api/instance/end",Object.assign({token:guestToken,char_id:guest.id,
    instance_id:sharedId,expected_version:guestView.data.instance.version,reason:"guest-left"},guestLease));
  must(guestEnd.status===200&&guestEnd.data.sharedDetached,"membro externo encerrou a instância do líder");
  for(const active of [b,c,d,a]){
    const state=loaded.data.instance.state;state.activeCharacterId=String(active.id);
    const saved=await put("/api/instance",Object.assign({token,instance_id:sharedId,
      expected_version:loaded.data.instance.version,state},lease));
    must(saved.status===200&&saved.data.instance.id===sharedId,"troca de personagem criou outra instância");
    loaded=await request("/api/instance",{headers:{authorization:"Bearer "+token}});
  }
  const sameAccountMember=await request("/api/instance?char_id="+b.id,{headers:{authorization:"Bearer "+token}});
  must(sameAccountMember.status===200&&sameAccountMember.data.instance.id===sharedId&&
    sameAccountMember.data.instance.state.activeCharacterId===String(b.id),
    "membro da conta do líder retomou a instância como runtime separado");
  const diskInstances=JSON.parse(fs.readFileSync(path.join(dataDir,"instances.json"),"utf8"));
  must(diskInstances.length===1&&diskInstances[0].instance_id===sharedId&&
    loaded.data.instance.state.state.players.length===5&&loaded.data.instance.state.activeCharacterId===String(a.id),
    "cada membro da party recebeu runtime/instância separado");
  const applyStart=game.indexOf("function applyOnlineAuthorityState"),applyEnd=game.indexOf("\nfunction requestOnlineAuthorityTick",applyStart);
  must(client.includes("ACCOUNT_PARTY_ZONE_QUEUE")&&game.includes('key==="_authorityDescriptor"')&&
    !game.includes("G.combat._authorityDescriptor=descriptor")&&game.includes("G.huntEntryPendingToken")&&
    !game.slice(applyStart,applyEnd).includes("renderAll()")&&
    !game.slice(applyStart,applyEnd).includes("renderPartyPanel(")&&
    game.includes('if(typeof updateGridMovement==="function")updateGridMovement(G.combat,G.p,dt,Date.now())')&&
    partyUi.includes("function updatePartyPanelLiveBars")&&client.includes("data.holderId===ACCOUNT_LEASE_PAGE_HOLDER")&&
    game.includes("if(G.runtimeStarting||G.runtimeStarted)return"),
    "cliente não preserva movimento/membros ou ainda reconstrói UI a cada tick");
  console.log("OK: Cobra online salva instância e transita party sem HTTP 400/ciclo JSON.");
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{if(child)child.kill("SIGTERM");fs.rmSync(dataDir,{recursive:true,force:true});});
