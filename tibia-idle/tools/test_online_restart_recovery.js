/* Regressão: restart transitório não manda runtime/party ao templo nem gera zone 400. */
"use strict";
const fs=require("fs"),path=require("path"),vm=require("vm");
const root=path.join(__dirname,".."),game=fs.readFileSync(path.join(root,"game","js","game.js"),"utf8"),
  client=fs.readFileSync(path.join(root,"game","js","account-client.js"),"utf8"),
  server=fs.readFileSync(path.join(root,"server","server.js"),"utf8"),
  worker=fs.readFileSync(path.join(root,"server","instance_worker.js"),"utf8"),
  party=fs.readFileSync(path.join(root,"server","party.js"),"utf8");
function must(value,message){if(!value)throw Error(message);}
const start=game.indexOf("async function loadOnlineInstanceAtBoot"),end=game.indexOf("\nfunction startGame",start);
must(start>=0&&end>start,"retry de instância no boot ausente");
let calls=0;const ctx={Promise,setTimeout:(fn)=>{fn();return 1;},accountLoadInstance:async()=>{
  calls++;return calls<3?{ok:false}:{ok:true,instance:{id:"same-runtime"}};
}};
vm.createContext(ctx);vm.runInContext(game.slice(start,end),ctx);
(async()=>{
  const loaded=await ctx.loadOnlineInstanceAtBoot("token");
  must(loaded.ok&&loaded.instance.id==="same-runtime"&&calls===3,
    "boot concluiu templo antes de a API reiniciada voltar");
  must(game.includes("instanceSession=localInstance||null")&&game.includes("G.instanceReconnectPending=true")&&
    game.includes("session.authority||G.instanceReconnectPending"),
    "falha transitória ainda apaga/simula o checkpoint local");
  must(server.includes("INSTANCE_WORKER_STARTUP_GRACE_MS")&&worker.includes("startupGraceMs")&&
    worker.includes("Date.now()-startedAt<startupGraceMs"),
    "worker não reserva janela para o browser retomar o lease após restart");
  must(party.includes('error:"ZONE_NOT_READY"')&&party.includes('error:"HUNT_NOT_READY"')&&
    party.includes("instanceReconcile"),"reconexão ainda transforma zona transitória em HTTP 400");
  must(game.includes("const ONLINE_AUTH_TICK_MS=200"),"tick online não acompanha o passo autoritativo de 200ms");
  must(client.includes("function accountInstanceActive()")&&client.includes("options&&options.silent?false")&&
    game.includes("!instanceReady||G.instanceReconnectPending")&&
    game.includes("if(G.combat&&onlineAuthorityCombat())requestOnlineRuntimeRecovery()")&&
    game.includes("else if(!result||!result.ok)requestOnlineRuntimeRecovery()"),
    "loop/tick online não detecta e repara lease ou instância inativa enquanto o rAF continua");

  const loopStart=game.indexOf("function loop(ts)"),loopEnd=game.indexOf("\n/* ------------------------------------------------------------ render",loopStart);
  let rafCalls=0,recoveryCalls=0;
  const loopCtx={Date,G:{p:{id:"hero"},combat:{},last:0,tickAcc:9,bgLast:0,bgAcc:9},
    requestAnimationFrame:()=>{rafCalls++;},accountLeaseAllowsSimulation:()=>false,
    onlineAuthorityCombat:()=>true,requestOnlineRuntimeRecovery:()=>{recoveryCalls++;}};
  vm.createContext(loopCtx);vm.runInContext(game.slice(loopStart,loopEnd),loopCtx);loopCtx.loop(100);
  must(rafCalls===1&&recoveryCalls===1&&loopCtx.G.tickAcc===0&&loopCtx.G.bgAcc===0,
    "rAF não permaneceu agendado enquanto o loop solicitava recuperação da autoridade");

  const recoveryStart=game.indexOf("let ONLINE_RUNTIME_RECOVERING"),
    recoveryEnd=game.indexOf("\nfunction applyOnlineAuthorityState",recoveryStart);
  must(recoveryStart>=0&&recoveryEnd>recoveryStart,"recuperação periódica do runtime ausente");
  let leaseCalls=0,loadCalls=0,applyCalls=0;
  const recoveryCtx={
    Promise,Date,console,performance:{now:()=>321},clearTimeout:()=>{},
    setTimeout:()=>1,ONLINE_AUTH_ACC:99,
    G:{p:{id:"hero"},combat:{players:[{id:"hero"}]},last:0,tickAcc:99,bgLast:0,bgAcc:99,
      instanceReconnectPending:true},
    sessionToken:()=>"token",onlineAuthorityCombat:()=>true,
    accountEnsureLease:async(token,options)=>{
      leaseCalls++;must(token==="token"&&options&&options.silent,"recovery tentou takeover/toast automático");return {ok:true};
    },
    accountLoadInstance:async()=>{loadCalls++;return {ok:true,instance:{
      id:"same-runtime",members:[{id:"hero"}],state:{players:[{id:"hero"}]}}};},
    instanceIncludesCharacter:(instance,id)=>(instance.members||[]).some(member=>member.id===id),
    applyOnlineAuthorityState:()=>{applyCalls++;delete recoveryCtx.G.instanceReconnectPending;return true;},
    accountBeginInstance:()=>{},persistActiveInstance:()=>{},accountLastInstancePromise:async()=>false,
    clearInstanceSession:()=>{},stopHunt:()=>{}
  };
  vm.createContext(recoveryCtx);vm.runInContext(game.slice(recoveryStart,recoveryEnd),recoveryCtx);
  const recovered=await recoveryCtx.requestOnlineRuntimeRecovery();
  must(recovered&&leaseCalls===1&&loadCalls===1&&applyCalls===1&&
    recoveryCtx.G.tickAcc===0&&recoveryCtx.G.bgAcc===0&&recoveryCtx.ONLINE_AUTH_ACC===0&&
    !recoveryCtx.G.instanceReconnectPending,
    "rAF saudável não retomou automaticamente lease, snapshot autoritativo e relógios");
  console.log("OK: restart preserva checkpoint/party, aguarda lease e retoma runtime congelado.");
})().catch((error)=>{console.error(error);process.exitCode=1;});
