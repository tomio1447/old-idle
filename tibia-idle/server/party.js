/*
 * party.js — Lógica de PARTY multiplayer (convites assíncronos + follow).
 *
 * Regras (manual do Tibia + pedido do dono do jogo):
 *   1. CONVITE: o LÍDER só pode convidar estando em Safe Zone (cidade) ou
 *      Área de Treino (academia / sala de exercise weapons). A zona do
 *      líder é mantida em parties.leader_zone pelas transições de mapa
 *      (POST /api/party/zone) e validada AQUI antes de criar o convite.
 *   2. INBOX: o convite fica PENDENTE no servidor. O jogador convidado
 *      pode trocar para o personagem (da conta dele), abrir a interface
 *      de Party e aceitar de lá (POST /api/party/accept).
 *   3. FOLLOW: quando o líder entra numa hunt (instância non-pvp/pvp) ou
 *      numa sala de boss, o servidor gera um NONCE de uso único POR MEMBRO
 *      com o destino (hunt/instância/otbm/boss). O membro — online agora
 *      ou quando logar — recebe o destino via GET /api/party/state e
 *      confirma o teleporte com POST /api/party/follow, que CONSUME o
 *      nonce. Isso impede teleporte indevido e replay.
 *
 * Segurança:
 *   - toda rota valida o token -> conta -> personagem (o personagem que
 *     age TEM que pertencer à conta autenticada);
 *   - o líder não pode convidar/ser convidado fora de safe zone;
 *   - cada personagem só pode estar em 1 party e ter 1 convite pendente
 *     (UNIQUEs no banco + checagem explícita);
 *   - nonce de follow consumido atomicamente (UPDATE ... WHERE nonce = ?).
 */
"use strict";

const crypto = require("crypto");

/* Zonas onde o LÍDER pode convidar (regra oficial do pedido). */
const ZONES_CONVIDAR = ["city", "training"];

/* Máximo de pessoas na party (líder + 4). */
const PARTY_MAX_MEMBERS = 5;

/* Validade do convite (ms): 7 dias. */
const INVITE_TTL_MS = 7 * 24 * 3600 * 1000;

/* Transições legais de zona (anti-exploit: o servidor não aceita saltos
 * impossíveis, ex.: boss -> hunt direto sem voltar para a cidade). */
const ZONE_LEGAL = {
  unknown:  ["city", "training", "hunt", "boss"],
  city:     ["city", "training", "hunt", "boss"],
  training: ["training", "city", "hunt", "boss"],
  hunt:     ["hunt", "city", "training"],
  boss:     ["boss", "city", "training"],
};

/* Valida o token e devolve { account, char } — o personagem TEM que
 * pertencer à conta do token (não dá para agir por outra conta). */
async function authChar(db, token, charId) {
  const acc = await db.findAccountByToken(token);
  if (!acc) return { error: { code: 401, body: { ok: false, msg: "Sessão inválida" } } };
  let c = null;
  if (charId) {
    c = await db.findCharacter(Number(charId));
    if (!c || c.account_id !== acc.id) {
      return { error: { code: 403, body: { ok: false, msg: "Personagem não pertence à sua conta" } } };
    }
  }
  return { account: acc, char: c };
}

/* Party atual de um personagem (como líder ou membro). */
async function partyOf(db, charId) {
  const asLeader = await db.partyFindByLeader(charId);
  if (asLeader) return asLeader;
  return db.partyFindByCharacter(charId);
}

/* Gera um nonce aleatório (follow de uso único). */
function newNonce() {
  return crypto.randomBytes(16).toString("hex");
}

/* Monta o estado público da party para um personagem. */
async function partyStateFor(db, party, charId) {
  const members = await db.partyMembers(party.id);
  const leader = await db.findCharacter(party.leader_id);
  const isLeader = Number(party.leader_id) === Number(charId);
  const isMember = members.some((m) => Number(m.id) === Number(charId));
  // follow pendente APENAS para membros (o líder não se segue)
  let follow = null;
  if (!isLeader && isMember) {
    follow = await db.partyFollow(party.id, charId);
  }
  return {
    ok: true,
    state: {
      id: party.id,
      isLeader,
      leader: {
        id: party.leader_id,
        name: party.leader_name || (leader ? leader.name : "?"),
        zone: party.leader_zone,
        hunt: party.leader_hunt,
        instance: party.leader_instance,
        otbm: party.leader_otbm,
        boss: party.leader_boss,
      },
      members: members.map((m) => ({
        id: m.id, name: m.name, voc: m.voc, level: m.level,
      })),
      follow: follow ? {
        nonce: follow.nonce,
        hunt: follow.hunt,
        instance: follow.instance,
        otbm: follow.otbm,
        boss: follow.boss,
      } : null,
      shareExp: false,
    },
  };
}

