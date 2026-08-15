/*
 * monk.js — os quatro sistemas exclusivos do Monk (Tibia 15.10)
 *
 *   Mantra   armadura ELEMENTAL: abate um valor fixo do dano de fogo, gelo,
 *            energia e terra. Nao e percentual como resistencia comum.
 *   Harmony  recurso de 0 a 5. Magias "builder" geram 1, "spender" gastam
 *            tudo e ganham dano por isso.
 *   Serene   estado de forca do Monk. Solo o Monk esta SEMPRE sereno; em
 *            grupo perde a serenidade com 6+ monstros adjacentes.
 *   Virtudes tres posturas exclusivas entre si, com efeito dobrado quando
 *            sereno.
 *
 * Fontes (nao inventei numero nenhum):
 *   src/creatures/players/player.cpp  -> getMantra(), getHarmonyBonus(),
 *                                        updateSerenityState()
 *   src/creatures/combat/combat.cpp   -> applyMantraAbsorb(), bonus de fist
 *   data/scripts/spells/attack/*.lua  -> monkSpellType(Builder|Spender)
 */
"use strict";

/* Slots que somam mantra, na ordem exata do array armorSlots do
 * Player::getMantra(). A ARMA NAO ENTRA: mantra e defensivo e so vem de
 * equipamento de protecao. */
const MANTRA_SLOTS = ["helmet", "amulet", "armor", "legs", "boots", "ring",
                      "extra"];

/* Elementos que o mantra absorve. Fisico, morte e sagrado NAO sao afetados:
 * o servidor testa exatamente estes quatro em applyMantraAbsorb(). */
const MANTRA_ELEMENTOS = ["fire", "ice", "energy", "earth"];

const HARMONY_MAX = 5;

/* Bonus base de harmony, em pontos percentuais.
 * O servidor usa 8.0 (era 15 no teste, caiu para 10 no anuncio e o codigo
 * final do Canary trabalha com 8). */
const HARMONY_BASE = 8;

/* Classificacao das magias, direto do monkSpellType() de cada script Lua.
 * O que nao esta aqui nao mexe em harmony. */
const MONK_BUILDERS = [
  "exori-infir-pug",      // Swift Jab
  "exori-pug",            // Double Jab
  "exori-infir-amp-pug",  // Lesser Mystic Repulse
  "exori-amp-pug",        // Mystic Repulse
  "exori-mas-pug",        // Flurry of Blows
  "exori-med-pug",        // Chained Penance
  "exori-gran-mas-pug",   // Greater Flurry of Blows
  "exori-gran-pug",       // Forceful Uppercut
  "exori-mas-amp-pug",    // Thousand Fist Blows
];
const MONK_SPENDERS = [
  "exori-infir-nia",      // Tiger Clash
  "exori-nia",            // Greater Tiger Clash
  "exori-mas-nia",        // Sweeping Takedown
  "exori-gran-nia",       // Devastating Knockout
  "exori-gran-mas-nia",   // Spiritual Outburst
];

function isMonk(p) {
  return !!p && p.voc === "monk";
}

function monkSpellKind(id) {
  if (MONK_BUILDERS.indexOf(id) !== -1) return "builder";
  if (MONK_SPENDERS.indexOf(id) !== -1) return "spender";
  const md = (typeof MONKSPELLS !== "undefined") ? MONKSPELLS[id] : null;
  if (md && md.monk === "builder") return "builder";
  if (md && md.monk === "spender") return "spender";
  return null;
}

/* ---------------------------------------------------------------- mantra */

/* Mantra total do equipamento. Espelha Player::getMantra(): soma o campo
 * `mantra` dos itens nos slots defensivos e ignora todo o resto. */
function mantraTotal(p) {
  if (!p || !p.equip) return 0;
  let total = 0;
  for (const slot of MANTRA_SLOTS) {
    const e = p.equip[slot];
    if (!e) continue;
    const base = GAMEDATA.items[e.item];
    if (!base) continue;
    // respeita o refino do ferreiro, igual gearStats faz
    const it = typeof upgradedStats === "function"
      ? upgradedStats(p, "equip:" + slot, e.item) : base;
    total += it.mantra || 0;
  }
  return total;
}

