/* Regressão: sexo na criação e paleta live do Change Outfit. */
"use strict";
const fs=require("fs"),path=require("path");
const js=path.join(__dirname,"..","game","js");
const game=fs.readFileSync(path.join(js,"game.js"),"utf8");
const appearance=fs.readFileSync(path.join(js,"appearance.js"),"utf8");
const outfitRenderer=fs.readFileSync(path.join(js,"outfit.js"),"utf8");
const partyUi=fs.readFileSync(path.join(js,"party-ui.js"),"utf8");
const index=fs.readFileSync(path.join(__dirname,"..","game","index.html"),"utf8");
const server=fs.readFileSync(path.join(__dirname,"..","server","server.js"),"utf8");
const partyServer=fs.readFileSync(path.join(__dirname,"..","server","party.js"),"utf8");
function must(ok,msg){if(!ok)throw Error(msg);}
const creatorStart=game.indexOf("function showCharacterCreator"),creatorEnd=game.indexOf("\n  function logoutAccount",creatorStart);
const creator=game.slice(creatorStart,creatorEnd);
must(creator.includes('<b>MALE</b><span>Masculino</span>')&&
  creator.includes('<b>FEMALE</b><span>Feminino</span>')&&
  creator.includes('selSex = button.dataset.sex')&&creator.includes('newPlayer(name, selVoc, selSex)'),
  "criador não oferece/persiste sexo MALE/FEMALE");
must(creator.includes('ensureWardrobe(draft)')&&
  appearance.includes('APPEARANCE_DATA.outfits.filter((o) => o.sexo === sexo)'),
  "sexo escolhido não define catálogo inicial de outfits/addons");
const outfitStart=game.indexOf("function openOutfitModal"),outfitEnd=game.indexOf("\nfunction openCharacterModal",outfitStart);
const outfit=game.slice(outfitStart,outfitEnd);
must(outfit.includes('p.outfit.colors = draft.colors.slice()')&&
  outfit.includes('AppearanceRenderer.preview(p,"s")')&&outfit.includes('cycloAppearance(p, ward)'),
  "paleta não aplica o draft antes de redesenhar preview/Wardrobe");
must(outfit.includes('draft.colors[part] = +s.dataset.ocolor')&&
  outfit.includes('p.outfit.colors=originalColors.slice()')&&outfit.includes('colors: draft.colors.slice()'),
  "clique/salvar/cancelar da paleta não preservam as cores corretamente");
must(server.includes('sex:data.sex || "male"')&&server.includes('outfit:data.outfit'),
  "API não persiste sexo/outfit no seletor da conta");
must(partyServer.includes("outfit.addons=Math.max")&&partyServer.includes("outfit.appearance=raw.appearance")&&
  (partyServer.includes('sex:data.sex==="female"?"female":"male"')||
   partyServer.includes('sex: data.sex === "female" ? "female" : "male"')),
  "API da party não publica a aparência persistida com addons");
must(partyUi.includes("partyApplyOutfitPreview")&&partyUi.includes("AppearanceRenderer.preview(member")&&
  partyUi.includes("source.outfit||summary&&summary.outfit||member.outfit")&&
  index.includes('js/party-ui.js?v=party-switch-v1'),
  "painel da party não compõe/cache-busta outfit, cores e addons atuais");
must(outfitRenderer.includes("Um asset 15x em carregamento/erro nunca pode remover a entidade")&&
  outfitRenderer.includes("Sprites.walk(o.name, dir, numericFrame) || Sprites.outfit(o.name, dir)")&&
  index.includes('js/outfit.js?v=party-visible-v1'),
  "falha/carregamento de outfit ainda pode deixar um membro invisível no mapa");
console.log("OK: MALE/FEMALE, paleta e party preservam outfit/cores/addons sem ocultar membros.");
