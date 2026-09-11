/* wheel-modal.js — Wheel of Destiny: roda visual + listagem de perks. */
"use strict";

function wheelResolveEffect(perk, vocation) {
  if (!perk) return "";
  if (perk.t1 || perk.t2) {
    const parts = [];
    if (perk.t1) parts.push("T1: " + perk.t1);
    if (perk.t2) parts.push("T2: " + perk.t2);
    return parts.join("; ");
  }
  if (perk.template) {
    let params = [];
    if (perk.amount != null) params = [perk.amount];
    else if (perk.params) params = perk.params;
    else if (perk.effect) {
      if (Array.isArray(perk.effect)) params = perk.effect;
      else if (perk.effect[vocation]) params = perk.effect[vocation];
      else params = [];
    }
    return wheelFillTemplate(perk.template, params);
  }
  return "";
}

function wheelSlotEffectName(index, vocation) {
  const wd = window.WHEEL_DATA;
  const dedId = wd.perks.dedication[index];
  const ded = wd.dedication[dedId];
  const conId = wd.perks.conviction[vocation][index];
  const con = wd.conviction[conId];
  const parts = [];
  if (ded && ded.name) parts.push(ded.name);
  if (con && con.name) parts.push(con.name);
  return parts.join(" / ");
}

function wheelIcon(type, index, tip) {
  const pos = type === "small" ? -index * 16 : type === "medium" ? -index * 30 : -index * 34;
  const cls = "wheel-icon wheel-icon-" + type;
  return `<span class="${cls}" style="background-position:${pos}px 0;" title="${tip || ""}"></span>`;
}

function openWheelModal(startVocation) {
  const modal = $("#modal");
  const body = $("#modal-body");
  if (!modal || !body || !window.WHEEL_DATA || !window.WheelPlanner) return;

  body.classList.remove(
    "hunts-modal-shell", "boss-modal-shell", "bosses-modal-shell",
    "reward-modal-shell", "npcs-modal-shell", "cidade-modal-shell",
    "ranking-modal-shell"
  );
  body.classList.add("hunts-modal-shell");

  const p = G.p;
  const voc = startVocation || (p && p.voc) || "knight";
  ensureWheel(p);
  const wd = window.WHEEL_DATA;
  const total = wheelPoints(p);
  const spent = wheelSpent(p) + (Array.isArray(p.wheel.uiSlots) ? p.wheel.uiSlots.reduce((a,b)=>a+b,0) : 0);
  const avail = Math.max(0, total - spent);

  const vocBtn = (v) => `
    <button class="sm ${v === voc ? 'active' : ''}" data-wv="${v}" style="text-transform:uppercase;">${v}</button>
  `;

  let dedication = "";
  for (let i = 0; i < wd.dedication.length; i++) {
    const d = wd.dedication[i];
    if (!d) continue;
    const eff = wheelResolveEffect(d, voc);
    dedication += `
      <div class="wheel-row">
        ${wheelIcon("small", d.icon, d.name)}
        <strong>${d.name}</strong>
        <span class="tiny dim">${eff}</span>
      </div>`;
  }

  let convictionSet = [];
  for (const idx of wd.perks.conviction[voc]) {
    if (convictionSet.indexOf(idx) === -1) convictionSet.push(idx);
  }
  let conviction = "";
  for (const idx of convictionSet) {
    const c = wd.conviction[idx];
    if (!c) continue;
    const eff = wheelResolveEffect(c, voc);
    conviction += `
      <div class="wheel-row">
        ${wheelIcon("medium", idx, c.name || c.template)}
        <strong>${c.name || c.template || "Perk"}</strong>
        <span class="tiny dim">${eff}</span>
      </div>`;
  }

  let revelation = "";
  for (let i = 0; i < wd.perks.revelation[voc].length; i++) {
    const idx = wd.perks.revelation[voc][i];
    const r = wd.revelation[idx];
    if (!r) continue;
    const tiers = (r.tiers || []).map((t) => wheelFillTemplate(r.template, t)).join("</li><li>");
    revelation += `
      <div class="wheel-row" style="align-items:flex-start;flex-wrap:wrap;">
        ${wheelIcon("large", idx, r.name)}
        <strong>${r.name}</strong>
        <ul class="tiny dim" style="margin:2px 0 4px 22px;flex-basis:100%;">${tiers ? "<li>" + tiers + "</li>" : ""}</ul>
      </div>`;
  }

  const wheelPanel = window.WheelPlanner.render(voc, p);

  body.innerHTML = `
    <div class="panel-title wheel-modal-title" style="gap:8px">
      <span>WHEEL OF DESTINY</span>
      <span class="tiny" style="margin-left:auto">Pontos: <b style="color:#ffe680">${spent}/${total}</b> (disp. <b style="color:#9ce84a">${avail}</b>)</span>
      <button class="sm" id="wheel-modal-close">Fechar</button>
    </div>
    <div class="panel-body" style="max-height:70vh;overflow:auto;text-align:center;">
      <div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:center;margin-bottom:10px;">
        ${window.WHEEL_VOCATIONS.map(vocBtn).join("")}
      </div>
      <div id="wheel-visual-wrap"></div>
      <div style="margin-top:12px;text-align:left;">
        <h4>DEDICATION</h4>
        <div class="wheel-section">${dedication}</div>
        <h4>CONVICTION</h4>
        <div class="wheel-section">${conviction}</div>
        <h4>REVELATION</h4>
        <div class="wheel-section">${revelation}</div>
      </div>
    </div>`;

  $("#wheel-visual-wrap").appendChild(wheelPanel);

  modal.classList.add("show");
  $("#wheel-modal-close").addEventListener("click", () => {
    modal.classList.remove("show");
    body.classList.remove("hunts-modal-shell");
  });

  $$('[data-wv]').forEach((btn) =>
    btn.addEventListener("click", () => openWheelModal(btn.dataset.wv))
  );

  wheelAttachSliceClicks(voc);
}

