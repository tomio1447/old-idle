/* Teste da v39 — IA dos personagens (sobrevivência e foco):
 *
 * 1) DANGER (fuga): mob colado num NÃO-knight faz ele fugir 1 passo antes
 *    da formação; o KNIGHT nunca foge (é o tanque);
 * 2) partyAllyTarget: aliado prioriza mob SOLTO (fora da box, > 2 SQM do
 *    knight) e senão o de MENOR % de HP (sniper); o knight aliado mira o
 *    mais próximo;
 * 3) EXETA INTELIGENTE: com todo mundo marcado, tryChallenge não casta nem
 *    gasta mana; com 1 mob desmarcado, casta e marca.
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { JSDOM } = require("jsdom");

const GAME = path.join(__dirname, "..", "game");
const html = fs.readFileSync(path.join(GAME, "index.html"), "utf8");
const scripts = [...html.matchAll(/<script src="([^\"]+)\"><\/script>/g)].map(m => m[1]);
const dom = new JSDOM(html.replace(/<script[^>]*src=\"[^\"]*\"[^>]*><\/script>/g, ""), {
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

      // ========== setup party: knight (líder/ativo) + druid + sorc ==========
      const lider = createCharacter("KnightV39", "knight", "male");
      const dru = createCharacter("DruV39", "druid", "male");
      const sor = createCharacter("SorV39", "sorcerer", "male");
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
      const centro = boxCenter(c);   // (10,6)
      c.player.cx = centro.cx; c.player.cy = centro.cy;
      const scP = cellToScreen(centro.cx, centro.cy);
      c.player.x = scP.x; c.player.y = scP.y;
      const entDru = c.players.find(e => e.p && e.p.voc === "druid");
      const entSor = c.players.find(e => e.p && e.p.voc === "sorcerer");

      const mkMob = (id, cx, cy, hp, maxHp) => ({
        slug: "rat", def: Object.assign({}, GAMEDATA.monsters["cave-rat"]),
        hp: hp, maxHp: maxHp, id: id, cx: cx, cy: cy,
        x: (cx + 0.5) / 21, y: (cy + 0.5) / 13, dir: "w", moving: false, attackAnim: 0,
      });

      // ========== 1) partyAllyTarget: sniper + prioridade de solto ==========
      {
        // box: 3 mobs colados no knight com HP baixo; 1 mob SOLTO (longe, HP cheio)
        c.mobs = [
          mkMob("b1", centro.cx + 1, centro.cy, 30, 100),
          mkMob("b2", centro.cx - 1, centro.cy, 40, 100),
          mkMob("b3", centro.cx, centro.cy + 1, 50, 100),
          mkMob("solto", centro.cx + 5, centro.cy - 4, 900, 1000),   // fora da box
        ];
        entDru.cx = centro.cx; entDru.cy = centro.cy - 3;
        const alvo = partyAllyTarget(c, entDru);
        if (!alvo || alvo.id !== "solto") fail("aliado deveria priorizar o mob SOLTO (ranged/escapado), veio " + (alvo && alvo.id));
        ok.push("partyAllyTarget: prioriza mob solto (fora da box)");

        // sem solto: sniper = menor % de HP (b1 = 30%)
        c.mobs = c.mobs.filter(m => m.id !== "solto");
        const alvo2 = partyAllyTarget(c, entDru);
        if (!alvo2 || alvo2.id !== "b1") fail("aliado deveria mirar o de MENOR HP (b1), veio " + (alvo2 && alvo2.id));
        ok.push("partyAllyTarget: sniper — mira o mob com menor % de HP");

        // knight aliado: mira o mais PRÓXIMO (não persegue longe)
        const alvoKn = partyAllyTarget(c, c.player);
        if (!alvoKn) fail("knight aliado deveria ter alvo");
        const dKn = sqmDistance(c.player, alvoKn);
        if (dKn > 1) fail("knight aliado deveria mirar o mais próximo (colado), veio " + alvoKn.id + " dist " + dKn);
        ok.push("partyAllyTarget: knight mira o mais próximo (não sai da box)");
      }

      // ========== 2) DANGER: fuga do mago, knight não foge ==========
      {
        // mob colado NO DRUID -> druid foge 1 passo
        c.mobs = [ mkMob("threat", entDru.cx + 1, entDru.cy, 100, 100) ];
        const threat = boxThreatened(c, entDru, 1);
        if (!threat) fail("boxThreatened deveria achar o mob colado no druid");
        const occD = buildOccupancy(c);
        const antes = { cx: entDru.cx, cy: entDru.cy };
        const rFuga = formationThinkStep(c, entDru, c.mobs[0], occD, Date.now(), boxTargetCell);
        if (!rFuga) fail("druid deveria ter fugido (formação retornou false)");
        const dDepois = Math.max(Math.abs(entDru.cx - threat.cx), Math.abs(entDru.cy - threat.cy));
        if (dDepois <= 1) fail("druid deveria ter aumentado a distância do mob (ficou " + dDepois + "), pos " + entDru.cx + "," + entDru.cy);
        ok.push("DANGER: mago com mob colado foge 1 passo (" + antes.cx + "," + antes.cy + " -> " + entDru.cx + "," + entDru.cy + ")");

        // knight NUNCA foge
        c.mobs = [ mkMob("threatK", centro.cx + 1, centro.cy, 100, 100) ];
        const threatK = boxThreatened(c, c.player, 1);
        if (threatK) fail("boxThreatened NÃO deveria ameaçar o knight (ele tanka)");
        ok.push("DANGER: knight nunca foge (é o tanque)");
      }

      // ========== 3) EXETA INTELIGENTE ==========
      {
        const kn = createCharacter("KnightExeta", "knight", "male");
        kn.level = 300; kn.mp = 99999;
        kn.config = Object.assign({ attackMode: "box" }, kn.config || {});
        const plEnt = { cx: centro.cx, cy: centro.cy, x: 0.5, y: 0.5 };
        const cEx = { mobs: [], player: plEnt, events: [], huntMode: "box" };
        const agora = Date.now();
        cEx.mobs = [
          mkMob("e1", centro.cx + 1, centro.cy, 100, 100),
          mkMob("e2", centro.cx - 1, centro.cy, 100, 100),
        ];
        // tudo marcado -> NÃO casta, NÃO gasta mana
        cEx.mobs.forEach(m => { m.challengedUntil = agora + 10000; });
        const mpIni = kn.mp;
        const r1 = tryChallenge(cEx, kn, agora);
        if (r1 !== false) fail("exeta inteligente: não deveria castar com tudo marcado");
        if (kn.mp !== mpIni) fail("exeta inteligente: gastou mana sem precisar (" + mpIni + " -> " + kn.mp + ")");
        ok.push("exeta inteligente: não recasta nem gasta mana com tudo marcado");

        // 1 mob desmarcado -> casta e marca SÓ ele
        cEx.mobs[1].challengedUntil = agora - 100;
        const r2 = tryChallenge(cEx, kn, agora + 100);
        if (!r2) fail("exeta inteligente: deveria castar com 1 mob desmarcado");
        if (!(cEx.mobs[1].challengedUntil > agora + 100)) fail("exeta inteligente: mob desmarcado não foi re-marcado");
        ok.push("exeta inteligente: recasta quando um mob escapa/expira e re-marca");
      }

      console.log("  - " + ok.join("\\n  - "));
    `, vctx);
    if (errors.length) throw new Error(errors.join(" | "));

    // ---- validação estática ----
    const asrc = fs.readFileSync(path.join(GAME, "js/gridai.js"), "utf8");
    if (!/boxThreatened\(/.test(asrc)) throw new Error("boxThreatened ausente no gridai.js");
    if (!/boxFleeDir\(/.test(asrc)) throw new Error("boxFleeDir ausente no gridai.js");
    if (!/entEhKnight\(ent\)/.test(asrc)) throw new Error("entEhKnight ausente");
    const csrc = fs.readFileSync(path.join(GAME, "js/combat.js"), "utf8");
    if (!/function partyAllyTarget/.test(csrc)) throw new Error("partyAllyTarget ausente no combat.js");
    if (!/m\.challengedUntil && m\.challengedUntil > now\) continue/.test(csrc))
      throw new Error("exeta inteligente (só marca desmarcados) ausente");
    console.log("  - fonte: fuga (gridai) + partyAllyTarget + exeta inteligente (combat)");

    console.log("V39 OK — DANGER fuga, alvo inteligente (solto/sniper) e exeta sem desperdício");
    process.exit(0);
  } catch (e) {
    console.log("ERRO:", e.message);
    errors.slice(0, 10).forEach((x) => console.log("  - " + x));
    process.exit(1);
  }
}, 900);
