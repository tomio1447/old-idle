"use strict";
/* ==========================================================================
 * PVP DE GUILDS — modal estilo cidade, lobbies, contagem regressiva e placar.
 *
 * Backend: /api/pvp/* (server/pvp.js). O controlador publica sync "pvp" via
 * SSE — este arquivo escuta e atualiza o modal/contador.
 * ========================================================================== */
const PVP_TEAM_SIZES = [3, 5, 10, 15, 20, 50, 100];
let _pvpState = null;         // último payload público do controlador
let _pvpTab = "battles";      // battles | invites | history
let _pvpCountdown = null;     // {battleId,scheduledAt,status,mapName}
let _pvpCountdownTimer = null;
let _pvpLobby = null;         // estado do formulário de lobby

function pvpOnlineMode() {
  return typeof sessionToken === "function" && typeof sessionCharId === "function" &&
    !!sessionToken() && !!sessionCharId();
}
function pvpApi(method, path, body) {
  const token = sessionToken();
  if (method !== "GET" && body && typeof body === "object" && !body.token)
    body = Object.assign({ token }, body);
  return _api(method, path, body || null, token);
}
function pvpEsc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
function pvpGuildIcon(n, cls) {
  const i = Math.max(1, Math.min(10, Math.floor(Number(n) || 1)));
  return `<img class="pvp-gicon${cls ? " " + cls : ""}" src="/imagens/guildicons/${i}.png" alt="" draggable="false" />`;
}
function pvpFmtMoney(n) { return (Math.floor(Number(n) || 0)).toLocaleString("en-US"); }
function pvpFmtWhen(ms) {
  const d = new Date(Number(ms) || 0);
  return d.toLocaleDateString("pt-BR") + " " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}
function pvpStatusLabel(s) {
  return {
    pending: "Convite pendente", accepted: "Aceita — aguardando",
    prep: "Em preparo", live: "Em batalha", finished: "Encerrada",
    cancelled: "Cancelada", declined: "Recusada",
  }[s] || s;
}
function pvpStatusClass(s) {
  return {
    pending: "pvp-st-pend", accepted: "pvp-st-ok", prep: "pvp-st-prep",
    live: "pvp-st-live", finished: "pvp-st-done", cancelled: "pvp-st-off",
    declined: "pvp-st-off",
  }[s] || "";
}
function pvpScoresOf(b) {
  const m = String(b.scores || "").match(/^(\d+):(\d+)$/);
  return m ? { 1: Number(m[1]), 2: Number(m[2]) } : null;
}
/* Apostas mínimas (servidor valida o mesmo): 5kk gold / 25 Tibia Coins. */
function pvpMinStake(type) {
  const m = (_pvpState && _pvpState.minStake) || { gold: 5000000, coins: 25 };
  return Number(type === "coins" ? m.coins : m.gold) || 0;
}
function pvpMinStakeLabel(type) {
  return type === "coins" ? `${pvpMinStake("coins")} Tibia Coins` : `${pvpFmtMoney(pvpMinStake("gold"))} gold (5kk)`;
}
/* Ícones de moeda (mesmos da topbar/market). */
function pvpCoinIcon(type) {
  return type === "coins"
    ? `<img class="pvp-coin" src="assets/ui/coins/tibia-coins.gif" alt="Tibia Coins">`
    : `<img class="pvp-coin" src="assets/item/gold-coin.png" alt="Gold Coins">`;
}
function pvpStakeLabel(b) {
  return `${pvpCoinIcon(b.stakeType)}${pvpFmtMoney(b.stakeAmount)} ${b.stakeType === "coins" ? "TC" : "gold"}`;
}
function pvpModeText(m) {
  return m.mode === "frags"
    ? `Open Battle: primeiro a ${m.fragTarget || 100} frags ou mais frags em 10min · empate devolve as apostas`
    : "Control Battle: domine a área central (mais chars vivos nela) · vence quem somar mais tempo de domínio em 10min";
}
function pvpMmSs(sec) {
  const s = Math.max(0, Math.floor(Number(sec) || 0));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}
/* Ícone da guild (minha ou rival conhecida) por id. */
function pvpIconFor(guildId) {
  const st = _pvpState || {};
  if (st.guild && Number(st.guild.id) === Number(guildId)) return st.guild.icon;
  const r = (st.rivals || []).find((g) => Number(g.id) === Number(guildId));
  return r ? r.icon : 1;
}
function pvpMyAccountId() {
  if (_pvpState && _pvpState.accountId) return Number(_pvpState.accountId);
  const a = typeof sessionAccount === "function" ? sessionAccount() : null;
  return a ? Number(a.id) : 0;
}
function pvpRosterHasMe(battle) {
  const me = pvpMyAccountId(), r = battle && battle.roster;
  if (!me || !r) return false;
  return [].concat(r[1] || r["1"] || [], r[2] || r["2"] || []).some((m) => Number(m.accountId) === me);
}

/* ============================== MODAL ==================================== */
function openPvpModal() {
  const modal = $("#modal"), body = $("#modal-body");
  if (!modal || !body) return;
  if (typeof clearCityModalShells === "function") clearCityModalShells(body);
  else if (body) body.classList.remove("pvp-modal-shell", "cidade-modal-shell");
  body.classList.add("pvp-modal-shell", "cidade-modal-shell");
  modal.classList.remove("wide");
  body.innerHTML = `<div class="cidade-modal-shell">
    <div class="cidade-modal-title panel-title">
      <span class="pvp-title-ic"></span>PVP — Guerras de Guild
      <button type="button" class="cidade-close" data-pvp="close">Fechar</button>
    </div>
    <div class="panel-body pvp-body"><div class="pvp-loading">Carregando…</div></div>
  </div>`;
  modal.classList.add("show");
  pvpLoadState(true);
}
function closePvpModal() {
  $("#modal").classList.remove("show", "wide");
  if (typeof clearCityModalShells === "function") clearCityModalShells($("#modal-body"));
  else $("#modal-body").classList.remove("pvp-modal-shell", "cidade-modal-shell");
}
/* ===================== NOTIFICAÇÃO NO BOTÃO PVP ======================== *
 * Todo membro da guild vê o botão PVP com glow + "!" quando há novidade:
 * convite recebido/enviado, batalha aceita/em preparo/ao vivo, resultado
 * novo no histórico ou sorteio da própria conta. "Visto" é por conta
 * (localStorage) e zera ao abrir o modal PVP. Batalha ao vivo com a conta
 * no roster (fora da arena) mantém o alerta até entrar. */
function pvpSeenKey() { return "tibia-idle-pvp-seen-v1:" + (pvpMyAccountId() || "0"); }
function pvpSeenRead() {
  try { const raw = localStorage.getItem(pvpSeenKey()); return raw ? new Set(JSON.parse(raw)) : null; }
  catch (e) { return null; }
}
function pvpSeenWrite(set) {
  try { localStorage.setItem(pvpSeenKey(), JSON.stringify([...set].slice(-300))); } catch (e) { /* sem storage */ }
}
function pvpNotifyKeys(st) {
  const keys = [];
  if (!st || !st.inGuild) return keys;
  const me = pvpMyAccountId();
  for (const b of st.invites || []) keys.push({ k: "inv:" + b.id, why: `Convite de batalha de ${b.challengerName}`, sticky: true });
  for (const b of st.upcoming || []) {
    keys.push({ k: `b:${b.id}:${b.status}`, why: `${pvpStatusLabel(b.status)} — ${b.challengerName} × ${b.challengedName}` });
    if (["prep", "live"].includes(b.status) && pvpRosterHasMe(b)) keys.push({ k: "pick:" + b.id, why: "Você foi sorteado para a batalha" });
  }
  for (const b of st.history || []) keys.push({ k: "h:" + b.id, why: `Resultado: ${b.challengerName} × ${b.challengedName}`, old: true });
  for (const h of st.myHistory || []) keys.push({ k: "me:" + h.id, why: "Sua participação foi registrada", old: true });
  return me ? keys : [];
}
function pvpUnseen(st) {
  const keys = pvpNotifyKeys(st);
  let seen = pvpSeenRead();
  // 1º uso: histórico antigo já conta como visto (sem "!" por batalhas velhas).
  if (!seen) { seen = new Set(keys.filter((x) => x.old).map((x) => x.k)); pvpSeenWrite(seen); }
  // Convite recebido pendente fica aceso até ser aceito/recusado/expirar.
  const out = keys.filter((x) => x.sticky || !seen.has(x.k));
  const live = (st && st.battle && st.battle.status === "live" && pvpRosterHasMe(st.battle) &&
    !(typeof G !== "undefined" && G && G.combat && G.combat.pvpBattle));
  if (live && !out.some((x) => x.k === "pick:" + st.battle.id)) out.push({ k: "live", why: "Batalha ao vivo — entre na arena", sticky: true });
  return out;
}
function pvpMarkSeen(st) {
  const seen = pvpSeenRead() || new Set();
  for (const x of pvpNotifyKeys(st)) seen.add(x.k);
  pvpSeenWrite(seen);
}
function pvpUpdateNotify() {
  const btn = document.getElementById("btn-pvp");
  if (!btn) return;
  const items = _pvpState ? pvpUnseen(_pvpState) : [];
  let badge = btn.querySelector(".pvp-notify");
  if (!badge) {
    badge = document.createElement("span");
    badge.className = "pvp-notify";
    badge.setAttribute("aria-hidden", "true");
    btn.appendChild(badge);
  }
  const n = items.length;
  btn.classList.toggle("pvp-alert", n > 0);
  badge.textContent = n > 1 ? `! ${n}` : "!";
  badge.style.visibility = n ? "visible" : "hidden";
  btn.title = n ? "PvP — novidades:\n• " + items.slice(0, 6).map((x) => x.why).join("\n• ")
    : "PvP — Guerras agendadas entre guilds (requer guild)";
}
function pvpLoadState(showModal) {
  if (!pvpOnlineMode()) {
    if (showModal) pvpRenderError("Entre em uma conta online para acessar o PvP.");
    return;
  }
  pvpApi("GET", "/api/pvp/state").then((rs) => {
    const st = (rs && rs.data) || {};
    if (st.ok === false) { if (showModal) pvpRenderError(st.msg || "Falha ao carregar."); return; }
    _pvpState = st;
    pvpSyncCountdown(st);
    // Modal aberto = o membro está vendo as novidades.
    if (document.querySelector(".pvp-modal-shell")) pvpMarkSeen(st);
    pvpUpdateNotify();
    if (showModal !== false && document.querySelector(".pvp-modal-shell")) pvpRender();
  }).catch(() => { if (showModal) pvpRenderError("Falha ao carregar o PvP."); });
}
function pvpRenderError(msg) {
  const host = document.querySelector(".pvp-modal-shell .pvp-body");
  if (host) host.innerHTML = `<div class="pvp-empty">${pvpEsc(msg)}</div>`;
}
function pvpRender() {
  const host = document.querySelector(".pvp-modal-shell .pvp-body");
  if (!host || !_pvpState) return;
  const st = _pvpState;
  if (!st.inGuild || !st.guild) {
    host.innerHTML = `<div class="pvp-empty">Você precisa estar em uma <b>Guild</b> para acessar o sistema PvP.</div>`;
    return;
  }
  const officer = !!st.canLead;
  const tabs = [
    ["battles", "Guilds"],
    ["invites", `Challenges${st.invites.length ? ` (${st.invites.length})` : ""}`],
    ["calendar", "Calendar"],
    ["history", "History"],
    ["boosts", "Boosts"],
  ];
  let inner = `<div class="pvp-tabs">${tabs.map(([id, label]) =>
    `<button type="button" class="pvp-tab${_pvpTab === id ? " on" : ""}" data-pvp-tab="${id}">${label}</button>`).join("")}</div>`;
  inner += `<div class="pvp-myguild">
      ${pvpGuildIcon(st.guild.icon)}<div class="pvp-myguild-info">
      <b>${pvpEsc(st.guild.name)}</b>
      <span>Nível ${st.guild.level} · ${st.guild.members} membros · ${officer ? st.role === "leader" ? "líder" : "vice-líder" : "membro"}</span></div>
      ${st.eligible ? "" : `<span class="pvp-warn">${pvpEsc(st.reason || "Guild inelegível")}</span>`}
    </div>`;
  if (_pvpTab === "battles") inner += pvpTabBattles(st, officer);
  else if (_pvpTab === "invites") inner += pvpTabInvites(st, officer);
  else if (_pvpTab === "calendar") inner += pvpTabCalendar(st);
  else if (_pvpTab === "boosts") inner += `<div class="pvp-boosts-host"><div class="pvp-loading">Carregando…</div></div>`;
  else inner += pvpTabHistory(st);
  host.innerHTML = inner;
  if (_pvpTab === "boosts") pvpLoadBoosts();
}
/* Calendário: partidas futuras e anteriores agrupadas por dia (horário do
 * servidor convertido para o relógio local). */
