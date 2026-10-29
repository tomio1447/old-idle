/* store-ui.js — Gamestore: Obter Coins (Mercado Pago), VIP, vender TC (beta). */
"use strict";

let _storeTab = "home";
let _storeCatalog = null;
let _storePoll = null;
let _storePayView = null; /* { order, pack, method } */
let _storeSellQty = "";
let _storeSellPrice = "";
let _storeSellAnon = false;
let _storeEmail = "";

function storeEsc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
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
      <span class="tiny" id="store-coin-count" style="color:#ffe680">🪙 ${typeof fmtFull === "function" ? fmtFull(accountCoins()) : accountCoins()}</span>
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
    { id: "sell", nome: "Vender Coins", beta: true },
    { id: "outfits", nome: "Outfits" },
    { id: "mounts", nome: "Mounts" },
    { id: "bless", nome: "BLESS" },
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
  if (_storeTab === "sell") return renderStoreSell(main);
  if (_storeTab === "outfits") return renderStoreCosmetics(main, "outfit");
  if (_storeTab === "mounts") return renderStoreCosmetics(main, "mount");
  if (_storeTab === "bless") return renderStoreBless(main);
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
      <button type="button" class="store-home-card" data-store-go="sell">
        <b>Vender Coins <span class="store-beta">BETA</span></b>
        <span class="tiny dim">Trocar TC por gold com outros jogadores</span>
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

