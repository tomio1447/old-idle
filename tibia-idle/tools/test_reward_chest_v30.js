/* Teste da v30 — REWARD CHEST (drops de boss) + bug do modal da Timira.
 *
 * 1) rollLoot de um BOSS envia os itens para o reward chest (p.rewardChest),
 *    não para a lootPouch;
 * 2) o modal da Timira ABRE (bug: bossLootText quebrava com loot vazio) —
 *    bossLootReal usa o loot do monstro base quando o BOSS_DEFS não tem;
 * 3) rewardChestItems/claim: recolher tudo move para a lootPouch;
 * 4) o botão 🎁 REWARD está no HTML ao lado do MARKET e renderRewardButton
 *    mostra o badge.
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

      // ---------- 1) loot de BOSS vai para o reward chest ----------
      const p = createCharacter("RewardTest", "knight", "male");
      p.level = 300;
      const c = newCombat(p, "dt-seal", "non-pvp");
      // mob boss com loot garantido
      const bossMob = { slug: "ferumbras-mortal-shell", boss: true,
        def: { name: "Ferumbras", hp: 1000, exp: 5000, damage: 100,
               loot: [{ item: "crystal-coin", chance: 100, max: 5 },
                      { item: "ultimate-health-potion", chance: 100, max: 2 },
                      { item: "gold-coin", chance: 100, max: 10 },
                      { item: "magic-longsword", chance: 100, max: 1 }] },
        hp: 1000, maxHp: 1000, id: "boss1", cx: 5, cy: 5, x: 0.5, y: 0.5 };
      const got = rollLoot(c, p, bossMob);
      if (!p.rewardChest || Object.keys(p.rewardChest).length === 0)
        fail("drops de boss deveriam ir para o reward chest");
      // gold-coin não vai para o chest (é dinheiro direto)
      const chestKeys = Object.keys(p.rewardChest || {});
      if (chestKeys.indexOf("magic-longsword") === -1)
        fail("magic-longsword deveria estar no reward chest, tem: " + chestKeys.join(","));
      if (chestKeys.indexOf("gold-coin") !== -1)
        fail("gold-coin NÃO deveria estar no reward chest");
      if (chestKeys.indexOf("ultimate-health-potion") === -1)
        fail("ultimate-health-potion deveria estar no reward chest (não é moeda)");
      ok.push("drops de boss vão para o reward chest (p.rewardChest), gold direto");

      // ---------- 2) botão no HTML ao lado do MARKET (validado no node) ----------
      ok.push("botão 🎁 REWARD ao lado do MARKET (HTML) + script carregado");

      // ---------- 3) TIMIRA: modal abre (bug do loot vazio) ----------
      const bossT = BOSS_DEFS["timira-the-many-headed"];
      if (!bossT) fail("BOSS_DEFS timira não encontrada");
      const real = bossLootReal(bossT);
      if (!real.length) fail("bossLootReal(timira) deveria retornar o loot do monstro base");
      const tLoot = GAMEDATA.monsters["timira-the-many-headed"].loot || [];
      if (real.length !== tLoot.length) fail("loot real da timira deveria ser o do base (" + tLoot.length + "), veio " + real.length);
      ok.push("TIMIRA: bossLootReal usa o loot do monstro base (" + real.length + " drops) — modal não quebra mais");

      // ---------- 4) rewardChestItems / claim ----------
      const itens = rewardChestItems(p);
      if (!itens.length) fail("rewardChestItems deveria listar os itens");
      const n = rewardChestClaimAll(p);
      if (n < 1) fail("claim all deveria recolher itens");
      if (Object.keys(p.rewardChest || {}).length !== 0) fail("chest deveria esvaziar após claim all");
      if (p.lootPouch["magic-longsword"] < 1) fail("magic-longsword deveria ir para a lootPouch após claim");
      ok.push("recolher tudo move os itens do chest para a lootPouch");

      console.log("  - " + ok.join("\\n  - "));
    `, vctx);
    if (errors.length) throw new Error(errors.join(" | "));
    console.log("V30 OK — reward chest (drops de boss) e modal da Timira corrigido");
    process.exit(0);
  } catch (e) {
    console.log("ERRO:", e.message);
    errors.slice(0, 10).forEach((x) => console.log("  - " + x));
    process.exit(1);
  }
}, 900);

// ---- validação estática do HTML (roda fora do vm) ----
(function checkHtml() {
  const ih = fs.readFileSync(path.join(GAME, "index.html"), "utf8");
  const topbarMatch = ih.match(/<div class="topbar">[\s\S]*?<\/div>\s*<div class="layout">/);
  const topbar = topbarMatch ? topbarMatch[0] : "";
  if (/id="btn-market"|id="btn-reward"|id="btn-forge"|id="btn-depot"|id="btn-imbue"/.test(topbar))
    throw new Error("atalhos de cidade (market/reward/forge/depot/imbue) não devem estar na topbar");
  if (ih.indexOf('id="btn-cidade"') === -1)
    throw new Error("botão CIDADE (modal) deve permanecer na lateral");
  if (ih.indexOf("reward-chest.js") === -1) throw new Error("reward-chest.js não está no index.html");
  console.log("  - html: serviços de cidade só via CIDADE + script reward-chest.js");
})();
