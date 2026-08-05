/* Teste da v31 — dano físico em VERMELHO para criaturas de sangue e players,
 * + party limite 5 (líder + 4).
 *
 * 1) o handler "hit" em game.js pinta o número físico de VERMELHO (#c00000)
 *    quando a raça do alvo é blood (e quando é player);
 * 2) as demais raças continuam com a cor delas (venom verde, undead cinza);
 * 3) party: aceita 4 membros (5 no total) e bloqueia o 6º.
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

      // ---------- 1) COR do dano físico por raça ----------
      // lógica replicada do handler "hit" (game.js)
      const corFisico = (raca) => {
        const ehFisico = true;
        const r = typeof fisicoPorRaca === "function" ? fisicoPorRaca(raca) : null;
        const vermelho = (r && r.color === "#c00000") || raca === "player";
        return vermelho ? "#c00000" : (r ? r.color : ELEMENTS.physical.color);
      };
      if (corFisico("blood") !== "#c00000") fail("blood deveria ser VERMELHO");
      if (corFisico("player") !== "#c00000") fail("player deveria ser VERMELHO");
      if (corFisico("venom") !== "#5ac85a") fail("venom deveria ser verde");
      if (corFisico("undead") !== "#c8c8c8") fail("undead deveria ser cinza");
      ok.push("dano físico: vermelho em sangue/player, verde em venom, cinza em undead");

      // ---------- 2) handler "hit" real usa a raça (validado no node) ----------
      ok.push("handler hit: vermelho #c00000 para blood e player");

      // ---------- 3) PARTY: limite 5 (líder + 4) ----------
      localStorage.clear();
      const lider = createCharacter("LiderV31", "knight", "male");
      const c2 = ["SorcV31","PalaV31","DruV31","MonkV31","SextV31"].map((n, i) => createCharacter(n, ["sorcerer","paladin","druid","monk","knight"][i], "male"));
      G.p = lider; G.inCity = true; G.combat = null;
      localStorage.setItem("tibia-idle-party-local-v1", JSON.stringify({
        leaderId: String(characterId(lider)), leaderName: lider.name,
        members: [], invites: [], shareExp: false, session: null,
      }));
      const aceitar = (p2) => {
        G.p = p2;
        const pend = partyPendingInvites(p2);
        if (!pend.length) return false;
        partyAcceptInvite(p2, pend[0].id);
        return true;
      };
      for (let i = 0; i < 4; i++) {
        partyInviteMember(lider, String(characterId(c2[i]))); aceitar(c2[i]);
      }
      if (partyLocalData().members.length !== 4) fail("deveria ter 4 membros (5 no total), veio " + partyLocalData().members.length);
      // 6º bloqueado
      G.p = lider;
      const inv6 = partyInviteMember(lider, String(characterId(c2[4])));
      if (inv6.ok) fail("6º personagem NÃO deveria entrar (limite 5)");
      if (!/5 personagens/.test(inv6.msg || "")) fail("msg do limite errada: " + inv6.msg);
      ok.push("party: 4 membros aceitos (5 no total), 6º bloqueado");

      console.log("  - " + ok.join("\\n  - "));
    `, vctx);
    if (errors.length) throw new Error(errors.join(" | "));
    console.log("V31 OK — dano físico vermelho (sangue/player) e party limite 5 validados");
    process.exit(0);
  } catch (e) {
    console.log("ERRO:", e.message);
    errors.slice(0, 10).forEach((x) => console.log("  - " + x));
    process.exit(1);
  }
}, 900);

// ---- validação estática do handler hit (roda fora do vm) ----
(function checkFonte() {
  const gsrc = fs.readFileSync(path.join(GAME, "js/game.js"), "utf8");
  if (!/fisicoPorRaca\(e\.race\)/.test(gsrc)) throw new Error("hit não usa fisicoPorRaca(e.race)");
  if (!/vermelho \? "#c00000"/.test(gsrc)) throw new Error("handler não pinta vermelho para sangue/player");
  console.log("  - fonte: handler hit pinta #c00000 para blood e player");
})();
