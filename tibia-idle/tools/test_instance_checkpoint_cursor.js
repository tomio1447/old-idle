/* Checkpoint (PUT /api/instance) com a authority do servidor NÃO pode adiantar
 * o worker_cursor_at: a authority só foi simulada até o cursor, e mover o
 * cursor para "agora" descartava o intervalo até o próximo tick — horas de
 * caça viravam minutos de stats.time/kills/XP. */
"use strict";
const fs=require("fs"),path=require("path"),os=require("os");
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),"gi-cursor-"));
process.env.GLOBAL_IDLE_DATA_DIR=tmp;delete process.env.MYSQL_HOST;
const {getDb}=require("../server/db");
function must(ok,msg){if(!ok)throw Error(msg);}
const dbSrc=fs.readFileSync(path.join(__dirname,"..","server","db.js"),"utf8");
const svSrc=fs.readFileSync(path.join(__dirname,"..","server","server.js"),"utf8");
must(/prepared\.state\.authority=currentState\.authority;[\s\S]{0,300}prepared\.meta\.keep_worker_cursor=true/.test(svSrc),
  "PUT checkpoint não marca keep_worker_cursor ao reaproveitar a authority");
must(/meta\.keep_worker_cursor\?\(current\.worker_cursor_at\|\|current\.saved_at/.test(dbSrc),
  "instanceSave MySQL não preserva o worker_cursor_at");

(async()=>{
  const store=await getDb();
  const T0=Date.parse("2026-01-01T00:00:00Z"),lease={holderId:"h",secretHash:"x"};
  store.accounts=[{id:5,token:"t"}];
  store.leases=[{account_id:5,holder_id:"h",secret_hash:"x",expires_at:new Date(T0+3600000).toISOString()}];
  const iid="i".repeat(64),meta=(at,keep)=>Object.assign({kind:"hunt",hunt_id:"rats",boss_id:null,instance_mode:"non-pvp",
    party_id:null,party_version:null,member_ids:[1],active_character_id:1,saved_at:new Date(at),started_at:new Date(T0)},
    keep?{keep_worker_cursor:true}:{});
  store.instances=[{account_id:5,instance_id:iid,version:3,status:"active",kind:"hunt",
    state:"{}",saved_at:new Date(T0).toISOString(),worker_cursor_at:new Date(T0).toISOString(),worker_total_ms:0}];

  // 1) checkpoint 5s após o último tick: cursor fica em T0
  let r=store.instanceSave(5,iid,3,meta(T0+5000,true),"{}",Object.assign({now:T0+5000},lease));
  must(r.ok,"instanceSave falhou");
  must(Date.parse(store.instances[0].worker_cursor_at)===T0,"checkpoint adiantou o cursor");
  must(!("keep_worker_cursor" in store.instances[0]),"flag vazou para a row");
  // 2) próximo tick simula os 6s inteiros (nada descartado)
  let seen=0;
  r=store.instanceAuthorityTick(5,4,T0+6000,3600000,(s,elapsed)=>{seen=elapsed;return {state:s,characters:[]};},
    Object.assign({now:T0+6000},lease));
  must(r.ok&&seen===6000,"tick após checkpoint deveria simular 6000ms, simulou "+seen);
  // 3) save sem authority reaproveitada (cliente simulou) segue movendo o cursor
  r=store.instanceSave(5,iid,5,meta(T0+9000,false),"{}",Object.assign({now:T0+9000},lease));
  must(r.ok&&Date.parse(store.instances[0].worker_cursor_at)===T0+9000,"save sem flag deve mover o cursor");
  console.log("OK: checkpoint preserva worker_cursor_at — tempo de caça não é descartado.");
})().catch((e)=>{console.error(e);process.exit(1);});
