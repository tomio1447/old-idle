/*
 * cyclopedia.js — Cyclopedia no molde Canary / OTC
 *
 * Bestiário, Bosstiário, Charms (runas com assign por raça) e dados de
 * progressão. Ícones das runas: sprite sheet OTC monster-bonus-effects.png
 * (32×32 por id, igual ao game_cyclopedia/tab/charms).
 */
"use strict";

const CYCLO_ABAS = [
  { id: "character", nome: "Personagem", icone: "character", pronta: true },
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
    iconSrc: "assets/npc/shopkeeper_s.png" },
  { id: "city-gnomally", nome: "GNOMALLY", pronta: true,
    cityAction: "gnomally", iconSrc: "assets/npc/magicshop_s.png" },
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
function normalizeCharmUnlockMap(raw) {
  const out = {};
  if (!raw) return out;
  const put = (key) => {
    if (!key) return;
    const s = String(key).trim();
    if (!s) return;
    if (CHARMS[s]) { out[s] = true; return; }
    const low = s.toLowerCase();
    if (CHARMS[low]) { out[low] = true; return; }
    for (const id of Object.keys(CHARMS)) {
      if ((CHARMS[id].nome || "").toLowerCase() === low) { out[id] = true; return; }
    }
  };
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (typeof item === "string") put(item);
      else if (item && typeof item === "object") put(item.id || item.slug || item.nome);
    }
    /* props nomeadas em Array (ex.: arr.enflame = true) não serializam */
    for (const key of Object.keys(raw)) {
      if (/^\d+$/.test(key)) continue;
      if (raw[key]) put(key);
    }
    return out;
  }
  if (typeof raw !== "object") return out;
  for (const key of Object.keys(raw)) {
    const v = raw[key];
    if (!v) continue;
    if (v === true || v === 1 || v === "1" || v === "true") put(key);
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
  p.charms = normalizeCharmUnlockMap(p.charms);
  p.charmRace = normalizeCharmRaceMap(p.charmRace);
  if (p.charmPoints === undefined || p.charmPoints === null)
    p.charmPoints = 0;
  else p.charmPoints = Math.max(0, Number(p.charmPoints) || 0);
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

function bestiarySummary(p) {
  ensureCyclopedia(p);
  const todos = Object.keys(GAMEDATA.monsters || {});
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
  for (const s of Object.keys(GAMEDATA.monsters || {})) {
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
  p.charms[cid] = true;
  return { ok: true, id: cid };
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
  };
  for (const id of Object.keys(p.charms)) {
    if (!p.charms[id]) continue;
    const c = CHARMS[id];
    if (!c) continue;
    const race = p.charmRace[id];
    if (!race) continue;
    if (slug && race !== slug) continue;
    if (c.tipo === "ofensivo" && c.elemento && c.percent) {
      /* procs ofensivos não somam % passivo — mantém mapa só para UI legada */
      t.dano[c.elemento] = (t.dano[c.elemento] || 0);
    } else if (id === "parry") t.reflete += c.chance || 5;
    else if (id === "dodge") t.esquiva += c.chance || 5;
    else if (id === "vampiric") t.vampirismo += c.chance || 1.6;
    else if (id === "voidcall") t.manaLeech += c.chance || 0.8;
    else if (id === "cripple") t.lentidao += c.chance || 6;
    else if (id === "lowblow") t.critChance += c.chance || 4;
    else if (id === "savage") t.critExtra += c.chance || 20;
    else if (id === "gut") t.gut += c.percent || 20;
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
    if (roll() * 100 >= (c.chance || 5)) continue;
    let dmg;
    if (id === "overpower") {
      const max = (typeof maxStats === "function") ? maxStats(p).hp : (p.hp || 100);
      dmg = Math.min(Math.ceil(maxHp * 0.08), Math.ceil(max * (c.percent || 5) / 100));
    } else if (id === "overflux") {
      const max = (typeof maxStats === "function") ? maxStats(p).mp : (p.mp || 100);
      dmg = Math.min(Math.ceil(maxHp * 0.08), Math.ceil(max * (c.percent || 2.5) / 100));
    } else {
      dmg = Math.min(Math.ceil((level || 1) * 2),
                     Math.ceil(maxHp * (c.percent || 5) / 100));
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
    buyCharm, assignCharm, clearCharm, charmTotals, charmOffensiveProc,
    charmOwned, charmAssignedRace, charmOnRace, charmIconHtml,
    huntStars, huntStarsHtml, ensureCyclopedia, resolveCharmId,
    normalizeCharmUnlockMap, normalizeCharmRaceMap,
  };
}
