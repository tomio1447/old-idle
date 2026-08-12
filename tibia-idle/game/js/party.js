/* party.js — Sistema de Party (TibiaWiki/Party + Canary)
 *
 * - A party LOCAL (sem servidor) vive num storage compartilhado do navegador
 *   (tibia-idle-party-local-v1) e vale para TODOS os personagens do roster:
 *   o LÍDER é fixo no personagem que criou a party (trocar de personagem
 *   NÃO move a liderança);
 * - CONVITES ficam PENDENTES: o líder convida (só na Cidade / Área de
 *   Treino) e o jogador troca para o personagem convidado para ACEITAR de
 *   lá (também só em cidade/treino);
 * - Ao entrar numa hunt/boss com o LÍDER, TODOS os membros da party vão
 *   para a MESMA instância (party combat) e o jogador controla todos;
 * - Shared Experience com a fórmula oficial:
 *       Exp = M * S / P * C
 *     M = exp base do monstro · S = bônus de vocações · P = nº de membros
 *     C = bônus individual (stamina/prey do líder já entra no exp base)
 *   Bônus por vocações DIFERENTES (wiki): 1 voc = 20%, 2 = 35%, 3 = 70%,
 *   4+ = 100%.
 * - Requisito da wiki: o menor nível ≥ 2/3 do maior.
 * - Party Hunt Analyser: sessão da caçada com stats por membro.
 */
"use strict";

/* ----------------------------------------------------------------------
 * PARTY LOCAL (roster do navegador, sem servidor)
 * ----------------------------------------------------------------------
 * A party vive no localStorage compartilhado: qualquer personagem do save
 * enxerga a MESMA party (líder + membros + convites pendentes). Antes a
 * party morava dentro do save do personagem — trocar de char "movia" o
 * líder e o convidado entrava na hora. */
const PARTY_LOCAL_KEY = "tibia-idle-party-local-v1";

function partyLocalRead() {
  try {
    const raw = localStorage.getItem(PARTY_LOCAL_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw);
    if (!d || !d.leaderId) return null;
    d.members = Array.isArray(d.members) ? d.members : [];
    d.invites = Array.isArray(d.invites) ? d.invites : [];
    return d;
  } catch (e) { return null; }
}

function partyLocalWrite(d) {
  try { localStorage.setItem(PARTY_LOCAL_KEY, JSON.stringify(d)); } catch (e) {}
}

/* Dados da party local (null = sem party). Migra partys antigas que
 * moravam no save do personagem para o storage compartilhado.
 *
 * ATENÇÃO: NÃO pode chamar getCharacters()/normalizePlayer() aqui — o
 * normalizePlayer chama ensureParty() que chama partyLocalData() de novo
 * (recursão infinita). A migração lê o roster CRU do localStorage. */
function partyLocalData() {
  const cur = partyLocalRead();
  if (cur) return cur;
  try {
    const raw = typeof localStorage !== "undefined"
      ? localStorage.getItem(CHARACTERS_KEY) : null;
    const roster = raw ? JSON.parse(raw) : {};
    for (const id of Object.keys(roster)) {
      const c = roster[id] && roster[id].p;
      if (c && c.party && Array.isArray(c.party.members) && c.party.members.length) {
        const d = {
          leaderId: String(id),
          leaderName: c.name,
          members: c.party.members.map((m) => ({
            id: String(m.id), name: m.name, voc: m.voc, level: m.level,
            expGained: m.expGained || 0, kills: m.kills || 0, levelUps: m.levelUps || 0,
          })),
          invites: [],
          shareExp: !!c.party.shareExp,
          session: c.party.session || null,
        };
        partyLocalWrite(d);
        return d;
      }
    }
  } catch (e) { /* sem save antigo */ }
  return null;
}

/* Ids (string) de todos na party local: líder + membros. */
function partyLocalMemberIds(d) {
  const ids = [];
  if (!d) return ids;
  ids.push(String(d.leaderId));
  for (const m of d.members) ids.push(String(m.id));
  return ids;
}

/* O personagem atual participa da party local (líder ou membro)? */
function partyLocalInvolved(p) {
  if (typeof partyOnlineMode === "function" && partyOnlineMode()) return false;
  const d = partyLocalData();
  if (!d || !p) return false;
  return partyLocalMemberIds(d).indexOf(String(p.id || characterId(p))) !== -1;
}

/* O personagem atual é o LÍDER da party local? (fixo em quem criou) */
function partyIsLeaderLocal(p) {
  if (typeof partyOnlineMode === "function" && partyOnlineMode()) return false;
  const d = partyLocalData();
  return !!(d && p && String(p.id || characterId(p)) === String(d.leaderId));
}

/* O personagem atual é MEMBRO (não líder) de uma party local? */
function partyIsMemberLocal(p) {
  if (typeof partyOnlineMode === "function" && partyOnlineMode()) return false;
  const d = partyLocalData();
  if (!d || !p) return false;
  const id = String(p.id || characterId(p));
  return id !== String(d.leaderId) && d.members.some((m) => String(m.id) === id);
}

function ensureParty(p) {
  if (!p) return null;
  p.party = p.party || {};
  const pt = p.party;
  pt.members = Array.isArray(pt.members) ? pt.members : [];
  pt.shareExp = !!pt.shareExp;
  pt.session = pt.session || null;
  // modo local: a party vem do storage compartilhado (líder fixo). Se o
  // personagem atual não participa, o espelho fica vazio.
  if (typeof partyOnlineMode === "function" && !partyOnlineMode()) {
    const d = partyLocalData();
    const id = String(p.id || characterId(p));
    if (d && partyLocalMemberIds(d).indexOf(id) !== -1) {
      pt.members = d.members.map((m) => Object.assign({}, m));
      pt.shareExp = !!d.shareExp;
      pt.session = d.session || null;
      pt.leaderId = String(d.leaderId);
      pt.leaderName = d.leaderName;
    } else {
      pt.members = [];
      pt.shareExp = false;
      pt.session = null;
    }
  }
  return pt;
}

/* Quantas vocações DIFERENTES há no party (líder + membros). */
function partyVocations(p) {
  ensureParty(p);
  const vocs = new Set([p.voc]);
  for (const m of p.party.members) vocs.add(m.voc || "none");
  return vocs;
}

/* Bônus de exp compartilhada (wiki): 1 voc=20%, 2=35%, 3=70%, 4+=100%. */
function partyExpBonusPct(p) {
  const n = partyVocations(p).size;
  if (n >= 4) return 100;
  if (n === 3) return 70;
  if (n === 2) return 35;
  return 20;   // mesma vocação
}

