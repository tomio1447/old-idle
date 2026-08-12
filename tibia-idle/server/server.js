/*
 * server.js — API de contas do Global-Idle (login/register/save).
 *
 * Rotas:
 *   POST /api/register   { login, password, [email] }  -> cria conta
 *   POST /api/login      { login, password }           -> { token, account }
 *   GET  /api/me         (Authorization: Bearer token) -> { account, characters }
 *   POST /api/characters { token, name, voc, data }    -> cria personagem
 *   PUT  /api/characters/:id { token, voc, level, data } -> salva personagem
 *   POST /api/coins      { token, amount }             -> adiciona Tibia Coins
 *
 * Uso:
 *   cd tibia-idle/server
 *   npm install
 *   node server.js            (usa .env ou defaults; sem MySQL usa JSON local)
 *   node seed.js              (cria a conta admin 1/1)
 */
"use strict";

require("dotenv").config();
const http = require("http");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");
const { getDb } = require("./db");
const party = require("./party");   // lógica de PARTY multiplayer

const PORT = parseInt(process.env.PORT || "3333", 10);
const HOST = process.env.HOST || "0.0.0.0";
const SALT_ROUNDS = 10;
const TEST_SERVER = process.env.TEST_SERVER === "1";
const STATIC_DIR = path.resolve(process.env.STATIC_DIR || path.join(__dirname, "..", "game"));

/* ------------------------------- helpers ------------------------------- */

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => { data += c; if (data.length > 5e6) req.destroy(); });
    req.on("end", () => {
      try { resolve(data ? JSON.parse(data) : {}); }
      catch (e) { reject(e); }
    });
    req.on("error", reject);
  });
}

function send(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
  });
  res.end(body);
}

function newToken() {
  return crypto.randomBytes(32).toString("hex");
}

const MIME = {
  ".html":"text/html; charset=utf-8", ".js":"text/javascript; charset=utf-8",
  ".css":"text/css; charset=utf-8", ".json":"application/json; charset=utf-8",
  ".png":"image/png", ".gif":"image/gif", ".jpg":"image/jpeg",
  ".jpeg":"image/jpeg", ".webp":"image/webp", ".svg":"image/svg+xml",
  ".otbm":"application/octet-stream", ".ogg":"audio/ogg", ".mp3":"audio/mpeg",
};

function sendText(res, code, body, type) {
  body = Buffer.isBuffer(body) ? body : Buffer.from(String(body));
  res.writeHead(code, {
    "Content-Type": type || "text/plain; charset=utf-8",
    "Content-Length": body.length,
    "Cache-Control": "no-cache",
  });
  res.end(body);
}

function serveStatic(req, res, pathname) {
  let relative;
  try { relative = decodeURIComponent(pathname || "/"); }
  catch (e) { sendText(res, 400, "URL inválida"); return; }
  if (relative === "/") relative = "/index.html";
  const file = path.resolve(STATIC_DIR, relative.replace(/^\/+/, ""));
  if (file !== STATIC_DIR && !file.startsWith(STATIC_DIR + path.sep)) {
    sendText(res, 403, "Acesso negado"); return;
  }
  fs.stat(file, (statErr, stat) => {
    const target = !statErr && stat.isDirectory() ? path.join(file, "index.html") : file;
    fs.readFile(target, (error, data) => {
      if (error) { sendText(res, 404, "Arquivo não encontrado"); return; }
      const type = MIME[path.extname(target).toLowerCase()] || "application/octet-stream";
      if (req.method === "HEAD") {
        res.writeHead(200, { "Content-Type":type, "Content-Length":data.length, "Cache-Control":"no-cache" });
        res.end();
      } else sendText(res, 200, data, type);
    });
  });
}

async function ensureTestAccounts(db) {
  if (!TEST_SERVER) return;
  for (const credential of [
    { login:"1", password:"1" },
    { login:"2", password:"2" },
  ]) {
    const hash = bcrypt.hashSync(credential.password, SALT_ROUNDS);
    const existing = await db.findAccountByLogin(credential.login);
    if (!existing) {
      await db.createAccount(credential.login, hash, "admin", 1000);
    } else if (typeof db.run === "function") {
      await db.run("UPDATE accounts SET password_hash = ?, role = 'admin' WHERE id = ?", [hash, existing.id]);
    } else {
      existing.password_hash = hash;
      existing.role = "admin";
      existing.coins = Math.max(1000, existing.coins || 0);
      db._save();
    }
  }
  console.log("[test-server] contas liberadas: 1/1 e 2/2; Admin habilitado");
}

