/* Teste da v40 — IA dos personagens (precisão de ataque):
 *
 * 1) KITING EM RETA: stepKiteLine foge/aproxima ao longo do EIXO DOMINANTE
 *    (a linha da wave) — nunca em diagonal que tira o caster da linha;
 * 2) COMBO com ALVO DINÂMICO: comboEscolhe escolhe o mob que MAXIMIZA o
 *    pack da área (centro do cluster) em vez de atacar o alvo original;
 *    o tryCastSpell usa esse alvo no cast;
 * 3) POSIÇÃO SINCRONIZADA: o mago/RP se alinha com o spot que o KNIGHT
 *    ESCOLHEU (_boxTarget) — não onde ele está agora.
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
      const mkMob = (id, cx, cy, hp, maxHp) => ({
        slug: "rat", def: Object.assign({}, GAMEDATA.monsters["cave-rat"]),
        hp: hp, maxHp: maxHp, id: id, cx: cx, cy: cy,
        x: (cx + 0.5) / 21, y: (cy + 0.5) / 13, dir: "w", moving: false, attackAnim: 0,
      });

      // ========== 1) KITING EM RETA ==========
      {
        // alvo no LESTE (13,6), player (10,6): eixo dominante = x
        const pl = { cx: 10, cy: 6, x: 0.5, y: 0.5 };
        const alvo = { cx: 13, cy: 6 };
        const occ = new Map();
        // fugindo (dist 3 > querido? NÃO: kiting com querido 2 → dist 3 > 2 → APROXIMA)
        // fugindo de verdade: player (10,6), alvo (11,6) dist 1 < querido 2 → away
        const pl2 = { cx: 10, cy: 6 };
        const alvo2 = { cx: 11, cy: 6 };
        const dirF = stepKiteLine(pl2, alvo2, occ, true);
        if (!dirF || dirF.dx !== -1 || dirF.dy !== 0)
          fail("kiting away deveria ir no eixo X (-1,0), veio " + JSON.stringify(dirF));
        // aproximando: alvo no LESTE, dist 3 > querido 2
        const dirA = stepKiteLine(pl, alvo, occ, false);
        if (!dirA || dirA.dx !== 1 || dirA.dy !== 0)
          fail("kiting aprox deveria ir no eixo X (1,0), veio " + JSON.stringify(dirA));
        // alvo no SUL (10,9): eixo dominante = y
        const dirS = stepKiteLine({ cx: 10, cy: 6 }, { cx: 10, cy: 9 }, occ, false);
        if (!dirS || dirS.dx !== 0 || dirS.dy !== 1)
          fail("kiting aprox sul deveria ir no eixo Y (0,1), veio " + JSON.stringify(dirS));
        ok.push("kiting em reta: foge/aproxima no eixo dominante (linha da wave), nunca diagonal");
      }

      // ========== 2) COMBO com ALVO DINÂMICO ==========
      {
        const sor = createCharacter("SorCombo", "sorcerer", "male");
        sor.level = 100; sor.mp = 99999;
        sor.config.combo = [{ kind: "spell", id: "exevo-gran-mas-flam", min: 2 }];
        const c = { mobs: [], player: { cx: 10, cy: 6, x: 0.5, y: 0.5 } };
        // mobs[0] = solitário no LESTE; cluster de 3 no OESTE
        c.mobs = [
          mkMob("solo", 14, 6, 500, 500),
          mkMob("c1", 6, 5, 100, 100),
          mkMob("c2", 6, 6, 100, 100),
          mkMob("c3", 6, 7, 100, 100),
        ];
        const agora = Date.now();
        const escolha = comboEscolhe(c, sor, c.mobs[0], agora);
        if (!escolha) fail("combo não escolheu nada (deveria escolher Hell's Core com min 2)");
        const alvoEsc = escolha.alvo;
        if (!alvoEsc) fail("combo deveria retornar alvo dinâmico");
        if (alvoEsc.id === "solo") fail("combo deveria escolher o CLUSTER (3 alvos), não o mob solitário");
        const nPack = comboAlvosNoRaio(c, alvoEsc, comboRaio(escolha.entrada));
        if (nPack < 3) fail("alvo dinâmico deveria pegar 3 alvos no pack, pegou " + nPack);
        ok.push("combo alvo dinâmico: escolhe o centro do maior cluster (" + alvoEsc.id + ", " + nPack + " alvos)");
      }

      // ========== 3) POSIÇÃO SINCRONIZADA ==========
      {
        const lider = createCharacter("KnightSync", "knight", "male");
        const dru = createCharacter("DruSync", "druid", "male");
        localStorage.setItem("tibia-idle-party-local-v1", JSON.stringify({
          leaderId: String(characterId(lider)), leaderName: lider.name,
          members: [{ id: String(characterId(dru)), name: dru.name, voc: dru.voc, level: 200, expGained: 0, kills: 0, levelUps: 0 }],
          invites: [], shareExp: false, session: null,
        }));
        saveCharacterToRoster(lider); saveCharacterToRoster(dru);
        G.p = lider;
        const c = newCombat(lider, "rats", "non-pvp");
        c.huntMap = null;
        G.combat = c;
        const centro = boxCenter(c);   // (10,6)
        c.player.cx = centro.cx; c.player.cy = centro.cy;
        c.player.x = (centro.cx + 0.5) / 21; c.player.y = (centro.cy + 0.5) / 13;
        const entDru = c.players.find(e => e.p && e.p.voc === "druid");
        // o knight DECIDIU ir para (12,6) — o _boxTarget dele
        c.player._boxTarget = { cx: 12, cy: 6, score: 4000 };
        // box de mobs em volta de (12,6) (o spot que ele escolheu)
        c.mobs = [ mkMob("m1", 12, 6, 100, 100), mkMob("m2", 12, 5, 100, 100),
                   mkMob("m3", 12, 7, 100, 100), mkMob("m4", 11, 6, 100, 100) ];
        const tDru = boxTargetCell(c, entDru, new Map());
        // o mago deve se alinhar com (12,6) — dist 3 em RETA a partir do SPOT ESCOLHIDO
        const ddx = Math.abs(tDru.cx - 12), ddy = Math.abs(tDru.cy - 6);
        if (Math.max(ddx, ddy) !== 3) fail("mago deveria ficar a 3 SQM do SPOT ESCOLHIDO do knight (12,6), veio " + JSON.stringify(tDru));
        if (ddx !== 0 && ddy !== 0) fail("mago NÃO pode ficar na diagonal do spot: " + JSON.stringify(tDru));
        // e a reta dele alinha a wave com o spot (a wave pega os mobs da box)
        const nWave = boxCountWaveMobs(c, tDru.cx, tDru.cy, 12, 6);
        if (nWave < 4) fail("a reta sincronizada deveria pegar os 4 mobs da box na wave, pegou " + nWave);
        ok.push("posição sincronizada: mago alinhado com o spot ESCOLHIDO do knight (" + tDru.cx + "," + tDru.cy + ", wave pega " + nWave + ")");
      }

      console.log("  - " + ok.join("\\n  - "));
    `, vctx);
    if (errors.length) throw new Error(errors.join(" | "));

    // ---- validação estática ----
    const asrc = fs.readFileSync(path.join(GAME, "js/gridai.js"), "utf8");
    if (!/function stepKiteLine/.test(asrc)) throw new Error("stepKiteLine ausente no gridai.js");
    if (!/dir = stepKiteLine\(pl, alvo, occ/.test(asrc)) throw new Error("playerThinkStep não usa stepKiteLine no kiting");
    if (!/function boxSincBase/.test(asrc)) throw new Error("boxSincBase ausente no gridai.js");
    if (!/knight\._boxTarget/.test(asrc)) throw new Error("boxSincBase deveria ler o _boxTarget do knight");
    const cs = fs.readFileSync(path.join(GAME, "js/combo.js"), "utf8");
    if (!/function comboMelhorAlvo/.test(cs)) throw new Error("comboMelhorAlvo ausente no combo.js");
    if (!/const alvoDin = comboMelhorAlvo/.test(cs)) throw new Error("comboEscolhe não usa o alvo dinâmico");
    if (!/alvo: alvo \}/.test(cs) && !/alvo: alvo/.test(cs)) throw new Error("comboEscolhe deveria retornar o alvo");
    const csrc = fs.readFileSync(path.join(GAME, "js/combat.js"), "utf8");
    if (!/escolha\.alvo/.test(csrc)) throw new Error("tryCastSpell não usa o alvo dinâmico do combo");
    console.log("  - fonte: stepKiteLine + boxSincBase (gridai), comboMelhorAlvo (combo), escolha.alvo (combat)");

    console.log("V40 OK — kiting em reta, combo com alvo dinâmico e posição sincronizada com o knight");
    process.exit(0);
  } catch (e) {
    console.log("ERRO:", e.message);
    errors.slice(0, 10).forEach((x) => console.log("  - " + x));
    process.exit(1);
  }
}, 900);
