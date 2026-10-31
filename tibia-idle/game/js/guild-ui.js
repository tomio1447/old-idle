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

const GUILD_UI = { view: "list", guildId: null, tab: "members", loading: false,
  logFilter: "", logData: null };
const GUILD_RANK_LABEL = { leader: "Líder", vice: "Vice-líder", member: "Membro" };
const GUILD_BONUS_LEVEL_GOLD_UI = 50000000; /* 50kk por nível (server: guild.js) */
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
const GUILD_ICON_COUNT_UI = 10;
function guildIconSrc(n) {
  const i = Math.max(1, Math.min(GUILD_ICON_COUNT_UI, Math.floor(Number(n) || 1)));
  return `/imagens/guildicons/${i}.png`;
}
function guildIconImg(n, cls) {
  return `<img class="guild-icon-img${cls ? " " + cls : ""}" src="${guildIconSrc(n)}" alt="" draggable="false" />`;
}
function guildIconPickHtml(sel, idAttr) {
  return `<div class="guild-icon-pick"${idAttr ? ` id="${idAttr}"` : ""}>${
    Array.from({ length: GUILD_ICON_COUNT_UI }, (_, i) => i + 1).map((n) =>
      `<button type="button" class="guild-icon-opt${n === sel ? " on" : ""}" data-guild-icon="${n}"
        title="Ícone ${n}">${guildIconImg(n)}</button>`).join("")}</div>`;
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
      <span class="mobs" aria-hidden="true">${guildIconImg(myGuild.icon, "guild-card-icon")}</span>
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
      <div class="tiny dim">Escolha o ícone da guild:</div>
      ${guildIconPickHtml(GUILD_UI.createIcon || 1, "guild-create-icons")}
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
        <span class="mobs" aria-hidden="true">${guildIconImg(g.icon, "guild-card-icon")}</span>
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
  $$("#guild-create-icons [data-guild-icon]").forEach((btn) => {
    btn.addEventListener("click", () => {
      GUILD_UI.createIcon = Number(btn.dataset.guildIcon);
      $$("#guild-create-icons .guild-icon-opt").forEach((b) =>
        b.classList.toggle("on", Number(b.dataset.guildIcon) === GUILD_UI.createIcon));
    });
  });
  const createBtn = $("#guild-create-btn");
  if (createBtn) createBtn.addEventListener("click", async () => {
    const name = ($("#guild-create-name") || {}).value || "";
    createBtn.disabled = true;
    const r = await guildApi("POST", "/api/guild/create",
      { char_id: Number(sessionCharId()), name, icon: GUILD_UI.createIcon || 1 });
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

function guildGoldFmt(n) {
  const v = Math.max(0, Number(n) || 0);
  if (v >= 1e6) return (v / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 2 }) + " kk";
  return v.toLocaleString("pt-BR") + " gp";
}
function guildTimeLeft(until) {
  const ms = Math.max(0, Number(until) - Date.now());
  const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000);
  return h > 0 ? `${h}h${String(m).padStart(2, "0")}m` : `${Math.max(1, m)}m`;
}
/* GUILD SHOP — bônus por nível (nível N custa N GP + 50kk do caixa)
 * + BÔNUS TEMPORÁRIO (24h; 125kk do caixa + 1 insígnia PvP da conta). */
function guildShopHtml(g, shop, isLeader, tempShop, insignias) {
  const levels = g.bonuses || {};
  const temp = g.tempBonuses || {};
  const head = `<div class="guild-balance-head">
    <span><b>${Number(g.points) || 0}</b> guild points</span>
    <span>Caixa: <b>${guildGoldFmt(g.balance)}</b></span>
    <span><b>${Number(insignias) || 0}</b> insígnias PvP</span>
  </div>
  ${!isLeader ? `<div class="tiny dim" style="margin:4px 0">Apenas líderes podem comprar com o caixa da guild.</div>` : ""}`;
  return head + `<div class="guild-shop-list">${shop.map((def) => {
    const lv = Math.max(0, Math.min(def.maxLevel || 10, Number(levels[def.id]) || 0));
    const maxed = lv >= (def.maxLevel || 10);
    const next = lv + 1;
    const costPts = next;
    const val = (def.perLevel * lv).toLocaleString("pt-BR", { maximumFractionDigits: 1 });
    const nextVal = (def.perLevel * next).toLocaleString("pt-BR", { maximumFractionDigits: 1 });
    const pips = Array.from({ length: def.maxLevel || 10 }, (_, i) =>
      `<i class="guild-pip${i < lv ? " on" : ""}"></i>`).join("");
    const afford = (Number(g.points) || 0) >= costPts && (Number(g.balance) || 0) >= GUILD_BONUS_LEVEL_GOLD_UI;
    return `<div class="guild-shop-row${maxed ? " maxed" : ""}">
      <span class="guild-shop-info">
        <span class="nm">${guildEsc(def.label)} <b>${val}${def.unit}</b></span>
        <span class="guild-pips">${pips}</span>
        <span class="meta">${maxed ? "nível máximo"
          : `Nv ${next} → ${nextVal}${def.unit} · custo: ${costPts} GP + ${guildGoldFmt(GUILD_BONUS_LEVEL_GOLD_UI)}`}</span>
      </span>
      ${isLeader && !maxed ? `<button class="sm primary" data-guild-buy="${def.id}"${afford ? "" : " disabled"}>Comprar</button>` : ""}
    </div>`;
  }).join("")}</div>
  <div class="hunt-cat-title" style="margin-top:10px">Bônus temporário (24h)</div>
  <div class="guild-shop-list">${(tempShop || []).map((def) => {
    const until = Number(temp[def.id]) || 0, active = until > Date.now();
    const afford = (Number(g.balance) || 0) >= def.gold &&
      (Number(insignias) || 0) >= def.insignias;
    return `<div class="guild-shop-row${active ? " maxed" : ""}">
      <span class="guild-shop-info">
        <span class="nm">${guildEsc(def.label)} <b>+${def.pct}%</b></span>
        <span class="meta">${active ? `ativo — restam ${guildTimeLeft(until)}`
          : `dura ${def.hours}h · custo: ${guildGoldFmt(def.gold)} + ${def.insignias} insígnia PvP`}</span>
      </span>
      ${isLeader ? (active
        ? `<span class="guild-temp-active">ATIVO</span>`
        : `<button class="sm primary" data-guild-buy-temp="${def.id}"${afford ? "" : " disabled"}>Ativar</button>`) : ""}
    </div>`;
  }).join("")}</div>`;
}
/* GUILD BALANCE — caixa + doações de gold e Tibia Coins (qualquer
 * membro). Coins ficam reservados a futuras batalhas PvP. */
function guildBalanceHtml(g, totals, accountCoins) {
  const t = totals || { donated: 0, spentGold: 0, spentPoints: 0, coinsDonated: 0, spentCoins: 0 };
  return `<div class="guild-balance-head">
      <span>Caixa: <b>${guildGoldFmt(g.balance)}</b></span>
      <span><b>${Number(g.points) || 0}</b> guild points</span>
      <span><b>${Number(g.coins) || 0}</b> Tibia Coins</span>
    </div>
    <div class="tiny dim" style="margin:4px 0 8px">
      O caixa é restrito a líderes (até 3) — usado nas compras do GUILD SHOP.
      Os Tibia Coins da guild ficam reservados para futuras batalhas PvP.
      Doações são irreversíveis.</div>
    <div class="guild-donate-box">
      <input id="guild-donate-amount" type="number" min="1" step="1" placeholder="Quantidade de gold" />
      <button class="sm primary" id="guild-donate-btn">Doar</button>
      <span class="tiny" id="guild-donate-msg"></span>
    </div>
    <div class="guild-donate-box">
      <input id="guild-donate-coins-amount" type="number" min="1" step="1" placeholder="Tibia Coins (você tem ${Number(accountCoins) || 0})" />
      <button class="sm primary" id="guild-donate-coins-btn">Doar TC</button>
      <span class="tiny" id="guild-donate-coins-msg"></span>
    </div>
    <div class="guild-balance-stats">
      <span>Total doado: <b>${guildGoldFmt(t.donated)}</b> · <b>${Number(t.coinsDonated) || 0} TC</b></span>
      <span>Total gasto: <b>${guildGoldFmt(t.spentGold)}</b> · <b>${Number(t.spentPoints) || 0} GP</b> · <b>${Number(t.spentCoins) || 0} TC</b></span>
    </div>`;
}
/* HISTÓRICO — contabilidade (só membros). */
function guildLogHtml(entries, totals) {
  const t = totals || {};
  const sum = `<div class="guild-balance-stats" style="margin-bottom:6px">
    <span>Doações: <b>${guildGoldFmt(t.donated)}</b> · <b>${Number(t.coinsDonated) || 0} TC</b> (${Number(t.donations) || 0})</span>
    <span>Gastos: <b>${guildGoldFmt(t.spentGold)}</b> · <b>${Number(t.spentPoints) || 0} GP</b> · <b>${Number(t.spentCoins) || 0} TC</b> (${Number(t.purchases) || 0})</span>
  </div>`;
  const filter = `<select id="guild-log-filter" class="guild-log-filter">
    <option value=""${GUILD_UI.logFilter === "" ? " selected" : ""}>Todas</option>
    <option value="donation"${GUILD_UI.logFilter === "donation" ? " selected" : ""}>Doações</option>
    <option value="purchase"${GUILD_UI.logFilter === "purchase" ? " selected" : ""}>Compras</option>
  </select>`;
  const rows = (entries || []).map((e) => {
    const when = e.created_at ? new Date(e.created_at).toLocaleString("pt-BR",
      { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "";
    const gold = Number(e.gold_delta) || 0, pts = Number(e.points_delta) || 0;
    const cns = Number(e.coins_delta) || 0;
    return `<div class="guild-log-row ${e.category}">
      <span class="guild-log-when">${when}</span>
      <span class="guild-log-cat">${e.category === "donation" ? "Doação" : "Compra"}</span>
      <span class="guild-log-info"><b>${guildEsc(e.char_name)}</b> ${guildEsc(e.detail)}</span>
      <span class="guild-log-val">${gold ? (gold > 0 ? "+" : "−") + guildGoldFmt(Math.abs(gold)) : ""}${pts ? ` ${pts > 0 ? "+" : "−"}${Math.abs(pts)} GP` : ""}${cns ? ` ${cns > 0 ? "+" : "−"}${Math.abs(cns)} TC` : ""}</span>
    </div>`;
  }).join("");
  return sum + filter + `<div class="guild-log-list">${rows ||
    `<div class="hunt-section-empty">Sem movimentações.</div>`}</div>`;
}
async function loadGuildLog() {
  if (GUILD_UI.tab !== "history") return;
  const cat = GUILD_UI.logFilter ? `&category=${GUILD_UI.logFilter}` : "";
  const r = await guildApi("GET",
    `/api/guild/log?char_id=${encodeURIComponent(sessionCharId())}${cat}`);
  const data = r && r.data;
  const host = document.querySelector("#guild-modal-list .guild-log-host");
  if (!host) return;
  host.innerHTML = data && data.ok
    ? guildLogHtml(data.entries, data.totals)
    : `<div class="hunt-section-empty">${guildEsc(data && data.msg || "Erro ao carregar.")}</div>`;
  const sel = $("#guild-log-filter");
  if (sel) sel.addEventListener("change", () => { GUILD_UI.logFilter = sel.value; loadGuildLog(); });
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
  const shop = data.shop || [], tempShop = data.tempShop || [];
  const logTotals = data.logTotals || null;
  const insignias = Number(data.insignias) || 0;
  const myRank = data.myRank;
  const canManage = myRank === "leader" || myRank === "vice";
  const isLeader = myRank === "leader";
  const isMember = !!myRank;

  const tabs = [
    { id: "members", label: "MEMBROS" },
    { id: "ranking", label: "RANKING TASK" },
  ];
  if (isMember) tabs.push(
    { id: "tasks", label: "TASK GUILD" },
    { id: "shop", label: "GUILD SHOP" },
    { id: "balance", label: "GUILD BALANCE" },
    { id: "history", label: "HISTÓRICO" },
    { id: "pvp", label: "PVP" });

  let contentHtml = "";
  if (GUILD_UI.tab === "ranking") {
    const ranked = members.slice().sort((a, b) =>
      (Number(b.contribution) || 0) - (Number(a.contribution) || 0));
    contentHtml = `<div class="guild-member-list">${ranked.map((m, i) => `
      <div class="guild-member-row">
        <span class="guild-member-pos">#${i + 1}</span>
        <span class="guild-member-name guild-profile-link" data-char-profile="${m.character_id}">${guildEsc(m.name)}</span>
        <span class="tiny dim">${guildVocLabel(m.voc)} · Nv ${m.level}</span>
        <span class="guild-member-rank">${GUILD_RANK_LABEL[m.rank] || "Membro"}</span>
        <span class="guild-member-contrib"><b>${Number(m.contribution) || 0}</b> tasks</span>
      </div>`).join("") || `<div class="hunt-section-empty">Sem membros.</div>`}</div>`;
  } else if (GUILD_UI.tab === "tasks" && isMember) {
    contentHtml = `<div class="tiny dim" style="margin-bottom:6px">
      3 tasks por server save · cada task completada dá <b>+1 EXP</b> e <b>+1 GUILD POINT</b> à guild.</div>
      <div class="guild-task-list">${tasks.map(guildTaskCard).join("") ||
        `<div class="hunt-section-empty">Sem tasks hoje.</div>`}</div>`;
  } else if (GUILD_UI.tab === "shop" && isMember) {
    contentHtml = guildShopHtml(g, shop, isLeader, tempShop, insignias);
  } else if (GUILD_UI.tab === "pvp" && isMember) {
    contentHtml = `<div class="guild-pvp-locked">
      <span class="guild-pvp-icon" aria-hidden="true">⚔</span>
      <span class="nm">PVP DA GUILD</span>
      <span class="meta">Sistema em desenvolvimento — em breve guerras entre
        guilds e recompensas em insígnias PvP.</span>
    </div>`;
  } else if (GUILD_UI.tab === "balance" && isMember) {
    contentHtml = guildBalanceHtml(g, logTotals, data.accountCoins);
  } else if (GUILD_UI.tab === "history" && isMember) {
    contentHtml = `<div class="guild-log-host">
      <div class="tiny dim" style="padding:8px">Carregando histórico…</div></div>`;
  } else {
    contentHtml = `<div class="guild-member-list">${members.map((m) => {
      const rank = m.rank, isLeaderRow = rank === "leader", isVice = rank === "vice";
      const acc = typeof sessionAccount === "function" ? sessionAccount() : null;
      const isSelf = acc && Number(m.account_id) === Number(acc.id);
      /* Servidor: líder promove/rebaixa/expulsa não-líderes (e rebaixa
       * outros líderes); vice só expulsa membros comuns. */
      const actions = isLeader ? `
        <span class="guild-member-actions">
          ${!isLeaderRow ? `<button class="sm" data-guild-promote="${m.account_id}"
            title="${isVice ? "Promover a líder" : "Promover a vice-líder"}">⭐</button>` : ""}
          ${!isSelf && rank !== "member" ? `<button class="sm" data-guild-demote="${m.account_id}"
            title="${isLeaderRow ? "Rebaixar a vice-líder" : "Rebaixar a membro"}">⬇</button>` : ""}
          ${!isSelf && !isLeaderRow ? `<button class="sm" data-guild-kick="${m.account_id}" title="Expulsar">✖</button>` : ""}
        </span>` : (myRank === "vice" && rank === "member" ? `
        <span class="guild-member-actions">
          <button class="sm" data-guild-kick="${m.account_id}" title="Expulsar">✖</button>
        </span>` : "");
      return `<div class="guild-member-row">
        <span class="guild-member-name guild-profile-link" data-char-profile="${m.character_id}">${isLeaderRow ? "👑 " : isVice ? "⭐ " : ""}${guildEsc(m.name)}</span>
        <span class="tiny dim">${guildVocLabel(m.voc)} · Nv ${m.level}</span>
        <span class="guild-member-rank">${GUILD_RANK_LABEL[rank] || "Membro"}</span>
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

  /* SOLICITAÇÕES DE ENTRADA — líder/vice veem o botão; pisca verde↔vermelho
   * enquanto houver pedido pendente. */
  const reqs = data.requests || [];
  const requestsBox = canManage ? `<section class="guild-section">
    <button type="button" class="sm guild-req-toggle${reqs.length ? " has-pending" : ""}"
      id="guild-req-toggle">SOLICITAÇÕES${reqs.length ? ` (${reqs.length})` : ""}</button>
    <div class="guild-req-list" id="guild-req-list" style="display:none">
      ${reqs.map((r) => `<div class="guild-req-row">
        <span class="guild-member-name guild-profile-link" data-char-profile="${r.character_id}">${guildEsc(r.name)}</span>
        <span class="tiny dim">${guildVocLabel(r.voc)} · Nv ${r.level}</span>
        <span class="guild-invite-actions">
          <button class="sm primary" data-guild-req-accept="${r.id}">Aceitar</button>
          <button class="sm" data-guild-req-decline="${r.id}">Recusar</button>
        </span>
      </div>`).join("") || `<div class="tiny dim" style="padding:6px 0">Sem solicitações pendentes.</div>`}
    </div>
  </section>` : "";

  /* Não-membro: botão para pedir entrada (ou cancelar o pedido). */
  const joinBox = !isMember ? `<div class="guild-join-box">
      ${data.myRequest
        ? `<button class="sm" id="guild-req-cancel">Cancelar solicitação</button>
           <span class="tiny dim">Aguardando um líder decidir.</span>`
        : (Number(g.freeSlots) || 0) > 0
          ? `<button class="sm primary" id="guild-req-join">Solicitar entrada na guild</button>`
          : `<span class="tiny dim">Guild sem vagas no momento.</span>`}
      <span class="tiny" id="guild-req-msg"></span>
    </div>` : "";

  /* GERENCIAMENTO (só líder): troca de ícone 1x/24h + renomear por
   * Tibia Coins do caixa de coins da guild. */
  const iconCooldown = Number(data.iconCooldownMs) || 24 * 3600 * 1000;
  const renameCost = Number(data.renameCostCoins) || 250;
  const iconWait = (Number(g.iconAt) || 0) + iconCooldown - Date.now();
  const guildCoins = Number(g.coins) || 0;
  const manageBox = isLeader ? `<section class="guild-section guild-manage-box">
    <div class="hunt-cat-title">Gerenciamento</div>
    <div class="guild-manage-row">
      <span class="tiny">Ícone:</span>
      ${iconWait > 0
        ? `${guildIconImg(g.icon)}<span class="tiny dim">troca liberada em ${guildTimeLeft(Number(g.iconAt) + iconCooldown)}</span>`
        : guildIconPickHtml(Math.max(1, Number(g.icon) || 1), "guild-manage-icons")}
    </div>
    <div class="guild-manage-row">
      <input id="guild-rename-input" maxlength="30" placeholder="Novo nome da guild" />
      <button class="sm" id="guild-rename-btn"${guildCoins >= renameCost ? "" : " disabled"}>Renomear (${renameCost} TC)</button>
      <span class="tiny" id="guild-rename-msg"></span>
    </div>
    <div class="tiny dim">Renomear usa ${renameCost} Tibia Coins do caixa de coins da guild
      (atual: <b>${guildCoins}</b>) — membros doam na aba GUILD BALANCE.</div>
  </section>` : "";

  root.innerHTML = `<div class="guild-tabs">${tabs.map((tab) =>
      `<button type="button" class="guild-tab${GUILD_UI.tab === tab.id ? " active" : ""}"
        data-guild-tab="${tab.id}">${tab.label}</button>`).join("")}</div>
    <section class="guild-section guild-head">
      <div class="hunt-cat-title">${guildIconImg(g.icon)} ${guildEsc(g.name)} — Nível ${g.level}</div>
      <div class="tiny dim">${g.members}/${g.slots} vagas · ${g.freeSlots} livres · ${g.exp} EXP${isMember ? ` · <b>${Number(g.points) || 0} GP</b> · <b>${guildCoins} TC</b>` : ""}</div>
      ${guildExpBarHtml(g)}
    </section>
    ${manageBox}
    ${requestsBox}
    ${contentHtml}
    ${joinBox}
    ${inviteBox}${leaveBtn}`;

  $$("#guild-manage-icons [data-guild-icon]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const icon = Number(btn.dataset.guildIcon);
      if (icon === Number(g.icon)) return;
      btn.disabled = true;
      const r = await guildApi("POST", "/api/guild/icon",
        { char_id: Number(sessionCharId()), icon });
      btn.disabled = false;
      if (r && r.data) guildToast(r.data.msg);
      loadGuildDetail();
    });
  });
  const renameBtn = $("#guild-rename-btn");
  if (renameBtn) renameBtn.addEventListener("click", async () => {
    const name = (($("#guild-rename-input") || {}).value || "").trim();
    if (!name) return;
    if (typeof confirm === "function" &&
      !confirm(`Renomear a guild para "${name}" por ${renameCost} Tibia Coins do caixa?`)) return;
    renameBtn.disabled = true;
    const r = await guildApi("POST", "/api/guild/rename",
      { char_id: Number(sessionCharId()), name });
    renameBtn.disabled = false;
    const msg = $("#guild-rename-msg");
    if (msg) msg.textContent = (r && r.data && (r.data.msg || r.data.error)) || "Erro ao renomear.";
    if (r && r.data && r.data.ok) loadGuildDetail();
  });
  const reqToggle = $("#guild-req-toggle");
  if (reqToggle) reqToggle.addEventListener("click", () => {
    const list = $("#guild-req-list");
    if (list) list.style.display = list.style.display === "none" ? "" : "none";
  });
  $$("#guild-modal-list [data-guild-req-accept]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      const r = await guildApi("POST", "/api/guild/request-respond",
        { char_id: Number(sessionCharId()), request_id: Number(btn.dataset.guildReqAccept), accept: true });
      if (r && r.data) guildToast(r.data.msg);
      loadGuildDetail();
    });
  });
  $$("#guild-modal-list [data-guild-req-decline]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      await guildApi("POST", "/api/guild/request-respond",
        { char_id: Number(sessionCharId()), request_id: Number(btn.dataset.guildReqDecline), accept: false });
      loadGuildDetail();
    });
  });
  const reqJoin = $("#guild-req-join");
  if (reqJoin) reqJoin.addEventListener("click", async () => {
    reqJoin.disabled = true;
    const r = await guildApi("POST", "/api/guild/request-join",
      { char_id: Number(sessionCharId()), guild_id: Number(GUILD_UI.guildId) });
    reqJoin.disabled = false;
    const msg = $("#guild-req-msg");
    if (msg) msg.textContent = (r && r.data && (r.data.msg || r.data.error)) || "Erro.";
    if (r && r.data && r.data.ok) loadGuildDetail();
  });
  const reqCancel = $("#guild-req-cancel");
  if (reqCancel) reqCancel.addEventListener("click", async () => {
    reqCancel.disabled = true;
    const r = await guildApi("POST", "/api/guild/request-cancel",
      { char_id: Number(sessionCharId()), guild_id: Number(GUILD_UI.guildId) });
    if (r && r.data) guildToast(r.data.msg);
    loadGuildDetail();
  });
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
      const r = await guildApi("POST", "/api/guild/promote",
        { char_id: Number(sessionCharId()), member_account_id: Number(btn.dataset.guildPromote) });
      if (r && r.data && !r.data.ok) guildToast(r.data.msg);
      loadGuildDetail();
    });
  });
  $$("#guild-modal-list [data-guild-demote]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const r = await guildApi("POST", "/api/guild/demote",
        { char_id: Number(sessionCharId()), member_account_id: Number(btn.dataset.guildDemote) });
      if (r && r.data && !r.data.ok) guildToast(r.data.msg);
      loadGuildDetail();
    });
  });
  $$("#guild-modal-list [data-guild-buy]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      const r = await guildApi("POST", "/api/guild/buy",
        { char_id: Number(sessionCharId()), bonus_id: btn.dataset.guildBuy });
      btn.disabled = false;
      if (r && r.data) guildToast(r.data.msg);
      loadGuildDetail();
    });
  });
  /* Perfil do personagem — clique no nome (membros, ranking, solicitações). */
  $$("#guild-modal-list [data-char-profile]").forEach((el) => {
    el.addEventListener("click", () => {
      if (typeof openPlayerProfile === "function")
        openPlayerProfile(el.dataset.charProfile);
    });
  });
  $$("#guild-modal-list [data-guild-buy-temp]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      const r = await guildApi("POST", "/api/guild/buy-temp",
        { char_id: Number(sessionCharId()), bonus_id: btn.dataset.guildBuyTemp });
      btn.disabled = false;
      if (r && r.data) guildToast(r.data.msg);
      guildTopbarSync();
      loadGuildDetail();
    });
  });
  const donateBtn = $("#guild-donate-btn");
  if (donateBtn) donateBtn.addEventListener("click", async () => {
    const amount = Math.max(0, Math.floor(Number((($("#guild-donate-amount") || {}).value) || 0)));
    donateBtn.disabled = true;
    const r = await guildApi("POST", "/api/guild/donate",
      { char_id: Number(sessionCharId()), amount });
    donateBtn.disabled = false;
    const msg = $("#guild-donate-msg");
    if (msg) msg.textContent = (r && r.data && (r.data.msg || r.data.error)) || "Erro ao doar.";
    if (r && r.data && r.data.ok) loadGuildDetail();
  });
  const donateCoinsBtn = $("#guild-donate-coins-btn");
  if (donateCoinsBtn) donateCoinsBtn.addEventListener("click", async () => {
    const amount = Math.max(0, Math.floor(Number((($("#guild-donate-coins-amount") || {}).value) || 0)));
    donateCoinsBtn.disabled = true;
    const r = await guildApi("POST", "/api/guild/donate-coins",
      { char_id: Number(sessionCharId()), amount });
    donateCoinsBtn.disabled = false;
    const msg = $("#guild-donate-coins-msg");
    if (msg) msg.textContent = (r && r.data && (r.data.msg || r.data.error)) || "Erro ao doar.";
    if (r && r.data && r.data.ok) loadGuildDetail();
  });
  if (GUILD_UI.tab === "history") loadGuildLog();
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

