"use strict";
/* daily-reward.js — coleta da recompensa do server save diário (00h, Brasília).
 *
 * Cronograma SEMANAL POR CONTA (antes: 3000 cargas por personagem):
 *   dom 1500 cargas de Exercise Weapon · seg/qua 10 Prey Wildcards
 *   ter  +25% EXP por 1h de caça · qui 500 cargas · sex +100% EXP por 30min
 *   sáb  +100% Skill por 30min de treino
 * Um claim por conta por server save — não acumula: sem coletar, o próximo
 * server save substitui. Boosts de EXP só drenam em hunt; o de skill só
 * drena dentro da área de treino (templo/boss/quest não consomem).
 */

const DAILY_REWARD_STATE = { checking: false, shownDay: "", timer: null };
const DAILY_REWARD_WEAPONS = [
  "exercise-sword", "exercise-axe", "exercise-club", "exercise-bow",
  "exercise-rod", "exercise-wand", "exercise-shield", "exercise-wraps",
];
const DAILY_REWARD_DAY_NAMES = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

function dailyRewardVocWeapons(p) {
  const voc = String(p && p.voc || "").toLowerCase();
  if (voc.includes("paladin")) return ["exercise-bow"];
  if (voc.includes("druid")) return ["exercise-rod"];
  if (voc.includes("sorcerer")) return ["exercise-wand"];
  if (voc.includes("monk")) return ["exercise-wraps"];
  // knight (e fallback) treina as três perícias melee.
  return ["exercise-sword", "exercise-axe", "exercise-club"];
}

