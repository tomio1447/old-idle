/* store-ui.js — Gamestore: Home, VIP, Obter Coins (Mercado Pago), cosméticos, bless, preys, vouchers e histórico. */
"use strict";

let _storeTab = "home";
let _storeCatalog = null;
let _storePoll = null;
let _storePayView = null; /* { order, pack, method } */
let _storeEmail = "";

function storeEsc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function storeCoinIcon() {
  return '<img src="assets/ui/coins/tibia-coins.gif" class="coin-gif" alt="Tibia Coin" style="width:16px;height:16px;vertical-align:middle">';
}
function storeCoinBalanceHtml() {
  const coins = accountCoins();
  const nt = typeof accountCoinsNt === "function" ? accountCoinsNt() : 0;
  const base = storeCoinIcon() + " " + storeEsc(typeof fmtFull === "function" ? fmtFull(coins) : coins);
  /* Non-transferable coins aparecem ao lado (só gastáveis na STORE). */
  return nt > 0 ? base + ` <span title="NT Coins: só gastáveis na STORE (não podem ir ao market/RMT)" style="color:#9fd6f0">+ ${typeof fmtFull === "function" ? fmtFull(nt) : nt} NT</span>` : base;
}
function storeBrl(n) {
  const v = Number(n) || 0;
  return "R$ " + v.toFixed(2).replace(".", ",");
}
function storeWhen(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "—";
  return d.toLocaleString("pt-BR");
}
function storeIsAdmin() {
  try {
    const acc = typeof sessionAccount === "function" ? sessionAccount() : null;
    return !!(acc && acc.role === "admin");
  } catch (e) { return false; }
}
function storeTestServer() {
  const cfg = (typeof window !== "undefined" && window.GLOBAL_IDLE_SERVER_CONFIG) || {};
  return !!cfg.testServer;
}
function storeStopPoll() {
  if (_storePoll) { clearInterval(_storePoll); _storePoll = null; }
}
function storeVipLabel() {
  const until = typeof sessionVipUntil === "function" ? sessionVipUntil() : 0;
  if (until > Date.now()) {
    const days = Math.max(1, Math.ceil((until - Date.now()) / 86400000));
    return "VIP ativo · " + days + " dia" + (days === 1 ? "" : "s");
  }
  return "Sem VIP";
}

function openStoreModal(tab) {
  if (tab) _storeTab = tab;
  if (_storeTab === "admin" && !storeIsAdmin()) _storeTab = "home";
  const modal = $("#modal");
  if (!modal) return;
  storeStopPoll();
  _storePayView = null;
  const modalBody = $("#modal-body");
  modalBody.classList.add("forge-pattern-modal-shell");
  modalBody.innerHTML = `
    <div class="panel-title">
      <img src="assets/ui/coins/tibia-coins.gif" class="coin-gif" alt="" style="width:20px;height:20px">
      <b>STORE</b>
      <span class="tiny dim" style="margin-left:6px">Gamestore</span>
      <span style="flex:1"></span>
      <span class="tiny" id="store-coin-count" style="color:#ffe680">${storeCoinBalanceHtml()}</span>
      <span class="tiny dim" style="margin-left:8px">${storeEsc(storeVipLabel())}</span>
      <button class="sm" id="store-close">✕</button>
    </div>
    <div class="panel-body store-shell">
      <nav class="store-nav" id="store-nav"></nav>
      <div class="store-main" id="store-main"><div class="tiny dim">Carregando...</div></div>
    </div>`;
  $("#store-close").addEventListener("click", () => {
    storeStopPoll();
    modal.classList.remove("show", "wide");
    modalBody.classList.remove("forge-pattern-modal-shell");
  });
  modal.classList.add("show", "wide");
  renderStoreNav();
  renderStoreTab();
}

function renderStoreNav() {
  const el = $("#store-nav");
  if (!el) return;
  const tabs = [
    { id: "home", nome: "Home" },
    { id: "vip", nome: "VIP" },
    { id: "coins", nome: "Obter Coins" },
    { id: "outfits", nome: "Outfits" },
    { id: "mounts", nome: "Mounts" },
    { id: "bless", nome: "BLESS" },
    { id: "preys", nome: "Preys" },
    { id: "vouchers", nome: "Vouchers" },
    { id: "history", nome: "Histórico" },
  ];
  if (storeIsAdmin()) tabs.push({ id: "admin", nome: "Faturamento" });
  el.innerHTML = tabs.map((t) =>
    `<button type="button" class="store-nav-btn ${_storeTab === t.id ? "active" : ""}" data-store-tab="${t.id}">
      ${storeEsc(t.nome)}${t.beta ? '<span class="store-beta">BETA</span>' : ""}
    </button>`).join("");
  $$("#store-nav [data-store-tab]").forEach((b) =>
    b.addEventListener("click", () => {
      storeStopPoll();
      _storePayView = null;
      _storeTab = b.dataset.storeTab;
      renderStoreNav();
      renderStoreTab();
    }));
}

async function renderStoreTab() {
  const main = $("#store-main");
  if (!main) return;
  if (typeof accountApiConfigured === "function" && !accountApiConfigured()) {
    main.innerHTML = `<div class="tiny" style="color:#ff9a6a">A STORE funciona no modo online (conta + servidor).</div>`;
    return;
  }
  if (!sessionToken() && typeof accountApiConfigured === "function" && accountApiConfigured()) {
    main.innerHTML = `<div class="tiny" style="color:#ff9a6a">Faça login na sua conta para usar a STORE.</div>`;
    return;
  }
  if (_storeTab === "home") return renderStoreHome(main);
  if (_storeTab === "vip") return renderStoreVip(main);
  if (_storeTab === "coins") return renderStoreBuy(main);
  if (_storeTab === "outfits") return renderStoreCosmetics(main, "outfit");
  if (_storeTab === "mounts") return renderStoreCosmetics(main, "mount");
  if (_storeTab === "bless") return renderStoreBless(main);
  if (_storeTab === "preys") return renderStorePreys(main);
  if (_storeTab === "vouchers") return renderStoreVouchers(main);
  if (_storeTab === "history") return renderStoreHistory(main);
  if (_storeTab === "admin") return renderStoreAdmin(main);
}

function renderStoreHome(main) {
  main.innerHTML = `
    <div class="store-hero">
      <img src="assets/ui/coins/tibia-coins.gif" alt="" class="coin-gif" style="width:28px;height:28px">
      <div>
        <div class="small" style="color:#ffe680">Tibia Coins da conta</div>
        <div class="store-balance">${typeof fmtFull === "function" ? fmtFull(accountCoins()) : accountCoins()} TC</div>
        <div class="tiny dim">${storeEsc(storeVipLabel())}. Os coins valem para todos os personagens.</div>
      </div>
    </div>
    <div class="tiny dim mb4">Pagamento via Pix (aprovação na hora) ou cartão de crédito. O crédito é automático depois da confirmação do Mercado Pago.</div>
    <div class="store-home-grid">
      <button type="button" class="store-home-card" data-store-go="coins">
        <b>Obter Coins</b>
        <span class="tiny dim">Comprar Tibia Coins com Pix ou cartão</span>
      </button>
      <button type="button" class="store-home-card" data-store-go="vip">
        <b>VIP</b>
        <span class="tiny dim">1, 7 ou 30 dias com Tibia Coins</span>
      </button>
    </div>`;
  $$("#store-main [data-store-go]").forEach((b) =>
    b.addEventListener("click", () => {
      _storeTab = b.dataset.storeGo;
      renderStoreNav();
      renderStoreTab();
    }));
}

