/* Teste da v26 — Knight BOX com checagem de spot (x/y) + modo SAFE (cantos)
 * + seletor "Modo de Hunt" no alto dos ataques e no modal de instância.
 *
 * 1) boxKnightSpot: o knight varre células x/y e escolhe o MELHOR spot —
 *    centro quando os mobs estão em volta; desloca quando o cluster está
 *    fora do centro;
 * 2) safeTargetCell: retorna um CANTO da tela, longe da box, mas com mobs
 *    no range das spells (7 SQM);
 * 3) formationMode: "box"/"safe" vêm do config OU do c.huntMode (modal de
 *    instância) — vale para a party;
 * 4) fonte: seletor de Modo de Hunt no topo da aba Ataque e no modal de
 *    instância (data-hunt-mode).
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

      const lider = createCharacter("LiderV26", "knight", "male");
      const rp = createCharacter("RPV26", "paladin", "male");
      localStorage.setItem("tibia-idle-party-local-v1", JSON.stringify({
        leaderId: String(characterId(lider)), leaderName: lider.name,
        members: [{ id: String(characterId(rp)), name: rp.name, voc: rp.voc, level: 200,
                    expGained: 0, kills: 0, levelUps: 0 }],
        invites: [], shareExp: false, session: null,
      }));
      saveCharacterToRoster(lider); saveCharacterToRoster(rp);
      G.p = lider;
      const c = newCombat(lider, "rats", "non-pvp");
      c.huntMap = null;
      G.combat = c;
      const centro = boxCenter(c);
      c.player.cx = centro.cx; c.player.cy = centro.cy;
      const sc0 = cellToScreen(centro.cx, centro.cy);
      c.player.x = sc0.x; c.player.y = sc0.y;

      // ---------- 1) KNIGHT BOX: checagem x/y do melhor spot ----------
      {
        // mobs clusterados NO centro -> melhor spot = centro (ou perto)
        c.mobs = [];
        for (let i = 0; i < 6; i++) {
          const dx = (i % 3) - 1, dy = Math.floor(i / 3) - 1;
          const sm = cellToScreen(centro.cx + dx, centro.cy + dy);
          c.mobs.push({ slug: "rat", def: Object.assign({}, GAMEDATA.monsters["cave-rat"]),
            hp: 100, maxHp: 100, id: "m" + i,
            cx: centro.cx + dx, cy: centro.cy + dy, x: sm.x, y: sm.y, dir: "w", moving: false, attackAnim: 0 });
        }
        const spot = boxKnightSpot(c, null, centro);
        const distSpot = Math.max(Math.abs(spot.cx - centro.cx), Math.abs(spot.cy - centro.cy));
        if (distSpot > 1) fail("knight BOX deveria parar perto do centro com mobs em volta, veio " + JSON.stringify(spot));
        ok.push("knight BOX: checagem x/y acha o melhor spot (centro com mobs em volta)");

        // mobs clusterados DESLOCADOS -> o knight desloca p/ o cluster
        const alvo = { cx: centro.cx + 4, cy: centro.cy - 3 };
        c.mobs = [];
        for (let i = 0; i < 6; i++) {
          const dx = (i % 3), dy = Math.floor(i / 3);
          const sm = cellToScreen(alvo.cx + dx, alvo.cy + dy);
          c.mobs.push({ slug: "rat", def: Object.assign({}, GAMEDATA.monsters["cave-rat"]),
            hp: 100, maxHp: 100, id: "x" + i,
            cx: alvo.cx + dx, cy: alvo.cy + dy, x: sm.x, y: sm.y, dir: "w", moving: false, attackAnim: 0 });
        }
        const spot2 = boxKnightSpot(c, null, centro);
        const dist2 = Math.max(Math.abs(spot2.cx - alvo.cx), Math.abs(spot2.cy - alvo.cy));
        if (dist2 > 2) fail("knight BOX deveria deslocar p/ o cluster de mobs, veio " + JSON.stringify(spot2));
        ok.push("knight BOX: desloca para o cluster quando ele sai do centro");
      }

      // ---------- 2) MODO SAFE: cantos da tela ----------
      {
        c.mobs = [];
        // cluster no centro
        for (let i = 0; i < 5; i++) {
          const dx = (i % 3) - 1, dy = Math.floor(i / 3) - 1;
          c.mobs.push({ slug: "rat", def: Object.assign({}, GAMEDATA.monsters["cave-rat"]),
            hp: 100, maxHp: 100, id: "s" + i,
            cx: centro.cx + dx, cy: centro.cy + dy, x: 0.4, y: 0.4, dir: "w", moving: false, attackAnim: 0 });
        }
        const ent = c.player;
        const alvoSafe = safeTargetCell(c, ent, null);
        if (!alvoSafe) fail("safeTargetCell deveria retornar um canto");
        const GW = 21, GH = 13;
        const ehCanto = (alvoSafe.cx <= 4 || alvoSafe.cx >= GW - 5) &&
                        (alvoSafe.cy <= 4 || alvoSafe.cy >= GH - 4);
        if (!ehCanto) fail("SAFE deveria ficar num canto da tela, veio " + JSON.stringify(alvoSafe));
        const distBox = Math.max(Math.abs(alvoSafe.cx - centro.cx), Math.abs(alvoSafe.cy - centro.cy));
        if (distBox < 5) fail("SAFE deveria ficar LONGE da box, veio dist " + distBox);
        const nMobs = boxCountMobs(c, alvoSafe.cx, alvoSafe.cy, 7);
        if (nMobs < 1) fail("SAFE deveria ter mobs no range das spells (7 SQM), veio " + nMobs);
        ok.push("modo SAFE: canto da tela, longe da box, mobs no range das spells");
      }

      // ---------- 3) formationMode: config OU c.huntMode ----------
      {
        if (formationMode({ huntMode: "box" }, { p: { config: { attackMode: "chase" } } }) !== "box")
          fail("formationMode deveria ler o c.huntMode (modal de instância)");
        if (formationMode({}, { p: { config: { attackMode: "safe" } } }) !== "safe")
          fail("formationMode deveria ler o attackMode do personagem");
        if (formationMode({}, { p: { config: { attackMode: "chase" } } }) !== "")
          fail("formationMode deveria ser vazio sem box/safe");
        ok.push("formationMode: box/safe vêm do config ou do c.huntMode (party inteira)");
      }

      console.log("  - " + ok.join("\\n  - "));
    `, vctx);
    // ---- fonte: Modo de Hunt no topo da aba Ataque + modal de instância ----
    const usrc = fs.readFileSync(path.join(GAME, "js/ui.js"), "utf8");
    if (!/🎯 Modo de Hunt/.test(usrc)) throw new Error("seletor Modo de Hunt não está na aba Ataque");
    const iHtml = usrc.indexOf("🎯 Modo de Hunt");
    const chunk = usrc.slice(iHtml, iHtml + 1400);
    if (!/\["safe", "SAFE"\]/.test(usrc)) throw new Error("SAFE não está no seletor da aba Ataque");
    // o Modo de Hunt deve vir ANTES das stances (topo do conteúdo da aba)
    const iStance = usrc.indexOf("renderStancePicker(p)", iHtml);
    if (iHtml < 0 || iStance < 0 || iHtml > iStance)
      throw new Error("Modo de Hunt deveria estar no TOPO da aba Ataque (antes das stances)");
    const gsrc = fs.readFileSync(path.join(GAME, "js/game.js"), "utf8");
    if (!/data-hunt-mode/.test(gsrc)) throw new Error("modal de instância não tem o seletor de modo de hunt");
    console.log("  - fonte: Modo de Hunt no alto dos ataques e no modal de instância (acima das instâncias)");
    if (errors.length) throw new Error(errors.join(" | "));
    console.log("V26 OK — knight BOX checa spot x/y, modo SAFE nos cantos e Modo de Hunt no topo validados");
    process.exit(0);
  } catch (e) {
    console.log("ERRO:", e.message);
    errors.slice(0, 10).forEach((x) => console.log("  - " + x));
    process.exit(1);
  }
}, 900);
