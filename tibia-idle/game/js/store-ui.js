/* store-ui.js — Gamestore: Obter Coins (Mercado Pago), VIP, vender TC (beta). */
"use strict";

let _storeTab = "home";
let _storeCatalog = null;
let _storePoll = null;
let _storePayView = null; /* { order, pack, method } */
let _storeSellQty = "";
let _storeSellPrice = "";
let _storeSellAnon = false;

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
    if (acc && acc.role === "admin") return true;
  } catch (e) {}
  return storeTestServer();
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
  $("#modal-body").innerHTML = `
    <div class="panel-title">
      <img src="assets/ui/coins/tibia-coins.gif" class="coin-gif" alt="" style="width:20px;height:20px">
      <b>STORE</b>
      <span class="tiny dim" style="margin-left:6px">Gamestore</span>
      <span style="flex:1"></span>
      <span class="tiny" style="color:#ffe680">🪙 ${typeof fmtFull === "function" ? fmtFull(accountCoins()) : accountCoins()}</span>
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
    <div class="tiny dim mb4">Escolha a forma de pagamento.</div>
    <div class="row" style="gap:8px;flex-wrap:wrap">
      <button type="button" class="sm primary" id="store-pay-pix">Pix (aprovação na hora) · ${storeBrl(pack.brl)}</button>
      <button type="button" class="sm primary" id="store-pay-card">Cartão de crédito (+10%) · ${storeBrl(cardBrl)}</button>
    </div>`;
  $("#store-back-packs").addEventListener("click", () => { _storePayView = null; renderStoreBuy(main); });
  $("#store-pay-pix").addEventListener("click", () => startStoreCheckout(main, pack, "pix"));
  $("#store-pay-card").addEventListener("click", () => startStoreCheckout(main, pack, "card"));
}

async function startStoreCheckout(main, pack, method) {
  main.innerHTML = `<div class="tiny dim">Abrindo pagamento...</div>`;
  const r = await storeCheckout(sessionToken(), pack.id, method);
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

function bootStoreFromQuery() {
  try {
    const q = new URLSearchParams(location.search);
    const st = q.get("store");
    if (!st) return;
    openStoreModal(st === "paid" || st === "pending" || st === "fail" ? "history" : "coins");
  } catch (e) {}
}