async function ensureStoreCatalog() {
  if (_storeCatalog && _storeCatalog.ok) return _storeCatalog;
  if (typeof storeCatalog !== "function") return { ok: false, msg: "Cliente da loja ausente" };
  _storeCatalog = await storeCatalog();
  return _storeCatalog;
}

/* Benefícios efetivos do VIP — cada item precisa estar implementado no
 * jogo antes de entrar nesta lista (ver vip.js e pontos de uso). */
const STORE_VIP_BENEFITS = [
  ["✚", "<b>+10% de EXP</b> em cada criatura eliminada"],
  ["🔥", "<b>+50% de EXP</b> enquanto a stamina estiver entre 15h e 13h"],
  ["⚡", "Revive na hunt em <b>15s</b> (30s sem VIP)"],
  ["🎯", "<b>+3% de chance</b> de acerto crítico"],
  ["💚", "Regeneração passiva de <b>+10 HP e +20 MP</b> a cada 3s"],
  ["🏋", "Exercise weapons treinam <b>10% mais rápido</b>"],
  ["⏱", "<b>−30% de cooldown</b> em Gift of Life e Avatar (Wheel of Destiny)"],
  ["🙏", "<b>Full Bless</b>: a bênção do templo protege <b>7 mortes</b>"],
  ["💰", "<b>Autoseller da Loot Pouch</b> desbloqueado"],
  ["🕹", "<b>Controle manual de SQM</b> desbloqueado (andar com WASD/clique)"],
];

async function renderStorePreys(main) {
  main.innerHTML = `<div class="tiny dim">Carregando Preys...</div>`;
  const cat = await ensureStoreCatalog();
  if (!main.isConnected || _storeTab !== "preys") return;
  if (!cat.ok) { main.textContent = cat.msg || "Não foi possível carregar os pacotes."; return; }
  const acc = sessionAccount();
  const cards = Math.max(0, Number(acc && acc.cosmetics && acc.cosmetics.preyCards) || 0);
  const slotOwned = !!(acc && acc.cosmetics && acc.cosmetics.preySlot);
  const slotCost = Math.max(1, Number(cat.preySlotCards) || 50);
  main.innerHTML = `<div class="tiny mb8">Prey Cards da conta: <b>${cards}</b>.
    Saldo compartilhado entre todos os personagens. Cada utilização de Wildcard, Bonus Reroll ou
    seleção de criatura fora da lista consome 1 card. O 3º slot desbloqueado vale para a conta inteira.
    Wildcards antigos do personagem são utilizados primeiro.</div>
    <div class="store-pack-grid">
      <div class="store-pack">
        <img src="assets/ui/prey/prey_perm_test.png" width="32" height="32" alt="3º Prey Slot">
        <div class="store-pack-label">3º Slot de Prey</div>
        <div class="tiny dim">permanente · toda a conta</div>
        <div class="store-pack-price"><img src="assets/ui/prey/prey_wildcard.png" width="16" height="16" alt="" style="vertical-align:-3px"> ${slotCost} cards</div>
        <button type="button" class="sm primary full" id="store-prey-slot" ${slotOwned ? "disabled" : ""}>
          ${slotOwned ? "Desbloqueado" : "Desbloquear"}</button>
      </div>
      ${(cat.preys || []).map((p) => `
      <div class="store-pack">
        <img src="assets/ui/prey/prey_wildcard.png" width="32" height="32" alt="Prey Card">
        <div class="store-pack-label">${p.cards} cards</div>
        <div class="store-pack-price">${storeCoinIcon()} ${p.coins} TC</div>
        <button type="button" class="sm primary full" data-store-preys="${storeEsc(p.id)}">Comprar</button>
      </div>`).join("")}</div>`;
  main.querySelectorAll("[data-store-preys]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (button.dataset.confirm !== "yes") {
        button.dataset.confirm = "yes";
        button.textContent = "Confirmar compra";
        return;
      }
      button.disabled = true;
      try {
        const r = await accountPreyCardsRequest(sessionToken(), button.dataset.storePreys);
        toast(r.msg || (r.ok ? "Compra concluída." : "Falha na compra."), r.ok ? "level" : "bad");
        if (main.isConnected && _storeTab === "preys") openStoreModal("preys");
      } catch (e) {
        toast("Não foi possível confirmar a compra. Confira o saldo antes de tentar novamente.", "bad");
        button.disabled = false;
      }
    });
  });
  const slotBtn = main.querySelector("#store-prey-slot");
  if (slotBtn) slotBtn.addEventListener("click", async () => {
    if (slotBtn.dataset.confirm !== "yes") {
      slotBtn.dataset.confirm = "yes";
      slotBtn.textContent = `Confirmar (${slotCost} cards)`;
      return;
    }
    slotBtn.disabled = true;
    try {
      const r = await accountPreySlotRequest(sessionToken());
      toast(r.msg || (r.ok ? "Slot desbloqueado." : "Falha ao desbloquear."), r.ok ? "level" : "bad");
      if (main.isConnected && _storeTab === "preys") openStoreModal("preys");
    } catch (e) {
      toast("Não foi possível confirmar a compra. Confira o saldo antes de tentar novamente.", "bad");
      slotBtn.disabled = false;
    }
  });
}

async function renderStoreVip(main) {
  main.innerHTML = `<div class="tiny dim">Carregando VIP...</div>`;
  const cat = await ensureStoreCatalog();
  if (!cat.ok) { main.innerHTML = `<div class="tiny" style="color:#ff9a6a">${storeEsc(cat.msg)}</div>`; return; }
  const packs = cat.vip || [];
  main.innerHTML = `
    <div class="tiny dim mb4">${storeEsc(storeVipLabel())} · VIP é pago com Tibia Coins e vale para <b>todos os personagens da conta</b>.</div>
    <div class="store-vip-benefits">
      ${STORE_VIP_BENEFITS.map(([icon, txt]) => `
        <div class="store-vip-benefit"><span class="store-vip-benefit-ico">${icon}</span><span class="tiny">${txt}</span></div>`).join("")}
    </div>
    <div class="store-pack-grid">
      ${packs.map((p) => `
        <div class="store-pack">
          <div class="store-pack-label">${storeEsc(p.label)}</div>
          <div class="store-pack-price">${storeCoinIcon()} ${p.coins} TC</div>
          <button type="button" class="sm primary full" data-store-vip="${storeEsc(p.id)}">Comprar</button>
        </div>`).join("")}
    </div>`;
  $$("#store-main [data-store-vip]").forEach((b) =>
    b.addEventListener("click", async () => {
      const r = await storeBuyVip(sessionToken(), b.dataset.storeVip);
      if (!r.ok) { toast(r.msg || "Falha ao comprar VIP", "bad"); return; }
      toast(r.pack && r.pack.label ? r.pack.label + " ativado" : "VIP ativado", "level");
      renderStoreNav();
      openStoreModal("vip");
    }));
}

