/* Regressão: sexo na criação e paleta live do Change Outfit. */
"use strict";
const fs=require("fs"),path=require("path"),vm=require("vm");
const js=path.join(__dirname,"..","game","js");
const game=fs.readFileSync(path.join(js,"game.js"),"utf8");
const appearance=fs.readFileSync(path.join(js,"appearance.js"),"utf8");
const outfitRenderer=fs.readFileSync(path.join(js,"outfit.js"),"utf8");
const partyUi=fs.readFileSync(path.join(js,"party-ui.js"),"utf8");
const index=fs.readFileSync(path.join(__dirname,"..","game","index.html"),"utf8");
const server=fs.readFileSync(path.join(__dirname,"..","server","server.js"),"utf8");
const partyServer=fs.readFileSync(path.join(__dirname,"..","server","party.js"),"utf8");
const extract=fs.readFileSync(path.join(__dirname,"extract_appearances.py"),"utf8");
function must(ok,msg){if(!ok)throw Error(msg);}
const creatorStart=game.indexOf("function vocOutfit"),creatorEnd=game.indexOf("\n  function logoutAccount",creatorStart);
const creator=game.slice(creatorStart,creatorEnd);
must(creator.includes('<b>MALE</b><span>Masculino</span>')&&
  creator.includes('<b>FEMALE</b><span>Feminino</span>')&&
  creator.includes('selSex = button.dataset.sex')&&creator.includes('newPlayer(name, selVoc, selSex)'),
  "criador não oferece/persiste sexo MALE/FEMALE");
must(creator.includes('ensureWardrobe(draft)')&&
  appearance.includes('APPEARANCE_DATA.outfits.filter((o) => o.sexo === sexo)'),
  "sexo escolhido não define catálogo inicial de outfits/addons");
must(creator.includes('s === "female" ? "f" : "m"')&&
  creator.includes('vocOutfit(selVoc, selSex)')&&
  creator.includes('AppearanceRenderer.preview(p, "s")'),
  "preview do Visual inicial não usa vocOutfit/sexo escolhido");
must(extract.includes('sexo = "f" if o.get("type") == 0 else "m"'),
  "extrator ainda inverte Canary type 0/1 (female/male)");
const ctx={window:{},console}; ctx.window=ctx; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(js,"appearancedata.js"),"utf8"),ctx);
vm.runInContext(outfitRenderer,ctx);
vm.runInContext(appearance,ctx);
const male={voc:"knight",sex:"male",outfit:{},wardrobe:{outfits:{},mounts:{}}};
const female={voc:"knight",sex:"female",outfit:{},wardrobe:{outfits:{},mounts:{}}};
ctx.ensureOutfit(male); ctx.ensureWardrobe(male); ctx.syncOutfitLook(male);
ctx.ensureOutfit(female); ctx.ensureWardrobe(female); ctx.syncOutfitLook(female);
must(male.outfit.appearance==="knight-m"&&male.outfit.lookType===131,
  "Masculino+Knight não resolve lookType male 131");
must(female.outfit.appearance==="knight-f"&&female.outfit.lookType===139,
  "Feminino+Knight não resolve lookType female 139");
const APP_OUTFIT=vm.runInContext("APP_OUTFIT",ctx);
const citizenM=APP_OUTFIT["citizen-m"], citizenF=APP_OUTFIT["citizen-f"];
must(citizenM&&citizenM.looktype===128&&citizenM.sexo==="m",
  "citizen-m deve ser looktype 128 / sexo m");
must(citizenF&&citizenF.looktype===136&&citizenF.sexo==="f",
  "citizen-f deve ser looktype 136 / sexo f");
must(index.includes("js/appearancedata.js?v=mount-zpattern-v1")&&
  index.includes("js/idleanimdata.js?v=sex-looktype-v2")&&
  index.includes("js/appearance.js?v=mount-zpattern-v1")&&
  index.includes("js/outfit.js?v=sex-looktype-v2"),
  "index não cache-busta appearancedata/idle/appearance/outfit após correção de sexo");
must(appearance.includes("APP_SEX_BASE_PAIR")&&appearance.includes('noblewoman: "nobleman"')&&
  appearance.includes("CLASSIC_OUTFIT_TYPES")&&outfitRenderer.includes("CLASSIC_OUTFIT_FALLBACK"),
  "pares woman/man e fallback classico de starters ausentes");
const maleDruid={voc:"druid",sex:"male",outfit:{appearance:"druid-m",type:"druid",colors:[1,2,3,4]},wardrobe:{outfits:{"druid-m":0,"noblewoman-m":2},mounts:{}}};
ctx.ensureWardrobe(maleDruid); ctx.syncOutfitLook(maleDruid);
must(maleDruid.outfit.appearance==="druid-m"&&maleDruid.outfit.type==="summoner",
  "Druid appearance não deve forçar type classico druid (404)");
must(!maleDruid.wardrobe.outfits["noblewoman-m"]&&maleDruid.wardrobe.outfits["nobleman-m"]===2,
  "wardrobe male não migra noblewoman-m -> nobleman-m");
const po=ctx.playerOutfit(maleDruid);
must(po.name==="summoner-m",
  "playerOutfit não cai no starter classico da vocação");
must(/js\/party-ui\.js\?v=/.test(index),
  "painel da party sem cache-bust");
const outfitStart=game.indexOf("function openOutfitModal"),outfitEnd=game.indexOf("\nfunction openCharacterModal",outfitStart);
const outfit=game.slice(outfitStart,outfitEnd);
must(outfit.includes('p.outfit.colors = draft.colors.slice()')&&
  outfit.includes('AppearanceRenderer.preview(p,"s")')&&outfit.includes('cycloAppearance(p, ward)'),
  "paleta não aplica o draft antes de redesenhar preview/Wardrobe");
must(outfit.includes('draft.colors[part] = +s.dataset.ocolor')&&
  outfit.includes('p.outfit.colors=originalColors.slice()')&&outfit.includes('colors: draft.colors.slice()'),
  "clique/salvar/cancelar da paleta não preservam as cores corretamente");
must(server.includes('sex:data.sex || "male"')&&server.includes('outfit:data.outfit')&&
  server.includes('SEX_BASE_PAIR')&&server.includes('CLASSIC'),
  "API não persiste sexo/outfit nem bloqueia slug classico inválido");
must(partyServer.includes("outfit.addons=Math.max")&&partyServer.includes("outfit.appearance=raw.appearance")&&
  (partyServer.includes('sex:data.sex==="female"?"female":"male"')||
   partyServer.includes('sex: data.sex === "female" ? "female" : "male"')),
  "API da party não publica a aparência persistida com addons");
must(partyUi.includes("partyApplyOutfitPreview")&&partyUi.includes("AppearanceRenderer.preview(member")&&
  partyUi.includes("source.outfit||summary&&summary.outfit||member.outfit"),
  "painel da party não compõe outfit/cores/addons atuais");
must(outfitRenderer.includes("Um asset 15x em carregamento/erro nunca pode remover a entidade")&&
  outfitRenderer.includes("Sprites.walk(o.name, dir, numericFrame) || Sprites.outfit(o.name, dir)"),
  "falha/carregamento de outfit ainda pode deixar um membro invisível no mapa");
console.log("OK: MALE/FEMALE lookTypes corretos, slugs classicos seguros, paleta e party ok.");
