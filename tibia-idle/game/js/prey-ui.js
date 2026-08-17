/* =========================================================================
 * prey-ui.js — Interface do Sistema de Prey (layout e botões OFICIAIS do otclient)
 *
 * Upgrade visual completo replicando o layout real do cliente (prey.otui):
 *   - painel de 195px por slot (LockedPreyPanel / InactivePreyPanel /
 *     ActivePreyPanel);
 *   - card CreatureAndBonus: criatura + caixa de bônus com ícone grande;
 *   - estrelas reais (prey_star/prey_nostar) em grade 5x2;
 *   - barra de tempo (ProgressBar #C28400);
 *   - BOTÕES OFICIAIS de imagem: Reroll (prey_reroll), Choose (prey_choose),
 *     Select (prey_select), Bonus Reroll (prey_bonus_reroll), e os botões de
 *     loja Perm/Temp (prey_perm_test / prey_temp_test) no slot bloqueado.
 * ========================================================================= */
"use strict";

/* Mapeia o tipo de bônus para os assets oficiais do otclient. */
const PREY_IMG = {
  damage:  { big: "prey_bigdamage",   small: "prey_damage" },
  defense: { big: "prey_bigdefense",  small: "prey_defense" },
  exp:     { big: "prey_bigxp",       small: "prey_xp" },
  loot:    { big: "prey_bigloot",     small: "prey_loot" },
};

function preyBigImg(tipo) {
  const m = PREY_IMG[tipo];
  return m ? ("assets/ui/prey/" + m.big + ".png") : "assets/ui/prey/prey_bignobonus.png";
}
function preySmallImg(tipo) {
  const m = PREY_IMG[tipo];
  return m ? ("assets/ui/prey/" + m.small + ".png") : "assets/ui/prey/prey_no_bonus.png";
}

/* Nome da criatura a partir do MONSTERDATA (Canary). */
function preyMonsterName(slug) {
  const m = (typeof MONSTERDATA !== "undefined") ? MONSTERDATA[slug] : null;
  return m ? (typeof displayMonsterName === "function"
    ? displayMonsterName(m.name) : m.name) : slug;
}

/* Badge do botão: mostra o tempo restante da prey ativa mais próxima. */
function renderPreyButton(p) {
  const btn = $("#btn-prey");
  if (!btn) return;
  const badge = $("#prey-badge");
  if (!badge) return;
  ensurePrey(p);
  const agora = Date.now();
  let menor = 0;
  for (const slot of p.prey.slots) {
    const s = slot.selected;
    if (s && s.until > agora) {
      const rest = s.until - agora;
      if (!menor || rest < menor) menor = rest;
    }
  }
  if (menor > 0) {
    const seg = Math.max(1, Math.ceil(menor / 1000));
    const h = Math.floor(seg / 3600), m = Math.floor((seg % 3600) / 60);
    badge.textContent = (h > 0 ? h + "h" : "") + m + "m";
    badge.style.display = "";
  } else {
    badge.textContent = "";
    badge.style.display = "none";
  }
}

function preyTempoRestante(s) {
  if (!s) return "";
  const seg = Math.max(0, Math.ceil((s.until - Date.now()) / 1000));
  const h = Math.floor(seg / 3600), m = Math.floor((seg % 3600) / 60);
  return (h > 0 ? h + "h " : "") + m + "m";
}

function preyTimerPct(s) {
  if (!s) return 0;
  const total = PREY_DURATION_MS;
  const left = Math.max(0, s.until - Date.now());
  return Math.max(0, Math.min(100, left / total * 100));
}

/* Estrelas do bônus com as sprites oficiais (grade 5x2, 10 estrelas). */
function preyStarsHtml(step) {
  const n = Math.min(10, (step || 0) + 1);
  let h = '<div class="prey-stars-grid">';
  for (let i = 0; i < 10; i++) {
    h += i < n
      ? '<img class="prey-star" src="assets/ui/prey/prey_star.png" alt="★">'
      : '<img class="prey-star" src="assets/ui/prey/prey_nostar.png" alt="☆">';
  }
  h += '</div>';
  return h;
}

/* ----------------------------------------------------------------------
 * Botões oficiais de imagem (replicando o layout do otclient)
 * ---------------------------------------------------------------------- */