async function renderStoreBuy(main) {
  if (_storePayView) return renderStorePay(main, _storePayView);
  main.innerHTML = `<div class="tiny dim">Carregando pacotes...</div>`;
  const cat = await ensureStoreCatalog();
  if (!cat.ok) { main.innerHTML = `<div class="tiny" style="color:#ff9a6a">${storeEsc(cat.msg)}</div>`; return; }
  const packs = cat.packs || [];
  main.innerHTML = `
    <div class="tiny dim mb4">Coins são a moeda premium (VIP, outfits, boosts). Pagamento via Pix ou crédito; o crédito é automático após a confirmação.</div>
    ${cat.mpConfigured ? "" : `<div class="tiny mb4" style="color:#ffd65a">Mercado Pago ainda não está ligado no servidor.${storeTestServer() || storeIsAdmin() ? " No TEST_SERVER você pode simular o pagamento." : ""}</div>`}
    <div class="store-pack-grid">
      ${packs.map((p) => `
        <div class="store-pack ${p.best ? "best" : ""}">
          ${p.best ? '<div class="store-best">Melhor valor</div>' : ""}
          <div class="store-pack-label">${storeCoinIcon()} ${storeEsc(p.label)}</div>
          ${p.bonus ? `<div class="tiny" style="color:#9ce84a">+${p.bonus} bônus · ${p.total} TC</div>` : `<div class="tiny dim">${p.total} TC</div>`}
          <div class="store-pack-price">${storeBrl(p.brl)}</div>
          <button type="button" class="sm primary full" data-store-pack="${storeEsc(p.id)}">Comprar</button>
        </div>`).join("")}
    </div>`;
  $$("#store-main [data-store-pack]").forEach((b) =>
    b.addEventListener("click", () => renderStoreMethod(main, packs.find((p) => p.id === b.dataset.storePack))));
}

function renderStoreMethod(main, pack) {
  if (!pack) return;
  const cat = _storeCatalog || {};
  const cardBrl = Math.round(pack.brl * (cat.cardSurcharge || 1.1) * 100) / 100;
  main.innerHTML = `
    <button type="button" class="sm mb4" id="store-back-packs">← Pacotes</button>
    <div class="small mb4" style="color:#ffe680">${storeEsc(pack.label)} · ${pack.total} TC</div>
    <div class="tiny dim mb4">E-mail para receber o comprovante (obrigatório no Pix).</div>
    <input type="email" id="store-pay-email" placeholder="seu@email.com" value="${storeEsc(_storeEmail)}"
      style="width:100%;box-sizing:border-box;padding:6px 8px;background:#14120e;color:#c8c0a8;border:1px solid #16140f;margin-bottom:8px">
    <div class="tiny dim mb4">Escolha a forma de pagamento.</div>
    <div class="row" style="gap:8px;flex-wrap:wrap">
      <button type="button" class="sm primary" id="store-pay-pix">Pix (aprovação na hora) · ${storeBrl(pack.brl)}</button>
      <button type="button" class="sm primary" id="store-pay-card">Cartão de crédito (+10%) · ${storeBrl(cardBrl)}</button>
    </div>`;
  $("#store-back-packs").addEventListener("click", () => { _storePayView = null; renderStoreBuy(main); });
  const emailInput = $("#store-pay-email");
  if (emailInput) emailInput.addEventListener("input", (e) => { _storeEmail = e.target.value; });
  $("#store-pay-pix").addEventListener("click", () => startStoreCheckout(main, pack, "pix"));
  $("#store-pay-card").addEventListener("click", () => startStoreCheckout(main, pack, "card"));
}

async function startStoreCheckout(main, pack, method) {
  const email = String(_storeEmail || "").trim();
  if (method === "pix" && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    toast("Informe um e-mail válido para receber o comprovante do Pix.", "bad");
    const input = $("#store-pay-email");
    if (input && typeof input.focus === "function") input.focus();
    return;
  }
  main.innerHTML = `<div class="tiny dim">Abrindo pagamento...</div>`;
  const r = await storeCheckout(sessionToken(), pack.id, method, email || undefined);
  if (!r.ok) {
    main.innerHTML = `<div class="tiny" style="color:#ff9a6a">${storeEsc(r.msg || "Falha no checkout")}</div>
      <button type="button" class="sm mt8" id="store-back-packs">← Voltar</button>`;
    const back = $("#store-back-packs");
    if (back) back.addEventListener("click", () => { _storePayView = null; renderStoreBuy(main); });
    return;
  }
  _storePayView = { order: r.order, pack, method, mpConfigured: r.mpConfigured };
  renderStorePay(main, _storePayView);
}

function renderStorePay(main, view) {
  const order = view.order || {};
  const pixImg = order.pixQr
    ? `<img class="store-pix-qr" alt="QR Pix" src="data:image/png;base64,${order.pixQr}">`
    : "";
  const sim = (storeTestServer() || storeIsAdmin()) && order.status !== "paid";
  main.innerHTML = `
    <button type="button" class="sm mb4" id="store-back-packs">← Pacotes</button>
    <div class="small mb4" style="color:#ffe680">${storeEsc((view.pack && view.pack.label) || "Pedido")} · pedido #${storeEsc(order.id)}</div>
    <div class="tiny dim mb4">Status: <b>${storeEsc(order.status || "pending")}</b></div>
    ${view.method === "pix" ? `
      <div class="store-pix">
        ${pixImg}
        ${order.pixCopy ? `<textarea class="store-pix-copy" id="store-pix-copy" readonly>${storeEsc(order.pixCopy)}</textarea>
          <button type="button" class="sm" id="store-pix-clip">Copiar código Pix</button>` : `<div class="tiny dim">Aguardando QR do Mercado Pago...</div>`}
      </div>` : `
      <div class="tiny dim mb4">O cartão abre no checkout do Mercado Pago. Depois de pagar, volte aqui — o crédito é automático.</div>
      ${order.checkoutUrl ? `<a class="sm primary" id="store-card-go" href="${storeEsc(order.checkoutUrl)}" target="_blank" rel="noopener">Pagar com cartão</a>` : ""}
    `}
    ${sim ? `<div class="mt8"><button type="button" class="sm" id="store-sim">Simular pagamento (teste)</button></div>` : ""}
    <div class="tiny dim mt8" id="store-pay-hint">Aguardando confirmação...</div>`;
  $("#store-back-packs").addEventListener("click", () => {
    storeStopPoll();
    _storePayView = null;
    renderStoreBuy(main);
  });
  const clip = $("#store-pix-clip");
  if (clip) clip.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(order.pixCopy || "");
      toast("Código Pix copiado", "level");
    } catch (e) { toast("Não foi possível copiar", "bad"); }
  });
  const simBtn = $("#store-sim");
  if (simBtn) simBtn.addEventListener("click", async () => {
    const r = await storeSimulatePay(sessionToken(), order.id);
    if (!r.ok) { toast(r.msg || "Falha", "bad"); return; }
    toast("Coins creditados", "level");
    storeStopPoll();
    _storePayView = null;
    _storeTab = "history";
    renderStoreNav();
    renderStoreTab();
  });
  if (order.status === "paid") {
    const hint = $("#store-pay-hint");
    if (hint) hint.textContent = "Pago. Coins já estão na conta.";
    return;
  }
  storeStopPoll();
  _storePoll = setInterval(async () => {
    const r = await storeOrderStatus(sessionToken(), order.id);
    if (!r.ok || !r.order) return;
    view.order = r.order;
    if (r.order.status === "paid") {
      storeStopPoll();
      toast("Pagamento confirmado. Coins creditados.", "level");
      _storePayView = null;
      _storeTab = "history";
      renderStoreNav();
      renderStoreTab();
    }
  }, 3000);
}

