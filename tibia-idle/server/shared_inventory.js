/* shared_inventory.js — inventário DA CONTA (não por personagem).
 *
 * Os containers compartilhados entre todos os personagens da conta:
 *   bag (backpack), lootPouch, supplyStash, depot e rewardChest/rewardChestBundles.
 * Junto deles, as instâncias de item (itemInstances) com loc bag/depot —
 * instâncias EQUIPADAS (loc "equip:*") continuam por personagem, porque o
 * equipamento é individual.
 *
 * Formato do shared (gravado em accounts.shared_inventory):
 *   { v:1, seq:0, bag:{}, lootPouch:{}, supplyStash:{}, depot:[],
 *     itemInstances:[], rewardChest:{}, rewardChestBundles:[] }
 *
 * Pure module (sem I/O): o db.js persiste, o server.js aplica/extrai e os
 * testes exercitam as funções diretamente.
 */
"use strict";

const SHARED_CONTAINERS = ["bag", "lootPouch", "supplyStash", "depot", "rewardChest", "rewardChestBundles",
  "dust", "dustLimit", "slivers", "exaltedCores"];

/* Stamina é DA CONTA: pool único em shared.stamina {v:segundos, at:ms}.
 * Cada personagem carrega só um ESPELHO (p.stamina/p.staminaAt). A
 * materialização é por relógio — a taxa depende do estado no momento da
 * contagem (1s/s treinando, 0,5s/s ocioso/offline, dreno no tick da hunt). */
const SHARED_STAMINA_FULL = 54000;

function regenSharedStamina(shared, now, perSec, seed) {
  shared = shared || {};
  const st = shared.stamina && typeof shared.stamina === "object" ? shared.stamina : null;
  now = Number(now) || Date.now();
  if (!st) {
    const v = Number.isFinite(Number(seed))
      ? Math.max(0, Math.min(SHARED_STAMINA_FULL, Number(seed))) : SHARED_STAMINA_FULL;
    shared.stamina = { v: v, at: now };
    return shared.stamina;
  }
  let v = Number.isFinite(Number(st.v)) ? Number(st.v) : SHARED_STAMINA_FULL;
  const at = Number(st.at) || 0;
  if (at > 0 && now > at && perSec > 0)
    v = Math.min(SHARED_STAMINA_FULL, v + (now - at) / 1000 * perSec);
  shared.stamina = { v: Math.max(0, v), at: now };
  return shared.stamina;
}

/* Migração: o pool nasce do MAIOR espelho entre os personagens da conta,
 * com o carimbo mais recente (nunca soma — os espelhos herdados já eram do
 * mesmo pool lógico). Uma vez por conta via flag staminaSharedDone. */
function seedSharedStamina(shared, characters) {
  shared = shared || {};
  if (shared.stamina && typeof shared.stamina === "object") return shared.stamina;
  let v = null, at = 0;
  for (const c of Array.isArray(characters) ? characters : []) {
    const p = charDataOf(c);
    if (!p || !Number.isFinite(Number(p.stamina))) continue;
    const sv = Math.max(0, Math.min(SHARED_STAMINA_FULL, Number(p.stamina)));
    if (v === null || sv > v) v = sv;
    at = Math.max(at, Number(p.staminaAt) || 0);
  }
  if (v !== null) shared.stamina = { v: v, at: at || Date.now() };
  return shared.stamina;
}

/* Espelha o pool da conta no player (só quando o pool existe — personagem
 * legado sem shared fica com o próprio espelho até a primeira extração). */
function applySharedStamina(p, shared) {
  const st = shared && shared.stamina;
  if (p && st && Number.isFinite(Number(st.v))) {
    p.stamina = Math.max(0, Math.min(SHARED_STAMINA_FULL, Number(st.v)));
    p.staminaAt = Number(st.at) || Date.now();
  }
}

/* Grava o espelho do player no pool — com GUARDA de carimbo: um save
 * atrasado de outro personagem não pode rolar o relógio da conta pra trás. */
