/*
 * cyclopedia.js — Cyclopedia no molde Canary / OTC
 *
 * Bestiário, Bosstiário, Charms (runas com assign por raça) e dados de
 * progressão. Ícones das runas: sprite sheet OTC monster-bonus-effects.png
 * (32×32 por id, igual ao game_cyclopedia/tab/charms).
 */
"use strict";

const CYCLO_ABAS = [
  { id: "bestiary", nome: "Bestiário", icone: "bestiary", pronta: true },
  { id: "bosstiary", nome: "Bosstiário", icone: "bosstiary", pronta: true },
  { id: "charms", nome: "Charms", icone: "charms", pronta: true },
  { id: "hunts", nome: "Hunts", icone: "map", pronta: true },
  { id: "items", nome: "Itens", icone: "items", pronta: true },
  { id: "houses", nome: "Casas", icone: "houses", pronta: false,
    falta: "Não existe sistema de casas, aluguel nem mobília." },
  { id: "bossSlot", nome: "Boss Slots", icone: "bossSlot", pronta: false,
    falta: "Depende do Bosstiário com dezenas de bosses e pontos de " +
           "bosstiary; hoje só existe 1 boss no jogo." },
  { id: "magicalArchives", nome: "Arquivos Mágicos", icone: "magical",
    pronta: false,
    falta: "Wheel of Destiny já tem UI própria; arquivos mágicos do " +
           "cliente ainda não foram espelhados aqui." },
  /* Grupo CIDADE: atalhos dos serviços do templo (market/depot/etc.). */
  { id: "cidade", nome: "CIDADE", secao: true },
  { id: "city-market", nome: "MARKET", pronta: true, cityAction: "market",
    iconSrc: "assets/ui/market/market.png" },
  { id: "city-reward", nome: "REWARD", pronta: true, cityAction: "reward",
    iconSrc: "assets/item/reward-chest.png" },
  { id: "city-forge", nome: "FORJE", pronta: true, cityAction: "forge",
    iconSrc: "assets/item/exalted-core.gif" },
  { id: "city-depot", nome: "DEPOT", pronta: true, cityAction: "depot",
    iconSrc: "assets/item/depot-item-3497.png" },
  { id: "city-imbuements", nome: "IMBUEMENTS", pronta: true,
    cityAction: "imbuements", iconSrc: "assets/ui/imbuement-machine.png" },
  { id: "city-enpa", nome: "ENPA", pronta: true, cityAction: "enpa",
    iconSrc: "assets/npc/enpa-deia-pema_s.png" },
  { id: "city-gnomally", nome: "GNOMALLY", pronta: true,
    cityAction: "gnomally", iconSrc: "assets/npc/gnomally_s.png" },
  { id: "city-tibianus", nome: "TIBIANUS", pronta: true,
    cityAction: "tibianus", iconSrc: "assets/npc/king-tibianus_s.png" },
];

const BEST_CLASSES = {
  mammal: "Mamíferos", reptile: "Répteis", amphibic: "Anfíbios",
  bird: "Aves", vermin: "Vermes", undead: "Mortos-vivos",
  humanoid: "Humanoides", human: "Humanos", giant: "Gigantes",
  demon: "Demônios", dragon: "Dragões", elemental: "Elementais",
  construct: "Constructos", plant: "Plantas", aquatic: "Aquáticos",
  slime: "Slimes", magical: "Mágicos", extra: "Outros",
};

const BEST_ESTAGIOS = [
  { nome: "Descoberto", kills: 1, revela: ["hp", "exp"] },
  { nome: "Iniciado", kills: 25, revela: ["dano", "armadura", "loot"] },
  { nome: "Experiente", kills: 100, revela: ["resistencias", "velocidade"] },
  { nome: "Completo", kills: 250, revela: ["tudo"] },
];

function bestiaryMarcos(slug) {
  const m = (typeof GAMEDATA !== "undefined" && GAMEDATA.monsters)
    ? GAMEDATA.monsters[slug] : null;
  const b = m && m.best;
  if (!b || !b.toKill) return BEST_ESTAGIOS.map((e) => e.kills);
  const total = b.toKill;
  const u1 = Math.max(1, Math.min(b.u1 || Math.ceil(total / 10), total));
  const u2 = Math.max(u1, Math.min(b.u2 || Math.ceil(total / 2), total));
  return [1, u1, u2, total];
}

