/*
 * make-believe-quest.js — Make Believe Quest (update 15.30, level 800+).
 *
 * Requisitos da quest: eliminar o Doctor Marrow e ser level 800+.
 *
 * Cadeia de missões (1x por conta — os estados usam os mapas de missão que
 * já são fundidos no nível da conta):
 *   M1 — Eliminar 2500 criaturas em Moonstone Castle
 *        → libera os bosses Mimar Haffar e Maior Domus
 *        (requirement.mission + killsRequired doctor-marrow, enforced).
 *   M2 — Eliminar Mimar Haffar e Maior Domus
 *        → libera a hunt Radiant Skyhold (hu.requirement.killsRequired).
 *   M3 — Eliminar 5000 monstros em Radiant Skyhold
 *        → libera o World Boss Phosphorus (wz.requiresMission no servidor).
 *   M4 — Derrotar o World Boss Phosphorus
 *
 * Rewards: 1 por missão concluída, 1 botão por reward, 1x por conta:
 *   M1 → outfit Illuminated Warrior (addon 1+2)
 *   M2 → 1 elmo Moonsilver aleatório (roleta)
 *   M3 → montaria Radiant Nimbus
 *   M4 → 1 arma Moonsilver aleatória (roleta)
 * Os itens aleatórios usam uma "roleta": a caixa cicla os ícones como um
 * gif; no claim a roleta gira e para no item sorteado.
 *
 * Persistência por conta: claims ficam em p.missionsDone["make-believe:*"]
 * (mergeFlagMap preserva o valor — strings guardam o item sorteado) e
 * sincronizam para acc.missionsDone via syncMissionsToAccount.
 */
"use strict";

const MAKE_BELIEVE_QUEST_ID = "make-believe-quest";

const MAKE_BELIEVE_WEAPONS = [
  "moonsilver-axe", "moonsilver-bow", "moonsilver-channeler",
  "moonsilver-chopper", "moonsilver-claymore", "moonsilver-crusher",
  "moonsilver-crossbow", "moonsilver-epee", "moonsilver-katar",
  "moonsilver-mace", "moonsilver-sceptre",
];

const MAKE_BELIEVE_HELMETS = [
  "moonsilver-battle-visor", "moonsilver-nimbus-hat",
  "moonsilver-spirit-mask", "moonsilver-strike-helm",
  "moonsilver-trail-hood",
];

const MAKE_BELIEVE_OUTFIT = { base: "illuminated-warrior", addons: 3 };
const MAKE_BELIEVE_MOUNT = "radiant-nimbus";

/* Missões de contagem — counter "kills" soma qualquer criatura da hunt
 * (handleMissionKill já incrementa; o servidor espelha em progress.kills). */
const MAKE_BELIEVE_MISSION_DEFS = {
  "moonstone-castle": {
    title: "Missão: Make Believe — Moonstone Castle",
    tasks: [{
      counter: "kills", target: 2500,
      label: "Eliminar 2500 criaturas em Moonstone Castle",
    }],
    completeReward: { bossAccess: "mimar-haffar", bossName: "Mimar Haffar e Maior Domus" },
  },
  "radiant-skyhold": {
    title: "Missão: Make Believe — Radiant Skyhold",
    tasks: [{
      counter: "kills", target: 5000,
      label: "Eliminar 5000 monstros em Radiant Skyhold",
    }],
    completeReward: { bossAccess: "phosphorus", bossName: "Phosphorus (World Boss)" },
  },
};

/* ── Estado derivado da quest (lê os fatos já registrados pelo jogo) ── */
function makeBelieveMissionKills(p, huntId) {
  const st = p && p.missions && p.missions[huntId];
  const prog = (st && st.progress) || {};
  // counter "kills" direto; fallback: soma por slug (autoridade antiga).
  if (Number(prog.kills) > 0) return Number(prog.kills) || 0;
  let sum = 0;
  for (const v of Object.values(prog)) sum += Number(v) || 0;
  return sum;
}

