/*
 * Relógio server-side das instâncias ociosas.
 *
 * O worker reivindica, em transação, cada intervalo sem lease. Snapshots
 * autoritativos são avançados pelo mesmo motor dos ticks online; snapshots
 * legados ainda recebem `workerElapsedMs` para migração segura no cliente.
 */
"use strict";
const {advanceAuthorityState}=require("./authoritative_engine");

function advanceInstanceClock(serialized,elapsed,checkpointAt){
  const authoritative=advanceAuthorityState(serialized,elapsed,checkpointAt);
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
  for(const accountId of ids){
    try{
      const claim=await db.instanceWorkerClaim(accountId,now,maxStep,minStep,advanceInstanceClock);
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
