/*
 * supplies.js — potions e runas com os dados reais do Canary
 *
 * Antes SUPPLIES era uma tabela escrita a mao: 10 entradas com cura estimada
 * e um campo `scale` inventado para acompanhar o nivel. Agora vem de
 * SUPPLYDATA (js/supplydata.js), gerado por tools/import_supplies.py:
 *
 *   potions -> data/scripts/actions/items/potions.lua
 *              faixa exata de cura/mana, nivel minimo e quais vocacoes podem
 *              beber. Uma Strong Health Potion cura 250-350 e e de knight,
 *              paladin e monk a partir do nivel 50 — nao um numero escalado.
 *
 *   runas   -> data/scripts/runes/*.lua
 *              nivel, magic level, cargas por runa e a formula de dano,
 *              obtida executando o Lua do servidor. O dano de uma Great
 *              Fireball e (level/5 + ml*1.2 + 7) a (level/5 + ml*2.8 + 17),
 *              igual ao servidor, entao runa boa exige magic level.
 *
 * Preco: o canary nao guarda preco de NPC no items.xml, entao ele e derivado
 * do poder da potion/runa no nivel de referencia. Fica proporcional ao que o
 * item entrega em vez de arbitrario.
 */
"use strict";

const SUPPLYDATA_RAW = (typeof window !== "undefined" && window.SUPPLYDATA)
  ? window.SUPPLYDATA : { potions: {}, runas: {}, inicio: {} };

/* Itens iniciais de cada vocacao (Dawnport) */
const START_ITEMS = SUPPLYDATA_RAW.inicio || { comum: [], vocacoes: {} };

/* ------------------------------------------------------- preco derivado */

/* Quanto a potion/runa entrega num personagem de referencia (nivel 100,
 * ml 60), usado so para precificar de forma coerente entre elas. */
function supplyRefPower(e) {
  if (e.hp || e.mp) {
    const hp = e.hp ? (e.hp[0] + e.hp[1]) / 2 : 0;
    const mp = e.mp ? (e.mp[0] + e.mp[1]) / 2 : 0;
    return hp + mp * 0.8;
  }
  if (e.f) {
    const f = e.f;
    const v = f.modo === "magic"
      ? (f.lvlMax || 0) * 100 + (f.mlMax || 0) * 60 + (f.flatMax || 0)
      : (f.saMax || 0) * 90 * 40 + (f.flatMax || 0);
    return v * (e.cargas || 1) * 0.55;
  }
  return 40 * (e.cargas || 1);
}

/* Precos de NPC do TibiaWiki (tibiawiki.com.br), por carga/unidade.
 *
 * Antes o preco era derivado do poder da potion/runa, o que dava numeros
 * coerentes entre si mas nenhum deles batia com o jogo real. Agora sao os
 * valores que os NPCs cobram no Tibia global — conferidos na wiki: Sudden
 * Death 162 gp e Ultimate Healing 175 gp, por exemplo.
 */
const PRECO_WIKI = {
  // runas (por carga)
  "lightest-missile-rune": 5, "lightest-magic-missile-rune": 5,
  "light-stone-shower-rune": 5, "light-magic-missile-rune": 12,
  "poison-field-rune": 21, "fire-field-rune": 28, "antidote-rune": 65,
  "intense-healing-rune": 95, "convince-creature-rune": 80,
  "destroy-field-rune": 15, "energy-field-rune": 38,
  "desintegrate-rune": 26, "stalagmite-rune": 12,
  "ultimate-healing-rune": 175, "heavy-magic-missile-rune": 25,
  "poison-bomb-rune": 85, "animate-dead-rune": 375, "chameleon-rune": 210,
  "firebomb-rune": 235, "fireball-rune": 30, "holy-missile-rune": 16,
  "soulfire-rune": 46, "wild-growth-rune": 160, "icicle-rune": 30,
  "stone-shower-rune": 37, "thunderstorm-rune": 37, "poison-wall-rune": 52,
  "avalanche-rune": 57, "great-fireball-rune": 57, "explosion-rune": 31,
  "magic-wall-rune": 116, "fire-wall-rune": 61, "energybomb-rune": 203,
  "energy-wall-rune": 85, "sudden-death-rune": 162, "paralyze-rune": 700,
  // potions (por unidade)
  "small-health-potion": 20, "health-potion": 45, "mana-potion": 50,
  "strong-health-potion": 100, "strong-mana-potion": 80,
  "great-health-potion": 190, "great-mana-potion": 120,
  "great-spirit-potion": 190, "ultimate-health-potion": 310,
  "ultimate-mana-potion": 438, "ultimate-spirit-potion": 322,
  "supreme-health-potion": 625,
};

