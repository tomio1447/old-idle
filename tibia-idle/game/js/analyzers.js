/* Analytics laterais em tempo real — estilo OTClient / Baiak Idle.
 *
 * Os analisadores vivem na coluna lateral do jogo. Trocar de aba nunca abre
 * o modal global nem interrompe o combate. Damage / Damage Taken agregam
 * hit+taken por personagem e por elemento a partir dos eventos já emitidos
 * (offline e online), sem campos extras no servidor.
 */
"use strict";

const OTC_ANALYSERS = [
  { id: "hunting", label: "Hunt Session", title: "Hunt Session Analyser", icon: "📈" },
  { id: "damage", label: "Damage", title: "Damage Analyser", icon: "⚔" },
  { id: "taken", label: "Damage Taken", title: "Damage Taken Analyser", icon: "🛡" },
  { id: "loot", label: "Loot", title: "Loot Analyser", icon: "🎒" },
  { id: "supply", label: "Supplies", title: "Supply Analyser", icon: "🧪" },
  { id: "drops", label: "Monsters", title: "Killed Monsters", icon: "☠" },
];

const OTC_DMG_ELEMENTS = [
  "physical", "fire", "ice", "earth", "energy", "holy", "death",
  "lifedrain", "manadrain", "agony", "drown",
];

const OTC_VOC_ABBR = {
  knight: "EK", paladin: "RP", druid: "ED", sorcerer: "MS", monk: "EM", none: "—",
};

let activeOtcAnalyser = "hunting";

function otcAnalyserDefinition(kind) {
  return OTC_ANALYSERS.find((entry) => entry.id === kind) || OTC_ANALYSERS[0];
}

function otcAnalyserNumber(value) {
  const n = Math.max(0, Math.round(Number(value) || 0));
  return typeof fmtFull === "function" ? fmtFull(n) : n.toLocaleString("pt-BR");
}

/* Fallback do valor de loot (NPC) quando player.js ainda não carregou — mesma regra. */
const OTC_ANALYSER_CURRENCY = { "gold-coin": 1, "platinum-coin": 100, "crystal-coin": 10000 };
function otcAnalyserLootUnitValue(slug) {
  if (typeof lootNpcUnitValue === "function") return lootNpcUnitValue(slug);
  const face = OTC_ANALYSER_CURRENCY[slug];
  if (face) return face;
  const it = (typeof GAMEDATA !== "undefined" && GAMEDATA.items) ? GAMEDATA.items[slug] : null;
  if (!it) return 0;
  const npc = Number(it.npcSell);
  if (npc > 0) return npc;
  const slot = it.s || it.slot || null;
  if (slot && slot !== "loot") return 0;
  return Math.max(0, Number(it.sell) || 0);
}
function otcAnalyserSessionLootValue(lootMap) {
  if (typeof sessionLootValue === "function") return sessionLootValue(lootMap);
  let total = 0;
  for (const slug of Object.keys(lootMap || {})) {
    const count = Math.max(0, Number(lootMap[slug]) || 0);
    if (!count) continue;
    total += otcAnalyserLootUnitValue(slug) * count;
  }
  return total;
}

function otcAnalyserEscape(value) {
  return String(value == null ? "" : value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char]);
}

function otcAnalyserDuration(c) {
  if (!c || !c.stats) return 0;
  const simulated = Math.max(0, Number(c.stats.time) || 0);
  if (simulated) return simulated;
  const startedAt = Number(c.stats.startedAt) || 0;
  return startedAt ? Math.max(0, Date.now() - startedAt) : 0;
}