function pvpTabCalendar(st) {
  const list = (st.calendar || []).slice().sort((a, b) => Number(a.scheduledAt) - Number(b.scheduledAt));
  if (!list.length) return `<div class="pvp-empty">Nenhuma batalha agendada ou registrada.</div>`;
  const nowMs = Date.now(), me = Number(st.guild.id);
  const future = list.filter((b) => ["pending", "accepted", "prep", "live"].includes(b.status));
  const past = list.filter((b) => !future.includes(b)).reverse();
  const day = (ms) => new Date(Number(ms) || 0).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" });
  const row = (b) => {
    const rival = Number(b.challengerGuildId) === me ? b.challengedName : b.challengerName;
    const result = b.status === "finished"
      ? (b.draw ? `<span class="pvp-badge pvp-tie">EMPATE</span>` : Number(b.winnerGuildId) === me
        ? `<span class="pvp-badge pvp-win">VITÓRIA</span>` : `<span class="pvp-badge pvp-loss">DERROTA</span>`) : "";
    const left = Number(b.scheduledAt) - nowMs;
    const when = new Date(Number(b.scheduledAt) || 0).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    return `<button type="button" class="pvp-brow" data-pvp-battle="${b.id}">
      <span class="pvp-badge ${pvpStatusClass(b.status)}">${pvpStatusLabel(b.status)}</span>${result}
      <b>${when} · ${pvpEsc(rival)}</b>
      <span class="pvp-bmeta">${pvpEsc(b.mapName)} · ${b.teamSize}v${b.teamSize}${b.scores ? ` · placar ${pvpEsc(String(b.scores).replace(":", "×"))}` : ""}</span>
      ${left > 0 && future.includes(b) ? `<span class="pvp-bmeta">em ${Math.floor(left / 3600000)}h${String(Math.floor((left % 3600000) / 60000)).padStart(2, "0")}m</span>` : ""}
    </button>`;
  };
  const group = (items) => {
    let out = "", last = "";
    for (const b of items) {
      const d = day(b.scheduledAt);
      if (d !== last) { out += `<div class="pvp-cal-day">${pvpEsc(d)}</div>`; last = d; }
      out += row(b);
    }
    return out;
  };
  return `<div class="pvp-sec-title">Próximas batalhas</div>` +
    (future.length ? `<div class="pvp-blist">${group(future)}</div>` : `<div class="pvp-empty">Nenhuma batalha futura.</div>`) +
    `<div class="pvp-sec-title">Anteriores</div>` +
    (past.length ? `<div class="pvp-blist">${group(past)}</div>` : `<div class="pvp-empty">Nenhuma batalha anterior.</div>`);
}
/* Boosts: loja de bônus temporário da guild paga com insígnias PvP. */
function pvpLoadBoosts() {
  const host = document.querySelector(".pvp-modal-shell .pvp-boosts-host");
  if (!host || !_pvpState || !_pvpState.guild) return;
  const charId = typeof sessionCharId === "function" ? sessionCharId() : "";
  pvpApi("GET", `/api/guild/detail?id=${encodeURIComponent(_pvpState.guild.id)}&char_id=${encodeURIComponent(charId)}`)
    .then((r) => {
      const d = (r && r.data) || {};
      const box = document.querySelector(".pvp-modal-shell .pvp-boosts-host");
      if (!box) return;
      if (!d.ok || !d.guild) { box.innerHTML = `<div class="pvp-empty">${pvpEsc(d.msg || "Falha ao carregar a loja.")}</div>`; return; }
      const isLeader = d.myRank === "leader";
      const ins = Number(d.insignias) || 0;
      box.innerHTML = `<div class="pvp-boost-head">
          <span><span class="pvp-chip-ic">🏅</span><b>${ins}</b> insígnias PvP (sua conta)</span>
          <span>Caixa da guild: ${pvpCoinIcon("gold")}<b>${pvpFmtMoney(d.guild.balance)}</b> gold</span>
        </div>
        <div class="pvp-note">Boosts valem 24h para todos os personagens das contas da guild. Ganhe insígnias
          lutando: vitória 3 · derrota/empate 1 por conta sorteada.</div>
        ${typeof guildTempShopHtml === "function"
          ? guildTempShopHtml(d.guild, isLeader, d.tempShop || [], ins, "data-pvp-buy-temp")
          : `<div class="pvp-empty">Loja indisponível.</div>`}`;
    }).catch(() => {
      const box = document.querySelector(".pvp-modal-shell .pvp-boosts-host");
      if (box) box.innerHTML = `<div class="pvp-empty">Falha ao carregar a loja.</div>`;
    });
}
function pvpTabBattles(st, officer) {
  let out = "";
  const active = (st.upcoming || []);
  if (active.length) {
    out += `<div class="pvp-sec-title">Batalhas da sua guild</div><div class="pvp-blist">` +
      active.map((b) => pvpBattleRow(b)).join("") + `</div>`;
  }
  const rivals = st.rivals || [];
  const eligible = rivals.filter((g) => g.eligible && !g.busy);
  const others = rivals.filter((g) => !g.eligible || g.busy);
  out += `<div class="pvp-sec-title">Guilds elegíveis para batalha</div>`;
  if (!eligible.length) out += `<div class="pvp-empty">Nenhuma outra guild elegível no momento.</div>`;
  else out += `<div class="pvp-glist">` + eligible.map((g) => `
    <button type="button" class="pvp-grow" data-pvp-guild="${g.id}" ${officer && st.eligible ? "" : "disabled"}>
      ${pvpGuildIcon(g.icon)}
      <span class="pvp-grow-info">
        <span class="pvp-grow-name">${pvpEsc(g.name)}</span>
        <span class="pvp-grow-meta">Nv ${g.level} · ${g.members} membros</span>
      </span>
      <span class="pvp-grow-go">${officer && st.eligible ? "Desafiar ›" : ""}</span>
    </button>`).join("") + `</div>`;
  if (others.length) out += `<details class="pvp-ineligible"><summary>Guilds ocupadas/inelegíveis (${others.length})</summary>` +
    others.map((g) => `<div class="pvp-irow">${pvpGuildIcon(g.icon)} ${pvpEsc(g.name)} — nv ${g.level}, ${g.members} membros${g.busy ? " · em batalha" : ""}</div>`).join("") + `</details>`;
  if (!officer) out += `<div class="pvp-note">Apenas líder e vice-líder podem criar batalhas.</div>`;
  else if (st.cooldownUntil > Date.now())
    out += `<div class="pvp-note">Cooldown: nova batalha a partir de ${pvpFmtWhen(st.cooldownUntil)}.</div>`;
  return out;
}
function pvpBattleRow(b) {
  const me = Number(_pvpState.guild.id);
  const isChallenger = Number(b.challengerGuildId) === me;
  const rivalName = isChallenger ? b.challengedName : b.challengerName;
  const scores = pvpScoresOf(b);
  let badge = "";
  if (b.status === "finished") {
    if (b.draw) badge = `<span class="pvp-badge pvp-tie">EMPATE</span>`;
    else if (Number(b.winnerGuildId) === me) badge = `<span class="pvp-badge pvp-win">VITÓRIA</span>`;
    else badge = `<span class="pvp-badge pvp-loss">DERROTA</span>`;
  }
  return `<button type="button" class="pvp-brow" data-pvp-battle="${b.id}">
    <span class="pvp-badge ${pvpStatusClass(b.status)}">${pvpStatusLabel(b.status)}</span>${badge}
    <b>${pvpEsc(rivalName)}</b>
    <span class="pvp-bmeta">${pvpEsc(b.mapName)} · ${b.teamSize}v${b.teamSize} · ${pvpStakeLabel(b)}</span>
    <span class="pvp-bmeta">${scores ? `placar ${scores[1]}×${scores[2]} · ` : ""}${pvpFmtWhen(b.scheduledAt)}</span>
  </button>`;
}
function pvpTabInvites(st, officer) {
  const inc = st.invites || [];
  const me = Number(st.guild.id);
  const sent = (st.upcoming || []).filter((b) => b.status === "pending" && Number(b.challengerGuildId) === me);
  const lobbies = (st.upcoming || []).filter((b) => b.status !== "pending");
  let out = `<div class="pvp-sec-title">Convites recebidos</div>`;
  out += !inc.length ? `<div class="pvp-empty">Nenhum convite pendente.</div>` : pvpInvitesHtml(inc, officer);
  out += `<div class="pvp-sec-title">Convites enviados</div>`;
  out += !sent.length ? `<div class="pvp-empty">Nenhum convite enviado aguardando resposta.</div>`
    : `<div class="pvp-blist">` + sent.map((b) => `<div class="pvp-brow pvp-invite">
        <span class="pvp-badge pvp-st-pend">Enviado</span><b>${pvpEsc(b.challengedName)}</b>
        <span class="pvp-bmeta">${pvpEsc(b.mapName)} · ${b.teamSize}v${b.teamSize} · ${pvpStakeLabel(b)} · ${pvpFmtWhen(b.scheduledAt)}</span>
        <span class="pvp-invite-btns">${officer ? `<button type="button" class="sm" data-pvp-cancel="${b.id}">Cancelar (reembolso)</button>` : ""}</span>
      </div>`).join("") + `</div>`;
  out += `<div class="pvp-sec-title">Lobbies</div>`;
  out += !lobbies.length ? `<div class="pvp-empty">Nenhum lobby aceito.</div>`
    : `<div class="pvp-blist">` + lobbies.map((b) => pvpBattleRow(b)).join("") + `</div>`;
  return out;
}
function pvpInvitesHtml(inc, officer) {
  return `<div class="pvp-blist">` + inc.map((b) => `
    <div class="pvp-brow pvp-invite">
      <span class="pvp-badge pvp-st-pend">${b.quick ? "⚡ Rápido · começa 1 min após aceitar" : "Desafio"}</span>
      <b>${pvpEsc(b.challengerName)}</b>
      <span class="pvp-bmeta">${pvpEsc(b.mapName)} · ${b.teamSize}v${b.teamSize} · ${pvpStakeLabel(b)}</span>
      <span class="pvp-bmeta">${pvpFmtWhen(b.scheduledAt)}</span>
      <span class="pvp-invite-btns">
        <button type="button" class="sm primary" data-pvp-accept="${b.id}" ${officer ? "" : "disabled"}>Aceitar</button>
        <button type="button" class="sm" data-pvp-decline="${b.id}" ${officer ? "" : "disabled"}>Recusar</button>
      </span></div>`).join("") + `</div>` +
    (officer ? "" : `<div class="pvp-note">Apenas líder e vice-líder respondem convites.</div>`);
}
function pvpTabHistory(st) {
  const hist = (st.history || []), mine = (st.myHistory || []);
  let out = `<div class="pvp-sec-title">Meu histórico</div>`;
  if (!mine.length) out += `<div class="pvp-empty">Você ainda não foi sorteado para uma batalha.</div>`;
  else {
    const tot = mine.reduce((s, h) => ({ k: s.k + h.kills, d: s.d + h.deaths, dmg: s.dmg + h.damage,
      w: s.w + (h.outcome === "win" ? 1 : 0), ins: s.ins + h.insignias }), { k: 0, d: 0, dmg: 0, w: 0, ins: 0 });
    out += `<div class="pvp-boost-head"><span><b>${mine.length}</b> batalhas · <b>${tot.w}</b> vitórias</span>
      <span><b>${tot.k}</b> kills · <b>${tot.d}</b> mortes · <b>${pvpFmtMoney(tot.dmg)}</b> dano</span>
      <span><b>${tot.ins}</b> insígnias ganhas</span></div>
      <table class="pvp-table"><tr><th>Batalha</th><th>Resultado</th><th>Kills</th><th>Mortes</th><th>Dano</th><th>Insígnias</th></tr>
      ${mine.map((h) => `<tr data-pvp-battle="${h.id}" style="cursor:pointer">
        <td>#${h.id} ${pvpEsc(h.challengerName)} × ${pvpEsc(h.challengedName)}<br><span class="pvp-bmeta">${pvpEsc(h.mapName)} · ${pvpFmtWhen(h.scheduledAt)}</span></td>
        <td>${h.outcome === "win" ? `<span class="pvp-res-win">Vitória</span>`
          : h.outcome === "loss" ? `<span class="pvp-res-loss">Derrota</span>`
          : h.outcome === "draw" ? `<span class="pvp-res-draw">Empate</span>` : "—"}</td>
        <td>${h.kills}</td><td>${h.deaths}</td><td>${pvpFmtMoney(h.damage)}</td><td>${h.insignias}</td></tr>`).join("")}</table>`;
  }
  out += `<div class="pvp-sec-title">Histórico da guild</div>`;
  if (!hist.length) return out + `<div class="pvp-empty">Nenhuma batalha registrada ainda.</div>`;
  return out + `<div class="pvp-blist">` + hist.map((b) => pvpBattleRow(b)).join("") + `</div>`;
}

