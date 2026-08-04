/* party-ui.js — Interface do Sistema de Party + Party Hunt Analyser
 * Botão PARTY no topo (ao lado de FORGE/PREY) com badge de membros.
 */
"use strict";

function renderPartyButton(p) {
  const btn = $("#btn-party");
  if (!btn) return;
  const badge = $("#party-badge");
  if (!badge) return;
  // modo online (multiplayer): badge = convites pendentes (✉) ou membros
  if (typeof partyOnlineMode === "function" && partyOnlineMode()) {
    const inv = p._partyInvites || 0;
    if (inv > 0) {
      badge.textContent = "✉" + inv;
      badge.style.display = "";
      btn.title = "Party — " + inv + " convite(s) pendente(s) na inbox";
      return;
    }
    const st = p._partyOnline;
    const n = (st && st.members) ? st.members.length : 0;
    if (n > 0) {
      badge.textContent = n;
      badge.style.display = "";
      btn.title = "Party — " + n + " membro(s)";
      return;
    }
    badge.textContent = "";
    badge.style.display = "none";
    return;
  }
  // modo local (roster do save)
  ensureParty(p);
  const n = p.party.members.length;
  if (n > 0) {
    badge.textContent = n;
    badge.style.display = "";
  } else {
    badge.textContent = "";
    badge.style.display = "none";
  }
}

function partyVocName(voc) {
  return (typeof VOCATIONS !== "undefined" && VOCATIONS[voc] && VOCATIONS[voc].name)
    ? VOCATIONS[voc].name : voc;
}

/* ------------------------------------------------------------------ */
/* PAINEL DE PARTY (OTC) — canto superior direito da tela do jogo      */
/* ------------------------------------------------------------------ */

/* Ícone pequeno da outfit do membro: sprite de vocação (como o seletor
 * de vocação usa) — assets/outfit/<voc>-m_s.png. */
function partyOutfitIcon(voc, sex) {
  const map = { knight: "knight", paladin: "hunter", druid: "summoner",
                sorcerer: "mage", monk: "monk" };
  const o = map[voc] || "citizen";
  const s = sex === "female" ? "f" : "m";
  return `assets/outfit/${o}-${s}_s.png`;
}

/* Troca para um personagem da party (mesma função do "Trocar personagem"). */
function partySwitchToChar(id) {
  try { localStorage.setItem(ACTIVE_CHARACTER_KEY, id); } catch (e) {}
  try { sessionStorage.setItem(AUTOLOGIN_KEY, id); } catch (e) {}
  try { sessionStorage.setItem("tibia-idle-char", id); } catch (e) {}
  location.reload();
}

/* Estado de colapso do painel (persiste na sessão). */
let PARTY_PANEL_OPEN = true;

/* Renderiza o painel de party (OTC). Em modo online usa o estado do
 * servidor (com hp/mp/zona de cada membro); em modo local usa o roster. */