function makeBelieveState(p) {
  const bosses = (p && p.bosses) || {};
  const killed = (slug) => Number(bosses[slug] && bosses[slug].kills) > 0;
  const m1k = makeBelieveMissionKills(p, "moonstone-castle");
  const m3k = makeBelieveMissionKills(p, "radiant-skyhold");
  const m1 = m1k >= 2500 || !!(p && p.missionsDone && p.missionsDone["moonstone-castle"]);
  const m2 = killed("mimar-haffar") && killed("maior-domus");
  const m3 = m3k >= 5000 || !!(p && p.missionsDone && p.missionsDone["radiant-skyhold"]);
  const m4 = killed("phosphorus");
  const done = (p && p.missionsDone) || {};
  return {
    reqLevel: (p && Number(p.level)) >= 800,
    reqMarrow: killed("doctor-marrow"),
    requirementsMet: ((p && Number(p.level)) >= 800) && killed("doctor-marrow"),
    m1: { done: m1, kills: Math.min(m1k, 2500), target: 2500 },
    m2: { done: m2, kills: (killed("mimar-haffar") ? 1 : 0) + (killed("maior-domus") ? 1 : 0), target: 2 },
    m3: { done: m3, kills: Math.min(m3k, 5000), target: 5000 },
    m4: { done: m4, kills: m4 ? 1 : 0, target: 1 },
    claimed: {
      outfit: !!done["make-believe:outfit"],
      mount: !!done["make-believe:mount"],
      weapon: done["make-believe:weapon"] || null,
      helmet: done["make-believe:helmet"] || null,
    },
    complete: m4,
  };
}

/* Concede o claim no mapa de missões (sincronizado para a conta). */
function makeBelieveClaim(p, key, value) {
  p.missionsDone = p.missionsDone || {};
  p.missionsDone["make-believe:" + key] = value === undefined ? true : value;
  if (typeof syncMissionsToAccount === "function") syncMissionsToAccount(p);
}

function makeBelieveGrantOutfit(p) {
  if (typeof ensureWardrobe === "function") ensureWardrobe(p);
  p.wardrobe = p.wardrobe || {};
  p.wardrobe.outfits = p.wardrobe.outfits || {};
  // 2 = addon 1 + addon 2 (ownedAddonMask: count>=2 → mask 3).
  p.wardrobe.outfits["illuminated-warrior-m"] = 2;
  p.wardrobe.outfits["illuminated-warrior-f"] = 2;
  try {
    const acc = (typeof sessionAccount === "function") ? sessionAccount() : null;
    if (acc) {
      acc.cosmetics = acc.cosmetics || {};
      acc.cosmetics.outfits = acc.cosmetics.outfits || {};
      acc.cosmetics.outfits["illuminated-warrior"] = 2;
      sessionStorage.setItem("tibia-idle-account", JSON.stringify(acc));
    }
  } catch (e) { /* offline */ }
}

/* ── UI: detail renderer + roleta ── */

let MB_ROULETTE_TIMERS = [];

function mbStopRoulettes() {
  MB_ROULETTE_TIMERS.forEach((t) => clearInterval(t));
  MB_ROULETTE_TIMERS = [];
}

function mbItemIcon(slug, size) {
  if (typeof questRewardImg === "function") return questRewardImg(slug, size);
  return `<img src="assets/item/${slug}.png" width="${size}" height="${size}" alt="">`;
}

/* Caixa de roleta: cicla todos os itens como um gif; no RESGATAR desacelera
 * e para no item sorteado (sorteio persistido ANTES da animação). */
function mbRouletteBoxHtml(boxId, label, items) {
  return `<section class="quest-detail-panel mb-reward-box" id="${boxId}">
    <div class="hunt-best-title">${label}</div>
    <div class="mb-roulette-frame"><span class="mb-roulette-icon" id="${boxId}-icon">${mbItemIcon(items[0], 52)}</span></div>
    <div class="mb-roulette-name tiny" id="${boxId}-name">???</div>
    <button type="button" class="sm primary quest-action" id="${boxId}-btn">RESGATAR</button>
  </section>`;
}

function mbStartPreview(boxId, items) {
  const icon = $(`#${boxId}-icon`);
  if (!icon) return null;
  let i = 0;
  /* Gif da roleta: troca o item a cada 2s (pedido). */
  const timer = setInterval(() => {
    i = (i + 1) % items.length;
    icon.innerHTML = mbItemIcon(items[i], 52);
  }, 2000);
  MB_ROULETTE_TIMERS.push(timer);
  return timer;
}

