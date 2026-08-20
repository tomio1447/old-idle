/* tutorial.js — tutorial de onboarding guiado para contas novas.
 *
 * Publico-alvo nao conhece as mecanicas do Tibia, entao o fluxo forca:
 *   1) Criar 4 personagens com 4 vocacoes DIFERENTES (das 5 existentes:
 *      knight/paladin/druid/sorcerer/monk) na tela de personagens da conta.
 *   2) Montar uma Party com os 4 personagens (o modal de Party ganha uma
 *      lista dos personagens da conta com um botao "Invite" — ver
 *      party-ui.js/partyOnlineHtml).
 *   3) Ir em HUNTS e entrar na hunt do Rato (Esgoto de Rookgaard, id "rats").
 *   4) Um hint explica o Helper; depois disso o jogador precisa trocar de
 *      personagem PELO MODAL DA PARTY (clique no membro = trocar, ja
 *      existente em party-ui.js) e configurar o Helper de cada um dos 4.
 *   5) Ao concluir os 4, credita 3 dias de VIP na conta (uma vez) e agenda
 *      1500 cargas de cada exercise weapon nos 4 personagens do tutorial
 *      (creditadas na proxima vez que cada um carregar — ver
 *      tutorialGrantExerciseIfDue, chamado em startGame).
 *
 * Estado por conta (account.tutorial), sincronizado como missions/missionsDone
 * (o cliente manda o estado completo — ver accountUpdateTutorial no server).
 * So roda em modo ONLINE (accountApiConfigured); nao existe tutorial local.
 *
 * "Bloquear a tela" = overlay full-screen com 4 mascaras escuras ao redor do
 * elemento-alvo (nao cobre o alvo -> clique passa direto pro elemento real,
 * mesmo dentro de um modal) OU, quando a acao e apenas "abra tal modal", um
 * overlay cobrindo tudo com um balao central com o botao que abre o modal
 * (mais robusto que apontar pra um botao de nav que pode nao estar visivel
 * em toda tela/resolucao).
 */
"use strict";

const TUTORIAL_VOCS = ["knight", "paladin", "druid", "sorcerer", "monk"];
const TUTORIAL_VIP_DAYS = 3;
const TUTORIAL_TICK_MS = 900;

let TUTORIAL_LAST_SYNCED_JSON = "";
let TUTORIAL_CLAIMING = false;

/* ------------------------------------------------------------- estado */
function tutorialDefaultState() {
  return { charIds: [], partyDone: false, huntEntered: false,
    helperDone: {}, helperHintShown: false, rewardGranted: false };
}
function tutorialLoadState() {
  const acc = (typeof sessionAccount === "function") ? sessionAccount() : null;
  const raw = acc && acc.tutorial && typeof acc.tutorial === "object" ? acc.tutorial : {};
  return Object.assign(tutorialDefaultState(), raw, {
    helperDone: Object.assign({}, raw.helperDone || {}),
    charIds: Array.isArray(raw.charIds) ? raw.charIds.map(String) : [],
  });
}
/* Espelha no sessionAccount() (cache local) e sincroniza com o servidor
 * quando o estado realmente mudou (evita POST a cada tick de 900ms). */
function tutorialSaveState(state) {
  try {
    const acc = (typeof sessionAccount === "function") ? sessionAccount() : null;
    if (acc) {
      acc.tutorial = state;
      sessionStorage.setItem("tibia-idle-account", JSON.stringify(acc));
    }
  } catch (e) { /* ignore */ }
  const json = JSON.stringify(state);
  if (json === TUTORIAL_LAST_SYNCED_JSON) return;
  TUTORIAL_LAST_SYNCED_JSON = json;
  const token = (typeof sessionToken === "function") ? sessionToken() : "";
  if (token && typeof accountUpdateTutorial === "function") {
    accountUpdateTutorial(token, state).catch(() => {});
  }
}

/* ------------------------------------------------- personagens/vocacoes */
function tutorialCharacters() {
  return (typeof accountCharacterCacheRead === "function") ? accountCharacterCacheRead() : [];
}
/* { vocacao: primeiroCharIdComEla } considerando so as 5 vocacoes reais. */
function tutorialDistinctVocMap(chars) {
  const map = {};
  for (const c of chars) {
    const voc = c && c.voc;
    if (TUTORIAL_VOCS.indexOf(voc) !== -1 && !(voc in map)) map[voc] = String(c.id);
  }
  return map;
}
function tutorialCharName(id, chars) {
  const c = (chars || tutorialCharacters()).find((x) => String(x.id) === String(id));
  return (c && c.name) || ("personagem #" + id);
}

