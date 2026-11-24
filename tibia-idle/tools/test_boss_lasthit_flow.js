/* Last hit de boss: fluxo morto→loot→3s→templo, anti-freeze do servidor.
 * Cobre:
 *  - kill → terminalReason "boss-defeated" + evento kill com loot + bundle
 *    no Reward Chest;
 *  - party toda caída no tick do kill NÃO apaga o boss-defeated (fullWipe
 *    guard — antes virava "party-wipe" e o fluxo de vitória morria);
 *  - stepBudgetMs limita a simulação síncrona por chamada (catchup grande
 *    congelava o event loop dentro da tx FOR UPDATE = "servidor trava") e
 *    a dívida persiste em carryMs até drenar;
 *  - cliente: saída ~3s pós-morte (bossVictoryExitDelayMs) nos caminhos
 *    terminais + world boss (wbExitCombatNow após 3s). */
"use strict";
const fs=require("fs"),path=require("path");
const engine=require("../server/authoritative_engine");
const engineSrc=fs.readFileSync(path.join(__dirname,"..","server","authoritative_engine.js"),"utf8");
const gameSrc=fs.readFileSync(path.join(__dirname,"..","game","js","game.js"),"utf8");
const wbSrc=fs.readFileSync(path.join(__dirname,"..","game","js","world-boss-ui.js"),"utf8");
const serverSrc=fs.readFileSync(path.join(__dirname,"..","server","server.js"),"utf8");
const workerSrc=fs.readFileSync(path.join(__dirname,"..","server","instance_worker.js"),"utf8");
function must(ok,msg){if(!ok)throw Error(msg);}

// --- Guards/código presente -------------------------------------------------
must(gameSrc.includes("bossVictoryExitDelayMs")&&gameSrc.includes("c.bossDefeatedAt"),
  "game.js sem o delay de ~3s pós-morte do boss");
must(gameSrc.split("setTimeout(()=>{").length>1&&gameSrc.includes("bossVictoryExitDelayMs(terminalReason)"),
  "caminho terminal principal sem o delay");
must(wbSrc.includes("function wbExitCombatNow")&&wbSrc.includes('wbExitCombatNow("success"), 3000'),
  "world boss sem toast imediato + saída 3s");
must(serverSrc.includes("AUTH_TICK_STEP_BUDGET_MS")&&serverSrc.includes("resolved.worldBoss)tickOpts.hotAuth"),
  "tick sem orçamento de steps / world boss fora do hot path");
must(workerSrc.includes("WORKER_STEP_BUDGET_MS"),"worker sem orçamento de steps");
// Cooldown do boss: carimbo por engajamento (authMarkBossEngaged), não na
// entrada — instância quebrada nunca confirmada não queima a tentativa.
must(engineSrc.includes("function authMarkBossEngaged")&&engineSrc.includes("authMarkBossEngaged(auth)"),
  "engine sem carimbo de lastFight por engajamento");
must(!/initializeAuthority[\s\S]{0,4000}lastFight\s*=\s*auth\.clock/.test(engineSrc.split("function initializeAuthority")[1].split("function materializeAuthority")[0]),
  "initializeAuthority ainda carimbando lastFight no create");
must(gameSrc.includes("bossFightEngaged(G.combat)")&&gameSrc.includes("bossStampFight"),
  "cliente sem carimbo de cooldown por engajamento no stopHunt");

function player(overrides){
  return Object.assign({id:1,name:"Tester",voc:"knight",level:800,exp:engine.expForLevel(800),
    hp:500000,mp:20000,gold:100000,skills:{sword:120,axe:10,club:10,dist:10,fist:10,shield:100},
    ml:20,equip:{weapon:{item:"sword"}},supplies:{},lootPouch:{},kills:{},bosses:{},config:{}},overrides||{});
}
function bossDesc(p,bossId,slug){
  const member={id:String(p.id),p:JSON.parse(JSON.stringify(p))};
  return {v:1,savedAt:1000,kind:"boss",huntId:null,bossId,instanceMode:"boss",activeCharacterId:String(p.id),
    members:[member],state:{players:[{id:String(p.id),p:member.p,cx:10,cy:10,x:10.5/30,y:10.5/30}],
      mobs:[{id:"boss-1",slug:slug||bossId,boss:true,cx:12,cy:10,x:12.5/30,y:10.5/30}],events:[]}};
}
function waitArenaBoss(auth){
  const st=auth.authority.arenaBossSpawn;
  if(!st||st.spawned||!st.pending)return auth;
  const at=Number(st.at)||(Number(auth.authority.clock)||0)+5000;
  const elapsed=Math.max(0,at-(Number(auth.authority.clock)||0))+1;
  return JSON.parse(engine.advanceAuthorityState(JSON.stringify(auth),elapsed,at+1).state);
}
function silence(auth){
  for(const mob of auth.authority.mobs||[]){mob.damage=0;mob.attackSpeed=Number.MAX_SAFE_INTEGER;mob.attackAcc=0;}
}

// --- 1) Last hit → boss-defeated + kill c/ loot + bundle --------------------
{
  const auth=waitArenaBoss(engine.initializeAuthority(bossDesc(player(),"malofur-mangrinder"),
    "a".repeat(64),1000));
  silence(auth);
  const boss=(auth.authority.mobs||[]).find((m)=>m.boss);
  must(boss,"boss não materializou");
  boss.hp=1; // o próximo auto-attack é o last hit
  const out=engine.advanceAuthorityState(JSON.stringify(auth),4000,auth.authority.clock+4000);
  must(out.terminalReason==="boss-defeated","last hit não terminou em boss-defeated: "+out.terminalReason);
  const st=JSON.parse(out.state);
  const kill=((st.state&&st.state.events)||[]).find((e)=>e.t==="kill"&&e.boss);
  must(kill,"evento kill do boss ausente no snapshot terminal");
  must(Array.isArray(kill.loot),"evento kill sem campo loot");
  const charData=out.characters&&out.characters[0]&&
    (typeof out.characters[0].data==="string"?JSON.parse(out.characters[0].data):out.characters[0].data);
  must(charData&&Array.isArray(charData.rewardChestBundles)&&charData.rewardChestBundles.length>=1,
    "bundle do boss ausente no Reward Chest da projeção");
}

