/* party.js — Sistema de Party (TibiaWiki/Party + Canary)
 *
 * - Criação de party com personagens do próprio roster (os outros chars
 *   salvos viram membros e ganham XP de verdade no save);
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

function ensureParty(p) {
  if (!p) return null;
  p.party = p.party || {};
  const pt = p.party;
  pt.members = Array.isArray(pt.members) ? pt.members : [];
  pt.shareExp = !!pt.shareExp;
  pt.session = pt.session || null;
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

/* Aplica experiência a um membro do roster (level-up incluso). */
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

/* Personagens do roster que podem entrar no party (não é o líder, não está
 * no party, não está em outro party... como é single, só checa os dois). */
function partyAvailableMembers(p) {
  ensureParty(p);
  const noParty = new Set(p.party.members.map((m) => m.id));
  const out = [];
  const chars = typeof getCharacters === "function" ? getCharacters() : [];
  for (const c of chars) {
    const id = c.id || characterId(c);
    if (id === (p.id || characterId(p))) continue;
    if (noParty.has(id)) continue;
    out.push({ id: id, name: c.name, voc: c.voc, level: c.level });
  }
  return out;
}

/* Convidar um personagem do roster. */
function partyAddMember(p, memberId) {
  ensureParty(p);
  if (p.party.members.length >= 4)
    return { ok: false, msg: "Party cheio (máx. 5 no total)." };
  const chars = typeof getCharacters === "function" ? getCharacters() : [];
  const c = chars.find((x) => (x.id || characterId(x)) === memberId);
  if (!c) return { ok: false, msg: "Personagem não encontrado." };
  if (p.party.members.some((m) => m.id === memberId))
    return { ok: false, msg: "Já está no party." };
  p.party.members.push({
    id: memberId, name: c.name, voc: c.voc, level: c.level,
    expGained: 0, kills: 0, levelUps: 0,
  });
  return { ok: true };
}

function partyRemoveMember(p, memberId) {
  ensureParty(p);
  p.party.members = p.party.members.filter((m) => m.id !== memberId);
  if (!p.party.members.length) p.party.shareExp = false;
  return { ok: true };
}

function partyLeave(p) {
  ensureParty(p);
  p.party = { members: [], shareExp: false, session: null };
  return { ok: true };
}

/* ---------- Party Hunt Analyser (sessão da caçada) ---------- */

/* (Re)inicia a sessão ao entrar numa hunt. */
function partyStartSession(p, huntId) {
  ensureParty(p);
  p.party.session = {
    huntId: huntId || null,
    startedAt: Date.now(),
    endedAt: null,
    kills: 0,
    exp: 0,
    loot: 0,
    byMember: {},
  };
}

/* Registra um kill: exp distribuída e loot, por membro. `memberId` null =
 * o líder. */
function partyRecordKill(p, memberId, exp, lootCount, levelUps) {
  ensureParty(p);
  if (!p.party.session) partyStartSession(p, p.hunt || null);
  const s = p.party.session;
  s.kills = (s.kills || 0) + 1;
  s.exp = (s.exp || 0) + (exp || 0);
  s.loot = (s.loot || 0) + (lootCount || 0);
  const id = memberId || "leader";
  const b = s.byMember[id] || (s.byMember[id] = { name: null, exp: 0, kills: 0, loot: 0, levelUps: 0 });
  b.exp += exp || 0;
  b.kills += 1;
  b.loot += lootCount || 0;
  b.levelUps += levelUps || 0;
  if (memberId) {
    const m = p.party.members.find((x) => x.id === memberId);
    if (m) {
      m.expGained = (m.expGained || 0) + (exp || 0);
      m.kills = (m.kills || 0) + 1;
      m.levelUps = (m.levelUps || 0) + (levelUps || 0);
    }
  }
}

/* Duração da sessão em ms. */
function partySessionDuration(p) {
  const s = p.party.session;
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
let PARTY_POLL_MS = 6000;         // polling leve (idle game)
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

/* Reporta a zona atual para o servidor (chamado a cada transição de mapa
 * nos hooks do game.js e no início do jogo). Só o líder altera o estado;
 * membros são ignorados pelo servidor (no-op). */
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
    }
    // inbox (badge ✉) a cada 3 polls (~18s) — mantém leve
    PARTY_POLL_N += 1;
    if (PARTY_POLL_N % 3 === 0) {
      const inbox = await partyFetchInbox();
      if (inbox.ok && G && G.p) {
        G.p._partyInvites = (inbox.invites || []).length;
        if (typeof renderPartyButton === "function") renderPartyButton(G.p);
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
    if (typeof addLog === "function") {
      addLog("party", `O líder entrou em um novo local — seguindo para a MESMA instância...`);
    }
    if (f.boss) {
      // sala de boss: o membro é teleportado para o mesmo boss
      if (typeof startBoss === "function") startBoss(f.boss);
      else if (typeof toast === "function") toast("Líder entrou no boss (instância indisponível aqui)");
    } else if (f.hunt) {
      // local de caça: mesma hunt + MESMA instância (non-pvp/pvp)
      if (typeof startHunt === "function") {
        startHunt(f.hunt, f.instance || "non-pvp");
        if (typeof toast === "function") toast(`Seguindo o líder para <b>${f.hunt}</b>...`, "level");
      }
    }
    // confirma o teleporte no servidor (consome o nonce)
    await accountPartyFollow(Number(sessionCharId()), f.nonce);
  } catch (e) { /* rede */ }
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
