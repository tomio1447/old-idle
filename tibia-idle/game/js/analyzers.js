/* OTC-style Analytics Selector — atalhos dos analisadores da caça. */
"use strict";
const OTC_ANALYSERS = [
  ["hunting", "Hunting Session Analyser"], ["loot", "Loot Analyser"],
  ["supply", "Supply Analyser"], ["impact", "Impact Analyser"],
  ["xp", "XP Analyser"], ["drops", "Drop Tracker"],
];
function renderOtcAnalysers() {
  const box = document.getElementById("otc-analysers");
  if (!box) return;
  box.innerHTML = OTC_ANALYSERS.map(([id, name]) =>
    `<button class="otc-analyser-btn" data-otc-analyser="${id}">${name}</button>`).join("");
  box.querySelectorAll("[data-otc-analyser]").forEach((b) => b.addEventListener("click", () => openOtcAnalyser(b.dataset.otcAnalyser)));
}
function openOtcAnalyser(kind) {
  const c = (typeof G !== "undefined" && G) ? G.combat : null;
  const st = c && c.stats ? c.stats : {};
  const title = (OTC_ANALYSERS.find((x) => x[0] === kind) || ["", "Analyser"])[1];
  const p = (typeof G !== "undefined" && G) ? G.p : null;
  let body = "";
  if (!c) body = `<div class="tiny dim">Inicie uma caçada para o ${title} registrar dados.</div>`;
  else if (kind === "hunting") body = `Tempo: <b>${Math.floor((st.time||0)/60)} min</b><br>Kills: <b>${st.kills||0}</b><br>XP: <b>${fmtFull(st.exp||0)}</b><br>Gold: <b>${fmtFull(st.gold||0)}</b>`;
  else if (kind === "loot" || kind === "drops") body = Object.entries(st.loot || {}).map(([id,n]) => `${itemName(id)}: <b>${n}</b>`).join("<br>") || "Nenhum loot registrado.";
  else if (kind === "supply") body = Object.entries(st.supplyUsed || {}).map(([id,n]) => `${itemName(id)}: <b>${n}</b>`).join("<br>") || "Nenhum supply usado.";
  else if (kind === "impact") body = `Dano causado: <b>${fmtFull(st.damage||0)}</b><br>Dano recebido: <b>${fmtFull(st.taken||0)}</b><br>Mortes: <b>${st.deaths||0}</b>`;
  else body = `XP obtida: <b>${fmtFull(st.exp||0)}</b><br>Kills: <b>${st.kills||0}</b>`;
  const modal = document.getElementById("modal"), content = document.getElementById("modal-body");
  content.innerHTML = `<div class="panel-title">${title}<span style="flex:1"></span><button class="sm" id="otc-analyser-close">✕</button></div><div class="panel-body otc-analyser-result">${body}</div>`;
  modal.classList.add("show"); document.getElementById("otc-analyser-close").onclick=()=>modal.classList.remove("show");
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", renderOtcAnalysers); else renderOtcAnalysers();
