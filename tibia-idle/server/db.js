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
  // parties/invites persistem em data/parties.json (convites assíncronos
  // precisam sobreviver a reinícios do servidor)
  const partyData = this._load("parties.json", null);
  if (partyData && Array.isArray(partyData.parties)) {
    this.parties = partyData.parties;
    this.invites = partyData.invites || [];
  } else {
    this.parties = [];
    this.invites = [];
  }
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

/* ------------------------------ PARTY ------------------------------ */

/* Storage JSON: parties vivem em memoria + data/parties.json (para os
 * convites sobreviverem a reinicios do servidor durante dev/teste). */
JsonStore.prototype._partySeq = 1;
JsonStore.prototype._nextPartyId = function () {
  this._partySeq += 1;
  return this._partySeq;
};
JsonStore.prototype._nextInviteId = function () {
  this._inviteSeq = (this._inviteSeq || 1) + 1;
  return this._inviteSeq;
};
JsonStore.prototype._partySave = function () {
  try {
    fs.writeFileSync(path.join(DATA_DIR, "parties.json"),
      JSON.stringify({ parties: this.parties || [], invites: this.invites || [] }, null, 1));
  } catch (e) { /* não bloqueia o jogo */ }
};
JsonStore.prototype.partyCreate = function (leaderChar) {
  this.parties = this.parties || [];
  this.invites = this.invites || [];
  const p = {
    id: this._nextPartyId(), leader_id: leaderChar.id, leader_name: leaderChar.name,
    leader_zone: "unknown", leader_hunt: null, leader_instance: null,
    leader_otbm: null, leader_boss: null,
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    members: [],
  };
  this.parties.push(p);
  this._partySave();
  return p;
};
JsonStore.prototype.partyFindByLeader = function (charId) {
  this.parties = this.parties || [];
  return this.parties.find((p) => p.leader_id === Number(charId)) || null;
};
JsonStore.prototype.partyFindByCharacter = function (charId) {
  this.parties = this.parties || [];
  const id = Number(charId);
  return this.parties.find((p) =>
    p.leader_id === id || (p.members || []).some((m) => m.character_id === id)) || null;
};
JsonStore.prototype.partyMembers = function (partyId) {
  const p = (this.parties || []).find((x) => x.id === Number(partyId));
  if (!p) return [];
  return (p.members || []).map((m) => {
    const c = this.findCharacter(m.character_id);
    return {
      id: m.character_id, name: c ? c.name : "?", voc: c ? c.voc : "none",
      level: c ? c.level : 1, account_id: c ? c.account_id : null,
      follow_nonce: m.follow_nonce || null, follow_hunt: m.follow_hunt || null,
      follow_instance: m.follow_instance || null, follow_otbm: m.follow_otbm || null,
      follow_boss: m.follow_boss || null,
    };
  });
};
JsonStore.prototype.partyAddMember = function (partyId, charId) {
  const p = (this.parties || []).find((x) => x.id === Number(partyId));
  if (!p) return;
  p.members = p.members || [];
  if (!p.members.some((m) => m.character_id === Number(charId))) {
    p.members.push({ character_id: Number(charId), joined_at: new Date().toISOString() });
  }
  p.updated_at = new Date().toISOString();
  this._partySave();
};
JsonStore.prototype.partyRemoveMember = function (partyId, charId) {
  const p = (this.parties || []).find((x) => x.id === Number(partyId));
  if (!p) return;
  p.members = (p.members || []).filter((m) => m.character_id !== Number(charId));
  p.updated_at = new Date().toISOString();
  this._partySave();
};
JsonStore.prototype.partyDelete = function (partyId) {
  const id = Number(partyId);
  this.parties = (this.parties || []).filter((p) => p.id !== id);
  (this.invites || []).forEach((i) => {
    if (i.party_id === id && i.status === "pending") i.status = "cancelled";
  });
  this._partySave();
};
JsonStore.prototype.partySetZone = function (partyId, zone, opts) {
  const p = (this.parties || []).find((x) => x.id === Number(partyId));
  if (!p) return null;
  opts = opts || {};
  p.leader_zone = zone;
  p.leader_hunt = opts.hunt || null;
  p.leader_instance = opts.instance || null;
  p.leader_otbm = opts.otbm || null;
  p.leader_boss = opts.boss || null;
  p.updated_at = new Date().toISOString();
  // follow: o destino + nonce ficam POR MEMBRO (party_members.follow_*).
  // `opts.follows` = [{ character_id, nonce, hunt, instance, otbm, boss }]
  if (Array.isArray(opts.follows) && opts.follows.length) {
    (p.members || []).forEach((m) => {
      const f = opts.follows.find((x) => x.character_id === m.character_id);
      m.follow_nonce = f ? f.nonce : null;
      m.follow_hunt = f ? (f.hunt || null) : null;
      m.follow_instance = f ? (f.instance || null) : null;
      m.follow_otbm = f ? (f.otbm || null) : null;
      m.follow_boss = f ? (f.boss || null) : null;
      m.follow_at = f ? new Date().toISOString() : null;
    });
  } else if (zone === "city" || zone === "training") {
    // voltou para safe zone: limpa follows pendentes dos membros
    (p.members || []).forEach((m) => {
      m.follow_nonce = m.follow_hunt = m.follow_instance = m.follow_otbm =
        m.follow_boss = m.follow_at = null;
    });
  }
  this._partySave();
  return p;
};
JsonStore.prototype.partyFollow = function (partyId, charId) {
  const p = (this.parties || []).find((x) => x.id === Number(partyId));
  if (!p) return null;
  const m = (p.members || []).find((x) => x.character_id === Number(charId));
  if (!m || !m.follow_nonce) return null;
  return {
    nonce: m.follow_nonce, hunt: m.follow_hunt, instance: m.follow_instance,
    otbm: m.follow_otbm, boss: m.follow_boss,
  };
};
JsonStore.prototype.partyConsumeFollow = function (partyId, charId, nonce) {
  const p = (this.parties || []).find((x) => x.id === Number(partyId));
  if (!p) return false;
  const m = (p.members || []).find((x) => x.character_id === Number(charId));
  if (!m || m.follow_nonce !== nonce) return false;
  m.follow_nonce = m.follow_hunt = m.follow_instance = m.follow_otbm =
    m.follow_boss = m.follow_at = null;
  this._partySave();
  return true;
};
JsonStore.prototype.inviteCreate = function (partyId, leaderId, inviteeId, expiresAt) {
  this.invites = this.invites || [];
  const inv = {
    id: this._nextInviteId(), party_id: Number(partyId), leader_id: Number(leaderId),
    invitee_id: Number(inviteeId), status: "pending",
    created_at: new Date().toISOString(), expires_at: expiresAt || null,
  };
  this.invites.push(inv);
  this._partySave();
  return inv;
};
JsonStore.prototype.inviteFind = function (id) {
  this.invites = this.invites || [];
  return this.invites.find((i) => i.id === Number(id)) || null;
};
JsonStore.prototype.inviteUpdate = function (id, patch) {
  const i = this.inviteFind(id);
  if (i) { Object.assign(i, patch); this._partySave(); }
  return i;
};
JsonStore.prototype.pendingInviteFor = function (inviteeId) {
  this.invites = this.invites || [];
  return this.invites.find((i) =>
    i.invitee_id === Number(inviteeId) && i.status === "pending" &&
    (!i.expires_at || new Date(i.expires_at).getTime() > Date.now())) || null;
};
JsonStore.prototype.invitesFor = function (inviteeId, status) {
  this.invites = this.invites || [];
  const now = Date.now();
  return this.invites
    .filter((i) => i.invitee_id === Number(inviteeId) && i.status === status &&
      (!i.expires_at || new Date(i.expires_at).getTime() > now))
    .map((i) => {
      const p = (this.parties || []).find((x) => x.id === i.party_id);
      return Object.assign({}, i, {
        leader_name: p ? p.leader_name : "?",
        leader_zone: p ? p.leader_zone : "unknown",
      });
    })
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
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

    // ---- PARTY (multiplayer) ----
    async partyCreate(leaderChar) {
      const r = await this.run(
        "INSERT INTO parties (leader_id, leader_name) VALUES (?, ?)",
        [Number(leaderChar.id), leaderChar.name]);
      return this.partyFindByLeader(leaderChar.id);
    },
    async partyFindByLeader(charId) {
      const rows = await this.query("SELECT * FROM parties WHERE leader_id = ?",
        [Number(charId)]);
      return rows[0] || null;
    },
    async partyFindByCharacter(charId) {
      const rows = await this.query(
        `SELECT p.* FROM parties p
         LEFT JOIN party_members m ON m.party_id = p.id
         WHERE p.leader_id = ? OR m.character_id = ?
         LIMIT 1`,
        [Number(charId), Number(charId)]);
      return rows[0] || null;
    },
    async partyMembers(partyId) {
      return this.query(
        `SELECT c.id, c.name, c.voc, c.level, c.account_id,
                m.follow_nonce, m.follow_hunt, m.follow_instance,
                m.follow_otbm, m.follow_boss
         FROM party_members m
         JOIN characters c ON c.id = m.character_id
         WHERE m.party_id = ?
         ORDER BY m.joined_at ASC`,
        [Number(partyId)]);
    },
    async partyAddMember(partyId, charId) {
      await this.run(
        "INSERT IGNORE INTO party_members (party_id, character_id) VALUES (?, ?)",
        [Number(partyId), Number(charId)]);
    },
    async partyRemoveMember(partyId, charId) {
      await this.run(
        "DELETE FROM party_members WHERE party_id = ? AND character_id = ?",
        [Number(partyId), Number(charId)]);
    },
    async partyDelete(partyId) {
      await this.run("DELETE FROM party_members WHERE party_id = ?", [Number(partyId)]);
      await this.run(
        "UPDATE party_invites SET status = 'cancelled' WHERE party_id = ? AND status = 'pending'",
        [Number(partyId)]);
      await this.run("DELETE FROM parties WHERE id = ?", [Number(partyId)]);
    },
    async partySetZone(partyId, zone, opts) {
      opts = opts || {};
      await this.run(
        `UPDATE parties SET leader_zone = ?, leader_hunt = ?, leader_instance = ?,
           leader_otbm = ?, leader_boss = ?
         WHERE id = ?`,
        [zone, opts.hunt || null, opts.instance || null,
         opts.otbm || null, opts.boss || null, Number(partyId)]);
      // follows por membro: aplica em cada party_members do party
      const follows = opts.follows || [];
      for (const f of follows) {
        if (f.nonce) {
          await this.run(
            `UPDATE party_members SET
               follow_nonce = ?, follow_hunt = ?, follow_instance = ?,
               follow_otbm = ?, follow_boss = ?, follow_at = NOW()
             WHERE party_id = ? AND character_id = ?`,
            [f.nonce, f.hunt || null, f.instance || null,
             f.otbm || null, f.boss || null, Number(partyId), Number(f.character_id)]);
        }
      }
      if (zone === "city" || zone === "training") {
        // safe zone: limpa follows pendentes dos membros
        await this.run(
          `UPDATE party_members SET follow_nonce = NULL, follow_hunt = NULL,
             follow_instance = NULL, follow_otbm = NULL, follow_boss = NULL,
             follow_at = NULL
           WHERE party_id = ?`,
          [Number(partyId)]);
      }
      return null;   // valor de retorno não usado pelas rotas
    },
    async partyFollow(partyId, charId) {
      const rows = await this.query(
        `SELECT follow_nonce, follow_hunt, follow_instance, follow_otbm, follow_boss
         FROM party_members WHERE party_id = ? AND character_id = ?`,
        [Number(partyId), Number(charId)]);
      const m = rows[0];
      if (!m || !m.follow_nonce) return null;
      return {
        nonce: m.follow_nonce, hunt: m.follow_hunt, instance: m.follow_instance,
        otbm: m.follow_otbm, boss: m.follow_boss,
      };
    },
    async partyConsumeFollow(partyId, charId, nonce) {
      const r = await this.run(
        `UPDATE party_members SET follow_nonce = NULL, follow_hunt = NULL,
           follow_instance = NULL, follow_otbm = NULL, follow_boss = NULL,
           follow_at = NULL
         WHERE party_id = ? AND character_id = ? AND follow_nonce = ?`,
        [Number(partyId), Number(charId), nonce]);
      return r.affectedRows > 0;
    },
    async inviteCreate(partyId, leaderId, inviteeId, expiresAt) {
      const r = await this.run(
        "INSERT INTO party_invites (party_id, leader_id, invitee_id, expires_at) VALUES (?, ?, ?, ?)",
        [Number(partyId), Number(leaderId), Number(inviteeId), expiresAt || null]);
      return this.inviteFind(r.insertId);
    },
    async inviteFind(id) {
      const rows = await this.query("SELECT * FROM party_invites WHERE id = ?", [Number(id)]);
      return rows[0] || null;
    },
    async inviteUpdate(id, patch) {
      const set = [], params = [];
      for (const k in patch) { set.push(k + "=?"); params.push(patch[k]); }
      if (!set.length) return this.inviteFind(id);
      params.push(Number(id));
      await this.run("UPDATE party_invites SET " + set.join(", ") + " WHERE id = ?", params);
      return this.inviteFind(id);
    },
    async pendingInviteFor(inviteeId) {
      const rows = await this.query(
        `SELECT * FROM party_invites
         WHERE invitee_id = ? AND status = 'pending'
           AND (expires_at IS NULL OR expires_at > NOW())
         LIMIT 1`,
        [Number(inviteeId)]);
      return rows[0] || null;
    },
    async invitesFor(inviteeId, status) {
      return this.query(
        `SELECT i.*, p.leader_name, p.leader_zone
         FROM party_invites i
         JOIN parties p ON p.id = i.party_id
         WHERE i.invitee_id = ? AND i.status = ?
           AND (i.expires_at IS NULL OR i.expires_at > NOW())
         ORDER BY i.created_at DESC`,
        [Number(inviteeId), status]);
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
  await pool.query(`CREATE TABLE IF NOT EXISTS parties (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    leader_id INT UNSIGNED NOT NULL,
    leader_name VARCHAR(32) NOT NULL,
    leader_zone ENUM('unknown','city','training','hunt','boss')
      NOT NULL DEFAULT 'unknown',
    leader_hunt VARCHAR(64) DEFAULT NULL,
    leader_instance VARCHAR(24) DEFAULT NULL,
    leader_otbm VARCHAR(64) DEFAULT NULL,
    leader_boss VARCHAR(64) DEFAULT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_parties_leader (leader_id),
    INDEX idx_parties_zone (leader_zone)
  ) ENGINE=InnoDB`);
  await pool.query(`CREATE TABLE IF NOT EXISTS party_members (
    party_id INT UNSIGNED NOT NULL,
    character_id INT UNSIGNED NOT NULL,
    joined_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    follow_nonce VARCHAR(64) DEFAULT NULL,
    follow_hunt VARCHAR(64) DEFAULT NULL,
    follow_instance VARCHAR(24) DEFAULT NULL,
    follow_otbm VARCHAR(64) DEFAULT NULL,
    follow_boss VARCHAR(64) DEFAULT NULL,
    follow_at TIMESTAMP NULL,
    PRIMARY KEY (party_id, character_id),
    UNIQUE KEY uq_member_character (character_id),
    INDEX idx_members_party (party_id)
  ) ENGINE=InnoDB`);
  await pool.query(`CREATE TABLE IF NOT EXISTS party_invites (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    party_id INT UNSIGNED NOT NULL,
    leader_id INT UNSIGNED NOT NULL,
    invitee_id INT UNSIGNED NOT NULL,
    status ENUM('pending','accepted','declined','expired','cancelled')
      NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NULL,
    UNIQUE KEY uq_invite_pending (invitee_id, status),
    INDEX idx_invites_party (party_id, status)
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