/* Roleta: desacelera e para no slug sorteado. */
function mbSpinTo(boxId, items, slug, onDone) {
  const icon = $(`#${boxId}-icon`);
  if (!icon) { if (onDone) onDone(); return; }
  const winIdx = Math.max(0, items.indexOf(slug));
  let i = Math.floor(Math.random() * items.length), delay = 70, ticks = 0;
  const step = () => {
    i = (i + 1) % items.length;
    icon.innerHTML = mbItemIcon(items[i], 52);
    ticks++;
    if (delay >= 260 && i === winIdx) {
      const nameEl = $(`#${boxId}-name`);
      if (nameEl) nameEl.textContent = (slug || "").replace(/-/g, " ");
      icon.closest(".mb-reward-box")?.classList.add("mb-roulette-win");
      if (onDone) onDone();
      return;
    }
    delay = Math.min(280, delay + 14 + ticks);
    MB_ROULETTE_TIMERS.push(setTimeout(step, delay));
  };
  MB_ROULETTE_TIMERS.push(setTimeout(step, delay));
}

function renderMakeBelieveQuestDetail(q, ui) {
  mbStopRoulettes();
  const p = G.p;
  // Claims são por conta — puxa o merge antes de ler (outro char pode
  // ter resgatado uma recompensa desta quest).
  if (typeof pullAccountMissions === "function") pullAccountMissions(p);
  let st = makeBelieveState(p);
  /* Recompensas determinísticas resgatam sozinhas ao concluir a missão —
   * o jogador não precisa clicar em RESGATAR para outfit/montaria. */
  if (st.m1.done && !st.claimed.outfit) {
    makeBelieveGrantOutfit(p);
    makeBelieveClaim(p, "outfit");
    if (typeof addLog === "function") addLog("level", "Outfit <b>Illuminated Warrior</b> (addon 1+2) desbloqueada!");
    if (typeof toast === "function") toast("Outfit Illuminated Warrior desbloqueada!", "level");
  }
  if (st.m3.done && !st.claimed.mount && typeof grantMissionReward === "function") {
    grantMissionReward(p, { accountMount: MAKE_BELIEVE_MOUNT });
    makeBelieveClaim(p, "mount");
    if (typeof addLog === "function") addLog("level", "Montaria <b>Radiant Nimbus</b> desbloqueada para a conta!");
    if (typeof toast === "function") toast("Montaria Radiant Nimbus desbloqueada!", "level");
  }
  st = makeBelieveState(p);
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

  /* 1 reward por missão: M1 outfit, M2 elmo, M3 montaria, M4 arma. */
  const unlockOutfit = st.m1.done, unlockHelmet = st.m2.done,
    unlockMount = st.m3.done, unlockWeapon = st.m4.done;
  const lockHint = (n, unlocked) => unlocked ? "" :
    `<div class="mb-reward-state dim">🔒 concluir a Missão ${n}</div>`;
  const outfitCard = claimedCard("OUTFIT — Missão 1", cardState(st.claimed.outfit, unlockOutfit), st.claimed.outfit
    ? `<div class="mb-outfit-granted">${typeof questOutfitPreviewHtml === "function" ? questOutfitPreviewHtml(MAKE_BELIEVE_OUTFIT, 56) : ""}<span class="tiny" style="color:#9ce84a">✓ Resgatada — Illuminated Warrior (addon 1+2)</span></div>`
    : `<div class="mb-outfit-granted">${typeof questOutfitPreviewHtml === "function" ? questOutfitPreviewHtml(MAKE_BELIEVE_OUTFIT, 56) : ""}</div>
       <button type="button" class="sm primary quest-action" id="mb-claim-outfit" ${unlockOutfit ? "" : "disabled"}>RESGATAR</button>${lockHint(1, unlockOutfit)}`);
  const helmetCard = st.claimed.helmet
    ? claimedCard("ELMO MOONSILVER — Missão 2", "claimed", `<div class="mb-roulette-frame mb-roulette-win">${mbItemIcon(st.claimed.helmet, 52)}</div><div class="tiny" style="color:#9ce84a">✓ ${st.claimed.helmet.replace(/-/g, " ")}</div>`)
    : claimedCard("ELMO MOONSILVER (aleatório) — Missão 2", cardState(false, unlockHelmet),
        `<div class="mb-roulette-frame"><span class="mb-roulette-icon" id="mb-helmet-icon">${mbItemIcon(MAKE_BELIEVE_HELMETS[0], 44)}</span></div>
         <div class="mb-roulette-name tiny" id="mb-helmet-name">???</div>
         <button type="button" class="sm primary quest-action" id="mb-helmet-btn" ${unlockHelmet ? "" : "disabled"}>RESGATAR</button>${lockHint(2, unlockHelmet)}`);
  const mountCard = claimedCard("MONTARIA — Missão 3", cardState(st.claimed.mount, unlockMount), st.claimed.mount
    ? `<div class="mb-outfit-granted">${typeof questMountFrameHtml === "function" ? questMountFrameHtml(MAKE_BELIEVE_MOUNT, 56) : ""}<span class="tiny" style="color:#9ce84a">✓ Resgatada — Radiant Nimbus (toda a conta)</span></div>`
    : `<div class="mb-outfit-granted">${typeof questMountFrameHtml === "function" ? questMountFrameHtml(MAKE_BELIEVE_MOUNT, 56) : ""}</div>
       <button type="button" class="sm primary quest-action" id="mb-claim-mount" ${unlockMount ? "" : "disabled"}>RESGATAR</button>${lockHint(3, unlockMount)}`);
  const weaponCard = st.claimed.weapon
    ? claimedCard("ARMA MOONSILVER — Missão 4", "claimed", `<div class="mb-roulette-frame mb-roulette-win">${mbItemIcon(st.claimed.weapon, 52)}</div><div class="tiny" style="color:#9ce84a">✓ ${st.claimed.weapon.replace(/-/g, " ")}</div>`)
    : claimedCard("ARMA MOONSILVER (aleatória) — Missão 4", cardState(false, unlockWeapon),
        `<div class="mb-roulette-frame"><span class="mb-roulette-icon" id="mb-weapon-icon">${mbItemIcon(MAKE_BELIEVE_WEAPONS[0], 44)}</span></div>
         <div class="mb-roulette-name tiny" id="mb-weapon-name">???</div>
         <button type="button" class="sm primary quest-action" id="mb-weapon-btn" ${unlockWeapon ? "" : "disabled"}>RESGATAR</button>${lockHint(4, unlockWeapon)}`);

  ui.body.innerHTML = `<div class="panel-title">${q.name} — Level ${q.level}+<span class="spacer"></span><button class="sm" id="boss-quest-close">Fechar</button></div>
    <div class="panel-body quest-detail-body">
      <div class="quest-detail-desc">${q.description || ""}</div>
      <div class="mb-detail-cols">
        <div>
          <section class="quest-detail-panel"><div class="hunt-best-title">REQUISITOS</div>
            ${reqRow("Level 800+", st.reqLevel)}
            ${reqRow("Eliminar o Doctor Marrow", st.reqMarrow)}
            <div class="tiny dim">A quest é completada apenas 1 vez por conta.</div>
          </section>
          <section class="quest-detail-panel" style="margin-top:8px"><div class="hunt-best-title">MISSÕES</div>
            ${mission(1, "Eliminar criaturas em Moonstone Castle", st.m1, "acesso aos bosses Mimar Haffar e Maior Domus", ["moonsilver-custodian", "moonstone-miner"])}
            ${mission(2, "Eliminar Mimar Haffar e Maior Domus", st.m2, "acesso à hunt Radiant Skyhold", ["mimar-haffar", "maior-domus"])}
            ${mission(3, "Eliminar monstros em Radiant Skyhold", st.m3, "acesso ao World Boss Phosphorus", ["radiant-acolyte", "radiant-paragon", "radiant-warden"])}
            ${mission(4, "Derrotar o World Boss Phosphorus", st.m4, "conclusão da quest", ["phosphorus"])}
          </section>
        </div>
        <section class="quest-detail-panel"><div class="hunt-best-title">REWARDS — 1 por missão concluída</div>
          <div class="mb-rewards-grid">${outfitCard}${helmetCard}${mountCard}${weaponCard}</div>
        </section>
      </div>
      <button class="sm" id="boss-quest-back">Voltar</button>
    </div>`;

  $("#boss-quest-close").onclick = () => {
    mbStopRoulettes();
    ui.modal.classList.remove("show");
    ui.body.classList.remove("quest-detail-shell");
  };
  $("#boss-quest-back").onclick = () => { mbStopRoulettes(); openQuestsModal(); };

  if (!st.claimed.outfit) {
    const btn = $("#mb-claim-outfit");
    if (btn) btn.onclick = () => {
      if (!unlockOutfit) return;
      makeBelieveGrantOutfit(p);
      makeBelieveClaim(p, "outfit");
      if (typeof addLog === "function") addLog("level", "Outfit <b>Illuminated Warrior</b> (addon 1+2) desbloqueada!");
      if (typeof toast === "function") toast("Outfit Illuminated Warrior desbloqueada!", "level");
      renderMakeBelieveQuestDetail(q, ui);
    };
  }
  if (!st.claimed.mount) {
    const btn = $("#mb-claim-mount");
    if (btn) btn.onclick = () => {
      if (!unlockMount || typeof grantMissionReward !== "function") return;
      grantMissionReward(p, { accountMount: MAKE_BELIEVE_MOUNT });
      makeBelieveClaim(p, "mount");
      if (typeof addLog === "function") addLog("level", "Montaria <b>Radiant Nimbus</b> desbloqueada para a conta!");
      if (typeof toast === "function") toast("Montaria Radiant Nimbus desbloqueada!", "level");
      renderMakeBelieveQuestDetail(q, ui);
    };
  }
  const bindRoulette = (boxId, items, key, unlocked) => {
    if (st.claimed[key]) return;
    mbStartPreview(boxId, items);
    const btn = $(`#${boxId}-btn`);
    if (btn) {
      if (!unlocked) btn.disabled = true;
      btn.onclick = () => {
        if (!unlocked || btn.disabled) return;
        btn.disabled = true;
        mbStopRoulettes();
        const slug = items[Math.floor(Math.random() * items.length)];
        makeBelieveClaim(p, key, slug);
        if (typeof addLootPouch === "function") addLootPouch(p, slug, 1);
        mbSpinTo(boxId, items, slug, () => {
          const name = slug.replace(/-/g, " ");
          if (typeof addLog === "function") addLog("level", `Make Believe: a roleta parou em <b>${name}</b>!`);
          if (typeof toast === "function") toast(`Recompensa: <b>${name}</b>`, "level");
        });
      };
    }
  };
  bindRoulette("mb-weapon", MAKE_BELIEVE_WEAPONS, "weapon", unlockWeapon);
  bindRoulette("mb-helmet", MAKE_BELIEVE_HELMETS, "helmet", unlockHelmet);
}

