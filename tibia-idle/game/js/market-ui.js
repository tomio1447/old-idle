/* market-ui.js — Market player-to-player, fiel ao manual do Tibia (4.3.3).
 *
 * Regras implementadas (guia oficial):
 *  - vendedor usa itens do DEPOT; comprado vai pro DEPOT/inbox;
 *  - fee de 2% ao criar oferta (mín 20 gp, máx 1.000.000) pago do BANCO;
 *  - buy offers (oferta de compra) e sell offers (oferta de venda);
 *  - MATCH AUTOMATICO: criar oferta casa com contra-oferta na hora;
 *  - ofertas duram 30 dias (fixo); item/dinheiro voltam ao dono;
 *  - opção ANÔNIMO (não mostra seu nome na oferta);
 *  - aviso em vermelho quando o preço fica 25% acima/abaixo da média;
 *  - banco do market (depósito/saque de gold).
 */
"use strict";

let _mTab = "buy";        // buy | sell | mine | coins | history
let _mQ = "";
let _mCat = "";
let _mTier = "";
let _mSel = null;         // item selecionado p/ vender: {slug, instId?, qty, tier, from}
let _mSellSrc = "depot";  // de onde vende: depot | bag
let _mPrice = "";
let _mPriceTc = false;
let _mAnon = false;
let _mBuyPrice = "";
let _mBuyQty = 1;
let _mBuyAnon = false;
let _mCoinsQty = "";
let _mCoinsPrice = "";
let _mCoinsAnon = false;
let _mMarketT = null;
let _mOffersCache = null;
let _mPendingRefund = {}; // ofertaId -> {slug, inst?, qty} p/ devolver ao cancelar
let _mBank = 0;           // saldo do banco do market

const MARKET_CAT_LABEL = {
  weapon: "Armas", armor: "Armaduras", helmet: "Elmos", legs: "Pernas",
  boots: "Botas", shield: "Escudos", ring: "Aneis", amulet: "Amuletos",
  other: "Outros",
};

/* Fee oficial: 2% (mín 20, máx 1.000.000) */
function marketFee(price) {
  return Math.max(20, Math.min(1000000, Math.round(price * 0.02)));
}

function marketItemCat(slug) {
  const it = (typeof GAMEDATA !== "undefined" && GAMEDATA.items[slug]) || {};
  const s = it.s;
  return MARKET_CAT_LABEL[s] ? s : "other";
}

function marketOnline() {
  // v36: o Market SEMPRE abre — com a API configurada usa o servidor P2P;
  // sem API usa o modo LOCAL (market-local.js, ofertas no localStorage).
  return true;
}

function openMarket() {
  const p = G && G.p;
  if (!p) return;
  renderMarket();
}

/* ---------- itens vendáveis (depot + bag) ---------- */
function marketDepotItems(p) {
  ensureForge(p);
  const out = [];
  const dep = p.depot || [];
  for (const entry of dep) {
    const slug = forgeStoredSlug(p, entry);
    if (!slug) continue;
    // instância? acha no itemInstances
    const inst = (typeof findItemInstance === "function") ? findItemInstance(p, entry) : null;
    out.push({
      slug,
      instId: inst ? inst.id : null,
      qty: 1,
      tier: inst ? itemInstanceTier(inst) : (p.forge && p.forge[slug]) || 0,
      n: itemName(slug),
      from: "depot",
    });
  }
  return out;
}

function marketBagItems(p) {
  ensureItemInstances(p);
  const out = [];
  for (const inst of p.itemInstances || []) {
    if (!inst || inst.loc !== "bag") continue;
    out.push({ slug: inst.slug, instId: inst.id, qty: 1,
               tier: itemInstanceTier(inst), n: itemName(inst.slug), from: "bag" });
  }
  for (const slug in (p.bag || {})) {
    const n = p.bag[slug];
    if (!n || n <= 0 || itemUsesInstances(slug)) continue;
    out.push({ slug, instId: null, qty: n, tier: 0, n: itemName(slug), from: "bag" });
  }
  return out;
}

/* Remove o item vendido do depot/bag e guarda p/ refund. */
function marketRemoveForSale(p, sel, offerId) {
  if (sel.from === "depot") {
    // depot: remove a entrada (instância: loc=null; stackável: remove slug)
    if (sel.instId) {
      const inst = findItemInstance(p, sel.instId);
      if (inst) {
        inst.loc = null;
        const idx = (p.depot || []).indexOf(sel.instId);
        if (idx >= 0) p.depot.splice(idx, 1);
        syncBagCountsFromInstances(p);
        _mPendingRefund[offerId] = { slug: sel.slug, inst, qty: 1, to: "depot" };
      }
    } else {
      const idx = (p.depot || []).indexOf(sel.slug);
      if (idx >= 0) p.depot.splice(idx, 1);
      _mPendingRefund[offerId] = { slug: sel.slug, inst: null, qty: sel.qty || 1, to: "depot" };
    }
  } else if (sel.instId) {
    const inst = findItemInstance(p, sel.instId);
    if (inst) {
      inst.loc = null;
      syncBagCountsFromInstances(p);
      _mPendingRefund[offerId] = { slug: sel.slug, inst, qty: 1, to: "bag" };
    }
  } else {
    removeItem(p, sel.slug, sel.qty || 1);
    _mPendingRefund[offerId] = { slug: sel.slug, inst: null, qty: sel.qty || 1, to: "bag" };
  }
}