function renderPartyPanel(p) {
  const panel = $("#party-panel");
  if (!panel) return;
  const body = $("#party-panel-body");
  if (!body) return;
  const count = $("#party-panel-count");
  const arrow = $("#party-panel-arrow");

  // membros: [ { id, name, voc, level, zone?, hp?, mp?, maxHp?, maxMp?, sex?, account_id? } ]
  let membros = [];
  let isOnline = false;

  if (typeof partyOnlineMode === "function" && partyOnlineMode()) {
    const st = p._partyOnline || null;
    if (!st) { panel.style.display = "none"; return; }
    isOnline = true;
    membros = [st.leader].concat(st.members || []);
    panel.style.display = "";
  } else {
    ensureParty(p);
    const pt = p.party;
    if (!pt.members.length) { panel.style.display = "none"; return; }
    // líder = o personagem atual
    membros = [{ id: characterId(p), name: p.name, voc: p.voc, level: p.level,
                 sex: p.sex, hp: p.hp, mp: p.mp, maxHp: maxStats(p).hp,
                 maxMp: maxStats(p).mp, _leader: true }];
    const chars = typeof getCharacters === "function" ? getCharacters() : [];
    for (const m of pt.members) {
      const c = chars.find((x) => (x.id || characterId(x)) === m.id);
      if (!c) continue;
      const mc = maxStats(c);
      membros.push({ id: m.id, name: c.name, voc: c.voc, level: c.level,
                     sex: c.sex, hp: c.hp || 0, mp: c.mp || 0,
                     maxHp: mc.hp, maxMp: mc.mp });
    }
    panel.style.display = "";
  }

  if (count) count.textContent = String(Math.max(0, membros.length - 1));
  if (arrow) arrow.textContent = PARTY_PANEL_OPEN ? "▾" : "▸";
  body.classList.toggle("collapsed", !PARTY_PANEL_OPEN);

  if (membros.length === 1) {
    body.innerHTML = `<div class="party-panel-empty">Você está sem party.<br>
      Abra o menu 👥 PARTY para criar/convidar.</div>`;
    return;
  }

  // qual conta é a atual (modo online): só dá pra trocar p/ chars da conta
  const acc = (typeof sessionAccount === "function") ? sessionAccount() : null;
  const currentId = characterId(p);

  const barra = (hp, mp, maxHp, maxMp) => {
    const h = maxHp > 0 ? Math.max(0, Math.min(100, hp * 100 / maxHp)) : 0;
    const m = maxMp > 0 ? Math.max(0, Math.min(100, mp * 100 / maxMp)) : 0;
    return `<div class="party-pbar"><div class="fill hp" style="width:${h}%"></div>
        <span class="val">${fmtFull(Math.floor(hp))}/${fmtFull(maxHp)}</span></div>
      <div class="party-pbar"><div class="fill mp" style="width:${m}%"></div>
        <span class="val">${fmtFull(Math.floor(mp))}/${fmtFull(maxMp)}</span></div>`;
  };

  const zonaIcon = (z) => ({
    city: "🏛", training: "🎯", hunt: "⚔️", boss: "💀", unknown: "❔",
  }[z] || "");

  body.innerHTML = membros.map((m) => {
    const isCurrent = Number(m.id) === Number(currentId);
    const isLeader = m._leader || (isOnline && Number(m.id) === Number(p._partyOnline && p._partyOnline.leader && p._partyOnline.leader.id));
    const myAccount = !isOnline || !m.account_id || (acc && Number(acc.id) === Number(m.account_id));
    const clickable = !isCurrent && myAccount;
    return `<div class="party-member-row ${clickable ? "" : "no-switch"}"
        data-party-char="${m.id}" data-switch="${clickable ? 1 : 0}"
        title="${clickable ? "Trocar para " + m.name : (isCurrent ? "Personagem atual" : "Membro de outra conta")}">
      <div class="ppm-outfit">
        <img src="${partyOutfitIcon(m.voc, m.sex)}" alt="">
      </div>
      <div class="ppm-info">
        <div class="ppm-name ${isLeader ? "leader" : ""}">${m.name}
          ${isCurrent ? '<span class="tiny dim"> (você)</span>' : ""}</div>
        <div class="ppm-meta">nv ${m.level} · ${partyVocName(m.voc)}
          <span class="ppm-zone" title="zona">${zonaIcon(m.zone)}</span></div>
        ${barra(m.hp, m.mp, m.maxHp, m.maxMp)}
      </div>
    </div>`;
  }).join("");

  // toggle abrir/fechar
  const head = $("#party-panel-head");
  if (head && !head._bound) {
    head._bound = true;
    head.addEventListener("click", () => {
      PARTY_PANEL_OPEN = !PARTY_PANEL_OPEN;
      renderPartyPanel(G.p);
    });
  }
  // clique no membro = trocar personagem (mesma função do "Trocar personagem")
  $$("#party-panel-body [data-party-char]").forEach((el) =>
    el.addEventListener("click", () => {
      if (el.dataset.switch !== "1") return;
      partySwitchToChar(el.dataset.partyChar);
    }));
}

function openPartyModal() {
  const p = G.p;
  if (!p) { toast("Crie um personagem primeiro"); return; }
  ensureParty(p);
  $("#modal-body").innerHTML = `<div class="panel-title">👥 Party
      <span style="flex:1"></span>
      <button class="sm" id="party-analyser-btn" title="Party Hunt Analyser completo">📊 Analyser</button>
      <button class="sm" id="party-close">✕</button>
    </div>
    <div class="panel-body"><div id="party-content"></div></div>`;
  $("#modal").classList.add("show", "wide");
  $("#party-close").addEventListener("click", () => {
    $("#modal").classList.remove("show", "wide");
  });
  const anal = $("#party-analyser-btn");
  if (anal) anal.addEventListener("click", () => openPartyAnalyserModal());
  renderPartyModal(p);
  // modo online: busca estado + inbox do servidor (assíncrono) e re-renderiza
  if (typeof partyOnlineMode === "function" && partyOnlineMode()) {
    refreshPartyOnline(p);
  }
}

