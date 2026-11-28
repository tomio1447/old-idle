/* Sistema PvP guild-vs-guild: desafios agendados com aposta do caixa da
 * guild. Líder/vice criam lobbies → convite para a guild rival → T-10min
 * sorteia o roster (cada jogador entra com a party da conta) → T-0 abre a
 * instância compartilhada no mapa de guerra. Placar por frags (Ankrahmun,
 * alvo 100) ou tempo de domínio da área de controle (Venore, segundos com
 * mais chars vivos do time na zona). Fim dos 10 min: maior placar vence;
 * empate = resultado empatado com devolução das apostas (sem prorrogação).
 * Vencedor leva o pote menos a taxa da casa (10%); participantes ganham
 * insígnias PvP. */
"use strict";

const PVP_MIN_GUILD_MEMBERS = 7;
const PVP_MIN_GUILD_LEVEL = 2;
const PVP_MIN_LEAD_MS = 10 * 60 * 1000;      // batalhas só com +10min
const PVP_PREP_MS = 10 * 60 * 1000;          // T-10: aviso + sorteio + countdown
const PVP_CREATE_COOLDOWN_MS = 30 * 60 * 1000; // intervalo mínimo entre criações
const PVP_TEAM_SIZES = [3, 5, 10, 15, 20, 50, 100];
const PVP_HOUSE_FEE = 0.10;
const PVP_MIN_STAKE = { gold: 5000000, coins: 25 }; // apostas mínimas: 5kk / 25 TC
const PVP_BATTLE_MS = 10 * 60 * 1000;
const PVP_QUICK_INVITE_MS = 5 * 60 * 1000;  // início rápido: convite vale 5 min
const PVP_QUICK_START_MS = 3 * 1000;        // ...e a batalha começa 3s após o aceite (test server)
const PVP_INSIGNIA_WIN = 3, PVP_INSIGNIA_LOSE = 1, PVP_INSIGNIA_DRAW = 1;
const PVP_INVITE_EXPIRE_GRACE_MS = 60 * 1000; // convite pendente expira no horário
const PVP_PARTY_MAX_CHARS = 5;               // party da conta entra inteira

const PVP_MAPS = {
  venore_town: {
    id: "venore_town", name: "Venore Town", img: "/assets/ui/pvp/venore_town.png",
    otbm: "venore_town", otbmFloor: 7,
    bounds: { x1: 1010, y1: 1016, x2: 1078, y2: 1058 },
    /* Nos bounds do OTBM: safezones em coordenadas RME absolutas. Venore:
     * safezones exclusivas (PZ) e área de controle na praça central da rua
     * principal (equidistante das duas saídas). Domina quem tiver mais
     * personagens vivos dentro dela; o placar soma os segundos de domínio. */
    safezones: {
      1: { x1: 1059, y1: 1034, x2: 1068, y2: 1048 },
      2: { x1: 1015, y1: 1021, x2: 1029, y2: 1030 },
    },
    controlZone: { x1: 1037, y1: 1040, x2: 1043, y2: 1044 },
    mode: "control",
    pz: true,
  },
  ank_open: {
    id: "ank_open", name: "Ankrahmun Open Battle", img: "/assets/ui/pvp/ank_open.png",
    otbm: "ank_open", otbmFloor: 7,
    bounds: { x1: 1003, y1: 1003, x2: 1053, y2: 1054 },
    /* Ankrahmun: safezones são PZ reais — rival não entra, sem combate dentro. */
    safezones: {
      1: { x1: 1032, y1: 1038, x2: 1038, y2: 1042 },
      2: { x1: 1017, y1: 1017, x2: 1020, y2: 1020 },
    },
    mode: "frags", fragTarget: 100,
    pz: true,
  },
};

/* Converte rect RME-absoluto para o grid local da instância (subtraindo a
 * origem do bounds declarado no mapa). */
function pvpLocalRect(rect, bounds) {
  return { x1: rect.x1 - bounds.x1, y1: rect.y1 - bounds.y1,
           x2: rect.x2 - bounds.x1, y2: rect.y2 - bounds.y1 };
}
function pvpMapLocal(map) {
  return { gridW: map.bounds.x2 - map.bounds.x1 + 1, gridH: map.bounds.y2 - map.bounds.y1 + 1,
           sz1: pvpLocalRect(map.safezones[1], map.bounds),
           sz2: pvpLocalRect(map.safezones[2], map.bounds),
           control: map.controlZone ? pvpLocalRect(map.controlZone, map.bounds) : null };
}
function pvpRectCenter(rect) {
  return { x: Math.round((rect.x1 + rect.x2) / 2), y: Math.round((rect.y1 + rect.y2) / 2) };
}

/* Definição de arena para o cliente montar o mapa da batalha (mesmo grid
 * local do servidor: bounds do OTBM, sem crop). */
function pvpClientArenas() {
  const out = {};
  for (const m of Object.values(PVP_MAPS)) {
    const l = pvpMapLocal(m);
    out[m.id] = { id: m.id, name: m.name, otbm: m.otbm, otbmFloor: m.otbmFloor,
      gridW: l.gridW, gridH: l.gridH, mode: m.mode };
  }
  return out;
}

let HELPER_FIELDS = [];
try { HELPER_FIELDS = require("../game/js/helper-presets.js").HELPER_PRESET_CONFIG_FIELDS || []; } catch (e) { HELPER_FIELDS = []; }
const StateCodec = require("./state_codec");

/* Descritor autoritativo quente em memória, por instância de batalha.
 * Sem isso, cada tick de cada cliente (~35 req/s) lia 4.7MB do MySQL,
 * fazia JSON.parse+clone+materialize+stringify+UPDATE do blob inteiro —
 * ~700ms de CPU por request, o event loop afogava e o combate "lagava".
 * Com o cache, o tick avança o objeto vivo e só persiste o blob a cada
 * PVP_AUTH_PERSIST_MS ou no fim. `rowVersion` detecta escritas externas
 * (ammo patch, checkpoint): se a versão da linha divergiu da cacheada,
 * o tick recarrega e re-parseia. */
const PVP_AUTH_CACHE = new Map();
const PVP_AUTH_PERSIST_MS = 4000;
/* Múltiplas guerras simultâneas: o cap fixo de 8 despejava a batalha mais
 * ANTIGA mesmo viva — cada tick voltava a dar parse no blob de ~5MB
 * (~35 req/s) e o CPU derretia. Só despeja entrada de batalha encerrada ou
 * sem toque há 2min; se o cache encher com batalhas vivas, cresce além do
 * cap em vez de thrashar (cada descritor ~5–10MB — o warn marca o teto). */
