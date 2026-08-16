/*
 * world_boss.js — skeleton World Boss / Warzone (server-authoritative lobby).
 *
 * Rotação: a cada ROTATION_MS escolhe WZ1–3 (peso igual, pode repetir).
 * Só 1 evento por vez. Lobby → countdown → combat → success/fail.
 *
 * Env (TEST_SERVER=1 usa defaults curtos):
 *   WB_ROTATION_MS, WB_LOBBY_MS, WB_COUNTDOWN_MS, WB_SPAWN_DELAY_MS,
 *   WB_BOSS_TIMEOUT_MS, WB_LEAVE_COOLDOWN_MS, WB_MIN_START, WB_MAX_CHARS
 */
"use strict";

const { rewardChestAdd } = require("./authoritative_engine");

/* Sprites: bosses clássicos das Warzones (assets/mob/*.png). */
const WARZONES = [
  {
    id: "wz1", name: "Warzone 1", bossName: "The Deathstrike", bossHp: 2500000,
    bossSprite: "deathstrike", baseMonster: "deathstrike",
  },
  {
    id: "wz2", name: "Warzone 2", bossName: "Gnomevil", bossHp: 4000000,
    bossSprite: "gnomevil", baseMonster: "gnomevil",
  },
  {
    id: "wz3", name: "Warzone 3", bossName: "The Abyssador", bossHp: 6000000,
    bossSprite: "abyssador", baseMonster: "abyssador",
  },
];

const SCORE_WEIGHTS = { damage: 1.0, heal: 0.5, taken: 0.25 };
const MAJOR_CRYSTAL_TOKEN = "major-crystal-token";
const MAJOR_CRYSTAL_PER_ACCOUNT = 3;
const MAX_CHARS_PER_ACCOUNT = 2;

