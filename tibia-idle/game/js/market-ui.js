/* market-ui.js — Market player-to-player (P2P), estilo Canary.
 *
 * Exclusivamente entre jogadores: um jogador cria uma oferta de venda
 * (item com tier da forja, ou Tibia Coins) e outros compram. Oferta tem
 * duração (padrão 7 dias, até 30) e expira devolvendo ao vendedor.
 *
 * Requer a API de contas online (account-client.js). Sem ela, o market
 * fica desabilitado com aviso.
 */
"use strict";

let _mTab = "buy";        // buy | sell | mine | coins
let _mQ = "";
let _mCat = "";
let _mTier = "";
let _mSel = null;         // item selecionado para vender: {slug, instId?, qty, tier}
let _mPrice = "";
let _mPriceTc = false;
let _mDays = 7;
let _mCoinsQty = "";
let _mCoinsPrice = "";
let _mCoinsDays = 7;
let _mMarketT = null;
let _mOffersCache = null;
let _mPendingRefund = {}; // ofertaId -> {slug, inst?, qty} p/ devolver ao cancelar

const MARKET_CAT_LABEL = {
  weapon: "Armas", armor: "Armaduras", helmet: "Elmos", legs: "Pernas",
  boots: "Botas", shield: "Escudos", ring: "Aneis", amulet: "Amuletos",
  other: "Outros",
};

function marketItemCat(slug) {
  const it = (typeof GAMEDATA !== "undefined" && GAMEDATA.items[slug]) || {};
  const s = it.s;
  return MARKET_CAT_LABEL[s] ? s : "other";
}

function marketOnline() {
  return typeof accountApiConfigured === "function" && accountApiConfigured();
}

/* Abre o modal do Market P2P. */
function openMarket() {
  const p = G && G.p;
  if (!p) return;
  renderMarket();
}

/* Itens vendáveis da bag (instanciados com tier + stackáveis). */
function marketBagItems(p) {
  ensureItemInstances(p);
  const out = [];
  // instanciados (equipáveis): cada um com seu tier
  for (const inst of p.itemInstances || []) {
    if (!inst || inst.loc !== "bag") continue;
    out.push({
      slug: inst.slug,
      instId: inst.id,
      qty: 1,
      tier: itemInstanceTier(inst),
      n: itemName(inst.slug),
    });
  }
  // stackáveis (sem instância)
  for (const slug in (p.bag || {})) {
    const n = p.bag[slug];
    if (!n || n <= 0 || itemUsesInstances(slug)) continue;
    out.push({ slug, instId: null, qty: n, tier: 0, n: itemName(slug) });
  }
  return out;
}

/* Remove o item vendido da bag e guarda p/ refund. */
function marketRemoveForSale(p, sel, offerId) {
  if (sel.instId) {
    const inst = findItemInstance(p, sel.instId);
    if (inst) {
      inst.loc = null;
      syncBagCountsFromInstances(p);
      _mPendingRefund[offerId] = { slug: sel.slug, inst, qty: 1 };
    }
  } else {
    removeItem(p, sel.slug, sel.qty || 1);
    _mPendingRefund[offerId] = { slug: sel.slug, inst: null, qty: sel.qty || 1 };
  }
}

/* Devolve o item à bag (cancelamento/expiração). */
function marketRefundItem(p, offerId) {
  const pend = _mPendingRefund[offerId];
  if (!pend) return false;
  if (pend.inst) {
    putBagItemInstance(p, pend.inst);
  } else if (pend.qty) {
    addItem(p, pend.slug, pend.qty);
  }
  delete _mPendingRefund[offerId];
  return true;
}

/* Tempo restante de uma oferta (formato legível). */
function marketTimeLeft(offer) {
  if (!offer.expires_at) return "∞";
  const ms = new Date(offer.expires_at).getTime() - Date.now();
  if (ms <= 0) return "expirada";
  const h = Math.floor(ms / 3600000);
  if (h < 48) return h + "h";
  return Math.floor(h / 24) + "d";
}