/* Busca o estado da party + inbox no servidor e re-renderiza o modal. */
async function refreshPartyOnline(p) {
  const box = $("#party-content");
  if (box) box.innerHTML = `<div class="dim small center" style="padding:12px">Carregando party...</div>`;
  let st = null, invites = [];
  try {
    const [s, inb] = await Promise.all([accountPartyState(Number(sessionCharId())), partyFetchInbox()]);
    if (s.ok) st = s.state;
    if (inb.ok) invites = inb.invites || [];
  } catch (e) { /* rede */ }
  if (G && G.p) {
    G.p._partyOnline = st;
    G.p._partyInvites = invites.length;
  }
  renderPartyModal(p, { st, inbox: invites });
  if (typeof renderPartyButton === "function") renderPartyButton(p);
}

function renderPartyModal(p, online) {
  const box = $("#party-content");
  if (!box) return;
  // ---- modo online (multiplayer): servidor é a fonte da verdade ----
  if (typeof partyOnlineMode === "function" && partyOnlineMode()) {
    const st = (online && online.st) || p._partyOnline || null;
    const inbox = (online && online.inbox) || [];
    box.innerHTML = partyOnlineHtml(p, st, inbox);
    bindPartyOnline(p, st, inbox);
    return;
  }
  // ---- modo local (roster do save) ----
  ensureParty(p);
  const pt = p.party;
  const shareCheck = partyCanShare(p);

  // ---- membros
  let h = `<div class="party-header">
      <b>Líder: ${p.name} <span class="dim">(${partyVocName(p.voc)} · nv ${p.level})</span></b>
      <button class="sm" id="party-leave" ${pt.members.length ? "" : "disabled"}>Sair do party</button>
    </div>`;

  if (pt.members.length) {
    h += `<div class="party-members">` + pt.members.map((m, i) => `
      <div class="party-member">
        <span class="party-member-voc">${partyVocName(m.voc)}</span>
        <b>${m.name}</b>
        <span class="dim">nv ${m.level}</span>
        <span class="party-exp">+${fmtFull(m.expGained || 0)} xp</span>
        ${m.levelUps ? `<span style="color:#9ce84a">↑${m.levelUps} lvl</span>` : ""}
        <button class="sm" data-party-remove="${m.id}">Remover</button>
      </div>`).join("") + `</div>`;
  } else {
    h += `<div class="dim small center" style="padding:8px">Nenhum membro. Convide personagens do seu save.</div>`;
  }

  // ---- convites (roster)
  const disponiveis = partyAvailableMembers(p);
  if (disponiveis.length) {
    h += `<div class="party-invite-title tiny dim mt4">Convidar do seu save (${disponiveis.length}):</div>
      <div class="party-invite-grid">` + disponiveis.map((c) => `
        <div class="party-invite">
          <b>${c.name}</b> <span class="dim">${partyVocName(c.voc)} nv ${c.level}</span>
          <button class="sm" data-party-invite="${c.id}">Convidar</button>
        </div>`).join("") + `</div>`;
  }

  // ---- compartilhar exp
  h += `<div class="party-share">
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
        <input type="checkbox" id="party-share-exp" ${pt.shareExp ? "checked" : ""}
          ${pt.members.length ? "" : "disabled"}>
        <b>Compartilhar experiência</b>
        <span class="dim tiny">bônus: ${partyExpBonusPct(p)}% (${partyVocations(p).size} vocação(ões) diferente(s))</span>
      </label>
      ${!pt.members.length ? `<div class="tiny dim">Adicione membros para compartilhar.</div>` : ""}
      <div class="tiny" style="color:${shareCheck.ok ? "#9ce84a" : "#ff9a6a"}">${shareCheck.msg}</div>
      <div class="tiny dim">Fórmula (wiki): Exp = M × S ÷ P × C · o XP dos membros é aplicado de verdade no save deles.</div>
    </div>`;

  // ---- Party Hunt Analyser (sessão unificada local/online)
  const s = (typeof partyAnalyserSession === "function") ? partyAnalyserSession(p) : null;
  h += `<div class="party-analyser">
      <div class="panel-title" style="font-size:13px">📊 Party Hunt Analyser
        <span style="flex:1"></span>
        <button class="sm" data-analyser-full="1">Abrir completo</button></div>`;
  if (s) {
    const dur = Math.max(0, Math.round((s.endedAt || Date.now()) - s.startedAt) / 1000);
    const mm = Math.floor(dur / 60), ss = Math.floor(dur % 60);
    h += `<div class="stat-row"><span class="k">Duração</span><span class="v">${mm}m ${ss}s</span></div>
      <div class="stat-row"><span class="k">Kills</span><span class="v">${fmtFull(s.kills || 0)}</span></div>
      <div class="stat-row"><span class="k">Exp total</span><span class="v">${fmtFull(s.exp || 0)}</span></div>
      <div class="stat-row"><span class="k">Itens de loot</span><span class="v">${fmtFull(s.loot || 0)}</span></div>
      <div class="party-analyser-table">` +
      Object.keys(s.byMember || {}).map((id) => {
        const b = s.byMember[id];
        return `<div class="party-analyser-row">
          <span>${b.name || (id === "leader" ? p.name : "membro")}</span>
          <span>${fmtFull(b.exp)} xp</span>
          <span>${fmtFull(b.kills)} kills</span>
          ${b.levelUps ? `<span style="color:#9ce84a">↑${b.levelUps}</span>` : ""}
        </div>`;
      }).join("") + `</div>`;
  } else {
    h += `<div class="dim small center" style="padding:8px">Nenhuma caçada registrada ainda.</div>`;
  }
  h += `</div>`;

  box.innerHTML = h;

  // handlers
  const leave = $("#party-leave");
  if (leave) leave.addEventListener("click", () => {
    partyLeave(p);
    toast("Você saiu do party.");
    renderPartyModal(p);
    renderAll();
  });
  $$("#party-content [data-party-remove]").forEach((el) => {
    el.addEventListener("click", () => {
      partyRemoveMember(p, el.dataset.partyRemove);
      toast("Membro removido.");
      renderPartyModal(p);
      renderAll();
    });
  });
  $$("#party-content [data-party-invite]").forEach((el) => {
    el.addEventListener("click", () => {
      const r = partyAddMember(p, el.dataset.partyInvite);
      toast(r.ok ? "Convidado para o party!" : r.msg, r.ok ? "" : "bad");
      renderPartyModal(p);
      renderAll();
    });
  });
  const share = $("#party-share-exp");
  if (share) share.addEventListener("change", () => {
    const chk = partyCanShare(p);
    if (share.checked && !chk.ok) {
      toast(chk.msg, "bad");
      share.checked = false;
      return;
    }
    pt.shareExp = share.checked;
    toast(pt.shareExp ? "Experiência compartilhada ATIVA." : "Compartilhamento desativado.");
    renderPartyModal(p);
  });
  // botão "Abrir completo" do Analyser (modal completo)
  const analFull = $("#party-content [data-analyser-full]");
  if (analFull) analFull.addEventListener("click", () => openPartyAnalyserModal());
}

