/* grant-starter-kit.js — aplica o set inicial retroativo (mesma regra do
 * grantMissingStarterItems em game/js/game.js) em TODOS os personagens do
 * banco de uma vez, sem esperar cada jogador logar.
 *
 * Uso:  node scripts/grant-starter-kit.js [--dry]
 *       --dry   só lista o que mudaria, sem gravar
 *
 * Regras (idênticas ao cliente):
 *   - backpack de 20 slots substitui a bag de 8 (antes dos itens, garante espaço)
 *   - knight:  jagged-sword, daramian-mace, steel-axe  + torch
 *   - druid:   chiller, spellbook-of-the-novice        + torch
 *   - sorcerer: scorcher, spellbook-of-the-novice      + torch
 *   - paladin: bow                                     + torch
 *   - monk:    simple-jo-staff                         + torch
 *   - instanciados -> itemInstances {loc:"bag"}; stackáveis -> bag[slug]
 *   - nunca substitui equipamento; não concede item já possuído
 *   - _starterKitV2 só marca quando TUDO couber/entrar (idempotente)
 *   - UPDATE usa save_version como guarda otimista: se o char salvou entre
 *     a leitura e a escrita (jogador online), pula — o cliente reaplica
 *     a mesma migração no próximo load de qualquer forma.
 */
"use strict";
const path = require("path");
const fs = require("fs");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const mysql = require("mysql2/promise");

const DRY = process.argv.indexOf("--dry") !== -1;

/* ------------------------------------------------ GAMEDATA (cliente) ---- */
const GAMEDATA = { items: {} };
(function loadItems() {
  const src = fs.readFileSync(
    path.join(__dirname, "..", "..", "game", "js", "gamedata.js"), "utf8");
  const window = {};
  new Function("window", src)(window);
  const items = (window.GAMEDATA && window.GAMEDATA.items) || {};
  for (const k of Object.keys(items)) GAMEDATA.items[k] = items[k];
  // START_EXTRA_ITEMS (supplies.js): registrados em runtime no browser.
  const extra = {
    "scorcher": { s: "weapon", t: "magic" },
    "chiller": { s: "weapon", t: "magic" },
    "simple-jo-staff": { s: "weapon", t: "fist" },
    "spellbook-of-the-novice": { s: "shield", t: "shield" },
    "simple-arrow": { s: "ammo", t: "ammo" },
  };
  for (const k in extra) if (!GAMEDATA.items[k]) GAMEDATA.items[k] = extra[k];
})();

/* ------------------------------------------- bag/instances (player.js) -- */
function isChargeStackableAccessory(slug) {
  const it = GAMEDATA.items[slug];
  if (!it || !it.charges) return false;
  if (it.s !== "ring" && it.s !== "amulet" && it.s !== "boots") return false;
  if (it.imbSlots) return false;
  return true;
}
function accessoryChargesArePartial(slug, charges) {
  const full = Math.floor(Number(GAMEDATA.items[slug] && GAMEDATA.items[slug].charges) || 0);
  if (!full) return false;
  if (charges === undefined || charges === null) return false;
  const n = Math.floor(Number(charges));
  return Number.isFinite(n) && n < full;
}
function itemUsesInstances(slug) {
  const it = GAMEDATA.items[slug];
  if (!it || !it.s || it.s === "ammo") return false;
  if (it.t === "distance" && !it.imbSlots) return false;
  if (isChargeStackableAccessory(slug)) return false;
  return true;
}
function backpackSlotsFor(slug) {
  const it = GAMEDATA.items[slug];
  return it && typeof it.slots === "number" ? it.slots : 8;
}
function bagSlots(p) {
  const bp = p.equip && p.equip.backpack;
  return backpackSlotsFor(bp && bp.item ? bp.item : "bag");
}
function bagUsedSlots(p) {
  let used = (p.itemInstances || []).filter((i) => i && i.loc === "bag").length;
  used += Object.keys(p.bag || {})
    .filter((s) => (p.bag[s] || 0) > 0 && !itemUsesInstances(s)).length;
  return used;
}
function syncBagCountsFromInstances(p) {
  p.bag = p.bag || {};
  const nextBag = {};
  for (const slug in p.bag) {
    if (!p.bag[slug] || itemUsesInstances(slug)) continue;
    nextBag[slug] = p.bag[slug];
  }
  const rest = [];
  for (const inst of (p.itemInstances || [])) {
    if (!inst || inst.loc !== "bag") { rest.push(inst); continue; }
    if (isChargeStackableAccessory(inst.slug)) {
      if (accessoryChargesArePartial(inst.slug, inst.charges)) { rest.push(inst); continue; }
      nextBag[inst.slug] = (nextBag[inst.slug] || 0) + 1;
      continue;
    }
    nextBag[inst.slug] = (nextBag[inst.slug] || 0) + 1;
    if (itemUsesInstances(inst.slug)) rest.push(inst);
  }
  p.bag = nextBag;
  p.itemInstances = rest;
}

