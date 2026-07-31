/*
 * accessories.js — helper de rings/amulets, drag & drop de itens e magic shield.
 *
 * Regras implementadas para aproximar o painel do Baiak Idle:
 *  - Amuleto e anel possuem item PADRÃO e EMERGENCIAL.
 *  - Quando o HP cai abaixo do limite, equipa o emergencial.
 *  - Quando o HP recupera acima do limite, devolve para o padrão.
 *  - Os itens podem estar na mochila ou na Loot Pouch.
 *  - Energy Ring aplica Magic Shield global: dano entra na mana antes da vida.
 */
"use strict";

const ITEM_DRAG_TYPE = "application/x-tibia-idle-item";
const MAGIC_SHIELD_SPELL_ID = "utamo-vita";
const MAGIC_SHIELD_DURATION_MS = 200 * 1000; // 3m20s, duração clássica do utamo vita

const HELPER_EQUIP_UI = { slot: "amulet" };

/* --------------------------------------------------------- dados/patches */
function patchAccessoryItems() {
  if (typeof GAMEDATA === "undefined" || !GAMEDATA.items) return;
  const er = GAMEDATA.items["energy-ring"];
  if (er) {
    er.manaShield = 1;
    er.magicShield = 1;
    delete er.shield;
    // No global o Energy Ring não é restrito por vocação. A regra antiga
    // bloqueava Monk e causava justamente o problema reportado.
    delete er.vocs;
    if (!er.desc) er.desc = "Magic Shield: dano recebido consome mana antes da vida.";
  }
}
patchAccessoryItems();

function ensureAccessoryConfig(p) {
  if (!p.config) p.config = {};
  if (!p.config.equipHelper) p.config.equipHelper = {};
  ["amulet", "ring"].forEach((slot) => {
    const c = p.config.equipHelper[slot] || {};
    p.config.equipHelper[slot] = {
      enabled: c.enabled !== undefined ? !!c.enabled : true,
      emergency: c.emergency || "",
      normal: c.normal || "",
      equipBelow: Math.max(1, Math.min(99, parseInt(c.equipBelow, 10) || 50)),
      restoreAbove: Math.max(1, Math.min(99, parseInt(c.restoreAbove, 10) || 80)),
    };
    if (p.config.equipHelper[slot].restoreAbove < p.config.equipHelper[slot].equipBelow) {
      p.config.equipHelper[slot].restoreAbove = p.config.equipHelper[slot].equipBelow;
    }
  });
  const ms = p.config.magicShield || {};
  p.config.magicShield = {
    enabled: !!ms.enabled,
    useSpell: ms.useSpell !== undefined ? !!ms.useSpell : true,
    hpBelow: Math.max(1, Math.min(99, parseInt(ms.hpBelow, 10) || 45)),
    mpAbove: Math.max(0, Math.min(100, parseInt(ms.mpAbove, 10) || 15)),
    recastBelow: Math.max(1, Math.min(99, parseInt(ms.recastBelow, 10) || 70)),
  };
  return p.config;
}

/* ------------------------------------------------------- requisitos item */
function normVocName(v) {
  return String(v || "").toLowerCase().replace(/[^a-z]/g, "");
}

function itemVocationAllowed(p, it) {
  if (!it || !it.vocs || !it.vocs.length) return true;
  const mine = new Set([normVocName(p.voc)]);
  if (typeof vocationName === "function") mine.add(normVocName(vocationName(p)));
  if (p.promoted && typeof PROMOTION_NAMES !== "undefined" && PROMOTION_NAMES[p.voc]) {
    mine.add(normVocName(PROMOTION_NAMES[p.voc]));
  }
  return it.vocs.some((v) => mine.has(normVocName(v)));
}