/* Devolve o item ao depot/bag (cancelamento/expiração). */
function marketRefundItem(p, offerId) {
  const pend = _mPendingRefund[offerId];
  if (!pend) return false;
  if (pend.inst) {
    if (pend.to === "depot") {
      pend.inst.loc = "depot";
      p.depot = p.depot || [];
      p.depot.push(pend.inst.id);
      syncBagCountsFromInstances(p);
    } else {
      putBagItemInstance(p, pend.inst);
    }
  } else if (pend.qty) {
    if (pend.to === "depot") {
      // devolve para o DEPOT (stackável sem instância)
      p.depot = p.depot || [];
      for (let i = 0; i < pend.qty; i++) p.depot.push(pend.slug);
    } else {
      addItem(p, pend.slug, pend.qty);
    }
  }
  delete _mPendingRefund[offerId];
  return true;
}

/* Recebe item comprado no depot/inbox. */
function marketReceiveItem(p, slug, tier, qty) {
  ensureForge(p);
  if (itemUsesInstances(slug)) {
    ensureItemInstances(p);
    for (let i = 0; i < (qty || 1); i++) {
      const inst = { id: nextItemInstanceId(p), slug, loc: "depot", tier: tier || 0 };
      p.itemInstances.push(inst);
      p.depot = p.depot || [];
      p.depot.push(inst.id);
    }
    syncBagCountsFromInstances(p);
  } else {
    p.depot = p.depot || [];
    for (let i = 0; i < (qty || 1); i++) p.depot.push(slug);
  }
}

function marketTimeLeft(offer) {
  if (!offer.expires_at) return "∞";
  const ms = new Date(offer.expires_at).getTime() - Date.now();
  if (ms <= 0) return "expirada";
  const h = Math.floor(ms / 3600000);
  if (h < 48) return h + "h";
  return Math.floor(h / 24) + "d";
}

/* Aviso de oferta injusta: 25% acima/abaixo da média */
function marketUnfair(o) {
  const st = o.stats;
  if (!st || !st.avg || st.count < 3) return null;
  const pct = (o.price - st.avg) / st.avg;
  if (o.kind === "buy" && pct <= -0.25) return "baixo";
  if (o.kind !== "buy" && pct >= 0.25) return "alto";
  return null;
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
  // v36: no modo LOCAL (sem API) o token não é exigido — o market usa o
  // personagem atual como conta. Com API, o login continua obrigatório.
  const modoLocal = typeof accountApiConfigured === "function" && !accountApiConfigured();
  if (!tok && !modoLocal) {
    $("#modal-body").innerHTML = `
      <div class="panel-title"><b>Market (P2P)</b><span style="flex:1"></span>
        <button class="sm" id="market-close">✕</button></div>
      <div class="panel-body"><div class="tiny" style="color:#ff9a6a">Faça login na
      sua conta para usar o Market.</div></div>`;
    $("#market-close").addEventListener("click", () => modal.classList.remove("show", "wide"));
    modal.classList.add("show", "wide");
    return;
  }

  // carrega o saldo do banco (assíncrono, não bloqueia)
  marketBank(tok).then((r) => { if (r.ok) _mBank = r.bank; });

  $("#modal-body").innerHTML = `
    <div class="panel-title">
      <img src="assets/ui/market/market.png" style="width:20px;height:20px;image-rendering:pixelated">
      <b>Market</b> <span class="tiny dim">player-to-player</span>
      <span style="flex:1"></span>
      <span class="tiny" style="color:#ffe680">🏦 ${fmtFull(_mBank)} gp</span>
      <span class="tiny" style="color:#ffe680;margin-left:6px">🪙 ${fmtFull(accountCoins())}</span>
      <button class="sm" id="market-close">✕</button>
    </div>
    <div class="panel-body">
      <div class="row mb4" style="gap:4px;flex-wrap:wrap">
        <button class="sm ${_mTab === "buy" ? "primary" : ""}" data-mtab="buy">🛒 Ofertas</button>
        <button class="sm ${_mTab === "sell" ? "primary" : ""}" data-mtab="sell">💰 Vender</button>
        <button class="sm ${_mTab === "mine" ? "primary" : ""}" data-mtab="mine">📋 Minhas ofertas</button>
        <button class="sm ${_mTab === "coins" ? "primary" : ""}" data-mtab="coins">🪙 Tibia Coins</button>
        <button class="sm ${_mTab === "history" ? "primary" : ""}" data-mtab="history">🧾 Histórico</button>
        <span style="flex:1"></span>
        <button class="sm" id="m-bank-toggle" title="Depositar/sacar gold do banco">🏦 Banco</button>
      </div>
      <div id="market-body"></div>
    </div>`;

  $("#market-close").addEventListener("click", () => modal.classList.remove("show", "wide"));
  $$("#modal-body [data-mtab]").forEach((b) =>
    b.addEventListener("click", () => { _mTab = b.dataset.mtab; renderMarket(); }));
  $("#m-bank-toggle").addEventListener("click", () => renderMarketBank());

  const body = $("#market-body");
  if (_mTab === "buy") renderMarketBuy(body, p);
  else if (_mTab === "sell") renderMarketSell(body, p);
  else if (_mTab === "mine") renderMarketMine(body, p);
  else if (_mTab === "history") renderMarketHistory(body, p);
  else renderMarketCoins(body, p);

  modal.classList.add("show", "wide");
}

