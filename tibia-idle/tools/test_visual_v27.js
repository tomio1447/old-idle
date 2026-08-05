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

    // ---------- 3) floaters de cura/dano com metade do tamanho ----------
    if (!/f\.small \? "6px" : "11px"/.test(rsrc)) throw new Error("fonte small de cura/dano deveria ser 6px (metade de 11)");
    // os handlers de dano/cura passam small=true
    const hits = (gsrc.match(/false, true\);  \/\/ small \(v27\)/g) || []).length;
    if (hits < 4) throw new Error("poucos floaters de cura/dano marcados como small (" + hits + ")");
    console.log("  - floaters de cura/dano: fonte 6px (metade) em " + hits + " pontos");

    // ---------- 4) CSS do #scene: sem pixelated ----------
    const css = fs.readFileSync(path.join(GAME, "css/layout.css"), "utf8");
    if (!/#scene \{ image-rendering: auto; \}/.test(css)) throw new Error("#scene deveria usar image-rendering:auto");
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
