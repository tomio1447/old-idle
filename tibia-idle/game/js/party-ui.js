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

function partyLookKey(p) {
  const o = (p && p.outfit) || {};
  return [o.appearance || o.type || "", o.addons || 0,
    Array.isArray(o.colors) ? o.colors.join(",") : "",
    o.mount || "", o.lookMount || 0, (p && p.sex) || ""].join("|");
}

/* Compõe a miniatura com o look AO VIVO: entidade de combate, personagem
 * ativo, cache da conta e por último o snapshot da party. Sem isso o modal
 * ficava com a outfit gravada na criação da party. */
function partyApplyOutfitPreview(host, member, size, tries) {
  if (!host || !member) return false;
  size = size || 32;
  tries = tries === undefined ? 20 : tries;
  const id = String(member.id);
  let source = member._p || member;
  const live = (typeof G !== "undefined" && G && G.combat && Array.isArray(G.combat.players))
    ? G.combat.players.find((e) => String(e && (e.id || (e.p && e.p.id))) === id) : null;
  if (live && live.p) source = live.p;
  else if (typeof G !== "undefined" && G && G.p && String(G.p.id) === id) source = G.p;
  const cached = typeof accountCharacterCacheRead === "function" ? accountCharacterCacheRead() : [];
  const summary = (cached || []).find((c) => String(c.id) === id) || null;
  const outfit = source.outfit||summary&&summary.outfit||member.outfit
    || (summary && summary.snapshot && summary.snapshot.outfit) || null;
  const preview = {
    id: source.id || member.id,
    name: source.name || member.name,
    voc: source.voc || member.voc || "knight",
    sex: source.sex || member.sex || (summary && summary.sex) || "male",
    outfit: outfit && typeof outfit === "object" ? Object.assign({}, outfit, {
      colors: Array.isArray(outfit.colors) ? outfit.colors.slice() : outfit.colors,
    }) : null,
  };
  if (typeof ensureOutfit === "function") ensureOutfit(preview);
  member.sex = preview.sex;
  member.outfit = preview.outfit;
  const key = partyLookKey(preview);
  if (host.dataset.look === key && host.querySelector("canvas")) return true;
  const cv = (typeof AppearanceRenderer !== "undefined")
    ? AppearanceRenderer.preview(member, "s") : null;
  if (cv) {
    cv.style.width = size + "px";
    cv.style.height = size + "px";
    cv.style.imageRendering = "pixelated";
    host.innerHTML = "";
    host.appendChild(cv);
    host.dataset.look = key;
    return true;
  }
  if (tries > 0) {
    setTimeout(() => partyApplyOutfitPreview(host, member, size, tries - 1), 90);
    return false;
  }
  if (!host.querySelector("img,canvas")) {
    const sex = preview.sex === "female" ? "f" : "m";
    host.innerHTML = `<img src="assets/outfit/citizen-${sex}_s.png" alt="">`;
  }
  return false;
}

function partyPaintMemberLooks(root, membros, size) {
  if (!root || !Array.isArray(membros)) return;
  for (const m of membros) {
    if (!m) continue;
    const host = root.querySelector(`[data-party-preview="${m.id}"]`);
    if (host) partyApplyOutfitPreview(host, m, size);
  }
}

