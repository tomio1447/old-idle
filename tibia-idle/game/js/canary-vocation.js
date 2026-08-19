/* Vocação Canary 15.x: filtro de magias + regen passiva (hpGain/manaGain).
 * Usado pelo browser e pelo motor autoritativo — a mesma função nos dois. */
"use strict";
(function (root) {
  const BASE_VOC = {
    "elite knight": "knight", "royal paladin": "paladin",
    "elder druid": "druid", "master sorcerer": "sorcerer",
    "exalted monk": "monk",
  };
  const PROMOTED_VOC = {
    knight: "elite knight", paladin: "royal paladin",
    druid: "elder druid", sorcerer: "master sorcerer", monk: "exalted monk",
  };
  /* game/data/canary.json (vocations.xml do Canary). Ticks em ms. */
  const VOCATION_REGEN = {
    none: { hpTicks: 12000, hpAmount: 1, mpTicks: 6000, mpAmount: 2 },
    sorcerer: { hpTicks: 12000, hpAmount: 1, mpTicks: 3000, mpAmount: 2 },
    druid: { hpTicks: 12000, hpAmount: 1, mpTicks: 3000, mpAmount: 2 },
    paladin: { hpTicks: 8000, hpAmount: 1, mpTicks: 4000, mpAmount: 2 },
    knight: { hpTicks: 6000, hpAmount: 1, mpTicks: 6000, mpAmount: 2 },
    monk: { hpTicks: 6000, hpAmount: 1, mpTicks: 6000, mpAmount: 2 },
    "master sorcerer": { hpTicks: 12000, hpAmount: 1, mpTicks: 2000, mpAmount: 2 },
    "elder druid": { hpTicks: 12000, hpAmount: 1, mpTicks: 2000, mpAmount: 2 },
    "royal paladin": { hpTicks: 6000, hpAmount: 1, mpTicks: 3000, mpAmount: 2 },
    "elite knight": { hpTicks: 4000, hpAmount: 1, mpTicks: 6000, mpAmount: 2 },
    "exalted monk": { hpTicks: 4000, hpAmount: 1, mpTicks: 6000, mpAmount: 2 },
  };
  const FRIEND_HEALS = {
    druid: ["exura-gran-mas-res", "exura-gran-tio-sio", "exura-gran-sio", "exura-sio"],
    monk: ["exura-tio-sio"],
  };
  const DEFAULT_SELF_HEAL = {
    knight: "exura-med-ico", paladin: "exura-gran-san",
    druid: "exura-vita", sorcerer: "exura-vita", monk: "exura-gran",
  };
  /* Magia de outra vocação → equivalente (cura). Ataque sem mapa é removido. */
  const SPELL_REPLACE = {
    "exura-tio-sio": { druid: "exura-sio", monk: "exura-tio-sio" },
    "exura-mas-nia": { druid: "exura-gran-mas-res", monk: "exura-tio-sio" },
    "exura-sio": { monk: "exura-tio-sio", druid: "exura-sio" },
    "exura-gran-sio": { monk: "exura-tio-sio", druid: "exura-gran-sio" },
    "exura-gran-tio-sio": { monk: "exura-tio-sio", druid: "exura-gran-tio-sio" },
    "exura-gran-mas-res": { monk: "exura-tio-sio", druid: "exura-gran-mas-res" },
  };
  const SELF_HEAL_REPLACE = {
    "exura-tio-sio": {
      druid: "exura", sorcerer: "exura", paladin: "exura",
      knight: "exura-ico", monk: "exura-gran",
    },
    "exura-mas-nia": {
      druid: "exura-vita", sorcerer: "exura-vita", paladin: "exura-san",
      knight: "exura-ico", monk: "exura-gran",
    },
    "exura-sio": { druid: "exura-vita", monk: "exura-gran" },
    "exura-gran-sio": { druid: "exura-vita", monk: "exura-gran" },
    "exura-gran-tio-sio": { druid: "exura-vita", monk: "exura-gran" },
    "exura-gran-mas-res": { druid: "exura-vita", monk: "exura-gran" },
  };

  function baseVocName(voc) {
    const v = String(voc || "none").toLowerCase();
    return BASE_VOC[v] || v;
  }

  /* Idle balance: +15% base damage for Knight (incl. Elite Knight) and
   * Sorcerer / Master Sorcerer. Applied on top of existing vocation tweaks
   * (ex.: knight melee attack *1.3). Used for auto-attack AND spells. */
  const IDLE_BASE_DMG_MUL = { knight: 1.15, sorcerer: 1.15 };

  /* Spell-only idle extras: Monk +25% on attack spells (fist AA stays 1×).
   * Composes with IDLE_BASE_DMG_MUL so Knight/Sorcerer spells stay at 1.15. */
  const IDLE_SPELL_EXTRA_MUL = { monk: 1.25 };
  /* Knight attack spells: +25% no termo de level da fórmula (lvlMin/lvlMax). */
  const KNIGHT_SPELL_LEVEL_MUL = 1.25;

  function idleBaseDamageMul(voc) {
    const base = baseVocName(voc);
    const mul = IDLE_BASE_DMG_MUL[base];
    return mul > 0 ? mul : 1;
  }

  function idleSpellDamageMul(voc) {
    const base = baseVocName(voc);
    const extra = IDLE_SPELL_EXTRA_MUL[base];
    const e = extra > 0 ? extra : 1;
    return idleBaseDamageMul(voc) * e;
  }

  function knightSpellLevelMul(voc, s) {
    if (!s || s.type !== "attack") return 1;
    return baseVocName(voc) === "knight" ? KNIGHT_SPELL_LEVEL_MUL : 1;
  }

  function spellAllowedForVoc(s, voc) {
    if (!s) return false;
    const vocs = s.vocs;
    if (!Array.isArray(vocs) || !vocs.length) return false;
    const base = baseVocName(voc);
    const promoted = PROMOTED_VOC[base];
    for (let i = 0; i < vocs.length; i++) {
      const n = String(vocs[i] || "").toLowerCase();
      if (n === base || n === String(voc || "").toLowerCase() || (promoted && n === promoted))
        return true;
    }
    return false;
  }

  function friendHealSpellIds(voc) {
    return (FRIEND_HEALS[baseVocName(voc)] || []).slice();
  }

  function selfHealSpellIds(spells, voc) {
    const friend = {};
    const ids = friendHealSpellIds(voc);
    for (let i = 0; i < ids.length; i++) friend[ids[i]] = 1;
    const out = [];
    spells = spells || {};
    for (const id in spells) {
      const s = spells[id];
      if (!s || s.type !== "heal") continue;
      if (!spellAllowedForVoc(s, voc) || friend[id]) continue;
      out.push(id);
    }
    return out;
  }

  function resolveSpellId(id, voc, spells) {
    if (!id) return "";
    const s = spells && spells[id];
    if (s && spellAllowedForVoc(s, voc)) return id;
    const mapped = SPELL_REPLACE[id] && SPELL_REPLACE[id][baseVocName(voc)];
    if (mapped && spells && spells[mapped] && spellAllowedForVoc(spells[mapped], voc))
      return mapped;
    return "";
  }

  function sanitizePlayerSpells(p, spells) {
    if (!p || !p.config) return p;
    const voc = p.voc;
    const cfg = p.config;
    spells = spells || {};
    const friend = {};
    const friendIds = friendHealSpellIds(voc);
    for (let i = 0; i < friendIds.length; i++) friend[friendIds[i]] = 1;

    if (Array.isArray(cfg.combo)) {
      for (let i = 0; i < cfg.combo.length; i++) {
        const slot = cfg.combo[i];
        if (!slot || slot.kind !== "spell" || !slot.id) continue;
        const next = resolveSpellId(slot.id, voc, spells);
        const ns = next && spells[next];
        if (!ns || (ns.type !== "attack" && !ns.aggr)) cfg.combo[i] = null;
        else slot.id = next;
      }
    }
    if (Array.isArray(cfg.attackSpells)) {
      cfg.attackSpells = cfg.attackSpells.map((id) => resolveSpellId(id, voc, spells)).filter(Boolean);
    }
    if (cfg.shooterSpell) cfg.shooterSpell = resolveSpellId(cfg.shooterSpell, voc, spells);

    if (cfg.healSpell) {
      const sid = cfg.healSpell;
      const s = spells[sid];
      const ok = s && s.type === "heal" && spellAllowedForVoc(s, voc) && !friend[sid];
      if (!ok) {
        const mapped = (SELF_HEAL_REPLACE[sid] && SELF_HEAL_REPLACE[sid][baseVocName(voc)])
          || DEFAULT_SELF_HEAL[baseVocName(voc)] || "";
        cfg.healSpell = (mapped && spells[mapped] && spellAllowedForVoc(spells[mapped], voc)
          && !friend[mapped]) ? mapped : "";
      }
    }

    if (cfg.hasteSpell) cfg.hasteSpell = resolveSpellId(cfg.hasteSpell, voc, spells);
    if (cfg.buff) {
      const b = resolveSpellId(cfg.buff, voc, spells);
      cfg.buff = b || null;
    }

    if (cfg.healFriendSpells && typeof cfg.healFriendSpells === "object") {
      const next = {};
      for (const id of Object.keys(cfg.healFriendSpells)) {
        const dest = friend[id] ? id : resolveSpellId(id, voc, spells);
        if (!dest || !friend[dest]) continue;
        next[dest] = cfg.healFriendSpells[id];
      }
      cfg.healFriendSpells = next;
    }
    return p;
  }

  function vocationRegenSpec(p) {
    const voc = typeof p === "string" ? p : (p && p.voc);
    const promoted = typeof p === "object" && !!p && !!p.promoted;
    let key = baseVocName(voc);
    if (promoted && PROMOTED_VOC[key]) key = PROMOTED_VOC[key];
    else if (VOCATION_REGEN[String(voc || "").toLowerCase()])
      key = String(voc).toLowerCase();
    return VOCATION_REGEN[key] || VOCATION_REGEN.none;
  }

  function applyVocationRegen(acc, dt, spec) {
    acc = acc || { hp: 0, mp: 0 };
    dt = Math.max(0, Number(dt) || 0);
    spec = spec || VOCATION_REGEN.none;
    acc.hp = (Number(acc.hp) || 0) + dt;
    acc.mp = (Number(acc.mp) || 0) + dt;
    let hp = 0, mp = 0;
    const hpTicks = Math.max(1, Number(spec.hpTicks) || 12000);
    const mpTicks = Math.max(1, Number(spec.mpTicks) || 6000);
    const hpAmount = Math.max(0, Number(spec.hpAmount) || 0);
    const mpAmount = Math.max(0, Number(spec.mpAmount) || 0);
    while (acc.hp >= hpTicks) { acc.hp -= hpTicks; hp += hpAmount; }
    while (acc.mp >= mpTicks) { acc.mp -= mpTicks; mp += mpAmount; }
    return { hp, mp, acc };
  }

  function applyVocationRegenTo(holder, p, dt, max) {
    if (!holder || !p || p.hp <= 0 || !max) return { hp: 0, mp: 0 };
    holder.vocRegenAcc = holder.vocRegenAcc || { hp: 0, mp: 0 };
    const g = applyVocationRegen(holder.vocRegenAcc, dt, vocationRegenSpec(p));
    holder.vocRegenAcc = g.acc;
    if (g.hp) p.hp = Math.min(max.hp, (Number(p.hp) || 0) + g.hp);
    if (g.mp) p.mp = Math.min(max.mp, (Number(p.mp) || 0) + g.mp);
    return g;
  }

  const api = {
    BASE_VOC, PROMOTED_VOC, VOCATION_REGEN, FRIEND_HEALS, DEFAULT_SELF_HEAL,
    IDLE_BASE_DMG_MUL, IDLE_SPELL_EXTRA_MUL, KNIGHT_SPELL_LEVEL_MUL, baseVocName,
    idleBaseDamageMul, idleSpellDamageMul, knightSpellLevelMul,
    spellAllowedForVoc, friendHealSpellIds, selfHealSpellIds,
    resolveSpellId, sanitizePlayerSpells, vocationRegenSpec,
    applyVocationRegen, applyVocationRegenTo,
  };
  root.CanaryVocation = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
