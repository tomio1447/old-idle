/* temple.js — presença multijogador no Templo Oficial (cidade).
 *
 * O templo é a área segura para onde os jogadores vão quando morrem e
 * continua exatamente onde está (mapa templo.otbm, cliente). Este módulo
 * só adiciona a camada de presença: cada cliente na cidade reporta
 * posição/estado num heartbeat; o servidor publica snapshots para todos
 * os presentes e cada jogador vê os outros andando pelo templo.
 *
 * Sem combate na cidade — presença é apenas visibilidade (o look/nível/
 * vocação vêm do personagem salvo no banco, nunca do cliente).
 */
"use strict";

const PRESENCE_TTL_MS = 8000;   // sem heartbeat por 8s -> some do templo
const HEARTBEAT_MIN_MS = 500;   // throttle mínimo por conta
const SNAPSHOT_MS = 1000;       // broadcast de snapshot 1x/s
const MAX_X = 128, MAX_Y = 128; // mapa local do templo (34x24 hoje)
const DIRS = { n: 1, s: 1, e: 1, w: 1 };

function clampInt(v, min, max) {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function createTemplePresence(opts) {
  opts = opts || {};
  const publishAccount = typeof opts.publishAccount === "function"
    ? opts.publishAccount : () => {};
  const getDb = typeof opts.getDb === "function" ? opts.getDb : () => null;

  const entries = new Map(); // accountId -> {accountId, info, x, y, dir, moving, updatedAt}
  let timer = null;

  /* Info pública do personagem (fonte: banco — nome/voc/level/sex/outfit). */
  function charInfo(character) {
    if (!character) return null;
    let data = {};
    try {
      data = typeof character.data === "string"
        ? JSON.parse(character.data) : (character.data || {});
    } catch (e) { data = {}; }
    const outfit = data.outfit && typeof data.outfit === "object"
      && !Array.isArray(data.outfit) ? data.outfit : {};
    const colors = Array.isArray(outfit.colors)
      ? outfit.colors.map((c) => clampInt(c, 0, 255)).slice(0, 4) : [];
    return {
      charId: Number(character.id) || 0,
      name: String(character.name || "?").slice(0, 20),
      voc: String(character.voc || "none").slice(0, 12),
      level: clampInt(character.level, 0, 9999),
      sex: data.sex === "female" ? "female" : "male",
      outfit: {
        type: String(outfit.type || "").slice(0, 40),
        appearance: String(outfit.appearance || "").slice(0, 80),
        colors: colors,
        addons: clampInt(outfit.addons, 0, 3),
        mount: String(outfit.mount || "").slice(0, 80),
      },
    };
  }

  function entryPublic(entry) {
    return Object.assign({}, entry.info, {
      x: entry.x, y: entry.y, dir: entry.dir, moving: !!entry.moving,
    });
  }

  function snapshotFor(viewerAccountId) {
    const nowMs = Date.now(), out = [];
    for (const [aid, e] of entries) {
      if (Number(aid) === Number(viewerAccountId)) continue;
      if (nowMs - e.updatedAt > PRESENCE_TTL_MS) continue;
      out.push(entryPublic(e));
    }
    return out;
  }

  /* Expira entradas mortas e publica o snapshot atual para os presentes. */
  function publish() {
    const nowMs = Date.now(), members = [];
    for (const [aid, e] of entries) {
      if (nowMs - e.updatedAt > PRESENCE_TTL_MS) entries.delete(aid);
      else members.push(aid);
    }
    if (!members.length) return 0;
    let sent = 0;
    for (const aid of members) {
      publishAccount(aid, "temple", { players: snapshotFor(aid) });
      sent++;
    }
    return sent;
  }

  /* Personagem da conta para a presença. char_id é só uma dica: o que
   * vale é a CONTA autenticada pelo token. Se o id não existir (ou for
   * de outra conta — saves legados, auto-resume bloqueado por lease etc.),
   * cai no personagem ativo da conta: quem reportou zona cidade ou, na
   * dúvida, o personagem mais recente. Nunca vaza personagem de outra
   * conta e nunca 403 para uma conta válida. */
  function resolveCharacter(db, accountId, charId) {
    const aid = Number(accountId);
    const chars = db && typeof db.charactersOf === "function"
      ? db.charactersOf(aid)
      : (db && Array.isArray(db.characters)
        ? db.characters.filter((c) => Number(c.account_id) === aid) : []);
    if (!chars.length) return null;
    if (charId) {
      const hit = chars.find((c) => Number(c.id) === Number(charId));
      if (hit) return hit;
    }
    const inCity = chars.find((c) => String(c.zone || "").toLowerCase() === "city");
    if (inCity) return inCity;
    const byFresh = chars.slice().sort((a, b) =>
      new Date(b.updated_at || 0).getTime() - new Date(a.updated_at || 0).getTime());
    return byFresh[0] || null;
  }

  function heartbeat(db, acc, body) {
    const aid = Number(acc && acc.id);
    if (!aid) return { code: 401, body: { ok: false, msg: "Sessão inválida" } };
    body = body || {};
    const character = resolveCharacter(db, aid, Number(body.char_id) || 0);
    if (!character)
      return { code: 404, body: { ok: false, msg: "Conta sem personagens" } };
    const prev = entries.get(aid), nowMs = Date.now();
    if (prev && nowMs - prev.updatedAt < HEARTBEAT_MIN_MS)
      return { code: 200, body: { ok: true, throttled: true, players: snapshotFor(aid) } };
    const x = clampInt(body.x, 0, MAX_X);
    const y = clampInt(body.y, 0, MAX_Y);
    const dir = DIRS[body.dir] ? String(body.dir) : "s";
    const moving = !!body.moving;
    entries.set(aid, {
      accountId: aid,
      info: charInfo(character),
      x, y, dir, moving,
      updatedAt: nowMs,
    });
    return { code: 200, body: { ok: true, players: snapshotFor(aid) } };
  }

  function leave(accountId) {
    const removed = entries.delete(Number(accountId));
    if (removed) publish();
    return removed;
  }

  function start() {
    if (timer) return;
    timer = setInterval(() => {
      try { publish(); } catch (e) { console.error("[temple]", e && e.message); }
    }, SNAPSHOT_MS);
    if (timer.unref) timer.unref();
  }

  function stop() { if (timer) { clearInterval(timer); timer = null; } }

  return {
    heartbeat, leave, start, stop, publish, snapshotFor,
    size: () => entries.size,
  };
}

module.exports = { createTemplePresence, PRESENCE_TTL_MS, HEARTBEAT_MIN_MS, SNAPSHOT_MS };
