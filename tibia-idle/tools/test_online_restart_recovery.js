/* Regressão: restart transitório não manda runtime/party ao templo nem gera zone 400. */
"use strict";
const fs=require("fs"),path=require("path"),vm=require("vm");
const root=path.join(__dirname,".."),game=fs.readFileSync(path.join(root,"game","js","game.js"),"utf8"),
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
  must(game.includes("const ONLINE_AUTH_TICK_MS=1000"),"tick online voltou a saturar o servidor em 500ms");
  console.log("OK: restart preserva checkpoint/party, aguarda lease e ignora zonas transitórias.");
})().catch((error)=>{console.error(error);process.exitCode=1;});