function wheelSliceInfo(index, kind, vocation) {
  const wd = window.WHEEL_DATA;
  if (!wd) return "";
  if (kind === "revelation") {
    const rIdx = wd.perks.revelation[vocation][index];
    const r = wd.revelation[rIdx];
    return r ? (r.name || "Revelation") : "Revelation";
  }
  const dedIdx = wd.perks.dedication[index];
  const conIdx = wd.perks.conviction[vocation][index];
  const ded = wd.dedication[dedIdx];
  const con = wd.conviction[conIdx];
  const parts = [];
  if (ded && ded.name) parts.push(ded.name + ": " + wheelResolveEffect(ded, vocation));
  if (con && (con.name || con.template)) parts.push((con.name || con.template) + ": " + wheelResolveEffect(con, vocation));
  return parts.join(" · ") || "Slot " + index;
}

function wheelModalCanAllocate(p, index) {
  const wd = window.WHEEL_DATA;
  if (!p || !p.wheel || !Array.isArray(p.wheel.uiSlots)) return false;
  const c = Math.floor(index >= 4 ? (index < 12 ? 1 : (index < 24 ? 2 : (index < 32 ? 3 : 4))) : 0);
  const max = wd.pointsPerCircle[c];
  const pts = p.wheel.uiSlots[index] || 0;
  if (pts >= max) return false;
  const total = wheelPoints(p);
  const spent = wheelSpent(p) + p.wheel.uiSlots.reduce((a,b)=>a+b,0);
  if (spent >= total) return false;
  // libera se o circulo anterior estiver totalmente preenchido (regra Canary)
  if (c === 0) return true;
  let start = 0;
  for (let i = 0; i < c; i++) start += wd.slicesPerCircle[i];
  const prevStart = start - wd.slicesPerCircle[c-1];
  const prevMax = wd.pointsPerCircle[c-1];
  for (let i = prevStart; i < start; i++) if ((p.wheel.uiSlots[i] || 0) < prevMax) return false;
  return true;
}

function wheelAllocateModal(p, index) {
  if (!wheelModalCanAllocate(p, index)) { toast("Não é possível alocar neste slot."); return false; }
  p.wheel.uiSlots[index] = (p.wheel.uiSlots[index] || 0) + 1;
  if (typeof save === "function") save();
  return true;
}

function wheelRemoveModal(p, index) {
  if (!p || !p.wheel || !Array.isArray(p.wheel.uiSlots) || (p.wheel.uiSlots[index] || 0) <= 0) return false;
  const wd = window.WHEEL_DATA;
  const c = Math.floor(index >= 4 ? (index < 12 ? 1 : (index < 24 ? 2 : (index < 32 ? 3 : 4))) : 0);
  const newVal = p.wheel.uiSlots[index] - 1;
  p.wheel.uiSlots[index] = newVal;
  // verifica se algum slot do circulo atual/futuro ficou invalido (ainda nao tem regra complexa)
  // se removeu e algum slot abaixo continua preenchido, eh valido
  if (typeof save === "function") save();
  return true;
}

function wheelAttachSliceClicks(vocation) {
  const modal = $("#modal");
  const p = G.p;
  $$('.wheel-slice-clickable').forEach((el) => {
    el.style.cursor = "pointer";
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      const index = Number(el.dataset.index);
      const kind = el.dataset.kind || "slice";
      if (kind !== "slice") {
        const info = wheelSliceInfo(index, kind, el.dataset.vocation || vocation);
        toast(`Revelation ${index + 1}: ${info}`);
        return;
      }
      if (e.shiftKey) {
        wheelRemoveModal(p, index) && openWheelModal(vocation);
      } else {
        wheelAllocateModal(p, index) && openWheelModal(vocation);
      }
    });
    el.addEventListener("mouseenter", () => { el.querySelectorAll('path').forEach((p) => p.setAttribute('opacity', '0.7')); });
    el.addEventListener("mouseleave", () => { el.querySelectorAll('path').forEach((p) => {
      if (p.classList && p.classList.contains('wheel-slice-inner')) p.setAttribute('opacity', '0.1');
      else p.setAttribute('opacity', '0.25');
    }); });
  });
}

function wheelAttach() {
  const btn = $("#btn-wheel");
  if (btn && !btn.dataset.wAttached) {
    btn.dataset.wAttached = "1";
    btn.addEventListener("click", () => openWheelModal());
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", wheelAttach);
} else {
  wheelAttach();
}

if (typeof window !== "undefined") {
  window.openWheelModal = openWheelModal;
}