function derivarPreco(e) {
  const oficial = PRECO_WIKI[e.id];
  if (oficial) return oficial;
  // item sem preco de NPC na wiki: estima pelo poder, para nao ficar de graca
  const pw = supplyRefPower(e);
  const base = Math.max(12, Math.round(pw * 0.55));
  return Math.round(base / 5) * 5;
}

/* ------------------------------------------------------- monta SUPPLIES */

/* Nome bonito a partir do nome cru do canary */
function tituloSupply(n) {
  return (n || "").replace(/\b\w/g, (c) => c.toUpperCase());
}

const SUPPLIES = {};

(function montarSupplies() {
  // ---- potions
  for (const id in SUPPLYDATA_RAW.potions) {
    const e = SUPPLYDATA_RAW.potions[id];
    const s = {
      name: tituloSupply(e.nome), sprite: id, itemId: e.itemId,
      lvl: e.lvl || 1, vocs: e.vocs || [],
      canary: 1, kind: "potion",
    };
    if (e.hp) s.heal = e.hp.slice();
    if (e.mp) s.mana = e.mp.slice();
    // `type` e o que o motor de combate ja consulta: heal, mana ou attack.
    // Potions que dao os dois (spirit) contam como cura, mas o campo mana
    // continua la e o restaurador de mana tambem as enxerga.
    s.type = e.hp ? "heal" : "mana";
    s.both = !!(e.hp && e.mp);
    s.scale = 0;                       // valores do canary sao fixos
    s.price = derivarPreco(e);
    s.tier = Math.round((e.lvl || 1) / 40);
    SUPPLIES[id] = s;
  }

  // ---- runas
  for (const id in SUPPLYDATA_RAW.runas) {
    const e = SUPPLYDATA_RAW.runas[id];
    // runas de suporte (paralyze, animate dead, magic wall...) nao entram:
    // o motor so sabe usar runa de dano e de cura
    if (e.tipo !== "attack" && e.tipo !== "heal") continue;
    const s = {
      name: tituloSupply(e.nome), sprite: id, itemId: e.itemId,
      lvl: e.lvl || 1, ml: e.ml || 0, cargas: e.cargas || 1,
      type: e.tipo === "heal" ? "heal" : "attack",
      element: e.element, area: e.area || null,
      f: e.f || null, cd: e.cd || 2000,
      canary: 1, kind: "rune",
      scale: 0,
      vocs: ["sorcerer", "druid", "paladin", "knight", "monk"],
    };
    // RUNEDATA vem de tools/import_runes.py, que le os .lua das runas do
    // Canary. E a unica fonte da formula de dano, do efeito visual, do
    // projetil e da AREA de verdade (grade resolvida em SQMs) — nada disso
    // existe no items.xml, que era a fonte antiga.
    const rd = (typeof window !== "undefined" && window.RUNEDATA)
      ? window.RUNEDATA[id] : null;
    if (rd) {
      if (rd.f) s.f = rd.f;
      if (rd.element) s.element = rd.element;
      if (rd.area) s.area = rd.area;         // objeto {sqm, raio, w, h}
      if (rd.fx) s.fx = rd.fx;               // efeito no impacto
      if (rd.missile) s.missile = rd.missile;
      if (rd.cond) s.cond = rd.cond;         // soulfire/poison bomb: dano no tempo
      if (rd.cargas) s.cargas = rd.cargas;
      if (rd.cd) s.cd = rd.cd;
      if (rd.lvl) s.lvl = rd.lvl;
      if (rd.ml !== undefined) s.ml = rd.ml;
      if (rd.needTarget) s.needTarget = 1;
    }
    s.price = derivarPreco(e);
    s.tier = Math.round((e.lvl || 1) / 12);
    SUPPLIES[id] = s;
  }

  // ---- comida, que o canary trata em outro lugar
  SUPPLIES["brown-mushroom"] = {
    name: "Brown Mushroom", sprite: "brown-mushroom", price: 50,
    mana: [50, 100], scale: 1.2, type: "mana", tier: 1, lvl: 1,
    vocs: ["sorcerer", "druid", "paladin", "knight", "monk"], kind: "food",
  };
  SUPPLIES["dragon-ham"] = {
    name: "Dragon Ham", sprite: "dragon-ham", price: 30, food: 360,
    type: "food", tier: 1, lvl: 1, kind: "food",
    vocs: ["sorcerer", "druid", "paladin", "knight", "monk"],
  };
  // mana fluid continua existindo: e o consumivel barato do inicio e varias
  // configuracoes salvas de jogador ainda apontam para ele
  SUPPLIES["mana-fluid"] = {
    name: "Mana Fluid", sprite: "mana-fluid", price: 80,
    mana: [75, 125], scale: 0.8, type: "mana", tier: 2, lvl: 1,
    vocs: ["sorcerer", "druid", "paladin", "knight", "monk"], kind: "fluid",
  };
})();