/* ---------------------------------------------------------------- render */
function renderMarket() {
  const p = G.p;
  const modal = $("#modal");
  if (!modal) return;

  if (!marketOnline()) {
    $("#modal-body").innerHTML = `
      <div class="panel-title"><b>Market (P2P)</b><span style="flex:1"></span>
        <button class="sm" id="market-close">✕</button></div>
      <div class="panel-body">
        <div class="tiny" style="color:#ff9a6a">O Market player-to-player precisa do
        servidor de contas online (API). Configure <b>tibia-idle-api</b> no
        localStorage e recarregue a página.</div>
      </div>`;
    $("#market-close").addEventListener("click", () => modal.classList.remove("show", "wide"));
    modal.classList.add("show", "wide");
    return;
  }

  const tok = sessionToken();
  if (!tok) {
    $("#modal-body").innerHTML = `
      <div class="panel-title"><b>Market (P2P)</b><span style="flex:1"></span>
        <button class="sm" id="market-close">✕</button></div>
      <div class="panel-body"><div class="tiny" style="color:#ff9a6a">Faça login na
      sua conta para usar o Market.</div></div>`;
    $("#market-close").addEventListener("click", () => modal.classList.remove("show", "wide"));
    modal.classList.add("show", "wide");
    return;
  }

  $("#modal-body").innerHTML = `
    <div class="panel-title">
      <img src="assets/ui/market/market.png" style="width:20px;height:20px;image-rendering:pixelated">
      <b>Market</b> <span class="tiny dim">player-to-player</span>
      <span style="flex:1"></span>
      <span class="tiny" style="color:#ffe680">${fmtFull(p.gold)} gp</span>
      <span class="tiny" style="color:#ffe680;margin-left:6px">🪙 ${fmtFull(accountCoins())}</span>
      <button class="sm" id="market-close">✕</button>
    </div>
    <div class="panel-body">
      <div class="row mb4" style="gap:4px;flex-wrap:wrap">
        <button class="sm ${_mTab === "buy" ? "primary" : ""}" data-mtab="buy">🛒 Comprar</button>
        <button class="sm ${_mTab === "sell" ? "primary" : ""}" data-mtab="sell">💰 Vender</button>
        <button class="sm ${_mTab === "mine" ? "primary" : ""}" data-mtab="mine">📋 Minhas ofertas</button>
        <button class="sm ${_mTab === "coins" ? "primary" : ""}" data-mtab="coins">🪙 Tibia Coins</button>
      </div>
      <div id="market-body"></div>
    </div>`;

  $("#market-close").addEventListener("click", () => modal.classList.remove("show", "wide"));
  $$("#modal-body [data-mtab]").forEach((b) =>
    b.addEventListener("click", () => { _mTab = b.dataset.mtab; renderMarket(); }));

  const body = $("#market-body");
  if (_mTab === "buy") renderMarketBuy(body, p);
  else if (_mTab === "sell") renderMarketSell(body, p);
  else if (_mTab === "mine") renderMarketMine(body, p);
  else renderMarketCoins(body, p);

  modal.classList.add("show", "wide");
}

