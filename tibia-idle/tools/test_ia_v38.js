/* Teste da v38 — IA dos personagens (party combat):
 *
 * 1) KNIGHT: boxKnightSpot varre a SALA e escolhe o spot com MAIS
 *    adjacências livres (tankar a box) + corredores para os magos — nunca
 *    um canto de parede (adj < 5 é descartado);
 * 2) MAGOS: boxTargetCell escolhe a RETA a 3 SQM cuja WAVE (linha reta do
 *    Canary) pega mais mobs da box — mesmo que o raio de área (3) seja
 *    menor que o de outra reta;
 * 3) ANTI-OSCILAÇÃO: formationThinkStep só troca de destino se o novo
 *    score for > 20% do atual (histerese) e reavalia a cada 1500ms;
 *    parado na posição fica parado; bloqueado espera 500ms.
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

      // ---------- 1) KNIGHT: prefere adjacência livre ----------
      {
        const lider = createCharacter("KnightIA", "knight", "male");
        localStorage.setItem("tibia-idle-party-local-v1", JSON.stringify({
          leaderId: String(characterId(lider)), leaderName: lider.name,
          members: [], invites: [], shareExp: false, session: null,
        }));
        saveCharacterToRoster(lider);
        G.p = lider;
        const c = newCombat(lider, "rats", "non-pvp");
        c.huntMap = null;
        G.combat = c;
        const centro = boxCenter(c);
        c.player.cx = centro.cx; c.player.cy = centro.cy;

        // paredes simuladas num canto: (3,3) só tem 3 adjacências livres
        const occ = new Map();
        for (const k of [[2,2],[2,3],[2,4],[3,2],[4,2]]) occ.set(k[0]+":"+k[1], { wall: true });

        // mobs clusterados PERTO do canto (tentação de ir para lá)
        c.mobs = [];
        for (const [mx, my] of [[3,4],[4,3],[4,4],[3,3],[4,5],[5,4]]) {
          c.mobs.push({ slug: "rat", def: Object.assign({}, GAMEDATA.monsters["cave-rat"]),
            hp: 100, maxHp: 100, id: "k" + mx + my,
            cx: mx, cy: my, x: 0.4, y: 0.4, dir: "w", moving: false, attackAnim: 0 });
        }

        const spot = boxKnightSpot(c, occ, centro);
        const adjSpot = boxAdjFreeCount(spot.cx, spot.cy, occ);
        if (adjSpot < 8) fail("knight deveria escolher spot com 8 adjacências livres, veio adj " + adjSpot + " em " + JSON.stringify(spot));
        // e os mobs continuam no alcance (7 SQM)
        if (boxCountMobs(c, spot.cx, spot.cy, 7) < 6) fail("knight com poucos mobs no alcance 7: " + boxCountMobs(c, spot.cx, spot.cy, 7));
        ok.push("knight: melhor spot da sala = adjacência livre (8) + mobs no alcance, nunca canto de parede");

        // célula de canto com adj<5 é descartada mesmo cheia de mobs
        const canto = boxAdjFreeCount(3, 3, occ);
        if (canto >= 5) fail("célula (3,3) deveria ter <5 adj com as paredes (veio " + canto + ")");
        ok.push("knight: adj < 5 descartado (" + canto + " adj no canto)");
      }

      // ---------- 2) MAGO: reta da WAVE (não só raio de área) ----------
      {
        const lider = createCharacter("KnightWave", "knight", "male");
        const dru = createCharacter("DruWave", "druid", "male");
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
        const entDru = c.players.find(e => e.p && e.p.voc === "druid");
        entDru.cx = centro.cx + 6; entDru.cy = centro.cy;   // longe, no leste

        // box vertical na coluna do centro (sul): a wave do NORTE pega eles
        c.mobs = [];
        for (const my of [8, 9, 10]) {
          c.mobs.push({ slug: "rat", def: Object.assign({}, GAMEDATA.monsters["cave-rat"]),
            hp: 100, maxHp: 100, id: "w" + my,
            cx: centro.cx, cy: my, x: 0.4, y: 0.4, dir: "w", moving: false, attackAnim: 0 });
        }
        const tDru = boxTargetCell(c, entDru, new Map());
        // deve escolher o NORTE (10,3): wave vertical pega os 3 mobs da box
        if (tDru.cx !== centro.cx || tDru.cy !== centro.cy - 3) {
          fail("mago deveria escolher a reta NORTE (wave pega a box vertical), veio " + JSON.stringify(tDru));
        }
        const nWaveN = boxCountWaveMobs(c, centro.cx, centro.cy - 3, centro.cx, centro.cy);
        const nWaveS = boxCountWaveMobs(c, centro.cx, centro.cy + 3, centro.cx, centro.cy);
        if (nWaveN <= nWaveS) fail("wave do norte deveria pegar mais que a do sul (nN=" + nWaveN + " nS=" + nWaveS + ")");
        ok.push("mago: reta escolhida pela WAVE (" + nWaveN + " mobs na linha do norte vs " + nWaveS + " do sul)");

        // distância e reta (nunca diagonal) mantidas
        const ddx = Math.abs(tDru.cx - centro.cx), ddy = Math.abs(tDru.cy - centro.cy);
        if (Math.max(ddx, ddy) !== 3) fail("mago deve ficar a 3 SQM do knight, veio " + JSON.stringify(tDru));
        if (ddx !== 0 && ddy !== 0) fail("mago NÃO pode ficar na diagonal: " + JSON.stringify(tDru));
        ok.push("mago: 3 SQM em linha reta (nunca diagonal)");
      }

      // ---------- 3) HISTERESE (anti-oscilação) ----------
      {
        const ent = { cx: 10, cy: 6, x: 0.5, y: 0.5, p: { level: 100 }, dir: "s", moving: false, nextStepAt: 0 };
        const occV = new Map();
        const t0 = 1000000;
        // 3a) +10% (110 vs 100): NÃO troca de destino
        ent._boxAt = 0; ent._boxTarget = { cx: 10, cy: 6 }; ent._boxScore = 100;
        formationThinkStep({}, ent, null, occV, t0, () => ({ cx: 20, cy: 10, score: 110 }));
        if (ent._boxTarget.cx !== 10 || ent._boxTarget.cy !== 6)
          fail("histerese: trocou de destino com apenas +10% (110 < 120)");
        // 3b) +30% (130 vs 100): TROCA
        ent.nextStepAt = 0;
        ent._boxAt = 0; ent._boxScore = 100;
        formationThinkStep({}, ent, null, occV, t0 + 1, () => ({ cx: 20, cy: 10, score: 130 }));
        if (ent._boxTarget.cx !== 20 || ent._boxTarget.cy !== 10)
          fail("histerese: deveria trocar com +30% (130 > 120)");
        ok.push("histerese: destino só troca com >20% de ganho (anti-corrida)");

        // 3c) parado NA posição: fica parado (não anda)
        ent._boxAt = 0; ent._boxTarget = { cx: 20, cy: 10 }; ent._boxScore = 130;
        ent.cx = 20; ent.cy = 10;
        const antes = ent.nextStepAt;
        const rParado = formationThinkStep({}, ent, null, occV, t0 + 2, () => ({ cx: 20, cy: 10, score: 130 }));
        if (rParado !== false) fail("parado na posição deveria retornar false");
        if (!(ent.nextStepAt > t0 + 2)) fail("parado na posição deveria agendar próximo think (nextStepAt)");
        ok.push("parado na posição: fica parado encarando o alvo");
      }

      console.log("  - " + ok.join("\\n  - "));
    `, vctx);
    if (errors.length) throw new Error(errors.join(" | "));

    // ---- validação estática (constantes de tempo) ----
    const asrc = fs.readFileSync(path.join(GAME, "js/gridai.js"), "utf8");
    if (!/now - ent\._boxAt > 1500/.test(asrc)) throw new Error("reavaliação deveria ser 1500ms");
    if (!/\(novo\.score \|\| 0\) > \(ent\._boxScore \|\| 0\) \* 1\.2/.test(asrc))
      throw new Error("histerese 1.2x ausente");
    if (!/boxAdjFreeCount\(/.test(asrc)) throw new Error("boxAdjFreeCount ausente");
    if (!/boxCountWaveMobs\(/.test(asrc)) throw new Error("boxCountWaveMobs ausente");
    if (!/nextStepAt = now \+ 500/.test(asrc)) throw new Error("espera de caminho bloqueado (500ms) ausente");
    console.log("  - fonte: reavaliação 1500ms, histerese 1.2x, adj/wave, bloqueio 500ms");

    console.log("V38 OK — knight com adjacência livre, magos na reta da wave, anti-oscilação (histerese)");
    process.exit(0);
  } catch (e) {
    console.log("ERRO:", e.message);
    errors.slice(0, 10).forEach((x) => console.log("  - " + x));
    process.exit(1);
  }
}, 900);
