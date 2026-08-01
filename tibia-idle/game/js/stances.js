/*
 * stances.js — sistema de STANCES do Update 15.25.3a4a52 (Vocation
 * Balancing). Fonte: https://www.tibiawiki.com.br/wiki/Stances
 *
 * Uma stance e uma magia de postura: o jogador ATIVA uma vez (pagando a
 * mana) e o efeito fica ligado ate trocar ou desativar — persiste apos
 * logout, por isso o estado mora em p.stances (salvo junto ao char) e
 * nao em p.buffs (que expira).
 *
 * Regras oficiais implementadas:
 *   - so UMA stance ativa por vocacao... exceto o Sorcerer, que mantem
 *     uma ELEMENTAL (Master of Flames/Thunder/Decay) e uma CRIPPLING
 *     (Aura of Sapped Strength / Aura of Exposed Weakness) ao mesmo tempo;
 *   - da para ficar sem nenhuma stance ativa (o jogador desliga);
 *   - as stances de Knight (Blood Rage, Protector) SUBSTITUEM as magias
 *     antigas com as mesmas palavras — a pagina de cada uma diz que uma
 *     remove o efeito da outra;
 *   - os efeitos de Master of X convertem a proxima magia fora do
 *     elemento depois de conjurar uma magia do elemento.
 *
 * REGRA DA CASA (a pedido do jogador): cooldown INDEPENDENTE. No oficial
 * as posturas dividem o grupo Foco com as UEs — soltar um exevo gran mas
 * flam/vis (40s de grupo) trancava a postura, e ativar a postura trancava
 * a UE por 10s. Aqui a postura trava apenas ELA MESMA (p.cd[id], entao o
 * icone continua aparecendo na barra de cooldown) e nenhum grupo de magia
 * e tocado — nem UE trava postura, nem postura trava UE.
 */
"use strict";

/* Prontidao/inicio do cooldown proprio da postura, sem tocar os grupos de
 * magia (ver header). */
function stanceCdReady(p, id, now) {
  if (typeof cdInit === "function") cdInit(p);
  const e = p.cd && p.cd[id];
  return !e || e.ate <= (now || Date.now());
}
function stanceCdStart(p, id, s, now) {
  if (typeof cdInit === "function") cdInit(p);
  now = now || Date.now();
  const dur = (s && s.cd) || 2000;
  p.cd[id] = { ate: now + dur, dur: dur };
}

