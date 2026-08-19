/*
 * pale-worm-lobby.js — lobby modal (esquerda), convites "!", select char
 * no templo e start 1–9 jogadores (1 char cada) para The Pale Worm.
 *
 * Mesmo fluxo do lobby do Megalomania (megalomania-lobby.js), mas com 9
 * vagas e pré-requisito próprio: ter matado os 3 bosses anteriores do
 * Feast of Souls. Arquivo separado — o Megalomania não é alterado.
 */
"use strict";

const PALE_LOBBY_UI = {
  lobby: null,
  inbox: [],
  poll: null,
  panel: null,
  inviteBtn: null,
  unsupported: false,
  inviteModalOpen: false,
  authBackoffUntil: 0, // 401 recente: segura o poll por 30s (evita spam no console)
};

function paleLobbyInTemple() {
  return !!(typeof G !== "undefined" && G && G.inCity && !G.combat && !G.training);
}

function paleLobbyVocShort(voc) {
  const v = String(voc || "").toLowerCase();
  if (v.includes("knight") || v === "ek" || v === "rk") return "EK";
  if (v.includes("paladin") || v === "rp" || v === "ep") return "RP";
  if (v.includes("sorcerer") || v === "ms" || v === "es") return "MS";
  if (v.includes("druid") || v === "ed" || v === "dr") return "ED";
  if (v.includes("monk") || v === "em" || v === "ex") return "EM";
  return "?";
}

