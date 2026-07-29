/*
 * combo.js — barra de COMBO: uma sequencia ordenada de magias e runas.
 *
 * COMO FUNCIONA
 *
 * O jogador monta ate 6 slots. A ORDEM E A PRIORIDADE: o motor percorre os
 * slots de cima para baixo e lanca o PRIMEIRO que estiver pronto. Cada slot
 * guarda um requisito de alvos minimos, entao da para escrever
 *
 *     1. Hell's Core        (4+ alvos)
 *     2. Energy Wave        (3+ alvos)
 *     3. Great Fireball     (2+ alvos)
 *     4. Sudden Death       (1 alvo)
 *
 * e a rotacao se adapta sozinha ao tamanho do pack: com 5 bichos sai o Hell's
 * Core, com 1 sai a SD.
 *
 * POR QUE SUBSTITUI O SHOOTER
 *
 * Antes havia tres controles que competiam entre si: shooterType (auto /
 * magia / runa), shooterSpell, shooterRune, mais a lista attackSpells. Era
 * possivel configurar estados contraditorios (tipo "rune" com uma magia
 * marcada) e o motor tinha que desempatar. Agora existe uma fonte unica:
 * p.config.combo.
 */
"use strict";

const COMBO_SLOTS = 6;

/* Garante a estrutura do combo no save. Cada slot e
 *   { kind: "spell"|"rune", id: <slug>, min: <alvos minimos> }
 * ou null quando vazio. */
function ensureCombo(p) {
  if (!p) return [];
  if (!Array.isArray(p.config.combo)) p.config.combo = [];
  const c = p.config.combo;
  while (c.length < COMBO_SLOTS) c.push(null);
  if (c.length > COMBO_SLOTS) c.length = COMBO_SLOTS;
  for (let i = 0; i < c.length; i++) {
    const s = c[i];
    if (!s || !s.id || (s.kind !== "spell" && s.kind !== "rune")) {
      c[i] = null;
      continue;
    }
    s.min = Math.max(1, Math.min(9, parseInt(s.min, 10) || 1));
  }
  return c;
}

/* Migra a config antiga (shooterSpell / shooterRune / attackSpells) para a
 * barra de combo, uma vez so. Sem isso quem ja jogava perderia a rotacao
 * inteira ao atualizar. */
function migrateComboFromShooter(p) {
  if (!p || !p.config) return;
  if (p.config.comboMigrado) return;
  p.config.comboMigrado = 1;
  const c = ensureCombo(p);
  if (c.some((s) => s)) return;         // ja montou combo por conta propria

  const add = (kind, id) => {
    if (!id) return;
    const i = c.findIndex((s) => !s);
    if (i === -1) return;
    // magia/runa de area entra pedindo 2 alvos, que e o uso tipico
    const area = kind === "spell"
      ? !!(SPELLS[id] && SPELLS[id].area)
      : !!(SUPPLIES[id] && SUPPLIES[id].area);
    c[i] = { kind: kind, id: id, min: area ? 2 : 1 };
  };

  // a magia e a runa que estavam escolhidas no shooter vem primeiro
  if (p.config.shooterType === "spell") add("spell", p.config.shooterSpell);
  if (p.config.shooterType === "rune") add("rune", p.config.shooterRune);
  // depois as magias que estavam marcadas na lista multipla
  for (const id of (p.config.attackSpells || [])) add("spell", id);
  // e por fim o que sobrou do shooter que nao era o tipo ativo
  if (p.config.shooterType !== "spell") add("spell", p.config.shooterSpell);
  if (p.config.shooterType !== "rune") add("rune", p.config.shooterRune);
}

/* Quantos monstros a magia/runa pegaria se fosse lancada NESTE alvo.
 *
 * E a mesma conta que o combate faz na hora de aplicar o dano, entao o
 * requisito "4+" do jogador bate com o que ele realmente vai acertar. Sem
 * isso o contador diria 5 e o golpe acertaria 2. */
function comboAlvosNoRaio(c, alvo, raio) {
  if (!c || !c.mobs || !alvo) return 0;
  if (!raio || raio <= 0) return 1;
  let n = 0;
  for (const m of c.mobs) {
    if (m.hp <= 0) continue;
    if (typeof sqmDist === "function" ? sqmDist(m, alvo) <= raio
                                      : m === alvo) n++;
  }
  return Math.max(1, n);
}