/* Troca para um personagem da party (mesma função do "Trocar personagem"). */
async function partySwitchToChar(id) {
  // Dentro de hunt/boss a troca sempre acontece no runtime atual. Sessões
  // online antigas podem ainda não ter materializado o alvo em c.players;
  // nesse caso o helper o hidrata no mesmo combate antes de transferir controle.
  if (typeof G !== "undefined" && G && G.combat) {
    if(typeof partyCombatSwitchOnlineTo==="function")return await partyCombatSwitchOnlineTo(id);
    const players=Array.isArray(G.combat.players)?G.combat.players:[];
    const present=players.some((e)=>String(e&&(e.id||(e.p&&e.p.id)))===String(id));
    return !!(present&&typeof partyCombatSwitchTo==="function"&&partyCombatSwitchTo(id));
  }
  // Fora de combate (cidade/treino, mesmo em party): recarrega NA SESSÃO
  // com autoload online. Sem essa chave o boot reabre o picker da tela inicial.
  try { localStorage.setItem(ACTIVE_CHARACTER_KEY, id); } catch (e) {}
  try { sessionStorage.setItem(AUTOLOGIN_KEY, id); } catch (e) {}
  try { sessionStorage.setItem("tibia-idle-char", id); } catch (e) {}
  try { sessionStorage.setItem("tibia-idle-online-autoload", String(id)); } catch (e) {}
  if (typeof save === "function") save();
  if (typeof armBootLoading === "function") armBootLoading("Carregando personagem...");
  location.reload();
  return true;
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
      Abra o menu 👥 PARTY para criar/adicionar.</div>`;
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
    const liveP = (typeof resolvePlayerById === "function")
      ? resolvePlayerById(m.id)
      : (m._p || (isCurrent ? p : null));
    const autoOn = typeof playerAutoWalkOn === "function"
      ? playerAutoWalkOn(liveP || { config: { autoWalk: true } })
      : !(liveP && liveP.config && liveP.config.autoWalk === false);
    const canToggleAuto = myAccount && !!liveP;
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
      ${canToggleAuto ? `<button type="button" class="sm btn-auto-walk ${autoOn ? "primary on" : "off"}"
          data-auto-walk-char="${m.id}" aria-pressed="${autoOn ? "true" : "false"}"
          title="${autoOn ? "AUTO ligado — desligue para estacionar neste SQM" : "AUTO off — parado; troque e clique no chão para mover"}">${autoOn ? "AUTO" : "SQM"}</button>` : ""}
    </div>`;
  }).join("");

  partyPaintMemberLooks(body, membros, 32);

  $$("#party-panel-body .btn-auto-walk").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault();
      const target = (typeof resolvePlayerById === "function")
        ? resolvePlayerById(btn.dataset.autoWalkChar) : null;
      if (!target || typeof togglePlayerAutoWalk !== "function") return;
      const on = togglePlayerAutoWalk(target);
      if (typeof save === "function") save();
      if (typeof toast === "function") {
        toast(on
          ? `AUTO ligado: <b>${target.name || "membro"}</b>`
          : `AUTO off: <b>${target.name || "membro"}</b> parado — clique no chão / WASD`);
      }
      renderPartyPanel(G.p);
    });
  });

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
      // Um único caminho atende entidade já carregada e snapshot legado
      // incompleto, garantindo save/hidratação antes de transferir controle.
      partySwitchToChar(el.dataset.partyChar);
    }));
}

/* Atualização barata do HUD durante combate autoritativo. Recriar todo o
 * painel a cada frame refazia canvases de outfit e listeners, causando lag;
 * aqui mudam somente largura e texto das quatro barras já existentes. */
function updatePartyPanelLiveBars(){
  if(typeof G==="undefined"||!G||!G.combat||!Array.isArray(G.combat.players))return;
  const body=$("#party-panel-body");if(!body)return;
  for(const ent of G.combat.players){
    if(!ent||!ent.p)continue;
    const id=String(ent.id!==undefined?ent.id:ent.p.id),row=body.querySelector(`[data-party-char="${id}"]`);
    if(!row)continue;const bars=row.querySelectorAll(".party-pbar");if(bars.length<2)continue;
    const max=typeof maxStats==="function"?maxStats(ent.p):{hp:1,mp:1},values=[
      {now:Math.max(0,Number(ent.p.hp)||0),max:Math.max(1,Number(max.hp)||1)},
      {now:Math.max(0,Number(ent.p.mp)||0),max:Math.max(0,Number(max.mp)||0)},
    ];
    for(let i=0;i<2;i++){const fill=bars[i].querySelector(".fill"),label=bars[i].querySelector(".val"),value=values[i],
      pct=value.max>0?Math.max(0,Math.min(100,value.now*100/value.max)):0;
      if(fill)fill.style.width=pct+"%";
      if(label)label.textContent=fmtFull(Math.floor(value.now))+"/"+fmtFull(value.max);}
    const host=row.querySelector("[data-party-preview]");
    if(host)partyApplyOutfitPreview(host,ent.p,32,0);
  }
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
  invites = partyFilterStaleInbox(invites, st);
  if (G && G.p) {
    G.p._partyOnline = st;
    G.p._partyInvites = invites.length;
  }
  renderPartyModal(p, { st, inbox: invites });
  if (typeof renderPartyButton === "function") renderPartyButton(p);
}

