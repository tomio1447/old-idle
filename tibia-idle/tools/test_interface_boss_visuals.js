/* Regressão: abas Hunts/Bosses, cores, alvo do Helper e nitidez visual. */
"use strict";
const crypto=require("crypto"),fs=require("fs"),path=require("path"),vm=require("vm");
const game=path.join(__dirname,"..","game"),js=path.join(game,"js");
function must(v,m){if(!v)throw Error(m);}
function hash(file){return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");}
function pngSize(file){const b=fs.readFileSync(file);return {w:b.readUInt32BE(16),h:b.readUInt32BE(20)};}
const html=fs.readFileSync(path.join(game,"index.html"),"utf8");
const css=fs.readFileSync(path.join(game,"css","layout.css"),"utf8");
const gameSrc=fs.readFileSync(path.join(js,"game.js"),"utf8");
const combatSrc=fs.readFileSync(path.join(js,"combat.js"),"utf8");
const renderSrc=fs.readFileSync(path.join(js,"render.js"),"utf8");

const layoutPos=html.indexOf('<div class="layout">'),topbar=html.slice(0,layoutPos);
const leftSidePos=html.indexOf('class="left-side-actions"'),
  huntsPos=html.indexOf('id="btn-hunts"'),bossesPos=html.indexOf('id="btn-bosses"'),
  trainingPos=html.indexOf('id="btn-training"');
must(!topbar.includes('id="btn-hunts"')&&!topbar.includes('id="btn-bosses"')&&
  !topbar.includes('id="btn-training"'),"HUNTS/BOSSES/Treino ainda estão na topbar");
must(leftSidePos>layoutPos&&huntsPos>leftSidePos&&bossesPos>huntsPos&&trainingPos>bossesPos&&
  css.includes(".left-side-actions")&&css.includes("grid-template-columns: 1fr"),
  "HUNTS/BOSSES/Treino não estão em coluna na esquerda da tela");
must(!html.includes('id="bosses"')&&!html.includes('data-collapse="bosses"'),
  "painel lateral legado de bosses ainda existe");
must(html.includes('class="bosses-megalomania-icon"')&&
  css.includes("goshnar-s-megalomania-green.png")&&
  css.includes(".catalog-tab-btn")&&css.includes(".bosses-modal-shell"),
  "aba BOSSES não replica estilo animado de HUNTS/Megalomania");
const mega=pngSize(path.join(game,"assets","mob","goshnar-s-megalomania-green.png"));
must(mega.w===192&&mega.h===256,"sheet do ícone Goshnar Megalomania inválido");
must(gameSrc.includes('$("#btn-bosses")')&&gameSrc.includes("openBossesCatalogModal")&&
  gameSrc.includes('$("#bosses-modal-list")'),"aba BOSSES não abre/renderiza modal próprio");

const colors={
 "soulsnatcher.png":"3342bd4cb128f332716ee3b062daba8cafc54c80ddaa32df38121895d365683b",
 "floating-savant.png":"70fd055fd2b562b4f2e92a55fd8fba94f1a9968e9c9ade9bd97f9062dec0750d",
 "fury.png":"d6ed16d88f6ca34aae2ba504529bdaabb713abcfebdcbea793d62af7ab99f6a7",
};
for(const [name,expected] of Object.entries(colors))
 must(hash(path.join(game,"assets","mob",name))===expected,name+" perdeu cores oficiais no moving");
const generator=fs.readFileSync(path.join(__dirname,"colorize_monsters_canary.py"),"utf8");
must(generator.includes('"soulsnatcher": (0, 94, 0, 0)')&&
  generator.includes('"floating-savant": (113, 94, 78, 78)')&&
  generator.includes('"fury": (94, 77, 78, 79)')&&
  generator.includes('"soulsnatcher", "floating-savant", "fury"')&&
  generator.includes('"fury": 1')&&pngSize(path.join(game,"assets","mob","fury.png")).w===123,
  "gerador não reproduz cores/addon Canary de Soulsnatcher/Floating Savant/Fury");

const helperStart=combatSrc.indexOf("const PACK_SEARCH_R");
const helperEnd=combatSrc.indexOf("\n\nfunction updateCombatMovement",helperStart);
const ctx={};vm.createContext(ctx);vm.runInContext(combatSrc.slice(helperStart,helperEnd),ctx);
const boss={boss:true,hp:100},add={boss:false,hp:100,slug:"dreadful-harvester"},
  beast={boss:false,hp:100,slug:"greedbeast"};
must(ctx.helperPriorityTarget({boss:{},mobs:[add,boss]})===boss,
  "Helper não prioriza boss vulnerável");
must(ctx.helperPriorityTarget({boss:{},greed:{immune:true},mobs:[add,beast,boss]})===beast,
  "Helper foca Greedy Beast durante imunidade do Greed");
must(ctx.helperPriorityTarget({boss:{},greed:{immune:true},mobs:[add,boss]})===add,
  "Helper cai no add quando não há Greedy Beast vivo");
must((combatSrc.match(/helperPriorityTarget\(c/g)||[]).length>=3,
  "movimento/ataques ativo e aliado não compartilham prioridade do boss");

const anim=path.join(game,"assets","tiles","33791_anim.png"),animSize=pngSize(anim);
must(animSize.w===480&&animSize.h===32&&
  hash(anim)==="c4dcf73a788b74501f2db919f0d5b46b2186563e4ec3393fafaa16fd7cb1f84f",
  "strip animado do item 33791 inválido");
const tileAnim=fs.readFileSync(path.join(js,"tileanimdata.js"),"utf8");
must(tileAnim.includes('"33791":{"af":15,"aw":32,"ah":32}'),
  "metadata da animação 33791 ausente");

must(css.includes("image-rendering: pixelated")&&css.includes("image-rendering: crisp-edges")&&
  renderSrc.includes('const ASSET_VERSION = "42";'),"canvas/assets continuam embaçados");
must(renderSrc.includes('return "bold 16px Verdana"')&&
  (renderSrc.match(/ctx\.font = floaterFont\(f\)/g)||[]).length===2&&
  renderSrc.includes("ctx.lineWidth = f.kind ? 3")&&renderSrc.includes("vy: -0.0035"),
  "números flutuantes continuam rápidos, pequenos ou sem contorno nítido");

const visualStart=gameSrc.indexOf("function normalizedCombatElement");
const visualEnd=gameSrc.indexOf("\nfunction drainEvents",visualStart);
const visualCtx={};vm.createContext(visualCtx);vm.runInContext(gameSrc.slice(visualStart,visualEnd),visualCtx);
const sameTick=[
  {t:"hit",targetId:"monster-a",el:"physical",dmg:100},
  {t:"hit",targetId:"monster-a",el:"physical",dmg:50},
  {t:"hit",targetId:"monster-a",el:"ice",dmg:40},
  {t:"hit",targetId:"monster-a",el:"frost",dmg:60},
  {t:"hit",targetId:"monster-a",el:"fire",dmg:20},
  {t:"hit",targetId:"monster-b",el:"ice",dmg:8},
];
const grouped=visualCtx.aggregateCombatVisualEvents(sameTick),totals={};
for(const group of grouped.groups.values())totals[group.channel+":"+group.first.targetId]=group.total;
must(totals["physical:monster-a"]===150&&totals["ice:monster-a"]===100&&
  totals["fire:monster-a"]===20&&totals["ice:monster-b"]===8&&grouped.groups.size===4,
  "combo visual não soma party por alvo/elemento ou misturou físico/elemental");
must(gameSrc.includes("isComboLead")&&gameSrc.includes("addCombatHitLog")&&
  renderSrc.includes("ef.comboKey === comboKey"),
  "combo físico deve agrupar FX/log no lead");
let missingIdentity=false;
for(const match of combatSrc.matchAll(/events\.push\(\{\s*t:\s*"hit"[\s\S]{0,260}?\}\);/g))
  if(!match[0].includes("targetId:"))missingIdentity=true;
must(!missingIdentity,"evento hit sem identidade estável do alvo");

must(html.includes("css/layout.css?v=")&&
  (html.includes("js/render.js?v=phys-hit-combo-v1")||html.includes("js/render.js?v="))&&
  html.includes("js/combat.js?v="),"ajustes visuais sem cache-busting");
console.log("OK: navegação esquerda, combo por alvo/elemento, Fury e visual nítido validados.");
