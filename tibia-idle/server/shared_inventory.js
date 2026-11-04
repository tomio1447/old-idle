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
  return s;
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
    if (id && byId.has(id)) continue;
    const copy = Object.assign({}, inst);
    byId.set(id, copy);
    shared.itemInstances.push(copy);
  }
  shared.seq = Math.max(shared.seq, Math.floor(Number(p._itemInstSeq) || 0));
  forgeResourcesDelta(shared, p, true);
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
  forgeResourcesDelta,
  pouchDelta,
  mergeSharedFromPlayer,
  mergeMissionEntry,
  mergeMissionMaps,
  mergeFlagMap,
  applyAccountMissionsToPlayer,
  charDataOf,
};
