/* Painel PREYS ATIVAS: wiring HTML/CSS + coleta das preys ativas do char
 * (sprite do monstro, ícone do tipo de prey e estrelas do nível). */
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "game", "index.html"), "utf8");
const src = fs.readFileSync(path.join(root, "game", "js", "active-preys.js"), "utf8");
const css = fs.readFileSync(path.join(root, "game", "css", "layout.css"), "utf8");

let pass = 0;
const must = (rx, s, msg) => { if (!rx.test(s)) throw Error("FAIL: " + msg); pass++; };

must(/id="active-preys-panel"/, html, "painel active-preys-panel ausente no index.html");
must(/id="active-preys-body"/, html, "body active-preys-body ausente");
must(/id="active-preys-toggle"/, html, "toggle active-preys-toggle ausente");
must(/js\/active-preys\.js\?v=/, html, "script active-preys.js não carregado");
must(/\.active-prey-icon/, css, "css .active-prey-icon ausente");
must(/\.active-prey-sprite/, css, "css .active-prey-sprite ausente");
must(/p\.prey\.slots/, src, "collect não itera p.prey.slots");
must(/s\.until > agora/, src, "collect não filtra prey expirada");
must(/preySmallImg/, src, "ícone do tipo de prey não usado");
must(/preyStarsHtml/, src, "estrelas do nível não usadas");
must(/mobImg/, src, "sprite do monstro não usado");
must(/preyBonusValue/, src, "valor do bônus não calculado");

/* Coleta funcional: extrai collect+cellHtml+timeTxt e roda num sandbox com
 * stubs — prey ativa entra, expirada não. */
const s = src.indexOf("  function timeTxt");
const e = src.indexOf("  function render()");
const code = src.slice(s, e) + "\n({ collect, cellHtml, timeTxt });";
const api = vm.runInNewContext(code, {
  Date, Math, Number, String,
  ensurePrey: (p) => p && p.prey,
  preyMonsterName: (slug) => "Nome " + slug,
  preyBonusValue: (t, st) => 7 + st,
  preySmallImg: (t) => "assets/ui/prey/prey_" + t + ".png",
  preyStarsHtml: (st) => "STARS" + (st + 1),
  mobImg: (slug, t) => "IMG:" + slug + ":" + t,
  PREY_BONUSES: { loot: { nome: "Loot", cor: "#7ae87a" } },
});

const agora = Date.now();
const p = { prey: { slots: [
  { unlocked: true, selected: { creature: "rat", bonus: "loot", step: 4, until: agora + 3600e3 } },
  { unlocked: true, selected: { creature: "orc", bonus: "loot", step: 0, until: agora - 1000 } },
  { unlocked: true, selected: null },
] } };
const cells = api.collect(p);
if (cells.length !== 1) throw Error("FAIL: esperava 1 célula ativa, veio " + cells.length);
const cell = cells[0];
must(/IMG:rat:44/, cell, "sprite do monstro ausente na célula");
must(/prey_loot\.png/, cell, "ícone do tipo de prey ausente");
must(/STARS5/, cell, "estrelas do nível ausentes");
must(/\+11% Loot/, cell, "valor do bônus ausente/errado");
must(/PREY 1/, cell, "rótulo do slot ausente");

console.log("OK: painel Preys Ativas — wiring + coleta (" + (pass + 1) + " asserções).");
