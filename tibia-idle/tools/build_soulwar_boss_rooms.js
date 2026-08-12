/* Gera boss rooms próprias e determinísticas para Goshnar's Greed/Hatred. */
"use strict";
const fs=require("fs"),path=require("path");
const OTBM=require("../game/js/otbm.js");
const root=path.join(__dirname,"..","game");
const FLOOR=22893,WALL=26995,PILLAR=33242,ALT=13235,FIRE=9890;
function room(name,w,h,spawn,boss,kind){
  const cells={};
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const border=x===0||y===0||x===w-1||y===h-1;
    cells[x+","+y]={g:(x+y)%7===0?ALT:FLOOR,items:border?[WALL]:[]};
  }
  if(kind==="greed"){
    // Quatro ilhas/vórtices laterais e corredor central aberto até o boss.
    for(const [x,y] of [[3,3],[4,3],[15,3],[16,3],[3,9],[4,9],[15,9],[16,9]])
      cells[x+","+y].items=[PILLAR];
  }else{
    // Hatred: dois pilares e a fogueira central, layout diferente de Greed.
    for(let y=4;y<=9;y++)for(const x of [6,11])if(y!==6&&y!==7)cells[x+","+y].items=[PILLAR];
    cells[8+","+6].items=[FIRE];cells[9+","+6].items=[FIRE];
    cells[8+","+7].items=[FIRE];cells[9+","+7].items=[FIRE];
  }
  return {w,h,z:7,name,desc:"Dedicated Soul War boss room: "+name,
    spawn,mob:[boss],cells};
}
function write(file,map){const data=Buffer.from(new Uint8Array(OTBM.write(map)));
  const runtime=path.join(root,"maps",file+".otbm");fs.writeFileSync(runtime,data);
  const beta=path.join(root,"beta-maps","bossesroom",file+".otbm");fs.mkdirSync(path.dirname(beta),{recursive:true});fs.writeFileSync(beta,data);
  return {file,bytes:data.length,sha256:require("crypto").createHash("sha256").update(data).digest("hex")};
}
const result=[
  write("goshnars_greed_room",room("Goshnar's Greed Room",20,14,{x:10,y:12},{x:10,y:2},"greed")),
  write("goshnars_hatred_room",room("Goshnar's Hatred Room",18,14,{x:2,y:7},{x:15,y:7},"hatred")),
];
console.log(JSON.stringify(result));
