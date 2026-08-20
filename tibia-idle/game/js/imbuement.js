/*
 * imbuement.js — sistema de imbuements, agora 100% orientado pelos dados
 * oficiais do Canary (game/js/imbuementdata.js, gerado de
 * tools/data/canary-imbuements.xml do opentibiabr/canary):
 *
 *  - precos por base: Basic 5k / Intricate 30k / Powerful 200k (gold)
 *  - protection charm: +10k/+30k/+50k para GARANTIR a aplicacao
 *  - chance de sucesso: 90% / 70% / 50% — na falha os itens E o gold sao
 *    consumidos (comportamento do servidor, protocolgame: o dinheiro e os
 *    creature products sao removidos antes do roll)
 *  - remover um imbuement custa 15000 gp (removecost)
 *  - duracao: 72000 SEGUNDOS (20h) de TEMPO DE COMBATE. No idle, o relogio
 *    so anda enquanto o jogador esta em combate (como no global, que drena
 *    apenas em fight). Fica salvo como `rest` em ms e e tickado no loop.
 *
 * Efeitos: leem o `effect` oficial de cada tier (damage/reduction/skill/
 * speed/capacity/paralysis). Vibrancy (paralysis) nao tem mecanica de
 * paralisia no jogo — fica disponivel na UI com a descricao oficial, porem
 * SEM efeito de combate (anotado como N/A, nada inventado).
 */
"use strict";

/* Nomes por categoria (igual ao XML; mantido para telas antigas) */
const IMB_CATEGORIA = {
  0:  { id: "elemental", nome: "Dano Elemental" },
  1:  { id: "lifeleech", nome: "Life Leech" },
  2:  { id: "manaleech", nome: "Mana Leech" },
  3:  { id: "critical",  nome: "Critical Hit" },
  4:  { id: "prot-death",nome: "Proteção (Morte)" },
  5:  { id: "prot-earth",nome: "Proteção (Terra)" },
  6:  { id: "prot-fire", nome: "Proteção (Fogo)" },
  7:  { id: "prot-ice",  nome: "Proteção (Gelo)" },
  8:  { id: "prot-energy",nome:"Proteção (Energia)" },
  9:  { id: "prot-holy", nome: "Proteção (Sagrado)" },
  10: { id: "speed",     nome: "Velocidade" },
  11: { id: "skill-axe", nome: "Machado" },
  12: { id: "skill-sword",nome:"Espada" },
  13: { id: "skill-club",nome: "Clava" },
  14: { id: "skill-shield",nome:"Escudo" },
  15: { id: "skill-dist",nome: "Distância" },
  16: { id: "skill-magic",nome:"Magic Level" },
  17: { id: "capacity",  nome: "Capacidade" },
  18: { id: "skill-fist",nome: "Punho" },
  19: { id: "vibrancy",  nome: "Vibrancy (N/A no jogo)" },
};

const IMB_TIER_NOME = ["Basic", "Intricate", "Powerful"];

/* Duracao oficial: bases[1].duration segundos (72000 = 20h) */
const IMB_DURACAO_MS = (typeof IMBDATA !== "undefined"
  ? IMBDATA.bases[1].duration : 72000) * 1000;

/* Chave canonica de um imbuement aplicado: "Scorch|fire" */
function imbKeyOf(group) {
  return group.sub ? group.name + "|" + group.sub : group.name;
}
function imbFindGroup(key) {
  if (typeof IMBDATA === "undefined") return null;
  for (const k of Object.keys(IMBDATA.imbs)) {
    const g = IMBDATA.imbs[k];
    if (imbKeyOf(g) === key) return g;
  }
  return null;
}

/* Nome e icone de um imbuement aplicado (iconId oficial do XML) */
function imbVisual(im) {
  const g = im && imbFindGroup(im.key);
  if (!g) return { nome: "?", icon: 0 };
  return { nome: g.name, icon: g.icon };
}