/* ------------------------------------------------------------- consultas */

/* A vocacao pode usar essa potion/runa neste nivel? */
function supplyAllowed(p, slug) {
  const s = SUPPLIES[slug];
  if (!s) return false;
  if (p.level < (s.lvl || 1)) return false;
  if (s.vocs && s.vocs.length && s.vocs.indexOf(p.voc) === -1) return false;
  // runa exige magic level, como no servidor
  if (s.ml && typeof effMagic === "function" && effMagic(p) < s.ml) return false;
  return true;
}

/* Por que esse supply esta bloqueado (texto curto para a UI) */
function supplyBlockReason(p, slug) {
  const s = SUPPLIES[slug];
  if (!s) return "";
  if (s.vocs && s.vocs.length && s.vocs.indexOf(p.voc) === -1) {
    return "só " + s.vocs.map((v) => VOCATIONS[v] ? VOCATIONS[v].name : v)
      .join(", ");
  }
  if (p.level < (s.lvl || 1)) return "nível " + s.lvl;
  if (s.ml && typeof effMagic === "function" && effMagic(p) < s.ml) {
    return "magic level " + s.ml;
  }
  return "";
}

/* Quanto essa potion/runa cura ou causa AGORA, para este personagem */
function supplyPowerFor(p, slug) {
  const s = SUPPLIES[slug];
  if (!s) return [0, 0];
  // potion: faixa fixa do servidor
  if (s.canary && (s.heal || s.mana) && !s.f) {
    const arr = s.heal || s.mana;
    return [arr[0], arr[1]];
  }
  // runa: formula do canary avaliada no personagem
  if (s.f) {
    const level = p.level || 1;
    const ml = typeof effMagic === "function" ? effMagic(p) : (p.ml || 0);
    const f = s.f;
    let lo, hi;
    if (f.modo === "magic") {
      lo = (f.lvlMin || 0) * level + (f.mlMin || 0) * ml + (f.flatMin || 0);
      hi = (f.lvlMax || 0) * level + (f.mlMax || 0) * ml + (f.flatMax || 0);
    } else {
      const sk = typeof effSkill === "function" ? effSkill(p, "dist") : 10;
      lo = (f.saMin || 0) * sk * 40 + (f.lvlMin || 0) * level + (f.flatMin || 0);
      hi = (f.saMax || 0) * sk * 40 + (f.lvlMax || 0) * level + (f.flatMax || 0);
    }
    return [Math.max(0, Math.floor(lo)), Math.max(0, Math.floor(hi))];
  }
  // legado (mana fluid, cogumelo): mantem o escalonamento antigo
  return supplyPower(s, p.level);
}