/* ── Registro ── */
(function registerMakeBelieveQuest() {
  if (typeof MISSION_DEFS !== "undefined")
    for (const [id, def] of Object.entries(MAKE_BELIEVE_MISSION_DEFS))
      MISSION_DEFS[id] = def;
  if (typeof QUEST_DEFS !== "undefined") {
    QUEST_DEFS[MAKE_BELIEVE_QUEST_ID] = {
      id: MAKE_BELIEVE_QUEST_ID,
      name: "Make Believe Quest",
      level: 800,
      questType: "boss",
      worldQuest: true,
      playable: false,
      icon: "small-treasure-chest",
      bossSprite: "phosphorus",
      description: "A grande quest do update Make Believe: explore Moonstone Castle, derrote os guardiões Mimar Haffar e Maior Domus, conquiste Radiant Skyhold e encare o World Boss Phosphorus para ganhar a outfit Illuminated Warrior, a montaria Radiant Nimbus e itens Moonsilver.",
      renderDetail: renderMakeBelieveQuestDetail,
      rewardReady: (pp) => {
        const st = makeBelieveState(pp);
        if (!st.requirementsMet) return false;
        return (st.m1.done && !st.claimed.outfit) ||
          (st.m2.done && !st.claimed.helmet) ||
          (st.m3.done && !st.claimed.mount) ||
          (st.m4.done && !st.claimed.weapon);
      },
    };
  }
  // Gate da hunt Radiant Skyhold — Missão 2 (kills de Mimar + Maior Domus).
  if (typeof GAMEDATA !== "undefined" && GAMEDATA.hunts && GAMEDATA.hunts["radiant-skyhold"]) {
    GAMEDATA.hunts["radiant-skyhold"].requirement = {
      killsRequired: ["mimar-haffar", "maior-domus"],
      text: "Make Believe Quest — Missão 2: derrotar Mimar Haffar e Maior Domus",
    };
  }
})();

if (typeof module !== "undefined" && module.exports)
  module.exports = {
    MAKE_BELIEVE_WEAPONS, MAKE_BELIEVE_HELMETS,
    MAKE_BELIEVE_MISSION_DEFS, MAKE_BELIEVE_OUTFIT, MAKE_BELIEVE_MOUNT,
    MAKE_BELIEVE_QUEST_ID, makeBelieveState,
  };
