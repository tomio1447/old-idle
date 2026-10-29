"use strict";
/* daily-reward.js — coleta do bônus do server save diário (00h, Brasília).
 *
 * O servidor libera +3000 cargas de Lasting Exercise Weapon para TODOS os
 * personagens a cada server save — acumulam com as cargas compradas na
 * store. O jogador escolhe a arma (define o skill treinado) e coleta pelo
 * modal. claimedDay é server-owned — o bônus não acumula: sem coletar, o
 * próximo server save o substitui.
 */

const DAILY_REWARD_STATE = { checking: false, shownDay: "", timer: null };
const DAILY_REWARD_WEAPONS = [
  "exercise-sword", "exercise-axe", "exercise-club", "exercise-bow",
  "exercise-rod", "exercise-wand", "exercise-shield", "exercise-wraps",
];

function dailyRewardVocWeapons(p) {
  const voc = String(p && p.voc || "").toLowerCase();
  if (voc.includes("paladin")) return ["exercise-bow"];
  if (voc.includes("druid")) return ["exercise-rod"];
  if (voc.includes("sorcerer")) return ["exercise-wand"];
  if (voc.includes("monk")) return ["exercise-wraps"];
  // knight (e fallback) treina as três perícias melee.
  return ["exercise-sword", "exercise-axe", "exercise-club"];
}

async function dailyRewardCheck(p, attempt) {
  if (!p || typeof accountApiConfigured !== "function" || !accountApiConfigured()) return;
  if (typeof accountDailyRewardStatus !== "function" || typeof sessionToken !== "function") return;
  // Outro modal aberto (offline gains, party, etc): tenta de novo em 4s.
  const modal = document.getElementById("modal");
  if (modal && modal.classList.contains("show")) {
    if ((attempt || 0) < 5) setTimeout(() => dailyRewardCheck(p, (attempt || 0) + 1), 4000);
    return;
  }
  const token = sessionToken();
  if (!token) return;
  const r = await accountDailyRewardStatus(token, p.id);
  if (!r || !r.ok || !r.available) return;
  if (DAILY_REWARD_STATE.shownDay === r.rewardDay) return;
  DAILY_REWARD_STATE.shownDay = r.rewardDay;
  openDailyRewardModal(p, r);
}

/* Re-checa a cada 10 min durante a sessão — pega o server save sem
 * precisar de relogin e reabre o modal no novo ciclo. */
function dailyRewardEnsureTimer(p) {
  if (DAILY_REWARD_STATE.timer) return;
  DAILY_REWARD_STATE.timer = setInterval(() => {
    if (typeof G !== "undefined" && G.p) dailyRewardCheck(G.p);
  }, 10 * 60 * 1000);
}

function openDailyRewardModal(p, status) {
  const modal = document.getElementById("modal"), body = document.getElementById("modal-body");
  if (!modal || !body) return;
  body.classList.remove(
    "boss-modal-shell", "hunts-modal-shell", "npcs-modal-shell",
    "cidade-modal-shell", "ranking-modal-shell"
  );
  body.classList.add("reward-modal-shell");

  const vocWeapons = dailyRewardVocWeapons(p);
  const charges = Number(status && status.charges) || 3000;
  const fmt = typeof fmtFull === "function" ? fmtFull : (n) => String(n);
  let selected = vocWeapons[0] || "exercise-sword";

  const cards = DAILY_REWARD_WEAPONS.map((id) => {
    const meta = (typeof EXERCISE_WEAPONS !== "undefined" && EXERCISE_WEAPONS[id]) || {};
    const isVoc = vocWeapons.includes(id);
    return `<button class="dr-card ${isVoc ? "voc" : "off"}" data-dr-weapon="${id}" type="button">
      <img src="${TRAINING_ICON_PATH}${String(meta.icon || "exercise-sword.gif").replace("exercise-", "lasting-")}" alt="${meta.name || id}">
      <span class="dr-name">${meta.name || id}</span>
      <span class="dr-tag ${isVoc ? "in" : "out"}">${isVoc ? "sua vocação" : "fora da vocação"}</span>
    </button>`;
  }).join("");

  body.innerHTML = `
    <div class="panel-title">SERVER SAVE — RECOMPENSA
      <span style="flex:1"></span><button class="sm" id="dr-close" type="button">✕</button>
    </div>
    <div class="panel-body daily-reward-body">
      <div class="tiny dim center mb8">
        O servidor executou o <b>server save</b> diário (00h — Brasília).
        Colete <b style="color:#9ce84a">${fmt(charges)}</b> cargas de Lasting Exercise Weapon
        (somam com as compradas na store).
      </div>
      <div class="dr-grid">${cards}</div>
      <div class="dr-note">
        <span class="dr-note-icon">i</span>
        <span>Armas fora da vocação podem ser pegas, mas treinam a perícia bem devagar.
        O bônus <b>não acumula</b>: sem coletar, o próximo server save o substitui.</span>
      </div>
      <div class="row dr-actions">
        <button id="dr-later" type="button">Talvez depois</button>
        <button class="primary" id="dr-claim" type="button">Pegar a recompensa</button>
      </div>
      <div class="tiny dim center mt4" id="dr-msg"></div>
    </div>`;
  modal.classList.add("show");

  const paintSel = () => {
    body.querySelectorAll("[data-dr-weapon]").forEach((el) =>
      el.classList.toggle("sel", el.dataset.drWeapon === selected));
  };
  paintSel();
  body.querySelectorAll("[data-dr-weapon]").forEach((el) => {
    el.addEventListener("click", () => { selected = el.dataset.drWeapon; paintSel(); });
  });

  const close = () => modal.classList.remove("show");
  const closer = document.getElementById("dr-close");
  if (closer) closer.addEventListener("click", close);
  const later = document.getElementById("dr-later");
  if (later) later.addEventListener("click", close);

  const claim = document.getElementById("dr-claim"), msgEl = document.getElementById("dr-msg");
  if (claim) claim.addEventListener("click", async () => {
    claim.disabled = true;
    if (msgEl) msgEl.textContent = "Coletando...";
    const r = await accountClaimDailyReward(sessionToken(), p.id, selected);
    if (r && r.ok) {
      if (typeof toast === "function") toast(r.msg || `+${fmt(charges)} cargas coletadas.`, "good");
      else if (typeof addLog === "function") addLog("info", r.msg || "Recompensa coletada.");
      if (typeof save === "function") save();
      close();
      return;
    }
    claim.disabled = false;
    const msg = (r && r.msg) || "Não foi possível coletar a recompensa.";
    if (msgEl) msgEl.textContent = msg;
    if (typeof toast === "function") toast(msg, "bad");
  });
}