// --- 2) Party toda caída no tick do kill: boss-defeated sobrevive -----------
{
  const auth=waitArenaBoss(engine.initializeAuthority(bossDesc(player(),"malofur-mangrinder"),
    "b".repeat(64),1000));
  const a=auth.authority,boss=(a.mobs||[]).find((m)=>m.boss);
  must(boss,"boss não materializou (wipe)");
  for(const item of a.players||[]){item.p.hp=0;item.downUntil=(a.clock||0)+999999;}
  boss.hp=1;
  // Delayed hit mata o boss no topo do step — antes, o fullWipe no fim do
  // mesmo step reescrevia terminalReason para "party-wipe".
  a.delayedHits=[{at:0,mobId:String(boss.id),whoId:"1",dmg:999999,el:"death"}];
  const out=engine.advanceAuthorityState(JSON.stringify(auth),400,(a.clock||0)+400);
  must(out.terminalReason==="boss-defeated",
    "wipe apagou a vitória do boss: "+out.terminalReason);
}

// --- 3) stepBudgetMs: catchup grande não congela; dívida drena --------------
{
  const auth=waitArenaBoss(engine.initializeAuthority(bossDesc(player(),"malofur-mangrinder"),
    "c".repeat(64),1000));
  silence(auth);
  const t0=Date.now();
  const out=engine.advanceAuthorityState(JSON.stringify(auth),600000,
    auth.authority.clock+600000,null,{stepBudgetMs:20});
  const wall=Date.now()-t0;
  must(wall<3000,"orçamento não limitou a simulação ("+wall+"ms)");
  const a=JSON.parse(out.state).authority;
  must(a.carryMs>0,"dívida do catchup não ficou em carryMs");
  must(a.clock<auth.authority.clock+600000,
    "relógio simulado avançou tempo não simulado");
  // Drena a dívida em chamadas seguintes (até zerar ou o combate terminar).
  let state=out.state,debt=a.carryMs,reason=out.terminalReason;
  for(let i=0;i<500&&debt>=200&&!reason;i++){
    const r=engine.advanceAuthorityState(state,0,a.clock,null,{stepBudgetMs:30});
    state=r.state;reason=r.terminalReason;
    debt=JSON.parse(state).authority.carryMs;
  }
  // <200ms é o resto sub-step normal (carryMs sempre o segurava); a dívida
  // grande do catchup é que precisa drenar.
  must(debt<200||reason,"dívida de carryMs nunca drena ("+debt+")");
}

// --- 4) Cooldown exige instância confirmada (visual_state com `self`) ------
{
  // Instância quebrada: o cliente nunca montou o combate → nenhum visual
  // com `self` chega. O boss batendo na PT fica PENDENTE e não carimba.
  const auth=waitArenaBoss(engine.initializeAuthority(bossDesc(player(),"malofur-mangrinder"),
    "d".repeat(64),1000));
  const boss=(auth.authority.mobs||[]).find((m)=>m.boss);
  must(boss,"boss não materializou (gate de confirmação)");
  boss.damage=100;boss.attackAcc=100000;boss.attackSpeed=200;
  const out=engine.advanceAuthorityState(JSON.stringify(auth),8000,
    auth.authority.clock+8000);
  const a2=JSON.parse(out.state).authority,p2=a2.players[0].p;
  must(p2.hp<500000,"boss não bateu no jogador no cenário sem confirmação");
  must(!(p2.bosses&&p2.bosses["malofur-mangrinder"]&&
    p2.bosses["malofur-mangrinder"].lastFight),
    "instância não confirmada carimbou lastFight");
  must(a2._engagePending,"dano pré-confirmação não ficou pendente");
  // Confirmação tardia (cliente montou o combate) promove o carimbo.
  const out2=engine.advanceAuthorityState(out.state,200,a2.clock+200,
    {players:[{id:"1",x:10.5/30,y:10.5/30,cx:10,cy:10,self:1}]});
  const a3=JSON.parse(out2.state).authority;
  must(a3._entryConfirmed,"visual com self não confirmou a entrada");
  must(a3.players[0].p.bosses["malofur-mangrinder"].lastFight>0,
    "confirmação tardia não promoveu o carimbo pendente");
}

// --- 5) Vitória fura o gate (boss-defeated é prova suficiente) ------------
{
  const auth=waitArenaBoss(engine.initializeAuthority(bossDesc(player(),"malofur-mangrinder"),
    "e".repeat(64),1000));
  silence(auth);
  const boss=(auth.authority.mobs||[]).find((m)=>m.boss);
  boss.hp=1;
  const out=engine.advanceAuthorityState(JSON.stringify(auth),4000,
    auth.authority.clock+4000);
  must(out.terminalReason==="boss-defeated","kill não terminou em boss-defeated no gate");
  const a=JSON.parse(out.state).authority;
  must(a.players[0].p.bosses["malofur-mangrinder"].lastFight>0,
    "boss-defeated sem confirmação não carimbou lastFight");
}

console.log("test_boss_lasthit_flow OK");
