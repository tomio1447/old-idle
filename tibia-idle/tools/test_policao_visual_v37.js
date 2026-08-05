/* Teste da v37 — Poluição visual do combate:
 *
 * 1) FLOATERS: escala de 3 fontes — fonte 3 (dano, bold 12px, 1,5s),
 *    fonte 2 (cura HP/mana, 9px, 1,2s) e fonte 1 (small 5px) preservada;
 * 2) DANO: handlers de dano (player->mob e mob->player) usam fonte 3 com
 *    dur=1500; CURA: heals de HP e mana usam fonte 2 com dur=1200;
 * 3) HOLY: ELEMENTS.holy.color = "#ffd400" (amarelo forte/chamativo);
 * 4) MOVIMENTO: monstros ficam mais parados — MOB_STAND_MS=600 no
 *    monsterThinkStep (antes 200), staticChance default 96% (piso 90) e
 *    wander sem alvo reduzido (0.10).
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { JSDOM } = require("jsdom");

const GAME = path.join(__dirname, "..", "game");
const errors = [];

const dom = new JSDOM(`<!DOCTYPE html><html><body><canvas id="scene" width="840" height="520"></canvas></body></html>`,
  { url: "http://localhost/", pretendToBeVisual: true });
const w = dom.window;
w.addEventListener("error", (e) => errors.push("WINDOWERROR " + e.message));
w.requestAnimationFrame = (cb) => setTimeout(cb, 16);
const ctxStub = new Proxy({}, {
  get(t, k) {
    if (k === "canvas") return { width: 840, height: 520 };
    if (k === "createLinearGradient" || k === "createRadialGradient")
      return () => ({ addColorStop() {} });
    if (k === "measureText") return () => ({ width: 10 });
    return typeof k === "string" ? () => {} : undefined;
  },
});
w.HTMLCanvasElement.prototype.getContext = () => ctxStub;
w.HTMLCanvasElement.prototype.toDataURL = () => "data:image/png;base64,xx";
const ctx = vm.createContext(w);

function load(f) {
  vm.runInContext(fs.readFileSync(path.join(GAME, f), "utf8"), ctx, { filename: f });
}

try {
  load("js/core.js");
  load("js/render.js");

  // ---------- 1) escala de fontes no render ----------
  const rsrc = fs.readFileSync(path.join(GAME, "js/render.js"), "utf8");
  if (!/f\.big \? "bold 12px"/.test(rsrc)) errors.push("fonte 3 (dano, bold 12px) ausente no render");
  if (!/f\.small \? "5px"/.test(rsrc)) errors.push("fonte 1 (small 5px) deveria permanecer");
  if (!/f\.mid \? "9px"/.test(rsrc)) errors.push("fonte 2 (cura, 9px) ausente no render");
  const mFont = rsrc.match(/f\.big \? "bold 12px" : \(f\.small \? "5px" : \(f\.mid \? "9px" : "11px"\)\)/g) || [];
  if (mFont.length < 2) errors.push("escala de fontes deveria existir nos 2 loops de floaters (academy e combate)");
  console.log("  - render: escala de 3 fontes nos 2 loops (" + mFont.length + " pontos)");

  // addFloater aceita dur (tempo de exibição) e mid (fonte 2)
  const canvas = w.document.getElementById("scene");
  const r = new w.Renderer(canvas);
  r.addFloater(0.5, 0.5, "-10", "#fff", true, false, 1500);      // dano: fonte 3, 1,5s
  r.addFloater(0.5, 0.5, "+10", "#7ae87a", false, false, 1200, true); // cura: fonte 2, 1,2s
  const f1 = r.floaters.find((f) => f.big);
  const f2 = r.floaters.find((f) => f.mid);
  if (!f1) errors.push("floater de dano não entrou na lista");
  else if (f1.life !== 1500) errors.push("dano deveria durar 1500ms (tem " + f1.life + ")");
  if (!f2) errors.push("floater de cura (mid) não entrou na lista");
  else if (f2.life !== 1200) errors.push("cura deveria durar 1200ms (tem " + f2.life + ")");
  else if (f2.small) errors.push("cura não deveria usar a fonte 1 (small)");
  console.log("  - addFloater: dano life=" + (f1 && f1.life) + " · cura life=" + (f2 && f2.life));

  // ---------- 2) handlers de dano/cura no game.js ----------
  const gsrc = fs.readFileSync(path.join(GAME, "js/game.js"), "utf8");
  const danos = gsrc.match(/true, false, 1500\);/g) || [];
  const curas = gsrc.match(/false, false, 1200, true\);/g) || [];
  if (danos.length < 2) errors.push("dano deveria usar fonte 3 com 1,5s em 2+ handlers (" + danos.length + ")");
  if (curas.length < 6) errors.push("cura HP/mana deveria usar fonte 2 com 1,2s em 6+ handlers (" + curas.length + ")");
  if (/false, true\);  \/\/ small \(v27\)/.test(gsrc)) errors.push("chamadas antigas de small (v27) ainda existem");
  console.log("  - game.js: danos fonte3/1,5s=" + danos.length + " · curas fonte2/1,2s=" + curas.length);

  // ---------- 3) holy forte ----------
  const holy = vm.runInContext("ELEMENTS.holy", ctx);
  if (!holy || holy.color !== "#ffd400") errors.push("holy deveria ser #ffd400 (amarelo forte) — veio " + (holy && holy.color));
  console.log("  - holy: " + holy.color);

  // ---------- 4) movimento dos monstros ----------
  const gsrc2 = fs.readFileSync(path.join(GAME, "js/gridai.js"), "utf8");
  const mStand = gsrc2.match(/MOB_STAND_MS\s*=\s*(\d+)/);
  if (!mStand) errors.push("MOB_STAND_MS ausente no gridai.js");
  else {
    const v = Number(mStand[1]);
    if (v < 500) errors.push("MOB_STAND_MS deveria ser >= 500 (veio " + v + ")");
    const uses = (gsrc2.match(/nextStepAt = now \+ MOB_STAND_MS/g) || []).length;
    if (uses < 2) errors.push("MOB_STAND_MS deveria ser usado nas 2 saídas do monsterThinkStep (" + uses + ")");
    console.log("  - gridai: MOB_STAND_MS=" + v + " usado " + uses + "x");
  }
  if (!/staticAttack === undefined \? 96/.test(gsrc2)) errors.push("staticChance default deveria ser 96 (ficar parado)");
  if (!/Math\.max\(90, base\)/.test(gsrc2)) errors.push("staticChance deveria ter piso 90");
  if (!/Math\.random\(\) < 0\.10/.test(gsrc2)) errors.push("wander sem alvo deveria ser 0.10");
  console.log("  - gridai: staticChance 96 (piso 90) · wander 0.10");
} catch (e) {
  errors.push("TESTE: " + (e.stack || e.message));
}

if (errors.length) {
  console.log("ERROS (" + errors.length + "):");
  for (const e of errors.slice(0, 20)) console.log("  - " + e);
  process.exit(1);
}
console.log("V37 OK — dano fonte 3 (1,5s), cura fonte 2 (1,2s), holy #ffd400, monstros mais parados (600ms)");
process.exit(0);
