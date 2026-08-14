/* Regressão: Influenced/Fiendish mantêm a poeira Canary animada e visível. */
"use strict";
const fs=require("fs"),path=require("path"),vm=require("vm");
const game=path.join(__dirname,"..","game"),source=fs.readFileSync(path.join(game,"js","render.js"),"utf8"),
  html=fs.readFileSync(path.join(game,"index.html"),"utf8");
function must(value,message){if(!value)throw Error(message);}
must(fs.existsSync(path.join(game,"assets","ui","icons","influenced-creature.png"))&&
  fs.existsSync(path.join(game,"assets","ui","icons","fiendish-creature.png")),
  "assets oficiais dos marcadores Influenced/Fiendish ausentes");
const start=source.indexOf("function drawSinisterDust"),end=source.indexOf("Renderer.prototype.draw = function (combat",start);
must(start>=0&&end>start,"drawSinisterDust ausente do renderer");
const ctx={};vm.createContext(ctx);vm.runInContext(source.slice(start,end),ctx);
function paint(ent,now){
  const points=[],texts=[];
  const draw={save(){},restore(){},fillRect(x,y,w,h){points.push({x,y,w,h});},
    strokeText(text,x,y){texts.push({text:String(text),x,y});},
    fillText(text,x,y){texts.push({text:String(text),x,y});},
    set fillStyle(value){},set shadowColor(value){},set shadowBlur(value){},set globalAlpha(value){},
    set font(value){},set textAlign(value){},set textBaseline(value){},set lineJoin(value){},
    set strokeStyle(value){},set lineWidth(value){}};
  ctx.drawSinisterDust(draw,ent,100,100,32,now);
  return {points,texts};
}
const influenced1=paint({id:"inf-1",influenced:true,sinisterStacks:1},1000);
const influenced5=paint({id:"inf-5",influenced:true,sinisterStacks:5},1000);
const fiendish=paint({id:"fiend",fiendish:true,sinisterStacks:15},1000);
const normal=paint({id:"normal"},1000);
must(influenced1.points.length===6&&influenced5.points.length===10&&fiendish.points.length===14&&normal.points.length===0,
  "quantidade de poeira não diferencia stacks/Fiendish");
must(influenced1.texts.some((t)=>t.text==="1")&&influenced5.texts.some((t)=>t.text==="5"),
  "Influenced não mostra o número de dusts/stacks");
must(!fiendish.texts.some((t)=>t.text==="15"),
  "Fiendish não deve desenhar o número 15 em cima da poeira");
must(fiendish.points.every((point)=>point.x>100),
  "poeira Canary não permanece visível à direita do monstro");
must(JSON.stringify(fiendish.points)!==JSON.stringify(paint({id:"fiend",fiendish:true,sinisterStacks:15},1500).points),
  "poeira está parada em vez de animada");
const iconStart=source.indexOf("function drawSinisterCreatureIcon"),iconEnd=source.indexOf("function drawSinisterDust",iconStart+1),iconCalls=[];
must(iconStart>=0&&iconEnd>iconStart,"ícone Influenced/Fiendish ausente do renderer");
const iconCtx={Math,drawWikiIcon:(draw,slug,x,y,size)=>{iconCalls.push({slug,x,y,size});return true;}};
vm.createContext(iconCtx);vm.runInContext("const TIBIA_BAR_W=31;\n"+source.slice(iconStart,iconEnd),iconCtx);
const iconTexts=[];
iconCtx.drawSinisterCreatureIcon({
  save(){},restore(){},strokeText(text){iconTexts.push(String(text));},fillText(text){iconTexts.push(String(text));},
  set font(v){},set textAlign(v){},set textBaseline(v){},set lineJoin(v){},set strokeStyle(v){},set lineWidth(v){},
  set fillStyle(v){}
}, {influenced:true,sinisterStacks:3},100,80);
iconCtx.drawSinisterCreatureIcon({}, {influenced:true,fiendish:true},100,80);
iconCtx.drawSinisterCreatureIcon({}, {},100,80);
must(iconCalls.length===2&&iconCalls[0].slug==="influenced-creature"&&
  iconCalls[1].slug==="fiendish-creature"&&iconCalls.every((call)=>call.size===11&&call.x>100),
  "marcador oficial azul/vermelho não acompanha a barra do monstro");
must(iconTexts.includes("3"),"ícone Influenced não desenha o número de stacks");
const call=source.lastIndexOf("drawSinisterDust(ctx, info.ent, info.cx, info.cy, info.tile, Date.now())"),
  entities=source.indexOf("const depthEntities = buildRenderEntities"),
  objects=source.indexOf('drawTileCharMap(ctx, combat.huntMap, W, H, gridW, gridH, "objects")',entities),
  bossbar=source.indexOf("drawBossBar(ctx, canvasW",objects);
must(call>objects&&call<bossbar,"poeira não está visível acima dos objetos e abaixo da UI");
must(source.lastIndexOf("drawSinisterCreatureIcon(ctx,info.ent,barX,barY")>bossbar,
  "ícone de criatura não está na camada de UI acima do mapa");
must(html.includes("js/render.js?v=knight-fx-combo-v1"),"render.js sem cache-bust visual");
console.log("OK: ícone e poeira Influenced/Fiendish aparecem animados e visíveis.");