function extractSharedStamina(p, shared) {
  shared = shared || {};
  if (!p || !Number.isFinite(Number(p.stamina))) return;
  const at = Number(p.staminaAt) || 0;
  const cur = shared.stamina && typeof shared.stamina === "object" ? shared.stamina : null;
  if (!cur || !Number.isFinite(Number(cur.at)) || at >= Number(cur.at)) {
    shared.stamina = { v: Math.max(0, Math.min(SHARED_STAMINA_FULL, Number(p.stamina))),
      at: at || Date.now() };
  }
}

function emptySharedInventory() {
  return { v: 1, seq: 0, bag: {}, lootPouch: {}, supplyStash: {}, depot: [],
    itemInstances: [], rewardChest: {}, rewardChestBundles: [],
    dust: 0, dustLimit: 100, slivers: 0, exaltedCores: 0 };
}

function isSharedInventory(s) {
  return !!(s && typeof s === "object" && !Array.isArray(s) && s.v === 1);
}

function normalizeSharedInventory(s) {
  if (!isSharedInventory(s)) s = emptySharedInventory();
  s.seq = Math.max(0, Math.floor(Number(s.seq) || 0));
  s.bag = s.bag && typeof s.bag === "object" && !Array.isArray(s.bag) ? s.bag : {};
  s.lootPouch = s.lootPouch && typeof s.lootPouch === "object" && !Array.isArray(s.lootPouch) ? s.lootPouch : {};
  s.supplyStash = s.supplyStash && typeof s.supplyStash === "object" && !Array.isArray(s.supplyStash) ? s.supplyStash : {};
  s.depot = Array.isArray(s.depot) ? s.depot : [];
  s.itemInstances = Array.isArray(s.itemInstances) ? s.itemInstances : [];
  s.rewardChest = s.rewardChest && typeof s.rewardChest === "object" && !Array.isArray(s.rewardChest) ? s.rewardChest : {};
  s.rewardChestBundles = Array.isArray(s.rewardChestBundles) ? s.rewardChestBundles : [];
  s.dust = Math.max(0, Math.floor(Number(s.dust) || 0));
  s.dustLimit = Math.max(100, Math.min(325, Math.floor(Number(s.dustLimit) || 100)));
  s.dust = Math.min(s.dust, s.dustLimit);
  s.slivers = Math.max(0, Math.floor(Number(s.slivers) || 0));
  s.exaltedCores = Math.max(0, Math.floor(Number(s.exaltedCores) || 0));
  /* Prey é DA CONTA (slots/seleções/wildcards compartilhados entre todos
   * os personagens). null = ainda não migrado — o primeiro personagem
   * com p.prey preenchido semeia o estado compartilhado no apply. */
  s.prey = (s.prey && typeof s.prey === "object" && !Array.isArray(s.prey)) ? s.prey : null;
  /* Charms DA CONTA: charm points e runas desbloqueadas (major+minor)
   * são do pool da conta. Só o assign (p.charmRace) e os marcos já
   * pagos (p.charmsPagos) continuam por personagem — assim dois chars
   * podem associar runas diferentes à MESMA criatura. */
  s.charms = (s.charms && typeof s.charms === "object" && !Array.isArray(s.charms)) ? s.charms : {};
  s.charmPoints = Math.max(0, Math.floor(Number(s.charmPoints) || 0));
  /* Boost de skills de voucher (ex.: FLOWERS0800 = +50% por 12h) — timestamp
   * DA CONTA, lido por addSkillTries/addManaSpent na engine e no cliente. */
  s.skillBoostUntil = Math.max(0, Math.floor(Number(s.skillBoostUntil) || 0));
  return s;
}

/* Migração: charms eram por personagem — o pool da conta nasce da UNIÃO
 * dos desbloqueios + SOMA dos pontos não gastos (cada char tinha pool
 * próprio). Idempotente; a flag charmsSharedDone é marcada pelo caller. */