/* ------------------------------------------------------------- COMPRAR */
function renderMarketBuy(body, p) {
  const tok = sessionToken();
  // filtros
  const cats = Object.keys(MARKET_CAT_LABEL);
  body.innerHTML = `
    <div class="row mb4" style="gap:4px;flex-wrap:wrap">
      <input id="m-buy-q" placeholder="buscar item..." value="${_mQ}"
        style="width:150px;padding:3px 6px;background:#14120e;color:#c8c0a8;border:1px solid #16140f">
      <select id="m-buy-cat" style="padding:3px;background:#14120e;color:#c8c0a8;border:1px solid #16140f">
        <option value="">Todas categorias</option>
        ${cats.map((c) => `<option value="${c}" ${_mCat === c ? "selected" : ""}>${MARKET_CAT_LABEL[c]}</option>`).join("")}
      </select>
      <select id="m-buy-tier" style="padding:3px;background:#14120e;color:#c8c0a8;border:1px solid #16140f">
        <option value="">Todos tiers</option>
        <option value="0" ${_mTier === "0" ? "selected" : ""}>Sem tier</option>
        <option value="1" ${_mTier === "1" ? "selected" : ""}>T1+</option>
        <option value="5" ${_mTier === "5" ? "selected" : ""}>T5+</option>
      </select>
      <button class="sm" id="m-buy-refresh">⟳</button>
      <span style="flex:1"></span>
      <span class="tiny dim" id="m-buy-count"></span>
    </div>
    <div class="list" id="m-buy-list" style="max-height:430px"></div>`;

  $("#m-buy-q").addEventListener("input", (e) => {
    clearTimeout(_mMarketT);
    _mMarketT = setTimeout(() => { _mQ = e.target.value; renderMarketBuy(body, p); }, 200);
  });
  $("#m-buy-cat").addEventListener("change", (e) => { _mCat = e.target.value; renderMarketBuy(body, p); });
  $("#m-buy-tier").addEventListener("change", (e) => { _mTier = e.target.value; renderMarketBuy(body, p); });
  $("#m-buy-refresh").addEventListener("click", () => { _mOffersCache = null; renderMarketBuy(body, p); });

  const list = $("#m-buy-list");
  list.innerHTML = '<div class="tiny dim">Carregando ofertas...</div>';
  marketListOffers({ kind: "item" }).then((r) => {
    if (!r.ok) { list.innerHTML = `<div class="tiny" style="color:#ff9a6a">${r.msg || "Falha"}</div>`; return; }
    _mOffersCache = r.offers;
    let ofertas = r.offers;
    // filtra por busca/categoria/tier
    const q = _mQ.trim().toLowerCase();
    if (q) ofertas = ofertas.filter((o) => (itemName(o.slug) || "").toLowerCase().indexOf(q) !== -1 || o.slug.indexOf(q) !== -1);
    if (_mCat) ofertas = ofertas.filter((o) => marketItemCat(o.slug) === _mCat);
    if (_mTier) {
      const t = Number(_mTier);
      ofertas = ofertas.filter((o) => t === 0 ? (o.tier || 0) === 0 : (o.tier || 0) >= t);
    }
    const cnt = $("#m-buy-count");
    if (cnt) cnt.textContent = ofertas.length + " ofertas";
    if (!ofertas.length) { list.innerHTML = '<div class="tiny dim">Nenhuma oferta ativa — seja o primeiro a vender!</div>'; return; }
    list.innerHTML = ofertas.map((o) => {
      const it = GAMEDATA.items[o.slug];
      const tier = o.tier || 0;
      const tierCls = tier ? forgeTierClassForValue(tier) : "";
      return `<div class="shop-row" style="align-items:center">
        <div class="mob-img" style="position:relative">
          ${itemImg(o.slug, 26)}
          ${tier ? `<span class="tier-badge ${tierCls}">T${tier}</span>` : ""}
        </div>
        <div style="flex:1;min-width:0">
          <div class="small">${itemName(o.slug)} ${tier ? `<span style="color:#dab0ff">T${tier}</span>` : ""}</div>
          <div class="tiny dim">${o.seller_name || "?"} · ${marketTimeLeft(o)} restante</div>
        </div>
        <button class="sm primary" data-mbuy="${o.id}" data-price="${o.price}" data-tc="${o.price_tc ? 1 : 0}">
          ${o.price_tc ? "🪙 " + fmtFull(o.price) : fmtFull(o.price) + " gp"}</button>
      </div>`;
    }).join("");
    $$("#m-buy-list [data-mbuy]").forEach((b) =>
      b.addEventListener("click", async () => {
        const id = b.dataset.mbuy;
        const price = Number(b.dataset.price);
        const priceTc = b.dataset.tc === "1";
        if (priceTc && accountCoins() < price) { toast("Tibia Coins insuficientes"); return; }
        if (!priceTc && p.gold < price) { toast("Ouro insuficiente"); return; }
        const r = await marketBuyOffer({ token: tok, offer_id: id, buyer_name: p.name });
        if (!r.ok) { toast(r.msg || "Falha na compra"); return; }
        const d = r.data;
        if (d.item) {
          // adiciona o item à bag (com tier)
          if (itemUsesInstances(d.item.slug)) {
            ensureItemInstances(p);
            p.itemInstances.push({
              id: nextItemInstanceId(p), slug: d.item.slug, loc: "bag",
              tier: d.item.tier || 0,
            });
            syncBagCountsFromInstances(p);
          } else {
            addItem(p, d.item.slug, d.item.qty || 1);
          }
        }
        if (d.coins) accountAddCoins(tok, d.coins);
        if (!d.price_tc) p.gold -= d.price;
        else accountSpendCoins(d.price);
        toast(`Comprou <b>${itemName(d.item ? d.item.slug : "")}</b> de ${d.seller_name}`, "level");
        addLog("sell", `Market: comprou de <b>${d.seller_name}</b> por ${fmtFull(d.price)}${d.price_tc ? " TC" : " gp"}`);
        renderMarket();
        renderInventory(p);
        renderStats(p);
      }));
  });
}

