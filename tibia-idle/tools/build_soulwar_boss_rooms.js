/* Publica boss rooms Soul War: Greed/Hatred/Spite/Malice/Megalomania.
 * Hatred: sempre a partir do Canary `goshnar_hatred_room.otbm`.
 * Spite: sempre a partir do Canary `goshnar_spite_room.otbm` (ou
 * `goshnars_spite_room.otbm` já no formato Canary).
 * Malice: fonte `goshars_malice_room.otbm` / `goshnar_malice_room.otbm`
 * (typo goshars no arquivo entregue) publicada como `goshars_malice_room`.
 * Megalomania: Canary `goshnars_megalomania.otbm` / `goshnar_megalomania.otbm`.
 * Greed: usa Canary `goshnar_greed_room.otbm` (ou `goshnars_greed_room.otbm`
 * já no formato Canary) quando existir; senão gera o placeholder sintético. */
"use strict";
const fs=require("fs"),path=require("path"),crypto=require("crypto");
const OTBM=require("../game/js/otbm.js");
const root=path.join(__dirname,"..","game");
const FLOOR=22893,WALL=26995,PILLAR=33242,ALT=13235;
function room(name,w,h,spawn,boss){
  const cells={};
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const border=x===0||y===0||x===w-1||y===h-1;
    cells[x+","+y]={g:(x+y)%7===0?ALT:FLOOR,items:border?[WALL]:[]};
  }
  // Quatro ilhas/vórtices laterais e corredor central aberto até o boss.
  for(const [x,y] of [[3,3],[4,3],[15,3],[16,3],[3,9],[4,9],[15,9],[16,9]])
    cells[x+","+y].items=[PILLAR];
  return {w,h,z:7,name,desc:"Dedicated Soul War boss room: "+name,
    spawn,mob:[boss],cells};
}
function isCanaryOtbm(data){
  return Buffer.isBuffer(data)&&data.length>=4&&
    data[0]===0&&data[1]===0&&data[2]===0&&data[3]===0;
}
function writeSynthetic(file,map){
  const data=Buffer.from(new Uint8Array(OTBM.write(map)));
  return publish(file,data);
}
function publish(file,data){
  const runtime=path.join(root,"maps",file+".otbm");fs.writeFileSync(runtime,data);
  const beta=path.join(root,"beta-maps","bossesroom",file+".otbm");
  fs.mkdirSync(path.dirname(beta),{recursive:true});fs.writeFileSync(beta,data);
  return {file,bytes:data.length,sha256:crypto.createHash("sha256").update(data).digest("hex"),
    canary:isCanaryOtbm(data)};
}
function publishCanary(sourceNames,runtimeName){
  const dir=path.join(root,"beta-maps","bossesroom");
  for(const name of sourceNames){
    const source=path.join(dir,name);
    if(!fs.existsSync(source))continue;
    const data=fs.readFileSync(source);
    if(!isCanaryOtbm(data))continue;
    return Object.assign(publish(runtimeName,data),{source:name});
  }
  return null;
}
function publishGreed(){
  const canary=publishCanary(
    ["goshnar_greed_room.otbm","goshnars_greed_room.otbm"],
    "goshnars_greed_room");
  if(canary)return canary;
  return writeSynthetic("goshnars_greed_room",
    room("Goshnar's Greed Room",20,14,{x:10,y:12},{x:10,y:2}));
}
function publishCanaryHatred(){
  const canary=publishCanary(
    ["goshnar_hatred_room.otbm","goshnars_hatred_room.otbm"],
    "goshnars_hatred_room");
  if(!canary)throw new Error("fonte Canary Hatred ausente em beta-maps/bossesroom");
  return canary;
}
function publishCanarySpite(){
  const canary=publishCanary(
    ["goshnar_spite_room.otbm","goshnars_spite_room.otbm"],
    "goshnars_spite_room");
  if(!canary)throw new Error("fonte Canary Spite ausente em beta-maps/bossesroom");
  return canary;
}
function publishCanaryMalice(){
  const canary=publishCanary(
    ["goshars_malice_room.otbm","goshnar_malice_room.otbm","goshnars_malice_room.otbm"],
    "goshars_malice_room");
  if(!canary)throw new Error("fonte Canary Malice ausente em beta-maps/bossesroom");
  return canary;
}
function publishCanaryMegalomania(){
  const canary=publishCanary(
    ["goshnars_megalomania.otbm","goshnar_megalomania.otbm"],
    "goshnars_megalomania");
  if(!canary)throw new Error("fonte Canary Megalomania ausente em beta-maps/bossesroom");
  return canary;
}
const result=[publishGreed(),publishCanaryHatred(),publishCanarySpite(),
  publishCanaryMalice(),publishCanaryMegalomania()];
console.log(JSON.stringify(result));