function seedSharedCharms(shared, characters) {
  shared = normalizeSharedInventory(shared);
  for (const character of Array.isArray(characters) ? characters : []) {
    const p = charDataOf(character);
    if (!p) continue;
    if (p.charms && typeof p.charms === "object" && !Array.isArray(p.charms)) {
      for (const id of Object.keys(p.charms)) if (p.charms[id])
      shared.charms[id] = Math.max(
        Math.min(3, Math.max(1, Math.floor(Number(shared.charms[id])) || 1)),
        Math.min(3, Math.max(1, Math.floor(Number(p.charms[id])) || 1)));
    }
    shared.charmPoints += Math.max(0, Math.floor(Number(p.charmPoints) || 0));
  }
  return shared;
}

/* Aplica o pool de charms da conta no player (espelho). charmRace e
 * charmsPagos NÃO são tocados — são por personagem. _charmPointsBase
 * guarda a baseline pro merge por delta. */
function applySharedCharms(p, shared) {
  if (!p || typeof p !== "object") return p;
  if (shared.charmsSharedDone) {
    p.charms = Object.assign({}, shared.charms);
    p.charmPoints = Math.max(0, Math.floor(Number(shared.charmPoints) || 0));
  } else if ((p.charms && typeof p.charms === "object") || Number(p.charmPoints) > 0) {
    // pré-migração: o próprio char semeia o pool (primeiro hidratado)
    for (const id of Object.keys(p.charms || {})) if (p.charms[id])
      shared.charms[id] = Math.max(
        Math.min(3, Math.max(1, Math.floor(Number(shared.charms[id])) || 1)),
        Math.min(3, Math.max(1, Math.floor(Number(p.charms[id])) || 1)));
    shared.charmPoints = Math.max(shared.charmPoints, Math.max(0, Math.floor(Number(p.charmPoints) || 0)));
    p.charmPoints = shared.charmPoints;
  }
  p._charmPointsBase = Math.max(0, Math.floor(Number(p.charmPoints) || 0));
  return p;
}

/* Merge do espelho do char no pool da conta: desbloqueios = união
 * (nunca perde unlock); pontos = DELTA contra _charmPointsBase (ganhos
 * de marcos do bestiário e gastos de desbloqueio somam sobre o pool sem
 * reverter operações de outro caminho/cópia). */
function mergeSharedCharms(p, shared) {
  if (p.charms && typeof p.charms === "object" && !Array.isArray(p.charms)) {
    for (const id of Object.keys(p.charms)) if (p.charms[id])
      shared.charms[id] = Math.max(
        Math.min(3, Math.max(1, Math.floor(Number(shared.charms[id])) || 1)),
        Math.min(3, Math.max(1, Math.floor(Number(p.charms[id])) || 1)));
  }
  const cur = Math.floor(Number(p.charmPoints) || 0);
  const base = Number(p._charmPointsBase);
  if (Number.isFinite(base)) shared.charmPoints = Math.max(0, shared.charmPoints + (cur - Math.floor(base)));
  else if (Number.isFinite(Number(p.charmPoints))) shared.charmPoints = Math.max(0, cur);
  return shared;
}

function charDataOf(character) {
  if (!character) return null;
  let data = character.data;
  if (typeof data === "string") { try { data = JSON.parse(data); } catch (e) { data = null; } }
  return data && typeof data === "object" && !Array.isArray(data) ? data : null;
}

/* Migração: junta os containers de todos os personagens da conta no shared.
 * bag/lootPouch somam contagens; depot concatena (cap 30 slots); instâncias
 * bag/depot são re-numeradas para o escopo da conta (ai-<seq>) e as refs do
 * depot são reescritas; bundles do reward chest são concatenados. Instâncias
 * equipadas permanecem por personagem (não entram no shared). */