/* Pode compartilhar exp? (nível mínimo ≥ 2/3 do maior — wiki) */
function partyCanShare(p) {
  ensureParty(p);
  if (!p.party.members.length) return { ok: false, msg: "Party sem membros." };
  const niveis = [p.level].concat(p.party.members.map((m) => m.level || 1));
  const menor = Math.min.apply(null, niveis);
  const maior = Math.max.apply(null, niveis);
  if (menor * 3 < maior * 2)
    return { ok: false, msg: `Nível muito baixo: menor ${menor} precisa ser ≥ ${Math.ceil(maior * 2 / 3)} (2/3 do maior ${maior}).` };
  return { ok: true, msg: "Condições ok." };
}

/* Aplica a fórmula de compartilhamento. Retorna { leaderExp, members } ou
 * null quando o share não está ativo. O exp passado já é o M*C do líder
 * (stamina/prey inclusos); cada um recebe M*S/P*C (membros: C=1). */
function partyShareExp(p, exp) {
  ensureParty(p);
  if (!p.party.shareExp || !p.party.members.length) return null;
  const S = 1 + partyExpBonusPct(p) / 100;
  const P = p.party.members.length + 1;
  const parte = Math.max(0, Math.floor((exp || 0) * S / P));
  return { leaderExp: parte, S: S, P: P, bonusPct: partyExpBonusPct(p),
           members: p.party.members.map((m) => ({ id: m.id, exp: parte })) };
}

/* Aplica experiência a um membro do roster (level-up incluso). Em party
 * combat o mesmo exp é aplicado na entidade viva (c.players) — ver
 * partyApplyToMemberLive. */
function partyApplyToMember(memberId, exp) {
  try {
    const roster = readRoster();
    const e = roster[memberId];
    if (!e || !e.p) return 0;
    const p = normalizePlayer(e.p);
    const antes = p.level;
    if (typeof addExp === "function") addExp(p, exp);
    else p.exp = (p.exp || 0) + exp;
    e.p = p;
    writeRoster(roster);
    return Math.max(0, p.level - antes);
  } catch (err) { return 0; }
}

/* Aplica o exp também na ENTIDADE viva do party combat (o save do roster é
 * uma cópia; sem isso o membro em cena não via o level-up na hora). */
function partyApplyToMemberLive(memberId, exp) {
  try {
    if (typeof G === "undefined" || !G || !G.combat || !G.combat.players) return 0;
    const ent = G.combat.players.find((e) => String(e.p && (e.p.id || characterId(e.p))) === String(memberId));
    if (!ent || !ent.p) return 0;
    const antes = ent.p.level;
    if (typeof addExp === "function") addExp(ent.p, exp);
    else ent.p.exp = (ent.p.exp || 0) + exp;
    return Math.max(0, ent.p.level - antes);
  } catch (e) { return 0; }
}

/* Personagens do roster que podem ser CONVIDADOS: não estão na party e não
 * têm convite pendente. */
function partyAvailableMembers(p) {
  if (typeof partyOnlineMode === "function" && partyOnlineMode()) return [];
  const d = partyLocalData();
  const noParty = new Set(partyLocalMemberIds(d));
  const pendentes = new Set();
  for (const i of (d && d.invites) || []) {
    if (i.status === "pending") pendentes.add(String(i.toId));
  }
  const out = [];
  const chars = typeof getCharacters === "function" ? getCharacters() : [];
  for (const c of chars) {
    const id = String(c.id || characterId(c));
    if (noParty.has(id) || pendentes.has(id)) continue;
    out.push({ id: id, name: c.name, voc: c.voc, level: c.level });
  }
  return out;
}

/* Convites PENDENTES de TODOS os personagens da party local — o líder usa
 * para ver quem ainda não aceitou (e cancelar se quiser). */
function partyPendingInvitesAll() {
  const d = partyLocalData();
  if (!d) return [];
  return d.invites.filter((i) => i.status === "pending");
}

/* CANCELAR convite (só o líder; o convidado usa Recusar). */
function partyCancelInvite(p, inviteId) {
  if (typeof partyOnlineMode === "function" && partyOnlineMode() &&
      !(typeof G !== "undefined" && G && G.combat && Array.isArray(G.combat.players) && G.combat.players.length > 1)) {
    return partyDeclineInvite(p, inviteId);
  }
  if (!partyIsLeaderLocal(p)) return { ok: false, msg: "Só o líder pode cancelar convites." };
  const d = partyLocalData();
  if (!d) return { ok: false, msg: "Sem party." };
  const inv = d.invites.find((i) => i.id === Number(inviteId) && i.status === "pending");
  if (!inv) return { ok: false, msg: "Convite não encontrado." };
  inv.status = "cancelled";
  partyLocalWrite(d);
  return { ok: true, msg: "Convite cancelado — o personagem volta a aparecer na lista." };
}

/* Convites PENDENTES para o personagem atual (local). */
function partyPendingInvites(p) {
  if (typeof partyOnlineMode === "function" && partyOnlineMode()) return [];
  const d = partyLocalData();
  if (!d || !p) return [];
  const id = String(p.id || characterId(p));
  return d.invites.filter((i) => i.status === "pending" && String(i.toId) === id);
}

/* CONVIDAR (local): o convite fica PENDENTE — o jogador troca para o
 * personagem convidado e aceita de lá. Só o líder convida e só em
 * Cidade/Área de Treino (regra do dono). */
function partyInviteMember(p, memberId) {
  if (typeof partyOnlineMode === "function" && partyOnlineMode()) {
    return { ok: false, msg: "Use o modo online para convidar por nome." };
  }
  if (!partyIsLeaderLocal(p))
    return { ok: false, msg: "Só o líder da party pode convidar." };
  if (typeof partyCanInviteNow === "function" && !partyCanInviteNow())
    return { ok: false, msg: "Para convidar você precisa estar na Cidade ou na Área de Treino." };
  let d = partyLocalData();
  if (!d) return { ok: false, msg: "Crie a party primeiro (botão Criar party)." };
  if (d.members.length >= 4)
    return { ok: false, msg: "Party cheio (máx. 5 personagens no total)." };
  const chars = typeof getCharacters === "function" ? getCharacters() : [];
  const c = chars.find((x) => String(x.id || characterId(x)) === String(memberId));
  if (!c) return { ok: false, msg: "Personagem não encontrado." };
  if (partyLocalMemberIds(d).indexOf(String(memberId)) !== -1)
    return { ok: false, msg: "Já está no party." };
  if (d.invites.some((i) => i.status === "pending" && String(i.toId) === String(memberId)))
    return { ok: false, msg: "Convite pendente — troque para o personagem e aceite." };
  d.invites.push({
    id: d.invites.reduce((m, i) => Math.max(m, i.id || 0), 0) + 1,
    fromId: String(p.id || characterId(p)), fromName: p.name,
    toId: String(memberId), toName: c.name,
    status: "pending", createdAt: Date.now(),
  });
  partyLocalWrite(d);
  return { ok: true, msg: "Convite enviado! Troque para o personagem e aceite pelo menu Party." };
}

