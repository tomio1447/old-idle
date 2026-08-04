/*
 * db.js — acesso ao banco.
 *
 * Usa MySQL (mysql2/promise) quando configurado via .env; se MYSQL_HOST
 * estiver vazio, cai num storage JSON local (arquivos em ./data) para
 * rodar/desenvolver sem servidor de banco. A API é a mesma para os dois:
 *   db.query(sql, params) -> rows
 *   db.run(sql, params)    -> result (insertId, affectedRows)
 */
"use strict";

const fs = require("fs");
const path = require("path");

// ---- configuração via .env (MYSQL_HOST, MYSQL_USER, ...) ----
const MYSQL_HOST = process.env.MYSQL_HOST || "";
const MYSQL_USER = process.env.MYSQL_USER || "root";
const MYSQL_PASS = process.env.MYSQL_PASS || "";
const MYSQL_DB   = process.env.MYSQL_DB   || "global_idle";
const MYSQL_PORT = parseInt(process.env.MYSQL_PORT || "3306", 10);

const DATA_DIR = path.join(__dirname, "data");

/* Storage JSON local (fallback sem MySQL): dois arquivos
 * data/accounts.json e data/characters.json */
function JsonStore() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  this.accounts = this._load("accounts.json", []);
  this.characters = this._load("characters.json", []);
  this._save();
}
JsonStore.prototype._load = function (file, dft) {
  try {
    return JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), "utf8"));
  } catch (e) { return dft; }
};
JsonStore.prototype._save = function () {
  fs.writeFileSync(path.join(DATA_DIR, "accounts.json"),
    JSON.stringify(this.accounts, null, 1));
  fs.writeFileSync(path.join(DATA_DIR, "characters.json"),
    JSON.stringify(this.characters, null, 1));
};
JsonStore.prototype._nextId = function (arr) {
  return arr.reduce((m, x) => Math.max(m, x.id || 0), 0) + 1;
};
JsonStore.prototype.findAccountByLogin = function (login) {
  return this.accounts.find((a) => a.login === login) || null;
};
JsonStore.prototype.findAccountById = function (id) {
  return this.accounts.find((a) => a.id === Number(id)) || null;
};
JsonStore.prototype.createAccount = function (login, hash, role, coins) {
  const acc = { id: this._nextId(this.accounts), login, password_hash: hash,
                role: role || "user", coins: coins || 0,
                created_at: new Date().toISOString() };
  this.accounts.push(acc);
  this._save();
  return acc;
};
JsonStore.prototype.updateCoins = function (id, coins) {
  const a = this.findAccountById(id);
  if (a) { a.coins = Math.max(0, coins); this._save(); return a; }
  return null;
};
JsonStore.prototype.charactersOf = function (accountId) {
  return this.characters.filter((c) => c.account_id === Number(accountId));
};
JsonStore.prototype.findCharacterByName = function (name) {
  return this.characters.find((c) => c.name.toLowerCase() === String(name).toLowerCase()) || null;
};
JsonStore.prototype.findCharacter = function (id) {
  return this.characters.find((c) => c.id === Number(id)) || null;
};
JsonStore.prototype.createCharacter = function (accountId, name, voc, level, data) {
  const c = { id: this._nextId(this.characters), account_id: Number(accountId),
              name, voc, level, data,
              created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
  this.characters.push(c);
  this._save();
  return c;
};
JsonStore.prototype.updateCharacter = function (id, voc, level, data) {
  const c = this.findCharacter(id);
  if (c) {
    c.voc = voc; c.level = level; c.data = data;
    c.updated_at = new Date().toISOString();
    this._save();
  }
  return c;
};
JsonStore.prototype._marketSeq = 1;
JsonStore.prototype._nextOfferId = function () {
  this._marketSeq += 1;
  return this._marketSeq;
};
JsonStore.prototype.createMarketOffer = function (offer) {
  offer.id = this._nextOfferId();
  offer.status = "active";
  offer.created_at = new Date().toISOString();
  this.market = this.market || [];
  this.market.push(offer);
  this._save();
  return offer;
};
JsonStore.prototype.marketOffers = function (filter) {
  this.market = this.market || [];
  const now = Date.now();
  return this.market.filter((o) => {
    if (o.status !== "active") return false;
    if (filter.kind && o.kind !== filter.kind) return false;
    if (filter.tier !== undefined && filter.tier !== "" &&
        o.tier !== Number(filter.tier)) return false;
    if (filter.seller && o.seller_id !== Number(filter.seller)) return false;
    if (filter.slug && o.slug !== filter.slug) return false;
    if (o.expires_at && new Date(o.expires_at).getTime() < now) {
      o.status = "expired";
      this._save();
      return false;
    }
    return true;
  }).sort((a, b) => a.price - b.price);
};
JsonStore.prototype.findMarketOffer = function (id) {
  this.market = this.market || [];
  return this.market.find((o) => o.id === Number(id)) || null;
};
JsonStore.prototype.updateMarketOffer = function (id, patch) {
  const o = this.findMarketOffer(id);
  if (o) { Object.assign(o, patch); this._save(); }
  return o;
};
JsonStore.prototype.sellerOffers = function (sellerId) {
  this.market = this.market || [];
  return this.market.filter((o) => o.seller_id === Number(sellerId));
};
JsonStore.prototype.accountMarketGold = function (accountId) {
  const a = this.findAccountById(accountId);
  return a ? (a.market_gold || 0) : 0;
};
JsonStore.prototype.addAccountMarketGold = function (accountId, amount) {
  const a = this.findAccountById(accountId);
  if (a) { a.market_gold = (a.market_gold || 0) + Math.max(0, amount); this._save(); }
};
JsonStore.prototype.payMarketFee = function (accountId, amount) {
  const a = this.findAccountById(accountId);
  if (!a || (a.market_gold || 0) < amount) return false;
  a.market_gold = (a.market_gold || 0) - amount;
  this._save();
  return true;
};
JsonStore.prototype.refundMarketFee = function (accountId, amount) {
  const a = this.findAccountById(accountId);
  if (!a) return;
  a.market_gold = (a.market_gold || 0) + amount;
  this._save();
};
JsonStore.prototype.payMarketGold = function (accountId, amount) {
  return this.payMarketFee(accountId, amount);
};
JsonStore.prototype.claimMarketGold = function (accountId) {
  // As vendas caem DIRETO no banco (market_gold). Nada pendente para
  // "coletar" — o saque e feito pela rota /api/market/withdraw.
  return 0;
};
JsonStore.prototype.recordSale = function (slug, tier, price) {
  this.marketStats = this.marketStats || {};
  const key = slug + ":" + (tier || 0);
  const s = this.marketStats[key] || { count: 0, total: 0, last_price: 0 };
  s.count += 1;
  s.total += price;
  s.last_price = price;
  this.marketStats[key] = s;
  this._save();
};
JsonStore.prototype.itemStats = function (slug, tier) {
  this.marketStats = this.marketStats || {};
  const s = this.marketStats[slug + ":" + (tier || 0)];
  if (!s) return null;
  return { count: s.count, avg: Math.round(s.total / Math.max(1, s.count)), last: s.last_price };
};

/* Wrapper MySQL (mysql2/promise) — mesma API do JsonStore */
async function MysqlStore() {
  const mysql = require("mysql2/promise");
  const pool = mysql.createPool({
    host: MYSQL_HOST, user: MYSQL_USER, password: MYSQL_PASS,
    database: MYSQL_DB, port: MYSQL_PORT,
    waitForConnections: true, connectionLimit: 10,
    charset: "utf8mb4",
  });
  // garante o schema (tabelas) no primeiro uso
  await ensureSchema(pool);
  const db = {
    async query(sql, params) { const [rows] = await pool.query(sql, params || []); return rows; },
    async run(sql, params) { const [r] = await pool.query(sql, params || []); return r; },
    async end() { await pool.end(); },

    async findAccountByLogin(login) {
      const rows = await this.query("SELECT * FROM accounts WHERE login = ?", [login]);
      return rows[0] || null;
    },
    async findAccountById(id) {
      const rows = await this.query("SELECT * FROM accounts WHERE id = ?", [Number(id)]);
      return rows[0] || null;
    },
    async createAccount(login, hash, role, coins) {
      const r = await this.run(
        "INSERT INTO accounts (login, password_hash, role, coins) VALUES (?, ?, ?, ?)",
        [login, hash, role || "user", coins || 0]);
      return { id: r.insertId, login, password_hash: hash, role: role || "user", coins: coins || 0 };
    },
    async updateCoins(id, coins) {
      await this.run("UPDATE accounts SET coins = ? WHERE id = ?", [Math.max(0, coins), Number(id)]);
      return this.findAccountById(id);
    },
    async charactersOf(accountId) {
      return this.query(
        "SELECT id, account_id, name, voc, level, data, created_at, updated_at FROM characters WHERE account_id = ?",
        [Number(accountId)]);
    },
    async findCharacterByName(name) {
      const rows = await this.query(
        "SELECT * FROM characters WHERE LOWER(name) = LOWER(?)", [String(name)]);
      return rows[0] || null;
    },
    async findCharacter(id) {
      const rows = await this.query("SELECT * FROM characters WHERE id = ?", [Number(id)]);
      return rows[0] || null;
    },
    async createCharacter(accountId, name, voc, level, data) {
      const r = await this.run(
        "INSERT INTO characters (account_id, name, voc, level, data) VALUES (?, ?, ?, ?, ?)",
        [Number(accountId), name, voc, level, data]);
      return { id: r.insertId, account_id: Number(accountId), name, voc, level, data };
    },
    async updateCharacter(id, voc, level, data) {
      await this.run(
        "UPDATE characters SET voc = ?, level = ?, data = ? WHERE id = ?",
        [voc, level, data, Number(id)]);
      return this.findCharacter(id);
    },
    async findAccountByToken(token) {
      const rows = await this.query(
        "SELECT a.* FROM accounts a JOIN sessions s ON s.account_id = a.id WHERE s.token = ?",
        [token]);
      return rows[0] || null;
    },
    async createSession(accountId, token) {
      await this.run("INSERT INTO sessions (account_id, token) VALUES (?, ?)",
        [Number(accountId), token]);
    },

    // ---- MARKET P2P ----
    async createMarketOffer(offer) {
      const r = await this.run(
        `INSERT INTO market_offers
          (seller_id, seller_name, kind, slug, tier, data, qty, price, price_tc, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [offer.seller_id, offer.seller_name, offer.kind, offer.slug || null,
         offer.tier || 0, offer.data || null, offer.qty || 1,
         offer.price, offer.price_tc ? 1 : 0, offer.expires_at || null]);
      return this.findMarketOffer(r.insertId);
    },
    async marketOffers(filter) {
      filter = filter || {};
      const cond = ["status='active'"];
      const params = [];
      if (filter.kind) { cond.push("kind=?"); params.push(filter.kind); }
      if (filter.tier) { cond.push("tier=?"); params.push(Number(filter.tier)); }
      if (filter.seller) { cond.push("seller_id=?"); params.push(Number(filter.seller)); }
      if (filter.slug) { cond.push("slug=?"); params.push(filter.slug); }
      cond.push("(expires_at IS NULL OR expires_at > NOW())");
      return this.query(
        "SELECT * FROM market_offers WHERE " + cond.join(" AND ") +
        " ORDER BY price ASC, created_at ASC", params);
    },
    async findMarketOffer(id) {
      const rows = await this.query("SELECT * FROM market_offers WHERE id = ?", [Number(id)]);
      return rows[0] || null;
    },
    async updateMarketOffer(id, patch) {
      const set = [], params = [];
      for (const k in patch) { set.push(k + "=?"); params.push(patch[k]); }
      if (!set.length) return this.findMarketOffer(id);
      params.push(Number(id));
      await this.run("UPDATE market_offers SET " + set.join(", ") + " WHERE id = ?", params);
      return this.findMarketOffer(id);
    },
    async sellerOffers(sellerId) {
      return this.query(
        "SELECT * FROM market_offers WHERE seller_id = ? ORDER BY created_at DESC",
        [Number(sellerId)]);
    },
    async accountMarketGold(accountId) {
      const rows = await this.query("SELECT market_gold FROM accounts WHERE id = ?", [Number(accountId)]);
      return rows[0] ? (rows[0].market_gold || 0) : 0;
    },
    async addAccountMarketGold(accountId, amount) {
      await this.run("UPDATE accounts SET market_gold = market_gold + ? WHERE id = ?",
        [Math.max(0, amount), Number(accountId)]);
    },
    async payMarketFee(accountId, amount) {
      // fee sai do market_gold (banco do jogador); retorna false se insuficiente
      const r = await this.run(
        "UPDATE accounts SET market_gold = market_gold - ? WHERE id = ? AND market_gold >= ?",
        [amount, Number(accountId), amount]);
      return r.affectedRows > 0;
    },
    async refundMarketFee(accountId, amount) {
      await this.run("UPDATE accounts SET market_gold = market_gold + ? WHERE id = ?",
        [amount, Number(accountId)]);
    },
    async payMarketGold(accountId, amount) {
      const r = await this.run(
        "UPDATE accounts SET market_gold = market_gold - ? WHERE id = ? AND market_gold >= ?",
        [amount, Number(accountId), amount]);
      return r.affectedRows > 0;
    },
    async claimMarketGold(accountId) {
      // vendas caem direto no banco; saque via /withdraw
      return 0;
    },

    // ---- MARKET STATS (preço médio por item/tier) ----
    async recordSale(slug, tier, price) {
      await this.run(
        `INSERT INTO market_stats (slug, tier, count, total, last_price)
         VALUES (?, ?, 1, ?, ?)
         ON DUPLICATE KEY UPDATE
           count = count + 1, total = total + ?, last_price = ?`,
        [slug, tier || 0, price, price, price, price]);
    },
    async itemStats(slug, tier) {
      const rows = await this.query(
        "SELECT * FROM market_stats WHERE slug = ? AND tier = ?",
        [slug, tier || 0]);
      if (!rows[0]) return null;
      const s = rows[0];
      return {
        count: s.count,
        avg: Math.round(s.total / Math.max(1, s.count)),
        last: s.last_price,
      };
    },
  };
  return db;
}

async function ensureSchema(pool) {
  await pool.query(`CREATE TABLE IF NOT EXISTS accounts (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    login VARCHAR(32) NOT NULL UNIQUE,
    password_hash VARCHAR(128) NOT NULL,
    email VARCHAR(128) DEFAULT NULL,
    role ENUM('user','admin') NOT NULL DEFAULT 'user',
    coins INT UNSIGNED NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB`);
  await pool.query(`CREATE TABLE IF NOT EXISTS sessions (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    account_id INT UNSIGNED NOT NULL,
    token CHAR(64) NOT NULL UNIQUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NULL
  ) ENGINE=InnoDB`);
  await pool.query(`CREATE TABLE IF NOT EXISTS characters (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    account_id INT UNSIGNED NOT NULL,
    name VARCHAR(32) NOT NULL,
    voc VARCHAR(24) NOT NULL DEFAULT 'none',
    level INT UNSIGNED NOT NULL DEFAULT 1,
    data MEDIUMTEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_characters_name (name)
  ) ENGINE=InnoDB`);
}

/* Cria a instancia de db conforme o ambiente */
let _db = null;
async function getDb() {
  if (_db) return _db;
  if (MYSQL_HOST) {
    try {
      _db = await MysqlStore();
      console.log("[db] MySQL conectado em", MYSQL_HOST + ":" + MYSQL_PORT + "/" + MYSQL_DB);
      return _db;
    } catch (e) {
      console.warn("[db] falha no MySQL (" + e.message + ") — usando storage JSON local");
    }
  }
  _db = new JsonStore();
  console.log("[db] storage JSON local em", DATA_DIR);
  return _db;
}

module.exports = { getDb, MYSQL_HOST };