/* ------------------------------ rotas ------------------------------ */

async function register(db, body) {
  const login = String(body.login || "").trim();
  const password = String(body.password || "");
  if (login.length < 1 || login.length > 32) return { code: 400, body: { ok: false, msg: "Login inválido (1-32 caracteres)" } };
  if (password.length < 1) return { code: 400, body: { ok: false, msg: "Senha obrigatória" } };
  const exist = await db.findAccountByLogin(login);
  // Duplicidade é erro de formulário, não falha de transporte. Responder
  // 200 evita o falso "Failed to load resource" no console; `ok:false`
  // continua impedindo sobrescrever ou acessar a conta existente.
  if (exist) return { code: 200, body: { ok: false, error: "ACCOUNT_EXISTS",
    msg: "Conta já existe. Use a aba Entrar." } };
  const hash = bcrypt.hashSync(password, SALT_ROUNDS);
  const acc = await db.createAccount(login, hash, "user", 0);
  return { code: 201, body: { ok: true, id: acc.id, login: acc.login, role: acc.role } };
}

async function login(db, body) {
  const login = String(body.login || "").trim();
  const password = String(body.password || "");
  const acc = await db.findAccountByLogin(login);
  if (!acc || !bcrypt.compareSync(password, acc.password_hash)) {
    return { code: 401, body: { ok: false, msg: "Login ou senha inválidos" } };
  }
  const token = newToken();
  // persiste a sessão (MySQL) — no JSON store fica em memória
  if (typeof db.createSession === "function") await db.createSession(acc.id, token);
  const characters = await db.charactersOf(acc.id);
  return {
    code: 200,
    body: {
      ok: true,
      token,
      account: { id: acc.id, login: acc.login, role: acc.role, coins: acc.coins || 0 },
      characters: characters.map((c) => ({ id: c.id, name: c.name, voc: c.voc, level: c.level })),
    },
  };
}

async function me(db, token) {
  if (!token) return { code: 401, body: { ok: false, msg: "Sem token" } };
  const acc = await db.findAccountByToken(token);
  if (!acc) return { code: 401, body: { ok: false, msg: "Sessão inválida" } };
  const characters = await db.charactersOf(acc.id);
  return {
    code: 200,
    body: {
      ok: true,
      account: { id: acc.id, login: acc.login, role: acc.role, coins: acc.coins || 0 },
      characters: characters.map((c) => ({ id: c.id, name: c.name, voc: c.voc, level: c.level })),
    },
  };
}

async function createCharacter(db, body) {
  const token = body.token;
  const acc = await db.findAccountByToken(token);
  if (!acc) return { code: 401, body: { ok: false, msg: "Sessão inválida" } };
  const name = String(body.name || "").trim();
  if (name.length < 2 || name.length > 20) return { code: 400, body: { ok: false, msg: "Nome inválido" } };
  if (await db.findCharacterByName(name)) return { code: 409, body: { ok: false, msg: "Nome já em uso" } };
  const voc = String(body.voc || "none");
  const data = typeof body.data === "string" ? body.data : JSON.stringify(body.data || {});
  const c = await db.createCharacter(acc.id, name, voc, 1, data);
  return { code: 201, body: { ok: true, character: { id: c.id, name: c.name, voc: c.voc, level: c.level } } };
}

async function loadCharacter(db, token, id) {
  const acc = await db.findAccountByToken(token);
  if (!acc) return { code:401, body:{ok:false,msg:"Sessão inválida"} };
  const character = await db.findCharacter(id);
  if (!character || Number(character.account_id) !== Number(acc.id))
    return { code:404, body:{ok:false,msg:"Personagem não encontrado"} };
  return {
    code:200,
    body:{
      ok:true,
      character:{
        id:character.id, name:character.name, voc:character.voc,
        level:character.level, data:character.data,
      },
    },
  };
}

