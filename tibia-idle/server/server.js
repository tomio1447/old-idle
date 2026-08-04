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

const http = require("http");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const { getDb } = require("./db");

const PORT = parseInt(process.env.PORT || "3333", 10);
const HOST = process.env.HOST || "0.0.0.0";
const SALT_ROUNDS = 10;

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

/* ------------------------------ rotas ------------------------------ */

async function register(db, body) {
  const login = String(body.login || "").trim();
  const password = String(body.password || "");
  if (login.length < 1 || login.length > 32) return { code: 400, body: { ok: false, msg: "Login inválido (1-32 caracteres)" } };
  if (password.length < 1) return { code: 400, body: { ok: false, msg: "Senha obrigatória" } };
  const exist = await db.findAccountByLogin(login);
  if (exist) return { code: 409, body: { ok: false, msg: "Conta já existe" } };
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

async function saveCharacter(db, body, id) {
  const acc = await db.findAccountByToken(body.token);
  if (!acc) return { code: 401, body: { ok: false, msg: "Sessão inválida" } };
  const c = await db.findCharacter(id);
  if (!c || c.account_id !== acc.id) return { code: 404, body: { ok: false, msg: "Personagem não encontrado" } };
  const voc = body.voc || c.voc;
  const level = body.level || c.level;
  const data = typeof body.data === "string" ? body.data : JSON.stringify(body.data || {});
  await db.updateCharacter(id, voc, level, data);
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

/* Cria uma oferta de venda (item ou Tibia Coins). */
async function marketCreate(db, body, charName) {
  const acc = await db.findAccountByToken(body.token);
  if (!acc) return { code: 401, body: { ok: false, msg: "Sessão inválida" } };
  const kind = body.kind === "coins" ? "coins" : "item";
  const price = Math.floor(Number(body.price) || 0);
  if (price <= 0) return { code: 400, body: { ok: false, msg: "Preço inválido" } };
  if (kind === "coins") {
    const qty = Math.floor(Number(body.qty) || 0);
    if (qty <= 0 || qty > (acc.coins || 0))
      return { code: 400, body: { ok: false, msg: "Tibia Coins insuficientes" } };
    // trava os TC na oferta
    await db.updateCoins(acc.id, (acc.coins || 0) - qty);
  } else {
    if (!body.slug) return { code: 400, body: { ok: false, msg: "Item inválido" } };
  }
  const days = Math.min(30, Math.max(1, Math.floor(Number(body.days) || 7)));
  const expires = new Date(Date.now() + days * 86400000).toISOString();
  const offer = await db.createMarketOffer({
    seller_id: acc.id,
    seller_name: charName || acc.login,
    kind,
    slug: kind === "item" ? body.slug : null,
    tier: Math.max(0, Math.floor(Number(body.tier) || 0)),
    data: kind === "item" ? (body.data || null) : null,
    qty: kind === "coins" ? Math.floor(Number(body.qty) || 1) : 1,
    price,
    price_tc: body.price_tc ? 1 : 0,
    expires_at: expires,
  });
  return { code: 201, body: { ok: true, offer } };
}

/* Lista ofertas ativas (market P2P). */
async function marketList(db, q) {
  const filter = {};
  if (q.get("kind")) filter.kind = q.get("kind");
  if (q.get("tier")) filter.tier = q.get("tier");
  if (q.get("seller")) filter.seller = q.get("seller");
  if (q.get("slug")) filter.slug = q.get("slug");
  const offers = await db.marketOffers(filter);
  return { code: 200, body: { ok: true, offers } };
}

/* Minhas ofertas. */
async function marketMine(db, token) {
  const acc = await db.findAccountByToken(token);
  if (!acc) return { code: 401, body: { ok: false, msg: "Sessão inválida" } };
  const offers = await db.sellerOffers(acc.id);
  return { code: 200, body: { ok: true, offers } };
}

/* Compra uma oferta (P2P). */
async function marketBuy(db, body, buyerName) {
  const acc = await db.findAccountByToken(body.token);
  if (!acc) return { code: 401, body: { ok: false, msg: "Sessão inválida" } };
  const offer = await db.findMarketOffer(Number(body.offer_id));
  if (!offer || offer.status !== "active")
    return { code: 404, body: { ok: false, msg: "Oferta não encontrada ou expirada" } };
  if (offer.seller_id === acc.id)
    return { code: 400, body: { ok: false, msg: "Não pode comprar a própria oferta" } };
  if (offer.expires_at && new Date(offer.expires_at).getTime() < Date.now())
    return { code: 410, body: { ok: false, msg: "Oferta expirada" } };

  // cobra o comprador (gold vai para o saldo do vendedor; TC direto na conta)
  if (offer.price_tc) {
    if ((acc.coins || 0) < offer.price)
      return { code: 400, body: { ok: false, msg: "Tibia Coins insuficientes" } };
    await db.updateCoins(acc.id, (acc.coins || 0) - offer.price);
    // TC do comprador -> conta do vendedor
    const seller = await db.findAccountById(offer.seller_id);
    if (seller) await db.updateCoins(seller.id, (seller.coins || 0) + offer.price);
  } else {
    // gold: o cliente já validou o gold do personagem; o servidor credita
    // o saldo do market do vendedor (coletado no claim)
    await db.addAccountMarketGold(offer.seller_id, offer.price);
    // oferta de TC comprada com gold: credita TC DIRETO na conta do
    // comprador (não depende do cliente)
    if (offer.kind === "coins" && offer.qty > 0) {
      await db.updateCoins(acc.id, (acc.coins || 0) + offer.qty);
    }
  }

  await db.updateMarketOffer(offer.id, {
    status: "sold",
    buyer_id: acc.id,
    bought_at: new Date().toISOString(),
  });
  return {
    code: 200,
    body: {
      ok: true,
      // o que o comprador recebe (item ou TC)
      item: offer.kind === "item"
        ? { slug: offer.slug, tier: offer.tier, data: offer.data, qty: offer.qty }
        : null,
      coins: offer.kind === "coins" ? offer.qty : 0,
      seller_name: offer.seller_name,
      price: offer.price,
      price_tc: !!offer.price_tc,
    },
  };
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
  if (offer.kind === "coins") {
    await db.updateCoins(acc.id, (acc.coins || 0) + offer.qty);
  }
  return { code: 200, body: { ok: true, refundCoins: offer.kind === "coins" ? offer.qty : 0 } };
}

/* Coleta o gold pendente de vendas do market (ao entrar no jogo). */
async function marketClaim(db, token) {
  const acc = await db.findAccountByToken(token);
  if (!acc) return { code: 401, body: { ok: false, msg: "Sessão inválida" } };
  const gold = await db.claimMarketGold(acc.id);
  return { code: 200, body: { ok: true, gold } };
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

  const server = http.createServer(async (req, res) => {
    // CORS preflight
    if (req.method === "OPTIONS") { send(res, 204, {}); return; }

    const url = req.url.split("?")[0];
    try {
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
      send(res, 404, { ok: false, msg: "Rota não encontrada" });
    } catch (e) {
      console.error("[server] erro:", e);
      send(res, 500, { ok: false, msg: "Erro interno: " + e.message });
    }
  });

  server.listen(PORT, HOST, () => {
    console.log("[server] API de contas em http://" + HOST + ":" + PORT);
    console.log("[server] registre/login: POST /api/register e /api/login");
  });
}

main().catch((e) => { console.error(e); process.exit(1); });