/* --------------------------------------------------------- overlay DOM */
function tutorialEnsureOverlayDom() {
  if (document.getElementById("tutorial-overlay")) return;
  const wrap = document.createElement("div");
  wrap.id = "tutorial-overlay";
  wrap.innerHTML =
    '<div class="tutorial-mask" data-m="top"></div>' +
    '<div class="tutorial-mask" data-m="bottom"></div>' +
    '<div class="tutorial-mask" data-m="left"></div>' +
    '<div class="tutorial-mask" data-m="right"></div>' +
    '<div class="tutorial-ring"></div>' +
    '<div class="tutorial-hint">' +
      '<div class="tutorial-hint-badge">TUTORIAL</div>' +
      '<div class="tutorial-hint-text"></div>' +
      '<div class="tutorial-hint-actions"></div>' +
    "</div>";
  document.body.appendChild(wrap);
}
function tutorialHideOverlay() {
  const el = document.getElementById("tutorial-overlay");
  if (el) el.remove();
}
/* rect = elemento a "furar" (spotlight) ou null = cobre a tela inteira.
 * html = texto do balao (pode ter <b>). actions = [{label, primary, onClick}]. */
function tutorialRender(rect, html, actions) {
  tutorialEnsureOverlayDom();
  const root = document.getElementById("tutorial-overlay");
  const vw = window.innerWidth, vh = window.innerHeight;
  const top = root.querySelector('[data-m="top"]');
  const bottom = root.querySelector('[data-m="bottom"]');
  const left = root.querySelector('[data-m="left"]');
  const right = root.querySelector('[data-m="right"]');
  const ring = root.querySelector(".tutorial-ring");
  const pad = 6;
  if (rect && rect.width > 0 && rect.height > 0) {
    const x0 = Math.max(0, rect.left - pad), y0 = Math.max(0, rect.top - pad);
    const x1 = Math.min(vw, rect.right + pad), y1 = Math.min(vh, rect.bottom + pad);
    top.style.cssText = `left:0;top:0;width:${vw}px;height:${Math.max(0, y0)}px`;
    bottom.style.cssText = `left:0;top:${y1}px;width:${vw}px;height:${Math.max(0, vh - y1)}px`;
    left.style.cssText = `left:0;top:${y0}px;width:${Math.max(0, x0)}px;height:${Math.max(0, y1 - y0)}px`;
    right.style.cssText = `left:${x1}px;top:${y0}px;width:${Math.max(0, vw - x1)}px;height:${Math.max(0, y1 - y0)}px`;
    ring.style.cssText = `display:block;left:${x0}px;top:${y0}px;width:${x1 - x0}px;height:${y1 - y0}px`;
    const hint = root.querySelector(".tutorial-hint");
    // balao abaixo do alvo; se nao couber, tenta acima; clamp horizontal.
    let hx = Math.min(Math.max(8, x0), vw - 316);
    let hy = y1 + 10;
    hint.style.maxHeight = "";
    if (hy + 140 > vh) hy = Math.max(8, y0 - 150);
    hint.style.cssText += `left:${hx}px;top:${hy}px`;
  } else {
    // sem alvo: cobre tudo, balao centralizado.
    top.style.cssText = `left:0;top:0;width:${vw}px;height:${vh}px`;
    bottom.style.cssText = "left:0;top:0;width:0;height:0";
    left.style.cssText = "left:0;top:0;width:0;height:0";
    right.style.cssText = "left:0;top:0;width:0;height:0";
    ring.style.display = "none";
    const hint = root.querySelector(".tutorial-hint");
    hint.style.cssText = `left:${Math.max(8, vw / 2 - 160)}px;top:${Math.max(8, vh / 2 - 90)}px`;
  }
  root.querySelector(".tutorial-hint-text").innerHTML = html;
  const actBox = root.querySelector(".tutorial-hint-actions");
  actBox.innerHTML = "";
  (actions || []).forEach((a) => {
    const btn = document.createElement("button");
    if (!a.primary) btn.className = "tutorial-secondary";
    btn.textContent = a.label;
    btn.addEventListener("click", a.onClick);
    actBox.appendChild(btn);
  });
}
/* Primeiro elemento visivel (offsetParent existe e tem tamanho) dentre
 * os seletores — util quando ha versao desktop/mobile do mesmo botao. */