/* ------------------------------------------------------------- COMPRAR */
function renderMarketBuy(body, p) {
  const tok = sessionToken();
  const cats = Object.keys(MARKET_CAT_LABEL);
  body.innerHTML = `
    <div class="row mb4" style="gap:4px;flex-wrap:wrap">
      <input id="m-buy-q" placeholder="buscar item..." value="${_mQ}"
        style="width:140px;padding:3px 6px;background:#14120e;color:#c8c0a8;border:1px solid #16140f">
      <select id="m-buy-cat" style="padding:3px;background:#14120e;color:#c8c0a8;border:1px solid #16140f">
        <option value="">Todas</option>
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
      <button class="sm" id="m-buy-offer" title="Oferecer um preço para comprar">+ Oferecer compra</button>
    </div>
    <div class="tiny dim mb4" style="color:#9ce84a">Ofertas de venda (sell) em cima · Ofertas de compra (buy) embaixo</div>
    <div class="list" id="m-buy-list" style="max-height:430px"></div>`;

  $("#m-buy-q").addEventListener("input", (e) => {
    clearTimeout(_mMarketT);
    _mMarketT = setTimeout(() => { _mQ = e.target.value; renderMarketBuy(body, p); }, 200);
  });
  $("#m-buy-cat").addEventListener("change", (e) => { _mCat = e.target.value; renderMarketBuy(body, p); });
  $("#m-buy-tier").addEventListener("change", (e) => { _mTier = e.target.value; renderMarketBuy(body, p); });
  $("#m-buy-refresh").addEventListener("click", () => { _mOffersCache = null; renderMarketBuy(body, p); });
  $("#m-buy-offer").addEventListener("click", () => renderMarketBuyOffer(body, p));

  const list = $("#m-buy-list");
  list.innerHTML = '<div class="tiny dim">Carregando ofertas...</div>';
  marketListOffers({ kind: "" }).then((r) => {
    if (!r.ok) { list.innerHTML = `<div class="tiny" style="color:#ff9a6a">${r.msg || "Falha"}</div>`; return; }
    _mOffersCache = r.offers;
    let ofertas = r.offers || [];
    const q = _mQ.trim().toLowerCase();
    if (q) ofertas = ofertas.filter((o) => (itemName(o.slug) || "").toLowerCase().indexOf(q) !== -1 || o.slug.indexOf(q) !== -1);
    if (_mCat) ofertas = ofertas.filter((o) => marketItemCat(o.slug) === _mCat);
    if (_mTier) {
      const t = Number(_mTier);
      ofertas = ofertas.filter((o) => t === 0 ? (o.tier || 0) === 0 : (o.tier || 0) >= t);
    }
    const sells = ofertas.filter((o) => o.kind === "item");
    const buys = ofertas.filter((o) => o.kind === "buy");
    if (!sells.length && !buys.length) {
      list.innerHTML = '<div class="tiny dim">Nenhuma oferta ativa — use "+ Oferecer compra" ou venda um item.</div>';
      return;
    }
    const row = (o, isSell) => {
      const tier = o.tier || 0;
      const unfair = marketUnfair(o);
      const cor = unfair ? "color:#ff6a6a" : "";
      const preco = o.price_tc ? "🪙 " + fmtFull(o.price) : fmtFull(o.price) + " gp";
      return `<div class="shop-row" style="align-items:center;${cor}">
        <div style="position:relative">${itemImg(o.slug, 24)}
          ${tier ? `<span class="tier-badge" style="position:absolute;top:-2px;right:-2px;font-size:7px;height:11px;min-width:11px;line-height:10px">T${tier}</span>` : ""}</div>
        <div style="flex:1;min-width:0">
          <div class="small">${itemName(o.slug)} ${tier ? `<span style="color:#dab0ff">T${tier}</span>` : ""}</div>
          <div class="tiny dim">${o.seller_name || "Anônimo"} · ${marketTimeLeft(o)} · ${o.qty}x
            ${unfair ? `<span style="color:#ff6a6a">· ${unfair === "alto" ? "▲ alto" : "▼ baixo"}</span>` : ""}</div>
        </div>
        ${isSell
          ? `<button class="sm primary" data-mbuy="${o.id}" data-price="${o.price}" data-tc="${o.price_tc ? 1 : 0}">${preco}</button>`
          : `<button class="sm" data-maccept="${o.id}" title="Vender para esta oferta">Aceitar ${preco}</button>`}
      </div>`;
    };
    const secao = (titulo, arr, isSell) =>
      `<div class="small mb2" style="color:${isSell ? "#9ce84a" : "#7ec8ff"};font-weight:bold;margin-top:6px">${titulo}</div>` +
      (arr.length ? arr.map((o) => row(o, isSell)).join("") : '<div class="tiny dim">—</div>');
    list.innerHTML = secao("🛒 Ofertas de venda", sells, true) + secao("🛍 Ofertas de compra", buys, false);

    // comprar sell offer
    $$("#m-buy-list [data-mbuy]").forEach((b) =>
      b.addEventListener("click", async () => {
        const id = b.dataset.mbuy;
        const price = Number(b.dataset.price);
        const priceTc = b.dataset.tc === "1";
        if (priceTc && accountCoins() < price) { toast("Tibia Coins insuficientes"); return; }
        if (!priceTc && _mBank < price) { toast("Ouro insuficiente no banco"); return; }
        const r = await marketBuyOffer({ token: tok, offer_id: id, buyer_name: p.name });
        if (!r.ok) { toast(r.msg || "Falha na compra"); return; }
        const d = r.data;
        if (d.item) marketReceiveItem(p, d.item.slug, d.item.tier, d.item.qty);
        // Saldos já foram debitados/creditados atomicamente no servidor.
        if(Number.isFinite(Number(d.bank)))_mBank=Number(d.bank);
        toast(`Comprou <b>${itemName(d.item ? d.item.slug : "")}</b> — foi para o Depot`, "level");
        addLog("sell", `Market: comprou de <b>${d.seller_name}</b> por ${fmtFull(d.total || d.price)}${d.price_tc ? " TC" : " gp"} → Depot`);
        renderMarket();
        renderAll && renderAll();
      }));
    // aceitar buy offer (vender para a oferta)
    $$("#m-buy-list [data-maccept]").forEach((b) =>
      b.addEventListener("click", async () => {
        const id = b.dataset.maccept;
        // precisa ter o item no depot
        const oferta = (buys.find((o) => o.id === Number(id))) || {};
        if (!marketHaveInDepot(p, oferta.slug)) {
          toast("Você não tem esse item no Depot para vender");
          return;
        }
        const r = await marketBuyOffer({ token: tok, offer_id: id, buyer_name: p.name, qty: 1 });
        if (!r.ok) { toast(r.msg || "Falha"); return; }
        // remove do depot; o servidor já creditou o banco autoritativo.
        marketRemoveDepotItem(p, oferta.slug);
        if(Number.isFinite(Number(r.data.bank)))_mBank=Number(r.data.bank);
        toast(`Vendeu <b>${itemName(oferta.slug)}</b> por ${fmtFull(r.data.total || r.data.price)} gp`, "level");
        renderMarket();
        renderAll && renderAll();
      }));
  });
}

