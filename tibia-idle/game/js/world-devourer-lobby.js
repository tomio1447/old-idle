/*
 * megalomania-lobby.js — lobby modal (esquerda), convites "!", select char
 * no templo e start 1–5 jogadores (1 char cada) para Goshnar's Megalomania.
 */
"use strict";

// Usa MEGA_TEST_BYPASS de game.js (não redeclarar const — quebra o parse deste script).
function megaTestBypass() {
  return typeof MEGA_TEST_BYPASS !== "undefined" && !!MEGA_TEST_BYPASS;
}

const MEGA_LOBBY_UI = {
  lobby: null,
  inbox: [],
  poll: null,
  panel: null,
  inviteBtn: null,
  acceptModal: null,
  pendingInvite: null,
  unsupported: false,
  authBackoffUntil: 0, // 401 recente: segura o poll por 30s (evita spam no console)
};

function megaLobbyInTemple() {
  return !!(typeof G !== "undefined" && G && G.inCity && !G.combat && !G.training);
}

function megaLobbyVocShort(voc) {
  const v = String(voc || "").toLowerCase();
  if (v.includes("knight") || v === "ek" || v === "rk") return "EK";
  if (v.includes("paladin") || v === "rp" || v === "ep") return "RP";
  if (v.includes("sorcerer") || v === "ms" || v === "es") return "MS";
  if (v.includes("druid") || v === "ed" || v === "dr") return "ED";
  if (v.includes("monk") || v === "em" || v === "ex") return "EM";
  return "?";
}

async function megaLobbyApi(method, path, body) {
  const headers = { "Content-Type": "application/json" };
  const token = typeof sessionToken === "function" ? sessionToken() : "";
  if (token) headers.Authorization = "Bearer " + token;
  const opts = { method, headers, cache: "no-store" };
  if (body) opts.body = JSON.stringify(Object.assign({ token }, body));
  const base = typeof accountApiUrl === "function" ? accountApiUrl() : window.location.origin;
  const r = await fetch(base + path, opts);
  let data = {};
  try { data = await r.json(); } catch (e) { data = {}; }
  return { status: r.status, data: data || {} };
}

function megaLobbyEnsureDom() {
  if (MEGA_LOBBY_UI.panel) return;
  const panel = document.createElement("div");
  panel.id = "mega-lobby-panel";
  panel.className = "mega-lobby-panel";
  panel.style.display = "none";
  document.body.appendChild(panel);
  MEGA_LOBBY_UI.panel = panel;

  const inviteBtn = document.createElement("button");
  inviteBtn.type = "button";
  inviteBtn.id = "mega-lobby-invite-btn";
  inviteBtn.className = "mega-lobby-invite-btn";
  inviteBtn.style.display = "none";
  inviteBtn.innerHTML = "!";
  inviteBtn.title = "Convite Megalomania";
  inviteBtn.addEventListener("click", () => megaLobbyOpenInbox());
  document.body.appendChild(inviteBtn);
  MEGA_LOBBY_UI.inviteBtn = inviteBtn;
}

function megaLobbyRenderInviteBadge() {
  megaLobbyEnsureDom();
  const n = (MEGA_LOBBY_UI.inbox || []).length;
  const btn = MEGA_LOBBY_UI.inviteBtn;
  if (!btn) return;
  // Badge só como atalho se o jogador fechou o modal sem responder.
  if (n > 0 && !MEGA_LOBBY_UI.inviteModalOpen) {
    btn.style.display = "block";
    btn.innerHTML = "!" + (n > 1 ? `<span class="mega-lobby-invite-count">${n}</span>` : "");
  } else btn.style.display = "none";
}