function canEquipItem(p, slug, targetSlot) {
  const it = GAMEDATA.items[slug];
  if (!it || !it.s) return { ok: false, msg: "Esse item não é equipável." };
  const slot = it.s;
  if (targetSlot && targetSlot !== slot) {
    return { ok: false, msg: `Esse item equipa em ${slot}, não em ${targetSlot}.` };
  }
  if (it.lvl && p.level < it.lvl) return { ok: false, msg: `Requer nível ${it.lvl}.` };
  if (!itemVocationAllowed(p, it)) return { ok: false, msg: "Vocação incompatível." };
  if (it.t === "quiver" && typeof canUseQuiver === "function" && !canUseQuiver(p)) {
    return { ok: false, msg: "Somente paladins podem equipar quiver." };
  }
  if (slot === "shield" && it.t !== "quiver") {
    const w = p.equip && p.equip.weapon ? GAMEDATA.items[p.equip.weapon.item] : null;
    if (w && w.th) return { ok: false, msg: "Arma de duas mãos impede escudo/spellbook." };
  }
  if (slot === "ammo") {
    if (typeof equippedQuiver === "function" && !equippedQuiver(p)) {
      return { ok: false, msg: "Equipe um quiver antes de selecionar munição." };
    }
  }
  return { ok: true, slot: slot };
}

function stashEquippedItem(p, entry, preferred) {
  if (!entry || !entry.item) return true;
  if (preferred === "bag" && typeof addItem === "function" && addItem(p, entry.item, 1)) return true;
  if (typeof addLootPouch === "function") return addLootPouch(p, entry.item, 1);
  return typeof addItem === "function" ? addItem(p, entry.item, 1) : false;
}

function equipItemFromContainer(p, slug, source, targetSlot) {
  const chk = canEquipItem(p, slug, targetSlot);
  if (!chk.ok) { if (typeof toast === "function") toast(chk.msg, "bad"); return false; }
  const it = GAMEDATA.items[slug];
  const slot = chk.slot;

  if (slot === "ammo") {
    if (typeof setActiveAmmo === "function") setActiveAmmo(p, slug);
    if (typeof toast === "function") toast(`Munição no quiver: <b>${it.n}</b>`);
    return true;
  }

  if (source === "bag") {
    if (!removeItem(p, slug, 1)) return false;
  } else if (source === "pouch") {
    if (!removeLootPouch(p, slug, 1)) return false;
  } else if (source === "equip") {
    // Arrastar um item equipado para o próprio slot não faz nada.
    if (targetSlot === source.slot || targetSlot === slot) return true;
  }

  const old = p.equip[slot];
  p.equip[slot] = { item: slug, count: 1 };

  if (old && old.item !== slug) stashEquippedItem(p, old, source === "bag" ? "bag" : "pouch");

  // Arma de duas mãos remove escudo/spellbook, mas mantém quiver (Tibia global).
  if (slot === "weapon" && it.th && p.equip.shield) {
    const sh = GAMEDATA.items[p.equip.shield.item];
    if (sh && sh.t !== "quiver") {
      stashEquippedItem(p, p.equip.shield, source === "bag" ? "bag" : "pouch");
      delete p.equip.shield;
    }
  }
  return true;
}

function unequipToContainer(p, slot, dest) {
  if (!p.equip || !p.equip[slot]) return false;
  if (slot === "backpack") { if (typeof toast === "function") toast("A bag padrão não pode ser removida."); return false; }
  if (slot === "ammo") { if (typeof setActiveAmmo === "function") setActiveAmmo(p, null); return true; }
  const e = p.equip[slot];
  let ok = false;
  if (dest === "bag") ok = addItem(p, e.item, 1);
  else ok = addLootPouch(p, e.item, 1);
  if (!ok) { if (typeof toast === "function") toast("Mochila cheia.", "bad"); return false; }
  if (slot === "shield" && (GAMEDATA.items[e.item] || {}).t === "quiver") {
    if (typeof setActiveAmmo === "function") setActiveAmmo(p, null);
  }
  delete p.equip[slot];
  return true;
}

