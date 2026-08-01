/* prey-ui.js — Interface do Sistema de Prey (layout do client global)
 * Botão ao lado da FORGE (cartinha de exp brilhando) + janela com 3 slots,
 * cada um com a grade 3x3 de criaturas (sprite + nome), bônus rolado com
 * estrelas, timer de 2h, reroll (grátis 20h / pago) e Prey Wildcard.
 */
"use strict";

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

/* Estrelas do step do bônus (1-10). */
function preyStarsHtml(step) {
  const n = Math.min(10, (step || 0) + 1);
  let h = "";
  for (let i = 0; i < 10; i++) {
    h += `<span style="color:${i < n ? "#ffd65a" : "#3a3a3a"}">★</span>`;
  }
  return h;
}

function openPreyModal() {
  const p = G.p;
  if (!p) { toast("Crie um personagem primeiro"); return; }
  ensurePrey(p);
  $("#modal-body").innerHTML = `<div class="panel-title">🐾 Sistema de Prey
      <span style="flex:1"></span>
      <button class="sm" id="prey-close">✕</button>
    </div>
    <div class="panel-body"><div id="prey-content"></div></div>`;
  $("#modal").classList.add("show", "wide");
  $("#prey-close").addEventListener("click", () => {
    $("#modal").classList.remove("show", "wide");
  });
  renderPreyModal(p);
}

function renderPreyModal(p) {
  const box = $("#prey-content");
  if (!box) return;
  ensurePrey(p);   // garante que slots desbloqueados já têm as 9 criaturas
  const agora = Date.now();
  let h = `<div class="prey-wallet">
      <span>🃏 Prey Wildcards: <b style="color:#ffd65a">${p.prey.wildcards}</b></span>
      <span class="dim tiny">Escolha uma criatura e receba um bônus por 2h · reroll grátis a cada 20h</span>
    </div>
    <div class="prey-slots">`;

  for (let i = 0; i < PREY_SLOT_COUNT; i++) {
    const slot = p.prey.slots[i];
    if (!slot.unlocked) {
      h += `<div class="prey-slot locked">
        <div class="prey-slot-head">
          <b>🐾 Prey Slot ${i + 1}</b>
          <span class="dim">bloqueado</span>
          <span style="flex:1"></span>
          <button class="sm" id="prey-buy-${i}">Comprar (${fmtFull(PREY_PERMANENT_SLOT_COST)} gp)</button>
        </div>
        <div class="prey-locked-msg tiny dim">Desbloqueie para caçar com bônus.</div>
      </div>`;
      continue;
    }
    const sel = slot.selected;
    const ativa = sel && sel.until > agora;
    const b = ativa ? PREY_BONUSES[sel.bonus] : null;
    const custoReroll = slot.rerollAt > agora;
    h += `<div class="prey-slot ${ativa ? "active" : ""}">
      <div class="prey-slot-head">
        <b>🐾 Prey Slot ${i + 1}</b>
        <span style="flex:1"></span>
        <button class="sm" id="prey-reroll-${i}">
          ${custoReroll ? `↻ Reroll · ${fmtFull(preyRerollCost(p))} gp` : "↻ Reroll (grátis)"}
        </button>
        <button class="sm" id="prey-wildcard-${i}" ${ativa && p.prey.wildcards > 0 ? "" : "disabled"}
          title="Prey Wildcard: melhora o bônus (+1 passo) e pode trocar o tipo">🃏 Wildcard</button>
      </div>
      ${ativa ? `<div class="prey-selected">
        <div class="prey-creature-card">
          ${typeof mobImg === "function" ? mobImg(sel.creature, 40) : ""}
          <div>
            <b>${preyMonsterName(sel.creature)}</b>
            <div class="tiny" style="color:${b.cor}">${b.nome} +${preyBonusValue(sel.bonus, sel.step)}% · ${preyTempoRestante(sel)}</div>
          </div>
        </div>
        <div class="prey-bonus-card" style="border-color:${b.cor};color:${b.cor}">
          <b>${b.nome}</b>
          <div class="prey-stars">${preyStarsHtml(sel.step)}</div>
          <span class="tiny">+${preyBonusValue(sel.bonus, sel.step)}%</span>
        </div>
      </div>` : `<div class="prey-select-hint tiny dim">Selecione uma criatura:</div>`}
      <div class="prey-grid">` + slot.creatures.map((slug) => {
        const it = sel && sel.creature === slug;
        return `<div class="prey-creature ${it ? "sel" : ""}" data-prey-slot="${i}" data-prey-creature="${slug}">
          ${typeof mobImg === "function" ? mobImg(slug, 36) : ""}
          <span class="tiny">${preyMonsterName(slug)}</span>
        </div>`;
      }).join("") + `</div>
    </div>`;
  }
  h += `</div>`;
  h += `<div class="prey-help tiny dim mt4">
    Bônus: Dano +7~25% · Defesa −12~30% · Exp +13~40% · Loot +13~40% (chance de loot duplo).
    Defense gasta tempo extra ao tomar dano. Wildcards melhoram o bônus.
  </div>`;
  box.innerHTML = h;

  // handlers
  for (let i = 0; i < PREY_SLOT_COUNT; i++) {
    const el = $("#prey-reroll-" + i);
    if (el) el.addEventListener("click", () => {
      const slot = p.prey.slots[i];
      const pago = slot.rerollAt > Date.now();
      const r = preyReroll(p, i, pago);
      if (!r.ok) { toast(r.msg, "bad"); return; }
      toast(pago ? `Nova lista (${fmtFull(preyRerollCost(p))} gp).` : "Nova lista grátis!");
      renderPreyModal(p);
    });
    const wc = $("#prey-wildcard-" + i);
    if (wc) wc.addEventListener("click", () => {
      const r = preyUseWildcard(p, i);
      if (!r.ok) { toast(r.msg, "bad"); return; }
      toast(`Wildcard: ${PREY_BONUSES[r.bonus].nome} +${r.value}%`);
      renderPreyModal(p);
    });
    const buy = $("#prey-buy-" + i);
    if (buy) buy.addEventListener("click", () => {
      const r = preyBuyPermanentSlot(p);
      if (!r.ok) { toast(r.msg, "bad"); return; }
      toast("Slot permanente desbloqueado!");
      renderPreyModal(p);
      renderAll();
    });
  }
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
