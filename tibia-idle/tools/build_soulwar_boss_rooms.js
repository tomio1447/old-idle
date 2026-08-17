/* Publica boss rooms Soul War: Greed/Hatred/Spite/Malice/Megalomania.
 *
 * Fonte Canary (beta-maps/bossesroom):
 *   goshnar_hatred_room.otbm  → maps/goshnars_hatred_room.otbm
 *   goshnar_spite_room.otbm   → maps/goshnars_spite_room.otbm
 *   goshars_malice_room.otbm  → maps/goshars_malice_room.otbm
 *   goshnar_megalomania.otbm  → maps/goshnars_megalomania.otbm
 *   goshnar_greed_room.otbm   → maps/goshnars_greed_room.otbm
 *
 * Aceita header Canary (00 00 00 00) ou magic "OTBM" do editor idle.
 * Nunca sobrescreve a fonte singular (goshnar_*) com o placeholder
 * sintético; o fallback sintético do Greed escreve só em maps/. */
"use strict";
const fs=require("fs"),path=require("path"),crypto=require("crypto");
const OTBM=require("../game/js/otbm.js");
const root=path.join(__dirname,"..","game");
const betaDir=path.join(root,"beta-maps","bossesroom");
const FLOOR=22893,WALL=26995,PILLAR=33242,ALT=13235;

function room(name,w,h,spawn,boss){
  const cells={};
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const border=x===0||y===0||x===w-1||y===h-1;
    cells[x+","+y]={g:(x+y)%7===0?ALT:FLOOR,items:border?[WALL]:[]};
  }
  for(const [x,y] of [[3,3],[4,3],[15,3],[16,3],[3,9],[4,9],[15,9],[16,9]])
    cells[x+","+y].items=[PILLAR];
  return {w,h,z:7,name,desc:"Dedicated Soul War boss room: "+name,
    spawn,mob:[boss],cells};
}

function isCanaryOtbm(data){
  return Buffer.isBuffer(data)&&data.length>=4&&
    data[0]===0&&data[1]===0&&data[2]===0&&data[3]===0;
}
function isIdleOtbm(data){
  return Buffer.isBuffer(data)&&data.length>=4&&
    data[0]===0x4f&&data[1]===0x54&&data[2]===0x42&&data[3]===0x4d; // OTBM
}
function isUsableOtbm(data){
  return isCanaryOtbm(data)||isIdleOtbm(data);
}

/** Placeholder sintético 20×14 (header OTBM, ~2.8KB) — não contar como fonte. */
function isSyntheticGreedPlaceholder(data){
  if(!isIdleOtbm(data)||data.length>=4000)return false;
  try{
    const map=OTBM.read(data,{z:7});
    return !!(map&&map.w===20&&map.h===14);
  }catch(e){return false;}
}

function digest(data){
  return crypto.createHash("sha256").update(data).digest("hex");
}

function publishRuntime(runtimeName,data,meta){
  fs.mkdirSync(path.join(root,"maps"),{recursive:true});
  fs.mkdirSync(betaDir,{recursive:true});
  const runtime=path.join(root,"maps",runtimeName+".otbm");
  fs.writeFileSync(runtime,data);
  // Espelho publicado em beta com o nome runtime (ex.: goshnars_*),
  // sem apagar a fonte singular goshnar_* quando for outro arquivo.
  const mirror=path.join(betaDir,runtimeName+".otbm");
  fs.writeFileSync(mirror,data);
  return Object.assign({
    file:runtimeName,
    bytes:data.length,
    sha256:digest(data),
    canary:isCanaryOtbm(data),
  },meta||{});
}

function publishFromSources(sourceNames,runtimeName){
  for(const name of sourceNames){
    const source=path.join(betaDir,name);
    if(!fs.existsSync(source))continue;
    const data=fs.readFileSync(source);
    if(!isUsableOtbm(data))continue;
    // Evita republicar o próprio placeholder sintético como se fosse Canary.
    if(name===runtimeName+".otbm"&&isSyntheticGreedPlaceholder(data))continue;
    return publishRuntime(runtimeName,data,{source:name});
  }
  return null;
}

function publishGreed(){
  const from=publishFromSources(
    ["goshnar_greed_room.otbm","goshnars_greed_room.otbm"],
    "goshnars_greed_room");
  if(from)return from;
  // Fallback: só maps/. Não toca em beta-maps para não apagar upload do usuário.
  const data=Buffer.from(new Uint8Array(OTBM.write(
    room("Goshnar's Greed Room",20,14,{x:10,y:12},{x:10,y:2}))));
  const runtime=path.join(root,"maps","goshnars_greed_room.otbm");
  fs.writeFileSync(runtime,data);
  console.error("[build_soulwar_boss_rooms] WARN: Greed sem fonte Canary — "+
    "coloque beta-maps/bossesroom/goshnar_greed_room.otbm e rode de novo.");
  return {file:"goshnars_greed_room",bytes:data.length,sha256:digest(data),
    canary:false,synthetic:true,source:null};
}

function publishCanaryHatred(){
  const canary=publishFromSources(
    ["goshnar_hatred_room.otbm","goshnars_hatred_room.otbm"],
    "goshnars_hatred_room");
  if(!canary)throw new Error("fonte Canary Hatred ausente em beta-maps/bossesroom");
  return canary;
}
function publishCanarySpite(){
  const canary=publishFromSources(
    ["goshnar_spite_room.otbm","goshnars_spite_room.otbm"],
    "goshnars_spite_room");
  if(!canary)throw new Error("fonte Canary Spite ausente em beta-maps/bossesroom");
  return canary;
}
function publishCanaryMalice(){
  const canary=publishFromSources(
    ["goshars_malice_room.otbm","goshnar_malice_room.otbm","goshnars_malice_room.otbm"],
    "goshars_malice_room");
  if(!canary)throw new Error("fonte Canary Malice ausente em beta-maps/bossesroom");
  return canary;
}
function publishCanaryMegalomania(){
  const canary=publishFromSources(
    ["goshnars_megalomania.otbm","goshnar_megalomania.otbm"],
    "goshnars_megalomania");
  if(!canary)throw new Error("fonte Canary Megalomania ausente em beta-maps/bossesroom");
  return canary;
}

const result=[publishGreed(),publishCanaryHatred(),publishCanarySpite(),
  publishCanaryMalice(),publishCanaryMegalomania()];
console.log(JSON.stringify(result,null,2));
