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
  INSTANCE_WORKER_INTERVAL_MS:"100",INSTANCE_WORKER_MAX_STEP_MS:"1000",INSTANCE_WORKER_STARTUP_GRACE_MS:"0",GLOBAL_IDLE_DATA_DIR:dataDir,
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
    gameSource.includes("onlineAuthorityCombat()")&&gameSource.includes("requestOnlineAuthorityTick")&&
    gameSource.includes("bindServerStatusControls")&&gameSource.includes("reconnectOnlineRuntime")&&
    gameSource.includes("accountCheckServerHealth")&&serverSource.includes("bootId:SERVER_BOOT_ID"),
    "rota antifraude ou cliente autoritativo ausentes");

  const basePlayer={id:1,name:"Deterministic",voc:"knight",level:20,exp:1000,hp:300,mp:50,gold:5000,
    skills:{sword:40,axe:10,club:10,dist:10,fist:10,shield:30},equip:{weapon:{item:"sword"}},supplies:{},lootPouch:{},kills:{},bosses:{}};
  const pendingDesc=directDescriptor(basePlayer);pendingDesc.state.mobs=[];
  pendingDesc.state.pendingSpawns=[{mob:{id:"pending-rat",slug:"rat"},cx:8,cy:6,startedAt:1000}];
  const pendingAuth=engine.initializeAuthority(pendingDesc,"0".repeat(64),1000);
  must(pendingAuth.authority.mobs.length===0&&pendingAuth.authority.pendingSpawns.length===1&&
    pendingAuth.authority.spawnPool[0]==="rat"&&pendingAuth.authority.pendingSpawns[0].cx===8&&
    pendingAuth.state.events.some((event)=>event.t==="spawn-blink"),
    "pendingSpawns de HARD hunt nasceu sem o preview de teleporte");
  const pendingLive=JSON.parse(engine.advanceAuthorityState(JSON.stringify(pendingAuth),2200,3200).state);
  must(pendingLive.authority.mobs.length===1&&pendingLive.authority.mobs[0].cx===8&&
    pendingLive.state.events.filter((event)=>event.t==="spawn-blink").length>=1&&
    pendingLive.state.events.some((event)=>event.t==="spawn"),
    "teleporte 3x não concluiu o spawn autoritativo");
  const sinisterDesc=directDescriptor(Object.assign({},basePlayer,{dust:0,dustLimit:100,slivers:0}));
  sinisterDesc.state.fiendishChance=1;sinisterDesc.state.influencedChance=.001;
  const sinisterAuth=engine.initializeAuthority(sinisterDesc,"6".repeat(64),1000);
  must(sinisterAuth.authority.mobs[0].fiendish&&sinisterAuth.authority.mobs[0].sinisterStacks===15&&
    sinisterAuth.state.mobs[0].fiendish,"Fiendish autoritativo perdeu flags usadas pela poeira");
  sinisterAuth.authority.mobs[0].hp=1;sinisterAuth.authority.mobs[0].damage=0;
  const sinisterAfter=JSON.parse(engine.advanceAuthorityState(JSON.stringify(sinisterAuth),2000,3000).state);
  must(sinisterAfter.authority.players[0].p.dust>0&&sinisterAfter.authority.players[0].p.slivers>0&&
    sinisterAfter.state.events.some((event)=>event.t==="dust"&&Number.isFinite(event.ts)),
    "Fiendish autoritativo não concedeu Dust/Slivers ou quebrou o timestamp do tick");
  const emptyHard=directDescriptor(basePlayer);emptyHard.huntId="mota-extension";emptyHard.state.mobs=[];
  const hardAuth=engine.initializeAuthority(emptyHard,"8".repeat(64),1000);
  must(hardAuth.authority.spawnPool.includes("floating-savant")&&hardAuth.authority.spawnPool.includes("fury"),
    "catálogo server-side não recupera MOTA sem pendingSpawns");
  const legacy=engine.initializeAuthority(directDescriptor(basePlayer),"9".repeat(64),1000);
  legacy.authority.v=1;legacy.authority.players[0].p.hp=1;legacy.authority.players[0].downUntil=999999;
  legacy.authority.mobs=[];legacy.authority.spawnPool=[];legacy.state.mobs=[];
  legacy.state.pendingSpawns=[{mob:{id:"legacy-rat",slug:"rat"},cx:9,cy:7,startedAt:1000}];
  const migrated=JSON.parse(engine.advanceAuthorityState(JSON.stringify(legacy),1000,2000).state);
  must(migrated.authority.spawnPool[0]==="rat"&&
    ((migrated.authority.pendingSpawns&&migrated.authority.pendingSpawns.length)||migrated.authority.mobs.length>0)&&
    migrated.authority.v===2&&migrated.authority.players[0].p.hp===engine.maxStats(migrated.authority.players[0].p).hp&&
    migrated.authority.players[0].downUntil===0,
    "instância HARD antiga sem pool/posição/HP não foi autorrecuperada");
  const motaPlayers=["knight","paladin","druid","sorcerer","monk"].map((voc,index)=>({id:20+index,name:voc,voc,level:500,
    exp:engine.expForLevel(500),hp:999999,mp:999999,gold:10000000,
    config:{healAt:90,healSpellAt:90,attackMode:voc==="knight"?"box":"kiting"},
    skills:{sword:100,dist:100,fist:100,shield:100},
    ml:80,equip:voc==="knight"?{weapon:{item:"sword"}}:{weapon:{item:"bow"},shield:{item:"quiver"},ammo:{item:"sniper-arrow"}},
    supplies:{"ultimate-health-potion":100,"ultimate-mana-potion":100},lootPouch:{},kills:{},bosses:{}}));
  const mota=directDescriptor(motaPlayers[0]);mota.huntId="mota-extension";
  mota.members=motaPlayers.map((p)=>({id:String(p.id),p}));mota.activeCharacterId=String(motaPlayers[0].id);
  mota.state.players=motaPlayers.map((p,index)=>({id:String(p.id),p,cx:10+index,cy:10,x:(10.5+index)/30,y:10.5/30}));mota.state.mobs=[];
  const motaSlugs=["floating-savant","retching-horror","fury","hellhound","demon"];
  mota.state.pendingSpawns=Array.from({length:10},(_,i)=>({mob:{id:"mota-"+i,slug:motaSlugs[i%5]},cx:5+i*2,cy:5+(i%3),startedAt:1000}));
  const motaAuth=engine.initializeAuthority(mota,"7".repeat(64),1000);
  must(engine.partyExpBonusPct(motaAuth.authority.players)===102&&engine.partyExpShare(motaAuth.authority.players,100).each===40,
    "composição EK/RP/ED/MS/Monk não recebeu bônus compartilhado de 102%");
  const invalidLevels=JSON.parse(JSON.stringify(motaAuth.authority.players));invalidLevels[4].p.level=100;
  must(!engine.partyCanShareExp(invalidLevels)&&engine.partyExpBonusPct(invalidLevels)===0,
    "party fora da regra de 2/3 recebeu compartilhamento/bônus de vocações");
  const motaAfter=JSON.parse(engine.advanceAuthorityState(JSON.stringify(motaAuth),60000,61000).state);
  must(!motaAfter.authority.ended&&
    (motaAfter.authority.mobs.length>0||(motaAfter.authority.pendingSpawns||[]).length>0)&&
    motaAfter.authority.players.some((p)=>p.p.hp>0)&&
    motaAfter.authority.players[0].p.missions["mota-extension"].progress,
    "party MOTA não sobrevive/progride missões por 60s no motor autoritativo");
  const d1Descriptor=directDescriptor(basePlayer);
  Object.assign(d1Descriptor.state.mobs[0],{moving:true,tx:.9,ty:.9,stepT:1,stepDur:9999,nextStepAt:9999});
  const d1=engine.initializeAuthority(d1Descriptor,"1".repeat(64),1000);
  must(d1.state.mobs[0].moving===undefined&&d1.state.mobs[0].tx===undefined&&
    d1.state.mobs[0].stepT===undefined&&d1.state.mobs[0].nextStepAt===undefined,
    "snapshot autoritativo republicou passo visual antigo para reconnect/restart");
  const visualPayload={players:[{id:"1",x:.31,y:.62,cx:9,cy:18}],
    mobs:[{id:"direct-mob",x:.74,y:.42,cx:22,cy:12}]};
  const positioned=JSON.parse(engine.advanceAuthorityState(JSON.stringify(d1),0,1000,visualPayload).state);
  must(positioned.state.players[0].x===.31&&positioned.state.players[0].y===.62&&
    positioned.state.mobs[0].x===.74&&positioned.state.mobs[0].y===.42,
    "posição visual validada não foi materializada no snapshot autoritativo");
  const bounded=engine.normalizeVisualState({players:[{id:"bad",x:9,y:-1}].concat(
    Array.from({length:12},(_,i)=>({id:String(i+1),x:.1,y:.2}))),mobs:[]},positioned.authority);
  must(bounded.players.length===8&&!bounded.players.some((entry)=>entry.id==="bad"),
    "payload visual não foi limitado/validado");
  const targetDesc=directDescriptor(basePlayer),secondPlayer=Object.assign({},clone(basePlayer),{id:2,name:"Nearest"});
  targetDesc.members.push({id:"2",p:secondPlayer});targetDesc.state.players.push({id:"2",p:secondPlayer});
  const targetAuth=engine.initializeAuthority(targetDesc,"b".repeat(64),1000),targetMob=targetAuth.authority.mobs[0];
  targetMob.hp=targetMob.maxHp=999999;targetMob.damage=20;targetMob.attackAcc=targetMob.attackSpeed;
  targetMob.def=Object.assign({},targetMob.def,{skills:[]});
  for(const item of targetAuth.authority.players)item.attackAcc=-100000;
  const targetVisual={players:[{id:"1",x:.1,y:.1,cx:3,cy:3},{id:"2",x:.7,y:.4,cx:21,cy:12}],
    mobs:[{id:"direct-mob",x:.72,y:.42,cx:22,cy:12}]};
  const targetAfter=JSON.parse(engine.advanceAuthorityState(JSON.stringify(targetAuth),1000,2000,targetVisual).state);
  must(targetAfter.state.mobs[0].targetId==="2"&&
    targetAfter.state.events.some((event)=>event.t==="taken"&&event.targetId==="2"),
    "monstro não perseguiu/atacou a mesma vítima mais próxima");
  const swappedVisual={players:[{id:"1",x:.73,y:.42,cx:22,cy:12},{id:"2",x:.7,y:.4,cx:21,cy:12}],
    mobs:[{id:"direct-mob",x:.72,y:.42,cx:22,cy:12}]};
  const stickyAfter=JSON.parse(engine.advanceAuthorityState(JSON.stringify(targetAfter),1000,3000,swappedVisual).state);
  must(stickyAfter.state.mobs[0].targetId==="2"&&
    stickyAfter.state.events.some((event)=>event.t==="taken"&&event.targetId==="2"),
    "autoridade trocou aleatoriamente de vítima entre dois ataques");
  const spellPlayer=Object.assign({},basePlayer,{voc:"sorcerer",level:100,ml:80,equip:{},

    config:{spellAttack:true,combo:[{kind:"spell",id:"exori-flam",min:1}]}});
  const spellAuth=engine.initializeAuthority(directDescriptor(spellPlayer),"a".repeat(64),1000);
  const spellPositioned=JSON.parse(engine.advanceAuthorityState(JSON.stringify(spellAuth),0,1000,visualPayload).state);
  const spellAfter=JSON.parse(engine.advanceAuthorityState(JSON.stringify(spellPositioned),2000,3000,visualPayload).state),
    spellHit=spellAfter.state.events.find((event)=>event.t==="hit"&&event.spellId==="exori-flam");
  must(spellHit&&Number.isFinite(spellHit.x)&&Number.isFinite(spellHit.y)&&
    Number.isFinite(spellHit.sx)&&Number.isFinite(spellHit.sy)&&
    spellHit.projectile&&spellHit.missile==="fire"&&spellHit.fx==="fire-attack"&&
    spellAfter.state.events.some((event)=>event.t==="say"&&event.text==="exori flam"),
    "spell autoritativa perdeu alvo/origem, projectile, efeito ou fala compatíveis com o renderer");

  // Área oficial: Hell's Core é self-target e cobre a matriz CIRCLE5X5 ao
  // redor do caster. Monstro fora dela não pode entrar só por estar no array.
  const areaPlayer=Object.assign({},basePlayer,{id:6,voc:"sorcerer",level:500,ml:120,hp:999999,mp:999999,equip:{},
    config:{spellAttack:true,combo:[{kind:"spell",id:"exevo-gran-mas-flam",min:1}]}}),
    areaDesc=directDescriptor(areaPlayer);
  areaDesc.state.gridW=30;areaDesc.state.gridH=30;
  areaDesc.state.players[0]=Object.assign(areaDesc.state.players[0],{cx:10,cy:10,x:10.5/30,y:10.5/30});
  areaDesc.state.mobs=[
    {id:"area-near-1",slug:"behemoth",cx:11,cy:10,x:11.5/30,y:10.5/30},
    {id:"area-near-2",slug:"behemoth",cx:14,cy:10,x:14.5/30,y:10.5/30},
    {id:"area-far",slug:"behemoth",cx:20,cy:20,x:20.5/30,y:20.5/30},
  ];
  const areaAuth=engine.initializeAuthority(areaDesc,"c".repeat(64),1000);
  for(const mob of areaAuth.authority.mobs){mob.damage=0;mob.walkAcc=-1e9;mob.def=Object.assign({},mob.def,{skills:[]});}
  const areaAfter=JSON.parse(engine.advanceAuthorityState(JSON.stringify(areaAuth),2000,3000).state),
    areaHits=areaAfter.state.events.filter((event)=>event.t==="hit"&&event.spellId==="exevo-gran-mas-flam"),
    areaIds=new Set(areaHits.map((event)=>event.targetId)),areaFx=areaAfter.state.events.find((event)=>event.t==="areafx");
  must(areaIds.has("area-near-1")&&areaIds.has("area-near-2")&&!areaIds.has("area-far"),
    "spell autoritativa não respeitou os monstros dentro/fora da matriz de área: "+[...areaIds].join(",")+
    " events="+areaAfter.state.events.map((event)=>event.t+":"+(event.spellId||event.targetId||"")).join("|"));
  must(areaFx&&areaFx.cells.length>1&&areaFx.cells.some((cell)=>cell.cx===10&&cell.cy===10)&&
    areaFx.ts<=Math.min(...areaHits.map((event)=>event.ts))+20,
    "spell autoritativa não enviou a matriz visual junto do primeiro impacto");

  // Waves são direcionais e começam uma casa à frente do caster.
  const wavePlayer=Object.assign({},areaPlayer,{id:7,config:{spellAttack:true,
      combo:[{kind:"spell",id:"exevo-flam-hur",min:1}]}}),waveDesc=directDescriptor(wavePlayer);
  waveDesc.state.gridW=30;waveDesc.state.gridH=30;
  waveDesc.state.players[0]=Object.assign(waveDesc.state.players[0],{cx:10,cy:10,x:10.5/30,y:10.5/30});
  waveDesc.state.mobs=[
    {id:"wave-front",slug:"behemoth",cx:12,cy:10,x:12.5/30,y:10.5/30},
    {id:"wave-edge",slug:"behemoth",cx:13,cy:12,x:13.5/30,y:12.5/30},
    {id:"wave-behind",slug:"behemoth",cx:6,cy:10,x:6.5/30,y:10.5/30},
  ];
  const waveAuth=engine.initializeAuthority(waveDesc,"d".repeat(64),1000);
  waveAuth.authority.players[0].walkAcc=-1e9;
  for(const mob of waveAuth.authority.mobs){mob.damage=0;mob.walkAcc=-1e9;mob.def=Object.assign({},mob.def,{skills:[]});}
  const waveAfter=JSON.parse(engine.advanceAuthorityState(JSON.stringify(waveAuth),2000,3000).state),
    waveHits=new Set(waveAfter.state.events.filter((event)=>event.spellId==="exevo-flam-hur"&&event.t==="hit")
      .map((event)=>event.targetId)),waveFx=waveAfter.state.events.find((event)=>event.t==="areafx");
  must(waveHits.has("wave-front")&&waveHits.has("wave-edge")&&!waveHits.has("wave-behind")&&
    waveFx&&waveFx.cells.every((cell)=>!(cell.cx===10&&cell.cy===10)),
    "wave autoritativa perdeu direção, largura ou origem à frente do caster");

  const visibleWave=JSON.parse(engine.advanceAuthorityState(JSON.stringify(d1),1000,2000).state);
  must(visibleWave.authority.mobs.length>0&&visibleWave.state.mobs.length>0,
    "snapshot entre waves removeu todos os monstros da arena");
  const d2=engine.initializeAuthority(directDescriptor(basePlayer),"1".repeat(64),1000);
  const once=JSON.parse(engine.advanceAuthorityState(JSON.stringify(d1),10000,11000).state);
  let split=d2;for(let i=0;i<5;i++)split=JSON.parse(engine.advanceAuthorityState(JSON.stringify(split),2000,3000+i*2000).state);
  must(JSON.stringify(once.authority)===JSON.stringify(split.authority),
    "mesmo seed/tempo produz resultados diferentes entre worker e tick online");
  must(once.authority.players[0].p.skillTries.sword>0||once.authority.players[0].p.manaSpent>0,
    "skills/ML não progridem no núcleo autoritativo");
  const monster=engine.MONSTERS.rat;must(monster&&monster.hp===20,"engine não usa catálogo server-side de monstros");
  const pvp={exp:100000};must(engine.applyPvpLoss(pvp,"monster")===3000&&pvp.exp===97000,"morte PVP por monstro não perde 3%");
  pvp.exp=100000;must(engine.applyPvpLoss(pvp,"player-raid")===8000&&pvp.exp===92000,"raid de jogador não perde 8%");
  const poorExp=engine.expForLevel(20)+345;
  const poor=Object.assign({},basePlayer,{id:3,hp:1,mp:0,gold:0,exp:poorExp,mobSlug:"goshnar-s-greed",blessed:true,
    lootPouch:{},kills:{},bosses:{},config:{healSpell:"none",spellAttack:false,noPotions:true}});
  const poorFight=engine.initializeAuthority(directDescriptor(poor),"3".repeat(64),1000);
  poorFight.authority.players[0].attackAcc=-1e9;
  const poorMob=poorFight.authority.mobs[0];
  poorMob.damage=Math.max(500,Number(poorMob.damage)||0);poorMob.attackAcc=Number(poorMob.attackSpeed)||2000;poorMob.walkAcc=-1e9;
  const poorDone=JSON.parse(engine.advanceAuthorityState(JSON.stringify(poorFight),1200,2200).state);
  must(poorDone.authority.ended&&poorDone.authority.terminalReason==="party-wipe"&&
    poorDone.authority.players[0].p.exp===poorExp&&!poorDone.authority.players[0].p.blessed,
    "morte normal perdeu XP, manteve bless ou não encerrou sem gold");
  const rich=Object.assign({},poor,{id:4,gold:10000,exp:poorExp,blessed:true,lootPouch:{},kills:{},bosses:{}});
  const richFight=engine.initializeAuthority(directDescriptor(rich),"4".repeat(64),1000);
  richFight.authority.players[0].attackAcc=-1e9;
  const richMob=richFight.authority.mobs[0];
  richMob.damage=Math.max(500,Number(richMob.damage)||0);richMob.attackAcc=Number(richMob.attackSpeed)||2000;richMob.walkAcc=-1e9;
  const richDone=JSON.parse(engine.advanceAuthorityState(JSON.stringify(richFight),1200,2200).state);
  must(!richDone.authority.ended&&richDone.authority.wipes>=1&&richDone.authority.players[0].p.gold<10000&&
    richDone.authority.players[0].p.blessed&&richDone.authority.players[0].p.exp===poorExp,
    "wipe com gold não comprou bless/retornou ou alterou XP normal");

  // Boss wipe: permadead + encerra instância (sem bless/retorno à sala).
  const bossWipePlayer=Object.assign({},basePlayer,{id:41,hp:1,mp:0,gold:100000,blessed:true,
    lootPouch:{},kills:{},bosses:{},config:{healSpell:"none",spellAttack:false,noPotions:true}});
  const bossWipeDesc=directDescriptor(bossWipePlayer,"boss");bossWipeDesc.bossId="goshnar-s-greed";
  const bossWipeFight=engine.initializeAuthority(bossWipeDesc,"a".repeat(64),1000);
  bossWipeFight.authority.players[0].attackAcc=-1e9;
  for(const mob of bossWipeFight.authority.mobs){
    mob.damage=Math.max(500,Number(mob.damage)||0);
    mob.attackAcc=Number(mob.attackSpeed)||2000;mob.walkAcc=-1e9;
  }
  const bossWipeDone=JSON.parse(engine.advanceAuthorityState(JSON.stringify(bossWipeFight),1200,2200).state);
  must(bossWipeDone.authority.ended&&bossWipeDone.authority.terminalReason==="party-wipe"&&
    bossWipeDone.authority.players[0].permadead&&bossWipeDone.authority.wipes===0&&
    bossWipeDone.authority.players[0].p.gold===100000&&
    bossWipeDone.state&&bossWipeDone.state.players[0].permadead&&!bossWipeDone.state.dead,
    "wipe de boss não encerrou com permadead / ainda comprou bless ou marcou dead+timer");

  const greedPlayer=Object.assign({},basePlayer,{id:5,mobSlug:"goshnar-s-greed",bosses:{},lootPouch:{},kills:{}});
  const greedDesc=directDescriptor(greedPlayer,"boss");greedDesc.bossId="goshnar-s-greed";
  const greed=engine.initializeAuthority(greedDesc,"5".repeat(64),1000),greedBoss=greed.authority.mobs.find((m)=>m.boss),greedHp=greedBoss.hp;
  for(const mob of greed.authority.mobs)mob.damage=0;
  const greedImmune=JSON.parse(engine.advanceAuthorityState(JSON.stringify(greed),2000,3000).state);
  must(greedImmune.authority.greed.immune&&greedImmune.authority.mobs.find((m)=>m.boss).hp===greedHp&&
    greedImmune.authority.mobs.filter((m)=>!m.boss).length<=6,
    "Greed recebeu dano imune ou excedeu seis adds");
  greedImmune.authority.ended=false;greedImmune.authority.terminalReason=null;
  greedImmune.authority.greed.immune=false;greedImmune.authority.greed.vulnerableUntil=greedImmune.authority.clock+40000;
  // Isole o relógio da mecânica: spells/skills autoritativas novas não devem
  // matar o boss ou a party antes de completar a janela que este teste mede.
  const durableGreed=greedImmune.authority.mobs.find((mob)=>mob.boss);
  durableGreed.hp=durableGreed.maxHp=Number.MAX_SAFE_INTEGER;
  for(const mob of greedImmune.authority.mobs){mob.damage=0;mob.attackSpeed=Number.MAX_SAFE_INTEGER;
    mob.def=Object.assign({},mob.def,{skills:[]});}
  for(const item of greedImmune.authority.players){
    item.p.conditions={};item.p.hp=engine.maxStats(item.p).hp;item.p.mp=engine.maxStats(item.p).mp;
    item.p.gold=1000000;item.downUntil=0;item.permadead=false;item.deathPos=null;item.downedAt=0;
  }
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

  const potionPlayer=Object.assign({},basePlayer,{id:8,level:100,hp:80,mp:0,supplies:{"health-potion":5},lootPouch:{},
    config:{healAt:90,healSupply:"health-potion",spellAttack:false}});
  const potionAuth=engine.initializeAuthority(directDescriptor(potionPlayer),"f".repeat(64),1000);
  const potionMax=engine.maxStats(potionAuth.authority.players[0].p);
  potionAuth.authority.players[0].p.hp=Math.floor(potionMax.hp*.85);
  potionAuth.authority.players[0].p.mp=0;
  potionAuth.authority.mobs[0].damage=0;potionAuth.authority.mobs[0].hp=potionAuth.authority.mobs[0].maxHp=999999;
  potionAuth.authority.mobs[0].def=Object.assign({},potionAuth.authority.mobs[0].def,{skills:[]});
  const potionBefore=potionAuth.authority.players[0].p.hp;
  const potionAfter=JSON.parse(engine.advanceAuthorityState(JSON.stringify(potionAuth),1000,2000).state);
  const potionHp=potionAfter.authority.players[0].p.hp,potionLeft=potionAfter.authority.players[0].p.supplies["health-potion"];
  must(potionLeft===4&&potionHp>=potionBefore+125&&potionHp<=potionBefore+175&&potionHp<=potionMax.hp,
    "healAt=90 não usou poção real (hp "+potionBefore+"->"+potionHp+", left="+potionLeft+", max="+potionMax.hp+")");

  const recycleDesc=directDescriptor(basePlayer);recycleDesc.state.mobs=[{id:"rat-keep",slug:"rat",hp:1,maxHp:20}];
  const recycleAuth=engine.initializeAuthority(recycleDesc,"e".repeat(64),1000);
  must(Array.isArray(recycleAuth.authority.spawnIds)&&recycleAuth.authority.spawnIds.includes("rat-keep"),
    "primeira wave não registrou IDs recicláveis");
  recycleAuth.authority.mobs[0].hp=0;recycleAuth.authority.players[0].attackAcc=-100000;
  // ~2s pós-wave até pendingSpawns/blink; +~2s do teleporte Canary até mob vivo.
  const recycled=JSON.parse(engine.advanceAuthorityState(JSON.stringify(recycleAuth),2500,3500).state);
  must(recycled.authority.spawnIds.includes("rat-keep")&&
    ((recycled.authority.pendingSpawns||[]).some((sp)=>String(sp.mob&&sp.mob.id)==="rat-keep")||
      recycled.state.events.some((event)=>event.t==="spawn-blink")||
      (recycled.authority.mobs||[]).some((m)=>String(m.id)==="rat-keep")),
    "respawn não reciclou o slot visual / não emitiu spawn-blink");
  const recycledLive=JSON.parse(engine.advanceAuthorityState(JSON.stringify(recycled),2500,6000).state);
  must(recycledLive.authority.mobs.some((m)=>String(m.id)==="rat-keep"&&m.hp>0)&&
    recycledLive.state.mobs.some((m)=>String(m.id)==="rat-keep"),
    "respawn mintou ID novo em vez de reciclar o slot visual");

  const packWaveDesc=directDescriptor(basePlayer);
  packWaveDesc.state.mobs=[{id:"wave-a",slug:"rat",hp:40,maxHp:40},{id:"wave-b",slug:"rat",hp:40,maxHp:40},
    {id:"wave-c",slug:"rat",hp:40,maxHp:40}];
  const packWaveAuth=engine.initializeAuthority(packWaveDesc,"1a".repeat(32),1000);
  packWaveAuth.authority.pack=3;packWaveAuth.authority.wave=1;
  for(const mob of packWaveAuth.authority.mobs){mob.damage=0;mob.def=Object.assign({},mob.def,{skills:[],defSkills:[]});}
  packWaveAuth.authority.mobs[0].hp=0;packWaveAuth.authority.players[0].attackAcc=-100000;
  const packWaveMid=JSON.parse(engine.advanceAuthorityState(JSON.stringify(packWaveAuth),1000,2000).state);
  const packWaveAlive=packWaveMid.authority.mobs.filter((m)=>m.hp>0);
  must(packWaveAlive.length===2&&packWaveMid.authority.wave===1,
    "servidor reencheu a onda no meio: vivos="+packWaveAlive.length+" wave="+packWaveMid.authority.wave);
  for(const mob of packWaveMid.authority.mobs)mob.hp=0;
  packWaveMid.authority.players[0].attackAcc=-100000;
  // 4s de espera pós-wave + blink Canary ~2s antes dos mobs vivos.
  const packWaveNext=JSON.parse(engine.advanceAuthorityState(JSON.stringify(packWaveMid),7000,10000).state);
  must(packWaveNext.authority.mobs.filter((m)=>m.hp>0).length>=3&&packWaveNext.authority.wave===2,
    "próxima onda não nasceu depois de limpar o pack: vivos="+
    packWaveNext.authority.mobs.filter((m)=>m.hp>0).length+" wave="+packWaveNext.authority.wave);
  must(packWaveNext.state.events.some((event)=>event.t==="spawn"||event.t==="spawn-blink"),
    "onda nova não emitiu spawn/spawn-blink");

  const prioPlayer=Object.assign({},basePlayer,{id:9,voc:"sorcerer",level:500,ml:120,hp:999999,mp:999999,equip:{},
    config:{spellAttack:true,combo:[{kind:"spell",id:"exori-flam",min:1},{kind:"spell",id:"exevo-gran-mas-flam",min:2}]}});
  const prioDesc=directDescriptor(prioPlayer);prioDesc.state.gridW=30;prioDesc.state.gridH=30;
  prioDesc.state.players[0]=Object.assign(prioDesc.state.players[0],{cx:10,cy:10,x:10.5/30,y:10.5/30});
  prioDesc.state.mobs=[{id:"prio-a",slug:"behemoth",cx:11,cy:10,x:11.5/30,y:10.5/30},
    {id:"prio-b",slug:"behemoth",cx:12,cy:10,x:12.5/30,y:10.5/30}];
  const prioAuth=engine.initializeAuthority(prioDesc,"11".repeat(32),1000);
  for(const mob of prioAuth.authority.mobs){mob.damage=0;mob.def=Object.assign({},mob.def,{skills:[],defSkills:[]});}
  const prioAfter=JSON.parse(engine.advanceAuthorityState(JSON.stringify(prioAuth),2000,3000).state);
  const prioHits=prioAfter.state.events.filter((event)=>event.t==="hit");
  must(prioHits.length>=2&&prioHits.every((event)=>event.spellId==="exevo-gran-mas-flam"),
    "combo autoritativo não usou a área 2+ na frente do strike único: "+
    prioHits.map((event)=>event.spellId).join(","));

  const skillDesc=directDescriptor(basePlayer);
  const skillAuth=engine.initializeAuthority(skillDesc,"12".repeat(32),1000);
  const skillMob=skillAuth.authority.mobs[0];
  skillMob.damage=0;skillMob.attackSpeed=1000;skillMob.attackAcc=1000;
  skillMob.def=Object.assign({},skillMob.def,{skills:[{el:"fire",min:10,max:10,int:5000,ch:100,range:7}],defSkills:[]});
  skillAuth.authority.players[0].attackAcc=-100000;
  skillAuth.authority.players[0].p.hp=engine.maxStats(skillAuth.authority.players[0].p).hp;
  const skillOnce=JSON.parse(engine.advanceAuthorityState(JSON.stringify(skillAuth),1000,2000).state);
  const fireOnce=skillOnce.state.events.filter((event)=>event.t==="taken"&&event.el==="fire").length;
  const skillTwice=JSON.parse(engine.advanceAuthorityState(JSON.stringify(skillOnce),1000,3000).state);
  const fireTwice=skillTwice.state.events.filter((event)=>event.t==="taken"&&event.el==="fire").length;
  must(fireOnce===1&&fireTwice===0,
    "monster spell ignorou interval Canary (int=5000): "+fireOnce+" depois "+fireTwice);

  must(engine.applyResist(100,{def:{imune:["fire"]}},"fire")===0,"imunidade Canary não zerou o golpe");
  must(engine.applyResist(100,{def:{resist:{fire:50}}},"fire")===50,"resist % Canary divergiu");
  must(engine.applyResist(12,{def:{resist:{physical:80}}},"agony")>=12,"agony não é true damage");
  must(engine.applyMonsterMitigation({def:{mitigation:50}},"physical",100)===50,"mitigation da criatura não aplicou");
  must(engine.applyMonsterMitigation({def:{mitigation:50}},"agony",100)===100,"mitigation não pode reduzir agony");

  const sword=engine.ITEMS.sword||{};const swordPrev={el:sword.el,elDmg:sword.elDmg};
  sword.el="ice";sword.elDmg=44;
  const dualPlayer=Object.assign({},basePlayer,{id:11,config:{spellAttack:false},equip:{weapon:{item:"sword"}}});
  const dualDesc=directDescriptor(dualPlayer);
  const dualAuth=engine.initializeAuthority(dualDesc,"13".repeat(32),1000);
  dualAuth.authority.mobs[0].hp=dualAuth.authority.mobs[0].maxHp=999999;
  dualAuth.authority.mobs[0].damage=0;dualAuth.authority.mobs[0].def=Object.assign({},dualAuth.authority.mobs[0].def,{skills:[],defSkills:[]});
  dualAuth.authority.players[0].attackAcc=1200;
  const dualAfter=JSON.parse(engine.advanceAuthorityState(JSON.stringify(dualAuth),1000,2000).state);
  const dualHits=dualAfter.state.events.filter((event)=>event.t==="hit"&&event.dual===1);
  const physHits=dualAfter.state.events.filter((event)=>event.t==="hit"&&event.el==="physical"&&!event.dual);
  sword.el=swordPrev.el;sword.elDmg=swordPrev.elDmg;
  must(dualHits.length>=1&&physHits.length>=1&&dualHits[0].el==="ice",
    "arma elemental não emitiu dual físico+elemento: "+JSON.stringify(dualAfter.state.events.filter((e)=>e.t==="hit").map((e)=>({el:e.el,dual:e.dual,fx:e.fx}))));
  must(dualHits[0].fx==="ice-attack","dual elemental da arma não carregou fx de gelo: "+dualHits[0].fx);

  const firePlayer=Object.assign({},basePlayer,{id:21,config:{spellAttack:false},equip:{weapon:{item:"sword"}},
    imbuements:{"equip:weapon":[{key:"Scorch",tier:3}]}});
  const fireDesc=directDescriptor(firePlayer);
  const fireAuth=engine.initializeAuthority(fireDesc,"21".repeat(32),1000);
  fireAuth.authority.mobs[0].hp=fireAuth.authority.mobs[0].maxHp=999999;
  fireAuth.authority.mobs[0].damage=0;fireAuth.authority.mobs[0].def=Object.assign({},fireAuth.authority.mobs[0].def,{skills:[],defSkills:[]});
  fireAuth.authority.players[0].attackAcc=1200;
  const fireAfter=JSON.parse(engine.advanceAuthorityState(JSON.stringify(fireAuth),1000,2000).state);
  const fireDual=fireAfter.state.events.filter((event)=>event.t==="hit"&&event.dual===1);
  must(fireDual.length>=1&&fireDual[0].el==="fire"&&fireDual[0].fx==="hit-by-fire",
    "imbuement Scorch não emitiu hit fire+fx: "+JSON.stringify(fireAfter.state.events.filter((e)=>e.t==="hit").map((e)=>({el:e.el,dual:e.dual,fx:e.fx}))));

  const condPlayer=Object.assign({},basePlayer,{id:12,config:{spellAttack:false}});
  const condDesc=directDescriptor(condPlayer);
  const condAuth=engine.initializeAuthority(condDesc,"14".repeat(32),1000);
  condAuth.authority.mobs[0].damage=0;condAuth.authority.mobs[0].def=Object.assign({},condAuth.authority.mobs[0].def,{skills:[],defSkills:[]});
  condAuth.authority.players[0].attackAcc=-100000;
  condAuth.authority.players[0].p.hp=engine.maxStats(condAuth.authority.players[0].p).hp;
  condAuth.authority.players[0].p.conditions={freezing:{dmg:10,turns:2,acc:0},cursed:{dmg:7,turns:2,acc:0}};
  const condTick1=JSON.parse(engine.advanceAuthorityState(JSON.stringify(condAuth),1000,2000).state);
  const freeze1=condTick1.state.events.filter((event)=>event.condition==="freezing"||(event.t==="taken"&&event.el==="ice")).length;
  const condTick2=JSON.parse(engine.advanceAuthorityState(JSON.stringify(condTick1),1000,3000).state);
  const freeze2=condTick2.state.events.filter((event)=>event.condition==="freezing"||(event.t==="taken"&&event.el==="ice"));
  const cursed2=condTick2.state.events.filter((event)=>event.condition==="cursed"||(event.t==="taken"&&event.el==="death"));
  must(freeze1===0&&freeze2.length>=1&&cursed2.length>=1,
    "conditions Canary não tickaram em 2s (freezing/cursed): t1="+freeze1+" t2freeze="+freeze2.length+" t2cursed="+cursed2.length);

  const meleeCondPlayer=Object.assign({},basePlayer,{id:13,config:{spellAttack:false}});
  const meleeDesc=directDescriptor(meleeCondPlayer);
  const meleeAuth=engine.initializeAuthority(meleeDesc,"15".repeat(32),1000);
  meleeAuth.authority.players[0].attackAcc=-100000;
  meleeAuth.authority.players[0].p.hp=engine.maxStats(meleeAuth.authority.players[0].p).hp;
  meleeAuth.authority.mobs[0].damage=20;meleeAuth.authority.mobs[0].attackSpeed=1000;meleeAuth.authority.mobs[0].attackAcc=1000;
  meleeAuth.authority.mobs[0].def=Object.assign({},meleeAuth.authority.mobs[0].def,{skills:[],defSkills:[],meleeCond:{tipo:"poison",dano:5}});
  const meleeAfter=JSON.parse(engine.advanceAuthorityState(JSON.stringify(meleeAuth),1000,2000).state);
  must(meleeAfter.authority.players[0].p.conditions&&meleeAfter.authority.players[0].p.conditions.poison,
    "meleeCond Canary não aplicou poison");
  must(meleeAfter.state.events.some((event)=>event.t==="player-condition"&&event.tipo==="poison"),
    "meleeCond não emitiu player-condition");
  must(meleeAfter.state.events.some((event)=>event.t==="taken"&&event.fx),
    "melee taken ficou sem effect/fx");

  const origExoriCond=engine.ALL_SPELLS.exori&&engine.ALL_SPELLS.exori.cond;
  if(engine.ALL_SPELLS.exori)engine.ALL_SPELLS.exori.cond={tipo:"bleed",dano:4,golpes:3};
  const spellCondPlayer=Object.assign({},basePlayer,{id:14,level:500,hp:999999,mp:999999,
    config:{spellAttack:true,combo:[{kind:"spell",id:"exori",min:1}]}});
  const spellCondDesc=directDescriptor(spellCondPlayer);
  const spellCondAuth=engine.initializeAuthority(spellCondDesc,"16".repeat(32),1000);
  spellCondAuth.authority.mobs[0].hp=spellCondAuth.authority.mobs[0].maxHp=999999;
  spellCondAuth.authority.mobs[0].damage=0;spellCondAuth.authority.mobs[0].def=Object.assign({},spellCondAuth.authority.mobs[0].def,{skills:[],defSkills:[]});
  spellCondAuth.authority.players[0].attackAcc=1200;
  const spellCondAfter=JSON.parse(engine.advanceAuthorityState(JSON.stringify(spellCondAuth),1000,2000).state);
  if(engine.ALL_SPELLS.exori)engine.ALL_SPELLS.exori.cond=origExoriCond;
  must(spellCondAfter.authority.mobs[0].conditions&&spellCondAfter.authority.mobs[0].conditions.bleed,
    "spell.cond Canary não aplicou bleed no alvo");

  const fxDesc=directDescriptor(basePlayer);
  const fxAuth=engine.initializeAuthority(fxDesc,"17".repeat(32),1000);
  const fxMob=fxAuth.authority.mobs[0];
  fxMob.damage=0;fxMob.attackSpeed=1000;fxMob.attackAcc=1000;
  fxMob.def=Object.assign({},fxMob.def,{skills:[{el:"energy",min:8,max:8,int:5000,ch:100,range:7,miss:"energy"}],defSkills:[]});
  fxAuth.authority.players[0].attackAcc=-100000;
  const fxAfter=JSON.parse(engine.advanceAuthorityState(JSON.stringify(fxAuth),1000,2000).state);
  must(fxAfter.state.events.some((event)=>event.t==="effect"&&event.fx),
    "skill single-target não emitiu effect/missile");
  must(fxAfter.state.events.some((event)=>event.t==="taken"&&event.el==="energy"&&event.fx),
    "taken da skill ficou sem fx de elemento");

  const leechPlayer=Object.assign({},basePlayer,{id:15,hp:50,config:{spellAttack:false},
    imbuements:{"equip:weapon":[{key:"Vampirism",tier:3}]},equip:{weapon:{item:"sword"}}});
  const leechDesc=directDescriptor(leechPlayer);
  const leechAuth=engine.initializeAuthority(leechDesc,"18".repeat(32),1000);
  leechAuth.authority.mobs[0].hp=leechAuth.authority.mobs[0].maxHp=999999;
  leechAuth.authority.mobs[0].damage=0;leechAuth.authority.mobs[0].def=Object.assign({},leechAuth.authority.mobs[0].def,{skills:[],defSkills:[]});
  leechAuth.authority.players[0].p.hp=50;leechAuth.authority.players[0].attackAcc=1200;
  const leechAfter=JSON.parse(engine.advanceAuthorityState(JSON.stringify(leechAuth),1000,2000).state);
  must(leechAfter.authority.players[0].p.hp>50,"Vampirism autoritativo não aplicou life leech");

  const splitA=Object.assign({},basePlayer,{id:31,config:{spellAttack:false}});
  const splitB=Object.assign({},basePlayer,{id:32,config:{spellAttack:false}});
  const splitDesc=directDescriptor(splitA);
  splitDesc.members=[{id:"31",p:JSON.parse(JSON.stringify(splitA))},{id:"32",p:JSON.parse(JSON.stringify(splitB))}];
  splitDesc.state.gridW=30;splitDesc.state.gridH=30;
  splitDesc.state.players=[
    {id:"31",p:splitDesc.members[0].p,cx:8,cy:10,x:8.5/30,y:10.5/30},
    {id:"32",p:splitDesc.members[1].p,cx:20,cy:10,x:20.5/30,y:10.5/30}];
  splitDesc.state.mobs=[
    {id:"near-a",slug:"rat",cx:9,cy:10,x:9.5/30,y:10.5/30},
    {id:"near-b",slug:"rat",cx:21,cy:10,x:21.5/30,y:10.5/30}];
  const splitAuth=engine.initializeAuthority(splitDesc,"31".repeat(32),1000);
  for(const item of splitAuth.authority.players)item.attackAcc=2000;
  for(const mob of splitAuth.authority.mobs){
    mob.hp=mob.maxHp=999999;mob.damage=0;mob.attackAcc=-1e9;
    mob.def=Object.assign({},mob.def,{skills:[],defSkills:[]});
  }
  const splitAfter=JSON.parse(engine.advanceAuthorityState(JSON.stringify(splitAuth),200,1200).state);
  const splitHits=splitAfter.state.events.filter((event)=>event.t==="hit");
  const hitA=splitHits.find((event)=>String(event.whoId)==="31");
  const hitB=splitHits.find((event)=>String(event.whoId)==="32");
  must(hitA&&String(hitA.targetId)==="near-a"&&hitB&&String(hitB.targetId)==="near-b",
    "party não escolheu alvos independentes: "+JSON.stringify(splitHits.map((e)=>({who:e.whoId,tgt:e.targetId}))));

  const chaseDesc=directDescriptor(basePlayer);
  chaseDesc.state.gridW=30;chaseDesc.state.gridH=30;
  chaseDesc.state.players[0]=Object.assign(chaseDesc.state.players[0],{cx:10,cy:10,x:10.5/30,y:10.5/30});
  chaseDesc.state.mobs=[{id:"far-rat",slug:"rat",cx:18,cy:10,x:18.5/30,y:10.5/30}];
  const chaseAuth=engine.initializeAuthority(chaseDesc,"32".repeat(32),1000);
  chaseAuth.authority.players[0].attackAcc=-1e9;
  const chaseMob=chaseAuth.authority.mobs[0];
  chaseMob.damage=20;chaseMob.attackSpeed=200;chaseMob.attackAcc=0;
  const chaseVisual={players:[{id:String(basePlayer.id),x:10.5/30,y:10.5/30,cx:10,cy:10}],
    mobs:[{id:String(chaseMob.id),x:18.5/30,y:10.5/30,cx:18,cy:10}]};
  const chaseAfter=JSON.parse(engine.advanceAuthorityState(JSON.stringify(chaseAuth),2000,3000,chaseVisual).state);
  const chased=chaseAfter.authority.mobs[0];
  must(Number(chased.cx)<18,
    "monstro não perseguiu com visual_state ativo: cx="+chased.cx);

  const pinPlayer=Object.assign({},basePlayer,{id:41,config:{spellAttack:false}});
  const pinDesc=directDescriptor(pinPlayer);
  pinDesc.state.gridW=30;pinDesc.state.gridH=30;
  const pinAuth=engine.initializeAuthority(pinDesc,"41".repeat(32),1000);
  pinAuth.authority.players[0].attackAcc=2000;pinAuth.authority.players[0].walkAcc=-1e9;
  pinAuth.authority.mobs[0].hp=pinAuth.authority.mobs[0].maxHp=999999;
  pinAuth.authority.mobs[0].damage=0;pinAuth.authority.mobs[0].walkAcc=-1e9;
  pinAuth.authority.mobs[0].def=Object.assign({},pinAuth.authority.mobs[0].def,{skills:[],defSkills:[]});
  const pinId=String(pinAuth.authority.mobs[0].id);
  const pinAfter=JSON.parse(engine.advanceAuthorityState(JSON.stringify(pinAuth),200,1200,{
    players:[{id:String(pinPlayer.id),x:.28,y:.64,cx:8,cy:19}],
    mobs:[{id:pinId,x:.71,y:.39,cx:21,cy:11}]}).state);
  const pinHit=pinAfter.state.events.find((event)=>event.t==="hit");
  must(pinHit&&pinHit.x===.71&&pinHit.y===.39&&pinHit.sx===.28&&pinHit.sy===.64,
    "visual_state de um step não alinhou o hit: "+JSON.stringify(pinHit&&{x:pinHit.x,y:pinHit.y,sx:pinHit.sx,sy:pinHit.sy}));

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
  let auth=loaded.data.instance.state.authority;const onlineMobId=String(auth&&auth.mobs[0]&&auth.mobs[0].id||"");
  must(auth&&auth.players[0].p.level===1&&auth.players[0].p.exp===0&&auth.mobs[0].maxHp===20&&
    auth.players[0].p.equip.weapon.item==="sword",
    "servidor aceitou level/XP/equip/HP de monstro fabricados pelo cliente");

  await new Promise((resolve)=>setTimeout(resolve,7500));
  r=await post("/api/instance/tick",Object.assign({token,expected_version:loaded.data.instance.version,
    visual_state:{players:[{id:String(c.id),x:.28,y:.64}],mobs:[{id:onlineMobId,x:.71,y:.39}]}},lease));
  must(r.status===200&&r.data.elapsed>=3500&&r.data.characters.length===1,"tick online não atualizou instância/personagem");
  const positionedEvent=(r.data.instance.state.state.events||[]).find((event)=>event.mobId===onlineMobId||event.t==="hit"||event.t==="taken"||event.t==="kill");
  must(positionedEvent&&Number.isFinite(Number(positionedEvent.x))&&Number.isFinite(Number(positionedEvent.y)),
    "POST /api/instance/tick não emitiu evento posicionado");
  const authoritativeExp=r.data.characters[0].snapshot.exp,tickVersion=r.data.instance.version;
  must(authoritativeExp>0&&r.data.characters[0].snapshot.totalKills>0,"kill/XP não foram materializados no banco");
  const staleTick=await post("/api/instance/tick",Object.assign({token,
    expected_version:loaded.data.instance.version},lease));
  must(staleTick.status===200&&staleTick.data.ok&&staleTick.data.resynced&&
    staleTick.data.elapsed===0&&staleTick.data.instance.version===tickVersion,
    "tick com versão defasada gerou HTTP 409 em vez de ressincronizar o runtime");
  const spam=await post("/api/instance/tick",Object.assign({token,expected_version:tickVersion},lease));
  must(spam.status===200&&spam.data.elapsed<2000&&
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
