/* party-ui.js — Interface do Sistema de Party + Party Hunt Analyser
 * Botão PARTY no topo (ao lado de FORGE/PREY) com badge de membros.
 */
"use strict";

function renderPartyButton(p) {
  const btn = $("#btn-party");
  if (!btn) return;
  const badge = $("#party-badge");
  if (!badge) return;
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

function openPartyModal() {
  const p = G.p;
  if (!p) { toast("Crie um personagem primeiro"); return; }
  ensureParty(p);
  $("#modal-body").innerHTML = `<div class="panel-title">👥 Party
      <span style="flex:1"></span>
      <button class="sm" id="party-close">✕</button>
    </div>
    <div class="panel-body"><div id="party-content"></div></div>`;
  $("#modal").classList.add("show", "wide");
  $("#party-close").addEventListener("click", () => {
    $("#modal").classList.remove("show", "wide");
  });
  renderPartyModal(p);
}

function renderPartyModal(p) {
  const box = $("#party-content");
  if (!box) return;
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

  // ---- Party Hunt Analyser
  const s = pt.session;
  h += `<div class="party-analyser">
      <div class="panel-title" style="font-size:13px">📊 Party Hunt Analyser</div>`;
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
}

function bindPartyButton() {
  const btn = $("#btn-party");
  if (!btn) return;
  btn.addEventListener("click", () => openPartyModal());
}