function bestiaryCharms(slug) {
  const m = (typeof GAMEDATA !== "undefined" && GAMEDATA.monsters)
    ? GAMEDATA.monsters[slug] : null;
  const total = (m && m.best && m.best.charm) || 25;
  return [0, Math.round(total * 0.2), Math.round(total * 0.4), total];
}

const BEST_CHARM_POINTS = [0, 5, 15, 25];

/* Charms Canary (tier 1): custo = points[0], chance = chance[0].
 * `sprite` = índice no sheet OTC monster-bonus-effects.png (32px). */
const CHARMS = {
  wound: {
    nome: "Wound", sprite: 0, cat: "major", tipo: "ofensivo",
    elemento: "physical", percent: 5, chance: 5, custo: 240,
    desc: "Chance de causar 5% da vida máxima do alvo como dano físico.",
  },
  enflame: {
    nome: "Enflame", sprite: 1, cat: "major", tipo: "ofensivo",
    elemento: "fire", percent: 5, chance: 5, custo: 400,
    desc: "Chance de causar 5% da vida máxima do alvo como dano de fogo.",
  },
  poison: {
    nome: "Poison", sprite: 2, cat: "major", tipo: "ofensivo",
    elemento: "earth", percent: 5, chance: 5, custo: 240,
    desc: "Chance de causar 5% da vida máxima do alvo como dano de terra.",
  },
  freeze: {
    nome: "Freeze", sprite: 3, cat: "major", tipo: "ofensivo",
    elemento: "ice", percent: 5, chance: 5, custo: 320,
    desc: "Chance de causar 5% da vida máxima do alvo como dano de gelo.",
  },
  zap: {
    nome: "Zap", sprite: 4, cat: "major", tipo: "ofensivo",
    elemento: "energy", percent: 5, chance: 5, custo: 320,
    desc: "Chance de causar 5% da vida máxima do alvo como dano de energia.",
  },
  curse: {
    nome: "Curse", sprite: 5, cat: "major", tipo: "ofensivo",
    elemento: "death", percent: 5, chance: 5, custo: 360,
    desc: "Chance de causar 5% da vida máxima do alvo como dano de morte.",
  },
  cripple: {
    nome: "Cripple", sprite: 6, cat: "minor", tipo: "ofensivo",
    chance: 6, custo: 100,
    desc: "Chance de paralisar a criatura por alguns segundos.",
  },
  parry: {
    nome: "Parry", sprite: 7, cat: "major", tipo: "defesa",
    chance: 5, custo: 400,
    desc: "Chance de refletir o dano recebido dessa criatura.",
  },
  dodge: {
    nome: "Dodge", sprite: 8, cat: "major", tipo: "defesa",
    chance: 5, custo: 240,
    desc: "Chance de esquivar por completo um ataque dessa criatura.",
  },
  adrenaline: {
    nome: "Adrenaline Burst", sprite: 9, cat: "minor", tipo: "defesa",
    chance: 6, custo: 100,
    desc: "Chance de ganhar haste ao ser atingido por essa criatura.",
  },
  numb: {
    nome: "Numb", sprite: 10, cat: "minor", tipo: "defesa",
    chance: 6, custo: 100,
    desc: "Chance de paralisar a criatura após ela te atacar.",
  },
  cleanse: {
    nome: "Cleanse", sprite: 11, cat: "minor", tipo: "defesa",
    chance: 6, custo: 100,
    desc: "Chance de remover uma condição negativa ao ser atingido.",
  },
  bless: {
    nome: "Bless", sprite: 12, cat: "minor", tipo: "passivo",
    percent: 10, custo: 100,
    desc: "Reduz perda de skill/XP em 10% se essa criatura te matar.",
  },
  scavenge: {
    nome: "Scavenge", sprite: 13, cat: "minor", tipo: "passivo",
    chance: 60, custo: 100,
    desc: "Melhora a chance de skin/dust (quando aplicável).",
  },
  gut: {
    nome: "Gut", sprite: 14, cat: "minor", tipo: "passivo",
    percent: 20, custo: 100,
    desc: "+20% de creature products no loot dessa raça.",
  },
  lowblow: {
    nome: "Low Blow", sprite: 15, cat: "major", tipo: "passivo",
    chance: 4, custo: 800,
    desc: "+4% de chance crítica contra a criatura (tier 1).",
  },
  divine: {
    nome: "Divine Wrath", sprite: 16, cat: "major", tipo: "ofensivo",
    elemento: "holy", percent: 5, chance: 5, custo: 600,
    desc: "Chance de causar 5% da vida máxima do alvo como dano sagrado.",
  },
  vampiric: {
    nome: "Vampiric Embrace", sprite: 17, cat: "minor", tipo: "passivo",
    chance: 1.6, custo: 100,
    desc: "+1.6% life leech contra a criatura (se já houver leech).",
  },
  voidcall: {
    nome: "Void's Call", sprite: 18, cat: "minor", tipo: "passivo",
    chance: 0.8, custo: 100,
    desc: "+0.8% mana leech contra a criatura (se já houver leech).",
  },
  savage: {
    nome: "Savage Blow", sprite: 19, cat: "major", tipo: "passivo",
    chance: 20, custo: 800,
    desc: "+20% de dano crítico extra contra a criatura (tier 1).",
  },
  fatal: {
    nome: "Fatal Hold", sprite: 20, cat: "minor", tipo: "passivo",
    chance: 30, custo: 100,
    desc: "Impede fuga por vida baixa por 30s (quando aplicável).",
  },
  voidinversion: {
    nome: "Void Inversion", sprite: 21, cat: "minor", tipo: "passivo",
    chance: 20, custo: 100,
    desc: "Chance de ganhar mana em vez de perder sob mana drain.",
  },
  carnage: {
    nome: "Carnage", sprite: 22, cat: "major", tipo: "ofensivo",
    percent: 15, chance: 10, custo: 600,
    desc: "Ao matar, chance de ferir vizinhos (aproximado no idle).",
  },
  overpower: {
    nome: "Overpower", sprite: 23, cat: "major", tipo: "ofensivo",
    elemento: "physical", percent: 5, chance: 5, custo: 600,
    desc: "Chance de dano físico baseado na sua vida máxima.",
  },
  overflux: {
    nome: "Overflux", sprite: 24, cat: "major", tipo: "ofensivo",
    elemento: "physical", percent: 2.5, chance: 5, custo: 600,
    desc: "Chance de dano físico baseado na sua mana máxima.",
  },
};

