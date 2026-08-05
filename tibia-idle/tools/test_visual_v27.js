/* Teste da v27 — Upgrade visual (120fps + antialiasing) + loot limpo +
 * números de cura/dano com metade do tamanho.
 *
 * 1) RENDERER: imageSmoothingEnabled=false (nearest — pixel art nítido) e
 *    resize escala por devicePixelRatio (máx 2);
 * 2) LOOT: o case "kill" NÃO tem toast de "loot raro" nem floater verde
 *    "✦ ..." subindo na tela (só o log do painel);
 * 3) FLOATERS de cura/dano: usam a flag small (fonte 6px = metade de 11px).
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

// ctx stub que registra imageSmoothingEnabled / quality
let smoothing = null, quality = null;
const ctxStub = new Proxy({}, {
  get(t, k) {
    if (k === "canvas") return { width: 840, height: 520 };
    if (k === "createLinearGradient" || k === "createRadialGradient") return () => ({ addColorStop() {} });
    if (k === "measureText") return () => ({ width: 10 });
    if (k === "getImageData") return () => ({ data: new Uint8ClampedArray(4) });
    return typeof k === "string" ? () => {} : undefined;
  },
  set(t, k, v) {
    if (k === "imageSmoothingEnabled") smoothing = v;
    if (k === "imageSmoothingQuality") quality = v;
    return true;
  },
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
    // ---------- 1) RENDERER: antialiasing + DPR ----------
    const rsrc = fs.readFileSync(path.join(GAME, "js/render.js"), "utf8");
    if (!/imageSmoothingEnabled = false/.test(rsrc)) throw new Error("imageSmoothingEnabled deveria ser false (pixel art nítido)");
    if (/imageSmoothingEnabled = true/.test(rsrc)) throw new Error("smoothing true (blur) não deveria existir");
    if (!/devicePixelRatio/.test(rsrc)) throw new Error("resize deveria usar devicePixelRatio (DPR 2x)");
    console.log("  - renderer: DPR 2x + desenho nearest (nítido, sem serrilhado e sem embaçado)");

    // ---------- 2) LOOT: sem toast rare, sem floater verde ----------
    const gsrc = fs.readFileSync(path.join(GAME, "js/game.js"), "utf8");
    if (/Loot raro/.test(gsrc)) throw new Error("toast de loot raro ainda existe");
    if (/r\.addFloater\(x, y - 0\.17, "✦ "/.test(gsrc)) throw new Error("floater de loot subindo na tela ainda existe");
    if (!/addLog\("loot", `Loot: \$\{txt\}`\)/.test(gsrc)) throw new Error("log do loot no painel deveria permanecer");
    console.log("  - loot: toast rare e floater verde removidos (só o log do painel)");

    // ---------- 3) floaters com escala de 3 fontes (v37) ----------
    if (!/f\.small \? "5px"/.test(rsrc)) throw new Error("fonte 1 (small 5px) deveria existir");
    if (!/f\.mid \? "9px"/.test(rsrc)) throw new Error("fonte 2 (cura 9px) deveria existir (v37)");
    // dano = fonte 3 (bold 12px, 1,5s) · cura = fonte 2 (9px, 1,2s)
    const danos = (gsrc.match(/true, false, 1500\);/g) || []).length;
    const curas = (gsrc.match(/false, false, 1200, true\);/g) || []).length;
    if (danos < 2) throw new Error("poucos floaters de dano na fonte 3 (" + danos + ")");
    if (curas < 4) throw new Error("poucos floaters de cura na fonte 2 (" + curas + ")");
    console.log("  - floaters: dano fonte 3 em " + danos + " pontos · cura fonte 2 em " + curas + " pontos");

    // ---------- 4) CSS do #scene: sem pixelated ----------
    const css = fs.readFileSync(path.join(GAME, "css/layout.css"), "utf8");
    // o #scene tem image-rendering:auto dentro do seu bloco (o otc-complete
    // sobrescreve display/width mas NÃO o image-rendering)
    const mScene = css.match(/#scene \{[^}]*image-rendering: auto[^}]*\}/);
    if (!mScene) throw new Error("#scene deveria usar image-rendering:auto");
    console.log("  - css: #scene com image-rendering:auto (smooth na escala)");

    if (errors.length) throw new Error(errors.join(" | "));
    console.log("V29 OK — visual nítido (DPR 2x + nearest, sem blur), loot sem flutuantes e números de cura/dano pela metade");
    process.exit(0);
  } catch (e) {
    console.log("ERRO:", e.message);
    errors.slice(0, 10).forEach((x) => console.log("  - " + x));
    process.exit(1);
  }
}, 900);