async function saveCharacter(db, body, id) {
  const acc = await db.findAccountByToken(body.token);
  if (!acc) return { code: 401, body: { ok: false, msg: "Sessão inválida" } };
  const c = await db.findCharacter(id);
  if (!c || c.account_id !== acc.id) return { code: 404, body: { ok: false, msg: "Personagem não encontrado" } };
  const voc = body.voc || c.voc;
  const level = body.level || c.level;
  const data = typeof body.data === "string" ? body.data : JSON.stringify(body.data || {});
  // snapshots de vida/mana (o cliente manda hp/mp/maxHp/maxMp a cada save) —
  // usados pelo painel de party para mostrar as barras dos membros
  await db.updateCharacter(id, voc, level, data, {
    hp: Math.max(0, Math.floor(Number(body.hp) || 0)),
    mp: Math.max(0, Math.floor(Number(body.mp) || 0)),
    max_hp: Math.max(0, Math.floor(Number(body.maxHp) || 0)),
    max_mp: Math.max(0, Math.floor(Number(body.maxMp) || 0)),
  });
  return { code: 200, body: { ok: true } };
}

async function coins(db, body) {
  const acc = await db.findAccountByToken(body.token);
  if (!acc) return { code: 401, body: { ok: false, msg: "Sessão inválida" } };
  const amount = Math.max(-999999, Math.min(999999, Math.floor(Number(body.amount) || 0)));
  const novo = (acc.coins || 0) + amount;
  await db.updateCoins(acc.id, novo);
  return { code: 200, body: { ok: true, coins: novo } };
}

/* ------------------------------ MARKET P2P ------------------------------ */

/* ====================== REGRAS OFICIAIS DO MARKET ======================
 * (manual do Tibia, secao 4.3.3 The Market)
 *  - fee de 2% ao criar oferta (mín 20 gp, máx 1.000.000), pago do banco;
 *  - ofertas duram 30 dias (item volta pro depot/inbox, dinheiro pro banco);
 *  - vendedor usa itens do DEPOT; comprador recebe no depot/inbox;
 *  - buy offers: quem quer comprar deixa oferta com o preço que paga;
 *  - MATCH AUTOMATICO: ao criar oferta, se existir contra-oferta compativel
 *    (sell <= buy) a venda acontece na hora;
 *  - preco medio por item (market_stats) p/ avisar oferta injusta (25%).
 * ====================================================================== */

/* Fee de 2% (mín 20, máx 1.000.000) */
function marketFee(price) {
  return Math.max(20, Math.min(1000000, Math.round(price * 0.02)));
}

/* Cria uma oferta (venda de item/TC, ou COMPRA de item). */
async function marketCreate(db, body, charName) {
  const acc = await db.findAccountByToken(body.token);
  if (!acc) return { code: 401, body: { ok: false, msg: "Sessão inválida" } };
  const kind = body.kind === "coins" ? "coins" : body.kind === "buy" ? "buy" : "item";
  const price = Math.floor(Number(body.price) || 0);
  if (price <= 0) return { code: 400, body: { ok: false, msg: "Preço inválido" } };
  if (price > 999999999999) return { code: 400, body: { ok: false, msg: "Preço acima do máximo" } };
  const fee = marketFee(price);
  const qty = Math.max(1, Math.floor(Number(body.qty) || 1));
  if (qty > 64000) return { code: 400, body: { ok: false, msg: "Máximo 64.000 itens por oferta" } };
  // limite de 100 ofertas ativas por personagem
  const minhas = await db.sellerOffers(acc.id);
  const ativas = minhas.filter((o) => o.status === "active").length;
  if (ativas >= 100) return { code: 400, body: { ok: false, msg: "Máximo de 100 ofertas ativas" } };

  // ---- fee (2%) pago do banco (market_gold) ----
  const feePago = await db.payMarketFee(acc.id, fee);
  if (!feePago) return { code: 400, body: { ok: false, msg: "Ouro insuficiente no banco para a taxa (2%)" } };

  // ---- pagamentos/travas conforme o tipo ----
  if (kind === "coins") {
    if (qty > (acc.coins || 0)) {
      await db.refundMarketFee(acc.id, fee);
      return { code: 400, body: { ok: false, msg: "Tibia Coins insuficientes" } };
    }
    await db.updateCoins(acc.id, (acc.coins || 0) - qty);
  } else if (kind === "buy") {
    // oferta de COMPRA: trava o dinheiro (preco x qtd) no banco
    const total = price * qty;
    const ok = await db.payMarketGold(acc.id, total);
    if (!ok) {
      await db.refundMarketFee(acc.id, fee);
      return { code: 400, body: { ok: false, msg: "Ouro insuficiente no banco para a oferta" } };
    }
    if (!body.slug) return { code: 400, body: { ok: false, msg: "Item inválido" } };
  } else {
    if (!body.slug) return { code: 400, body: { ok: false, msg: "Item inválido" } };
  }

  // duração fixa: 30 dias (regra oficial)
  const expires = new Date(Date.now() + 30 * 86400000).toISOString();
  const offer = await db.createMarketOffer({
    seller_id: acc.id,
    seller_name: charName || acc.login,
    kind,
    slug: (kind === "item" || kind === "buy") ? body.slug : null,
    tier: Math.max(0, Math.floor(Number(body.tier) || 0)),
    data: (kind === "item" || kind === "buy") ? (body.data || null) : null,
    qty,
    price,
    price_tc: body.price_tc ? 1 : 0,
    expires_at: expires,
  });

  // ---- MATCH AUTOMATICO: casa com contra-oferta existente ----
  const matched = await marketTryMatch(db, offer, acc, charName);
  return { code: 201, body: { ok: true, offer, fee, matched } };
}