const PVP_AUTH_CACHE_MAX = Math.max(4, Number(process.env.PVP_AUTH_CACHE_MAX) || 32);
function pvpAuthCacheGet(instanceId) {
  const e = PVP_AUTH_CACHE.get(String(instanceId));
  if (e) e.touchedAt = Date.now();
  return e || null;
}
function pvpAuthCacheSet(instanceId, entry) {
  if (PVP_AUTH_CACHE.size >= PVP_AUTH_CACHE_MAX) {
    const now = Date.now();
    for (const [id, e] of PVP_AUTH_CACHE) {
      const dead = e && e.descriptor && e.descriptor.authority && e.descriptor.authority.ended;
      const stale = now - (Number(e && e.touchedAt) || Number(e && e.savedAt) || 0) > 120000;
      if (dead || stale) { PVP_AUTH_CACHE.delete(id); break; }
    }
    if (PVP_AUTH_CACHE.size >= PVP_AUTH_CACHE_MAX)
      console.warn("[pvp] PVP_AUTH_CACHE além do cap com batalhas vivas:", PVP_AUTH_CACHE.size);
  }
  PVP_AUTH_CACHE.set(String(instanceId), entry);
}
function pvpAuthCacheDrop(instanceId) { PVP_AUTH_CACHE.delete(String(instanceId)); }
/* Savestate global: marca todos os descritores quentes como sujos — o
 * próximo tick de cada batalha (até ~1s em batalhas vivas) commita o blob
 * inteiro no banco em vez de esperar o throttle de PVP_AUTH_PERSIST_MS. */
function pvpAuthMarkAllDirty() {
  for (const e of PVP_AUTH_CACHE.values()) if (e) e.savedAt = 0;
}
function pvpAuthCacheSweep() {
  const now = Date.now();
  for (const [id, e] of PVP_AUTH_CACHE) {
    const dead = e && e.descriptor && e.descriptor.authority && e.descriptor.authority.ended;
    // Entrada de batalha abortada por fora (row encerrada sem o engine
    // marcar ended): sem tick por 2 min, pode descartar.
    const stale = now - (Number(e && e.touchedAt) || Number(e && e.savedAt) || 0) > 120000;
    if (dead || stale) PVP_AUTH_CACHE.delete(id);
  }
}
setInterval(pvpAuthCacheSweep, 60000).unref();

/* Mutex in-process por instância quente. O tick serializava no FOR UPDATE da
 * row compartilhada: ~35 req/s de viewers segurando a lock durante o avanço
 * esgotavam o pool de 10 conexões (menus morriam em "Carregando"). O
 * descritor vivo é a única cópia autoritativa neste processo — serializar
 * aqui dispensa a lock de row; escritas externas seguem detectadas por
 * drift de `version` + CAS no persist. */
const PVP_AUTH_MUTEX = new Map();
function pvpAuthSerialize(key, fn) {
  const k = String(key);
  const prev = PVP_AUTH_MUTEX.get(k) || Promise.resolve();
  const run = prev.catch(() => {}).then(fn);
  const tail = run.then(
    () => { if (PVP_AUTH_MUTEX.get(k) === tail) PVP_AUTH_MUTEX.delete(k); },
    () => { if (PVP_AUTH_MUTEX.get(k) === tail) PVP_AUTH_MUTEX.delete(k); });
  PVP_AUTH_MUTEX.set(k, tail);
  return run;
}

/* Preset da IA na batalha: preset chamado "PVP" do personagem; senão o
 * preset ativo; senão a config atual. Só campos do Helper (whitelist) são
 * copiados — a IA não ganha nada fora do que o jogador configurou. Spells
 * de outra vocação/level/mana continuam barradas pelo engine. */
function pvpApplyBattlePreset(data) {
  if (!data || typeof data !== "object") return null;
  const list = Array.isArray(data.helperPresets) ? data.helperPresets : [];
  const preset = list.find((pr) => pr && /^pvp$/i.test(String(pr.name || "").trim())) ||
    list.find((pr) => pr && pr.id && String(pr.id) === String(data.helperActivePreset || "")) || null;
  data.config = data.config && typeof data.config === "object" ? data.config : {};
  // Combo de guerra do knight: rotação fixa de burst single-target
  // (gran ico > gran > exori, todos com min=1) — sobrepõe qualquer preset.
  const pvpKnightCombo = () => {
    if (!/knight/i.test(String(data.voc || ""))) return;
    data.config.combo = [
      { kind: "spell", id: "exori-gran-ico", min: 1 },
      { kind: "spell", id: "exori-gran", min: 1 },
      { kind: "spell", id: "exori", min: 1 },
      null, null, null];
  };
  if (!preset || !preset.config || typeof preset.config !== "object") {
    pvpKnightCombo();
    return null;
  }
  for (const k of HELPER_FIELDS) {
    if (preset.config[k] === undefined) continue;
    const v = preset.config[k];
    data.config[k] = v && typeof v === "object" ? JSON.parse(JSON.stringify(v)) : v;
  }
  data.helperActivePreset = String(preset.id);
  pvpKnightCombo();
  return String(preset.id);
}

/* Instância compartilhada PvP: cada conta só envia pose/config/target dos
 * PRÓPRIOS personagens — o cliente rival não pilota nem reconfigura chars
 * de outra conta (nem os controlados pela IA). */
function pvpFilterVisualState(auth, visual, accountId) {
  if (!auth || !auth.pvpBattle || !visual || !Array.isArray(visual.players)) return visual;
  const own = new Set((auth.players || [])
    .filter((it) => it && Number(it.accountId || (it.p && it.p.accountId)) === Number(accountId))
    .map((it) => String(it.id)));
  return Object.assign({}, visual, { players: visual.players.filter((v) => v && own.has(String(v.id))) });
}

/* Boot: batalhas 'live' sobrevivem ao restart. O timer da batalha é
 * estendido pelo tempo em que o servidor ficou fora (ninguém jogou) e o
 * cursor do worker recomeça agora — sem simular o downtime. Devolve os
 * instance_ids preservados (o boot encerra todos os demais). */
async function pvpResumeLiveOnBoot(db, now) {
  const t = Number(now) || Date.now();
  const keep = [];
  if (!db || typeof db.pvpBattlesActive !== "function" || typeof db.instanceGet !== "function") return keep;
  for (const b of (await db.pvpBattlesActive()) || []) {
    if (String(b.status) !== "live" || !b.host_account_id || !b.instance_id) continue;
    try {
      const row = await db.instanceGet(Number(b.host_account_id));
      if (!row || String(row.status) !== "active" || String(row.instance_id) !== String(b.instance_id)) continue;
      const state = StateCodec.decodeInstanceRow(row);
      const pb = state && state.authority && state.authority.pvpBattle;
      if (!pb) continue;
      const cursor = new Date(row.worker_cursor_at || row.saved_at).getTime() || t;
      const gap = Math.max(0, t - cursor);
      if (pb.endsAt && !pb.finished) pb.endsAt = Number(pb.endsAt) + gap;
      pb.resumedAt = t; pb.downtimeMs = (Number(pb.downtimeMs) || 0) + gap;
      if (typeof db.instancePvpResume === "function")
        await db.instancePvpResume(Number(b.host_account_id), String(b.instance_id), JSON.stringify(state), t);
      keep.push(String(b.instance_id));
    } catch (e) { console.error("[pvp] resume boot", b.id, e && e.message); }
  }
  return keep;
}

/* Guild com desafio ativo (pendente/aceito/preparo/ao vivo): membros não
 * podem sair nem ser expulsos (bloqueio de troca de guild). */
async function pvpGuildActiveBattle(db, guildId) {
  if (!db || typeof db.pvpBattlesActive !== "function") return null;
  const gid = Number(guildId);
  return ((await db.pvpBattlesActive()) || []).find((b) =>
    Number(b.challenger_guild_id) === gid || Number(b.challenged_guild_id) === gid) || null;
}