function envMs(name, fallback) {
  const n = parseInt(process.env[name] || "", 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}
function envInt(name, fallback) {
  const n = parseInt(process.env[name] || "", 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function createWorldBossController(opts) {
  opts = opts || {};
  const testServer = !!opts.testServer;
  const timers = {
    rotationMs: envMs("WB_ROTATION_MS", testServer ? 180000 : 3 * 3600 * 1000),
    lobbyMs: envMs("WB_LOBBY_MS", testServer ? 75000 : 10 * 60 * 1000),
    countdownMs: envMs("WB_COUNTDOWN_MS", testServer ? 15000 : 60 * 1000),
    spawnDelayMs: envMs("WB_SPAWN_DELAY_MS", testServer ? 5000 : 10 * 1000),
    bossTimeoutMs: envMs("WB_BOSS_TIMEOUT_MS", testServer ? 10 * 60 * 1000 : 60 * 60 * 1000),
    leaveCooldownMs: envMs("WB_LEAVE_COOLDOWN_MS", 30 * 1000),
  };
  // TEST_SERVER: mínimo 2 chars para iniciar (join de 1 conta com 2 chars, ou 2 contas).
  // Produção: ≥20 no fim do timer; lotação 30 inicia na hora. Override: WB_MIN_START.
  const minStart = envInt("WB_MIN_START", testServer ? 2 : 20);
  const maxChars = envInt("WB_MAX_CHARS", 30);

  let event = null;
  let nextRotationAt = Date.now() + timers.rotationMs;
  let tickHandle = null;
  const leaveCooldownUntil = new Map(); // accountId -> ts
  const publishAll = typeof opts.publishAll === "function" ? opts.publishAll : () => {};
  const publishAccount = typeof opts.publishAccount === "function" ? opts.publishAccount : () => {};

  function warzoneById(id) {
    return WARZONES.find((w) => w.id === id) || WARZONES[0];
  }
  function pickWarzone() {
    return WARZONES[Math.floor(Math.random() * WARZONES.length)];
  }
  function now() { return Date.now(); }

  function emptyVoc() {
    return { knight: 0, paladin: 0, sorcerer: 0, druid: 0, monk: 0, other: 0 };
  }
  function vocBucket(voc) {
    const v = String(voc || "").toLowerCase();
    if (v.includes("knight") || v === "ek" || v === "rk") return "knight";
    if (v.includes("paladin") || v === "rp" || v === "ep") return "paladin";
    if (v.includes("sorcerer") || v === "ms" || v === "es") return "sorcerer";
    if (v.includes("druid") || v === "ed" || v === "dr") return "druid";
    if (v.includes("monk") || v === "em" || v === "ex") return "monk";
    return "other";
  }

  function charCount() {
    if (!event) return 0;
    let n = 0;
    for (const join of event.joins.values()) n += (join.chars || []).length;
    return n;
  }

  function vocationBreakdown() {
    const out = emptyVoc();
    if (!event) return out;
    for (const join of event.joins.values()) {
      for (const c of join.chars || []) out[vocBucket(c.voc)]++;
    }
    return out;
  }

  function publicState(accountId) {
    const t = now();
    const base = {
      ok: true,
      phase: event ? event.phase : "idle",
      nextRotationAt,
      timers: Object.assign({}, timers),
      minStart,
      maxChars,
      maxPerAccount: MAX_CHARS_PER_ACCOUNT,
      event: null,
      you: null,
      leaveCooldownMsLeft: 0,
    };
    const cd = leaveCooldownUntil.get(Number(accountId)) || 0;
    if (cd > t) base.leaveCooldownMsLeft = cd - t;
    if (!event) return base;

    const wz = warzoneById(event.warzoneId);
    const chars = charCount();
    base.event = {
      id: event.id,
      warzoneId: event.warzoneId,
      warzoneName: wz.name,
      warzoneNumber: Number(String(wz.id || "").replace(/^wz/i, "")) || null,
      bossName: wz.bossName,
      bossSprite: wz.bossSprite || "dragon",
      baseMonster: wz.baseMonster || wz.bossSprite || "dragon",
      phase: event.phase,
      openedAt: event.openedAt,
      lobbyEndsAt: event.lobbyEndsAt || 0,
      countdownEndsAt: event.countdownEndsAt || 0,
      spawnAt: event.spawnAt || 0,
      combatEndsAt: event.combatEndsAt || 0,
      charCount: chars,
      maxChars,
      maxPerAccount: MAX_CHARS_PER_ACCOUNT,
      minStart,
      vocations: vocationBreakdown(),
      message: event.phase === "countdown"
        ? "EM BREVE VOCÊ IRÁ PARTICIPAR DE UM WORLD BOSS, VERIFIQUE SEU HELPER E AJUSTE PARA A BATALHA!"
        : null,
      result: event.result || null,
      bossHp: event.bossHp,
      bossMaxHp: event.bossMaxHp,
    };
    if (accountId != null && event.joins.has(Number(accountId))) {
      const join = event.joins.get(Number(accountId));
      base.you = {
        joined: true,
        chars: join.chars.map((c) => ({ id: c.id, name: c.name, voc: c.voc })),
        loaded: !!join.loaded,
        failed: !!join.failed,
        score: join.score,
      };
    }
    return base;
  }

  function broadcast() {
    const snap = publicState(null);
    publishAll("world-boss", snap.event || { phase: "idle", nextRotationAt });
  }

  function openLobby(warzoneId, reason) {
    if (event && event.phase !== "idle" && event.phase !== "ended") {
      return { ok: false, error: "EVENT_ACTIVE", msg: "Já existe um World Boss em andamento." };
    }
    const wz = warzoneId ? warzoneById(warzoneId) : pickWarzone();
    event = {
      id: "wb-" + Date.now().toString(36),
      warzoneId: wz.id,
      phase: "lobby",
      openedAt: now(),
      lobbyEndsAt: now() + timers.lobbyMs,
      countdownEndsAt: 0,
      spawnAt: 0,
      combatEndsAt: 0,
      joins: new Map(),
      bossHp: wz.bossHp,
      bossMaxHp: wz.bossHp,
      result: null,
      rareAssigned: new Set(),
      reason: reason || "rotation",
    };
    nextRotationAt = event.lobbyEndsAt + timers.rotationMs;
    console.log("[world-boss] lobby open", wz.id, event.id, "reason=" + event.reason);
    broadcast();
    return { ok: true, state: publicState(null) };
  }

  function clearEvent(result) {
    if (event) {
      event.phase = "ended";
      event.result = result || event.result || { status: "ended" };
    }
    const finished = event;
    event = null;
    nextRotationAt = now() + timers.rotationMs;
    broadcast();
    return finished;
  }

  function cancelLobby(reason) {
    if (!event || event.phase !== "lobby") return;
    console.log("[world-boss] lobby cancel", reason, "chars=" + charCount());
    for (const [accountId] of event.joins) {
      publishAccount(accountId, "world-boss", { action: "cancelled", reason });
    }
    clearEvent({ status: "cancelled", reason });
  }

  function beginCountdown() {
    if (!event || event.phase !== "lobby") return;
    event.phase = "countdown";
    event.countdownEndsAt = now() + timers.countdownMs;
    event.lobbyEndsAt = now();
    console.log("[world-boss] countdown", event.id, "chars=" + charCount());
    for (const [accountId] of event.joins) {
      publishAccount(accountId, "world-boss", {
        action: "countdown",
        message: "EM BREVE VOCÊ IRÁ PARTICIPAR DE UM WORLD BOSS, VERIFIQUE SEU HELPER E AJUSTE PARA A BATALHA!",
        endsAt: event.countdownEndsAt,
        warzoneId: event.warzoneId,
      });
    }
    broadcast();
  }

  function beginCombat() {
    if (!event || event.phase !== "countdown") return;
    event.phase = "combat";
    event.spawnAt = now() + timers.spawnDelayMs;
    event.combatEndsAt = now() + timers.bossTimeoutMs;
    const wz = warzoneById(event.warzoneId);
    event.bossHp = wz.bossHp;
    event.bossMaxHp = wz.bossHp;
    console.log("[world-boss] combat", event.id);
    for (const [accountId, join] of event.joins) {
      join.loaded = false;
      publishAccount(accountId, "world-boss", {
        action: "teleport",
        warzoneId: event.warzoneId,
        bossName: wz.bossName,
        bossSprite: wz.bossSprite || "dragon",
        baseMonster: wz.baseMonster || wz.bossSprite || "dragon",
        spawnAt: event.spawnAt,
        combatEndsAt: event.combatEndsAt,
        chars: join.chars,
        map: { w: 40, h: 40, kind: "placeholder" },
      });
    }
    broadcast();
  }

  async function grantSuccessRewards(db) {
    if (!event || !db) return;
    const wz = warzoneById(event.warzoneId);
    const bundleId = "world-boss-" + event.id;
    for (const [accountId, join] of event.joins) {
      if (join.failed) continue;
      const alive = (join.chars || []).some((c) => !c.dead);
      if (!alive) continue;
      // 3 major crystal tokens por conta (stub) no primeiro char vivo
      const target = (join.chars || []).find((c) => !c.dead) || join.chars[0];
      if (!target) continue;
      try {
        const character = await db.findCharacter(target.id);
        if (!character || Number(character.account_id) !== Number(accountId)) continue;
        let p = character.data;
        if (typeof p === "string") {
          try { p = JSON.parse(p); } catch (e) { p = {}; }
        }
        p = p && typeof p === "object" ? p : {};
        rewardChestAdd(p, MAJOR_CRYSTAL_TOKEN, MAJOR_CRYSTAL_PER_ACCOUNT, {
          bundleId,
          bossId: event.warzoneId,
          name: wz.bossName + " — World Boss",
          sprite: event.warzoneId,
        });
        const level = Math.max(1, Math.floor(Number(p.level) || Number(character.level) || 1));
        const voc = String(p.voc || character.voc || "none");
        await db.updateCharacter(character.id, voc, level, p, {});
        publishAccount(accountId, "world-boss", {
          action: "reward",
          tokens: MAJOR_CRYSTAL_PER_ACCOUNT,
          item: MAJOR_CRYSTAL_TOKEN,
          charId: character.id,
        });
        publishAccount(accountId, "character", { action: "world-boss-reward", charId: character.id });
      } catch (e) {
        console.error("[world-boss] reward fail account=" + accountId, e && e.message);
      }
    }
  }

  async function finishSuccess(db) {
    if (!event || event.phase !== "combat") return;
    console.log("[world-boss] success", event.id);
    await grantSuccessRewards(db);
    for (const [accountId] of event.joins) {
      publishAccount(accountId, "world-boss", { action: "success", warzoneId: event.warzoneId });
    }
    clearEvent({ status: "success", warzoneId: event && event.warzoneId });
  }

  function finishFail(reason) {
    if (!event || (event.phase !== "combat" && event.phase !== "countdown")) return;
    console.log("[world-boss] fail", reason, event.id);
    for (const [accountId] of event.joins) {
      publishAccount(accountId, "world-boss", { action: "fail", reason });
    }
    clearEvent({ status: "fail", reason });
  }

  function allAccountsDead() {
    if (!event || !event.joins.size) return false;
    for (const join of event.joins.values()) {
      if (join.failed) continue;
      if ((join.chars || []).some((c) => !c.dead)) return false;
    }
    return true;
  }

  function tick(db) {
    const t = now();
    if (!event) {
      if (t >= nextRotationAt) openLobby(null, "rotation");
      return;
    }
    if (event.phase === "lobby") {
      const chars = charCount();
      if (chars >= maxChars) {
        beginCountdown();
        return;
      }
      if (t >= event.lobbyEndsAt) {
        if (chars >= minStart) beginCountdown();
        else cancelLobby("below-min");
      }
      return;
    }
    if (event.phase === "countdown") {
      if (t >= event.countdownEndsAt) beginCombat();
      return;
    }
    if (event.phase === "combat") {
      if (event.bossHp <= 0) {
        finishSuccess(db).catch((e) => console.error("[world-boss] finishSuccess", e));
        return;
      }
      if (t >= event.combatEndsAt) {
        finishFail("timeout");
        return;
      }
      if (allAccountsDead()) {
        finishFail("all-dead");
      }
    }
  }

  function start() {
    if (tickHandle) return;
    tickHandle = setInterval(() => {
      try { tick(opts.getDb && opts.getDb()); } catch (e) {
        console.error("[world-boss] tick", e);
      }
    }, 1000);
    if (tickHandle.unref) tickHandle.unref();
    console.log("[world-boss] started", {
      testServer,
      rotationMs: timers.rotationMs,
      lobbyMs: timers.lobbyMs,
      minStart,
      maxChars,
    });
  }

  function stop() {
    if (tickHandle) clearInterval(tickHandle);
    tickHandle = null;
  }

  async function join(db, body) {
    const acc = await db.findAccountByToken(body && body.token);
    if (!acc) return { code: 401, body: { ok: false, msg: "Sessão inválida" } };
    if (!event || event.phase !== "lobby") {
      return { code: 409, body: { ok: false, error: "LOBBY_CLOSED", msg: "Lobby do World Boss fechado." } };
    }
    const t = now();
    const cd = leaveCooldownUntil.get(Number(acc.id)) || 0;
    if (cd > t) {
      return { code: 429, body: { ok: false, error: "LEAVE_COOLDOWN",
        msg: "Aguarde o cooldown de leave.", retryAfterMs: cd - t } };
    }
    if (event.joins.has(Number(acc.id))) {
      return { code: 409, body: { ok: false, error: "ALREADY_JOINED", msg: "Conta já entrou neste evento." } };
    }
    let ids = Array.isArray(body.characterIds) ? body.characterIds.map(Number)
      : Array.isArray(body.character_ids) ? body.character_ids.map(Number) : [];
    ids = ids.filter((id) => Number.isSafeInteger(id) && id > 0);
    const uniqueIds = [...new Set(ids)];
    if (uniqueIds.length > MAX_CHARS_PER_ACCOUNT) {
      return {
        code: 400,
        body: {
          ok: false,
          error: "MAX_CHARS_PER_ACCOUNT",
          msg: "Máximo de " + MAX_CHARS_PER_ACCOUNT + " personagens por conta neste evento.",
          maxPerAccount: MAX_CHARS_PER_ACCOUNT,
        },
      };
    }
    ids = uniqueIds;
    if (!ids.length) {
      return { code: 400, body: { ok: false, error: "NO_CHARS", msg: "Selecione 1 ou 2 personagens." } };
    }
    if (charCount() + ids.length > maxChars) {
      return { code: 409, body: { ok: false, error: "LOBBY_FULL", msg: "Lobby lotado (30/30)." } };
    }
    const chars = [];
    for (const id of ids) {
      const character = await db.findCharacter(id);
      if (!character || Number(character.account_id) !== Number(acc.id)) {
        return { code: 403, body: { ok: false, error: "CHAR_NOT_OWNED", msg: "Personagem inválido." } };
      }
      let data = character.data;
      if (typeof data === "string") {
        try { data = JSON.parse(data); } catch (e) { data = {}; }
      }
      chars.push({
        id: Number(character.id),
        name: String((data && data.name) || character.name || "?"),
        voc: String((data && data.voc) || character.voc || "none"),
        dead: false,
      });
    }
    event.joins.set(Number(acc.id), {
      accountId: Number(acc.id),
      chars,
      loaded: false,
      failed: false,
      score: { damage: 0, heal: 0, taken: 0, total: 0 },
    });
    if (charCount() >= maxChars) beginCountdown();
    else broadcast();
    return { code: 200, body: publicState(acc.id) };
  }

  async function leave(db, body) {
    const acc = await db.findAccountByToken(body && body.token);
    if (!acc) return { code: 401, body: { ok: false, msg: "Sessão inválida" } };
    if (!event || event.phase !== "lobby") {
      return { code: 409, body: { ok: false, error: "NOT_IN_LOBBY", msg: "Só é possível sair no lobby." } };
    }
    if (!event.joins.has(Number(acc.id))) {
      return { code: 404, body: { ok: false, error: "NOT_JOINED", msg: "Conta não está no lobby." } };
    }
    event.joins.delete(Number(acc.id));
    leaveCooldownUntil.set(Number(acc.id), now() + timers.leaveCooldownMs);
    broadcast();
    return { code: 200, body: publicState(acc.id) };
  }

  async function markLoaded(db, body) {
    const acc = await db.findAccountByToken(body && body.token);
    if (!acc) return { code: 401, body: { ok: false, msg: "Sessão inválida" } };
    if (!event || (event.phase !== "combat" && event.phase !== "countdown")) {
      return { code: 409, body: { ok: false, error: "NOT_IN_EVENT" } };
    }
    const join = event.joins.get(Number(acc.id));
    if (!join) return { code: 404, body: { ok: false, error: "NOT_JOINED" } };
    join.loaded = true;
    return { code: 200, body: publicState(acc.id) };
  }

  async function reportCombat(db, body) {
    const acc = await db.findAccountByToken(body && body.token);
    if (!acc) return { code: 401, body: { ok: false, msg: "Sessão inválida" } };
    if (!event || event.phase !== "combat") {
      return { code: 409, body: { ok: false, error: "NOT_IN_COMBAT" } };
    }
    const join = event.joins.get(Number(acc.id));
    if (!join || join.failed) return { code: 404, body: { ok: false, error: "NOT_JOINED" } };

    const dmg = Math.max(0, Math.floor(Number(body.damageDealt) || Number(body.damage) || 0));
    const heal = Math.max(0, Math.floor(Number(body.heal) || 0));
    const taken = Math.max(0, Math.floor(Number(body.damageTaken) || Number(body.taken) || 0));
    // Relatórios são deltas (cliente manda incremento desde o último report)
    join.score.damage += dmg;
    join.score.heal += heal;
    join.score.taken += taken;
    join.score.total = join.score.damage * SCORE_WEIGHTS.damage
      + join.score.heal * SCORE_WEIGHTS.heal
      + join.score.taken * SCORE_WEIGHTS.taken;

    if (dmg > 0) event.bossHp = Math.max(0, event.bossHp - dmg);

    if (Array.isArray(body.deadCharIds)) {
      const deadSet = new Set(body.deadCharIds.map(Number));
      for (const c of join.chars) {
        if (deadSet.has(Number(c.id))) c.dead = true;
      }
    }
    if (body.accountFailed || (join.chars.length && join.chars.every((c) => c.dead))) {
      join.failed = true;
      for (const c of join.chars) c.dead = true;
      publishAccount(acc.id, "world-boss", { action: "account-failed", reason: "both-dead" });
    }

    if (event.bossHp <= 0) {
      await finishSuccess(db);
    } else if (allAccountsDead()) {
      finishFail("all-dead");
    } else {
      broadcast();
    }
    return { code: 200, body: publicState(acc.id) };
  }

  async function forceOpen(db, body, authOk) {
    if (!authOk) return { code: 403, body: { ok: false, error: "FORBIDDEN" } };
    const wz = body && (body.warzoneId || body.warzone);
    const r = openLobby(wz || null, "force");
    if (!r.ok) return { code: 409, body: r };
    return { code: 200, body: r.state };
  }

  async function forceClose(db, body, authOk) {
    if (!authOk) return { code: 403, body: { ok: false, error: "FORBIDDEN" } };
    if (!event) return { code: 200, body: { ok: true, phase: "idle" } };
    cancelLobby("force-close");
    return { code: 200, body: { ok: true, phase: "idle" } };
  }

  async function stateFor(db, token) {
    let accountId = null;
    if (token) {
      const acc = await db.findAccountByToken(token);
      if (acc) accountId = acc.id;
    }
    return { code: 200, body: publicState(accountId) };
  }

  return {
    start, stop, tick, publicState,
    join, leave, markLoaded, reportCombat, forceOpen, forceClose, stateFor,
    timers, minStart, maxChars,
  };
}

module.exports = { createWorldBossController, WARZONES, MAJOR_CRYSTAL_TOKEN, SCORE_WEIGHTS };
