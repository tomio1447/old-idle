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