/* Tenta casar uma oferta nova com contra-ofertas ativas.
 * sell (preço P) casa com buy (preço >= P); buy casa com sell (preço <= P). */
async function marketTryMatch(db, nova, acc, charName) {
  const slug = nova.slug, tier = nova.tier || 0;
  if (!slug) return null;   // TC nao casa automatico por enquanto
  const isSell = nova.kind === "item";
  const alvos = await db.marketOffers({ slug, tier });
  const contra = alvos.filter((o) =>
    o.id !== nova.id && o.seller_id !== acc.id &&
    (isSell ? o.kind === "buy" && o.price >= nova.price
            : o.kind === "item" && o.price <= nova.price));
  if (!contra.length) return null;
  const melhor = contra.sort((a, b) => (isSell ? b.price - a.price : a.price - b.price))[0];
  // executa a venda: qtd = min(qtds)
  const q = Math.min(melhor.qty, nova.qty);
  const valor = melhor.price * q;
  await db.updateMarketOffer(melhor.id, { status: "sold", buyer_id: acc.id, bought_at: new Date().toISOString() });
  await db.updateMarketOffer(nova.id, { status: "sold", qty: nova.qty - q, bought_at: new Date().toISOString() });
  // registra a venda nas stats
  await db.recordSale(slug, tier, melhor.price);
  if (isSell) {
    // vendedor (nova) recebe no banco; comprador (melhor) recebe o item
    await db.addAccountMarketGold(acc.id, valor);
    return { mode: "sell-matched", qty: q, price: melhor.price, against: melhor.seller_name || melhor.seller_id, fee: marketFee(nova.price) };
  } else {
    // comprador (nova) recebe o item; vendedor (melhor) recebe no banco
    await db.addAccountMarketGold(melhor.seller_id, valor);
    return { mode: "buy-matched", qty: q, price: melhor.price, against: melhor.seller_name || melhor.seller_id, fee: marketFee(nova.price) };
  }
}

/* Lista ofertas ativas (market P2P). */
async function marketList(db, q) {
  const filter = {};
  if (q.get("kind")) filter.kind = q.get("kind");
  if (q.get("tier")) filter.tier = q.get("tier");
  if (q.get("seller")) filter.seller = q.get("seller");
  if (q.get("slug")) filter.slug = q.get("slug");
  const offers = await db.marketOffers(filter);
  // inclui o preço médio de cada item (stats) para o cliente avisar
  // ofertas 25% acima/abaixo da média
  const withStats = [];
  for (const o of offers) {
    if (o.kind === "item" || o.kind === "buy") {
      const st = await db.itemStats(o.slug, o.tier || 0);
      if (st) o.stats = st;
    }
    withStats.push(o);
  }
  return { code: 200, body: { ok: true, offers: withStats } };
}

/* Minhas ofertas. */
async function marketMine(db, token) {
  const acc = await db.findAccountByToken(token);
  if (!acc) return { code: 401, body: { ok: false, msg: "Sessão inválida" } };
  const offers = await db.sellerOffers(acc.id);
  return { code: 200, body: { ok: true, offers } };
}

/* Compra/aceita uma oferta (P2P).
 * - oferta kind=item: o comprador paga e recebe o item;
 * - oferta kind=buy: o comprador é quem QUER comprar — quem aceita vende
 *   (vendedor entrega item e recebe o dinheiro da oferta);
 * - oferta kind=coins: compra de TC por gold.
 */
