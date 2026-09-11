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

let _mTab = "browse";     // browse | sell | mine | coins | history
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
let _mBank = 0;           // cache do accountGold() no market (compartilhado)
let _mBrowseCat = "all";  // categoria selecionada no browser
let _mBrowseItem = null;  // slug do item selecionado
let _mBrowseView = "sell"; // sell | buy ofertas do item selecionado
let _mBrowseOffers = [];  // ofertas do item selecionado
let _mBrowseLoading = false;
let _mBrowseLvl = "";     // nível máximo do filtro (vazio = todos)
let _mBrowseVoc = "";     // vocação do filtro (vazio = todas)
let _mBusy = false;

function marketSetBusy(btn, busy) {
  _mBusy = busy;
  if (btn) {
    if (busy && !btn.dataset.origText) btn.dataset.origText = btn.textContent;
    btn.disabled = busy;
    btn.textContent = busy ? "Processando..." : (btn.dataset.origText || btn.textContent);
  }
}

function marketWithLock(btn, fn) {
  if (_mBusy) return;
  marketSetBusy(btn, true);
  Promise.resolve().then(fn).finally(() => marketSetBusy(btn, false));
}

function marketRefreshHeader() {
  _mBank = accountGold();
  const v = typeof ASSET_VERSION !== "undefined" ? ASSET_VERSION : "1";
  const goldEl = $("#m-header-gold");
  const coinsEl = $("#m-header-coins");
  if (goldEl) goldEl.innerHTML = `<img src="assets/item/gold-coin.png?v=${v}" style="width:16px;height:16px;image-rendering:pixelated;vertical-align:middle;margin-right:3px" alt="">${fmtFull(accountGold())}`;
  if (coinsEl) coinsEl.innerHTML = `<img src="assets/ui/coins/tibia-coins.gif?v=${v}" style="width:16px;height:16px;image-rendering:pixelated;vertical-align:middle;margin-right:3px" alt="">${fmtFull(accountCoins())}`;
}

/* Categorias OTC/Canary MarketSystem (MarketCategory.as) */
const MARKET_CAT_LABEL = {
  all: "Todos",
  armors: "Armors",
  amulets: "Amulets",
  boots: "Boots",
  containers: "Containers",
  decoration: "Decoration",
  helmets: "Helmets / Hats",
  legs: "Legs",
  others: "Others",
  rings: "Rings",
  shields: "Shields",
  axes: "Axes",
  clubs: "Clubs",
  distance: "Distance Weapons",
  swords: "Swords",
  wands: "Wands / Rods",
  premium: "Premium Scrolls",
  "tibia-coins": "Tibia Coins",
  imbuements: "Imbuements"
};
const MARKET_CAT_ORDER = Object.keys(MARKET_CAT_LABEL);
const MARKET_BANNED_CATS = new Set(["potions", "runes", "ammunition", "weapons", "valuables", "tools", "food", "decoration"]);

function marketCatLabelHTML(c) {
  if (c === "tibia-coins") {
    const v = typeof ASSET_VERSION !== "undefined" ? ASSET_VERSION : "1";
    return `<img src="assets/ui/coins/tibia-coins.gif?v=${v}" style="width:16px;height:16px;image-rendering:pixelated;vertical-align:middle;margin-right:4px" alt="">Tibia Coins`;
  }
  return MARKET_CAT_LABEL[c] || c;
}

/* Fee oficial: 2% (mín 20, máx 1.000.000) */
function marketFee(price) {
  return Math.max(20, Math.min(1000000, Math.round(price * 0.02)));
}

