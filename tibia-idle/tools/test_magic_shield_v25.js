/* Teste da v25 — Magic Shield moderno (12.55+) + Naga hunt hard.
 *
 * 1) MAGIC SHIELD:
 *    - duração 60s (não mais 200s);
 *    - capacidade = 7*ML + 7.6*level + max(300, 0.4*level) — o "bônus de
 *      defesa que o mage ganha na mana";
 *    - o dano drena a POOL do escudo (não a mana do personagem) e o escudo
 *      QUEBRA quando a pool zera (mesmo com mana cheia);
 *    - recast renova a capacidade;
 *    - mana potion BLOQUEADA enquanto o escudo está ativo (oficial);
 *    - energy ring continua com o mana shield clássico (drena a mana do
 *      personagem).
 * 2) NAGA HUNT: pack 8 e respawn 1.2 (hard igual ao DT Seal).
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

      // ---------- 1) MAGIC SHIELD moderno ----------
      const sorc = createCharacter("SorcMS", "sorcerer", "male");
      sorc.level = 200;
      sorc.ml = 30;
      sorc.mp = 5000;
      sorc.config.magicShield = { enabled: true, useSpell: true, hpBelow: 90, mpAbove: 10 };
      const cap = magicShieldCapacity(sorc);
      const capEsperado = Math.floor(7 * 30 + 7.6 * 200 + Math.max(300, 0.4 * 200));
      if (cap !== capEsperado) fail("capacidade deveria ser " + capEsperado + ", veio " + cap);
      ok.push("capacidade do escudo = 7*ML + 7.6*level + max(300, 0.4*level) (" + cap + ")");

      // casta o utamo vita via tryMagicShield
      const c = { events: [], player: { x: 0.3, y: 0.5 }, stats: {} };
      const agora = Date.now();
      if (!tryMagicShield(c, sorc, agora)) fail("tryMagicShield não castou");
      if (sorc.magicShieldPool !== cap) fail("pool deveria ser " + cap + ", veio " + sorc.magicShieldPool);
      const dur = sorc.magicShieldUntil - agora;
      if (dur !== 60000) fail("duração deveria ser 60s, veio " + dur + "ms");
      ok.push("utamo vita: duração 60s e pool = capacidade");

      // dano drena a POOL (não a mana do personagem)
      const mpAntes = sorc.mp;
      const rest = applyMagicShieldAbsorb(c, sorc, 500, { x: 0.3, y: 0.5 });
      if (rest !== 0) fail("500 de dano deveria ser totalmente absorvido, restou " + rest);
      if (sorc.mp !== mpAntes) fail("a mana do personagem NÃO deveria mudar (pool é separada)");
      if (sorc.magicShieldPool !== cap - 500) fail("pool deveria cair 500, veio " + sorc.magicShieldPool);
      ok.push("dano drena a pool do escudo (mana do personagem intocada)");

      // mana potion bloqueada com escudo ativo (a pool ainda está alta)
      sorc.mp = 100;
      sorc.config.manaAt = 50;
      sorc.supplies["mana-potion"] = 10;
      sorc.config.manaSupply = "mana-potion";
      const mpBloq = sorc.mp;
      tryMana(c, sorc, Date.now() + 1500);
      if (sorc.mp !== mpBloq) fail("mana potion NÃO deveria funcionar com escudo ativo");
      ok.push("mana potion bloqueada enquanto o escudo está ativo (oficial)");
      sorc.mp = 5000;

      // escudo QUEBRA quando a pool zera (mesmo com mana cheia)
      sorc.magicShieldPool = 50;
      const rest2 = applyMagicShieldAbsorb(c, sorc, 100, { x: 0.3, y: 0.5 });
      if (rest2 !== 50) fail("só 50 deveria ser absorvido, resto " + rest2);
      if (isMagicShieldActive(sorc, Date.now())) fail("escudo deveria ter QUEBRADO (pool zerada)");
      ok.push("escudo quebra quando a capacidade esgota (mesmo com mana cheia)");

      // recast renova a capacidade (escudo quebrado -> casta normal)
      if (!tryMagicShield(c, sorc, Date.now() + 20000)) fail("recast não renovou o escudo");
      if (sorc.magicShieldPool !== magicShieldCapacity(sorc))
        fail("recast deveria renovar a pool para a capacidade cheia");
      ok.push("recast renova a capacidade do escudo");

      // ---------- 2) ENERGY RING: mana shield clássico (drena p.mp) ----------
      const monk = createCharacter("MonkER", "monk", "male");
      monk.mp = 2000;
      addItem(monk, "energy-ring", 1);
      equipItemFromContainer(monk, "energy-ring", "bag", "ring");
      const c2 = { events: [], stats: {} };
      const rest3 = applyMagicShieldAbsorb(c2, monk, 300, { x: 0.3, y: 0.5 });
      if (rest3 !== 0) fail("energy ring deveria absorver tudo");
      if (monk.mp !== 1700) fail("energy ring deveria drenar a mana do personagem (1700), veio " + monk.mp);
      ok.push("energy ring continua clássico: drena a mana do personagem");

      // ---------- 3) NAGA HUNT hard (pack 8, respawn 1.2) ----------
      const h = GAMEDATA.hunts["marapur-nagas"];
      if (!h) fail("hunt marapur-nagas não existe");
      if (h.pack !== 8) fail("naga hunt deveria ter pack 8, veio " + h.pack);
      if (h.respawn !== 1.2) fail("naga hunt deveria ter respawn 1.2, veio " + h.respawn);
      const dt = GAMEDATA.hunts["dt-seal"];
      if (h.pack !== dt.pack || h.respawn !== dt.respawn)
        fail("naga hunt deveria ter pack/respawn iguais ao DT Seal");
      ok.push("naga hunt hard: pack 8 e respawn 1.2 (igual DT Seal)");

      console.log("  - " + ok.join("\\n  - "));
    `, vctx);
    if (errors.length) throw new Error(errors.join(" | "));
    console.log("V25 OK — magic shield moderno (60s, capacidade por level/ml, pool, quebra, potions bloqueadas) + naga hard validados");
    process.exit(0);
  } catch (e) {
    console.log("ERRO:", e.message);
    errors.slice(0, 10).forEach((x) => console.log("  - " + x));
    process.exit(1);
  }
}, 900);