/* ------------------------- TOPBAR: bônus temporário -------------------------
 * Enquanto houver bônus temporário ativo, o botão GUILD pulsa em amarelo;
 * o tooltip lista os bônus e o tempo restante (sync a cada 30s). */
const GUILD_TEMP_LABELS = { bossLoot: "Boss Loot", exp: "EXP", skill: "Skill/ML", loot: "Loot" };
let _guildTopbarTimer = null;
async function guildTopbarSync() {
  const btn = document.getElementById("btn-guild");
  if (!btn) return;
  if (!guildOnlineMode()) { btn.classList.remove("guild-temp-on"); return; }
  try {
    const r = await guildApi("GET",
      `/api/guild/state?char_id=${encodeURIComponent(sessionCharId())}`);
    const d = r && r.data;
    const temp = (d && d.ok && d.guild && d.guild.tempBonuses) || {};
    const active = Object.keys(temp)
      .map((id) => ({ id, until: Number(temp[id]) || 0 }))
      .filter((t) => t.until > Date.now())
      .sort((a, b) => a.until - b.until);
    if (active.length) {
      btn.classList.add("guild-temp-on");
      btn.title = "Bônus temporário ativo:\n" +
        active.map((t) => `• ${GUILD_TEMP_LABELS[t.id] || t.id} +25% — restam ${guildTimeLeft(t.until)}`).join("\n");
      btn.removeAttribute("data-i18n-title");
    } else {
      btn.classList.remove("guild-temp-on");
      btn.setAttribute("data-i18n-title", "title.guild");
      btn.title = "Guilds — clãs por conta com tasks diárias";
    }
  } catch (e) { /* silencioso — o botão só reflete o último estado conhecido */ }
}
(function guildTopbarWatch() {
  if (_guildTopbarTimer || typeof window === "undefined") return;
  _guildTopbarTimer = setInterval(guildTopbarSync, 30000);
  try { guildTopbarSync(); } catch (e) {}
})();
