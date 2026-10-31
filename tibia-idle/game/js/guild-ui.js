/*
 * guild-ui.js — modal de GUILDS (mesmo padrão visual do modal CIDADE).
 *
 * Views:
 *   list    → todas as guilds (nome, nível, vagas livres) + CRIAR GUILD
 *             (só para contas sem guild) + convites pendentes;
 *   detail  → painel da guild: nível, exp, líder/vice/membros, ranking de
 *             contribuição e aba TASK GUILD (só membros).
 *
 * A guild é da CONTA: entra 1 personagem e a conta inteira participa.
 */
"use strict";

const GUILD_UI = { view: "list", guildId: null, tab: "members", loading: false };
const GUILD_RANK_LABEL = { leader: "Líder", vice: "Vice-líder", member: "Membro" };
/* Mesmas regras do servidor (guild.js) — exibidas no painel de criação. */
const GUILD_RULES = { CREATE_MIN_LEVEL: 100, CREATE_COST_GOLD: 100000 };
const GUILD_LEVEL_EXP_CLIENT = [0, 10, 25, 40, 60, 85, 120, 160, 250, 400];

function guildOnlineMode() {
  try {
    return typeof accountApiConfigured === "function" && accountApiConfigured() &&
      !!sessionToken() && !!sessionCharId();
  } catch (e) { return false; }
}
function guildApi(method, path, body) {
  const token = sessionToken();
  /* Rotas POST de guild leem body.token (padrão das rotas de party). */
  if (method !== "GET" && body && typeof body === "object" && !body.token)
    body = Object.assign({ token }, body);
  return _api(method, path, body || null, token);
}
function guildEsc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
function guildVocLabel(voc) {
  return (typeof VOCATIONS !== "undefined" && VOCATIONS[voc] && VOCATIONS[voc].name) || voc || "—";
}
function guildMonsterMeta(slug) {
  const m = (typeof GAMEDATA !== "undefined" && GAMEDATA.monsters && GAMEDATA.monsters[slug]) ||
    (typeof MONSTERDATA !== "undefined" && MONSTERDATA[slug]) || null;
  return { name: (m && m.name) || String(slug || "").replace(/-/g, " "), def: m };
}
function guildTaskCard(t) {
  const meta = guildMonsterMeta(t.monster_slug);
  const progress = Math.min(Number(t.target) || 0, Number(t.progress) || 0);
  const pct = t.target ? Math.min(100, Math.floor(progress / t.target * 100)) : 0;
  const img = typeof mobImg === "function" ? mobImg(t.monster_slug, 44) : "";
  return `<div class="guild-task-card${t.done ? " done" : ""}">
    <span class="guild-task-img" aria-hidden="true">${img}</span>
    <span class="guild-task-info">
      <span class="nm">${guildEsc(meta.name)}</span>
      <span class="meta">${progress} / ${t.target} kills</span>
      <span class="guild-task-bar"><i style="width:${pct}%"></i></span>
    </span>
    <span class="guild-task-status">${t.done ? "✔ completa" : pct + "%"}</span>
  </div>`;
}

function openGuildModal(view) {
  if (!G.p) return;
  const modal = $("#modal"), body = $("#modal-body");
  if (typeof clearCityModalShells === "function") clearCityModalShells(body);
  body.classList.remove("hunts-modal-shell", "boss-modal-shell", "world-bosses-modal-shell");
  body.classList.add("guild-modal-shell");
  body.innerHTML = `<div class="panel-title guild-modal-title">
      <span class="guild-btn-icon" aria-hidden="true"></span>
      <span>GUILDS</span>
      <button class="sm" id="guild-modal-back" hidden>◀ Voltar</button>
      <button class="sm" id="guild-modal-close">Fechar</button>
    </div>
    <div class="panel-body" id="guild-modal-list"></div>`;
  modal.classList.add("show");
  $("#guild-modal-close").addEventListener("click", () => {
    modal.classList.remove("show");
    body.classList.remove("guild-modal-shell");
  });
  $("#guild-modal-back").addEventListener("click", () => {
    GUILD_UI.view = "list"; GUILD_UI.guildId = null; loadGuildModal();
  });
  GUILD_UI.view = view || GUILD_UI.view || "list";
  if (GUILD_UI.view === "list") GUILD_UI.guildId = null;
  loadGuildModal();
}

function guildSetBack(visible) {
  const btn = $("#guild-modal-back");
  if (btn) btn.hidden = !visible;
}

