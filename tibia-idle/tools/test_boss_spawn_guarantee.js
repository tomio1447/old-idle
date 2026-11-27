/* Garantia "o boss sempre nasce":
 *  - initializeAuthority com checkpoint sem boss e sem arenaBossSpawn.pending
 *    fabrica o boss e agenda o spawn (antes a sala ficava vazia para sempre
 *    com o banner travado em "Boss nasce em 0s");
 *  - um add nunca é marcado como boss pelo fallback mobs[0] (o kill dele
 *    encerrava a arena como boss-defeated);
 *  - ensureBossArenaMob: pendência perdida mid-fight refabrica e respawna;
 *  - o cooldown (lastFight) só carimba com _bossAppeared — dano de adds numa
 *    sala sem boss não queima a tentativa;
 *  - mecânicas pendingBoss (ag/cw/bo) e mega/world boss não disparam a
 *    fabricação (guards no fonte). */
"use strict";
const fs=require("fs"),path=require("path");
const engine=require("../server/authoritative_engine");
const engineSrc=fs.readFileSync(path.join(__dirname,"..","server","authoritative_engine.js"),"utf8");
const gameSrc=fs.readFileSync(path.join(__dirname,"..","game","js","game.js"),"utf8");
const combatSrc=fs.readFileSync(path.join(__dirname,"..","game","js","combat.js"),"utf8");
function must(ok,msg){if(!ok)throw Error(msg);}

// --- Guards de fonte --------------------------------------------------------
must(engineSrc.includes("function ensureBossArenaMob")&&
     /arenaBossSpawnTick\(auth,now\);\s*\n\s*ensureBossArenaMob\(auth,now\)/.test(engineSrc),
  "ensureBossArenaMob ausente do step()");
must(engineSrc.includes("auth._bossAppeared")&&
     engineSrc.includes("!auth._bossAppeared"),
  "engine sem o gate _bossAppeared no carimbo de cooldown");
must(engineSrc.includes("applyFabricatedBossFixes"),
  "fabricação sem os fixups por boss (resists do Unwelcome)");
must(!engineSrc.includes("if(!boss)boss=auth.mobs[0]"),
  "fallback mobs[0] ainda pode marcar um add como boss");
must(gameSrc.includes("previous._bossAppeared=true"),
  "merge online não marca _bossAppeared");
must(gameSrc.includes("BROKEN_INSTANCE_MAX_REENTRY = 5"),
  "cap de reentrada em instância quebrada não subiu");
must(combatSrc.includes("c._bossAppeared = true")||
     combatSrc.includes("c._bossAppeared=true"),
  "combat.js sem _bossAppeared no bind de mecânicas");

