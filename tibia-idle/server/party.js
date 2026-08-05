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

/* Pega o snapshot de vida/mana de um personagem (gravado pelo save do
 * cliente) + zona atual — para o painel de party do OTC. */
async function charSnapshot(db, charId) {
  const c = await db.findCharacter(Number(charId));
  if (!c) return null;
  return {
    id: Number(c.id),
    account_id: c.account_id ? Number(c.account_id) : null,
    name: c.name,
    voc: c.voc,
    level: c.level,
    zone: c.zone || "unknown",
    hp: Number(c.hp) || 0,
    mp: Number(c.mp) || 0,
    maxHp: Number(c.max_hp) || 0,
    maxMp: Number(c.max_mp) || 0,
  };
}

/* Monta o estado público da party para um personagem. */
async function partyStateFor(db, party, charId) {
  const members = await db.partyMembers(party.id);
  const isLeader = Number(party.leader_id) === Number(charId);
  const isMember = members.some((m) => Number(m.id) === Number(charId));
  // follow pendente APENAS para membros (o líder não se segue)
  let follow = null;
  if (!isLeader && isMember) {
    follow = await db.partyFollow(party.id, charId);
    // follow de RETORNO (líder saiu da hunt/boss): o marcador
    // '__RETURN_HOME__' vira returnHome:true com boss:null
    if (follow && follow.boss === "__RETURN_HOME__") {
      follow = { nonce: follow.nonce, hunt: null, instance: null,
                 otbm: null, boss: null, returnHome: true };
    }
  }
  const leaderSnap = await charSnapshot(db, party.leader_id);
  const memberSnaps = [];
  for (const m of members) {
    const s = await charSnapshot(db, m.id);
    if (s) memberSnaps.push(s);
  }
  return {
    ok: true,
    state: {
      id: party.id,
      isLeader,
      leader: Object.assign({
        hunt: party.leader_hunt,
        instance: party.leader_instance,
        otbm: party.leader_otbm,
        boss: party.leader_boss,
      }, leaderSnap || { id: party.leader_id, name: party.leader_name || "?", voc: "none", level: 1, zone: party.leader_zone }),
      members: memberSnaps,
      follow: follow ? {
        nonce: follow.nonce,
        hunt: follow.hunt,
        instance: follow.instance,
        otbm: follow.otbm,
        boss: follow.boss,
        // follow de RETORNO (líder saiu da instância): true = voltar p/ cidade
        returnHome: !!follow.returnHome,
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
 * convidado precisa pertencer à conta autenticada E estar em Safe Zone
 * (cidade) ou Área de Treino — regra do dono: jogadores em party só
 * circulam em cidade/treino, e é nessas condições que aceitam convite. */
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
  // REGRA: só aceita convite em Safe Zone (cidade) ou Área de Treino
  const invZone = invitee.zone || "unknown";
  if (ZONES_CONVIDAR.indexOf(invZone) === -1) {
    return {
      code: 403,
      body: {
        ok: false,
        msg: "Para aceitar um convite de party você precisa estar na Cidade (safe zone) ou na Área de Treino",
      },
    };
  }
  // a party ainda existe? (o líder pode ter dissolvido)
  const party = await db.partyFindByLeader(inv.leader_id);
  if (!party) {
    await db.inviteUpdate(inv.id, { status: "cancelled" });
    return { code: 410, body: { ok: false, msg: "A party foi dissolvida" } };
  }
  // REGRA: o LÍDER também precisa estar em Safe Zone (cidade) ou Área de
  // Treino para o convite ser aceito — se ele estiver numa hunt, ninguém
  // pode entrar na party (regra do dono).
  if (ZONES_CONVIDAR.indexOf(party.leader_zone) === -1) {
    return {
      code: 403,
      body: {
        ok: false,
        msg: "O líder está fora da Cidade/Área de Treino — não é possível aceitar o convite agora",
      },
    };
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

/* Pega o `p` (save) de um personagem a partir do data JSON. */
function charPlayerData(c) {
  if (!c || !c.data) return {};
  try {
    const d = typeof c.data === "string" ? JSON.parse(c.data) : c.data;
    return d || {};
  } catch (e) { return {}; }
}

/* Requisitos do boss (cooldown + missão) para TODOS da party (líder +
 * membros). `opts` vem do cliente: { boss, cooldownMs, mission,
 * missionTargets }. Retorna { ok, failName } — failName = quem não pode. */
async function bossRequirementsOk(db, party, opts) {
  if (!opts || !opts.boss) return { ok: true };
  const cooldownMs = Number(opts.cooldownMs) || 0;
  const mission = opts.mission || null;
  const targets = opts.missionTargets || null;
  const now = Date.now();

  const checar = async (charId, nome) => {
    const c = await db.findCharacter(charId);
    const p = charPlayerData(c);
    // cooldown do boss (p.bosses[id].lastFight + cooldown)
    if (cooldownMs > 0) {
      const b = p.bosses && p.bosses[opts.boss];
      const lastFight = (b && b.lastFight) || 0;
      if (lastFight && lastFight + cooldownMs > now) {
        return nome + " está em cooldown do boss";
      }
    }
    // missão (kill counts): p.missions[mission].progress[monster] >= target
    if (mission && targets) {
      const st = p.missions && p.missions[mission];
      for (const mon of Object.keys(targets)) {
        const cur = (st && st.progress && st.progress[mon]) || 0;
        if (cur < targets[mon]) {
          return nome + " não completou a missão do boss (" + mon + " " + cur + "/" + targets[mon] + ")";
        }
      }
    }
    return null;
  };

  const failLider = await checar(party.leader_id, party.leader_name || "Líder");
  if (failLider) return { ok: false, failName: failLider };
  const members = await db.partyMembers(party.id);
  for (const m of members) {
    const c = await db.findCharacter(m.id);
    const fail = await checar(m.id, c ? c.name : "Membro");
    if (fail) return { ok: false, failName: fail };
  }
  return { ok: true };
}

/* POST /api/party/zone — reporta transição de mapa.
 *   body: { token, char_id, zone, hunt?, instance?, otbm?, boss?,
 *           cooldownMs?, mission?, missionTargets? }
 * - QUALQUER personagem da party reporta a SUA zona (gravada no character
 *   para o painel + regra de aceite); só o LÍDER muda a zona da party.
 * - Ao entrar em hunt/boss, gera um follow (nonce por membro) com destino.
 * - BOSS: antes de gerar o follow, valida os REQUISITOS (cooldown + missão)
 *   de TODOS os membros — se alguém não puder, o boss não inicia. */
async function partyReportZone(db, body) {
  const { char, error } = await authChar(db, body.token, body.char_id);
  if (error) return error;
  if (!char) return { code: 400, body: { ok: false, msg: "Selecione um personagem" } };

  const zone = String(body.zone || "").toLowerCase();
  if (["city", "training", "hunt", "boss"].indexOf(zone) === -1) {
    return { code: 400, body: { ok: false, msg: "Zona inválida" } };
  }
  // grava a zona do personagem (qualquer membro reporta a própria)
  await db.setCharacterZone(char.id, zone);

  const party = await partyOf(db, char.id);
  if (!party || Number(party.leader_id) !== Number(char.id)) {
    // não é líder: registra a própria zona e termina (não controla a party)
    return { code: 200, body: { ok: true, ignored: true } };
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

  // BOSS: todos da party precisam ter cooldown disponível + missão completa
  if (zone === "boss") {
    const reqs = await bossRequirementsOk(db, party, body);
    if (!reqs.ok) {
      return {
        code: 403,
        body: {
          ok: false,
          msg: "Nem todos podem enfrentar o boss: " + reqs.failName,
        },
      };
    }
  }

  // monta o follow (por membro):
  //  - líder ENTRA em hunt/boss -> todos os membros vão para a MESMA
  //    instância (nonce por membro, já existente);
  //  - líder SAI da hunt/boss (volta p/ cidade/treino) -> gera um follow de
  //    RETORNO (returnHome) para cada membro: a instância fica ativa só
  //    enquanto o líder estiver nela — ao sair, TODOS voltam para a cidade.
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
  } else if ((party.leader_zone === "hunt" || party.leader_zone === "boss") &&
             (zone === "city" || zone === "training")) {
    // líder saiu da instância -> recall de todos os membros. Usa o campo
    // boss como marcador '__RETURN_HOME__' (o partyStateFor converte para
    // returnHome:true e boss:null antes de devolver ao cliente).
    const members = await db.partyMembers(party.id);
    follows = members.map((m) => ({
      character_id: Number(m.id),
      nonce: newNonce(),
      boss: "__RETURN_HOME__",
    }));
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