/* Botão Reroll (prey_reroll) com barra de tempo embaixo. */
function preyRerollBtnHtml(i, custoReroll) {
  return `<div class="prey-official-btn prey-reroll-btn" id="prey-reroll-${i}"
      title="${custoReroll ? `Reroll por ${fmtFull(preyRerollCost(G.p))} gp` : "Reroll grátis"}">
      <img class="prey-btn-img" src="assets/ui/prey/prey_reroll.png" alt="Reroll">
      <span class="prey-btn-label">${custoReroll ? fmtFull(preyRerollCost(G.p)) + " gp" : "grátis"}</span>
    </div>`;
}

/* Botão Choose (prey_choose) para escolher criatura. */
function preyChooseBtnHtml(i) {
  return `<div class="prey-official-btn prey-choose-btn" id="prey-choose-${i}"
      title="Escolher criatura da lista">
      <img class="prey-btn-img" src="assets/ui/prey/prey_choose.png" alt="Escolher">
    </div>`;
}

/* Botão Select (prey_select) para a criatura selecionada no preview. */
function preySelectBtnHtml(i) {
  return `<div class="prey-official-btn prey-select-btn" id="prey-select-${i}"
      title="Selecionar criatura marcada">
      <img class="prey-btn-img" src="assets/ui/prey/prey_select_blocked.png" alt="Selecionar">
    </div>`;
}

/* Botão Bonus Reroll (prey_bonus_reroll) no card de bônus ativo. */
function preyBonusRerollBtnHtml(i) {
  return `<div class="prey-official-btn prey-bonusreroll-btn" id="prey-bonusreroll-${i}"
      title="Rerrollar o bônus da prey ativa">
      <img class="prey-btn-img" src="assets/ui/prey/prey_bonus_reroll.png" alt="Reroll bônus">
    </div>`;
}

/* Botões de loja Perm / Temp (slot bloqueado) — replicam o LockedPreyPanel. */
function preyStoreBtnHtml(i) {
  return `<div class="prey-store-buttons">
      <div class="prey-store-btn" id="prey-buy-${i}" title="Desbloquear slot permanente">
        <img class="prey-store-img" src="assets/ui/prey/prey_perm_test.png" alt="Desbloquear permanentemente">
      </div>
      <div class="prey-store-btn" id="prey-buy-temp-${i}" title="Usar um slot temporário (gratuito)">
        <img class="prey-store-img" src="assets/ui/prey/prey_temp_test.png" alt="Usar slot temporário">
      </div>
    </div>`;
}

/* ----------------------------------------------------------------------
 * Modal principal
 * ---------------------------------------------------------------------- */
function closePreyModal() {
  const modal = $("#modal");
  if (!modal) return;
  modal.classList.remove("show", "wide", "modal-otc");
}

function openPreyModal() {
  const p = G.p;
  if (!p) { toast("Crie um personagem primeiro"); return; }
  ensurePrey(p);
  // Janela estilo OTClient: título na faixa superior do modal (border-top)
  // e conteúdo com fundo de painel próprio — legível e fiel ao client.
  $("#modal-body").innerHTML = `<div class="otc-win-title">🐾 Prey
      <span style="flex:1"></span>
      <span class="tiny dim" id="prey-hint">bônus por 2h · reroll grátis a cada 20h</span>
      <button type="button" class="otc-win-x" id="prey-close" title="Fechar">✕</button>
    </div>
    <div class="otc-win-body"><div id="prey-content"></div></div>`;
  $("#modal").classList.add("show", "wide", "modal-otc");
  const closeBtn = $("#prey-close");
  if (closeBtn) closeBtn.addEventListener("click", (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    closePreyModal();
  });
  renderPreyModal(p);
}

