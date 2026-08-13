/* Regressão: Influenced/Fiendish mantêm poeira animada nos dois lados. */
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
must(influenced1.length===5&&influenced5.length===9&&fiendish.length===12&&normal.length===0,
  "quantidade de poeira não diferencia stacks/Fiendish");
must(fiendish.some((point)=>point.x<100)&&fiendish.some((point)=>point.x>100),
  "poeira não aparece nos dois lados do monstro");
must(JSON.stringify(fiendish)!==JSON.stringify(paint({id:"fiend",fiendish:true,sinisterStacks:15},1500)),
  "poeira está parada em vez de animada");
const call=source.lastIndexOf("drawSinisterDust(ctx,ent,cx,cy,tile,Date.now())"),
  entities=source.indexOf("const depthEntities = buildRenderEntities"),
  objects=source.indexOf('drawTileCharMap(ctx, combat.huntMap, W, H, gridW, gridH, "objects")',entities);
must(call>entities&&call<objects,"poeira não está na camada das criaturas");
must(html.includes("js/render.js?v=sinister-dust-v1"),"render.js sem cache-bust da poeira");
console.log("OK: poeira Influenced/Fiendish aparece animada nos dois lados da criatura.");
