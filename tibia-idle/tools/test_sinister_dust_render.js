/* Regressão: Influenced/Fiendish mantêm a poeira Canary animada e visível. */
"use strict";
const fs=require("fs"),path=require("path"),vm=require("vm");
const game=path.join(__dirname,"..","game"),source=fs.readFileSync(path.join(game,"js","render.js"),"utf8"),
  html=fs.readFileSync(path.join(game,"index.html"),"utf8");
function must(value,message){if(!value)throw Error(message);}
const start=source.indexOf("function drawSinisterDust"),end=source.indexOf("\n\nRenderer.prototype.draw",start);
must(start>=0&&end>start,"drawSinisterDust ausente do renderer");
const ctx={};vm.createContext(ctx);vm.runInContext(source.slice(start,end),ctx);
function paint(ent,now){
  const points=[],draw={save(){},restore(){},fillRect(x,y,w,h){points.push({x,y,w,h});},
    set fillStyle(value){},set shadowColor(value){},set shadowBlur(value){},set globalAlpha(value){}};
  ctx.drawSinisterDust(draw,ent,100,100,32,now);
  return points;
}
const influenced1=paint({id:"inf-1",influenced:true,sinisterStacks:1},1000);
const influenced5=paint({id:"inf-5",influenced:true,sinisterStacks:5},1000);
const fiendish=paint({id:"fiend",fiendish:true,sinisterStacks:15},1000);
const normal=paint({id:"normal"},1000);
must(influenced1.length===6&&influenced5.length===10&&fiendish.length===14&&normal.length===0,
  "quantidade de poeira não diferencia stacks/Fiendish");
must(fiendish.every((point)=>point.x>100),
  "poeira Canary não permanece visível à direita do monstro");
must(JSON.stringify(fiendish)!==JSON.stringify(paint({id:"fiend",fiendish:true,sinisterStacks:15},1500)),
  "poeira está parada em vez de animada");
const call=source.lastIndexOf("drawSinisterDust(ctx, info.ent, info.cx, info.cy, info.tile, Date.now())"),
  entities=source.indexOf("const depthEntities = buildRenderEntities"),
  objects=source.indexOf('drawTileCharMap(ctx, combat.huntMap, W, H, gridW, gridH, "objects")',entities),
  bossbar=source.indexOf("drawBossBar(ctx, canvasW",objects);
must(call>objects&&call<bossbar,"poeira não está visível acima dos objetos e abaixo da UI");
must(html.includes("js/render.js?v=overlap-bottom-up-v1"),"render.js sem cache-bust visual");
console.log("OK: poeira Influenced/Fiendish Canary aparece animada e visível.");