/* Lista de potions/runas de um tipo, ordenada por nivel */
function suppliesOf(p, tipo, apenasPermitidos) {
  const out = [];
  for (const id in SUPPLIES) {
    const s = SUPPLIES[id];
    if (tipo === "heal" && s.type !== "heal") continue;
    if (tipo === "mana" && !(s.type === "mana" || s.both)) continue;
    if (tipo === "attack" && s.type !== "attack") continue;
    if (apenasPermitidos && !supplyAllowed(p, id)) continue;
    // esconde o que a vocacao nunca vai poder usar (knight nao bebe
    // ultimate mana potion em nivel nenhum)
    if (s.vocs && s.vocs.length && s.vocs.indexOf(p.voc) === -1) continue;
    out.push([id, s]);
  }
  out.sort((a, b) => (a[1].lvl - b[1].lvl) ||
                     supplyRefPower(a[1]) - supplyRefPower(b[1]));
  return out;
}

/* A melhor potion liberada agora (usada pelo "auto" do Helper) */
function bestSupply(p, tipo) {
  const ls = suppliesOf(p, tipo, true);
  if (!ls.length) return null;
  let melhor = null, melhorPw = -1;
  for (const [id, s] of ls) {
    const pw = supplyRefPower(s);
    if (pw > melhorPw) { melhorPw = pw; melhor = id; }
  }
  return melhor;
}

/* ------------------------------------------------------- itens iniciais */

/* Traduz o id numerico do canary para o slug do jogo.
 * O jogo indexa item por slug; o dawnport lista por id do items.xml. */
const START_SLUG = {
  3355: "leather-helmet", 3562: "coat", 3559: "leather-legs",
  3552: "leather-boots", 3267: "dagger", 3412: "wooden-shield",
  3350: "bow", 35562: "quiver", 21470: "simple-arrow",
  21348: "scorcher", 21350: "chiller", 50166: "simple-jo-staff",
  21400: "spellbook-of-the-novice", 7876: "small-health-potion",
  268: "mana-potion", 3577: "meat",
  21352: "lightest-missile-rune", 21351: "light-stone-shower-rune",
};

/* Em que slot do jogo cada item inicial entra */
const SLOT_CANARY = {
  head: "helmet", armor: "armor", legs: "legs", feet: "boots",
  left: "weapon", right: "shield",
};

/* Entrega os itens de Dawnport ao personagem recem-criado.
 * O Canary da um kit ao escolher a vocacao; sem isso o personagem novo
 * nascia pelado e sem consumivel nenhum. */
function giveStartingItems(p) {
  const voc = START_ITEMS.vocacoes && START_ITEMS.vocacoes[p.voc];
  const lista = [];
  for (const it of (START_ITEMS.comum || [])) lista.push(it);
  if (voc) for (const it of voc.itens) lista.push(it);

  for (const it of lista) {
    const slug = START_SLUG[it.itemId];
    if (!slug) continue;
    const existe = typeof GAMEDATA !== "undefined" && GAMEDATA.items[slug];
    if (!existe) continue;

    // runa e potion viram carga de supply, nao item de mochila
    if (SUPPLIES[slug]) {
      p.supplies[slug] = (p.supplies[slug] || 0) + it.qtd;
      continue;
    }
    // municao vira contador
    if (existe.t === "ammo") {
      if (typeof addAmmo === "function") addAmmo(p, slug, it.qtd);
      continue;
    }
    // o quiver do Dawnport vai para o slot proprio, nao para o de escudo:
    // ele e o container de municao e convive com um escudo de verdade
    const base = GAMEDATA.items[slug];
    // a aljava ocupa a mao secundaria, o mesmo slot do escudo
    const slot = (base && base.t === "quiver")
      ? "shield" : SLOT_CANARY[it.slot || ""];
    if (slot && !p.equip[slot]) {
      p.equip[slot] = { item: slug, count: 1 };
      continue;
    }
    if (typeof addItem === "function") addItem(p, slug, it.qtd);
    else p.bag[slug] = (p.bag[slug] || 0) + it.qtd;
  }

  // cores de outfit da vocacao, como o dawnport define
  if (voc && voc.cores && typeof ensureOutfit === "function") {
    ensureOutfit(p);
    p.outfit.colors = voc.cores.slice();
  }

  // seleciona no Helper as potions que o personagem REALMENTE recebeu.
  // bestSupply escolheria a melhor liberada por nivel, que no nivel 1 pode
  // ser uma que ele nao tem em estoque — o jogador entraria na hunt achando
  // que tem cura configurada e o motor compraria carga por carga.
  const temEstoque = (tipo) => {
    let melhor = null, pw = -1;
    for (const slug in p.supplies) {
      if ((p.supplies[slug] || 0) <= 0) continue;
      const s = SUPPLIES[slug];
      if (!s || !supplyAllowed(p, slug)) continue;
      const ehTipo = tipo === "heal" ? s.type === "heal"
                                     : (s.type === "mana" || s.both);
      if (!ehTipo) continue;
      const v = supplyRefPower(s);
      if (v > pw) { pw = v; melhor = slug; }
    }
    return melhor;
  };
  p.config.healSupply = temEstoque("heal") || bestSupply(p, "heal") || "";
  p.config.manaSupply = temEstoque("mana") || bestSupply(p, "mana") || "";
  return lista.length;
}