/* --------------------------- LOBBY (desafio) ---------------------------- */
function pvpOpenLobby(guildId) {
  const g = (_pvpState.rivals || []).find((x) => Number(x.id) === Number(guildId));
  if (!g) return;
  const now = (_pvpState && _pvpState.now) || Date.now();
  const defStart = new Date(now + 15 * 60000);
  defStart.setSeconds(0, 0);
  // datetime-local usa o relógio LOCAL (toISOString daria UTC: +3h no Brasil).
  const pad = (n) => String(n).padStart(2, "0");
  const startLocal = `${defStart.getFullYear()}-${pad(defStart.getMonth() + 1)}-${pad(defStart.getDate())}` +
    `T${pad(defStart.getHours())}:${pad(defStart.getMinutes())}`;
  _pvpLobby = { rival: g, wager: pvpMinStake("gold"), currency: "gold", map: "ank_open", size: 5, startLocal };
  pvpRenderLobby();
}
/* Guarda aposta/data digitadas antes de re-renderizar (troca de mapa/moeda/
 * tamanho recriava o formulário com os valores padrão). */
function pvpLobbyCapture() {
  if (!_pvpLobby) return;
  const w = document.getElementById("pvp-wager"), s = document.getElementById("pvp-start");
  if (w) _pvpLobby.wager = Math.max(0, Math.floor(Number(w.value) || 0));
  if (s && s.value) _pvpLobby.startLocal = s.value;
}
function pvpRenderLobby() {
  pvpLobbyCapture();
  const host = document.querySelector(".pvp-modal-shell .pvp-body");
  const l = _pvpLobby;
  if (!host || !l) return;
  const maps = _pvpState.maps || [];
  const map = maps.find((m) => m.id === l.map) || maps[0];
  const prev = map ? map.img : "";
  host.innerHTML = `<div class="pvp-lobby" style="--pvp-bg:url('${prev}')">
    <div class="pvp-lobby-head">
      <button type="button" class="pvp-back" data-pvp="back">‹ Voltar</button>
      <span class="pvp-sec-title" style="margin:0">Desafiar ${pvpEsc(l.rival.name)}</span>
    </div>
    <div class="pvp-lobby-grid">
      <div class="pvp-lobby-form">
        <label class="pvp-lb">Rival</label>
        <div class="pvp-rival">${pvpGuildIcon(l.rival.icon)}<b>${pvpEsc(l.rival.name)}</b>
          <span>Nv ${l.rival.level} · ${l.rival.members} membros</span></div>
        <label class="pvp-lb">Aposta (debitada do caixa da guild · mínimo ${pvpMinStakeLabel(l.currency)})</label>
        <div class="pvp-wager">
          <input type="number" id="pvp-wager" min="${pvpMinStake(l.currency)}" step="${l.currency === "coins" ? 1 : 100000}" value="${l.wager}">
          <button type="button" class="pvp-cur${l.currency === "gold" ? " on" : ""}" data-pvp-cur="gold">${pvpCoinIcon("gold")}Gold Coins</button>
          <button type="button" class="pvp-cur${l.currency === "coins" ? " on" : ""}" data-pvp-cur="coins">${pvpCoinIcon("coins")}Tibia Coins</button>
          <span class="pvp-wallet">Caixa: ${pvpCoinIcon(l.currency)}<b>${pvpFmtMoney(l.currency === "coins"
            ? (_pvpState.guild && _pvpState.guild.coins) : (_pvpState.guild && _pvpState.guild.balance))}</b></span>
        </div>
        <label class="pvp-lb">Mapa</label>
        <div class="pvp-maps">${maps.map((m) => `
          <button type="button" class="pvp-map${l.map === m.id ? " on" : ""}" data-pvp-map="${m.id}">
            <img src="${m.img}" alt=""><span>${pvpEsc(m.name)}</span>
            <em>${pvpModeText(m)}</em></button>`).join("")}</div>
        <label class="pvp-lb">Tamanho da equipe (jogadores sorteados por guild — cada um entra com a party)</label>
        <div class="pvp-sizes">${(_pvpState.teamSizes || PVP_TEAM_SIZES).map((n) =>
          `<button type="button" class="pvp-size${l.size === n ? " on" : ""}" data-pvp-size="${n}">${n}</button>`).join("")}</div>
        <label class="pvp-lb">Data e hora (horário do servidor — mínimo 10 min à frente)</label>
        <input type="datetime-local" id="pvp-start" value="${l.startLocal}">
        <div class="pvp-fee">Taxa da casa: ${(_pvpState && _pvpState.houseFeePct) || 10}% do pote · Vencedor leva o restante + 3 insígnias PvP (perdedor: 1)</div>
        <div class="pvp-lobby-actions">
          <button type="button" class="sm primary pvp-create" data-pvp="create">Criar desafio</button>
          ${_pvpState && _pvpState.quickStart ? `<button type="button" class="sm pvp-quick" data-pvp="quick"
            title="Sem agendamento: o rival tem 5 min para aceitar e a batalha começa ${Math.round((Number(_pvpState.quickStartMs)||60000)/1000)}s após o aceite">⚡ Iniciar em ${Math.round((Number(_pvpState.quickStartMs)||60000)/1000)}s</button>` : ""}
          <span class="pvp-err" id="pvp-err"></span>
        </div>
      </div>
      <div class="pvp-lobby-preview">
        ${map ? `<img src="${prev}" alt="${pvpEsc(map.name)}"><div class="pvp-lobby-cap">${pvpEsc(map.name)}</div>` : ""}
      </div>
    </div>
  </div>`;
}
async function pvpCreate(quick) {
  const l = _pvpLobby;
  if (!l) return;
  const err = document.getElementById("pvp-err");
  const wager = Math.floor(Number((document.getElementById("pvp-wager") || {}).value) || 0);
  const minStake = pvpMinStake(l.currency);
  if (wager < minStake) {
    if (err) err.textContent = `Aposta mínima: ${pvpMinStakeLabel(l.currency)}.`;
    return;
  }
  let scheduledAt = 0;
  if (!quick) {
    const dt = (document.getElementById("pvp-start") || {}).value;
    scheduledAt = dt ? new Date(dt).getTime() : 0;
    if (!Number.isFinite(scheduledAt) || scheduledAt <= 0) { if (err) err.textContent = "Informe a data/hora."; return; }
    const minLead = Number(_pvpState && _pvpState.minLeadMs) || 600000;
    if (scheduledAt < Date.now() + minLead) {
      if (err) err.textContent = `A batalha precisa começar pelo menos ${Math.round(minLead / 60000)} min à frente (ou use o ⚡ Iniciar rápido).`;
      return;
    }
  }
  const r = await pvpApi("POST", "/api/pvp/lobby", {
    rivalGuildId: Number(l.rival.id), map: l.map, teamSize: l.size,
    stakeType: l.currency === "coins" ? "coins" : "gold", stakeAmount: wager,
    scheduledAt, quickStart: !!quick });
  const d = r && r.data || {};
  if (!d.ok) {
    if (err) err.textContent = d.msg || d.error || "Falha ao criar desafio.";
    return;
  }
  if (quick && typeof toast === "function")
    toast("⚡ Desafio rápido enviado — o rival tem 5 min para aceitar; a batalha começa 1 min após o aceite.");
  _pvpLobby = null; _pvpTab = quick ? "invites" : "battles";
  pvpLoadState();
}