/* -------------------------------------------------------- o grant ------- */
const KIT = {
  knight: ["jagged-sword", "daramian-mace", "steel-axe"],
  druid: ["chiller", "spellbook-of-the-novice"],
  sorcerer: ["scorcher", "spellbook-of-the-novice"],
  paladin: ["bow"],
  monk: ["simple-jo-staff"],
};

function grantStarter(p) {
  if (!p || typeof p !== "object" || p._starterKitV2) return null;
  p.bag = p.bag && typeof p.bag === "object" ? p.bag : {};
  p.equip = p.equip && typeof p.equip === "object" ? p.equip : {};
  p.itemInstances = Array.isArray(p.itemInstances) ? p.itemInstances : [];
  p._itemInstSeq = Math.max(0, Math.floor(Number(p._itemInstSeq) || 0));

  const changed = [];
  const has = (slug) => {
    for (const s in p.equip) if (p.equip[s] && p.equip[s].item === slug) return true;
    if ((p.bag[slug] || 0) > 0) return true;
    return p.itemInstances.some((i) => i && i.slug === slug && i.loc === "bag");
  };

  // backpack 20 slots antes dos itens — garante espaço para receber tudo
  if (!p.equip.backpack || p.equip.backpack.item === "bag") {
    p.equip.backpack = { item: "backpack", count: 1 };
    changed.push("backpack(equip)");
  }

  const faltam = ["torch"].concat(KIT[p.voc] || []).filter((s) => !has(s));
  let completo = true;
  for (const slug of faltam) {
    if (!GAMEDATA.items[slug]) { completo = false; continue; }
    if (itemUsesInstances(slug)) {
      if (bagUsedSlots(p) >= bagSlots(p)) { completo = false; continue; }
      const id = "it-" + (++p._itemInstSeq).toString(36) + "-" + Date.now().toString(36);
      p.itemInstances.push({ id, slug, loc: "bag", tier: 0 });
    } else {
      if (!(p.bag[slug] || 0) && bagUsedSlots(p) >= bagSlots(p)) { completo = false; continue; }
      p.bag[slug] = (p.bag[slug] || 0) + 1;
    }
    changed.push(slug);
  }
  syncBagCountsFromInstances(p);
  if (completo) p._starterKitV2 = true;
  return changed;
}

/* ------------------------------------------------------------ main ------ */
(async () => {
  const conn = await mysql.createConnection({
    host: process.env.MYSQL_HOST || "127.0.0.1",
    port: parseInt(process.env.MYSQL_PORT || "3306", 10),
    user: process.env.MYSQL_USER || "root",
    password: process.env.MYSQL_PASS || "",
    database: process.env.MYSQL_DB || "global_idle",
  });
  const [rows] = await conn.query(
    "SELECT id, account_id, name, voc, save_version, data FROM characters ORDER BY account_id, id");
  let updated = 0, already = 0, skipped = 0, raced = 0;
  for (const row of rows) {
    let p = null;
    try { p = typeof row.data === "string" ? JSON.parse(row.data) : row.data; }
    catch (e) { p = null; }
    if (!p) { skipped++; console.log("  skip (data inválido):", row.id, row.name); continue; }
    if (p._starterKitV2) { already++; continue; }
    const changed = grantStarter(p);
    if (changed === null) { already++; continue; }
    if (!DRY) {
      const [r] = await conn.query(
        "UPDATE characters SET data=? WHERE id=? AND save_version=?",
        [JSON.stringify(p), row.id, row.save_version]);
      if (!r.affectedRows) { raced++; console.log("  ~ race (save_version mudou):", row.id, row.name); continue; }
    }
    updated++;
    console.log("  ", row.id, row.name, "(" + (p.voc || row.voc) + ") <-",
      changed.length ? changed.join(", ") : "(só flag)");
  }
  console.log(`\n${DRY ? "[dry-run] " : ""}personagens: ${rows.length} | atualizados: ${updated} | já tinham: ${already} | inválidos: ${skipped} | races: ${raced}`);
  await conn.end();
})().catch((e) => { console.error("FALHOU:", e); process.exit(1); });