function tutorialFirstVisible(selectors) {
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el && el.offsetParent !== null) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) return el;
    }
  }
  return null;
}

/* --------------------------------------------------- tela de vocacoes */
/* Tela de criacao de personagem (conta): so orienta (nao bloqueia) —
 * escurece as vocacoes ja usadas por outro personagem da conta e mostra
 * uma faixa com o progresso "X/4". Roda sempre (independe de fase). */
function tutorialPatchVocationScreen() {
  const grid = document.getElementById("acc-voc-grid");
  const nameInput = document.getElementById("new-char-name") || document.getElementById("acc-char-name");
  if (!grid || !nameInput) return;
  const chars = tutorialCharacters();
  const used = tutorialDistinctVocMap(chars);
  const usedCount = Object.keys(used).length;
  let banner = document.getElementById("tutorial-voc-banner");
  if (usedCount >= 4) { if (banner) banner.remove(); return; }
  grid.querySelectorAll(".voc-card").forEach((card) => {
    card.classList.toggle("tutorial-voc-used", !!used[card.dataset.voc]);
  });
  if (!banner) {
    banner = document.createElement("div");
    banner.id = "tutorial-voc-banner";
    banner.className = "tutorial-voc-banner";
    grid.parentNode.insertBefore(banner, grid);
  }
  banner.innerHTML = `<b>Tutorial (${usedCount}/4):</b> crie personagens com vocações diferentes.
    Escolha uma vocação ainda sem personagem (as usadas aparecem apagadas).`;
}

/* ------------------------------------------------------ fase: party */
function tutorialPartyMemberIds() {
  const st = (typeof G !== "undefined" && G && G.p) ? (G.p._partyOnline || null) : null;
  if (!st) return new Set();
  const ids = new Set([String(st.leader.id)]);
  (st.members || []).forEach((m) => ids.add(String(m.id)));
  return ids;
}
function tutorialCheckParty(state) {
  if (typeof partyOnlineMode !== "function" || !partyOnlineMode()) return false;
  const ids = tutorialPartyMemberIds();
  if (!ids.size) return false;
  return state.charIds.every((id) => ids.has(String(id)));
}
function tutorialRenderPartyStep(state) {
  // dentro do modal de party (ja aberto)?
  const modalOpen = document.getElementById("modal") &&
    document.getElementById("modal").classList.contains("show");
  const partyBox = document.getElementById("party-content");
  if (modalOpen && partyBox) {
    const createBtn = document.getElementById("party-create");
    if (createBtn) {
      tutorialRender(createBtn.getBoundingClientRect(),
        "Crie a party — você vai virar o líder e poderá convidar seus outros personagens.",
        []);
      return;
    }
    const ids = tutorialPartyMemberIds();
    const pendingId = state.charIds.find((id) => !ids.has(String(id)));
    if (pendingId) {
      const name = tutorialCharName(pendingId);
      const rows = Array.from(document.querySelectorAll("[data-invite-account-name]"));
      const row = rows.find((b) => b.dataset.inviteAccountName === name) || rows[0];
      if (row) {
        tutorialRender(row.getBoundingClientRect(),
          `Convide <b>${name}</b> para a party (clique em Invite).`, []);
        return;
      }
      tutorialRender(null, `Convide <b>${name}</b> pelo campo "Adicionar jogador (por nome)".`, []);
      return;
    }
  }
  tutorialRender(null,
    "Vamos montar sua <b>Party</b>! Abra o menu Party e adicione os outros 3 personagens da sua conta.",
    [{ label: "Abrir Party", primary: true, onClick: () => { if (typeof openPartyModal === "function") openPartyModal(); } }]);
}