function charmIconHtml(id, size) {
  const c = CHARMS[id];
  const s = size || 32;
  const idx = c ? c.sprite : 0;
  const scale = s / 32;
  return `<span class="charm-rune-icon" style="width:${s}px;height:${s}px;` +
    `background-image:url('assets/ui/cyclopedia/charms/monster-bonus-effects.png');` +
    `background-position:-${idx * 32 * scale}px 0;background-size:${800 * scale}px ${s}px"></span>`;
}

/* Converte mapa de charms legado (array, nome capitalizado, props em Array)
 * para o formato canônico { [charmId]: true }. Arrays com props nomeadas
 * perdem o unlock no JSON.stringify — por isso normalizamos sempre para
 * Object puro antes de salvar/ler. */
/* Tiers oficiais (WU 2024): custo do próximo estágio e efeito por estágio.
 * `custo`/`chance`/`percent` escalares da CHARMS = tier 1 (compat). */
const CHARM_TIERS = {
  wound:        { cost: [240, 360, 1200], chance: [5, 10, 11] },
  enflame:      { cost: [400, 600, 2000], chance: [5, 10, 11] },
  poison:       { cost: [240, 360, 1200], chance: [5, 10, 11] },
  freeze:       { cost: [320, 480, 1600], chance: [5, 10, 11] },
  zap:          { cost: [320, 480, 1600], chance: [5, 10, 11] },
  curse:        { cost: [360, 540, 1800], chance: [5, 10, 11] },
  cripple:      { cost: [100, 150, 225],  chance: [6, 9, 12] },
  parry:        { cost: [400, 600, 2000], chance: [5, 10, 11] },
  dodge:        { cost: [240, 360, 1200], chance: [5, 10, 11] },
  adrenaline:   { cost: [100, 150, 225],  chance: [6, 9, 12] },
  numb:         { cost: [100, 150, 225],  chance: [6, 9, 12] },
  cleanse:      { cost: [100, 150, 225],  chance: [6, 9, 12] },
  bless:        { cost: [100, 150, 225],  percent: [6, 9, 12] },
  scavenge:     { cost: [100, 150, 225],  chance: [60, 90, 120] },
  gut:          { cost: [100, 150, 225],  percent: [6, 9, 12] },
  lowblow:      { cost: [800, 1200, 4000], chance: [4, 8, 9] },
  divine:       { cost: [600, 900, 3000], chance: [5, 10, 11] },
  vampiric:     { cost: [100, 150, 225],  chance: [1.6, 2.4, 3.2] },
  voidcall:     { cost: [100, 150, 225],  chance: [0.8, 1.2, 1.6] },
  savage:       { cost: [800, 1200, 4000], chance: [20, 40, 44] },
  fatal:        { cost: [100, 150, 225],  chance: [30, 45, 60] },
  voidinversion:{ cost: [100, 150, 225],  chance: [20, 30, 40] },
  carnage:      { cost: [600, 900, 3000], chance: [10, 20, 22] },
  overpower:    { cost: [600, 900, 3000], chance: [5, 10, 11] },
  overflux:     { cost: [600, 900, 3000], chance: [5, 10, 11] },
};