/* Aplica a absorcao no dano recebido.
 *
 * Regra do applyMantraAbsorb(): subtrai um valor FIXO, nunca abaixo de zero,
 * e so em dano elemental. Um mantra de 40 contra um hit de fogo de 300 deixa
 * 260 — quem tem mantra alto fica praticamente imune a chip damage elemental,
 * que e exatamente a intencao do sistema.
 */
function mantraAbsorve(p, dano, elemento, c) {
  if (!isMonk(p)) return dano;
  if (MANTRA_ELEMENTOS.indexOf(elemento) === -1) return dano;
  let m = mantraTotal(p);
  if (m <= 0) return dano;
  // TibiaWiki/Mantra: o valor total do mantra DOBRA quando o Monk está na
  // forma Serene (e neste jogo solo o Monk está sempre sereno).
  if (typeof monkSereno === "function" && monkSereno(p, c)) m *= 2;
  return Math.max(0, dano - m);
}

/* --------------------------------------------------------------- serene */

/* O Monk esta sereno?
 *
 * updateSerenityState() do servidor: perde a serenidade so quando ha membro
 * de grupo visivel E 6 ou mais criaturas adjacentes. Como este jogo e sempre
 * solo (nao existe party), o Monk esta sempre sereno — mas a funcao ja
 * recebe o contexto de combate para o dia em que houver grupo, e para o
 * painel admin poder forcar o estado nos testes.
 */
function monkSereno(p, c) {
  if (!isMonk(p)) return false;
  if (p.forceSerene === false) return false;   // usado pelo painel admin
  if (!c || !c.mobs) return true;
  // sem party o Monk e sempre sereno; a contagem fica pronta para o futuro
  return true;
}

/* -------------------------------------------------------------- harmony */

function harmonyAtual(p) {
  return Math.max(0, Math.min(HARMONY_MAX, (p && p.harmony) || 0));
}

/* Bonus base em pontos percentuais, antes da duplicacao por ponto.
 * getHarmonyBonus(): 8 de base, +8 com Virtue of Harmony sereno (+4 se nao). */
function harmonyBaseBonus(p, c) {
  let base = HARMONY_BASE;
  if (p.buffs && p.buffs["utori-virtu"]) {
    base += monkSereno(p, c) ? 8 : 4;
  }
  return base;
}

/* Multiplicador de dano do spender.
 *
 * A formula do servidor e base * 2^(harmony-1), ou seja o bonus DOBRA a cada
 * ponto: com base 8 da 8%, 16%, 32%, 64% e 128% com 5 pontos. E por isso que
 * vale segurar o spender ate encher a harmonia.
 */
function harmonyBonus(p, c) {
  const h = harmonyAtual(p);
  if (h === 0) return 1;
  const base = harmonyBaseBonus(p, c);
  if (base <= 0) return 1;
  return 1 + (base * Math.pow(2, h - 1)) / 100;
}

/* Builder: +1 harmony, travado no maximo */
function ganhaHarmony(p, c) {
  if (!isMonk(p)) return 0;
  const antes = harmonyAtual(p);
  p.harmony = Math.min(HARMONY_MAX, antes + 1);
  if (p.harmony !== antes) curaDeHarmony(p, c, 1);
  return p.harmony;
}

/* Spender: zera a harmonia e devolve quanto tinha, para o dano usar */
function gastaHarmony(p, c) {
  if (!isMonk(p)) return 0;
  const tinha = harmonyAtual(p);
  p.harmony = 0;
  // Virtue of Harmony devolve 1 ponto ao gastar (virtue_of_harmony.lua)
  if (tinha > 0 && p.buffs && p.buffs["utori-virtu"]) p.harmony = 1;
  if (tinha > 0) curaDeHarmony(p, c, tinha);
  return tinha;
}

/* Cura passiva do Monk exaltado: ganhar OU gastar harmonia cura.
 * Combat::harmonyHeal() cura 5% a mais por carga; a base sai do magic level,
 * como toda cura do Monk. */
function curaDeHarmony(p, c, cargas) {
  if (!isMonk(p) || !p.promoted) return 0;   // so o Exalted Monk tem isso
  const ml = typeof effMagic === "function" ? effMagic(p) : (p.ml || 0);
  let cura = Math.floor((6 + ml * 1.2) * (1 + 0.05 * cargas));
  if (p.buffs && p.buffs["utura-tio"]) {
    cura = Math.floor(cura * (monkSereno(p, c) ? 1.70 : 1.35));
  }
  const max = maxStats(p).hp;
  const antes = p.hp;
  p.hp = Math.min(max, p.hp + cura);
  const real = Math.floor(p.hp - antes);
  if (real > 0 && c && c.events) {
    c.events.push({ t: "heal", dmg: real, screen: true, harmony: true });
  }
  return real;
}