/* ------------------------------ rotas ------------------------------ */

/* POST /api/party/create — cria a party (o char vira líder). */
async function partyCreate(db, body) {
  const { account, char, error } = await authChar(db, body.token, body.char_id);
  if (error) return error;
  if (!char) return { code: 400, body: { ok: false, msg: "Selecione um personagem" } };
  // já está em party (como líder ou membro)?
  const exist = await partyOf(db, char.id);
  if (exist) return { code: 409, body: { ok: false, msg: "Você já está em uma party" } };
  const party = await db.partyCreate(char);
  return { code: 201, body: await partyStateFor(db, party, char.id) };
}

/* POST /api/party/invite — líder convida por NOME de personagem.
 * Regra: o líder precisa estar em Safe Zone (cidade) ou Área de Treino. */
async function partyInvite(db, body) {
  const { account, char, error } = await authChar(db, body.token, body.char_id);
  if (error) return error;
  if (!char) return { code: 400, body: { ok: false, msg: "Selecione um personagem" } };

  const party = await partyOf(db, char.id);
  if (!party || Number(party.leader_id) !== Number(char.id)) {
    return { code: 403, body: { ok: false, msg: "Só o líder da party pode convidar" } };
  }
  // REGRA DE ZONA: convidar só de cidade (safe zone) ou treino
  if (ZONES_CONVIDAR.indexOf(party.leader_zone) === -1) {
    return {
      code: 403,
      body: {
        ok: false,
        msg: "O líder só pode convidar estando na Cidade (safe zone) ou Área de Treino",
      },
    };
  }

  const name = String(body.invitee_name || "").trim();
  if (!name) return { code: 400, body: { ok: false, msg: "Nome do personagem obrigatório" } };
  const target = await db.findCharacterByName(name);
  if (!target) return { code: 404, body: { ok: false, msg: "Personagem não encontrado" } };
  if (Number(target.id) === Number(char.id)) {
    return { code: 400, body: { ok: false, msg: "Não pode se convidar" } };
  }
  // alvo não pode estar em outra party
  const targetParty = await partyOf(db, target.id);
  if (targetParty) {
    return { code: 409, body: { ok: false, msg: target.name + " já está em uma party" } };
  }
  // limite de membros (líder + 4)
  const members = await db.partyMembers(party.id);
  if (members.length + 1 > PARTY_MAX_MEMBERS - 1) {
    return { code: 400, body: { ok: false, msg: "Party cheia (máx. " + PARTY_MAX_MEMBERS + ")" } };
  }
  // um convite pendente por convidado (inbox não pode acumular spam)
  const pendente = await db.pendingInviteFor(target.id);
  if (pendente) {
    return { code: 409, body: { ok: false, msg: target.name + " já tem um convite pendente" } };
  }

  const expiresAt = new Date(Date.now() + INVITE_TTL_MS).toISOString();
  const inv = await db.inviteCreate(party.id, char.id, target.id, expiresAt);
  return {
    code: 201,
    body: {
      ok: true,
      invite: {
        id: inv.id,
        invitee_id: inv.invitee_id,
        invitee_name: target.name,
        expires_at: inv.expires_at,
      },
    },
  };
}

/* GET /api/party/inbox — convites PENDENTES de todos os personagens da
 * conta (o jogador pode trocar de personagem e aceitar de lá). */
async function partyInbox(db, token) {
  const acc = await db.findAccountByToken(token);
  if (!acc) return { code: 401, body: { ok: false, msg: "Sessão inválida" } };
  const chars = await db.charactersOf(acc.id);
  const invites = [];
  for (const c of chars) {
    const list = await db.invitesFor(c.id, "pending");
    for (const i of list) {
      invites.push({
        id: i.id,
        party_id: i.party_id,
        leader_id: i.leader_id,
        leader_name: i.leader_name,
        leader_zone: i.leader_zone,
        character_id: i.invitee_id,
        character_name: c.name,
        created_at: i.created_at,
        expires_at: i.expires_at,
      });
    }
  }
  return { code: 200, body: { ok: true, invites } };
}

/* POST /api/party/accept — aceita um convite pendente. O personagem
 * convidado precisa pertencer à conta autenticada. */
