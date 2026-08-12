/* Regressão: sexo na criação e paleta live do Change Outfit. */
"use strict";
const fs=require("fs"),path=require("path");
const js=path.join(__dirname,"..","game","js");
const game=fs.readFileSync(path.join(js,"game.js"),"utf8");
const appearance=fs.readFileSync(path.join(js,"appearance.js"),"utf8");
const server=fs.readFileSync(path.join(__dirname,"..","server","server.js"),"utf8");
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
console.log("OK: MALE/FEMALE define o Wardrobe e a paleta atualiza/salva as cores.");