/* Estágio do charm (1-3). `p.charms[id]` guarda o tier desde a migração —
 * `true` legado = 1. */
function charmTier(p, id) {
  const cid = resolveCharmId(id);
  const v = cid && p && p.charms ? p.charms[cid] : 0;
  if (!v) return 0;
  const n = Math.floor(Number(v));
  return Math.min(3, Math.max(1, Number.isFinite(n) ? n : 1));
}
/* Valor do efeito (chance/percent) no estágio — sem array usa o escalar. */
function charmFx(id, key, tier) {
  const cid = resolveCharmId(id);
  const c = cid && CHARMS[cid];
  if (!c) return 0;
  const t = Math.min(3, Math.max(1, tier || 1));
  const arr = (CHARM_TIERS[cid] || {})[key];
  if (Array.isArray(arr)) return arr[t - 1];
  return Number(c[key]) || 0;
}
/* Custo do estágio (1 = desbloqueio; 2/3 = melhoria). */
function charmCostAt(id, tier) {
  const cid = resolveCharmId(id);
  const c = cid && CHARMS[cid];
  if (!c) return 0;
  const t = Math.min(3, Math.max(1, tier || 1));
  const arr = (CHARM_TIERS[cid] || {}).cost;
  if (Array.isArray(arr)) return arr[t - 1];
  return t === 1 ? (Number(c.custo) || 0) : (Number(c.custo) || 0) * 2;
}

function normalizeCharmUnlockMap(raw) {
  const out = {};
  if (!raw) return out;
  const put = (key, val) => {
    if (!key) return;
    const tier = Math.min(3, Math.max(1, Math.floor(Number(val)) || 1));
    const s = String(key).trim();
    if (!s) return;
    if (CHARMS[s]) { out[s] = Math.max(out[s] || 0, tier); return; }
    const low = s.toLowerCase();
    if (CHARMS[low]) { out[low] = Math.max(out[low] || 0, tier); return; }
    for (const id of Object.keys(CHARMS)) {
      if ((CHARMS[id].nome || "").toLowerCase() === low) { out[id] = Math.max(out[id] || 0, tier); return; }
    }
  };
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (typeof item === "string") put(item);
      else if (item && typeof item === "object") put(item.id || item.slug || item.nome, item.tier);
    }
    /* props nomeadas em Array (ex.: arr.enflame = true) não serializam */
    for (const key of Object.keys(raw)) {
      if (/^\d+$/.test(key)) continue;
      if (raw[key]) put(key, raw[key]);
    }
    return out;
  }
  if (typeof raw !== "object") return out;
  for (const key of Object.keys(raw)) {
    const v = raw[key];
    if (!v) continue;
    if (v === true || v === "true") put(key, 1);
    else if (typeof v === "number" && Number.isFinite(v)) put(key, v);
    else if (typeof v === "string") { put(key); put(v); }
    else put(key);
  }
  return out;
}