/* ------------------------------------------------------------------ */
/* ANALYZER (modal completo do Party Hunt Analyser)                    */
/* ------------------------------------------------------------------ */

/* Abre o modal completo do Analyser: duração, kills, exp, loot e a
 * tabela por membro (como o analisador de caçada do OTC). */
function openPartyAnalyserModal() {
  const p = G.p;
  if (!p) { toast("Crie um personagem primeiro"); return; }
  const s = (typeof partyAnalyserSession === "function") ? partyAnalyserSession(p) : null;
  const box = $("#modal-body");
  box.innerHTML = `<div class="panel-title">📊 Party Hunt Analyser
      <span style="flex:1"></span>
      <button class="sm" id="analyser-close">✕</button>
    </div>
    <div class="panel-body"><div id="analyser-content"></div></div>`;
  $("#modal").classList.add("show", "wide");
  $("#analyser-close").addEventListener("click", () => $("#modal").classList.remove("show", "wide"));

  const content = $("#analyser-content");
  if (!s) {
    content.innerHTML = `<div class="dim small center" style="padding:14px">
      Nenhuma caçada registrada. Inicie uma caçada com o party para o
      Analyser começar a coletar os dados.</div>`;
    return;
  }
  const dur = Math.max(0, Math.round((s.endedAt || Date.now()) - s.startedAt) / 1000);
  const mm = Math.floor(dur / 60), ss = Math.floor(dur % 60);
  const kills = s.kills || 0;
  const exp = s.exp || 0;
  const loot = s.loot || 0;
  const rows = Object.keys(s.byMember || {}).map((id) => {
    const b = s.byMember[id];
    return `<div class="party-analyser-row">
      <span><b>${b.name || (id === "leader" ? p.name : "membro")}</b></span>
      <span>${fmtFull(b.exp)} xp</span>
      <span>${fmtFull(b.kills)} kills</span>
      <span>${fmtFull(b.loot)} loot</span>
      ${b.levelUps ? `<span style="color:#9ce84a">↑${b.levelUps} lvl</span>` : ""}
    </div>`;
  }).join("") || `<div class="dim small center">Sem dados por membro ainda.</div>`;

  content.innerHTML = `
    <div class="panel-inset mb8" style="padding:8px">
      <div class="stat-row"><span class="k">Hunt</span><span class="v">${s.huntId ? ((GAMEDATA.hunts[s.huntId] || {}).name || s.huntId) : "—"}</span></div>
      <div class="stat-row"><span class="k">Duração</span><span class="v">${mm}m ${ss}s</span></div>
      <div class="stat-row"><span class="k">Kills</span><span class="v">${fmtFull(kills)}</span></div>
      <div class="stat-row"><span class="k">Exp total</span><span class="v" style="color:#9ce84a">${fmtFull(exp)}</span></div>
      <div class="stat-row"><span class="k">Itens de loot</span><span class="v">${fmtFull(loot)}</span></div>
      <div class="stat-row"><span class="k">Exp/h</span><span class="v">${fmtFull(Math.round(exp * 3600 / Math.max(1, dur)))}</span></div>
      <div class="stat-row"><span class="k">Kills/h</span><span class="v">${fmtFull(Math.round(kills * 3600 / Math.max(1, dur)))}</span></div>
    </div>
    <div class="party-analyser-table">${rows}</div>
    <div class="tiny dim mt8">Dados da sessão atual de caçada do party
      (resetam ao sair/voltar para a cidade).</div>`;
}