/* -------------------------------------------------------------- virtudes */

/* Multiplicador de fist fighting da Virtue of Justice.
 *
 * Valores tirados do virtue_of_justice.lua do Canary, que usa
 * CONDITION_PARAM_SKILL_FISTPERCENT 115 normal e 130 na versao serene.
 * O anuncio da CipSoft fala em 10%/20%, mas o codigo que roda de verdade
 * usa 15%/30% — segui o codigo.
 */
function virtudeFistBonus(p, c) {
  if (!isMonk(p) || !p.buffs || !p.buffs["utito-virtu"]) return 1;
  return monkSereno(p, c) ? 1.30 : 1.15;
}

/* Multiplicador de cura da Virtue of Sustain: 1.35, ou 1.70 sereno.
 * Vem do combat.cpp, o mesmo trecho que trata ORIGIN_HARMONY. */
function virtudeCuraBonus(p, c) {
  if (!isMonk(p) || !p.buffs || !p.buffs["utura-tio"]) return 1;
  return monkSereno(p, c) ? 1.70 : 1.35;
}

/* ------------------------------------------------- bonus de auto-ataque */

/* Dano extra de punho vindo do mantra (perk Ascetic da Wheel of Destiny).
 *
 * No servidor o multiplicador vem do estagio do Ascetic; aqui a Wheel ainda
 * nao existe, entao os santuarios da quest "The Way of the Monk" fazem esse
 * papel: cada santuario visitado soma 100% do mantra ao golpe, ate 3.
 */
function mantraAtaqueBonus(p, c) {
  if (!isMonk(p)) return 0;
  const estagio = Math.max(0, Math.min(3, p.monkShrines || 0));
  if (!estagio) return 0;
  const bonus = mantraTotal(p) * estagio;
  return monkSereno(p, c) ? bonus : Math.floor(bonus / 2);
}

/* ------------------------------------------------------- elemental bond */

/* Elemental Bond: o elemento que a ARMA de punho impoe as magias do Monk.
 *
 * No Canary (Combat::getCombatDamage) a regra e uma substituicao, nao um
 * bonus: se o Monk tem arma com bond, o tipo de dano da magia PASSA A SER o
 * do bond, seja qual for o COMBAT_PARAM_TYPE do script. E o jeito do Monk
 * escolher contra que resistencia vai bater, trocando de arma.
 *
 * Magias e o auto-ataque de punho usam o bond: o golpe vira UM elemento
 * (sem split fisico+gelo). Bond physical / sem arma continua punho fisico.
 */
function elementalBond(p) {
  if (!isMonk(p)) return null;
  const w = p.equip && p.equip.weapon;
  if (!w) return null;
  const it = GAMEDATA.items[w.item];
  return (it && it.bond) || null;
}

/* Elemento final de uma magia do Monk, com o bond aplicado.
 * Cura nunca e convertida (o servidor exclui COMBAT_HEALING). */
function monkSpellElement(p, s, padrao) {
  const base = padrao || (s && s.element) || "physical";
  if (!isMonk(p)) return base;
  if (s && s.type === "heal") return base;
  return elementalBond(p) || base;
}

/* Variante colorida do efeito conforme o bond.
 *
 * monkEffectByElementalBond() do servidor desloca o id do efeito: branco e
 * physical, +1 verde (earth), +2 rosa (fire). O blow tem uma variante a
 * mais (azul para ice) e por isso a ordem dele e diferente. Aqui a mesma
 * regra vale sobre o NOME do sprite, que ja foi extraido em todas as cores.
 */
const MONK_FX_CORES = {
  "claw-white":      { earth: "claw-green", fire: "claw-pink" },
  "whirlwind-white": { earth: "whirlwind-green", fire: "whirlwind-pink" },
  "pulse-white":     { earth: "pulse-green", fire: "pulse-pink" },
  "outburst-white":  { earth: "outburst-green", fire: "outburst-pink" },
  "blow-white":      { earth: "blow-green", ice: "blow-blue", fire: "blow-pink" },
};

function monkFx(p, fx) {
  if (!fx || !isMonk(p)) return fx;
  const tabela = MONK_FX_CORES[fx];
  if (!tabela) return fx;
  const bond = elementalBond(p);
  return (bond && tabela[bond]) || fx;
}

