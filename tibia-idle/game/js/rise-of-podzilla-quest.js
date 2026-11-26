/* rise-of-podzilla-quest.js — The Rise of Podzilla Quest (nível 400+).
 *
 * Clone do padrão make-believe-quest.js / sir-leonard.js:
 *   M1 = MISSION_DEFS["podzilla-bottom"] — counter "kills", 1500 monstros
 *        em Podzilla Bottom (o handleMissionKill/engine incrementa
 *        mission.progress.kills; completeReward.bossAccess libera o boss).
 *   M2 = kill do boss The Rootkraken → recompensa: outfit Rootwalker
 *        com addon 1+2 (wardrobe rootwalker-m/-f = 2 + cosmetics da conta).
 *
 * Persistência por conta: claims ficam em p.missionsDone["rise-of-podzilla:*"]
 * e sincronizam via syncMissionsToAccount (mesmo contrato do make-believe).
 * Requisitos oficiais: nível 400 (fontes variam 300–500+; o projeto usa 400
 * — mesmo tier do boss) + kill do Doctor Marrow (pré-requisito da quest
 * oficial — mesmo gate do make-believe).
 */
"use strict";

const RISE_OF_PODZILLA_QUEST_ID = "the-rise-of-podzilla";
const RISE_OF_PODZILLA_OUTFIT = { base: "rootwalker", addons: 3 };

/* Missão de contagem — counter "kills" soma qualquer criatura da hunt
 * Podzilla Bottom (handleMissionKill já incrementa; o servidor espelha
 * em progress.kills). */
const RISE_OF_PODZILLA_MISSION_DEFS = {
  "podzilla-bottom": {
    title: "Missão: The Rise of Podzilla — Podzilla Bottom",
    tasks: [{
      counter: "kills", target: 1500,
      label: "Eliminar 1500 monstros em Podzilla Bottom",
    }],
    completeReward: { bossAccess: "the-rootkraken", bossName: "The Rootkraken" },
  },
};

/* ── Estado derivado da quest (lê os fatos já registrados pelo jogo) ── */
function riseOfPodzillaMissionKills(p, huntId) {
  const st = p && p.missions && p.missions[huntId];
  const prog = (st && st.progress) || {};
  // counter "kills" direto; fallback: soma por slug (autoridade antiga).
  if (Number(prog.kills) > 0) return Number(prog.kills) || 0;
  let sum = 0;
  for (const v of Object.values(prog)) sum += Number(v) || 0;
  return sum;
}

function riseOfPodzillaState(p) {
  /* Kill de boss vale para a conta: qualquer personagem que derrotou
   * libera o requisito para os demais (accountBossKilled, game.js). */
  const killed = (slug) =>
    typeof accountBossKilled === "function"
      ? accountBossKilled(p, slug)
      : Number(p && p.bosses && p.bosses[slug] && p.bosses[slug].kills) > 0;
  const m1k = riseOfPodzillaMissionKills(p, "podzilla-bottom");
  const m1 = m1k >= 1500 || !!(p && p.missionsDone && p.missionsDone["podzilla-bottom"]);
  const m2 = killed("the-rootkraken");
  const done = (p && p.missionsDone) || {};
  return {
    reqLevel: (p && Number(p.level)) >= 400,
    reqMarrow: killed("doctor-marrow"),
    requirementsMet: ((p && Number(p.level)) >= 400) && killed("doctor-marrow"),
    m1: { done: m1, kills: Math.min(m1k, 1500), target: 1500 },
    m2: { done: m2, kills: m2 ? 1 : 0, target: 1 },
    claimed: {
      outfit: !!done["rise-of-podzilla:outfit"],
    },
    complete: m2,
  };
}

/* Concede o claim no mapa de missões (sincronizado para a conta). */
function riseOfPodzillaClaim(p, key, value) {
  p.missionsDone = p.missionsDone || {};
  p.missionsDone["rise-of-podzilla:" + key] = value === undefined ? true : value;
  if (typeof syncMissionsToAccount === "function") syncMissionsToAccount(p);
}