/* Esconde convites cujo personagem convidado já está no roster atual. */
function partyFilterStaleInbox(invites, st) {
  const list = Array.isArray(invites) ? invites : [];
  if (!st) return list;
  const inParty = new Set();
  if (st.leader && st.leader.id != null) inParty.add(Number(st.leader.id));
  for (const m of st.members || []) {
    if (m && m.id != null) inParty.add(Number(m.id));
  }
  return list.filter((i) => !inParty.has(Number(i.character_id)));
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
    if (st) partyPaintMemberLooks(box, [st.leader].concat(st.members || []), 32);
    return;
  }
  // ---- modo local (roster do save) ----
  const ld0 = (typeof partyLocalData === "function") ? partyLocalData() : null;
  if (!ld0) {
    // sem party local ainda: criar transforma o personagem atual em líder
    box.innerHTML = `<div class="party-header"><b>👥 Party</b>
        <span class="tiny dim">personagens do seu save</span></div>
      <div class="dim small center" style="padding:10px">
        Você não está em nenhuma party. Crie uma para adicionar os outros
        personagens do seu save (entram direto, sem aceite).</div>
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

  // FIX: Se não faz parte da party, não mostrar info da party de outro personagem.
  // Antes mostrava "Líder: X" mesmo para quem não estava na PT, causando
  // "consigo ver a PT em outro personagem que não está na PT".
  let h = "";
  if (!souLider && !souMembro) {
    // Não está na party: mostrar que não está + convites pendentes + opção de criar
    h = `<div class="party-header"><b>👥 Party</b><span class="tiny dim">você não está em party</span></div>
      <div class="dim small center" style="padding:10px">Você não está em nenhuma party.<br>Existe uma party liderada por <b>${ld ? ld.leaderName : "?"}</b>, mas você não faz parte dela.</div>`;
  } else {
    // Está na party: mostrar header normal
    h = `<div class="party-header">
      <b>Líder: ${liderChar ? liderChar.name : (ld ? ld.leaderName : p.name)}
        ${liderChar ? `<span class="dim">(${partyVocName(liderChar.voc)} · nv ${liderChar.level})</span>` : ""}</b>
      <button class="sm" id="party-leave" ${(ld || pt.members.length) ? "" : "disabled"}>
        ${souLider ? "Dissolver party" : "Sair do party"}</button>
    </div>`;
  }

  if (pt.members.length) {
    h += `<div class="party-members">` + pt.members.map((m, i) => `
      <div class="party-member" data-party-switch="${m.id}">
        <span class="party-member-voc">${partyVocName(m.voc)}</span>
        <b class="party-member-name" data-party-switch="${m.id}">${m.name}</b>
        <span class="dim">nv ${m.level}</span>
        <span class="party-exp">+${fmtFull(m.expGained || 0)} xp</span>
        ${m.levelUps ? `<span style="color:#9ce84a">↑${m.levelUps} lvl</span>` : ""}
        ${souLider ? `<button class="sm" data-party-remove="${m.id}">Remover</button>` : ""}
      </div>`).join("") + `</div>`;
  } else if (souLider) {
    h += `<div class="dim small center" style="padding:8px">Nenhum membro ainda. Adicione personagens do seu save (entram direto, sem aceite). Party máx. 5.</div>`;
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

  // ---- adicionar (só o líder, só em cidade/treino)
  if (souLider) {
    const disponiveis = partyAvailableMembers(p);
    h += `<div class="party-invite-title tiny dim mt4">Adicionar do seu save (${disponiveis.length}):</div>`;
    if (disponiveis.length) {
      h += `<div class="party-invite-grid">` + disponiveis.map((c) => `
        <div class="party-invite">
          <b>${c.name}</b> <span class="dim">${partyVocName(c.voc)} nv ${c.level}</span>
          <button class="sm" data-party-invite="${c.id}" ${podeConvidar ? "" : "disabled"}>Adicionar</button>
        </div>`).join("") + `</div>`;
    } else {
      h += `<div class="dim small center" style="padding:6px">Ninguém disponível (todos já estão no party).</div>`;
    }
    h += `<div class="tiny ${podeConvidar ? "dim" : ""}" style="color:${podeConvidar ? "" : "#ff9a6a"}">
        ${podeConvidar
          ? "Você está em zona segura — pode adicionar."
          : "⚠️ O líder só pode adicionar na <b>Cidade</b> (safe zone) ou na <b>Área de Treino</b>."}
      </div>
      <div class="tiny dim">Entra direto na party — sem aceite. Só personagens que não estão em party.</div>`;
  }

  // ---- compartilhar exp (só para quem está na PT)
  if (souLider || souMembro) {
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

  } // fim share só para membros

  // ---- Party Hunt Analyser (só para quem está na PT)
  if (souLider || souMembro) {
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
  } // fim analyser só para membros

  // Se não está na PT, mostrar opção de criar nova PT (sobrescreve existente)
  if (!souLider && !souMembro) {
    h += `<div class="party-share" style="margin-top:8px">
      <button class="primary full" id="party-create-local-2">Criar nova party (dissolve atual)</button>
      <div class="tiny dim" style="margin-top:4px">Ao criar, <b>${p.name}</b> vira líder e a PT antiga <b>${ld ? ld.leaderName : ""}</b> é dissolvida.</div>
    </div>`;
  }

  box.innerHTML = h;

  // FIX: handler para botão de criar nova party quando não está na PT
  const create2 = $("#party-create-local-2");
  if (create2) create2.addEventListener("click", () => {
    try {
      localStorage.setItem("tibia-idle-party-local-v1", JSON.stringify({
        leaderId: String(p.id || characterId(p)),
        leaderName: p.name,
        members: [], invites: [],
        shareExp: false, session: null,
      }));
    } catch (e) {}
    toast("Nova party criada! Você é o líder. A antiga foi dissolvida.");
    renderPartyModal(p);
    renderAll();
  });

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
      toast(r && r.msg ? r.msg : (r.ok ? "Adicionado!" : "Falha"), r && r.ok ? "level" : "bad");
      renderPartyModal(p);
      if (r && r.ok && typeof renderAll === "function") renderAll();
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

  // trocar para personagem da party (modo local) ou abrir picker (online)
  $$("#party-content [data-party-switch]").forEach((el) => {
    el.addEventListener("click", () => partySwitchToCharacter(el.dataset.partySwitch));
  });
}

function partySwitchToCharacter(id) {
  const targetId = String(id);
  if (G.p && String(G.p.id || characterId(G.p)) === targetId) {
    toast("Você já está neste personagem.");
    $("#modal").classList.remove("show", "wide");
    openHelperPanel();
    return;
  }
  // modo online: nao troca automaticamente (precisa de lease/reload), abre picker
  if (typeof partyOnlineMode === "function" && partyOnlineMode()) {
    if (typeof window.openAccountCharacterPicker === "function") window.openAccountCharacterPicker();
    return;
  }
  // modo local: troca diretamente pelo roster
  const chars = typeof getCharacters === "function" ? getCharacters() : [];
  const next = chars.find((c) => String(c.id || characterId(c)) === targetId);
  if (!next) { toast("Personagem nao encontrado no save."); return; }
  if (typeof save === "function") save();
  G.p = next;
  try { localStorage.setItem(ACTIVE_CHARACTER_KEY, targetId); } catch (e) {}
  if (typeof save === "function") save();
  if (typeof renderAll === "function") renderAll();
  $("#modal").classList.remove("show", "wide");
  openHelperPanel();
}

function openHelperPanel() {
  if (typeof setMobileTab === "function") setMobileTab("helper");
  const panel = document.querySelector('[data-collapse="helper"]');
  if (panel && typeof panel.scrollIntoView === "function") panel.scrollIntoView({ block: "start", behavior: "smooth" });
}

/* ------------------------------------------------------------------ */
/* HEAL FRIEND (Druid/Monk) — aba dentro do Helper: Cura               */
/* ------------------------------------------------------------------ */

/* Magias de cura de ALIADO disponíveis (Druid/Monk). */
function healFriendSpells(p) {
  const ids = [];
  if (!p) return ids;
  const list = (typeof CanaryVocation !== "undefined" && CanaryVocation.friendHealSpellIds)
    ? CanaryVocation.friendHealSpellIds(p.voc)
    : ((p.voc === "druid" || p.voc === "elder druid")
      ? ["exura-sio", "exura-gran-sio", "exura-gran-tio-sio", "exura-gran-mas-res"]
      : ((p.voc === "monk" || p.voc === "exalted monk") ? ["exura-tio-sio"] : []));
  for (const id of list) {
    if (SPELLS[id] && p.level >= (SPELLS[id].lvl || 1)) ids.push(id);
  }
  return ids;
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
  spells.forEach((id) => { if (!cfg.healFriendSpells[id]) { cfg.healFriendSpells[id] = { enabled: selecionada === id, at: cfg.healFriendAt || 70, minTargets: 2 }; healCfgDirty = true; } });
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
    const loot=Object.entries(st.loot||{}).sort((a,b)=>b[1]-a[1]).map(([id,q])=>`<div class="pa-line">${itemImg(id,20,null,q)} <span>${itemName(id)}</span><b>${n(q)}</b></div>`).join('')||'<div class="dim">Nenhum loot ainda.</div>';
    const supplies=Object.entries(st.supplyUsed||{}).sort((a,b)=>b[1]-a[1]).map(([id,q])=>`<div class="pa-line">${itemImg(id,20,null,q)} <span>${itemName(id)}</span><b>${n(q)}</b></div>`).join('')||'<div class="dim">Nenhum supply usado.</div>';
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
        adicionar, você precisa estar na <b>Cidade</b> ou na <b>Área de Treino</b>.
        O membro entra direto (sem aceite), se não estiver em party.</div>`;
  } else {
    const acc = (typeof sessionAccount === "function") ? sessionAccount() : null;
    const currentId = typeof characterId === "function" ? characterId(p) : p.id;
    const rowFor = (m, extra) => {
      extra = extra || {};
      const isCurrent = Number(m.id) === Number(currentId);
      const myAccount = !m.account_id || (acc && Number(acc.id) === Number(m.account_id));
      const clickable = !isCurrent && myAccount;
      return `<div class="party-member ${extra.leader ? "leader" : ""} ${clickable ? "" : "no-switch"}"
          data-party-char="${m.id}" data-switch="${clickable ? 1 : 0}"
          title="${clickable ? "Trocar para " + m.name : (isCurrent ? "Personagem atual" : "Membro de outra conta")}">
        <div class="ppm-outfit">${partyOutfitHtml(m)}</div>
        <span class="party-member-voc">${voc(m.voc)}</span>
        <b>${m.name}</b>
        ${extra.leader ? `<span class="dim tiny">líder</span>` : `<span class="dim">nv ${m.level}</span>`}
        <span class="tiny" style="color:#9ce84a">${partyZoneName(m.zone)}</span>
        ${extra.kick ? `<button class="sm" data-party-kick="${m.id}">Remover</button>` : ""}
      </div>`;
    };
    h += `<div class="party-members">`;
    h += rowFor(st.leader, { leader: true });
    for (const m of st.members) h += rowFor(m, { kick: !!st.isLeader });
    h += `</div>`;

    if (st.isLeader) {
      // ---- líder: personagens da própria conta, um botão Invite por linha
      // (mais rápido que digitar o nome — útil sobretudo no tutorial).
      const accChars = (typeof accountCharacterCacheRead === "function")
        ? accountCharacterCacheRead() : [];
      const memberIds = new Set([String(st.leader.id)].concat(st.members.map((m) => String(m.id))));
      const invitable = accChars.filter((c) => !memberIds.has(String(c.id)));
      if (invitable.length) {
        h += `<div class="party-invite-title tiny dim mt4">Personagens da sua conta:</div>
          <div class="party-account-char-list">` + invitable.map((c) => `
            <div class="party-account-char-row">
              <span class="party-account-char-ico" aria-hidden="true">🧙</span>
              <b>${c.name}</b><span class="dim tiny">${voc(c.voc || "knight")} · nv ${Number(c.level) || 1}</span>
              <span style="flex:1"></span>
              <button class="sm primary" data-invite-account-char="${c.id}"
                data-invite-account-name="${String(c.name || "").replace(/"/g, "&quot;")}"
                ${podeConvidar ? "" : "disabled"}>Invite</button>
            </div>`).join("") + `</div>`;
      }
      // ---- adicionar por nome (qualquer personagem, só em cidade/treino)
      h += `<div class="party-invite-title tiny dim mt4">Adicionar jogador (por nome do personagem):</div>
        <div class="row mb4" style="gap:4px">
          <input id="party-invite-name" maxlength="20" placeholder="Nome do personagem"
            style="flex:1;padding:3px 6px;background:#14120e;color:#c8c0a8;border:1px solid #16140f">
          <button class="sm primary" id="party-invite-btn" ${podeConvidar ? "" : "disabled"}>Adicionar</button>
        </div>
        <div class="tiny ${podeConvidar ? "dim" : ""}" style="color:${podeConvidar ? "" : "#ff9a6a"}">
          ${podeConvidar
            ? "Você está em zona segura — pode adicionar (entra direto, sem aceite)."
            : "⚠️ O líder só pode adicionar na <b>Cidade</b> (safe zone) ou na <b>Área de Treino</b>."}
        </div>`;
      h += `<button class="sm mt8" id="party-leave">Dissolver party</button>`;
    } else {
      h += `<div class="tiny dim mt4">Follow ativo: quando o líder mudar de
        mapa ou entrar numa hunt/boss, você será teleportado para a MESMA instância.</div>
        <button class="sm mt8" id="party-leave">Sair do party</button>`;
    }
  }

  // Inbox legado (convites antigos ainda pendentes) — fluxo novo é add direto.
  h += `<div class="party-invite-title tiny dim mt4">Inbox (legado):</div>`;
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

  h += `<div class="tiny dim mt4">Novos membros entram direto quando o líder adiciona.
    Inbox acima só limpa convites antigos pendentes.</div>`;
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
    toast(r.ok ? (r.msg || "Adicionado à party!") : (r.msg || "Falha"), r.ok ? "level" : "bad");
    if (r.ok) {
      recarregar();
      if (typeof renderAll === "function") renderAll();
    }
  });

  $$("#party-content [data-invite-account-char]").forEach((btn) => btn.addEventListener("click", async () => {
    const name = btn.dataset.inviteAccountName;
    if (!name || btn.disabled) return;
    btn.disabled = true;
    const r = await partyOnlineInvite(name);
    toast(r.ok ? (r.msg || (name + " entrou na party!")) : (r.msg || "Falha"), r.ok ? "level" : "bad");
    if (r.ok) {
      recarregar();
      if (typeof renderAll === "function") renderAll();
    } else {
      btn.disabled = false;
    }
  }));

  const leave = $("#party-leave");
  if (leave) leave.addEventListener("click", async () => {
    const r = await partyOnlineLeave();
    toast(r.ok ? r.msg : (r.msg || "Falha"), r.ok ? "" : "bad");
    if (r.ok) recarregar();
  });

  $$("#party-content [data-party-kick]").forEach((el) =>
    el.addEventListener("click", async (ev) => {
      ev.stopPropagation();
      const r = await accountPartyKick(Number(sessionCharId()), el.dataset.partyKick);
      toast(r.ok ? r.msg : (r.msg || "Falha"), r.ok ? "" : "bad");
      if (r.ok) recarregar();
    }));

  $$("#party-content [data-party-char]").forEach((el) =>
    el.addEventListener("click", () => {
      if (el.dataset.switch !== "1") return;
      partySwitchToChar(el.dataset.partyChar);
    }));

  $$("#party-content [data-party-accept]").forEach((el) =>
    el.addEventListener("click", async () => {
      if (el.disabled) return;
      // REGRA: só aceita convite em Safe Zone (cidade) ou Área de Treino
      if (typeof partyCanInviteNow === "function" && !partyCanInviteNow()) {
        toast("Para aceitar um convite você precisa estar na Cidade ou na Área de Treino.", "bad");
        return;
      }
      el.disabled = true;
      let r;
      try {
        r = await accountPartyAccept(el.dataset.partyAccept);
      } finally {
        el.disabled = false;
      }
      toast(r.ok ? r.msg : (r.msg || "Falha"), r.ok ? "level" : "bad");
      // Sucesso ou convite já processado: limpa inbox stale / roster
      if (r.ok || /já foi processado|já está na party/i.test(String(r.msg || ""))) {
        recarregar();
        if (r.ok && typeof renderAll === "function") renderAll();
      }
    }));

  $$("#party-content [data-party-decline]").forEach((el) =>
    el.addEventListener("click", async () => {
      if (el.disabled) return;
      el.disabled = true;
      let r;
      try {
        r = await accountPartyDecline(el.dataset.partyDecline);
      } finally {
        el.disabled = false;
      }
      toast(r.ok ? r.msg : (r.msg || "Falha"), r.ok ? "" : "bad");
      if (r.ok || /já foi processado/i.test(String(r.msg || ""))) recarregar();
    }));
}

function bindPartyButton() {
  const btn = $("#btn-party");
  if (!btn) return;
  btn.addEventListener("click", () => openPartyModal());
}