/* ------------------------- INFO / RESULTADO ----------------------------- */
async function pvpOpenBattle(id) {
  const r = await pvpApi("GET", `/api/pvp/battle?id=${encodeURIComponent(id)}`);
  const d = r && r.data || {};
  const b = d.battle;
  const host = document.querySelector(".pvp-modal-shell .pvp-body");
  if (!b || !host) return;
  const res = b.result || {};
  const scores = pvpScoresOf(b) || (res.scores || null);
  const roster = b.roster || {};
  const teamHtml = (team, name) => `<div class="pvp-side">
    ${pvpGuildIcon(pvpIconFor(team === 1 ? b.challengerGuildId : b.challengedGuildId))}<b>${pvpEsc(name)}</b>
    ${scores ? `<span class="pvp-score">${scores[team] || 0}</span>` : ""}
    ${(res.winnerTeam === team || (b.winnerGuildId && ((team === 1 && Number(b.challengerGuildId) === Number(b.winnerGuildId)) || (team === 2 && Number(b.challengedGuildId) === Number(b.winnerGuildId))))) ? `<span class="pvp-badge pvp-win">VENCEDOR</span>` : ""}
    <div class="pvp-team">${((roster[team] || []).map((m) =>
      `<span>${pvpEsc(m.chars && m.chars[0] ? m.chars[0].name : "?")}${m.chars && m.chars.length > 1 ? ` +${m.chars.length - 1}` : ""}${m.online ? "" : " 🤖"}</span>`).join("")) || "<em>—</em>"}</div></div>`;
  const statsRows = ((res.participants) || []).slice()
    .sort((a, c) => (c.kills - a.kills) || (c.damage - a.damage));
  host.innerHTML = `<div class="pvp-lobby">
    <div class="pvp-lobby-head"><button type="button" class="pvp-back" data-pvp="back">‹ Voltar</button>
      <span class="pvp-sec-title" style="margin:0">Batalha #${b.id} — ${pvpEsc(b.mapName)}</span></div>
    <div class="pvp-info-grid">
      <div class="pvp-vs">
        ${teamHtml(1, b.challengerName)}
        <div class="pvp-x">VS</div>
        ${teamHtml(2, b.challengedName)}
      </div>
      <div class="pvp-info-col">
        <div><b>Status:</b> ${pvpStatusLabel(b.status)}${b.draw ? " — empate (apostas devolvidas)" : ""}${res.forfeit ? " — por desistência" : ""}${res.aborted ? " — instância perdida (reembolso)" : ""}</div>
        <div><b>Modo:</b> ${pvpEsc(pvpModeText({ mode: b.mode, fragTarget: 100 }))}</div>
        ${b.live ? `<div><b>Placar ao vivo:</b> ${b.mode === "control" ? `${pvpMmSs(b.live.scores && b.live.scores[1])} × ${pvpMmSs(b.live.scores && b.live.scores[2])}` : `${(b.live.scores && b.live.scores[1]) || 0} × ${(b.live.scores && b.live.scores[2]) || 0}`}</div>` : ""}
        <div><b>Início:</b> ${pvpFmtWhen(b.scheduledAt)}</div>
        <div><b>Equipes:</b> ${b.teamSize}v${b.teamSize} jogadores</div>
        <div><b>Aposta:</b> ${pvpCoinIcon(b.stakeType)}${pvpFmtMoney(b.stakeAmount)} ${b.stakeType === "coins" ? "Tibia Coins" : "Gold Coins"} (taxa da casa ${(_pvpState && _pvpState.houseFeePct) || 10}%)</div>
        ${b.status === "finished" && res.rewards ? `<div><b>Recompensa:</b> ${res.rewards.refund ? "apostas reembolsadas" : `pote ${pvpCoinIcon(b.stakeType)}${pvpFmtMoney(res.rewards.net || 0)} ao vencedor`} · insígnias por participante</div>` : ""}
        ${b.status === "prep" || b.status === "accepted" ? `<div class="pvp-note">Jogadores sorteados aguardam na área de treino. Offline = controlado por IA (preset "PVP" ou o preset ativo).</div>` : ""}
        ${b.status === "prep" ? `<div class="pvp-note"><b>Início em ${pvpMmSs(Math.max(0, (Number(b.scheduledAt) - Date.now()) / 1000))}</b>${pvpRosterHasMe(b) ? " — você foi sorteado!" : ""}</div>` : ""}
        ${b.status === "live" && pvpRosterHasMe(b) && !(typeof G !== "undefined" && G && G.combat && G.combat.pvpBattle)
          ? `<button type="button" class="sm primary" data-pvp="enter">Entrar na arena</button>` : ""}
        ${pvpOfficerActions(b)}
        ${res.mostKills ? `<div><b>Mais kills:</b> ${pvpEsc(res.mostKills.name)} (${res.mostKills.kills})</div>` : ""}
        ${res.mostDeaths ? `<div><b>Mais mortes:</b> ${pvpEsc(res.mostDeaths.name)} (${res.mostDeaths.deaths})</div>` : ""}
        ${res.mostDamage ? `<div><b>Mais dano:</b> ${pvpEsc(res.mostDamage.name)} (${pvpFmtMoney(res.mostDamage.damage)})</div>` : ""}
      </div>
    </div>
    ${statsRows.length ? `<div class="pvp-sec-title">Estatísticas</div>
      <table class="pvp-table"><tr><th>Personagem</th><th>Time</th><th>Kills</th><th>Mortes</th><th>Dano</th></tr>
      ${statsRows.map((s) => `<tr><td>${pvpEsc(s.name)}</td><td>${s.team === 1 ? pvpEsc(b.challengerName) : pvpEsc(b.challengedName)}</td>
        <td>${s.kills}</td><td>${s.deaths}</td><td>${pvpFmtMoney(s.damage)}</td></tr>`).join("")}</table>` : ""}
  </div>`;
}

/* ==================== CONTADOR + PLACAR (in-game) ======================== */
function pvpSyncCountdown(st) {
  const battle = st.battle || null;
  if (!battle || !["accepted", "prep", "live"].includes(battle.status)) { pvpCountdownClear(); return; }
  _pvpCountdown = { battleId: battle.id, scheduledAt: battle.scheduledAt, status: battle.status,
    mapName: battle.mapName, teamSize: battle.teamSize };
  let el = document.getElementById("pvp-countdown");
  if (!el) {
    el = document.createElement("button");
    el.id = "pvp-countdown";
    el.type = "button";
    el.title = "Clique para ver os detalhes da batalha";
    document.body.appendChild(el);
    el.addEventListener("click", () => { openPvpModal(); setTimeout(() => pvpOpenBattle(_pvpCountdown && _pvpCountdown.battleId), 350); });
  }
  // style.display="" caía no display:none do CSS: o contador nunca aparecia.
  el.style.display = "flex";
  if (!_pvpCountdownTimer) _pvpCountdownTimer = setInterval(pvpCountdownTick, 1000);
  pvpCountdownTick();
}
function pvpCountdownClear() {
  _pvpCountdown = null;
  if (_pvpCountdownTimer) { clearInterval(_pvpCountdownTimer); _pvpCountdownTimer = null; }
  const el = document.getElementById("pvp-countdown");
  if (el) el.style.display = "none";
}
/* "TIME TO BATTLE: MM:SS" (HH:MM:SS acima de 1h) — para todos os membros das
 * duas guilds desde o aceite até o início. Ao vivo: some na arena (o placar
 * assume) ou vira atalho "BATTLE LIVE" para quem ainda não entrou. */
function pvpCountdownTick() {
  const c = _pvpCountdown, el = document.getElementById("pvp-countdown");
  if (!c || !el) return;
  if (c.status === "live") {
    const inArena = typeof G !== "undefined" && G && G.combat && G.combat.pvpBattle;
    el.style.display = inArena ? "none" : "flex";
    el.innerHTML = `<span class="pvp-cd-skull"></span><span class="pvp-cd-label">BATTLE LIVE</span><b>${pvpEsc(c.mapName || "")}</b>`;
    return;
  }
  el.style.display = "flex";
  const sec = Math.max(0, Math.floor((Number(c.scheduledAt) - Date.now()) / 1000));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  const pad = (n) => String(n).padStart(2, "0");
  el.classList.toggle("pvp-cd-soon", sec <= 60);
  el.innerHTML = `<span class="pvp-cd-skull"></span><span class="pvp-cd-label">TIME TO BATTLE:</span>` +
    `<b>${h ? `${pad(h)}:` : ""}${pad(m)}:${pad(s)}</b>` +
    `<span class="pvp-cd-sub">${c.status === "prep" ? "sorteio feito" : "aguardando sorteio"} · ${pvpEsc(c.mapName || "")}</span>`;
}

/* Ações de líder/vice no detalhe: cancelar convite (reembolso) ou desistir
 * de lobby aceito/em preparo/ao vivo (pote vai ao rival, menos a taxa). */
function pvpOfficerActions(b) {
  const st = _pvpState || {};
  if (!st.canLead || !st.guild) return "";
  const me = Number(st.guild.id);
  const mine = Number(b.challengerGuildId) === me || Number(b.challengedGuildId) === me;
  if (!mine) return "";
  if (b.status === "pending" && Number(b.challengerGuildId) === me)
    return `<button type="button" class="sm" data-pvp-cancel="${b.id}">Cancelar convite (reembolso)</button>`;
  if (["accepted", "prep", "live"].includes(b.status))
    return `<button type="button" class="sm pvp-forfeit" data-pvp-forfeit="${b.id}">Desistir (pote vai ao rival)</button>`;
  return "";
}

/* ---------------------- Arena da batalha (cliente) ---------------------- */
/* Mesmo grid local do servidor (bounds do OTBM). Fallback estático quando o
 * estado do PvP ainda não foi carregado (reload direto na arena). */
const PVP_ARENAS_FALLBACK = {
  venore_town: { id: "venore_town", name: "Venore Town", otbm: "venore_town", otbmFloor: 7, gridW: 69, gridH: 43 },
  ank_open: { id: "ank_open", name: "Ankrahmun Open Battle", otbm: "ank_open", otbmFloor: 7, gridW: 51, gridH: 52 },
};
function pvpArenaHunt(session) {
  const st = (session && session.state) || {};
  const pb = st.pvpBattle || {};
  const mapId = String(pb.mapId || "");
  const arena = (_pvpState && _pvpState.arenas && _pvpState.arenas[mapId]) || PVP_ARENAS_FALLBACK[mapId];
  if (!arena || typeof GAMEDATA === "undefined" || !GAMEDATA.hunts) return null;
  const id = "pvp-" + arena.id;
  const gw = Number(st.gridW) || Number(arena.gridW) || 30, gh = Number(st.gridH) || Number(arena.gridH) || 30;
  GAMEDATA.hunts[id] = Object.assign(GAMEDATA.hunts[id] || {}, {
    name: "PvP — " + arena.name, hidden: true, cat: "pvp", level: 1, minLevel: 1,
    scene: "cave", color: "#7a1f1f", pack: 0, packMin: 0, packMax: 0, respawn: 0, monsters: [],
    otbm: arena.otbm, otbmFloor: Number(arena.otbmFloor) || 7,
    /* FOV 15×11 (o clássico do Tibia): tiles ~40% maiores que 21×15 — zoom
     * melhor, menos células renderizadas por frame e a janela de culling
     * encolhe junto (perf em batalhas grandes). */
    otbmRuntimeWidth: gw, otbmRuntimeHeight: gh, otbmFovWidth: 15, otbmFovHeight: 11,
    noFovBound: true, pvpArena: true,
  });
  return GAMEDATA.hunts[id];
}
/* Builds anteriores espelhavam os 40 chars da batalha no roster local: remove
 * personagens de OUTRAS contas (libera a quota do localStorage). */