/* ACEITAR (local): o personagem convidado aceita o convite. Só em
 * Cidade/Área de Treino. */
function partyAcceptInvite(p, inviteId) {
  if (typeof partyOnlineMode === "function" && partyOnlineMode()) {
    return accountPartyAccept ? accountPartyAccept(inviteId) : { ok: false };
  }
  let d = partyLocalData();
  if (!d) return { ok: false, msg: "A party não existe mais." };
  const id = String(p.id || characterId(p));
  const inv = d.invites.find((i) => i.id === Number(inviteId) && i.status === "pending");
  if (!inv) return { ok: false, msg: "Convite não encontrado ou já respondido." };
  if (String(inv.toId) !== id)
    return { ok: false, msg: "Este convite não é para este personagem." };
  if (typeof partyCanInviteNow === "function" && !partyCanInviteNow())
    return { ok: false, msg: "Para aceitar um convite você precisa estar na Cidade ou na Área de Treino." };
  if (d.members.length >= 4) {
    inv.status = "declined";
    partyLocalWrite(d);
    return { ok: false, msg: "Party cheia (máx. 5 personagens no total)." };
  }
  d.members.push({
    id: String(inv.toId), name: inv.toName, voc: p.voc, level: p.level,
    expGained: 0, kills: 0, levelUps: 0,
  });
  inv.status = "accepted";
  partyLocalWrite(d);
  return { ok: true, msg: "Você entrou na party de " + d.leaderName + "!" };
}

/* RECUSAR (local). */
function partyDeclineInvite(p, inviteId) {
  if (typeof partyOnlineMode === "function" && partyOnlineMode()) {
    return accountPartyDecline ? accountPartyDecline(inviteId) : { ok: false };
  }
  const d = partyLocalData();
  if (!d) return { ok: false, msg: "Party não existe mais." };
  const inv = d.invites.find((i) => i.id === Number(inviteId) && i.status === "pending");
  if (!inv) return { ok: false, msg: "Convite não encontrado." };
  inv.status = "declined";
  partyLocalWrite(d);
  return { ok: true, msg: "Convite recusado." };
}

/* Limpa o espelho legado p.party no roster para uma party removida não
 * ressuscitar na migração quando PARTY_LOCAL_KEY for apagada. */
function partyClearLegacyMirrors(ids) {
  try {
    const roster = readRoster();
    for (const id of ids || Object.keys(roster)) {
      const entry = roster[id];
      if (entry && entry.p && entry.p.party) { entry.p.party = { members: [], shareExp: false, session: null }; }
    }
    writeRoster(roster);
  } catch (e) {}
}

/* Remover membro (só o líder; local grava no storage compartilhado). */
function partyRemoveMember(p, memberId) {
  if (typeof partyOnlineMode === "function" && partyOnlineMode()) {
    return accountPartyKick ? accountPartyKick(Number(p && p.id), Number(memberId)) : { ok: false };
  }
  if (!partyIsLeaderLocal(p)) return { ok: false, msg: "Só o líder pode remover membros." };
  const d = partyLocalData();
  if (!d) return { ok: false, msg: "Sem party." };
  d.members = d.members.filter((m) => String(m.id) !== String(memberId));
  if (!d.members.length) d.shareExp = false;
  partyClearLegacyMirrors([String(memberId)]);
  partyLocalWrite(d);
  return { ok: true };
}

/* Sair/dissolver: líder dissolve (convites pendentes cancelados); membro
 * sai. Quem não participa não pode sair. */
function partyLeave(p) {
  if (typeof partyOnlineMode === "function" && partyOnlineMode()) {
    return partyOnlineLeave();
  }
  const d = partyLocalData();
  if (!d) return { ok: false, msg: "Sem party." };
  const id = String(p.id || characterId(p));
  if (String(d.leaderId) === id) {
    partyClearLegacyMirrors([String(d.leaderId)].concat(d.members.map((m) => String(m.id))));
    localStorage.removeItem(PARTY_LOCAL_KEY);
    p.party = { members: [], shareExp: false, session: null };
    return { ok: true, msg: "Party dissolvida." };
  }
  if (!d.members.some((m) => String(m.id) === id))
    return { ok: false, msg: "Você não está em uma party." };
  d.members = d.members.filter((m) => String(m.id) !== id);
  partyClearLegacyMirrors([id]);
  p.party = { members: [], shareExp: false, session: null };
  partyLocalWrite(d);
  return { ok: true, msg: "Você saiu da party." };
}

/* ---------- Party Hunt Analyser (sessão da caçada) ---------- */

/* Sessão do Analyser. Funciona nos DOIS modos: local (storage compartilhado
 * da party) e ONLINE (p._partySession — a party vive no servidor, mas o
 * Analyser é uma sessão local de caçada). */
function partyAnalyserSession(p) {
  if (!p) return null;
  if (typeof partyOnlineMode === "function" && partyOnlineMode()) {
    return p._partySession || null;
  }
  const d = partyLocalData();
  return (d && d.session) || null;
}

/* (Re)inicia a sessão ao entrar numa hunt. */
function partyStartSession(p, huntId) {
  if (!p) return;
  const s = {
    huntId: huntId || null,
    startedAt: Date.now(),
    endedAt: null,
    kills: 0,
    exp: 0,
    loot: 0,
    byMember: {},
  };
  if (typeof partyOnlineMode === "function" && partyOnlineMode()) {
    p._partySession = s;
  } else {
    const d = partyLocalData();
    if (!d) return;
    d.session = s;
    partyLocalWrite(d);
  }
}

/* Registra um kill: exp distribuída e loot, por membro. `memberId` null =
 * o líder. */
function partyRecordKill(p, memberId, exp, lootCount, levelUps) {
  if (!p) return;
  let s = partyAnalyserSession(p);
  if (!s) { partyStartSession(p, p.hunt || null); s = partyAnalyserSession(p); }
  if (!s) return;
  s.kills = (s.kills || 0) + 1;
  s.exp = (s.exp || 0) + (exp || 0);
  s.loot = (s.loot || 0) + (lootCount || 0);
  const id = memberId || "leader";
  const b = s.byMember[id] || (s.byMember[id] = { name: null, exp: 0, kills: 0, loot: 0, levelUps: 0 });
  b.exp += exp || 0;
  b.kills += 1;
  b.loot += lootCount || 0;
  b.levelUps += levelUps || 0;
  if (memberId && !(typeof partyOnlineMode === "function" && partyOnlineMode())) {
    const d = partyLocalData();
    if (d) {
      const m = d.members.find((x) => String(x.id) === String(memberId));
      if (m) {
        m.expGained = (m.expGained || 0) + (exp || 0);
        m.kills = (m.kills || 0) + 1;
        m.levelUps = (m.levelUps || 0) + (levelUps || 0);
      }
      partyLocalWrite(d);
    }
  }
}

