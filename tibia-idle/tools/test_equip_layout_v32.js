/* Teste da v32 — layout do inventário esquerdo.
 *
 * 1) SLOT_ORDER reordenado: amulet + helmet + backpack na MESMA linha;
 * 2) o slot AMMO só aparece para RP (paladino) — renderEquip não gera o
 *    slot ammo para knight/sorcerer/druid/monk, e gera para paladino;
 * 3) CSS: .bar com 9px (menor) e .inv-item 32px (menor) — abas compactas.
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

      // ---------- 1) SLOT_ORDER: amulet+helmet+backpack na mesma linha ----------
      const linha1 = SLOT_ORDER.slice(0, 3);
      if (linha1[0] !== "amulet" || linha1[1] !== "helmet" || linha1[2] !== "backpack")
        fail("primeira linha deveria ser amulet, helmet, backpack — veio " + JSON.stringify(linha1));
      if (SLOT_ORDER.indexOf("ammo") !== -1)
        fail("SLOT_ORDER não deveria conter ammo (renderizado separado p/ RP)");
      ok.push("SLOT_ORDER: amulet/helmet/backpack na mesma linha, sem ammo na grade");

      // ---------- 2) renderEquip: ammo só para RP ----------
      // knight: sem slot ammo
      const kn = createCharacter("KnightV32", "knight", "male");
      kn.equip.weapon = { item: "sword" };
      kn.equip.ammo = { item: "arrow" };
      G.p = kn;
      document.body.innerHTML = '<div id="equip"></div>';
      renderEquip(kn);
      let html = document.getElementById("equip").innerHTML;
      if (/data-slot="ammo"/.test(html)) fail("knight NÃO deveria ter slot ammo");
      // paladino: com slot ammo
      const rp = createCharacter("RPV32", "paladin", "male");
      rp.equip.ammo = { item: "arrow" };
      G.p = rp;
      document.body.innerHTML = '<div id="equip"></div>';
      renderEquip(rp);
      html = document.getElementById("equip").innerHTML;
      if (!/data-slot="ammo"/.test(html)) fail("RP deveria ter slot ammo");
      // a primeira linha da render do RP: amulet, helmet, backpack
      const slots = html.match(/data-slot="([^"]+)"/g).map(s => s.replace('data-slot="', "").replace('"', ""));
      const prim = slots.slice(0, 3);
      if (prim[0] !== "amulet" || prim[1] !== "helmet" || prim[2] !== "backpack")
        fail("render RP: primeira linha deveria ser amulet/helmet/backpack, veio " + JSON.stringify(prim));
      ok.push("renderEquip: ammo só p/ RP; amulet/helmet/backpack na primeira linha");

      console.log("  - " + ok.join("\\n  - "));
    `, vctx);
    // ---- CSS: barras menores e inv menor ----
    const css = fs.readFileSync(path.join(GAME, "css/layout.css"), "utf8");
    if (!/height: 9px; position: relative;   \/\* v32/.test(css)) throw new Error(".bar deveria ter 9px (v32)");
    if (!/grid-template-columns: repeat\(auto-fill, 32px\)/.test(css)) throw new Error(".inv-grid deveria ter 32px (v32)");
    console.log("  - css: barras 9px e inv 32px (abas compactas)");
    if (errors.length) throw new Error(errors.join(" | "));
    console.log("V32 OK — layout do inventário reordenado (amulet/helmet/backpack) e ammo só para RP");
    process.exit(0);
  } catch (e) {
    console.log("ERRO:", e.message);
    errors.slice(0, 10).forEach((x) => console.log("  - " + x));
    process.exit(1);
  }
}, 900);