async function paleLobbyApi(method, path, body) {
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

function paleLobbyEnsureDom() {
  if (PALE_LOBBY_UI.panel) return;
  const panel = document.createElement("div");
  panel.id = "pale-lobby-panel";
  panel.className = "mega-lobby-panel";
  panel.style.display = "none";
  document.body.appendChild(panel);
  PALE_LOBBY_UI.panel = panel;

  const inviteBtn = document.createElement("button");
  inviteBtn.type = "button";
  inviteBtn.id = "pale-lobby-invite-btn";
  inviteBtn.className = "mega-lobby-invite-btn";
  inviteBtn.style.display = "none";
  inviteBtn.innerHTML = "!";
  inviteBtn.title = "Convite Pale Worm";
  inviteBtn.addEventListener("click", () => paleLobbyOpenInbox());
  document.body.appendChild(inviteBtn);
  PALE_LOBBY_UI.inviteBtn = inviteBtn;
}

function paleLobbyRenderInviteBadge() {
  paleLobbyEnsureDom();
  const n = (PALE_LOBBY_UI.inbox || []).length;
  const btn = PALE_LOBBY_UI.inviteBtn;
  if (!btn) return;
  if (n > 0 && !PALE_LOBBY_UI.inviteModalOpen) {
    btn.style.display = "block";
    btn.innerHTML = "!" + (n > 1 ? `<span class="mega-lobby-invite-count">${n}</span>` : "");
  } else btn.style.display = "none";
}

/* Abre modal CENTRAL com Aceitar/Recusar (não o "!" na borda da tela). */
function paleLobbyOpenInbox(opts) {
  opts = opts || {};
  const inbox = PALE_LOBBY_UI.inbox || [];
  if (!inbox.length) return;
  const modal = document.getElementById("modal");
  const body = document.getElementById("modal-body");
  if (!modal || !body) return;
  if (modal.classList.contains("show") && !opts.force && !PALE_LOBBY_UI.inviteModalOpen) {
    paleLobbyRenderInviteBadge();
    return;
  }
  PALE_LOBBY_UI.inviteModalOpen = true;
  if (PALE_LOBBY_UI.inviteBtn) PALE_LOBBY_UI.inviteBtn.style.display = "none";

  const rows = inbox.map((inv) => `
    <div class="mega-invite-card">
      <div class="mega-invite-card-title">Convite Pale Worm</div>
      <div class="mega-invite-card-body">
        <b>${inv.fromName || "Jogador"}</b> convidou você para o lobby.
        ${inv.toHintName ? `<div class="tiny dim mt4">Personagem sugerido: ${inv.toHintName}</div>` : ""}
        <div class="tiny dim mt4">É preciso estar no templo e fora de Party para aceitar.</div>
      </div>
      <div class="mega-invite-card-actions">
        <button type="button" class="sm primary" data-pale-accept="${inv.id}">Aceitar</button>
        <button type="button" class="sm" data-pale-decline="${inv.id}">Recusar</button>
      </div>
    </div>`).join("");

  body.innerHTML = `<div class="panel-title">PALE WORM
      <span style="flex:1"></span>
      <button type="button" class="sm" id="pale-inbox-close" title="Fechar">✕</button>
    </div>
    <div class="panel-body mega-invite-modal-body">
      ${rows}
    </div>`;
  modal.classList.add("show");
  modal.classList.remove("wide", "modal-otc");

  const closeInviteModal = () => {
    PALE_LOBBY_UI.inviteModalOpen = false;
    modal.classList.remove("show");
    paleLobbyRenderInviteBadge();
  };
  const closeBtn = document.getElementById("pale-inbox-close");
  if (closeBtn) closeBtn.onclick = () => closeInviteModal();

  body.querySelectorAll("[data-pale-accept]").forEach((btn) => {
    btn.onclick = async () => {
      PALE_LOBBY_UI.inviteModalOpen = false;
      modal.classList.remove("show");
      await paleLobbyAccept(btn.getAttribute("data-pale-accept"));
      paleLobbyRenderInviteBadge();
    };
  });
  body.querySelectorAll("[data-pale-decline]").forEach((btn) => {
    btn.onclick = async () => {
      await paleLobbyApi("POST", "/api/pale-lobby/decline", {
        invite_id: btn.getAttribute("data-pale-decline"),
      });
      PALE_LOBBY_UI.inbox = (PALE_LOBBY_UI.inbox || [])
        .filter((i) => String(i.id) !== String(btn.getAttribute("data-pale-decline")));
      if ((PALE_LOBBY_UI.inbox || []).length) paleLobbyOpenInbox({ force: true });
      else closeInviteModal();
      if (typeof toast === "function") toast("Convite recusado.");
    };
  });
}

function paleLobbyNotifyInvites(prevIds) {
  const inbox = PALE_LOBBY_UI.inbox || [];
  if (!inbox.length) {
    paleLobbyRenderInviteBadge();
    return;
  }
  const prev = prevIds || PALE_LOBBY_UI._seenInviteIds || new Set();
  const hasNew = inbox.some((inv) => !prev.has(String(inv.id)));
  PALE_LOBBY_UI._seenInviteIds = new Set(inbox.map((i) => String(i.id)));
  if (hasNew || !PALE_LOBBY_UI.inviteModalOpen) {
    paleLobbyOpenInbox({ force: !!hasNew });
  } else paleLobbyRenderInviteBadge();
}

function paleLobbySlotHtml(slot, index, isLeaderView) {
  if (!slot) {
    return `<div class="mega-lobby-slot empty"><span class="mega-lobby-slot-n">#${index + 1}</span>
      <span class="dim">Vaga livre</span></div>`;
  }
  const you = typeof sessionCharId === "function" && Number(slot.charId) === Number(sessionCharId());
  return `<div class="mega-lobby-slot ${index === 0 ? "leader" : ""} ${you ? "you" : ""}">
    <span class="mega-lobby-slot-n">${index === 0 ? "LÍDER" : "#" + (index + 1)}</span>
    <div class="mega-lobby-slot-body">
      <b>${slot.charName}</b>
      <span class="dim">${paleLobbyVocShort(slot.voc)} · lvl ${slot.level}</span>
      <span class="tiny dim">${slot.playerName || ""}</span>
    </div>
  </div>`;
}

function paleLobbyRenderPanel() {
  paleLobbyEnsureDom();
  const panel = PALE_LOBBY_UI.panel;
  const lobby = PALE_LOBBY_UI.lobby;
  if (!lobby || lobby.status === "closed") {
    panel.style.display = "none";
    panel.innerHTML = "";
    return;
  }
  panel.style.display = "block";
  const slots = lobby.slots || [];
  const leader = lobby.youAreLeader;
  let html = `<div class="mega-lobby-head">
    <b>PALE WORM LOBBY</b>
    <button type="button" class="sm" id="pale-lobby-close-x">✕</button>
  </div>
  <div class="mega-lobby-sub">Líder: <b>${lobby.leaderName || "?"}</b> · ${lobby.filled || 0}/${lobby.max || 9}</div>
  <div class="mega-lobby-slots">`;
  for (let i = 0; i < (lobby.max || 9); i++) html += paleLobbySlotHtml(slots[i] || null, i, leader);
  html += `</div>`;
  if (leader && lobby.status === "open") {
    html += `<div class="mega-lobby-invite-row">
      <input id="pale-lobby-invite-name" type="text" maxlength="30" placeholder="Nome do personagem">
      <button type="button" class="sm primary" id="pale-lobby-invite-send">Convidar</button>
    </div>
    <button type="button" class="danger full mt8" id="pale-lobby-start">INICIAR LUTA (1–9)</button>`;
  }
  if (lobby.status === "open") {
    html += `<button type="button" class="sm full mt8" id="pale-lobby-leave">Sair do lobby</button>`;
  } else if (lobby.status === "starting" || lobby.status === "fighting") {
    html += `<div class="tiny dim mt8 center">Luta em andamento…</div>`;
  }
  panel.innerHTML = html;
  const closeX = document.getElementById("pale-lobby-close-x");
  if (closeX) closeX.onclick = () => {
    if (lobby.status === "open") paleLobbyLeave();
    else panel.style.display = "none";
  };
  const leave = document.getElementById("pale-lobby-leave");
  if (leave) leave.onclick = () => paleLobbyLeave();
  const send = document.getElementById("pale-lobby-invite-send");
  if (send) send.onclick = () => {
    const name = (document.getElementById("pale-lobby-invite-name") || {}).value || "";
    paleLobbyInvite(name.trim());
  };
  const start = document.getElementById("pale-lobby-start");
  if (start) start.onclick = () => paleLobbyStartFight();
}

async function paleLobbyRefresh() {
  if (PALE_LOBBY_UI.unsupported) return;
  // Sessão ausente: não chama o servidor — sem isso cada tick do poll (4s)
  // virava um 401 "Failed to load resource" no console (caso clássico da VM
  // com sessão expirada). Quando o jogador loga, o próprio tick retoma.
  const token = typeof sessionToken === "function" ? sessionToken() : "";
  if (!token) return;
  // 401 recente: segura o poll por 30s e volta a tentar depois (cobre
  // relogin sem recarregar a página, sem spam de requisições).
  if (Date.now() < (PALE_LOBBY_UI.authBackoffUntil || 0)) return;
  const r = await paleLobbyApi("GET", "/api/pale-lobby/state");
  if (r.status === 401) {
    PALE_LOBBY_UI.authBackoffUntil = Date.now() + 30000;
    return;
  }
  // Servidor antigo (sem rota) → 404. Para o poll pra não spammar rede/"ping".
  if (r.status === 404 || r.status === 501) {
    PALE_LOBBY_UI.unsupported = true;
    if (PALE_LOBBY_UI.poll) {
      clearInterval(PALE_LOBBY_UI.poll);
      PALE_LOBBY_UI.poll = null;
    }
    return;
  }
  if (!r.data || !r.data.ok) return;
  PALE_LOBBY_UI.lobby = r.data.lobby || null;
  PALE_LOBBY_UI.inbox = r.data.inbox || [];
  paleLobbyNotifyInvites();
  paleLobbyRenderPanel();
  // Fallback: se perdeu o SSE "start", ainda entra pela poll.
  paleLobbyMaybeFollowFromState(PALE_LOBBY_UI.lobby);
}

function paleLobbyMaybeFollowFromState(lobby) {
  if (!lobby || window.__PALE_LOBBY_FOLLOW) return;
  if (lobby.status !== "starting" && lobby.status !== "fighting") return;
  if (lobby.youAreLeader) return;
  if (typeof G !== "undefined" && G && G.combat && G.combat.boss &&
      String(G.combat.boss.id) === "the-pale-worm") return;
  const myChar = typeof sessionCharId === "function" ? Number(sessionCharId()) : 0;
  const slot = (lobby.slots || []).find((s) => s && Number(s.charId) === myChar);
  if (!slot && myChar) {
    const any = (lobby.slots || []).find((s) => s && Number(s.accountId) ===
      Number((typeof sessionAccount === "function" && sessionAccount() || {}).id));
    if (any) {
      paleLobbyFollowStart({ followCharId: any.charId, lobby });
      return;
    }
  }
  if (slot) paleLobbyFollowStart({ followCharId: slot.charId, lobby });
}

async function paleLobbyEnsureNotInParty() {
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
    if (typeof toast === "function") toast("Saia da Party antes de abrir o lobby do Pale Worm.", "bad");
    return false;
  }
  return true;
}