/* ---------- tempo (apenas combate; ver header) ---------- */
function imbRestante(im) {
  if (!im) return 0;
  if (im.rest === undefined) {
    // migracao de saves antigos: ate absoluto -> rest
    if (im.ate) im.rest = Math.max(0, im.ate - Date.now());
    else im.rest = IMB_DURACAO_MS;
    delete im.ate;
  }
  return Math.max(0, im.rest);
}
function imbExpirado(im) {
  return im ? imbRestante(im) <= 0 : false;
}
/* Tick global: desconta dt de TODOS os imbuements ativos do jogador.
 * Agora eles estao na instancia do item (chave inst:<instId>), mas so
 * descontam tempo enquanto a instancia estiver equipada. */
function imbTickAll(p, dt) {
  if (!p || !p.imbuements || !p.equip) return;
  const instMap = {};
  for (const slot of Object.keys(p.equip || {})) {
    const e = p.equip[slot];
    if (e && e.instId) instMap[e.instId] = slot;
  }
  for (const k of Object.keys(p.imbuements)) {
    if (k.indexOf("inst:") !== 0) continue;
    const instId = k.slice(5);
    if (!instMap[instId]) continue;
    for (const im of p.imbuements[k])
      if (imbRestante(im) > 0) im.rest = Math.max(0, imbRestante(im) - dt);
  }
}
function imbTempoTexto(ms) {
  if (ms <= 0) return "expirado";
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (h > 0) return h + "h " + String(m).padStart(2, "0") + "m";
  if (m > 0) return m + "m";
  return Math.max(1, Math.floor(ms / 1000)) + "s";
}

/* Skill cat por tipo de arma (XML Canary / TibiaWiki Imbuing). */
const IMB_SKILL_CAT = { axe: 11, sword: 12, club: 13, distance: 15, fist: 18 };
const IMB_PROT_CAT_EL = {
  4: "death", 5: "earth", 6: "fire", 7: "ice", 8: "energy", 9: "holy",
};
/* Wands/rods que aceitam Strike (Critical) além de Void + Epiphany.
 * Lista do TibiaWiki / shrine oficial — o restante das magias NÃO leva
 * Vampirism nem Strike. */
const IMB_STRIKE_MAGIC = {
  "falcon-wand": 1, "falcon-rod": 1,
  "wand-of-destruction": 1, "rod-of-destruction": 1,
  "cobra-wand": 1, "cobra-rod": 1,
  "lion-wand": 1, "lion-rod": 1,
  "naga-wand": 1, "naga-rod": 1,
  "jungle-wand": 1, "jungle-rod": 1,
  "soulhexer": 1, "soultainter": 1,
  "eldritch-wand": 1, "eldritch-rod": 1,
  "gilded-eldritch-wand": 1, "gilded-eldritch-rod": 1,
  "amber-wand": 1, "amber-rod": 1,
  "sanguine-coil": 1, "sanguine-rod": 1,
  "grand-sanguine-coil": 1, "grand-sanguine-rod": 1,
};

function imbItemDef(itemSlug) {
  const gd = (typeof GAMEDATA !== "undefined" && GAMEDATA.items) || {};
  return gd[itemSlug] || {};
}

/* Categorias permitidas no shrine, iguais ao client Canary / Tibia global.
 * Escudo NÃO recebe Life Leech. Wand/rod NÃO recebe Vampirism. Proteção
 * nativa do mesmo elemento, life/mana leech nativo e dano elemental nativo
 * bloqueiam a categoria correspondente. */
function imbSlotCats(slot, itemSlug) {
  const it = imbItemDef(itemSlug);
  const t = it.t || it.type || "";
  let cats = [];
  if (slot === "weapon") {
    if (t === "distance") {
      cats = it.th ? [0, 1, 2, 3, 15] : [1, 2, 3, 15];
    } else if (t === "magic") {
      cats = [2, 16];
      if (IMB_STRIKE_MAGIC[itemSlug]) cats.push(3);
    } else {
      cats = [0, 1, 2, 3, IMB_SKILL_CAT[t] || 12];
    }
  } else if (slot === "shield") {
    if (t === "spellbook") cats = [4, 5, 6, 7, 8, 9, 14, 16];
    else if (t === "quiver") cats = [];
    else cats = [4, 5, 6, 7, 8, 9, 14];
  } else if (slot === "armor") {
    cats = [1, 4, 5, 6, 7, 8, 9];
  } else if (slot === "helmet") {
    cats = [2, 11, 12, 13, 14, 15, 16, 18];
  } else if (slot === "boots") {
    cats = [10, 19];
  } else if (slot === "backpack") {
    cats = [17];
  }
  const res = it.res || {};
  return cats.filter((cat) => {
    const el = IMB_PROT_CAT_EL[cat];
    if (el && Number(res[el]) > 0) return false;
    if (cat === 1 && Number(it.lifeLeech) > 0) return false;
    if (cat === 2 && Number(it.manaLeech) > 0) return false;
    if (cat === 0 && (it.el || it.elDmg)) return false;
    return true;
  });
}