const STANCES = {
  // ---- Knight (grupo unico "knight")
  "utito-tempo": {
    voc: "knight", nome: "Blood Rage", grupo: "knight",
    fx: "stance-blood-rage",
    // +25% melee skill (fist/axe/club/sword), ZERA o bloqueio,
    // +15% de dano recebido. Pagina oficial pos-update.
    meleePct: 25, noBlock: 1, dmgReceived: 1.15,
    desc: "+25% skill melee · zera bloqueio · +15% dano recebido",
  },
  "utamo-tempo": {
    voc: "knight", nome: "Protector", grupo: "knight",
    fx: "stance-protector",
    // +30% Shielding, -15% dano recebido, -15% dano causado.
    shieldPct: 30, dmgDealt: 0.85, dmgReceived: 0.85,
    desc: "+30% shielding · -15% dano recebido · -15% dano causado",
  },

  // ---- Paladin (grupo unico "paladin")
  "utori-con": {
    voc: "paladin", nome: "Sharpshooter", grupo: "paladin",
    fx: "stance-sharpshooter",
    // +32% Distance Fighting TOTAL (bonus conta equipamentos e buffs).
    // Nota oficial: com ela ativa a cura do paladin cai 25%.
    distPct: 32, healMul: 0.75,
    desc: "+32% distance fighting · sua cura cai 25%",
  },
  "utori-hur": {
    voc: "paladin", nome: "Divine Defiance", grupo: "paladin",
    fx: "stance-divine-defiance",
    // 6% do Distance como Holy ML e Healing ML (via stanceMLBonus) e
    // 12% de esquiva contra inimigos NAO adjacentes.
    defianceML: 6, dodgeRanged: 0.12,
    desc: "6% da distance como ML sagrado/cura · 12% esquiva à distância",
  },

  // ---- Sorcerer elemento (grupo "ele"): bonus no elemento + conversao
  "uteta-flam": {
    voc: "sorcerer", nome: "Master of Flames", grupo: "sorcelem",
    fx: "stance-master-flames", elemento: "fire",
    elemPct: 4, convert: "fire",
    desc: "+4% base · todas as magias viram FOGO enquanto ativa",
  },
  "uteta-vis": {
    voc: "sorcerer", nome: "Master of Thunder", grupo: "sorcelem",
    fx: "stance-master-thunder", elemento: "energy",
    elemCrit: 4, convert: "energy",
    desc: "+4% crítico · todas as magias viram ENERGIA enquanto ativa",
  },
  "uteta-mort": {
    voc: "sorcerer", nome: "Master of Decay", grupo: "sorcelem",
    fx: "stance-master-decay", elemento: "death",
    elemCritDmg: 30, convert: "death",
    desc: "+30% dano crítico · todas as magias viram MORTE enquanto ativa",
  },

  // ---- Sorcerer crippling (grupo "crip")
  "exori-kor-tempo": {
    voc: "sorcerer", nome: "Aura of Sapped Strength", grupo: "sorcrip",
    fx: "stance-sapped-strength",
    // ataques/magias/runas aplicam Sap Strength: o alvo causa 10% menos dano
    sapStr: 0.10,
    desc: "seus golpes enfraquecem: alvo causa 10% menos dano",
  },
  "exori-moe-tempo": {
    voc: "sorcerer", nome: "Aura of Exposed Weakness", grupo: "sorcrip",
    fx: "stance-exposed-weakness",
    // ataques/magias/runas aplicam Expose Weakness: 8% elemental pierce
    expose: 8,
    desc: "seus golpes expõem: +8% de dano elemental no alvo",
  },

  // ---- Druid (grupo unico "druid")
  "utura-sio": {
    voc: "druid", nome: "Shared Conservation", grupo: "druid",
    fx: "stance-shared-conservation",
    // +10% de autocura. A parte de party (30% ao segundo membro) nao se
    // aplica num idle solo.
    healSelf: 0.10,
    desc: "+10% de autocura (a cura de party não existe no idle solo)",
  },
  "utito-dru": {
    voc: "druid", nome: "Elemental Synthesis", grupo: "druid",
    fx: "stance-elemental-synthesis",
    // 10% do Magic Level como ML extra para gelo e terra
    iceEarthML: 10,
    desc: "10% do ML como ML extra de gelo e terra",
  },
};

/* Stances disponiveis para a vocacao do personagem (desbloqueio por
 * nivel segue o nivel da magia em SPELLS). */
function stanceList(p) {
  const out = [];
  for (const id in STANCES) {
    const st = STANCES[id];
    if (st.voc !== p.voc) continue;
    const s = (typeof SPELLS !== "undefined") ? SPELLS[id] : null;
    if (!s) continue;
    out.push({ id: id, st: st, spell: s,
               livre: p.level >= (s.lvl || 1) });
  }
  out.sort((a, b) => a.spell.lvl - b.spell.lvl);
  return out;
}

function stanceAtiva(p, id) {
  return !!(p.stances && p.stances[id]);
}

/* Liga/desliga uma stance. Devolve true se o estado mudou.
 * Respeita mana, nivel, o cooldown INDEPENDENTE da propria postura
 * (stanceCdReady — grupos de magia sao ignorados, regra da casa) e a
 * exclusividade por grupo.
 * `ctx` e o combat em andamento (para os eventos visuais); pode ser null. */
function toggleStance(p, id, ctx, now) {
  const st = STANCES[id];
  const s = (typeof SPELLS !== "undefined") ? SPELLS[id] : null;
  if (!st || !s) return false;
  now = now || Date.now();
  p.stances = p.stances || {};

  if (stanceAtiva(p, id)) {
    // desativar nunca custa nada — "agora da para ficar sem stance ativa"
    delete p.stances[id];
    // stance de elemento desligada perde a conversao armada (senao um
    // gatilho velho de fogo converteria uma magia de outra stance)
    if (st.convert) delete p.stanceConv;
    if (ctx && ctx.events) {
      ctx.events.push({ t: "say", text: s.words || id });
      ctx.events.push({ t: "stance-off", nome: st.nome });
    }
    return true;
  }

  if (p.level < (s.lvl || 1) || p.mp < s.mana) {
    if (typeof toast === "function") {
      toast(p.level < (s.lvl || 1)
            ? `Precisa do nível <b>${s.lvl}</b> para ${st.nome}.`
            : "Mana insuficiente para ativar a stance.");
    }
    return false;
  }
  if (!stanceCdReady(p, id, now)) return false;

  p.mp -= s.mana;
  if (typeof addManaSpent === "function") addManaSpent(p, s.mana);
  stanceCdStart(p, id, s, now);

  // exclusividade: uma por grupo. Sorcerer = 1 ele + 1 crip.
  for (const k in STANCES) {
    if (k !== id && STANCES[k].grupo === st.grupo) delete p.stances[k];
  }
  // trocou de stance de elemento: a conversao armada e da stance ANTERIOR,
  // nao vale para a nova — descarta
  if (st.convert) delete p.stanceConv;
  p.stances[id] = true;

  if (ctx && ctx.events) {
    const px = ctx.player ? ctx.player.x : 0.13;
    const py = ctx.player ? ctx.player.y : 0.6;
    ctx.events.push({ t: "stance", nome: st.nome, fx: st.fx,
                      x: px, y: py, screen: true });
    ctx.events.push({ t: "say", text: s.words || id });
  }
  return true;
}

