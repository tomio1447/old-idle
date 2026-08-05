/* Teste da v41 — IA (classes, exeta preventivo, potions inteligentes):
 *
 * 1) PRIORIDADE POR CLASSE: partyAllyTarget na box escolhe HEALER
 *    (defSkills healing) > DEBUFFER (meleeCond) > SNIPER (menor HP);
 * 2) EXETA PREVENTIVO: mob DESMARCADO a 8 SQM do knight mas a 1 SQM de um
 *    aliado é marcado mesmo fora do raio normal (estende p/ 9 no modo box);
 * 3) POTIONS INTELIGENTES: com 4+ mobs colados, o tryHeal bebe ANTES do
 *    threshold (itemAt +15); sem pressão, respeita o threshold.
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
      const mkMob = (id, cx, cy, hp, maxHp, defExtra) => ({
        slug: "rat", def: Object.assign({}, GAMEDATA.monsters["cave-rat"], defExtra || {}),
        hp: hp, maxHp: maxHp, id: id, cx: cx, cy: cy,
        x: (cx + 0.5) / 21, y: (cy + 0.5) / 13, dir: "w", moving: false, attackAnim: 0,
      });

      // ========== 1) PRIORIDADE POR CLASSE ==========
      {
        const lider = createCharacter("KnightCls", "knight", "male");
        const dru = createCharacter("DruCls", "druid", "male");
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
        const centro = boxCenter(c);
        c.player.cx = centro.cx; c.player.cy = centro.cy;
        c.player.x = (centro.cx + 0.5) / 21; c.player.y = (centro.cy + 0.5) / 13;
        const entDru = c.players.find(e => e.p && e.p.voc === "druid");
        entDru.cx = centro.cx; entDru.cy = centro.cy - 3;

        // na box (colados no knight): normal (50% HP), debuffer (70% HP),
        // healer (90% HP) — o healer é prioridade mesmo com MAIS HP
        c.mobs = [
          mkMob("normal", centro.cx + 1, centro.cy, 50, 100),
          mkMob("debuff", centro.cx - 1, centro.cy, 70, 100, { meleeCond: { tipo: "poison", dano: 5, total: 20 } }),
          mkMob("healer", centro.cx, centro.cy + 1, 90, 100, { defSkills: [{ n: "healing", min: 10, max: 30, int: 2000, ch: 20 }] }),
        ];
        const alvo1 = partyAllyTarget(c, entDru);
        if (!alvo1 || alvo1.id !== "healer") fail("deveria priorizar o HEALER, veio " + (alvo1 && alvo1.id));
        ok.push("classe: healer > debuffer > sniper (mata o healer primeiro)");

        // sem healer: debuffer
        c.mobs = c.mobs.filter(m => m.id !== "healer");
        const alvo2 = partyAllyTarget(c, entDru);
        if (!alvo2 || alvo2.id !== "debuff") fail("deveria priorizar o DEBUFFER, veio " + (alvo2 && alvo2.id));
        ok.push("classe: sem healer, mata o debuffer (condição) primeiro");

        // sem healer/debuffer: sniper (menor HP)
        c.mobs = [ mkMob("n1", centro.cx + 1, centro.cy, 80, 100),
                   mkMob("n2", centro.cx - 1, centro.cy, 40, 100) ];
        const alvo3 = partyAllyTarget(c, entDru);
        if (!alvo3 || alvo3.id !== "n2") fail("sem healer/debuffer deveria mirar o de MENOR HP (n2), veio " + (alvo3 && alvo3.id));
        ok.push("classe: sem healer/debuffer, sniper (menor HP)");
      }

      // ========== 2) EXETA PREVENTIVO ==========
      {
        const kn = createCharacter("KnightPrev", "knight", "male");
        const dru = createCharacter("DruPrev", "druid", "male");
        kn.level = 300; kn.mp = 99999;
        localStorage.setItem("tibia-idle-party-local-v1", JSON.stringify({
          leaderId: String(characterId(kn)), leaderName: kn.name,
          members: [{ id: String(characterId(dru)), name: dru.name, voc: dru.voc, level: 200, expGained: 0, kills: 0, levelUps: 0 }],
          invites: [], shareExp: false, session: null,
        }));
        saveCharacterToRoster(kn); saveCharacterToRoster(dru);
        G.p = kn;
        const c = newCombat(kn, "rats", "non-pvp");
        c.huntMap = null;
        G.combat = c;
        const centro = boxCenter(c);   // (10,6)
        c.player.cx = centro.cx; c.player.cy = centro.cy;
        c.player.x = (centro.cx + 0.5) / 21; c.player.y = (centro.cy + 0.5) / 13;
        c.huntMode = "box";
        const entDru = c.players.find(e => e.p && e.p.voc === "druid");
        // druid a 3 do knight: (10,3)
        entDru.cx = centro.cx; entDru.cy = centro.cy - 3;
        // mob a 8 SQM do knight (fora do raio 7) mas colado no druid (1 SQM)
        c.mobs = [ mkMob("ameaca", centro.cx, centro.cy - 4, 100, 100) ];
        // dist knight->mob = 4? (10,6)->(10,2) = 4. Hmm, quero 8: põe druid em outro lugar
        // druid em (10,6)+... vamos reposicionar: knight (10,6), druid (14,6) [3 leste]
        entDru.cx = centro.cx + 4; entDru.cy = centro.cy;   // (14,6) — 4 do knight
        // mob a 1 do druid: (13,6) — dist do knight = 3. Não testa raio estendido.
        // Para dist 8 do knight: mob (18,6), druid (17,6) → druid a 7 do knight (fora da reta normal do mago mas ok)
        c.mobs = [ mkMob("ameaca", centro.cx + 8, centro.cy, 100, 100) ];  // (18,6)
        entDru.cx = centro.cx + 7; entDru.cy = centro.cy;                  // (17,6) — 1 do mob
        const agora = Date.now();
        const r = tryChallenge(c, kn, agora);
        if (!r) fail("exeta preventivo: deveria castar (mob ameaça o druid)");
        const marcado = c.mobs[0].challengedUntil > agora;
        if (!marcado) fail("exeta preventivo: mob a 8 SQM do knight mas colado no druid deveria ser marcado");
        ok.push("exeta preventivo: marca o mob que ameaça o aliado mesmo fora do raio (8 SQM)");
      }

      // ========== 3) POTIONS INTELIGENTES ==========
      {
        const kn = createCharacter("KnightPot", "knight", "male");
        kn.level = 50;
        const mx = maxStats(kn);
        kn.hp = Math.floor(mx.hp * 0.60);   // 60% de HP
        kn.supplies = { "health-potion": 10 };
        // força os thresholds baixos (50/50) — o default do jogo é 90/60
        kn.config = Object.assign({}, kn.config, {
          useRunes: true, healAt: 50, healSpellAt: 50, healItemAt: 50,
          noPotions: false, healSpell: "",
        });
        // SEM pressão (nenhum mob colado): 60 > 50 → não bebe
        const cSem = { mobs: [], player: { cx: 10, cy: 6 }, events: [], delayedHits: [] };
        const hpSem = kn.hp;
        const rSem = tryHeal(cSem, kn, Date.now());
        if (rSem) fail("sem pressão não deveria beber com 60% (threshold 50)");
        // COM pressão (4 mobs colados): 60 <= 65 (50+15) → bebe
        const cCom = { mobs: [], player: { cx: 10, cy: 6 }, events: [], delayedHits: [] };
        for (let i = 0; i < 4; i++) {
          cCom.mobs.push({ slug: "rat", def: GAMEDATA.monsters["cave-rat"], hp: 100, maxHp: 100,
            id: "m" + i, cx: 10 + (i % 2), cy: 6 + Math.floor(i / 2), x: 0.5, y: 0.5, dir: "w", moving: false });
        }
        const hpCom = kn.hp;
        const rCom = tryHeal(cCom, kn, Date.now());
        if (!rCom) fail("com pressão (4 mobs colados) deveria beber a 60% (threshold 50+15)");
        if (kn.hp <= hpCom) fail("potion não curou com pressão");
        ok.push("potions inteligentes: sob pressão (4+ mobs) bebe ANTES do threshold (60% com config 50)");
      }

      console.log("  - " + ok.join("\\n  - "));
    `, vctx);
    if (errors.length) throw new Error(errors.join(" | "));

    // ---- validação estática ----
    const asrc = fs.readFileSync(path.join(GAME, "js/gridai.js"), "utf8");
    if (!/function boxSobPressao/.test(asrc)) throw new Error("boxSobPressao ausente no gridai.js");
    const csrc = fs.readFileSync(path.join(GAME, "js/combat.js"), "utf8");
    if (!/function mobEhHealer/.test(csrc)) throw new Error("mobEhHealer ausente");
    if (!/function mobEhDebuffer/.test(csrc)) throw new Error("mobEhDebuffer ausente");
    if (!/healers\.length/.test(csrc)) throw new Error("partyAllyTarget não prioriza healer");
    if (!/if \(ameaca\) alc = 9/.test(csrc)) throw new Error("exeta preventivo (raio 9) ausente");
    if (!/boxSobPressao\(c, c\.player/.test(csrc)) throw new Error("tryHeal não usa pressão");
    console.log("  - fonte: boxSobPressao (gridai) + mobEhHealer/Debuffer + exeta preventivo + potion sob pressão (combat)");

    console.log("V41 OK — prioridade por classe, exeta preventivo e potions inteligentes");
    process.exit(0);
  } catch (e) {
    console.log("ERRO:", e.message);
    errors.slice(0, 10).forEach((x) => console.log("  - " + x));
    process.exit(1);
  }
}, 900);