/* Determina categoria Canary/OTC a partir de GAMEDATA / MARKETDATA */
function marketItemCat(slug) {
  const gd = (typeof GAMEDATA !== "undefined" && GAMEDATA.items[slug]) || {};
  const md = (typeof MARKETDATA !== "undefined" && MARKETDATA.items[slug]) || {};
  const t = gd.t || md.t || "";
  const s = gd.s || md.s || "";

  if (t === "armor" || t === "body") {
    if (s === "helmet") return "helmets";
    if (s === "legs") return "legs";
    if (s === "boots") return "boots";
    return "armors";
  }
  if (t === "shield" || s === "shield") return "shields";
  if (t === "accessory") {
    if (s === "ring") return "rings";
    return "amulets";
  }
  if (t === "sword") return "swords";
  if (t === "club") return "clubs";
  if (t === "axe") return "axes";
  if (t === "distance") return "distance";
  if (t === "wand" || t === "magic") return "wands";
  if (t === "ammo" || s === "ammo") return "ammunition";
  if (t === "container" || s === "backpack") return "containers";
  if (t === "imbuement" || s === "imbuement") return "imbuements";
  if (t === "potion" || s === "potion") return "potions";
  if (t === "rune") return "runes";
  if (t === "food") return "food";
  if (t === "tool") return "tools";
  if (t === "decoration") return "decoration";
  if (t === "premium") return "premium";
  if (t === "weapon" && s === "weapon") return "weapons";
  if (t === "ammo" || s === "ammo") return "ammunition";
  if (t === "loot" || t === "valuable") return "valuables";
  return "others";
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

  // O gold do market passa a ser o account.gold compartilhado (sem banco separado)
  _mBank = accountGold();
  const v = typeof ASSET_VERSION !== "undefined" ? ASSET_VERSION : "1";

  $("#modal-body").innerHTML = `
    <div class="panel-title">
      <img src="assets/ui/market/market.png" style="width:20px;height:20px;image-rendering:pixelated">
      <b>Market</b> <span class="tiny dim">player-to-player</span>
      <span style="flex:1"></span>
      <span id="m-header-gold" class="tiny" style="color:#9ce84a;display:inline-flex;align-items:center;gap:3px"><img src="assets/item/gold-coin.png?v=${v}" style="width:16px;height:16px;image-rendering:pixelated" alt="">${fmtFull(accountGold())}</span>
      <span id="m-header-coins" class="tiny" style="color:#ffe680;margin-left:6px;display:inline-flex;align-items:center;gap:3px"><img src="assets/ui/coins/tibia-coins.gif?v=${v}" style="width:16px;height:16px;image-rendering:pixelated" alt="">${fmtFull(accountCoins())}</span>
      <button class="sm" id="market-close">✕</button>
    </div>
    <div class="panel-body">
      <div class="row mb4" style="gap:4px;flex-wrap:wrap">
        <button class="sm ${_mTab === "browse" ? "primary" : ""}" data-mtab="browse">�️ Navegar</button>
        <button class="sm ${_mTab === "sell" ? "primary" : ""}" data-mtab="sell">💰 Vender</button>
        <button class="sm ${_mTab === "mine" ? "primary" : ""}" data-mtab="mine">📋 Minhas ofertas</button>
        <button class="sm ${_mTab === "coins" ? "primary" : ""}" data-mtab="coins">🪙 Tibia Coins</button>
        <button class="sm ${_mTab === "history" ? "primary" : ""}" data-mtab="history">🧾 Histórico</button>
      </div>
      <div id="market-body" style="height:520px;overflow:auto"></div>
    </div>`;

  $("#market-close").addEventListener("click", () => modal.classList.remove("show", "wide"));
  $$("#modal-body [data-mtab]").forEach((b) =>
    b.addEventListener("click", () => { _mTab = b.dataset.mtab; renderMarket(); }));

  const body = $("#market-body");
  if (_mTab === "browse") renderMarketBrowse(body, p);
  else if (_mTab === "sell") renderMarketSell(body, p);
  else if (_mTab === "mine") renderMarketMine(body, p);
  else if (_mTab === "history") renderMarketHistory(body, p);
  else renderMarketCoins(body, p);

  modal.classList.add("show", "wide");
}

/* ---------------------------------------------------------- Filtros do browse */
function marketFilteredItems(catalog) {
  const q = _mQ.trim().toLowerCase();
  return catalog.filter((it) => {
    if (_mBrowseCat !== "all" && it.category !== _mBrowseCat) return false;
    if (q && it.name.toLowerCase().indexOf(q) === -1 && it.slug.indexOf(q) === -1) return false;
    if (_mTier) {
      const t = Number(_mTier);
      if (t === 0 ? (it.tier || 0) !== 0 : (it.tier || 0) < t) return false;
    }
    if (_mBrowseVoc) {
      const voc = _mBrowseVoc.toLowerCase();
      if (voc === "none") {
        if (it.vocs && it.vocs.length) return false;
      } else {
        if (!it.vocs || !it.vocs.some((v) => v.toLowerCase().indexOf(voc) !== -1)) return false;
      }
    }
    if (_mBrowseLvl) {
      const max = Number(_mBrowseLvl);
      if (!Number.isFinite(max) || (it.lvl || 0) > max) return false;
    }
    return true;
  }).sort((a, b) => a.name.localeCompare(b.name));
}

function marketAttachItemRowEvents(body, p) {
  $$("#m-item-rows .m-item-row").forEach((el) => el.addEventListener("click", () => {
    _mBrowseItem = el.dataset.slug;
    marketUpdateBrowseDetail(body, p);
    marketLoadItemOffers(p, _mBrowseItem);
  }));
}