async function loadGuildModal() {
  const root = $("#guild-modal-list");
  if (!root) return;
  if (!guildOnlineMode()) {
    root.innerHTML = `<div class="hunt-section-empty">Guilds estão disponíveis apenas no modo online (servidor).</div>`;
    return;
  }
  root.innerHTML = `<div class="tiny dim" style="padding:8px">Carregando…</div>`;
  if (GUILD_UI.view === "detail" && GUILD_UI.guildId) return loadGuildDetail();
  return loadGuildList();
}

/* ------------------------------ LISTA DE GUILDS ------------------------------ */
async function loadGuildList() {
  const root = $("#guild-modal-list");
  if (!root) return;
  guildSetBack(false);
  const [state, list] = await Promise.all([
    guildApi("GET", `/api/guild/state?char_id=${encodeURIComponent(sessionCharId())}`),
    guildApi("GET", "/api/guilds"),
  ]);
  const myGuild = state && state.data && state.data.ok ? state.data.guild : null;
  const invites = (state && state.data && state.data.invites) || [];
  const guilds = (list && list.data && list.data.guilds) || [];

  const inviteHtml = invites.length ? `<section class="guild-section">
    <div class="hunt-cat-title">Convites pendentes</div>
    <div class="guild-invite-list">${invites.map((inv) => `
      <div class="guild-invite-row">
        <span><b>${guildEsc(inv.guild_name)}</b> convidou você${inv.inviter_name ? ` (por ${guildEsc(inv.inviter_name)})` : ""}</span>
        <span class="guild-invite-actions">
          <button class="sm primary" data-guild-accept="${inv.id}">Aceitar</button>
          <button class="sm" data-guild-decline="${inv.id}">Recusar</button>
        </span>
      </div>`).join("")}</div>
  </section>` : "";

  const myBanner = myGuild ? `<section class="guild-section">
    <div class="hunt-cat-title">Sua guild</div>
    <button type="button" class="hunt-card hunt-modal-card hunt-canary-card guild-card" data-guild-open="${myGuild.id}">
      <span class="mobs" aria-hidden="true"><span class="guild-btn-icon guild-card-icon"></span></span>
      <span class="info">
        <span class="nm">${guildEsc(myGuild.name)} <b>Nv ${myGuild.level}</b></span>
        <span class="meta">${myGuild.members}/${myGuild.slots} vagas · ${myGuild.freeSlots} livres</span>
      </span>
      <span class="risk low">Abrir</span>
    </button>
  </section>` : "";

  const createHtml = !myGuild ? `<section class="guild-section">
    <div class="hunt-cat-title">Fundar guild</div>
    <div class="guild-create-box">
      <input id="guild-create-name" maxlength="30" placeholder="Nome da guild" />
      <button class="sm primary" id="guild-create-btn">CRIAR GUILD</button>
      <div class="tiny dim">Requisitos: nível ${typeof GUILD_RULES !== "undefined" ? GUILD_RULES.CREATE_MIN_LEVEL : 100}+ e
        ${(typeof GUILD_RULES !== "undefined" ? GUILD_RULES.CREATE_COST_GOLD : 100000).toLocaleString("pt-BR")} gold da conta.</div>
      <div class="tiny" id="guild-create-msg"></div>
    </div>
  </section>` : "";

  const listHtml = `<section class="guild-section">
    <div class="hunt-cat-title">Guilds ativas (${guilds.length})</div>
    <div class="hunts-group">${guilds.length ? guilds.map((g) => `
      <button type="button" class="hunt-card hunt-modal-card hunt-canary-card guild-card" data-guild-open="${g.id}">
        <span class="mobs" aria-hidden="true"><span class="guild-btn-icon guild-card-icon"></span></span>
        <span class="info">
          <span class="nm">${guildEsc(g.name)} <b>Nv ${g.level}</b></span>
          <span class="meta">${g.members}/${g.slots} vagas · ${g.freeSlots} livres</span>
        </span>
        <span class="risk ${g.freeSlots > 0 ? "low" : "high"}">${g.freeSlots > 0 ? "recrutando" : "cheia"}</span>
      </button>`).join("") : `<div class="hunt-section-empty">Nenhuma guild criada ainda.</div>`}</div>
  </section>`;

  root.innerHTML = inviteHtml + myBanner + createHtml + listHtml;

  $$("#guild-modal-list [data-guild-open]").forEach((btn) => {
    btn.addEventListener("click", () => {
      GUILD_UI.view = "detail"; GUILD_UI.guildId = Number(btn.dataset.guildOpen);
      GUILD_UI.tab = "members"; loadGuildModal();
    });
  });
  $$("#guild-modal-list [data-guild-accept]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const r = await guildApi("POST", "/api/guild/accept",
        { char_id: Number(sessionCharId()), invite_id: Number(btn.dataset.guildAccept) });
      if (typeof guildToast === "function") guildToast(r && r.data && r.data.msg);
      loadGuildModal();
    });
  });
  $$("#guild-modal-list [data-guild-decline]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await guildApi("POST", "/api/guild/decline",
        { char_id: Number(sessionCharId()), invite_id: Number(btn.dataset.guildDecline) });
      loadGuildModal();
    });
  });
  const createBtn = $("#guild-create-btn");
  if (createBtn) createBtn.addEventListener("click", async () => {
    const name = ($("#guild-create-name") || {}).value || "";
    createBtn.disabled = true;
    const r = await guildApi("POST", "/api/guild/create",
      { char_id: Number(sessionCharId()), name });
    createBtn.disabled = false;
    const msg = $("#guild-create-msg");
    const text = (r && r.data && (r.data.msg || r.data.error)) || "Erro ao criar guild.";
    if (r && r.data && r.data.ok) { loadGuildModal(); return; }
    if (msg) msg.textContent = text;
  });
}