/* ------------------------------------------------------- fase: hunt */
function tutorialRenderHuntEntryStep() {
  // Modal de escolha de instância (PVP/NON-PVP): destaca NON-PVP.
  const nonPvp = document.querySelector('[data-instance="non-pvp"]');
  if (nonPvp) {
    const click = () => { try { nonPvp.click(); } catch (e) {} };
    tutorialRender(nonPvp.getBoundingClientRect(),
      "Escolha a instância <b>NON-PVP</b> para começar a caçar com segurança.",
      [{ label: "OK", primary: true, onClick: click }]);
    return;
  }
  const goBtn = document.getElementById("huntinfo-go");
  if (goBtn) {
    tutorialRender(goBtn.getBoundingClientRect(),
      "Clique para <b>entrar na hunt</b> e começar a caçar.", []);
    return;
  }
  const ratsCard = document.querySelector('[data-hunt="rats"]');
  if (ratsCard) {
    // A seção do catálogo (accordion) começa colapsada — abre sozinha para
    // o spotlight conseguir medir a posição real do card.
    const section = ratsCard.closest(".hunt-modal-section");
    const group = section && section.querySelector(".hunts-group");
    if (group && group.classList.contains("collapsed")) {
      const head = section.querySelector(".accordion-head");
      if (head) head.click();
      tutorialRender(null, "Abrindo a lista de hunts iniciais...", []);
      return;
    }
    const rect = ratsCard.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      tutorialRender(rect, "Clique na hunt <b>Esgoto de Rookgaard</b> (o Rato) para ver os detalhes.", []);
      return;
    }
  }
  tutorialRender(null,
    "Agora vá em <b>HUNTS</b> e entre na hunt do Rato (Esgoto de Rookgaard).",
    [{ label: "Abrir Hunts", primary: true, onClick: () => { if (typeof openHuntsModal === "function") openHuntsModal(); } }]);
}

/* ----------------------------------------------------- fase: helper */
function tutorialHelperConfigured(p) {
  return !!(p && ((Array.isArray(p.helperPresets) && p.helperPresets.length > 0) || p.helperActivePreset));
}
function tutorialRenderHelperStep(state, pendingId, chars) {
  const inRats = typeof G !== "undefined" && G && G.combat && G.combat.huntId === "rats";
  if (String(G.p.id) !== String(pendingId)) {
    const name = tutorialCharName(pendingId, chars);
    tutorialRender(null,
      `Use a <b>Party</b> para trocar para <b>${name}</b> e configurar o Helper dela(e).`,
      [{ label: "Abrir Party", primary: true, onClick: () => { if (typeof openPartyModal === "function") openPartyModal(); } }]);
    return;
  }
  if (!inRats) {
    tutorialRender(null,
      `Entre na hunt do Rato com <b>${G.p.name}</b> para configurar o Helper.`,
      [{ label: "Abrir Hunts", primary: true, onClick: () => { if (typeof openHuntsModal === "function") openHuntsModal(); } }]);
    return;
  }
  if (tutorialHelperConfigured(G.p)) {
    state.helperDone[String(pendingId)] = true;
    tutorialSaveState(state);
    return;
  }
  const target = tutorialFirstVisible(['[data-collapse="helper"]', '[data-mobile-tab="helper"]']);
  const doneBtn = { label: "Já configurei", primary: true, onClick: () => {
    state.helperDone[String(pendingId)] = true;
    tutorialSaveState(state);
  } };
  if (target) {
    tutorialRender(target.getBoundingClientRect(),
      `Ajuste o <b>Helper</b> (cura, ataque, etc.) de <b>${G.p.name}</b> — ele joga sozinho a partir daqui.`,
      [doneBtn]);
  } else {
    tutorialRender(null,
      `Abra o painel <b>Helper</b> e ajuste a cura/ataque de <b>${G.p.name}</b>.`, [doneBtn]);
  }
}

/* --------------------------------------------------------- recompensa */
function tutorialGrantExerciseIfDue(p) {
  if (!p || p.tutorialExerciseGranted) return;
  const acc = (typeof sessionAccount === "function") ? sessionAccount() : null;
  const t = acc && acc.tutorial;
  if (!t || !t.rewardGranted || !Array.isArray(t.charIds)) return;
  if (t.charIds.map(String).indexOf(String(p.id)) === -1) return;
  if (typeof ensureTraining !== "function" || typeof EXERCISE_WEAPONS === "undefined") return;
  ensureTraining(p);
  for (const id in EXERCISE_WEAPONS) p.exercise[id] = (p.exercise[id] || 0) + 1500;
  p.tutorialExerciseGranted = true;
  if (typeof toast === "function")
    toast("Tutorial concluído: +1500 cargas de cada exercise weapon!", "level");
  if (typeof save === "function") save();
}
function tutorialClaimReward(state) {
  if (TUTORIAL_CLAIMING || state.rewardGranted) return;
  const token = (typeof sessionToken === "function") ? sessionToken() : "";
  if (!token || typeof accountClaimTutorialReward !== "function") return;
  TUTORIAL_CLAIMING = true;
  accountClaimTutorialReward(token).then((r) => {
    if (r && r.ok) {
      state.rewardGranted = true;
      tutorialSaveState(state);
      if (typeof toast === "function")
        toast(`Tutorial concluído! +${TUTORIAL_VIP_DAYS} dias de VIP na conta.`, "level");
      if (typeof G !== "undefined" && G && G.p) tutorialGrantExerciseIfDue(G.p);
      tutorialHideOverlay();
    }
  }).finally(() => { TUTORIAL_CLAIMING = false; });
}