function marketAttachDetailEvents(body, p) {
  const createSellBtn = $("#m-create-sell");
  if (createSellBtn) createSellBtn.addEventListener("click", () => {
    const slug = createSellBtn.dataset.slug;
    const depot = (marketDepotItems(p) || []).filter((i) => i.slug === slug);
    if (!depot.length) { toast("Você não tem esse item no Depot para vender"); return; }
    const i = depot[0];
    _mSel = { slug, instId: i.instId || null, qty: i.qty || 1, tier: i.tier || 0, from: "depot" };
    _mTab = "sell";
    renderMarket();
  });
  const createBuyBtn = $("#m-create-buy");
  if (createBuyBtn) createBuyBtn.addEventListener("click", () => {
    _mQ = "";
    renderMarketBuyOffer(body, p, createBuyBtn.dataset.slug);
  });
}

function marketUpdateBrowseList(body, p) {
  const catalog = marketBuildCatalog();
  const allItems = marketFilteredItems(catalog);
  const MAX_RENDER_ITEMS = 250;
  const totalItems = allItems.length;
  const shownItems = allItems.slice(0, MAX_RENDER_ITEMS);

  const rows = $("#m-item-rows");
  if (rows) rows.innerHTML = shownItems.length ? shownItems.map((it) => marketItemRowHTML(it)).join("") : '<div class="m-empty">Nenhum item</div>';

  const count = $("#m-item-count");
  if (count) count.textContent = `${totalItems} itens · mostrando ${shownItems.length}`;

  const more = rows && rows.nextElementSibling;
  if (more && more.classList.contains("tiny") && more.textContent.indexOf("primeiros") !== -1) {
    more.style.display = totalItems > MAX_RENDER_ITEMS ? "block" : "none";
    more.textContent = totalItems > MAX_RENDER_ITEMS ? `Apenas os ${MAX_RENDER_ITEMS} primeiros são exibidos. Refine a busca/filtro.` : "";
  }

  marketAttachItemRowEvents(body, p);
}

function marketUpdateBrowseDetail(body, p) {
  const catalog = marketBuildCatalog();
  const it = catalog.find((x) => x.slug === _mBrowseItem) || null;
  const detail = $("#m-detail");
  if (detail) detail.innerHTML = marketDetailHTML(it);
  marketAttachDetailEvents(body, p);
}