/* -------------------------------------------------------------- VENDER */
function renderMarketSell(body, p) {
  const tok = sessionToken();
  const itens = marketBagItems(p);
  // opções: itens da bag + aba TC é separada
  const sel = _mSel;
  const selItem = sel ? itens.find((i) => sel.instId ? i.instId === sel.instId : i.slug === sel.slug && i.instId === null) : null;

  body.innerHTML = `
    <div class="small dim mb4">Selecione um item da mochila para vender</div>
    <div class="list mb4" style="max-height:180px" id="m-sell-items">
      ${itens.length ? itens.map((i) => {
        const isSel = selItem && ((sel.instId && i.instId === sel.instId) || (!sel.instId && !i.instId && i.slug === sel.slug));
        return `<div class="shop-row ${isSel ? "selected" : ""}" data-sell-item="${i.slug}" ${i.instId ? `data-sell-inst="${i.instId}"` : ""} data-sell-qty="${i.qty}" data-sell-tier="${i.tier}">
          <div style="position:relative">${itemImg(i.slug, 24)}
            ${i.tier ? `<span class="tier-badge" style="position:absolute;top:-2px;right:-2px;font-size:7px;height:11px;min-width:11px;line-height:10px">T${i.tier}</span>` : ""}</div>
          <div style="flex:1;min-width:0"><div class="small">${i.n}</div>
            <div class="tiny dim">${i.instId ? "único" : i.qty + "x"}${i.tier ? " · T" + i.tier : ""}</div></div>
        </div>`;
      }).join("") : '<div class="tiny dim">Mochila vazia</div>'}
    </div>
    ${selItem ? `
      <div class="row mb4" style="gap:6px;align-items:center">
        <span class="small">${selItem.n}${selItem.tier ? " · T" + selItem.tier : ""}</span>
      </div>
      <div class="row mb4" style="gap:6px">
        <label class="small dim">Preço</label>
        <input id="m-sell-price" type="number" min="1" value="${_mPrice}" style="width:110px;padding:3px 6px;background:#14120e;color:#c8c0a8;border:1px solid #16140f">
        <label class="toggle" title="Cobrar em Tibia Coins"><input type="checkbox" id="m-sell-tc" ${_mPriceTc ? "checked" : ""}> TC</label>
      </div>
      <div class="row mb4" style="gap:6px">
        <label class="small dim">Duração</label>
        ${[1, 3, 7, 14, 30].map((d) =>
          `<button class="sm ${_mDays === d ? "primary" : ""}" data-mdays="${d}">${d}d</button>`).join("")}
      </div>
      <button class="primary full" id="m-sell-go">Vender no Market</button>
    ` : '<div class="tiny dim">Escolha um item acima.</div>'}
    <div class="tiny dim mt8">A oferta dura até 30 dias; ao expirar ou cancelar, o item volta para a mochila.</div>`;

  // seleção de item
  $$("#m-sell-items [data-sell-item]").forEach((row) =>
    row.addEventListener("click", () => {
      _mSel = {
        slug: row.dataset.sellItem,
        instId: row.dataset.sellInst || null,
        qty: Number(row.dataset.sellQty || 1),
        tier: Number(row.dataset.sellTier || 0),
      };
      _mPrice = "";
      renderMarketSell(body, p);
    }));
  // duração
  $$("#m-sell-go, [data-mdays]").forEach((b) => {});
  $$("#modal-body [data-mdays]").forEach((b) =>
    b.addEventListener("click", () => { _mDays = Number(b.dataset.mdays); renderMarketSell(body, p); }));
  const priceEl = $("#m-sell-price");
  if (priceEl) priceEl.addEventListener("input", (e) => { _mPrice = e.target.value; });
  const tcEl = $("#m-sell-tc");
  if (tcEl) tcEl.addEventListener("change", (e) => { _mPriceTc = e.target.checked; });
  const go = $("#m-sell-go");
  if (go) go.addEventListener("click", async () => {
    const price = Math.floor(Number(_mPrice) || 0);
    if (price <= 0) { toast("Informe um preço"); return; }
    const qty = selItem.instId ? 1 : Math.min(selItem.qty, Number(prompt("Quantidade (1-" + selItem.qty + "):", "1")) || 1);
    const r = await marketCreateOffer({
      token: tok,
      kind: "item",
      slug: selItem.slug,
      tier: selItem.tier || 0,
      qty,
      price,
      price_tc: _mPriceTc ? 1 : 0,
      days: _mDays,
      seller_name: p.name,
    });
    if (!r.ok) { toast(r.msg || "Falha ao vender"); return; }
    // remove da bag e guarda refund
    _mSel = { slug: selItem.slug, instId: selItem.instId, qty, tier: selItem.tier || 0 };
    marketRemoveForSale(p, _mSel, r.offer.id);
    toast(`Oferta criada: <b>${selItem.n}</b> por ${fmtFull(price)}${_mPriceTc ? " TC" : " gp"}`, "level");
    addLog("sell", `Market: ofertou <b>${selItem.n}</b> por ${fmtFull(price)}${_mPriceTc ? " TC" : " gp"} (${_mDays}d)`);
    _mSel = null; _mPrice = "";
    renderMarket();
    renderInventory(p);
  });
}

