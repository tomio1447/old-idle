/*
 * ammo.js — funde o catalogo de municoes do Canary em GAMEDATA.items.
 *
 * O jogo tinha 6 municoes escritas a mao, mas o combat.js ja citava
 * diamond-arrow, onyx-arrow, crystalline-arrow e tarsal-arrow no mapa de
 * projeteis. Como esses itens nao existiam no catalogo, nao havia como
 * equipa-los: a "diamond arrow que nao bate em area" nao tinha nem item.
 *
 * AMMODATA vem de tools/import_ammo.py (data/items/items.xml do Canary mais
 * os scripts de arma, que trazem area e nivel minimo).
 */
"use strict";

/* Campos que o Canary manda: sao os numeros oficiais e ganham do valor
 * antigo escrito a mao. Preco e sprite ficam de fora porque a economia do
 * jogo ja esta calibrada em cima dos valores atuais. */
const AMMO_CAMPOS = ["atk", "el", "ammoKind", "noMiss", "areaMatrix", "lvl",
                     "w",
                     // maxHitChance: escolhe a tabela de acerto do weapons.cpp
                     "hit", "areaFx",
                     // multiplicador idle sobre o resultado da fórmula
                     "dmgMul"];

function fundirAmmoData() {
  if (typeof AMMODATA === "undefined" || typeof GAMEDATA === "undefined") {
    return 0;
  }
  let novos = 0;
  for (const slug in AMMODATA) {
    const novo = AMMODATA[slug];
    const velho = GAMEDATA.items[slug];
    if (!velho) {
      // municao inedita: entra inteira, com preco derivado do ataque para
      // nao ficar de graca na loja
      const it = Object.assign({}, novo);
      if (!it.sell) it.sell = Math.max(2, Math.round(novo.atk / 3));
      if (!it.buy) it.buy = it.sell;
      GAMEDATA.items[slug] = it;
      novos++;
      continue;
    }
    // o item antigo e a base: preserva poison, preco e tudo que so existe
    // no nosso catalogo. O Canary sobrescreve so o que ele conhece.
    for (const k of AMMO_CAMPOS) {
      if (novo[k] !== undefined) velho[k] = novo[k];
    }
    velho.el = novo.el || "physical";
  }
  return novos;
}

if (typeof window !== "undefined") fundirAmmoData();