function mergeCharContainers(shared, characters) {
  shared = normalizeSharedInventory(shared);
  characters = Array.isArray(characters) ? characters : [];
  const used = new Set(shared.itemInstances.map((i) => i && i.id).filter(Boolean));
  const nextSeq = () => { shared.seq += 1; return "ai-" + shared.seq.toString(36); };
  const remap = new Map();
  for (const character of characters) {
    const p = charDataOf(character);
    if (!p) continue;
    shared.dust += Math.max(0, Math.floor(Number(p.dust) || 0));
    shared.dustLimit = Math.max(shared.dustLimit, Math.floor(Number(p.dustLimit) || 100));
    shared.slivers += Math.max(0, Math.floor(Number(p.slivers) || 0));
    shared.exaltedCores += Math.max(0, Math.floor(Number(p.exaltedCores) || 0));
    if (p.bag && typeof p.bag === "object") {
      for (const slug of Object.keys(p.bag)) {
        const n = Math.max(0, Math.floor(Number(p.bag[slug]) || 0));
        if (n > 0) shared.bag[slug] = (Number(shared.bag[slug]) || 0) + n;
      }
    }
    if (p.lootPouch && typeof p.lootPouch === "object") {
      for (const slug of Object.keys(p.lootPouch)) {
        const n = Math.max(0, Math.floor(Number(p.lootPouch[slug]) || 0));
        if (n > 0) shared.lootPouch[slug] = (Number(shared.lootPouch[slug]) || 0) + n;
      }
    }
    if (p.supplyStash && typeof p.supplyStash === "object") {
      for (const slug of Object.keys(p.supplyStash)) {
        const n = Math.max(0, Math.floor(Number(p.supplyStash[slug]) || 0));
        if (n > 0) shared.supplyStash[slug] = (Number(shared.supplyStash[slug]) || 0) + n;
      }
    }
    if (Array.isArray(p.itemInstances)) {
      for (const inst of p.itemInstances) {
        if (!inst || typeof inst !== "object" || !inst.slug) continue;
        const loc = String(inst.loc || "");
        if (loc.startsWith("equip:")) continue; // equipamento é por personagem
        const copy = Object.assign({}, inst);
        const oldId = String(copy.id || "");
        copy.id = nextSeq();
        if (oldId && !used.has(copy.id)) used.add(copy.id);
        remap.set(oldId, copy.id);
        if (loc !== "bag" && loc !== "depot") copy.loc = "depot";
        shared.itemInstances.push(copy);
      }
    }
    for (const entry of (Array.isArray(p.depot) ? p.depot : [])) {
      if (shared.depot.length >= 30) break;
      if (remap.has(String(entry))) shared.depot.push(remap.get(String(entry)));
      else if (entry && typeof entry === "object") shared.depot.push(String(entry.slug || entry.item || ""));
      else if (entry) shared.depot.push(entry);
    }
    for (const bundle of (Array.isArray(p.rewardChestBundles) ? p.rewardChestBundles : []))
      if (bundle && typeof bundle === "object") shared.rewardChestBundles.push(Object.assign({}, bundle));
  }
  shared.forgeResourcesDone = 1;
  return normalizeSharedInventory(shared);
}

/* Aplica o shared num player (virtual): containers viram os da conta e o
 * itemInstances vira shared.itemInstances + instâncias equipadas do player.
 * O contador local de instâncias pula para o seq da conta (evita colisão de
 * ids criados no cliente enquanto online). */
function mergeCharForgeResources(shared, characters) {
  shared = normalizeSharedInventory(shared);
  if (shared.forgeResourcesDone) return shared;
  for (const character of Array.isArray(characters) ? characters : []) {
    const p = charDataOf(character);
    if (!p) continue;
    shared.dust += Math.max(0, Math.floor(Number(p.dust) || 0));
    shared.dustLimit = Math.max(shared.dustLimit, Math.floor(Number(p.dustLimit) || 100));
    shared.slivers += Math.max(0, Math.floor(Number(p.slivers) || 0));
    shared.exaltedCores += Math.max(0, Math.floor(Number(p.exaltedCores) || 0));
  }
  shared.forgeResourcesDone = 1;
  return normalizeSharedInventory(shared);
}

