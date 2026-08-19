/* shared_inventory.js — inventário DA CONTA (não por personagem).
 *
 * Os 4 containers compartilhados entre todos os personagens da conta:
 *   bag (backpack), lootPouch, depot e rewardChest/rewardChestBundles.
 * Junto deles, as instâncias de item (itemInstances) com loc bag/depot —
 * instâncias EQUIPADAS (loc "equip:*") continuam por personagem, porque o
 * equipamento é individual.
 *
 * Formato do shared (gravado em accounts.shared_inventory):
 *   { v:1, seq:0, bag:{}, lootPouch:{}, depot:[], itemInstances:[],
 *     rewardChest:{}, rewardChestBundles:[] }
 *
 * Pure module (sem I/O): o db.js persiste, o server.js aplica/extrai e os
 * testes exercitam as funções diretamente.
 */
"use strict";

const SHARED_CONTAINERS = ["bag", "lootPouch", "depot", "rewardChest", "rewardChestBundles"];

function emptySharedInventory() {
  return { v: 1, seq: 0, bag: {}, lootPouch: {}, depot: [],
    itemInstances: [], rewardChest: {}, rewardChestBundles: [] };
}

function isSharedInventory(s) {
  return !!(s && typeof s === "object" && !Array.isArray(s) && s.v === 1);
}

function normalizeSharedInventory(s) {
  if (!isSharedInventory(s)) s = emptySharedInventory();
  s.seq = Math.max(0, Math.floor(Number(s.seq) || 0));
  s.bag = s.bag && typeof s.bag === "object" && !Array.isArray(s.bag) ? s.bag : {};
  s.lootPouch = s.lootPouch && typeof s.lootPouch === "object" && !Array.isArray(s.lootPouch) ? s.lootPouch : {};
  s.depot = Array.isArray(s.depot) ? s.depot : [];
  s.itemInstances = Array.isArray(s.itemInstances) ? s.itemInstances : [];
  s.rewardChest = s.rewardChest && typeof s.rewardChest === "object" && !Array.isArray(s.rewardChest) ? s.rewardChest : {};
  s.rewardChestBundles = Array.isArray(s.rewardChestBundles) ? s.rewardChestBundles : [];
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
  return normalizeSharedInventory(shared);
}

/* Aplica o shared num player (virtual): containers viram os da conta e o
 * itemInstances vira shared.itemInstances + instâncias equipadas do player.
 * O contador local de instâncias pula para o seq da conta (evita colisão de
 * ids criados no cliente enquanto online). */
function applySharedToPlayer(p, shared) {
  shared = normalizeSharedInventory(shared);
  if (!p || typeof p !== "object") p = {};
  p.bag = Object.assign({}, shared.bag);
  p.lootPouch = Object.assign({}, shared.lootPouch);
  p.depot = shared.depot.slice();
  p.rewardChest = Object.assign({}, shared.rewardChest);
  p.rewardChestBundles = shared.rewardChestBundles.slice();
  const equipped = (Array.isArray(p.itemInstances) ? p.itemInstances : [])
    .filter((i) => i && typeof i === "object" && String(i.loc || "").startsWith("equip:"));
  p.itemInstances = shared.itemInstances.map((i) => Object.assign({}, i)).concat(equipped);
  if (shared.seq > (Number(p._itemInstSeq) || 0)) p._itemInstSeq = shared.seq;
  p._sharedInv = 1;
  return p;
}

/* Extrai os containers de um player para o shared (oposto do apply). O
 * player fica com os containers zerados e só as instâncias equipadas. */
function extractSharedFromPlayer(p, shared) {
  shared = normalizeSharedInventory(shared);
  if (!p || typeof p !== "object") return shared;
  shared.bag = (p.bag && typeof p.bag === "object" && !Array.isArray(p.bag)) ? p.bag : {};
  shared.lootPouch = (p.lootPouch && typeof p.lootPouch === "object" && !Array.isArray(p.lootPouch)) ? p.lootPouch : {};
  shared.depot = Array.isArray(p.depot) ? p.depot.slice() : [];
  shared.rewardChest = (p.rewardChest && typeof p.rewardChest === "object" && !Array.isArray(p.rewardChest)) ? p.rewardChest : {};
  shared.rewardChestBundles = Array.isArray(p.rewardChestBundles) ? p.rewardChestBundles.slice() : [];
  const insts = Array.isArray(p.itemInstances) ? p.itemInstances : [];
  shared.itemInstances = insts
    .filter((i) => i && typeof i === "object" && !String(i.loc || "").startsWith("equip:"))
    .map((i) => Object.assign({}, i));
  shared.seq = Math.max(shared.seq, Math.floor(Number(p._itemInstSeq) || 0));
  p.bag = {};
  p.lootPouch = {};
  p.depot = [];
  p.rewardChest = {};
  p.rewardChestBundles = [];
  p.itemInstances = insts.filter((i) => i && typeof i === "object" && String(i.loc || "").startsWith("equip:"));
  return normalizeSharedInventory(shared);
}

module.exports = {
  SHARED_CONTAINERS,
  emptySharedInventory,
  isSharedInventory,
  normalizeSharedInventory,
  mergeCharContainers,
  applySharedToPlayer,
  extractSharedFromPlayer,
  charDataOf,
};