function moveItemToBag(p, payload) {
  if (!payload) return false;
  if (payload.source === "pouch") {
    const count = p.lootPouch && p.lootPouch[payload.slug] ? p.lootPouch[payload.slug] : 0;
    if (count <= 0) return false;
    if (!addItem(p, payload.slug, count)) { if (typeof toast === "function") toast("Mochila cheia."); return false; }
    removeLootPouch(p, payload.slug, count);
    return true;
  }
  if (payload.source === "equip") return unequipToContainer(p, payload.slot, "bag");
  return false;
}

function moveItemToPouch(p, payload) {
  if (!payload) return false;
  if (payload.source === "bag") {
    const count = p.bag && p.bag[payload.slug] ? p.bag[payload.slug] : 0;
    if (count <= 0) return false;
    addLootPouch(p, payload.slug, count);
    delete p.bag[payload.slug];
    return true;
  }
  if (payload.source === "equip") return unequipToContainer(p, payload.slot, "pouch");
  return false;
}

function moveItemToEquip(p, payload, slot) {
  if (!payload) return false;
  if (payload.source === "equip") return false;
  return equipItemFromContainer(p, payload.slug, payload.source, slot);
}

/* ------------------------------------------------------------- drag/drop */
function bindItemDrag(el, payload) {
  if (!el || !payload) return;
  el.setAttribute("draggable", "true");
  el.addEventListener("dragstart", (e) => {
    if (!e.dataTransfer) return;
    if (typeof hideContextMenu === "function") hideContextMenu();
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData(ITEM_DRAG_TYPE, JSON.stringify(payload));
    e.dataTransfer.setData("text/plain", payload.slug || "");
    if (payload.source === "pouch") e.dataTransfer.setData("text/loot-pouch", payload.slug || "");
    if (typeof hideTip === "function") hideTip();
  });
}

function dragHasItem(e) {
  if (!e.dataTransfer) return false;
  const types = Array.from(e.dataTransfer.types || []);
  return types.indexOf(ITEM_DRAG_TYPE) !== -1 || types.indexOf("text/loot-pouch") !== -1;
}

function dragPayload(e) {
  if (!e.dataTransfer) return null;
  const raw = e.dataTransfer.getData(ITEM_DRAG_TYPE);
  if (raw) {
    try { return JSON.parse(raw); } catch (err) {}
  }
  const pouch = e.dataTransfer.getData("text/loot-pouch");
  if (pouch) return { source: "pouch", slug: pouch };
  return null;
}

function bindDrop(el, handler) {
  if (!el) return;
  el.addEventListener("dragover", (e) => {
    if (!dragHasItem(e)) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
  });
  el.addEventListener("drop", (e) => {
    const pld = dragPayload(e);
    if (!pld) return;
    e.preventDefault();
    if (handler(pld)) {
      if (typeof save === "function") save();
      if (typeof hideTip === "function") hideTip();
      if (typeof renderAll === "function") renderAll();
    }
  });
}

/* ---------------------------------------------------------- helper equip */
function accessoryAvailableCounts(p, slot) {
  const out = {};
  for (const slug in (p.bag || {})) {
    const it = GAMEDATA.items[slug];
    if (it && it.s === slot && (p.bag[slug] || 0) > 0) out[slug] = (out[slug] || 0) + p.bag[slug];
  }
  for (const slug in (p.lootPouch || {})) {
    const it = GAMEDATA.items[slug];
    if (it && it.s === slot && (p.lootPouch[slug] || 0) > 0) out[slug] = (out[slug] || 0) + p.lootPouch[slug];
  }
  if (p.equip && p.equip[slot]) out[p.equip[slot].item] = (out[p.equip[slot].item] || 0) + 1;
  return out;
}

function accessoryItemList(p, slot, include) {
  const counts = accessoryAvailableCounts(p, slot);
  if (include) counts[include] = counts[include] || 0;
  return Object.keys(counts).filter((slug) => GAMEDATA.items[slug])
    .sort((a, b) => (GAMEDATA.items[a].lvl || 0) - (GAMEDATA.items[b].lvl || 0) ||
                    GAMEDATA.items[a].n.localeCompare(GAMEDATA.items[b].n));
}

