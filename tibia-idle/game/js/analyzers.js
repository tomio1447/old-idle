/* Analytics laterais em tempo real — estilo OTClient.
 *
 * Os analisadores vivem na coluna lateral do jogo. Trocar de aba nunca abre
 * o modal global nem interrompe o combate. O Hunt Session é a aba padrão e
 * acompanha a sessão ativa em tempo real.
 */
"use strict";

const OTC_ANALYSERS = [
  { id: "hunting", label: "Hunt Session", title: "Hunt Session Analyser", icon: "📈" },
  { id: "xp", label: "XP", title: "XP Analyser", icon: "✨" },
  { id: "loot", label: "Loot", title: "Loot Analyser", icon: "🎒" },
  { id: "supply", label: "Supplies", title: "Supply Analyser", icon: "🧪" },
  { id: "impact", label: "Impact", title: "Impact Analyser", icon: "⚔" },
  { id: "drops", label: "Monsters", title: "Killed Monsters", icon: "☠" },
];
let activeOtcAnalyser = "hunting";

function otcAnalyserDefinition(kind) {
  return OTC_ANALYSERS.find((entry) => entry.id === kind) || OTC_ANALYSERS[0];
}

function otcAnalyserNumber(value) {
  const n = Math.max(0, Math.round(Number(value) || 0));
  return typeof fmtFull === "function" ? fmtFull(n) : n.toLocaleString("pt-BR");
}

function otcAnalyserEscape(value) {
  return String(value == null ? "" : value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char]);
}

function otcAnalyserDuration(c) {
  if (!c || !c.stats) return 0;
  const simulated = Math.max(0, Number(c.stats.time) || 0);
  if (simulated) return simulated;
  const startedAt = Number(c.stats.startedAt) || 0;
  return startedAt ? Math.max(0, Date.now() - startedAt) : 0;
}