/* Duração da sessão em ms. */
function partySessionDuration(p) {
  const s = partyAnalyserSession(p);
  if (!s) return 0;
  return (s.endedAt || Date.now()) - s.startedAt;
}

/* ======================================================================
 * PARTY ONLINE (multiplayer) — convites assíncronos + follow
 * ======================================================================
 * Quando o jogo está no modo conta (ACCOUNT_API_URL + token + char),
 * a party deixa de ser só do roster local e passa a ser uma party REAL
 * no servidor:
 *   - o estado é espelhado via GET /api/party/state (polling leve);
 *   - o líder reporta a zona dele a cada transição de mapa
 *     (POST /api/party/zone) — só assim ele pode convidar (cidade/treino)
 *     e os membros recebem o follow;
 *   - convites ficam PENDENTES no servidor (inbox): o jogador pode
 *     trocar de personagem, abrir o menu de Party e aceitar de lá;
 *   - FOLLOW: quando o líder entra numa hunt/boss, o servidor entrega um
 *     nonce de uso único para cada membro; o membro aplica o teleporte
 *     localmente (startHunt/startBoss) e CONFIRMA no servidor.
 * ====================================================================== */

let PARTY_POLL_TIMER = null;
let PARTY_POLL_MS = 3000;         // polling leve (idle game)
let PARTY_SYNCING = false;        // evita reentrância no poll
let PARTY_POLL_N = 0;             // contador p/ buscar inbox a cada N polls

/* O modo online de party exige: API configurada + sessão com token e char. */
function partyOnlineMode() {
  try {
    return typeof accountApiConfigured === "function" && accountApiConfigured() &&
           !!sessionToken() && !!sessionCharId();
  } catch (e) { return false; }
}

/* Zona atual do personagem, derivada do estado do jogo (G). */
function partyCurrentZone() {
  if (typeof G === "undefined" || !G || !G.p) return { zone: "unknown" };
  if (G.training) return { zone: "training", training: G.training.mode || "academy" };
  if (G.combat && G.combat.boss) return { zone: "boss", boss: G.combat.boss.id };
  if (G.p.hunt) return { zone: "hunt", hunt: G.p.hunt, instance: G.p.instanceMode || "non-pvp" };
  if (G.inCity) return { zone: "city" };
  return { zone: "unknown" };
}

/* Regra de convite: o LÍDER precisa estar em Safe Zone (cidade) ou
 * Área de Treino. Usada para habilitar/desabilitar o botão na UI. */
function partyCanInviteNow() {
  const z = partyCurrentZone();
  return z.zone === "city" || z.zone === "training";
}

/* Estado online da party (servidor) espelhado no personagem. */
function partyOnlineState() {
  return (typeof G !== "undefined" && G && G.p) ? (G.p._partyOnline || null) : null;
}

/* O personagem atual é o LÍDER da party online? */
function partyIsLeader() {
  const st = partyOnlineState();
  return !!(st && st.isLeader);
}

/* O personagem atual é MEMBRO (não líder) de uma party online? */
function partyIsMember() {
  const st = partyOnlineState();
  return !!(st && st.isMember && !st.isLeader);
}

/* Jogadores em party NÃO podem entrar em hunt/boss — só cidade ou área de
 * treino (regra do dono). Líder pode (ele leva a party junto). Vale nos
 * dois modos: online (membros via servidor) e local (membros do roster). */
function partyBlocksHunt() {
  const p = (typeof G !== "undefined" && G) ? G.p : null;
  if (partyOnlineMode()) return partyIsMember();
  return partyIsMemberLocal(p);
}

/* O personagem atual é o LÍDER da party (local ou online)? */
function partyIsLeaderAny(p) {
  if (partyOnlineMode()) return partyIsLeader();
  return partyIsLeaderLocal(p);
}

/* Reporta a zona atual para o servidor (chamado a cada transição de mapa
 * nos hooks do game.js e no início do jogo). Só o líder altera o estado da
 * party; membros só registram a própria zona (servidor). */
async function partyReportZone(zoneInfo) {
  if (!partyOnlineMode()) return;
  try {
    await accountPartyReportZone(Number(sessionCharId()), zoneInfo);
  } catch (e) { /* offline/erro de rede: segue o jogo */ }
}

/* Poll do estado da party: espelha no save (para a UI) e aplica o
 * FOLLOW pendente quando o líder mudou de mapa. */
async function partySync() {
  if (!partyOnlineMode() || PARTY_SYNCING) return;
  PARTY_SYNCING = true;
  try {
    const r = await accountPartyState(Number(sessionCharId()));
    if (!r.ok) return;
    const st = r.state;
    // espelha no personagem para a UI/badge
    if (G && G.p) {
      G.p._partyOnline = st;
      if (!st) G.p._partyInvites = G.p._partyInvites || 0;
      if (typeof renderPartyButton === "function") renderPartyButton(G.p);
      if (typeof renderPartyPanel === "function") renderPartyPanel(G.p);
    }
    // inbox (badge ✉) a cada 3 polls (~18s) — mantém leve
    PARTY_POLL_N += 1;
    if (PARTY_POLL_N % 3 === 0) {
      const inbox = await partyFetchInbox();
      if (inbox.ok && G && G.p) {
        G.p._partyInvites = (inbox.invites || []).length;
        if (typeof renderPartyButton === "function") renderPartyButton(G.p);
        if (typeof renderPartyPanel === "function") renderPartyPanel(G.p);
      }
    }
    // FOLLOW: líder entrou em hunt/boss -> teleporta o membro junto
    if (st && st.follow && st.follow.nonce && !st.isLeader) {
      await partyApplyFollow(st.follow);
    }
  } catch (e) { /* rede */ } finally {
    PARTY_SYNCING = false;
  }
}

/* Nonces de follow já aplicados (anti-duplicação): mesmo que o poll traga o
 * mesmo follow 2x (ou a confirmação falhe na rede e o poll repita), o
 * teleporte só acontece UMA vez por nonce. Limpo após 30s (o servidor
 * também consome o nonce, então a janela dupla é inofensiva). */
const PARTY_FOLLOW_USED = {};
const PARTY_FOLLOW_USED_TTL = 30000;

/* Aplica o follow: teleporta o membro para a MESMA instância/local do
 * líder e confirma no servidor (consome o nonce de uso único). */