/* ------------------------------------------------------------------ */
/* PARTY ONLINE (multiplayer) — HTML e handlers                        */
/* ------------------------------------------------------------------ */

function partyZoneName(zone) {
  const map = {
    city: "🏛 Cidade (safe zone)",
    training: "🎯 Área de Treino",
    hunt: "⚔️ Local de Caça",
    boss: "💀 Sala de Boss",
    unknown: "❔ —",
  };
  return map[zone] || zone || "❔ —";
}

/* HTML do modal no modo online. `st` = estado do servidor (null = sem
 * party); `inbox` = convites pendentes da conta. */
function partyOnlineHtml(p, st, inbox) {
  const voc = (v) => (typeof VOCATIONS !== "undefined" && VOCATIONS[v])
    ? VOCATIONS[v].name : v;
  const podeConvidar = (typeof partyCanInviteNow === "function") && partyCanInviteNow();

  let h = `<div class="party-header">
      <b>👥 Party Online</b>
      <span class="tiny dim">multiplayer · servidor</span>
    </div>`;

  if (!st) {
    h += `<div class="dim small center" style="padding:10px">
        Você não está em nenhuma party.</div>
      <button class="primary full mt8" id="party-create">Criar party</button>
      <div class="tiny dim mt4">Ao criar, seu personagem vira o líder. Para
        convidar, você precisa estar na <b>Cidade</b> ou na <b>Área de Treino</b>.</div>`;
  } else {
    h += `<div class="party-members">`;
    // líder (sempre presente)
    h += `<div class="party-member leader">
        <span class="party-member-voc">${voc(st.leader.voc)}</span>
        <b>${st.leader.name}</b>
        <span class="dim tiny">líder</span>
        <span class="tiny" style="color:#9ce84a">${partyZoneName(st.leader.zone)}</span>
      </div>`;
    // membros
    for (const m of st.members) {
      h += `<div class="party-member">
        <span class="party-member-voc">${voc(m.voc)}</span>
        <b>${m.name}</b>
        <span class="dim">nv ${m.level}</span>
        ${st.isLeader ? `<button class="sm" data-party-kick="${m.id}">Remover</button>` : ""}
      </div>`;
    }
    h += `</div>`;

    if (st.isLeader) {
      // ---- líder: convidar por nome (só em cidade/treino) ----
      h += `<div class="party-invite-title tiny dim mt4">Convidar jogador (por nome do personagem):</div>
        <div class="row mb4" style="gap:4px">
          <input id="party-invite-name" maxlength="20" placeholder="Nome do personagem"
            style="flex:1;padding:3px 6px;background:#14120e;color:#c8c0a8;border:1px solid #16140f">
          <button class="sm primary" id="party-invite-btn" ${podeConvidar ? "" : "disabled"}>Convidar</button>
        </div>
        <div class="tiny ${podeConvidar ? "dim" : ""}" style="color:${podeConvidar ? "" : "#ff9a6a"}">
          ${podeConvidar
            ? "Você está em zona segura — pode convidar."
            : "⚠️ O líder só pode convidar na <b>Cidade</b> (safe zone) ou na <b>Área de Treino</b>."}
        </div>`;
      h += `<button class="sm mt8" id="party-leave">Dissolver party</button>`;
    } else {
      h += `<div class="tiny dim mt4">Follow ativo: quando o líder mudar de
        mapa ou entrar numa hunt/boss, você será teleportado para a MESMA instância.</div>
        <button class="sm mt8" id="party-leave">Sair do party</button>`;
    }
  }

  // ---- inbox: convites pendentes (aceitar de qualquer personagem) ----
  h += `<div class="party-invite-title tiny dim mt4">Inbox de convites:</div>`;
  if (!inbox.length) {
    h += `<div class="dim small center" style="padding:6px">Nenhum convite pendente.</div>`;
  } else {
    h += `<div class="party-invite-grid">` + inbox.map((i) => `
      <div class="party-invite">
        <b>${i.leader_name}</b>
        <span class="dim tiny">te convidou p/ ${i.character_name}</span>
        <span class="tiny">${partyZoneName(i.leader_zone)}</span>
        <div class="row" style="gap:4px;margin-top:4px">
          <button class="sm primary" data-party-accept="${i.id}">Aceitar</button>
          <button class="sm" data-party-decline="${i.id}">Recusar</button>
        </div>
      </div>`).join("") + `</div>`;
  }

  h += `<div class="tiny dim mt4">Troque de personagem (botão "Trocar
    personagem") para aceitar o convite com o personagem convidado.</div>`;
  return h;
}

