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
must(html.includes("css/layout.css?v=")&&html.includes("js/ui.js?v=")&&
     html.includes("js/city-ui.js?v="),
  "UI/CSS do catálogo sem cache-busting");
must(css.includes("#hunts-modal-list .hunt-modal-card .mobs") &&
     css.includes("overflow: hidden") &&
     css.includes("#hunts-modal-list .hunt-modal-card .info"),
  "CSS do modal Hunts sem coluna de sprites/texto separados");
must(ui.includes('class="mobs"') && ui.includes('class="info"') &&
     ui.includes("mobImg(m, 24"),
  "card do modal sem regiões sprites|info ou sprites grandes demais");
must(ui.includes("Nível recomendado")&&ui.includes("huntStars"),
  "modal Hunts sem campos Canary (estrelas/nível)");
must(cityUi.includes("data-open-hunts-catalog")&&!cityUi.includes("Object.keys(GAMEDATA.hunts).map"),
  "NPC de viagens ainda expõe a lista completa 7.4");

const expected=[
 ["HUNTS LEVEL 0–100",["rats","amazon-camp"]],
 ["HUNTS 100–250",["minotaur-oramond-east"]],
 ["HUNTS 250+",["mota-extension","cobra-bastion","marapur-nagas","buried-cathedral","ingol-terrain","roshamuul","prison-1","prison-2","prison-3","catacombs-oramond"]],
 ["FERUMBRAS ASCENDANT",["ferumbras-way","dt-seal","juggerseal"]],
 ["LIBRARY SESSION 400+",["library-fire","library-energy","library-ice","library-earth"]],
 ["SOULWAR 400+",["dark-thais","rotten-wasteland","claustrophobic-inferno","ebb-and-flow"]],
];
const start=ui.indexOf("const HUNT_MODAL_SECTIONS");
const end=ui.indexOf("\nfunction openHuntInfoModal",start);
must(start>=0&&end>start,"bloco HUNT_MODAL_SECTIONS não encontrado");
const root={innerHTML:""};
const hunts={};
for(const [,ids] of expected)for(const id of ids)hunts[id]={name:id,level:1,avgExp:10,monsters:["rat"]};
hunts["ebb-and-flow"].comingSoon=true;
// Uma hunt 7.4 existe no GAMEDATA, mas nunca pode aparecer no catálogo.
hunts.spiders={name:"Aranhas 7.4",level:8,avgExp:5,monsters:["spider"]};
const ctx={
 GAMEDATA:{hunts},G:{p:{level:1,hunt:null}},
 $(selector){return selector==="#hunts-modal-list"?root:null;},$$(selector){return [];},
 huntRisk(){return {cls:"low",txt:"seguro"};},mobImg(){return "<i></i>";},fmt(n){return String(n);},
 huntStars(){return 1;},huntStarsHtml(){return "★";},bestiaryStage(){return 1;},charmOnRace(){return null;},
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
must(root.innerHTML.includes("accordion-section") &&
     root.innerHTML.includes('class="hunts-group collapsed"') &&
     root.innerHTML.includes("accordion-head"),
  "abas de categoria sem markup de accordion");
must((root.innerHTML.match(/hunts-group collapsed/g) || []).length === expected.length &&
     !root.innerHTML.includes('aria-expanded="true"'),
  "alguma aba de categoria não está minimizada por padrão");
must(root.innerHTML.includes('class="mobs"')&&root.innerHTML.includes('class="info"'),
  "card sem regiões sprites e texto");
const cardSample=root.innerHTML.match(/<button class="hunt-card[^"]*"[\s\S]*?<\/button>/);
must(cardSample, "nenhum card gerado");
must(/<span class="mobs"[^>]*>[\s\S]*?<\/span>\s*<span class="info"/.test(cardSample[0]),
  "card não é flex row [sprites|info]");
const mobsOnly=(cardSample[0].match(/<span class="mobs"[^>]*>[\s\S]*?<\/span>/)||[""])[0];
must(!mobsOnly.includes('class="nm"')&&!mobsOnly.includes('class="meta"'),
  "texto da hunt vazou para a coluna de sprites");
console.log("OK: botão Demon abre catálogo com "+expected.length+" sessões e as hunts permitidas.");