function accessorySelectHtml(p, slot, value, id) {
  const list = accessoryItemList(p, slot, value);
  return `<select id="${id}" style="width:100%;padding:6px;background:#14120e;color:#c8c0a8;border:1px solid #16140f">
    <option value="" ${!value ? "selected" : ""}>Nenhum</option>
    ${list.map((slug) => `<option value="${slug}" ${value === slug ? "selected" : ""}>${GAMEDATA.items[slug].n}</option>`).join("")}
  </select>`;
}

function accessoryEquipConfigured(p, slot, slug) {
  const cur = p.equip && p.equip[slot] ? p.equip[slot].item : "";
  if (cur === slug) return true;
  if (!slug) {
    if (p.equip && p.equip[slot]) return unequipToContainer(p, slot, "pouch");
    return true;
  }
  if (p.bag && p.bag[slug] > 0) return equipItemFromContainer(p, slug, "bag", slot);
  if (p.lootPouch && p.lootPouch[slug] > 0) return equipItemFromContainer(p, slug, "pouch", slot);
  if (typeof toast === "function") toast(`${itemName(slug)} não está na mochila nem na Loot Pouch.`, "bad");
  return false;
}

function tryAccessoryHelper(c, p, now) {
  ensureAccessoryConfig(p);
  const max = maxStats(p);
  const hpPct = max.hp ? (p.hp / max.hp) * 100 : 100;
  for (const slot of ["amulet", "ring"]) {
    const cfg = p.config.equipHelper[slot];
    if (!cfg || !cfg.enabled) continue;
    if (hpPct <= cfg.equipBelow && cfg.emergency) {
      accessoryEquipConfigured(p, slot, cfg.emergency);
    } else if (hpPct >= cfg.restoreAbove) {
      const cur = p.equip && p.equip[slot] ? p.equip[slot].item : "";
      if (cfg.normal || cur === cfg.emergency) accessoryEquipConfigured(p, slot, cfg.normal);
    }
  }
}

function renderEquipmentHelper(p) {
  ensureAccessoryConfig(p);
  const slot = HELPER_EQUIP_UI.slot || "amulet";
  const cfg = p.config.equipHelper[slot];
  const counts = accessoryAvailableCounts(p, slot);
  const pouchIcons = Object.keys(counts).slice(0, 12).map((slug) =>
    `<div class="inv-item ${itemClsBorder(slug)}" style="width:34px;height:34px;cursor:default" title="${itemName(slug)} · ${counts[slug]}x">
      ${itemImg(slug)}${counts[slug] > 1 ? `<span class="cnt">${counts[slug]}</span>` : ""}</div>`).join("");

  return `
    <div class="row mb8" style="gap:6px">
      ${[["amulet", "Amuleto"], ["ring", "Anel"]].map(([id, nome]) =>
        `<button class="sm ${slot === id ? "primary" : ""}" data-helper-equip-slot="${id}">${nome}</button>`).join("")}
      <span style="flex:1"></span>
      <label class="toggle tiny"><input type="checkbox" id="helper-equip-enabled" ${cfg.enabled ? "checked" : ""}> Ativo</label>
    </div>
    <div class="panel-inset" style="padding:10px">
      <div class="small" style="color:#d4af37;font-weight:bold;margin-bottom:8px">${slot === "amulet" ? "Amuleto" : "Anel"}</div>
      <div class="row" style="gap:12px;align-items:flex-start">
        <div style="flex:1;min-width:0">
          <div class="tiny" style="color:#ff9090;font-weight:bold">EMERGENCIAL</div>
          ${accessorySelectHtml(p, slot, cfg.emergency, "helper-equip-emergency")}
          <label class="small dim mt8">Equipar com vida abaixo de (%)</label>
          <input id="helper-equip-below" type="number" min="1" max="99" value="${cfg.equipBelow}"
            style="width:100%;padding:5px;background:#14120e;color:#c8c0a8;border:1px solid #16140f">
        </div>
        <div style="flex:1;min-width:0">
          <div class="tiny" style="color:#7ae87a;font-weight:bold">PADRÃO</div>
          ${accessorySelectHtml(p, slot, cfg.normal, "helper-equip-normal")}
          <label class="small dim mt8">Restaurar com vida acima de (%)</label>
          <input id="helper-equip-above" type="number" min="1" max="99" value="${cfg.restoreAbove}"
            style="width:100%;padding:5px;background:#14120e;color:#c8c0a8;border:1px solid #16140f">
        </div>
      </div>
      <div class="small dim mt10 mb4">Na mochila / Loot Pouch</div>
      <div class="row wrap" style="gap:5px">${pouchIcons || `<div class="tiny dim">Nenhum ${slot === "amulet" ? "amuleto" : "anel"} disponível.</div>`}</div>
      <div class="tiny dim mt8">Veste o item emergencial quando a vida cai e devolve o padrão quando recupera. Os itens precisam estar na mochila ou na Loot Pouch.</div>
    </div>`;
}

