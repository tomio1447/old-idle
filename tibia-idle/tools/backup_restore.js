#!/usr/bin/env node
/* Backup verificável + restore explícito para storage JSON e MySQL. */
"use strict";
const fs=require("fs"),path=require("path"),crypto=require("crypto"),child=require("child_process");
const args=process.argv.slice(2),cmd=args.shift();
function arg(name,dft){const i=args.indexOf(name);return i>=0&&args[i+1]!==undefined?args[i+1]:dft;}
function sha(data){return crypto.createHash("sha256").update(data).digest("hex");}
function stable(bundle){return JSON.stringify(bundle);}
function buildJson(dataDir){const files={};for(const name of fs.readdirSync(dataDir).sort())if(name.endsWith(".json")){
  const text=fs.readFileSync(path.join(dataDir,name),"utf8");JSON.parse(text);files[name]={sha256:sha(text),content:text};}
  const payload={schema:1,kind:"global-idle-json",createdAt:new Date().toISOString(),files};
  return {payload,checksum:sha(stable(payload))};}
function verify(file){const bundle=JSON.parse(fs.readFileSync(file,"utf8"));if(!bundle.payload||bundle.checksum!==sha(stable(bundle.payload)))throw Error("checksum do bundle inválido");
  for(const [name,row] of Object.entries(bundle.payload.files||{})){if(path.basename(name)!==name||!name.endsWith(".json"))throw Error("nome inseguro: "+name);
    if(sha(row.content)!==row.sha256)throw Error("checksum inválido: "+name);JSON.parse(row.content);}return bundle;}
function mysqlArgs(){return ["-h",process.env.MYSQL_HOST||"127.0.0.1","-P",process.env.MYSQL_PORT||"3306","-u",process.env.MYSQL_USER||"root",
  "--password="+(process.env.MYSQL_PASS||""),process.env.MYSQL_DB||"global_idle"];}
if(cmd==="backup"){
  const dataDir=path.resolve(arg("--data-dir",path.join(__dirname,"..","server","data"))),out=path.resolve(arg("--out","global-idle-backup.json"));
  const bundle=buildJson(dataDir);fs.writeFileSync(out,JSON.stringify(bundle,null,2));console.log(JSON.stringify({ok:true,out,checksum:bundle.checksum,files:Object.keys(bundle.payload.files).length}));
}else if(cmd==="verify"){
  const file=path.resolve(arg("--file",args[0]));const bundle=verify(file);console.log(JSON.stringify({ok:true,checksum:bundle.checksum,files:Object.keys(bundle.payload.files).length}));
}else if(cmd==="restore"){
  const file=path.resolve(arg("--file",args[0])),dataDir=path.resolve(arg("--data-dir",path.join(__dirname,"..","server","data"))),bundle=verify(file);
  if(!args.includes("--apply")||arg("--confirm","")!==bundle.checksum)throw Error("restore exige --apply --confirm "+bundle.checksum);
  fs.mkdirSync(dataDir,{recursive:true});const safety=path.join(path.dirname(dataDir),"pre-restore-"+Date.now()+".json");
  if(fs.existsSync(dataDir)&&fs.readdirSync(dataDir).some((n)=>n.endsWith(".json")))fs.writeFileSync(safety,JSON.stringify(buildJson(dataDir),null,2));
  for(const [name,row] of Object.entries(bundle.payload.files)){const target=path.join(dataDir,name),tmp=target+".tmp";fs.writeFileSync(tmp,row.content);fs.renameSync(tmp,target);}
  console.log(JSON.stringify({ok:true,restored:Object.keys(bundle.payload.files).length,safety:fs.existsSync(safety)?safety:null}));
}else if(cmd==="backup-mysql"){
  const out=path.resolve(arg("--out","global-idle.sql")),result=child.spawnSync("mysqldump",["--single-transaction","--routines","--triggers","--hex-blob",...mysqlArgs()],{encoding:"buffer"});
  if(result.status!==0)throw Error(String(result.stderr));fs.writeFileSync(out,result.stdout);console.log(JSON.stringify({ok:true,out,checksum:sha(result.stdout)}));
}else if(cmd==="restore-mysql"){
  const file=path.resolve(arg("--file",args[0])),checksum=sha(fs.readFileSync(file));if(!args.includes("--apply")||arg("--confirm","")!==checksum)throw Error("restore exige --apply --confirm "+checksum);
  const result=child.spawnSync("mysql",mysqlArgs(),{input:fs.readFileSync(file)});if(result.status!==0)throw Error(String(result.stderr));console.log(JSON.stringify({ok:true,checksum}));
}else{
  console.error("uso: backup|verify|restore|backup-mysql|restore-mysql");process.exitCode=2;
}
