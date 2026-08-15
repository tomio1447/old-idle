/* accessorydata.js — Anéis e Amuletos (TibiaWiki BR: /wiki/Anéis e
 * /wiki/Amuletos_e_Colares).
 *
 * O gamedata.js é gerado pelo importador e traz anéis/amuletos sem os
 * atributos reais (só stats de venda). Este arquivo aplica POR CIMA os
 * atributos oficiais da TibiaWiki (proteção por elemento `res`, bônus de
 * skill, regen, velocidade, arm, cargas, requisitos) e adiciona os itens
 * que faltam — todos com sprite oficial já presente em assets/item/.
 *
 * Assim como o spelldata_1525.js, o patch sobrevive a reimportação do
 * gamedata.
 */
"use strict";

(function aplicarAccessoryData() {
  if (typeof GAMEDATA === "undefined" || !GAMEDATA.items) return;
  const IT = GAMEDATA.items;

  /* Atributos oficiais (descrição "You see" das páginas da wiki). */
  const PATCHES = {
    /* ------------------------------- anéis básicos de vila (loja) */
    "life-ring": {
      desc: "Anel da vida (regeneração mais rápida). 400 cargas por tempo (20 min).",
      hpreg: 6, mpreg: 2,
      charges: 400, chargeMode: "time",
    },
    "time-ring": {
      desc: "Anel do tempo (velocidade +30). 200 cargas por tempo (10 min).",
      spd: 30,
      charges: 200, chargeMode: "time",
    },
    "energy-ring": {
      desc: "Anel de energia (Magic Shield: dano consome mana antes da vida). 200 cargas por tempo (10 min).",
      manaShield: 1, magicShield: 1,
      charges: 200, chargeMode: "time",
      // Regra do dono: só Monk e Royal Paladin equipam energy ring.
      vocs: ["monk", "exalted monk", "paladin", "royal paladin"],
    },
    "might-ring": {
      desc: "Anel do poder (proteção +20% em todos os elementos). 20 cargas POR GOLPE recebido.",
      charges: 20, chargeMode: "hits",
      res: { physical: 20, fire: 20, earth: 20, energy: 20, ice: 20,
             holy: 20, death: 20 },
    },
    "sword-ring": {
      desc: "Anel de espada (espada +4). 600 cargas por tempo (30 min).",
      sword: 4,
      charges: 600, chargeMode: "time",
    },
    "axe-ring": {
      desc: "Anel de machado (machado +4). 600 cargas por tempo (30 min).",
      axe: 4,
      charges: 600, chargeMode: "time",
    },
    "club-ring": {
      desc: "Anel de clava (clava +4). 600 cargas por tempo (30 min).",
      club: 4,
      charges: 600, chargeMode: "time",
    },
    "dwarven-ring": {
      desc: "Anel anão (bebe muito sem cair: resiste a bebidas). 1200 cargas por tempo (60 min).",
      hpreg: 3,
      charges: 1200, chargeMode: "time",
    },
    "ring-of-healing": {
      desc: "Anel da cura (regeneração mais rápida). 160 cargas por tempo (8 min).",
      hpreg: 8, mpreg: 10,
      charges: 160, chargeMode: "time",
    },
    "power-ring": {
      desc: "Anel de poder (punho +4). 600 cargas por tempo (30 min).",
      fist: 4,
      charges: 600, chargeMode: "time",
    },
    "stealth-ring": {
      desc: "Anel da invisibilidade (invisível por 10 minutos). 200 cargas por tempo.",
      invis: 1,
      charges: 200, chargeMode: "time",
    },
    "crystal-ring": {
      desc: "Anel de cristal (item decorativo — sem atributos, como no items.xml do Canary).",
    },
    "star-ring": {
      desc: "Anel estrela (regeneração mais rápida).",
      hpreg: 5, mpreg: 6,
    },
    "gold-ring": {
      desc: "Anel de ouro (item decorativo — sem atributos, como no items.xml do Canary).",
    },
    "wedding-ring": {
      desc: "Aliança de casamento (item decorativo — sem atributos, como no items.xml do Canary).",
    },
    "butterfly-ring": {
      desc: "Anel borboleta (arm 2, proteção morte +3%).",
      arm: 2, res: { death: 3 },
    },
    "death-ring": {
      desc: "Anel da morte (arm 1, escudo -10, proteção morte +5%).",
      arm: 1, shield: -10, res: { death: 5 },
    },
    "lion-ring": {
      desc: "Anel de leão (regeneração mais rápida).",
      hpreg: 5, mpreg: 5,
    },
    "prismatic-ring": {
      desc: "Anel prismático (proteção física +10%, energia +8%).",
      res: { physical: 10, energy: 8 },
    },

    /* ------------------------------- anéis de plasma (nível 100) */
    "ring-of-blue-plasma": {
      desc: "Anel de plasma azul (distância +3, magic level +1).",
      dist: 3, mag: 1, lvl: 100, vocs: ["paladin"],
    },
    "ring-of-green-plasma": {
      desc: "Anel de plasma verde (magic level +2, regeneração mais rápida).",
      mag: 2, hpreg: 4, mpreg: 6, lvl: 100, vocs: ["sorcerer", "druid"],
    },
    "ring-of-orange-plasma": {
      desc: "Anel de plasma laranja (punho +3, magic level +1, proteção física +2%).",
      fist: 3, mag: 1, res: { physical: 2 }, lvl: 100, vocs: ["monk"],
    },
    "ring-of-red-plasma": {
      desc: "Anel de plasma vermelho (espada +3, clava +3, machado +3, proteção física +3%).",
      sword: 3, club: 3, axe: 3, res: { physical: 3 }, lvl: 100,
      vocs: ["knight"],
    },
    "ring-of-souls": {
      desc: "Anel das almas (proteção física +2%, life drain +10%).",
      res: { physical: 2 }, lifeLeech: 10, lvl: 200,
    },
    "ring-of-temptation": {
      desc: "Anel da tentação (proteção mana drain +30%). 200 cargas.",
      charges: 200, res: { manadrain: 30 }, lvl: 80,
    },
    "ring-of-the-sky": {
      desc: "Anel do céu (item decorativo — sem atributos, como no items.xml do Canary).",
    },
    "ring-of-wishes": {
      desc: "Anel dos desejos (item decorativo — sem atributos, como no items.xml do Canary).",
    },
    "ring-of-ending": {
      desc: "Anel do fim (item de quest).",
    },
    "ring-of-secret-thoughts": {
      desc: "Anel dos pensamentos secretos (item de quest).",
    },
    "spiritthorn-ring": {
      desc: "Anel espinho espiritual (proteção física +2%, fogo/terra/energia/gelo +4%).",
      res: { physical: 2, fire: 4, earth: 4, energy: 4, ice: 4 }, lvl: 250,
    },
    "ethereal-ring": {
      desc: "Anel etéreo (proteção física +1%, fogo/terra/energia/gelo +4%).",
      res: { physical: 1, fire: 4, earth: 4, energy: 4, ice: 4 }, lvl: 250,
    },
    "alicorn-ring": {
      desc: "Anel alicórnio (holy magic level +1, proteção +4% fogo/terra/energia/gelo).",
      mag: 1, res: { fire: 4, earth: 4, energy: 4, ice: 4 },
      lvl: 400, vocs: ["paladin"],
    },
    "arboreal-ring": {
      desc: "Anel arbóreo (healing magic level +2, proteção +4% fogo/terra/energia/gelo).",
      mag: 2, res: { fire: 4, earth: 4, energy: 4, ice: 4 },
      lvl: 400, vocs: ["druid"],
    },
    "arcanomancer-sigil": {
      desc: "Sigilo arcanomante (fire magic level +1, energy magic level +1, proteção +4%).",
      mag: 1, res: { fire: 4, earth: 4, energy: 4, ice: 4 },
      lvl: 400, vocs: ["sorcerer"],
    },
    "blister-ring": {
      desc: "Anel bolha (item de quest).",
      res: { fire: 2 },
    },
    "enchanted-blister-ring": {
      desc: "Anel bolha encantado (proteção fogo +6%).",
      res: { fire: 6 }, lvl: 250,
    },

    /* ------------------------------- amuletos básicos (loja) */
    "stone-skin-amulet": {
      desc: "Amuleto de pele de pedra (proteção física +80%, morte +80%). 5 cargas.",
      charges: 5, res: { physical: 80, death: 80 },
    },
    "ancient-amulet": {
      desc: "Amuleto antigo (item decorativo — sem atributos, como no items.xml do Canary).",
    },
    "bronze-amulet": {
      desc: "Amuleto de bronze (proteção mana drain +20%). 200 cargas.",
      charges: 200, res: { manadrain: 20 },
    },
    "silver-amulet": {
      desc: "Amuleto de prata (proteção terra +10%). 200 cargas.",
      charges: 200, res: { earth: 10 },
    },
    "golden-amulet": {
      desc: "Amuleto dourado (item decorativo — sem atributos, como no items.xml do Canary).",
    },
    "platinum-amulet": {
      desc: "Amuleto de platina (arm 2).",
      arm: 2,
    },
    "protection-amulet": {
      desc: "Amuleto de proteção (proteção física +6%). 250 cargas.",
      charges: 250, res: { physical: 6 },
    },
    "scarab-amulet": {
      desc: "Amuleto de escaravelho (proteção +14%).",
      prot: 14,
    },
    "star-amulet": {
      desc: "Amuleto estrela (proteção +16%).",
      prot: 16,
    },
    "starlight-amulet": {
      desc: "Amuleto de luz estelar (item decorativo — sem atributos, como no items.xml do Canary).",
    },
    "elven-amulet": {
      desc: "Amuleto élfico (proteção +5% em todos os elementos). 50 cargas.",
      charges: 50,
      res: { physical: 5, fire: 5, earth: 5, energy: 5, ice: 5,
             holy: 5, death: 5 },
    },
    "crystal-necklace": {
      desc: "Colar de cristal (item decorativo — sem atributos, como no items.xml do Canary).",
    },
    "ruby-necklace": {
      desc: "Colar de rubi (item decorativo — sem atributos, como no items.xml do Canary).",
    },
    "dragon-necklace": {
      desc: "Colar de dragão (proteção fogo +8%). 200 cargas.",
      charges: 200, res: { fire: 8 },
    },
    "garlic-necklace": {
      desc: "Colar de alho (proteção life drain +20%). 150 cargas.",
      charges: 150, res: { lifedrain: 20 },
    },
    "demonbone-amulet": {
      desc: "Amuleto de osso de demônio (proteção +25%).",
      prot: 25,
    },
    "paw-amulet": {
      desc: "Amuleto de pata (sorte).",
    },
    "elven-amulet": {
      desc: "Amuleto élfico (proteção +5% em todos os elementos).",
    },

    /* ------------------------------- amuletos de elemento (200 cargas) */
    "terra-amulet": {
      desc: "Amuleto de terra (proteção terra +20%, fogo -10%). 200 cargas.",
      charges: 200, res: { earth: 20, fire: -10 }, lvl: 60,
    },
    "magma-amulet": {
      desc: "Amuleto de magma (proteção fogo +20%, gelo -10%). 200 cargas.",
      charges: 200, res: { fire: 20, ice: -10 }, lvl: 60,
    },
    "glacier-amulet": {
      desc: "Amuleto de geleira (proteção gelo +20%, energia -10%). 200 cargas.",
      charges: 200, res: { ice: 20, energy: -10 }, lvl: 60,
    },
    "lightning-pendant": {
      desc: "Pingente de relâmpago (proteção energia +20%, terra -10%). 200 cargas.",
      charges: 200, res: { energy: 20, earth: -10 }, lvl: 60,
    },
    "rainbow-amulet": {
      desc: "Amuleto arco-íris (arm 3, proteção física +5%, fogo +6%, gelo -10%).",
      arm: 3, res: { physical: 5, fire: 6, ice: -10 },
    },
    "lion-amulet": {
      desc: "Amuleto de leão (arm 3, proteção física +3%, gelo +7%).",
      arm: 3, res: { physical: 3, ice: 7 }, lvl: 80,
    },
    "foxtail-amulet": {
      desc: "Amuleto de rabo de raposa (arm 2, proteção física +5%).",
      arm: 2, res: { physical: 5 },
    },
    "onyx-pendant": {
      desc: "Pingente de ônix (arm 2, proteção morte +2%).",
      arm: 2, res: { death: 2 },
    },
    "strange-talisman": {
      desc: "Talismã estranho (proteção energia +10%). 200 cargas.",
      charges: 200, res: { energy: 10 },
    },
    "harmony-amulet": {
      desc: "Amuleto da harmonia (arm 2, mantra 2, punho +1).",
      arm: 2, mantra: 2, fist: 1,
    },
    "gill-necklace": {
      desc: "Colar de brânquias (proteção física +15%, terra +10%). 750 cargas.",
      charges: 750, res: { physical: 15, earth: 10 }, lvl: 60,
    },
    "necklace-of-the-deep": {
      desc: "Colar das profundezas (proteção life drain +50%). 50 cargas.",
      charges: 50, res: { lifedrain: 50 }, lvl: 80,
    },
    "beetle-necklace": {
      desc: "Colar de besouro (velocidade +2).",
      spd: 2,
    },
    "shrunken-head-necklace": {
      desc: "Colar de cabeça encolhida (velocidade +10).",
      spd: 10,
    },
    "candy-necklace": {
      desc: "Colar de doces (arm 2, proteção física +3%, energia +6%, terra -5%).",
      arm: 2, res: { physical: 3, energy: 6, earth: -5 },
    },
    "glooth-amulet": {
      desc: "Amuleto glooth (proteção +10% em todos os elementos). 20 cargas.",
      charges: 20,
      res: { physical: 10, fire: 10, earth: 10, energy: 10, ice: 10,
             holy: 10, death: 10 }, lvl: 200,
    },
    "shockwave-amulet": {
      desc: "Amuleto de onda de choque (proteção física +60%, energia +40%). 5 cargas.",
      charges: 5, res: { physical: 60, energy: 40 }, lvl: 80,
    },
    "bonfire-amulet": {
      desc: "Amuleto de fogueira (proteção física +60%, fogo +40%). 5 cargas.",
      charges: 5, res: { physical: 60, fire: 40 }, lvl: 80,
    },
    "sacred-tree-amulet": {
      desc: "Amuleto da árvore sagrada (proteção física +60%, terra +40%). 5 cargas.",
      charges: 5, res: { physical: 60, earth: 40 }, lvl: 80,
    },
    "exotic-amulet": {
      desc: "Amuleto exótico (proteção física +4%, terra +5%).",
      res: { physical: 4, earth: 5 }, lvl: 400,
    },
    "prismatic-necklace": {
      desc: "Colar prismático (proteção física +10%, energia +15%). 750 cargas.",
      charges: 750, res: { physical: 10, energy: 15 }, lvl: 60,
    },
    "enchanted-theurgic-amulet": {
      desc: "Amuleto teúrgico encantado (arm 2, magic level +3, proteção física +3%, terra +14%).",
      arm: 2, mag: 3, res: { physical: 3, earth: 14 }, lvl: 250,
    },
    "amulet-of-theurgy": {
      desc: "Amuleto de teurgia (item de quest).",
    },
    "amulet-of-loss": {
      desc: "Amuleto da perda (evita perder itens ao morrer).",
      noLoss: 1,
    },
  };

  for (const slug in PATCHES) {
    if (!IT[slug]) continue;
    Object.assign(IT[slug], PATCHES[slug]);
  }

  /* ----------------------- itens novos (sprite já em assets/item) */
  const NOVOS = {
    "ring-of-blue-plasma": { cat: "ring", id: 23529, n: "ring of blue plasma",
      s: "ring", t: "accessory", sell: 8000, w: 0.9, lvl: 100, vocs: ["paladin"],
      dist: 3, mag: 1 },
    "ring-of-green-plasma": { cat: "ring", id: 23530, n: "ring of green plasma",
      s: "ring", t: "accessory", sell: 8000, w: 0.9, lvl: 100,
      vocs: ["sorcerer", "druid"], mag: 2, hpreg: 4, mpreg: 6 },
    "ring-of-orange-plasma": { cat: "ring", id: 23531, n: "ring of orange plasma",
      s: "ring", t: "accessory", sell: 8000, w: 0.9, lvl: 100, vocs: ["monk"],
      fist: 3, mag: 1, res: { physical: 2 } },
    "ring-of-red-plasma": { cat: "ring", id: 23532, n: "ring of red plasma",
      s: "ring", t: "accessory", sell: 8000, w: 0.9, lvl: 100, vocs: ["knight"],
      sword: 3, club: 3, axe: 3, res: { physical: 3 } },
    "ring-of-souls": { cat: "ring", id: 32636, n: "ring of souls",
      s: "ring", t: "accessory", sell: 8000, w: 0.8, lvl: 200,
      res: { physical: 2 }, lifeLeech: 10 },
    "ring-of-temptation": { cat: "ring", id: 32639, n: "ring of temptation",
      s: "ring", t: "accessory", sell: 8000, w: 0.8, charges: 200, lvl: 80,
      res: { manadrain: 30 } },
    "death-ring": { cat: "ring", id: 6299, n: "death ring",
      s: "ring", t: "accessory", sell: 1000, w: 0.8,
      arm: 1, shield: -10, res: { death: 5 } },
    "star-ring": { cat: "ring", id: 3092, n: "star ring",
      s: "ring", t: "accessory", sell: 2, w: 0.9, hpreg: 5, mpreg: 6 },
    "butterfly-ring": { cat: "ring", id: 32647, n: "butterfly ring",
      s: "ring", t: "accessory", sell: 2, w: 0.8, arm: 2, res: { death: 3 } },
    "lion-ring": { cat: "ring", id: 32649, n: "lion ring",
      s: "ring", t: "accessory", sell: 2, w: 0.9, hpreg: 5, mpreg: 5 },
    "prismatic-ring": { cat: "ring", id: 32525, n: "prismatic ring",
      s: "ring", t: "accessory", sell: 8000, w: 0.9, lvl: 60,
      res: { physical: 10, energy: 8 } },
    "prismatic-necklace": { cat: "amulet", id: 32526, n: "prismatic necklace",
      s: "amulet", t: "accessory", sell: 8000, w: 0.8, charges: 750, lvl: 60,
      res: { physical: 10, energy: 15 } },
    "terra-amulet": { cat: "amulet", id: 3079, n: "terra amulet",
      s: "amulet", t: "accessory", sell: 2, w: 1.5, charges: 200, lvl: 60,
      res: { earth: 20, fire: -10 } },
    "magma-amulet": { cat: "amulet", id: 3078, n: "magma amulet",
      s: "amulet", t: "accessory", sell: 2, w: 1.5, charges: 200, lvl: 60,
      res: { fire: 20, ice: -10 } },
    "glacier-amulet": { cat: "amulet", id: 3076, n: "glacier amulet",
      s: "amulet", t: "accessory", sell: 2, w: 1.5, charges: 200, lvl: 60,
      res: { ice: 20, energy: -10 } },
    "lightning-pendant": { cat: "amulet", id: 3077, n: "lightning pendant",
      s: "amulet", t: "accessory", sell: 2, w: 1.5, charges: 200, lvl: 60,
      res: { energy: 20, earth: -10 } },
    "rainbow-amulet": { cat: "amulet", id: 3083, n: "rainbow amulet",
      s: "amulet", t: "accessory", sell: 8000, w: 1.0,
      arm: 3, res: { physical: 5, fire: 6, ice: -10 } },
    "lion-amulet": { cat: "amulet", id: 32650, n: "lion amulet",
      s: "amulet", t: "accessory", sell: 8000, w: 1.0, lvl: 80,
      arm: 3, res: { physical: 3, ice: 7 } },
    "foxtail-amulet": { cat: "amulet", id: 32633, n: "foxtail amulet",
      s: "amulet", t: "accessory", sell: 2, w: 1.0,
      arm: 2, res: { physical: 5 } },
    "onyx-pendant": { cat: "amulet", id: 3085, n: "onyx pendant",
      s: "amulet", t: "accessory", sell: 2, w: 1.2,
      arm: 2, res: { death: 2 } },
    "strange-talisman": { cat: "amulet", id: 3084, n: "strange talisman",
      s: "amulet", t: "accessory", sell: 2, w: 1.0, charges: 200,
      res: { energy: 10 } },
    "harmony-amulet": { cat: "amulet", id: 32634, n: "harmony amulet",
      s: "amulet", t: "accessory", sell: 2, w: 1.0,
      arm: 2, mantra: 2, fist: 1 },
    "gill-necklace": { cat: "amulet", id: 32631, n: "gill necklace",
      s: "amulet", t: "accessory", sell: 8000, w: 1.0, charges: 750, lvl: 60,
      res: { physical: 15, earth: 10 } },
    "necklace-of-the-deep": { cat: "amulet", id: 32632, n: "necklace of the deep",
      s: "amulet", t: "accessory", sell: 8000, w: 1.0, charges: 50, lvl: 80,
      res: { lifedrain: 50 } },
    "beetle-necklace": { cat: "amulet", id: 3082, n: "beetle necklace",
      s: "amulet", t: "accessory", sell: 2, w: 1.0, spd: 2 },
    "shrunken-head-necklace": { cat: "amulet", id: 32635, n: "shrunken head necklace",
      s: "amulet", t: "accessory", sell: 2, w: 1.0, spd: 10 },
    "candy-necklace": { cat: "amulet", id: 32641, n: "candy necklace",
      s: "amulet", t: "accessory", sell: 2, w: 1.0,
      arm: 2, res: { physical: 3, energy: 6, earth: -5 } },
    "glooth-amulet": { cat: "amulet", id: 32638, n: "glooth amulet",
      s: "amulet", t: "accessory", sell: 8000, w: 1.0, charges: 20, lvl: 200,
      res: { physical: 10, fire: 10, earth: 10, energy: 10, ice: 10,
             holy: 10, death: 10 } },
    "shockwave-amulet": { cat: "amulet", id: 32640, n: "shockwave amulet",
      s: "amulet", t: "accessory", sell: 8000, w: 1.0, charges: 5, lvl: 80,
      res: { physical: 60, energy: 40 } },
    "bonfire-amulet": { cat: "amulet", id: 32642, n: "bonfire amulet",
      s: "amulet", t: "accessory", sell: 8000, w: 1.0, charges: 5, lvl: 80,
      res: { physical: 60, fire: 40 } },
    "sacred-tree-amulet": { cat: "amulet", id: 32643, n: "sacred tree amulet",
      s: "amulet", t: "accessory", sell: 8000, w: 1.0, charges: 5, lvl: 80,
      res: { physical: 60, earth: 40 } },
    "exotic-amulet": { cat: "amulet", id: 32648, n: "exotic amulet",
      s: "amulet", t: "accessory", sell: 2, w: 1.0, lvl: 400,
      res: { physical: 4, earth: 5 } },
    "enchanted-theurgic-amulet": { cat: "amulet", id: 32644, n: "enchanted theurgic amulet",
      s: "amulet", t: "accessory", sell: 8000, w: 1.0, lvl: 250,
      arm: 2, mag: 3, res: { physical: 3, earth: 14 } },
    "spiritthorn-ring": { cat: "ring", id: 32645, n: "spiritthorn ring",
      s: "ring", t: "accessory", sell: 8000, w: 0.9, lvl: 250,
      res: { physical: 2, fire: 4, earth: 4, energy: 4, ice: 4 } },
    "ethereal-ring": { cat: "ring", id: 32646, n: "ethereal ring",
      s: "ring", t: "accessory", sell: 8000, w: 0.9, lvl: 250,
      res: { physical: 1, fire: 4, earth: 4, energy: 4, ice: 4 } },
    "alicorn-ring": { cat: "ring", id: 32652, n: "alicorn ring",
      s: "ring", t: "accessory", sell: 8000, w: 0.85, lvl: 400, vocs: ["paladin"],
      mag: 1, res: { fire: 4, earth: 4, energy: 4, ice: 4 } },
    "arboreal-ring": { cat: "ring", id: 32653, n: "arboreal ring",
      s: "ring", t: "accessory", sell: 8000, w: 0.7, lvl: 400, vocs: ["druid"],
      mag: 2, res: { fire: 4, earth: 4, energy: 4, ice: 4 } },
    "arcanomancer-sigil": { cat: "ring", id: 32654, n: "arcanomancer sigil",
      s: "ring", t: "accessory", sell: 8000, w: 0.9, lvl: 400, vocs: ["sorcerer"],
      mag: 1, res: { fire: 4, earth: 4, energy: 4, ice: 4 } },
    "enchanted-blister-ring": { cat: "ring", id: 32655, n: "enchanted blister ring",
      s: "ring", t: "accessory", sell: 8000, w: 0.9, lvl: 250,
      res: { fire: 6 } },
  };

  for (const slug in NOVOS) {
    if (!IT[slug]) {
      const d = NOVOS[slug];
      IT[slug] = Object.assign({ drop: 1, shop: 0, n: d.n }, d);
    }
  }

  /* Sistema de CARGAS (Canary):
   *  - rings com duration/transformEquipTo → chargeMode "time" (1/3s);
   *  - showCharges (might ring, SSA, amuletos) → chargeMode "hits";
   *  - supply-stash-data.js sobrescreve o mode correto por item. */
  for (const slug in IT) {
    const it = IT[slug];
    if (it && (it.s === "ring" || it.s === "amulet") && it.charges &&
        !it.chargeMode) {
      it.chargeMode = "hits";
    }
  }
})();