function imbCatAllowedOn(slot, itemSlug, cat) {
  return imbSlotCats(slot, itemSlug).indexOf(cat) >= 0;
}

function imbKeyAllowedOn(slot, itemSlug, key) {
  const g = imbFindGroup(key);
  return !!(g && imbCatAllowedOn(slot, itemSlug, g.cat));
}

/* ---------- alvo: imbuements agora moram no item (instId), nao no slot ---------- */
function imbSlotsOf(slug) {
  const it = GAMEDATA.items[slug];
  return it && it.imbSlots ? it.imbSlots : 0;
}
function imbStoreKey(slot, instId) { return instId ? "inst:" + instId : "equip:" + slot; }
function imbSlotInstId(p, slot) {
  const e = p && p.equip && p.equip[slot];
  return e && e.instId ? e.instId : null;
}
function imbOf(p, slot) {
  p.imbuements = p.imbuements || {};
  imbMigrateLegacy(p);
  const instId = imbSlotInstId(p, slot);
  // fallback antigo: sem instId ainda usa slot (itens sem instancia)
  return p.imbuements[imbStoreKey(slot, instId)] || [];
}

/* Saves antigos guardavam {cat, tier(0-based), sub, ate}; agora e
 * {key, tier(1-based, id da base), rest}. Converte uma unica vez.
 * Alem disso, migra chaves "equip:<slot>" legadas para "inst:<instId>"
 * quando o slot tiver uma instancia. */
function imbMigrateLegacy(p) {
  if (p._imbMigrated) return;
  p._imbMigrated = true;
  if (!p.imbuements || typeof IMBDATA === "undefined") return;
  const out = {};
  for (const k of Object.keys(p.imbuements)) {
    const lista = (p.imbuements[k] || []).map((im) => {
      if (im.key !== undefined) return im;
      let key = null;
      for (const gk of Object.keys(IMBDATA.imbs)) {
        const g = IMBDATA.imbs[gk];
        if (g.cat !== im.cat) continue;
        if (g.cat === 0 || g.sub) {
          if ((g.sub || "") === (im.sub || "")) { key = imbKeyOf(g); break; }
        } else { key = imbKeyOf(g); break; }
      }
      if (!key) return null;
      const rest = im.ate ? Math.max(0, im.ate - Date.now()) : IMB_DURACAO_MS;
      return { key: key, tier: (im.tier || 0) + 1, rest: rest };
    }).filter(Boolean);
    if (!lista.length) continue;
    if (k.indexOf("equip:") === 0) {
      const slot = k.slice(6);
      const instId = imbSlotInstId(p, slot);
      if (instId) {
        out["inst:" + instId] = (out["inst:" + instId] || []).concat(lista);
      } else {
        out[k] = lista;
      }
    } else {
      out[k] = lista;
    }
  }
  p.imbuements = out;
}