async function paleLobbyOpenFromBoss() {
  if (!paleLobbyInTemple()) {
    if (typeof toast === "function") toast("Vá ao templo para abrir o lobby do Pale Worm.", "bad");
    return;
  }
  // Gate: matou os 3 bosses anteriores do Feast of Souls? (o servidor
  // revalida no create/accept/start).
  if (G && G.p && typeof feastBossesKilled === "function" &&
      !feastBossesKilled(G.p, ["the-dread-maiden", "the-fear-feaster", "the-unwelcome"])) {
    if (typeof toast === "function")
      toast("Mate The Dread Maiden, The Fear Feaster e The Unwelcome para acessar o Pale Worm.", "bad");
    return;
  }
  if (!(await paleLobbyEnsureNotInParty())) return;
  const charId = typeof sessionCharId === "function" ? sessionCharId() : (G.p && G.p.id);
  if (!charId) {
    if (typeof toast === "function") toast("Selecione um personagem no templo.", "bad");
    return;
  }
  // Modal: confirmar personagem ativo
  const ok = await paleLobbyConfirmCharModal(charId, "Abrir lobby como líder");
  if (!ok) return;
  if (!(await paleLobbyEnsureNotInParty())) return;
  const r = await paleLobbyApi("POST", "/api/pale-lobby/create", {
    char_id: Number(ok.charId),
    inTemple: true,
    playerName: ok.name,
  });
  if (!r.data.ok) {
    if (typeof toast === "function") toast(r.data.msg || "Não foi possível abrir o lobby.", "bad");
    return;
  }
  PALE_LOBBY_UI.lobby = r.data.lobby;
  paleLobbyRenderPanel();
  paleLobbyStartPoll();
  if (typeof toast === "function") toast("Lobby Pale Worm aberto.", "level");
}