async function renderStoreVip(main) {
  main.innerHTML = `<div class="tiny dim">Carregando VIP...</div>`;
  const cat = await ensureStoreCatalog();
  if (!cat.ok) { main.innerHTML = `<div class="tiny" style="color:#ff9a6a">${storeEsc(cat.msg)}</div>`; return; }
  const packs = cat.vip || [];
  main.innerHTML = `
    <div class="tiny dim mb4">VIP é pago com Tibia Coins da conta. ${storeEsc(storeVipLabel())}.</div>
    <div class="store-pack-grid">
      ${packs.map((p) => `
        <div class="store-pack">
          <div class="store-pack-label">${storeEsc(p.label)}</div>
          <div class="store-pack-price">🪙 ${p.coins} TC</div>
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
          <div class="store-pack-label">${storeEsc(p.label)}</div>
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

async function renderStoreSell(main) {
  const tok = sessionToken();
  const coins = accountCoins();
  const p = typeof G !== "undefined" && G ? G.p : { name: "Anônimo" };
  if (typeof marketBank === "function") marketBank(tok).then((r) => { if (r.ok) _mBank = r.bank; });
  main.innerHTML = `
    <div class="tiny mb4" style="color:#ffd65a">BETA — venda player-to-player no Market. Os TC ficam retidos na oferta; se cancelar, voltam para a conta.</div>
    <div class="small mb4" style="color:#ffe680">${typeof fmtFull === "function" ? fmtFull(coins) : coins} TC na conta</div>
    <div class="row mb4" style="gap:6px;flex-wrap:wrap">
      <input id="store-sell-qty" type="number" min="1" placeholder="Qtd TC" value="${storeEsc(_storeSellQty)}" style="width:90px;padding:3px 6px;background:#14120e;color:#c8c0a8;border:1px solid #16140f">
      <span class="tiny dim">TC por</span>
      <input id="store-sell-price" type="number" min="1" placeholder="gp total" value="${storeEsc(_storeSellPrice)}" style="width:110px;padding:3px 6px;background:#14120e;color:#c8c0a8;border:1px solid #16140f">
      <span class="tiny dim">gp</span>
      <label class="toggle"><input type="checkbox" id="store-sell-anon" ${_storeSellAnon ? "checked" : ""}> Anônimo</label>
      <button type="button" class="sm primary" id="store-sell-go">Ofertar TC (30 dias)</button>
    </div>
    <div class="tiny dim mb4" id="store-sell-fee"></div>
    <div class="tiny dim mb4">Ofertas ativas de Tibia Coins</div>
    <div id="store-sell-list" class="tiny dim">Carregando...</div>`;
  const qtyEl = $("#store-sell-qty");
  const priceEl = $("#store-sell-price");
  const feeEl = $("#store-sell-fee");
  const refreshFee = () => {
    const price = Math.floor(Number(priceEl.value) || 0);
    feeEl.textContent = price > 0 && typeof marketFee === "function"
      ? "Taxa do Market: " + (typeof fmtFull === "function" ? fmtFull(marketFee(price)) : marketFee(price)) + " gp (do banco)"
      : "";
  };
  if (qtyEl) qtyEl.addEventListener("input", (e) => { _storeSellQty = e.target.value; });
  if (priceEl) priceEl.addEventListener("input", (e) => { _storeSellPrice = e.target.value; refreshFee(); });
  $("#store-sell-anon").addEventListener("change", (e) => { _storeSellAnon = e.target.checked; });
  refreshFee();
  $("#store-sell-go").addEventListener("click", async () => {
    const qty = Math.floor(Number(_storeSellQty) || 0);
    const price = Math.floor(Number(_storeSellPrice) || 0);
    if (qty <= 0 || price <= 0) { toast("Informe quantidade e preço"); return; }
    if (qty > coins) { toast("Tibia Coins insuficientes"); return; }
    const r = await marketCreateOffer({
      token: tok, kind: "coins", qty, price, price_tc: 0,
      seller_name: _storeSellAnon ? "Anônimo" : (p && p.name) || "Jogador",
    });
    if (!r.ok) { toast(r.msg || "Falha", "bad"); return; }
    if (Number.isFinite(Number(r.bank))) _mBank = Number(r.bank);
    if (Number.isFinite(Number(r.coinBalance))) storeApplyCoins(r.coinBalance);
    toast("Oferta criada", "level");
    _storeSellQty = ""; _storeSellPrice = "";
    renderStoreSell(main);
  });
  const list = $("#store-sell-list");
  const offers = await marketListOffers({ kind: "coins" });
  if (!offers.ok) { list.innerHTML = `<div class="tiny" style="color:#ff9a6a">${storeEsc(offers.msg)}</div>`; return; }
  const rows = offers.offers || [];
  if (!rows.length) { list.innerHTML = `<div class="tiny dim">Nenhuma oferta de TC no momento.</div>`; return; }
  list.innerHTML = `<div class="list" style="max-height:280px">` + rows.map((o) => `
    <div class="shop-row">
      <div style="flex:1;min-width:0">
        <div class="small" style="color:#ffe680">${o.qty} Tibia Coins</div>
        <div class="tiny dim">${storeEsc(o.seller_name)} · ${typeof marketTimeLeft === "function" ? marketTimeLeft(o) : ""} restante</div>
      </div>
      <button type="button" class="sm primary" data-store-buy="${o.id}">${typeof fmtFull === "function" ? fmtFull(o.price) : o.price} gp</button>
    </div>`).join("") + `</div>`;
  $$("#store-sell-list [data-store-buy]").forEach((b) =>
    b.addEventListener("click", async () => {
      const r = await marketBuyOffer({ token: tok, offer_id: b.dataset.storeBuy, buyer_name: (p && p.name) || "Jogador" });
      if (!r.ok) { toast(r.msg || "Falha", "bad"); return; }
      if (r.data && Number.isFinite(Number(r.data.coinBalance))) storeApplyCoins(r.data.coinBalance);
      toast("Compra concluída", "level");
      renderStoreSell(main);
    }));
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
        <div class="tiny dim">Desbloqueio por <b>conta</b>: vale para todos os personagens. Use no Cyclopedia &gt; Aparência.</div>
      </div>
    </div>
    <div class="store-voucher-row" style="max-width:340px;margin-bottom:8px">
      <input type="text" id="store-cos-busca" maxlength="40" autocomplete="off"
             spellcheck="false" placeholder="Buscar ${label.toLowerCase()}..."
             value="${storeEsc(_storeCosBusca)}" />
    </div>
    <div class="tiny dim mb4" id="store-cos-count"></div>
    <div class="app-grid store-cos-grid" id="store-cos-grid"></div>`;

  const paintOutfits = () => {
    const p = (typeof G !== "undefined" && G && G.p) ? G.p : null;
    const cores = (p && p.outfit && p.outfit.colors) ||
      (typeof DEFAULT_OUTFIT_COLORS !== "undefined" &&
        (DEFAULT_OUTFIT_COLORS[p && p.voc] || DEFAULT_OUTFIT_COLORS.none)) || [78, 68, 58, 76];
    const alvos = $$(".store-cos-grid [data-cos-paint]");
    let i = 0;
    const lote = () => {
      if (!document.body.contains(main)) return;
      let feitos = 0;
      while (i < alvos.length && feitos < 12) {
        const box = alvos[i];
        const cv = (typeof AppearanceRenderer !== "undefined" && AppearanceRenderer.outfit)
          ? AppearanceRenderer.outfit(box.dataset.cosPaint, 0, cores) : null;
        if (!cv) break;
        cv.style.width = "48px"; cv.style.height = "52px";
        cv.style.imageRendering = "pixelated"; cv.style.objectFit = "contain";
        box.innerHTML = "";
        box.appendChild(cv);
        i++; feitos++;
      }
      if (i < alvos.length) requestAnimationFrame(lote);
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
        <div class="app-img" ${kind === "outfit" ? `data-cos-paint="${storeEsc(e.displayId)}"` : ""}>
          ${kind === "mount" ? `<img src="assets/appearance/mount/${storeEsc(e.displayId)}.base.png" alt="${storeEsc(e.nome)}" loading="lazy">`
                             : `<div class="tiny dim app-img-loading">…</div>`}
        </div>
        <div class="tiny">${storeEsc(e.nome)}</div>
        <button class="sm cos-buy" data-cos-kind="${kind}" data-cos-key="${storeEsc(e.key)}"
          ${tem ? "disabled" : ""}>${tem ? "Adquirido" : STORE_COS_PRICE + " TC"}</button>
      </div>`;
    }).join("");
    if (kind === "outfit") paintOutfits();
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
      if (cc) cc.textContent = "🪙 " + (typeof fmtFull === "function" ? fmtFull(accountCoins()) : accountCoins());
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
      if (cc) cc.textContent = "🪙 " + (typeof fmtFull === "function" ? fmtFull(accountCoins()) : accountCoins());
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
        if (cc) cc.textContent = "🪙 " + (typeof fmtFull === "function" ? fmtFull(accountCoins()) : accountCoins());
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

function bootStoreFromQuery() {
  try {
    const q = new URLSearchParams(location.search);
    const st = q.get("store");
    if (!st) return;
    openStoreModal(st === "paid" || st === "pending" || st === "fail" ? "history" : "coins");
  } catch (e) {}
}