function riseOfPodzillaGrantOutfit(p) {
  if (typeof ensureWardrobe === "function") ensureWardrobe(p);
  p.wardrobe = p.wardrobe || {};
  p.wardrobe.outfits = p.wardrobe.outfits || {};
  // 2 = addon 1 + addon 2 (ownedAddonMask: count>=2 → mask 3).
  p.wardrobe.outfits["rootwalker-m"] = 2;
  p.wardrobe.outfits["rootwalker-f"] = 2;
  try {
    const acc = (typeof sessionAccount === "function") ? sessionAccount() : null;
    if (acc) {
      acc.cosmetics = acc.cosmetics || {};
      acc.cosmetics.outfits = acc.cosmetics.outfits || {};
      acc.cosmetics.outfits["rootwalker"] = 2;
      sessionStorage.setItem("tibia-idle-account", JSON.stringify(acc));
    }
  } catch (e) { /* offline */ }
}

/* ── UI: detail renderer ── */
function renderRiseOfPodzillaQuestDetail(q, ui) {
  const p = G.p;
  // Claims são por conta — puxa o merge antes de ler (outro char pode
  // ter resgatado a recompensa desta quest).
  if (typeof pullAccountMissions === "function") pullAccountMissions(p);
  let st = riseOfPodzillaState(p);
  /* Recompensa determinística resgata sozinha ao concluir a Missão 2 —
   * o jogador não precisa clicar em RESGATAR (mesmo padrão make-believe). */
  if (st.m2.done && !st.claimed.outfit) {
    riseOfPodzillaGrantOutfit(p);
    riseOfPodzillaClaim(p, "outfit");
    if (typeof addLog === "function") addLog("level", "Outfit <b>Rootwalker</b> (addon 1+2) desbloqueada!");
    if (typeof toast === "function") toast("Outfit Rootwalker desbloqueada!", "level");
  }
  st = riseOfPodzillaState(p);
  const fmtK = (n) => (typeof fmtFull === "function" ? fmtFull(n) : String(n));
  const reqRow = (label, ok) =>
    `<div class="shop-row"><span class="info">${label}</span><b style="color:${ok ? "#9ce84a" : "#ff9a6a"}">${ok ? "✓" : "✗"}</b></div>`;
  const mobThumbs = (slugs) => `<span class="mb-mission-mobs">` +
    (slugs || []).map((s) => typeof mobImg === "function" ? mobImg(s, 30) : "").join("") + `</span>`;
  const mission = (num, label, m, reward, mobs) =>
    `<div class="mb-mission${m.done ? " done" : ""}">
      <div class="mb-mission-head"><span class="mb-mission-title">${mobThumbs(mobs)}<span class="info">Missão ${num} — ${label}</span></span>
        <b class="mb-mission-prog">${m.done ? "✓ " : ""}${fmtK(m.kills)}/${fmtK(m.target)}</b></div>
      <div class="mb-mission-bar"><div class="mb-mission-fill" style="width:${Math.min(100, Math.round(100 * m.kills / m.target))}%"></div></div>
      <div class="mb-mission-reward">Recompensa: ${reward}</div>
    </div>`;
  const claimedCard = (label, state, inner) =>
    `<section class="quest-detail-panel mb-reward-box ${state}"><div class="hunt-best-title">${label}</div>${inner}</section>`;
  const cardState = (claimed, unlocked) => claimed ? "claimed" : (unlocked ? "ready" : "locked");
  const unlockOutfit = st.m2.done;
  const lockHint = (n, unlocked) => unlocked ? "" :
    `<div class="mb-reward-state dim">🔒 concluir a Missão ${n}</div>`;
  const outfitCard = claimedCard("OUTFIT ROOTWALKER — Missão 2", cardState(st.claimed.outfit, unlockOutfit), st.claimed.outfit
    ? `<div class="mb-outfit-granted">${typeof questOutfitPreviewHtml === "function" ? questOutfitPreviewHtml(RISE_OF_PODZILLA_OUTFIT, 56) : ""}<span class="tiny" style="color:#9ce84a">✓ Resgatada — Rootwalker (addon 1+2)</span></div>`
    : `<div class="mb-outfit-granted">${typeof questOutfitPreviewHtml === "function" ? questOutfitPreviewHtml(RISE_OF_PODZILLA_OUTFIT, 56) : ""}</div>
       <button type="button" class="sm primary quest-action" id="rop-claim-outfit" ${unlockOutfit ? "" : "disabled"}>RESGATAR</button>${lockHint(2, unlockOutfit)}`);

  ui.body.innerHTML = `<div class="panel-title">${q.name} — Level ${q.level}+<span class="spacer"></span><button class="sm" id="boss-quest-close">Fechar</button></div>
    <div class="panel-body quest-detail-body">
      <div class="quest-detail-desc">${q.description || ""}</div>
      <div class="mb-detail-cols">
        <div>
          <section class="quest-detail-panel"><div class="hunt-best-title">REQUISITOS</div>
            ${reqRow("Level 400+", st.reqLevel)}
            ${reqRow("Eliminar o Doctor Marrow", st.reqMarrow)}
            <div class="tiny dim">A quest é completada apenas 1 vez por conta.</div>
          </section>
          <section class="quest-detail-panel" style="margin-top:8px"><div class="hunt-best-title">MISSÕES</div>
            ${mission(1, "Eliminar 1500 monstros em Podzilla Bottom", st.m1, "acesso ao boss The Rootkraken", ["quara-looter", "rootthing-nutshell", "rootthing-amber-shaper"])}
            ${mission(2, "Derrotar The Rootkraken", st.m2, "outfit Rootwalker (addon 1+2)", ["the-rootkraken"])}
          </section>
        </div>
        <section class="quest-detail-panel"><div class="hunt-best-title">REWARD — Missão 2</div>
          <div class="mb-rewards-grid">${outfitCard}</div>
        </section>
      </div>
      <button class="sm" id="boss-quest-back">Voltar</button>
    </div>`;

  $("#boss-quest-close").onclick = () => {
    ui.modal.classList.remove("show");
    ui.body.classList.remove("quest-detail-shell");
  };
  $("#boss-quest-back").onclick = () => { openQuestsModal(); };

  if (!st.claimed.outfit) {
    const btn = $("#rop-claim-outfit");
    if (btn) btn.onclick = () => {
      if (!unlockOutfit) return;
      riseOfPodzillaGrantOutfit(p);
      riseOfPodzillaClaim(p, "outfit");
      if (typeof addLog === "function") addLog("level", "Outfit <b>Rootwalker</b> (addon 1+2) desbloqueada!");
      if (typeof toast === "function") toast("Outfit Rootwalker desbloqueada!", "level");
      renderRiseOfPodzillaQuestDetail(q, ui);
    };
  }
}