/* ---------- custo em materiais (do XML oficial) ---------- */
function imbMats(key, tier) {
  const g = imbFindGroup(key);
  if (!g || !g.tiers[tier]) return [];
  return g.tiers[tier].items.map(([id, cnt]) => {
    const info = (typeof IMB_MATS !== "undefined" && IMB_MATS[id]) || null;
        return {
      id: id, count: cnt,
      name: info ? info.name : (IMBDATA.mats[id] || "item " + id),
      npc: info ? info.npc : 0,
      drops: info ? info.drops : [],
      have: 0, // preenchido pela UI com o lootPouch do jogador
    };
  });
}
function imbHaveMats(p, key, tier) {
  for (const m of imbMats(key, tier)) {
    if (((p.lootPouch || {})["mat-" + m.id] || 0) < m.count) return false;
  }
  return true;
}
function imbCusto(key, tier, protection) {
  if (typeof IMBDATA === "undefined") return { price: 0, pct: 100, prot: 0 };
  const b = IMBDATA.bases[tier];
  let price = b.price;
  if (protection) price += b.protection;
  return { price: price, pct: protection ? 100 : b.pct, prot: protection ? b.protection : 0 };
}

/* ---------- aplicar ---------- */
function imbAdd(p, slot, key, tier, protection) {
  const e = p.equip[slot];
  if (!e) return { ok: false, msg: "Nada equipado nesse slot." };
  const max = imbSlotsOf(e.item);
  if (!max) return { ok: false, msg: "Este item não aceita imbuement." };
  const g = imbFindGroup(key);
  if (!g || !g.tiers[tier]) return { ok: false, msg: "Imbuement desconhecido." };
  if (!imbCatAllowedOn(slot, e.item, g.cat))
    return { ok: false, msg: "Este imbuement não pode ser aplicado neste item." };
  const lista = imbOf(p, slot);
  if (lista.length >= max)
    return { ok: false, msg: `Só cabem ${max} imbuement(s) neste item.` };
  if (lista.some((x) => x.key === key))
    return { ok: false, msg: "Já existe esse imbuement no item." };
  if (lista.some((x) => {
    const og = imbFindGroup(x.key);
    return og && og.cat === g.cat;
  }))
    return { ok: false, msg: "Já existe um imbuement desta categoria no item." };
  if (!imbHaveMats(p, key, tier))
    return { ok: false, msg: "Faltam materiais na loot pouch." };
  const custo = imbCusto(key, tier, protection);
  if (p.gold < custo.price)
    return { ok: false, msg: `Faltam ${fmtFull(custo.price - p.gold)} gp.` };

  // consome TUDO antes do roll (comportamento do servidor: money + itens)
  for (const m of imbMats(key, tier))
    removeLootPouch(p, "mat-" + m.id, m.count);
  p.gold -= custo.price;

  const roll = Math.random() * 100;
  if (roll >= custo.pct)
    return { ok: false, failed: true, cost: custo.price,
             msg: "A imbuiação FALHOU! Os materiais e o gold foram perdidos (" +
                  custo.pct + "% de chance)." };

  const instId = e.instId || null;
  const nova = lista.concat([{ key: key, tier: tier, rest: IMB_DURACAO_MS }]);
  p.imbuements = p.imbuements || {};
  p.imbuements[imbStoreKey(slot, instId)] = nova;
  return { ok: true, msg: `${g.name} ${IMB_TIER_NOME[tier - 1]} aplicado!`,
           cost: custo.price };
}

/* Remover custa 15000 gp (removecost oficial) */
function imbRemove(p, slot, idx) {
  const custo = (typeof IMBDATA !== "undefined") ? IMBDATA.bases[1].remove : 15000;
  const instId = imbSlotInstId(p, slot);
  const lista = imbOf(p, slot).slice();
  if (idx < 0 || idx >= lista.length) return { ok: false, msg: "Nada a remover." };
  if (p.gold < custo)
    return { ok: false, msg: `Remover custa ${fmtFull(custo)} gp.` };
  p.gold -= custo;
  lista.splice(idx, 1);
  p.imbuements[imbStoreKey(slot, instId)] = lista;
  return { ok: true, msg: "Imbuement removido.", cost: custo };
}

/* Texto curto em PT-BR do efeito aplicado (so traducao dos valores oficiais
 * do XML — bonus em basis points vira %; nada inventado). */
const IMB_EL_NOME = { fire: "fogo", ice: "gelo", earth: "terra",
                      energy: "energia", holy: "sagrado", death: "morte" };
const IMB_SKILL_NOME = { axe: "machado", sword: "espada", club: "clava",
                         shield: "escudo", distance: "distância",
                         magicpoints: "magic level", fist: "punho" };
