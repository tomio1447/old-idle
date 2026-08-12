/* Fase 9: headers/CORS/rate/session/snapshots/backup e concorrência. */
"use strict";
const fs=require("fs"),os=require("os"),path=require("path"),crypto=require("crypto"),childProcess=require("child_process"),{spawn}=childProcess;
const root=path.join(__dirname,".."),serverDir=path.join(root,"server"),tool=path.join(__dirname,"backup_restore.js");
const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),"global-idle-hardening-")),port=40300+(process.pid%300),base=`http://127.0.0.1:${port}`;
let child=null,logs="";function must(ok,msg){if(!ok)throw Error(msg);}function sha(s){return crypto.createHash("sha256").update(s).digest("hex");}
async function request(route,options){const response=await fetch(base+route,options),text=await response.text();let data;
  try{data=JSON.parse(text);}catch(e){data=text;}return {status:response.status,data,headers:response.headers};}
async function post(route,body,headers){return request(route,{method:"POST",headers:Object.assign({"content-type":"application/json"},headers||{}),body:JSON.stringify(body)});}
async function put(route,body){return request(route,{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify(body)});}
async function start(){child=spawn(process.execPath,["server.js"],{cwd:serverDir,env:Object.assign({},process.env,{
  PORT:String(port),HOST:"127.0.0.1",MYSQL_HOST:"",TEST_SERVER:"1",GLOBAL_IDLE_DATA_DIR:dataDir,SESSION_TTL_MS:"1200",
  ALLOWED_ORIGINS:"https://allowed.example",LEASE_TTL_MS:"10000",
}),stdio:["ignore","pipe","pipe"]});child.stdout.on("data",(c)=>{logs+=c;});child.stderr.on("data",(c)=>{logs+=c;});
  for(let i=0;i<100;i++){try{const r=await request("/api/health");if(r.data.ok)return;}catch(e){}await new Promise((r)=>setTimeout(r,35));}throw Error(logs);}
async function stop(){if(!child)return;const p=child;child=null;await new Promise((resolve)=>{p.once("exit",resolve);p.kill("SIGTERM");setTimeout(resolve,1000).unref();});}
function descriptor(c){const p={id:String(c.id),name:c.name,voc:c.voc,level:1,hp:185,mp:5,skills:{sword:10},equip:{weapon:{item:"sword"}}};
  return {v:1,savedAt:Date.now(),kind:"hunt",huntId:"rats",instanceMode:"non-pvp",activeCharacterId:String(c.id),members:[{id:String(c.id),p}],
    state:{players:[{id:String(c.id),p}],mobs:[{id:"rat",slug:"rat",hp:20}],events:[]}};}
