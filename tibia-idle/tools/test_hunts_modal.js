/* Regressão: catálogo único de Hunts por sessão. */
"use strict";
const fs=require("fs"),path=require("path"),vm=require("vm");
const game=path.join(__dirname,"..","game"),js=path.join(game,"js");
function must(v,m){if(!v)throw Error(m);}
const html=fs.readFileSync(path.join(game,"index.html"),"utf8");
const css=fs.readFileSync(path.join(game,"css","layout.css"),"utf8");
const ui=fs.readFileSync(path.join(js,"ui.js"),"utf8");
const gameSrc=fs.readFileSync(path.join(js,"game.js"),"utf8");
const cityUi=fs.readFileSync(path.join(js,"city-ui.js"),"utf8");
must(html.includes('id="btn-hunts"')&&html.includes('class="hunts-demon-icon"'),
  "botão único HUNTS/demon ausente");
must(!html.includes("Áreas de caça")&&!html.includes('id="hunts"'),
  "painel lateral legado de hunts ainda existe");
must(css.includes("@keyframes hunts-demon-walk")&&
     css.includes("../assets/mob/demon.png")&&css.includes(".hunts-modal-shell"),
  "demon animado ou shell do modal sem CSS");
const demon=fs.readFileSync(path.join(game,"assets","mob","demon.png"));
must(demon.readUInt32BE(16)===192&&demon.readUInt32BE(20)===256,
  "sheet do ícone Demon não é 3×4 células de 64px");
must(gameSrc.includes('$("#btn-hunts")')&&gameSrc.includes("openHuntsModal"),
  "botão HUNTS não abre o modal");
must(html.includes("css/layout.css?v=interface-sharp-v2")&&html.includes("js/ui.js?v=hunts-modal-v1")&&
     html.includes("js/city-ui.js?v=hunts-modal-v1"),
  "UI/CSS do catálogo sem cache-busting");
must(cityUi.includes("data-open-hunts-catalog")&&!cityUi.includes("Object.keys(GAMEDATA.hunts).map"),
  "NPC de viagens ainda expõe a lista completa 7.4");

const expected=[
 ["HUNTS LEVEL 0–100",["rats","amazon-camp"]],
 ["HUNTS 100–250",[]],
 ["HUNTS 250+",["mota-extension","cobra-bastion","marapur-nagas"]],
 ["LIBRARY SESSION 400+",["library-fire","library-energy","library-ice","library-earth"]],
 ["SOULWAR 400+",["dark-thais","rotten-wasteland"]],
];
const start=ui.indexOf("const HUNT_MODAL_SECTIONS");
const end=ui.indexOf("\n\n/* ─────────────────",start);
const root={innerHTML:""};
const hunts={};
for(const [,ids] of expected)for(const id of ids)hunts[id]={name:id,level:1,avgExp:10,monsters:["rat"]};
// Uma hunt 7.4 existe no GAMEDATA, mas nunca pode aparecer no catálogo.
hunts.spiders={name:"Aranhas 7.4",level:8,avgExp:5,monsters:["spider"]};
const ctx={
 GAMEDATA:{hunts},G:{p:{level:1,hunt:null}},
 $(selector){return selector==="#hunts-modal-list"?root:null;},$$(selector){return [];},
 huntRisk(){return {cls:"low",txt:"seguro"};},mobImg(){return "<i></i>";},fmt(n){return String(n);},
 openHuntInfoModal(){},console,
};
vm.createContext(ctx);vm.runInContext(ui.slice(start,end),ctx);
const actual=vm.runInContext("HUNT_MODAL_SECTIONS.map(s=>[s.title,s.ids])",ctx);
must(JSON.stringify(actual)===JSON.stringify(expected),"sessões/whitelist de hunts divergentes");
ctx.renderHunts(ctx.G.p);
for(const [,ids] of expected)for(const id of ids)
  must(root.innerHTML.includes(`data-hunt="${id}"`),id+" ausente do modal");
must(!root.innerHTML.includes('data-hunt="spiders"')&&root.innerHTML.includes("Em breve"),
  "hunt 7.4 vazou para o modal ou seção vazia não foi mantida");
console.log("OK: botão Demon abre catálogo com 5 sessões e as 11 hunts permitidas.");
