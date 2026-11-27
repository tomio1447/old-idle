/*
 * Relógio server-side das instâncias ociosas.
 *
 * O worker reivindica, em transação, cada intervalo sem lease. Snapshots
 * autoritativos são avançados pelo mesmo motor dos ticks online; snapshots
 * legados ainda recebem `workerElapsedMs` para migração segura no cliente.
 */
"use strict";
const {advanceAuthorityState}=require("./authoritative_engine");

// Catchup por claim limitado em tempo real: um período offline grande
// rodava milhares de steps síncronos dentro da claim (GET_LOCK+FOR UPDATE)
// e congelava o event loop inteiro. A dívida fica em carryMs no estado e
// drena nas claims seguintes — o catchup só se espalha no tempo.
// O budget individual segue o do tick (150ms): slices menores entre claims
// (que agora cedem o loop) deixam o stall máximo contínuo em ~150ms.
const WORKER_STEP_BUDGET_MS=Math.max(50,Number(process.env.AUTH_WORKER_STEP_BUDGET_MS)||150);
/* Budget de wall-clock do CICLO inteiro: claims são sequenciais e cada uma
 * pode queimar WORKER_STEP_BUDGET_MS de JS síncrono — N instâncias em
 * catch-up congelavam o servidor por N×400ms a cada segundo. Passou do
 * budget, o restante volta na próxima volta (ORDER BY cursor ASC mantém
 * quem está devendo na frente da fila). */
const WORKER_CYCLE_BUDGET_MS=Math.max(100,Number(process.env.AUTH_WORKER_CYCLE_BUDGET_MS)||400);
/* O tail pesado do claim (UPDATE de cada char + shared inventory + wallet +
 * guild tasks) rodava a cada ~1s por instância ociosa porque loot do
 * catch-up marcava dirty sempre. Adiar para WORKER_PERSIST_MS mantém o
 * blob/cursor atualizados todo claim e escreve projeções a cada ~30s
 * (taskKills acumulam num mapa pendente — espelho do hot.taskKills). */
const WORKER_PERSIST_MS=Math.max(5000,Number(process.env.AUTH_WORKER_PERSIST_MS)||30000);

function advanceInstanceClock(serialized,elapsed,checkpointAt){
  const authoritative=advanceAuthorityState(serialized,elapsed,checkpointAt,null,
    {stepBudgetMs:WORKER_STEP_BUDGET_MS});
  if(authoritative)return authoritative;
  let state=serialized;
  if(typeof state==="string")state=JSON.parse(state);
  if(!state||typeof state!=="object"||Array.isArray(state))throw new Error("invalid instance state");
  const carry=Math.max(0,Number(state.workerElapsedMs)||0);
  state.workerElapsedMs=Math.min(Number.MAX_SAFE_INTEGER,carry+Math.max(0,Number(elapsed)||0));
  state.workerCheckpointAt=checkpointAt;
  state.savedAt=checkpointAt;
  return JSON.stringify(state);
}

async function runInstanceWorkerOnce(db,options){
  options=options||{};
  const now=Number(options.now)||Date.now();
  const limit=Math.max(1,Math.min(500,Number(options.limit)||50));
  const maxStep=Math.max(100,Number(options.maxStepMs)||3600000);
  const minStep=Math.max(50,Number(options.minStepMs)||500);
  const ids=await db.instanceWorkerCandidates(limit),result={claimed:0,elapsed:0,skipped:0,errors:[]};
  const cycleStart=Date.now();
  for(const accountId of ids){
    // Sem stall contínuo: claims pesadas cedem o event loop entre si para
    // que requests HTTP intercalem — sem isso um lote de instâncias em
    // catch-up congelava o servidor por segundos a cada ciclo de 1s.
    if(result.claimed&&Date.now()-cycleStart>=WORKER_CYCLE_BUDGET_MS){result.skipped++;continue;}
    await new Promise((resolve)=>setImmediate(resolve));
    try{
      const claim=await db.instanceWorkerClaim(accountId,now,maxStep,minStep,advanceInstanceClock,
        {persistMs:WORKER_PERSIST_MS});
      if(claim&&claim.ok){result.claimed++;result.elapsed+=Number(claim.elapsed)||0;
        if(typeof options.onClaim==="function")await options.onClaim(claim);}
      else result.skipped++;
    }catch(error){result.errors.push({accountId,message:error.message});}
  }
  return result;
}

function startInstanceWorker(db,options){
  options=options||{};
  const intervalMs=Math.max(100,Number(options.intervalMs)||1000),
    startupGraceMs=Math.max(0,Number(options.startupGraceMs)||0),startedAt=Date.now();
  let stopped=false,running=false,timer=null,last={claimed:0,elapsed:0,skipped:0,errors:[]};
  const run=async()=>{
    if(stopped||running||Date.now()-startedAt<startupGraceMs)return last;running=true;
    try{last=await runInstanceWorkerOnce(db,options);return last;}
    finally{running=false;}
  };
  timer=setInterval(()=>{run().catch((error)=>console.error("[instance-worker]",error));},intervalMs);
  if(timer&&typeof timer.unref==="function")timer.unref();
  setTimeout(()=>run().catch((error)=>console.error("[instance-worker]",error)),
    Math.max(Math.min(100,intervalMs),startupGraceMs));
  return {runOnce:run,stats:()=>last,stop(){stopped=true;if(timer)clearInterval(timer);timer=null;}};
}

module.exports={advanceInstanceClock,runInstanceWorkerOnce,startInstanceWorker};