function bindEquipmentHelper(p) {
  ensureAccessoryConfig(p);
  const rer = () => { const el = document.getElementById("helper-equipment"); if (el) { el.innerHTML = renderEquipmentHelper(p); bindEquipmentHelper(p); } };
  document.querySelectorAll("#helper-equipment [data-helper-equip-slot]").forEach((b) =>
    b.addEventListener("click", () => { HELPER_EQUIP_UI.slot = b.dataset.helperEquipSlot; rer(); }));
  const slot = HELPER_EQUIP_UI.slot || "amulet";
  const cfg = p.config.equipHelper[slot];
  const enabled = document.getElementById("helper-equip-enabled");
  if (enabled) enabled.addEventListener("change", () => { cfg.enabled = enabled.checked; if (typeof save === "function") save(); rer(); });
  const em = document.getElementById("helper-equip-emergency");
  if (em) em.addEventListener("change", () => { cfg.emergency = em.value; if (typeof save === "function") save(); rer(); });
  const no = document.getElementById("helper-equip-normal");
  if (no) no.addEventListener("change", () => { cfg.normal = no.value; if (typeof save === "function") save(); rer(); });
  const below = document.getElementById("helper-equip-below");
  if (below) below.addEventListener("change", () => {
    cfg.equipBelow = Math.max(1, Math.min(99, parseInt(below.value, 10) || 50));
    below.value = cfg.equipBelow;
    if (cfg.restoreAbove < cfg.equipBelow) cfg.restoreAbove = cfg.equipBelow;
    if (typeof save === "function") save(); rer();
  });
  const above = document.getElementById("helper-equip-above");
  if (above) above.addEventListener("change", () => {
    cfg.restoreAbove = Math.max(1, Math.min(99, parseInt(above.value, 10) || 80));
    if (cfg.restoreAbove < cfg.equipBelow) cfg.restoreAbove = cfg.equipBelow;
    above.value = cfg.restoreAbove;
    if (typeof save === "function") save(); rer();
  });
}

/* --------------------------------------------------------- magic shield */
function energyRingEquipped(p) {
  return !!(p && p.equip && p.equip.ring && p.equip.ring.item === "energy-ring");
}

function isMagicShieldActive(p, now) {
  now = now || Date.now();
  return energyRingEquipped(p) || ((p.magicShieldUntil || 0) > now);
}

function magicShieldSource(p, now) {
  if (energyRingEquipped(p)) return "Energy Ring";
  if ((p.magicShieldUntil || 0) > (now || Date.now())) return "Magic Shield";
  return "";
}

function magicShieldSpellAllowed(p) {
  const s = typeof SPELLS !== "undefined" ? SPELLS[MAGIC_SHIELD_SPELL_ID] : null;
  if (!s) return false;
  return !s.vocs || s.vocs.indexOf(p.voc) !== -1;
}