function normalizeCharmRaceMap(raw) {
  const out = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const key of Object.keys(raw)) {
    const slug = raw[key];
    if (!slug || typeof slug !== "string") continue;
    let id = key;
    if (!CHARMS[id]) {
      const low = String(key).toLowerCase();
      if (CHARMS[low]) id = low;
      else {
        const found = Object.keys(CHARMS).find((c) =>
          (CHARMS[c].nome || "").toLowerCase() === low);
        if (found) id = found; else continue;
      }
    }
    out[id] = slug;
  }
  return out;
}

function ensureCyclopedia(p) {
  if (!p || typeof p !== "object") return p;
  if (!p.bestiary || typeof p.bestiary !== "object" || Array.isArray(p.bestiary))
    p.bestiary = {};
  // p.charms pode ser um ACCESSOR da conta (bindAccountCharms) — só
  // reatribuir se mudou, senão cada ensure grava localStorage à toa.
  const curMap = p.charms;
  const normMap = normalizeCharmUnlockMap(curMap);
  const dirtyMap = !curMap || typeof curMap !== "object" || Array.isArray(curMap);
  const curKeys = !dirtyMap ? Object.keys(curMap).filter((k) => curMap[k]) : [];
  if (dirtyMap || curKeys.length !== Object.keys(normMap).length
      || curKeys.some((k) => !normMap[k])) p.charms = normMap;
  p.charmRace = normalizeCharmRaceMap(p.charmRace);
  // charmPoints também é accessor da conta — só escreve se sanitizar algo.
  const ptsNow = Number(p.charmPoints);
  if (p.charmPoints === undefined || p.charmPoints === null
      || !Number.isFinite(ptsNow) || ptsNow < 0)
    p.charmPoints = Math.max(0, Math.floor(ptsNow) || 0);
  if (!p.charmsPagos || typeof p.charmsPagos !== "object" || Array.isArray(p.charmsPagos))
    p.charmsPagos = {};
  return p;
}

function resolveCharmId(raw) {
  if (raw == null || raw === "") return null;
  const s = String(raw).trim();
  if (!s) return null;
  if (CHARMS[s]) return s;
  const low = s.toLowerCase();
  if (CHARMS[low]) return low;
  for (const id of Object.keys(CHARMS)) {
    if ((CHARMS[id].nome || "").toLowerCase() === low) return id;
  }
  return null;
}

function bestiaryKill(p, slug, n) {
  ensureCyclopedia(p);
  const bestRate = (typeof SERVER_BESTIARY_RATE !== "undefined") ? SERVER_BESTIARY_RATE : 1;
  const kills = Math.floor((n || 1) * bestRate);
  const antes = p.bestiary[slug] || 0;
  const depois = antes + kills;
  p.bestiary[slug] = depois;
  const marcos = bestiaryMarcos(slug);
  const pontos = bestiaryCharms(slug);
  let ganhos = 0;
  for (let i = 0; i < marcos.length; i++) {
    const chave = slug + ":" + i;
    if (depois >= marcos[i] && !p.charmsPagos[chave]) {
      p.charmsPagos[chave] = 1;
      ganhos += pontos[i];
    }
  }
  if (ganhos) p.charmPoints += ganhos;
  return ganhos;
}

function bestiaryStage(p, slug) {
  ensureCyclopedia(p);
  const k = p.bestiary[slug] || 0;
  const marcos = bestiaryMarcos(slug);
  let st = 0;
  for (let i = 0; i < marcos.length; i++) {
    if (k >= marcos[i]) st = i + 1;
  }
  return st;
}

function bestiaryProgress(p, slug) {
  ensureCyclopedia(p);
  const kills = p.bestiary[slug] || 0;
  const marcos = bestiaryMarcos(slug);
  const st = bestiaryStage(p, slug);
  const completo = st >= marcos.length;
  const alvo = completo ? marcos[marcos.length - 1] : marcos[st];
  return {
    kills: kills, estagio: st, alvo: alvo,
    total: marcos[marcos.length - 1],
    nome: st === 0 ? "Desconhecido" : BEST_ESTAGIOS[st - 1].nome,
    completo: completo,
    pct: Math.min(1, kills / Math.max(1, alvo)),
  };
}

