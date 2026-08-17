/* Regressão: frames de stackable seguem o subtype Canary (count),
 * sem animação CSS infinita tipo GIF. */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const game = path.join(__dirname, "..", "game");

function must(ok, message) {
  if (!ok) throw Error(message);
}

const gamedataJs = fs.readFileSync(path.join(game, "js", "gamedata.js"), "utf8");
const weaponsJs = fs.readFileSync(path.join(game, "js", "weapons.js"), "utf8");

const ctx = { window: {}, ASSET_VERSION: "test" };
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(gamedataJs, ctx);
vm.runInContext(weaponsJs, ctx);

must(typeof ctx.itemStackSubtype === "function", "itemStackSubtype ausente");
must(typeof ctx.itemImg === "function", "itemImg ausente");

const cases = [
  [1, 0], [2, 1], [3, 2], [4, 3],
  [5, 4], [9, 4], [10, 5], [24, 5],
  [25, 6], [49, 6], [50, 7], [100, 7],
];
for (const [qty, frame] of cases) {
  must(ctx.itemStackSubtype(qty) === frame,
    `count ${qty} deveria mapear para frame ${frame}, veio ${ctx.itemStackSubtype(qty)}`);
}

const gold = ctx.GAMEDATA.items["gold-coin"];
const star = ctx.GAMEDATA.items["assassin-star"];
must(gold && gold.sf === 8 && gold.aw && gold.ah, "gold-coin sem metadado sf");
must(star && star.sf === 8, "assassin-star sem metadado sf");
must(!gold.af, "gold-coin nao deve ter af (animacao temporal)");
must(fs.existsSync(path.join(game, "assets", "item", "gold-coin_stack.png")),
  "falta gold-coin_stack.png");
must(fs.existsSync(path.join(game, "assets", "item", "assassin-star_stack.png")),
  "falta assassin-star_stack.png");

function assertLocked(slug, qty, frame) {
  const html = ctx.itemImg(slug, 0, null, qty);
  must(html.includes("_stack.png"), `${slug} qty=${qty} deveria usar _stack.png`);
  must(!html.includes("animation:item-anim"),
    `${slug} qty=${qty} nao pode free-animar`);
  must(html.includes(`background-position:-${frame * (ctx.GAMEDATA.items[slug].aw)}px 0`),
    `${slug} qty=${qty} frame esperado ${frame}`);
}

assertLocked("gold-coin", 1, 0);
assertLocked("gold-coin", 25, 6);
assertLocked("gold-coin", 100, 7);
assertLocked("assassin-star", 1, 0);
assertLocked("assassin-star", 25, 6);
assertLocked("assassin-star", 100, 7);

/* Soft boots / itens af reais continuam animando no tempo. */
const soft = ctx.GAMEDATA.items["soft-boots"];
must(soft && soft.af > 1 && !soft.sf, "soft-boots deveria continuar af sem sf");
const softHtml = ctx.itemImg("soft-boots");
must(softHtml.includes("animation:item-anim") && softHtml.includes("_anim.png"),
  "soft-boots deveria free-animar");

/* PNG nativo do count=1 permanece pequeno (nao a bbox uniao da tira). */
const png = fs.readFileSync(path.join(game, "assets", "item", "gold-coin.png"));
must(png.readUInt32BE(16) === 9 && png.readUInt32BE(20) === 9,
  "gold-coin.png deveria continuar 9x9");

console.log("OK: stack frames Canary (gold coin / assassin star) travados por qty.");