function imbEfeitoTexto(im) {
  const g = im && imbFindGroup(im.key);
  const ef = g && g.tiers[im.tier] && g.tiers[im.tier].effect;
  if (!ef) return "";
  if (ef.type === "damage")
    return `converte ${ef.value}% do dano em ${IMB_EL_NOME[ef.combat] || ef.combat}`;
  if (ef.type === "reduction")
    return `+${ef.value}% proteção de ${IMB_EL_NOME[ef.combat] || ef.combat}`;
  if (ef.type === "speed") return `+${ef.value} de velocidade`;
  if (ef.type === "capacity") return `+${ef.value}% de capacidade`;
  if (ef.type === "paralysis")
    return `resiste paralisia (${ef.chance}%) — N/A no jogo`;
  if (ef.type === "skill") {
    if (ef.value === "lifeleech") return `+${(ef.bonus || 0) / 100}% de roubo de vida`;
    if (ef.value === "manaleech") return `+${(ef.bonus || 0) / 100}% de roubo de mana`;
    if (ef.value === "critical")
      return `+${(ef.bonus || 0) / 100}% dano crítico (${(ef.chance || 0) / 100}% de chance)`;
    return `+${ef.bonus} de ${IMB_SKILL_NOME[ef.value] || ef.value}`;
  }
  return "";
}

/* ---------- agregados para o combate ---------- */
function imbTotals(p) {
  const t = {
    elemental: 0, elementalType: null, lifeLeech: 0, manaLeech: 0,
    crit: 0, critChance: 0,
    protDeath: 0, protEarth: 0, protFire: 0, protIce: 0, protEnergy: 0,
    protHoly: 0, speed: 0, cap: 0, paralyse: 0,
    axe: 0, sword: 0, club: 0, shield: 0, dist: 0, magic: 0, fist: 0,
  };
  if (!p.imbuements || typeof IMBDATA === "undefined") return t;
  for (const slot of SLOTS) {
    const e = p.equip[slot];
    if (!e) continue;
    for (const im of imbOf(p, slot)) {
      if (imbExpirado(im)) continue;
      const g = imbFindGroup(im.key);
      if (!g || !g.tiers[im.tier]) continue;
      if (!imbCatAllowedOn(slot, e.item, g.cat)) continue;
      const ef = g.tiers[im.tier].effect;
      if (!ef) continue;
      if (ef.type === "damage") {
        t.elemental += ef.value;
        t.elementalType = ef.combat;
      } else if (ef.type === "reduction") {
        const mapa = { death: "protDeath", earth: "protEarth", fire: "protFire",
                       ice: "protIce", energy: "protEnergy", holy: "protHoly" };
        if (mapa[ef.combat]) t[mapa[ef.combat]] += ef.value;
      } else if (ef.type === "speed") {
        t.speed += ef.value;
      } else if (ef.type === "capacity") {
        t.cap += ef.value;
      } else if (ef.type === "paralysis") {
        t.paralyse = Math.max(t.paralyse, ef.chance || 0);
      } else if (ef.type === "skill") {
        // bonus: pontos de skill, em basis points quando % (leech/critical)
        switch (ef.value) {
          case "lifeleech": t.lifeLeech += (ef.bonus || 0) / 100; break;
          case "manaleech": t.manaLeech += (ef.bonus || 0) / 100; break;
          case "critical":
            t.crit += (ef.bonus || 0) / 100;
            t.critChance = Math.max(t.critChance, (ef.chance || 0) / 100);
            break;
          case "distance": t.dist += ef.bonus || 0; break;
          case "magicpoints": t.magic += ef.bonus || 0; break;
          default:
            if (t[ef.value] !== undefined) t[ef.value] += ef.bonus || 0;
        }
      }
    }
  }
  return t;
}

function imbProtection(p, element) {
  const t = imbTotals(p);
  const mapa = { death: "protDeath", earth: "protEarth", fire: "protFire",
                 ice: "protIce", energy: "protEnergy", holy: "protHoly" };
  return t[mapa[element]] || 0;
}