function applySharedToPlayer(p, shared) {
  shared = normalizeSharedInventory(shared);
  if (!p || typeof p !== "object") p = {};
  p.bag = Object.assign({}, shared.bag);
  p.lootPouch = Object.assign({}, shared.lootPouch);
  p.supplyStash = Object.assign({}, shared.supplyStash);
  p.depot = shared.depot.slice();
  p.rewardChest = Object.assign({}, shared.rewardChest);
  p.rewardChestBundles = shared.rewardChestBundles.slice();
  p.dust = shared.dust;
  p.dustLimit = shared.dustLimit;
  p.slivers = shared.slivers;
  p.exaltedCores = shared.exaltedCores;
  p.skillBoostUntil = Number(shared.skillBoostUntil) || 0;
  // Baseline dos recursos da forja (mesma ideia do _pouchBase): o delta
  // (espelho − base) é o que ESTE player mudou — a extração soma o delta ao
  // shared atual em vez de sobrescrever, então um espelho atrasado não
  // reverte ganhos feitos por outra cópia/caminho.
  p._forgeBase = {
    dust: shared.dust, dustLimit: shared.dustLimit,
    slivers: shared.slivers, exaltedCores: shared.exaltedCores,
  };
  const equipped = (Array.isArray(p.itemInstances) ? p.itemInstances : [])
    .filter((i) => i && typeof i === "object" && String(i.loc || "").startsWith("equip:"));
  p.itemInstances = shared.itemInstances.map((i) => Object.assign({}, i)).concat(equipped);
  if (shared.seq > (Number(p._itemInstSeq) || 0)) p._itemInstSeq = shared.seq;
  // Baseline da pouch: o conteúdo compartilhado no momento da hidratação.
  // A extração usa (cópia − base) como DELTA sobre o shared atual — assim
  // mudanças externas (venda em outra aba/personagem) não são revertidas e
  // o loot da instância não ressuscita itens já vendidos.
  p._pouchBase = Object.assign({}, shared.lootPouch);
  /* Prey DA CONTA: referência ao mesmo objeto — mutações (reroll, select,
   * tick) num personagem valem para todos. Se a conta ainda não tem prey
   * compartilhada, o prey do próprio personagem vira a semente (migração
   * lazy — o primeiro char hidratado leva o estado para a conta). */
  if (shared.prey) p.prey = shared.prey;
  else if (p.prey && (Array.isArray(p.prey.slots) || Number(p.prey.wildcards) > 0)) shared.prey = p.prey;
  applySharedCharms(p, shared);
  applySharedStamina(p, shared);
  p._sharedInv = 1;
  return p;
}

/* Merge de missão por CONTA (missions são account-level, não por char).
 * progress = maior valor por task; claimed/completeClaimed/partyExpGranted
 * = união; missionsDone = união de flags. surviveReset é o epoch marcado
 * quando a party morre na Claustrophobic Inferno — entradas anteriores ao
 * último reset são stale para os campos "survive" (um espelho velho não
 * pode reviver o timer nem o claim zerados pela morte). */
function mergeMissionEntry(a, b) {
  a = a && typeof a === "object" ? a : {};
  b = b && typeof b === "object" ? b : {};
  const reset = Math.max(Number(a.surviveReset) || 0, Number(b.surviveReset) || 0);
  const fresh = (st) => reset <= 0 || (Number(st.surviveReset) || 0) >= reset;
  const out = { progress: {}, claimed: {} };
  for (const st of [a, b]) {
    const ok = fresh(st);
    for (const [k, v] of Object.entries(st.progress || {})) {
      if (!ok && k === "survive") continue;
      const n = Number(v) || 0;
      if (n > (Number(out.progress[k]) || 0)) out.progress[k] = n;
    }
    for (const k of Object.keys(st.claimed || {})) {
      if (!ok && k === "survive") continue;
      if (st.claimed[k]) out.claimed[k] = true;
    }
    if (st.completeClaimed) out.completeClaimed = true;
    if (st.partyExpGranted) out.partyExpGranted = true;
  }
  if (reset) out.surviveReset = reset;
  return out;
}