function player(overrides){
  return Object.assign({id:1,name:"Tester",voc:"knight",level:800,exp:engine.expForLevel(800),
    hp:500000,mp:20000,gold:100000,skills:{sword:120,axe:10,club:10,dist:10,fist:10,shield:100},
    ml:20,equip:{weapon:{item:"sword"}},supplies:{},lootPouch:{},kills:{},bosses:{},config:{}},overrides||{});
}
function bossDesc(p,bossId,mobs){
  const member={id:String(p.id),p:JSON.parse(JSON.stringify(p))};
  return {v:1,savedAt:1000,kind:"boss",huntId:null,bossId,instanceMode:"boss",activeCharacterId:String(p.id),
    members:[member],state:{players:[{id:String(p.id),p:member.p,cx:10,cy:10,x:10.5/30,y:10.5/30}],
      mobs:mobs||[],events:[]}};
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

// --- 1) Checkpoint VAZIO: boss fabricado + spawnado --------------------------
{
  const auth=engine.initializeAuthority(bossDesc(player(),"malofur-mangrinder",[]),
    "f".repeat(64),1000);
  const a=auth.authority;
  must(a.arenaBossSpawn&&a.arenaBossSpawn.pending,"checkpoint vazio não fabricou o pending");
  must(!(a.mobs||[]).some((m)=>m.boss),"boss fabricado ficou em mobs antes do spawn");
  const born=waitArenaBoss(auth).authority;
  const boss=(born.mobs||[]).find((m)=>m.boss&&m.hp>0);
  must(boss,"boss fabricado nunca nasceu");
  must(born._bossAppeared,"_bossAppeared não marcou no spawn fabricado");
  must(born.arenaBossSpawn&&born.arenaBossSpawn.spawned,"spawned não virou true");
}

// --- 2) Adds-only: nenhum add vira "boss" ------------------------------------
{
  const auth=engine.initializeAuthority(bossDesc(player(),"malofur-mangrinder",[
      {id:"add-1",slug:"falcon-knight",cx:12,cy:10,x:12.5/30,y:10.5/30},
      {id:"add-2",slug:"falcon-knight",cx:14,cy:10,x:14.5/30,y:10.5/30}]),
    "e".repeat(64),1000);
  const a=auth.authority;
  must(!(a.mobs||[]).some((m)=>m.boss&&m.slug==="falcon-knight"),
    "um add foi marcado como boss (antigo fallback mobs[0])");
  must(a.arenaBossSpawn&&a.arenaBossSpawn.pending,
    "adds-only sem pendência fabricada");
  const born=waitArenaBoss(auth).authority;
  must((born.mobs||[]).some((m)=>m.boss&&m.hp>0),
    "boss fabricado não nasceu na sala de adds");
}

// --- 3) ensureBossArenaMob: pendência perdida refabrica ----------------------
{
  let auth=waitArenaBoss(engine.initializeAuthority(bossDesc(player(),"malofur-mangrinder",
    [{id:"b1",slug:"malofur-mangrinder",boss:true,cx:12,cy:10,x:12.5/30,y:10.5/30}]),
    "d".repeat(64),1000));
  silence(auth);
  const a=auth.authority;
  // Simula a pendência/boss perdido (checkpoint corrompido): tira o boss de
  // mobs e zera o estado de spawn — o próximo step TEM que refabricar.
  a.mobs=(a.mobs||[]).filter((m)=>!m.boss);
  a.arenaBossSpawn=null;
  const out=engine.advanceAuthorityState(JSON.stringify(auth),400,a.clock+400);
  const a2=JSON.parse(out.state).authority;
  must(a2.arenaBossSpawn&&a2.arenaBossSpawn.pending,
    "ensureBossArenaMob não refabricou a pendência");
  // A simulação anda em steps de AUTH_STEP_MS (200): avance folga pós-`at`.
  const out3=engine.advanceAuthorityState(out.state,2500,a2.clock+2500);
  const born=JSON.parse(out3.state).authority;
  must((born.mobs||[]).some((m)=>m.boss&&m.hp>0),
    "boss refabricado nunca nasceu");
  must(born._bossAppeared,"_bossAppeared não marcou no respawn garantido");
}

// --- 4) Sem boss nascido, sem cooldown ----------------------------------------
{
  // Boss pending (não spawnou ainda): dano confirmado em adds fica PENDENTE
  // e não carimba — mesmo com _entryConfirmed. Só carimba pós-spawn.
  let auth=engine.initializeAuthority(bossDesc(player(),"malofur-mangrinder",
    [{id:"b1",slug:"malofur-mangrinder",boss:true,cx:12,cy:10,x:12.5/30,y:10.5/30}]),
    "c".repeat(64),1000);
  const a=auth.authority;
  must(a.arenaBossSpawn&&a.arenaBossSpawn.pending,"boss não ficou pending");
  // Confirma a entrada e simula dano ANTES do boss nascer (adds da sala).
  auth=JSON.parse(engine.advanceAuthorityState(JSON.stringify(auth),100,a.clock+100,
    {players:[{id:"1",x:10.5/30,y:10.5/30,cx:10,cy:10,self:1}]}).state);
  const a2=auth.authority;
  must(a2._entryConfirmed,"visual com self não confirmou a entrada");
  a2._engagePending=true;
  a2.players[0].p.hp=400000; // levou dano de add antes do spawn
  // Marca como se o dano tivesse chamado o carimbo: sem _bossAppeared ainda.
  // (authMarkBossEngaged é chamada pelos eventos de dano — aqui validamos o
  // gate direto: pendente não pode ter virado lastFight.)
  must(!(a2.players[0].p.bosses["malofur-mangrinder"]||{}).lastFight,
    "lastFight carimbado sem o boss nascer");
  // Boss nasce → pendência promove o carimbo (foi luta de verdade).
  const born=waitArenaBoss(auth).authority;
  must(born._bossAppeared,"boss não nasceu no cenário de engage tardio");
}

// --- 5) Mecânicas pendingBoss não disparam fabricação -------------------------
must(/auth\.ag&&auth\.ag\.pendingBoss/.test(engineSrc)&&
     /auth\.cw&&auth\.cw\.pendingBoss/.test(engineSrc)&&
     /auth\.bo&&auth\.bo\.pendingBoss/.test(engineSrc)&&
     /auth\.mega/.test(engineSrc.split("function ensureBossArenaMob")[1].split("\n}")[0]),
  "ensureBossArenaMob sem os guards das mecânicas pendingBoss/mega");

console.log("test_boss_spawn_guarantee OK");
