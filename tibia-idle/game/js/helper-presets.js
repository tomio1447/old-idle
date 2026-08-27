/* helper-presets.js — presets de configuração do Helper.
 *
 * Cada personagem pode salvar até 5 presets (ex.: HUNT, BOSS, PVP) com a
 * configuração atual do Helper (cura, potions, escudo mágico, equipamento,
 * ataque, stances, combo, magias, refill, loot, barras). Os botões no topo
 * do Helper trocam de preset com 1 clique; com um preset ativo, qualquer
 * ajuste feito na interface do Helper é salvo nele na hora.
 *
 * Os presets ficam em p.helperPresets (salvos com o personagem no banco,
 * então são por personagem) e o preset ativo em p.helperActivePreset.
 */
"use strict";

const HELPER_PRESETS_MAX = 5;

/* Campos do p.config que pertencem ao Helper — só esses entram no preset
 * (preferências de UI como idioma/tema continuam por personagem, fora dos
 * presets). */
const HELPER_PRESET_CONFIG_FIELDS = [
  // Cura (spells com thresholds, % de HP, potions de HP e mana)
  "healSpells", "healSpellAt", "healItemAt", "healAt", "manaAt",
  "healSpell", "healSupply", "manaSupply",
  "noHealthPotions", "noManaPotions", "noPotions",
  // Escudo mágico e equipamento automático
  "magicShield", "equipHelper",
  // Ataque (modo, kiting, buff, challenge, velocidade, movimento)
  "attackMode", "kiteDistance", "buff",
  "exetaRes", "exetaAmpRes",
  "hasteSpell", "autoHaste", "autoWalk", "autoRetreat",
  // Magias automáticas / shooter
  "spellAttack", "useRunes", "attackSpells",
  "shooterType", "shooterSpell", "shooterRune",
  "spellOnlyReady", "spellFilter", "manaTrain", "autoConjure",
  // Combo
  "combo",
  // Refill (paladino)
  "refillArrow", "refillBolt", "ammoAuto", "autoSupplyStash", "autoRestock",
  // Curar aliado (druid/monk)
  "healFriend", "healFriendPriority", "criticalHeal", "autoCure",
  // Configurar (barras do personagem e filtro de loot)
  "barMode", "lootFilter",
];

function helperPresetClone(value) {
  if (Array.isArray(value)) return value.map(helperPresetClone);
  if (value && typeof value === "object") {
    const out = {};
    for (const k of Object.keys(value)) out[k] = helperPresetClone(value[k]);
    return out;
  }
  return value;
}

function helperPresetEsc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function helperPresetsOf(p) {
  if (!p.helperPresets || !Array.isArray(p.helperPresets)) p.helperPresets = [];
  if (p.helperPresets.length > HELPER_PRESETS_MAX)
    p.helperPresets = p.helperPresets.slice(0, HELPER_PRESETS_MAX);
  return p.helperPresets;
}

function helperPresetFind(p, id) {
  return helperPresetsOf(p).find((pr) => pr && pr.id === String(id)) || null;
}

/* Snapshot dos campos do Helper no p.config atual. */
function helperPresetSnapshotConfig(p) {
  const out = {};
  if (p && p.config) {
    for (const k of HELPER_PRESET_CONFIG_FIELDS) {
      if (p.config[k] !== undefined) out[k] = helperPresetClone(p.config[k]);
    }
  }
  return out;
}

/* Snapshot das stances ativas (ids). Aplicar um preset liga/desliga as
 * posturas por tentativa: desligar é grátis; ligar cobra mana/respeita
 * cooldown e pode falhar (aviso via toast). */
function helperPresetSnapshotStances(p) {
  const out = [];
  if (p && p.stances) for (const id of Object.keys(p.stances)) if (p.stances[id]) out.push(id);
  return out;
}

function helperPresetActive(p) {
  return p.helperActivePreset ? helperPresetFind(p, p.helperActivePreset) : null;
}

/* Com um preset ativo, cada mudança feita na interface do Helper é gravada
 * no preset na hora (chamado no início de cada render do Helper). */
function helperPresetSyncActive(p) {
  const pr = helperPresetActive(p);
  if (!pr) return;
  pr.config = helperPresetSnapshotConfig(p);
  pr.stances = helperPresetSnapshotStances(p);
}

/* Aplica o preset no personagem: copia a configuração salva para o
 * p.config e alinha as stances (best-effort). Devolve mensagem p/ toast. */
function helperPresetApply(p, preset) {
  if (!p || !preset) return "Preset não encontrado.";
  const cfg = preset.config && typeof preset.config === "object" ? preset.config : {};
  for (const k of Object.keys(cfg)) p.config[k] = helperPresetClone(cfg[k]);
  const want = Array.isArray(preset.stances) ? preset.stances.slice() : [];
  const cur = helperPresetSnapshotStances(p);
  let off = 0, on = 0, fail = 0;
  for (const id of cur) {
    if (want.indexOf(id) === -1 && typeof toggleStance === "function" && toggleStance(p, id, null)) off++;
  }
  for (const id of want) {
    if (cur.indexOf(id) !== -1) continue;
    if (typeof toggleStance === "function" && toggleStance(p, id, null)) on++;
    else fail++;
  }
  p.helperActivePreset = preset.id;
  helperSyncLiveCombat(p);
  let msg = `Preset <b>${helperPresetEsc(preset.name)}</b> aplicado.`;
  if (fail) msg += ` ${fail} stance(s) não ativaram (mana/cooldown).`;
  return msg;
}

/* Empurra o Helper atual para a instância em curso: o combate online
 * clona o personagem na entrada, então mudar p.config no painel não
 * alterava huntMode nem o ponteiro combat.player.p até um PUT novo. */
