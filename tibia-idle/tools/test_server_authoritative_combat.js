/* Fase 7: combate/recompensas/progressão decididos exclusivamente no servidor. */
"use strict";
const fs=require("fs"),os=require("os"),path=require("path");
const {spawn}=require("child_process");
const engine=require("../server/authoritative_engine");
const root=path.join(__dirname,".."),serverDir=path.join(root,"server");
const serverSource=fs.readFileSync(path.join(serverDir,"server.js"),"utf8");
const gameSource=fs.readFileSync(path.join(root,"game","js","game.js"),"utf8");
const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),"global-idle-authority-"));
const port=39200+(process.pid%500),base=`http://127.0.0.1:${port}`;
let child=null,logs="";
function must(ok,msg){if(!ok)throw Error(msg);}
async function request(route,options){const response=await fetch(base+route,options),text=await response.text();let data;
  try{data=JSON.parse(text);}catch(e){data=text;}return {status:response.status,data};}
async function post(route,body){return request(route,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});}
async function put(route,body){return request(route,{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify(body)});}
async function start(){child=spawn(process.execPath,["server.js"],{cwd:serverDir,env:Object.assign({},process.env,{
  PORT:String(port),HOST:"127.0.0.1",MYSQL_HOST:"",TEST_SERVER:"0",LEASE_TTL_MS:"10000",
  INSTANCE_WORKER_INTERVAL_MS:"100",INSTANCE_WORKER_MAX_STEP_MS:"1000",GLOBAL_IDLE_DATA_DIR:dataDir,
}),stdio:["ignore","pipe","pipe"]});child.stdout.on("data",(c)=>{logs+=c;});child.stderr.on("data",(c)=>{logs+=c;});
  for(let i=0;i<100;i++){try{const r=await request("/api/health");if(r.data.ok)return;}catch(e){}
    await new Promise((resolve)=>setTimeout(resolve,35));}throw Error("servidor não iniciou: "+logs);}
async function stop(){if(!child)return;const proc=child;child=null;await new Promise((resolve)=>{
  proc.once("exit",resolve);proc.kill("SIGTERM");setTimeout(resolve,1000).unref();});}
function descriptor(c,overrides){const p=Object.assign({id:String(c.id),name:c.name,voc:c.voc,level:999,exp:999999999,
  hp:999999,mp:999999,gold:999999,skills:{sword:200,axe:200,club:200,dist:200,fist:200,shield:200},equip:{}},overrides||{});
  return {v:1,savedAt:Date.now(),kind:"hunt",huntId:"rats",instanceMode:"non-pvp",activeCharacterId:String(c.id),
    members:[{id:String(c.id),p}],state:{players:[{id:String(c.id),p}],mobs:[{id:"rat-one",slug:"rat",hp:999999,maxHp:999999}],events:[]}};}
function directDescriptor(p,kind){const member={id:String(p.id),p:JSON.parse(JSON.stringify(p))};return {v:1,savedAt:1000,
  kind:kind||"hunt",huntId:kind==="boss"?null:"rats",bossId:kind==="boss"?"test-boss":null,
  instanceMode:p.instanceMode||"non-pvp",activeCharacterId:String(p.id),members:[member],
  state:{players:[{id:String(p.id),p:member.p}],mobs:[{id:"direct-mob",slug:p.mobSlug||"rat",boss:kind==="boss"}],events:[]}};}

