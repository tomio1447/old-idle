/* Teste da v34 — modal alto não corta o topo (party com 5 membros).
 * Verifica que o .modal-bg tem overflow-y:auto e o .modal tem margin:auto
 * (centraliza quando cabe, rola quando estoura) nos CSS que valem. */
const fs = require("fs");
const path = require("path");

const GAME = path.join(__dirname, "..", "game");
const csss = ["css/layout.css", "css/otc-complete.css"];
let ok = 0, err = 0;
for (const f of csss) {
  const css = fs.readFileSync(path.join(GAME, f), "utf8");
  const mBg = css.match(/\.modal-bg \{[\s\S]*?\n\}/);
  const mModal = css.match(/\.modal-bg \.modal \{[\s\S]*?\n\}/);
  const mModalDireto = css.match(/^\s*\.modal \{[\s\S]*?\n\}/m);
  const hasBgOverflow = mBg && /overflow-y: auto/.test(mBg[0]);
  const hasModalMargin = (mModal && /margin: auto/.test(mModal[0])) ||
                         (mModalDireto && /margin: auto/.test(mModalDireto[0]));
  console.log(f + ": bg overflow=" + !!hasBgOverflow + " | modal margin=" + !!hasModalMargin);
  if (hasBgOverflow && hasModalMargin) ok++; else err++;
}
if (err) { console.log("ERRO: fix do modal incompleto"); process.exit(1); }
console.log("V34 OK — modal alto rola em vez de cortar o topo");
process.exit(0);