async function partyApplyFollow(f) {
  if (!f || !f.nonce) return;
  const now = Date.now();
  for (const k in PARTY_FOLLOW_USED) {
    if (now - PARTY_FOLLOW_USED[k] > PARTY_FOLLOW_USED_TTL) delete PARTY_FOLLOW_USED[k];
  }
  if (PARTY_FOLLOW_USED[f.nonce]) return;   // já aplicado (replay de poll)
  PARTY_FOLLOW_USED[f.nonce] = now;
  try {
    if (f.returnHome) {
      // líder saiu da hunt/boss -> membro volta para a cidade (instância
      // fica ativa só enquanto o líder estiver nela)
      if (typeof addLog === "function") {
        addLog("party", `O líder saiu do local de caça — voltando para a Cidade...`);
      }
      if (typeof stopHunt === "function") {
        if (G && (G.combat || G.training)) stopHunt();
        else if (G) { G.inCity = true; }
      }
      if (typeof toast === "function") toast("A party saiu da caçada — de volta à cidade.");
      await accountPartyFollow(Number(sessionCharId()), f.nonce);
      if (typeof renderAll === "function") renderAll();
      return;
    }
    if (typeof addLog === "function") {
      addLog("party", `O líder entrou em um novo local — seguindo para a MESMA instância...`);
    }
    if (f.boss) {
      // sala de boss: o membro é teleportado para o mesmo boss (force=true)
      if (typeof startBoss === "function") startBoss(f.boss, true);
      else if (typeof toast === "function") toast("Líder entrou no boss (instância indisponível aqui)");
    } else if (f.hunt) {
      // local de caça: mesma hunt + MESMA instância (non-pvp/pvp).
      // `force=true`: o membro é teleportado pelo follow — ignora a regra
      // que bloqueia membro de entrar em hunt por conta própria.
      if (typeof startHunt === "function") {
        startHunt(f.hunt, f.instance || "non-pvp", true);
        if (typeof toast === "function") toast(`Seguindo o líder para <b>${f.hunt}</b>...`, "level");
      }
    }
    // confirma o teleporte no servidor (consome o nonce)
    await accountPartyFollow(Number(sessionCharId()), f.nonce);
  } catch (e) { /* rede */ }
}

/* ======================================================================
 * HEAL FRIEND (Druid/Monk) — curar os aliados da party
 * ======================================================================
 * Igual ao baiak-idle: o helper tem uma aba HEAL FRIEND que puxa os
 * membros da party (com HP deles) e o Druid/Monk cura:
 *   - exura sio        (Heal Friend, druid): cura 1 aliado;
 *   - exura gran sio   (Nature's Embrace, druid, cd 60s): cura forte 1;
 *   - exura gran mas res (Mass Healing, druid): cura TODOS os aliados
 *     adjacentes quando 2+ membros estão com HP abaixo do % configurado;
 *   - exura tio sio    (Restore Balance, monk): cura 1 aliado à distância.
 * A cura aplica de verdade no membro: modo local atualiza o save do
 * roster; modo online atualiza o estado espelhado (o save do membro, que
 * roda no próprio cliente, sincroniza o HP real no servidor).
 * ====================================================================== */

/* Lista os aliados (membros da party) com HP — fonte: state online
 * (hp/maxHp do servidor), ENTIDADES VIVAS do party combat (mesma instância)
 * ou roster local (p.party.members). */
function partyHealTargets(p) {
  if (!p) return [];
  const out = [];
  if (typeof partyOnlineMode === "function" && partyOnlineMode()) {
    const st = p._partyOnline || null;
    if (st) {
      for (const m of [st.leader].concat(st.members || [])) {
        if (Number(m.id) === Number(characterId(p))) continue;   // não cura a si
        out.push({ id: m.id, name: m.name, voc: m.voc, level: m.level || 1,
                   sex: m.sex, outfit: m.outfit, hp: m.hp || 0, maxHp: m.maxHp || 0 });
      }
    }
    return out;
  }
  // party combat ativo: o HP VIVO vem das entidades em cena (o roster é
  // cópia e não acompanha o combate em tempo real)
  if (typeof G !== "undefined" && G && G.combat &&
      Array.isArray(G.combat.players) && G.combat.players.length > 1) {
    const me = String(p.id || characterId(p));
    for (const ent of G.combat.players) {
      const pp = ent.p;
      if (!pp || String(pp.id || characterId(pp)) === me) continue;
      const mx = typeof maxStats === "function" ? maxStats(pp) : { hp: 1 };
      out.push({ id: pp.id || characterId(pp), name: pp.name, voc: pp.voc,
                 level: pp.level || 1, sex: pp.sex, outfit: pp.outfit, colors: pp.outfit && pp.outfit.colors,
                 hp: Math.max(0, pp.hp || 0), maxHp: mx.hp || 1 });
    }
    return out;
  }
  const d = partyLocalData();
  const chars = typeof getCharacters === "function" ? getCharacters() : [];
  const me = String(p.id || characterId(p));
  for (const id of partyLocalMemberIds(d)) {
    if (id === me) continue;
    const c = chars.find((x) => String(x.id || characterId(x)) === id);
    if (!c) continue;
    const mx = typeof maxStats === "function" ? maxStats(c) : { hp: 1 };
    out.push({ id: c.id || characterId(c), name: c.name, voc: c.voc,
               level: c.level || 1, sex: c.sex, outfit: c.outfit,
               hp: c.hp || 0, maxHp: mx.hp || 1 });
  }
  return out;
}

/* Localiza a entidade viva por id e, como fallback seguro de saves antigos,
 * por nome. Isso evita que o Heal Friend cure uma cópia do roster. */
function partyLiveEntity(c, member) {
  if (!c || !c.players || !member) return null;
  const id = String(member.id || "");
  return c.players.find((e) => String(e.p && (e.p.id || characterId(e.p))) === id) ||
    c.players.find((e) => e.p && String(e.p.name) === String(member.name));
}

/* Aplica a cura no membro (entidade viva do party combat, save local ou
 * estado online espelhado). */
function partyApplyFriendHeal(c, p, member, amount) {
  if (!member) return;
  if (typeof partyOnlineMode === "function" && partyOnlineMode() &&
      !(c && Array.isArray(c.players) && c.players.length > 1)) {
    const st = p._partyOnline || null;
    if (!st) return;
    // espelha no estado local (o painel reflete na hora; o save do membro
    // sincroniza o HP real no servidor quando ele salvar)
    const alvo = (Number(st.leader.id) === Number(member.id)) ? st.leader
      : st.members.find((m) => Number(m.id) === Number(member.id));
    if (alvo && alvo.maxHp) alvo.hp = Math.min(alvo.maxHp, (alvo.hp || 0) + amount);
    return;
  }
  // party combat: cura a entidade VIVA (a barra do painel muda na hora)
  if (c && Array.isArray(c.players) && c.players.length > 1) {
    const ent = partyLiveEntity(c, member);
    if (ent && ent.p) {
      const mx = typeof maxStats === "function" ? maxStats(ent.p) : { hp: 1 };
      ent.p.hp = Math.min(mx.hp || ent.p.hp, (ent.p.hp || 0) + amount);
      if (typeof saveCharacterToRoster === "function") saveCharacterToRoster(ent.p);
    }
    return;
  }
  // modo local fora de combate: atualiza o save do membro no roster
  const chars = typeof getCharacters === "function" ? getCharacters() : [];
  const char = chars.find((x) => (x.id || characterId(x)) === member.id);
  if (!char) return;
  const mx = typeof maxStats === "function" ? maxStats(char) : { hp: 1 };
  char.hp = Math.min(mx.hp || char.hp, (char.hp || 0) + amount);
  if (typeof saveCharacterToRoster === "function") saveCharacterToRoster(char);
}