function pvpPruneForeignRoster() {
  const me = pvpMyAccountId();
  if (!me || typeof readRoster !== "function" || typeof writeRoster !== "function") return 0;
  try {
    const roster = readRoster() || {};
    let removed = 0;
    for (const id of Object.keys(roster)) {
      const acc = Number(roster[id] && roster[id].p && roster[id].p.accountId);
      if (acc && acc !== me) { delete roster[id]; removed++; }
    }
    if (removed) writeRoster(roster);
    return removed;
  } catch (e) { return 0; }
}
function pvpIsOwnEnt(ent, accId) {
  return Number(ent && (ent.accountId || (ent.p && ent.p.accountId))) === Number(accId);
}
/* War System do Tibia: escudo verde nos aliados e vermelho nos rivais. O time
 * do viewer vem dos próprios chars (p.accountId), não do índice 1/2 — quem
 * aceita o desafio pode estar em qualquer um dos lados. */
function pvpEntTeam(ent) {
  const t = Number(ent && (ent.pvpTeam !== undefined ? ent.pvpTeam : ent.team));
  return t === 1 || t === 2 ? t : 0;
}
function pvpOwnTeam() {
  const c = typeof G !== "undefined" && G && G.combat;
  if (!c || !c.pvpBattle) return 0;
  const me = pvpMyAccountId();
  const list = Array.isArray(c.players) && c.players.length ? c.players : (c.player ? [c.player] : []);
  for (const ent of list) if (pvpIsOwnEnt(ent, me)) return pvpEntTeam(ent);
  // Sem char próprio visível: o time do alvo ativo do cliente (sempre da conta).
  return c.player && pvpIsOwnEnt(c.player, me) ? pvpEntTeam(c.player) : 0;
}
/* "ally" (verde) | "enemy" (vermelho) | null fora de batalha/sem time. */
function pvpWarSide(ent) {
  const c = typeof G !== "undefined" && G && G.combat;
  if (!c || !c.pvpBattle) return null;
  const t = pvpEntTeam(ent), own = pvpOwnTeam();
  if (!t || !own) return null;
  return t === own ? "ally" : "enemy";
}
let _pvpEntering = false;
/* Monta a instância compartilhada da batalha neste cliente. O servidor já
 * encerrou hunts/bosses das contas sorteadas (preparo/início); aqui só se
 * limpa o combate local — nunca POST /end (derrubaria a arena do host). */
async function pvpEnterBattle() {
  if (_pvpEntering || !pvpOnlineMode()) return;
  if (typeof G !== "undefined" && G && G.combat && G.combat.pvpBattle) return;
  _pvpEntering = true;
  try {
    try { if (G.training && typeof stopAcademy === "function") stopAcademy(false); } catch (e) { /* ignore */ }
    G.huntEntryToken = (G.huntEntryToken || 0) + 1;
    G.huntEntryPendingToken = null;
    try { if (G.combat && typeof clearCombatVisualOverlays === "function") clearCombatVisualOverlays(G.combat); } catch (e) { /* ignore */ }
    G.combat = null;
    try { ONLINE_AUTH_APPLIED_VERSION = 0; ONLINE_AUTH_APPLIED_INSTANCE = ""; } catch (e) { /* ignore */ }
    const token = sessionToken(), accId = pvpMyAccountId();
    let remote = null;
    for (let i = 0; i < 60; i++) {
      if (typeof accountLoadInstance !== "function") break;
      remote = await accountLoadInstance(token);
      if (remote && remote.instance && remote.instance.kind === "pvp") break;
      remote = null;
      await new Promise((r) => setTimeout(r, 500));
    }
    if (!remote) { if (typeof toast === "function") toast("Timeout aguardando a arena PvP.", "bad"); return; }
    const inst = remote.instance, cur = typeof sessionCharId === "function" ? String(sessionCharId() || "") : "";
    const members = (inst.members || []).filter((m) => pvpIsOwnEnt(m, accId));
    const mine = members.find((m) => String(m.id) === cur) || members[0];
    if (!mine) { if (typeof toast === "function") toast("Sua conta não está no roster desta batalha.", "bad"); return; }
    try {
      sessionStorage.setItem("tibia-idle-char", String(mine.id));
      if (typeof ACTIVE_CHARACTER_KEY !== "undefined") localStorage.setItem(ACTIVE_CHARACTER_KEY, String(mine.id));
    } catch (e) { /* ignore */ }
    const session = Object.assign({}, inst, { activeCharacterId: String(mine.id) });
    // Sem espelho local: 40 chars estouram a quota do localStorage; o reload
    // retoma pela instância do servidor (accountLoadInstance).
    try { localStorage.removeItem("tibia-idle-active-instance-v1"); } catch (e) { /* ignore */ }
    if (typeof resumeIdleInstance === "function") await resumeIdleInstance(session);
    if (typeof closePvpModal === "function" && document.querySelector(".pvp-modal-shell")) closePvpModal();
    if (typeof toast === "function") toast("Batalha PvP iniciada! Clique num inimigo para marcar o alvo do time.", "death");
    if (typeof renderAll === "function") renderAll();
  } catch (e) {
    console.error("[pvp] entrar na arena", e);
  } finally { _pvpEntering = false; }
}
/* Clique na arena: inimigo vivo na célula (ou vizinho) vira alvo do time;
 * clicar de novo no mesmo alvo limpa. Retorna true se tratou o clique. */
function pvpHandleCombatClick(cell) {
  const c = typeof G !== "undefined" && G && G.combat;
  if (!c || !c.pvpBattle || !cell) return false;
  // Botão WALL armado: o clique escolhe o SQM — a autoridade escolhe qual
  // char da PT conjura (runa + cooldown livre). Qualquer membro pode chamar.
  if (c._pvpWallAim) {
    c._pvpWallAim = false;
    c._pvpWallTarget = { cx: Math.floor(Number(cell.cx)), cy: Math.floor(Number(cell.cy)), at: Date.now() };
    if (typeof toast === "function")
      toast(`Magic Wall em <b>${c._pvpWallTarget.cx},${c._pvpWallTarget.cy}</b> — a PT conjura quando o cooldown liberar.`);
    return true;
  }
  const accId = pvpMyAccountId();
  const own = (c.players || []).find((e) => pvpIsOwnEnt(e, accId));
  const myTeam = own ? Number(own.pvpTeam || own.team) || 0 : 0;
  const foes = (c.players || []).filter((e) => e && e.p && Number(e.p.hp) > 0 &&
    !pvpIsOwnEnt(e, accId) && Number(e.pvpTeam || e.team) !== myTeam);
  const dist = (e) => Math.max(Math.abs(Number(e.cx) - cell.cx), Math.abs(Number(e.cy) - cell.cy));
  const hit = foes.filter((e) => dist(e) <= 1).sort((a, b) => dist(a) - dist(b))[0];
  if (!hit) {
    // Clique num char CONTROLÁVEL (vivo) na arena: seleciona — a câmera
    // passa a seguir ele. Vale char próprio E AFK AI_HARD do mesmo time
    // (os mesmos que o BCP comanda). Clicar de novo volta pro fallback.
    const aiCtl = (c.pvpBattle && c.pvpBattle.aiControl) || {};
    const mineHit = (c.players || []).filter((e) => e && e.p &&
      Number(e.p.hp) > 0 && dist(e) <= 1 &&
      (pvpIsOwnEnt(e, accId) ||
        (myTeam && Number(e.pvpTeam || e.team) === myTeam &&
          aiCtl[String(e.id)] === "AI_HARD")))
      .sort((a, b) => dist(a) - dist(b))[0];
    if (mineHit) {
      const id = String(mineHit.id);
      _pvpSelChar = _pvpSelChar === id ? null : id;
      if (typeof toast === "function" && _pvpSelChar)
        toast(`Câmera seguindo <b>${pvpEsc(mineHit.p.name || "char")}</b>.`);
      pvpActionsTick();
      return true;
    }
    return false;
  }
  // Só o líder da guild designa o alvo do time — o servidor também valida.
  const team = (c.pvpBattle.teams || {})[myTeam] || {};
  if (Number(team.leaderAccountId) !== accId) {
    if (typeof toast === "function") toast("Só o líder da guild designa o alvo do time.", "bad");
    return true;
  }
  const id = String(hit.id);
  c._pvpTeamTarget = c._pvpTeamTarget === id ? "" : id;
  if (typeof toast === "function")
    toast(c._pvpTeamTarget ? `Alvo do time: <b>${pvpEsc(hit.p.name || "inimigo")}</b>` : "Alvo do time liberado (IA escolhe).");
  return true;
}

/* ---------------------- Placar dentro da instância ---------------------- */
/* Conta em batalha sem o lease (outra aba/dispositivo segura o controle):
 * a simulação pausa e o cliente fica numa tela escura só com o placar.
 * Oferece um modal com "ASSUMIR O CONTROLE" → /api/lease/takeover. */