/* Abre modal CENTRAL com Aceitar/Recusar (não o "!" na borda da tela). */
function megaLobbyOpenInbox(opts) {
  opts = opts || {};
  const inbox = MEGA_LOBBY_UI.inbox || [];
  if (!inbox.length) return;
  const modal = $("#modal"), body = $("#modal-body");
  if (!modal || !body) return;
  // Não sobrescreve outro modal crítico se o jogador já estiver no meio de algo,
  // salvo force (SSE de convite novo).
  if (modal.classList.contains("show") && !opts.force && !MEGA_LOBBY_UI.inviteModalOpen) {
    megaLobbyRenderInviteBadge();
    return;
  }
  MEGA_LOBBY_UI.inviteModalOpen = true;
  if (MEGA_LOBBY_UI.inviteBtn) MEGA_LOBBY_UI.inviteBtn.style.display = "none";

  const rows = inbox.map((inv) => `
    <div class="mega-invite-card">
      <div class="mega-invite-card-title">Convite Megalomania</div>
      <div class="mega-invite-card-body">
        <b>${inv.fromName || "Jogador"}</b> convidou você para o lobby.
        ${inv.toHintName ? `<div class="tiny dim mt4">Personagem sugerido: ${inv.toHintName}</div>` : ""}
        <div class="tiny dim mt4">É preciso estar no templo e fora de Party para aceitar.</div>
      </div>
      <div class="mega-invite-card-actions">
        <button type="button" class="sm primary" data-mega-accept="${inv.id}">Aceitar</button>
        <button type="button" class="sm" data-mega-decline="${inv.id}">Recusar</button>
      </div>
    </div>`).join("");

  body.innerHTML = `<div class="panel-title">MEGALOMANIA
      <span style="flex:1"></span>
      <button type="button" class="sm" id="mega-inbox-close" title="Fechar">✕</button>
    </div>
    <div class="panel-body mega-invite-modal-body">
      ${rows}
    </div>`;
  modal.classList.add("show");
  modal.classList.remove("wide", "modal-otc");

  const closeInviteModal = () => {
    MEGA_LOBBY_UI.inviteModalOpen = false;
    modal.classList.remove("show");
    megaLobbyRenderInviteBadge();
  };
  const closeBtn = $("#mega-inbox-close");
  if (closeBtn) closeBtn.onclick = () => closeInviteModal();

  body.querySelectorAll("[data-mega-accept]").forEach((btn) => {
    btn.onclick = async () => {
      MEGA_LOBBY_UI.inviteModalOpen = false;
      modal.classList.remove("show");
      await megaLobbyAccept(btn.getAttribute("data-mega-accept"));
      megaLobbyRenderInviteBadge();
    };
  });
  body.querySelectorAll("[data-mega-decline]").forEach((btn) => {
    btn.onclick = async () => {
      await megaLobbyApi("POST", "/api/mega-lobby/decline", {
        invite_id: btn.getAttribute("data-mega-decline"),
      });
      MEGA_LOBBY_UI.inbox = (MEGA_LOBBY_UI.inbox || [])
        .filter((i) => String(i.id) !== String(btn.getAttribute("data-mega-decline")));
      if ((MEGA_LOBBY_UI.inbox || []).length) megaLobbyOpenInbox({ force: true });
      else closeInviteModal();
      if (typeof toast === "function") toast("Convite recusado.");
    };
  });
}

function megaLobbyNotifyInvites(prevIds) {
  const inbox = MEGA_LOBBY_UI.inbox || [];
  if (!inbox.length) {
    megaLobbyRenderInviteBadge();
    return;
  }
  const prev = prevIds || MEGA_LOBBY_UI._seenInviteIds || new Set();
  const hasNew = inbox.some((inv) => !prev.has(String(inv.id)));
  MEGA_LOBBY_UI._seenInviteIds = new Set(inbox.map((i) => String(i.id)));
  if (hasNew || !MEGA_LOBBY_UI.inviteModalOpen) {
    megaLobbyOpenInbox({ force: !!hasNew });
  } else megaLobbyRenderInviteBadge();
}

function megaLobbySlotHtml(slot, index, isLeaderView) {
  if (!slot) {
    return `<div class="mega-lobby-slot empty"><span class="mega-lobby-slot-n">#${index + 1}</span>
      <span class="dim">Vaga livre</span></div>`;
  }
  const you = typeof sessionCharId === "function" && Number(slot.charId) === Number(sessionCharId());
  return `<div class="mega-lobby-slot ${index === 0 ? "leader" : ""} ${you ? "you" : ""}">
    <span class="mega-lobby-slot-n">${index === 0 ? "LÍDER" : "#" + (index + 1)}</span>
    <div class="mega-lobby-slot-body">
      <b>${slot.charName}</b>
      <span class="dim">${megaLobbyVocShort(slot.voc)} · lvl ${slot.level}</span>
      <span class="tiny dim">${slot.playerName || ""}</span>
    </div>
  </div>`;
}