/* Registra no GAMEDATA os itens de supply que o jogo ainda nao conhecia
 * (as potions e runas novas do canary) e alinha preco de venda ao de compra.
 * Precisa rodar aqui, e nao no core.js, porque SUPPLIES so existe agora. */
/* Itens do kit de Dawnport que o jogo ainda nao tinha. Os atributos vem do
 * items.xml do canary: as wands sao arma magica de alcance 3 com 4-8 de dano,
 * o jo staff e arma de punho com attack 10 e a simple arrow tem attack 20. */
const START_EXTRA_ITEMS = {
  "scorcher": { n: "the scorcher", s: "weapon", t: "magic", mdmg: 8, mag: 0,
                sell: 500, buy: 500, w: 15.0, range: 3, el: "fire",
                voc: ["sorcerer"] },
  "chiller": { n: "the chiller", s: "weapon", t: "magic", mdmg: 8, mag: 0,
               sell: 500, buy: 500, w: 15.0, range: 3, el: "ice",
               voc: ["druid"] },
  // weaponType "fist" no items.xml do canary: a jo staff treina PUNHO, nao
  // clava. Estava como club, entao o monk nao subia fist e o dano saia pela
  // skill errada.
  "simple-jo-staff": { n: "simple jo staff", s: "weapon", t: "fist",
                       atk: 10, def: 6, sell: 200, buy: 200, w: 17.0,
                       fist: 1, vocs: ["monk"] },
  "spellbook-of-the-novice": { n: "spellbook of the novice", s: "shield",
                               t: "shield", def: 8, sell: 100, buy: 100,
                               w: 14.0 },
  "simple-arrow": { n: "simple arrow", s: "ammo", t: "ammo", atk: 20,
                    sell: 1, buy: 1, w: 0.6, el: "physical" },
};

(function registrarItens() {
  if (typeof GAMEDATA === "undefined" || !GAMEDATA.items) return;
  for (const slug in START_EXTRA_ITEMS) {
    if (!GAMEDATA.items[slug]) {
      GAMEDATA.items[slug] = Object.assign({}, START_EXTRA_ITEMS[slug]);
    }
  }
  for (const slug in SUPPLIES) {
    const s = SUPPLIES[slug];
    if (!GAMEDATA.items[slug]) {
      GAMEDATA.items[slug] = {
        n: s.name.toLowerCase(), s: null, t: "supply",
        sell: s.price, buy: s.price, w: 2.0,
      };
    } else {
      GAMEDATA.items[slug].sell = GAMEDATA.items[slug].buy = s.price;
    }
  }
})();

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    SUPPLIES, supplyAllowed, supplyPowerFor, suppliesOf, bestSupply,
    giveStartingItems, START_ITEMS,
  };
}
