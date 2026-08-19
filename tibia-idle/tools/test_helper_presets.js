/* Regressão: presets do Helper (até 5 por personagem).
 *
 * - Novo preset salva a configuração ATUAL do Helper (campos do p.config,
 *   nunca preferências de UI como idioma/tema) + stances ativas.
 * - Com preset ativo, qualquer ajuste no Helper é gravado no preset (sync
 *   live no render). Trocar de preset aplica a configuração salva; stances
 *   são alinhadas best-effort (falha por mana/cooldown vira aviso).
 * - Máximo de 5 presets por personagem; apagar/soltar preset funciona.
 * - Barra de presets renderiza no topo do Helper (botões + New preset).
 */
"use strict";
const fs = require("fs"), path = require("path"), vm = require("vm");
const game = path.join(__dirname, "..", "game");
const js = path.join(game, "js");
function must(v, m) { if (!v) throw Error(m); }

const src = fs.readFileSync(path.join(js, "helper-presets.js"), "utf8");
const ui = fs.readFileSync(path.join(js, "ui.js"), "utf8");
const html = fs.readFileSync(path.join(game, "index.html"), "utf8");
const css = fs.readFileSync(path.join(game, "css", "layout.css"), "utf8");

/* ---------------- estático ---------------- */
must(html.includes('id="helper-presets"') &&
     html.includes('js/helper-presets.js?v=helper-presets-v1'),
  "container/script dos presets ausente no index");
must(html.includes("css/layout.css?v=helper-presets-v1"),
  "cache-bust do CSS dos presets ausente");
must(ui.includes('if (typeof renderHelperPresets === "function") renderHelperPresets(p);'),
  "renderHelper não renderiza a barra de presets");
must(css.includes(".helper-presets-row") && css.includes(".helper-preset-new") &&
     css.includes(".helper-preset-del"),
  "CSS da barra de presets ausente");
must(src.includes("HELPER_PRESETS_MAX = 5"), "limite de 5 presets ausente");

/* ---------------- lógica em vm ---------------- */
const toasts = [];
let saved = 0, rendered = 0;
const stanceCalls = [];
const fakeEl = {
  innerHTML: "", setAttribute() {}, addEventListener() {},
};
const ctx = {
  window: { prompt: () => "HUNT" },
  document: { getElementById: (id) => (id === "helper-presets" || id === "helper-preset-new") ? fakeEl : null },
  $$: () => [],
  toast: (m) => { toasts.push(String(m)); },
  save: () => { saved++; },
  renderHelper: () => { rendered++; },
  renderStats: () => {}, renderStanceBadge: () => {},
  toggleStance: (p, id) => {
    stanceCalls.push(id);
    if (id === "stance-fail") return false;       // simula mana/cooldown
    if (p.stances[id]) delete p.stances[id]; else p.stances[id] = true;
    return true;
  },
  console,
};
vm.createContext(ctx);
vm.runInContext(src, ctx, { filename: "helper-presets.js" });

function mkPlayer() {
  return {
    voc: "knight", level: 300, mp: 1000, stances: {},
    config: {
      healSpellAt: 70, healItemAt: 50, healAt: 70, manaAt: 40,
      healSpell: "exura", healSupply: "", manaSupply: "mana-potion",
      noHealthPotions: false, noManaPotions: false,
      magicShield: { mode: "off" }, equipHelper: { amulet: { enabled: true } },
      attackMode: "box", kiteDistance: 3, buff: null,
      exetaRes: true, exetaAmpRes: false, hasteSpell: "utani-hur",
      autoWalk: true, autoRetreat: true,
      spellAttack: true, useRunes: true,
      attackSpells: ["exori", "exori-gran"], shooterType: "auto",
      shooterSpell: "", shooterRune: "", spellOnlyReady: false, spellFilter: "",
      manaTrain: null, autoConjure: null, combo: ["exori", "utito-tempo"],
      refillArrow: "", refillBolt: "", ammoAuto: false,
      autoSupplyStash: { arrow: true }, autoRestock: false,
      healFriend: {}, healFriendPriority: "self", criticalHeal: true, autoCure: false,
      barMode: "bars", lootFilter: "all",
      // preferências de UI: NÃO entram no preset
      lang: "pt", uimode: "desktop", missionCollapsed: false,
    },
  };
}

// 1) criar preset a partir do estado atual
let p = mkPlayer();
const pr1 = vm.runInContext('helperPresetCreate(this.p, "HUNT")', Object.assign(ctx, { p }));
must(pr1 && pr1.id && pr1.name === "HUNT", "novo preset não criado");
must(p.helperActivePreset === pr1.id, "novo preset não ficou ativo");
must(pr1.config.healSpell === "exura" && pr1.config.attackMode === "box" &&
     pr1.config.combo.length === 2 && pr1.config.magicShield.mode === "off" &&
     pr1.config.equipHelper.amulet.enabled === true &&
     pr1.config.autoSupplyStash.arrow === true,
  "snapshot não capturou os campos do Helper");