function createPvpController(opts) {
  opts = opts || {};
  const now = () => Date.now();
  const testServer = !!opts.testServer;
  const publishAccount = typeof opts.publishAccount === "function" ? opts.publishAccount : () => {};
  const publishAll = typeof opts.publishAll === "function" ? opts.publishAll : () => {};
  const getDb = typeof opts.getDb === "function" ? opts.getDb : () => null;
  const isOnline = typeof opts.isOnline === "function" ? opts.isOnline : () => false;
  // Test server: sem intervalo entre batalhas e com o botão de início rápido.
  const createCooldownMs = testServer ? 0 : PVP_CREATE_COOLDOWN_MS;
  const quickStartEnabled = testServer;

  const shareByAccount = new Map(); // accountId -> {battleId, ownerAccountId, instanceId, team}
  const liveByBattle = new Map();   // battleId -> {ownerAccountId, instanceId}
  let tickHandle = null;
  let _activeCache = { at: 0, rows: [] };

  function db() { return getDb && getDb(); }

  async function activeBattles(db, force) {
    const t = now();
    if (!force && t - _activeCache.at < 2000) return _activeCache.rows;
    const rows = typeof db.pvpBattlesActive === "function" ? await db.pvpBattlesActive() : [];
    _activeCache = { at: t, rows: rows || [] };
    return _activeCache.rows;
  }
  function bustCache() { _activeCache.at = 0; }

  function membersPublish(members, data) {
    for (const m of members || []) publishAccount(Number(m.account_id), "pvp", data);
  }

  async function guildMembersOf(db, guildId) {
    return typeof db.guildMembers === "function" ? await db.guildMembers(guildId) : [];
  }
  function memberRank(member) { return String(member && member.rank || "member"); }
  function canLead(member) { return ["leader", "vice"].includes(memberRank(member)); }

  function guildLevelOf(guild) {
    let byExp = 1;
    try { byExp = require("./guild").guildLevelForExp(guild.exp); } catch (e) { byExp = 1; }
    return Math.max(Number(guild.level) || 1, byExp);
  }
  function guildEligible(guild, members) {
    if (!guild) return { ok: false, error: "GUILD_NOT_FOUND" };
    if (guildLevelOf(guild) < PVP_MIN_GUILD_LEVEL)
      return { ok: false, error: "PVP_GUILD_LEVEL", msg: `Guild precisa ser nível ${PVP_MIN_GUILD_LEVEL}+.` };
    if ((members || []).length < PVP_MIN_GUILD_MEMBERS)
      return { ok: false, error: "PVP_GUILD_MEMBERS", msg: `Guild precisa de ${PVP_MIN_GUILD_MEMBERS}+ membros.` };
    return { ok: true };
  }

  function battleJson(b, guildsById) {
    const name = (id) => (guildsById && guildsById.get(Number(id)) || {}).name || "";
    const map = PVP_MAPS[b.map] || {};
    return {
      id: Number(b.id), status: String(b.status),
      map: String(b.map), mapName: map.name || b.map, mapImg: map.img || "",
      mode: map.mode || "frags",
      teamSize: Number(b.team_size), stakeType: String(b.stake_type),
      stakeAmount: Number(b.stake_amount),
      challengerGuildId: Number(b.challenger_guild_id),
      challengedGuildId: Number(b.challenged_guild_id),
      challengerName: name(b.challenger_guild_id),
      challengedName: name(b.challenged_guild_id),
      scheduledAt: Number(b.scheduled_at), preparedAt: Number(b.prepared_at) || 0,
      startedAt: Number(b.started_at) || 0, finishedAt: Number(b.finished_at) || 0,
      winnerGuildId: b.winner_guild_id ? Number(b.winner_guild_id) : null,
      draw: !!b.draw, overtime: Number(b.overtime) || 0, scores: b.scores || null,
      createdBy: Number(b.created_by), createdAt: Number(b.created_at) || 0, quick: !!Number(b.quick),
      result: b.result ? safeJson(b.result) : null,
    };
  }
  function safeJson(v) { try { return typeof v === "string" ? JSON.parse(v) : v; } catch (e) { return null; } }

  /* Criação do lobby (líder/vice). Valida elegibilidade, cooldown, uma
   * batalha ativa por guild, antecedência mínima — e debita a aposta do
   * caixa da guild desafiante dentro da transação do db. */
  async function createLobby(db, account, body) {
    body = body || {};
    const me = await db.guildMemberByAccount(account.id);
    if (!me) return { code: 403, body: { ok: false, error: "PVP_NO_GUILD", msg: "É preciso estar em uma guild." } };
    if (!canLead(me)) return { code: 403, body: { ok: false, error: "PVP_ROLE", msg: "Apenas líder ou vice-líder." } };
    const myGuild = await db.guildById(me.guild_id);
    const myMembers = await guildMembersOf(db, myGuild.id);
    const elig = guildEligible(myGuild, myMembers);
    if (!elig.ok) return { code: 400, body: { ok: false, error: elig.error, msg: elig.msg } };

    const rivalId = Number(body.rivalGuildId);
    if (!Number.isSafeInteger(rivalId) || rivalId === Number(myGuild.id))
      return { code: 400, body: { ok: false, error: "PVP_RIVAL", msg: "Guild rival inválida." } };
    const rival = await db.guildById(rivalId);
    if (!rival) return { code: 404, body: { ok: false, error: "GUILD_NOT_FOUND", msg: "Guild rival não encontrada." } };
    const rivalMembers = await guildMembersOf(db, rivalId);
    const elig2 = guildEligible(rival, rivalMembers);
    if (!elig2.ok) return { code: 400, body: { ok: false, error: elig2.error, msg: `Rival: ${elig2.msg || "inelegível"}` } };

    const map = PVP_MAPS[String(body.map || "")];
    if (!map) return { code: 400, body: { ok: false, error: "PVP_MAP", msg: "Mapa inválido." } };
    const teamSize = Number(body.teamSize);
    if (!PVP_TEAM_SIZES.includes(teamSize))
      return { code: 400, body: { ok: false, error: "PVP_TEAM_SIZE", msg: "Tamanho de equipe inválido." } };
    if (teamSize > myMembers.length || teamSize > rivalMembers.length)
      return { code: 400, body: { ok: false, error: "PVP_TEAM_SIZE_GUILD",
        msg: "Uma das guilds não tem membros suficientes para essa equipe." } };

    const stakeType = body.stakeType === "coins" ? "coins" : "gold";
    const stakeAmount = Math.floor(Number(body.stakeAmount) || 0);
    const minStake = PVP_MIN_STAKE[stakeType];
    if (!(stakeAmount >= minStake))
      return { code: 400, body: { ok: false, error: "PVP_STAKE_MIN", minStake,
        msg: stakeType === "coins" ? `Aposta mínima: ${minStake} Tibia Coins.`
          : `Aposta mínima: ${minStake.toLocaleString("pt-BR")} gold (5kk).` } };
    const t = now();
    // Início rápido (test server): sem agendamento — o convite vale 5 min e a
    // batalha começa 1 min após o aceite (o sorteio/preparo roda na hora).
    const quick = quickStartEnabled && !!body.quickStart;
    const scheduledAt = quick ? t + PVP_QUICK_INVITE_MS : Number(body.scheduledAt);
    if (!quick && (!Number.isFinite(scheduledAt) || scheduledAt < t + PVP_MIN_LEAD_MS))
      return { code: 400, body: { ok: false, error: "PVP_SCHEDULE",
        msg: `A batalha precisa ser agendada com pelo menos ${PVP_MIN_LEAD_MS / 60000} min de antecedência.` } };
    if (scheduledAt > t + 30 * 24 * 60 * 60 * 1000)
      return { code: 400, body: { ok: false, error: "PVP_SCHEDULE", msg: "Data muito distante." } };

    const last = createCooldownMs && typeof db.pvpBattleLastCreate === "function" ? await db.pvpBattleLastCreate(myGuild.id) : 0;
    if (last && t - last < createCooldownMs)
      return { code: 400, body: { ok: false, error: "PVP_COOLDOWN",
        msg: `Aguarde ${Math.ceil((createCooldownMs - (t - last)) / 60000)} min para criar outra batalha.`,
        cooldownUntil: last + createCooldownMs } };

    const charName = String(body.charName || "");
    const created = await db.pvpLobbyCreate({
      challengerGuildId: myGuild.id, challengedGuildId: rival.id, createdBy: account.id,
      map: map.id, teamSize, stakeType, stakeAmount, scheduledAt, charName, quick });
    if (!created.ok) {
      const msgs = { STAKE_LOW: "Saldo da guild insuficiente para a aposta.",
        PVP_GUILD_BUSY: "Uma das guilds já tem batalha ativa ou agendada." };
      return { code: 400, body: { ok: false, error: created.error, msg: msgs[created.error] || "Falha ao criar lobby." } };
    }
    bustCache();
    const battle = await db.pvpBattleGet(created.id);
    // Registro no calendário global (somente leitura para jogadores).
    try {
      if (typeof db.calendarAdd === "function") {
        const d = new Date(scheduledAt), pad = (n) => String(n).padStart(2, "0");
        await db.calendarAdd({ day: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
          title: `PvP: ${myGuild.name} x ${rival.name}`,
          body: `${map.name} — ${teamSize}v${teamSize} — aposta ${stakeAmount} ${stakeType === "coins" ? "TC" : "gold"} às ${pad(d.getHours())}:${pad(d.getMinutes())}`,
          icon: "pvp" });
      }
    } catch (e) { /* calendário é best-effort */ }
    const payload = battleJson(battle, new Map([[myGuild.id, myGuild], [rival.id, rival]]));
    payload.action = "invite";
    membersPublish(rivalMembers, payload);
    membersPublish(myMembers, Object.assign({}, payload, { action: "created" }));
    return { code: 200, body: { ok: true, battle: payload } };
  }

  /* Resposta do desafiado: aceitar (debita a aposta da guild) ou recusar
   * (reembolsa integral da desafiante). */
  async function respond(db, account, body) {
    body = body || {};
    const me = await db.guildMemberByAccount(account.id);
    if (!me) return { code: 403, body: { ok: false, error: "PVP_NO_GUILD" } };
    if (!canLead(me)) return { code: 403, body: { ok: false, error: "PVP_ROLE", msg: "Apenas líder ou vice-líder." } };
    const battle = await db.pvpBattleGet(Number(body.battleId));
    if (!battle || String(battle.status) !== "pending" ||
        Number(battle.challenged_guild_id) !== Number(me.guild_id))
      return { code: 404, body: { ok: false, error: "PVP_BATTLE", msg: "Convite não encontrado." } };
    const accept = body.accept === true || body.accept === "true" || body.accept === 1;
    const res = accept
      ? await db.pvpBattleAccept(battle.id, me.guild_id, String(body.charName || ""))
      : await db.pvpBattleDecline(battle.id, me.guild_id);
    if (!res.ok) return { code: 400, body: { ok: false, error: res.error,
      msg: res.error === "STAKE_LOW" ? "Saldo da guild insuficiente." : "Convite inválido." } };
    // Início rápido: começa PVP_QUICK_START_MS após o aceite (o tick sorteia
    // e prepara já).
    if (accept && Number(battle.quick))
      await db.pvpBattleUpdate(battle.id, { scheduled_at: now() + PVP_QUICK_START_MS });
    bustCache();
    const g1 = await db.guildById(battle.challenger_guild_id);
    const g2 = await db.guildById(battle.challenged_guild_id);
    const payload = battleJson(await db.pvpBattleGet(battle.id), new Map([[g1.id, g1], [g2.id, g2]]));
    payload.action = accept ? "accepted" : "declined";
    membersPublish(await guildMembersOf(db, g1.id), payload);
    membersPublish(await guildMembersOf(db, g2.id), payload);
    return { code: 200, body: { ok: true, battle: payload } };
  }

  /* Cancelamento: lobby pendente → reembolso; aceito/em preparo → desistência
   * (aposta vai ao rival, menos a taxa). Só líder/vice de qualquer guild. */
  async function cancel(db, account, body) {
    body = body || {};
    const me = await db.guildMemberByAccount(account.id);
    if (!me) return { code: 403, body: { ok: false, error: "PVP_NO_GUILD" } };
    if (!canLead(me)) return { code: 403, body: { ok: false, error: "PVP_ROLE", msg: "Apenas líder ou vice-líder." } };
    const battle = await db.pvpBattleGet(Number(body.battleId));
    if (!battle) return { code: 404, body: { ok: false, error: "PVP_BATTLE" } };
    const mine = [Number(battle.challenger_guild_id), Number(battle.challenged_guild_id)]
      .includes(Number(me.guild_id));
    if (!mine) return { code: 403, body: { ok: false, error: "PVP_GUILD" } };
    const status = String(battle.status);
    let res;
    if (status === "pending") {
      if (Number(battle.challenger_guild_id) !== Number(me.guild_id))
        return { code: 403, body: { ok: false, error: "PVP_GUILD", msg: "Só a guild desafiante cancela o convite." } };
      res = await db.pvpBattleCancel(battle.id);
    } else if (["accepted", "prep", "live"].includes(status)) {
      res = await db.pvpBattleForfeit(battle.id, me.guild_id, String(body.charName || ""));
      if (res.ok) await unbindBattle(battle);
    } else {
      return { code: 400, body: { ok: false, error: "INVALID_STATE", msg: "Batalha já encerrada." } };
    }
    if (!res.ok) return { code: 400, body: { ok: false, error: res.error } };
    bustCache();
    const g1 = await db.guildById(battle.challenger_guild_id);
    const g2 = await db.guildById(battle.challenged_guild_id);
    const payload = battleJson(await db.pvpBattleGet(battle.id), new Map([[g1.id, g1], [g2.id, g2]]));
    payload.action = status === "pending" ? "cancelled" : "forfeit";
    membersPublish(await guildMembersOf(db, g1.id), payload);
    membersPublish(await guildMembersOf(db, g2.id), payload);
    return { code: 200, body: { ok: true, battle: payload } };
  }

  /* Sorteia o roster de uma equipe: `teamSize` contas da guild embaralhadas;
   * `mustInclude` (criador do lobby) é garantido quando presente. Cada conta
   * entra com a party da conta (até PVP_PARTY_MAX_CHARS chars). */
  async function rollTeam(db, members, teamSize, mustIncludeAccountId) {
    const pool = members.slice();
    // shuffle Fisher-Yates
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1)); const tmp = pool[i]; pool[i] = pool[j]; pool[j] = tmp;
    }
    const picked = [];
    if (mustIncludeAccountId) {
      const idx = pool.findIndex((m) => Number(m.account_id) === Number(mustIncludeAccountId));
      if (idx >= 0) picked.push(pool.splice(idx, 1)[0]);
    }
    for (const m of pool) { if (picked.length >= teamSize) break; picked.push(m); }
    const roster = [];
    for (const m of picked.slice(0, teamSize)) {
      let charIds = [];
      if (typeof db.accountPartyOrderGet === "function")
        charIds = (await db.accountPartyOrderGet(m.account_id)) || [];
      if (!charIds.length && typeof db.charactersOf === "function") {
        const chars = await db.charactersOf(m.account_id);
        charIds = (chars || []).map((c) => Number(c.id));
      }
      charIds = charIds.slice(0, PVP_PARTY_MAX_CHARS).map(Number);
      roster.push({ account_id: Number(m.account_id), char_ids: charIds,
        leader: Number(m.account_id) === Number(mustIncludeAccountId),
        rank: memberRank(m), online: !!isOnline(m.account_id),
        charName: m.name || "" });
    }
    return roster;
  }

  /* T-10min: sorteia os times, grava o roster e avisa toda a guild. */
  async function prepareBattle(db, battle) {
    const members1 = await guildMembersOf(db, battle.challenger_guild_id);
    const members2 = await guildMembersOf(db, battle.challenged_guild_id);
    const teamSize = Number(battle.team_size);
    if (members1.length < teamSize || members2.length < teamSize) {
      // guild perdeu membros desde o lobby — reembolsa e cancela
      await db.pvpBattleCancel(battle.id);
      bustCache();
      const payload = battleJson(await db.pvpBattleGet(battle.id));
      payload.action = "cancelled"; payload.reason = "not-enough-members";
      membersPublish(members1, payload); membersPublish(members2, payload);
      return;
    }
    const team1 = await rollTeam(db, members1, teamSize, battle.created_by);
    // O líder da guild desafiada também é garantido: só o líder designa o
    // alvo do time, então ele precisa estar dentro da batalha.
    const leader2 = members2.find((m) => memberRank(m) === "leader");
    const team2 = await rollTeam(db, members2, teamSize, leader2 ? Number(leader2.account_id) : 0);
    await db.pvpRosterReplace(battle.id,
      team1.map((r) => Object.assign({}, r, { team: 1 }))
        .concat(team2.map((r) => Object.assign({}, r, { team: 2 }))));
    await db.pvpBattleUpdate(battle.id, { status: "prep", prepared_at: now() });
    bustCache();
    // Sorteados vão para a área de treino: hunts/bosses ativos encerram já no
    // preparo (o lock impede novas entradas até o fim da batalha).
    if (typeof opts.endAccountInstance === "function")
      for (const r of team1.concat(team2)) {
        try { await opts.endAccountInstance(Number(r.account_id), "pvp-prep"); }
        catch (e) { console.error("[pvp] prep end", r.account_id, e && e.message); }
      }
    const g1 = await db.guildById(battle.challenger_guild_id);
    const g2 = await db.guildById(battle.challenged_guild_id);
    const payload = battleJson(await db.pvpBattleGet(battle.id),
      new Map([[g1.id, g1], [g2.id, g2]]));
    payload.action = "prep";
    payload.countdownMs = Math.max(0, Number(battle.scheduled_at) - now());
    payload.roster = {
      1: team1.map((r) => ({ accountId: r.account_id, charIds: r.char_ids, online: r.online, leader: r.leader })),
      2: team2.map((r) => ({ accountId: r.account_id, charIds: r.char_ids, online: r.online, leader: r.leader })),
    };
    membersPublish(members1, payload); membersPublish(members2, payload);
    console.log("[pvp] prep battle", battle.id, g1.name, "x", g2.name,
      "roster", team1.length, "x", team2.length);
  }

  /* T-0: cria a instância compartilhada (host = criador se no roster, senão
   * 1º da equipe 1) e liga o espelhamento para todas as contas sorteadas. */
  async function startBattle(db, battle) {
    const roster = await db.pvpRosterGet(battle.id);
    if (!roster.length) { await db.pvpBattleCancel(battle.id); bustCache(); return; }
    const created = typeof opts.createSharedInstance === "function"
      ? await opts.createSharedInstance(battle, roster) : { ok: false, error: "NO_BUILDER" };
    if (!created || !created.ok) {
      console.error("[pvp] shared instance failed", battle.id, created && created.error);
      await db.pvpBattleCancel(battle.id); bustCache();
      const members1 = await guildMembersOf(db, battle.challenger_guild_id);
      const members2 = await guildMembersOf(db, battle.challenged_guild_id);
      const payload = battleJson(await db.pvpBattleGet(battle.id));
      payload.action = "cancelled"; payload.reason = "instance-failed";
      membersPublish(members1, payload); membersPublish(members2, payload);
      return;
    }
    await db.pvpBattleUpdate(battle.id, { status: "live", started_at: now(),
      host_account_id: Number(created.ownerAccountId), instance_id: String(created.instanceId) });
    bustCache();
    liveByBattle.set(Number(battle.id), {
      ownerAccountId: Number(created.ownerAccountId), instanceId: String(created.instanceId) });
    for (const r of roster) {
      shareByAccount.set(Number(r.account_id), {
        battleId: Number(battle.id), ownerAccountId: Number(created.ownerAccountId),
        instanceId: String(created.instanceId), team: Number(r.team) });
      publishAccount(Number(r.account_id), "instance", {
        id: String(created.instanceId), action: "pvp-battle-start" });
    }
    const g1 = await db.guildById(battle.challenger_guild_id);
    const g2 = await db.guildById(battle.challenged_guild_id);
    const payload = battleJson(await db.pvpBattleGet(battle.id),
      new Map([[g1.id, g1], [g2.id, g2]]));
    payload.action = "start";
    membersPublish(await guildMembersOf(db, g1.id), payload);
    membersPublish(await guildMembersOf(db, g2.id), payload);
    console.log("[pvp] battle", battle.id, "live — instance", String(created.instanceId).slice(0, 12));
  }

  async function unbindBattle(battle) {
    liveByBattle.delete(Number(battle.id));
    for (const [acc, s] of [...shareByAccount]) if (s.battleId === Number(battle.id)) shareByAccount.delete(acc);
    if (battle.host_account_id && battle.instance_id &&
        typeof opts.endSharedInstance === "function")
      await opts.endSharedInstance(Number(battle.host_account_id), "pvp-end");
  }

  /* Fim da batalha: a autoridade marca auth.pvpBattle.finished; aqui
   * consolidamos stats, pagamos o pote e as insígnias e gravamos o histórico. */
  async function finishBattle(db, battle, auth) {
    const pb = auth && auth.pvpBattle ? auth.pvpBattle : {};
    const scores = pb.scores || { 1: 0, 2: 0 };
    const finished = pb.finished || {};
    let winner = finished.winnerTeam ? Number(finished.winnerTeam) : 0;
    let draw = !!finished.draw;
    const s1 = Number(scores[1] || scores["1"]) || 0, s2 = Number(scores[2] || scores["2"]) || 0;
    if (!winner && !draw) { if (s1 > s2) winner = 1; else if (s2 > s1) winner = 2; else draw = true; }
    const winnerGuild = winner === 1 ? Number(battle.challenger_guild_id)
      : winner === 2 ? Number(battle.challenged_guild_id) : null;
    const loserGuild = winner === 1 ? Number(battle.challenged_guild_id)
      : winner === 2 ? Number(battle.challenger_guild_id) : null;
    const roster = await db.pvpRosterGet(battle.id);
    const stats = pb.stats || {};
    const statList = [];
    for (const [cid, s] of Object.entries(stats)) {
      statList.push({ charId: Number(cid), name: s.name || "", team: Number(s.team) || 0,
        accountId: Number(s.accountId) || 0, kills: Number(s.kills) || 0,
        deaths: Number(s.deaths) || 0, damage: Number(s.damage) || 0 });
    }
    const top = (key) => statList.slice().sort((a, b) => b[key] - a[key])[0] || null;
    const pot = Number(battle.stake_amount) * 2;
    const fee = Math.floor(pot * PVP_HOUSE_FEE);
    const col = battle.stake_type === "coins" ? "coins" : "balance";
    const rewards = { pot, fee, net: 0, insignias: {} };
    if (draw) { rewards.refund = Number(battle.stake_amount); }
    else if (winnerGuild) { rewards.net = pot - fee; }
    const result = {
      winnerGuild, winnerTeam: winner || null, draw,
      scores: { 1: s1, 2: s2 }, mode: (PVP_MAPS[battle.map] || {}).mode || "frags",
      overtime: Number(battle.overtime) || 0,
      participants: statList,
      roster: roster.map((r) => ({ team: r.team, accountId: r.account_id, charIds: r.char_ids })),
      mostKills: top("kills"), mostDeaths: top("deaths"), mostDamage: top("damage"),
      rewards,
    };
    // Marca 'finished' ANTES dos pagamentos: se um passo de payout falhar,
    // o tick não re-executa finishBattle e não paga o pote de novo — antes,
    // um erro entre pvpStakeCredit e pvpBattleUpdate deixava a batalha
    // 'live' e creditava o vencedor a cada segundo.
    await db.pvpBattleUpdate(battle.id, {
      status: "finished", finished_at: now(), winner_guild_id: winnerGuild,
      draw: draw ? 1 : 0, scores: `${s1}:${s2}`, result: JSON.stringify(result),
      overtime: Number(pb.overtime) || Number(battle.overtime) || 0 });
    try {
      if (draw) {
        // Reembolso integral das duas apostas (sem taxa)
        await db.pvpStakeCredit(battle.challenger_guild_id, battle.stake_type, battle.stake_amount);
        await db.pvpStakeCredit(battle.challenged_guild_id, battle.stake_type, battle.stake_amount);
      } else if (winnerGuild) {
        await db.pvpStakeCredit(winnerGuild, battle.stake_type, rewards.net);
        await db.guildLogAdd(null, { guild_id: winnerGuild, account_id: 0, char_name: "",
          category: "pvp", detail: `Vitória PvP #${battle.id} (pote ${rewards.net})`,
          gold_delta: col === "balance" ? rewards.net : 0, points_delta: 0,
          coins_delta: col === "coins" ? rewards.net : 0 });
        await db.guildLogAdd(null, { guild_id: loserGuild, account_id: 0, char_name: "",
          category: "pvp", detail: `Derrota PvP #${battle.id}`, gold_delta: 0, points_delta: 0, coins_delta: 0 });
      }
      // Insígnias PvP por conta participante
      for (const r of roster) {
        const ins = draw ? PVP_INSIGNIA_DRAW
          : (Number(r.team) === winner ? PVP_INSIGNIA_WIN : PVP_INSIGNIA_LOSE);
        rewards.insignias[r.account_id] = ins;
        try { await db.accountAddInsignias(r.account_id, ins); } catch (e) {}
      }
    } catch (e) { console.error("[pvp] battle", battle.id, "payout error", e && e.message); }
    bustCache();
    await unbindBattle(battle);
    const g1 = await db.guildById(battle.challenger_guild_id);
    const g2 = await db.guildById(battle.challenged_guild_id);
    const payload = battleJson(await db.pvpBattleGet(battle.id),
      new Map([[g1.id, g1], [g2.id, g2]]));
    payload.action = "end"; payload.result = result;
    membersPublish(await guildMembersOf(db, g1.id), payload);
    membersPublish(await guildMembersOf(db, g2.id), payload);
    console.log("[pvp] battle", battle.id, "finished", s1 + "x" + s2,
      "winner", winnerGuild || "draw", "net", rewards.net);
  }

  /* Durante 'live': lê a autoridade da instância do host — o engine mantém
   * auth.pvpBattle (scores, invasão, timer, finished). */
  /* Restart: os mapas em memória somem, mas host/instância ficam no banco.
   * Religa o espelhamento para todo o roster e avisa os clientes. */
  async function rebindLive(db, battle) {
    if (liveByBattle.has(Number(battle.id))) return liveByBattle.get(Number(battle.id));
    if (!battle.host_account_id || !battle.instance_id) return null;
    const share = { ownerAccountId: Number(battle.host_account_id), instanceId: String(battle.instance_id) };
    liveByBattle.set(Number(battle.id), share);
    for (const r of await db.pvpRosterGet(battle.id)) {
      shareByAccount.set(Number(r.account_id), { battleId: Number(battle.id),
        ownerAccountId: share.ownerAccountId, instanceId: share.instanceId, team: Number(r.team) });
      publishAccount(Number(r.account_id), "instance", { id: share.instanceId, action: "pvp-battle-resume" });
    }
    console.log("[pvp] battle", battle.id, "rebound after restart — instance", share.instanceId.slice(0, 12));
    return share;
  }

  async function syncLive(db, battle) {
    const share = await rebindLive(db, battle);
    // Cabeçalho (sem o blob ~5MB): o estado vivo vem do descritor quente.
    const instanceGet = typeof db.instanceGetHead === "function" ? db.instanceGetHead : db.instanceGet;
    const row = share && typeof instanceGet === "function" ? await instanceGet.call(db, share.ownerAccountId) : null;
    const same = !!(row && String(row.instance_id) === String(share.instanceId));
    // Descritor quente em memória: a autoridade viva — sem parse de ~5MB
    // por segundo e sem o atraso do persist diferido no row.state.
    const hot = same ? pvpAuthCacheGet(row.instance_id) : null;
    const state = hot ? hot.descriptor : (same ? StateCodec.decodeInstanceRow(row) : null);
    const auth = state && state.authority;
    const pb = auth && auth.pvpBattle;
    // O engine encerra a instância (status 'ended') ao decidir o placar:
    // o resultado gravado no estado final vale mesmo com a instância fechada.
    if (pb && pb.finished) return finishBattle(db, battle, auth);
    if (same && String(row.status) === "active") return;
    // instância morreu sem resultado → empate técnico com reembolso integral
    await db.pvpBattleUpdate(battle.id, { status: "finished", finished_at: now(),
      draw: 1, scores: "0:0", result: JSON.stringify({ aborted: true,
        rewards: { refund: Number(battle.stake_amount) } }) });
    await db.pvpStakeCredit(battle.challenger_guild_id, battle.stake_type, battle.stake_amount);
    await db.pvpStakeCredit(battle.challenged_guild_id, battle.stake_type, battle.stake_amount);
    bustCache(); await unbindBattle(battle);
    const g1 = await db.guildById(battle.challenger_guild_id);
    const g2 = await db.guildById(battle.challenged_guild_id);
    const payload = battleJson(await db.pvpBattleGet(battle.id), new Map([[g1.id, g1], [g2.id, g2]]));
    payload.action = "end"; payload.reason = "instance-lost";
    membersPublish(await guildMembersOf(db, g1.id), payload);
    membersPublish(await guildMembersOf(db, g2.id), payload);
  }

  /* Ticks serializados: o intervalo de 1s e o aviso do worker (onClaim)
   * nunca processam a mesma batalha em paralelo (sem pagamento duplo). */
  let tickRunning = null, tickAgain = false;
  function tick() {
    if (tickRunning) { tickAgain = true; return tickRunning; }
    tickRunning = (async () => {
      try { do { tickAgain = false; await tickOnce(); } while (tickAgain); }
      finally { tickRunning = null; }
    })();
    return tickRunning;
  }

  async function tickOnce() {
    const d = db(); if (!d) return;
    const t = now();
    const rows = await activeBattles(d, true);
    for (const battle of rows) {
      try {
        const status = String(battle.status);
        if (status === "pending") {
          // convite nunca aceito até o horário → expira com reembolso
          if (t >= Number(battle.scheduled_at) + PVP_INVITE_EXPIRE_GRACE_MS) {
            const res = await d.pvpBattleDecline(battle.id, battle.challenged_guild_id);
            if (res.ok) {
              bustCache();
              const g1 = await d.guildById(battle.challenger_guild_id);
              const g2 = await d.guildById(battle.challenged_guild_id);
              const payload = battleJson(await d.pvpBattleGet(battle.id),
                new Map([[g1.id, g1], [g2.id, g2]]));
              payload.action = "expired";
              membersPublish(await guildMembersOf(d, g1.id), payload);
              membersPublish(await guildMembersOf(d, g2.id), payload);
            }
          }
        } else if (status === "accepted") {
          if (t >= Number(battle.scheduled_at) - PVP_PREP_MS) await prepareBattle(d, battle);
        } else if (status === "prep") {
          if (t >= Number(battle.scheduled_at)) await startBattle(d, battle);
        } else if (status === "live") {
          await syncLive(d, battle);
        }
      } catch (e) { console.error("[pvp] tick battle", battle.id, e && e.message); }
    }
  }

  /* ---------------- estado público ---------------- */
  async function rivalsList(db, account) {
    const me = await db.guildMemberByAccount(account.id);
    if (!me) return [];
    const all = typeof db.guildList === "function" ? await db.guildList() : [];
    const busy = new Set();
    for (const b of await activeBattles(db)) {
      busy.add(Number(b.challenger_guild_id)); busy.add(Number(b.challenged_guild_id));
    }
    const out = [];
    for (const g of all) {
      if (Number(g.id) === Number(me.guild_id)) continue;
      const members = await guildMembersOf(db, g.id);
      const elig = guildEligible(g, members);
      out.push({ id: Number(g.id), name: g.name, level: guildLevelOf(g),
        members: members.length, icon: Number(g.icon) || 1,
        eligible: elig.ok, reason: elig.ok ? null : elig.error, busy: busy.has(Number(g.id)) });
    }
    return out.sort((a, b) => b.eligible - a.eligible || b.level - a.level || a.name.localeCompare(b.name));
  }

  async function stateFor(db, account) {
    const me = await db.guildMemberByAccount(account.id);
    const base = { ok: true, inGuild: !!me, role: me ? memberRank(me) : null,
      canLead: me ? canLead(me) : false, maps: Object.values(PVP_MAPS).map((m) =>
        ({ id: m.id, name: m.name, img: m.img, mode: m.mode,
           fragTarget: m.fragTarget || 0, pz: !!m.pz })),
      arenas: pvpClientArenas(),
      teamSizes: PVP_TEAM_SIZES, houseFeePct: Math.round(PVP_HOUSE_FEE * 100),
      minLeadMs: PVP_MIN_LEAD_MS, createCooldownMs, minStake: PVP_MIN_STAKE, quickStart: quickStartEnabled, quickStartMs: PVP_QUICK_START_MS,
      battleMs: PVP_BATTLE_MS,
      now: now(), battle: null, invites: [], upcoming: [], history: [], rivals: [],
      calendar: [], myHistory: [], accountId: Number(account.id),
      eligible: false, reason: null, cooldownUntil: 0 };
    if (!me) return base;
    const guild = await db.guildById(me.guild_id);
    const members = await guildMembersOf(db, me.guild_id);
    const elig = guildEligible(guild, members);
    base.guild = { id: Number(guild.id), name: guild.name, level: guildLevelOf(guild),
      members: members.length, icon: Number(guild.icon) || 1,
      balance: Number(guild.balance) || 0, coins: Number(guild.coins) || 0 };
    base.eligible = elig.ok; base.reason = elig.ok ? null : (elig.msg || elig.error);
    const last = typeof db.pvpBattleLastCreate === "function" ? await db.pvpBattleLastCreate(me.guild_id) : 0;
    if (createCooldownMs && last && now() - last < createCooldownMs) base.cooldownUntil = last + createCooldownMs;
    const gids = new Map([[Number(guild.id), guild]]);
    const history = typeof db.pvpBattlesForGuild === "function" ? await db.pvpBattlesForGuild(me.guild_id, 50) : [];
    for (const b of history) {
      for (const gid of [b.challenger_guild_id, b.challenged_guild_id])
        if (!gids.has(Number(gid))) { const g = await db.guildById(gid); if (g) gids.set(Number(gid), g); }
      const j = battleJson(b, gids);
      // Calendário: partidas futuras e anteriores (todas as situações).
      base.calendar.push({ id: j.id, status: j.status, scheduledAt: j.scheduledAt,
        mapName: j.mapName, teamSize: j.teamSize, challengerName: j.challengerName,
        challengedName: j.challengedName, challengerGuildId: j.challengerGuildId,
        winnerGuildId: j.winnerGuildId, draw: j.draw, scores: j.scores });
      if (["pending", "accepted", "prep", "live"].includes(j.status)) {
        j.roster = await rosterPublic(db, b.id);
        if (j.status === "pending" && Number(b.challenged_guild_id) === Number(me.guild_id))
          base.invites.push(j);
        else base.battle = base.battle || j, base.upcoming.push(j);
      } else if (j.status === "finished") {
        base.history.push(j);
      }
    }
    base.myHistory = await accountHistory(db, account.id, gids);
    base.rivals = await rivalsList(db, account);
    return base;
  }

  /* Histórico individual: batalhas da conta (qualquer guild) com o
   * desempenho somado dos personagens dela. */
  async function accountHistory(db, accountId, gids) {
    if (typeof db.pvpBattlesForAccount !== "function") return [];
    const out = [];
    for (const b of (await db.pvpBattlesForAccount(accountId, 30)) || []) {
      for (const gid of [b.challenger_guild_id, b.challenged_guild_id])
        if (!gids.has(Number(gid))) { const g = await db.guildById(gid); if (g) gids.set(Number(gid), g); }
      const j = battleJson(b, gids), res = j.result || {};
      const mine = (res.participants || []).filter((p) => Number(p.accountId) === Number(accountId));
      const rosterRow = (res.roster || []).find((r) => Number(r.accountId) === Number(accountId));
      const team = rosterRow ? Number(rosterRow.team) : (mine[0] ? Number(mine[0].team) : 0);
      out.push({ id: j.id, scheduledAt: j.scheduledAt, finishedAt: j.finishedAt, mapName: j.mapName,
        challengerName: j.challengerName, challengedName: j.challengedName, team,
        outcome: j.draw ? "draw" : (res.winnerTeam && team ? (Number(res.winnerTeam) === team ? "win" : "loss") : "—"),
        kills: mine.reduce((s, p) => s + (Number(p.kills) || 0), 0),
        deaths: mine.reduce((s, p) => s + (Number(p.deaths) || 0), 0),
        damage: mine.reduce((s, p) => s + (Number(p.damage) || 0), 0),
        insignias: Number(res.rewards && res.rewards.insignias && res.rewards.insignias[accountId]) || 0,
        chars: mine.map((p) => p.name) });
    }
    return out;
  }

  async function rosterPublic(db, battleId) {
    if (typeof db.pvpRosterGet !== "function") return null;
    const rows = await db.pvpRosterGet(battleId);
    if (!rows.length) return null;
    const out = { 1: [], 2: [] };
    for (const r of rows) {
      const chars = [];
      for (const cid of r.char_ids) {
        const c = typeof db.findCharacter === "function" ? await db.findCharacter(cid) : null;
        if (c) chars.push({ id: Number(c.id), name: c.name, voc: c.voc, level: Number(c.level) || 1 });
      }
      (out[r.team] || (out[r.team] = [])).push({
        accountId: r.account_id, leader: !!r.leader, online: !!r.online, chars });
    }
    return out;
  }

  async function battleDetail(db, account, battleId) {
    const me = await db.guildMemberByAccount(account.id);
    if (!me) return { code: 403, body: { ok: false, error: "PVP_NO_GUILD" } };
    const battle = await db.pvpBattleGet(Number(battleId));
    if (!battle) return { code: 404, body: { ok: false, error: "PVP_BATTLE" } };
    const involved = [Number(battle.challenger_guild_id), Number(battle.challenged_guild_id)]
      .includes(Number(me.guild_id));
    const g1 = await db.guildById(battle.challenger_guild_id);
    const g2 = await db.guildById(battle.challenged_guild_id);
    const j = battleJson(battle, new Map([[g1.id, g1], [g2.id, g2]]));
    j.roster = await rosterPublic(db, battle.id);
    j.mine = involved ? (Number(battle.challenger_guild_id) === Number(me.guild_id) ? 1 : 2) : 0;
    if (String(battle.status) === "live") {
      const share = liveByBattle.get(Number(battle.id));
      if (share) {
        // Descritor quente primeiro — evita parsear ~5MB por consulta.
        const hot = pvpAuthCacheGet(share.instanceId);
        let state = hot ? hot.descriptor : null;
        if (!state && typeof db.instanceGet === "function") {
          const row = await db.instanceGet(share.ownerAccountId);
          state = row ? StateCodec.decodeInstanceRow(row) : null;
        }
        const pb = state && state.authority && state.authority.pvpBattle;
        if (pb) j.live = { scores: pb.scores || null, endsAt: pb.endsAt || 0,
          overtime: Number(pb.overtime) || 0 };
      }
    }
    return { code: 200, body: { ok: true, battle: j } };
  }

  function sharedForAccount(accountId) {
    return shareByAccount.get(Number(accountId)) || null;
  }

  /* Conta travada no preparo/batalha (bloqueia hunts/bosses/quests). */
  async function lockedAccount(db, accountId) {
    /* Múltiplas guerras: uma query JOIN no lugar de 1+N pvpRosterGet por
     * request (o lock é consultado em todo start de instância). */
    if (typeof db.pvpLockedBattleForAccount === "function") {
      const hit = await db.pvpLockedBattleForAccount(accountId);
      return hit ? { battleId: Number(hit.battle_id), status: String(hit.status) } : null;
    }
    const rows = await activeBattles(db);
    for (const b of rows) {
      if (!["prep", "live"].includes(String(b.status))) continue;
      if (typeof db.pvpRosterGet !== "function") continue;
      const roster = await db.pvpRosterGet(b.id);
      if (roster.some((r) => Number(r.account_id) === Number(accountId)))
        return { battleId: Number(b.id), status: String(b.status) };
    }
    return null;
  }

  async function battleForAccount(db, accountId) {
    const me = await db.guildMemberByAccount(accountId);
    if (!me) return null;
    const rows = await activeBattles(db);
    for (const b of rows) {
      if (!["accepted", "prep", "live"].includes(String(b.status))) continue;
      if ([Number(b.challenger_guild_id), Number(b.challenged_guild_id)].includes(Number(me.guild_id)))
        return b;
    }
    return null;
  }

  function start() {
    if (tickHandle) return;
    tickHandle = setInterval(() => { tick().catch((e) => console.error("[pvp] tick", e)); }, 1000);
    if (tickHandle.unref) tickHandle.unref();
    console.log("[pvp] started", { testServer });
  }
  function stop() { if (tickHandle) clearInterval(tickHandle); tickHandle = null; }

  return {
    start, stop, tick, rebindLive, stateFor, battleDetail, createLobby, respond, cancel,
    sharedForAccount, getShare: sharedForAccount, liveByBattle,
    lockedAccount, battleForAccount, PVP_MAPS, PVP_TEAM_SIZES,
    PVP_MIN_GUILD_MEMBERS, PVP_MIN_GUILD_LEVEL, PVP_MIN_LEAD_MS,
    PVP_PREP_MS, PVP_CREATE_COOLDOWN_MS, PVP_HOUSE_FEE, PVP_BATTLE_MS,
    PVP_INSIGNIA_WIN, PVP_INSIGNIA_LOSE, PVP_INSIGNIA_DRAW,
    pvpMapLocal, pvpRectCenter,
  };
}

module.exports = {
  createPvpController, PVP_MAPS, PVP_TEAM_SIZES, PVP_MIN_GUILD_MEMBERS,
  PVP_MIN_GUILD_LEVEL, PVP_MIN_LEAD_MS, PVP_PREP_MS, PVP_CREATE_COOLDOWN_MS,
  PVP_HOUSE_FEE, PVP_BATTLE_MS, PVP_PARTY_MAX_CHARS, PVP_MIN_STAKE,
  pvpMapLocal, pvpRectCenter, pvpApplyBattlePreset, pvpFilterVisualState,
  pvpResumeLiveOnBoot, pvpGuildActiveBattle, pvpClientArenas,
  pvpAuthCacheGet, pvpAuthCacheSet, pvpAuthCacheDrop, pvpAuthSerialize, PVP_AUTH_PERSIST_MS,
  pvpAuthMarkAllDirty,
};