function bestiaryReveals(p, slug, campo) {
  const st = bestiaryStage(p, slug);
  if (st >= BEST_ESTAGIOS.length) return true;
  for (let i = 0; i < st; i++) {
    const r = BEST_ESTAGIOS[i].revela;
    if (r.indexOf("tudo") !== -1 || r.indexOf(campo) !== -1) return true;
  }
  return false;
}

/* Slugs de criaturas realmente enfrentáveis no jogo: monstros das hunts
 * ativas (o modal HUNTS e as salas de boss registradas como hunt — defs
 * `comingSoon` ficam de fora) e das quests de waves. O bestiário e o
 * bosstiário listam SÓ estes: o catálogo Canary fundido tem ~1650 fichas,
 * mas centenas de criaturas não existem no jogo. */
function activeMonsterSlugs() {
  const set = new Set();
  if (typeof GAMEDATA !== "undefined" && GAMEDATA.hunts) {
    for (const id in GAMEDATA.hunts) {
      const h = GAMEDATA.hunts[id];
      if (!h || h.comingSoon) continue;
      (h.monsters || []).forEach((s) => set.add(s));
      Object.keys(h.spawnWeights || {}).forEach((s) => set.add(s));
    }
  }
  if (typeof QUEST_DEFS !== "undefined" && QUEST_DEFS) {
    for (const id in QUEST_DEFS) {
      const q = QUEST_DEFS[id];
      if (!q) continue;
      (q.waveMonsters || []).forEach((s) => set.add(s));
      if (q.boss) set.add(q.boss);
    }
  }
  return set;
}

/* Criaturas do bestiário: ativas e NÃO-boss (bosses ficam no bosstiário,
 * modelo oficial — não listar o mesmo monstro nas duas abas). */
function bestiarySlugs() {
  const ativos = activeMonsterSlugs();
  const out = [];
  for (const slug of ativos) {
    const m = (typeof GAMEDATA !== "undefined" && GAMEDATA.monsters)
      ? GAMEDATA.monsters[slug] : null;
    if (m && !m.boss) out.push(slug);
  }
  return out;
}

function bestiarySummary(p) {
  ensureCyclopedia(p);
  const todos = bestiarySlugs();
  let desc = 0, comp = 0;
  for (const s of todos) {
    const st = bestiaryStage(p, s);
    if (st > 0) desc++;
    if (st >= BEST_ESTAGIOS.length) comp++;
  }
  return { total: todos.length, descobertos: desc, completos: comp,
           pontos: p.charmPoints || 0 };
}

function bestiaryFinishedList(p) {
  ensureCyclopedia(p);
  const out = [];
  for (const s of bestiarySlugs()) {
    if (bestiaryStage(p, s) >= BEST_ESTAGIOS.length) out.push(s);
  }
  out.sort((a, b) => (GAMEDATA.monsters[a].name || a)
    .localeCompare(GAMEDATA.monsters[b].name || b));
  return out;
}

function charmOwned(p, id) {
  ensureCyclopedia(p);
  const cid = resolveCharmId(id);
  return !!(cid && p.charms[cid]);
}

function charmAssignedRace(p, id) {
  ensureCyclopedia(p);
  const cid = resolveCharmId(id);
  return (cid && p.charmRace[cid]) || null;
}

function charmOnRace(p, slug) {
  ensureCyclopedia(p);
  if (!slug) return null;
  for (const id of Object.keys(p.charmRace)) {
    if (p.charmRace[id] === slug) return id;
  }
  return null;
}

function buyCharm(p, id) {
  ensureCyclopedia(p);
  const cid = resolveCharmId(id);
  const c = cid && CHARMS[cid];
  if (!c) return { ok: false, erro: "Charm desconhecido." };
  if (charmOwned(p, cid)) return { ok: false, erro: "Você já tem esse charm." };
  if ((p.charmPoints || 0) < c.custo)
    return { ok: false, erro: "Charm points insuficientes." };
  p.charmPoints -= c.custo;
  // Reatribui o mapa inteiro — com p.charms bound à conta, a mutation
  // `p.charms[cid]=true` não dispara o setter e o unlock se perderia.
  p.charms = Object.assign({}, p.charms, { [cid]: 1 });
  return { ok: true, id: cid, tier: 1 };
}

