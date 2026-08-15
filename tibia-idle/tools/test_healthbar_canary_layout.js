/* Healthbars no layout Creature::drawInformation do OTC/Canary.
 * Nome+HP presos à sprite interpolada; overlap é permitido (o client não
 * empilha labels). Clamp só na borda da viewport. */
"use strict";
const fs=require("fs"),path=require("path"),vm=require("vm");
const source=fs.readFileSync(path.join(__dirname,"..","game","js","render.js"),"utf8");
const html=fs.readFileSync(path.join(__dirname,"..","game","index.html"),"utf8");
function must(ok,msg){if(!ok)throw Error(msg);}
must(/const TIBIA_BAR_W = 31/.test(source)&&/const TIBIA_BAR_INNER_W = 29/.test(source),
  "barra não está 31x4 / inner 29 como no Canary");
must(source.includes("TIBIA_MIN_NAME_BAR = 2"),"gap nome-barra diferente de 2px");
must(source.includes("function layoutCreatureInformation"),"layout Canary ausente");
must(source.includes("function monsterRenderName"),"nome do mob não amarra no slug da sprite");
must(!source.includes("occupiedLabels"),
  "ainda empilha labels como HUD independente (OTC não faz isso)");
must(!source.includes("Math.abs(prev.x - info.cx) < 42"),
  "ainda empurra barras de SQMs vizinhos");
must(html.includes("js/render.js?v=knight-fx-combo-v1"),"render.js sem cache-bust das barras");
must(html.includes("css/layout.css?v=npc-buttons-v1")&&html.includes("js/city-render.js?v=npc-buttons-v1"),
  "FULLHD HUD sem cache-bust de CSS/cidade");
const css=fs.readFileSync(path.join(__dirname,"..","game","css","layout.css"),"utf8");
must(css.includes("body.fullhd .bar .label")&&css.includes("body.fullhd .log-line")&&
  css.includes("body.fullhd .party-panel"),
  "CSS FULLHD não aumenta healthbars/logs/party da UI");

const start=source.indexOf("const TIBIA_BAR_W = 31");
const end=source.indexOf("function tibiaHpColor");
must(start>=0&&end>start,"bloco de layout não encontrado");
const ctx={Math,String,Number};vm.createContext(ctx);vm.runInContext(source.slice(start,end),ctx);

const low={e:{kind:"monster"},name:"Rat",cx:100,top:80,h:32,tile:32};
const high={e:{kind:"monster"},name:"Demon",cx:100,top:80,h:64,tile:32};
const a=ctx.layoutCreatureInformation(low,400,300);
const b=ctx.layoutCreatureInformation(high,400,300);
must(a.box.h>=4+2+9,"bloco nome+barra menor que o Canary");
must(Math.abs(b.barY-a.barY)<1,
  "criaturas sobrepostas deslocaram a barra — OTC deixa cobrir no mesmo dest");
must(Math.abs(a.nameX-low.cx)<1&&Math.abs(a.barX-low.cx)<1,
  "nome/barra não usam o cx interpolado da sprite");
must(a.barY>=a.nameY,"barra ficou acima do nome");

const side={e:{kind:"monster"},name:"Rat",cx:100+40,top:80,h:32,tile:32};
const c=ctx.layoutCreatureInformation(side,400,300);
must(Math.abs(c.barY-a.barY)<1,"SQM vizinho teve a barra empurrada");

const walked={e:{kind:"monster"},name:"Rat",cx:140,top:92,h:32,tile:32};
const w=ctx.layoutCreatureInformation(walked,400,300);
must(Math.abs(w.nameX-140)<1&&w.barY>a.barY,
  "barra não acompanhou o passo interpolado (cx/top da sprite)");

const edge={e:{kind:"monster"},name:"Rat",cx:50,top:2,h:32,tile:32};
const d=ctx.layoutCreatureInformation(edge,400,300);
must(d.nameY-9>=0&&d.barY>=0,"label não foi preso à borda da viewport");

const player={e:{kind:"player"},name:"Kina",cx:80,top:80,h:32,tile:32,mpPct:1,shieldPct:0.5};
const p=ctx.layoutCreatureInformation(player,400,300);
must(p.box.h>a.box.h,"mana/escudo não empilharam colados na HP");

const scaled=ctx.layoutCreatureInformation(low,400,300,2);
must(scaled.box.h>=a.box.h*1.8&&scaled.scale===2,
  "healthbar FULLHD não acompanhou o DPR (hudScale 2x)");
must(source.includes("function canvasHudScale")&&source.includes("function floaterFont"),
  "overlay FULLHD sem escala de fonte/barra");

const savant={slug:"floating-savant",def:{name:"Demon",looktype:35}};
must(ctx.monsterRenderName(savant)==="floating-savant"||ctx.monsterRenderName(savant)==="Floating Savant",
  "nome ainda sai do def velho em vez do slug da sprite");
must(ctx.monsterRenderName({slug:"demon",def:{name:"Demon"}})==="Demon",
  "Demon perdeu o nome do catálogo/def");
console.log("OK: healthbars 31x4, gap 2px, presas à sprite, overlap Canary sem empilhar.");
