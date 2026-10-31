/*
 * guild.js — Sistema de GUILDS (por conta).
 *
 * Regras:
 *   - A guild é da CONTA: 1 personagem entra e toda a conta participa (os
 *     bônus aplicados à guild valem para a conta inteira). Uma conta só
 *     pode estar em 1 guild e apenas 1 personagem representa a conta nela.
 *   - Guild nasce com 10 slots; cada nível libera +5 slots.
 *   - Níveis por EXP de tasks (1 ponto por task completada):
 *       L1 0 · L2 10 · L3 25 · L4 40 · L5 60 · L6 85 · L7 120 · L8 160
 *       L9 250 · L10 400.
 *   - TASK GUILD (por conta): a cada server save (00:00 America/Sao_Paulo)
 *     são liberadas 3 tasks para todos os membros. Os monstros são
 *     sorteados do mesmo pool da loadscreen — apenas espécies presentes
 *     nas hunts do catálogo (sem "em breve"), então hunts novas entram
 *     automaticamente no sorteio.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const GUILD_BASE_SLOTS = 10;
const GUILD_SLOTS_PER_LEVEL = 5;
const GUILD_MAX_LEVEL = 10;
/* EXP mínima para estar no nível (index 0 = nível 1). */
const GUILD_LEVEL_EXP = [0, 10, 25, 40, 60, 85, 120, 160, 250, 400];
const GUILD_TASKS_PER_DAY = 3;
const GUILD_TASK_MIN_KILLS = 100;
const GUILD_TASK_MAX_KILLS = 400;
/* Criação — regras do crystal server (ajustáveis): */
const GUILD_CREATE_MIN_LEVEL = 100;
const GUILD_CREATE_COST_GOLD = 100000;
const GUILD_NAME_MIN = 3;
const GUILD_NAME_MAX = 30;
const GUILD_NAME_RE = /^[A-Za-z][A-Za-z0-9 .\-']+$/;

const SERVER_SAVE_TZ = String(process.env.SERVER_SAVE_TZ || "America/Sao_Paulo").trim() || "America/Sao_Paulo";

function guildLevelForExp(exp) {
  const e = Math.max(0, Number(exp) || 0);
  let level = 1;
  for (let i = 0; i < GUILD_LEVEL_EXP.length; i++)
    if (e >= GUILD_LEVEL_EXP[i]) level = i + 1;
  return Math.min(GUILD_MAX_LEVEL, level);
}
function guildSlotsForLevel(level) {
  return GUILD_BASE_SLOTS + (Math.max(1, Number(level) || 1) - 1) * GUILD_SLOTS_PER_LEVEL;
}
function guildNextLevelExp(level) {
  const l = Math.max(1, Number(level) || 1);
  return l >= GUILD_MAX_LEVEL ? null : GUILD_LEVEL_EXP[l];
}

/* Dia do server save (00:00 no fuso) — mesma regra de server.js. */
function guildTaskDay(date) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: SERVER_SAVE_TZ, hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(date || new Date()).filter((p) => p.type !== "literal")
    .reduce((o, p) => (o[p.type] = p.value, o), {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/* Pool de monstros sorteáveis — MESMA estrutura do hint da loadscreen
 * (preload.js): hunts do catálogo HUNT_MODAL_SECTIONS (fora as "em breve")
 * → monsters + spawnWeights + bossMobs, válidas se existirem em
 * GAMEDATA.monsters ou MONSTERDATA. Cache: o catálogo é estático no boot. */
let _taskPool = null;
function guildTaskMonsterPool() {
  if (_taskPool) return _taskPool;
  const js = path.join(__dirname, "..", "game", "js");
  const sandbox = { window: {}, console };
  for (const file of ["hunt-sections.js", "gamedata.js", "monsterdata.js"]) {
    try { vm.runInNewContext(fs.readFileSync(path.join(js, file), "utf8"), sandbox); }
    catch (e) { console.error("[guild] falha ao ler", file, "-", e && e.message); }
  }
  const G = sandbox.window.GAMEDATA || {}, M = sandbox.window.MONSTERDATA || {};
  const catalog = new Set();
  (sandbox.window.HUNT_MODAL_SECTIONS || []).forEach((section) =>
    ((section && section.ids) || []).forEach((id) => catalog.add(id)));
  const registered = new Set();
  Object.keys(G.hunts || {}).forEach((id) => {
    const hunt = G.hunts[id];
    if (!hunt || hunt.comingSoon) return;
    if (catalog.size && !catalog.has(id)) return;
    (hunt.monsters || []).forEach((slug) => registered.add(String(slug)));
    Object.keys(hunt.spawnWeights || {}).forEach((slug) => registered.add(String(slug)));
    (hunt.bossMobs || []).forEach((slug) => registered.add(String(slug)));
  });
  _taskPool = Array.from(registered).filter((slug) => {
    const m = (G.monsters && G.monsters[slug]) || M[slug];
    return m && Number(m.hp) > 0;
  });
  return _taskPool;
}

/* RNG determinístico por semente: as 3 tasks do dia são iguais para todos
 * os membros da guild (caçam os mesmos monstros), progresso individual. */
function guildTaskSeedRand(seed) {
  let h = 0;
  for (const c of String(seed)) h = (h * 31 + c.charCodeAt(0)) | 0;
  return () => {
    h = (h * 1103515245 + 12345) | 0;
    return ((h >>> 16) & 0x7fff) / 0x8000;
  };
}
function guildDailyTaskDefs(guildId, day) {
  const pool = guildTaskMonsterPool();
  const out = [];
  for (let slot = 0; slot < GUILD_TASKS_PER_DAY; slot++) {
    const rnd = guildTaskSeedRand(`${guildId}:${day}:${slot}`);
    const slug = pool.length ? pool[Math.floor(rnd() * pool.length)] : "rat";
    const target = GUILD_TASK_MIN_KILLS +
      Math.floor(rnd() * (GUILD_TASK_MAX_KILLS - GUILD_TASK_MIN_KILLS + 1));
    out.push({ slot, monster_slug: slug, target });
  }
  return out;
}

/* ------------------------------- helpers ------------------------------- */
async function authChar(db, token, charId) {
  const acc = await db.findAccountByToken(token);
  if (!acc) return { error: { code: 401, body: { ok: false, msg: "Sessão inválida" } } };
  let c = null;
  if (charId) {
    c = await db.findCharacter(Number(charId));
    if (!c || Number(c.account_id) !== Number(acc.id))
      return { error: { code: 403, body: { ok: false, msg: "Personagem não pertence à sua conta" } } };
  }
  return { account: acc, char: c };
}
function guildPublic(guild, membersCount) {
  const level = guildLevelForExp(guild.exp);
  const slots = guildSlotsForLevel(level);
  return {
    id: Number(guild.id), name: guild.name, level, exp: Number(guild.exp) || 0,
    nextLevelExp: guildNextLevelExp(level),
    slots, freeSlots: Math.max(0, slots - (Number(membersCount) || 0)),
    members: Number(membersCount) || 0,
    createdAt: guild.created_at || null,
  };
}
function rankOf(member) { return member ? String(member.rank || "member") : null; }
const CAN_INVITE = new Set(["leader", "vice"]);

/* ------------------------------- handlers ------------------------------ */
/* GET /api/guilds — todas as guilds (nome, nível, vagas livres). */
async function guildList(db, token) {
  const acc = await db.findAccountByToken(token);
  if (!acc) return { code: 401, body: { ok: false, msg: "Sessão inválida" } };
  const rows = await db.guildList();
  return { code: 200, body: { ok: true, guilds: rows.map((r) => guildPublic(r, r.members)) } };
}

/* GET /api/guild/state — vínculo da conta: guild, minha role, convites
 * pendentes e minhas tasks do dia (se membro). */
async function guildState(db, token, charId) {
  const auth = await authChar(db, token, charId);
  if (auth.error) return auth.error;
  const member = await db.guildMemberByAccount(auth.account.id);
  const invites = member ? [] : await db.guildInvitesForAccount(auth.account.id);
  let guild = null, members = [], myRank = null, tasks = [];
  if (member) {
    guild = await db.guildById(member.guild_id);
    members = await db.guildMembers(member.guild_id);
    myRank = rankOf(member);
    const day = guildTaskDay();
    await db.guildTasksEnsure(member.guild_id, auth.account.id, day,
      guildDailyTaskDefs(member.guild_id, day));
    tasks = await db.guildTasksFor(member.guild_id, auth.account.id, day);
  }
  return { code: 200, body: { ok: true,
    guild: guild ? guildPublic(guild, members.length) : null,
    myRank, members, invites, tasks, day: guildTaskDay() } };
}

/* GET /api/guild/detail — painel público da guild + ranking de tasks. */
async function guildDetail(db, token, guildId, charId) {
  const auth = await authChar(db, token, charId);
  if (auth.error) return auth.error;
  const guild = await db.guildById(Number(guildId));
  if (!guild) return { code: 404, body: { ok: false, msg: "Guild não encontrada" } };
  const members = await db.guildMembers(guild.id);
  const member = await db.guildMemberByAccount(auth.account.id);
  const myRank = member && Number(member.guild_id) === Number(guild.id) ? rankOf(member) : null;
  let tasks = [];
  if (myRank) {
    const day = guildTaskDay();
    await db.guildTasksEnsure(guild.id, auth.account.id, day,
      guildDailyTaskDefs(guild.id, day));
    tasks = await db.guildTasksFor(guild.id, auth.account.id, day);
  }
  return { code: 200, body: { ok: true,
    guild: guildPublic(guild, members.length), myRank, members, tasks,
    day: guildTaskDay() } };
}

/* POST /api/guild/create — mesmo espírito das regras do crystal server:
 * nível mínimo, custo em gold da conta, nome único, char sem guild. */
async function guildCreate(db, body) {
  const auth = await authChar(db, token(body), body.char_id);
  if (auth.error) return auth.error;
  const { account, char } = auth;
  const name = String(body.name || "").trim().replace(/\s+/g, " ");
  if (name.length < GUILD_NAME_MIN || name.length > GUILD_NAME_MAX || !GUILD_NAME_RE.test(name))
    return { code: 400, body: { ok: false, error: "GUILD_NAME_INVALID",
      msg: `Nome inválido (${GUILD_NAME_MIN}–${GUILD_NAME_MAX} letras).` } };
  if (Number(char.level) < GUILD_CREATE_MIN_LEVEL)
    return { code: 403, body: { ok: false, error: "GUILD_LEVEL_LOW",
      msg: `É preciso nível ${GUILD_CREATE_MIN_LEVEL}+ para fundar uma guild.` } };
  if (await db.guildMemberByAccount(account.id))
    return { code: 409, body: { ok: false, error: "GUILD_ALREADY_MEMBER",
      msg: "Sua conta já está em uma guild." } };
  if (await db.guildByName(name))
    return { code: 409, body: { ok: false, error: "GUILD_NAME_TAKEN",
      msg: "Já existe uma guild com esse nome." } };
  const gold = Math.max(0, Math.floor(Number(account.gold) || 0));
  if (gold < GUILD_CREATE_COST_GOLD)
    return { code: 403, body: { ok: false, error: "GUILD_GOLD_LOW",
      msg: `Fundar uma guild custa ${GUILD_CREATE_COST_GOLD.toLocaleString("pt-BR")} gold.` } };
  const created = await db.guildCreate({
    name, leader_account_id: account.id, leader_character_id: char.id,
    cost_gold: GUILD_CREATE_COST_GOLD,
  });
  if (!created || !created.ok)
    return { code: 409, body: { ok: false, error: created && created.error || "GUILD_CREATE_FAILED",
      msg: "Não foi possível criar a guild." } };
  return { code: 201, body: { ok: true, msg: `Guild "${name}" fundada!` } };
}

/* POST /api/guild/invite — líder/vice convida um personagem por nome. A
 * vaga é por CONTA: o convite trava se qualquer char da conta alvo já
 * estiver em uma guild. */
async function guildInvite(db, body) {
  const auth = await authChar(db, token(body), body.char_id);
  if (auth.error) return auth.error;
  const member = await db.guildMemberByAccount(auth.account.id);
  if (!member || !CAN_INVITE.has(rankOf(member)))
    return { code: 403, body: { ok: false, msg: "Sem permissão para convidar." } };
  const guild = await db.guildById(member.guild_id);
  const members = await db.guildMembers(member.guild_id);
  if (members.length >= guildSlotsForLevel(guildLevelForExp(guild.exp)))
    return { code: 409, body: { ok: false, error: "GUILD_FULL",
      msg: "Guild sem vagas — suba de nível para liberar slots." } };
  const invitee = await db.findCharacterByName(String(body.invitee_name || "").trim());
  if (!invitee) return { code: 404, body: { ok: false, msg: "Personagem não encontrado." } };
  if (Number(invitee.account_id) === Number(auth.account.id))
    return { code: 400, body: { ok: false, msg: "Sua conta já está na guild." } };
  if (await db.guildMemberByAccount(invitee.account_id))
    return { code: 409, body: { ok: false, error: "GUILD_ALREADY_MEMBER",
      msg: "Essa conta já está em uma guild." } };
  const r = await db.guildInviteAdd(member.guild_id, auth.char.id, invitee.id);
  if (!r.ok) return { code: 409, body: { ok: false, error: r.error,
    msg: r.error === "GUILD_INVITE_PENDING" ? "Já existe um convite pendente para esse personagem."
      : "Não foi possível convidar." } };
  return { code: 200, body: { ok: true, msg: `Convite enviado para ${invitee.name}.` } };
}

async function guildInviteReply(db, body, accept) {
  const auth = await authChar(db, token(body), body.char_id);
  if (auth.error) return auth.error;
  const invite = await db.guildInviteFind(Number(body.invite_id));
  if (!invite || String(invite.status) !== "pending")
    return { code: 404, body: { ok: false, msg: "Convite não encontrado." } };
  const invitee = await db.findCharacter(invite.invitee_character_id);
  if (!invitee || Number(invitee.account_id) !== Number(auth.account.id))
    return { code: 403, body: { ok: false, msg: "Convite não pertence à sua conta." } };
  if (!accept) {
    await db.guildInviteSetStatus(invite.id, "declined");
    return { code: 200, body: { ok: true, msg: "Convite recusado." } };
  }
  if (await db.guildMemberByAccount(auth.account.id))
    return { code: 409, body: { ok: false, error: "GUILD_ALREADY_MEMBER",
      msg: "Sua conta já está em uma guild." } };
  const guild = await db.guildById(invite.guild_id);
  if (!guild) { await db.guildInviteSetStatus(invite.id, "cancelled");
    return { code: 404, body: { ok: false, msg: "A guild não existe mais." } }; }
  const members = await db.guildMembers(guild.id);
  if (members.length >= guildSlotsForLevel(guildLevelForExp(guild.exp)))
    return { code: 409, body: { ok: false, error: "GUILD_FULL",
      msg: "Guild sem vagas no momento." } };
  await db.guildMemberAdd(guild.id, auth.account.id, invitee.id, "member");
  await db.guildInviteSetStatus(invite.id, "accepted");
  return { code: 200, body: { ok: true, msg: `Você entrou na guild ${guild.name}!` } };
}

/* POST /api/guild/leave — líder sai: vice assume; sem vice, o membro mais
 * antigo assume; último membro dissolve a guild. */
async function guildLeave(db, body) {
  const auth = await authChar(db, token(body), body.char_id);
  if (auth.error) return auth.error;
  const member = await db.guildMemberByAccount(auth.account.id);
  if (!member) return { code: 404, body: { ok: false, msg: "Sua conta não está em uma guild." } };
  const r = await db.guildMemberRemove(member.guild_id, auth.account.id);
  return { code: 200, body: Object.assign({ ok: true }, r && r.disbanded
    ? { msg: `Guild ${r.guildName || ""} dissolvida.` } : { msg: "Você saiu da guild." }) };
}

async function guildKick(db, body) {
  const auth = await authChar(db, token(body), body.char_id);
  if (auth.error) return auth.error;
  const member = await db.guildMemberByAccount(auth.account.id);
  if (!member || !CAN_INVITE.has(rankOf(member)))
    return { code: 403, body: { ok: false, msg: "Sem permissão." } };
  const target = await db.guildMemberByAccount(Number(body.member_account_id));
  if (!target || Number(target.guild_id) !== Number(member.guild_id))
    return { code: 404, body: { ok: false, msg: "Conta não é membro desta guild." } };
  const rank = rankOf(member), targetRank = rankOf(target);
  if (Number(target.account_id) === Number(auth.account.id))
    return { code: 400, body: { ok: false, msg: "Use 'Sair da guild' para se remover." } };
  if (targetRank === "leader" || (rank === "vice" && targetRank !== "member"))
    return { code: 403, body: { ok: false, msg: "Sem permissão para expulsar este membro." } };
  await db.guildMemberRemove(member.guild_id, target.account_id);
  return { code: 200, body: { ok: true, msg: "Membro expulso da guild." } };
}

/* POST /api/guild/promote — líder promove membro a vice (o vice atual
 * volta a membro) ou rebaixa o vice a membro. */
async function guildPromote(db, body) {
  const auth = await authChar(db, token(body), body.char_id);
  if (auth.error) return auth.error;
  const member = await db.guildMemberByAccount(auth.account.id);
  if (!member || rankOf(member) !== "leader")
    return { code: 403, body: { ok: false, msg: "Apenas o líder pode promover." } };
  const target = await db.guildMemberByAccount(Number(body.member_account_id));
  if (!target || Number(target.guild_id) !== Number(member.guild_id))
    return { code: 404, body: { ok: false, msg: "Conta não é membro desta guild." } };
  if (rankOf(target) === "leader")
    return { code: 400, body: { ok: false, msg: "O líder não pode ser rebaixado." } };
  const newRank = rankOf(target) === "vice" ? "member" : "vice";
  await db.guildMemberSetRank(member.guild_id, target.account_id, newRank);
  return { code: 200, body: { ok: true,
    msg: newRank === "vice" ? "Membro promovido a vice-líder." : "Vice rebaixado a membro." } };
}

function token(body) { return body && body.token; }

module.exports = {
  GUILD_BASE_SLOTS, GUILD_SLOTS_PER_LEVEL, GUILD_MAX_LEVEL, GUILD_LEVEL_EXP,
  GUILD_TASKS_PER_DAY, GUILD_TASK_MIN_KILLS, GUILD_TASK_MAX_KILLS,
  GUILD_CREATE_MIN_LEVEL, GUILD_CREATE_COST_GOLD,
  guildLevelForExp, guildSlotsForLevel, guildNextLevelExp,
  guildTaskDay, guildTaskMonsterPool, guildDailyTaskDefs,
  guildList, guildState, guildDetail, guildCreate, guildInvite,
  guildAccept: (db, body) => guildInviteReply(db, body, true),
  guildDecline: (db, body) => guildInviteReply(db, body, false),
  guildLeave, guildKick, guildPromote,
};