function marketHaveInDepot(p, slug) {
  ensureForge(p);
  return (p.depot || []).some((e) => forgeStoredSlug(p, e) === slug);
}
function marketRemoveDepotItem(p, slug) {
  ensureForge(p);
  const idx = (p.depot || []).findIndex((e) => forgeStoredSlug(p, e) === slug);
  if (idx < 0) return false;
  const entry = p.depot[idx];
  p.depot.splice(idx, 1);
  if (typeof entry === "string" === false && (typeof findItemInstance === "function")) {
    const inst = findItemInstance(p, entry);
    if (inst) { inst.loc = null; syncBagCountsFromInstances(p); }
  }
  return true;
}

/* Modal de "Oferecer compra" (buy offer). */
function renderMarketBuyOffer(body, p) {
  const tok = sessionToken();
  body.innerHTML = `
    <div class="small dim mb4">Oferecer um preço para comprar (buy offer)</div>
    <div class="row mb4" style="gap:6px">
      <input id="m-bo-slug" placeholder="nome do item (ex: fire sword)" value="${_mQ}"
        style="flex:1;padding:3px 6px;background:#14120e;color:#c8c0a8;border:1px solid #16140f">
    </div>
    <div class="row mb4" style="gap:6px">
      <label class="small dim">Preço unitário</label>
      <input id="m-bo-price" type="number" min="1" value="${_mBuyPrice}" style="width:110px;padding:3px 6px;background:#14120e;color:#c8c0a8;border:1px solid #16140f">
      <label class="small dim">Qtd</label>
      <input id="m-bo-qty" type="number" min="1" value="${_mBuyQty}" style="width:60px;padding:3px 6px;background:#14120e;color:#c8c0a8;border:1px solid #16140f">
    </div>
    <div class="row mb4" style="gap:6px;align-items:center">
      <label class="toggle"><input type="checkbox" id="m-bo-anon" ${_mBuyAnon ? "checked" : ""}> Anônimo</label>
      <span style="flex:1"></span>
      <span class="tiny dim">Taxa 2% (mín 20, máx 1M)</span>
    </div>
    <div class="tiny dim mb4" id="m-bo-fee"></div>
    <button class="primary full" id="m-bo-go">Criar oferta de compra</button>
    <button class="full mt4" id="m-bo-back">Voltar</button>`;
  const slugEl = $("#m-bo-slug");
  const priceEl = $("#m-bo-price");
  const qtyEl = $("#m-bo-qty");
  const anonEl = $("#m-bo-anon");
  const feeEl = $("#m-bo-fee");
  function atualizaFee() {
    const price = Math.floor(Number(priceEl.value) || 0);
    const qty = Math.max(1, Math.floor(Number(qtyEl.value) || 1));
    if (feeEl) feeEl.innerHTML = price > 0
      ? `Total: <b>${fmtFull(price * qty)}</b> gp · Taxa: <b>${fmtFull(marketFee(price))}</b> gp`
      : "";
  }
  priceEl.addEventListener("input", atualizaFee);
  qtyEl.addEventListener("input", atualizaFee);
  atualizaFee();
  $("#m-bo-go").addEventListener("click", async () => {
    const slugTxt = (slugEl.value || "").trim().toLowerCase().replace(/ /g, "-");
    const price = Math.floor(Number(priceEl.value) || 0);
    const qty = Math.max(1, Math.floor(Number(qtyEl.value) || 1));
    if (!slugTxt || price <= 0) { toast("Informe item e preço"); return; }
    const total = price * qty;
    if (_mBank < total) { toast("Ouro insuficiente no banco"); return; }
    const r = await marketCreateOffer({
      token: tok, kind: "buy", slug: slugTxt, tier: 0, qty, price,
      price_tc: 0, seller_name: _mBuyAnon ? "Anônimo" : p.name,
    });
    if (!r.ok) { toast(r.msg || "Falha"); return; }
    if(Number.isFinite(Number(r.bank)))_mBank=Number(r.bank);
    if (r.matched) {
      toast(`Oferta casada automaticamente! Comprou por ${fmtFull(r.matched.price)} gp`, "level");
      marketReceiveItem(p, slugTxt, 0, r.matched.qty || qty);
    } else {
      toast(`Oferta de compra criada (${fmtFull(total)} gp travados)`, "level");
    }
    _mBuyPrice = ""; _mBuyQty = 1;
    renderMarket();
  });
  $("#m-bo-back").addEventListener("click", () => renderMarket());
}