function mergeMissionMaps(a, b) {
  a = a && typeof a === "object" ? a : {};
  b = b && typeof b === "object" ? b : {};
  const out = {};
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)]))
    out[k] = mergeMissionEntry(a[k], b[k]);
  return out;
}

function mergeFlagMap(a, b) {
  const out = Object.assign({}, a && typeof a === "object" ? a : {});
  for (const [k, v] of Object.entries(b && typeof b === "object" ? b : {}))
    if (v) out[k] = v;
  return out;
}

/* Semeia as missões da conta no espelho do personagem (hidratação): qualquer
 * char passa a ver o progresso/claims que outro char da conta já fez — e o
 * engine (missionPartyExpReward, progress por kill) parte do estado real. */
function applyAccountMissionsToPlayer(p, acc) {
  if (!p || typeof p !== "object" || !acc || typeof acc !== "object") return p;
  p.missions = mergeMissionMaps(p.missions, acc.missions);
  p.missionsDone = mergeFlagMap(p.missionsDone, acc.missionsDone);
  /* Hazard level (Gnomprona) é por CONTA: cosmetics.hazard = {kills,
   * level, sel}. O membro hidratado carrega o desbloqueio (level = max
   * entre o próprio e o da conta) e a escolha (sel travada ao level). */
  try {
    const cos = acc.cosmetics && typeof acc.cosmetics === "object" &&
      !Array.isArray(acc.cosmetics) ? acc.cosmetics : {};
    const h = cos.hazard && typeof cos.hazard === "object" ? cos.hazard : null;
    // Todas as contas começam com hazard 1 desbloqueado (floor global).
    const accLevel = h ? Math.max(0, Math.min(12,
      Number(h.level) || 0)) : 0;
    const level = Math.max(1, Math.min(12,
      Math.max(accLevel, Number(p.hazardLevel) || 0)));
    p.hazardLevel = level;
    const selSrc = h && h.sel !== undefined ? Number(h.sel)
      : (p.hazardSel !== undefined ? Number(p.hazardSel) : level);
    p.hazardSel = Math.max(1, Math.min(level, Number(selSrc) || 0));
  } catch (e) { /* hazard opcional */ }
  return p;
}

/* Merge da Loot Pouch por DELTA contra a baseline hidratada:
 *   shared[s] = max(0, shared[s] + cópia[s] − base[s])
 * - loot adicionado na instância entra (+delta);
 * - venda/destruição dentro da instância sai (−delta), mesmo sem sync;
 * - mudança externa no shared entre hidratação e extração é preservada.
 * Retorna null quando o player não tem baseline (chamador decide fallback). */
function pouchDelta(sharedPouch, player) {
  const base = player && player._pouchBase && typeof player._pouchBase === "object" &&
    !Array.isArray(player._pouchBase) ? player._pouchBase : null;
  if (!base) return null;
  const copy = player && player.lootPouch && typeof player.lootPouch === "object" &&
    !Array.isArray(player.lootPouch) ? player.lootPouch : {};
  const out = Object.assign({}, sharedPouch);
  const slugs = new Set(Object.keys(out).concat(Object.keys(copy), Object.keys(base)));
  for (const slug of slugs) {
    const n = Math.max(0, Math.floor((Number(out[slug]) || 0) +
      (Number(copy[slug]) || 0) - (Number(base[slug]) || 0)));
    if (n > 0) out[slug] = n; else delete out[slug];
  }
  return out;
}