/* Melhoria oficial (WU 2024): estágio 2/3 debita charm points do pool. */
function upgradeCharm(p, id) {
  ensureCyclopedia(p);
  const cid = resolveCharmId(id);
  const c = cid && CHARMS[cid];
  if (!c) return { ok: false, erro: "Charm desconhecido." };
  const tier = charmTier(p, cid);
  if (!tier) return { ok: false, erro: "Desbloqueie o charm primeiro." };
  if (tier >= 3) return { ok: false, erro: "Charm já está no nível máximo." };
  const cost = charmCostAt(cid, tier + 1);
  if ((p.charmPoints || 0) < cost)
    return { ok: false, erro: "Charm points insuficientes." };
  p.charmPoints -= cost;
  p.charms = Object.assign({}, p.charms, { [cid]: tier + 1 });
  return { ok: true, id: cid, tier: tier + 1 };
}

/* Limite oficial de charms ativos ao mesmo tempo: conta free 2, VIP 6,
 * Charm Expansion (Store, por conta) ilimitado. */
function charmMaxActive() {
  try {
    const acc = (typeof sessionAccount === "function") ? sessionAccount() : null;
    if (acc && acc.cosmetics && acc.cosmetics.charmExpansion) return Infinity;
    if (typeof isVip === "function" && isVip()) return 6;
  } catch (e) {}
  return 2;
}
function charmActiveCount(p) {
  return Object.keys((p && p.charmRace) || {}).length;
}

function assignCharm(p, id, slug) {
  ensureCyclopedia(p);
  const cid = resolveCharmId(id);
  const c = cid && CHARMS[cid];
  if (!c) return { ok: false, erro: "Charm desconhecido." };
  if (!charmOwned(p, cid)) return { ok: false, erro: "Desbloqueie o charm primeiro." };
  if (!slug || !GAMEDATA.monsters[slug])
    return { ok: false, erro: "Criatura inválida." };
  if (bestiaryStage(p, slug) < BEST_ESTAGIOS.length)
    return { ok: false, erro: "Só criaturas com bestiário completo." };
  const other = charmOnRace(p, slug);
  if (other && other !== cid)
    return { ok: false, erro: "Essa criatura já tem outra runa." };
  const max = charmMaxActive();
  if (!p.charmRace[cid] && charmActiveCount(p) >= max)
    return { ok: false, erro: max === 6
      ? "Limite de 6 charms ativos (VIP). Charm Expansion (Store) remove o limite."
      : "Limite de 2 charms ativos. VIP libera 6; Charm Expansion (Store) remove o limite." };
  p.charmRace[cid] = slug;
  return { ok: true, id: cid };
}

function clearCharm(p, id) {
  ensureCyclopedia(p);
  const cid = resolveCharmId(id);
  if (!cid || !p.charmRace[cid]) return { ok: false, erro: "Charm sem assign." };
  delete p.charmRace[cid];
  return { ok: true, id: cid };
}

/* Efeitos ativos só contam na raça assignada (paridade Canary). */
function charmTotals(p, slug) {
  ensureCyclopedia(p);
  const t = {
    dano: {}, reflete: 0, esquiva: 0, vampirismo: 0, manaLeech: 0,
    lentidao: 0, critChance: 0, critExtra: 0, gut: 0,
    numb: 0, adrenaline: 0, cleanse: 0,
  };
  for (const id of Object.keys(p.charms)) {
    if (!p.charms[id]) continue;
    const c = CHARMS[id];
    if (!c) continue;
    const race = p.charmRace[id];
    if (!race) continue;
    if (slug && race !== slug) continue;
    const tier = Math.min(3, Math.max(1, Math.floor(Number(p.charms[id])) || 1));
    if (c.tipo === "ofensivo" && c.elemento && c.percent) {
      /* procs ofensivos não somam % passivo — mantém mapa só para UI legada */
      t.dano[c.elemento] = (t.dano[c.elemento] || 0);
    } else if (id === "parry") t.reflete += charmFx(id, "chance", tier) || 5;
    else if (id === "dodge") t.esquiva += charmFx(id, "chance", tier) || 5;
    else if (id === "vampiric") t.vampirismo += charmFx(id, "chance", tier) || 1.6;
    else if (id === "voidcall") t.manaLeech += charmFx(id, "chance", tier) || 0.8;
    else if (id === "cripple") t.lentidao += charmFx(id, "chance", tier) || 6;
    else if (id === "numb") t.numb += charmFx(id, "chance", tier) || 6;
    else if (id === "adrenaline") t.adrenaline += charmFx(id, "chance", tier) || 6;
    else if (id === "cleanse") t.cleanse += charmFx(id, "chance", tier) || 6;
    else if (id === "lowblow") t.critChance += charmFx(id, "chance", tier) || 4;
    else if (id === "savage") t.critExtra += charmFx(id, "chance", tier) || 20;
    else if (id === "gut") t.gut += charmFx(id, "percent", tier) || 6;
  }
  return t;
}