/* -------------------------------------------------------- MINHAS OFERTAS */
function renderMarketMine(body, p) {
  const tok = sessionToken();
  body.innerHTML = '<div class="tiny dim">Carregando...</div>';
  marketMineOffers(tok).then((r) => {
    if (!r.ok) { body.innerHTML = `<div class="tiny" style="color:#ff9a6a">${r.msg || "Falha"}</div>`; return; }
    const ofertas = r.offers || [];
    if (!ofertas.length) { body.innerHTML = '<div class="tiny dim">Você não tem ofertas.</div>'; return; }
    body.innerHTML = `<div class="list" style="max-height:440px">` + ofertas.map((o) => {
      const status = o.status === "active" ? `<span style="color:#9ce84a">ativa · ${marketTimeLeft(o)}</span>`
        : o.status === "sold" ? `<span style="color:#ffe680">vendida</span>`
        : o.status === "cancelled" ? `<span style="color:#ff9a6a">cancelada</span>`
        : `<span style="color:#ff9a6a">expirada</span>`;
      const nome = o.kind === "coins" ? (o.qty + " Tibia Coins") : itemName(o.slug) + (o.tier ? " T" + o.tier : "");
      return `<div class="shop-row">
        <div style="flex:1;min-width:0">
          <div class="small">${nome}</div>
          <div class="tiny dim">${status} · ${o.price_tc ? "🪙 " + fmtFull(o.price) : fmtFull(o.price) + " gp"}</div>
        </div>
        ${o.status === "active" ? `<button class="sm danger" data-mcancel="${o.id}">Cancelar</button>` : ""}
      </div>`;
    }).join("") + `</div>`;
    $$("#market-body [data-mcancel]").forEach((b) =>
      b.addEventListener("click", async () => {
        const id = b.dataset.mcancel;
        const r = await marketCancelOffer(tok, id);
        if (!r.ok) { toast(r.msg || "Falha"); return; }
        marketRefundItem(p, id);   // devolve o item (se era item)
        if (r.refundCoins) accountAddCoins(tok, r.refundCoins);
        toast("Oferta cancelada — item devolvido", "level");
        renderMarket();
        renderInventory(p);
      }));
  });
}