/* Merge dos recursos da forja (dust/slivers/exaltedCores são da conta):
 * com baseline _forgeBase, aplica o DELTA (shared += espelho − base) —
 * espelho atrasado vira delta 0 (não reverte a conta), ganhos entram e
 * gastos saem. dustLimit só cresce (convergência) — sempre pelo maior.
 * Sem baseline (saves legados), fallbackMax usa o maior valor (merge
 * terminal) ou sobrescreve (save comum — comportamento antigo). */
function forgeResourcesDelta(shared, p, fallbackMax) {
  if (!p || typeof p !== "object") return;
  shared.dustLimit = Math.max(shared.dustLimit,
    Math.max(100, Math.min(325, Math.floor(Number(p.dustLimit) || 100))));
  const base = p._forgeBase && typeof p._forgeBase === "object" && !Array.isArray(p._forgeBase)
    ? p._forgeBase : null;
  for (const key of ["dust", "slivers", "exaltedCores"]) {
    const cur = Math.max(0, Math.floor(Number(p[key]) || 0));
    if (!base) {
      if (fallbackMax) shared[key] = Math.max(Number(shared[key]) || 0, cur);
      else shared[key] = cur;
      continue;
    }
    const b = Math.max(0, Math.floor(Number(base[key]) || 0));
    shared[key] = Math.max(0, (Number(shared[key]) || 0) + cur - b);
  }
}

/* Extrai os containers de um player para o shared (oposto do apply). O
 * player fica com os containers zerados e só as instâncias equipadas. */
function extractSharedFromPlayer(p, shared) {
  shared = normalizeSharedInventory(shared);
  if (!p || typeof p !== "object") return shared;
  shared.bag = (p.bag && typeof p.bag === "object" && !Array.isArray(p.bag)) ? p.bag : {};
  shared.lootPouch = (p.lootPouch && typeof p.lootPouch === "object" && !Array.isArray(p.lootPouch)) ? p.lootPouch : {};
  shared.supplyStash = (p.supplyStash && typeof p.supplyStash === "object" && !Array.isArray(p.supplyStash)) ? p.supplyStash : {};
  shared.depot = Array.isArray(p.depot) ? p.depot.slice() : [];
  shared.rewardChest = (p.rewardChest && typeof p.rewardChest === "object" && !Array.isArray(p.rewardChest)) ? p.rewardChest : {};
  shared.rewardChestBundles = Array.isArray(p.rewardChestBundles) ? p.rewardChestBundles.slice() : [];
  forgeResourcesDelta(shared, p, false);
  const insts = Array.isArray(p.itemInstances) ? p.itemInstances : [];
  shared.itemInstances = insts
    .filter((i) => i && typeof i === "object" && !String(i.loc || "").startsWith("equip:"))
    .map((i) => Object.assign({}, i));
  shared.seq = Math.max(shared.seq, Math.floor(Number(p._itemInstSeq) || 0));
  if (p.prey && (Array.isArray(p.prey.slots) || Number(p.prey.wildcards) > 0)) shared.prey = p.prey;
  mergeSharedCharms(p, shared);
  extractSharedStamina(p, shared);
  p.bag = {};
  p.lootPouch = {};
  p.supplyStash = {};
  p.depot = [];
  p.rewardChest = {};
  p.rewardChestBundles = [];
  p.itemInstances = insts.filter((i) => i && typeof i === "object" && String(i.loc || "").startsWith("equip:"));
  return normalizeSharedInventory(shared);
}

/* Merge (não sobrescreve) os containers de um player no shared — usado no
 * tick TERMINAL de instância com múltiplos personagens da mesma conta.
 *
 * Cada personagem carrega uma CÓPIA do shared desde o início da instância;
 * durante a luta as cópias podem divergir (desequipar adiciona na bag da
 * cópia, equipar remove, etc.). O extractSharedFromPlayer SOBRESCREVIA o
 * shared com a bag do ÚLTIMO personagem processado — itens adicionados em
 * outras cópias (ex.: item desequipado) SUMIAM ao final da boss fight.
 *
 * Regras do merge:
 *   - bag/lootPouch/supplyStash: por slug, fica o MAIOR valor (nunca perde o
 *     que foi adicionado em qualquer cópia; com a sincronização em tempo real
 *     das cópias, removidos/equipados também não ressuscitam);
 *   - itemInstances compartilhadas (loc != equip:*): união por id;
 *   - depot/rewardChest são server-owned e preservados do shared.
 */