/* ------------------------------ PAINEL DA GUILD ------------------------------ */
function guildExpBarHtml(guild) {
  if (!guild.nextLevelExp) return `<div class="tiny dim">Nível máximo</div>`;
  const prev = guild.exp - 0; // exp absoluta
  const base = guild.level > 1 ? (typeof GUILD_LEVEL_EXP_CLIENT !== "undefined" ?
    GUILD_LEVEL_EXP_CLIENT[guild.level - 1] : 0) : 0;
  const span = Math.max(1, guild.nextLevelExp - base);
  const pct = Math.max(0, Math.min(100, Math.floor((guild.exp - base) / span * 100)));
  return `<div class="guild-exp-bar" title="${guild.exp}/${guild.nextLevelExp} pontos">
    <i style="width:${pct}%"></i>
    <span>${guild.exp} / ${guild.nextLevelExp} EXP</span>
  </div>`;
}

async function loadGuildDetail() {
  const root = $("#guild-modal-list");
  if (!root) return;
  guildSetBack(true);
  const r = await guildApi("GET",
    `/api/guild/detail?id=${GUILD_UI.guildId}&char_id=${encodeURIComponent(sessionCharId())}`);
  const data = r && r.data;
  if (!data || !data.ok || !data.guild) {
    root.innerHTML = `<div class="hunt-section-empty">${guildEsc(data && data.msg || "Guild não encontrada.")}</div>`;
    return;
  }
  const g = data.guild, members = data.members || [], tasks = data.tasks || [];
  const myRank = data.myRank;
  const canManage = myRank === "leader" || myRank === "vice";
  const isMember = !!myRank;

  const tabs = [
    { id: "members", label: "MEMBROS" },
    { id: "ranking", label: "RANKING TASK" },
  ];
  if (isMember) tabs.push({ id: "tasks", label: "TASK GUILD" });

  let contentHtml = "";
  if (GUILD_UI.tab === "ranking") {
    const ranked = members.slice().sort((a, b) =>
      (Number(b.contribution) || 0) - (Number(a.contribution) || 0));
    contentHtml = `<div class="guild-member-list">${ranked.map((m, i) => `
      <div class="guild-member-row">
        <span class="guild-member-pos">#${i + 1}</span>
        <span class="guild-member-name">${guildEsc(m.name)}</span>
        <span class="tiny dim">${guildVocLabel(m.voc)} · Nv ${m.level}</span>
        <span class="guild-member-rank">${GUILD_RANK_LABEL[m.rank] || "Membro"}</span>
        <span class="guild-member-contrib"><b>${Number(m.contribution) || 0}</b> tasks</span>
      </div>`).join("") || `<div class="hunt-section-empty">Sem membros.</div>`}</div>`;
  } else if (GUILD_UI.tab === "tasks" && isMember) {
    contentHtml = `<div class="tiny dim" style="margin-bottom:6px">
      3 tasks por server save · cada task completada dá <b>+1 EXP</b> à guild.</div>
      <div class="guild-task-list">${tasks.map(guildTaskCard).join("") ||
        `<div class="hunt-section-empty">Sem tasks hoje.</div>`}</div>`;
  } else {
    contentHtml = `<div class="guild-member-list">${members.map((m) => {
      const isLeader = m.rank === "leader", isVice = m.rank === "vice";
      const actions = canManage && !isLeader ? `
        <span class="guild-member-actions">
          ${myRank === "leader" ? `<button class="sm" data-guild-promote="${m.account_id}"
            title="${isVice ? "Rebaixar a membro" : "Promover a vice-líder"}">${isVice ? "⬇" : "⭐"}</button>` : ""}
          ${(myRank === "leader" || (myRank === "vice" && m.rank === "member")) ? `
            <button class="sm" data-guild-kick="${m.account_id}" title="Expulsar">✖</button>` : ""}
        </span>` : "";
      return `<div class="guild-member-row">
        <span class="guild-member-name">${isLeader ? "👑 " : isVice ? "⭐ " : ""}${guildEsc(m.name)}</span>
        <span class="tiny dim">${guildVocLabel(m.voc)} · Nv ${m.level}</span>
        <span class="guild-member-rank">${GUILD_RANK_LABEL[m.rank] || "Membro"}</span>
        <span class="guild-member-contrib">${Number(m.contribution) || 0} tasks</span>
        ${actions}
      </div>`;
    }).join("") || `<div class="hunt-section-empty">Sem membros.</div>`}</div>`;
  }

  const inviteBox = canManage ? `<div class="guild-invite-box">
      <input id="guild-invite-name" placeholder="Nome do personagem" />
      <button class="sm" id="guild-invite-btn">Convidar</button>
      <span class="tiny" id="guild-invite-msg"></span>
    </div>` : "";
  const leaveBtn = isMember ? `<button class="sm" id="guild-leave-btn">
      ${myRank === "leader" ? "Sair / passar liderança" : "Sair da guild"}</button>` : "";

  root.innerHTML = `<section class="guild-section guild-head">
      <div class="hunt-cat-title">${guildEsc(g.name)} — Nível ${g.level}</div>
      <div class="tiny dim">${g.members}/${g.slots} vagas · ${g.freeSlots} livres · ${g.exp} EXP</div>
      ${guildExpBarHtml(g)}
    </section>
    <div class="guild-tabs">${tabs.map((tab) =>
      `<button type="button" class="guild-tab${GUILD_UI.tab === tab.id ? " active" : ""}"
        data-guild-tab="${tab.id}">${tab.label}</button>`).join("")}</div>
    ${contentHtml}
    ${inviteBox}${leaveBtn}`;

  $$("#guild-modal-list [data-guild-tab]").forEach((btn) => {
    btn.addEventListener("click", () => { GUILD_UI.tab = btn.dataset.guildTab; loadGuildDetail(); });
  });
  $$("#guild-modal-list [data-guild-kick]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (typeof confirm === "function" && !confirm("Expulsar este membro da guild?")) return;
      await guildApi("POST", "/api/guild/kick",
        { char_id: Number(sessionCharId()), member_account_id: Number(btn.dataset.guildKick) });
      loadGuildDetail();
    });
  });
  $$("#guild-modal-list [data-guild-promote]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await guildApi("POST", "/api/guild/promote",
        { char_id: Number(sessionCharId()), member_account_id: Number(btn.dataset.guildPromote) });
      loadGuildDetail();
    });
  });
  const invBtn = $("#guild-invite-btn");
  if (invBtn) invBtn.addEventListener("click", async () => {
    const name = ($("#guild-invite-name") || {}).value || "";
    invBtn.disabled = true;
    const r = await guildApi("POST", "/api/guild/invite",
      { char_id: Number(sessionCharId()), invitee_name: name });
    invBtn.disabled = false;
    const msg = $("#guild-invite-msg");
    if (msg) msg.textContent = (r && r.data && (r.data.msg || r.data.error)) || "Erro ao convidar.";
  });
  const leaveBtnEl = $("#guild-leave-btn");
  if (leaveBtnEl) leaveBtnEl.addEventListener("click", async () => {
    const warn = myRank === "leader"
      ? "Sair da guild? A liderança passa ao vice/membro mais antigo (ou a guild é dissolvida se você for o último)."
      : "Sair da guild?";
    if (typeof confirm === "function" && !confirm(warn)) return;
    const r = await guildApi("POST", "/api/guild/leave", { char_id: Number(sessionCharId()) });
    if (typeof guildToast === "function") guildToast(r && r.data && r.data.msg);
    GUILD_UI.view = "list"; GUILD_UI.guildId = null; loadGuildModal();
  });
}

function guildToast(msg) {
  if (!msg) return;
  if (typeof toast === "function") { toast(msg); return; }
  try { console.log("[guild]", msg); } catch (e) {}
}