function megaLobbyRenderPanel() {
  megaLobbyEnsureDom();
  const panel = MEGA_LOBBY_UI.panel;
  const lobby = MEGA_LOBBY_UI.lobby;
  if (!lobby || lobby.status === "closed") {
    panel.style.display = "none";
    panel.innerHTML = "";
    return;
  }
  panel.style.display = "block";
  const slots = lobby.slots || [];
  const leader = lobby.youAreLeader;
  let html = `<div class="mega-lobby-head">
    <b>MEGALOMANIA LOBBY</b>
    <button type="button" class="sm" id="mega-lobby-close-x">✕</button>
  </div>
  <div class="mega-lobby-sub">Líder: <b>${lobby.leaderName || "?"}</b> · ${lobby.filled || 0}/${lobby.max || 5}</div>
  <div class="mega-lobby-slots">`;
  for (let i = 0; i < (lobby.max || 5); i++) html += megaLobbySlotHtml(slots[i] || null, i, leader);
  html += `</div>`;
  if (leader && lobby.status === "open") {
    html += `<div class="mega-lobby-invite-row">
      <input id="mega-lobby-invite-name" type="text" maxlength="30" placeholder="Nome do personagem">
      <button type="button" class="sm primary" id="mega-lobby-invite-send">Convidar</button>
    </div>
    <button type="button" class="danger full mt8" id="mega-lobby-start">INICIAR LUTA (1–5)</button>`;
  }
  if (lobby.status === "open") {
    html += `<button type="button" class="sm full mt8" id="mega-lobby-leave">Sair do lobby</button>`;
  } else if (lobby.status === "starting" || lobby.status === "fighting") {
    html += `<div class="tiny dim mt8 center">Luta em andamento…</div>`;
  }
  panel.innerHTML = html;
  const closeX = document.getElementById("mega-lobby-close-x");
  if (closeX) closeX.onclick = () => { /* só esconde visualmente se fighting; senão leave */ 
    if (lobby.status === "open") megaLobbyLeave();
    else panel.style.display = "none";
  };
  const leave = document.getElementById("mega-lobby-leave");
  if (leave) leave.onclick = () => megaLobbyLeave();
  const send = document.getElementById("mega-lobby-invite-send");
  if (send) send.onclick = () => {
    const name = (document.getElementById("mega-lobby-invite-name") || {}).value || "";
    megaLobbyInvite(name.trim());
  };
  const start = document.getElementById("mega-lobby-start");
  if (start) start.onclick = () => megaLobbyStartFight();
}

async function megaLobbyRefresh() {
  if (MEGA_LOBBY_UI.unsupported) return;
  // Sessão ausente: não chama o servidor — sem isso cada tick do poll (4s)
  // virava um 401 "Failed to load resource" no console (caso clássico da VM
  // com sessão expirada). Quando o jogador loga, o próprio tick retoma.
  const token = typeof sessionToken === "function" ? sessionToken() : "";
  if (!token) return;
  // 401 recente: segura o poll por 30s e volta a tentar depois (cobre
  // relogin sem recarregar a página, sem spam de requisições).
  if (Date.now() < (MEGA_LOBBY_UI.authBackoffUntil || 0)) return;
  const r = await megaLobbyApi("GET", "/api/mega-lobby/state");
  if (r.status === 401) {
    MEGA_LOBBY_UI.authBackoffUntil = Date.now() + 30000;
    return;
  }
  // Servidor antigo (sem rota) → 404. Para o poll pra não spammar rede/"ping".
  if (r.status === 404 || r.status === 501) {
    MEGA_LOBBY_UI.unsupported = true;
    if (MEGA_LOBBY_UI.poll) {
      clearInterval(MEGA_LOBBY_UI.poll);
      MEGA_LOBBY_UI.poll = null;
    }
    return;
  }
  if (!r.data || !r.data.ok) return;
  MEGA_LOBBY_UI.lobby = r.data.lobby || null;
  MEGA_LOBBY_UI.inbox = r.data.inbox || [];
  megaLobbyNotifyInvites();
  megaLobbyRenderPanel();
  // Fallback: se perdeu o SSE "start", ainda entra pela poll.
  megaLobbyMaybeFollowFromState(MEGA_LOBBY_UI.lobby);
}