/* Raio de efeito, em SQM, de uma entrada do combo */
function comboRaio(entrada) {
  if (!entrada) return 0;
  if (entrada.kind === "rune") {
    const s = SUPPLIES[entrada.id];
    return s && s.area && s.area.raio ? s.area.raio : 0;
  }
  const md = (typeof MONKSPELLS !== "undefined") ? MONKSPELLS[entrada.id] : null;
  if (md && md.area && md.area.raio) return md.area.raio;
  if (md && md.chain) return md.chain.dist;
  const s = SPELLS[entrada.id];
  if (!s || !s.area) return 0;
  // magias comuns nao trazem a grade resolvida; `alvos` conta SQMs cobertos,
  // entao o raio aproximado e a raiz disso
  return Math.max(1, Math.round(Math.sqrt(s.alvos || 9) / 2));
}

/* A entrada e de area? Usado pela UI para mostrar o seletor de alvos. */
function comboEhArea(entrada) {
  return comboRaio(entrada) > 0;
}

/* Nome, icone e detalhes de uma entrada, para a UI nao repetir logica */
function comboInfo(entrada) {
  if (!entrada) return null;
  if (entrada.kind === "rune") {
    const s = SUPPLIES[entrada.id];
    if (!s) return null;
    return { nome: s.name, img: `assets/item/${s.sprite}.png`,
             tipo: "Runa", lvl: s.lvl || 1, area: comboEhArea(entrada) };
  }
  const s = SPELLS[entrada.id];
  if (!s) return null;
  return { nome: s.name, icon: s.icon, words: s.words,
           tipo: s.area ? "Área" : "Ataque", lvl: s.lvl,
           mana: s.mana, area: comboEhArea(entrada) };
}

/* A entrada esta pronta para ser usada agora? */
function comboPronta(c, p, entrada, alvo, now) {
  if (!entrada) return false;

  if (entrada.kind === "spell") {
    const s = SPELLS[entrada.id];
    if (!s || s.type !== "attack") return false;
    if (s.vocs.indexOf(p.voc) === -1) return false;
    if (p.level < s.lvl) return false;
    if (s.ml && effMagic(p) < s.ml) return false;
    if (p.mp < s.mana) return false;
    if (typeof cdReady === "function" && !cdReady(p, entrada.id, now)) return false;
    if (s.needWeapon && !(p.equip && p.equip.weapon)) return false;
    return true;
  }

  const s = SUPPLIES[entrada.id];
  if (!s || s.type !== "attack") return false;
  if (typeof supplyAllowed === "function" && !supplyAllowed(p, entrada.id)) return false;
  if (typeof canRechargeSupply === "function" &&
      !canRechargeSupply(p, entrada.id)) return false;
  if (c && c.runeCd > now) return false;
  return true;
}

/* Escolhe a proxima acao do combo.
 *
 * Devolve { kind, id, entrada } ou null. A ordem dos slots E a prioridade —
 * nao ha ordenacao por dano aqui, de proposito: quem manda e o jogador.
 */
function comboEscolhe(c, p, alvo, now) {
  const lista = ensureCombo(p);
  for (const entrada of lista) {
    if (!entrada) continue;
    if (!comboPronta(c, p, entrada, alvo, now)) continue;
    // Requisito de alvos: so dispara se o pack for grande o bastante.
    // Usa a MATRIZ real da area quando ela existe, para o "4+" contar
    // exatamente quem o golpe vai acertar -- inclusive o formato do leque.
    if (entrada.min > 1) {
      let n = null;
      if (typeof areaNameOf === "function" && typeof areaCount === "function") {
        const nome = areaNameOf(entrada.kind, entrada.id);
        if (nome && c && c.player) n = areaCount(c, nome, c.player, alvo);
      }
      if (n === null) n = comboAlvosNoRaio(c, alvo, comboRaio(entrada));
      if (n < entrada.min) continue;
    }
    return { kind: entrada.kind, id: entrada.id, entrada: entrada };
  }
  return null;
}

/* O combo tem pelo menos um slot preenchido? */
function comboAtivo(p) {
  return ensureCombo(p).some((s) => s);
}