/* Soma os modificadores das stances ativas (mesmo estilo do buffTotals) */
function stanceTotals(p) {
  const t = {
    meleePct: 0, distPct: 0, shieldPct: 0,
    dmgDealt: 1, dmgReceived: 1, healMul: 1, healSelf: 0,
    noBlock: false, dodgeRanged: 0, defianceML: 0,
    elemPct: {}, elemCrit: {}, elemCritDmg: {}, convert: null,
    sapStr: 0, expose: 0, iceEarthML: 0,
  };
  if (!p || !p.stances) return t;
  for (const id in p.stances) {
    const st = STANCES[id];
    if (!st) continue;
    if (st.meleePct) t.meleePct += st.meleePct;
    if (st.distPct) t.distPct += st.distPct;
    if (st.shieldPct) t.shieldPct += st.shieldPct;
    if (st.dmgDealt) t.dmgDealt *= st.dmgDealt;
    if (st.dmgReceived) t.dmgReceived *= st.dmgReceived;
    if (st.healMul) t.healMul *= st.healMul;
    if (st.healSelf) t.healSelf += st.healSelf;
    if (st.noBlock) t.noBlock = true;
    if (st.dodgeRanged) t.dodgeRanged = Math.max(t.dodgeRanged, st.dodgeRanged);
    if (st.defianceML) t.defianceML = Math.max(t.defianceML, st.defianceML);
    if (st.elemPct) t.elemPct[st.elemento] =
      (t.elemPct[st.elemento] || 0) + st.elemPct;
    if (st.elemCrit) t.elemCrit[st.elemento] =
      (t.elemCrit[st.elemento] || 0) + st.elemCrit;
    if (st.elemCritDmg) t.elemCritDmg[st.elemento] =
      (t.elemCritDmg[st.elemento] || 0) + st.elemCritDmg;
    if (st.convert) t.convert = st.convert;
    if (st.sapStr) t.sapStr = Math.max(t.sapStr, st.sapStr);
    if (st.expose) t.expose = Math.max(t.expose, st.expose);
    if (st.iceEarthML) t.iceEarthML = Math.max(t.iceEarthML, st.iceEarthML);
  }
  return t;
}

/* ML adicional concedido pelas stances a UMA magia (chamado por
 * spells.js dentro de spellValues):
 *   - Divine Defiance: 6% do Distance Fighting como Holy ML (magias
 *     sagradas) e Healing ML (magias de cura);
 *   - Elemental Synthesis: 10% do ML como ML extra em gelo/terra. */
function stanceMLBonus(p, s, ml) {
  const t = stanceTotals(p);
  if (!t) return ml;
  if (t.defianceML && p.voc === "paladin") {
    const extra = Math.floor(effSkill(p, "dist") * t.defianceML / 100);
    if (s.type === "heal" || s.element === "holy") ml += extra;
  }
  if (t.iceEarthML && (s.element === "ice" || s.element === "earth")) {
    ml += Math.floor(ml * t.iceEarthML / 100);
  }
  return ml;
}

/* Resolve o elemento EFETIVO de uma magia conjurada sob uma stance de
 * elemento do Sorcerer.
 *
 * DESVIO DO GLOBAL, A PEDIDO DO JOGADOR: no Tibia oficial a conversao e um
 * gatilho por conjuracao (conjurou fogo -> a proxima nao-fogo converte).
 * Aqui a regra e mais direta: enquanto uma Master of X estiver ATIVA, TODA
 * magia sai convertida para o elemento X. Os bonus de dano (+4% base,
 * +4% crit, +30% crit dmg) continuam lidos alvo a alvo pelo combat.js via
 * stanceTotals() — e na pratica passam a valer para tudo, ja que toda
 * magia sai com o elemento da stance. */
