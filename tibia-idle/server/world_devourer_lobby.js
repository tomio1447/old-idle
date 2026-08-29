/*
 * megalomania_lobby.js — lobby 1–5 jogadores (1 char cada) para Goshnar's
 * Megalomania. Convites por nome, templo obrigatório, sem party, limite de
 * 2 personagens por conta a cada 24h.
 */
"use strict";

const crypto = require("crypto");
const LOBBY_TTL_MS = 30 * 60 * 1000;
const INVITE_TTL_MS = 2 * 60 * 1000;
const COOLDOWN_MS = 24 * 60 * 60 * 1000;
const MAX_SLOTS = 5;
const MAX_CHARS_PER_ACCOUNT_24H = 2;
// TEMP TEST: remove before release — bypass taints (client), templo/party/cooldown.
// Máculas Soul War são gated no client (BOSS_DEFS/bossReadyInfo); este flag
// também libera checks do lobby e é lido pelo authoritative_engine.
const MEGA_TEST_BYPASS = true;

function now() { return Date.now(); }
function newId() { return crypto.randomBytes(16).toString("hex"); }

function createMegalomaniaLobbyController(opts) {
  opts = opts || {};
  const publishAccount = typeof opts.publishAccount === "function" ? opts.publishAccount : () => {};
  const getDb = typeof opts.getDb === "function" ? opts.getDb : () => null;

  const lobbies = new Map(); // lobbyId -> lobby
  const byAccount = new Map(); // accountId -> lobbyId
  const invites = new Map(); // inviteId -> invite
  const inboxByAccount = new Map(); // accountId -> Set(inviteId)
  const shareByAccount = new Map(); // accountId -> { lobbyId, ownerAccountId, instanceId }
  const pendingIntentsByOwner = new Map(); // ownerAccountId -> intent[]

  function queueIntent(ownerAccountId, intent) {
    const oid = Number(ownerAccountId);
    if (!oid || !intent) return;
    if (!pendingIntentsByOwner.has(oid)) pendingIntentsByOwner.set(oid, []);
    const list = pendingIntentsByOwner.get(oid);
    list.push(intent);
    if (list.length > 40) list.splice(0, list.length - 40);
  }

  function drainIntents(ownerAccountId) {
    const oid = Number(ownerAccountId);
    const list = pendingIntentsByOwner.get(oid) || [];
    pendingIntentsByOwner.delete(oid);
    return list;
  }

  function lobbyPublic(lobby, viewerAccountId) {
    if (!lobby) return null;
    return {
      id: lobby.id,
      status: lobby.status,
      leaderAccountId: lobby.leaderAccountId,
      leaderName: lobby.leaderName,
      slots: lobby.slots.map((s) => s ? {
        accountId: s.accountId,
        playerName: s.playerName,
        charId: s.charId,
        charName: s.charName,
        voc: s.voc,
        level: s.level,
        ready: !!s.ready,
      } : null),
      filled: lobby.slots.filter(Boolean).length,
      max: MAX_SLOTS,
      youAreLeader: Number(viewerAccountId) === Number(lobby.leaderAccountId),
      yourSlot: lobby.slots.findIndex((s) => s && Number(s.accountId) === Number(viewerAccountId)),
      instanceId: lobby.instanceId || null,
      startedAt: lobby.startedAt || null,
    };
  }

  function getLobbyForAccount(accountId) {
    const id = byAccount.get(Number(accountId));
    return id ? lobbies.get(id) : null;
  }

  /* Instância pode ficar na conta do líder original mesmo após ele sair
   * (morte): convidados e publishInstance precisam achar o lobby pelo dono. */
  function getLobbyByInstanceOwner(accountId) {
    const aid = Number(accountId);
    for (const lobby of lobbies.values()) {
      if (lobby && Number(lobby.instanceOwnerAccountId) === aid) return lobby;
    }
    return null;
  }

  function remainingSlots(lobby) {
    return (lobby && lobby.slots || []).filter(Boolean);
  }

  function reassignLeader(lobby) {
    const left = remainingSlots(lobby);
    if (!left.length) return null;
    if (!left.some((s) => Number(s.accountId) === Number(lobby.leaderAccountId))) {
      lobby.leaderAccountId = left[0].accountId;
      lobby.leaderName = left[0].playerName || left[0].charName;
    }
    return left;
  }

  /* Remove a conta do lobby. Durante a luta (keepFighting): não encerra o
   * lobby se ainda houver lutadores; só reatribui o líder visual. */
  function detachAccount(accountId, optsIn) {
    const opts = optsIn || {};
    const aid = Number(accountId);
    const lobbyId = byAccount.get(aid);
    byAccount.delete(aid);
    shareByAccount.delete(aid);
    if (!lobbyId) return { lobby: null, remaining: 0, closed: false };
    const lobby = lobbies.get(lobbyId);
    if (!lobby) return { lobby: null, remaining: 0, closed: false };
    const wasLeader = Number(lobby.leaderAccountId) === aid;
    for (let i = 0; i < lobby.slots.length; i++) {
      if (lobby.slots[i] && Number(lobby.slots[i].accountId) === aid) lobby.slots[i] = null;
    }
    const left = reassignLeader(lobby);
    if (!left || !left.length) {
      closeLobby(lobby, opts.reason || "empty");
      return { lobby: null, remaining: 0, closed: true };
    }
    if (opts.keepFighting) {
      publishLobby(lobby);
      return { lobby, remaining: left.length, closed: false };
    }
    // Lobby aberto: líder sair dissolve (comportamento antigo).
    if (wasLeader || opts.forceClose) {
      closeLobby(lobby, opts.reason || "leader-left");
      return { lobby: null, remaining: 0, closed: true };
    }
    publishLobby(lobby);
    return { lobby, remaining: left.length, closed: false };
  }

  function closeLobby(lobby, reason) {
    if (!lobby) return;
    lobby.status = "closed";
    lobby.closedReason = reason || "closed";
    for (const s of lobby.slots) {
      if (!s) continue;
      byAccount.delete(Number(s.accountId));
      shareByAccount.delete(Number(s.accountId));
      publishAccount(s.accountId, "mega-lobby", { action: "closed", reason: lobby.closedReason, lobby: null });
    }
    lobbies.delete(lobby.id);
  }

  function publishLobby(lobby) {
    if (!lobby) return;
    for (const s of lobby.slots) {
      if (!s) continue;
      publishAccount(s.accountId, "mega-lobby", {
        action: "update", lobby: lobbyPublic(lobby, s.accountId),
      });
    }
  }

  function parseCharData(character) {
    let data = {};
    try { data = typeof character.data === "string" ? JSON.parse(character.data) : (character.data || {}); }
    catch (e) { data = {}; }
    return data && typeof data === "object" ? data : {};
  }

  function charCooldownStamp(character) {
    const data = parseCharData(character);
    return Number(data.megaLastFightAt) || 0;
  }

  async function accountMegaUsage(db, accountId, ts) {
    const list = typeof db.charactersOf === "function"
      ? await db.charactersOf(accountId) : [];
    const active = [];
    for (const c of list || []) {
      const at = charCooldownStamp(c);
      if (at && ts - at < COOLDOWN_MS) active.push({ charId: Number(c.id), at, name: c.name });
    }
    return active;
  }

  async function assertCanUseChar(db, accountId, character, ts) {
    // TEMP TEST: remove before release
    if (MEGA_TEST_BYPASS) return { ok: true };
    const aid = Number(accountId);
    const cid = Number(character.id);
    const usage = await accountMegaUsage(db, aid, ts);
    const self = usage.find((u) => u.charId === cid);
    if (self) return { ok: false, msg: "Este personagem já entrou no Megalomania nas últimas 24h." };
    if (usage.length >= MAX_CHARS_PER_ACCOUNT_24H)
      return { ok: false, msg: "Sua conta já usou 2 personagens no Megalomania nas últimas 24h." };
    return { ok: true };
  }

  async function assertTempleAndNoParty(db, accountId, character) {
    // TEMP TEST: remove before release
    if (MEGA_TEST_BYPASS) return { ok: true };
    const party = await db.partyFindByCharacter(Number(character.id));
    if (party) return { ok: false, msg: "O personagem não pode estar em Party." };
    const zone = character._megaZone || null;
    // Cliente envia inTemple no request; se party zone existir e não for city, rejeita.
    if (party && party.leader_zone && party.leader_zone !== "city") {
      return { ok: false, msg: "É obrigatório estar no templo." };
    }
    return { ok: true };
  }

  function slotPayload(accountId, playerName, character) {
    const data = parseCharData(character);
    return {
      accountId: Number(accountId),
      playerName: String(playerName || character.name || "?"),
      charId: Number(character.id),
      charName: String(character.name || "?"),
      voc: String(character.voc || data.voc || "none"),
      level: Math.max(1, Number(character.level || data.level) || 1),
      ready: true,
    };
  }

  async function createLobby(db, acc, character, optsIn) {
    const ts = now();
    optsIn = optsIn || {};
    // TEMP TEST: remove before release — templo/party liberados com MEGA_TEST_BYPASS.
    if (!MEGA_TEST_BYPASS && !optsIn.inTemple)
      return { code: 403, body: { ok: false, msg: "É obrigatório estar no templo para abrir o lobby." } };
    if (!MEGA_TEST_BYPASS) {
      const party = await db.partyFindByCharacter(Number(character.id));
      if (party) return { code: 409, body: { ok: false, msg: "Saia da Party antes de abrir o lobby do Megalomania." } };
    }
    const can = await assertCanUseChar(db, acc.id, character, ts);
    if (!can.ok) return { code: 403, body: { ok: false, msg: can.msg } };
    detachAccount(acc.id);
    const lobby = {
      id: newId(),
      status: "open",
      leaderAccountId: Number(acc.id),
      leaderName: String(optsIn.playerName || character.name || "Leader"),
      slots: [slotPayload(acc.id, optsIn.playerName || character.name, character), null, null, null, null],
      createdAt: ts,
      instanceId: null,
      startedAt: null,
    };
    lobbies.set(lobby.id, lobby);
    byAccount.set(Number(acc.id), lobby.id);
    publishLobby(lobby);
    return { code: 200, body: { ok: true, lobby: lobbyPublic(lobby, acc.id) } };
  }

  async function invite(db, acc, inviteeName) {
    const lobby = getLobbyForAccount(acc.id);
    if (!lobby || lobby.status !== "open")
      return { code: 404, body: { ok: false, msg: "Lobby não encontrado." } };
    if (Number(lobby.leaderAccountId) !== Number(acc.id))
      return { code: 403, body: { ok: false, msg: "Só o líder pode convidar." } };
    if (lobby.slots.filter(Boolean).length >= MAX_SLOTS)
      return { code: 409, body: { ok: false, msg: "Lobby cheio (máx. 5)." } };
    const target = await db.findCharacterByName(String(inviteeName || "").trim());
    if (!target) return { code: 404, body: { ok: false, msg: "Personagem não encontrado." } };
    if (Number(target.account_id) === Number(acc.id))
      return { code: 400, body: { ok: false, msg: "Convide outro jogador (outra conta)." } };
    if (lobby.slots.some((s) => s && Number(s.accountId) === Number(target.account_id)))
      return { code: 409, body: { ok: false, msg: "Esse jogador já está no lobby." } };
    if (getLobbyForAccount(target.account_id))
      return { code: 409, body: { ok: false, msg: "Esse jogador já está em outro lobby." } };
    const inviteId = newId();
    const inv = {
      id: inviteId,
      lobbyId: lobby.id,
      fromAccountId: Number(acc.id),
      fromName: lobby.leaderName,
      toAccountId: Number(target.account_id),
      toHintName: String(target.name),
      createdAt: now(),
      expiresAt: now() + INVITE_TTL_MS,
    };
    invites.set(inviteId, inv);
    if (!inboxByAccount.has(inv.toAccountId)) inboxByAccount.set(inv.toAccountId, new Set());
    inboxByAccount.get(inv.toAccountId).add(inviteId);
    publishAccount(inv.toAccountId, "mega-lobby", {
      action: "invite", invite: {
        id: inv.id, fromName: inv.fromName, toHintName: inv.toHintName,
        expiresAt: inv.expiresAt, lobbyId: inv.lobbyId,
      },
    });
    return { code: 200, body: { ok: true, inviteId, lobby: lobbyPublic(lobby, acc.id) } };
  }

  function listInbox(accountId) {
    const set = inboxByAccount.get(Number(accountId)) || new Set();
    const out = [];
    const ts = now();
    for (const id of [...set]) {
      const inv = invites.get(id);
      if (!inv || inv.expiresAt < ts) {
        set.delete(id); invites.delete(id); continue;
      }
      out.push({
        id: inv.id, fromName: inv.fromName, toHintName: inv.toHintName,
        expiresAt: inv.expiresAt, lobbyId: inv.lobbyId,
      });
    }
    return out;
  }

  async function declineInvite(db, acc, inviteId) {
    const inv = invites.get(String(inviteId || ""));
    if (!inv || Number(inv.toAccountId) !== Number(acc.id))
      return { code: 404, body: { ok: false, msg: "Convite inválido." } };
    invites.delete(inv.id);
    const set = inboxByAccount.get(inv.toAccountId);
    if (set) set.delete(inv.id);
    const lobby = lobbies.get(inv.lobbyId);
    publishAccount(inv.fromAccountId, "mega-lobby", {
      action: "invite-declined",
      fromInvitee: inv.toHintName,
      msg: `${inv.toHintName} recusou o convite.`,
      lobby: lobby ? lobbyPublic(lobby, inv.fromAccountId) : null,
    });
    return { code: 200, body: { ok: true } };
  }

  async function acceptInvite(db, acc, inviteId, character, optsIn) {
    optsIn = optsIn || {};
    const inv = invites.get(String(inviteId || ""));
    if (!inv || Number(inv.toAccountId) !== Number(acc.id))
      return { code: 404, body: { ok: false, msg: "Convite inválido ou expirado." } };
    if (inv.expiresAt < now()) {
      invites.delete(inv.id);
      return { code: 410, body: { ok: false, msg: "Convite expirado." } };
    }
    // TEMP TEST: remove before release — templo/party liberados com MEGA_TEST_BYPASS.
    if (!MEGA_TEST_BYPASS && !optsIn.inTemple)
      return { code: 403, body: { ok: false, msg: "É obrigatório estar no templo para aceitar." } };
    if (!MEGA_TEST_BYPASS) {
      const party = await db.partyFindByCharacter(Number(character.id));
      if (party) return { code: 409, body: { ok: false, msg: "Saia da Party antes de entrar no lobby." } };
    }
    if (Number(character.account_id) !== Number(acc.id))
      return { code: 403, body: { ok: false, msg: "Personagem não pertence à conta." } };
    const can = await assertCanUseChar(db, acc.id, character, now());
    if (!can.ok) return { code: 403, body: { ok: false, msg: can.msg } };
    const lobby = lobbies.get(inv.lobbyId);
    if (!lobby || lobby.status !== "open")
      return { code: 409, body: { ok: false, msg: "Lobby não está mais aberto." } };
    if (lobby.slots.some((s) => s && Number(s.accountId) === Number(acc.id)))
      return { code: 409, body: { ok: false, msg: "Você já está no lobby." } };
    const empty = lobby.slots.findIndex((s) => !s);
    if (empty < 0) return { code: 409, body: { ok: false, msg: "Lobby cheio." } };
    detachAccount(acc.id);
    lobby.slots[empty] = slotPayload(acc.id, optsIn.playerName || character.name, character);
    byAccount.set(Number(acc.id), lobby.id);
    invites.delete(inv.id);
    const set = inboxByAccount.get(inv.toAccountId);
    if (set) set.delete(inv.id);
    publishLobby(lobby);
    publishAccount(inv.fromAccountId, "mega-lobby", {
      action: "invite-accepted",
      fromInvitee: character.name,
      msg: `${character.name} entrou no lobby.`,
      lobby: lobbyPublic(lobby, inv.fromAccountId),
    });
    return { code: 200, body: { ok: true, lobby: lobbyPublic(lobby, acc.id) } };
  }

  async function leave(db, acc) {
    const lobby = getLobbyForAccount(acc.id);
    if (!lobby) return { code: 200, body: { ok: true, lobby: null } };
    if (lobby.status === "fighting" || lobby.status === "starting")
      return { code: 409, body: { ok: false, msg: "Não é possível sair durante a luta. (morte usa leave-fight)" } };
    detachAccount(acc.id, { reason: "left" });
    return { code: 200, body: { ok: true, lobby: null } };
  }

  /* Morte / ejeção durante a luta: tira o jogador do lobby. Se ainda houver
   * lutadores, transfere a instância para o novo líder (senão o combate
   * congela — só o dono da row avança o tick). Se a sala esvaziar, o caller
   * (rota leave-fight) deve encerrar a instância — senão fica um row “solo”
   * com personagens externos e o próximo PUT estoura INSTANCE_CHARACTER_NOT_OWNED. */
  async function leaveFight(db, acc) {
    try {
      const lobby = getLobbyForAccount(acc.id);
      if (!lobby) {
        return {
          code: 200,
          body: {
            ok: true, lobby: null, remaining: 0, shouldEndInstance: true,
            ownerAccountId: Number(acc.id), instanceId: null,
          },
        };
      }
      const wasOwner = Number(lobby.instanceOwnerAccountId || lobby.leaderAccountId) === Number(acc.id);
      const oldOwnerId = Number(lobby.instanceOwnerAccountId || 0) || Number(acc.id);
      const instanceId = lobby.instanceId ? String(lobby.instanceId) : null;
      const result = detachAccount(acc.id, {
        keepFighting: lobby.status === "fighting" || lobby.status === "starting",
        reason: "death-leave",
      });
      publishAccount(acc.id, "mega-lobby", {
        action: "left-fight",
        lobby: null,
        msg: "Você saiu do lobby Megalomania.",
      });
      const remaining = result.remaining || 0;
      let transferredTo = null;
      if (wasOwner && remaining > 0 && result.lobby && typeof db.instanceTransferOwner === "function") {
        const successorId = Number(result.lobby.leaderAccountId);
        if (successorId && successorId !== Number(acc.id)) {
          try {
            const tr = await db.instanceTransferOwner(oldOwnerId, successorId);
            if (tr && tr.ok && tr.instance) {
              result.lobby.instanceOwnerAccountId = successorId;
              for (const s of result.lobby.slots || []) {
                if (!s) continue;
                shareByAccount.set(Number(s.accountId), {
                  lobbyId: result.lobby.id,
                  ownerAccountId: successorId,
                  instanceId: String(result.lobby.instanceId || tr.instance.instance_id),
                });
              }
              // Move intents pendentes do dono antigo para o novo.
              const pending = drainIntents(oldOwnerId);
              for (const intent of pending) queueIntent(successorId, intent);
              transferredTo = successorId;
              publishLobby(result.lobby);
              publishAccount(successorId, "mega-lobby", {
                action: "takeover",
                lobby: lobbyPublic(result.lobby, successorId),
                instanceId: String(tr.instance.instance_id),
                msg: "Você assumiu o controle da sala Megalomania.",
              });
              if (typeof opts.publishInstance === "function") {
                opts.publishInstance(successorId, tr.instance);
              }
            }
          } catch (e) {
            console.error("[mega-lobby] transfer ownership failed:", e && e.message);
          }
        }
      }
      return {
        code: 200,
        body: {
          ok: true,
          lobby: null,
          remaining,
          wasOwner: !!wasOwner,
          transferredTo,
          shouldEndInstance: remaining === 0,
          ownerAccountId: oldOwnerId,
          instanceId,
        },
      };
    } catch (e) {
      console.error("[mega-lobby] leaveFight:", e && e.message);
      return {
        code: 200,
        body: {
          ok: true, lobby: null, remaining: 0, shouldEndInstance: true,
          ownerAccountId: Number(acc && acc.id) || 0, instanceId: null,
          softError: true,
        },
      };
    }
  }

  async function kick(db, acc, targetAccountId) {
    const lobby = getLobbyForAccount(acc.id);
    if (!lobby || Number(lobby.leaderAccountId) !== Number(acc.id))
      return { code: 403, body: { ok: false, msg: "Só o líder pode expulsar." } };
    if (Number(targetAccountId) === Number(acc.id))
      return { code: 400, body: { ok: false, msg: "Use sair para abandonar o lobby." } };
    detachAccount(targetAccountId);
    publishAccount(targetAccountId, "mega-lobby", { action: "kicked", lobby: null });
    if (lobbies.has(lobby.id)) publishLobby(lobby);
    return { code: 200, body: { ok: true, lobby: lobbyPublic(lobby, acc.id) } };
  }

  function bindShare(lobby, instanceId, ownerAccountId) {
    lobby.instanceId = instanceId;
    lobby.instanceOwnerAccountId = Number(ownerAccountId);
    lobby.status = "fighting";
    lobby.startedAt = now();
    for (const s of lobby.slots) {
      if (!s) continue;
      shareByAccount.set(Number(s.accountId), {
        lobbyId: lobby.id,
        ownerAccountId: Number(ownerAccountId),
        instanceId: String(instanceId),
      });
    }
    publishLobby(lobby);
  }

  function sharedForAccount(accountId) {
    return shareByAccount.get(Number(accountId)) || null;
  }

  function membersForStart(lobby) {
    return lobby.slots.filter(Boolean).map((s) => ({
      accountId: s.accountId,
      charId: s.charId,
      charName: s.charName,
      voc: s.voc,
      level: s.level,
    }));
  }

  async function start(db, acc) {
    const lobby = getLobbyForAccount(acc.id);
    if (!lobby || lobby.status !== "open")
      return { code: 404, body: { ok: false, msg: "Lobby não encontrado." } };
    if (Number(lobby.leaderAccountId) !== Number(acc.id))
      return { code: 403, body: { ok: false, msg: "Só o líder inicia a luta." } };
    const members = membersForStart(lobby);
    if (!members.length) return { code: 400, body: { ok: false, msg: "Lobby vazio." } };
    // Revalida party/cooldown de todos (TEMP TEST: MEGA_TEST_BYPASS pula)
    for (const m of members) {
      const character = await db.findCharacter(m.charId);
      if (!character) return { code: 404, body: { ok: false, msg: `Personagem ${m.charName} sumiu.` } };
      if (!MEGA_TEST_BYPASS) {
        const party = await db.partyFindByCharacter(m.charId);
        if (party) return { code: 409, body: { ok: false, msg: `${m.charName} ainda está em Party.` } };
      }
      const can = await assertCanUseChar(db, m.accountId, character, now());
      if (!can.ok) return { code: 403, body: { ok: false, msg: `${m.charName}: ${can.msg}` } };
    }
    lobby.status = "starting";
    publishLobby(lobby);
    publishAccount(acc.id, "mega-lobby", {
      action: "start",
      members,
      lobby: lobbyPublic(lobby, acc.id),
    });
    for (const m of members) {
      if (Number(m.accountId) === Number(acc.id)) continue;
      publishAccount(m.accountId, "mega-lobby", {
        action: "start",
        members,
        lobby: lobbyPublic(lobby, m.accountId),
        followCharId: m.charId,
      });
    }
    return { code: 200, body: { ok: true, members, lobby: lobbyPublic(lobby, acc.id) } };
  }

  async function markCharsUsed(db, members) {
    const ts = now();
    for (const m of members || []) {
      const character = await db.findCharacter(m.charId);
      if (!character) continue;
      const data = parseCharData(character);
      data.megaLastFightAt = ts;
      const payload = typeof character.data === "string" ? JSON.stringify(data) : data;
      if (typeof db.updateCharacter === "function") {
        await db.updateCharacter(character.id, character.voc, character.level || data.level || 1, payload, {
          zone: "boss", hp: data.hp, mp: data.mp, max_hp: data.maxHp, max_mp: data.maxMp,
        });
      }
    }
  }

  function stateFor(accountId) {
    const lobby = getLobbyForAccount(accountId);
    return {
      ok: true,
      lobby: lobby ? lobbyPublic(lobby, accountId) : null,
      inbox: listInbox(accountId),
      share: sharedForAccount(accountId),
      limits: { maxSlots: MAX_SLOTS, maxCharsPer24h: MAX_CHARS_PER_ACCOUNT_24H, cooldownMs: COOLDOWN_MS },
    };
  }

  function cleanup() {
    const ts = now();
    for (const [id, inv] of invites) {
      if (inv.expiresAt < ts) {
        invites.delete(id);
        const set = inboxByAccount.get(inv.toAccountId);
        if (set) set.delete(id);
      }
    }
    for (const [id, lobby] of lobbies) {
      if (lobby.status === "open" && ts - lobby.createdAt > LOBBY_TTL_MS)
        closeLobby(lobby, "expired");
      if (lobby.status === "fighting" && lobby.startedAt && ts - lobby.startedAt > 2 * 60 * 60 * 1000)
        closeLobby(lobby, "fight-timeout");
    }
  }

  const handle = setInterval(cleanup, 30000);
  if (handle.unref) handle.unref();

  return {
    createLobby, invite, acceptInvite, declineInvite, leave, leaveFight, kick, start,
    bindShare, sharedForAccount, stateFor, listInbox, markCharsUsed,
    getLobbyForAccount, getLobbyByInstanceOwner, membersForStart, closeLobby, lobbies,
    queueIntent, drainIntents,
  };
}

module.exports = {
  createMegalomaniaLobbyController, COOLDOWN_MS, MAX_SLOTS, MAX_CHARS_PER_ACCOUNT_24H,
  MEGA_TEST_BYPASS,
};
