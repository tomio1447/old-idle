/* Conta/criação + look Canary (outfit+mount) + loja de gold. */
"use strict";
const fs = require("fs"), path = require("path"), vm = require("vm");
const root = path.join(__dirname, "..");
const js = path.join(root, "game", "js");
function must(ok, msg) { if (!ok) throw Error(msg); }

const game = fs.readFileSync(path.join(js, "game.js"), "utf8");
const appearanceSrc = fs.readFileSync(path.join(js, "appearance.js"), "utf8");
const outfitSrc = fs.readFileSync(path.join(js, "outfit.js"), "utf8");
const partyUi = fs.readFileSync(path.join(js, "party-ui.js"), "utf8");
const partyClient = fs.readFileSync(path.join(js, "party.js"), "utf8");
const index = fs.readFileSync(path.join(root, "game", "index.html"), "utf8");
const server = fs.readFileSync(path.join(root, "server", "server.js"), "utf8");
const partyServer = fs.readFileSync(path.join(root, "server", "party.js"), "utf8");

must(server.includes("function sanitizeOutfit") && server.includes("function sanitizeWardrobe") &&
  server.includes("wardrobe:sanitizeWardrobe(payload.wardrobe)") &&
  server.includes("outfit:sanitizeOutfit(payload.outfit,sex,voc)"),
  "criação de personagem não persiste outfit/wardrobe");
must(server.includes("lookMount") && server.includes("lookAddons") && server.includes("lookType"),
  "API não alinha campos look* com o Outfit_t do Canary");

must(partyServer.includes("outfit.addons=Math.max") &&
  partyServer.includes("outfit.appearance=raw.appearance") &&
  partyServer.includes('sex:data.sex==="female"?"female":"male"') &&
  partyServer.includes("lookMount"),
  "snapshot da party não publica look/mount");

const creatorStart = game.indexOf("function showCharacterCreator");
const creatorEnd = game.indexOf("\n  function logoutAccount", creatorStart);
const creator = game.slice(creatorStart, creatorEnd);
must(creator.includes("acc-create-preview") && creator.includes("acc-look-palette") &&
  creator.includes("acc-starter-outfits") && creator.includes("setAppearance(draft, selAppearance)") &&
  creator.includes("syncOutfitLook(draft)") &&
  creator.includes("addons e montarias compram-se com gold"),
  "criador não deixa escolher outfit/cores (loja de mount/addon continua gold)");

must(appearanceSrc.includes("function syncOutfitLook") &&
  appearanceSrc.includes("p.outfit.lookMount = m.looktype") &&
  appearanceSrc.includes("p.outfit.lookMount = 0") &&
  appearanceSrc.includes('APP_INICIAIS = ["citizen", "hunter", "mage", "knight", "summoner", "monk"]') &&
  appearanceSrc.includes("APP_OUTFIT[id].sexo !== sexSuffix(p)") &&
  appearanceSrc.includes("cx.drawImage(bicho") && appearanceSrc.includes("cx.drawImage(corpo"),
  "look Canary (lookType fixo + overlay da mount + addons no cavaleiro) ausente");
must(appearanceSrc.includes("p.gold -= preco") && appearanceSrc.includes("APP_PRECO") &&
  appearanceSrc.includes("function buyMount") && appearanceSrc.includes("function buyAddon"),
  "loja de gold de outfits/addons/mounts foi removida");

must(partyClient.includes("outfit: ref.outfit || null") &&
  partyClient.includes("sex: ref.sex || \"male\""),
  "party combat não hidrata look de membros fora do cache");
must(partyUi.includes("partyApplyOutfitPreview") &&
  partyUi.includes("AppearanceRenderer.preview(member") &&
  partyUi.includes("source.outfit||summary&&summary.outfit||member.outfit"),
  "painel da party não compõe mount/addons");
must(index.includes("js/appearance.js?v=mount-zpattern-v1") &&
  index.includes("js/appearancedata.js?v=mount-zpattern-v1") &&
  /js\/game\.js\?v=/.test(index) &&
  /js\/party\.js\?v=/.test(index) &&
  /js\/party-ui\.js\?v=/.test(index) &&
  /css\/layout\.css\?v=/.test(index),
  "assets de outfit/mount sem cache-bust");

const ctx = { window: {}, console };
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(js, "appearancedata.js"), "utf8"), ctx);
vm.runInContext(outfitSrc, ctx);
vm.runInContext(appearanceSrc, ctx);

const APP_OUTFIT = vm.runInContext("APP_OUTFIT", ctx);
const APP_MOUNT = vm.runInContext("APP_MOUNT", ctx);

const knight = { voc: "knight", sex: "male", gold: 500000, outfit: {}, wardrobe: { outfits: {}, mounts: {} } };
ctx.ensureOutfit(knight);
ctx.ensureWardrobe(knight);
must(knight.outfit.appearance === "knight-m" && knight.outfit.lookType === 131,
  "knight masculino não nasceu com lookType da outfit de vocação");
must(knight.wardrobe.outfits["monk-m"] === 0 && knight.wardrobe.outfits["knight-m"] === 0,
  "wardrobe inicial não libera monk + vocação");

knight.outfit.appearance = "knight-f";
ctx.syncOutfitLook(knight);
must(knight.outfit.appearance === "knight-m" && knight.outfit.lookType === 131,
  "outfit female em personagem male não foi corrigida");

const warrior = APP_OUTFIT["warrior-m"];
const goldAfterOutfit = 500000 - ctx.outfitPrice(warrior);
const buyOutfit = ctx.buyOutfit(knight, "warrior-m");
must(buyOutfit.ok && knight.gold === goldAfterOutfit, "compra de outfit com gold falhou");
must(ctx.setAppearance(knight, "warrior-m") && knight.outfit.lookType === warrior.looktype,
  "vestir outfit comprada não atualizou lookType");

const buyAddon = ctx.buyAddon(knight, "warrior-m");
must(buyAddon.ok && ctx.setAddons(knight, 1) === 1 && knight.outfit.lookAddons === 1,
  "compra/ativação de addon com gold não gravou lookAddons");

const flame = APP_MOUNT.flamesteed;
const buyMount = ctx.buyMount(knight, "flamesteed");
must(buyMount.ok && ctx.setMount(knight, "flamesteed") &&
  knight.outfit.mount === "flamesteed" &&
  knight.outfit.lookMount === flame.looktype &&
  knight.outfit.lookType === warrior.looktype,
  "equipar mount não preenche lookMount sem trocar o lookType do cavaleiro");
must(ctx.currentMount(knight) && ctx.currentMount(knight).id === "flamesteed",
  "currentMount não vê a montaria equipada");
must(ctx.setMount(knight, null) && knight.outfit.mount === null && knight.outfit.lookMount === 0 &&
  knight.outfit.lookType === warrior.looktype,
  "desequipar mount não voltou ao look a pé");

const female = { voc: "sorcerer", sex: "female", gold: 1000, outfit: {}, wardrobe: { outfits: {}, mounts: {} } };
ctx.ensureOutfit(female); ctx.ensureWardrobe(female);
must(female.outfit.appearance === "mage-f" && !ctx.setAppearance(female, "mage-m"),
  "feiticeira não ficou na mage-f / ainda aceita outfit masculina");

console.log("OK: criação persiste look/wardrobe; mount Canary (overlay + lookMount); loja gold intacta.");