async function renderStoreHistory(main) {
  main.innerHTML = `<div class="tiny dim">Carregando histórico...</div>`;
  const r = await storeHistory(sessionToken());
  if (!r.ok) { main.innerHTML = `<div class="tiny" style="color:#ff9a6a">${storeEsc(r.msg)}</div>`; return; }
  const ledger = r.ledger || [];
  const orders = r.orders || [];
  const kindLabel = { purchase: "Compra", spend: "Gasto", grant: "Ajuste" };
  main.innerHTML = `
    <div class="tiny dim mb4">Saldo atual: <b style="color:#ffe680">${typeof fmtFull === "function" ? fmtFull(r.coins) : r.coins} TC</b></div>
    <div class="small mb4" style="color:#d4af37">Pedidos</div>
    ${orders.length ? `<table class="admin-tbl"><thead><tr><th>#</th><th>Pacote</th><th>Valor</th><th>Status</th><th>Quando</th></tr></thead><tbody>
      ${orders.map((o) => `<tr><td>${storeEsc(o.id)}</td><td>${storeEsc(o.packId)} · ${o.method}</td><td>${storeBrl(o.brl)}</td><td>${storeEsc(o.status)}</td><td>${storeWhen(o.createdAt)}</td></tr>`).join("")}
    </tbody></table>` : `<div class="tiny dim mb4">Nenhum pedido ainda.</div>`}
    <div class="small mb4 mt8" style="color:#d4af37">Movimentação de coins</div>
    ${ledger.length ? `<table class="admin-tbl"><thead><tr><th>Tipo</th><th>Δ</th><th>Saldo</th><th>Nota</th><th>Quando</th></tr></thead><tbody>
      ${ledger.map((l) => `<tr><td>${storeEsc(kindLabel[l.kind] || l.kind)}</td><td>${l.delta > 0 ? "+" : ""}${l.delta}</td><td>${l.coinsAfter}</td><td>${storeEsc(l.note)}</td><td>${storeWhen(l.createdAt)}</td></tr>`).join("")}
    </tbody></table>` : `<div class="tiny dim">Nenhuma movimentação ainda.</div>`}`;
}

async function renderStoreAdmin(main) {
  if (!storeIsAdmin()) {
    main.innerHTML = `<div class="tiny" style="color:#ff9a6a">Só o administrador vê o faturamento.</div>`;
    return;
  }
  main.innerHTML = `<div class="tiny dim">Carregando faturamento...</div>`;
  const r = await storeAdminSummary(sessionToken());
  if (!r.ok) { main.innerHTML = `<div class="tiny" style="color:#ff9a6a">${storeEsc(r.msg)}</div>`; return; }
  const t = r.totals || {};
  const accounts = r.accounts || [];
  const orders = r.orders || [];
  const ledger = r.ledger || [];
  main.innerHTML = `
    <div class="store-admin-kpis">
      <div class="store-kpi"><span class="tiny dim">Faturamento</span><b>${storeBrl(t.revenueBrl)}</b></div>
      <div class="store-kpi"><span class="tiny dim">TC vendidos</span><b>${t.coinsSold || 0}</b></div>
      <div class="store-kpi"><span class="tiny dim">TC gastos (VIP)</span><b>${t.coinsSpent || 0}</b></div>
      <div class="store-kpi"><span class="tiny dim">Ajustes admin</span><b>${t.coinsGranted || 0}</b></div>
      <div class="store-kpi"><span class="tiny dim">Pedidos pendentes</span><b>${t.pendingOrders || 0}</b></div>
      <div class="store-kpi"><span class="tiny dim">MP</span><b>${r.mpConfigured ? "ligado" : "off"}</b></div>
    </div>
    <div class="small mb4" style="color:#d4af37">Saldos por conta</div>
    <div style="max-height:180px;overflow:auto" class="mb4">
      <table class="admin-tbl"><thead><tr><th>Login</th><th>TC</th><th>VIP até</th></tr></thead><tbody>
        ${accounts.map((a) => `<tr><td>${storeEsc(a.login)}</td><td>${a.coins}</td><td>${a.vipUntil > Date.now() ? storeWhen(a.vipUntil) : "—"}</td></tr>`).join("")}
      </tbody></table>
    </div>
    <div class="small mb4" style="color:#d4af37">Últimos pedidos</div>
    <div style="max-height:160px;overflow:auto" class="mb4">
      <table class="admin-tbl"><thead><tr><th>#</th><th>Login</th><th>Pacote</th><th>R$</th><th>Status</th></tr></thead><tbody>
        ${orders.map((o) => `<tr><td>${storeEsc(o.id)}</td><td>${storeEsc(o.login)}</td><td>${storeEsc(o.packId)}</td><td>${storeBrl(o.brl)}</td><td>${storeEsc(o.status)}</td></tr>`).join("")}
      </tbody></table>
    </div>
    <div class="small mb4" style="color:#d4af37">Ledger</div>
    <div style="max-height:160px;overflow:auto">
      <table class="admin-tbl"><thead><tr><th>Login</th><th>Tipo</th><th>Δ</th><th>R$</th><th>Nota</th></tr></thead><tbody>
        ${ledger.map((l) => `<tr><td>${storeEsc(l.login)}</td><td>${storeEsc(l.kind)}</td><td>${l.delta}</td><td>${storeBrl((l.brlCents || 0) / 100)}</td><td>${storeEsc(l.note)}</td></tr>`).join("")}
      </tbody></table>
    </div>`;
}

/* ------------------------- OUTFITS & MOUNTS (cosméticos) ----------------
 * Cada item custa COS_PRICE TC e desbloqueia na CONTA (acc.cosmetics) para
 * todos os personagens. Outfits são listados pelo id base canônico (mesma
 * regra do servidor) e exibidos com o sprite do sexo do personagem ativo. */
const STORE_COS_PRICE = 125;
let _storeCosBusca = "";

function storeCosmetics() {
  try {
    const acc = (typeof sessionAccount === "function") ? sessionAccount() : null;
    const c = acc && acc.cosmetics && typeof acc.cosmetics === "object" ? acc.cosmetics : {};
    return { outfits: c.outfits || {}, mounts: c.mounts || {} };
  } catch (e) { return { outfits: {}, mounts: {} }; }
}

