/* Chat global in-memory: ring buffer + SSE broadcast + rate limit.
   Canais: geral (ativo), comunicados/help/market (somente sistema / em breve). */
"use strict";
const crypto = require("crypto");

const MAX_TEXT = 255;
const HISTORY_LIMIT = 200;
const CHANNELS = Object.freeze(["geral", "comunicados", "help", "market"]);
const VOC_SHORT = Object.freeze({
  knight: "EK", paladin: "RP", sorcerer: "MS", druid: "ED", monk: "EM", none: "RO",
});

/* Lista leve PT/EN — filtro de cliente. Servidor só aplica HARD_OBSCENE. */
const OBSCENE_WORDS = [
  "porra", "caralho", "puta", "puto", "merda", "fdp", "vsf", "vtnc", "pqp",
  "arrombado", "viado", "bicha", "buceta", "cuzao", "cuzão", "filho da puta",
  "fuck", "shit", "bitch", "asshole", "cunt", "nigger", "nigga", "faggot",
];

const HARD_OBSCENE = ["nigger", "nigga", "faggot", "cunt"];

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const OBSCENE_RE = new RegExp(
  "\\b(?:" + OBSCENE_WORDS.map(escapeRegExp).join("|") + ")\\b",
  "gi"
);
const HARD_OBSCENE_RE = new RegExp(
  "\\b(?:" + HARD_OBSCENE.map(escapeRegExp).join("|") + ")\\b",
  "gi"
);

function filterObscenity(text) {
  return String(text || "").replace(OBSCENE_RE, "***");
}

function filterHardObscenity(text) {
  return String(text || "").replace(HARD_OBSCENE_RE, "***");
}

