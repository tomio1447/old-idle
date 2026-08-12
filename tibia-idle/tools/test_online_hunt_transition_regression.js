/* Regressão: Cobra online não gera snapshot circular nem transição party 400. */
"use strict";
const fs=require("fs"),os=require("os"),path=require("path"),{spawn}=require("child_process");
const root=path.join(__dirname,".."),serverDir=path.join(root,"server"),dataDir=fs.mkdtempSync(path.join(os.tmpdir(),"cobra-online-"));
const client=fs.readFileSync(path.join(root,"game","js","account-client.js"),"utf8"),game=fs.readFileSync(path.join(root,"game","js","game.js"),"utf8");
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
(async()=>{await start();const login=await post("/api/login",{login:"2",password:"2"}),token=login.data.token;
  const a=(await post("/api/characters",{token,name:"Cobra EK",voc:"knight",data:JSON.stringify({name:"Cobra EK",voc:"knight"})})).data.character;
  const b=(await post("/api/characters",{token,name:"Cobra MS",voc:"sorcerer",data:JSON.stringify({name:"Cobra MS",voc:"sorcerer"})})).data.character;
  await post("/api/party/create",{token,char_id:a.id});for(const c of [a,b])await post("/api/party/zone",{token,char_id:c.id,zone:"city"});
  const invite=await post("/api/party/invite",{token,char_id:a.id,invitee_name:b.name});await post("/api/party/accept",{token,invite_id:invite.data.invite.id});
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
  const snapshot=descriptor([a,b]);snapshot.state.players=[null,snapshot.state.players[1]];
  r=await put("/api/instance",Object.assign({token,instance_id:null,expected_version:0,state:snapshot},lease));
  must(r.status===200,"snapshot Cobra recuperável retornou "+r.status+": "+JSON.stringify(r.data));
  must(client.includes("ACCOUNT_PARTY_ZONE_QUEUE")&&game.includes('key==="_authorityDescriptor"')&&
    !game.includes("G.combat._authorityDescriptor=descriptor")&&game.includes("G.huntEntryPendingToken"),
    "cliente não serializa zona/remove ciclo/protege entrada OTBM");
  console.log("OK: Cobra online salva instância e transita party sem HTTP 400/ciclo JSON.");
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{if(child)child.kill("SIGTERM");fs.rmSync(dataDir,{recursive:true,force:true});});