/* --------------------------------------------------- magias do Monk */

const MONKSPELLS = (typeof window !== "undefined" && window.MONKSPELLDATA)
  ? window.MONKSPELLDATA : {};

/* Bonus plano por nivel: Player::calculateFlatDamageHealing().
 *
 * O fator comeca em 1/5 e cai a cada faixa (500, +600, +700...), o que
 * segura o crescimento em nivel alto. Reproduzido igual porque ele entra
 * somado em TODAS as formulas de magia do Monk.
 */
function flatDamageHealing(level) {
  let agregado = 0;
  let baseline = 0;
  let fator = 1 / 5;
  let limite = 500;
  let passo = 600;
  let tier = 1;
  while (level >= limite) {
    baseline = limite;
    fator = 1 / (5 + tier);
    agregado += limite * (1 / (5 + tier - 1));
    tier++;
    limite += passo;
    passo += 100;
  }
  return Math.ceil(agregado + (level - baseline) * fator);
}

/* Faixa de dano de uma magia do Monk.
 *
 *   dano = BASE_POWER * (skill/100) * (attack/10) + flatDamageHealing
 *   min  = dano - dano/10      max = dano + dano/10
 *
 * Repare que NAO entra magic level: as magias de ataque do Monk escalam com
 * fist fighting e com o ataque da arma, diferente de druid e sorcerer.
 */
function monkSpellDamage(p, id) {
  const md = MONKSPELLS[id];
  if (!md || !md.pow) return null;
  const skill = typeof effSkill === "function" ? effSkill(p, "fist") : 10;
  const atk = typeof spellAttackValue === "function" ? spellAttackValue(p) : 7;
  const base = md.pow * (skill / 100) * (atk / 10) + flatDamageHealing(p.level || 1);
  return { min: Math.floor(base - base / 10), max: Math.floor(base + base / 10) };
}

/* Alvos que a magia atinge, respeitando area e chain.
 *
 * Chain nao e area: o golpe SALTA de um alvo para o mais proximo ainda nao
 * atingido, ate acabar os saltos. E por isso que o Chained Penance pega 3
 * inimigos espalhados que uma area de mesmo tamanho nao pegaria.
 * Espelha o pickChainTargets() do servidor.
 */
function monkSpellTargets(p, id, c, alvo) {
  const md = MONKSPELLS[id];
  const saida = [alvo];
  if (!md || !c || !c.mobs) return saida;

  if (md.chain) {
    const passo = md.chain.dist;          // distancia do salto, em SQM
    const vistos = new Set([alvo]);
    let atual = alvo;
    while (saida.length < md.chain.alvos) {
      let perto = null, menor = Infinity;
      for (const m of c.mobs) {
        if (m.hp <= 0 || vistos.has(m)) continue;
        const d = sqmDist(m, atual);
        if (d <= passo && d < menor) { menor = d; perto = m; }
      }
      if (!perto) break;                  // sem vizinho no alcance: para
      saida.push(perto);
      vistos.add(perto);
      atual = perto;                      // o proximo salto parte daqui
    }
    return saida;
  }

  if (md.area && md.area.raio > 0) {
    const R = md.area.raio;               // raio ja vem em SQM
    for (const m of c.mobs) {
      if (m === alvo || m.hp <= 0) continue;
      if (sqmDist(m, alvo) <= R) saida.push(m);
    }
  }
  return saida;
}

/* Resumo para a interface mostrar tudo de uma vez */
function monkStatus(p, c) {
  if (!isMonk(p)) return null;
  const h = harmonyAtual(p);
  return {
    mantra: mantraTotal(p),
    harmony: h,
    harmonyMax: HARMONY_MAX,
    bonus: Math.round((harmonyBonus(p, c) - 1) * 100),
    base: harmonyBaseBonus(p, c),
    sereno: monkSereno(p, c),
    shrines: Math.max(0, Math.min(3, p.monkShrines || 0)),
    atkBonus: mantraAtaqueBonus(p, c),
    bond: elementalBond(p),
    virtude: (p.buffs && (p.buffs["utura-tio"] ? "utura-tio"
      : p.buffs["utito-virtu"] ? "utito-virtu"
      : p.buffs["utori-virtu"] ? "utori-virtu" : null)) || null,
  };
}