let _pvpTakeoverEl = null, _pvpTakeoverBusy = false, _pvpBlockedSince = 0;
function pvpTakeoverTick() {
  const inBattle = !!(typeof G !== "undefined" && G && G.combat && G.combat.pvpBattle);
  const online = typeof accountApiConfigured === "function" && accountApiConfigured();
  const blocked = inBattle && online &&
    typeof accountLeaseAllowsSimulation === "function" && !accountLeaseAllowsSimulation();
  if (!blocked) {
    _pvpBlockedSince = 0;
    if (_pvpTakeoverEl) { _pvpTakeoverEl.remove(); _pvpTakeoverEl = null; }
    return;
  }
  // Evita flash durante janelas curtas de renovação de lease.
  if (!_pvpBlockedSince) _pvpBlockedSince = Date.now();
  if (Date.now() - _pvpBlockedSince < 2000 || _pvpTakeoverEl) return;
  const el = document.createElement("div");
  el.id = "pvp-takeover";
  el.innerHTML = `<div class="pvp-tk-box">
    <span class="pvp-tk-live">LIVE BATTLE</span>
    <div class="pvp-tk-title">SUA CONTA ESTÁ EM BATALHA</div>
    <div class="pvp-tk-text">Esta conta está numa guerra de guilds ativa, mas outra
      aba ou dispositivo detém o controle dela. Você pode acompanhar pelo placar
      ou assumir o controle agora.</div>
    <button type="button" class="pvp-tk-btn">ASSUMIR O CONTROLE</button>
  </div>`;
  el.querySelector(".pvp-tk-btn").addEventListener("click", async () => {
    if (_pvpTakeoverBusy) return;
    _pvpTakeoverBusy = true;
    const btn = el.querySelector(".pvp-tk-btn");
    btn.disabled = true; btn.textContent = "ASSUMINDO...";
    try {
      const token = typeof sessionToken === "function" ? sessionToken() : "";
      const r = typeof accountAcquireLease === "function" ? await accountAcquireLease(token, true) : null;
      if (r && r.ok) {
        try { ONLINE_RUNTIME_RETRY_AT = 0; } catch (e) { /* ignore */ }
        if (typeof requestOnlineRuntimeRecovery === "function")
          await requestOnlineRuntimeRecovery({ force: true });
        if (typeof toast === "function") toast("Controle assumido — bom combate!", "ok");
      } else if (typeof toast === "function") {
        toast((r && r.msg) || "Não foi possível assumir o controle.", "bad");
      }
    } catch (e) {
      if (typeof toast === "function") toast("Falha ao assumir o controle.", "bad");
    } finally {
      _pvpTakeoverBusy = false;
      if (btn && btn.isConnected) { btn.disabled = false; btn.textContent = "ASSUMIR O CONTROLE"; }
    }
  });
  document.body.appendChild(el);
  _pvpTakeoverEl = el;
}
/* ============ BOTÕES DE BATALHA — WALL (magic wall) e TARGET on/off =====
 * Overlay estilo hotkey, só durante batalha live. WALL arma a mira para o
 * clique no SQM; TARGET OFF desliga magias/runes de ataque da PT inteira
 * para a sequência de cooldowns ficar livre pra Magic Wall. */
let _pvpActionsEl = null;
const PVP_ACT_POS_KEY = "tibia-idle-pvp-actions-pos";
function pvpActDefaultPos(el) {
  // Área livre da coluna esquerda (abaixo da lista): centrado no painel,
  // ~62% da altura — onde fica o espaço vazio do sidebar.
  const col = document.querySelector(".col-left");
  if (col) {
    const r = col.getBoundingClientRect();
    return { left: Math.round(r.left + Math.max(8, (r.width - el.offsetWidth) / 2)),
             top: Math.round(r.top + r.height * 0.62) };
  }
  return { left: 12, top: Math.round(window.innerHeight / 2) };
}
function pvpActPlace(el) {
  let pos = null;
  try { pos = JSON.parse(localStorage.getItem(PVP_ACT_POS_KEY) || "null"); } catch (e) {}
  if (!pos || !Number.isFinite(Number(pos.left))) pos = pvpActDefaultPos(el);
  el.style.left = Math.max(0, Math.min(window.innerWidth - 40, Number(pos.left))) + "px";
  el.style.top = Math.max(40, Math.min(window.innerHeight - 30, Number(pos.top))) + "px";
}
function pvpActMakeDraggable(el, grip) {
  grip.addEventListener("pointerdown", (ev) => {
    ev.preventDefault();
    const r = el.getBoundingClientRect();
    const offX = ev.clientX - r.left, offY = ev.clientY - r.top;
    const move = (e) => {
      el.style.left = Math.max(0, Math.min(window.innerWidth - r.width, e.clientX - offX)) + "px";
      el.style.top = Math.max(0, Math.min(window.innerHeight - r.height, e.clientY - offY)) + "px";
    };
    const up = () => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
      try {
        localStorage.setItem(PVP_ACT_POS_KEY,
          JSON.stringify({ left: parseInt(el.style.left, 10), top: parseInt(el.style.top, 10) }));
      } catch (e) {}
    };
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", up);
  });
}
/* ---- Controle por personagem: 4 botões verticais (auxiliares da PT) com
 * opções por vocação abrindo pra lateral. Estado local por char —
 * combat._pvpCharCtrl[id] viaja no visual da própria entrada. ---- */
let _pvpCharOpen = null;
/* Char SELECIONADO pra câmera — clicar no botão da coluna ou no próprio
 * char na arena muda o foco. Null = fallback (primeiro vivo da conta). */
let _pvpSelChar = null;
const PVP_VOC_COLORS = { knight: "#d96a5a", monk: "#e0a34a", sorcerer: "#5f9fd8", druid: "#63b06b", paladin: "#c9a35a" };
function pvpVocBase(voc) {
  const v = String(voc || "").toLowerCase();
  if (/monk/.test(v)) return "monk";
  if (/knight/.test(v)) return "knight";
  if (/sorcer/.test(v)) return "sorcerer";
  if (/druid/.test(v)) return "druid";
  if (/paladin/.test(v)) return "paladin";
  return "";
}
const PVP_CHAR_OPTS = {
  knight:   [{ id: "chase", label: "CHASE", img: "assets/item/boots-of-haste.png", toggle: 1 }],
  monk:     [{ id: "chase", label: "CHASE", img: "assets/item/boots-of-haste.png", toggle: 1 }],
  sorcerer: [{ id: "ue", label: "UE", img: "assets/item/thunderstorm-rune.png", title: "Prioriza runas de área (thunder/avalanche/GFB) antes da SD" },
             { id: "sd", label: "SD", img: "assets/item/sudden-death-rune.png", title: "Prioriza Sudden Death no alvo" }],
  druid:    [{ id: "sd", label: "SD", img: "assets/item/sudden-death-rune.png", title: "Prioriza Sudden Death no alvo" },
             { id: "paralyze", label: "PAR", img: "assets/item/paralyze-rune.png", title: "Paralisa o alvo chamado do time (consome paralyze rune)" },
             { id: "heal", label: "HEAL", img: "assets/spell/otc/106.png", title: "Prioriza curar aliados (sio automático no mais ferido)" }],
  paladin:  [{ id: "bow", label: "BOW", img: "assets/item/elvish-bow.png", title: "Melhor bow da mochila + diamond arrow + magias em área" },
             { id: "xbow", label: "XBOW", img: "assets/item/arbalest.png", title: "Melhor crossbow + spectral bolt + exori con/gran con" }],
};
/* Controláveis pelo painel: auxiliares da conta + AFKs DO TIME (chars
 * AI_HARD de contas aliadas — o servidor só aplica em AI_HARD do mesmo
 * time; humano aliado e inimigo são imunes ao controle). */
function pvpAuxChars(c) {
  const me = typeof pvpMyAccountId === "function" ? pvpMyAccountId() : 0;
  const selfId = String((c.player && c.player.id) || "");
  const aiCtl = (c.pvpBattle && c.pvpBattle.aiControl) || {};
  const own = (c.players || []).find((e) => typeof pvpIsOwnEnt === "function" && pvpIsOwnEnt(e, me));
  const myTeam = own ? Number(own.pvpTeam || own.team) || 0 : 0;
  return (c.players || []).filter((e) => {
    if (!e || !e.p || String(e.id) === selfId) return false;
    if (pvpIsOwnEnt(e, me)) return true;
    return myTeam && Number(e.pvpTeam || e.team) === myTeam &&
      aiCtl[String(e.id)] === "AI_HARD";
  }).slice(0, 16);
}
function pvpCharCtrl(c, id) {
  c._pvpCharCtrl = c._pvpCharCtrl || {};
  if (!c._pvpCharCtrl[id]) c._pvpCharCtrl[id] = { chase: true, mode: "sd" };
  return c._pvpCharCtrl[id];
}

const PVP_VOC_SHORT = { knight: "EK", monk: "EM", paladin: "RP", sorcerer: "MS", druid: "ED" };
const PVP_VOC_ORDER = ["knight", "monk", "paladin", "sorcerer", "druid"];
/* Re-render da coluna BCP (Botão de Comando PvP): UM botão por vocação —
 * a opção escolhida aplica em TODOS os controlados AFK daquela vocação
 * (auxiliares da conta + AI_HARD aliados). Badge = nº de controlados. */
function pvpCharColTick(col) {
  const c = typeof G !== "undefined" && G && G.combat;
  if (!col || !c) return;
  const aux = pvpAuxChars(c);
  const byVoc = {};
  for (const ent of aux) {
    const bv = pvpVocBase(ent && ent.p && ent.p.voc);
    if (bv) (byVoc[bv] = byVoc[bv] || []).push(ent);
  }
  const vocs = PVP_VOC_ORDER.filter((v) => byVoc[v]);
  if (!vocs.length) { col.style.display = "none"; _pvpCharOpen = null; return; }
  col.style.display = "flex";
  let html = `<div class="pvp-bcp-tag" title="Botão de Comando PvP — por vocação">BCP</div>`;
  for (const bv of vocs) {
    const list = byVoc[bv], opts = PVP_CHAR_OPTS[bv] || [], open = _pvpCharOpen === bv;
    // Estado mostrado = do 1º char do grupo (todos convergem após 1 clique).
    const ctrl = pvpCharCtrl(c, String(list[0].id));
    const hasSel = _pvpSelChar && list.some((e) => String(e.id) === _pvpSelChar);
    html += `<div class="pvp-char-slot${open ? " open" : ""}">` +
      `<button class="pvp-char-btn${hasSel ? " sel" : ""}" data-voc="${bv}" title="BCP ${PVP_VOC_SHORT[bv]} — ${list.length} controlado(s)"` +
      ` style="border-color:${PVP_VOC_COLORS[bv] || "#5a4a33"}">` +
      `<i class="pvp-voc-n">${list.length}</i>${PVP_VOC_SHORT[bv]}</button>`;
    if (open) {
      html += `<div class="pvp-char-opts">`;
      for (const o of opts) {
        const on = o.toggle ? !!ctrl.chase : ctrl.mode === o.id;
        html += `<button class="pvp-act pvp-char-opt${on ? " on" : " off"}" data-voc="${bv}" data-opt="${o.id}"` +
          ` title="${o.title || o.label}"><img src="${o.img}" alt="" draggable="false"><span>${o.label}</span></button>`;
      }
      html += `</div>`;
    }
    html += `</div>`;
  }
  col.innerHTML = html;
  col.querySelectorAll(".pvp-char-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const bv = btn.getAttribute("data-voc");
      _pvpCharOpen = _pvpCharOpen === bv ? null : bv;
      pvpActionsTick();
    });
  });
  col.querySelectorAll(".pvp-char-opt").forEach((btn) => {
    btn.addEventListener("click", () => {
      const bv = btn.getAttribute("data-voc"), opt = btn.getAttribute("data-opt");
      const cc = G && G.combat; if (!cc) return;
      const list = byVoc[bv] || []; if (!list.length) return;
      if (opt === "chase") {
        const nv = !pvpCharCtrl(cc, String(list[0].id)).chase;
        for (const e of list) pvpCharCtrl(cc, String(e.id)).chase = nv;
        if (typeof toast === "function")
          toast(`<b>${bv.toUpperCase()} (${list.length})</b>: CHASE ${nv ? "<b>ON</b>" : "<b>OFF</b>"}.`);
      } else {
        const cur = pvpCharCtrl(cc, String(list[0].id)).mode;
        const nv = cur === opt ? "sd" : opt;
        for (const e of list) pvpCharCtrl(cc, String(e.id)).mode = nv;
        const lbl = { ue: "UE (área)", sd: "SD", paralyze: "PARALYZE", heal: "HEAL FRIEND", bow: "BOW + área", xbow: "CROSSBOW + exori" }[nv] || nv;
        if (typeof toast === "function") toast(`<b>${bv.toUpperCase()} (${list.length})</b>: prioridade <b>${lbl}</b>.`);
      }
      pvpActionsTick();
    });
  });
}