function tryMagicShield(c, p, now) {
  ensureAccessoryConfig(p);
  const cfg = p.config.magicShield;
  if (!cfg.enabled || !cfg.useSpell) return false;
  if (isMagicShieldActive(p, now)) return false;
  const s = SPELLS[MAGIC_SHIELD_SPELL_ID];
  if (!s || !magicShieldSpellAllowed(p)) return false;
  const max = maxStats(p);
  const hpPct = max.hp ? (p.hp / max.hp) * 100 : 100;
  const mpPct = max.mp ? (p.mp / max.mp) * 100 : 0;
  if (hpPct > cfg.hpBelow || mpPct < cfg.mpAbove) return false;
  if (p.level < (s.lvl || 1) || p.mp < s.mana) return false;
  if (typeof cdReady === "function" && !cdReady(p, MAGIC_SHIELD_SPELL_ID, now)) return false;
  p.mp -= s.mana;
  if (typeof addManaSpent === "function") addManaSpent(p, combatManaSkillGain(c, s.mana));
  if (typeof cdStart === "function") cdStart(p, MAGIC_SHIELD_SPELL_ID, s, now);
  p.magicShieldUntil = now + MAGIC_SHIELD_DURATION_MS;
  c.magicShieldCd = now + 1000;
  if (c.events) {
    c.events.push({ t: "say", text: s.words || "utamo vita" });
    c.events.push({ t: "magic-shield-on", x: c.player ? c.player.x : 0.13, y: c.player ? c.player.y : 0.6, screen: true });
  }
  return true;
}

function applyMagicShieldAbsorb(c, p, raw, meta) {
  raw = Math.max(0, Math.floor(raw || 0));
  if (raw <= 0 || !isMagicShieldActive(p, Date.now())) return raw;
  const mana = Math.min(Math.max(0, Math.floor(p.mp || 0)), raw);
  if (mana <= 0) return raw;
  p.mp -= mana;
  const rest = raw - mana;
  if (c && c.stats) c.stats.magicShieldAbsorbed = (c.stats.magicShieldAbsorbed || 0) + mana;
  if (c && c.events) {
    c.events.push({ t: "magic-shield", mana: mana, rest: rest,
      x: meta && meta.x, y: meta && meta.y, sx: meta && meta.sx, sy: meta && meta.sy,
      el: meta && meta.el, screen: true, source: magicShieldSource(p) });
  }
  if (p.mp <= 0 && p.magicShieldUntil) p.magicShieldUntil = 0;
  return rest;
}