async function marketBuy(db, body, actorName) {
  const acc = await db.findAccountByToken(body.token);
  if (!acc) return { code: 401, body: { ok: false, msg: "Sessão inválida" } };
  const offer = await db.findMarketOffer(Number(body.offer_id));
  if (!offer || offer.status !== "active")
    return { code: 404, body: { ok: false, msg: "Oferta não encontrada ou expirada" } };
  if (offer.seller_id === acc.id)
    return { code: 400, body: { ok: false, msg: "Não pode negociar a própria oferta" } };
  if (offer.expires_at && new Date(offer.expires_at).getTime() < Date.now())
    return { code: 410, body: { ok: false, msg: "Oferta expirada" } };

  const qty = Math.min(offer.qty, Math.max(1, Math.floor(Number(body.qty) || offer.qty)));
  const valor = offer.price * qty;

  if (offer.kind === "buy") {
    // -------- ACEITAR OFERTA DE COMPRA: quem aceita VENDE -------
    // o dinheiro da oferta já está travado no banco do comprador (seller_id)
    // -> credita ao vendedor (actor) e "entrega" o item
    await db.addAccountMarketGold(acc.id, valor);
    await db.recordSale(offer.slug, offer.tier || 0, offer.price);
    // histórico de trade (v36: DB expandida)
    await db.addMarketHistory({
      seller_id: acc.id, seller_name: actorName,
      buyer_id: offer.seller_id, buyer_name: offer.seller_name,
      kind: "item", slug: offer.slug, tier: offer.tier || 0,
      qty, price: valor, price_tc: 0,
    });
    await db.updateMarketOffer(offer.id, {
      status: "sold", qty: offer.qty - qty,
      buyer_id: acc.id, bought_at: new Date().toISOString(),
    });
    return {
      code: 200,
      body: {
        ok: true,
        action: "sell-to-buyoffer",
        item: { slug: offer.slug, tier: offer.tier, data: offer.data, qty },
        price: offer.price,
        total: valor,
        buyer_name: offer.seller_name,
      },
    };
  }

  // -------- COMPRA NORMAL (sell offer / TC) -------
  if (offer.price_tc) {
    if ((acc.coins || 0) < valor)
      return { code: 400, body: { ok: false, msg: "Tibia Coins insuficientes" } };
    await db.updateCoins(acc.id, (acc.coins || 0) - valor);
    const seller = await db.findAccountById(offer.seller_id);
    if (seller) await db.updateCoins(seller.id, (seller.coins || 0) + valor);
  } else {
    // gold: usa o banco (market_gold) do comprador
    const ok = await db.payMarketGold(acc.id, valor);
    if (!ok) return { code: 400, body: { ok: false, msg: "Ouro insuficiente no banco" } };
    await db.addAccountMarketGold(offer.seller_id, valor);
    if (offer.kind === "coins" && qty > 0) {
      await db.updateCoins(acc.id, (acc.coins || 0) + qty);
    }
    if (offer.kind === "item") await db.recordSale(offer.slug, offer.tier || 0, offer.price);
  }

  await db.updateMarketOffer(offer.id, {
    status: "sold", qty: offer.qty - qty,
    buyer_id: acc.id, bought_at: new Date().toISOString(),
  });
  // histórico de trade (v36: DB expandida)
  await db.addMarketHistory({
    seller_id: offer.seller_id, seller_name: offer.seller_name,
    buyer_id: acc.id, buyer_name: actorName,
    kind: offer.kind, slug: offer.slug, tier: offer.tier || 0,
    qty, price: valor, price_tc: !!offer.price_tc,
  });
  return {
    code: 200,
    body: {
      ok: true,
      item: offer.kind === "item"
        ? { slug: offer.slug, tier: offer.tier, data: offer.data, qty }
        : null,
      coins: offer.kind === "coins" ? qty : 0,
      seller_name: offer.seller_name,
      price: offer.price,
      total: valor,
      price_tc: !!offer.price_tc,
    },
  };
}

/* Histórico de trades (últimos 600). */
async function marketHistory(db, token, limit) {
  const acc = await db.findAccountByToken(token);
  if (!acc) return { code: 401, body: { ok: false, msg: "Sessão inválida" } };
  const rows = await db.marketHistory(limit);
  return { code: 200, body: { ok: true, history: rows } };
}

