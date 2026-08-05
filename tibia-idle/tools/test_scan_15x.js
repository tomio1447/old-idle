/* Teste da varredura 15.x:
 * 1) itens que NÃO têm atributos no items.xml do Canary (crystal ring,
 *    crystal necklace, etc.) não dão mais atributos no jogo;
 * 2) dano físico é CINZA (#a0a0a0) — cor nativa do Tibia no game window;
 * 3) sem vestígios de "7.4" nos comentários do runtime (core/monsters/
 *    outfit/css).
 */
const fs = require("fs");
const path = require("path");

const GAME = path.join(__dirname, "..", "game");
const errors = [];

// ---- 1) itens sem atributos ----
const gsrc = fs.readFileSync(path.join(GAME, "js", "gamedata.js"), "utf8");
const gd = JSON.parse(gsrc.slice(gsrc.indexOf("{"), gsrc.lastIndexOf(";")));
const LIMPOS = [
  "crystal-ring", "crystal-necklace", "life-crystal", "mind-stone", "orb",
  "crystal-ball", "spellbook", "gold-ring", "wedding-ring", "ring-of-the-sky",
  "ring-of-wishes", "golden-amulet", "ancient-amulet", "starlight-amulet",
  "ruby-necklace", "wolf-tooth-chain", "paw-amulet", "elven-brooch",
  "frozen-starlight",
];
const SKIP = new Set(["n", "s", "t", "cid", "af", "aw", "ah", "sell", "w",
                      "vocs", "imbSlots", "lvl", "buy", "th", "desc"]);
for (const k of LIMPOS) {
  const it = gd.items[k];
  if (!it) { errors.push(k + " não existe no gamedata"); continue; }
  const attrs = Object.keys(it).filter((x) => !SKIP.has(x));
  if (attrs.length) errors.push(k + " ainda tem atributos: " + attrs.join(","));
}

// ---- 2) cor do dano físico cinza ----
const cs = fs.readFileSync(path.join(GAME, "js", "core.js"), "utf8");
if (!/physical: \{ name: "Físico", color: "#a0a0a0"/.test(cs))
  errors.push("ELEMENTS.physical não é cinza (#a0a0a0)");

const gjs = fs.readFileSync(path.join(GAME, "js", "game.js"), "utf8");
// o handler "hit" pinta físico em VERMELHO (#c00000) para raça blood e
// player, e usa a cor da raça nas demais (v31) — já não é cinza fixo
if (!/vermelho \? "#c00000"/.test(gjs))
  errors.push("game.js hit: dano físico deveria pintar vermelho para blood/player (v31)");

// ---- 3) sem vestígios 7.4 no runtime ----
const files = ["core.js", "monsters.js", "outfit.js"];
for (const f of files) {
  const s = fs.readFileSync(path.join(GAME, "js", f), "utf8");
  if (/7\.4/.test(s)) errors.push(f + " ainda menciona 7.4");
}
for (const f of ["layout.css", "style.css"]) {
  const s = fs.readFileSync(path.join(GAME, "css", f), "utf8");
  if (/client 7\.4/.test(s)) errors.push(f + " ainda menciona client 7.4");
}

if (errors.length) {
  console.log("ERROS (" + errors.length + "):");
  for (const e of errors) console.log("  - " + e);
  process.exit(1);
}
console.log("SCAN 15.X OK — itens limpos, dano físico vermelho em sangue/player, sem vestígios 7.4 no runtime");
process.exit(0);
