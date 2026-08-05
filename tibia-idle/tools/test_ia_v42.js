/* Teste da v42 — IA (risco + loot):
 *
 * 1) AGRESSIVIDADE POR RISCO: boxRiscoFoge recua com maxPackSize excedido
 *    (fora da formação) e com HP < fleeBelowHp + mobs colados; NÃO recua
 *    com config zerado/desligado; o knight na formação não foge por pack;
 * 2) FUGA: formationThinkStep foge do centro do pack quando o risco manda;
 * 3) PRIORIDADE DE LOOT: mobLootValue/mobLootRaro estimam o loot; com
 *    lootPriority ligado o aliado mira o mob de loot raro/valioso (sem
 *    healer/debuffer/solto no caminho).
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
      const mkMob = (id, cx, cy, defExtra) => ({
        slug: "rat", def: Object.assign({}, GAMEDATA.monsters["cave-rat"], defExtra || {}),
        hp: 100, maxHp: 100, id: id, cx: cx, cy: cy,
        x: (cx + 0.5) / 21, y: (cy + 0.5) / 13, dir: "w", moving: false, attackAnim: 0,
      });
      const mkLoot = (item, chance, max) => ({ item, chance, max });

      // ========== 1) boxRiscoFoge ==========
      {
        const c = { mobs: [] };
        for (let i = 0; i < 7; i++) c.mobs.push(mkMob("m" + i, 10 + (i % 3), 6 + Math.floor(i / 3)));
        const ent = { cx: 10, cy: 6, p: { level: 50, hp: 100 }, maxHp: 200 };   // 50% HP
        // maxPackSize 5 com 7 mobs -> foge
        if (!boxRiscoFoge(c, ent, { maxPackSize: 5 })) fail("maxPackSize 5 com 7 mobs deveria recuar");
        // maxPackSize 10 com 7 mobs -> não foge
        if (boxRiscoFoge(c, ent, { maxPackSize: 10 })) fail("maxPackSize 10 com 7 mobs NÃO deveria recuar");
        // knight NA formação (box) com pack grande -> não foge
        if (boxRiscoFoge(c, ent, { maxPackSize: 5, attackMode: "box" })) fail("knight na formação (box) não foge por pack");
        // fleeBelowHp 60 com 50% HP e 7 colados -> foge
        if (!boxRiscoFoge(c, ent, { fleeBelowHp: 60, fleeMobCount: 3 })) fail("HP 50% < 60 com 7 colados deveria recuar");
        // fleeBelowHp 30 com 50% HP -> não foge
        if (boxRiscoFoge(c, ent, { fleeBelowHp: 30 })) fail("HP 50% > 30 NÃO deveria recuar");
        // tudo zerado -> nunca foge
        if (boxRiscoFoge(c, ent, { maxPackSize: 0, fleeBelowHp: 0 })) fail("config zerado não deveria recuar");
        ok.push("risco: maxPackSize e fleeBelowHp recuam na hora certa (knight na box nunca foge por pack)");
      }

      // ========== 2) FUGA no formationThinkStep ==========
      {
        const c = { mobs: [] };
        // pack no LESTE do personagem (foge para oeste)
        for (let i = 0; i < 6; i++) c.mobs.push(mkMob("f" + i, 14 + (i % 2), 5 + Math.floor(i / 2)));
        const ent = { cx: 10, cy: 6, x: 0.5, y: 0.5, dir: "e", moving: false, nextStepAt: 0,
                      p: { level: 50, hp: 100, config: { maxPackSize: 5 } } };
        const occ = buildOccupancy(c);
        const antes = ent.cx;
        const r = formationThinkStep(c, ent, c.mobs[0], occ, Date.now(), boxTargetCell);
        if (!r) fail("formação deveria ter fugido (retornou false)");
        if (ent.cx >= antes) fail("fuga deveria andar para OESTE (longe do pack), veio " + ent.cx + " de " + antes);
        ok.push("fuga: formationThinkStep recua do centro do pack quando o risco manda");
      }

      // ========== 3) mobLootValue / mobLootRaro ==========
      {
        const cRico = { def: { loot: [mkLoot("gold-coin", 100, 50), mkLoot("plate-armor", 5, 1)] } };   // 480*5% = 24 + 50
        const cPobre = { def: { loot: [mkLoot("gold-coin", 100, 10)] } };                               // 10
        const vRico = mobLootValue(cRico);
        const vPobre = mobLootValue(cPobre);
        if (vRico <= vPobre) fail("loot com plate-armor deveria valer mais (" + vRico + " vs " + vPobre + ")");
        if (!mobLootRaro(cRico)) fail("plate-armor 5% deveria ser loot raro");
        if (mobLootRaro(cPobre)) fail("só gold-coin não é loot raro");
        ok.push("loot: mobLootValue " + vRico.toFixed(1) + " vs " + vPobre.toFixed(1) + " · raro detectado");
      }

      // ========== 4) partyAllyTarget com lootPriority ==========
      {
        const lider = createCharacter("KnightLoot", "knight", "male");
        const dru = createCharacter("DruLoot", "druid", "male");
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
        entDru.p.config.lootPriority = true;

        // box: mob comum com 20% HP (sniper) vs mob com loot raro com 90% HP
        c.mobs = [
          mkMob("comum", centro.cx + 1, centro.cy, { loot: [mkLoot("gold-coin", 100, 20)] }),
          mkMob("rico", centro.cx - 1, centro.cy, { loot: [mkLoot("gold-coin", 100, 20), mkLoot("magic-longsword", 1, 1)] }),
        ];
        c.mobs[0].hp = 20; c.mobs[0].maxHp = 100;   // comum com 20%
        c.mobs[1].hp = 90; c.mobs[1].maxHp = 100;   // rico com 90%
        const alvo = partyAllyTarget(c, entDru);
        if (!alvo || alvo.id !== "rico") fail("com lootPriority o aliado deveria mirar o mob de loot raro, veio " + (alvo && alvo.id));
        ok.push("lootPriority: mira o mob de loot raro (magic-longsword) mesmo com mais HP");
      }

      console.log("  - " + ok.join("\\n  - "));
    `, vctx);
    if (errors.length) throw new Error(errors.join(" | "));

    // ---- validação estática ----
    const asrc = fs.readFileSync(path.join(GAME, "js/gridai.js"), "utf8");
    if (!/function boxRiscoFoge/.test(asrc)) throw new Error("boxRiscoFoge ausente no gridai.js");
    if (!/function boxPackCentroid/.test(asrc)) throw new Error("boxPackCentroid ausente");
    if (!/boxRiscoFoge\(c, ent, cfgEnt\)/.test(asrc)) throw new Error("formação não usa o risco");
    const csrc = fs.readFileSync(path.join(GAME, "js/combat.js"), "utf8");
    if (!/function mobLootValue/.test(csrc)) throw new Error("mobLootValue ausente");
    if (!/function mobLootRaro/.test(csrc)) throw new Error("mobLootRaro ausente");
    if (!/cfgP\.lootPriority/.test(csrc)) throw new Error("partyAllyTarget não usa lootPriority");
    const gsrc = fs.readFileSync(path.join(GAME, "js/game.js"), "utf8");
    if (!/maxPackSize: 0/.test(gsrc)) throw new Error("config maxPackSize ausente no game.js");
    if (!/lootPriority: false/.test(gsrc)) throw new Error("config lootPriority ausente no game.js");
    console.log("  - fonte: boxRiscoFoge/Centroid (gridai), mobLootValue/Raro + lootPriority (combat), configs (game)");

    console.log("V42 OK — agressividade por risco (recuo de pack/HP) e prioridade de loot");
    process.exit(0);
  } catch (e) {
    console.log("ERRO:", e.message);
    errors.slice(0, 10).forEach((x) => console.log("  - " + x));
    process.exit(1);
  }
}, 900);