async function partyAccept(db, body) {
  const { account, error } = await authChar(db, body.token, null);
  if (error) return error;
  const inv = await db.inviteFind(Number(body.invite_id));
  if (!inv || inv.status !== "pending") {
    return { code: 404, body: { ok: false, msg: "Convite não encontrado ou já respondido" } };
  }
  if (inv.expires_at && new Date(inv.expires_at).getTime() < Date.now()) {
    await db.inviteUpdate(inv.id, { status: "expired" });
    return { code: 410, body: { ok: false, msg: "Convite expirado" } };
  }
  // o convidado tem que ser da conta logada (troca de personagem ok, mas
  // não dá para aceitar com a conta errada)
  const invitee = await db.findCharacter(inv.invitee_id);
  if (!invitee || invitee.account_id !== account.id) {
    return { code: 403, body: { ok: false, msg: "Convite não pertence à sua conta" } };
  }
  // a party ainda existe? (o líder pode ter dissolvido)
  const party = await db.partyFindByLeader(inv.leader_id);
  if (!party) {
    await db.inviteUpdate(inv.id, { status: "cancelled" });
    return { code: 410, body: { ok: false, msg: "A party foi dissolvida" } };
  }
  // membro não pode estar em outra party
  const other = await partyOf(db, invitee.id);
  if (other && Number(other.id) !== Number(party.id)) {
    await db.inviteUpdate(inv.id, { status: "declined" });
    return { code: 409, body: { ok: false, msg: "Você já está em outra party" } };
  }
  // party cheia?
  const members = await db.partyMembers(party.id);
  if (members.length + 1 > PARTY_MAX_MEMBERS - 1) {
    await db.inviteUpdate(inv.id, { status: "declined" });
    return { code: 400, body: { ok: false, msg: "Party cheia" } };
  }
  await db.partyAddMember(party.id, invitee.id);
  await db.inviteUpdate(inv.id, { status: "accepted" });
  return { code: 200, body: { ok: true, msg: "Você entrou na party de " + party.leader_name } };
}

/* POST /api/party/decline — recusa um convite. */
async function partyDecline(db, body) {
  const { account, error } = await authChar(db, body.token, null);
  if (error) return error;
  const inv = await db.inviteFind(Number(body.invite_id));
  if (!inv || inv.status !== "pending") {
    return { code: 404, body: { ok: false, msg: "Convite não encontrado" } };
  }
  const invitee = await db.findCharacter(inv.invitee_id);
  if (!invitee || invitee.account_id !== account.id) {
    return { code: 403, body: { ok: false, msg: "Convite não pertence à sua conta" } };
  }
  await db.inviteUpdate(inv.id, { status: "declined" });
  return { code: 200, body: { ok: true, msg: "Convite recusado" } };
}

/* POST /api/party/leave — sai da party. Se o LÍDER sai, a party é
 * dissolvida (convites pendentes cancelados junto). */
async function partyLeave(db, body) {
  const { char, error } = await authChar(db, body.token, body.char_id);
  if (error) return error;
  if (!char) return { code: 400, body: { ok: false, msg: "Selecione um personagem" } };
  const party = await partyOf(db, char.id);
  if (!party) return { code: 404, body: { ok: false, msg: "Você não está em uma party" } };
  if (Number(party.leader_id) === Number(char.id)) {
    await db.partyDelete(party.id);
    return { code: 200, body: { ok: true, msg: "Party dissolvida" } };
  }
  await db.partyRemoveMember(party.id, char.id);
  return { code: 200, body: { ok: true, msg: "Você saiu da party" } };
}

/* POST /api/party/kick — líder remove um membro. */
async function partyKick(db, body) {
  const { char, error } = await authChar(db, body.token, body.char_id);
  if (error) return error;
  if (!char) return { code: 400, body: { ok: false, msg: "Selecione um personagem" } };
  const party = await partyOf(db, char.id);
  if (!party || Number(party.leader_id) !== Number(char.id)) {
    return { code: 403, body: { ok: false, msg: "Só o líder pode remover membros" } };
  }
  const memberId = Number(body.member_id);
  if (Number(party.leader_id) === memberId) {
    return { code: 400, body: { ok: false, msg: "Não pode remover o líder" } };
  }
  await db.partyRemoveMember(party.id, memberId);
  return { code: 200, body: { ok: true, msg: "Membro removido" } };
}