function storeCosList(kind) {
  const p = (typeof G !== "undefined" && G && G.p) ? G.p : null;
  const sexo = p ? (typeof sexSuffix === "function" ? sexSuffix(p)
    : (p.sex === "female" ? "f" : "m")) : "m";
  const data = (typeof APPEARANCE_DATA !== "undefined" ? APPEARANCE_DATA
    : (typeof window !== "undefined" && window.APPEARANCES) || {});
  if (kind === "outfit") {
    const byBase = {};
    for (const o of data.outfits || []) {
      if (!o || o.sexo === "avatar") continue;
      const key = (typeof cosmeticOutfitKey === "function" ? cosmeticOutfitKey(o.id)
        : String(o.id).replace(/-[mf](-\d+)?$/, "").replace(/-\d+$/, ""));
      if (!key) continue;
      const cur = byBase[key] || (byBase[key] = { key, nome: o.nome, premium: !!o.premium, ids: {} });
      cur.ids[o.sexo] = o.id;
      if (o.premium) cur.premium = true;
    }
    return Object.values(byBase)
      .map((e) => Object.assign({}, e, { displayId: e.ids[sexo] || e.ids.m || e.ids.f }))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }
  return (data.mounts || [])
    .filter((m) => m && m.id)
    .map((m) => ({ key: String(m.id), nome: m.nome, displayId: m.id, premium: !!m.premium }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

function renderStoreCosmetics(main, kind) {
  const label = kind === "outfit" ? "Outfits" : "Montarias";
  main.innerHTML = `
    <div class="store-hero">
      <img src="assets/ui/coins/tibia-coins.gif" alt="" class="coin-gif" style="width:28px;height:28px">
      <div>
        <div class="small" style="color:#ffe680">${label} — ${STORE_COS_PRICE} TC cada</div>
        <div class="tiny dim">Desbloqueio por <b>conta</b>: vale para todos os personagens atuais e futuros.${kind === "outfit" ? " Inclui o visual base e todos os addons disponíveis, nas versões masculina e feminina. Compras antigas também recebem os addons, sem custo adicional." : " A montaria pode ser usada por qualquer personagem da conta."} Use no Cyclopedia &gt; Aparência.</div>
      </div>
    </div>
    <div class="store-voucher-row" style="max-width:340px;margin-bottom:8px">
      <input type="text" id="store-cos-busca" maxlength="40" autocomplete="off"
             spellcheck="false" placeholder="Buscar ${label.toLowerCase()}..."
             value="${storeEsc(_storeCosBusca)}" />
    </div>
    <div class="tiny dim mb4" id="store-cos-count"></div>
    <div class="app-grid store-cos-grid" id="store-cos-grid"></div>`;

  const paintSprites = () => {
    const p = (typeof G !== "undefined" && G && G.p) ? G.p : null;
    const cores = (p && p.outfit && p.outfit.colors) ||
      (typeof DEFAULT_OUTFIT_COLORS !== "undefined" &&
        (DEFAULT_OUTFIT_COLORS[p && p.voc] || DEFAULT_OUTFIT_COLORS.none)) || [78, 68, 58, 76];
    const pend = $$(".store-cos-grid [data-cos-paint], .store-cos-grid [data-mount-paint]").slice();
    const started = Date.now();
    const lote = () => {
      if (!document.body.contains(main) || !pend.length) return;
      const rest = [];
      let feitos = 0;
      for (const box of pend) {
        if (feitos >= 12) { rest.push(box); continue; }
        const mountId = box.dataset.mountPaint;
        // Asset falhou de vez (404 em Sprites): marca e nao retenta.
        if (mountId && typeof Sprites !== "undefined" && Sprites.cache &&
            Sprites.cache["assets/appearance/mount/" + mountId + ".base.png"] === null) {
          box.innerHTML = '<div class="tiny dim" style="padding-top:20px">?</div>';
          feitos++;
          continue;
        }
        const cv = mountId
          ? ((typeof AppearanceRenderer !== "undefined" && AppearanceRenderer.mount)
              ? AppearanceRenderer.mount(mountId, "s", 0) : null)
          : ((typeof AppearanceRenderer !== "undefined" && AppearanceRenderer.outfit)
              ? AppearanceRenderer.outfit(box.dataset.cosPaint, 3, cores) : null);
        if (!cv) { rest.push(box); continue; }
        cv.style.width = "48px"; cv.style.height = "52px";
        cv.style.imageRendering = "pixelated"; cv.style.objectFit = "contain";
        box.innerHTML = "";
        box.appendChild(cv);
        feitos++;
      }
      pend.length = 0;
      pend.push.apply(pend, rest);
      // Sprites carregam sob demanda: retenta enquanto houver pendente.
      if (pend.length && Date.now() - started < 30000) requestAnimationFrame(lote);
    };
    requestAnimationFrame(lote);
  };

  const renderGrid = () => {
    const grid = $("#store-cos-grid");
    if (!grid) return;
    const cos = storeCosmetics();
    const busca = (_storeCosBusca || "").toLowerCase();
    let lista = storeCosList(kind);
    if (busca) lista = lista.filter((e) => (e.nome || "").toLowerCase().indexOf(busca) !== -1);
    const cnt = $("#store-cos-count");
    if (cnt) cnt.textContent = lista.length + " " + label.toLowerCase();
    grid.innerHTML = lista.map((e) => {
      const tem = kind === "outfit" ? cos.outfits[e.key] !== undefined : !!cos.mounts[e.key];
      return `<div class="app-card ${tem ? "" : "bloq"}">
        <div class="app-img" ${kind === "outfit" ? `data-cos-paint="${storeEsc(e.displayId)}"` : `data-mount-paint="${storeEsc(e.displayId)}"`}>
          <div class="tiny dim app-img-loading">…</div>
        </div>
        <div class="tiny">${storeEsc(e.nome)}</div>
        <button class="sm cos-buy" data-cos-kind="${kind}" data-cos-key="${storeEsc(e.key)}"
          ${tem ? "disabled" : ""}>${tem ? "Adquirido" : STORE_COS_PRICE + " TC"}</button>
      </div>`;
    }).join("");
    paintSprites();
  };

  // Busca: re-renderiza só o grid (mantém foco no input)
  const inp = $("#store-cos-busca");
  inp.addEventListener("input", () => { _storeCosBusca = inp.value; renderGrid(); });
  inp.addEventListener("keydown", (e) => e.stopPropagation());

  // Compra com confirmação em 2 cliques no próprio botão (delegação: o grid
  // é re-renderizado pela busca, então listener no container pai)
  $("#store-cos-grid").addEventListener("click", async (e) => {
    const b = e.target.closest(".cos-buy");
    if (!b || b.disabled) return;
    if (b.dataset.confirm !== "1") {
      b.dataset.confirm = "1";
      const old = b.textContent;
      b.textContent = "Confirmar?";
      setTimeout(() => { if (b.isConnected && b.dataset.confirm === "1") { b.dataset.confirm = ""; b.textContent = old; } }, 3000);
      return;
    }
    if (b.dataset.busy === "1") return;
    b.dataset.busy = "1";
    b.disabled = true;
    b.textContent = "...";
    const k = b.dataset.cosKind, key = b.dataset.cosKey;
    const r = await storeBuyCosmetic(sessionToken(), k, key);
    if (r && r.ok) {
      if (typeof toast === "function") toast(`<b>${storeEsc(r.nome || key)}</b> desbloqueado na conta!`);
      const cc = $("#store-coin-count");
      if (cc) cc.innerHTML = storeCoinBalanceHtml();
      renderGrid();
    } else {
      b.dataset.busy = "";
      b.disabled = false;
      b.textContent = STORE_COS_PRICE + " TC";
      if (typeof toast === "function") toast((r && r.msg) || "Falha na compra");
    }
  });

  renderGrid();
}

/* -------------------------------- BLESS --------------------------------
 * Proteção de wipe comprada com TC (acc.cosmetics.bless). Quando a PT
 * inteira morre numa hunt, 1 carga é consumida pela conta de algum membro
 * e todos revivem sem custo de gold e sem perda de XP. */
const STORE_BLESS_PRICE = 150;

function storeBlessCount() {
  try {
    const acc = (typeof sessionAccount === "function") ? sessionAccount() : null;
    const c = acc && acc.cosmetics && typeof acc.cosmetics === "object" ? acc.cosmetics : {};
    return Math.max(0, Math.floor(Number(c.bless) || 0));
  } catch (e) { return 0; }
}

function renderStoreBless(main) {
  const bless = storeBlessCount();
  main.innerHTML = `
    <div class="store-hero">
      <img src="assets/spell/icon-39.png" alt="" class="coin-gif" style="width:28px;height:28px;image-rendering:pixelated">
      <div>
        <div class="small" style="color:#ffe680">Bless — ${STORE_BLESS_PRICE} TC cada</div>
        <div class="tiny dim">Proteção de <b>conta</b>: vale para todos os personagens.</div>
      </div>
    </div>
    <div class="store-voucher-box">
      <div class="tiny" style="margin-bottom:8px">
        Se a <b>party inteira morrer</b> numa hunt, <b>1 bless é consumida</b> e todos revivem na hora:
        <b>nenhum personagem perde experiência nem gold</b> (nem o custo normal das bênçãos).
        Sem bless, a party paga o bless tradicional em gold — ou volta ao templo se não tiver saldo.
      </div>
      <div class="tiny" style="margin-bottom:8px">
        Blesses disponíveis: <b id="store-bless-count" style="color:#8fd18f">${bless}</b>
      </div>
      <button type="button" id="store-bless-buy" class="cos-buy">
        Comprar 1 bless — ${STORE_BLESS_PRICE} TC
      </button>
      <div id="store-bless-msg" class="tiny" style="min-height:16px;margin-top:6px"></div>
    </div>
    <div class="tiny dim" style="margin-top:10px">
      Funciona em hunts comuns (não vale para arenas de boss nem World Boss).
    </div>`;

  const btn = $("#store-bless-buy");
  const msgEl = $("#store-bless-msg");
  const setMsg = (text, color) => {
    msgEl.textContent = text || "";
    msgEl.style.color = color || "#a49b84";
  };

  btn.addEventListener("click", async () => {
    if (btn.dataset.confirm !== "1") {
      btn.dataset.confirm = "1";
      const old = btn.textContent;
      btn.textContent = "Confirmar compra?";
      setTimeout(() => { if (btn.isConnected && btn.dataset.confirm === "1") { btn.dataset.confirm = ""; btn.textContent = old; } }, 3000);
      return;
    }
    if (btn.dataset.busy === "1") return;
    btn.dataset.busy = "1";
    btn.disabled = true;
    btn.textContent = "...";
    const r = await storeBuyBless(sessionToken());
    btn.dataset.busy = "";
    btn.disabled = false;
    btn.dataset.confirm = "";
    btn.textContent = "Comprar 1 bless — " + STORE_BLESS_PRICE + " TC";
    if (r && r.ok) {
      const cnt = $("#store-bless-count");
      if (cnt) cnt.textContent = String(storeBlessCount());
      const cc = $("#store-coin-count");
      if (cc) cc.innerHTML = storeCoinBalanceHtml();
      setMsg("✔ " + (r.msg || "Bless ativa na conta!"), "#8fd18f");
    } else {
      setMsg("✖ " + ((r && r.msg) || "Falha na compra"), "#ff9a6a");
    }
  });
}

/* ------------------------------ VOUCHERS ------------------------------
 * Códigos de brinde divulgados nas redes. Cada voucher tem limite de uso por
 * conta — o servidor valida e entrega a recompensa (coins na conta / itens no
 * depot da conta). */
function renderStoreVouchers(main) {
  main.innerHTML = `
    <div class="store-hero">
      <img src="assets/ui/coins/tibia-coins.gif" alt="" class="coin-gif" style="width:28px;height:28px">
      <div>
        <div class="small" style="color:#ffe680">Vouchers de brinde</div>
        <div class="tiny dim">Digite o código e confira. Itens são entregues no <b>depot da conta</b> — qualquer personagem pode pegar.</div>
      </div>
    </div>
    <div class="store-voucher-box">
      <label class="tiny dim" for="store-voucher-code">Código do voucher</label>
      <div class="store-voucher-row">
        <input type="text" id="store-voucher-code" maxlength="40" autocomplete="off"
               spellcheck="false" placeholder="EX: FREETC" />
        <button type="button" id="store-voucher-btn">CONFERIR</button>
      </div>
      <div id="store-voucher-msg" class="tiny" style="min-height:16px"></div>
    </div>
    <div class="tiny dim" style="margin-top:10px">
      Fique de olho nos códigos postados no <b>Discord</b>, <b>Instagram</b> e no <b>grupo do WhatsApp</b>. Cada voucher pode ser usado <b>1 vez por conta</b>.
    </div>`;

  const input = $("#store-voucher-code");
  const btn = $("#store-voucher-btn");
  const msgEl = $("#store-voucher-msg");
  let busy = false;

  const setMsg = (text, color) => {
    msgEl.textContent = text || "";
    msgEl.style.color = color || "#a49b84";
  };

  const redeem = async () => {
    if (busy) return;
    const code = String(input.value || "").trim();
    if (!code) { setMsg("Digite um código de voucher.", "#ff9a6a"); input.focus(); return; }
    busy = true;
    btn.disabled = true;
    btn.textContent = "CONFERINDO...";
    setMsg("Verificando no servidor...", "#a49b84");
    try {
      const r = await storeRedeemVoucher(sessionToken(), code);
      if (r && r.ok) {
        const parts = [r.label || "Brinde resgatado"];
        if (r.items && r.items.length) parts.push(r.items.length + " item(ns) no depot da conta");
        setMsg("✔ " + parts.join(" — "), "#9ce84a");
        input.value = "";
        const cc = $("#store-coin-count");
        if (cc) cc.innerHTML = storeCoinBalanceHtml();
        // Vouchers de divulgação trazem um modal próprio (recompensas +
        // agradecimento/links do criador) — ex.: cupom de streamer.
        if (r.modal && typeof r.modal === "object") openStoreVoucherModal(r);
      } else if (r && r.needTwitch) {
        /* Gate social: o voucher exige follow na Twitch — abre o modal de
         * conexão OAuth; ao verificar, refaz o resgate automaticamente. */
        setMsg("Este voucher exige seguir @" + (r.channel || "buto_pvp") + " na Twitch.", "#f2c96b");
        openVoucherTwitchGate(r, redeem);
      } else {
        setMsg("✖ " + ((r && r.msg) || "Falha ao resgatar voucher"), "#ff9a6a");
      }
    } catch (e) {
      setMsg("✖ Erro de rede — tente de novo", "#ff9a6a");
    } finally {
      busy = false;
      btn.disabled = false;
      btn.textContent = "CONFERIR";
      input.focus();
    }
  };

  btn.addEventListener("click", redeem);
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") redeem(); });
  input.focus();
}

/* Modal de recompensa do voucher — o servidor manda `modal` + `rewards`
 * (vouchers de divulgação, ex.: cupom de streamer). Montaria usa o primeiro
 * frame do sheet via background; logos sociais são SVG inline (sem asset). */
const VOUCHER_SOCIAL_ICONS = {
  instagram: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none"><defs><linearGradient id="vig" x1="0" y1="24" x2="24" y2="0"><stop offset="0" stop-color="#feda75"/><stop offset=".4" stop-color="#fa7e1e"/><stop offset=".7" stop-color="#d62976"/><stop offset="1" stop-color="#962fbf"/></linearGradient></defs><rect x="1.5" y="1.5" width="21" height="21" rx="5.5" fill="url(#vig)"/><circle cx="12" cy="12" r="5" stroke="#fff" stroke-width="2.2"/><circle cx="17.3" cy="6.7" r="1.4" fill="#fff"/></svg>`,
  twitch: `<svg viewBox="0 0 24 24" width="20" height="20"><path fill="#9146FF" d="M4.3 1 1.8 5v17h5v3h2.5l3-3h4.3l5.2-5.5V1H4.3zm15 14-3.8 4h-4l-3 3v-3H4.8V3h14.5v12z"/><rect x="14" y="6.5" width="2.2" height="6" fill="#9146FF"/><rect x="9" y="6.5" width="2.2" height="6" fill="#9146FF"/></svg>`,
};

function voucherRewardIcon(rw) {
  const kind = rw && rw.kind;
  if (kind === "mount") {
    const id = String(rw.mount || "");
    const data = (typeof APPEARANCE_DATA !== "undefined" ? APPEARANCE_DATA
      : (typeof window !== "undefined" && window.APPEARANCES) || {});
    const m = (data.mounts || []).find((x) => String(x.id) === id) || {};
    const cw = Number(m.cw) || 64, ch = Number(m.ch) || 64;
    const cols = Number(m.cols) || 9, rows = Number(m.rows) || 4;
    const box = 56;
    return `<div class="voucher-rw-sprite" style="width:${box}px;height:${box}px;` +
      `background-image:url('assets/appearance/mount/${id}.base.png');` +
      `background-size:${cw * cols}px ${ch * rows}px;background-position:0 0;` +
      `background-repeat:no-repeat;image-rendering:pixelated"></div>`;
  }
  if (kind === "vip")
    return `<svg viewBox="0 0 24 24" width="30" height="30"><path fill="#f6d57e" stroke="#8a6b1f" stroke-width=".8" d="M2.5 19.5 4 7l4.8 4.2L12 4l3.2 7.2L20 7l1.5 12.5h-19z"/><circle cx="4" cy="5" r="1.6" fill="#f6d57e"/><circle cx="12" cy="2.5" r="1.6" fill="#f6d57e"/><circle cx="20" cy="5" r="1.6" fill="#f6d57e"/></svg>`;
  if (kind === "coinsNt")
    return `<span style="position:relative;display:inline-block"><img src="assets/ui/coins/tibia-coins.gif" style="width:30px;height:30px;image-rendering:pixelated" alt=""><b style="position:absolute;right:-4px;bottom:-3px;font-size:9px;color:#7dd3fc;text-shadow:0 1px 2px #000">NT</b></span>`;
  if (kind === "coins")
    return `<img src="assets/ui/coins/tibia-coins.gif" style="width:30px;height:30px;image-rendering:pixelated" alt="">`;
  if (kind === "outfit") {
    const id = String(rw.sprite || rw.outfit || "");
    const data = (typeof APPEARANCE_DATA !== "undefined" ? APPEARANCE_DATA
      : (typeof window !== "undefined" && window.APPEARANCES) || {});
    const o = (data.outfits || []).find((x) => String(x.id) === id) || {};
    const cw = Number(o.cw) || 64, ch = Number(o.ch) || 64;
    const cols = Number(o.cols) || 3, rows = Number(o.rows) || 4;
    const box = 56;
    return `<div class="voucher-rw-sprite" style="width:${box}px;height:${box}px;` +
      `background-image:url('assets/appearance/outfit/${id}.base.png');` +
      `background-size:${cw * cols}px ${ch * rows}px;background-position:0 0;` +
      `background-repeat:no-repeat;image-rendering:pixelated"></div>`;
  }
  if (kind === "boost")
    return `<svg viewBox="0 0 24 24" width="30" height="30"><path fill="#ffd94a" stroke="#8a6b1f" stroke-width=".7" d="M13 1 4 14h6l-1 9 9-13h-6l1-9z"/></svg>`;
  return `<span style="font-size:26px;line-height:1">📦</span>`;
}

function voucherSocialIcon(link) {
  const name = String((link && link.name) || "").toLowerCase();
  if (name.indexOf("insta") >= 0) return VOUCHER_SOCIAL_ICONS.instagram;
  if (name.indexOf("twitch") >= 0) return VOUCHER_SOCIAL_ICONS.twitch;
  return `<span style="font-size:18px">🔗</span>`;
}

function openStoreVoucherModal(r) {
  const old = document.getElementById("voucher-reward-backdrop");
  if (old) old.remove();
  const m = r.modal || {};
  const rewards = Array.isArray(r.rewards) ? r.rewards : [];
  const social = m.social && typeof m.social === "object" ? m.social : null;
  /* Tema Twitch (roxo radiante) quando o voucher é de streamer — detectado
   * por link Twitch no bloco social do modal. */
  const isTw = !!(social && (Array.isArray(social.links) ? social.links : [])
    .some((l) => /twitch/i.test(String((l && (l.name || l.url)) || ""))));

  const bd = document.createElement("div");
  bd.id = "voucher-reward-backdrop";
  bd.className = "voucher-reward-backdrop" + (isTw ? " partners-backdrop" : "");
  bd.innerHTML = `
    <div class="voucher-reward-card${isTw ? " voucher-tw" : ""}" role="dialog" aria-modal="true">
      <div class="voucher-reward-title">${isTw ? VOUCHER_SOCIAL_ICONS.twitch : ""}<span>${m.title || "Voucher resgatado!"}</span>
        <button type="button" class="sm voucher-reward-close" aria-label="Fechar">✕</button>
      </div>
      ${m.intro ? `<div class="voucher-reward-intro">${m.intro}</div>` : ""}
      ${rewards.length ? `<div class="voucher-reward-list">` +
        rewards.map((rw) => `<div class="voucher-reward-row">
          <span class="voucher-reward-ico">${voucherRewardIcon(rw)}</span>
          <span class="voucher-reward-label">${rw.label || ""}</span>
        </div>`).join("") + `</div>` : ""}
      ${social ? `<div class="voucher-reward-social">
        <div class="voucher-reward-social-label">${social.label || ""}</div>
        ${(Array.isArray(social.links) ? social.links : []).map((l) => `
          <a class="voucher-reward-link" href="${l.url || "#"}" target="_blank" rel="noopener noreferrer">
            ${voucherSocialIcon(l)}
            <span class="voucher-reward-link-name">${l.name || ""}</span>
            <span class="voucher-reward-link-handle">${l.handle || l.url || ""}</span>
          </a>`).join("")}
      </div>` : ""}
      <div class="voucher-tw-actions">
        <button type="button" class="voucher-tw-btn" id="voucher-reward-ok">OK</button>
      </div>
    </div>`;
  document.body.appendChild(bd);
  const close = () => bd.remove();
  bd.addEventListener("click", (e) => { if (e.target === bd) close(); });
  bd.querySelector(".voucher-reward-close").addEventListener("click", close);
  bd.querySelector("#voucher-reward-ok").addEventListener("click", close);
}

/* Gate social do voucher de streamer: o servidor respondeu `needTwitch`
 * — o jogador precisa conectar a Twitch (OAuth) e seguir o canal. O botão
 * COLETAR verifica o follow: se já segue, resgata; se a Twitch não está
 * vinculada, abre o pop-up OAuth e o poll coleta assim que confirmar. */
function openVoucherTwitchGate(r, retry) {
  const old = document.getElementById("voucher-twitch-backdrop");
  if (old) old.remove();
  const chan = String((r && r.channel) || "buto_pvp");
  const bd = document.createElement("div");
  bd.id = "voucher-twitch-backdrop";
  bd.className = "voucher-reward-backdrop partners-backdrop";
  bd.innerHTML = `
    <div class="voucher-reward-card voucher-twitch-card voucher-tw" role="dialog" aria-modal="true">
      <div class="voucher-reward-title">${VOUCHER_SOCIAL_ICONS.twitch}<span>Siga o streamer para resgatar</span>
        <button type="button" class="sm voucher-reward-close" aria-label="Fechar">✕</button>
      </div>
      <div class="voucher-reward-intro">
        Este voucher exige que sua conta esteja <b>seguindo @${chan} na Twitch</b>.
        Clique em COLETAR — conectamos sua Twitch para confirmar o follow.
      </div>
      <a class="voucher-reward-link" href="https://www.twitch.tv/${chan}" target="_blank" rel="noopener noreferrer">
        ${voucherSocialIcon({ name: "Twitch" })}
        <span class="voucher-reward-link-name">Twitch</span>
        <span class="voucher-reward-link-handle">@${chan}</span>
      </a>
      ${Array.isArray(r && r.rewards) && r.rewards.length ? `
      <div class="voucher-reward-intro" style="margin-bottom:2px"><b>Ao confirmar o follow você recebe:</b></div>
      <div class="voucher-reward-list">` +
        r.rewards.map((rw) => `<div class="voucher-reward-row">
          <span class="voucher-reward-ico">${voucherRewardIcon(rw)}</span>
          <span class="voucher-reward-label">${rw.label || ""}</span>
        </div>`).join("") + `</div>` : ""}
      <div class="voucher-tw-actions">
        <button type="button" class="voucher-tw-btn" id="voucher-twitch-connect">COLETAR</button>
      </div>
      <div class="tiny voucher-twitch-status" id="voucher-twitch-status"></div>
    </div>`;
  document.body.appendChild(bd);

  const statusEl = bd.querySelector("#voucher-twitch-status");
  const btn = bd.querySelector("#voucher-twitch-connect");
  let poll = null, busy = false;
  const stopPoll = () => { if (poll) { clearInterval(poll); poll = null; } };
  const close = () => { stopPoll(); bd.remove(); };
  const finish = () => { stopPoll(); close(); if (typeof retry === "function") retry(); };

  const openOAuth = () => {
    window.open("/api/twitch/auth?token=" + encodeURIComponent(sessionToken())
      + "&channel=" + encodeURIComponent(chan),
      "gi-twitch-auth", "width=540,height=700,menubar=no,toolbar=no,location=yes");
  };

  /* COLETAR: já segue → resgata; Twitch não vinculada → OAuth (o poll
   * coleta ao confirmar); vinculada sem follow → orienta seguir. */
  const collect = async () => {
    if (busy) return;
    busy = true; btn.disabled = true; btn.textContent = "VERIFICANDO...";
    try {
      const st = await storeTwitchStatus(sessionToken(), chan);
      if (st && st.ok && st.verified) { finish(); return; }
      if (st && st.ok && st.linked) {
        statusEl.textContent = "Conectado como @" + st.login + " — você ainda não segue @" + chan + ". Siga na Twitch e clique em COLETAR de novo.";
        statusEl.style.color = "#f2c96b";
      } else if (st && st.ok && st.configured === false) {
        statusEl.textContent = "A verificação Twitch não está configurada no servidor — avise a administração.";
        statusEl.style.color = "#ff9a6a";
      } else {
        statusEl.textContent = "Autorize sua Twitch na janela que abriu — confirmamos o follow automaticamente.";
        statusEl.style.color = "#c9b8ef";
        openOAuth();
      }
    } catch (e) {
      statusEl.textContent = "Erro de rede — tente de novo.";
      statusEl.style.color = "#ff9a6a";
    } finally {
      busy = false; btn.disabled = false; btn.textContent = "COLETAR";
    }
  };
  btn.addEventListener("click", collect);

  /* Poll pós-OAuth: quando a verificação conclui, coleta sem novo clique. */
  const refresh = async () => {
    let st;
    try { st = await storeTwitchStatus(sessionToken(), chan); } catch (e) { return; }
    if (!st || !st.ok) return;
    if (st.verified) {
      statusEl.textContent = "✔ Follow confirmado — resgatando...";
      statusEl.style.color = "#9ce84a";
      stopPoll();
      setTimeout(finish, 600);
    }
  };
  poll = setInterval(refresh, 2500);

  bd.addEventListener("click", (e) => { if (e.target === bd) close(); });
  bd.querySelector(".voucher-reward-close").addEventListener("click", close);
}

function bootStoreFromQuery() {
  try {
    const q = new URLSearchParams(location.search);
    const st = q.get("store");
    if (!st) return;
    openStoreModal(st === "paid" || st === "pending" || st === "fail" ? "history" : "coins");
  } catch (e) {}
}