function megaLobbyMaybeFollowFromState(lobby) {
  if (!lobby || window.__MEGA_LOBBY_FOLLOW) return;
  if (lobby.status !== "starting" && lobby.status !== "fighting") return;
  if (lobby.youAreLeader) return;
  if (typeof G !== "undefined" && G && G.combat && G.combat.boss &&
      String(G.combat.boss.id) === "goshnar-s-megalomania") return;
  const myChar = typeof sessionCharId === "function" ? Number(sessionCharId()) : 0;
  const slot = (lobby.slots || []).find((s) => s && Number(s.charId) === myChar);
  if (!slot && myChar) {
    // Slot pelo account (char pode estar desatualizado na sessão).
    const any = (lobby.slots || []).find((s) => s && Number(s.accountId) ===
      Number((typeof sessionAccount === "function" && sessionAccount() || {}).id));
    if (any) {
      megaLobbyFollowStart({ followCharId: any.charId, lobby });
      return;
    }
  }
  if (slot) megaLobbyFollowStart({ followCharId: slot.charId, lobby });
}

async function megaLobbyEnsureNotInParty() {
  // TEMP TEST: remove before release
  if (megaTestBypass()) return true;
  // `_partyOnline` pode estar stale antes do 1º poll — sincroniza para não
  // disparar POST /api/mega-lobby/create → 403 "Saia da Party…".
  try {
    if (typeof partySync === "function") await partySync();
    else if (typeof accountPartyState === "function" && typeof sessionCharId === "function") {
      const charId = Number(sessionCharId());
      if (charId) {
        const r = await accountPartyState(charId);
        if (r && r.ok && typeof G !== "undefined" && G && G.p) G.p._partyOnline = r.state;
      }
    }
  } catch (e) { /* ignore */ }
  if ((typeof partyIsMember === "function" && partyIsMember()) ||
      (typeof partyIsLeader === "function" && partyIsLeader())) {
    if (typeof toast === "function") toast("Saia da Party antes de abrir o lobby do Megalomania.", "bad");
    return false;
  }
  return true;
}

async function megaLobbyOpenFromBoss() {
  // TEMP TEST: remove before release — templo opcional com MEGA_TEST_BYPASS.
  if (!megaTestBypass() && !megaLobbyInTemple()) {
    if (typeof toast === "function") toast("Vá ao templo para abrir o lobby do Megalomania.", "bad");
    return;
  }
  if (!(await megaLobbyEnsureNotInParty())) return;
  const charId = typeof sessionCharId === "function" ? sessionCharId() : (G.p && G.p.id);
  if (!charId) {
    if (typeof toast === "function") toast("Selecione um personagem no templo.", "bad");
    return;
  }
  // Modal: confirmar personagem ativo
  const ok = await megaLobbyConfirmCharModal(charId, "Abrir lobby como líder");
  if (!ok) return;
  if (!(await megaLobbyEnsureNotInParty())) return;
  const r = await megaLobbyApi("POST", "/api/mega-lobby/create", {
    char_id: Number(ok.charId),
    inTemple: true,
    playerName: ok.name,
  });
  if (!r.data.ok) {
    if (typeof toast === "function") toast(r.data.msg || "Não foi possível abrir o lobby.", "bad");
    return;
  }
  MEGA_LOBBY_UI.lobby = r.data.lobby;
  megaLobbyRenderPanel();
  megaLobbyStartPoll();
  if (typeof toast === "function") toast("Lobby Megalomania aberto.", "level");
}

function megaLobbyAccountChars() {
  const list = (typeof accountCharacterCacheRead === "function" && accountCharacterCacheRead()) ||
    (typeof ACCOUNT_CHARS !== "undefined" && ACCOUNT_CHARS) ||
    (G && G.accountChars) || [];
  if (Array.isArray(list) && list.length) return list;
  if (G && G.p) return [{ id: G.p.id, name: G.p.name, voc: G.p.voc, level: G.p.level }];
  return [];
}

