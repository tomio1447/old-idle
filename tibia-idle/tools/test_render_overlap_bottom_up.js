/* Regressão: sprites usam a fila de profundidade solicitada, de baixo para cima. */
"use strict";
const fs=require("fs"),path=require("path"),vm=require("vm");
const source=fs.readFileSync(path.join(__dirname,"..","game","js","render.js"),"utf8");
const html=fs.readFileSync(path.join(__dirname,"..","game","index.html"),"utf8");
function must(ok,message){if(!ok)throw Error(message);}
const start=source.indexOf("function buildRenderEntities"),end=source.indexOf("\n/* A paleta",start);
must(start>=0&&end>start,"buildRenderEntities ausente");
const ctx={};vm.createContext(ctx);vm.runInContext(source.slice(start,end),ctx);
const active={id:"p1",x:.4,y:.5,p:{id:"p1",hp:100}},ally={id:"p2",x:.4,y:.7,p:{id:"p2",hp:100}};
const combat={player:active,players:[active,ally],mobs:[
  {id:"top",x:.4,y:.2,hp:100},
  {id:"same",x:.4,y:.5,hp:100},
  {id:"bottom",x:.4,y:.9,hp:100},
]};
const queue=ctx.buildRenderEntities(combat,active.p);
must(queue.map((item)=>item.id).join(",")==="bottom,p2,same,active,top",
  "sprites não são enfileiradas de baixo para cima pelo Y dos pés");
must(queue.every((item,index)=>index===0||queue[index-1].footY>=item.footY),
  "ordem vertical da fila não é decrescente");
must(source.includes("for (const info of entityInfo) {")&&
  source.includes("for (let i = entityInfo.length - 1; i >= 0; i--)"),
  "reordenação das sprites quebrou a prioridade dos labels");
must(html.includes("js/render.js?v=overlap-bottom-up-v1"),"render.js sem cache-bust da sobreposição");
console.log("OK: imagens sobrepõem de baixo para cima sem inverter os labels.");