(async()=>{
  must(serverSource.includes('url==="/api/instance/tick"')&&serverSource.includes("enforceAuthoritativeProgress")&&
    gameSource.includes("onlineAuthorityCombat()")&&gameSource.includes("requestOnlineAuthorityTick"),
    "rota antifraude ou cliente autoritativo ausentes");

  const basePlayer={id:1,name:"Deterministic",voc:"knight",level:20,exp:1000,hp:300,mp:50,gold:5000,
    skills:{sword:40,axe:10,club:10,dist:10,fist:10,shield:30},equip:{weapon:{item:"sword"}},supplies:{},lootPouch:{},kills:{},bosses:{}};
  const d1=engine.initializeAuthority(directDescriptor(basePlayer),"1".repeat(64),1000);
  const d2=engine.initializeAuthority(directDescriptor(basePlayer),"1".repeat(64),1000);
  const once=JSON.parse(engine.advanceAuthorityState(JSON.stringify(d1),10000,11000).state);
  let split=d2;for(let i=0;i<5;i++)split=JSON.parse(engine.advanceAuthorityState(JSON.stringify(split),2000,3000+i*2000).state);
  must(JSON.stringify(once.authority)===JSON.stringify(split.authority),
    "mesmo seed/tempo produz resultados diferentes entre worker e tick online");
  must(once.authority.players[0].p.skillTries.sword>0,"skills não progridem no núcleo autoritativo");
  const monster=engine.MONSTERS.rat;must(monster&&monster.hp===20,"engine não usa catálogo server-side de monstros");
  const pvp={exp:100000};must(engine.applyPvpLoss(pvp,"monster")===3000&&pvp.exp===97000,"morte PVP por monstro não perde 3%");
  pvp.exp=100000;must(engine.applyPvpLoss(pvp,"player-raid")===8000&&pvp.exp===92000,"raid de jogador não perde 8%");
  const poor=Object.assign({},basePlayer,{id:3,hp:1,gold:0,exp:12345,mobSlug:"goshnar-s-greed",blessed:true,lootPouch:{},kills:{},bosses:{}});
  const poorFight=engine.initializeAuthority(directDescriptor(poor),"3".repeat(64),1000);
  const poorDone=JSON.parse(engine.advanceAuthorityState(JSON.stringify(poorFight),2500,3500).state);
  must(poorDone.authority.ended&&poorDone.authority.terminalReason==="party-wipe"&&
    poorDone.authority.players[0].p.exp===12345&&!poorDone.authority.players[0].p.blessed,
    "morte normal perdeu XP, manteve bless ou não encerrou sem gold");
  const rich=Object.assign({},poor,{id:4,gold:10000,exp:12345,blessed:true,lootPouch:{},kills:{},bosses:{}});
  const richFight=engine.initializeAuthority(directDescriptor(rich),"4".repeat(64),1000);
  const richDone=JSON.parse(engine.advanceAuthorityState(JSON.stringify(richFight),2500,3500).state);
  must(!richDone.authority.ended&&richDone.authority.wipes>=1&&richDone.authority.players[0].p.gold<10000&&
    richDone.authority.players[0].p.blessed&&richDone.authority.players[0].p.exp===12345,
    "wipe com gold não comprou bless/retornou ou alterou XP normal");

  const greedPlayer=Object.assign({},basePlayer,{id:5,mobSlug:"goshnar-s-greed",bosses:{},lootPouch:{},kills:{}});
  const greedDesc=directDescriptor(greedPlayer,"boss");greedDesc.bossId="goshnar-s-greed";
  const greed=engine.initializeAuthority(greedDesc,"5".repeat(64),1000),greedBoss=greed.authority.mobs.find((m)=>m.boss),greedHp=greedBoss.hp;
  for(const mob of greed.authority.mobs)mob.damage=0;
  const greedImmune=JSON.parse(engine.advanceAuthorityState(JSON.stringify(greed),2000,3000).state);
  must(greedImmune.authority.greed.immune&&greedImmune.authority.mobs.find((m)=>m.boss).hp===greedHp&&
    greedImmune.authority.mobs.filter((m)=>!m.boss).length<=6,
    "Greed recebeu dano imune ou excedeu seis adds");
  greedImmune.authority.greed.immune=false;greedImmune.authority.greed.vulnerableUntil=greedImmune.authority.clock+40000;
  const beforeForty=JSON.parse(engine.advanceAuthorityState(JSON.stringify(greedImmune),39000,42000).state);
  must(!beforeForty.authority.greed.immune,"janela de Greed terminou antes de 40 segundos");
  const afterForty=JSON.parse(engine.advanceAuthorityState(JSON.stringify(beforeForty),1000,43000).state);
  must(afterForty.authority.greed.immune,"janela de Greed ultrapassou 40 segundos");

  const bossPlayer=Object.assign({},basePlayer,{id:2,mobSlug:"rat",bosses:{},lootPouch:{},kills:{}});
  const boss=engine.initializeAuthority(directDescriptor(bossPlayer,"boss"),"2".repeat(64),5000);
  const bossDone=JSON.parse(engine.advanceAuthorityState(JSON.stringify(boss),5000,10000).state);
  must(bossDone.authority.ended&&bossDone.authority.terminalReason==="boss-defeated"&&
    bossDone.authority.players[0].p.bosses["test-boss"].kills===1&&
    bossDone.authority.players[0].p.bosses["test-boss"].lastFight===5000,
    "boss, recompensa e cooldown não foram decididos pelo servidor");

  await start();
  await post("/api/register",{login:"authority",password:"x"});
  const login=await post("/api/login",{login:"authority",password:"x"}),token=login.data.token;
  const created=await post("/api/characters",{token,name:"Authority Hero",voc:"knight",
    data:JSON.stringify({name:"Authority Hero",voc:"knight",level:999,exp:999999999,hp:999999,mp:999999,gold:99999999,
      skills:{sword:200,axe:200,club:200,dist:200,fist:200,shield:200},equip:{weapon:{item:"magic-sword"}},supplies:{},lootPouch:{},kills:{},bosses:{}})});
  const c=created.data.character;
  const acquired=await post("/api/lease/acquire",{token,holder_id:"authorityholder"});
  const lease={holder_id:acquired.data.holderId,lease_token:acquired.data.leaseToken};
  let r=await put("/api/instance",Object.assign({token,expected_version:0,instance_id:null,state:descriptor(c)},lease));
  must(r.status===200,"instância autoritativa não foi criada");const id=r.data.instance.id;
  let loaded=await request("/api/instance",{headers:{authorization:"Bearer "+token}});
  let auth=loaded.data.instance.state.authority;
  must(auth&&auth.players[0].p.level===1&&auth.players[0].p.exp===0&&auth.mobs[0].maxHp===20&&
    auth.players[0].p.equip.weapon.item==="sword",
    "servidor aceitou level/XP/equip/HP de monstro fabricados pelo cliente");

  await new Promise((resolve)=>setTimeout(resolve,2800));
  r=await post("/api/instance/tick",Object.assign({token,expected_version:loaded.data.instance.version},lease));
  must(r.status===200&&r.data.elapsed>=2000&&r.data.characters.length===1,"tick online não atualizou instância/personagem");
  const authoritativeExp=r.data.characters[0].snapshot.exp,tickVersion=r.data.instance.version;
  must(authoritativeExp>0&&r.data.characters[0].snapshot.totalKills>0,"kill/XP não foram materializados no banco");
  const spam=await post("/api/instance/tick",Object.assign({token,expected_version:tickVersion},lease));
  must(spam.status===200&&spam.data.elapsed<50&&
    (!spam.data.characters.length||spam.data.characters[0].snapshot.exp===authoritativeExp),
    "spam de tick fabricou tempo/recompensas extras");
  loaded=await request("/api/instance",{headers:{authorization:"Bearer "+token}});
  const currentVersion=loaded.data.instance.version,currentAuthority=loaded.data.instance.state.authority;

  const forged=descriptor(c,{level:999,exp:999999999,gold:99999999});forged.authority=clone(currentAuthority);
  forged.authority.players[0].p.exp=999999999;forged.authority.players[0].p.gold=99999999;
  r=await put("/api/instance",Object.assign({token,instance_id:id,expected_version:currentVersion,state:forged},lease));
  must(r.status===200,"checkpoint visual legítimo foi recusado");
  loaded=await request("/api/instance",{headers:{authorization:"Bearer "+token}});
  must(loaded.data.instance.state.authority.players[0].p.exp===authoritativeExp&&
    loaded.data.instance.state.authority.players[0].p.gold<99999999,
    "PUT visual substituiu progressão autoritativa");

  const me=await request("/api/me",{headers:{authorization:"Bearer "+token}}),summary=me.data.characters[0];
  const forgedSave=Object.assign({token,expected_version:summary.saveVersion,level:999,
    data:JSON.stringify(Object.assign({},summary.snapshot,{level:999,exp:999999999,gold:99999999})),hp:999999,mp:999999,maxHp:999999,maxMp:999999},lease);
  r=await put("/api/characters/"+c.id,forgedSave);
  must(r.status===200&&r.data.character.snapshot.exp===authoritativeExp&&r.data.character.level<999,
    "save comum fabricou XP/level durante combate");

  await post("/api/lease/release",Object.assign({token},lease));
  await new Promise((resolve)=>setTimeout(resolve,2400));
  const workerState=await request("/api/instance",{headers:{authorization:"Bearer "+token}});
  const workerExp=workerState.data.instance.state.authority.players[0].p.exp;
  must(workerExp>=authoritativeExp&&workerState.data.instance.workerTotalMs>0,
    "worker não reutilizou o núcleo autoritativo sem browser");

  console.log("OK: Fase 7 — dano, XP, loot, morte, bless e cooldowns são autoritativos no servidor.");
})().catch((error)=>{console.error(error);process.exitCode=1;}).finally(async()=>{await stop();fs.rmSync(dataDir,{recursive:true,force:true});});
function clone(v){return JSON.parse(JSON.stringify(v));}
