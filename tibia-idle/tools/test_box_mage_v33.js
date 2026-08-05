/* Teste da v33 — BOX magos a 3 SQM reta, sem Chase/Stand, dano/cura menores,
 * sprites das criaturas maiores. */
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

      // ---------- 1) BOX: druid/sorcerer a 3 SQM reta ----------
      const lider = createCharacter("LiderV33", "knight", "male");
      const dru = createCharacter("DruV33", "druid", "male");
      const sor = createCharacter("SorV33", "sorcerer", "male");
      localStorage.setItem("tibia-idle-party-local-v1", JSON.stringify({
        leaderId: String(characterId(lider)), leaderName: lider.name,
        members: [
          { id: String(characterId(dru)), name: dru.name, voc: dru.voc, level: 200, expGained: 0, kills: 0, levelUps: 0 },
          { id: String(characterId(sor)), name: sor.name, voc: sor.voc, level: 200, expGained: 0, kills: 0, levelUps: 0 },
        ],
        invites: [], shareExp: false, session: null,
      }));
      saveCharacterToRoster(lider); saveCharacterToRoster(dru); saveCharacterToRoster(sor);
      G.p = lider;
      const c = newCombat(lider, "rats", "non-pvp");
      c.huntMap = null;
      G.combat = c;
      const centro = boxCenter(c);
      c.player.cx = centro.cx; c.player.cy = centro.cy;
      const entDru = c.players.find(e => e.p && e.p.voc === "druid");
      const entSor = c.players.find(e => e.p && e.p.voc === "sorcerer");
      const tDru = boxTargetCell(c, entDru, null);
      const tSor = boxTargetCell(c, entSor, null);
      const distDru = Math.max(Math.abs(tDru.cx - centro.cx), Math.abs(tDru.cy - centro.cy));
      const distSor = Math.max(Math.abs(tSor.cx - centro.cx), Math.abs(tSor.cy - centro.cy));
      if (distDru !== 3) fail("druid BOX deveria ficar a 3 SQM, veio " + JSON.stringify(tDru));
      if (distSor !== 3) fail("sorcerer BOX deveria ficar a 3 SQM, veio " + JSON.stringify(tSor));
      const diagDru = Math.abs(tDru.cx - centro.cx) !== 0 && Math.abs(tDru.cy - centro.cy) !== 0;
      if (diagDru) fail("druid NÃO pode ficar na diagonal: " + JSON.stringify(tDru));
      ok.push("BOX: druid/sorcerer a 3 SQM em linha reta do knight (nunca diagonal)");

      console.log("  - " + ok.join("\\n  - "));
    `, vctx);
    if (errors.length) throw new Error(errors.join(" | "));
    // ---- validação estática ----
    const usrc = fs.readFileSync(path.join(GAME, "js/ui.js"), "utf8");
    const gsrc2 = fs.readFileSync(path.join(GAME, "js/game.js"), "utf8");
    const rsrc = fs.readFileSync(path.join(GAME, "js/render.js"), "utf8");
    const gsrc3 = fs.readFileSync(path.join(GAME, "js/gridai.js"), "utf8");
    if (/\["chase", "Chase"\]/.test(usrc) || /\["chase", "Chase"\]/.test(gsrc2))
      throw new Error("Chase ainda está na UI/modal");
    if (/\["stand", "Stand"\]/.test(usrc)) throw new Error("Stand ainda está na UI");
    if (!/f\.small \? "5px"/.test(rsrc)) throw new Error("dano/cura small deveria ser 5px");
    if (!/function creatureScale\(W\) \{ return tibiaScale\(W\) \* 1\.18; \}/.test(rsrc))
      throw new Error("creatureScale deveria ser tibiaScale * 1.18");
    const qtd = (rsrc.match(/creatureScale\(W\)/g) || []).length;
    if (qtd < 4) throw new Error("creatureScale deveria estar em 4+ pontos (tem " + qtd + ")");
    if (!/sem chase\/stand/.test(gsrc3) && !/stand: persegue/.test(gsrc3))
      throw new Error("playerThinkStep deveria ser stand (persegue só p/ atacar)");
    console.log("  - fonte: sem chase/stand, small 5px, creatureScale 1.18x em " + qtd + " pontos");
    console.log("V33 OK — BOX magos 3 SQM reta, sem chase/stand, números menores e sprites maiores");
    process.exit(0);
  } catch (e) {
    console.log("ERRO:", e.message);
    errors.slice(0, 10).forEach((x) => console.log("  - " + x));
    process.exit(1);
  }
}, 900);