function renderMagicShieldHelper(p) {
  ensureAccessoryConfig(p);
  const cfg = p.config.magicShield;
  const now = Date.now();
  const active = isMagicShieldActive(p, now);
  const src = magicShieldSource(p, now);
  const spellOk = magicShieldSpellAllowed(p);
  const s = SPELLS[MAGIC_SHIELD_SPELL_ID];
  const ringCfg = p.config.equipHelper.ring;
  const hasEnergy = (p.bag && p.bag["energy-ring"]) || (p.lootPouch && p.lootPouch["energy-ring"]) || energyRingEquipped(p);
  return `
    <div class="panel-inset" style="padding:10px">
      <div class="row" style="gap:8px;align-items:center">
        <div style="flex:1">
          <div class="small" style="color:#7ec8ff;font-weight:bold">Magic Shield</div>
          <div class="tiny dim">Dano recebido consome mana antes da vida enquanto ativo.</div>
        </div>
        <label class="toggle tiny"><input type="checkbox" id="ms-enabled" ${cfg.enabled ? "" : "checked"}> INATIVO</label>
      </div>
      <div class="stat-row mt8"><span class="k">Estado</span><span class="v" style="color:${active ? "#7ec8ff" : "#888"}">${active ? "ATIVO · " + src : "inativo"}</span></div>
      ${active && !energyRingEquipped(p) ? `<div class="stat-row"><span class="k">Tempo</span><span class="v">${fmtTime(((p.magicShieldUntil || now) - now) / 1000)}</span></div>` : ""}
      <label class="toggle mt8"><input type="checkbox" id="ms-use-spell" ${cfg.useSpell ? "checked" : ""} ${spellOk ? "" : "disabled"}>
        Usar spell <b>${s ? s.words : "utamo vita"}</b>${spellOk ? "" : " <span class='dim'>(sua vocação não usa esta spell)</span>"}</label>
      <div class="row" style="gap:12px;align-items:flex-start;margin-top:8px">
        <div style="flex:1">
          <label class="small dim">Ativar com HP abaixo de (%)</label>
          <input id="ms-hp" type="number" min="1" max="99" value="${cfg.hpBelow}"
            style="width:100%;padding:5px;background:#14120e;color:#c8c0a8;border:1px solid #16140f">
        </div>
        <div style="flex:1">
          <label class="small dim">Só se mana acima de (%)</label>
          <input id="ms-mp" type="number" min="0" max="100" value="${cfg.mpAbove}"
            style="width:100%;padding:5px;background:#14120e;color:#c8c0a8;border:1px solid #16140f">
        </div>
      </div>
      <div class="small dim mt10 mb4">Energy Ring</div>
      <div class="shop-row ${energyRingEquipped(p) ? "selected" : ""}" style="opacity:${hasEnergy ? 1 : .55}">
        ${itemImg("energy-ring")}
        <div style="flex:1;min-width:0">
          <div class="small">Energy Ring ${energyRingEquipped(p) ? "· equipado" : ""}</div>
          <div class="tiny dim">Funciona para Monk e Royal Paladin como no global: dano vai para mana.</div>
          <div class="tiny ${hasEnergy ? "dim" : "txt-red"}">${hasEnergy ? "Disponível na mochila/pouch ou equipado." : "Você ainda não possui energy ring."}</div>
        </div>
        <button class="sm" id="ms-set-energy" ${hasEnergy ? "" : "disabled"}>Usar como emergencial</button>
      </div>
      <div class="tiny dim mt8">Dica: para ring automático, configure o Energy Ring como emergencial na aba <b>Equipamento</b> e escolha um anel padrão para restaurar.</div>
    </div>`;
}

function bindMagicShieldHelper(p) {
  ensureAccessoryConfig(p);
  const cfg = p.config.magicShield;
  const rer = () => { const el = document.getElementById("helper-magic-shield"); if (el) { el.innerHTML = renderMagicShieldHelper(p); bindMagicShieldHelper(p); } };
  const en = document.getElementById("ms-enabled");
  if (en) en.addEventListener("change", () => { cfg.enabled = !en.checked; if (typeof save === "function") save(); rer(); });
  const us = document.getElementById("ms-use-spell");
  if (us) us.addEventListener("change", () => { cfg.useSpell = us.checked; if (typeof save === "function") save(); rer(); });
  const hp = document.getElementById("ms-hp");
  if (hp) hp.addEventListener("change", () => { cfg.hpBelow = Math.max(1, Math.min(99, parseInt(hp.value, 10) || 45)); if (typeof save === "function") save(); rer(); });
  const mp = document.getElementById("ms-mp");
  if (mp) mp.addEventListener("change", () => { cfg.mpAbove = Math.max(0, Math.min(100, parseInt(mp.value, 10) || 0)); if (typeof save === "function") save(); rer(); });
  const er = document.getElementById("ms-set-energy");
  if (er) er.addEventListener("click", () => {
    const rh = p.config.equipHelper.ring;
    rh.enabled = true;
    rh.emergency = "energy-ring";
    rh.equipBelow = cfg.hpBelow || 50;
    if (typeof toast === "function") toast("Energy Ring definido como anel emergencial.");
    if (typeof save === "function") save();
    rer();
  });
}