/* ------------------------------------------------------------- COMPRAR */
/* ------------------------------------------------------------- NAVEGAR / BROWSE (OTC MarketSystem) */
function renderMarketBrowse(body, p) {
  const tok = sessionToken();

  // Catalogo unificado: MARKETDATA (preços) + GAMEDATA (todos os itens)
  const catalog = marketBuildCatalog();
  const cats = MARKET_CAT_ORDER;

  const allItems = marketFilteredItems(catalog);

  const MAX_RENDER_ITEMS = 250;
  const totalItems = allItems.length;
  const shownItems = allItems.slice(0, MAX_RENDER_ITEMS);

  body.innerHTML = `
    <style>
      #market-browse { display:flex; gap:6px; height:100%; overflow:hidden; }
      #m-cat-list { width:150px; flex:none; overflow-y:auto; background:#14120e; border:1px solid #16140f; padding:4px; }
      .m-cat { padding:5px 7px; cursor:pointer; color:#c8c0a8; border-radius:2px; font-size:12px; }
      .m-cat:hover { background:rgba(255,255,255,.05); }
      .m-cat.active { background:#3d3830; color:#ffd700; }
      #m-item-list { width:230px; flex:none; overflow-y:auto; background:#14120e; border:1px solid #16140f; padding:4px; }
      .m-item-row { display:flex; align-items:center; gap:6px; padding:4px; cursor:pointer; border-bottom:1px solid rgba(0,0,0,.25); }
      .m-item-row:hover, .m-item-row.active { background:rgba(80,65,18,.35); outline:1px solid rgba(212,175,55,.32); }
      .m-item-row img, .m-item-row .item-sprite { width:24px; height:24px; object-fit:contain; flex:none; }
      .m-item-name { flex:1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; font-size:12px; }
      #m-detail { flex:1; min-width:0; display:flex; flex-direction:column; gap:6px; }
      #m-detail-info { background:#14120e; border:1px solid #16140f; padding:8px; }
      #m-offer-tabs { display:flex; gap:4px; }
      #m-offer-list { flex:1; overflow-y:auto; background:#14120e; border:1px solid #16140f; padding:4px; }
      .m-offer-row { display:flex; align-items:center; gap:6px; padding:5px; border-bottom:1px solid rgba(0,0,0,.25); }
      .m-offer-row:hover { background:rgba(255,255,255,.04); }
      .m-empty { color:#7d7666; font-size:11px; padding:6px; }
      .m-section-title { font-size:12px; font-weight:bold; color:#ffd700; margin:6px 0 4px; }
    </style>
    <div id="market-browse">
      <div id="m-cat-list">${cats.map((c) => `<div class="m-cat ${_mBrowseCat === c ? "active" : ""}" data-mcat="${c}">${marketCatLabelHTML(c)}</div>`).join("")}</div>
      <div id="m-item-list">
        <div class="row mb2" style="gap:4px;flex-wrap:wrap">
          <input id="m-browse-q" placeholder="buscar..." value="${_mQ}" style="flex:1;min-width:0;padding:3px;background:#1b1813;color:#c8c0a8;border:1px solid #16140f">
          <select id="m-browse-tier" style="padding:3px;background:#1b1813;color:#c8c0a8;border:1px solid #16140f">
            <option value="">Tier</option>
            <option value="0" ${_mTier === "0" ? "selected" : ""}>T0</option>
            <option value="1" ${_mTier === "1" ? "selected" : ""}>T1+</option>
            <option value="5" ${_mTier === "5" ? "selected" : ""}>T5+</option>
          </select>
          <input id="m-browse-lvl" type="number" min="0" placeholder="Lv" value="${_mBrowseLvl}" style="width:60px;padding:3px;background:#1b1813;color:#c8c0a8;border:1px solid #16140f">
          <select id="m-browse-voc" style="padding:3px;background:#1b1813;color:#c8c0a8;border:1px solid #16140f">
            <option value="">Vocação</option>
            <option value="none" ${_mBrowseVoc === "none" ? "selected" : ""}>Sem vocação</option>
            <option value="knight" ${_mBrowseVoc === "knight" ? "selected" : ""}>Knight</option>
            <option value="paladin" ${_mBrowseVoc === "paladin" ? "selected" : ""}>Paladin</option>
            <option value="druid" ${_mBrowseVoc === "druid" ? "selected" : ""}>Druid</option>
            <option value="sorcerer" ${_mBrowseVoc === "sorcerer" ? "selected" : ""}>Sorcerer</option>
            <option value="monk" ${_mBrowseVoc === "monk" ? "selected" : ""}>Monk</option>
          </select>
        </div>
        <div id="m-item-count" class="tiny dim" style="padding:3px 0">${totalItems} itens · mostrando ${shownItems.length}</div>
        <div id="m-item-rows">${shownItems.length ? shownItems.map((it) => marketItemRowHTML(it)).join("") : '<div class="m-empty">Nenhum item</div>'}</div>
        ${totalItems > MAX_RENDER_ITEMS ? `<div class="tiny dim" style="padding:4px">Apenas os ${MAX_RENDER_ITEMS} primeiros são exibidos. Refine a busca/categoria.</div>` : ""}
      </div>
      <div id="m-detail">${marketDetailHTML(catalog.find((it) => it.slug === _mBrowseItem) || null)}</div>
    </div>`;

  // Eventos categoria
  $$("#m-cat-list .m-cat").forEach((el) => el.addEventListener("click", () => {
    _mBrowseCat = el.dataset.mcat;
    _mBrowseItem = null;
    _mBrowseOffers = [];
    renderMarketBrowse(body, p);
  }));

  // Busca, tier, nível e vocação (não re-renderizam o input, apenas a lista)
  const qInput = $("#m-browse-q");
  if (qInput) qInput.addEventListener("input", (e) => {
    clearTimeout(_mMarketT);
    _mMarketT = setTimeout(() => { _mQ = e.target.value; marketUpdateBrowseList(body, p); }, 150);
  });

  const tierSel = $("#m-browse-tier");
  if (tierSel) tierSel.addEventListener("change", (e) => { _mTier = e.target.value; marketUpdateBrowseList(body, p); });

  const lvlEl = $("#m-browse-lvl");
  if (lvlEl) lvlEl.addEventListener("input", () => {
    _mBrowseLvl = lvlEl.value;
    marketUpdateBrowseList(body, p);
  });

  const vocEl = $("#m-browse-voc");
  if (vocEl) vocEl.addEventListener("change", () => {
    _mBrowseVoc = vocEl.value;
    marketUpdateBrowseList(body, p);
  });

  // Selecionar item (atualiza detalhe sem recriar a barra de busca)
  marketAttachItemRowEvents(body, p);

  // Criar ofertas / ações no item selecionado
  marketAttachDetailEvents(body, p);

  // Se já houver item selecionado, renderiza ofertas (cached)
  if (_mBrowseItem) marketRenderItemOffers(p, _mBrowseItem);
}

/* ---------- catálogo unificado do MarketSystem ---------- */
function marketBuildCatalog() {
  const md = (typeof MARKETDATA !== "undefined" && MARKETDATA.items) || {};
  const gd = (typeof GAMEDATA !== "undefined" && GAMEDATA.items) || {};
  const out = [];
  const seen = new Set();

  function add(slug, src) {
    if (!slug || seen.has(slug)) return;
    seen.add(slug);
    const g = gd[slug] || {};
    const m = md[slug] || {};
    const name = g.n || m.n || slug.replace(/-/g, " ");
    const tier = Number(m.tier || g.tier || 0);
    const cid = Number(m.cid || g.cid || 0);
    const item = Object.assign({}, g, m, { slug, name, tier, cid });
    item.category = marketItemCat(slug);
    if (MARKET_BANNED_CATS.has(item.category)) return;
    item.price = Number(m.price || g.price || g.sell || 0);
    out.push(item);
  }

  Object.keys(gd).forEach((slug) => add(slug, "g"));
  Object.keys(md).forEach((slug) => add(slug, "m"));
  return out;
}