/* GET /api/party/state — estado da party + follow pendente do personagem. */
async function partyState(db, token, charId) {
  const { char, error } = await authChar(db, token, charId);
  if (error) return error;
  if (!char) return { code: 400, body: { ok: false, msg: "Selecione um personagem" } };
  const party = await partyOf(db, char.id);
  if (!party) return { code: 200, body: { ok: true, state: null } };
  return { code: 200, body: await partyStateFor(db, party, char.id) };
}

/* POST /api/party/zone — o LÍDER reporta a transição de mapa.
 *   body: { token, char_id, zone, hunt?, instance?, otbm?, boss? }
 * Ao entrar em hunt/boss, gera um follow (nonce por membro) com o destino.
 * Quem não é líder é ignorado (não dá para forçar o teleporte). */
async function partyReportZone(db, body) {
  const { char, error } = await authChar(db, body.token, body.char_id);
  if (error) return error;
  if (!char) return { code: 400, body: { ok: false, msg: "Selecione um personagem" } };
  const party = await partyOf(db, char.id);
  if (!party || Number(party.leader_id) !== Number(char.id)) {
    // não é líder: no-op silencioso (membro não controla a zona da party)
    return { code: 200, body: { ok: true, ignored: true } };
  }

  const zone = String(body.zone || "").toLowerCase();
  if (["city", "training", "hunt", "boss"].indexOf(zone) === -1) {
    return { code: 400, body: { ok: false, msg: "Zona inválida" } };
  }
  // máquina de estados: salto impossível é rejeitado
  const legais = ZONE_LEGAL[party.leader_zone] || ZONE_LEGAL.unknown;
  if (legais.indexOf(zone) === -1) {
    return {
      code: 400,
      body: { ok: false, msg: "Transição inválida: " + party.leader_zone + " -> " + zone },
    };
  }
  if (zone === "hunt" && !body.hunt) {
    return { code: 400, body: { ok: false, msg: "hunt_id obrigatório" } };
  }
  if (zone === "boss" && !body.boss) {
    return { code: 400, body: { ok: false, msg: "boss obrigatório" } };
  }

  // monta o follow (por membro) quando o líder entra em hunt/boss
  let follows = [];
  if (zone === "hunt" || zone === "boss") {
    const members = await db.partyMembers(party.id);
    const f = {
      hunt: zone === "hunt" ? String(body.hunt) : null,
      instance: zone === "hunt" ? String(body.instance || "non-pvp") : null,
      otbm: zone === "hunt" ? (body.otbm || null) : null,
      boss: zone === "boss" ? String(body.boss) : null,
    };
    follows = members.map((m) => Object.assign({ character_id: Number(m.id), nonce: newNonce() }, f));
  }

  await db.partySetZone(party.id, zone, {
    hunt: zone === "hunt" ? String(body.hunt) : null,
    instance: zone === "hunt" ? String(body.instance || "non-pvp") : null,
    otbm: zone === "hunt" ? (body.otbm || null) : null,
    boss: zone === "boss" ? String(body.boss) : null,
    follows,
  });

  return {
    code: 200,
    body: {
      ok: true,
      zone,
      followed: follows.length,   // nº de membros com follow pendente
    },
  };
}

/* POST /api/party/follow — membro confirma que foi teleportado.
 * body: { token, char_id, nonce } — o nonce é consumido (uso único). */
async function partyFollow(db, body) {
  const { char, error } = await authChar(db, body.token, body.char_id);
  if (error) return error;
  if (!char) return { code: 400, body: { ok: false, msg: "Selecione um personagem" } };
  const nonce = String(body.nonce || "");
  if (!nonce) return { code: 400, body: { ok: false, msg: "nonce obrigatório" } };
  const party = await partyOf(db, char.id);
  if (!party || Number(party.leader_id) === Number(char.id)) {
    return { code: 403, body: { ok: false, msg: "Só membros podem confirmar follow" } };
  }
  // consome atomicamente: só o membro com ESTE nonce consegue
  const ok = await db.partyConsumeFollow(party.id, char.id, nonce);
  if (!ok) return { code: 409, body: { ok: false, msg: "Follow já consumido ou inválido" } };
  return { code: 200, body: { ok: true, msg: "Follow confirmado" } };
}

module.exports = {
  ZONES_CONVIDAR,
  PARTY_MAX_MEMBERS,
  partyCreate,
  partyInvite,
  partyInbox,
  partyAccept,
  partyDecline,
  partyLeave,
  partyKick,
  partyState,
  partyReportZone,
  partyFollow,
};