/* -------------------------------------------------------------- VENDER */
function renderMarketSell(body, p) {
  const tok = sessionToken();
  // itens do DEPOT (regra oficial: vende do depot)
  const itens = marketDepotItems(p);
  const sel = _mSel;
  const selItem = sel ? itens.find((i) => sel.instId ? i.instId === sel.instId : (i.from === sel.from && i.slug === sel.slug)) : null;

  body.innerHTML = `
    <div class="small dim mb4">Venda itens do seu <b>Depot</b> (regra do Market).</div>
    <div class="list mb4" style="max-height:200px" id="m-sell-items">
      ${itens.length ? itens.map((i) => {
        const isSel = selItem && ((sel.instId && i.instId === sel.instId) || (!sel.instId && !i.instId && i.slug === sel.slug));
        return `<div class="shop-row ${isSel ? "selected" : ""}" data-sell-item="${i.slug}" ${i.instId ? `data-sell-inst="${i.instId}"` : ""} data-sell-qty="${i.qty}" data-sell-tier="${i.tier}">
          <div style="position:relative">${itemImg(i.slug, 24)}
            ${i.tier ? `<span class="tier-badge" style="position:absolute;top:-2px;right:-2px;font-size:7px;height:11px;min-width:11px;line-height:10px">T${i.tier}</span>` : ""}</div>
          <div style="flex:1;min-width:0"><div class="small">${i.n}</div>
            <div class="tiny dim">Depot · ${i.instId ? "único" : i.qty + "x"}${i.tier ? " · T" + i.tier : ""}</div></div>
        </div>`;
      }).join("") : '<div class="tiny dim">Depot vazio — guarde itens no Depot (botão 📦) para vender.</div>'}
    </div>
    ${selItem ? `
      <div class="row mb4" style="gap:6px;align-items:center">
        <span class="small">${selItem.n}${selItem.tier ? " · T" + selItem.tier : ""}</span>
      </div>
      <div class="row mb4" style="gap:6px">
        <label class="small dim">Preço unitário</label>
        <input id="m-sell-price" type="number" min="1" value="${_mPrice}" style="width:110px;padding:3px 6px;background:#14120e;color:#c8c0a8;border:1px solid #16140f">
        <label class="toggle" title="Cobrar em Tibia Coins"><input type="checkbox" id="m-sell-tc" ${_mPriceTc ? "checked" : ""}> TC</label>
        <label class="toggle" title="Não mostrar seu nome"><input type="checkbox" id="m-sell-anon" ${_mAnon ? "checked" : ""}> Anônimo</label>
      </div>
      <div class="tiny dim mb4" id="m-sell-fee"></div>
      <button class="primary full" id="m-sell-go">Vender no Market (30 dias)</button>
    ` : '<div class="tiny dim">Escolha um item do Depot acima.</div>'}
    <div class="tiny dim mt8">Oferta dura 30 dias · taxa de 2% (mín 20, máx 1M) paga do banco · ao expirar/cancelar o item volta ao Depot.</div>`;

  $$("#m-sell-items [data-sell-item]").forEach((row) =>
    row.addEventListener("click", () => {
      _mSel = {
        slug: row.dataset.sellItem,
        instId: row.dataset.sellInst || null,
        qty: Number(row.dataset.sellQty || 1),
        tier: Number(row.dataset.sellTier || 0),
        from: "depot",
      };
      _mPrice = "";
      renderMarketSell(body, p);
    }));
  const priceEl = $("#m-sell-price");
  const feeEl = $("#m-sell-fee");
  if (priceEl) priceEl.addEventListener("input", (e) => {
    _mPrice = e.target.value;
    const price = Math.floor(Number(e.target.value) || 0);
    if (feeEl) feeEl.innerHTML = price > 0 ? `Taxa (2%): <b>${fmtFull(marketFee(price))}</b> gp` : "";
  });
  const tcEl = $("#m-sell-tc");
  if (tcEl) tcEl.addEventListener("change", (e) => { _mPriceTc = e.target.checked; });
  const anonEl = $("#m-sell-anon");
  if (anonEl) anonEl.addEventListener("change", (e) => { _mAnon = e.target.checked; });
  const go = $("#m-sell-go");
  if (go) go.addEventListener("click", async () => {
    const price = Math.floor(Number(_mPrice) || 0);
    if (price <= 0) { toast("Informe um preço"); return; }
    const fee = marketFee(price);
    if (_mBank < fee) { toast("Ouro insuficiente no banco para a taxa (2%)"); return; }
    const qty = selItem.instId ? 1 : selItem.qty;
    const r = await marketCreateOffer({
      token: tok, kind: "item", slug: selItem.slug, tier: selItem.tier || 0,
      qty, price, price_tc: _mPriceTc ? 1 : 0,
      seller_name: _mAnon ? "Anônimo" : p.name,
    });
    if (!r.ok) { toast(r.msg || "Falha ao vender"); return; }
    marketRemoveForSale(p, { slug: selItem.slug, instId: selItem.instId, qty, tier: selItem.tier || 0, from: "depot" }, r.offer.id);
    if(Number.isFinite(Number(r.bank)))_mBank=Number(r.bank);
    if (r.matched) {
      toast(`Vendido na hora por ${fmtFull(r.matched.price)} gp! (match automático)`, "level");
    } else {
      toast(`Oferta criada: <b>${selItem.n}</b> por ${fmtFull(price)}${_mPriceTc ? " TC" : " gp"} (30d)`, "level");
    }
    addLog("sell", `Market: ofertou <b>${selItem.n}</b> por ${fmtFull(price)}${_mPriceTc ? " TC" : " gp"}`);
    _mSel = null; _mPrice = "";
    renderMarket();
    renderAll && renderAll();
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
      const nome = o.kind === "coins" ? (o.qty + " Tibia Coins")
        : o.kind === "buy" ? "Comprar " + itemName(o.slug) + (o.tier ? " T" + o.tier : "")
        : itemName(o.slug) + (o.tier ? " T" + o.tier : "");
      return `<div class="shop-row">
        <div style="flex:1;min-width:0">
          <div class="small">${nome}</div>
          <div class="tiny dim">${status} · ${o.price_tc ? "🪙 " + fmtFull(o.price) : fmtFull(o.price) + " gp"} × ${o.qty}</div>
        </div>
        ${o.status === "active" ? `<button class="sm danger" data-mcancel="${o.id}">Cancelar</button>` : ""}
      </div>`;
    }).join("") + `</div>`;
    $$("#market-body [data-mcancel]").forEach((b) =>
      b.addEventListener("click", async () => {
        const id = b.dataset.mcancel;
        const r = await marketCancelOffer(tok, id);
        if (!r.ok) { toast(r.msg || "Falha"); return; }
        marketRefundItem(p, id);
        if(Number.isFinite(Number(r.bank)))_mBank=Number(r.bank);
        toast("Oferta cancelada — devolvido", "level");
        renderMarket();
        renderAll && renderAll();
      }));
  });
}