function marketItemName(slug) {
  const gd = (typeof GAMEDATA !== "undefined" && GAMEDATA.items[slug]) || {};
  const md = (typeof MARKETDATA !== "undefined" && MARKETDATA.items[slug]) || {};
  return gd.n || md.n || itemName(slug);
}

function marketItemRowHTML(it) {
  const active = it.slug === _mBrowseItem ? "active" : "";
  const tier = it.tier ? `T${it.tier}` : "";
  return `<div class="m-item-row ${active}" data-slug="${it.slug}" title="${it.name}">
    ${itemImg(it.slug, 24, null, 1)}
    <span class="m-item-name">${it.name}</span>
    ${tier ? `<span class="tiny dim" style="color:#dab0ff">${tier}</span>` : ""}
  </div>`;
}

function marketDetailHTML(it) {
  if (!it) {
    return `<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#7d7666;font-size:12px">
      Selecione um item à esquerda para ver ofertas
    </div>`;
  }
  const md = (typeof MARKETDATA !== "undefined" && MARKETDATA.items[it.slug]) || {};
  const gd = (typeof GAMEDATA !== "undefined" && GAMEDATA.items[it.slug]) || {};
  const attrs = [];
  if (it.atk) attrs.push(`Atk ${it.atk}`);
  if (it.def) attrs.push(`Def ${it.def}`);
  if (it.lvl) attrs.push(`Lv ${it.lvl}`);
  if (it.vocs && it.vocs.length) attrs.push(it.vocs.slice(0, 2).join("/"));
  if (Number(it.imbSlots) > 0) attrs.push(`${it.imbSlots} imb slot${it.imbSlots > 1 ? "s" : ""}`);
  const price = Number(md.price || gd.sell || 0);
  const tier = it.tier ? `<span style="color:#dab0ff">T${it.tier}</span>` : "";
  return `
    <div id="m-detail-info">
      <div class="row" style="gap:8px;align-items:flex-start;margin-bottom:8px">
        <div style="position:relative">${itemImg(it.slug, 40, null, 1)}${it.tier ? `<span class="tier-badge" style="position:absolute;top:-4px;right:-4px;font-size:8px;height:14px;min-width:14px;line-height:12px">T${it.tier}</span>` : ""}</div>
        <div style="flex:1;min-width:0">
          <div class="small" style="font-weight:bold;color:#ffd700">${it.name} ${tier}</div>
          <div class="tiny dim">${MARKET_CAT_LABEL[it.category] || it.category} · CID ${it.cid || 0}</div>
          ${attrs.length ? `<div class="tiny" style="color:#9ce84a">${attrs.join(" · ")}</div>` : ""}
          <div class="tiny">Preço base: <b>${fmtFull(price)}</b> gp</div>
        </div>
      </div>
      <div class="row mb2" style="gap:6px">
        <button class="sm primary" id="m-create-sell" data-slug="${it.slug}" data-tier="${it.tier || 0}">+ Vender</button>
        <button class="sm" id="m-create-buy" data-slug="${it.slug}">+ Oferta de compra</button>
      </div>
    </div>
    <div id="m-offer-list">${_mBrowseLoading ? '<div class="m-empty">Carregando ofertas...</div>' : marketOfferListHTML()}</div>`;
}

function marketOfferRowHTML(o, kind) {
  const tier = o.tier || 0;
  const unfair = marketUnfair(o);
  const price = o.price_tc ? `${fmtFull(o.price)} <span style="color:#ffe680">TC</span>` : `${fmtFull(o.price)} gp`;
  const total = o.price_tc ? `${fmtFull(o.price * o.qty)} <span style="color:#ffe680">TC</span>` : `${fmtFull(o.price * o.qty)} gp`;
  const action = kind === "sell"
    ? `<button class="sm primary" data-mbuy="${o.id}" data-price="${o.price}" data-tc="${o.price_tc ? 1 : 0}">Comprar</button>`
    : `<button class="sm" data-maccept="${o.id}">Vender</button>`;
  const seller = o.seller_name || "Anônimo";
  const rowStyle = unfair ? ' style="color:#ff6a6a"' : '';
  return `<tr${rowStyle}>
    <td class="m-td-seller">${seller}</td>
    <td class="m-td-qty">${o.qty}</td>
    <td class="m-td-price">${price}</td>
    <td class="m-td-total">${total}</td>
    <td class="m-td-time">${marketTimeLeft(o)}</td>
    <td class="m-td-action">${action}</td>
  </tr>`;
}