function megaLobbyConfirmCharModal(preferredId, title) {
  return new Promise((resolve) => {
    const modal = $("#modal"), body = $("#modal-body");
    if (!modal || !body) { resolve(null); return; }
    const chars = megaLobbyAccountChars();
    body.classList.remove("bosses-modal-shell", "boss-modal-shell");
    body.classList.add("mega-lobby-char-shell");
    let rows = chars.map((c) => {
      const id = Number(c.id || (c.p && c.p.id));
      const name = c.name || (c.p && c.p.name) || "?";
      const voc = c.voc || (c.p && c.p.voc) || "none";
      const level = c.level || (c.p && c.p.level) || 1;
      const sel = Number(preferredId) === id ? "checked" : "";
      return `<label class="mega-lobby-char-row">
        <input type="radio" name="mega-char" value="${id}" data-name="${name}" ${sel}>
        <span><b>${name}</b> · ${megaLobbyVocShort(voc)} · lvl ${level}</span>
      </label>`;
    }).join("") || `<div class="dim">Nenhum personagem.</div>`;
    body.innerHTML = `<div class="panel-title">${title || "Escolher personagem"}
      <button class="sm" id="mega-char-cancel">✕</button></div>
      <div class="panel-body">
        <p class="tiny dim">O personagem deve estar no templo e fora de Party.</p>
        <div class="mega-lobby-char-list">${rows}</div>
        <button class="danger full mt8" id="mega-char-confirm">CONFIRMAR</button>
      </div>`;
    modal.classList.add("show");
    const close = () => {
      modal.classList.remove("show");
      body.classList.remove("mega-lobby-char-shell");
    };
    $("#mega-char-cancel").onclick = () => { close(); resolve(null); };
    $("#mega-char-confirm").onclick = () => {
      const picked = body.querySelector('input[name="mega-char"]:checked');
      if (!picked) {
        if (typeof toast === "function") toast("Selecione um personagem.", "bad");
        return;
      }
      close();
      resolve({ charId: Number(picked.value), name: picked.getAttribute("data-name") || "?" });
    };
  });
}

async function megaLobbyInvite(name) {
  if (!name) {
    if (typeof toast === "function") toast("Digite o nome do personagem.", "bad");
    return;
  }
  const r = await megaLobbyApi("POST", "/api/mega-lobby/invite", { invitee_name: name });
  if (!r.data.ok) {
    if (typeof toast === "function") toast(r.data.msg || "Convite falhou.", "bad");
    return;
  }
  MEGA_LOBBY_UI.lobby = r.data.lobby;
  megaLobbyRenderPanel();
  if (typeof toast === "function") toast(`Convite enviado para <b>${name}</b>.`, "level");
}

async function megaLobbyLeave() {
  await megaLobbyApi("POST", "/api/mega-lobby/leave", {});
  MEGA_LOBBY_UI.lobby = null;
  megaLobbyRenderPanel();
}

/* Morte / ejeção: sai do lobby mesmo em fighting. Retorna remaining.
 * Cancela PUTs de instância enfileirados (epoch) ANTES do leave-fight para
 * não correr com prepareInstanceState após o lobby fechar. */
async function megaLobbyLeaveFight() {
  try {
    if (typeof ACCOUNT_INSTANCE_EPOCH === "number") {
      try { ACCOUNT_INSTANCE_EPOCH += 1; } catch (e) { /* ignore */ }
    }
    if (typeof ACCOUNT_INSTANCE_CAN_CREATE !== "undefined") {
      try { ACCOUNT_INSTANCE_CAN_CREATE = false; } catch (e) { /* ignore */ }
    }
    const lease = typeof accountLeaseFields === "function" ? accountLeaseFields() : {};
    const r = await megaLobbyApi("POST", "/api/mega-lobby/leave-fight", lease || {});
    MEGA_LOBBY_UI.lobby = null;
    megaLobbyRenderPanel();
    if (r && r.data && r.data.instanceEnded && typeof accountInstanceApply === "function") {
      try { accountInstanceApply(null); } catch (e) { /* ignore */ }
    }
    return {
      ok: !!(r && r.data && r.data.ok),
      remaining: r && r.data ? Number(r.data.remaining) || 0 : 0,
      shouldEndInstance: !(r && r.data) || r.data.shouldEndInstance !== false,
      instanceEnded: !!(r && r.data && r.data.instanceEnded),
    };
  } catch (e) {
    return { ok: false, remaining: 0, shouldEndInstance: true, instanceEnded: false };
  }
}

