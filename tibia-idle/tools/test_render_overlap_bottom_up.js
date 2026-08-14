/* Regressão: painter order usa a base das criaturas, inclusive sprites 2x2. */
"use strict";
const fs=require("fs"),path=require("path"),vm=require("vm");
const source=fs.readFileSync(path.join(__dirname,"..","game","js","render.js"),"utf8");
const html=fs.readFileSync(path.join(__dirname,"..","game","index.html"),"utf8");
const anchorSource=fs.readFileSync(path.join(__dirname,"..","game","js","creatureanchordata.js"),"utf8");
function must(ok,message){if(!ok)throw Error(message);}
const anchorCtx={window:{}};vm.createContext(anchorCtx);vm.runInContext(anchorSource,anchorCtx);
must(anchorCtx.window.CREATURE_ANCHORS.demon.sw===64&&anchorCtx.window.CREATURE_ANCHORS.demon.sh===64,
  "fixture Demon deixou de ser uma criatura visual 2x2");
const start=source.indexOf("function buildRenderEntities"),end=source.indexOf("\n/* A paleta",start);
must(start>=0&&end>start,"buildRenderEntities ausente");
const ctx={};vm.createContext(ctx);vm.runInContext(source.slice(start,end),ctx);
const active={id:"p1",x:.4,y:.5,p:{id:"p1",hp:100}},ally={id:"p2",x:.4,y:.7,p:{id:"p2",hp:100}};
const combat={player:active,players:[active,ally],mobs:[
  {id:"top-1x1",slug:"rat",x:.4,y:.2,hp:100},
  {id:"same-1x1",slug:"rat",x:.4,y:.5,hp:100},
  // Demon 64x64: a base está abaixo do outfit e sua cabeça invade as linhas
  // anteriores. Ele precisa ser pintado por último para não ficar sob o vestido.
  {id:"bottom-demon-2x2",slug:"demon",x:.4,y:.9,hp:100},
]};
const queue=ctx.buildRenderEntities(combat,active.p);
must(queue.map((item)=>item.id).join(",")==="top-1x1,same-1x1,active,p2,bottom-demon-2x2",
  "painter order não desenha das bases superiores para as inferiores");
must(queue.every((item,index)=>index===0||queue[index-1].footY<=item.footY),
  "ordem vertical da fila não é crescente");
must(queue[queue.length-1].ent.slug==="demon",
  "Demon 2x2 abaixo do outfit não é pintado por último");
must(source.includes("for (const info of entityInfo) {"),
  "labels precisam da mesma fila bottom-up das sprites");
must(!source.includes("occupiedLabels"),
  "labels ainda empilham fora da sprite como HUD independente");
must(html.includes("js/render.js?v=knight-fx-combo-v1"),"render.js sem cache-bust da profundidade 2x2");
console.log("OK: bases inferiores cobrem as superiores, incluindo Demon 2x2, sem inverter labels.");
