/* Regressão: Goshnar's Malice (idle DAT = 1 frame) anima walk nos modais. */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const GAME = path.join(__dirname, "..", "game");
const JS = path.join(GAME, "js");
function must(ok, message) { if (!ok) throw Error(message); }

const ctx = { window: {}, console };
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(JS, "mobsheetdata.js"), "utf8"), ctx);
vm.runInContext(fs.readFileSync(path.join(JS, "idleanimdata.js"), "utf8"), ctx);
vm.runInContext(fs.readFileSync(path.join(JS, "appearance.js"), "utf8"), ctx);
vm.runInContext(fs.readFileSync(path.join(JS, "render.js"), "utf8"), ctx);

must(!ctx.IDLE_ANIMATIONS.monsters["goshnar-s-malice"],
  "Malice não deveria ter idle real no DAT (anim=1)");
must(ctx.MOBSHEETS["goshnar-s-malice"] && ctx.MOBSHEETS["goshnar-s-malice"].cols === 9,
  "Malice precisa do sheet moving 9 cols");

const staticThumb = vm.runInContext(`mobImg('goshnar-s-malice', 46)`, ctx);
must(!staticThumb.includes("mob-img-animated"),
  "mini default de Malice não deve animar (bestiário/caça)");

const bossThumb = vm.runInContext(`bossMobImg('goshnar-s-malice', 76)`, ctx);
must(bossThumb.includes("mob-img-animated"),
  "retrato de boss Malice deve animar");
must(bossThumb.includes("goshnar-s-malice.png") && !bossThumb.includes(".idle.png"),
  "retrato Malice usa sheet moving (sem idle real)");
must(bossThumb.includes("--mob-sheet-frames:9"),
  "retrato Malice deve percorrer as 9 colunas");
must(bossThumb.includes("--mob-sheet-duration:2700ms"),
  "retrato Malice deve usar 300ms/quadro");

const greed = vm.runInContext(`bossMobImg('goshnar-s-greed', 76)`, ctx);
must(greed.includes("mob-img-animated") && greed.includes("goshnar-s-greed.idle.png"),
  "Greed no modal continua no idle real");

const gameSrc = fs.readFileSync(path.join(JS, "game.js"), "utf8");
must(gameSrc.includes("bossMobImg") && gameSrc.includes("renderBosses"),
  "catálogo BOSSES deve usar bossMobImg");

console.log("OK: Malice anima walk no modal; default permanece estático.");
