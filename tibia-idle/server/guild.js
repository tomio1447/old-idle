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

/* GUILD POINTS + SHOP — cada task completada dá +1 EXP e +1 GUILD POINT.
 * Bônus comprados com pontos + caixa da guild valem para TODOS os
 * personagens das contas membro (persistidos em data.guildBonus). */
const GUILD_MAX_LEADERS = 3;
const GUILD_BONUS_MAX_LEVEL = 10;
const GUILD_BONUS_LEVEL_GOLD = 50000000; // 50kk por nível comprado
const GUILD_BONUS_DEFS = [
  { id: "lifeLeech",  label: "Life Leech",          perLevel: 0.1, unit: "%" },
  { id: "manaLeech",  label: "Mana Leech",          perLevel: 0.1, unit: "%" },
  { id: "critChance", label: "Critical Chance",     perLevel: 0.1, unit: "%" },
  { id: "critDamage", label: "Critical Damage",     perLevel: 0.1, unit: "%" },
  { id: "dodge",      label: "Dodge",               perLevel: 0.1, unit: "%" },
  { id: "exp",        label: "Bônus de EXP",        perLevel: 1,   unit: "%" },
  { id: "skill",      label: "Bônus de Skill/ML",   perLevel: 1,   unit: "%" },
];
/* BÔNUS TEMPORÁRIO — 24h para a guild toda; custa 125kk do caixa +
 * 1 insígnia PvP da conta compradora. */