/* -------------------------------------------------------------- TC P2P */
function renderMarketCoins(body, p) {
  const tok = sessionToken();
  const coins = accountCoins();
  body.innerHTML = `
    <div class="shop-row" style="align-items:flex-start">
      <img src="assets/ui/coins/tibia-coins.gif" class="coin-gif" alt="" style="width:22px;height:22px">
      <div style="flex:1">
        <div class="small" style="color:#ffe680">${fmtFull(coins)} Tibia Coins na conta</div>
        <div class="tiny dim">Venda TC por ouro para outros jogadores, ou compre TC de ofertas ativas.</div>
      </div>
    </div>
    <div class="row mb4" style="gap:4px;flex-wrap:wrap">
      <button class="sm ${_mCoinsTab === "list" ? "primary" : ""}" data-mcoinstab="list">Comprar TC</button>
      <button class="sm ${_mCoinsTab === "sell" ? "primary" : ""}" data-mcoinstab="sell">Vender TC</button>
    </div>
    <div id="m-coins-body"></div>`;
  if (!window._mCoinsTab) window._mCoinsTab = "list";
  $$("#modal-body [data-mcoinstab]").forEach((b) =>
    b.addEventListener("click", () => { window._mCoinsTab = b.dataset.mcoinstab; renderMarketCoins(body, p); }));

  const cb = $("#m-coins-body");
  if (window._mCoinsTab === "sell") {
    cb.innerHTML = `
      <div class="small dim mb4">Vender Tibia Coins (por ouro)</div>
      <div class="row mb4" style="gap:6px">
        <input id="m-c-sell-qty" type="number" min="1" placeholder="Qtd TC" value="${_mCoinsQty}" style="width:90px;padding:3px 6px;background:#14120e;color:#c8c0a8;border:1px solid #16140f">
        <span class="tiny dim">TC por</span>
        <input id="m-c-sell-price" type="number" min="1" placeholder="gp total" value="${_mCoinsPrice}" style="width:110px;padding:3px 6px;background:#14120e;color:#c8c0a8;border:1px solid #16140f">
        <span class="tiny dim">gp</span>
      </div>
      <div class="row mb4" style="gap:6px">
        <label class="small dim">Duração</label>
        ${[1, 3, 7, 14].map((d) =>
          `<button class="sm ${_mCoinsDays === d ? "primary" : ""}" data-mcoinsdays="${d}">${d}d</button>`).join("")}
      </div>
      <button class="primary full" id="m-c-sell-go">Ofertar TC</button>
      <div class="tiny dim mt8">Ao ofertar, os TC ficam retidos na oferta; se cancelar/expirar, voltam para a conta.</div>`;
    $$("#modal-body [data-mcoinsdays]").forEach((b) =>
      b.addEventListener("click", () => { _mCoinsDays = Number(b.dataset.mcoinsdays); renderMarketCoins(body, p); }));
    const qEl = $("#m-c-sell-qty"); if (qEl) qEl.addEventListener("input", (e) => { _mCoinsQty = e.target.value; });
    const pEl = $("#m-c-sell-price"); if (pEl) pEl.addEventListener("input", (e) => { _mCoinsPrice = e.target.value; });
    $("#m-c-sell-go").addEventListener("click", async () => {
      const qty = Math.floor(Number(_mCoinsQty) || 0);
      const price = Math.floor(Number(_mCoinsPrice) || 0);
      if (qty <= 0 || price <= 0) { toast("Informe quantidade e preço"); return; }
      if (qty > coins) { toast("Tibia Coins insuficientes"); return; }
      const r = await marketCreateOffer({
        token: tok, kind: "coins", qty, price, price_tc: 0,
        days: _mCoinsDays, seller_name: p.name,
      });
      if (!r.ok) { toast(r.msg || "Falha"); return; }
      accountSpendCoins(qty);   // trava os TC localmente (servidor também)
      toast(`Oferta criada: ${qty} TC por ${fmtFull(price)} gp`, "level");
      _mCoinsQty = ""; _mCoinsPrice = "";
      renderMarketCoins(body, p);
      renderCoinBalance();
    });
  } else {
    cb.innerHTML = '<div class="tiny dim">Carregando ofertas de TC...</div>';
    marketListOffers({ kind: "coins" }).then((r) => {
      if (!r.ok) { cb.innerHTML = `<div class="tiny" style="color:#ff9a6a">${r.msg || "Falha"}</div>`; return; }
      const ofertas = r.offers || [];
      if (!ofertas.length) { cb.innerHTML = '<div class="tiny dim">Nenhuma oferta de TC no momento.</div>'; return; }
      cb.innerHTML = `<div class="list" style="max-height:300px">` + ofertas.map((o) => `
        <div class="shop-row">
          <div style="flex:1;min-width:0">
            <div class="small" style="color:#ffe680">${o.qty} Tibia Coins</div>
            <div class="tiny dim">${o.seller_name} · ${marketTimeLeft(o)} restante</div>
          </div>
          <button class="sm primary" data-mcoinsbuy="${o.id}" data-price="${o.price}">${fmtFull(o.price)} gp</button>
        </div>`).join("") + `</div>`;
      $$("#market-body [data-mcoinsbuy]").forEach((b) =>
        b.addEventListener("click", async () => {
          const id = b.dataset.mcoinsbuy;
          const price = Number(b.dataset.price);
          if (p.gold < price) { toast("Ouro insuficiente"); return; }
          const r = await marketBuyOffer({ token: tok, offer_id: id, buyer_name: p.name });
          if (!r.ok) { toast(r.msg || "Falha"); return; }
          p.gold -= price;
          if (r.data.coins) accountAddCoins(tok, r.data.coins);
          toast(`Comprou ${r.data.coins} TC por ${fmtFull(price)} gp`, "level");
          renderMarketCoins(body, p);
          renderStats(p);
          renderCoinBalance();
        }));
    });
  }
}