function dailyRewardIcon(reward) {
  const type = String(reward && reward.type || "exercise");
  if (type === "wildcard") return "assets/ui/prey/prey_wildcard.png";
  if (type === "exp") return "assets/ui/prey/prey_xp.png";
  if (type === "skill") return (typeof TRAINING_ICON_PATH !== "undefined" ? TRAINING_ICON_PATH : "assets/sprites/training/") + "skill-trainer-all.gif";
  return (typeof TRAINING_ICON_PATH !== "undefined" ? TRAINING_ICON_PATH : "assets/sprites/training/") + "lasting-exercise-sword.gif";
}
function dailyRewardLabel(reward, fallback) {
  if (reward && reward.label) return reward.label;
  const type = String(reward && reward.type || "");
  if (type === "exercise") return (Number(reward.charges) || 0) + " cargas de Exercise Weapon";
  if (type === "wildcard") return (Number(reward.cards) || 0) + " Prey Wildcards";
  if (type === "exp") return "+" + Math.round(((Number(reward.mul) || 1) - 1) * 100) + "% de EXP por " + Math.round((Number(reward.leftMs) || 0) / 60000) + "min de caça";
  if (type === "skill") return "+" + Math.round(((Number(reward.mul) || 1) - 1) * 100) + "% de Skill por " + Math.round((Number(reward.leftMs) || 0) / 60000) + "min de treino";
  return fallback || "Recompensa";
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

  const fmt = typeof fmtFull === "function" ? fmtFull : (n) => String(n);
  const reward = status && status.reward || { type: "exercise", charges: 3000 };
  const weekday = Number.isInteger(status && status.weekday) ? status.weekday : 0;
  const claimed = !!(status && status.claimedDay && status.claimedDay === status.rewardDay);
  const todayName = (status && status.dayName) || DAILY_REWARD_DAY_NAMES[weekday] || "hoje";

  // Cronograma da semana — linha de hoje destacada.
  const schedule = Array.isArray(status && status.schedule) && status.schedule.length === 7
    ? status.schedule
    : DAILY_REWARD_DAY_NAMES.map((n, i) => ({ weekday: i, dayName: n, reward: null }));
  const weekRows = schedule.map((row) => {
    const isToday = row.weekday === weekday;
    const tag = isToday ? (claimed ? "coletado" : "hoje") : "";
    return `<div class="dr-week-row ${isToday ? "today" : ""} ${isToday && claimed ? "done" : ""}">
      <img src="${dailyRewardIcon(row.reward)}" alt="">
      <span class="dr-week-day">${row.dayName || DAILY_REWARD_DAY_NAMES[row.weekday] || ""}</span>
      <span class="dr-week-label">${dailyRewardLabel(row.reward, "—")}</span>
      ${tag ? `<span class="dr-week-tag">${tag}</span>` : ""}
    </div>`;
  }).join("");

  // Boosts ativos no char (exp de terça/sexta, skill de sábado).
  const boostLines = [];
  for (const key of ["expBoost", "skillBoost"]) {
    const b = status && status[key];
    const left = Math.max(0, Number(b && b.leftMs) || 0);
    if (!left) continue;
    const mins = Math.ceil(left / 60000);
    boostLines.push(key === "expBoost"
      ? `Bônus de EXP ×${Number(b.mul) || 1} ativo — restam ${mins}min de caça.`
      : `Bônus de Skill ×${Number(b.mul) || 1} ativo — restam ${mins}min de treino.`);
  }

  // Área de claim: dia de exercise pede a arma (define o skill); os demais
  // são coleta direta por conta.
  const needsWeapon = reward.type === "exercise";
  const vocWeapons = dailyRewardVocWeapons(p);
  let selected = vocWeapons[0] || "exercise-sword";
  const weaponCards = !needsWeapon ? "" : `<div class="dr-grid">${DAILY_REWARD_WEAPONS.map((id) => {
    const meta = (typeof EXERCISE_WEAPONS !== "undefined" && EXERCISE_WEAPONS[id]) || {};
    const isVoc = vocWeapons.includes(id);
    return `<button class="dr-card ${isVoc ? "voc" : "off"}" data-dr-weapon="${id}" type="button">
      <img src="${TRAINING_ICON_PATH}${String(meta.icon || "exercise-sword.gif").replace("exercise-", "lasting-")}" alt="${meta.name || id}">
      <span class="dr-name">${meta.name || id}</span>
      <span class="dr-tag ${isVoc ? "in" : "out"}">${isVoc ? "sua vocação" : "fora da vocação"}</span>
    </button>`;
  }).join("")}</div>`;

  const todayCard = `<div class="dr-today-card">
      <img src="${dailyRewardIcon(reward)}" alt="">
      <div class="dr-today-info">
        <b>${dailyRewardLabel(reward)}</b>
        <span class="tiny dim">${reward.type === "exercise"
          ? "somam com as cargas compradas na store — valem só para este personagem."
          : reward.type === "wildcard"
            ? "vão para o pool de Prey Cards da conta — todos os personagens usam."
            : reward.type === "exp"
              ? "vale para todos os personagens; o tempo só corre em hunt — boss, quest, treino e templo não consomem."
              : "vale para todos os personagens; o tempo só corre dentro da área de treino."}</span>
      </div>
    </div>`;

  body.innerHTML = `
    <div class="panel-title">SERVER SAVE — RECOMPENSA SEMANAL
      <span style="flex:1"></span><button class="sm" id="dr-close" type="button">✕</button>
    </div>
    <div class="panel-body daily-reward-body">
      <div class="tiny dim center mb8">
        Recompensa <b>por conta</b>, uma coleta por server save (00h — Brasília).
        Hoje é <b>${todayName}</b>: colete <b style="color:#9ce84a">${dailyRewardLabel(reward)}</b>.
      </div>
      ${todayCard}
      ${weaponCards}
      <div class="dr-week">${weekRows}</div>
      <div class="dr-note">
        <span class="dr-note-icon">i</span>
        <span>${needsWeapon
          ? "Armas fora da vocação podem ser pegas, mas treinam a perícia bem devagar."
          : "A recompensa é única por conta — coletou, valeu para todos."}
        O bônus <b>não acumula</b>: sem coletar, o próximo server save o substitui.</span>
      </div>
      ${boostLines.length ? `<div class="tiny center dr-boosts">${boostLines.join("<br>")}</div>` : ""}
      <div class="row dr-actions">
        <button id="dr-later" type="button">Talvez depois</button>
        <button class="primary" id="dr-claim" type="button">${claimed ? "Já coletado hoje" : "Pegar a recompensa"}</button>
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
  if (claim) {
    if (claimed) claim.disabled = true;
    claim.addEventListener("click", async () => {
      claim.disabled = true;
      if (msgEl) msgEl.textContent = "Coletando...";
      const r = await accountClaimDailyReward(sessionToken(), p.id, needsWeapon ? selected : "");
      if (r && r.ok) {
        if (typeof toast === "function") toast(r.msg || "Recompensa coletada.", "good");
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
}