/* ── Registro ── */
(function registerRiseOfPodzillaQuest() {
  if (typeof MISSION_DEFS !== "undefined")
    for (const [id, def] of Object.entries(RISE_OF_PODZILLA_MISSION_DEFS))
      MISSION_DEFS[id] = def;
  if (typeof QUEST_DEFS !== "undefined") {
    QUEST_DEFS[RISE_OF_PODZILLA_QUEST_ID] = {
      id: RISE_OF_PODZILLA_QUEST_ID,
      name: "The Rise of Podzilla",
      level: 400,
      questType: "boss",
      worldQuest: true,
      playable: false,
      icon: "small-treasure-chest",
      bossSprite: "the-rootkraken",
      description: "A quest da gigante planta ambulante Podzilla (update 13.40): elimine as criaturas de Podzilla Bottom e enfrente The Rootkraken para ganhar a outfit Rootwalker com addons.",
      renderDetail: renderRiseOfPodzillaQuestDetail,
      rewardReady: (pp) => {
        const st = riseOfPodzillaState(pp);
        if (!st.requirementsMet) return false;
        return st.m2.done && !st.claimed.outfit;
      },
    };
  }
})();

if (typeof module !== "undefined" && module.exports)
  module.exports = {
    RISE_OF_PODZILLA_MISSION_DEFS, RISE_OF_PODZILLA_OUTFIT,
    RISE_OF_PODZILLA_QUEST_ID, riseOfPodzillaState,
    riseOfPodzillaGrantOutfit, riseOfPodzillaClaim,
  };
