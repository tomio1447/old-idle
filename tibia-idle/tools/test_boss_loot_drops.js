/* Regressão: loots de boss ajustados a pedido do jogador.
 *
 *  1) Timira the Many-Headed dropa Naga Katar (0.2%, mesmo padrão das outras
 *     armas naga do loot oficial) — item registrado no catálogo (fist, monk).
 *  2) Bag You Desire dos bosses Soul War mantém o % correto e EXIBIDO:
 *     0.1% nos mini-bosses (Greed/Hatred/Spite/Malice) e 0.15% no
 *     Megalomania (soulwar.js) — label de % sempre visível no modal.
 *  3) Phantasmal Axe do The Pale Worm: 0.15% (TibiaWiki: só Brain Head e
 *     Pale Worm dropam) — mesma exibição de % garantida.
 *  4) Cobra Bo (Scarlett Etzel): 1% de chance de drop (era 0.6%).
 */
"use strict";
const fs=require("fs"),path=require("path"),vm=require("vm");
const js=path.join(__dirname,"..","game","js");
const engine=require("../server/authoritative_engine.js");
function must(ok,msg){if(!ok)throw Error(msg);}

/* ---------------- cliente (vm, mesma ordem do index) ---------------- */
const ctx={window:{},console,Math,Date,Map,Set,document:undefined};ctx.window=ctx;vm.createContext(ctx);
for(const f of ["gamedata.js","monsterdata.js","mobsheetdata.js","monsters.js","soulwar.js","tileflags.js"])
  vm.runInContext(fs.readFileSync(path.join(js,f),"utf8"),ctx,{filename:f});
vm.runInContext("GAMEDATA=window.GAMEDATA;",ctx);
vm.runInContext(fs.readFileSync(path.join(js,"weapondata.js"),"utf8"),ctx,{filename:"weapondata.js"});
vm.runInContext("WEAPONDATA=window.WEAPONDATA;",ctx);
vm.runInContext(fs.readFileSync(path.join(js,"weapons.js"),"utf8"),ctx,{filename:"weapons.js"});
const M=ctx.GAMEDATA.monsters,items=ctx.GAMEDATA.items;

function lootOf(slug,item){return (M[slug]&&M[slug].loot||[]).find((l)=>l&&l.item===item)||null;}

/* 1) Timira + naga katar */
const nk=lootOf("timira-the-many-headed","naga-katar");
must(nk&&nk.chance===0.2&&nk.max===1,"naga katar não está no loot da Timira a 0.2%");
must(items["naga-katar"]&&items["naga-katar"].t==="fist"&&items["naga-katar"].atk===44,
  "naga katar não entrou no catálogo (fist, atk 44)");
must(fs.existsSync(path.join(__dirname,"..","game","assets","item","naga-katar.png")),
  "sprite do naga katar ausente");

/* 2) bags Soul War: % corretos nos dados */
for(const slug of ["goshnar-s-greed","goshnar-s-hatred","goshnar-s-spite","goshnar-s-malice"]){
  const bag=lootOf(slug,"bag-you-desire");
  must(bag&&bag.chance===0.1,slug+" bag-you-desire deveria ser 0.1%");
}
const megaBag=lootOf("goshnar-s-megalomania-green","bag-you-desire");
must(megaBag&&megaBag.chance===0.15,"Megalomania bag-you-desire deveria ser 0.15% (soulwar)");

/* 3) phantasmal axe do Pale Worm */
const axe=lootOf("the-pale-worm","phantasmal-axe");
must(axe&&axe.chance===0.15,"phantasmal axe do Pale Worm deveria ser 0.15%");

/* 4) cobra bo da Scarlett a 1% */
const bo=lootOf("scarlett-etzel","cobra-bo");
must(bo&&bo.chance===1,"cobra bo da Scarlett deveria ser 1%");

/* ---------------- servidor (engine lê canarymonsters.json) ---------------- */
const enk=(engine.MONSTERS["timira-the-many-headed"].loot||[]).find((l)=>l.item==="naga-katar");
must(enk&&enk.chance===0.2,"engine: naga katar não está no loot da Timira a 0.2%");
const ebo=(engine.MONSTERS["scarlett-etzel"].loot||[]).find((l)=>l.item==="cobra-bo");
must(ebo&&ebo.chance===1,"engine: cobra bo da Scarlett deveria ser 1%");
for(const slug of ["goshnar-s-greed","goshnar-s-hatred","goshnar-s-spite","goshnar-s-malice"]){
  const bag=(engine.MONSTERS[slug].loot||[]).find((l)=>l.item==="bag-you-desire");
  must(bag&&bag.chance===0.1,"engine: "+slug+" bag 0.1%");
}
const eaxe=(engine.MONSTERS["the-pale-worm"].loot||[]).find((l)=>l.item==="phantasmal-axe");
must(eaxe&&eaxe.chance===0.15,"engine: phantasmal axe do Pale Worm 0.15%");

/* ---------------- exibição: label de % sempre visível no modal ---------------- */
const gameSrc=fs.readFileSync(path.join(js,"game.js"),"utf8");
const uiSrc=fs.readFileSync(path.join(js,"ui.js"),"utf8");
const css=fs.readFileSync(path.join(__dirname,"..","game","css","layout.css"),"utf8");
must(gameSrc.includes("loot-with-chance")&&gameSrc.includes('<span class="loot-chance">${pct}%</span>'),
  "boss modal sem label de % de drop sempre visível");
must(uiSrc.includes("loot-with-chance")&&uiSrc.includes('<span class="loot-chance">${Number(l.chance) || 0}%</span>'),
  "hunt modal sem label de % de drop sempre visível");
must(css.includes(".hunt-loot-slot .loot-chance{")&&css.includes("pointer-events:none"),
  "css do label de % ausente");

console.log("ok: naga katar na Timira (0.2%), cobra bo 1%, bags soul 0.1/0.15 e phantasmal axe 0.15 exibidos");