function stanceConvert(p, elemento) {
  const t = stanceTotals(p);
  if (!t || !t.convert) return elemento;
  // curas e suporte nao levam tipo ofensivo; a conversao so interessa a
  // dano, entao a troca aqui e segura mesmo para exura/utani
  return t.convert;
}

function sorcererElementalStance(p) {
  if (!p || !p.stances) return null;
  for (const id of ["uteta-flam", "uteta-vis", "uteta-mort"]) {
    if (p.stances[id]) return STANCES[id] || null;
  }
  return null;
}

function spellLooksLikeFire(s, originalElement, baseFx) {
  const words = String((s && s.words) || "").toLowerCase();
  const name = String((s && s.name) || "").toLowerCase();
  return originalElement === "fire" ||
    baseFx === "fire-area" || baseFx === "fire-attack" ||
    baseFx === "hit-by-fire" || baseFx === "fire-effect" ||
    baseFx === "fireball-effect" || baseFx === "flame-effect" ||
    words.indexOf("flam") >= 0 || name.indexOf("fire") >= 0 ||
    name.indexOf("flame") >= 0 || name.indexOf("hell") >= 0;
}

function spellLooksLikeDeathEcho(s, baseFx) {
  const words = String((s && s.words) || "").toLowerCase();
  const name = String((s && s.name) || "").toLowerCase();
  return baseFx === "death-echo-effect" || baseFx === "death-echo" ||
    words === "exevo mort ora" || name.indexOf("death echo") >= 0;
}

/* Visual das stances elementais do Master Sorcerer.
 *
 * O cliente 15.25 nao usa só a sprite generica do elemento convertido. Algumas
 * combinações de postura + magia recebem sprites proprias na TibiaWiki:
 *   - Master of Decay + magia de fogo/wave -> Fire Effect (Black)
 *   - Master of Thunder + magia de fogo/wave -> Fire Effect (Purple)
 *   - Master of Flames + Death Echo -> Death Echo Effect (Orange)
 *   - Master of Thunder + Death Echo -> Death Echo Effect (Purple)
 *
 * Como no idle a regra da casa converte toda magia enquanto a postura esta
 * ativa, damos tambem um fallback tematico para qualquer magia convertida pela
 * postura: fogo normal, eletricidade roxa ou black fire para morte. */
function stanceDamageFx(p, s, originalElement, effectiveElement, baseFx) {
  const st = sorcererElementalStance(p);
  if (!st || p.voc !== "sorcerer") return baseFx;

  const converted = effectiveElement !== originalElement;
  const fireLike = spellLooksLikeFire(s, originalElement, baseFx);
  const deathEcho = spellLooksLikeDeathEcho(s, baseFx);

  if (deathEcho) {
    if (st.elemento === "fire") return "death-echo-effect-orange";
    if (st.elemento === "energy") return "death-echo-effect-purple";
    return baseFx || "death-echo-effect";
  }

  if (fireLike) {
    if (st.elemento === "death") return "fire-effect-black";
    if (st.elemento === "energy") return "fire-effect-purple";
    if (st.elemento === "fire") return baseFx || "fire-effect";
  }

  if (!converted) return baseFx;
  if (st.elemento === "death") return "fire-effect-black";
  if (st.elemento === "energy") return "purple-electricity-effect";
  if (st.elemento === "fire") return "fire-effect";
  return baseFx;
}

/* Marca o alvo com os debuffs crippling do Sorcerer (10 s por golpe,
 * valor do cooldown natural desses efeitos nas magias originais). */
function stanceApplyDebuffs(p, mob, now) {
  const t = stanceTotals(p);
  if (!t) return;
  now = now || Date.now();
  if (t.sapStr) mob.sapStrUntil = now + 10000;
  if (t.expose) mob.exposeUntil = now + 10000;
}

/* Swift Foot (15.25): com ela ativa o paladin pode atacar e conjurar,
 * mas com -30% no dano causado. Nao e stance — mora em p.buffs como
 * qualquer haste, por isso a verificacao fica aqui. */
function swiftFootMul(p, now) {
  if (p && p.buffs && p.buffs["utamo-tempo-san"] &&
      p.buffs["utamo-tempo-san"] > (now || Date.now())) return 0.7;
  return 1;
}