/* Rankings (top personagens por nível ou kills). */
async function rankings(db, by, limit) {
  const rows = await db.rankings(by, limit);
  return { code: 200, body: { ok: true, rankings: rows } };
}

/* Cancela uma oferta (só o dono); devolve item/TC. */
async function marketCancel(db, body, id) {
  const acc = await db.findAccountByToken(body.token);
  if (!acc) return { code: 401, body: { ok: false, msg: "Sessão inválida" } };
  const offer = await db.findMarketOffer(Number(id));
  if (!offer || offer.seller_id !== acc.id)
    return { code: 404, body: { ok: false, msg: "Oferta não encontrada" } };
  if (offer.status !== "active")
    return { code: 400, body: { ok: false, msg: "Oferta já finalizada" } };
  await db.updateMarketOffer(offer.id, { status: "cancelled" });
  // devolve o que estava travado:
  //  - oferta de venda de TC: TC de volta pra conta
  //  - oferta de COMPRA (buy): dinheiro de volta pro banco (market_gold)
  if (offer.kind === "coins") {
    await db.updateCoins(acc.id, (acc.coins || 0) + offer.qty);
  } else if (offer.kind === "buy") {
    await db.addAccountMarketGold(acc.id, offer.price * offer.qty);
  }
  return {
    code: 200,
    body: {
      ok: true,
      refundCoins: offer.kind === "coins" ? offer.qty : 0,
      refundGold: offer.kind === "buy" ? offer.price * offer.qty : 0,
    },
  };
}

/* Coleta o gold pendente de vendas do market (ao entrar no jogo). */
async function marketClaim(db, token) {
  const acc = await db.findAccountByToken(token);
  if (!acc) return { code: 401, body: { ok: false, msg: "Sessão inválida" } };
  const gold = await db.claimMarketGold(acc.id);
  return { code: 200, body: { ok: true, gold } };
}

/* Depósito no banco do market (o cliente debita do p.gold do personagem).
 * body: { token, amount } */
async function marketDeposit(db, body) {
  const acc = await db.findAccountByToken(body.token);
  if (!acc) return { code: 401, body: { ok: false, msg: "Sessão inválida" } };
  const amount = Math.max(0, Math.floor(Number(body.amount) || 0));
  if (amount <= 0) return { code: 400, body: { ok: false, msg: "Valor inválido" } };
  await db.addAccountMarketGold(acc.id, amount);
  const gold = await db.accountMarketGold(acc.id);
  return { code: 200, body: { ok: true, bank: gold } };
}

/* Saque do banco do market (o cliente credita no p.gold).
 * body: { token, amount } */
async function marketWithdraw(db, body) {
  const acc = await db.findAccountByToken(body.token);
  if (!acc) return { code: 401, body: { ok: false, msg: "Sessão inválida" } };
  const amount = Math.max(0, Math.floor(Number(body.amount) || 0));
  if (amount <= 0) return { code: 400, body: { ok: false, msg: "Valor inválido" } };
  const tem = await db.accountMarketGold(acc.id);
  if (tem < amount) return { code: 400, body: { ok: false, msg: "Saldo insuficiente no banco" } };
  // desconta do banco (market_gold) sem passar pelo claim (claim zera tudo)
  const ok = await db.payMarketGold(acc.id, amount);
  if (!ok) return { code: 400, body: { ok: false, msg: "Saldo insuficiente no banco" } };
  const gold = await db.accountMarketGold(acc.id);
  return { code: 200, body: { ok: true, bank: gold, amount } };
}

/* Saldo do banco do market. */
async function marketBank(db, token) {
  const acc = await db.findAccountByToken(token);
  if (!acc) return { code: 401, body: { ok: false, msg: "Sessão inválida" } };
  const gold = await db.accountMarketGold(acc.id);
  return { code: 200, body: { ok: true, bank: gold } };
}

/* ------------------------- storage (sessions) -------------------------
 * O JsonStore nao tem tabela de sessao: guarda token no proprio account.
 * O MysqlStore implementa createSession/findAccountByToken. */

/* ------------------------------ servidor ------------------------------ */