/* -------------------------------------------------------------- TC P2P */
function renderMarketCoins(body, p) {
  const tok = sessionToken();
  const coins = accountCoins();
  if (!window._mCoinsTab) window._mCoinsTab = "list";
  body.innerHTML = `
    <div class="shop-row" style="align-items:flex-start">
      <img src="assets/ui/coins/tibia-coins.gif" class="coin-gif" alt="" style="width:22px;height:22px">
      <div style="flex:1">
        <div class="small" style="color:#ffe680">${fmtFull(coins)} Tibia Coins na conta</div>
        <div class="tiny dim">Venda TC por gold para outros jogadores, ou compre TC de ofertas ativas.</div>
      </div>
    </div>
    <div class="row mb4" style="gap:4px;flex-wrap:wrap">
      <button class="sm ${window._mCoinsTab === "list" ? "primary" : ""}" data-mcoinstab="list">Comprar TC</button>
      <button class="sm ${window._mCoinsTab === "sell" ? "primary" : ""}" data-mcoinstab="sell">Vender TC</button>
    </div>
    <div id="m-coins-body"></div>`;
  $$("#modal-body [data-mcoinstab]").forEach((b) =>
    b.addEventListener("click", () => { window._mCoinsTab = b.dataset.mcoinstab; renderMarketCoins(body, p); }));

  const cb = $("#m-coins-body");
  if (window._mCoinsTab === "sell") {
    cb.innerHTML = `
      <div class="small dim mb4">Vender Tibia Coins (por gold)</div>
      <div class="row mb4" style="gap:6px">
        <input id="m-c-sell-qty" type="number" min="1" placeholder="Qtd TC" value="${_mCoinsQty}" style="width:90px;padding:3px 6px;background:#14120e;color:#c8c0a8;border:1px solid #16140f">
        <span class="tiny dim">TC por</span>
        <input id="m-c-sell-price" type="number" min="1" placeholder="gp total" value="${_mCoinsPrice}" style="width:110px;padding:3px 6px;background:#14120e;color:#c8c0a8;border:1px solid #16140f">
        <span class="tiny dim">gp</span>
      </div>
      <div class="row mb4" style="gap:6px;align-items:center">
        <label class="toggle"><input type="checkbox" id="m-c-anon" ${_mCoinsAnon ? "checked" : ""}> Anônimo</label>
        <span style="flex:1"></span>
        <span class="tiny dim" id="m-c-fee"></span>
      </div>
      <button class="primary full" id="m-c-sell-go">Ofertar TC (30 dias)</button>
      <div class="tiny dim mt8">Ao ofertar, os TC ficam retidos; se cancelar/expirar, voltam para a conta.</div>`;
    const qEl = $("#m-c-sell-qty"); if (qEl) qEl.addEventListener("input", (e) => { _mCoinsQty = e.target.value; });
    const pEl = $("#m-c-sell-price"); if (pEl) pEl.addEventListener("input", (e) => {
      _mCoinsPrice = e.target.value;
      const price = Math.floor(Number(e.target.value) || 0);
      const f = $("#m-c-fee");
      if (f) f.innerHTML = price > 0 ? `Taxa: ${fmtFull(marketFee(price))} gp` : "";
    });
    const anEl = $("#m-c-anon"); if (anEl) anEl.addEventListener("change", (e) => { _mCoinsAnon = e.target.checked; });
    $("#m-c-sell-go").addEventListener("click", async () => {
      const qty = Math.floor(Number(_mCoinsQty) || 0);
      const price = Math.floor(Number(_mCoinsPrice) || 0);
      if (qty <= 0 || price <= 0) { toast("Informe quantidade e preço"); return; }
      if (qty > coins) { toast("Tibia Coins insuficientes"); return; }
      const fee = marketFee(price);
      if (_mBank < fee) { toast("Ouro insuficiente no banco para a taxa"); return; }
      const r = await marketCreateOffer({
        token: tok, kind: "coins", qty, price, price_tc: 0,
        seller_name: _mCoinsAnon ? "Anônimo" : p.name,
      });
      if (!r.ok) { toast(r.msg || "Falha"); return; }
      if(Number.isFinite(Number(r.bank)))_mBank=Number(r.bank);
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
          if (_mBank < price) { toast("Ouro insuficiente no banco"); return; }
          const r = await marketBuyOffer({ token: tok, offer_id: id, buyer_name: p.name });
          if (!r.ok) { toast(r.msg || "Falha"); return; }
          if(Number.isFinite(Number(r.data.bank)))_mBank=Number(r.data.bank);
          toast(`Comprou ${r.data.coins} TC por ${fmtFull(price)} gp`, "level");
          renderMarketCoins(body, p);
          renderStats(p);
          renderCoinBalance();
        }));
    });
  }
}