function marketOffersTableHTML(offers, kind) {
  const title = kind === "sell" ? "Sell Offers" : "Buy Offers";
  const empty = kind === "sell" ? "Nenhuma oferta de venda" : "Nenhuma oferta de compra";
  if (!offers.length) return `<div class="m-section-title" style="margin-top:10px">${title}</div><div class="m-empty">${empty}</div>`;
  const rows = offers.map((o) => marketOfferRowHTML(o, kind)).join("");
  return `
    <div class="m-section-title" style="margin-top:10px">${title}</div>
    <table class="m-offers-table">
      <thead>
        <tr>
          <th class="m-th-seller">Vendedor</th>
          <th class="m-th-qty">Qtd</th>
          <th class="m-th-price">Preço unit.</th>
          <th class="m-th-total">Total</th>
          <th class="m-th-time">Resta</th>
          <th class="m-th-action"></th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function marketOfferListHTML() {
  if (!_mBrowseItem || !_mBrowseOffers) return '<div class="m-empty">Selecione um item</div>';
  const sells = _mBrowseOffers.filter((o) => o.kind === "item");
  const buys = _mBrowseOffers.filter((o) => o.kind === "buy");
  return marketOffersTableHTML(sells, "sell") + marketOffersTableHTML(buys, "buy");
}

async function marketLoadItemOffers(p, slug) {
  _mBrowseLoading = true;
  marketRenderItemOffers(p, slug, true);
  const r = await marketListOffers({ kind: "", slug });
  _mBrowseLoading = false;
  if (!r.ok) { toast(r.msg || "Falha ao carregar ofertas"); _mBrowseOffers = []; }
  else {
    _mBrowseOffers = (r.offers || []).slice().sort((a, b) => {
      if (a.kind === b.kind) return a.price - b.price;
      return (a.kind === "buy" ? -1 : 1);
    });
    // separa e ordena: sell (item) asc, buy desc
    const sells = _mBrowseOffers.filter((o) => o.kind === "item").sort((a, b) => a.price - b.price);
    const buys = _mBrowseOffers.filter((o) => o.kind === "buy").sort((a, b) => b.price - a.price);
    _mBrowseOffers = sells.concat(buys);
  }
  marketRenderItemOffers(p, slug, false);
}

function marketRenderItemOffers(p, slug, loading) {
  if (_mBrowseItem !== slug) return;
  const list = $("#m-offer-list");
  if (!list) return;
  if (loading) list.innerHTML = '<div class="m-empty">Carregando ofertas...</div>';
  else list.innerHTML = marketOfferListHTML();

  // re-atacha eventos dos botões de compra/aceite
  const tok = sessionToken();
  $$("#m-offer-list [data-mbuy]").forEach((b) =>
    b.addEventListener("click", () => marketWithLock(b, async () => {
      const id = b.dataset.mbuy;
      const price = Number(b.dataset.price);
      const priceTc = b.dataset.tc === "1";
      if (priceTc && accountCoins() < price) { toast("Tibia Coins insuficientes"); return; }
      if (!priceTc && _mBank < price) { toast("Ouro insuficiente na conta"); return; }
      const r = await marketBuyOffer({ token: tok, offer_id: id, buyer_name: p.name });
      if (!r.ok) { toast(r.msg || "Falha na compra"); return; }
      const d = r.data;
      if (d.item) marketReceiveItem(p, d.item.slug, d.item.tier, d.item.qty);
      if (Number.isFinite(Number(d.bank))) { _mBank = Number(d.bank); marketRefreshHeader(); }
      toast(`Comprou <b>${marketItemName(d.item ? d.item.slug : "")}</b> — foi para o Depot`, "level");
      addLog("sell", `Market: comprou de <b>${d.seller_name}</b> por ${fmtFull(d.total || d.price)}${d.price_tc ? " TC" : " gp"} → Depot`);
      marketLoadItemOffers(p, slug);
      renderAll && renderAll();
    })));

  $$("#m-offer-list [data-maccept]").forEach((b) =>
    b.addEventListener("click", () => marketWithLock(b, async () => {
      const id = b.dataset.maccept;
      const oferta = (_mBrowseOffers.find((o) => o.id === Number(id))) || {};
      if (!marketHaveInDepot(p, oferta.slug)) { toast("Você não tem esse item no Depot para vender"); return; }
      const r = await marketBuyOffer({ token: tok, offer_id: id, buyer_name: p.name, qty: 1 });
      if (!r.ok) { toast(r.msg || "Falha"); return; }
      marketRemoveDepotItem(p, oferta.slug);
      if (Number.isFinite(Number(r.data.bank))) { _mBank = Number(r.data.bank); marketRefreshHeader(); }
      toast(`Vendeu <b>${marketItemName(oferta.slug)}</b> por ${fmtFull(r.data.total || r.data.price)} gp`, "level");
      marketLoadItemOffers(p, slug);
      renderAll && renderAll();
    })));
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
function renderMarketBuyOffer(body, p, preSlug) {
  const tok = sessionToken();
  const slugVal = preSlug || _mQ || "";
  body.innerHTML = `
    <div class="small dim mb4">Oferecer um preço para comprar (buy offer)</div>
    <div class="row mb4" style="gap:6px">
      <input id="m-bo-slug" placeholder="nome do item (ex: fire sword)" value="${slugVal}"
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
  const boGo = $("#m-bo-go");
  boGo.addEventListener("click", () => marketWithLock(boGo, async () => {
    const slugTxt = (slugEl.value || "").trim().toLowerCase().replace(/ /g, "-");
    const price = Math.floor(Number(priceEl.value) || 0);
    const qty = Math.max(1, Math.floor(Number(qtyEl.value) || 1));
    if (!slugTxt || price <= 0) { toast("Informe item e preço"); return; }
    const total = price * qty;
    if (_mBank < total) { toast("Ouro insuficiente na conta"); return; }
    const r = await marketCreateOffer({
      token: tok, kind: "buy", slug: slugTxt, tier: 0, qty, price,
      price_tc: 0, seller_name: _mBuyAnon ? "Anônimo" : p.name,
    });
    if (!r.ok) { toast(r.msg || "Falha"); return; }
    if(Number.isFinite(Number(r.bank))){_mBank=Number(r.bank);marketRefreshHeader();}
    if (r.matched) {
      toast(`Oferta casada automaticamente! Comprou por ${fmtFull(r.matched.price)} gp`, "level");
      marketReceiveItem(p, slugTxt, 0, r.matched.qty || qty);
    } else {
      toast(`Oferta de compra criada (${fmtFull(total)} gp travados)`, "level");
    }
    _mBuyPrice = ""; _mBuyQty = 1;
    renderMarket();
  }));
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
    <div class="list mb4" style="max-height:260px" id="m-sell-items">
      ${itens.length ? itens.map((i) => {
        const isSel = selItem && ((sel.instId && i.instId === sel.instId) || (!sel.instId && !i.instId && i.slug === sel.slug));
        return `<div class="shop-row ${isSel ? "selected" : ""}" data-sell-item="${i.slug}" ${i.instId ? `data-sell-inst="${i.instId}"` : ""} data-sell-qty="${i.qty}" data-sell-tier="${i.tier}">
          <div style="position:relative">${itemImg(i.slug, 24, null, i.qty || 1)}
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
    <div class="tiny dim mt8">Oferta dura 30 dias · taxa de 2% (mín 20, máx 1M) paga da conta · ao expirar/cancelar o item volta ao Depot.</div>`;

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
  if (go) go.addEventListener("click", () => marketWithLock(go, async () => {
    const price = Math.floor(Number(_mPrice) || 0);
    if (price <= 0) { toast("Informe um preço"); return; }
    const fee = marketFee(price);
    if (_mBank < fee) { toast("Ouro insuficiente na conta para a taxa (2%)"); return; }
    const qty = selItem.instId ? 1 : selItem.qty;
    const r = await marketCreateOffer({
      token: tok, kind: "item", slug: selItem.slug, tier: selItem.tier || 0,
      qty, price, price_tc: _mPriceTc ? 1 : 0,
      seller_name: _mAnon ? "Anônimo" : p.name,
    });
    if (!r.ok) { toast(r.msg || "Falha ao vender"); return; }
    marketRemoveForSale(p, { slug: selItem.slug, instId: selItem.instId, qty, tier: selItem.tier || 0, from: "depot" }, r.offer.id);
    if(Number.isFinite(Number(r.bank))){_mBank=Number(r.bank);marketRefreshHeader();}
    if (r.matched) {
      toast(`Vendido na hora por ${fmtFull(r.matched.price)} gp! (match automático)`, "level");
    } else {
      toast(`Oferta criada: <b>${selItem.n}</b> por ${fmtFull(price)}${_mPriceTc ? " TC" : " gp"} (30d)`, "level");
    }
    addLog("sell", `Market: ofertou <b>${selItem.n}</b> por ${fmtFull(price)}${_mPriceTc ? " TC" : " gp"}`);
    _mSel = null; _mPrice = "";
    renderMarket();
    renderAll && renderAll();
  }));
}

/* -------------------------------------------------------- MINHAS OFERTAS */
function renderMarketMine(body, p) {
  const tok = sessionToken();
  body.innerHTML = '<div class="tiny dim">Carregando...</div>';
  marketMineOffers(tok).then((r) => {
    if (!r.ok) { body.innerHTML = `<div class="tiny" style="color:#ff9a6a">${r.msg || "Falha"}</div>`; return; }
    const ofertas = r.offers || [];
    if (!ofertas.length) { body.innerHTML = '<div class="tiny dim">Você não tem ofertas.</div>'; return; }
    body.innerHTML = `<div class="list" style="max-height:420px">` + ofertas.map((o) => {
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
      b.addEventListener("click", () => marketWithLock(b, async () => {
        const id = b.dataset.mcancel;
        const r = await marketCancelOffer(tok, id);
        if (!r.ok) { toast(r.msg || "Falha"); return; }
        marketRefundItem(p, id);
        if(Number.isFinite(Number(r.bank))){_mBank=Number(r.bank);marketRefreshHeader();}
        toast("Oferta cancelada — devolvido", "level");
        renderMarket();
        renderAll && renderAll();
      })));
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
    const coinSellGo = $("#m-c-sell-go");
    coinSellGo.addEventListener("click", () => marketWithLock(coinSellGo, async () => {
      const qty = Math.floor(Number(_mCoinsQty) || 0);
      const price = Math.floor(Number(_mCoinsPrice) || 0);
      if (qty <= 0 || price <= 0) { toast("Informe quantidade e preço"); return; }
      if (qty > coins) { toast("Tibia Coins insuficientes"); return; }
      const fee = marketFee(price);
      if (_mBank < fee) { toast("Ouro insuficiente na conta para a taxa"); return; }
      const r = await marketCreateOffer({
        token: tok, kind: "coins", qty, price, price_tc: 0,
        seller_name: _mCoinsAnon ? "Anônimo" : p.name,
      });
      if (!r.ok) { toast(r.msg || "Falha"); return; }
      if(Number.isFinite(Number(r.bank))){_mBank=Number(r.bank);marketRefreshHeader();}
      toast(`Oferta criada: ${qty} TC por ${fmtFull(price)} gp`, "level");
      marketRefreshHeader();
      _mCoinsQty = ""; _mCoinsPrice = "";
      renderMarketCoins(body, p);
      renderCoinBalance();
    }));
  } else {
    cb.innerHTML = '<div class="tiny dim">Carregando ofertas de TC...</div>';
    marketListOffers({ kind: "coins" }).then((r) => {
      if (!r.ok) { cb.innerHTML = `<div class="tiny" style="color:#ff9a6a">${r.msg || "Falha"}</div>`; return; }
      const ofertas = r.offers || [];
      if (!ofertas.length) { cb.innerHTML = '<div class="tiny dim">Nenhuma oferta de TC no momento.</div>'; return; }
      cb.innerHTML = `<div class="list" style="max-height:420px">` + ofertas.map((o) => `
        <div class="shop-row">
          <div style="flex:1;min-width:0">
            <div class="small" style="color:#ffe680">${o.qty} Tibia Coins</div>
            <div class="tiny dim">${o.seller_name} · ${marketTimeLeft(o)} restante</div>
          </div>
          <button class="sm primary" data-mcoinsbuy="${o.id}" data-price="${o.price}">${fmtFull(o.price)} gp</button>
        </div>`).join("") + `</div>`;
      $$("#market-body [data-mcoinsbuy]").forEach((b) =>
        b.addEventListener("click", () => marketWithLock(b, async () => {
          const id = b.dataset.mcoinsbuy;
          const price = Number(b.dataset.price);
          if (_mBank < price) { toast("Ouro insuficiente na conta"); return; }
          const r = await marketBuyOffer({ token: tok, offer_id: id, buyer_name: p.name });
          if (!r.ok) { toast(r.msg || "Falha"); return; }
          if(Number.isFinite(Number(r.data.bank))){_mBank=Number(r.data.bank);marketRefreshHeader();}
          toast(`Comprou ${r.data.coins} TC por ${fmtFull(price)} gp`, "level");
          marketRefreshHeader();
          renderMarketCoins(body, p);
          renderStats(p);
          renderCoinBalance();
        })));
    });
  }
}

/* ----------------------------------------------------------- BANCO */
function renderMarketBank() {
  const tok = sessionToken();
  const p = G.p;
  if (!tok || !p) return;
  $("#market-body").innerHTML = `
    <div class="small dim mb4">O Market usa o saldo de gold compartilhado da conta.</div>
    <div class="shop-row">
      <div style="flex:1"><b>Saldo da conta:</b> <span style="color:#9ce84a">${fmtFull(accountGold())} gp</span></div>
    </div>
    <button class="full mt4" id="m-bank-back">Voltar ao Market</button>
    <div class="tiny dim mt8">Taxas de 2% e valores de ofertas de compra saem diretamente da conta. Vendas entram na conta.</div>`;
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
      <div class="list" style="max-height:420px">` + hist.map((h) => {
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