async function main() {
  const db = await getDb();

  // garante metodos de sessao no JsonStore
  if (!db.findAccountByToken) {
    db.findAccountByToken = async function (token) {
      return this.accounts.find((a) => a.token === token) || null;
    };
    db.createSession = async function (accountId, token) {
      const a = this.findAccountById(accountId);
      if (a) { a.token = token; this._save(); }
    };
    db.updateCoins = async function (id, coins) {
      const a = this.findAccountById(id);
      if (a) { a.coins = Math.max(0, coins); this._save(); return a; }
      return null;
    };
  }
  // garante metodos de sessao no MysqlStore
  if (typeof db.findAccountByToken !== "function" || !db.findAccountByToken) {
    db.findAccountByToken = async function (token) {
      const rows = await this.query(
        "SELECT a.* FROM accounts a JOIN sessions s ON s.account_id = a.id WHERE s.token = ?",
        [token]);
      return rows[0] || null;
    };
    db.createSession = async function (accountId, token) {
      await this.run("INSERT INTO sessions (account_id, token) VALUES (?, ?)",
        [accountId, token]);
    };
    db.updateCoins = async function (id, coins) {
      await this.run("UPDATE accounts SET coins = ? WHERE id = ?", [coins, id]);
      return this.findAccountById(id);
    };
    db.findAccountById = async function (id) {
      const rows = await this.query("SELECT * FROM accounts WHERE id = ?", [id]);
      return rows[0] || null;
    };
  }

  await ensureTestAccounts(db);

  const server = http.createServer(async (req, res) => {
    // CORS preflight
    if (req.method === "OPTIONS") { send(res, 204, {}); return; }

    const url = req.url.split("?")[0];
    try {
      if (req.method === "GET" && url === "/api/health") {
        return send(res, 200, { ok:true, testServer:TEST_SERVER, accounts:TEST_SERVER ? ["1/1","2/2"] : [] });
      }
      if (req.method === "GET" && url === "/js/server-config.js") {
        const config = `window.GLOBAL_IDLE_SERVER_CONFIG={online:true,testServer:${
          TEST_SERVER ? "true" : "false"},apiUrl:window.location.origin};\n`;
        return sendText(res, 200, config, "text/javascript; charset=utf-8");
      }
      if (req.method === "POST" && url === "/api/register") {
        const body = await readBody(req);
        const r = await register(db, body);
        return send(res, r.code, r.body);
      }
      if (req.method === "POST" && url === "/api/login") {
        const body = await readBody(req);
        const r = await login(db, body);
        return send(res, r.code, r.body);
      }
      if (req.method === "GET" && url === "/api/me") {
        const token = (req.headers.authorization || "").replace("Bearer ", "");
        const r = await me(db, token);
        return send(res, r.code, r.body);
      }
      if (req.method === "POST" && url === "/api/characters") {
        const body = await readBody(req);
        const r = await createCharacter(db, body);
        return send(res, r.code, r.body);
      }
      if (req.method === "GET" && url.startsWith("/api/characters/")) {
        const id = Number(url.split("/").pop());
        const token = (req.headers.authorization || "").replace("Bearer ", "");
        const r = await loadCharacter(db, token, id);
        return send(res, r.code, r.body);
      }
      if (req.method === "PUT" && url.startsWith("/api/characters/")) {
        const id = Number(url.split("/").pop());
        const body = await readBody(req);
        const r = await saveCharacter(db, body, id);
        return send(res, r.code, r.body);
      }
      if (req.method === "POST" && url === "/api/coins") {
        const body = await readBody(req);
        const r = await coins(db, body);
        return send(res, r.code, r.body);
      }
      // ---- MARKET P2P ----
      if (req.method === "POST" && url === "/api/market/offers") {
        const body = await readBody(req);
        // seller_name: vem do cliente (personagem que vende)
        const r = await marketCreate(db, body, body.seller_name || body.sellerName);
        return send(res, r.code, r.body);
      }
      if (req.method === "GET" && url === "/api/market/offers") {
        const q = new URL(req.url, "http://x").searchParams;
        const r = await marketList(db, q);
        return send(res, r.code, r.body);
      }
      if (req.method === "GET" && url === "/api/market/mine") {
        const token = (req.headers.authorization || "").replace("Bearer ", "");
        const r = await marketMine(db, token);
        return send(res, r.code, r.body);
      }
      if (req.method === "POST" && url === "/api/market/buy") {
        const body = await readBody(req);
        const r = await marketBuy(db, body, body.buyer_name || body.buyerName);
        return send(res, r.code, r.body);
      }
      if (req.method === "DELETE" && url.startsWith("/api/market/offers/")) {
        const id = Number(url.split("/").pop());
        const body = await readBody(req);
        const r = await marketCancel(db, body, id);
        return send(res, r.code, r.body);
      }
      if (req.method === "POST" && url === "/api/market/claim") {
        const body = await readBody(req);
        const r = await marketClaim(db, body.token);
        return send(res, r.code, r.body);
      }
      if (req.method === "POST" && url === "/api/market/deposit") {
        const body = await readBody(req);
        const r = await marketDeposit(db, body);
        return send(res, r.code, r.body);
      }
      if (req.method === "POST" && url === "/api/market/withdraw") {
        const body = await readBody(req);
        const r = await marketWithdraw(db, body);
        return send(res, r.code, r.body);
      }
      if (req.method === "GET" && url === "/api/market/bank") {
        const token = (req.headers.authorization || "").replace("Bearer ", "");
        const r = await marketBank(db, token);
        return send(res, r.code, r.body);
      }
      if (req.method === "GET" && url === "/api/market/history") {
        const token = (req.headers.authorization || "").replace("Bearer ", "");
        const q = new URL(req.url, "http://x").searchParams;
        const r = await marketHistory(db, token, Number(q.get("limit")) || 100);
        return send(res, r.code, r.body);
      }
      // ---- RANKINGS (DB expandida) ----
      if (req.method === "GET" && url === "/api/rankings") {
        const q = new URL(req.url, "http://x").searchParams;
        const r = await rankings(db, q.get("by") || "level", Number(q.get("limit")) || 50);
        return send(res, r.code, r.body);
      }
      // ---- PARTY (multiplayer: convites assíncronos + follow) ----
      if (req.method === "POST" && url === "/api/party/create") {
        const body = await readBody(req);
        const r = await party.partyCreate(db, body);
        return send(res, r.code, r.body);
      }
      if (req.method === "POST" && url === "/api/party/invite") {
        const body = await readBody(req);
        const r = await party.partyInvite(db, body);
        return send(res, r.code, r.body);
      }
      if (req.method === "GET" && url === "/api/party/inbox") {
        const token = (req.headers.authorization || "").replace("Bearer ", "");
        const r = await party.partyInbox(db, token);
        return send(res, r.code, r.body);
      }
      if (req.method === "POST" && url === "/api/party/accept") {
        const body = await readBody(req);
        const r = await party.partyAccept(db, body);
        return send(res, r.code, r.body);
      }
      if (req.method === "POST" && url === "/api/party/decline") {
        const body = await readBody(req);
        const r = await party.partyDecline(db, body);
        return send(res, r.code, r.body);
      }
      if (req.method === "POST" && url === "/api/party/leave") {
        const body = await readBody(req);
        const r = await party.partyLeave(db, body);
        return send(res, r.code, r.body);
      }
      if (req.method === "POST" && url === "/api/party/kick") {
        const body = await readBody(req);
        const r = await party.partyKick(db, body);
        return send(res, r.code, r.body);
      }
      if (req.method === "GET" && url === "/api/party/state") {
        const token = (req.headers.authorization || "").replace("Bearer ", "");
        const q = new URL(req.url, "http://x").searchParams;
        const r = await party.partyState(db, token, q.get("char_id"));
        return send(res, r.code, r.body);
      }
      if (req.method === "POST" && url === "/api/party/zone") {
        const body = await readBody(req);
        const r = await party.partyReportZone(db, body);
        return send(res, r.code, r.body);
      }
      if (req.method === "POST" && url === "/api/party/follow") {
        const body = await readBody(req);
        const r = await party.partyFollow(db, body);
        return send(res, r.code, r.body);
      }
      if ((req.method === "GET" || req.method === "HEAD") && !url.startsWith("/api/")) {
        return serveStatic(req, res, url);
      }
      send(res, 404, { ok: false, msg: "Rota não encontrada" });
    } catch (e) {
      console.error("[server] erro:", e);
      send(res, 500, { ok: false, msg: "Erro interno: " + e.message });
    }
  });

  server.listen(PORT, HOST, () => {
    console.log("[server] Global-Idle em http://" + HOST + ":" + PORT);
    console.log("[server] estáticos:", STATIC_DIR);
    console.log("[server] registre/login: POST /api/register e /api/login");
    if (TEST_SERVER) console.log("[server] TEST SERVER ativo — Admin liberado para testers");
  });
}

main().catch((e) => { console.error(e); process.exit(1); });
