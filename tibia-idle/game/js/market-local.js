/* market-local.js — MARKET P2P OFFLINE (fallback quando não há API)
 *
 * Quando o servidor de contas NÃO está configurado (sem tibia-idle-api no
 * localStorage), o Market player-to-player roda num modo LOCAL: as ofertas
 * ficam no localStorage e valem para TODOS os personagens do save (simulam
 * outros jogadores). O fluxo é idêntico ao online:
 *   - vender item do Depot (taxa 2% do banco, oferta de 30 dias);
 *   - comprar ofertas de venda (item vai pro Depot, gold sai do banco);
 *   - ofertas de compra (gold travado no banco) e match automático;
 *   - Tibia Coins (conta local do navegador);
 *   - banco do market (depósito/saque).
 *
 * Quando a API ESTÁ configurada, todas as funções delegam para o servidor
 * (as originais do account-client.js são preservadas).
 */
"use strict";

(function () {
  if (typeof localStorage === "undefined") return;

  const MARKET_LOCAL_KEY = "tibia-idle-market-local-v1";

  function read() {
    try {
      const raw = localStorage.getItem(MARKET_LOCAL_KEY);
      const d = raw ? JSON.parse(raw) : null;
      if (!d || typeof d !== "object") return { offers: [], nextId: 1, bank: {}, history: [] };
      d.offers = Array.isArray(d.offers) ? d.offers : [];
      d.bank = d.bank || {};
      d.history = Array.isArray(d.history) ? d.history : [];
      return d;
    } catch (e) { return { offers: [], nextId: 1, bank: {}, history: [] }; }
  }
  function write(d) {
    try { localStorage.setItem(MARKET_LOCAL_KEY, JSON.stringify(d)); } catch (e) {}
  }

  /* Registra um trade no histórico local (últimos 600). Muta o `d` do
   * chamador — o write(d) dele persiste tudo (evita sobrescrever o history). */
  function addHistory(d, rec) {
    d.history.unshift({
      id: d.history.reduce((m, x) => Math.max(m, x.id || 0), 0) + 1,
      seller_id: rec.seller_id, seller_name: rec.seller_name || "",
      buyer_id: rec.buyer_id || null, buyer_name: rec.buyer_name || "",
      kind: rec.kind || "item", slug: rec.slug || null, tier: rec.tier || 0,
      qty: rec.qty || 1, price: rec.price || 0, price_tc: rec.price_tc ? 1 : 0,
      created_at: new Date().toISOString(),
    });
    if (d.history.length > 600) d.history.length = 600;
  }

  function charIdAtual() {
    return (typeof G !== "undefined" && G && G.p)
      ? String(characterId(G.p)) : "?";
  }
  function nomeAtual() {
    return (typeof G !== "undefined" && G && G.p) ? G.p.name : "?";
  }

  /* Guarda as funções ORIGINAIS (servidor) para delegar quando há API. */
  const orig = {
    marketCreateOffer: typeof marketCreateOffer === "function" ? marketCreateOffer : null,
    marketListOffers: typeof marketListOffers === "function" ? marketListOffers : null,
    marketMineOffers: typeof marketMineOffers === "function" ? marketMineOffers : null,
    marketBuyOffer: typeof marketBuyOffer === "function" ? marketBuyOffer : null,
    marketCancelOffer: typeof marketCancelOffer === "function" ? marketCancelOffer : null,
    marketClaimGold: typeof marketClaimGold === "function" ? marketClaimGold : null,
    marketDeposit: typeof marketDeposit === "function" ? marketDeposit : null,
    marketWithdraw: typeof marketWithdraw === "function" ? marketWithdraw : null,
    marketBank: typeof marketBank === "function" ? marketBank : null,
    accountAddCoins: typeof accountAddCoins === "function" ? accountAddCoins : null,
  };

  function online() {
    return typeof accountApiConfigured === "function" && accountApiConfigured();
  }

  /* ----- helpers locais ----- */

  function bancoDe(id) {
    const d = read();
    return d.bank[id] || 0;
  }
  function bancoSet(id, v) {
    const d = read();
    d.bank[id] = Math.max(0, Math.floor(v) || 0);
    write(d);
    return d.bank[id];
  }

  /* média de preço por slug (p/ o aviso de oferta injusta) */
  function statsDe(slug) {
    const d = read();
    const preços = d.offers
      .filter((o) => o.status === "active" && o.slug === slug && !o.price_tc)
      .map((o) => Number(o.price) || 0)
      .filter((v) => v > 0);
    if (preços.length < 3) return null;
    const avg = preços.reduce((a, b) => a + b, 0) / preços.length;
    return { avg: Math.round(avg), count: preços.length };
  }

  function novaOferta(body) {
    const d = read();
    const o = {
      id: d.nextId++,
      kind: body.kind || "item",
      slug: body.slug || "",
      tier: Number(body.tier) || 0,
      qty: Math.max(1, Number(body.qty) || 1),
      price: Math.floor(Number(body.price) || 0),
      price_tc: body.price_tc ? 1 : 0,
      seller_name: body.seller_name || nomeAtual(),
      seller_id: charIdAtual(),
      status: "active",
      created: new Date().toISOString(),
      expires_at: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
    };
    o.stats = statsDe(o.slug);
    d.offers.push(o);
    write(d);
    return o;
  }

  /* Match automático: casa a nova oferta com uma contra-oferta compatível
   * de OUTRO personagem. Devolve { matched } ou null. */
  function tentarMatch(o) {
    const d = read();
    if (o.kind === "item") {
      // venda casa com oferta de COMPRA (preço de compra >= preço de venda)
      const alvo = d.offers.find((b) =>
        b.status === "active" && b.kind === "buy" &&
        b.slug === o.slug && (b.tier || 0) === o.tier &&
        b.seller_id !== o.seller_id && (Number(b.price) || 0) >= (Number(o.price) || 0));
      if (!alvo) return null;
      const q = Math.min(o.qty, alvo.qty);
      const total = (Number(o.price) || 0) * q;
      // gold já está travado na oferta de compra; credita só o vendedor
      bancoSet(o.seller_id, bancoDe(o.seller_id) + total);
      // consome a buy offer (inteira ou parcial)
      alvo.qty -= q;
      if (alvo.qty <= 0) alvo.status = "sold";
      o.qty -= q;
      if (o.qty <= 0) o.status = "sold";
      addHistory(d, { seller_id: o.seller_id, seller_name: o.seller_name,
                     buyer_id: alvo.seller_id, buyer_name: alvo.seller_name,
                     kind: "item", slug: o.slug, tier: o.tier, qty: q,
                     price: total, price_tc: 0 });
      write(d);
      return { matched: { price: Number(o.price), qty: q, against: alvo.seller_name } };
    }
    if (o.kind === "buy") {
      // compra casa com oferta de VENDA (preço de venda <= preço de compra)
      const alvo = d.offers.find((s) =>
        s.status === "active" && s.kind === "item" &&
        s.slug === o.slug && (s.tier || 0) === o.tier &&
        s.seller_id !== o.seller_id && (Number(s.price) || 0) <= (Number(o.price) || 0));
      if (!alvo) return null;
      const q = Math.min(o.qty, alvo.qty);
      const total = (Number(alvo.price) || 0) * q;
      // gold já está travado na oferta de compra; credita só o vendedor
      bancoSet(alvo.seller_id, bancoDe(alvo.seller_id) + total);
      // o ITEM da sell offer vai para o comprador: limpa o pending do
      // vendedor (o market-ui guardou o item no _mPendingRefund ao vender)
      if (typeof _mPendingRefund !== "undefined" && _mPendingRefund) {
        delete _mPendingRefund[alvo.id];
      }
      alvo.qty -= q;
      if (alvo.qty <= 0) alvo.status = "sold";
      o.qty -= q;
      if (o.qty <= 0) o.status = "sold";
      addHistory(d, { seller_id: alvo.seller_id, seller_name: alvo.seller_name,
                     buyer_id: o.seller_id, buyer_name: o.seller_name,
                     kind: "item", slug: o.slug, tier: o.tier, qty: q,
                     price: total, price_tc: 0 });
      write(d);
      return { matched: { price: Number(alvo.price), qty: q, against: alvo.seller_name, slug: o.slug, tier: o.tier } };
    }
    return null;
  }

  /* ----- API local (mesma assinatura do account-client) ----- */

  async function localCreateOffer(body) {
    const me = charIdAtual();
    if (body.kind === "coins") {
      const qty = Math.max(1, Math.floor(Number(body.qty) || 1));
      if (typeof accountSpendCoins === "function" && !accountSpendCoins(qty)) {
        return { ok: false, msg: "Tibia Coins insuficientes" };
      }
    }
    if (body.kind === "buy") {
      const price = Math.max(1, Math.floor(Number(body.price) || 0));
      const qty = Math.max(1, Math.floor(Number(body.qty) || 1));
      const total = price * qty;
      if (bancoDe(me) < total) return { ok: false, msg: "Ouro insuficiente no banco" };
      bancoSet(me, bancoDe(me) - total);
    }
    const o = novaOferta(body);
    const m = tentarMatch(o);
    write(read());
    if (m) {
      return { ok: true, offer: { id: o.id }, matched: m.matched,
        bank: bancoDe(me), coinBalance: (typeof accountCoins === "function") ? accountCoins() : 0 };
    }
    return { ok: true, offer: { id: o.id },
      bank: bancoDe(me), coinBalance: (typeof accountCoins === "function") ? accountCoins() : 0 };
  }

  async function localListOffers(filtro) {
    filtro = filtro || {};
    const d = read();
    const agora = Date.now();
    const ativas = d.offers.filter((o) => {
      if (o.status !== "active") return false;
      if (filtro.kind && o.kind !== filtro.kind) return false;
      if (filtro.tier && (o.tier || 0) !== Number(filtro.tier)) return false;
      if (filtro.slug && o.slug !== filtro.slug) return false;
      if (o.expires_at && new Date(o.expires_at).getTime() < agora) return false;
      return true;
    }).map((o) => {
      // o shape é o mesmo do servidor (o market-ui lê kind/slug/tier/qty/
      // price/price_tc/seller_name/stats/expires_at)
      o.stats = o.stats || statsDe(o.slug);
      return o;
    });
    return { ok: true, offers: ativas };
  }

  async function localMineOffers(token) {
    const d = read();
    const me = charIdAtual();
    return { ok: true, offers: d.offers.filter((o) => o.seller_id === me) };
  }

  async function localBuyOffer(body) {
    const d = read();
    const o = d.offers.find((x) => x.id === Number(body.offer_id) && x.status === "active");
    if (!o) return { ok: false, msg: "Oferta não encontrada" };
    const buyerId = charIdAtual();
    if (o.seller_id === buyerId) return { ok: false, msg: "Não pode comprar a própria oferta" };
    if (o.expires_at && new Date(o.expires_at).getTime() < Date.now()) {
      o.status = "expired"; write(d);
      return { ok: false, msg: "Oferta expirada" };
    }
    if (o.kind === "item") {
      const q = body.qty ? Math.min(Number(body.qty) || 1, o.qty) : o.qty;
      const total = (Number(o.price) || 0) * q;
      // comprador (ator) paga; vendedor recebe
      if (bancoDe(buyerId) < total) return { ok: false, msg: "Ouro insuficiente no banco" };
      bancoSet(buyerId, bancoDe(buyerId) - total);
      bancoSet(o.seller_id, bancoDe(o.seller_id) + total);
      if (typeof _mPendingRefund !== "undefined" && _mPendingRefund) {
        delete _mPendingRefund[o.id];
      }
      o.qty -= q;
      if (o.qty <= 0) o.status = "sold";
      addHistory(d, { seller_id: o.seller_id, seller_name: o.seller_name,
                     buyer_id: buyerId, buyer_name: body.buyer_name || nomeAtual(),
                     kind: "item", slug: o.slug, tier: o.tier, qty: q,
                     price: total, price_tc: o.price_tc ? 1 : 0 });
      write(d);
      return {
        ok: true,
        bank: bancoDe(buyerId),
        coinBalance: (typeof accountCoins === "function") ? accountCoins() : 0,
        data: {
          item: { slug: o.slug, tier: o.tier, qty: q },
          total: total,
          price: Number(o.price),
          price_tc: o.price_tc ? 1 : 0,
          seller_name: o.seller_name,
        },
      };
    }
    if (o.kind === "buy") {
      const q = body.qty ? Math.min(Number(body.qty) || 1, o.qty) : o.qty;
      const total = (Number(o.price) || 0) * q;
      // o ator vende o item para o comprador da oferta (gold já travado)
      bancoSet(buyerId, bancoDe(buyerId) + total);
      o.qty -= q;
      if (o.qty <= 0) o.status = "sold";
      addHistory(d, { seller_id: buyerId, seller_name: body.buyer_name || nomeAtual(),
                     buyer_id: o.seller_id, buyer_name: o.seller_name,
                     kind: "item", slug: o.slug, tier: o.tier, qty: q,
                     price: total, price_tc: 0 });
      write(d);
      return {
        ok: true,
        bank: bancoDe(buyerId),
        coinBalance: (typeof accountCoins === "function") ? accountCoins() : 0,
        data: {
          total: total,
          price: Number(o.price),
          seller_name: o.seller_name,
        },
      };
    }
    if (o.kind === "coins") {
      if (typeof accountAddCoins === "function") accountAddCoins(o.qty);
      const total = (Number(o.price) || 0) * o.qty;
      if (bancoDe(buyerId) < total) return { ok: false, msg: "Ouro insuficiente no banco" };
      bancoSet(buyerId, bancoDe(buyerId) - total);
      bancoSet(o.seller_id, bancoDe(o.seller_id) + total);
      o.status = "sold";
      addHistory(d, { seller_id: o.seller_id, seller_name: o.seller_name,
                     buyer_id: buyerId, buyer_name: body.buyer_name || nomeAtual(),
                     kind: "coins", slug: null, tier: 0, qty: o.qty,
                     price: total, price_tc: 1 });
      write(d);
      return {
        ok: true,
        bank: bancoDe(buyerId),
        coinBalance: (typeof accountCoins === "function") ? accountCoins() : 0,
        data: { coins: o.qty, total: total, price: Number(o.price), price_tc: 1, seller_name: o.seller_name },
      };
    }
    return { ok: false, msg: "Tipo de oferta inválido" };
  }

  async function localCancelOffer(token, offerId) {
    const d = read();
    const me = charIdAtual();
    const o = d.offers.find((x) => x.id === Number(offerId));
    if (!o) return { ok: false, msg: "Oferta não encontrada" };
    if (o.seller_id !== me) return { ok: false, msg: "Não é sua oferta" };
    if (o.status !== "active") return { ok: false, msg: "Oferta já finalizada" };
    let refundGold = 0, refundCoins = 0;
    if (o.kind === "buy") {
      // devolve o gold travado + a taxa
      refundGold = (Number(o.price) || 0) * o.qty;
    }
    if (o.kind === "coins" && !o.price_tc) {
      refundGold = (Number(o.price) || 0) * o.qty;
    }
    if (o.kind === "coins" && o.price_tc) {
      refundCoins = o.qty;
      if (typeof accountAddCoins === "function") accountAddCoins(refundCoins);
    }
    // kind "item": o item volta via _mPendingRefund (marketRefundItem no UI)
    o.status = "cancelled";
    write(d);
    return { ok: true, refundGold, refundCoins, bank: bancoDe(me),
      coinBalance: (typeof accountCoins === "function") ? accountCoins() : 0 };
  }

  async function localClaimGold(token) {
    // no local o gold vai direto ao banco (sem pendência)
    return { ok: true, gold: 0 };
  }

  function localCoinBalance() {
    return (typeof accountCoins === "function") ? accountCoins() : 0;
  }

  async function localDeposit(token, amount) {
    const me = charIdAtual();
    const n = Math.max(0, Math.floor(Number(amount) || 0));
    if (typeof accountSpendGold === "function" && !accountSpendGold(n)) {
      return { ok: false, msg: "Gold insuficiente" };
    }
    bancoSet(me, bancoDe(me) + n);
    return { ok: true, bank: bancoDe(me), coinBalance: localCoinBalance(), gold: (typeof accountGold === "function") ? accountGold() : 0 };
  }

  async function localWithdraw(token, amount) {
    const me = charIdAtual();
    const n = Math.max(0, Math.floor(Number(amount) || 0));
    const saldo = bancoDe(me);
    const sacar = Math.min(n, saldo);
    bancoSet(me, saldo - sacar);
    if (typeof accountAddGold === "function") accountAddGold(sacar);
    return { ok: true, bank: bancoDe(me), amount: sacar, coinBalance: localCoinBalance(), gold: (typeof accountGold === "function") ? accountGold() : 0 };
  }

  async function localBank(token) {
    return { ok: true, bank: bancoDe(charIdAtual()), coinBalance: localCoinBalance() };
  }

  async function localAddCoins(token, amount) {
    // usa a conta local de Tibia Coins (tibiacoin.js) — replica via
    // accountLoad/accountSave (não chama accountAddCoins global, que pode
    // ser a versão do servidor ou a própria função sobrescrita)
    const n = Math.max(0, Math.floor(Number(amount) || 0));
    try {
      const acc = (typeof accountLoad === "function") ? accountLoad() : { v: 1, coins: 0 };
      acc.coins = Math.max(0, (acc.coins || 0) + n);
      if (typeof accountSave === "function") accountSave(acc);
    } catch (e) { /* segue */ }
    return { ok: true };
  }

  /* ----- sobrescreve as globais quando offline ----- */
  function instalar() {
    if (online()) return;   // tem API: usa o servidor

    window.marketCreateOffer = async (body) => localCreateOffer(body);
    window.marketListOffers = async (filtro) => localListOffers(filtro);
    window.marketMineOffers = async (token) => localMineOffers(token);
    window.marketBuyOffer = async (body) => localBuyOffer(body);
    window.marketCancelOffer = async (token, id) => localCancelOffer(token, id);
    window.marketClaimGold = async (token) => localClaimGold(token);
    window.marketDeposit = async (token, amount) => localDeposit(token, amount);
    window.marketWithdraw = async (token, amount) => localWithdraw(token, amount);
    window.marketBank = async (token) => localBank(token);
    window.accountAddCoins = async (token, amount) => localAddCoins(token, amount);
  }

  // instala no load (as funções do account-client já foram definidas)
  if (typeof window !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", instalar);
    } else {
      instalar();
    }
  }
})();
