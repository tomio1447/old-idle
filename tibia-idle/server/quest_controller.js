/*
 * quest_controller.js — servidor de lobbys e instâncias de quests.
 *
 * Cada quest pode ter múltiplos lobbys simultâneos (diferente do World Boss
 * que é um evento único). O controller gerencia o ciclo:
 *   lobby → countdown(30s) → combat(waves) → boss → success/fail
 *
 * Quests são 1x por personagem (storage permanente em p.quests).
 */
"use strict";

const { QUEST_DEFS } = require("../game/js/questdata");
const { rewardChestAdd } = require("./authoritative_engine");

const MAX_CHARS_PER_ACCOUNT = 1;
const LEAVE_COOLDOWN_MS = 15000;

let _lobbyCounter = 0;
function nextLobbyId(questId) {
  return "quest-" + questId + "-" + (++_lobbyCounter).toString(36) + "-" + Date.now().toString(36);
}

function vocBucket(voc) {
  const v = String(voc || "").toLowerCase();
  if (v.includes("knight")) return "knight";
  if (v.includes("paladin")) return "paladin";
  if (v.includes("sorcerer")) return "sorcerer";
  if (v.includes("druid")) return "druid";
  if (v.includes("monk")) return "monk";
  return "other";
}

function createQuestController(opts) {
  opts = opts || {};
  const lobbys = new Map(); // lobbyId -> lobby
  const leaveCooldownUntil = new Map(); // accountId -> ts
  const publishAll = typeof opts.publishAll === "function" ? opts.publishAll : () => {};
  const publishAccount = typeof opts.publishAccount === "function" ? opts.publishAccount : () => {};

  function now() { return Date.now(); }

  function questDef(questId) {
    return QUEST_DEFS[questId] || null;
  }

  /* ---- Lobby helpers ---- */

  function charCount(lobby) {
    let n = 0;
    for (const join of lobby.joins.values()) n += (join.chars || []).length;
    return n;
  }

  function joinedCharIds(lobby) {
    const ids = [];
    for (const join of lobby.joins.values())
      for (const c of join.chars || []) ids.push(Number(c.id));
    return ids;
  }

  function joinedAccountIds(lobby) {
    return Array.from(lobby.joins.keys()).map(Number);
  }

  function vocationBreakdown(lobby) {
    const out = { knight: 0, paladin: 0, sorcerer: 0, druid: 0, monk: 0, other: 0 };
    for (const join of lobby.joins.values())
      for (const c of join.chars || []) out[vocBucket(c.voc)]++;
    return out;
  }

  function membersForStart(lobby) {
    const out = [];
    for (const [accountId, join] of lobby.joins) {
      for (const c of join.chars || []) {
        out.push({ accountId: Number(accountId), charId: Number(c.id), charName: c.name, voc: c.voc, level: c.level || 1 });
      }
    }
    return out;
  }

  function computeWaves(quest, playerCount) {
    return quest.baseWaves + Math.floor(playerCount / quest.wavesPerPlayers);
  }
  function computeMonstersPerWave(quest, playerCount) {
    return quest.baseMonstersPerWave + Math.floor(playerCount / quest.monstersPerPlayers);
  }

  /* ---- Public state ---- */

  function publicLobbyState(lobby, accountId) {
    const quest = questDef(lobby.questId);
    const count = charCount(lobby);
    const participants = [];
    for (const [aid, join] of lobby.joins) {
      for (const c of join.chars || []) {
        participants.push({
          accountId: Number(aid), id: Number(c.id), name: c.name,
          voc: c.voc, level: c.level || 1,
          host: Number(aid) === Number(lobby.hostAccountId),
        });
      }
    }
    const base = {
      ok: true,
      lobbyId: lobby.id,
      questId: lobby.questId,
      questName: quest ? quest.name : lobby.questId,
      phase: lobby.phase,
      charCount: count,
      maxPlayers: quest ? quest.maxPlayers : 30,
      maxPerAccount: MAX_CHARS_PER_ACCOUNT,
      lobbyType: lobby.lobbyType,
      hostAccountId: lobby.hostAccountId,
      participants,
      vocations: vocationBreakdown(lobby),
      countdownEndsAt: lobby.countdownEndsAt || 0,
      instanceId: lobby.instanceId || null,
      rewards: quest ? quest.rewards : [],
      bossName: quest ? (quest.boss || "").replace(/-/g, " ") : "",
      bossSprite: quest ? quest.bossSprite : "",
      you: null,
    };
    if (accountId != null && lobby.joins.has(Number(accountId))) {
      const join = lobby.joins.get(Number(accountId));
      base.you = {
        joined: true,
        isHost: Number(accountId) === Number(lobby.hostAccountId),
        chars: join.chars.map((c) => ({ id: c.id, name: c.name, voc: c.voc })),
        kicked: !!join.kicked,
        rewardPending: !!join.rewardPending,
      };
    }
    return base;
  }

  function broadcastLobby(lobby) {
    const snap = publicLobbyState(lobby, null);
    for (const [accountId] of lobby.joins) {
      publishAccount(accountId, "quest", snap);
    }
  }

  /* ---- Lobby lifecycle ---- */

  function createLobby(questId, ownerAccountId) {
    const quest = questDef(questId);
    if (!quest) return { ok: false, error: "INVALID_QUEST", msg: "Quest inválida." };
    const id = nextLobbyId(questId);
    const lobby = {
      id,
      questId,
      phase: "lobby",
      lobbyType: "open",
      hostAccountId: Number(ownerAccountId),
      openedAt: now(),
      countdownEndsAt: 0,
      combatStartedAt: 0,
      joins: new Map(),
      instanceId: null,
      invited: new Set([Number(ownerAccountId)]),
      result: null,
    };
    lobbys.set(id, lobby);
    console.log("[quest] lobby created", questId, id, "owner=" + ownerAccountId);
    return { ok: true, lobbyId: id, lobby };
  }

  function removeLobby(lobbyId, result) {
    const lobby = lobbys.get(lobbyId);
    if (!lobby) return;
    lobby.phase = "ended";
    lobby.result = result || lobby.result || { status: "ended" };
    lobbys.delete(lobbyId);
    console.log("[quest] lobby removed", lobbyId, lobby.result.status);
  }

  function cancelLobby(lobbyId, reason) {
    const lobby = lobbys.get(lobbyId);
    if (!lobby || lobby.phase !== "lobby") return;
    console.log("[quest] lobby cancel", lobbyId, reason);
    for (const [accountId] of lobby.joins) {
      publishAccount(accountId, "quest", { action: "cancelled", lobbyId, reason });
    }
    removeLobby(lobbyId, { status: "cancelled", reason });
  }

  /* ---- Join / Leave ---- */

  async function join(db, body) {
    const acc = await db.findAccountByToken(body && body.token);
    if (!acc) return { code: 401, body: { ok: false, msg: "Sessão inválida" } };

    const lobbyId = String(body && body.lobbyId || "");
    const lobby = lobbys.get(lobbyId);
    if (!lobby || lobby.phase !== "lobby") {
      return { code: 409, body: { ok: false, error: "LOBBY_CLOSED", msg: "Lobby não encontrado ou fechado." } };
    }
    const quest = questDef(lobby.questId);
    if (!quest) return { code: 500, body: { ok: false, error: "BAD_QUEST" } };

    const t = now();
    const cd = leaveCooldownUntil.get(Number(acc.id)) || 0;
    if (cd > t) {
      return { code: 429, body: { ok: false, error: "LEAVE_COOLDOWN", msg: "Aguarde o cooldown.", retryAfterMs: cd - t } };
    }
    if (lobby.joins.has(Number(acc.id))) {
      return { code: 409, body: { ok: false, error: "ALREADY_JOINED", msg: "Conta já está no lobby." } };
    }

    const charId = Number(body && (body.characterId || body.character_id || (body.characterIds && body.characterIds[0])));
    if (!Number.isSafeInteger(charId) || charId <= 0) {
      return { code: 400, body: { ok: false, error: "NO_CHAR", msg: "Selecione 1 personagem." } };
    }
    if (charCount(lobby) >= quest.maxPlayers) {
      return { code: 409, body: { ok: false, error: "LOBBY_FULL", msg: "Lobby cheio (" + quest.maxPlayers + "/" + quest.maxPlayers + ")." } };
    }

    const character = await db.findCharacter(charId);
    if (!character || Number(character.account_id) !== Number(acc.id)) {
      return { code: 403, body: { ok: false, error: "CHAR_NOT_OWNED", msg: "Personagem inválido." } };
    }
    let data = character.data;
    if (typeof data === "string") { try { data = JSON.parse(data); } catch (e) { data = {}; } }
    const level = Math.max(1, Number((data && data.level) || character.level) || 1);
    if (level < quest.level) {
      return { code: 403, body: { ok: false, error: "LOW_LEVEL", msg: "Nível mínimo: " + quest.level + ". Seu personagem é nível " + level + "." } };
    }
    // 1x por personagem
    if (quest.oneTimePerChar && data && data.quests && data.quests[quest.id] && data.quests[quest.id].completed) {
      return { code: 409, body: { ok: false, error: "ALREADY_COMPLETED", msg: "Este personagem já completou a " + quest.name + "." } };
    }
    // Verificar se personagem já está em outro lobby de quest
    for (const [lid, other] of lobbys) {
      if (lid === lobbyId) continue;
      for (const [, oj] of other.joins) {
        if ((oj.chars || []).some((c) => Number(c.id) === charId)) {
          return { code: 409, body: { ok: false, error: "CHAR_BUSY", msg: "Personagem já está em outro lobby de quest." } };
        }
      }
    }

    lobby.joins.set(Number(acc.id), {
      accountId: Number(acc.id),
      chars: [{
        id: Number(character.id),
        name: String((data && data.name) || character.name || "?"),
        voc: String((data && data.voc) || character.voc || "none"),
        level,
        dead: false,
      }],
      loaded: false,
      kicked: false,
      rewardPending: false,
    });
    broadcastLobby(lobby);
    return { code: 200, body: publicLobbyState(lobby, acc.id) };
  }

  async function leave(db, body) {
    const acc = await db.findAccountByToken(body && body.token);
    if (!acc) return { code: 401, body: { ok: false, msg: "Sessão inválida" } };

    const lobbyId = String(body && body.lobbyId || "");
    const lobby = lobbys.get(lobbyId);
    if (!lobby || lobby.phase !== "lobby") {
      return { code: 409, body: { ok: false, error: "NOT_IN_LOBBY", msg: "Só é possível sair no lobby." } };
    }
    if (!lobby.joins.has(Number(acc.id))) {
      return { code: 404, body: { ok: false, error: "NOT_JOINED", msg: "Conta não está no lobby." } };
    }
    const wasHost = Number(lobby.hostAccountId) === Number(acc.id);
    lobby.joins.delete(Number(acc.id));
    leaveCooldownUntil.set(Number(acc.id), now() + LEAVE_COOLDOWN_MS);
    if (wasHost) {
      cancelLobby(lobbyId, "leader-left");
      return { code: 200, body: { ok: true, cancelled: true } };
    }
    broadcastLobby(lobby);
    return { code: 200, body: { ok: true } };
  }

  /* ---- Start (leader only) ---- */

  function beginCountdown(lobby) {
    const quest = questDef(lobby.questId);
    lobby.phase = "countdown";
    lobby.countdownEndsAt = now() + (quest ? quest.countdownSec * 1000 : 30000);
    console.log("[quest] countdown", lobby.id, "chars=" + charCount(lobby));
    for (const [accountId] of lobby.joins) {
      publishAccount(accountId, "quest", {
        action: "countdown",
        lobbyId: lobby.id,
        questId: lobby.questId,
        questName: quest ? quest.name : lobby.questId,
        endsAt: lobby.countdownEndsAt,
        message: "A quest vai começar! Prepare-se para a batalha!",
      });
    }
    broadcastLobby(lobby);
  }

  async function startFight(db, body) {
    const acc = await db.findAccountByToken(body && body.token);
    if (!acc) return { code: 401, body: { ok: false, msg: "Sessão inválida" } };

    const lobbyId = String(body && body.lobbyId || "");
    const lobby = lobbys.get(lobbyId);
    if (!lobby || lobby.phase !== "lobby") {
      return { code: 409, body: { ok: false, error: "NO_LOBBY", msg: "Lobby não encontrado." } };
    }
    if (Number(lobby.hostAccountId) !== Number(acc.id)) {
      return { code: 403, body: { ok: false, error: "NOT_OWNER", msg: "Somente o líder pode iniciar." } };
    }
    if (charCount(lobby) < 1) {
      return { code: 409, body: { ok: false, error: "EMPTY", msg: "O lobby está vazio." } };
    }
    beginCountdown(lobby);
    return { code: 200, body: publicLobbyState(lobby, acc.id) };
  }

  /* ---- Combat ---- */

  async function beginCombat(lobby) {
    if (!lobby || lobby.phase !== "countdown" || lobby._startingCombat) return;
    lobby._startingCombat = true;
    lobby.phase = "combat";
    lobby.combatStartedAt = now();
    const quest = questDef(lobby.questId);
    console.log("[quest] combat", lobby.id, "host=" + lobby.hostAccountId);

    if (typeof opts.createQuestInstance === "function") {
      try {
        const created = await opts.createQuestInstance(lobby, quest);
        if (!lobby || lobby.phase !== "combat") return;
        if (!created || !created.ok) {
          console.error("[quest] instance failed", created && created.error);
          lobby._startingCombat = false;
          finishFail(lobby, "instance-create-failed");
          return;
        }
        lobby.instanceId = String(created.instanceId);
        lobby.hostAccountId = Number(created.ownerAccountId);
      } catch (e) {
        console.error("[quest] instance", e && e.message);
        lobby._startingCombat = false;
        finishFail(lobby, "instance-create-failed");
        return;
      }
    }
    notifyTeleport(lobby);
  }

  function notifyTeleport(lobby) {
    const quest = questDef(lobby.questId);
    for (const [accountId, join] of lobby.joins) {
      publishAccount(accountId, "quest", {
        action: "teleport",
        lobbyId: lobby.id,
        questId: lobby.questId,
        questName: quest ? quest.name : lobby.questId,
        bossName: quest ? quest.boss : "",
        bossSprite: quest ? quest.bossSprite : "",
        chars: join.chars,
        instanceId: lobby.instanceId || null,
        hostAccountId: lobby.hostAccountId || null,
        isHost: Number(accountId) === Number(lobby.hostAccountId),
      });
    }
    broadcastLobby(lobby);
  }

  /* ---- Rewards ---- */

  async function grantQuestRewards(lobby, db) {
    if (!lobby || !db) return;
    const quest = questDef(lobby.questId);
    if (!quest) return;
    for (const [accountId, join] of lobby.joins) {
      if (join.kicked) continue;
      const alive = (join.chars || []).some((c) => !c.dead);
      if (!alive) continue;
      const target = (join.chars || []).find((c) => !c.dead) || join.chars[0];
      if (!target) continue;
      try {
        const character = await db.findCharacter(target.id);
        if (!character || Number(character.account_id) !== Number(accountId)) continue;
        let p = character.data;
        if (typeof p === "string") { try { p = JSON.parse(p); } catch (e) { p = {}; } }
        p = p && typeof p === "object" ? p : {};

        // Marcar reward como pendente (jogador escolhe no modal)
        join.rewardPending = true;

        // Marcar quest como "em andamento" no storage (será completada quando escolher a reward)
        p.quests = p.quests || {};
        p.quests[quest.id] = p.quests[quest.id] || {};
        p.quests[quest.id].inProgress = true;
        p.quests[quest.id].lobbyId = lobby.id;

        const level = Math.max(1, Math.floor(Number(p.level) || Number(character.level) || 1));
        const voc = String(p.voc || character.voc || "none");
        await db.updateCharacter(character.id, voc, level, p, {});

        publishAccount(accountId, "quest", {
          action: "reward-choice",
          lobbyId: lobby.id,
          questId: lobby.questId,
          questName: quest.name,
          rewards: quest.rewards,
          outfitReward: quest.outfitReward || null,
          charId: target.id,
        });
      } catch (e) {
        console.error("[quest] reward fail account=" + accountId, e && e.message);
      }
    }
  }

  async function chooseReward(db, body) {
    const acc = await db.findAccountByToken(body && body.token);
    if (!acc) return { code: 401, body: { ok: false, msg: "Sessão inválida" } };

    const questId = String(body && body.questId || "");
    const quest = questDef(questId);
    if (!quest) return { code: 400, body: { ok: false, error: "INVALID_QUEST" } };

    const rewardSlug = String(body && body.reward || "");
    if (!quest.rewards.includes(rewardSlug)) {
      return { code: 400, body: { ok: false, error: "INVALID_REWARD", msg: "Reward inválida." } };
    }

    const charId = Number(body && body.charId);
    if (!Number.isSafeInteger(charId) || charId <= 0) {
      return { code: 400, body: { ok: false, error: "NO_CHAR" } };
    }

    const character = await db.findCharacter(charId);
    if (!character || Number(character.account_id) !== Number(acc.id)) {
      return { code: 403, body: { ok: false, error: "CHAR_NOT_OWNED" } };
    }
    let p = character.data;
    if (typeof p === "string") { try { p = JSON.parse(p); } catch (e) { p = {}; } }
    p = p && typeof p === "object" ? p : {};

    // Verificar se a quest está em andamento
    if (!p.quests || !p.quests[questId] || !p.quests[questId].inProgress) {
      return { code: 409, body: { ok: false, error: "NO_PENDING_REWARD", msg: "Nenhuma reward pendente para esta quest." } };
    }
    // Verificar se já completou
    if (p.quests[questId].completed) {
      return { code: 409, body: { ok: false, error: "ALREADY_COMPLETED", msg: "Quest já foi completada." } };
    }

    // Adicionar reward ao reward chest
    const bundleId = "quest-" + questId + "-" + charId;
    rewardChestAdd(p, rewardSlug, 1, {
      bundleId,
      bossId: quest.boss,
      name: quest.name,
      sprite: quest.bossSprite || quest.boss,
    });

    // Conceder outfit se a quest tiver outfitReward
    if (quest.outfitReward) {
      const sexo = (p.sex === "female") ? "f" : "m";
      const outfitId = quest.outfitReward.base + "-" + sexo;
      p.wardrobe = p.wardrobe || { outfits: {}, mounts: {} };
      p.wardrobe.outfits = p.wardrobe.outfits || {};
      const current = p.wardrobe.outfits[outfitId] || 0;
      p.wardrobe.outfits[outfitId] = Math.max(current, quest.outfitReward.addons || 0);
    }

    // Marcar quest como completada
    p.quests[questId] = {
      completed: true,
      completedAt: Date.now(),
      reward: rewardSlug,
      outfitGranted: !!quest.outfitReward,
    };

    const level = Math.max(1, Math.floor(Number(p.level) || Number(character.level) || 1));
    const voc = String(p.voc || character.voc || "none");
    await db.updateCharacter(character.id, voc, level, p, {});

    publishAccount(acc.id, "quest", { action: "reward-collected", questId, reward: rewardSlug, charId });
    publishAccount(acc.id, "character", { action: "quest-reward", charId });

    return { code: 200, body: { ok: true, reward: rewardSlug, questId } };
  }

  /* ---- Finish ---- */

  async function finishSuccess(lobby, db) {
    if (!lobby || lobby.phase !== "combat") return;
    console.log("[quest] success", lobby.id);
    const host = lobby.hostAccountId, instanceId = lobby.instanceId;
    removeLobby(lobby.id, { status: "success" });
    if (typeof opts.endSharedInstance === "function" && host) {
      try { await opts.endSharedInstance(host, instanceId, "quest-completed"); }
      catch (e) { console.error("[quest] end instance", e && e.message); }
    }
    await grantQuestRewards(lobby, db);
    for (const [accountId] of lobby.joins) {
      publishAccount(accountId, "quest", { action: "success", lobbyId: lobby.id, questId: lobby.questId });
    }
  }

  function finishFail(lobby, reason) {
    if (!lobby || (lobby.phase !== "combat" && lobby.phase !== "countdown")) return;
    console.log("[quest] fail", reason, lobby.id);
    const host = lobby.hostAccountId, instanceId = lobby.instanceId;
    for (const [accountId] of lobby.joins) {
      publishAccount(accountId, "quest", { action: "fail", lobbyId: lobby.id, reason });
    }
    removeLobby(lobby.id, { status: "fail", reason });
    if (typeof opts.endSharedInstance === "function" && host) {
      Promise.resolve(opts.endSharedInstance(host, instanceId, "quest-fail")).catch((e) => {
        console.error("[quest] end instance", e && e.message);
      });
    }
  }

  /* ---- Kick on death ---- */

  function kickPlayer(lobby, accountId, reason) {
    const join = lobby.joins.get(Number(accountId));
    if (!join || join.kicked) return;
    join.kicked = true;
    join.rewardPending = false;
    for (const c of join.chars || []) c.dead = true;
    publishAccount(accountId, "quest", {
      action: "kicked",
      lobbyId: lobby.id,
      questId: lobby.questId,
      reason: reason || "death",
    });
    console.log("[quest] kicked account=" + accountId, "reason=" + reason, "lobby=" + lobby.id);
    // Se todos foram kickados → quest fail
    let anyAlive = false;
    for (const [, j] of lobby.joins) {
      if (!j.kicked && (j.chars || []).some((c) => !c.dead)) { anyAlive = true; break; }
    }
    if (!anyAlive) finishFail(lobby, "all-dead");
    else broadcastLobby(lobby);
  }

  /* ---- Instance ended callback ---- */

  function onSharedEnded(lobbyId, reason) {
    const lobby = lobbys.get(lobbyId);
    if (!lobby || lobby.phase !== "combat") return Promise.resolve();
    if (reason === "quest-completed") return finishSuccess(lobby, opts.getDb && opts.getDb());
    finishFail(lobby, reason || "ended");
    return Promise.resolve();
  }

  /* ---- Report combat (score, dead chars) ---- */

  async function reportCombat(db, body) {
    const acc = await db.findAccountByToken(body && body.token);
    if (!acc) return { code: 401, body: { ok: false, msg: "Sessão inválida" } };

    const lobbyId = String(body && body.lobbyId || "");
    const lobby = lobbys.get(lobbyId);
    if (!lobby || lobby.phase !== "combat") {
      return { code: 409, body: { ok: false, error: "NOT_IN_COMBAT" } };
    }
    const join = lobby.joins.get(Number(acc.id));
    if (!join || join.kicked) return { code: 404, body: { ok: false, error: "NOT_JOINED" } };

    if (Array.isArray(body.deadCharIds)) {
      const deadSet = new Set(body.deadCharIds.map(Number));
      const quest = questDef(lobby.questId);
      for (const c of join.chars) {
        if (deadSet.has(Number(c.id)) && !c.dead) {
          c.dead = true;
          if (quest && quest.kickOnDeath) kickPlayer(lobby, acc.id, "death");
        }
      }
    }
    return { code: 200, body: publicLobbyState(lobby, acc.id) };
  }

  /* ---- Mark loaded ---- */

  async function markLoaded(db, body) {
    const acc = await db.findAccountByToken(body && body.token);
    if (!acc) return { code: 401, body: { ok: false, msg: "Sessão inválida" } };

    const lobbyId = String(body && body.lobbyId || "");
    const lobby = lobbys.get(lobbyId);
    if (!lobby) return { code: 409, body: { ok: false, error: "NOT_IN_EVENT" } };
    const join = lobby.joins.get(Number(acc.id));
    if (!join) return { code: 404, body: { ok: false, error: "NOT_JOINED" } };
    join.loaded = true;
    return { code: 200, body: publicLobbyState(lobby, acc.id) };
  }

  /* ---- Tick ---- */

  function tick(db) {
    const t = now();
    for (const [lobbyId, lobby] of lobbys) {
      if (lobby.phase === "countdown") {
        if (t >= lobby.countdownEndsAt) {
          beginCombat(lobby).catch((e) => console.error("[quest] beginCombat", e));
        }
      }
      // Timeout: lobbys com mais de 2h em combate falham
      if (lobby.phase === "combat" && lobby.combatStartedAt && t - lobby.combatStartedAt > 2 * 3600 * 1000) {
        finishFail(lobby, "timeout");
      }
    }
  }

  /* ---- Lifecycle ---- */

  let tickHandle = null;
  function start() {
    if (tickHandle) return;
    tickHandle = setInterval(() => {
      try { tick(opts.getDb && opts.getDb()); } catch (e) { console.error("[quest] tick", e); }
    }, 1000);
    if (tickHandle.unref) tickHandle.unref();
    console.log("[quest] controller started");
  }
  function stop() {
    if (tickHandle) clearInterval(tickHandle);
    tickHandle = null;
  }

  /* ---- State for API ---- */

  async function stateFor(db, token, questId) {
    let accountId = null;
    if (token) {
      const acc = await db.findAccountByToken(token);
      if (acc) accountId = acc.id;
    }
    // Retorna lista de lobbys abertos da quest
    const openLobbys = [];
    for (const [, lobby] of lobbys) {
      if (questId && lobby.questId !== questId) continue;
      openLobbys.push(publicLobbyState(lobby, accountId));
    }
    return { code: 200, body: { ok: true, lobbys: openLobbys, questId } };
  }

  function listQuests() {
    const list = [];
    for (const id in QUEST_DEFS) {
      const q = QUEST_DEFS[id];
      list.push({
        id: q.id,
        name: q.name,
        level: q.level,
        maxPlayers: q.maxPlayers,
        description: q.description,
        icon: q.icon,
        rewards: q.rewards,
        outfitReward: q.outfitReward || null,
        boss: q.boss,
        bossSprite: q.bossSprite,
      });
    }
    return list;
  }

  /* ---- Create lobby (API) ---- */

  async function apiCreateLobby(db, body) {
    const acc = await db.findAccountByToken(body && body.token);
    if (!acc) return { code: 401, body: { ok: false, msg: "Sessão inválida" } };
    const questId = String(body && body.questId || "");
    if (!questDef(questId)) {
      return { code: 400, body: { ok: false, error: "INVALID_QUEST", msg: "Quest inválida." } };
    }
    const r = createLobby(questId, acc.id);
    if (!r.ok) return { code: 409, body: r };
    // Auto-join creator
    const charId = Number(body && (body.characterId || body.character_id || (body.characterIds && body.characterIds[0])));
    if (charId > 0) {
      const joined = await join(db, { token: body.token, lobbyId: r.lobbyId, characterId: charId });
      if (joined.code !== 200 || !joined.body || !joined.body.ok) {
        cancelLobby(r.lobbyId, "creator-join-failed");
        return joined;
      }
      return joined;
    }
    return { code: 200, body: publicLobbyState(r.lobby, acc.id) };
  }

  /* ---- Auto join (find open lobby or wait) ---- */

  async function autoJoin(db, body) {
    const acc = await db.findAccountByToken(body && body.token);
    if (!acc) return { code: 401, body: { ok: false, msg: "Sessão inválida" } };
    const questId = String(body && body.questId || "");
    if (!questDef(questId)) {
      return { code: 400, body: { ok: false, error: "INVALID_QUEST" } };
    }
    // Encontra lobby aberto
    for (const [lobbyId, lobby] of lobbys) {
      if (lobby.questId !== questId) continue;
      if (lobby.phase !== "lobby") continue;
      if (lobby.lobbyType !== "open") continue;
      const quest = questDef(questId);
      if (charCount(lobby) >= quest.maxPlayers) continue;
      // Tenta join neste lobby
      const charId = Number(body && (body.characterId || body.character_id || (body.characterIds && body.characterIds[0])));
      return join(db, { token: body.token, lobbyId, characterId: charId });
    }
    return { code: 404, body: { ok: false, error: "NO_OPEN_LOBBY", msg: "Nenhum lobby aberto para esta quest." } };
  }

  /* ---- Find lobby by instance ---- */

  function findLobbyByInstance(instanceId) {
    for (const [, lobby] of lobbys) {
      if (lobby.instanceId === String(instanceId)) return lobby;
    }
    return null;
  }
  function findLobbyById(lobbyId) {
    return lobbys.get(lobbyId) || null;
  }

  return {
    start, stop, tick,
    join, leave, markLoaded, reportCombat, startFight,
    apiCreateLobby, autoJoin, chooseReward,
    stateFor, listQuests,
    findLobbyByInstance, findLobbyById,
    kickPlayer, onSharedEnded,
    membersForStart, computeWaves, computeMonstersPerWave,
    QUEST_DEFS,
  };
}

module.exports = { createQuestController, QUEST_DEFS };