function otcAnalyserClock(milliseconds) {
  const total = Math.max(0, Math.floor((Number(milliseconds) || 0) / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return [hours, minutes, seconds].map((n) => String(n).padStart(2, "0")).join(":");
}

function otcAnalyserRate(value, duration) {
  if (!duration) return 0;
  return (Number(value) || 0) * 3600000 / duration;
}

function otcAnalyserMetric(label, value, detail, cls) {
  return `<div class="otc-analyser-metric ${cls || ""}"><span>${label}</span><b>${value}</b>${detail ? `<small>${detail}</small>` : ""}</div>`;
}

function otcAnalyserItemName(id) {
  const mapped = { dust: "Dust", sliver: "Sliver", slivers: "Slivers", "exalted-core": "Exalted Core" };
  if (mapped[id]) return mapped[id];
  const name = typeof itemName === "function" ? itemName(id) : id;
  return otcAnalyserEscape(name || id);
}

function otcAnalyserItemIcon(id) {
  const OTC_ANALYSER_ITEM_SPRITES = {
    dust: "assets/item/dust.gif",
    sliver: "assets/item/sliver.gif",
    slivers: "assets/item/sliver.gif",
    "exalted-core": "assets/item/exalted-core.gif",
  };
  const src = OTC_ANALYSER_ITEM_SPRITES[id];
  if (src) {
    return `<img class="item-sprite" src="${src}" alt="" loading="lazy" style="max-width:18px;max-height:18px;width:auto;height:auto">`;
  }
  return typeof itemImg === "function" ? itemImg(id, 18) : "";
}

function otcAnalyserEmpty(message) {
  return `<div class="otc-analyser-empty"><b>Sem sessão ativa</b><span>${message}</span></div>`;
}

function otcAnalyserMonsterRows(stats) {
  return Object.entries((stats && stats.monsters) || {})
    .sort((a, b) => (Number(b[1].kills) || 0) - (Number(a[1].kills) || 0))
    .map(([slug, entry]) => {
      const kills = Math.max(0, Number(entry.kills) || 0);
      const rawExp = Math.max(0, Number(entry.rawExp) || 0);
      const rawHp = Math.max(0, Number(entry.rawHp) || 0);
      const eachExp = kills ? rawExp / kills : 0;
      const eachHp = kills ? rawHp / kills : 0;
      return `<div class="otc-analyser-line otc-monster-line">
        <span><b>${otcAnalyserEscape(entry.name || slug)}</b><small>${otcAnalyserNumber(eachExp)} raw XP · ${otcAnalyserNumber(eachHp)} HP</small></span>
        <strong>×${otcAnalyserNumber(kills)}</strong>
      </div>`;
    }).join("");
}

function otcAnalyserNormalizeElement(value) {
  if (typeof normalizedCombatElement === "function") return normalizedCombatElement(value);
  const raw = String(value || "physical").trim().toLowerCase().replace(/[ _]+/g, "-");
  const aliases = {
    phys: "physical", melee: "physical", physicaldamage: "physical",
    frost: "ice", electric: "energy", poison: "earth",
    holydamage: "holy", deathdamage: "death",
  };
  return aliases[raw] || raw;
}

function otcAnalyserVocAbbr(voc) {
  const key = String(voc || "none").toLowerCase();
  return OTC_VOC_ABBR[key] || String(voc || "—").toUpperCase().slice(0, 3);
}

function otcAnalyserElementIcon(el) {
  if (typeof dmgIconImg === "function") {
    const html = dmgIconImg(el, 14);
    if (html) return html;
  }
  const path = (typeof WIKI_DAMAGE_ICONS !== "undefined" && WIKI_DAMAGE_ICONS[el]) || null;
  if (!path) return `<span class="otc-dmg-el-fallback">${otcAnalyserEscape(el.slice(0, 1).toUpperCase())}</span>`;
  return `<img src="assets/ui/${path}" alt="" width="14" height="14" loading="lazy">`;
}

function otcAnalyserEnsureTrack(stats, key) {
  if (!stats) return null;
  if (!stats[key] || typeof stats[key] !== "object") {
    stats[key] = { startedAt: Date.now(), byPlayer: {} };
  }
  if (!stats[key].byPlayer || typeof stats[key].byPlayer !== "object") stats[key].byPlayer = {};
  if (!Number(stats[key].startedAt)) stats[key].startedAt = Number(stats.startedAt) || Date.now();
  return stats[key];
}

function otcAnalyserPlayerMeta(c, idHint) {
  const hint = idHint == null || idHint === "" ? "" : String(idHint);
  const ents = (c && Array.isArray(c.players) && c.players.length) ? c.players
    : (c && c.player ? [c.player] : []);
  let ent = hint
    ? ents.find((e) => String(e && (e.id !== undefined ? e.id : (e.p && e.p.id))) === hint)
    : null;
  if (!ent && ents.length === 1) ent = ents[0];
  const nested = ent && ent.p;
  const gp = (typeof G !== "undefined" && G && G.p) ? G.p : null;
  // Solo offline: c.player não tem id/p — usar G.p para casar com targetId=p.id
  // nos eventos taken (senão o total ia para "5" e a UI lia a chave "player").
  const id = String(
    (ent && ent.id !== undefined && ent.id !== null && ent.id !== "" ? ent.id : null)
    || (nested && nested.id)
    || hint
    || (gp && gp.id)
    || "player"
  );
  return {
    id,
    name: (nested && nested.name) || (ent && ent.name) || (gp && gp.name) || "Player",
    voc: (nested && nested.voc) || (ent && ent.voc) || (gp && gp.voc) || "none",
  };
}

function otcAnalyserEnsurePlayerBucket(track, meta) {
  const id = String(meta.id);
  let row = track.byPlayer[id];
  if (!row) {
    row = track.byPlayer[id] = { id, name: meta.name, voc: meta.voc, total: 0, byElement: {} };
  } else {
    if (meta.name) row.name = meta.name;
    if (meta.voc) row.voc = meta.voc;
  }
  return row;
}

function otcAnalyserAddToTrack(c, trackKey, playerId, element, amount) {
  if (!c || !c.stats) return;
  const dmg = Math.max(0, Math.round(Number(amount) || 0));
  if (!dmg) return;
  const track = otcAnalyserEnsureTrack(c.stats, trackKey);
  const meta = otcAnalyserPlayerMeta(c, playerId);
  const row = otcAnalyserEnsurePlayerBucket(track, meta);
  const el = otcAnalyserNormalizeElement(element);
  row.total = (Number(row.total) || 0) + dmg;
  row.byElement[el] = (Number(row.byElement[el]) || 0) + dmg;
}

/* Online o servidor não manda stats.damage/taken — espelha o total dos tracks
 * para Party Hunt Analyser. Offline o combat.js já soma; o max evita perda. */
function otcAnalyserSyncSessionScalars(c) {
  if (!c || !c.stats) return;
  const sum = (track) => Object.values((track && track.byPlayer) || {})
    .reduce((acc, row) => acc + (Number(row && row.total) || 0), 0);
  const dealt = sum(c.stats.damageTrack);
  const taken = sum(c.stats.takenTrack);
  if (dealt > 0) c.stats.damage = Math.max(Number(c.stats.damage) || 0, dealt);
  if (taken > 0) c.stats.taken = Math.max(Number(c.stats.taken) || 0, taken);
}

function otcAnalyserHitWhoId(e, activeId) {
  if (e && e.whoId != null && e.whoId !== "") return String(e.whoId);
  return String(activeId || "");
}

function otcAnalyserHitTargetKey(e) {
  if (!e) return "";
  if (e.targetId != null && e.targetId !== "") return String(e.targetId);
  if (e.mobId != null && e.mobId !== "") return String(e.mobId);
  return "";
}

function otcAnalyserHitSpellKey(e) {
  if (!e) return "";
  if (e.spellId != null && e.spellId !== "") return String(e.spellId);
  if (e.spell != null && e.spell !== "") return String(e.spell);
  if (e.rune != null && e.rune !== "") return String(e.rune);
  return "";
}

/* Par físico + elemental da mesma ação (arma híbrida / exori + elemento). */
function otcAnalyserDualPairable(a, b) {
  if (!a || !b || a.dual || !b.dual) return false;
  if (otcAnalyserHitWhoId(a, "") !== otcAnalyserHitWhoId(b, "")) return false;
  const ta = otcAnalyserHitTargetKey(a);
  const tb = otcAnalyserHitTargetKey(b);
  if (ta && tb && ta !== tb) return false;
  const sa = otcAnalyserHitSpellKey(a);
  const sb = otcAnalyserHitSpellKey(b);
  if (sa && sb && sa !== sb) return false;
  if (a.ts != null && b.ts != null && Number(a.ts) !== Number(b.ts)) return false;
  return true;
}

function otcAnalyserLookupSpellWords(spellId, spellName) {
  const data = (typeof SPELLDATA !== "undefined" && SPELLDATA) ? SPELLDATA : null;
  if (!data) return null;
  if (spellId && data[spellId]) {
    const s = data[spellId];
    return (s.words || s.name || spellId) || null;
  }
  if (!spellName) return null;
  const want = String(spellName).trim().toLowerCase();
  if (data[want]) {
    const s = data[want];
    return (s.words || s.name || want) || null;
  }
  for (const key of Object.keys(data)) {
    const s = data[key];
    if (!s) continue;
    if (String(s.name || "").toLowerCase() === want) return s.words || s.name || key;
    if (String(s.words || "").toLowerCase() === want) return s.words || s.name || key;
    if (String(s.id || "").toLowerCase() === want) return s.words || s.name || key;
  }
  return null;
}

function otcAnalyserHitTypeLabel(e) {
  if (!e) return "ataque básico";
  if (e.rune) {
    const rune = String(e.rune);
    const low = rune.toLowerCase();
    if (low.indexOf("sudden death") >= 0) return "SD";
    if (low.indexOf("ultimate explosion") >= 0) return "UE";
    if (low.indexOf("avalanche") >= 0) return "avalanche";
    return rune.replace(/\s*rune$/i, "").trim() || rune;
  }
  const words = otcAnalyserLookupSpellWords(e.spellId, e.spell);
  if (words) return String(words).toLowerCase();
  if (e.spell) return String(e.spell).toLowerCase();
  if (e.spellId) {
    return String(e.spellId).replace(/-/g, " ").toLowerCase();
  }
  return "ataque básico";
}

function otcAnalyserElementLabel(el) {
  const n = otcAnalyserNormalizeElement(el);
  if (n === "physical") return "fisico";
  return n;
}

function otcAnalyserMakeHitCandidate(parts, whoId, name) {
  const list = (parts || []).filter((p) => p && (Number(p.dmg) || 0) > 0);
  if (!list.length) return null;
  const total = list.reduce((sum, p) => sum + Math.max(0, Math.round(Number(p.dmg) || 0)), 0);
  if (!total) return null;
  const breakdown = list.map((p) => ({
    el: otcAnalyserNormalizeElement(p.el),
    dmg: Math.max(0, Math.round(Number(p.dmg) || 0)),
  }));
  const headline = breakdown.find((p) => p.el !== "physical") || breakdown[0];
  const src = list.find((p) => p.spell || p.spellId || p.rune) || list[0];
  return {
    total,
    el: headline.el,
    hitType: otcAnalyserHitTypeLabel(src),
    crit: list.some((p) => !!p.crit),
    fatal: list.some((p) => !!p.fatal),
    dual: breakdown.length > 1,
    parts: breakdown,
    whoId: String(whoId || ""),
    name: name || "Player",
  };
}

function otcAnalyserConsiderBestHit(track, candidate) {
  if (!track || !candidate || !(candidate.total > 0)) return;
  const cur = track.bestHit;
  if (!cur || candidate.total > cur.total) track.bestHit = candidate;
}

function otcAnalyserPendingPairEvent(pending) {
  if (!pending || !pending._src) return null;
  return pending._src;
}

function otcAnalyserIngestBestHits(track, hitEvents, combat, activeId) {
  if (!track || !hitEvents || !hitEvents.length) return;
  let pending = track._bestPending || null;
  track._bestPending = null;

  const holdPending = (candidate) => {
    if (pending) otcAnalyserConsiderBestHit(track, pending);
    pending = candidate || null;
  };

  for (const e of hitEvents) {
    const who = otcAnalyserHitWhoId(e, activeId);
    const meta = otcAnalyserPlayerMeta(combat, who);
    if (e.dual) {
      const src = otcAnalyserPendingPairEvent(pending);
      if (src && otcAnalyserDualPairable(src, Object.assign({}, e, { whoId: who }))) {
        const merged = otcAnalyserMakeHitCandidate([src, e], who, meta.name);
        if (merged) {
          if (pending.hitType && pending.hitType !== "ataque básico") merged.hitType = pending.hitType;
          otcAnalyserConsiderBestHit(track, merged);
        }
        pending = null;
      } else {
        holdPending(null);
        otcAnalyserConsiderBestHit(track, otcAnalyserMakeHitCandidate([e], who, meta.name));
      }
      continue;
    }
    const cand = otcAnalyserMakeHitCandidate([e], who, meta.name);
    if (!cand) continue;
    cand._src = Object.assign({}, e, { whoId: who });
    holdPending(cand);
  }
  if (pending) {
    // Conta provisoriamente; se o próximo lote trouxer o `dual`, sobe o total.
    otcAnalyserConsiderBestHit(track, pending);
    track._bestPending = pending;
  }
}

/* Consome hit/taken já emitidos (local ou online). Preferência: whoId no hit
 * e targetId no taken — fallback para o personagem ativo / solo. */
function otcAnalyserIngestEvents(events, combat) {
  const c = combat || ((typeof G !== "undefined" && G) ? G.combat : null);
  if (!c || !c.stats || !events || !events.length) return;
  const damageTrack = otcAnalyserEnsureTrack(c.stats, "damageTrack");
  otcAnalyserEnsureTrack(c.stats, "takenTrack");
  const activeId = c.player
    ? String(c.player.id !== undefined ? c.player.id : (c.player.p && c.player.p.id) || "")
    : "";
  const hitEvents = [];
  for (const e of events) {
    if (!e) continue;
    const amount = Math.max(0, Number(e.dmg) || 0);
    if (!amount) continue;
    if (e.t === "hit") {
      const who = otcAnalyserHitWhoId(e, activeId);
      otcAnalyserAddToTrack(c, "damageTrack", who, e.el, amount);
      hitEvents.push(e);
    } else if (e.t === "taken") {
      const victim = e.targetId != null && e.targetId !== "" ? e.targetId : activeId;
      otcAnalyserAddToTrack(c, "takenTrack", victim, e.el, amount);
    }
  }
  otcAnalyserIngestBestHits(damageTrack, hitEvents, c, activeId);
  otcAnalyserSyncSessionScalars(c);
}

function otcAnalyserResetTrack(kind) {
  const c = (typeof G !== "undefined" && G) ? G.combat : null;
  if (!c || !c.stats) return;
  const key = kind === "taken" ? "takenTrack" : "damageTrack";
  c.stats[key] = { startedAt: Date.now(), byPlayer: {} };
  if (kind === "taken") c.stats.taken = 0;
  else c.stats.damage = 0;
  if (typeof document !== "undefined") renderOtcAnalyser();
}

function otcAnalyserEnsureDeathBucket(track, meta) {
  const id = String(meta.id);
  let row = track.byPlayer[id];
  if (!row) {
    row = track.byPlayer[id] = {
      id, name: meta.name, voc: meta.voc, deaths: 0, blessGold: 0,
    };
  } else {
    if (meta.name) row.name = meta.name;
    if (meta.voc) row.voc = meta.voc;
    row.deaths = Math.max(0, Number(row.deaths) || 0);
    row.blessGold = Math.max(0, Number(row.blessGold) || 0);
  }
  return row;
}

function otcAnalyserLootEconBlock(stats) {
  const lootValue = otcAnalyserSessionLootValue((stats && stats.loot) || {});
  const supplySpent = Math.max(0, Number(stats && stats.supplyCost) || 0);
  const profit = lootValue - supplySpent;
  const profitCls = profit >= 0 ? "profit-pos" : "profit-neg";
  return `<div class="otc-loot-econ">
    <div class="otc-loot-econ-row"><span>Valor do loot</span><b>${otcAnalyserNumber(lootValue)} gp</b></div>
    <div class="otc-loot-econ-row"><span>Supply gasto</span><b>${otcAnalyserNumber(supplySpent)} gp</b></div>
    <div class="otc-loot-econ-row ${profitCls}"><span>Profit</span><b>${profit < 0 ? "-" : ""}${otcAnalyserNumber(Math.abs(profit))} gp</b></div>
  </div>`;
}

function otcAnalyserDeathSection(c, stats) {
  const track = (stats && stats.deathTrack && typeof stats.deathTrack === "object")
    ? stats.deathTrack : { byPlayer: {} };
  const rows = Object.values(track.byPlayer || {})
    .filter((row) => row && ((Number(row.deaths) || 0) > 0 || (Number(row.blessGold) || 0) > 0))
    .sort((a, b) => (Number(b.deaths) || 0) - (Number(a.deaths) || 0)
      || (Number(b.blessGold) || 0) - (Number(a.blessGold) || 0)
      || String(a.name || "").localeCompare(String(b.name || "")));
  const blessTotal = Math.max(0, Number(stats && stats.blessCost) || 0)
    || rows.reduce((sum, row) => sum + (Number(row.blessGold) || 0), 0);
  const lines = rows.map((row) => {
    const meta = otcAnalyserPlayerMeta(c, row.id);
    const name = otcAnalyserEscape(row.name || meta.name || "Player");
    const voc = otcAnalyserVocAbbr(row.voc || meta.voc);
    const deaths = otcAnalyserNumber(row.deaths);
    const bless = otcAnalyserNumber(row.blessGold);
    return `<div class="otc-analyser-line otc-death-line">
      <span><b>${name}</b><small>${voc}</small></span>
      <strong><em>${deaths}×</em><i>${bless} gp</i></strong>
    </div>`;
  }).join("");
  return `<div class="otc-analyser-section-title">Mortes / Bless</div>
    <div class="otc-death-legend"><span>Personagem</span><span>Mortes · Bless</span></div>
    ${lines || '<div class="tiny dim">Nenhuma morte nesta sessão.</div>'}
    <div class="otc-loot-econ otc-bless-total">
      <div class="otc-loot-econ-row"><span>Total gasto em bless</span><b>${otcAnalyserNumber(blessTotal)} gp</b></div>
    </div>`;
}

function otcAnalyserResetDeathTrack(c) {
  if (!c || !c.stats) return;
  c.stats.deaths = 0;
  c.stats.blessCost = 0;
  c.stats.deathTrack = { startedAt: Date.now(), byPlayer: {} };
}

/** Reset da sessão no header do painel (entre LIVE e minimizar). */
function otcAnalyserResetSession() {
  const kind = activeOtcAnalyser === "taken" ? "taken" : "damage";
  if (activeOtcAnalyser === "damage" || activeOtcAnalyser === "taken") {
    otcAnalyserResetTrack(kind);
    return;
  }
  const c = (typeof G !== "undefined" && G) ? G.combat : null;
  if (!c || !c.stats) return;
  c.stats.damageTrack = { startedAt: Date.now(), byPlayer: {} };
  c.stats.takenTrack = { startedAt: Date.now(), byPlayer: {} };
  c.stats.damage = 0;
  c.stats.taken = 0;
  otcAnalyserResetDeathTrack(c);
  if (typeof document !== "undefined") renderOtcAnalyser();
}

function bindOtcAnalyserSessionReset() {
  const btn = document.getElementById("otc-analyser-session-reset");
  if (!btn || btn.dataset.bound === "1") return;
  btn.dataset.bound = "1";
  btn.addEventListener("click", (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    otcAnalyserResetSession();
  });
}

function otcAnalyserBestHitLine(best) {
  if (!best || !(best.total > 0)) {
    return `<div class="otc-dmg-best"><span class="otc-dmg-best-label">Best session damage:</span><span class="otc-dmg-best-value">—</span></div>`;
  }
  const name = otcAnalyserEscape(best.name || "Player");
  const total = otcAnalyserNumber(best.total);
  const el = otcAnalyserEscape(best.el || "physical");
  let hitType = otcAnalyserEscape(best.hitType || "ataque básico");
  if (best.dual && Array.isArray(best.parts) && best.parts.length > 1) {
    const bits = best.parts.map((p) =>
      `${otcAnalyserNumber(p.dmg)} ${otcAnalyserEscape(otcAnalyserElementLabel(p.el))}`).join(" + ");
    hitType += ` (${bits})`;
  }
  const badges = [];
  if (best.crit) badges.push("Critical");
  if (best.fatal) badges.push("Onslaught");
  const badgeHtml = badges.length
    ? ` <span class="otc-dmg-best-badges">· ${badges.map(otcAnalyserEscape).join(" · ")}</span>`
    : "";
  return `<div class="otc-dmg-best">
    <span class="otc-dmg-best-label">Best session damage:</span>
    <span class="otc-dmg-best-value">${name} - ${total} - ${el} - ${hitType}${badgeHtml}</span>
  </div>`;
}

function otcAnalyserTrackDuration(track, c) {
  // Preferir o tempo da hunt (igual XP/kills). Fallback: relógio do track.
  const session = otcAnalyserDuration(c);
  if (session > 0) return session;
  const started = Number(track && track.startedAt) || 0;
  if (started) return Math.max(0, Date.now() - started);
  return 0;
}

/* Resolve o bucket do personagem, fundindo aliases (p.id vs "player" no solo). */
function otcAnalyserRowForMeta(track, meta, partySize) {
  const byPlayer = (track && track.byPlayer) || {};
  const ids = [];
  const pushId = (value) => {
    const id = value == null || value === "" ? "" : String(value);
    if (!id || ids.indexOf(id) >= 0) return;
    ids.push(id);
  };
  pushId(meta && meta.id);
  if ((Number(partySize) || 0) <= 1) {
    if (typeof G !== "undefined" && G && G.p && G.p.id != null) pushId(G.p.id);
    pushId("player");
  }
  let total = 0;
  const byElement = {};
  let name = meta && meta.name;
  let voc = meta && meta.voc;
  for (const id of ids) {
    const row = byPlayer[id];
    if (!row) continue;
    if (row.name) name = row.name;
    if (row.voc) voc = row.voc;
    total += Number(row.total) || 0;
    for (const el of Object.keys(row.byElement || {})) {
      byElement[el] = (Number(byElement[el]) || 0) + (Number(row.byElement[el]) || 0);
    }
  }
  return {
    id: meta && meta.id, name: name || "Player", voc: voc || "none",
    total, byElement,
  };
}

function otcAnalyserOrderedElements(byElement) {
  const keys = Object.keys(byElement || {}).filter((el) => (Number(byElement[el]) || 0) > 0);
  keys.sort((a, b) => {
    const ia = OTC_DMG_ELEMENTS.indexOf(a);
    const ib = OTC_DMG_ELEMENTS.indexOf(b);
    const ra = ia < 0 ? 999 : ia;
    const rb = ib < 0 ? 999 : ib;
    if (ra !== rb) return ra - rb;
    return (Number(byElement[b]) || 0) - (Number(byElement[a]) || 0);
  });
  return keys;
}

function otcAnalyserPartyRows(c) {
  if (c && Array.isArray(c.players) && c.players.length) {
    return c.players.map((ent) => otcAnalyserPlayerMeta(c, ent.id !== undefined ? ent.id : (ent.p && ent.p.id)));
  }
  return [otcAnalyserPlayerMeta(c, c && c.player && (c.player.id !== undefined ? c.player.id : (c.player.p && c.player.p.id)))];
}

function otcAnalyserDamageBody(kind, c) {
  const trackKey = kind === "taken" ? "takenTrack" : "damageTrack";
  const track = otcAnalyserEnsureTrack(c.stats, trackKey);
  const duration = otcAnalyserTrackDuration(track, c);
  const party = otcAnalyserPartyRows(c);
  const rateLabel = kind === "taken" ? "taken/h" : "damage/h";

  let blocks = "";
  for (const meta of party) {
    const row = otcAnalyserRowForMeta(track, meta, party.length);
    const total = Math.max(0, Number(row.total) || 0);
    const perHour = otcAnalyserRate(total, duration);
    const label = `${otcAnalyserEscape(row.name || meta.name)} - ${otcAnalyserVocAbbr(row.voc || meta.voc)}`;
    const elements = otcAnalyserOrderedElements(row.byElement);
    const elRows = elements.map((el) => {
      const amount = Math.max(0, Number(row.byElement[el]) || 0);
      const pct = total > 0 ? Math.round((amount * 100) / total) : 0;
      return `<div class="otc-dmg-el">
        ${otcAnalyserElementIcon(el)}
        <strong>${otcAnalyserNumber(amount)}</strong>
        <span>(${pct}%)</span>
      </div>`;
    }).join("");
    // Total da sessão em primeiro (como XP/kills); /h é só taxa.
    blocks += `<div class="otc-dmg-char">
      <div class="otc-dmg-char-head">
        <span>${label}</span>
        <b title="${rateLabel}">${otcAnalyserNumber(total)} · ${otcAnalyserNumber(perHour)}/h</b>
      </div>
      <div class="otc-dmg-els">${elRows || '<div class="tiny dim">Sem dano registrado.</div>'}</div>
    </div>`;
  }

  const bestFooter = kind === "damage" ? otcAnalyserBestHitLine(track.bestHit) : "";

  return `<div class="otc-dmg-panel" data-otc-dmg-kind="${kind}">
    <div class="otc-dmg-toolbar">
      <span class="otc-dmg-session">Session <em>${otcAnalyserClock(duration)}</em></span>
    </div>
    ${blocks || '<div class="tiny dim">Aguardando combate.</div>'}
    ${bestFooter}
  </div>`;
}

function otcAnalyserBody(kind, c) {
  if (!c || !c.stats) return otcAnalyserEmpty("Inicie uma caçada para registrar as estatísticas em tempo real.");
  const stats = c.stats;
  const duration = Math.max(0, otcAnalyserDuration(c));
  const rate = (value) => otcAnalyserNumber(otcAnalyserRate(value, duration));
  const exp = Math.max(0, Number(stats.exp) || 0);
  const rawExp = Math.max(0, Number(stats.rawExp) || 0);
  const rawHp = Math.max(0, Number(stats.rawHp) || 0);
  const kills = Math.max(0, Number(stats.kills) || 0);
  const hunt = c.hunt || (typeof GAMEDATA !== "undefined" && GAMEDATA.hunts ? GAMEDATA.hunts[c.huntId] : null);
  const huntName = (c.boss && c.boss.name) || (hunt && hunt.name) || c.huntId || "Caçada";
  const mode = c.instanceMode || "non-pvp";
  const monsterRows = otcAnalyserMonsterRows(stats);

  if (kind === "hunting") {
    const efficiency = rawHp > 0 ? (rawExp / rawHp).toFixed(3) : "0.000";
    return `<div class="otc-session-head">
        <span><b>${otcAnalyserEscape(huntName)}</b><small>${otcAnalyserEscape(mode)}</small></span>
        <em><i></i> AO VIVO</em>
      </div>
      <div class="otc-analyser-grid">
        ${otcAnalyserMetric("Sessão", otcAnalyserClock(duration), "tempo de combate")}
        ${otcAnalyserMetric("Kills", otcAnalyserNumber(kills), `${rate(kills)}/h`)}
        ${otcAnalyserMetric("XP obtida", otcAnalyserNumber(exp), "na sessão", "xp-gained")}
        ${otcAnalyserMetric("XP/h", rate(exp), "com bônus", "xp-gained")}
        ${otcAnalyserMetric("Raw XP", otcAnalyserNumber(rawExp), "na sessão", "raw-xp")}
        ${otcAnalyserMetric("Raw XP/h", rate(rawExp), "sem bônus", "raw-xp")}
        ${otcAnalyserMetric("Gold", otcAnalyserNumber(stats.gold), `${rate(stats.gold)}/h`, "gold")}
        ${otcAnalyserMetric("Raw XP/HP", efficiency, "eficiência base", "raw-ratio")}
      </div>
      ${otcAnalyserLootEconBlock(stats)}
      ${otcAnalyserDeathSection(c, stats)}
      <div class="otc-raw-note"><b>Raw XP/h</b> usa somente a EXP original dos monstros. Não soma stage, PvP, Prey, VIP, Soul War ou bônus de party.</div>
      <div class="otc-analyser-section-title">Monstros abatidos</div>
      ${monsterRows || '<div class="tiny dim">Aguardando o primeiro abate.</div>'}`;
  }

  if (kind === "damage" || kind === "taken") return otcAnalyserDamageBody(kind, c);

  if (kind === "loot" || kind === "supply") {
    const source = kind === "loot" ? stats.loot : stats.supplyUsed;
    const rows = Object.entries(source || {}).sort((a, b) => Number(b[1]) - Number(a[1])).map(([id, amount]) =>
      `<div class="otc-analyser-line">${otcAnalyserItemIcon(id)}<span>${otcAnalyserItemName(id)}</span><strong>${otcAnalyserNumber(amount)}</strong></div>`
    ).join("");
    if (kind === "supply") {
      return `<div class="otc-analyser-summary">Custo registrado: <b>${otcAnalyserNumber(stats.supplyCost)} gp</b></div>${rows || `<div class="tiny dim">Nenhum supply registrado.</div>`}`;
    }
    return `${otcAnalyserLootEconBlock(stats)}${rows || `<div class="tiny dim">Nenhum loot registrado.</div>`}`;
  }

  return monsterRows || '<div class="tiny dim">Nenhum monstro abatido nesta sessão.</div>';
}

function renderOtcAnalysers() {
  const tabs = document.getElementById("otc-analysers");
  if (!tabs) return;
  if (activeOtcAnalyser === "xp" || activeOtcAnalyser === "impact") activeOtcAnalyser = "hunting";
  tabs.innerHTML = OTC_ANALYSERS.map((entry) =>
    `<button type="button" class="otc-analyser-btn${entry.id === activeOtcAnalyser ? " active" : ""}"
      role="tab" aria-selected="${entry.id === activeOtcAnalyser}" data-otc-analyser="${entry.id}" title="${entry.title}">
      <span aria-hidden="true">${entry.icon}</span>${entry.label}</button>`).join("");
  tabs.querySelectorAll("[data-otc-analyser]").forEach((button) =>
    button.addEventListener("click", () => openOtcAnalyser(button.dataset.otcAnalyser)));
  renderOtcAnalyser();
}

function renderOtcAnalyser() {
  const content = document.getElementById("otc-analyser-content");
  if (!content) return;
  const combat = (typeof G !== "undefined" && G) ? G.combat : null;
  const definition = otcAnalyserDefinition(activeOtcAnalyser);
  const title = document.getElementById("otc-analyser-title");
  if (title) title.textContent = `${definition.icon} ${definition.title}`;
  const nextHtml = otcAnalyserBody(activeOtcAnalyser, combat);
  if (content.innerHTML !== nextHtml) {
    const scrollTop = content.scrollTop;
    content.innerHTML = nextHtml;
    content.scrollTop = scrollTop;
  }
  bindOtcAnalyserSessionReset();
}

/* API mantida para os botões existentes, agora direcionada ao painel lateral. */
function openOtcAnalyser(kind) {
  activeOtcAnalyser = otcAnalyserDefinition(kind).id;
  const tabs = document.getElementById("otc-analysers");
  if (tabs) tabs.querySelectorAll("[data-otc-analyser]").forEach((button) => {
    const selected = button.dataset.otcAnalyser === activeOtcAnalyser;
    button.classList.toggle("active", selected);
    button.setAttribute("aria-selected", String(selected));
  });
  renderOtcAnalyser();
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    OTC_ANALYSERS, OTC_DMG_ELEMENTS, OTC_VOC_ABBR,
    otcAnalyserNormalizeElement, otcAnalyserVocAbbr, otcAnalyserRate,
    otcAnalyserIngestEvents, otcAnalyserEnsureTrack, otcAnalyserAddToTrack,
    otcAnalyserOrderedElements, otcAnalyserDamageBody, otcAnalyserNumber,
    otcAnalyserHitTypeLabel, otcAnalyserMakeHitCandidate, otcAnalyserDualPairable,
    otcAnalyserBestHitLine, otcAnalyserConsiderBestHit, otcAnalyserIngestBestHits,
    otcAnalyserLootUnitValue, otcAnalyserSessionLootValue, otcAnalyserBody,
    otcAnalyserLootEconBlock, otcAnalyserDeathSection, otcAnalyserResetDeathTrack,
    otcAnalyserResetTrack, otcAnalyserResetSession, otcAnalyserRowForMeta,
    otcAnalyserPlayerMeta, otcAnalyserSyncSessionScalars,
  };
}

if (typeof document !== "undefined") {
  const bootAnalysers = () => {
    bindOtcAnalyserSessionReset();
    renderOtcAnalysers();
  };
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", bootAnalysers);
  else bootAnalysers();
}