(async()=>{
  await start();
  const rootPage=await request("/");must(rootPage.status===200&&rootPage.headers.get("x-content-type-options")==="nosniff"&&
    /frame-ancestors/.test(rootPage.headers.get("content-security-policy")||""),"headers de segurança ausentes");
  let r=await request("/api/health",{headers:{origin:"https://evil.example"}});must(r.status===403&&r.data.error==="ORIGIN_DENIED","CORS aceitou origem arbitrária");
  r=await request("/api/health",{headers:{origin:"https://allowed.example"}});must(r.status===200&&r.headers.get("access-control-allow-origin")==="https://allowed.example","origem permitida sem CORS correto");

  const login=await post("/api/login",{login:"2",password:"2"}),token=login.data.token,accountId=login.data.account.id;
  const leaseResponse=await post("/api/lease/acquire",{token,holder_id:"hardeningholder"}),lease={holder_id:leaseResponse.data.holderId,lease_token:leaseResponse.data.leaseToken};
  const created=await post("/api/characters",{token,name:"Hardened Hero",voc:"knight",data:JSON.stringify({name:"Hardened Hero",voc:"knight"})}),c=created.data.character;
  r=await put("/api/characters/"+c.id,Object.assign({token,expected_version:c.saveVersion,level:999,
    data:JSON.stringify(Object.assign({},c.snapshot,{name:c.name,voc:c.voc,level:999})),hp:185,mp:5,maxHp:185,maxMp:5},lease));
  must(r.status===200,"save para histórico falhou");
  const snapshots=await request("/api/admin/snapshots?account_id="+accountId,{headers:{authorization:"Bearer "+token}});
  must(snapshots.status===200&&snapshots.data.snapshots.length>=1&&snapshots.data.snapshots.every((s)=>s.checksum&&s.data),
    "histórico imutável/checksum não foi criado");
  const backup=await request("/api/admin/backup?account_id="+accountId,{headers:{authorization:"Bearer "+token}});
  must(backup.status===200&&backup.data.checksum===sha(JSON.stringify(backup.data.payload))&&
    !JSON.stringify(backup.data).includes("password_hash"),"backup Admin inválido ou vazou hash de senha");

  const instance=await put("/api/instance",Object.assign({token,expected_version:0,instance_id:null,state:descriptor(c)},lease));
  await new Promise((resolve)=>setTimeout(resolve,120));const version=instance.data.instance.version;
  const concurrent=await Promise.all(Array.from({length:20},()=>post("/api/instance/tick",Object.assign({token,expected_version:version},lease))));
  must(concurrent.filter((x)=>x.status===200).length===1&&concurrent.filter((x)=>x.status===409).length===19,
    "20 ticks concorrentes aceitaram mais de uma versão");

  await post("/api/lease/release",Object.assign({token},lease));r=await post("/api/logout",{token});must(r.status===200,"logout HTTP falhou");
  must((await request("/api/me",{headers:{authorization:"Bearer "+token}})).status===401,"token continuou válido após logout");
  const expiring=await post("/api/login",{login:"2",password:"2"}),expiringToken=expiring.data.token;
  await new Promise((resolve)=>setTimeout(resolve,1300));
  must((await request("/api/me",{headers:{authorization:"Bearer "+expiringToken}})).status===401,"sessão não expirou pelo TTL");
  let limited=false;for(let i=0;i<25;i++){const attempt=await post("/api/login",{login:"missing",password:"bad"});if(attempt.status===429){limited=true;break;}}
  must(limited,"rate limit de login não bloqueou brute force");
  await stop();

  // Backup/verify/restore do storage JSON com confirmação explícita.
  const source=fs.mkdtempSync(path.join(os.tmpdir(),"backup-source-")),restore=fs.mkdtempSync(path.join(os.tmpdir(),"backup-restore-")),file=path.join(source,"bundle.json");
  fs.writeFileSync(path.join(source,"accounts.json"),JSON.stringify([{id:1,login:"safe"}]));
  const backed=childProcess.spawnSync(process.execPath,[tool,"backup","--data-dir",source,"--out",file],{encoding:"utf8"});must(backed.status===0,"CLI backup falhou");
  const info=JSON.parse(backed.stdout),verified=childProcess.spawnSync(process.execPath,[tool,"verify","--file",file],{encoding:"utf8"});must(verified.status===0,"CLI verify falhou");
  const wrong=childProcess.spawnSync(process.execPath,[tool,"restore","--file",file,"--data-dir",restore,"--apply","--confirm","wrong"],{encoding:"utf8"});
  must(wrong.status!==0,"restore aceitou checksum incorreto");
  const tampered=path.join(source,"tampered.json"),bad=JSON.parse(fs.readFileSync(file,"utf8"));bad.payload.files["accounts.json"].content="[]";fs.writeFileSync(tampered,JSON.stringify(bad));
  must(childProcess.spawnSync(process.execPath,[tool,"verify","--file",tampered],{encoding:"utf8"}).status!==0,"verify aceitou backup adulterado");
  const restored=childProcess.spawnSync(process.execPath,[tool,"restore","--file",file,"--data-dir",restore,"--apply","--confirm",info.checksum],{encoding:"utf8"});
  must(restored.status===0&&JSON.parse(fs.readFileSync(path.join(restore,"accounts.json"),"utf8"))[0].login==="safe","CLI restore verificado falhou");
  fs.rmSync(source,{recursive:true,force:true});fs.rmSync(restore,{recursive:true,force:true});
  console.log("OK: Fase 9 — snapshots, backup/restore, concorrência e hardening validados.");
})().catch((error)=>{console.error(error);process.exitCode=1;}).finally(async()=>{await stop();fs.rmSync(dataDir,{recursive:true,force:true});});