const GUILD_TEMP_BONUS_HOURS = 24;
const GUILD_TEMP_BONUS_GOLD = 125000000; // 125kk
const GUILD_TEMP_INSIGNIA_COST = 1;
const GUILD_TEMP_BONUS_DEFS = [
  { id: "bossLoot", label: "Boss Loot",          pct: 25 },
  { id: "exp",      label: "EXP",                pct: 25 },
  { id: "skill",    label: "Skill/ML",           pct: 25 },
  { id: "loot",     label: "Loot de monstros",   pct: 25 },
];
/* Ícones em imagens/guildicons/1..N.png — troca com cooldown de 24h. */
const GUILD_ICON_COUNT = 10;
const GUILD_ICON_COOLDOWN_MS = 24 * 3600 * 1000;
/* Renomear a guild custa Tibia Coins do caixa de coins da guild. */
const GUILD_RENAME_COST_COINS = 250;

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
/* Comprar o nível N (1..10) custa N guild points + 50kk do caixa. */
function guildBonusCost(nextLevel) {
  const l = Math.max(1, Math.min(GUILD_BONUS_MAX_LEVEL, Number(nextLevel) || 1));
  return { points: l, gold: GUILD_BONUS_LEVEL_GOLD };
}
function guildBonusDef(id) {
  return GUILD_BONUS_DEFS.find((d) => d.id === String(id)) || null;
}
/* Normaliza o mapa de níveis persistido (0..10 por chave conhecida). */
function guildBonusLevels(raw) {
  let src = raw;
  if (typeof src === "string") { try { src = JSON.parse(src); } catch (e) { src = null; } }
  const out = {};
  for (const d of GUILD_BONUS_DEFS)
    out[d.id] = Math.max(0, Math.min(GUILD_BONUS_MAX_LEVEL,
      Math.floor(Number(src && src[d.id]) || 0)));
  return out;
}
function guildTempBonusDef(id) {
  return GUILD_TEMP_BONUS_DEFS.find((d) => d.id === String(id)) || null;
}
/* Normaliza o mapa de expirações persistido {key: untilMs}. */
function guildTempBonusUntil(raw) {
  let src = raw;
  if (typeof src === "string") { try { src = JSON.parse(src); } catch (e) { src = null; } }
  const out = {};
  for (const d of GUILD_TEMP_BONUS_DEFS) {
    const until = Math.max(0, Number(src && src[d.id]) || 0);
    if (until > 0) out[d.id] = until;
  }
  return out;
}
function guildTempBonusActive(tempBonuses, id, now) {
  const until = guildTempBonusUntil(tempBonuses)[id] || 0;
  return until > (now || Date.now());
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
    points: Math.max(0, Number(guild.points) || 0),
    bonuses: guildBonusLevels(guild.bonuses),
    icon: Math.max(1, Math.min(GUILD_ICON_COUNT, Math.floor(Number(guild.icon) || 1))),
    iconAt: Math.max(0, Number(guild.icon_at) || 0),
    createdAt: guild.created_at || null,
  };
}
function rankOf(member) { return member ? String(member.rank || "member") : null; }
const CAN_INVITE = new Set(["leader", "vice"]);
/* Metadados do shop para o cliente renderizar sem hardcode. */
function guildShopDefs() {
  return GUILD_BONUS_DEFS.map((d) => Object.assign({ maxLevel: GUILD_BONUS_MAX_LEVEL }, d));
}
function guildTempShopDefs() {
  return GUILD_TEMP_BONUS_DEFS.map((d) => Object.assign({}, d,
    { hours: GUILD_TEMP_BONUS_HOURS, gold: GUILD_TEMP_BONUS_GOLD,
      insignias: GUILD_TEMP_INSIGNIA_COST }));
}

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
  const pub = guild ? guildPublic(guild, members.length) : null;
  if (pub) {
    pub.balance = Math.max(0, Number(guild.balance) || 0);
    pub.coins = Math.max(0, Number(guild.coins) || 0);
    pub.tempBonuses = guildTempBonusUntil(guild.temp_bonuses);
  }
  return { code: 200, body: { ok: true,
    guild: pub, myRank, members, invites, tasks,
    shop: guildShopDefs(), tempShop: guildTempShopDefs(),
    insignias: Math.max(0, Number(auth.account.pvp_insignias) || 0),
    accountCoins: Math.max(0, Number(auth.account.coins) || 0),
    iconCooldownMs: GUILD_ICON_COOLDOWN_MS,
    renameCostCoins: GUILD_RENAME_COST_COINS,
    iconCount: GUILD_ICON_COUNT,
    day: guildTaskDay() } };
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
  let tasks = [], logTotals = null;
  if (myRank) {
    const day = guildTaskDay();
    await db.guildTasksEnsure(guild.id, auth.account.id, day,
      guildDailyTaskDefs(guild.id, day));
    tasks = await db.guildTasksFor(guild.id, auth.account.id, day);
    if (typeof db.guildLogTotals === "function")
      logTotals = await db.guildLogTotals(guild.id);
  }
  const pub = guildPublic(guild, members.length);
  /* Caixa, bônus temporários e contabilidade são restritos a membros. */
  if (myRank) {
    pub.balance = Math.max(0, Number(guild.balance) || 0);
    pub.coins = Math.max(0, Number(guild.coins) || 0);
    pub.tempBonuses = guildTempBonusUntil(guild.temp_bonuses);
  }
  return { code: 200, body: { ok: true,
    guild: pub, myRank, members, tasks, logTotals,
    shop: guildShopDefs(), tempShop: guildTempShopDefs(),
    insignias: myRank ? Math.max(0, Number(auth.account.pvp_insignias) || 0) : 0,
    accountCoins: myRank ? Math.max(0, Number(auth.account.coins) || 0) : 0,
    iconCooldownMs: GUILD_ICON_COOLDOWN_MS,
    renameCostCoins: GUILD_RENAME_COST_COINS,
    iconCount: GUILD_ICON_COUNT,
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
  const icon = Math.max(1, Math.min(GUILD_ICON_COUNT, Math.floor(Number(body.icon) || 1)));
  const created = await db.guildCreate({
    name, icon, leader_account_id: account.id, leader_character_id: char.id,
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
  /* bônus ativos da guild passam a valer nos chars da conta que entrou */
  if (typeof db.guildApplyBonuses === "function")
    try { await db.guildApplyBonuses(guild.id); } catch (e) {}
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

/* POST /api/guild/promote — líder sobe um membro um rank:
 * member → vice → leader (máx. GUILD_MAX_LEADERS líderes). */
async function guildPromote(db, body) {
  const auth = await authChar(db, token(body), body.char_id);
  if (auth.error) return auth.error;
  const member = await db.guildMemberByAccount(auth.account.id);
  if (!member || rankOf(member) !== "leader")
    return { code: 403, body: { ok: false, msg: "Apenas líderes podem promover." } };
  const target = await db.guildMemberByAccount(Number(body.member_account_id));
  if (!target || Number(target.guild_id) !== Number(member.guild_id))
    return { code: 404, body: { ok: false, msg: "Conta não é membro desta guild." } };
  const rank = rankOf(target);
  if (rank === "leader")
    return { code: 400, body: { ok: false, msg: "O membro já é líder." } };
  if (rank === "vice") {
    const members = await db.guildMembers(member.guild_id);
    const leaders = members.filter((m) => rankOf(m) === "leader").length;
    if (leaders >= GUILD_MAX_LEADERS)
      return { code: 409, body: { ok: false, error: "GUILD_LEADERS_FULL",
        msg: `A guild já tem ${GUILD_MAX_LEADERS} líderes (máximo).` } };
    await db.guildMemberSetRank(member.guild_id, target.account_id, "leader");
    return { code: 200, body: { ok: true, msg: "Vice promovido a líder." } };
  }
  await db.guildMemberSetRank(member.guild_id, target.account_id, "vice");
  return { code: 200, body: { ok: true, msg: "Membro promovido a vice-líder." } };
}

/* POST /api/guild/demote — líder desce um rank: leader → vice → member.
 * O último líder não pode ser rebaixado (a guild precisa de um líder). */
async function guildDemote(db, body) {
  const auth = await authChar(db, token(body), body.char_id);
  if (auth.error) return auth.error;
  const member = await db.guildMemberByAccount(auth.account.id);
  if (!member || rankOf(member) !== "leader")
    return { code: 403, body: { ok: false, msg: "Apenas líderes podem rebaixar." } };
  const target = await db.guildMemberByAccount(Number(body.member_account_id));
  if (!target || Number(target.guild_id) !== Number(member.guild_id))
    return { code: 404, body: { ok: false, msg: "Conta não é membro desta guild." } };
  const rank = rankOf(target);
  if (rank === "member")
    return { code: 400, body: { ok: false, msg: "O membro já está no rank mais baixo." } };
  if (rank === "leader") {
    const members = await db.guildMembers(member.guild_id);
    if (members.filter((m) => rankOf(m) === "leader").length <= 1)
      return { code: 400, body: { ok: false, msg: "A guild precisa manter ao menos um líder." } };
    await db.guildMemberSetRank(member.guild_id, target.account_id, "vice");
    return { code: 200, body: { ok: true, msg: "Líder rebaixado a vice-líder." } };
  }
  await db.guildMemberSetRank(member.guild_id, target.account_id, "member");
  return { code: 200, body: { ok: true, msg: "Vice rebaixado a membro." } };
}

/* POST /api/guild/donate — membro doa gold da conta para o caixa da
 * guild. O caixa só pode ser gasto por líderes (compras do shop). */
async function guildDonate(db, body) {
  const auth = await authChar(db, token(body), body.char_id);
  if (auth.error) return auth.error;
  const member = await db.guildMemberByAccount(auth.account.id);
  if (!member) return { code: 404, body: { ok: false, msg: "Sua conta não está em uma guild." } };
  const amount = Math.max(0, Math.floor(Number(body.amount) || 0));
  if (!amount || amount <= 0)
    return { code: 400, body: { ok: false, msg: "Informe uma quantia válida." } };
  const r = await db.guildDonate(member.guild_id, auth.account.id,
    auth.char.name, amount);
  if (!r || !r.ok) {
    const err = r && r.error;
    return { code: 409, body: { ok: false, error: err || "DONATE_FAILED",
      msg: err === "GOLD_LOW" ? "Gold insuficiente na conta." : "Não foi possível doar." } };
  }
  return { code: 200, body: { ok: true,
    msg: `Doação de ${amount.toLocaleString("pt-BR")} gold registrada!`,
    balance: r.balance, gold: r.gold } };
}

/* POST /api/guild/buy — líder compra 1 nível de bônus com guild points
 * + gold do caixa. Aplica a todos os personagens das contas membro. */
async function guildBuyBonus(db, body) {
  const auth = await authChar(db, token(body), body.char_id);
  if (auth.error) return auth.error;
  const member = await db.guildMemberByAccount(auth.account.id);
  if (!member) return { code: 404, body: { ok: false, msg: "Sua conta não está em uma guild." } };
  if (rankOf(member) !== "leader")
    return { code: 403, body: { ok: false, error: "LEADER_ONLY",
      msg: "Apenas líderes podem usar o caixa da guild." } };
  const def = guildBonusDef(body.bonus_id);
  if (!def) return { code: 400, body: { ok: false, msg: "Bônus inválido." } };
  const guild = await db.guildById(member.guild_id);
  if (!guild) return { code: 404, body: { ok: false, msg: "Guild não encontrada." } };
  const levels = guildBonusLevels(guild.bonuses);
  const level = levels[def.id] || 0;
  if (level >= GUILD_BONUS_MAX_LEVEL)
    return { code: 409, body: { ok: false, error: "BONUS_MAXED",
      msg: "Este bônus já está no nível máximo." } };
  const cost = guildBonusCost(level + 1);
  if (Number(guild.points) < cost.points)
    return { code: 409, body: { ok: false, error: "POINTS_LOW",
      msg: `Guild points insuficientes (precisa ${cost.points}).` } };
  if (Number(guild.balance) < cost.gold)
    return { code: 409, body: { ok: false, error: "BALANCE_LOW",
      msg: `Caixa insuficiente — precisa ${cost.gold.toLocaleString("pt-BR")} gold.` } };
  const r = await db.guildBonusBuy(member.guild_id, auth.account.id,
    auth.char.name, def.id, level + 1, cost);
  if (!r || !r.ok) {
    const err = r && r.error;
    return { code: 409, body: { ok: false, error: err || "BUY_FAILED",
      msg: err === "POINTS_LOW" ? "Guild points insuficientes."
        : err === "BALANCE_LOW" ? "Caixa insuficiente."
        : "Não foi possível comprar." } };
  }
  return { code: 200, body: { ok: true,
    msg: `${def.label} Nv ${level + 1} ativado para toda a guild!`,
    points: r.points, balance: r.balance, bonuses: r.bonuses } };
}

/* POST /api/guild/buy-temp — líder ativa bônus temporário (24h) com
 * gold do caixa + insígnia PvP da própria conta. */
async function guildBuyTempBonus(db, body) {
  const auth = await authChar(db, token(body), body.char_id);
  if (auth.error) return auth.error;
  const member = await db.guildMemberByAccount(auth.account.id);
  if (!member) return { code: 404, body: { ok: false, msg: "Sua conta não está em uma guild." } };
  if (rankOf(member) !== "leader")
    return { code: 403, body: { ok: false, error: "LEADER_ONLY",
      msg: "Apenas líderes podem usar o caixa da guild." } };
  const def = guildTempBonusDef(body.bonus_id);
  if (!def) return { code: 400, body: { ok: false, msg: "Bônus inválido." } };
  const guild = await db.guildById(member.guild_id);
  if (!guild) return { code: 404, body: { ok: false, msg: "Guild não encontrada." } };
  const until = guildTempBonusUntil(guild.temp_bonuses)[def.id] || 0;
  if (until > Date.now())
    return { code: 409, body: { ok: false, error: "BONUS_ACTIVE",
      msg: "Este bônus já está ativo." } };
  const cost = { gold: GUILD_TEMP_BONUS_GOLD, insignias: GUILD_TEMP_INSIGNIA_COST };
  if (Number(guild.balance) < cost.gold)
    return { code: 409, body: { ok: false, error: "BALANCE_LOW",
      msg: `Caixa insuficiente — precisa ${cost.gold.toLocaleString("pt-BR")} gold.` } };
  if (Number(auth.account.pvp_insignias) < cost.insignias)
    return { code: 409, body: { ok: false, error: "INSIGNIA_LOW",
      msg: `Insígnias PvP insuficientes (precisa ${cost.insignias}).` } };
  const r = await db.guildTempBonusBuy(member.guild_id, auth.account.id,
    auth.char.name, def.id, Date.now() + GUILD_TEMP_BONUS_HOURS * 3600 * 1000, cost);
  if (!r || !r.ok) {
    const err = r && r.error;
    return { code: 409, body: { ok: false, error: err || "BUY_FAILED",
      msg: err === "INSIGNIA_LOW" ? "Insígnias PvP insuficientes."
        : err === "BALANCE_LOW" ? "Caixa insuficiente." : "Não foi possível ativar." } };
  }
  return { code: 200, body: { ok: true,
    msg: `${def.label} +${def.pct}% ativo por ${GUILD_TEMP_BONUS_HOURS}h para toda a guild!`,
    balance: r.balance, tempBonuses: r.tempBonuses } };
}

/* POST /api/guild/donate-coins — membro doa Tibia Coins da conta para o
 * caixa de coins da guild (reservado a futuras batalhas PvP). */
async function guildDonateCoins(db, body) {
  const auth = await authChar(db, token(body), body.char_id);
  if (auth.error) return auth.error;
  const member = await db.guildMemberByAccount(auth.account.id);
  if (!member) return { code: 404, body: { ok: false, msg: "Sua conta não está em uma guild." } };
  const amount = Math.max(0, Math.floor(Number(body.amount) || 0));
  if (!amount || amount <= 0)
    return { code: 400, body: { ok: false, msg: "Informe uma quantia válida." } };
  const r = await db.guildDonateCoins(member.guild_id, auth.account.id,
    auth.char.name, amount);
  if (!r || !r.ok) {
    const err = r && r.error;
    return { code: 409, body: { ok: false, error: err || "DONATE_FAILED",
      msg: err === "COINS_LOW" ? "Tibia Coins insuficientes na conta."
        : "Não foi possível doar." } };
  }
  return { code: 200, body: { ok: true,
    msg: `Doação de ${amount} Tibia Coins registrada!`,
    coins: r.coins, accountCoins: r.accountCoins } };
}

/* POST /api/guild/rename — líder renomeia a guild por 250 Tibia Coins do
 * caixa de coins da guild. Nome revalidado (regras + unicidade). */
async function guildRename(db, body) {
  const auth = await authChar(db, token(body), body.char_id);
  if (auth.error) return auth.error;
  const member = await db.guildMemberByAccount(auth.account.id);
  if (!member) return { code: 404, body: { ok: false, msg: "Sua conta não está em uma guild." } };
  if (rankOf(member) !== "leader")
    return { code: 403, body: { ok: false, error: "LEADER_ONLY",
      msg: "Apenas líderes podem renomear a guild." } };
  const name = String(body.name || "").trim().replace(/\s+/g, " ");
  if (name.length < GUILD_NAME_MIN || name.length > GUILD_NAME_MAX || !GUILD_NAME_RE.test(name))
    return { code: 400, body: { ok: false, error: "GUILD_NAME_INVALID",
      msg: `Nome inválido (${GUILD_NAME_MIN}–${GUILD_NAME_MAX} letras).` } };
  const guild = await db.guildById(member.guild_id);
  if (!guild) return { code: 404, body: { ok: false, msg: "Guild não encontrada." } };
  if (String(guild.name).toLowerCase() === name.toLowerCase())
    return { code: 409, body: { ok: false, error: "GUILD_SAME_NAME",
      msg: "A guild já tem esse nome." } };
  if (Number(guild.coins) < GUILD_RENAME_COST_COINS)
    return { code: 409, body: { ok: false, error: "COINS_LOW",
      msg: `A guild precisa de ${GUILD_RENAME_COST_COINS} Tibia Coins no caixa para renomear.` } };
  const r = await db.guildRename(member.guild_id, auth.account.id,
    auth.char.name, name, GUILD_RENAME_COST_COINS);
  if (!r || !r.ok) {
    const err = r && r.error;
    return { code: 409, body: { ok: false, error: err || "RENAME_FAILED",
      msg: err === "GUILD_NAME_TAKEN" ? "Já existe uma guild com esse nome."
        : err === "COINS_LOW" ? "Tibia Coins insuficientes no caixa da guild."
        : "Não foi possível renomear." } };
  }
  return { code: 200, body: { ok: true, msg: `Guild renomeada para "${name}"!` } };
}

/* POST /api/guild/icon — líder troca o ícone (máx 1x a cada 24h). */
async function guildSetIcon(db, body) {
  const auth = await authChar(db, token(body), body.char_id);
  if (auth.error) return auth.error;
  const member = await db.guildMemberByAccount(auth.account.id);
  if (!member) return { code: 404, body: { ok: false, msg: "Sua conta não está em uma guild." } };
  if (rankOf(member) !== "leader")
    return { code: 403, body: { ok: false, error: "LEADER_ONLY",
      msg: "Apenas líderes podem trocar o ícone." } };
  const icon = Math.floor(Number(body.icon) || 0);
  if (icon < 1 || icon > GUILD_ICON_COUNT)
    return { code: 400, body: { ok: false, msg: "Ícone inválido." } };
  const guild = await db.guildById(member.guild_id);
  if (!guild) return { code: 404, body: { ok: false, msg: "Guild não encontrada." } };
  const last = Math.max(0, Number(guild.icon_at) || 0);
  const wait = last + GUILD_ICON_COOLDOWN_MS - Date.now();
  if (wait > 0) {
    const mins = Math.ceil(wait / 60000);
    const h = Math.floor(mins / 60), m = mins % 60;
    return { code: 409, body: { ok: false, error: "ICON_COOLDOWN",
      msg: `O ícone pode ser trocado novamente em ${h}h${String(m).padStart(2, "0")}m.` } };
  }
  await db.guildSetIcon(member.guild_id, icon, Date.now(), {
    account_id: auth.account.id, char_name: auth.char.name, category: "purchase",
    detail: `Ícone da guild alterado para #${icon}`,
    gold_delta: 0, points_delta: 0, coins_delta: 0 });
  return { code: 200, body: { ok: true, msg: "Ícone da guild atualizado!", icon } };
}

/* GET /api/guild/log — histórico de doações/compras (só membros). */
async function guildLog(db, token, charId, category) {
  const auth = await authChar(db, token, charId);
  if (auth.error) return auth.error;
  const member = await db.guildMemberByAccount(auth.account.id);
  if (!member) return { code: 404, body: { ok: false, msg: "Sua conta não está em uma guild." } };
  const cat = ["donation", "purchase"].includes(String(category)) ? String(category) : null;
  const entries = await db.guildLogList(member.guild_id, cat, 200);
  const totals = await db.guildLogTotals(member.guild_id);
  return { code: 200, body: { ok: true, entries, totals } };
}

function token(body) { return body && body.token; }

module.exports = {
  GUILD_BASE_SLOTS, GUILD_SLOTS_PER_LEVEL, GUILD_MAX_LEVEL, GUILD_LEVEL_EXP,
  GUILD_TASKS_PER_DAY, GUILD_TASK_MIN_KILLS, GUILD_TASK_MAX_KILLS,
  GUILD_CREATE_MIN_LEVEL, GUILD_CREATE_COST_GOLD,
  GUILD_MAX_LEADERS, GUILD_BONUS_MAX_LEVEL, GUILD_BONUS_LEVEL_GOLD, GUILD_BONUS_DEFS,
  GUILD_TEMP_BONUS_HOURS, GUILD_TEMP_BONUS_GOLD, GUILD_TEMP_INSIGNIA_COST,
  GUILD_TEMP_BONUS_DEFS,
  guildLevelForExp, guildSlotsForLevel, guildNextLevelExp,
  guildBonusCost, guildBonusDef, guildBonusLevels, guildShopDefs,
  guildTempBonusDef, guildTempBonusUntil, guildTempBonusActive, guildTempShopDefs,
  guildTaskDay, guildTaskMonsterPool, guildDailyTaskDefs,
  guildList, guildState, guildDetail, guildCreate, guildInvite,
  guildAccept: (db, body) => guildInviteReply(db, body, true),
  guildDecline: (db, body) => guildInviteReply(db, body, false),
  guildLeave, guildKick, guildPromote, guildDemote,
  guildDonate, guildBuyBonus, guildBuyTempBonus, guildLog,
  guildDonateCoins, guildRename, guildSetIcon,
};