function sanitizeText(raw) {
  let text = String(raw || "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length > MAX_TEXT) text = text.slice(0, MAX_TEXT);
  return text;
}

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function vocShort(voc) {
  const key = String(voc || "none").toLowerCase();
  return VOC_SHORT[key] || key.slice(0, 2).toUpperCase() || "??";
}

function parsePm(text) {
  const m = String(text || "").match(/^\/pm\s+(\S+)\s+(.+)$/i);
  if (!m) return null;
  return { toName: m[1].slice(0, 20), text: sanitizeText(m[2]) };
}

class ChatBus {
  constructor(options) {
    options = options || {};
    this.historyLimit = Number(options.historyLimit) || HISTORY_LIMIT;
    this.ticketTtlMs = Number(options.ticketTtlMs) || 10 * 60 * 1000;
    this.sequence = 0;
    this.messages = [];
    this.clients = new Set();
    this.tickets = new Map();
    this.rateByAccount = new Map();
    this.sendLimit = Number(options.sendLimit) || 8;
    this.sendWindowMs = Number(options.sendWindowMs) || 10000;
  }

  issueTicket(accountId, sessionToken, viewerName) {
    const ticket = crypto.randomBytes(32).toString("hex");
    const now = Date.now();
    this.tickets.set(ticket, {
      accountId: Number(accountId),
      sessionToken: String(sessionToken),
      viewerName: String(viewerName || "").toLowerCase(),
      expiresAt: now + this.ticketTtlMs,
    });
    this.cleanup(now);
    return { ticket, expiresAt: now + this.ticketTtlMs };
  }

  consumeTicket(ticket) {
    const row = this.tickets.get(String(ticket || ""));
    if (!row || row.expiresAt <= Date.now()) {
      if (row) this.tickets.delete(String(ticket));
      return null;
    }
    return row;
  }

  cleanup(now) {
    now = now || Date.now();
    for (const [key, row] of this.tickets) {
      if (row.expiresAt <= now) this.tickets.delete(key);
    }
    for (const [aid, row] of this.rateByAccount) {
      if (row.resetAt <= now) this.rateByAccount.delete(aid);
    }
  }

  checkRate(accountId) {
    const now = Date.now();
    let row = this.rateByAccount.get(accountId);
    if (!row || row.resetAt <= now) {
      row = { count: 0, resetAt: now + this.sendWindowMs };
    }
    row.count += 1;
    this.rateByAccount.set(accountId, row);
    if (row.count > this.sendLimit) {
      return { ok: false, retryAfterMs: row.resetAt - now };
    }
    return { ok: true };
  }

  history(channel, sinceId, limit, viewerName) {
    channel = String(channel || "geral").toLowerCase();
    sinceId = Math.max(0, Number(sinceId) || 0);
    limit = Math.min(100, Math.max(1, Number(limit) || 50));
    const viewer = String(viewerName || "").toLowerCase();
    const out = [];
    for (let i = this.messages.length - 1; i >= 0 && out.length < limit; i--) {
      const msg = this.messages[i];
      if (msg.id <= sinceId) break;
      if (channel && msg.channel !== channel) continue;
      if (!this.visibleTo(msg, viewer)) continue;
      out.push(msg);
    }
    out.reverse();
    return out;
  }

  visibleTo(msg, viewerLower) {
    if (msg.type !== "pm") return true;
    if (!viewerLower) return false;
    const from = String(msg.nickname || "").toLowerCase();
    const to = String(msg.toName || "").toLowerCase();
    return viewerLower === from || viewerLower === to;
  }

  post(payload) {
    const msg = {
      id: ++this.sequence,
      ts: Date.now(),
      channel: payload.channel,
      type: payload.type || "chat",
      nickname: payload.nickname,
      voc: payload.voc,
      vocShort: payload.vocShort || vocShort(payload.voc),
      level: payload.level,
      accountId: payload.accountId,
      charId: payload.charId,
      text: payload.text,
      toName: payload.toName || null,
    };
    this.messages.push(msg);
    while (this.messages.length > this.historyLimit) this.messages.shift();
    for (const client of this.clients) this.writeClient(client, msg);
    return msg;
  }

  writeClient(client, msg) {
    if (!this.visibleTo(msg, client.viewerName)) return;
    this.write(client.res, msg);
  }

  write(res, msg) {
    if (res.destroyed || res.writableEnded) return;
    res.write(
      `id: ${msg.id}\nevent: chat\ndata: ${JSON.stringify(msg)}\n\n`
    );
  }

  subscribe(res, lastEventId, meta) {
    const client = {
      res,
      accountId: Number(meta.accountId) || 0,
      sessionToken: String(meta.sessionToken || ""),
      viewerName: String(meta.viewerName || "").toLowerCase(),
      expiresAt: meta.expiresAt || 0,
    };
    this.clients.add(client);
    const since = Math.max(0, Number(lastEventId) || 0);
    for (const msg of this.messages) {
      if (msg.id > since) this.writeClient(client, msg);
    }
    res.write(
      `event: ready\ndata: ${JSON.stringify({ cursor: this.sequence })}\n\n`
    );
    const heartbeat = setInterval(() => {
      if (!res.destroyed && !res.writableEnded) {
        res.write(`: heartbeat ${Date.now()}\n\n`);
      }
    }, 15000);
    if (heartbeat.unref) heartbeat.unref();
    let expiry = null;
    if (client.expiresAt) {
      expiry = setTimeout(() => {
        if (!res.writableEnded) {
          res.write(
            `event: chat-expired\ndata: ${JSON.stringify({ reason: "ticket-expired" })}\n\n`
          );
          res.end();
        }
      }, Math.max(1, client.expiresAt - Date.now()));
      if (expiry.unref) expiry.unref();
    }
    const close = () => {
      clearInterval(heartbeat);
      if (expiry) clearTimeout(expiry);
      this.clients.delete(client);
    };
    res.on("close", close);
    res.on("error", close);
    return close;
  }

  clientCount() {
    return this.clients.size;
  }

  cursor() {
    return this.sequence;
  }
}

module.exports = {
  ChatBus,
  CHANNELS,
  MAX_TEXT,
  VOC_SHORT,
  filterObscenity,
  filterHardObscenity,
  sanitizeText,
  escapeHtml,
  vocShort,
  parsePm,
  OBSCENE_WORDS,
};