/* --------------------------------------------------------------- tick */
function tutorialTick() {
  const online = typeof accountApiConfigured === "function" && accountApiConfigured() &&
    typeof sessionToken === "function" && sessionToken();
  if (!online) { tutorialHideOverlay(); return; }
  // Tela de login/boot ainda visível: nada de overlay.
  const loginVisible = document.getElementById("login") && document.getElementById("login").style.display !== "none";
  const loadingVisible = document.getElementById("game-loading") &&
    getComputedStyle(document.getElementById("game-loading")).display !== "none";
  tutorialPatchVocationScreen();
  if (loginVisible || loadingVisible) { tutorialHideOverlay(); return; }
  if (typeof G === "undefined" || !G || !G.p) { tutorialHideOverlay(); return; }

  const state = tutorialLoadState();
  if (state.rewardGranted) { tutorialHideOverlay(); tutorialGrantExerciseIfDue(G.p); return; }

  const chars = tutorialCharacters();
  const vocMap = tutorialDistinctVocMap(chars);
  const distinctCount = Object.keys(vocMap).length;
  if (distinctCount < 4) {
    // Criador de personagem aberto: nao bloqueia — so o banner informativo
    // (tutorialPatchVocationScreen) ja guia. Deixa o jogador preencher.
    const creatorOpen = document.getElementById("acc-char-name") || document.getElementById("new-char-name");
    if (creatorOpen) { tutorialHideOverlay(); return; }
    // Picker de personagens aberto: destaca o botao real "Criar personagem"
    // e oferece um botao "OK" no balao que tambem aciona a criacao.
    const createBtn = document.getElementById("acc-open-create-char");
    if (createBtn) {
      const clickCreate = () => { try { createBtn.click(); } catch (e) {} };
      tutorialRender(createBtn.getBoundingClientRect(),
        `Crie personagens com vocações diferentes (<b>${distinctCount}/4</b>). Clique em <b>Criar personagem</b> (ou OK) para adicionar o próximo.`,
        [{ label: "OK", primary: true, onClick: clickCreate }]);
      return;
    }
    // Nenhuma tela aberta: balao central com botao que abre o picker.
    tutorialRender(null,
      `Crie personagens com vocações diferentes (<b>${distinctCount}/4</b>) para continuar o tutorial.`,
      [{ label: "Criar personagem", primary: true,
        onClick: () => { if (typeof window.openAccountCharacterPicker === "function") window.openAccountCharacterPicker(); } }]);
    return;
  }
  if (state.charIds.length < 4) {
    state.charIds = Object.values(vocMap).slice(0, 4).map(String);
    tutorialSaveState(state);
  }

  if (!tutorialCheckParty(state)) { tutorialRenderPartyStep(state); return; }
  if (!state.partyDone) { state.partyDone = true; tutorialSaveState(state); }

  const inRats = !!(G.combat && G.combat.huntId === "rats");
  if (!state.huntEntered && !inRats) { tutorialRenderHuntEntryStep(); return; }
  if (!state.huntEntered && inRats) {
    state.huntEntered = true;
    tutorialSaveState(state);
  }

  const pendingId = state.charIds.find((id) => !state.helperDone[id]);
  if (pendingId) { tutorialRenderHelperStep(state, pendingId, chars); return; }

  tutorialHideOverlay();
  tutorialClaimReward(state);
}

if (typeof window !== "undefined") {
  window.addEventListener("resize", () => { try { tutorialTick(); } catch (e) {} });
  setInterval(() => { try { tutorialTick(); } catch (e) {} }, TUTORIAL_TICK_MS);
}