function renderPreyModal(p) {
  const box = $("#prey-content");
  if (!box) return;
  ensurePrey(p);
  const agora = Date.now();
  let h = `<div class="prey-wallet">
      <span><img class="prey-wc-icon" src="assets/ui/prey/prey_wildcard.png" alt=""> Prey Wildcards: <b style="color:#ffd65a">${p.prey.wildcards}</b></span>
      <span class="dim tiny">3 slots de prey · bônus por 2h · reroll grátis a cada 20h</span>
    </div>
    <div class="prey-slots">`;

  for (let i = 0; i < PREY_SLOT_COUNT; i++) {
    const slot = p.prey.slots[i];
    // ---- Slot BLOQUEADO: replica o LockedPreyPanel (painel + botões Perm/Temp)
    if (!slot.unlocked) {
      h += `<div class="prey-slot locked">
        <div class="prey-locked-head">
          <div class="prey-locked-creature">
            <img class="prey-big-icon" src="assets/ui/prey/prey_biginactive.png" alt="">
            <span class="prey-locked-title">Prey Slot ${i + 1}</span>
          </div>
        </div>
        ${preyStoreBtnHtml(i)}
        <div class="prey-locked-msg tiny dim">Desbloqueie permanentemente (ou use um slot temporário) para caçar com bônus.</div>
      </div>`;
      continue;
    }

    const sel = slot.selected;
    const ativa = sel && sel.until > agora;
    const b = ativa ? PREY_BONUSES[sel.bonus] : null;
    const custoReroll = slot.rerollAt > agora;

    h += `<div class="prey-slot ${ativa ? "active" : ""}">
      <div class="prey-slot-head">
        <b>Prey Slot ${i + 1}</b>
        <span style="flex:1"></span>
        <button class="sm" id="prey-wildcard-${i}" ${ativa && p.prey.wildcards > 0 ? "" : "disabled"}
          title="Prey Wildcard: melhora o bônus (+1 passo) e pode trocar o tipo">
          <img class="prey-wc-icon" src="assets/ui/prey/prey_wildcard.png" alt=""> Wildcard</button>
      </div>`;

    // ---- Card CreatureAndBonus (criatura + bônus) como no ActivePreyPanel
    if (ativa) {
      h += `<div class="prey-creature-bonus">
        <div class="prey-preview-creature">
          ${typeof mobImg === "function" ? mobImg(sel.creature, 96) : ""}
          <div class="prey-preview-name">${preyMonsterName(sel.creature)}</div>
        </div>
        <div class="prey-bonus-box" style="border-color:${b.cor}">
          <img class="prey-big-icon" src="${preyBigImg(sel.bonus)}" alt="${b.nome}">
          <div class="prey-bonus-name" style="color:${b.cor}">${b.nome}</div>
          ${preyStarsHtml(sel.step)}
          <div class="prey-bonus-value">+${preyBonusValue(sel.bonus, sel.step)}%</div>
        </div>
      </div>
      <div class="prey-timer-bar">
        <div class="prey-timer-fill" style="width:${preyTimerPct(sel)}%"></div>
        <span>${preyTempoRestante(sel)}</span>
      </div>
      <!-- botões oficiais: bonus reroll / select / reroll (rodapé do slot) -->
      <div class="prey-actions">
        ${preyBonusRerollBtnHtml(i)}
        ${preySelectBtnHtml(i)}
        ${preyRerollBtnHtml(i, custoReroll)}
      </div>`;
    } else {
      // ---- InactivePreyPanel: grade de criaturas + botões de escolha
      h += `<div class="prey-select-hint tiny dim">Selecione uma criatura:</div>
        <div class="prey-grid">` + slot.creatures.map((slug) => {
          const marcada = slot._pending === slug;
          return `<div class="prey-creature ${marcada ? "sel" : ""}" data-prey-slot="${i}" data-prey-creature="${slug}">
            <div class="prey-creature-sprite">${typeof mobImg === "function" ? mobImg(slug, 44) : ""}</div>
            <span class="tiny">${preyMonsterName(slug)}</span>
          </div>`;
        }).join("") + `</div>
        <div class="prey-actions">
          ${preyChooseBtnHtml(i)}
          ${preyRerollBtnHtml(i, custoReroll)}
        </div>`;
    }
    h += `</div>`;
  }
  h += `</div>`;
  h += `<div class="prey-help tiny dim mt4">
    Bônus: Dano +7~25% · Defesa −12~30% · Exp +13~40% · Loot +13~40% (chance de loot duplo).
    Defense gasta tempo extra ao tomar dano. Wildcards melhoram o bônus.
  </div>
  <div class="row mt8" style="justify-content:flex-end">
    <button type="button" class="sm primary" id="prey-close-footer">Fechar</button>
  </div>`;
  box.innerHTML = h;

  const closeFooter = $("#prey-close-footer");
  if (closeFooter) closeFooter.addEventListener("click", () => closePreyModal());

  // ---- Handlers dos botões oficiais
  for (let i = 0; i < PREY_SLOT_COUNT; i++) {
    // Reroll (prey_reroll)
    const rr = $("#prey-reroll-" + i);
    if (rr) rr.addEventListener("click", () => {
      const slot = p.prey.slots[i];
      const pago = slot.rerollAt > Date.now();
      const r = preyReroll(p, i, pago);
      if (!r.ok) { toast(r.msg, "bad"); return; }
      toast(pago ? `Nova lista (${fmtFull(preyRerollCost(p))} gp).` : "Nova lista grátis!");
      renderPreyModal(p);
    });
    // Choose (prey_choose): marca a próxima criatura da lista como pendente
    const ch = $("#prey-choose-" + i);
    if (ch) ch.addEventListener("click", () => {
      const slot = p.prey.slots[i];
      const next = slot.creatures[0];
      slot._pending = next;
      renderPreyModal(p);
    });
    // Select (prey_select): seleciona a criatura pendente (ativa a prey)
    const sl = $("#prey-select-" + i);
    if (sl) sl.addEventListener("click", () => {
      const slot = p.prey.slots[i];
      const pend = slot._pending;
      if (!pend) { toast("Escolha uma criatura primeiro."); return; }
      const r = preySelect(p, i, pend);
      if (!r.ok) { toast(r.msg, "bad"); return; }
      slot._pending = null;
      toast(`Prey ativa: ${PREY_BONUSES[r.bonus].nome} +${r.value}% por 2h!`);
      renderPreyModal(p);
      renderAll();
    });
    // Bonus Reroll (prey_bonus_reroll): rerolla o bônus da prey ativa
    const br = $("#prey-bonusreroll-" + i);
    if (br) br.addEventListener("click", () => {
      const slot = p.prey.slots[i];
      if (!slot.selected) { toast("Sem prey ativa."); return; }
      // usa um wildcard como custo do bonus reroll (regra da casa)
      const r = preyUseWildcard(p, i);
      if (!r.ok) { toast(r.msg, "bad"); return; }
      toast(`Bônus rerrollado: ${PREY_BONUSES[r.bonus].nome} +${r.value}%`);
      renderPreyModal(p);
      renderAll();
    });
    // Wildcard
    const wc = $("#prey-wildcard-" + i);
    if (wc) wc.addEventListener("click", () => {
      const r = preyUseWildcard(p, i);
      if (!r.ok) { toast(r.msg, "bad"); return; }
      toast(`Wildcard: ${PREY_BONUSES[r.bonus].nome} +${r.value}%`);
      renderPreyModal(p);
    });
    // Store Perm (prey_perm_test) -> compra o slot permanente
    const buy = $("#prey-buy-" + i);
    if (buy) buy.addEventListener("click", () => {
      const r = preyBuyPermanentSlot(p);
      if (!r.ok) { toast(r.msg, "bad"); return; }
      toast("Slot permanente desbloqueado!");
      renderPreyModal(p);
      renderAll();
    });
    // Store Temp (prey_temp_test) -> desbloqueia temporariamente (grátis)
    const buyTemp = $("#prey-buy-temp-" + i);
    if (buyTemp) buyTemp.addEventListener("click", () => {
      const slot = p.prey.slots[i];
      if (!slot) return;
      if (slot.unlocked) { toast("Já desbloqueado."); return; }
      slot.unlocked = true;
      slot.creatures = preyRerollList(p, i);
      toast("Slot temporário ativo (não persiste ao recarregar).");
      renderPreyModal(p);
      renderAll();
    });
  }

  // ---- Clique numa criatura: ativa a prey diretamente (como no client)
  $$("#prey-content [data-prey-creature]").forEach((el) => {
    el.addEventListener("click", () => {
      const i = +el.dataset.preySlot;
      const slug = el.dataset.preyCreature;
      const r = preySelect(p, i, slug);
      if (!r.ok) { toast(r.msg, "bad"); return; }
      toast(`Prey ativa: ${PREY_BONUSES[r.bonus].nome} +${r.value}% por 2h!`);
      renderPreyModal(p);
      renderAll();
    });
  });
}

/* Integração: botão do topo. */
function bindPreyButton() {
  const btn = $("#btn-prey");
  if (!btn) return;
  btn.addEventListener("click", () => openPreyModal());
}
