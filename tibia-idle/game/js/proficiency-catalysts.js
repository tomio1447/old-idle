/* proficiency-catalysts.js — Catalisadores de Weapon Proficiency
 * (itens oficiais da TibiaWiki / Summer Update 2025).
 *
 * Lesser Proficiency Catalyst  (cid 51587) — +5.000 XP
 * Proficiency Catalyst         (cid 51588) — +25.000 XP
 * Greater Proficiency Catalyst (cid 51589) — +100.000 XP
 *
 * Oficial: o uso adiciona XP na proficiência da ARMA empunhada pelo
 * personagem alvo. O item sai da mochila compartilhada da conta.
 *
 * Compartilhado cliente/servidor: no browser os helpers vêm de
 * proficiency.js (globals); no Node usa-se o module.exports dele. */
"use strict";

const PROF_CATALYSTS = {
  "lesser-proficiency-catalyst": 5000,
  "proficiency-catalyst": 25000,
  "greater-proficiency-catalyst": 100000,
};

/* Item novo ausente dos patches de loot (o proficiency/greater já são
 * registrados por sir-leonard.js e norcferatus-fortress.js). Peso oficial
 * 2.5 oz (51588=5.0, 51589=7.5). Nenhum NPC compra → sell 0. */
const PROF_CATALYST_ITEMS = {
  "lesser-proficiency-catalyst": { n: "lesser proficiency catalyst", s: null, t: "loot", cid: 51587, w: 2.5, sell: 0, npcSell: 0 },
};

const PROF_MOD = (typeof module !== "undefined" && module.exports)
  ? (function () { try { return require("./proficiency.js"); } catch (e) { return null; } })()
  : null;

function profCatalystFn(name) {
  if (PROF_MOD && typeof PROF_MOD[name] === "function") return PROF_MOD[name];
  const g = typeof window !== "undefined" ? window
    : (typeof globalThis !== "undefined" ? globalThis : {});
  return typeof g[name] === "function" ? g[name] : null;
}

function proficiencyCatalystXp(slug) { return PROF_CATALYSTS[slug] || 0; }

/* Aplica o catalisador no personagem alvo: soma XP na proficiência da
 * arma que ele empunha. NÃO consome o item da mochila — o chamador cuida
 * do débito (compartilhado). Retorna { ok, weapon, gained, xp, levelUp, msg }. */
function proficiencyCatalystUse(p, slug) {
  const amt = proficiencyCatalystXp(slug);
  if (!p || !amt) return { ok: false, msg: "Item inválido." };
  const ensureProf = profCatalystFn("ensureProf");
  const prof = ensureProf ? ensureProf(p)
    : (p.prof = p.prof && typeof p.prof === "object" ? p.prof : { xp: {}, perks: {} });
  prof.xp = prof.xp && typeof prof.xp === "object" ? prof.xp : {};
  prof.perks = prof.perks && typeof prof.perks === "object" ? prof.perks : {};

  const equippedSlug = profCatalystFn("profEquippedSlug");
  const weapon = equippedSlug ? equippedSlug(p)
    : (p.equip && p.equip.weapon && p.equip.weapon.item) || null;
  if (!weapon) return { ok: false, msg: "O personagem precisa empunhar uma arma." };
  const hasTree = profCatalystFn("profHasTree");
  if (hasTree && !hasTree(weapon))
    return { ok: false, msg: "A arma empunhada não tem Weapon Proficiency." };

  const xpMaxFn = profCatalystFn("profXpMax");
  const max = xpMaxFn ? xpMaxFn(weapon) : Infinity;
  const lvlFn = profCatalystFn("profLevel");
  const cur = Number(prof.xp[weapon]) || 0;
  if (cur >= max) return { ok: false, msg: "A proficiência dessa arma já está no máximo." };

  const before = lvlFn ? lvlFn(p, weapon) : 0;
  const next = Math.min(max, cur + amt);
  prof.xp[weapon] = next;
  const after = lvlFn ? lvlFn(p, weapon) : 0;
  return { ok: true, weapon, gained: next - cur, xp: next, levelUp: after - before };
}

(function registerProfCatalysts() {
  if (typeof GAMEDATA === "undefined" || !GAMEDATA) return;
  const items = GAMEDATA.items || (GAMEDATA.items = {});
  for (const slug in PROF_CATALYST_ITEMS) {
    const def = PROF_CATALYST_ITEMS[slug];
    if (!items[slug]) items[slug] = def;
    else {
      if (def.cid != null && items[slug].cid == null) items[slug].cid = def.cid;
      if (def.w != null && items[slug].w == null) items[slug].w = def.w;
      if (def.n && !items[slug].n) items[slug].n = def.n;
      if (def.sell != null && items[slug].sell == null) items[slug].sell = def.sell;
      if (def.npcSell != null && items[slug].npcSell == null) items[slug].npcSell = def.npcSell;
    }
  }
})();

if (typeof module !== "undefined" && module.exports) {
  module.exports = { PROF_CATALYSTS, PROF_CATALYST_ITEMS,
    proficiencyCatalystXp, proficiencyCatalystUse };
}