function helperSyncLiveCombat(p) {
  if (!p || typeof G === "undefined" || !G || !G.combat) return;
  const c = G.combat;
  const sameId = (ent) => {
    if (!ent) return false;
    if (p.id == null) return ent === c.player;
    const eid = ent.id != null ? ent.id : (ent.p && ent.p.id);
    return eid != null && String(eid) === String(p.id);
  };
  if (Array.isArray(c.players)) {
    for (const ent of c.players) {
      if (sameId(ent)) {
        ent.p = p;
        if (p.id != null) ent.id = p.id;
      }
    }
  }
  if (c.player && (sameId(c.player) || !c.player.p || c.player.p === p)) {
    c.player.p = p;
    if (p.id != null) c.player.id = p.id;
  }
  const mode = p.config && String(p.config.attackMode || "");
  if (mode === "box" || mode === "safe") c.huntMode = mode;
  else if (c.huntMode === "box" || c.huntMode === "safe") c.huntMode = "";
}

/* Novo preset a partir da configuração ATUAL do Helper. */
function helperPresetCreate(p, name) {
  const list = helperPresetsOf(p);
  if (list.length >= HELPER_PRESETS_MAX) return null;
  const nome = String(name || "").trim().slice(0, 16) || ("Preset " + (list.length + 1));
  const preset = {
    id: "hpp-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    name: nome,
    config: helperPresetSnapshotConfig(p),
    stances: helperPresetSnapshotStances(p),
  };
  list.push(preset);
  p.helperActivePreset = preset.id;
  return preset;
}

function helperPresetDelete(p, id) {
  const list = helperPresetsOf(p);
  const i = list.findIndex((pr) => pr && pr.id === String(id));
  if (i === -1) return null;
  const removed = list.splice(i, 1)[0];
  if (p.helperActivePreset === String(id)) p.helperActivePreset = null;
  return removed;
}

/* Barra de presets renderizada no TOPO do Helper. */
function renderHelperPresets(p) {
  const el = document.getElementById("helper-presets");
  if (!el || !p) return;
  helperPresetSyncActive(p);
  helperSyncLiveCombat(p);
  const list = helperPresetsOf(p);
  const active = p.helperActivePreset;
  el.innerHTML = `<div class="helper-presets-row">` +
    list.map((pr) => `<span class="helper-preset-wrap ${pr.id === active ? "active" : ""}">
        <button type="button" class="helper-preset-btn" data-preset="${helperPresetEsc(pr.id)}"
          title="${pr.id === active ? "Preset ativo — clique para soltar" : "Trocar para " + helperPresetEsc(pr.name)}">${helperPresetEsc(pr.name)}</button>
        <button type="button" class="helper-preset-del" data-del-preset="${helperPresetEsc(pr.id)}"
          title="Apagar preset ${helperPresetEsc(pr.name)}">✕</button>
      </span>`).join("") +
    `<button type="button" class="helper-preset-new" id="helper-preset-new"
      ${list.length >= HELPER_PRESETS_MAX ? "disabled" : ""}
      title="${list.length >= HELPER_PRESETS_MAX ? "Máximo de " + HELPER_PRESETS_MAX + " presets por personagem" : "Salvar a configuração atual como novo preset"}">New preset</button>
    </div>`;

  $$("#helper-presets [data-preset]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.preset;
      if (p.helperActivePreset === id) {
        // clicar no preset ativo só "solta" o vínculo — a configuração fica
        // como está e os próximos ajustes voltam a valer como padrão
        p.helperActivePreset = null;
        if (typeof toast === "function") toast("Preset solto — ajustes voltam a valer para o padrão.");
      } else {
        const pr = helperPresetFind(p, id);
        if (!pr) return;
        if (typeof toast === "function") toast(helperPresetApply(p, pr));
      }
      if (typeof save === "function") save();
      if (typeof renderHelper === "function") renderHelper(p);
      if (typeof renderStats === "function") renderStats(p);
      if (typeof renderStanceBadge === "function") renderStanceBadge(p);
    });
  });

  $$("#helper-presets [data-del-preset]").forEach((btn) => {
    btn.addEventListener("click", (ev) => {
      if (ev && ev.stopPropagation) ev.stopPropagation();
      const id = btn.dataset.delPreset;
      const pr = helperPresetFind(p, id);
      if (!pr) return;
      const removed = helperPresetDelete(p, id);
      if (typeof toast === "function" && removed)
        toast(`Preset <b>${helperPresetEsc(removed.name)}</b> apagado.`);
      if (typeof save === "function") save();
      if (typeof renderHelper === "function") renderHelper(p);
    });
  });

  const newBtn = document.getElementById("helper-preset-new");
  if (newBtn) newBtn.addEventListener("click", () => {
    if (helperPresetsOf(p).length >= HELPER_PRESETS_MAX) {
      if (typeof toast === "function")
        toast(`Máximo de ${HELPER_PRESETS_MAX} presets por personagem.`, "bad");
      return;
    }
    let nome = "";
    if (typeof window !== "undefined" && window.prompt) {
      try { nome = window.prompt("Nome do novo preset (ex.: HUNT, BOSS, PVP):", ""); } catch (e) { nome = ""; }
    }
    const pr = helperPresetCreate(p, nome);
    if (!pr) return;
    if (typeof toast === "function")
      toast(`Preset <b>${helperPresetEsc(pr.name)}</b> criado com a configuração atual.`);
    if (typeof save === "function") save();
    if (typeof renderHelper === "function") renderHelper(p);
  });
}

/* Exporta constantes para o servidor Node poder manter a mesma whitelist. */
if (typeof module !== "undefined" && module.exports) {
  module.exports = { HELPER_PRESET_CONFIG_FIELDS, HELPER_PRESETS_MAX };
}
