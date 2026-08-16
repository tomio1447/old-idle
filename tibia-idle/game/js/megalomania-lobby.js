/*
 * megalomania-lobby.js — lobby modal (esquerda), convites "!", select char
 * no templo e start 1–5 jogadores (1 char cada) para Goshnar's Megalomania.
 */
"use strict";

const MEGA_LOBBY_UI = {
  lobby: null,
  inbox: [],
  poll: null,
  panel: null,
  inviteBtn: null,
  acceptModal: null,
  pendingInvite: null,
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
  if (n > 0) {
    btn.style.display = "block";
    btn.innerHTML = "!" + (n > 1 ? `<span class="mega-lobby-invite-count">${n}</span>` : "");
  } else btn.style.display = "none";
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
  const r = await megaLobbyApi("GET", "/api/mega-lobby/state");
  if (!r.data || !r.data.ok) return;
  MEGA_LOBBY_UI.lobby = r.data.lobby || null;
  MEGA_LOBBY_UI.inbox = r.data.inbox || [];
  megaLobbyRenderInviteBadge();
  megaLobbyRenderPanel();
}

async function megaLobbyOpenFromBoss() {
  if (!megaLobbyInTemple()) {
    if (typeof toast === "function") toast("Vá ao templo para abrir o lobby do Megalomania.", "bad");
    return;
  }
  if (typeof partyIsMember === "function" && partyIsMember()) {
    if (typeof toast === "function") toast("Saia da Party antes de abrir o lobby.", "bad");
    return;
  }
  if (typeof partyIsLeader === "function" && partyIsLeader()) {
    if (typeof toast === "function") toast("Saia da Party antes de abrir o lobby.", "bad");
    return;
  }
  const charId = typeof sessionCharId === "function" ? sessionCharId() : (G.p && G.p.id);
  if (!charId) {
    if (typeof toast === "function") toast("Selecione um personagem no templo.", "bad");
    return;
  }
  // Modal: confirmar personagem ativo
  const ok = await megaLobbyConfirmCharModal(charId, "Abrir lobby como líder");
  if (!ok) return;
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

function megaLobbyOpenInbox() {
  const inbox = MEGA_LOBBY_UI.inbox || [];
  if (!inbox.length) return;
  const modal = $("#modal"), body = $("#modal-body");
  if (!modal || !body) return;
  body.innerHTML = `<div class="panel-title">Convites Megalomania
    <button class="sm" id="mega-inbox-close">✕</button></div>
    <div class="panel-body">${inbox.map((inv) => `
      <div class="mega-lobby-inbox-row">
        <div><b>${inv.fromName}</b> convidou você
          <div class="tiny dim">dica: ${inv.toHintName || ""}</div></div>
        <div class="mega-lobby-inbox-actions">
          <button class="sm primary" data-mega-accept="${inv.id}">Aceitar</button>
          <button class="sm" data-mega-decline="${inv.id}">Recusar</button>
        </div>
      </div>`).join("")}</div>`;
  modal.classList.add("show");
  $("#mega-inbox-close").onclick = () => modal.classList.remove("show");
  body.querySelectorAll("[data-mega-accept]").forEach((btn) => {
    btn.onclick = async () => {
      modal.classList.remove("show");
      await megaLobbyAccept(btn.getAttribute("data-mega-accept"));
    };
  });
  body.querySelectorAll("[data-mega-decline]").forEach((btn) => {
    btn.onclick = async () => {
      await megaLobbyApi("POST", "/api/mega-lobby/decline", { invite_id: btn.getAttribute("data-mega-decline") });
      await megaLobbyRefresh();
      modal.classList.remove("show");
      if (typeof toast === "function") toast("Convite recusado.");
    };
  });
}

async function megaLobbyAccept(inviteId) {
  if (!megaLobbyInTemple()) {
    if (typeof toast === "function") toast("Vá ao templo para aceitar o convite.", "bad");
    return;
  }
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
  megaLobbyRenderInviteBadge();
  megaLobbyRenderPanel();
  megaLobbyStartPoll();
  if (typeof toast === "function") toast("Você entrou no lobby Megalomania!", "level");
}

async function megaLobbyStartFight() {
  if (!megaLobbyInTemple()) {
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
    startBoss("goshnar-s-megalomania", false);
    // Após persistência da instância, vincula o share.
    setTimeout(async () => {
      const id = typeof ACCOUNT_INSTANCE !== "undefined" && ACCOUNT_INSTANCE && ACCOUNT_INSTANCE.id;
      if (id) {
        await megaLobbyApi("POST", "/api/mega-lobby/bind", { instance_id: id });
      }
      window.__MEGA_LOBBY_STARTING = false;
    }, 800);
  }
}

async function megaLobbyFollowStart(detail) {
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
  const wait = setInterval(async () => {
    tries++;
    try {
      const r = await megaLobbyApi("GET", "/api/mega-lobby/state");
      if (r.data && r.data.lobby && r.data.lobby.instanceId) {
        clearInterval(wait);
        const token = typeof sessionToken === "function" ? sessionToken() : "";
        if (token && typeof accountLoadInstance === "function") {
          await accountLoadInstance(token);
        }
        window.__MEGA_LOBBY_FOLLOW = false;
      }
    } catch (e) { /* ignore */ }
    if (tries > 40) {
      clearInterval(wait);
      window.__MEGA_LOBBY_FOLLOW = false;
      if (typeof toast === "function") toast("Timeout aguardando a sala Megalomania.", "bad");
    }
  }, 500);
}

function megaLobbyStartPoll() {
  if (MEGA_LOBBY_UI.poll) return;
  MEGA_LOBBY_UI.poll = setInterval(() => { megaLobbyRefresh().catch(() => {}); }, 4000);
}

function megaLobbyOnSync(event) {
  const data = (event && event.detail) || {};
  if (data.action === "invite" && data.invite) {
    MEGA_LOBBY_UI.inbox = MEGA_LOBBY_UI.inbox || [];
    if (!MEGA_LOBBY_UI.inbox.some((i) => String(i.id) === String(data.invite.id)))
      MEGA_LOBBY_UI.inbox.push(data.invite);
    megaLobbyRenderInviteBadge();
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
  if (data.action === "closed" || data.action === "kicked") {
    MEGA_LOBBY_UI.lobby = null;
    megaLobbyRenderPanel();
    if (typeof toast === "function") toast(data.msg || "Lobby Megalomania encerrado.");
  }
}

function megaLobbyBoot() {
  megaLobbyEnsureDom();
  if (typeof window !== "undefined") {
    window.addEventListener("tibia-idle-sync-mega-lobby", megaLobbyOnSync);
  }
  setTimeout(() => megaLobbyRefresh().catch(() => {}), 1500);
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", megaLobbyBoot);
  else megaLobbyBoot();
}