function paleLobbyAccountChars() {
  const list = (typeof accountCharacterCacheRead === "function" && accountCharacterCacheRead()) ||
    (typeof ACCOUNT_CHARS !== "undefined" && ACCOUNT_CHARS) ||
    (G && G.accountChars) || [];
  if (Array.isArray(list) && list.length) return list;
  if (G && G.p) return [{ id: G.p.id, name: G.p.name, voc: G.p.voc, level: G.p.level }];
  return [];
}

function paleLobbyConfirmCharModal(preferredId, title) {
  return new Promise((resolve) => {
    const modal = document.getElementById("modal"), body = document.getElementById("modal-body");
    if (!modal || !body) { resolve(null); return; }
    const chars = paleLobbyAccountChars();
    body.classList.remove("bosses-modal-shell", "boss-modal-shell");
    body.classList.add("mega-lobby-char-shell");
    let rows = chars.map((c) => {
      const id = Number(c.id || (c.p && c.p.id));
      const name = c.name || (c.p && c.p.name) || "?";
      const voc = c.voc || (c.p && c.p.voc) || "none";
      const level = c.level || (c.p && c.p.level) || 1;
      const sel = Number(preferredId) === id ? "checked" : "";
      return `<label class="mega-lobby-char-row">
        <input type="radio" name="pale-char" value="${id}" data-name="${name}" ${sel}>
        <span><b>${name}</b> · ${paleLobbyVocShort(voc)} · lvl ${level}</span>
      </label>`;
    }).join("") || `<div class="dim">Nenhum personagem.</div>`;
    body.innerHTML = `<div class="panel-title">${title || "Escolher personagem"}
      <button class="sm" id="pale-char-cancel">✕</button></div>
      <div class="panel-body">
        <p class="tiny dim">O personagem deve estar no templo e fora de Party.</p>
        <div class="mega-lobby-char-list">${rows}</div>
        <button class="danger full mt8" id="pale-char-confirm">CONFIRMAR</button>
      </div>`;
    modal.classList.add("show");
    const close = () => {
      modal.classList.remove("show");
      body.classList.remove("mega-lobby-char-shell");
    };
    document.getElementById("pale-char-cancel").onclick = () => { close(); resolve(null); };
    document.getElementById("pale-char-confirm").onclick = () => {
      const picked = body.querySelector('input[name="pale-char"]:checked');
      if (!picked) {
        if (typeof toast === "function") toast("Selecione um personagem.", "bad");
        return;
      }
      close();
      resolve({ charId: Number(picked.value), name: picked.getAttribute("data-name") || "?" });
    };
  });
}