/* ----------------------------------------------------------- BANCO */
function renderMarketBank() {
  const tok = sessionToken();
  const p = G.p;
  if (!tok || !p) return;
  $("#market-body").innerHTML = `
    <div class="small dim mb4">Banco do Market — guarde gold para ofertas e taxas</div>
    <div class="shop-row">
      <div style="flex:1"><b>Saldo no banco:</b> <span style="color:#ffe680">${fmtFull(_mBank)} gp</span></div>
      <div class="tiny dim">Mochila: ${fmtFull(p.gold)} gp</div>
    </div>
    <div class="row mb4 mt4" style="gap:6px">
      <input id="m-bank-amount" type="number" min="1" placeholder="valor" style="width:120px;padding:3px 6px;background:#14120e;color:#c8c0a8;border:1px solid #16140f">
      <button class="sm primary" id="m-bank-deposit">Depositar</button>
      <button class="sm" id="m-bank-withdraw">Sacar</button>
    </div>
    <button class="full mt4" id="m-bank-back">Voltar ao Market</button>
    <div class="tiny dim mt8">A taxa de 2% e o valor das ofertas de compra saem do banco. Vendas entram no banco.</div>`;
  const amt = $("#m-bank-amount");
  $("#m-bank-deposit").addEventListener("click", async () => {
    const n = Math.floor(Number(amt.value) || 0);
    if (n <= 0 || n > p.gold) { toast("Valor inválido"); return; }
    const r = await marketDeposit(tok,n,p);
    if (!r.ok) { toast(r.msg || "Falha"); return; }
    _mBank=r.bank;
    toast("Depositado " + fmtFull(n) + " gp", "level");
    renderMarketBank();
  });
  $("#m-bank-withdraw").addEventListener("click", async () => {
    const n = Math.floor(Number(amt.value) || 0);
    if (n <= 0) { toast("Valor inválido"); return; }
    const r = await marketWithdraw(tok,n,p);
    if (!r.ok) { toast(r.msg || "Falha"); return; }
    _mBank=r.bank;
    toast("Sacou " + fmtFull(r.amount) + " gp", "level");
    renderMarketBank();
  });
  $("#m-bank-back").addEventListener("click", () => renderMarket());
}