/* O tick de HEAL FRIEND: roda junto do tryHeal no combate. */
/* Heal Friend independente do painel: roda para qualquer Druid/Monk vivo,
 * selecionado ou não. A configuração é persistida em p.config.healFriend. */
function healFriendConfig(p) {
  const cfg = p.config || (p.config = {});
  const old = cfg.healFriend || {};
  const voc = String(p.voc || '').toLowerCase();
  const druid = /druid/.test(voc), monk = /monk/.test(voc);
  const ids = druid ? ['exura-sio','exura-gran-sio','exura-gran-mas-res'] :
    monk ? ['exura-tio-sio'] : [];
  old.priority = old.priority === 'self' ? 'self' : 'friend';
  // UI legado ainda edita estes dois mapas; eles são a fonte de verdade para não perder cliques.
  old.targets = cfg.healFriendTargets || old.targets || {};
  old.spells = cfg.healFriendSpells || old.spells || {};
  for (const id of ids) if (!old.spells[id]) old.spells[id] = {
    enabled: id === 'exura-sio' || id === 'exura-tio-sio',
    hpBelow: cfg.healFriendAt === undefined ? 70 : cfg.healFriendAt,
    minTargets: 2,
  };
  for (const id of ids) { const r=old.spells[id]; if(r && r.hpBelow===undefined) r.hpBelow=r.at===undefined?70:r.at; }
  cfg.healFriend = old;
  return { cfg: old, ids: ids };
}
function tryHealFriend(c, p, now) {
  if (!c || !p || p.hp <= 0) return false;
  const setup = healFriendConfig(p), cfg = setup.cfg;
  if (!setup.ids.length) return false;
  const targets = partyHealTargets(p).filter((t) => {
    const r = cfg.targets[String(t.id)]; return t.maxHp > 0 && (!r || r.enabled !== false);
  });
  if (!targets.length || entCd(c, p, 'healCd') > now) return false;
  const sort = (a,b) => {
    const pa=(cfg.targets[String(a.id)]||{}).priority||99, pb=(cfg.targets[String(b.id)]||{}).priority||99;
    return pa-pb || (a.hp/a.maxHp)-(b.hp/b.maxHp);
  };
  // Mass first only when configured count is met; Gran Sio then Sio for low HP.
  const order = ['exura-gran-mas-res','exura-gran-sio','exura-sio','exura-tio-sio'];
  for (const id of order) {
    if (!setup.ids.includes(id)) continue;
    const rule=cfg.spells[id], spell=SPELLS[id];
    if (!rule || !rule.enabled || !spell || p.level < spell.lvl || p.mp < spell.mana || !cdReady(p,id,now)) continue;
    const hurt=targets.filter((t)=>t.hp/t.maxHp*100 < rule.hpBelow).sort(sort);
    const mass=id==='exura-gran-mas-res';
    if (!hurt.length || (mass && hurt.length < (rule.minTargets||2))) continue;
    const healed=mass?hurt:[hurt[0]];
    let amount=Math.max(1,rollSpell(p,spell)), crit=false;
    const ch=typeof tryCriticalHeal==='function'?tryCriticalHeal(p):{crit:false,extraPct:0};
    if(ch.crit && ch.extraPct){amount=Math.floor(amount*(1+ch.extraPct/100));crit=true;}
    p.mp-=spell.mana; cdStart(p,id,spell,now); entCdSet(c,p,'healCd',now+1000);
    for(const target of healed){
      partyApplyFriendHeal(c,p,target,amount);
      const ent=partyLiveEntity(c, target);
      const words=mass?spell.words:`${spell.words} "${String(target.name).replace(/"/g,'')}"`;
      c.events.push({t:'heal-friend',amount,target:target.name,targetId:target.id,words,spell:spell.name,mass,crit,
        x:ent?ent.x:c.player.x,y:ent?ent.y:c.player.y,screen:true,fx:mass?'magic-green':'green-rings'});
    }
    c.events.push({t:'say',text:mass?spell.words:`${spell.words} "${String(healed[0].name).replace(/"/g,'')}"`});
    if(typeof saveCharacterToRoster==='function') saveCharacterToRoster(p);
    return true;
  }
  return false;
}

/* A party está numa hunt/boss (líder está caçando)? No ONLINE o estado
 * vem do servidor; no PARTY COMBAT local basta o líder estar numa instância
 * com os membros em cena (c.players). */
function partyInInstance() {
  if (partyOnlineMode()) {
    const st = partyOnlineState();
    return !!(st && st.leader && (st.leader.zone === "hunt" || st.leader.zone === "boss"));
  }
  return !!(typeof G !== "undefined" && G && G.combat &&
            Array.isArray(G.combat.players) && G.combat.players.length > 1 &&
            (G.combat.huntId || G.combat.boss));
}

/* Botão LEAVE HUNT: o LÍDER sai da instância (todos voltam via follow de
 * retorno no online; no party combat local todos os saves são gravados);
 * um MEMBRO sai sozinho (volta para a cidade). */
async function partyLeaveHunt() {
  if (typeof stopHunt === "function" && G && (G.combat || G.training)) {
    stopHunt();
  } else if (G) {
    G.inCity = true;
    if (typeof renderAll === "function") renderAll();
  }
  if (partyOnlineMode()) {
    // reporta a zona city (líder: gera recall dos membros; membro: sai)
    try {
      await accountPartyReportZone(Number(sessionCharId()), { zone: "city" });
    } catch (e) { /* rede */ }
  }
  if (typeof toast === "function") toast("Você saiu da caçada.");
  if (typeof partySync === "function") partySync();
}

/* Inicia o polling da party (chamado no startGame quando online). */
function partyStartPolling() {
  partyStopPolling();
  if (!partyOnlineMode()) return;
  PARTY_POLL_TIMER = setInterval(() => { partySync(); }, PARTY_POLL_MS);
  // primeira sincronização imediata (sem esperar o primeiro intervalo)
  partySync();
}

function partyStopPolling() {
  if (PARTY_POLL_TIMER) { clearInterval(PARTY_POLL_TIMER); PARTY_POLL_TIMER = null; }
}

