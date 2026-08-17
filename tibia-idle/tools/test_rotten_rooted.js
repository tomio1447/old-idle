/* Regressão: Rotten Wasteland — CONDITION_ROOTED (Canary) + ícones OTC. */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const game = path.join(__dirname, "..", "game");
const js = path.join(game, "js");
function must(ok, msg) { if (!ok) throw new Error(msg); }
function pngSize(file) {
  const b = fs.readFileSync(file);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

const ctx = { window: {}, console, Math, Date, Map, Set, addEventListener() {} };
ctx.window = ctx;
ctx.document = { addEventListener() {}, getElementById() { return null; } };
vm.createContext(ctx);
for (const file of [
  "gamedata.js", "weapondata.js", "weapons.js", "monsterdata.js", "mobsheetdata.js",
  "monsters.js", "hard-hunts.js", "soulwar.js", "icondata.js",
]) {
  vm.runInContext(fs.readFileSync(path.join(js, file), "utf8"), ctx, { filename: file });
}

const hunt = ctx.GAMEDATA.hunts["rotten-wasteland"];
must(hunt && hunt.soulWarRoot === true &&
  JSON.stringify(hunt.monsters) === JSON.stringify([
    "rotten-golem", "branchy-crawler", "mould-phantom",
  ]), "Rotten Wasteland sem soulWarRoot / monstros");

for (const slug of ["rotten-golem", "branchy-crawler"]) {
  const root = (ctx.GAMEDATA.monsters[slug].skills || []).find((s) => s.n === "root");
  must(root && root.fx === "rooting-effect" && (root.max || 0) === 0 &&
    (root.range || 0) >= 7,
    slug + ": spell root Canary ausente/incompleto");
}

const combat = fs.readFileSync(path.join(js, "combat.js"), "utf8");
must(combat.includes("rooted:") && combat.includes("applySoulwarRoot") &&
  combat.includes("playerIsRooted") && combat.includes("ROOT_DURATION_MS = 3000") &&
  (combat.includes("rooted|rooting") || /root\$\|/.test(combat)),
  "CONDITION_ROOTED / hooks Canary ausentes em combat.js");
must(combat.includes("feared:") && combat.includes("applySoulwarFear"),
  "CONDITION_FEARED deve continuar presente");

const gridai = fs.readFileSync(path.join(js, "gridai.js"), "utf8");
must(gridai.includes("playerIsRooted") && gridai.includes("playerIsFeared"),
  "bloqueio Rooted / fuga Feared ausentes em gridai.js");

const iconsDir = path.join(game, "assets", "ui", "conditions");
for (const slug of ["cond-rooted", "cond-feared"]) {
  const file = path.join(iconsDir, slug + ".png");
  must(fs.existsSync(file), "ícone OTC ausente: " + slug);
  const sz = pngSize(file);
  must(sz.w === 9 && sz.h === 9, slug + " deve ser 9×9 (padrão OTC conditions)");
}
must(ctx.WIKI_CONDITIONS.rooted && ctx.WIKI_CONDITIONS.rooted.icon === "cond-rooted",
  "WIKI_CONDITIONS.rooted incorreto");
must(ctx.WIKI_CONDITIONS.feared && ctx.WIKI_CONDITIONS.feared.icon === "cond-feared",
  "WIKI_CONDITIONS.feared incorreto");
must(ctx.CONDITION_ICON_SLUG.rooted === "cond-rooted" &&
  ctx.CONDITION_ICON_SLUG.feared === "cond-feared",
  "CONDITION_ICON_SLUG Fear/Root ausente");
must(fs.existsSync(path.join(game, "assets", "effects", "rooting-effect.png")),
  "FX rooting-effect ausente");

const engine = fs.readFileSync(path.join(__dirname, "..", "server", "authoritative_engine.js"), "utf8");
must(engine.includes('"rotten-wasteland"') && engine.includes("soulWarRoot"),
  "rotten-wasteland/soulWarRoot ausente no authoritative_engine");

console.log("OK: Rotten Wasteland Rooted + ícones Fear/Rooted OTC validados.");