/* ==================== MAGIC WALL — hotkey ====================
 * Binding persistido por conta em localStorage (F1..F12). A tecla arma/
 * desarma a mira exatamente como o clique no botão WALL. */
const PVP_WALL_HK_KEY = "tibia-idle-pvp-wall-hk";
const PVP_WALL_HK_KEYS = ["F1","F2","F3","F4","F5","F6","F7","F8","F9","F10","F11","F12"];
function pvpWallHotkey() {
  try { return localStorage.getItem(PVP_WALL_HK_KEY) || ""; } catch (e) { return ""; }
}
function pvpToggleWallAim() {
  const cc = typeof G !== "undefined" && G && G.combat;
  if (!cc || !cc.pvpBattle) return;
  cc._pvpWallAim = !cc._pvpWallAim;
  if (typeof toast === "function")
    toast(cc._pvpWallAim ? "Clique no SQM onde soltar a <b>Magic Wall</b>."
                         : "Magic Wall cancelada.", cc._pvpWallAim ? undefined : "bad");
  pvpActionsTick();
}
let _pvpHkMenuEl = null, _pvpHkPickEl = null;
function pvpHkClosePopups() {
  if (_pvpHkMenuEl) { _pvpHkMenuEl.remove(); _pvpHkMenuEl = null; }
  if (_pvpHkPickEl) { _pvpHkPickEl.remove(); _pvpHkPickEl = null; }
}
function pvpWallHotkeyMenu(ev) {
  pvpHkClosePopups();
  const el = document.createElement("div");
  el.className = "pvp-hk-menu";
  const bound = pvpWallHotkey();
  el.innerHTML = `<button class="pvp-hk-opt" data-op="pick">SELECT HOTKEY</button>` +
    (bound ? `<button class="pvp-hk-opt off" data-op="clear">CLEAR (${pvpEsc(bound)})</button>` : "");
  el.style.left = Math.min(ev.clientX, window.innerWidth - 150) + "px";
  el.style.top = Math.min(ev.clientY, window.innerHeight - 90) + "px";
  document.body.appendChild(el);
  _pvpHkMenuEl = el;
  el.querySelectorAll(".pvp-hk-opt").forEach((b) => b.addEventListener("click", () => {
    if (b.getAttribute("data-op") === "clear") {
      try { localStorage.removeItem(PVP_WALL_HK_KEY); } catch (e) { /* ignore */ }
      if (typeof toast === "function") toast("Hotkey da Magic Wall removida.");
      pvpHkClosePopups(); pvpActionsTick();
    } else pvpWallHotkeyPicker();
  }));
}
function pvpWallHotkeyPicker() {
  pvpHkClosePopups();
  const el = document.createElement("div");
  el.className = "pvp-hk-pick";
  el.innerHTML = `<div class="pvp-hk-pick-box"><div class="pvp-hk-title">SELECT HOTKEY</div>
    <div class="pvp-hk-grid">${PVP_WALL_HK_KEYS.map((k) =>
      `<button class="pvp-hk-key" data-k="${k}">${k}</button>`).join("")}</div>
    <div class="pvp-hk-hint">ESC cancela</div></div>`;
  document.body.appendChild(el);
  _pvpHkPickEl = el;
  el.querySelectorAll(".pvp-hk-key").forEach((b) => b.addEventListener("click", () => {
    const k = b.getAttribute("data-k");
    try { localStorage.setItem(PVP_WALL_HK_KEY, k); } catch (e) { /* ignore */ }
    if (typeof toast === "function") toast(`Magic Wall na tecla <b>${k}</b>.`);
    pvpHkClosePopups(); pvpActionsTick();
  }));
}
document.addEventListener("keydown", (e) => {
  if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" ||
      e.target.tagName === "SELECT" || e.target.isContentEditable)) return;
  if (_pvpHkPickEl) { // picker aberto: ESC fecha
    if (e.key === "Escape") { pvpHkClosePopups(); e.preventDefault(); }
    return;
  }
  if (_pvpHkMenuEl && e.key === "Escape") { pvpHkClosePopups(); e.preventDefault(); return; }
  const hk = pvpWallHotkey();
  if (hk && e.key === hk) {
    const c = typeof G !== "undefined" && G && G.combat;
    if (c && c.pvpBattle && !c.pvpBattle.finished) { pvpToggleWallAim(); e.preventDefault(); }
  }
});
// Clique fora fecha o menu/picker de hotkey.
document.addEventListener("click", (e) => {
  if (_pvpHkMenuEl && !_pvpHkMenuEl.contains(e.target)) { _pvpHkMenuEl.remove(); _pvpHkMenuEl = null; }
  if (_pvpHkPickEl && !_pvpHkPickEl.querySelector(".pvp-hk-pick-box").contains(e.target))
    pvpHkClosePopups();
});

function pvpActionsTick() {
  const c = typeof G !== "undefined" && G && G.combat;
  const st = c && c.pvpBattle;
  const inBattle = !!st && !st.finished;
  if (!inBattle) {
    pvpHkClosePopups();
    _pvpSelChar = null; _pvpCharOpen = null;
    if (_pvpActionsEl) _pvpActionsEl.style.display = "none";
    return;
  }
  // Char selecionado morreu → câmera volta pro fallback automático.
  if (_pvpSelChar) {
    const e = (c.players || []).find((x) => String(x.id) === _pvpSelChar);
    if (!e || !e.p || Number(e.p.hp) <= 0) _pvpSelChar = null;
  }
  if (!_pvpActionsEl) {
    const el = document.createElement("div");
    el.id = "pvp-actions";
    el.innerHTML =
      `<div class="pvp-act-grip" title="Arrastar">✥</div>
       <div class="pvp-act-row">
       <button class="pvp-act" id="pvp-act-wall" title="Magic Wall: clique e escolha o SQM — um char da PT com cooldown livre conjura (consome a runa). Botão direito: hotkey">
         <img src="assets/item/magic-wall-rune.png" alt="" draggable="false"><span>WALL</span><i class="pvp-hk"></i>
       </button>
       <button class="pvp-act on" id="pvp-act-target" title="Magias de ataque da PT. OFF = sequência de cooldowns livre pra Magic Wall">
         <span class="pvp-act-reticle"></span><span>TARGET</span>
       </button>
       <button class="pvp-act" id="pvp-act-regroup" title="REGROUP: todos os AFKs do time largam o alvo e vêm pra perto de você (60s free / 10s VIP)">
         <span class="pvp-act-flag"></span><span>REGROUP</span><i class="pvp-act-cd"></i>
       </button>
       </div>
       <div class="pvp-char-col" id="pvp-char-col"></div>`;
    document.body.appendChild(el);
    pvpActMakeDraggable(el, el.querySelector(".pvp-act-grip"));
    el.querySelector("#pvp-act-wall").addEventListener("click", pvpToggleWallAim);
    // Botão direito no WALL: menu com "SELECT HOTKEY" — o jogador atribui
    // uma tecla que arma a mira igual ao clique no botão.
    el.querySelector("#pvp-act-wall").addEventListener("contextmenu", (ev) => {
      ev.preventDefault(); ev.stopPropagation();
      pvpWallHotkeyMenu(ev);
    });
    el.querySelector("#pvp-act-target").addEventListener("click", () => {
      const cc = G && G.combat; if (!cc) return;
      cc._pvpAttackOff = !cc._pvpAttackOff;
      if (typeof toast === "function")
        toast(cc._pvpAttackOff ? "Magias de ataque <b>OFF</b> — cooldown livre pra wall."
                               : "Magias de ataque <b>ON</b>.");
      pvpActionsTick();
    });
    el.querySelector("#pvp-act-regroup").addEventListener("click", () => {
      const cc = G && G.combat; if (!cc || !cc.pvpBattle) return;
      const now = Date.now(), vip = !!(cc.p && Number(cc.p.vipUntil) > now) ||
        (typeof G !== "undefined" && G.p && Number(G.p.vipUntil) > now);
      const cd = vip ? 10000 : 60000;
      if (now - (Number(cc._pvpRegroupAt) || 0) < cd) {
        if (typeof toast === "function")
          toast("REGROUP em cooldown: <b>" + Math.ceil((cd - (now - cc._pvpRegroupAt)) / 1000) + "s</b>.", "bad");
        return;
      }
      cc._pvpRegroupAt = now; cc._pvpRegroupCd = cd;
      cc._pvpRegroup = 1; // enviado no próximo tick visual → autoridade aplica
      if (typeof toast === "function")
        toast("<b>REGROUP!</b> O time converge pra você.");
      pvpActionsTick();
    });
    _pvpActionsEl = el;
    pvpActPlace(el);
  }
  _pvpActionsEl.style.display = "flex";
  const wallBtn = _pvpActionsEl.querySelector("#pvp-act-wall");
  wallBtn.classList.toggle("on", !!c._pvpWallAim);
  // Badge da hotkey atribuída (F1..F12) no canto do botão WALL.
  const hkBadge = wallBtn.querySelector(".pvp-hk"), hk = pvpWallHotkey();
  hkBadge.textContent = hk || "";
  hkBadge.style.display = hk ? "block" : "none";
  const tgt = _pvpActionsEl.querySelector("#pvp-act-target");
  tgt.classList.toggle("on", !c._pvpAttackOff);
  tgt.classList.toggle("off", !!c._pvpAttackOff);
  tgt.lastElementChild.textContent = c._pvpAttackOff ? "TARGET OFF" : "TARGET ON";
  const rg = _pvpActionsEl.querySelector("#pvp-act-regroup");
  if (rg) {
    const cd = Number(c._pvpRegroupCd) || 0,
      left = Math.max(0, cd - (Date.now() - (Number(c._pvpRegroupAt) || 0)));
    rg.classList.toggle("off", left > 0);
    const cdEl = rg.querySelector(".pvp-act-cd");
    if (cdEl) {
      cdEl.textContent = left > 0 ? Math.ceil(left / 1000) + "s" : "";
      cdEl.style.display = left > 0 ? "block" : "none";
    }
  }
  pvpCharColTick(_pvpActionsEl.querySelector("#pvp-char-col"));
  // Cursor de mira enquanto WALL está armado.
  const cv = document.getElementById("scene");
  if (cv) cv.style.cursor = c._pvpWallAim ? "crosshair" : "";
}