/* Busca a inbox (convites pendentes de todos os chars da conta). */
async function partyFetchInbox() {
  if (!partyOnlineMode()) return { ok: true, invites: [] };
  try {
    return await accountPartyInbox();
  } catch (e) { return { ok: true, invites: [] }; }
}

/* Cria a party online (char atual vira líder). */
async function partyOnlineCreate() {
  if (!partyOnlineMode()) return { ok: false, msg: "Modo online não configurado." };
  return await accountPartyCreate(Number(sessionCharId()));
}

/* Convidar por nome (online). O SERVIDOR valida a zona do líder. */
async function partyOnlineInvite(name) {
  if (!partyOnlineMode()) return { ok: false, msg: "Modo online não configurado." };
  return await accountPartyInvite(Number(sessionCharId()), name);
}

/* Sair da party online. */
async function partyOnlineLeave() {
  if (!partyOnlineMode()) return { ok: false, msg: "Modo online não configurado." };
  return await accountPartyLeave(Number(sessionCharId()));
}

/* ======================================================================
 * PARTY COMBAT — todos os personagens da party na MESMA instância
 * ======================================================================
 * Quando o LÍDER entra numa hunt/boss (modo local), todos os membros da
 * party são carregados do roster para a mesma arena (c.players). O jogador
 * controla TODOS: clica no membro no painel OTC para alternar quem está
 * ativo (quem usa as magias/potions da UI). Os aliados lutam sozinhos:
 * atacam o alvo atual com a arma deles e o Druid/Monk cura a party (HEAL
 * FRIEND) com a configuração de cada um.
 * ====================================================================== */

/* Quantos membros o party combat vai carregar (0 = sem party). */
function partyCombatCount() {
  if (typeof partyOnlineMode === "function" && partyOnlineMode()) return 0;
  const d = partyLocalData();
  if (!d) return 0;
  return d.members.length;
}

function partyRestoreCharacterFull(p) {
  if (!p) return false;
  const mx = typeof maxStats === "function" ? maxStats(p) :
    { hp:Math.max(1,p.maxHp||p.hp||1), mp:Math.max(0,p.maxMp||p.mp||0) };
  p.hp = mx.hp; p.mp = mx.mp;
  return true;
}

/* Templo, treino e entrada de arena são checkpoints seguros: nenhum membro
 * local pode permanecer inconsciente no roster nem reaparecer morto na nova
 * instância. Restaura tanto entidades ao vivo quanto as cópias do roster. */
function partyCombatRestoreAll(reason) {
  const restored = new Set();
  try {
    if (typeof G !== "undefined" && G && G.combat && G.combat.players) {
      for (const ent of G.combat.players) {
        if (!ent || !ent.p) continue;
        partyRestoreCharacterFull(ent.p);
        ent.permadead = false; ent.reviveAt = 0; ent.deathPos = null;
        ent.downedAt = 0; ent.moving = false;
        restored.add(String(ent.id || ent.p.id || ""));
        if (typeof saveCharacterToRoster === "function") saveCharacterToRoster(ent.p);
      }
      G.combat.dead = false; G.combat.deadUntil = 0; G.combat.deathPos = null;
    }
    if (typeof G !== "undefined" && G && G.p) partyRestoreCharacterFull(G.p);
    if (typeof partyOnlineMode === "function" && partyOnlineMode()) return restored.size;
    const data = partyLocalData();
    const chars = typeof getCharacters === "function" ? getCharacters() : [];
    const ids = new Set();
    if (typeof G !== "undefined" && G && G.p)
      ids.add(String(G.p.id || (typeof characterId === "function" ? characterId(G.p) : "")));
    if (typeof partyLocalMemberIds === "function")
      for (const id of partyLocalMemberIds(data)) ids.add(String(id));
    else
      for (const member of (data && data.members) || []) ids.add(String(member.id));
    for (const char of chars) {
      const id = String(char.id || (typeof characterId === "function" ? characterId(char) : ""));
      if (!ids.has(id)) continue;
      partyRestoreCharacterFull(char); restored.add(id);
      if (typeof saveCharacterToRoster === "function") saveCharacterToRoster(char);
    }
  } catch (error) {
    console.warn("[party] falha ao restaurar party no checkpoint " + (reason || ""), error);
  }
  return restored.size;
}

/* Carrega as entidades do party combat. `player` = personagem ativo (o
 * líder). Devolve o array completo (líder + membros) ou null sem party. */
function partyCombatLoad(player) {
  const online=typeof partyOnlineMode==="function"&&partyOnlineMode();
  let order=[],chars=[];
  if(online){
    const st=player&&player._partyOnline;if(!st||!st.leader)return null;
    order=[st.leader].concat(st.members||[]);
    const cached=typeof accountCharacterCacheRead==="function"?accountCharacterCacheRead():[];
    chars=cached.map(summary=>{
      let raw=summary.snapshot||{};if(typeof raw==="string"){try{raw=JSON.parse(raw);}catch(e){raw={};}}
      raw=Object.assign({},raw,{id:String(summary.id),name:summary.name,voc:summary.voc,
        level:Number(summary.level)||raw.level||1,sex:summary.sex||raw.sex||"male",
        outfit:summary.outfit||raw.outfit});return raw;
    });
    const me=String(player.id||"");
    const i=chars.findIndex(c=>String(c.id)===me);
    if(i>=0)chars[i]=player;else chars.push(player);
  }else{
    const d=partyLocalData();if(!d)return null;
    chars=typeof getCharacters==="function"?getCharacters():[];
    order=[{id:d.leaderId}].concat(d.members||[]);
  }
  const me = String(player.id || characterId(player));
  const entidades = [];
  const seen = new Set();
  const mkEnt = (c, isLeader) => {
    if (!c || seen.has(String(c.id || characterId(c)))) return;
    seen.add(String(c.id || characterId(c)));
    const pp = normalizePlayer(c);
    pp.id = c.id || characterId(c);
    const mx = typeof maxStats === "function" ? maxStats(pp) : { hp: 1, mp: 1 };
    // Última barreira: mesmo que algum fluxo esqueça o checkpoint, a entidade
    // nunca é criada morta dentro de uma arena.
    pp.hp = mx.hp; pp.mp = mx.mp;
    entidades.push({
      p: pp, id: pp.id, name: pp.name, voc: pp.voc, sex: pp.sex,
      cx: 0, cy: 0, x: 0, y: 0, dir: "e", moving: false, frame: 0,
      walkT: 0, attackAnim: 0, atkCd: 500 + Math.random() * 900,
      speedPts: 110 + Math.min(200, (pp.level || 1)),
      maxHp: mx.hp, maxMp: mx.mp,
      reviveAt: 0, deathPos: null, isLeader: !!isLeader,
      taken: 0,
    });
  };
  // líder primeiro, depois os membros na ordem fornecida pelo servidor/storage.
  for(let i=0;i<order.length;i++){
    const ref=order[i];
    const c=chars.find(x=>String(x.id||characterId(x))===String(ref.id));
    if(c)mkEnt(c,i===0);
  }
  // O personagem ativo sempre precisa existir, inclusive durante transições
  // em que o poll da party ainda está uma versão atrás.
  if(!seen.has(me))mkEnt(player,!!(order[0]&&String(order[0].id)===me));
  return entidades.length > 1 ? entidades : null;
}