function mergeSharedFromPlayer(p, shared, opts) {
  shared = normalizeSharedInventory(shared);
  if (!p || typeof p !== "object") return shared;
  // Loot Pouch: merge por DELTA contra a baseline (preserva mudanças
  // externas no shared). Uma vez por conta — as cópias são idênticas após
  // shareInstanceContainers unificar as referências.
  const pouchMerged = opts && opts.pouchDelta !== false ? pouchDelta(shared.lootPouch, p) : null;
  if (pouchMerged) shared.lootPouch = pouchMerged;
  for (const key of pouchMerged ? ["bag", "supplyStash"] : ["bag", "lootPouch", "supplyStash"]) {
    const src = (p[key] && typeof p[key] === "object" && !Array.isArray(p[key])) ? p[key] : {};
    const dst = (shared[key] && typeof shared[key] === "object" && !Array.isArray(shared[key])) ? shared[key] : {};
    for (const slug of Object.keys(src)) {
      const n = Math.max(0, Math.floor(Number(src[slug]) || 0));
      if (n > 0) dst[slug] = Math.max(Number(dst[slug]) || 0, n);
    }
    shared[key] = dst;
  }
  const byId = new Map((shared.itemInstances || []).map((i) => [String(i && i.id), i]));
  for (const inst of Array.isArray(p.itemInstances) ? p.itemInstances : []) {
    if (!inst || typeof inst !== "object" || !inst.slug) continue;
    if (String(inst.loc || "").startsWith("equip:")) continue;
    const id = String(inst.id || "");
    const prev = id ? byId.get(id) : null;
    if (prev) {
      /* União por id mantém a identidade/posição do shared (depot/market
       * movem `loc` no servidor), mas campos authored pelo player precisam
       * mergear: `tier` sai da Exaltation Forge (fusão/transfer e grant do
       * painel admin) e `charges` é o consumo de acessórios chargeables.
       * Sem isso o save regra o campo para o valor velho do espelho. */
      for (const k of ["tier", "charges"]) {
        if (inst[k] !== undefined && inst[k] !== prev[k]) prev[k] = inst[k];
      }
      continue;
    }
    const copy = Object.assign({}, inst);
    byId.set(id, copy);
    shared.itemInstances.push(copy);
  }
  shared.seq = Math.max(shared.seq, Math.floor(Number(p._itemInstSeq) || 0));
  forgeResourcesDelta(shared, p, true);
  if (p.prey && (Array.isArray(p.prey.slots) || Number(p.prey.wildcards) > 0)) shared.prey = p.prey;
  mergeSharedCharms(p, shared);
  extractSharedStamina(p, shared);
  return normalizeSharedInventory(shared);
}

module.exports = {
  SHARED_CONTAINERS,
  SHARED_STAMINA_FULL,
  regenSharedStamina,
  seedSharedStamina,
  applySharedStamina,
  extractSharedStamina,
  emptySharedInventory,
  isSharedInventory,
  normalizeSharedInventory,
  mergeCharContainers,
  mergeCharForgeResources,
  applySharedToPlayer,
  extractSharedFromPlayer,
  seedSharedCharms,
  applySharedCharms,
  mergeSharedCharms,
  forgeResourcesDelta,
  pouchDelta,
  mergeSharedFromPlayer,
  mergeMissionEntry,
  mergeMissionMaps,
  mergeFlagMap,
  applyAccountMissionsToPlayer,
  charDataOf,
};