function pvpScoreboardTick() {
  pvpTakeoverTick();
  pvpActionsTick();
  let el = document.getElementById("pvp-scoreboard");
  const st = (typeof G !== "undefined" && G && G.combat && G.combat.pvpBattle) || null;
  if (!st || st.finished) { if (el) el.style.display = "none"; return; }
  if (!el) {
    el = document.createElement("div");
    el.id = "pvp-scoreboard";
    document.body.appendChild(el);
  }
  const s1 = Number(st.scores && (st.scores[1] || st.scores["1"])) || 0;
  const s2 = Number(st.scores && (st.scores[2] || st.scores["2"])) || 0;
  const t1 = st.teams && st.teams["1"] && st.teams["1"].name || "Desafiante";
  const t2 = st.teams && st.teams["2"] && st.teams["2"].name || "Desafiado";
  const left = Math.max(0, (Number(st.endsAt) || 0) - Date.now());
  const control = st.mode === "control";
  const v1 = control ? pvpMmSs(s1) : String(s1).padStart(3, "0");
  const v2 = control ? pvpMmSs(s2) : String(s2).padStart(3, "0");
  const holder = Number(st.holder) || 0;
  const label = control
    ? `Domínio da área${holder ? ` — <b>${pvpEsc(holder === 1 ? t1 : t2)}</b> controla` : " — disputada/livre"}`
    : `Frags (meta ${st.fragTarget || 100})`;
  const total = 10 * 60000, pct = Math.max(0, Math.min(100, 100 - (left / total) * 100));
  const c = G.combat, own = pvpOwnTeam(), teamT = st.teams && st.teams[own] || {};
  const targetId = c && (c._pvpTeamTarget || teamT.targetId);
  const target = targetId ? (c.players || []).find((e) => String(e.id) === String(targetId)) : null;
  // Mesma leitura dos war shields: meu time verde, rival vermelho.
  const c1 = own === 1 ? "#37c837" : own === 2 ? "#d8372b" : "",
    c2 = own === 2 ? "#37c837" : own === 1 ? "#d8372b" : "";
  el.style.display = "block";
  el.innerHTML = `<div class="pvp-sb-head"><span class="pvp-sb-live">LIVE BATTLE</span><b>${pvpMmSs(left / 1000)}</b></div>
    <div class="pvp-sb-row"><span class="pvp-sb-t1"${c1 ? ` style="color:${c1}"` : ""}>${pvpEsc(t1)}</span>
    <b>${v1}</b><em>×</em><b>${v2}</b><span class="pvp-sb-t2"${c2 ? ` style="color:${c2}"` : ""}>${pvpEsc(t2)}</span></div>
    <div class="pvp-sb-bar"><i style="width:${pct.toFixed(1)}%"></i></div>
    <div class="pvp-sb-sub">${label}${target && target.p ? ` · alvo: ${pvpEsc(target.p.name)}` : ""}</div>`;
}

/* ============================== EVENTOS ================================== */
function pvpPost(path, body, okMsg) {
  return pvpApi("POST", path, body).then((r) => {
    const d = (r && r.data) || {};
    if (typeof toast === "function") toast(d.ok ? (okMsg || d.msg || "Feito.") : (d.msg || d.error || "Falha."), d.ok ? undefined : "bad");
    pvpLoadState();
    return d;
  });
}
document.addEventListener("click", (e) => {
  const t = e.target;
  if (!(t instanceof Element)) return;
  const tab = t.closest("[data-pvp-tab]");
  if (tab) { _pvpTab = tab.getAttribute("data-pvp-tab"); pvpRender(); return; }
  const guild = t.closest("[data-pvp-guild]");
  if (guild && !guild.disabled) { pvpOpenLobby(guild.getAttribute("data-pvp-guild")); return; }
  const cancel = t.closest("[data-pvp-cancel]");
  if (cancel) {
    if (window.confirm && !window.confirm("Cancelar o convite? A aposta volta para o caixa da guild.")) return;
    pvpPost("/api/pvp/cancel", { battleId: Number(cancel.getAttribute("data-pvp-cancel")) }, "Convite cancelado — aposta reembolsada.");
    return;
  }
  const forfeit = t.closest("[data-pvp-forfeit]");
  if (forfeit) {
    if (window.confirm && !window.confirm("Desistir da batalha? A guild rival vence e leva o pote (menos a taxa).")) return;
    pvpPost("/api/pvp/cancel", { battleId: Number(forfeit.getAttribute("data-pvp-forfeit")) }, "Desistência registrada.");
    return;
  }
  const buyTemp = t.closest("[data-pvp-buy-temp]");
  if (buyTemp && !buyTemp.disabled) {
    buyTemp.disabled = true;
    pvpApi("POST", "/api/guild/buy-temp", { char_id: Number(sessionCharId()), bonus_id: buyTemp.getAttribute("data-pvp-buy-temp") })
      .then((r) => {
        const d = (r && r.data) || {};
        if (typeof toast === "function") toast(d.msg || (d.ok ? "Boost ativado." : "Falha."), d.ok ? "level" : "bad");
        if (typeof guildTopbarSync === "function") guildTopbarSync();
        pvpLoadBoosts();
      });
    return;
  }
  const battle = t.closest("[data-pvp-battle]");
  if (battle) { pvpOpenBattle(battle.getAttribute("data-pvp-battle")); return; }
  const act = t.closest("[data-pvp]");
  if (act) {
    const a = act.getAttribute("data-pvp");
    if (a === "close") { closePvpModal(); return; }
    if (a === "back") { _pvpLobby = null; pvpRender(); return; }
    if (a === "create") { pvpCreate(false); return; }
    if (a === "quick") { pvpCreate(true); return; }
    if (a === "enter") { pvpEnterBattle(); return; }
  }
  const cur = t.closest("[data-pvp-cur]");
  if (cur && _pvpLobby) {
    pvpLobbyCapture();
    const next = cur.getAttribute("data-pvp-cur");
    // Trocar de moeda ajusta a aposta ao mínimo da nova moeda (5kk ↔ 25 TC).
    if (next !== _pvpLobby.currency) { _pvpLobby.currency = next; _pvpLobby.wager = pvpMinStake(next); }
    const w = document.getElementById("pvp-wager"); if (w) w.value = _pvpLobby.wager;
    pvpRenderLobby(); return;
  }
  const map = t.closest("[data-pvp-map]");
  if (map && _pvpLobby) { _pvpLobby.map = map.getAttribute("data-pvp-map"); pvpRenderLobby(); return; }
  const size = t.closest("[data-pvp-size]");
  if (size && _pvpLobby) { _pvpLobby.size = Number(size.getAttribute("data-pvp-size")); pvpRenderLobby(); return; }
  const acc = t.closest("[data-pvp-accept]");
  if (acc && !acc.disabled) {
    pvpPost("/api/pvp/respond", { battleId: Number(acc.getAttribute("data-pvp-accept")), accept: true },
      "Desafio aceito — aposta debitada do caixa da guild.");
    return;
  }
  const dec = t.closest("[data-pvp-decline]");
  if (dec && !dec.disabled) {
    pvpPost("/api/pvp/respond", { battleId: Number(dec.getAttribute("data-pvp-decline")), accept: false }, "Desafio recusado.");
    return;
  }
  const btn = t.closest("#btn-pvp");
  if (btn) { openPvpModal(); return; }
});
/* SSE "pvp": convite, aceite, preparo (T-10), início, fim. */
const PVP_SYNC_TOASTS = {
  invite: (d) => `Desafio PvP de <b>${pvpEsc(d.challengerName)}</b> (${pvpEsc(d.mapName)} ${d.teamSize}v${d.teamSize}).`,
  accepted: (d) => `<b>${pvpEsc(d.challengedName)}</b> aceitou o desafio PvP — ${pvpFmtWhen(d.scheduledAt)}.`,
  declined: (d) => `<b>${pvpEsc(d.challengedName)}</b> recusou o desafio PvP (aposta reembolsada).`,
  expired: () => "Desafio PvP expirou sem resposta (aposta reembolsada).",
  cancelled: () => "Batalha PvP cancelada — apostas reembolsadas.",
  forfeit: () => "Uma guild desistiu da batalha PvP.",
};
window.addEventListener("tibia-idle-sync-pvp", (ev) => {
  const d = (ev && ev.detail) || {};
  const notify = PVP_SYNC_TOASTS[d.action];
  if (notify && typeof toast === "function") toast(notify(d));
  if (d.action === "prep") {
    const me = pvpMyAccountId();
    const picked = d.roster && [].concat(d.roster[1] || [], d.roster[2] || []).some((r) => Number(r.accountId) === me);
    if (typeof toast === "function")
      toast(picked ? "<b>PvP em 10 minutos!</b> Você foi sorteado — hunts/bosses/quests bloqueados até o fim."
        : "<b>PvP em 10 minutos!</b> Sorteio da guild concluído.", "death");
    // Modal de preparação: roster sorteado + contagem regressiva.
    openPvpModal();
    setTimeout(() => pvpOpenBattle(d.id), 400);
  }
  if (d.action === "end") {
    const res = d.result || {};
    if (typeof toast === "function")
      toast(res.draw ? "Batalha PvP terminou <b>empatada</b> — apostas devolvidas."
        : `Batalha PvP encerrada — placar ${(res.scores && res.scores[1]) || 0}×${(res.scores && res.scores[2]) || 0}.`, "level");
    setTimeout(() => { openPvpModal(); setTimeout(() => pvpOpenBattle(d.id), 400); }, 1500);
  }
  pvpLoadState(false);
});
/* Instância publicada para o roster no início/retomada da batalha. */
window.addEventListener("tibia-idle-sync-instance", (ev) => {
  const e = ev && ev.detail && ev.detail.event;
  if (e && (e.action === "pvp-battle-start" || e.action === "pvp-battle-resume")) pvpEnterBattle();
});
/* Estado periódico: contador fora do modal e entrada automática (reload no
 * meio da batalha, SSE perdido). */
function pvpBackgroundSync() {
  if (!pvpOnlineMode()) return;
  pvpApi("GET", "/api/pvp/state").then((rs) => {
    const st = (rs && rs.data) || {};
    if (st.ok === false || !st.inGuild) { pvpCountdownClear(); return; }
    _pvpState = st;
    pvpPruneForeignRoster();
    pvpSyncCountdown(st);
    if (document.querySelector(".pvp-modal-shell")) pvpMarkSeen(st);
    pvpUpdateNotify();
    const b = st.battle;
    if (b && b.status === "live" && pvpRosterHasMe(b) &&
        !(typeof G !== "undefined" && G && G.combat && G.combat.pvpBattle)) pvpEnterBattle();
  }).catch(() => {});
}
setTimeout(pvpBackgroundSync, 4000);
setInterval(pvpBackgroundSync, 30000);
/* Placar: polling leve junto ao loop do jogo. */
setInterval(() => { try { pvpScoreboardTick(); } catch (e) {} }, 500);
