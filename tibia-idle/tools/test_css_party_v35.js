/* Teste da v35 — CSS do painel OTC de party restaurado (o consolidate_css
 * tinha sobrescrito o layout.css e perdido o .party-panel, deixando o painel
 * fluindo no final da página) + subcategorias de hunts.
 */
const fs = require("fs");
const path = require("path");
const GAME = path.join(__dirname, "..", "game");

let err = 0;
const css = fs.readFileSync(path.join(GAME, "css/layout.css"), "utf8");

// .party-panel precisa ter position:absolute (sobre a cena)
const m = css.match(/\.party-panel \{[\s\S]*?\n\}/);
if (!m || !/position: absolute/.test(m[0])) {
  console.log("ERRO: .party-panel sem position:absolute"); err++;
}
if (!/\.party-member-row \{/.test(css)) { console.log("ERRO: .party-member-row ausente"); err++; }
if (!/\.party-pbar \{/.test(css)) { console.log("ERRO: .party-pbar ausente"); err++; }
if (!/\.ppm-outfit \{/.test(css)) { console.log("ERRO: .ppm-outfit ausente"); err++; }
if (!/\.party-panel-empty \{/.test(css)) { console.log("ERRO: .party-panel-empty ausente"); err++; }
if (!/\.hunt-cat-title \{/.test(css)) { console.log("ERRO: .hunt-cat-title ausente"); err++; }

// o style.css (fonte do consolidate) também tem o bloco, p/ não se perder de novo
const style = fs.readFileSync(path.join(GAME, "css/style.css"), "utf8");
if (!/\.party-panel \{/.test(style)) { console.log("ERRO: .party-panel não está no style.css (fonte)"); err++; }

if (err) { console.log("ERRO: CSS da party incompleto (" + err + ")"); process.exit(1); }
console.log("V35 OK — CSS do painel de party restaurado (position absolute) e subcategorias de hunts");
process.exit(0);
