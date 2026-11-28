"use strict";
// Migração única: coluna binária state_z (gzip thin) em account_instances.
try{require("dotenv").config({path:"/app/server/.env"});}catch(e){}
const mysql=require("mysql2/promise");
(async()=>{
  const conn=await mysql.createConnection({host:process.env.MYSQL_HOST,port:Number(process.env.MYSQL_PORT)||3306,
    user:process.env.MYSQL_USER,password:process.env.MYSQL_PASS,database:process.env.MYSQL_DB});
  const [cols]=await conn.query("SHOW COLUMNS FROM account_instances LIKE 'state_z'");
  if(cols.length){console.log("state_z já existe — nada a fazer");}
  else{
    await conn.query("ALTER TABLE account_instances ADD COLUMN state_z MEDIUMBLOB NULL AFTER state");
    console.log("state_z criado (MEDIUMBLOB)");
  }
  const [cnt]=await conn.query("SELECT COUNT(*) n, SUM(LENGTH(state)) bytes FROM account_instances WHERE status='active'");
  console.log("instâncias ativas:",cnt[0].n,"| blob total:",Math.round((cnt[0].bytes||0)/1024),"KB");
  await conn.end();
})().catch(e=>{console.error("ERR",e.message);process.exit(1);});
