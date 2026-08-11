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

const huntsPos=html.indexOf('id="btn-hunts"'),bossesPos=html.indexOf('id="btn-bosses"'),marketPos=html.indexOf('id="btn-market"');
must(huntsPos>0&&bossesPos>huntsPos&&marketPos>bossesPos,
  "abas HUNTS/BOSSES não estão lado a lado na topbar");
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
};
for(const [name,expected] of Object.entries(colors))
 must(hash(path.join(game,"assets","mob",name))===expected,name+" perdeu cores oficiais no moving");
const generator=fs.readFileSync(path.join(__dirname,"colorize_monsters_canary.py"),"utf8");
must(generator.includes('"soulsnatcher": (0, 94, 0, 0)')&&
  generator.includes('"floating-savant": (113, 94, 78, 78)')&&
  generator.includes('"soulsnatcher", "floating-savant"'),
  "gerador não reproduz cores Canary de Soulsnatcher/Floating Savant");

const helperStart=combatSrc.indexOf("function helperPriorityTarget");
const helperEnd=combatSrc.indexOf("\n\nfunction updateCombatMovement",helperStart);
const ctx={};vm.createContext(ctx);vm.runInContext(combatSrc.slice(helperStart,helperEnd),ctx);
const boss={boss:true,hp:100},add={boss:false,hp:100};
must(ctx.helperPriorityTarget({boss:{},mobs:[add,boss]})===boss,
  "Helper não prioriza boss vulnerável");
must(ctx.helperPriorityTarget({boss:{},greed:{immune:true},mobs:[add,boss]})===add,
  "Helper ignora adds necessários durante imunidade do boss");
must((combatSrc.match(/helperPriorityTarget\(c\)/g)||[]).length>=3,
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
  renderSrc.includes("ctx.lineWidth = f.kind ? 3"),
  "números flutuantes continuam pequenos ou sem contorno nítido");
must(html.includes("css/layout.css?v=interface-sharp-v1")&&
  html.includes("js/render.js?v=interface-sharp-v1")&&
  html.includes("js/combat.js?v=boss-priority-v1"),"ajustes visuais sem cache-busting");
console.log("OK: abas HUNTS/BOSSES, cores moving, alvo prioritário, tile 33791 e visual nítido validados.");