/* Proc ofensivo Canary: chance → dano = min(2×level, maxHp×%). */
function charmOffensiveProc(p, slug, maxHp, level, rng) {
  ensureCyclopedia(p);
  const out = [];
  const roll = typeof rng === "function" ? rng : Math.random;
  for (const id of Object.keys(p.charmRace)) {
    if (p.charmRace[id] !== slug || !p.charms[id]) continue;
    const c = CHARMS[id];
    if (!c || c.tipo !== "ofensivo" || !c.elemento) continue;
    const tier = charmTier(p, id);
    if (roll() * 100 >= (charmFx(id, "chance", tier) || 5)) continue;
    let dmg;
    if (id === "overpower") {
      const max = (typeof maxStats === "function") ? maxStats(p).hp : (p.hp || 100);
      dmg = Math.min(Math.ceil(maxHp * 0.08), Math.ceil(max * (charmFx(id, "percent", tier) || 5) / 100));
    } else if (id === "overflux") {
      const max = (typeof maxStats === "function") ? maxStats(p).mp : (p.mp || 100);
      dmg = Math.min(Math.ceil(maxHp * 0.08), Math.ceil(max * (charmFx(id, "percent", tier) || 2.5) / 100));
    } else {
      dmg = Math.min(Math.ceil((level || 1) * 2),
                     Math.ceil(maxHp * (charmFx(id, "percent", tier) || 5) / 100));
    }
    if (dmg > 0) out.push({ id: id, element: c.elemento, dmg: dmg });
  }
  return out;
}

function huntStars(hu) {
  if (!hu) return 1;
  if (hu.stars) return Math.max(1, Math.min(5, hu.stars));
  let sum = 0, n = 0;
  for (const s of (hu.monsters || [])) {
    const m = GAMEDATA.monsters && GAMEDATA.monsters[s];
    if (m && m.best && m.best.stars) { sum += m.best.stars; n++; }
  }
  if (n) return Math.max(1, Math.min(5, Math.round(sum / n)));
  const lvl = hu.level || 1;
  if (lvl < 50) return 1;
  if (lvl < 100) return 2;
  if (lvl < 200) return 3;
  if (lvl < 300) return 4;
  return 5;
}

function huntStarsHtml(n) {
  const s = Math.max(1, Math.min(5, n || 1));
  let html = "";
  for (let i = 1; i <= 5; i++) {
    html += `<span class="hunt-star ${i <= s ? "on" : ""}">★</span>`;
  }
  return `<span class="hunt-stars" title="Dificuldade ${s}/5">${html}</span>`;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    CYCLO_ABAS, CHARMS, BEST_ESTAGIOS, bestiaryKill, bestiaryStage,
    bestiaryProgress, bestiarySummary, bestiaryFinishedList,
    activeMonsterSlugs, bestiarySlugs,
    buyCharm, upgradeCharm, assignCharm, clearCharm, charmTotals, charmOffensiveProc,
    charmMaxActive, charmActiveCount,
    charmTier, charmFx, charmCostAt, CHARM_TIERS,
    charmOwned, charmAssignedRace, charmOnRace, charmIconHtml,
    huntStars, huntStarsHtml, ensureCyclopedia, resolveCharmId,
    normalizeCharmUnlockMap, normalizeCharmRaceMap,
  };
}