async function paleLobbyInvite(name) {
  if (!name) {
    if (typeof toast === "function") toast("Digite o nome do personagem.", "bad");
    return;
  }
  const r = await paleLobbyApi("POST", "/api/pale-lobby/invite", { invitee_name: name });
  if (!r.data.ok) {
    if (typeof toast === "function") toast(r.data.msg || "Convite falhou.", "bad");
    return;
  }
  PALE_LOBBY_UI.lobby = r.data.lobby;
  paleLobbyRenderPanel();
  if (typeof toast === "function") toast(`Convite enviado para <b>${name}</b>.`, "level");
}

async function paleLobbyLeave() {
  await paleLobbyApi("POST", "/api/pale-lobby/leave", {});
  PALE_LOBBY_UI.lobby = null;
  paleLobbyRenderPanel();
}

/* Morte / ejeção: sai do lobby mesmo em fighting. Retorna remaining.
 * Cancela PUTs de instância enfileirados (epoch) ANTES do leave-fight. */
async function paleLobbyLeaveFight() {
  try {
    if (typeof ACCOUNT_INSTANCE_EPOCH === "number") {
      try { ACCOUNT_INSTANCE_EPOCH += 1; } catch (e) { /* ignore */ }
    }
    if (typeof ACCOUNT_INSTANCE_CAN_CREATE !== "undefined") {
      try { ACCOUNT_INSTANCE_CAN_CREATE = false; } catch (e) { /* ignore */ }
    }
    const lease = typeof accountLeaseFields === "function" ? accountLeaseFields() : {};
    const r = await paleLobbyApi("POST", "/api/pale-lobby/leave-fight", lease || {});
    PALE_LOBBY_UI.lobby = null;
    paleLobbyRenderPanel();
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

function paleLobbyIsActiveFight(c) {
  const combat = c || (typeof G !== "undefined" ? G.combat : null);
  if (combat && combat.boss && String(combat.boss.id) === "the-pale-worm") return true;
  const lobby = PALE_LOBBY_UI && PALE_LOBBY_UI.lobby;
  return !!(lobby && (lobby.status === "fighting" || lobby.status === "starting"));
}

/* Char atual morto e ainda há vivos na sala → ejetar e templo. */
function paleLobbyShouldEjectOnDeath(c) {
  if (!paleLobbyIsActiveFight(c)) return false;
  const me = typeof sessionCharId === "function" ? String(sessionCharId() || "") : "";
  if (!me || !c) return false;
  const members = (c.players && c.players.length) ? c.players : (c.player ? [c.player] : []);
  const mine = members.find((ent) => ent && String(ent.id) === me);
  if (!mine || !(mine.permadead || (mine.p && mine.p.hp <= 0))) return false;
  return true;
}

let PALE_LOBBY_EJECTING = false;
async function paleLobbyEjectDeadToTemple(c) {
  if (PALE_LOBBY_EJECTING) return;
  if (!paleLobbyShouldEjectOnDeath(c)) return;
  PALE_LOBBY_EJECTING = true;
  try {
    await paleLobbyLeaveFight();
    if (typeof stopHunt === "function") {
      setTimeout(() => {
        try { if (G && G.combat) stopHunt(true); } catch (e) { /* ignore */ }
        PALE_LOBBY_EJECTING = false;
      }, 400);
    } else PALE_LOBBY_EJECTING = false;
  } catch (e) {
    PALE_LOBBY_EJECTING = false;
  }
}

async function paleLobbyAccept(inviteId) {
  if (!paleLobbyInTemple()) {
    if (typeof toast === "function") toast("Vá ao templo para aceitar o convite.", "bad");
    return;
  }
  if (!(await paleLobbyEnsureNotInParty())) return;
  const picked = await paleLobbyConfirmCharModal(
    typeof sessionCharId === "function" ? sessionCharId() : null,
    "Aceitar convite — escolher personagem");
  if (!picked) return;
  const r = await paleLobbyApi("POST", "/api/pale-lobby/accept", {
    invite_id: inviteId,
    char_id: Number(picked.charId),
    inTemple: true,
    playerName: picked.name,
  });
  if (!r.data.ok) {
    if (typeof toast === "function") toast(r.data.msg || "Não foi possível aceitar.", "bad");
    return;
  }
  PALE_LOBBY_UI.lobby = r.data.lobby;
  PALE_LOBBY_UI.inbox = (PALE_LOBBY_UI.inbox || []).filter((i) => String(i.id) !== String(inviteId));
  PALE_LOBBY_UI.inviteModalOpen = false;
  paleLobbyRenderInviteBadge();
  paleLobbyRenderPanel();
  paleLobbyStartPoll();
  if (typeof toast === "function") toast("Você entrou no lobby do Pale Worm!", "level");
}

async function paleLobbyStartFight() {
  if (!paleLobbyInTemple()) {
    if (typeof toast === "function") toast("O líder precisa estar no templo.", "bad");
    return;
  }
  const r = await paleLobbyApi("POST", "/api/pale-lobby/start", {});
  if (!r.data.ok) {
    if (typeof toast === "function") toast(r.data.msg || "Não foi possível iniciar.", "bad");
    return;
  }
  PALE_LOBBY_UI.lobby = r.data.lobby;
  paleLobbyRenderPanel();
  await paleLobbyBeginBossAsLeader(r.data.members || []);
}

async function paleLobbyBeginBossAsLeader(members) {
  // Troca para o char do slot 0 se necessário e inicia boss.
  const lobby = PALE_LOBBY_UI.lobby;
  const self = (lobby && lobby.slots || []).find((s) => s && lobby.youAreLeader &&
    Number(s.accountId) === Number(lobby.leaderAccountId)) || (lobby && lobby.slots && lobby.slots[0]);
  if (self && typeof switchCharacter === "function" && Number(self.charId) !== Number(sessionCharId && sessionCharId())) {
    try { await switchCharacter(self.charId); } catch (e) { /* ignore */ }
  }
  if (typeof startBoss === "function") {
    window.__PALE_LOBBY_STARTING = true;
    window.__PALE_LOBBY_MEMBERS = Array.isArray(members) ? members.slice() : [];
    startBoss("the-pale-worm", false);
    // Aguarda o PUT criar ACCOUNT_INSTANCE.id e vincula o share (com lease).
    paleLobbyBindWhenReady().finally(() => {
      window.__PALE_LOBBY_STARTING = false;
      window.__PALE_LOBBY_MEMBERS = null;
    });
  }
}

async function paleLobbyBindWhenReady() {
  const lease = typeof accountLeaseFields === "function" ? accountLeaseFields() : {};
  for (let i = 0; i < 40; i++) {
    const id = typeof ACCOUNT_INSTANCE !== "undefined" && ACCOUNT_INSTANCE && ACCOUNT_INSTANCE.id;
    if (id) {
      const r = await paleLobbyApi("POST", "/api/pale-lobby/bind",
        Object.assign({ instance_id: id }, lease));
      if (r.data && r.data.ok) return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (typeof toast === "function") toast("Falha ao vincular a sala do Pale Worm.", "bad");
  return false;
}

async function paleLobbyFollowStart(detail) {
  if (window.__PALE_LOBBY_FOLLOW) return;
  const followCharId = detail && detail.followCharId;
  if (followCharId && typeof switchCharacter === "function" &&
      Number(followCharId) !== Number(sessionCharId && sessionCharId())) {
    try { await switchCharacter(followCharId); } catch (e) { /* ignore */ }
  }
  if (!paleLobbyInTemple()) {
    if (typeof toast === "function") toast("Vá ao templo — a luta vai começar.", "bad");
  }
  // Convidados aguardam a instância compartilhada do líder.
  window.__PALE_LOBBY_FOLLOW = true;
  if (typeof toast === "function") toast("Aguardando a sala do líder…", "level");
  let tries = 0;
  const maxTries = 120; // ~60s — líder ainda pode estar carregando OTBM
  const wait = setInterval(async () => {
    tries++;
    try {
      const r = await paleLobbyApi("GET", "/api/pale-lobby/state");
      const instanceId = r.data && (
        (r.data.lobby && r.data.lobby.instanceId) ||
        (r.data.share && r.data.share.instanceId)
      );
      if (!instanceId) {
        if (tries > maxTries) {
          clearInterval(wait);
          window.__PALE_LOBBY_FOLLOW = false;
          if (typeof toast === "function") toast("Timeout aguardando a sala do Pale Worm.", "bad");
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
          window.__PALE_LOBBY_FOLLOW = false;
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
        if (typeof toast === "function") toast("Entrou na sala do Pale Worm compartilhada!", "level");
      }
      window.__PALE_LOBBY_FOLLOW = false;
    } catch (e) { /* ignore */ }
    if (tries > maxTries && window.__PALE_LOBBY_FOLLOW) {
      clearInterval(wait);
      window.__PALE_LOBBY_FOLLOW = false;
      if (typeof toast === "function") toast("Timeout aguardando a sala do Pale Worm.", "bad");
    }
  }, 500);
}

function paleLobbyStartPoll() {
  if (PALE_LOBBY_UI.unsupported) return;
  if (PALE_LOBBY_UI.poll) return;
  PALE_LOBBY_UI.poll = setInterval(() => { paleLobbyRefresh().catch(() => {}); }, 4000);
}

function paleLobbyOnSync(event) {
  const data = (event && event.detail) || {};
  if (data.action === "invite" && data.invite) {
    PALE_LOBBY_UI.inbox = PALE_LOBBY_UI.inbox || [];
    if (!PALE_LOBBY_UI.inbox.some((i) => String(i.id) === String(data.invite.id)))
      PALE_LOBBY_UI.inbox.push(data.invite);
    paleLobbyNotifyInvites();
    if (typeof toast === "function")
      toast(`Convite Pale Worm de <b>${data.invite.fromName}</b>!`, "level");
  }
  if (data.action === "invite-declined" && typeof toast === "function")
    toast(data.msg || "Convite recusado.", "bad");
  if (data.action === "invite-accepted" && typeof toast === "function")
    toast(data.msg || "Jogador entrou no lobby.", "level");
  if (data.lobby) {
    PALE_LOBBY_UI.lobby = data.lobby;
    paleLobbyRenderPanel();
    paleLobbyStartPoll();
  }
  if (data.action === "start") {
    PALE_LOBBY_UI.lobby = data.lobby || PALE_LOBBY_UI.lobby;
    paleLobbyRenderPanel();
    if (data.followCharId) paleLobbyFollowStart(data);
  }
  if (data.action === "takeover") {
    PALE_LOBBY_UI.lobby = data.lobby || PALE_LOBBY_UI.lobby;
    paleLobbyRenderPanel();
    if (typeof toast === "function") toast(data.msg || "Você assumiu a sala do Pale Worm.", "level");
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
    PALE_LOBBY_UI.lobby = null;
    paleLobbyRenderPanel();
    if (data.action !== "left-fight" && typeof toast === "function")
      toast(data.msg || "Lobby Pale Worm encerrado.");
  }
}

function paleLobbyBoot() {
  paleLobbyEnsureDom();
  if (typeof window !== "undefined") {
    window.paleLobbyOpenFromBoss = paleLobbyOpenFromBoss;
    window.paleLobbyStartFight = paleLobbyStartFight;
    window.paleLobbyLeaveFight = paleLobbyLeaveFight;
    window.paleLobbyEjectDeadToTemple = paleLobbyEjectDeadToTemple;
    window.paleLobbyIsActiveFight = paleLobbyIsActiveFight;
    window.addEventListener("tibia-idle-sync-pale-lobby", paleLobbyOnSync);
  }
  setTimeout(() => paleLobbyRefresh().catch(() => {}), 1500);
}

if (typeof document !== "undefined") {
  if (typeof window !== "undefined") {
    window.paleLobbyOpenFromBoss = paleLobbyOpenFromBoss;
    window.paleLobbyStartFight = paleLobbyStartFight;
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", paleLobbyBoot);
  else paleLobbyBoot();
}