/* Posiciona as entidades do party combat ao redor do líder (spawn da hunt).
 * Respeita paredes/água do mapa (huntMapBlocked) — aliado não nasce dentro
 * de parede em corredor estreito. */
function partyCombatPlace(c, spawnCx, spawnCy) {
  if (!c || !c.players) return;
  const offs = [0, -1, 1, -2, 2, -3, 3, -4, 4];
  const free = (cx, cy) => {
    if (typeof huntMapBlocked === "function" && c.huntMap && huntMapBlocked(c.huntMap, cx, cy)) return false;
    if (typeof inBounds === "function" && !inBounds(cx, cy)) return false;
    return true;
  };
  // Prioridade: fileira X atravessando o centro. Testa linhas próximas caso
  // a linha central esteja atravessada por uma parede/estante do mapa RME.
  const rows = [spawnCy, spawnCy - 1, spawnCy + 1, spawnCy - 2, spawnCy + 2, spawnCy - 3, spawnCy + 3];
  let line = null;
  for (const y of rows) {
    const pos = c.players.map((_, i) => ({ x: spawnCx + offs[i], y }));
    if (pos.every((p, i) => free(p.x, p.y) && !pos.slice(0, i).some(q => q.x === p.x && q.y === p.y))) { line = pos; break; }
  }
  if (!line) {
    // Última defesa: mantém cada personagem em célula livre, sem nascer em parede.
    line = c.players.map((_, i) => ({ x: spawnCx + (offs[i] || 0), y: spawnCy }));
    for (const p of line) {
      if (free(p.x, p.y)) continue;
      let found = null;
      for (let r = 1; r <= 5 && !found; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        const x = spawnCx + dx, y = spawnCy + dy;
        if (!found && Math.max(Math.abs(dx), Math.abs(dy)) === r && free(x, y)) found = { x, y };
      }
      if (found) Object.assign(p, found);
    }
  }
  c.players.forEach((ent, i) => {
    ent.cx = line[i].x; ent.cy = line[i].y;
    const sc = typeof cellToScreen === "function" ? cellToScreen(ent.cx, ent.cy) : { x: 0.5, y: 0.5 };
    ent.x = sc.x; ent.y = sc.y; ent.sx = sc.x; ent.sy = sc.y;
  });
}

/* Entidade viva mais próxima de um monstro (alvo do ataque). */
function partyNearestTarget(c, mob) {
  if (!c.players || c.players.length < 2) return c.player || null;
  let best = null, bestD = Infinity;
  for (const ent of c.players) {
    if (!ent.p || ent.p.hp <= 0) continue;
    let d;
    if (typeof sqmDistance === "function" &&
        ent.cx !== undefined && mob.cx !== undefined) {
      d = sqmDistance(ent, mob);
    } else {
      // sem celula (boss antigo): distância de tela como fallback
      d = Math.max(Math.abs((ent.x || 0) - (mob.x || 0)),
                   Math.abs((ent.y || 0) - (mob.y || 0)));
    }
    if (d < bestD) { bestD = d; best = ent; }
  }
  return best || c.player || null;
}

/* Troca o personagem ATIVO durante o party combat (sem recarregar). */
function partyCombatSwitchTo(id) {
  try {
    if (typeof G === "undefined" || !G || !G.combat || !G.combat.players) return false;
    const c = G.combat;
    const ent = c.players.find((e) => String(e.id) === String(id));
    if (!ent || !ent.p) return false;
    if (ent.p.hp <= 0) {
      if (typeof toast === "function") toast(ent.name + " está inconsciente — espere ele renascer.", "bad");
      return false;
    }
    // Persiste TODOS antes da troca: HP/MP/posição da instância não ficam
    // presos ao personagem anterior quando o jogador alterna o controle.
    if (typeof partyCombatSaveAll === "function") partyCombatSaveAll();
    else if (typeof saveCharacterToRoster === "function" && G.p) saveCharacterToRoster(G.p);
    c.player = ent;
    G.p = ent.p;
    // A escolha ativa também precisa acompanhar a entidade ativa; sem isto,
    // um reload posterior voltava para o personagem antigo/cidade.
    try {
      localStorage.setItem(ACTIVE_CHARACTER_KEY, String(ent.id));
      sessionStorage.setItem(AUTOLOGIN_KEY, String(ent.id));
    } catch (e) { /* storage indisponível: instância continua válida */ }
    if (typeof saveCharacterToRoster === "function") saveCharacterToRoster(ent.p);
    if (typeof renderAll === "function") renderAll();
    if (typeof toast === "function") toast("Controlando: " + ent.name);
    return true;
  } catch (e) { return false; }
}

/* Salva TODOS os personagens do party combat no roster (hp/mana/exp). */
function partyCombatSaveAll() {
  try {
    if (typeof G === "undefined" || !G || !G.combat || !G.combat.players) return;
    const online=typeof partyOnlineMode==="function"&&partyOnlineMode();
    const token=online&&typeof sessionToken==="function"?sessionToken():"";
    const cache=online&&typeof accountCharacterCacheRead==="function"?accountCharacterCacheRead():[];
    for (const ent of G.combat.players) {
      if(!ent.p)continue;
      if(typeof saveCharacterToRoster==="function")saveCharacterToRoster(ent.p);
      if(token&&typeof accountSaveCharacter==="function")accountSaveCharacter(token,String(ent.id),ent.p).catch(()=>{});
      const summary=cache.find(c=>String(c.id)===String(ent.id));
      if(summary){summary.voc=ent.p.voc;summary.level=ent.p.level;summary.sex=ent.p.sex;
        summary.outfit=ent.p.outfit;summary.snapshot=ent.p;}
    }
    if(online&&typeof accountCharacterCacheWrite==="function")accountCharacterCacheWrite(cache);
  } catch (e) { /* não bloqueia */ }
}

/* Alcance de ataque de um aliado (mesma regra do jogador). */
function partyAllyRangeSQM(ent) {
  try {
    if (typeof playerRangeSQM === "function") return playerRangeSQM(ent.p);
  } catch (e) { /* fallback */ }
  const d = (typeof playerDamage === "function") ? playerDamage(ent.p) : { type: "melee" };
  return d.type === "distance" ? 6 : d.type === "magic" ? 6 : 1;
}
