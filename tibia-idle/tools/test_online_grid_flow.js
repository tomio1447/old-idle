/* Regressão: snapshots online empilhados são separados antes da IA visual. */
"use strict";
const fs=require("fs"),path=require("path"),vm=require("vm");
const source=fs.readFileSync(path.join(__dirname,"..","game","js","grid.js"),"utf8");
const gridAi=fs.readFileSync(path.join(__dirname,"..","game","js","gridai.js"),"utf8");
const html=fs.readFileSync(path.join(__dirname,"..","game","index.html"),"utf8");
function must(ok,message){if(!ok)throw Error(message);}
const ctx={console,Math,Map,Set,Date};vm.createContext(ctx);vm.runInContext(source,ctx);
const make=(id,kind)=>Object.assign({id,cx:10,cy:6,x:(10.5/21),y:(6.5/13),sx:(10.5/21),sy:(6.5/13),moving:true},
  kind==="mob"?{slug:"demon",hp:100}:{p:{id,hp:100}});
const active=make("p1","player"),ally=make("p2","player"),mobA=make("m1","mob"),mobB=make("m2","mob"),
  combat={player:active,players:[active,ally],mobs:[mobA,mobB],huntMap:null};
const repaired=ctx.repairOverlappingGridEntities(combat),keys=[active,ally,mobA,mobB].map((ent)=>ent.cx+":"+ent.cy);
must(repaired===3&&new Set(keys).size===4,"estado empilhado não foi separado em SQMs únicos");
must([active,ally,mobA,mobB].every((ent)=>Number.isFinite(ent.x)&&Number.isFinite(ent.y))&&
  [ally,mobA,mobB].every((ent)=>!ent.moving),
  "reparo de sobreposição deixou interpolação/posição inválida");
must(gridAi.includes("const authoritativeTarget=m.targetId&&c.players")&&
  gridAi.includes("authoritativeTarget||monsterReachableTarget"),
  "IA visual não segue o targetId decidido pela autoridade");
must(html.includes("js/grid.js?v=knight-fx-combo-v1")&&html.includes("js/gridai.js?v=sqm-hud-v1")&&
  html.includes("js/game.js?v=knight-fx-combo-v2"),"assets do fluxo online sem cache-bust");
const ui=fs.readFileSync(path.join(__dirname,"..","game","js","ui.js"),"utf8");
must(ui.includes("COMBO_DRAG_FROM")&&ui.includes('setData("text/plain"')&&
  ui.includes("dropEffect = \"move\""),
  "arraste da barra de combo ainda depende de MIME customizado no dragover");
console.log("OK: party/mobs são separados e perseguem a vítima autoritativa.");
