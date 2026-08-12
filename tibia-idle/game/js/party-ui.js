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
  // modo local (roster do save): badge = convites pendentes (✉) ou membros
  if (typeof partyPendingInvites === "function") {
    const inv = partyPendingInvites(p).length;
    if (inv > 0) {
      badge.textContent = "✉" + inv;
      badge.style.display = "";
      btn.title = "Party — " + inv + " convite(s) pendente(s) — abra o menu Party para aceitar";
      return;
    }
  }
  ensureParty(p);
  const n = p.party.members.length;
  if (n > 0) {
    badge.textContent = n;
    badge.style.display = "";
    btn.title = "Party — " + n + " membro(s)";
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
function partyOutfitHtml(member) {
  // Canvas colorido é preenchido após o painel montar; evita mostrar o
  // sheet .base branco/preto inteiro como se fosse uma miniatura.
  return `<div class="party-outfit-preview" data-party-preview="${member.id}"></div>`;
}
// Compatibilidade do cartão Heal Friend: a preview completa é aplicada no
// painel OTC; aqui usa a sprite clássica segura para não interromper o Helper.
function partyOutfitIcon(member, sex) {
  const voc = typeof member === "object" ? member.voc : member;
  const map = { knight:"knight", paladin:"hunter", druid:"summoner", sorcerer:"mage", monk:"monk" };
  return `assets/outfit/${map[voc] || "citizen"}-${sex === "female" ? "f" : "m"}_s.png`;
}

/* Troca para um personagem da party (mesma função do "Trocar personagem"). */
function partySwitchToChar(id) {
  // Em party combat, trocar personagem é trocar o controle para a entidade
  // viva já presente na hunt — recarregar levaria o membro a Thais e o
  // duplicaria na instância.
  if (typeof G !== "undefined" && G.combat && G.combat.players &&
      G.combat.players.some((e) => String(e.id) === String(id)) &&
      typeof partyCombatSwitchTo === "function") {
    return partyCombatSwitchTo(id);
  }
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
    // A party local é do storage COMPARTILHADO: o líder é FIXO no
    // personagem que criou — trocar de personagem não move a liderança.
    const ld = (typeof partyLocalData === "function") ? partyLocalData() : null;
    if (!pt.members.length && !ld) { panel.style.display = "none"; return; }
    const chars = typeof getCharacters === "function" ? getCharacters() : [];
    const lider = chars.find((x) => String(x.id || characterId(x)) === String(ld ? ld.leaderId : characterId(p)));
    if (!lider) { panel.style.display = "none"; return; }
    const lc = maxStats(lider);
    // durante o PARTY COMBAT o HP vivo vem das entidades em cena
    let live = null;
    if (typeof G !== "undefined" && G && G.combat &&
        Array.isArray(G.combat.players) && G.combat.players.length > 1) {
      live = {};
      for (const e of G.combat.players) live[String((e.p && (e.p.id || characterId(e.p))) || e.id)] = e;
    }
    const statsDe = (c) => {
      const ent = live ? live[String(c.id || characterId(c))] : null;
      const mc = maxStats(c);
      return {
        hp: ent ? Math.max(0, ent.p.hp || 0) : (c.hp || 0),
        mp: ent ? Math.max(0, ent.p.mp || 0) : (c.mp || 0),
        maxHp: mc.hp, maxMp: mc.mp,
      };
    };
    const ls = statsDe(lider);
    membros = [{ id: lider.id, name: lider.name, voc: lider.voc, level: lider.level,
                 sex: lider.sex, outfit: lider.outfit, _p: lider, hp: ls.hp, mp: ls.mp, maxHp: ls.maxHp,
                 maxMp: ls.maxMp, _leader: true }];
    for (const m of (ld ? ld.members : pt.members)) {
      const c = chars.find((x) => String(x.id || characterId(x)) === String(m.id));
      if (!c) continue;
      const ms = statsDe(c);
      membros.push({ id: c.id, name: c.name, voc: c.voc, level: c.level,
                     sex: c.sex, outfit: c.outfit, _p: c, hp: ms.hp, mp: ms.mp,
                     maxHp: ms.maxHp, maxMp: ms.maxMp });
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
      <div class="ppm-outfit">${partyOutfitHtml(m)}</div>
      <div class="ppm-info">
        <div class="ppm-name ${isLeader ? "leader" : ""}">${m.name}
          ${isCurrent ? '<span class="tiny dim"> (você)</span>' : ""}</div>
        <div class="ppm-meta">nv ${m.level} · ${partyVocName(m.voc)}
          <span class="ppm-zone" title="zona">${zonaIcon(m.zone)}</span></div>
        ${barra(m.hp, m.mp, m.maxHp, m.maxMp)}
      </div>
    </div>`;
  }).join("");

  // Aplica a composição 15x com cores/addons/montaria à miniatura da party.
  for (const m of membros) {
    const host = body.querySelector(`[data-party-preview="${m.id}"]`);
    if (!host) continue;
    const source = m._p || m;
    const cv = (typeof AppearanceRenderer !== "undefined") ? AppearanceRenderer.preview(source, "s") : null;
    if (cv) { host.innerHTML = ""; cv.style.width = "32px"; cv.style.height = "32px"; host.appendChild(cv); }
    else host.innerHTML = `<img src="assets/outfit/citizen-${m.sex === "female" ? "f" : "m"}_s.png" alt="">`;
  }

  // botão LEAVE HUNT: visível quando a party está numa hunt/boss — o líder
  // sai (todos voltam via follow de retorno) ou o membro sai sozinho
  if (typeof partyInInstance === "function" && partyInInstance()) {
    body.innerHTML += `<div style="padding:4px">
      <button class="sm danger full" id="party-leave-hunt">LEAVE HUNT</button>
      <div class="tiny dim center" style="margin-top:2px">A instância fica ativa enquanto o líder caçar.</div>
    </div>`;
    const lh = $("#party-leave-hunt");
    if (lh) lh.addEventListener("click", async () => {
      if (typeof partyLeaveHunt === "function") await partyLeaveHunt();
      renderPartyPanel(G.p);
    });
  }

  // toggle abrir/fechar
  const head = $("#party-panel-head");
  if (head && !head._bound) {
    head._bound = true;
    head.addEventListener("click", () => {
      PARTY_PANEL_OPEN = !PARTY_PANEL_OPEN;
      renderPartyPanel(G.p);
    });
  }
  // clique no membro = trocar personagem. Durante o PARTY COMBAT (todos na
  // mesma instância) a troca é imediata, sem recarregar a página — o
  // jogador controla todos os personagens da party.
  $$("#party-panel-body [data-party-char]").forEach((el) =>
    el.addEventListener("click", () => {
      if (el.dataset.switch !== "1") return;
      const inCombat = typeof G !== "undefined" && G && G.combat &&
        Array.isArray(G.combat.players) && G.combat.players.length > 1 &&
        G.combat.players.some((e) => String(e.id) === String(el.dataset.partyChar));
      if (inCombat && typeof partyCombatSwitchTo === "function") {
        partyCombatSwitchTo(el.dataset.partyChar);
        return;
      }
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
  const ld0 = (typeof partyLocalData === "function") ? partyLocalData() : null;
  if (!ld0) {
    // sem party local ainda: criar transforma o personagem atual em líder
    box.innerHTML = `<div class="party-header"><b>👥 Party</b>
        <span class="tiny dim">personagens do seu save</span></div>
      <div class="dim small center" style="padding:10px">
        Você não está em nenhuma party. Crie uma para convidar os outros
        personagens do seu save — eles precisam ACEITAR o convite.</div>
      <button class="primary full mt8" id="party-create-local">Criar party</button>
      <div class="tiny dim mt4">Ao criar, <b>${p.name}</b> vira o líder da party.
        O líder é fixo: trocar de personagem não move a liderança.</div>`;
    const cr = $("#party-create-local");
    if (cr) cr.addEventListener("click", () => {
      try {
        localStorage.setItem("tibia-idle-party-local-v1", JSON.stringify({
          leaderId: String(p.id || characterId(p)),
          leaderName: p.name,
          members: [], invites: [],
          shareExp: false, session: null,
        }));
      } catch (e) { /* storage */ }
      toast("Party criada! Você é o líder.");
      renderPartyModal(p);
      renderAll();
    });
    return;
  }
  // ---- modo local (roster do save) ----
  ensureParty(p);
  const pt = p.party;
  const ld = ld0;
  const shareCheck = partyCanShare(p);
  const souLider = (typeof partyIsLeaderLocal === "function") && partyIsLeaderLocal(p);
  const souMembro = (typeof partyIsMemberLocal === "function") && partyIsMemberLocal(p);
  const chars = typeof getCharacters === "function" ? getCharacters() : [];
  const liderChar = ld ? chars.find((x) => String(x.id || characterId(x)) === String(ld.leaderId)) : p;
  const podeConvidar = (typeof partyCanInviteNow === "function") && partyCanInviteNow();

  // ---- membros (líder fixo no criador)
  let h = `<div class="party-header">
      <b>Líder: ${liderChar ? liderChar.name : (ld ? ld.leaderName : p.name)}
        ${liderChar ? `<span class="dim">(${partyVocName(liderChar.voc)} · nv ${liderChar.level})</span>` : ""}</b>
      <button class="sm" id="party-leave" ${(ld || pt.members.length) ? "" : "disabled"}>
        ${souLider ? "Dissolver party" : (souMembro ? "Sair do party" : "Sair do party")}</button>
    </div>`;

  if (pt.members.length) {
    h += `<div class="party-members">` + pt.members.map((m, i) => `
      <div class="party-member">
        <span class="party-member-voc">${partyVocName(m.voc)}</span>
        <b>${m.name}</b>
        <span class="dim">nv ${m.level}</span>
        <span class="party-exp">+${fmtFull(m.expGained || 0)} xp</span>
        ${m.levelUps ? `<span style="color:#9ce84a">↑${m.levelUps} lvl</span>` : ""}
        ${souLider ? `<button class="sm" data-party-remove="${m.id}">Remover</button>` : ""}
      </div>`).join("") + `</div>`;
  } else if (souLider) {
    h += `<div class="dim small center" style="padding:8px">Nenhum membro ainda. Convide personagens do seu save — eles precisam ACEITAR. (party máx. 5)</div>`;
  } else if (souMembro) {
    h += `<div class="dim small center" style="padding:8px">Você é membro do party de <b>${liderChar ? liderChar.name : (ld ? ld.leaderName : "")}</b>.</div>`;
  }

  // ---- convites PENDENTES para o personagem ATUAL (aceitar aqui)
  const pendentes = (typeof partyPendingInvites === "function") ? partyPendingInvites(p) : [];
  if (pendentes.length) {
    h += `<div class="party-invite-title tiny dim mt4">Convites pendentes (${pendentes.length}):</div>
      <div class="party-invite-grid">` + pendentes.map((i) => `
        <div class="party-invite">
          <b>${i.fromName}</b>
          <span class="dim tiny">te convidou para a party</span>
          <div class="row" style="gap:4px;margin-top:4px">
            <button class="sm primary" data-party-accept="${i.id}">Aceitar</button>
            <button class="sm" data-party-decline="${i.id}">Recusar</button>
          </div>
        </div>`).join("") + `</div>
      <div class="tiny ${podeConvidar ? "dim" : ""}" style="color:${podeConvidar ? "" : "#ff9a6a"}">
        ${podeConvidar
          ? "Você está em zona segura — pode aceitar."
          : "⚠️ Para aceitar o convite você precisa estar na <b>Cidade</b> ou na <b>Área de Treino</b>."}
      </div>`;
  }

  // ---- convites ENVIADOS (aguardando aceite) — o líder vê quem falta
  if (souLider && typeof partyPendingInvitesAll === "function") {
    const enviados = partyPendingInvitesAll();
    if (enviados.length) {
      h += `<div class="party-invite-title tiny dim mt4">Convites enviados (aguardando aceite ${enviados.length}):</div>
        <div class="party-invite-grid">` + enviados.map((i) => `
          <div class="party-invite">
            <b>${i.toName}</b>
            <span class="tiny dim">troque para ele e aceite no menu Party</span>
            <div class="row" style="gap:4px;margin-top:4px">
              <button class="sm" data-party-cancel="${i.id}">Cancelar convite</button>
            </div>
          </div>`).join("") + `</div>`;
    }
  }

  // ---- convidar (só o líder, só em cidade/treino)
  if (souLider) {
    const disponiveis = partyAvailableMembers(p);
    h += `<div class="party-invite-title tiny dim mt4">Convidar do seu save (${disponiveis.length}):</div>`;
    if (disponiveis.length) {
      h += `<div class="party-invite-grid">` + disponiveis.map((c) => `
        <div class="party-invite">
          <b>${c.name}</b> <span class="dim">${partyVocName(c.voc)} nv ${c.level}</span>
          <button class="sm" data-party-invite="${c.id}" ${podeConvidar ? "" : "disabled"}>Convidar</button>
        </div>`).join("") + `</div>`;
    } else {
      h += `<div class="dim small center" style="padding:6px">Ninguém disponível (todos já convidados ou no party).</div>`;
    }
    h += `<div class="tiny ${podeConvidar ? "dim" : ""}" style="color:${podeConvidar ? "" : "#ff9a6a"}">
        ${podeConvidar
          ? "Você está em zona segura — pode convidar."
          : "⚠️ O líder só pode convidar na <b>Cidade</b> (safe zone) ou na <b>Área de Treino</b>."}
      </div>
      <div class="tiny dim">O convite fica PENDENTE: troque para o personagem convidado e aceite pelo menu Party.</div>`;
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
      <div class="tiny dim mt4">⭐ Ao caçar com o líder, TODOS os membros vão para a MESMA instância — clique neles no painel para controlar cada um.</div>
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
    const r = partyLeave(p);
    toast(r && r.msg ? r.msg : "Você saiu do party.", r && r.ok ? "" : "bad");
    renderPartyModal(p);
    renderAll();
  });
  $$("#party-content [data-party-remove]").forEach((el) => {
    el.addEventListener("click", () => {
      const r = partyRemoveMember(p, el.dataset.partyRemove);
      toast(r && r.msg ? r.msg : "Membro removido.", r && r.ok ? "" : "bad");
      renderPartyModal(p);
      renderAll();
    });
  });
  $$("#party-content [data-party-invite]").forEach((el) => {
    el.addEventListener("click", () => {
      const r = partyInviteMember(p, el.dataset.partyInvite);
      toast(r && r.msg ? r.msg : (r.ok ? "Convidado!" : "Falha"), r && r.ok ? "level" : "bad");
      renderPartyModal(p);
    });
  });
  $$("#party-content [data-party-accept]").forEach((el) => {
    el.addEventListener("click", () => {
      const r = partyAcceptInvite(p, el.dataset.partyAccept);
      toast(r && r.msg ? r.msg : (r.ok ? "Entrou no party!" : "Falha"), r && r.ok ? "level" : "bad");
      renderPartyModal(p);
      renderAll();
    });
  });
  $$("#party-content [data-party-decline]").forEach((el) => {
    el.addEventListener("click", () => {
      const r = partyDeclineInvite(p, el.dataset.partyDecline);
      toast(r && r.msg ? r.msg : "Convite recusado.", r && r.ok ? "" : "bad");
      renderPartyModal(p);
    });
  });
  $$("#party-content [data-party-cancel]").forEach((el) => {
    el.addEventListener("click", () => {
      const r = (typeof partyCancelInvite === "function")
        ? partyCancelInvite(p, el.dataset.partyCancel) : { ok: false, msg: "Sem função." };
      toast(r && r.msg ? r.msg : "Falha.", r && r.ok ? "" : "bad");
      renderPartyModal(p);
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
    // grava o share na party compartilhada
    const d = partyLocalData();
    if (d) { d.shareExp = share.checked; partyLocalWrite(d); }
    pt.shareExp = share.checked;
    toast(pt.shareExp ? "Experiência compartilhada ATIVA." : "Compartilhamento desativado.");
    renderPartyModal(p);
  });
  // botão "Abrir completo" do Analyser (modal completo)
  const analFull = $("#party-content [data-analyser-full]");
  if (analFull) analFull.addEventListener("click", () => openPartyAnalyserModal());
}

/* ------------------------------------------------------------------ */
/* HEAL FRIEND (Druid/Monk) — aba dentro do Helper: Cura               */
/* ------------------------------------------------------------------ */

/* Magias de cura de ALIADO disponíveis (Druid/Monk). */
function healFriendSpells(p) {
  const ids = [];
  if (!p) return ids;
  const éDruid = p.voc === "druid" || p.voc === "elder druid";
  const éMonk = p.voc === "monk" || p.voc === "exalted monk";
  if (éDruid) ids.push("exura-sio", "exura-gran-sio", "exura-gran-mas-res");
  if (éMonk) ids.push("exura-tio-sio");
  return ids.filter((id) => SPELLS[id] && p.level >= (SPELLS[id].lvl || 1));
}

/* Renderiza a aba HEAL FRIEND dentro do Helper: Cura (só Druid/Monk). */
function renderHealFriend(p) {
  const box = $("#helper-heal-friend-panel");
  if (!box || !p) return;
  const éDruid = p.voc === "druid" || p.voc === "elder druid";
  const éMonk = p.voc === "monk" || p.voc === "exalted monk";
  if (!éDruid && !éMonk) { box.style.display = "none"; return; }
  box.style.display = "";

  const cfg = p.config;
  if (cfg.healFriendAt === undefined) cfg.healFriendAt = 70;
  const selecionada = cfg.healFriendSpell || "";
  let healCfgDirty = false;
  if (!cfg.healFriendSpells) { cfg.healFriendSpells = {}; healCfgDirty = true; }
  const alvos = (typeof partyHealTargets === "function") ? partyHealTargets(p) : [];
  // Cada aliado pode ser ligado/desligado e recebe uma prioridade. Mantemos
  // os alvos existentes habilitados por padrão para não quebrar configs antigas.
  if (!cfg.healFriendTargets) cfg.healFriendTargets = {};
  alvos.forEach((m, i) => {
    const key = String(m.id);
    if (!cfg.healFriendTargets[key]) { cfg.healFriendTargets[key] = { enabled: true, priority: i + 1 }; healCfgDirty = true; }
  });

  if (!cfg.healFriendPriority) cfg.healFriendPriority = "friend";
  let h = `<div class="small dim mb4" style="color:#9ce84a;font-weight:bold">❤️ HEAL FRIEND — curar aliados da party</div>
    <div class="mt6 mb8"><label class="small dim">Prioridade do grupo Healing</label>
      <select id="helper-heal-priority" style="width:100%"><option value="friend" ${cfg.healFriendPriority === "friend" ? "selected" : ""}>Priorizar Exura Sio / aliados</option><option value="self" ${cfg.healFriendPriority === "self" ? "selected" : ""}>Priorizar auto cura</option></select></div>`;

  // seleção de magia de aliado
  const spells = healFriendSpells(p);
  spells.forEach((id) => { if (!cfg.healFriendSpells[id]) { cfg.healFriendSpells[id] = { enabled: (selecionada === id) || id === "exura-sio", at: cfg.healFriendAt || 70, minTargets: 2 }; healCfgDirty = true; } });
  if (healCfgDirty && typeof saveCharacterToRoster === "function") saveCharacterToRoster(p);
  if (!spells.length) {
    h += `<div class="tiny dim">As magias de cura de aliado desbloqueiam com o nível.</div>`;
    box.innerHTML = h;
    return;
  }
  h += `<div class="small dim mb4">Magia de aliado:</div>
    <div class="list" style="max-height:110px">` + spells.map((id) => {
      const s = SPELLS[id];
      const rule = cfg.healFriendSpells[id];
      const sel = !!rule.enabled;
      const mass = /gran mas res/i.test(id);
      const faixa = typeof spellRangeText === "function" ? spellRangeText(p, s) : "";
      return `<div class="shop-row ${sel ? "selected" : ""}" style="cursor:pointer" data-heal-friend-spell="${id}">
        ${spellIcon(s)}
        <div style="flex:1;min-width:0">
          <div class="small">${s.name}
            ${faixa ? `<span style="color:#7ae87a">· ${faixa} hp</span>` : ""}</div>
          <div class="tiny dim">${s.words ? `<b>${s.words}</b> · ` : ""}${s.mana} mana · nv ${s.lvl} · cd ${Math.round((s.cd||1000)/1000)}s
            ${mass ? `<span style="color:#ffd65a">· mass (2+ aliados feridos)</span>` : ""}</div>
        </div>
        <label class="tiny"><input type="checkbox" data-heal-friend-spell="${id}" ${sel ? "checked" : ""}> ativa</label>
        <label class="tiny dim">HP% <input type="number" min="1" max="99" value="${rule.at}" data-heal-friend-at="${id}" style="width:38px"></label>
        ${mass ? `<label class="tiny dim">aliados <input type="number" min="2" max="8" value="${rule.minTargets || 2}" data-heal-friend-min="${id}" style="width:34px"></label>` : ""}
      </div>`;
    }).join("") + `</div>`;



  // lista de aliados da party com HP
  h += `<div class="small dim mt8 mb4">Aliados na party (${alvos.length}):</div>`;
  if (!alvos.length) {
    h += `<div class="tiny dim">Nenhum aliado na party — convide membros para curá-los.</div>`;
  } else {
    h += alvos.map((m) => {
      const pct = m.maxHp > 0 ? Math.round((m.hp || 0) * 100 / m.maxHp) : 0;
      const ferido = m.maxHp > 0 && Object.values(cfg.healFriendSpells || {}).some((r) => r.enabled && pct < (r.at || r.hpBelow || 70));
      const targetCfg = cfg.healFriendTargets[String(m.id)] || { enabled: true, priority: 1 };
      return `<div class="party-member-row" style="cursor:default">
        <label class="tiny" title="Incluir este aliado no Heal Friend"><input type="checkbox" data-heal-target-enabled="${m.id}" ${targetCfg.enabled ? "checked" : ""}> curar</label>
        <div class="ppm-outfit">${partyOutfitHtml(m)}</div>
        <div class="ppm-info">
          <div class="ppm-name">${m.name}</div>
          <div class="ppm-meta">nv ${m.level || "?"} · ${partyVocName(m.voc)}</div>
          <div class="party-pbar"><div class="fill hp" style="width:${Math.max(0,Math.min(100,pct))}%"></div>
            <span class="val">${fmtFull(Math.floor(m.hp||0))}/${fmtFull(m.maxHp||0)}</span></div>
        </div>
        <label class="tiny dim">prio <input type="number" min="1" max="99" value="${targetCfg.priority}" data-heal-target-priority="${m.id}" style="width:38px"></label>
        <span class="tiny" style="color:${ferido ? "#ff9090" : "#9ce84a"}">${ferido ? "ferido" : "ok"}</span>
      </div>`;
    }).join("");
  }
  h += `<div class="tiny dim mt4">A cura aplica de verdade nos aliados (save deles). A Mass Healing
    (exura gran mas res) só dispara com <b>2+ aliados feridos</b> ao alcance.</div>`;
  box.innerHTML = h;
  // Preview 15x colorida no próprio painel Heal Friend (não usa sheet base).
  for (const m of alvos) {
    const host = box.querySelector(`[data-party-preview="${m.id}"]`);
    if (!host || typeof AppearanceRenderer === "undefined") continue;
    const cv = AppearanceRenderer.preview(m, "s");
    if (cv) { cv.style.width="32px"; cv.style.height="32px"; cv.style.imageRendering="pixelated"; host.innerHTML=""; host.appendChild(cv); }
  }

  // handlers
  const priority = $("#helper-heal-priority");
  if (priority) priority.addEventListener("change", () => { cfg.healFriendPriority = priority.value; if (typeof saveCharacterToRoster === "function") saveCharacterToRoster(p); });
  // Delegação única: os controles sobrevivem a re-renderizações e não
  // dependem do label/card pai para ativar a checkbox.
  box.onchange = (ev) => {
    const el = ev.target;
    if (el.dataset.healFriendSpell) {
      const id = el.dataset.healFriendSpell;
      cfg.healFriendSpells[id].enabled = !!el.checked;
    } else if (el.dataset.healFriendAt) {
      const id = el.dataset.healFriendAt;
      cfg.healFriendSpells[id].at = Math.max(1, Math.min(99, parseInt(el.value, 10) || 70));
    } else if (el.dataset.healFriendMin) {
      const id = el.dataset.healFriendMin;
      cfg.healFriendSpells[id].minTargets = Math.max(2, Math.min(8, parseInt(el.value, 10) || 2));
    } else return;
    if (typeof saveCharacterToRoster === "function") saveCharacterToRoster(p);
    renderHealFriend(p);
  };
  $$("#helper-heal-friend-panel [data-heal-target-enabled]").forEach((el) => el.addEventListener("change", () => {
    const key = String(el.dataset.healTargetEnabled);
    cfg.healFriendTargets[key] = cfg.healFriendTargets[key] || { priority: 1 };
    cfg.healFriendTargets[key].enabled = el.checked;
    if (typeof saveCharacterToRoster === "function") saveCharacterToRoster(p);
  }));
  $$("#helper-heal-friend-panel [data-heal-target-priority]").forEach((el) => el.addEventListener("change", () => {
    const key = String(el.dataset.healTargetPriority);
    cfg.healFriendTargets[key] = cfg.healFriendTargets[key] || { enabled: true };
    cfg.healFriendTargets[key].priority = Math.max(1, Math.min(99, parseInt(el.value, 10) || 1));
    el.value = cfg.healFriendTargets[key].priority;
    if (typeof saveCharacterToRoster === "function") saveCharacterToRoster(p);
  }));
}

/* ------------------------------------------------------------------ */
/* ANALYZER (modal completo do Party Hunt Analyser)                    */
/* ------------------------------------------------------------------ */

/* Abre o modal completo do Analyser: duração, kills, exp, loot e a
 * tabela por membro (como o analisador de caçada do OTC). */
function openPartyAnalyserModal() {
  const p = G.p;
  if (!p) return;
  const s = partyAnalyserSession(p);
  const box = $("#modal-body");
  box.innerHTML = `<div class="panel-title">📊 Party Hunt Analyser <span class="tiny dim">OTC-style</span><span style="flex:1"></span><button class="sm" id="analyser-close">✕</button></div>
    <div class="party-analyser-tabs">
      <button class="sm primary" data-pa-tab="summary">📈 Hunting</button><button class="sm" data-pa-tab="members">👥 Members</button><button class="sm" data-pa-tab="loot">🎒 Loot</button><button class="sm" data-pa-tab="supply">🧪 Supplies</button><button class="sm" data-pa-tab="impact">⚔ Impact</button>
    </div><div class="panel-body" id="analyser-content"></div>`;
  $("#modal").classList.add("show", "wide");
  $("#analyser-close").onclick=()=>$("#modal").classList.remove("show", "wide");
  const duration = s ? Math.max(1, Math.floor(((s.endedAt || Date.now()) - s.startedAt) / 1000)) : 1;
  const c = G.combat, st = (c && c.stats) || {};
  const n = (v) => fmtFull(Math.round(v || 0));
  const rate = (v) => n((v || 0) * 3600 / duration);
  const renderTab = (tab) => {
    const out=$("#analyser-content"); if (!s) { out.innerHTML='<div class="dim center" style="padding:18px">Inicie uma caçada em party para começar a análise.</div>'; return; }
    const members=Object.entries(s.byMember||{}).map(([id,b])=>`<tr><td>${b.name|| (id==='leader'?p.name:'Membro')}</td><td>${n(b.exp)} <span class="dim">(${rate(b.exp)}/h)</span></td><td>${n(b.kills)}</td><td>${n(b.loot)}</td><td>${b.levelUps?'↑'+b.levelUps:'—'}</td></tr>`).join('')||'<tr><td colspan="5" class="dim">Aguardando kills.</td></tr>';
    const loot=Object.entries(st.loot||{}).sort((a,b)=>b[1]-a[1]).map(([id,q])=>`<div class="pa-line">${itemImg(id,20)} <span>${itemName(id)}</span><b>${n(q)}</b></div>`).join('')||'<div class="dim">Nenhum loot ainda.</div>';
    const supplies=Object.entries(st.supplyUsed||{}).sort((a,b)=>b[1]-a[1]).map(([id,q])=>`<div class="pa-line">${itemImg(id,20)} <span>${itemName(id)}</span><b>${n(q)}</b></div>`).join('')||'<div class="dim">Nenhum supply usado.</div>';
    if(tab==='summary') out.innerHTML=`<div class="pa-grid"><div>⏱ Duração<b>${Math.floor(duration/60)}m ${duration%60}s</b></div><div>☠ Kills<b>${n(s.kills)}</b></div><div>✨ XP<b>${n(s.exp)}</b><small>${rate(s.exp)}/h</small></div><div>🪙 Gold<b>${n(st.gold)}</b><small>${rate(st.gold)}/h</small></div></div><div class="panel-inset mt8">Hunt: <b>${(GAMEDATA.hunts[s.huntId]||{}).name||s.huntId||'—'}</b> · Kills/h: <b>${rate(s.kills)}</b></div>`;
    else if(tab==='members') out.innerHTML=`<table class="pa-table"><thead><tr><th>Membro</th><th>XP</th><th>Kills</th><th>Loot</th><th>Level</th></tr></thead><tbody>${members}</tbody></table>`;
    else if(tab==='loot') out.innerHTML=`<div class="pa-list-title">🎒 Loot obtido · ${n(st.gold)} gp</div>${loot}`;
    else if(tab==='supply') out.innerHTML=`<div class="pa-list-title">🧪 Supplies · custo ${n(st.supplyCost)} gp</div>${supplies}`;
    else out.innerHTML=`<div class="pa-grid"><div>⚔ Dano causado<b>${n(st.damage)}</b><small>${rate(st.damage)}/h</small></div><div>🛡 Dano recebido<b>${n(st.taken)}</b><small>${rate(st.taken)}/h</small></div><div>💚 Cura<b>${n(st.healed)}</b></div><div>☠ Mortes<b>${n(st.deaths)}</b></div></div>`;
  };
  $$("[data-pa-tab]").forEach(b=>b.onclick=()=>{ $$('[data-pa-tab]').forEach(x=>x.classList.remove('primary')); b.classList.add('primary'); renderTab(b.dataset.paTab); }); renderTab('summary');
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