function otcAnalyserClock(milliseconds) {
  const total = Math.max(0, Math.floor((Number(milliseconds) || 0) / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return [hours, minutes, seconds].map((n) => String(n).padStart(2, "0")).join(":");
}

function otcAnalyserRate(value, duration) {
  if (!duration) return 0;
  return (Number(value) || 0) * 3600000 / duration;
}

function otcAnalyserMetric(label, value, detail, cls) {
  return `<div class="otc-analyser-metric ${cls || ""}"><span>${label}</span><b>${value}</b>${detail ? `<small>${detail}</small>` : ""}</div>`;
}

function otcAnalyserItemName(id) {
  const name = typeof itemName === "function" ? itemName(id) : id;
  return otcAnalyserEscape(name || id);
}

function otcAnalyserItemIcon(id) {
  return typeof itemImg === "function" ? itemImg(id, 18) : "";
}

function otcAnalyserEmpty(message) {
  return `<div class="otc-analyser-empty"><b>Sem sessão ativa</b><span>${message}</span></div>`;
}

function otcAnalyserMonsterRows(stats) {
  return Object.entries((stats && stats.monsters) || {})
    .sort((a, b) => (Number(b[1].kills) || 0) - (Number(a[1].kills) || 0))
    .map(([slug, entry]) => {
      const kills = Math.max(0, Number(entry.kills) || 0);
      const rawExp = Math.max(0, Number(entry.rawExp) || 0);
      const rawHp = Math.max(0, Number(entry.rawHp) || 0);
      const eachExp = kills ? rawExp / kills : 0;
      const eachHp = kills ? rawHp / kills : 0;
      return `<div class="otc-analyser-line otc-monster-line">
        <span><b>${otcAnalyserEscape(entry.name || slug)}</b><small>${otcAnalyserNumber(eachExp)} raw XP · ${otcAnalyserNumber(eachHp)} HP</small></span>
        <strong>×${otcAnalyserNumber(kills)}</strong>
      </div>`;
    }).join("");
}

function otcAnalyserBody(kind, c) {
  if (!c || !c.stats) return otcAnalyserEmpty("Inicie uma caçada para registrar as estatísticas em tempo real.");
  const stats = c.stats;
  const duration = Math.max(0, otcAnalyserDuration(c));
  const rate = (value) => otcAnalyserNumber(otcAnalyserRate(value, duration));
  const exp = Math.max(0, Number(stats.exp) || 0);
  const rawExp = Math.max(0, Number(stats.rawExp) || 0);
  const rawHp = Math.max(0, Number(stats.rawHp) || 0);
  const kills = Math.max(0, Number(stats.kills) || 0);
  const hunt = c.hunt || (typeof GAMEDATA !== "undefined" && GAMEDATA.hunts ? GAMEDATA.hunts[c.huntId] : null);
  const huntName = (c.boss && c.boss.name) || (hunt && hunt.name) || c.huntId || "Caçada";
  const mode = c.instanceMode || "non-pvp";
  const monsterRows = otcAnalyserMonsterRows(stats);

  if (kind === "hunting") {
    const efficiency = rawHp > 0 ? (rawExp / rawHp).toFixed(3) : "0.000";
    return `<div class="otc-session-head">
        <span><b>${otcAnalyserEscape(huntName)}</b><small>${otcAnalyserEscape(mode)}</small></span>
        <em><i></i> AO VIVO</em>
      </div>
      <div class="otc-analyser-grid">
        ${otcAnalyserMetric("Sessão", otcAnalyserClock(duration), "tempo de combate")}
        ${otcAnalyserMetric("Kills", otcAnalyserNumber(kills), `${rate(kills)}/h`)}
        ${otcAnalyserMetric("XP obtida", otcAnalyserNumber(exp), "na sessão", "xp-gained")}
        ${otcAnalyserMetric("XP/h", rate(exp), "com bônus", "xp-gained")}
        ${otcAnalyserMetric("Raw XP", otcAnalyserNumber(rawExp), "na sessão", "raw-xp")}
        ${otcAnalyserMetric("Raw XP/h", rate(rawExp), "sem bônus", "raw-xp")}
        ${otcAnalyserMetric("Gold", otcAnalyserNumber(stats.gold), `${rate(stats.gold)}/h`, "gold")}
        ${otcAnalyserMetric("Raw XP/HP", efficiency, "eficiência base", "raw-ratio")}
      </div>
      <div class="otc-raw-note"><b>Raw XP/h</b> usa somente a EXP original dos monstros. Não soma stage, PvP, Prey, VIP, Soul War ou bônus de party.</div>
      <div class="otc-analyser-section-title">Monstros abatidos</div>
      ${monsterRows || '<div class="tiny dim">Aguardando o primeiro abate.</div>'}`;
  }

  if (kind === "xp") {
    return `<div class="otc-analyser-grid">
        ${otcAnalyserMetric("XP obtida", otcAnalyserNumber(exp), "na sessão", "xp-gained")}
        ${otcAnalyserMetric("XP/h", rate(exp), "com bônus", "xp-gained")}
        ${otcAnalyserMetric("Raw XP", otcAnalyserNumber(rawExp), "na sessão", "raw-xp")}
        ${otcAnalyserMetric("Raw XP/h", rate(rawExp), "sem bônus", "raw-xp")}
        ${otcAnalyserMetric("Diferença", otcAnalyserNumber(Math.max(0, exp - rawExp)), "bônus líquidos")}
        ${otcAnalyserMetric("Kills", otcAnalyserNumber(kills), `${rate(kills)}/h`)}
      </div>
      <div class="otc-raw-note"><b>Raw XP</b> é a soma da EXP base dos monstros mortos, antes de qualquer multiplicador.</div>`;
  }

  if (kind === "loot" || kind === "supply") {
    const source = kind === "loot" ? stats.loot : stats.supplyUsed;
    const rows = Object.entries(source || {}).sort((a, b) => Number(b[1]) - Number(a[1])).map(([id, amount]) =>
      `<div class="otc-analyser-line">${otcAnalyserItemIcon(id)}<span>${otcAnalyserItemName(id)}</span><strong>${otcAnalyserNumber(amount)}</strong></div>`
    ).join("");
    const heading = kind === "loot"
      ? `Gold coletado: <b>${otcAnalyserNumber(stats.gold)} gp</b>`
      : `Custo registrado: <b>${otcAnalyserNumber(stats.supplyCost)} gp</b>`;
    return `<div class="otc-analyser-summary">${heading}</div>${rows || `<div class="tiny dim">Nenhum ${kind === "loot" ? "loot" : "supply"} registrado.</div>`}`;
  }

  if (kind === "impact") {
    return `<div class="otc-analyser-grid">
      ${otcAnalyserMetric("Dano causado", otcAnalyserNumber(stats.damage), `${rate(stats.damage)}/h`)}
      ${otcAnalyserMetric("Dano recebido", otcAnalyserNumber(stats.taken), `${rate(stats.taken)}/h`)}
      ${otcAnalyserMetric("Cura", otcAnalyserNumber(stats.healed), `${rate(stats.healed)}/h`)}
      ${otcAnalyserMetric("Mortes", otcAnalyserNumber(stats.deaths), "na sessão")}
    </div>`;
  }

  return monsterRows || '<div class="tiny dim">Nenhum monstro abatido nesta sessão.</div>';
}

function renderOtcAnalysers() {
  const tabs = document.getElementById("otc-analysers");
  if (!tabs) return;
  tabs.innerHTML = OTC_ANALYSERS.map((entry) =>
    `<button type="button" class="otc-analyser-btn${entry.id === activeOtcAnalyser ? " active" : ""}"
      role="tab" aria-selected="${entry.id === activeOtcAnalyser}" data-otc-analyser="${entry.id}" title="${entry.title}">
      <span aria-hidden="true">${entry.icon}</span>${entry.label}</button>`).join("");
  tabs.querySelectorAll("[data-otc-analyser]").forEach((button) =>
    button.addEventListener("click", () => openOtcAnalyser(button.dataset.otcAnalyser)));
  renderOtcAnalyser();
}

function renderOtcAnalyser() {
  const content = document.getElementById("otc-analyser-content");
  if (!content) return;
  const combat = (typeof G !== "undefined" && G) ? G.combat : null;
  const definition = otcAnalyserDefinition(activeOtcAnalyser);
  const title = document.getElementById("otc-analyser-title");
  if (title) title.textContent = `${definition.icon} ${definition.title}`;
  const nextHtml = otcAnalyserBody(activeOtcAnalyser, combat);
  if (content.innerHTML !== nextHtml) {
    const scrollTop = content.scrollTop;
    content.innerHTML = nextHtml;
    content.scrollTop = scrollTop;
  }
}

/* API mantida para os botões existentes, agora direcionada ao painel lateral. */
function openOtcAnalyser(kind) {
  activeOtcAnalyser = otcAnalyserDefinition(kind).id;
  const tabs = document.getElementById("otc-analysers");
  if (tabs) tabs.querySelectorAll("[data-otc-analyser]").forEach((button) => {
    const selected = button.dataset.otcAnalyser === activeOtcAnalyser;
    button.classList.toggle("active", selected);
    button.setAttribute("aria-selected", String(selected));
  });
  renderOtcAnalyser();
}

if (document.readyState === "loading")
  document.addEventListener("DOMContentLoaded", renderOtcAnalysers);
else renderOtcAnalysers();