/* Handlers do modal online. */
function bindPartyOnline(p, st, inbox) {
  const recarregar = () => { if (typeof refreshPartyOnline === "function") refreshPartyOnline(p); };

  const create = $("#party-create");
  if (create) create.addEventListener("click", async () => {
    const r = await partyOnlineCreate();
    toast(r.ok ? "Party criada! Você é o líder." : (r.msg || "Falha"), r.ok ? "level" : "bad");
    if (r.ok) recarregar();
  });

  const invBtn = $("#party-invite-btn");
  if (invBtn) invBtn.addEventListener("click", async () => {
    const name = ($("#party-invite-name").value || "").trim();
    if (!name) { toast("Digite o nome do personagem"); return; }
    const r = await partyOnlineInvite(name);
    toast(r.ok ? "Convite enviado!" : (r.msg || "Falha"), r.ok ? "level" : "bad");
    if (r.ok) recarregar();
  });

  const leave = $("#party-leave");
  if (leave) leave.addEventListener("click", async () => {
    const r = await partyOnlineLeave();
    toast(r.ok ? r.msg : (r.msg || "Falha"), r.ok ? "" : "bad");
    if (r.ok) recarregar();
  });

  $$("#party-content [data-party-kick]").forEach((el) =>
    el.addEventListener("click", async () => {
      const r = await accountPartyKick(Number(sessionCharId()), el.dataset.partyKick);
      toast(r.ok ? r.msg : (r.msg || "Falha"), r.ok ? "" : "bad");
      if (r.ok) recarregar();
    }));

  $$("#party-content [data-party-accept]").forEach((el) =>
    el.addEventListener("click", async () => {
      // REGRA: só aceita convite em Safe Zone (cidade) ou Área de Treino
      if (typeof partyCanInviteNow === "function" && !partyCanInviteNow()) {
        toast("Para aceitar um convite você precisa estar na Cidade ou na Área de Treino.", "bad");
        return;
      }
      const r = await accountPartyAccept(el.dataset.partyAccept);
      toast(r.ok ? r.msg : (r.msg || "Falha"), r.ok ? "level" : "bad");
      if (r.ok) { recarregar(); renderAll(); }
    }));

  $$("#party-content [data-party-decline]").forEach((el) =>
    el.addEventListener("click", async () => {
      const r = await accountPartyDecline(el.dataset.partyDecline);
      toast(r.ok ? r.msg : (r.msg || "Falha"), r.ok ? "" : "bad");
      if (r.ok) recarregar();
    }));
}

function bindPartyButton() {
  const btn = $("#btn-party");
  if (!btn) return;
  btn.addEventListener("click", () => openPartyModal());
}