must(!("lang" in pr1.config) && !("uimode" in pr1.config) && !("missionCollapsed" in pr1.config),
  "preferências de UI vazaram para o preset");
// deep clone: mudar p.config depois não altera o preset
p.config.attackSpells.push("exori-mas");
p.config.magicShield.mode = "always";
must(pr1.config.attackSpells.length === 2 && pr1.config.magicShield.mode === "off",
  "snapshot não é cópia profunda");

// 2) sync live: com preset ativo, ajuste no Helper grava no preset
p.config.manaAt = 90;
vm.runInContext("helperPresetSyncActive(this.p)", Object.assign(ctx, { p }));
must(pr1.config.manaAt === 90, "sync live não gravou a mudança no preset");

// 3) aplicar preset (config + stances best-effort)
p.config.healSpellAt = 99; p.config.manaAt = 10; p.config.attackMode = "kiting";
p.stances = {};
const pr2 = vm.runInContext('helperPresetCreate(this.p, "BOSS")', Object.assign(ctx, { p }));
pr2.config.healSpellAt = 45;
pr2.config.attackMode = "box";
pr2.stances = ["stance-a", "stance-fail"];
const msg = vm.runInContext("helperPresetApply(this.p, this.pr2)", Object.assign(ctx, { p, pr2 }));
must(p.config.healSpellAt === 45 && p.config.attackMode === "box", "apply não aplicou a config");
must(p.helperActivePreset === pr2.id, "apply não ativou o preset");
must(p.stances["stance-a"] === true, "apply não ligou a stance do preset");
must(stanceCalls.indexOf("stance-a") !== -1 && stanceCalls.indexOf("stance-fail") !== -1,
  "apply não tentou alinhar as stances");
must(msg.indexOf("não ativaram") !== -1, "aviso de stance falha ausente");
must(!("lang" in p.config) || p.config.lang === "pt", "apply mexeu em campo fora do preset");

// 4) máximo de 5 presets
let p2 = mkPlayer();
for (let i = 0; i < 5; i++) {
  const pr = vm.runInContext(`helperPresetCreate(this.p, "P${i}")`, Object.assign(ctx, { p: p2 }));
  must(pr, "criação " + i + " falhou");
}
must(p2.helperPresets.length === 5, "deveria ter 5 presets");
const pr6 = vm.runInContext('helperPresetCreate(this.p, "EXTRA")', Object.assign(ctx, { p: p2 }));
must(pr6 === null, "6º preset deveria ser bloqueado");

// 5) apagar preset ativo solta o vínculo; apagar outro não
const activeId = p2.helperActivePreset;
const removed = vm.runInContext("helperPresetDelete(this.p, this.p.helperActivePreset)", Object.assign(ctx, { p: p2 }));
must(removed && removed.id === activeId && p2.helperPresets.length === 4 &&
     p2.helperActivePreset === null,
  "delete não removeu/soltou o preset ativo");
vm.runInContext('helperPresetCreate(this.p, "ATIVA")', Object.assign(ctx, { p: p2 }));
const keepActive = p2.helperActivePreset;
const other = p2.helperPresets.find((x) => x.id !== keepActive);
vm.runInContext("helperPresetDelete(this.p, this.otherId)", Object.assign(ctx, { p: p2, otherId: other.id }));
must(p2.helperActivePreset === keepActive && p2.helperPresets.length === 4,
  "apagar outro preset não pode soltar o ativo");

// 6) barra renderiza (markup + New preset desabilitado no limite)
fakeEl.innerHTML = "";
vm.runInContext("renderHelperPresets(this.p)", Object.assign(ctx, { p: p2 }));
must(fakeEl.innerHTML.includes("P1") && fakeEl.innerHTML.includes("data-preset=") &&
     fakeEl.innerHTML.includes("data-del-preset=") && fakeEl.innerHTML.includes("New preset"),
  "barra de presets sem botões/nome/New preset");
fakeEl.innerHTML = "";
const p3 = mkPlayer();
for (let i = 0; i < 5; i++) vm.runInContext(`helperPresetCreate(this.p, "F${i}")`, Object.assign(ctx, { p: p3 }));
vm.runInContext("renderHelperPresets(this.p)", Object.assign(ctx, { p: p3 }));
must(fakeEl.innerHTML.includes("disabled"), "New preset deveria estar desabilitado com 5 presets");
must(fakeEl.innerHTML.includes("helper-preset-wrap active"),
  "preset ativo sem destaque na barra");

// 7) per-personagem: presets não vazam entre personagens
const pA = mkPlayer(), pB = mkPlayer();
vm.runInContext('helperPresetCreate(this.p, "A1")', Object.assign(ctx, { p: pA }));
must(pA.helperPresets.length === 1 && !(pB.helperPresets && pB.helperPresets.length),
  "presets não são por personagem");

console.log("ok: presets do Helper — criar/aplicar/sincronizar/apagar, limite de 5, por personagem, stances best-effort e barra com New preset");