/* ---------------------------------------------------------- HISTÓRICO */
/* Busca o histórico de trades (últimos 600): com API usa o servidor
 * (GET /api/market/history); no modo local lê do localStorage. */
async function marketHistoryFetcher(limit) {
  if (typeof accountApiConfigured === "function" && accountApiConfigured()) {
    try {
      const r = await _api("GET", "/api/market/history?limit=" + (limit || 100), null, sessionToken());
      return r.data.ok ? { ok: true, history: r.data.history || [] } : { ok: false, msg: r.data.msg };
    } catch (e) { return { ok: false, msg: "Falha ao buscar histórico" }; }
  }
  // modo local: lê do localStorage (market-local.js)
  try {
    const raw = localStorage.getItem("tibia-idle-market-local-v1");
    const d = raw ? JSON.parse(raw) : null;
    return { ok: true, history: (d && d.history) || [] };
  } catch (e) { return { ok: true, history: [] }; }
}

function renderMarketHistory(body, p) {
  body.innerHTML = '<div class="tiny dim">Carregando histórico...</div>';
  marketHistoryFetcher(200).then((r) => {
    if (!r.ok) { body.innerHTML = `<div class="tiny" style="color:#ff9a6a">${r.msg || "Falha"}</div>`; return; }
    const hist = r.history || [];
    if (!hist.length) {
      body.innerHTML = '<div class="tiny dim">Nenhuma transação ainda — compre ou venda no Market.</div>';
      return;
    }
    body.innerHTML = `<div class="small dim mb4">Últimas ${hist.length} transações (guia 4.3.3)</div>
      <div class="list" style="max-height:440px">` + hist.map((h) => {
      const nome = h.kind === "coins"
        ? (h.qty + " Tibia Coins")
        : itemName(h.slug || "?") + (h.tier ? " T" + h.tier : "");
      const preco = h.price_tc ? "🪙 " + fmtFull(h.price) : fmtFull(h.price) + " gp";
      const quando = h.created_at ? new Date(h.created_at).toLocaleString() : "";
      return `<div class="shop-row">
        <div style="flex:1;min-width:0">
          <div class="small">${nome} <span class="dim">× ${h.qty}</span></div>
          <div class="tiny dim">${h.seller_name || "?"} → ${h.buyer_name || "?"} · ${quando}</div>
        </div>
        <span class="tiny" style="color:#ffe680">${preco}</span>
      </div>`;
    }).join("") + `</div>`;
  });
}