function megaLobbyIsActiveFight(c) {
  const combat = c || (typeof G !== "undefined" ? G.combat : null);
  if (combat && combat.boss && String(combat.boss.id) === "goshnar-s-megalomania") return true;
  const lobby = MEGA_LOBBY_UI && MEGA_LOBBY_UI.lobby;
  return !!(lobby && (lobby.status === "fighting" || lobby.status === "starting"));
}

/* Char atual morto e ainda há vivos na sala mega → ejetar e templo. */
function megaLobbyShouldEjectOnDeath(c) {
  if (!megaLobbyIsActiveFight(c)) return false;
  const me = typeof sessionCharId === "function" ? String(sessionCharId() || "") : "";
  if (!me || !c) return false;
  const members = (c.players && c.players.length) ? c.players : (c.player ? [c.player] : []);
  const mine = members.find((ent) => ent && String(ent.id) === me);
  if (!mine || !(mine.permadead || (mine.p && mine.p.hp <= 0))) return false;
  const othersAlive = members.some((ent) =>
    ent && String(ent.id) !== me && ent.p && ent.p.hp > 0 && !ent.permadead && !ent.downUntil);
  // Solo wipe também ejetar (lobby “Luta em andamento” no templo).
  return true;
}

let MEGA_LOBBY_EJECTING = false;
async function megaLobbyEjectDeadToTemple(c) {
  if (MEGA_LOBBY_EJECTING) return;
  if (!megaLobbyShouldEjectOnDeath(c)) return;
  MEGA_LOBBY_EJECTING = true;
  try {
    await megaLobbyLeaveFight();
    if (typeof stopHunt === "function") {
      setTimeout(() => {
        try { if (G && G.combat) stopHunt(true); } catch (e) { /* ignore */ }
        MEGA_LOBBY_EJECTING = false;
      }, 400);
    } else MEGA_LOBBY_EJECTING = false;
  } catch (e) {
    MEGA_LOBBY_EJECTING = false;
  }
}

async function megaLobbyAccept(inviteId) {
  // TEMP TEST: remove before release — templo opcional com MEGA_TEST_BYPASS.
  if (!megaTestBypass() && !megaLobbyInTemple()) {
    if (typeof toast === "function") toast("Vá ao templo para aceitar o convite.", "bad");
    return;
  }
  if (!(await megaLobbyEnsureNotInParty())) return;
  const picked = await megaLobbyConfirmCharModal(
    typeof sessionCharId === "function" ? sessionCharId() : null,
    "Aceitar convite — escolher personagem");
  if (!picked) return;
  const r = await megaLobbyApi("POST", "/api/mega-lobby/accept", {
    invite_id: inviteId,
    char_id: Number(picked.charId),
    inTemple: true,
    playerName: picked.name,
  });
  if (!r.data.ok) {
    if (typeof toast === "function") toast(r.data.msg || "Não foi possível aceitar.", "bad");
    return;
  }
  MEGA_LOBBY_UI.lobby = r.data.lobby;
  MEGA_LOBBY_UI.inbox = (MEGA_LOBBY_UI.inbox || []).filter((i) => String(i.id) !== String(inviteId));
  MEGA_LOBBY_UI.inviteModalOpen = false;
  megaLobbyRenderInviteBadge();
  megaLobbyRenderPanel();
  megaLobbyStartPoll();
  if (typeof toast === "function") toast("Você entrou no lobby Megalomania!", "level");
}

async function megaLobbyStartFight() {
  // TEMP TEST: remove before release — templo opcional com MEGA_TEST_BYPASS.
  if (!megaTestBypass() && !megaLobbyInTemple()) {
    if (typeof toast === "function") toast("O líder precisa estar no templo.", "bad");
    return;
  }
  const r = await megaLobbyApi("POST", "/api/mega-lobby/start", {});
  if (!r.data.ok) {
    if (typeof toast === "function") toast(r.data.msg || "Não foi possível iniciar.", "bad");
    return;
  }
  MEGA_LOBBY_UI.lobby = r.data.lobby;
  megaLobbyRenderPanel();
  await megaLobbyBeginBossAsLeader(r.data.members || []);
}

