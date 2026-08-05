/* Teste da v28 — Seletor de cores do outfit dentro da CYCLOPEDIA.
 *
 * 1) A aba "Aparências" (cycloAppearance) renderiza a seção "🎨 Cores do
 *    outfit" com as 4 partes (Cabeça/Corpo/Pernas/Pés) e a paleta completa
 *    do Tibia (OUTFIT_PALETTE, 96 cores);
 * 2) clicar numa cor (data-app-cor) aplica em p.outfit.colors[parte] e
 *    salva; clicar na parte (data-app-part) troca qual parte é colorida;
 * 3) a paleta tem exatamente 96 cores (24×4), a oficial do client.
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { JSDOM } = require("jsdom");

const GAME = path.join(__dirname, "..", "game");
const html = fs.readFileSync(path.join(GAME, "index.html"), "utf8");
const scripts = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1]);
const dom = new JSDOM(html.replace(/<script[^>]*src="[^"]*"[^>]*><\/script>/g, ""), {
  url: "http://localhost/", pretendToBeVisual: true, runScripts: "outside-only",
});
const w = dom.window;
const errors = [];
w.addEventListener("error", (e) => errors.push("WINDOWERROR: " + (e.message || e.error)));
const ctxStub = new Proxy({}, {
  get(t, k) {
    if (k === "canvas") return { width: 840, height: 520 };
    if (k === "createLinearGradient" || k === "createRadialGradient") return () => ({ addColorStop() {} });
    if (k === "measureText") return () => ({ width: 10 });
    if (k === "getImageData") return () => ({ data: new Uint8ClampedArray(4) });
    return typeof k === "string" ? () => {} : undefined;
  },
  set() { return true; },
});
w.HTMLCanvasElement.prototype.getContext = () => ctxStub;
w.HTMLCanvasElement.prototype.toDataURL = () => "data:image/png;base64,xx";
w.requestAnimationFrame = (cb) => setTimeout(cb, 16);
w.fetch = async () => ({ ok: false, status: 404, json: async () => ({}) });
const vctx = vm.createContext(w);
for (const s of scripts) {
  try { vm.runInContext(fs.readFileSync(path.join(GAME, s), "utf8"), vctx, { filename: s }); }
  catch (e) { errors.push(s + ": " + e.message); }
}

setTimeout(() => {
  try {
    vm.runInContext(`
      const ok = [];
      const fail = (m) => { throw new Error(m); };

      // ---------- 1) paleta completa do Tibia (96 cores = 24x4) ----------
      if (OUTFIT_PALETTE.length !== 96)
        fail("OUTFIT_PALETTE deveria ter 96 cores (paleta oficial do Tibia), veio " + OUTFIT_PALETTE.length);
      // extremos da paleta: branco, tons de pele, até o preto/graphite
      if (OUTFIT_PALETTE[0] !== "#ffffff") fail("paleta deveria começar no branco");
      ok.push("paleta oficial do Tibia: 96 cores (24x4)");

      // ---------- 2) CYCLOPEDIA: seção de cores no HTML ----------
      const p = createCharacter("CicloCor", "knight", "male");
      G.p = p;
      const el = document.createElement("div");
      el.id = "cyclo-content";
      document.body.appendChild(el);
      CYCLO.appModo = "outfit";
      CYCLO.appPart = 0;
      cycloAppearance(p, el);
      const h = el.innerHTML;
      if (h.indexOf("🎨 Cores do outfit") === -1) fail("seção de cores não está na aba Aparências");
      if (h.indexOf('data-app-part="1"') === -1) fail("parte Corpo não renderizada");
      if (h.indexOf('data-app-part="3"') === -1) fail("parte Pés não renderizada");
      // paleta renderizada: 96 swatches data-app-cor
      const swatches = (h.match(/data-app-cor=/g) || []).length;
      if (swatches !== 96) fail("paleta deveria renderizar 96 swatches, veio " + swatches);
      ok.push("cyclopedia: seção 'Cores do outfit' com 4 partes e 96 swatches");

      // ---------- 3) aplicar cor clica -> muda p.outfit.colors ----------
      const corIni = p.outfit.colors[0];
      const sw = el.querySelector('[data-app-cor="12"]');   // 12 = tom de pele médio
      if (sw) sw.click();
      if (p.outfit.colors[0] !== 12) fail("clicar na cor 12 deveria aplicar em Cabeça, veio " + p.outfit.colors[0]);
      // troca a parte para Corpo (1) e aplica outra cor
      const btnPart = el.querySelector('[data-app-part="1"]');
      if (btnPart) btnPart.click();
      const sw2 = el.querySelector('[data-app-cor="50"]');
      if (sw2) sw2.click();
      if (p.outfit.colors[1] !== 50) fail("clicar na cor 50 deveria aplicar em Corpo, veio " + p.outfit.colors[1]);
      if (p.outfit.colors[0] !== 12) fail("Cabeça não deveria mudar ao colorir Corpo");
      ok.push("clique na cor aplica na parte selecionada (Cabeça 12, Corpo 50)");

      console.log("  - " + ok.join("\\n  - "));
    `, vctx);
    if (errors.length) throw new Error(errors.join(" | "));
    console.log("V28 OK — seletor de cores do outfit (paleta 96 do Tibia) dentro da Cyclopedia validado");
    process.exit(0);
  } catch (e) {
    console.log("ERRO:", e.message);
    errors.slice(0, 10).forEach((x) => console.log("  - " + x));
    process.exit(1);
  }
}, 900);
