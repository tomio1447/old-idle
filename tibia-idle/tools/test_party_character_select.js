/* Troca de personagem na party não cai no picker; lista e look ao vivo. */
"use strict";
const fs=require("fs"),path=require("path"),vm=require("vm");
const root=path.join(__dirname,".."),gameDir=path.join(root,"game");
const game=fs.readFileSync(path.join(gameDir,"js","game.js"),"utf8");
const partyUi=fs.readFileSync(path.join(gameDir,"js","party-ui.js"),"utf8");
const partyServer=fs.readFileSync(path.join(root,"server","party.js"),"utf8");
const css=fs.readFileSync(path.join(gameDir,"css","layout.css"),"utf8");
const index=fs.readFileSync(path.join(gameDir,"index.html"),"utf8");
function must(ok,msg){if(!ok)throw Error(msg);}

must(game.includes("G.combat&&(partyEntity||partyMember)")&&
  partyUi.includes('sessionStorage.setItem("tibia-idle-online-autoload"')&&
  game.includes('sessionStorage.setItem("tibia-idle-online-autoload"'),
  "troca na party ainda pode reabrir o picker da tela inicial");
must(game.includes("account-character-list-head")&&game.includes("account-character-name")&&
  game.includes("account-character-voc")&&game.includes("account-character-level")&&
  css.includes("flex-direction: column")&&css.includes(".account-character-voc"),
  "seletor de personagem não está em lista outfit/nome/vocação/level");
must(partyUi.includes("partyApplyOutfitPreview")&&
  partyUi.includes("source.outfit||summary&&summary.outfit||member.outfit")&&
  partyUi.includes("data-party-preview")&&
  partyServer.includes("outfit.appearance=raw.appearance")&&
  partyServer.includes("outfit.addons=Math.max")&&
  (partyServer.includes('sex:data.sex==="female"?"female":"male"')||
   partyServer.includes('sex: data.sex === "female" ? "female" : "male"')),
  "modal/painel da party não publicam o look atual");
must(index.includes("js/party-ui.js?v=party-switch-v1")&&
  index.includes("js/game.js?v=party-switch-v1")&&
  index.includes("css/layout.css?v=party-list-v1"),
  "assets da correção sem cache-bust");

const start=partyUi.indexOf("function partyLookKey"),
  end=partyUi.indexOf("\nfunction partyPaintMemberLooks",start);
must(start>=0&&end>start,"partyApplyOutfitPreview ausente");
const host={innerHTML:"",dataset:{},querySelector(){return this._cv||null;},appendChild(cv){this._cv=cv;this.innerHTML="canvas";}};
const member={id:"20",name:"Druid",voc:"druid",sex:"male",
  outfit:{appearance:"citizen-m",addons:0,colors:[1,2,3,4],mount:null}};
const liveOutfit={appearance:"demon-hunter-m",addons:3,colors:[11,22,33,44],mount:"widow-queen"};
const ctx={
  G:{p:{id:"10"},combat:{players:[{id:"20",p:{id:"20",sex:"male",outfit:liveOutfit}}]}},
  accountCharacterCacheRead(){return [{id:"20",outfit:{appearance:"hunter-m",addons:1}}];},
  AppearanceRenderer:{preview(p){const cv={style:{}};must(p.outfit&&p.outfit.appearance===liveOutfit.appearance&&
    p.outfit.addons===3&&p.outfit.mount==="widow-queen","preview não usou o look vivo");return cv;}},
  ensureOutfit(){},setTimeout(){},Array,String,Object,
};
vm.createContext(ctx);vm.runInContext(partyUi.slice(start,end),ctx);
must(ctx.partyApplyOutfitPreview(host,member,32,0)===true&&host.dataset.look.includes("demon-hunter-m"),
  "miniatura da party ignorou outfit/addons/mount do combate");
console.log("OK: troca na party autoload, lista de personagens e look ao vivo.");