async function megaLobbyBeginBossAsLeader(members) {
  // Troca para o char do slot 0 se necessário e inicia boss.
  const lobby = MEGA_LOBBY_UI.lobby;
  const self = (lobby && lobby.slots || []).find((s) => s && lobby.youAreLeader &&
    Number(s.accountId) === Number(lobby.leaderAccountId)) || (lobby && lobby.slots && lobby.slots[0]);
  if (self && typeof switchCharacter === "function" && Number(self.charId) !== Number(sessionCharId && sessionCharId())) {
    try { await switchCharacter(self.charId); } catch (e) { /* ignore */ }
  }
  if (typeof startBoss === "function") {
    window.__MEGA_LOBBY_STARTING = true;
    window.__MEGA_LOBBY_MEMBERS = Array.isArray(members) ? members.slice() : [];
    startBoss("goshnar-s-megalomania", false);
    // Aguarda o PUT criar ACCOUNT_INSTANCE.id e vincula o share (com lease).
    megaLobbyBindWhenReady().finally(() => {
      window.__MEGA_LOBBY_STARTING = false;
      window.__MEGA_LOBBY_MEMBERS = null;
    });
  }
}

async function megaLobbyBindWhenReady() {
  const lease = typeof accountLeaseFields === "function" ? accountLeaseFields() : {};
  for (let i = 0; i < 40; i++) {
    const id = typeof ACCOUNT_INSTANCE !== "undefined" && ACCOUNT_INSTANCE && ACCOUNT_INSTANCE.id;
    if (id) {
      const r = await megaLobbyApi("POST", "/api/mega-lobby/bind",
        Object.assign({ instance_id: id }, lease));
      if (r.data && r.data.ok) return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (typeof toast === "function") toast("Falha ao vincular a sala Megalomania.", "bad");
  return false;
}

async function megaLobbyFollowStart(detail) {
  if (window.__MEGA_LOBBY_FOLLOW) return;
  const followCharId = detail && detail.followCharId;
  if (followCharId && typeof switchCharacter === "function" &&
      Number(followCharId) !== Number(sessionCharId && sessionCharId())) {
    try { await switchCharacter(followCharId); } catch (e) { /* ignore */ }
  }
  if (!megaLobbyInTemple()) {
    if (typeof toast === "function") toast("Vá ao templo — a luta vai começar.", "bad");
  }
  // Convidados aguardam a instância compartilhada do líder (não abrem boss próprio).
  window.__MEGA_LOBBY_FOLLOW = true;
  if (typeof toast === "function") toast("Aguardando a sala do líder…", "level");
  let tries = 0;
  const maxTries = 120; // ~60s — líder ainda pode estar carregando OTBM
  const wait = setInterval(async () => {
    tries++;
    try {
      const r = await megaLobbyApi("GET", "/api/mega-lobby/state");
      const instanceId = r.data && (
        (r.data.lobby && r.data.lobby.instanceId) ||
        (r.data.share && r.data.share.instanceId)
      );
      if (!instanceId) {
        if (tries > maxTries) {
          clearInterval(wait);
          window.__MEGA_LOBBY_FOLLOW = false;
          if (typeof toast === "function") toast("Timeout aguardando a sala Megalomania.", "bad");
        }
        return;
      }
      const token = typeof sessionToken === "function" ? sessionToken() : "";
      const charId = (followCharId != null ? followCharId : null) ||
        (typeof sessionCharId === "function" ? sessionCharId() : null);
      if (!token || typeof accountLoadInstance !== "function") return;
      const remote = await accountLoadInstance(token);
      const belongs = !!(remote && remote.ok && remote.instance &&
        typeof instanceIncludesCharacter === "function" &&
        instanceIncludesCharacter(remote.instance, charId));
      if (!belongs) {
        if (tries > maxTries) {
          clearInterval(wait);
          window.__MEGA_LOBBY_FOLLOW = false;
          if (typeof toast === "function")
            toast("Timeout: personagem não entrou na sala compartilhada.", "bad");
        }
        return;
      }
      clearInterval(wait);
      if (typeof resumeIdleInstance === "function") {
        const session = Object.assign({}, remote.instance, {
          activeCharacterId: String(charId || remote.instance.activeCharacterId || ""),
        });
        try {
          localStorage.setItem("tibia-idle-active-instance-v1", JSON.stringify(session));
        } catch (e) { /* ignore */ }
        await resumeIdleInstance(session);
        if (typeof toast === "function") toast("Entrou na sala Megalomania compartilhada!", "level");
      }
      window.__MEGA_LOBBY_FOLLOW = false;
    } catch (e) { /* ignore */ }
    if (tries > maxTries && window.__MEGA_LOBBY_FOLLOW) {
      clearInterval(wait);
      window.__MEGA_LOBBY_FOLLOW = false;
      if (typeof toast === "function") toast("Timeout aguardando a sala Megalomania.", "bad");
    }
  }, 500);
}

function megaLobbyStartPoll() {
  if (MEGA_LOBBY_UI.unsupported) return;
  if (MEGA_LOBBY_UI.poll) return;
  MEGA_LOBBY_UI.poll = setInterval(() => { megaLobbyRefresh().catch(() => {}); }, 4000);
}

function megaLobbyOnSync(event) {
  const data = (event && event.detail) || {};
  if (data.action === "invite" && data.invite) {
    MEGA_LOBBY_UI.inbox = MEGA_LOBBY_UI.inbox || [];
    if (!MEGA_LOBBY_UI.inbox.some((i) => String(i.id) === String(data.invite.id)))
      MEGA_LOBBY_UI.inbox.push(data.invite);
    megaLobbyNotifyInvites();
    if (typeof toast === "function")
      toast(`Convite Megalomania de <b>${data.invite.fromName}</b>!`, "level");
  }
  if (data.action === "invite-declined" && typeof toast === "function")
    toast(data.msg || "Convite recusado.", "bad");
  if (data.action === "invite-accepted" && typeof toast === "function")
    toast(data.msg || "Jogador entrou no lobby.", "level");
  if (data.lobby) {
    MEGA_LOBBY_UI.lobby = data.lobby;
    megaLobbyRenderPanel();
    megaLobbyStartPoll();
  }
  if (data.action === "start") {
    MEGA_LOBBY_UI.lobby = data.lobby || MEGA_LOBBY_UI.lobby;
    megaLobbyRenderPanel();
    if (data.followCharId) megaLobbyFollowStart(data);
  }
  if (data.action === "takeover") {
    MEGA_LOBBY_UI.lobby = data.lobby || MEGA_LOBBY_UI.lobby;
    megaLobbyRenderPanel();
    if (typeof toast === "function") toast(data.msg || "Você assumiu a sala Megalomania.", "level");
    // Passa a ser dono da row — recarrega a instância para começar a tickar.
    (async () => {
      try {
        const token = typeof sessionToken === "function" ? sessionToken() : "";
        if (!token || typeof accountLoadInstance !== "function") return;
        const remote = await accountLoadInstance(token);
        if (remote && remote.ok && remote.instance && typeof accountInstanceApply === "function") {
          accountInstanceApply(remote.instance);
        }
        if (remote && remote.ok && remote.instance && typeof G !== "undefined" && G && G.combat &&
            typeof resumeIdleInstance === "function" && !G.combat) {
          await resumeIdleInstance(remote.instance);
        }
      } catch (e) { /* ignore */ }
    })();
  }
  if (data.action === "closed" || data.action === "kicked" || data.action === "left-fight") {
    MEGA_LOBBY_UI.lobby = null;
    megaLobbyRenderPanel();
    if (data.action !== "left-fight" && typeof toast === "function")
      toast(data.msg || "Lobby Megalomania encerrado.");
  }
}

function megaLobbyBoot() {
  megaLobbyEnsureDom();
  if (typeof window !== "undefined") {
    window.megaLobbyOpenFromBoss = megaLobbyOpenFromBoss;
    window.megaLobbyStartFight = megaLobbyStartFight;
    window.megaLobbyLeaveFight = megaLobbyLeaveFight;
    window.megaLobbyEjectDeadToTemple = megaLobbyEjectDeadToTemple;
    window.megaLobbyIsActiveFight = megaLobbyIsActiveFight;
    window.addEventListener("tibia-idle-sync-mega-lobby", megaLobbyOnSync);
  }
  setTimeout(() => megaLobbyRefresh().catch(() => {}), 1500);
}

if (typeof document !== "undefined") {
  if (typeof window !== "undefined") {
    window.megaLobbyOpenFromBoss = megaLobbyOpenFromBoss;
    window.megaLobbyStartFight = megaLobbyStartFight;
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", megaLobbyBoot);
  else megaLobbyBoot();
}
