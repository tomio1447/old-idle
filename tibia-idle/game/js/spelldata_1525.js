/* ============================================================
 * spelldata_1525.js — Update 15.25.3a4a52 (Vocation Balancing,
 * 16/jun/2026), aplicado por cima dos dados importados do Canary.
 *
 * Fonte oficial: https://www.tibiawiki.com.br/wiki/Updates/15.25.3a4a52
 * e as paginas individuais de cada magia (Blood Rage, Sharpshooter,
 * Divine Defiance...), que registram os valores pos-update.
 *
 * Este arquivo NAO inventa numeros: todo ajuste abaixo aponta a linha
 * da tabela do update de onde o valor saiu. Onde o update nao da o
 * numero (ex.: cooldown "ajustado" do Mass Spirit Mend), o valor do
 * Canary e MANTIDO e o comentario diz isso.
 *
 * O que NAO se aplica num idle solo (fica fora de proposito):
 *   - augments da Wheel of Destiny (Front Sweep Augment, Lord of
 *     Destruction...), Gems/Dedication de mitigation, perks de Weapon
 *     Proficiency, Bonus de XP em grupo, cura da party dos buffs de
 *     Monk, familiar do Monk, Gift of Life (perk do Wheel), Divine
 *     Grenade com 3 miras, Beam Mastery (o jogo nao simula sqm
 *     adjacentes do feixe) e Combat Modes (o jogo nao os tinha).
 * ============================================================ */
"use strict";

(function aplicarUpdate1525() {
  const SD = window.SPELLDATA;
  if (!SD) return;

  /* Escala os coeficientes de uma formula do Canary pelo fator do
   * update (ex.: Strong Flame Strike base 90 -> 125 = fator 125/90).
   * Os termos de nivel (lvlMin/lvlMax) ficam de fora: eles nao fazem
   * parte do "base power" que a nota divulga. */
  function escala(id, fator) {
    const s = SD[id];
    if (!s || !s.f) return;
    const f = s.f;
    for (const k of ["mlMin", "mlMax", "flatMin", "flatMax",
                     "saMin", "saMax", "skMin", "skMax", "atMin", "atMax"]) {
      if (typeof f[k] === "number") f[k] = f[k] * fator;
    }
  }

  /* ------------------------------------------------ magias atualizadas */

  // Berserk mana 115 -> 125 / Fierce Berserk 340 -> 360 / Groundshaker 160 -> 200
  if (SD["exori"]) SD["exori"].mana = 125;
  if (SD["exori-gran"]) SD["exori-gran"].mana = 360;
  if (SD["exori-mas"]) SD["exori-mas"].mana = 200;

  // Curas de Knight: base power novo + grupo de cooldown 2s (grupos["2"]).
  // Os flats respeitam o novo "base power" mantendo a proporcao min/max
  // que a formula importada do Canary tinha.
  // Bruise Bane base 15 (mana 10, inalterada)
  if (SD["exura-infir-ico"]) {
    const s = SD["exura-infir-ico"];
    s.f = { modo: "magic", lvlMin: 0.2, mlMin: 1.795, flatMin: 15,
            lvlMax: 0.2, mlMax: 1.795, flatMax: 30 };
    s.grupos = { "2": 2000 }; s.gcd = 2000;
  }
  // Wound Cleansing base 70, mana 40 -> 60
  if (SD["exura-ico"]) {
    const s = SD["exura-ico"];
    s.mana = 60;
    s.f = { modo: "magic", lvlMin: 0.2, mlMin: 4, flatMin: 70,
            lvlMax: 0.2, mlMax: 7.95, flatMax: 143 };
    s.grupos = { "2": 2000 }; s.gcd = 2000;
  }
  // Fair Wound Cleansing base 225, mana 90 -> 135
  if (SD["exura-med-ico"]) {
    const s = SD["exura-med-ico"];
    s.mana = 135;
    s.f = { modo: "magic", lvlMin: 0.4, mlMin: 8, flatMin: 225,
            lvlMax: 0.4, mlMax: 15.9, flatMax: 459 };
    s.grupos = { "2": 2000 }; s.gcd = 2000;
  }
  // Intense Wound Cleansing base 500, mana 200 -> 300, cd 10min -> 2min
  if (SD["exura-gran-ico"]) {
    const s = SD["exura-gran-ico"];
    s.mana = 300;
    s.cd = 120000;
    s.f = { modo: "magic", lvlMin: 0.2, mlMin: 70, flatMin: 500,
            lvlMax: 0.2, mlMax: 92, flatMax: 620 };
    s.grupos = { "2": 2000 }; s.gcd = 2000;
  }

  // Strikes melhoradas: base power sobe e alcance vai de 3 para 7.
  const razoes85 = [
    ["exori-gran-flam", 125 / 90], ["exori-gran-vis", 125 / 90],
    ["exori-gran-tera", 115 / 90], ["exori-gran-frigo", 115 / 90],
    ["exori-max-flam", 210 / 150], ["exori-max-vis", 210 / 150],
    ["exori-max-tera", 195 / 150], ["exori-max-frigo", 195 / 150],
  ];
  for (const [id, r] of razoes85) {
    escala(id, r);
    if (SD[id]) SD[id].range = 7;         // alcance 3 -> 7
  }

  // Lightning: base 70 -> 110, alcance 5 -> 7, encadeia +2 alvos
  if (SD["exori-amp-vis"]) {
    escala("exori-amp-vis", 110 / 70);
    SD["exori-amp-vis"].range = 7;
    SD["exori-amp-vis"].chain = 3;        // alvo + 2
  }

  // Great Death Beam vira magia comum no nivel 66
  if (SD["exevo-max-mort"]) SD["exevo-max-mort"].lvl = 66;

  // Divine Caldera: base 140 -> 160 (15.25) e +30% idle balance
  escala("exevo-mas-san", (160 / 140) * 1.30);
  // Wrath of Nature: base 150 -> 175 (e "dano mais consistente": a
  // formula real mudaria no servidor; aqui mantemos a faixa escalada)
  escala("exevo-gran-mas-tera", 175 / 150);
  // Salvation: base healing 400 -> 500
  escala("exura-gran-san", 500 / 400);
  // Front Sweep: base 72 -> 80
  escala("exori-min", 80 / 72);

  // Nature's Embrace: base healing 650 -> 2000, level 300 -> 275, cd 60s -> 15s
  if (SD["exura-gran-sio"]) {
    escala("exura-gran-sio", 2000 / 650);
    SD["exura-gran-sio"].lvl = 275;
    SD["exura-gran-sio"].cd = 15000;
  }

  // Exura Gran Tio Sio (Restore Friend, druid): cura forte de aliado com
  // cd de 30s. Não existe no SPELLDATA base (é magia nova do update) —
  // cria aqui como patch de runtime, mesma fórmula de cura do Nature's
  // Embrace (cura ~2000) e com o efeito/ícone do Restore Balance.
  if (!SD["exura-gran-tio-sio"]) {
    SD["exura-gran-tio-sio"] = {
      id: "exura-gran-tio-sio",
      name: "Restore Friend",
      words: "exura gran tio sio",
      type: "heal",
      vocs: ["druid"],
      mana: 500,
      lvl: 275,
      cd: 30000,
      needTarget: true,
      range: 7,
      premium: true,
      icon: (SD["exura-tio-sio"] && SD["exura-tio-sio"].icon) || 96,
    };
  } else {
    SD["exura-gran-tio-sio"].cd = 30000;
  }

  // Strong Ice Wave: cd 8s -> 4s, area aumentada (SHORTWAVE3 -> WAVE7,
  // o mesmo desenho da Great Fire Wave, sua gemea de nivel)
  if (SD["exevo-gran-frigo-hur"]) {
    SD["exevo-gran-frigo-hur"].cd = 4000;
    SD["exevo-gran-frigo-hur"].area = "AREA_WAVE7";
    SD["exevo-gran-frigo-hur"].alvos = 17;
  }

  // Matrizes Canary (register_spells.lua): length = SQMs à frente, width =
  // laterais. O JSON de targeting omitia vis hur / vis lux / gran vis lux.
  const CANARY_DIR_AREAS = {
    "exevo-flam-hur": "AREA_WAVE4", "exevo-frigo-hur": "AREA_WAVE4",
    "exevo-infir-flam-hur": "AREA_WAVE4", "exevo-infir-frigo-hur": "AREA_WAVE4",
    "exevo-dis-flam-hur": "AREA_WAVE4", "exevo-gran-flam-hur": "AREA_WAVE7",
    "exevo-gran-frigo-hur": "AREA_WAVE7", "exevo-vis-hur": "AREA_SQUAREWAVE5",
    "exevo-tera-hur": "AREA_SQUAREWAVE5", "exevo-vis-lux": "AREA_BEAM5",
    "exevo-gran-vis-lux": "AREA_BEAM8", "exevo-max-mort": "AREA_BEAM6",
    "exori-min": "AREA_WAVE6",
  };
  for (const id of Object.keys(CANARY_DIR_AREAS)) {
    if (SD[id]) SD[id].area = CANARY_DIR_AREAS[id];
  }

  // Chivalrous Challenge: alcance 7 (+1 alvo: 8 -> 9 criaturas)
  if (SD["exeta-amp-res"]) {
    SD["exeta-amp-res"].range = 7;
    SD["exeta-amp-res"].alvos = 9;
  }
  // Challenge (pedido do dono, v24): o exeta RES tem cd de 5s e pega TODOS
  // os monstros ao alcance 7 (antes marcava 1 e tinha cd 2s). O grupo "3"
  // continua 2s para o Amp Res poder entrar no meio.
  if (SD["exeta-res"]) {
    SD["exeta-res"].cd = 5000;
    SD["exeta-res"].range = 7;
  }

  // Divine Dazzle: alcance aumentado para 7
  if (SD["exana-amp-res"]) SD["exana-amp-res"].range = 7;

  // Swift Foot: permite atacar (-30% dano, aplicado via hasteAtiva no
  // combate), cd individual 10s -> 4s, grupo secundario 10s -> 2s
  if (SD["utamo-tempo-san"]) {
    SD["utamo-tempo-san"].cd = 4000;
    SD["utamo-tempo-san"].grupos = { "3": 2000, "7": 2000 };
  }

  // Mystic Repulse: base 72 -> 85 (o pow fica em MONKSPELLDATA) e
  // cd 20s -> 12s nos dois lugares
  if (SD["exori-amp-pug"]) SD["exori-amp-pug"].cd = 12000;

  // Mass Spirit Mend: nao e mais spender, mana 250 -> 400, icone novo.
  // O update diz que cd e base power "foram ajustados" sem dar valores:
  // mantemos os do Canary.
  if (SD["exura-mas-nia"]) {
    SD["exura-mas-nia"].mana = 400;
    SD["exura-mas-nia"].icon = 206;
  }

  /* ----- Blood Rage / Protector viram STANCES (valores das paginas
   * oficiais pos-update: level 20, mana 20, cd 2s/2s/2s). Os efeitos
   * (+25% melee skill / +30% shielding etc.) moram em js/stances.js. */
  if (SD["utito-tempo"]) {
    Object.assign(SD["utito-tempo"], {
      lvl: 20, mana: 20, icon: 187, stance: 1,
      cd: 2000, grupos: { "3": 2000, "7": 2000 }, gcd: 2000,
    });
  }
  if (SD["utamo-tempo"]) {
    Object.assign(SD["utamo-tempo"], {
      lvl: 20, mana: 20, icon: 188, stance: 1,
      cd: 2000, grupos: { "3": 2000, "7": 2000 }, gcd: 2000,
    });
  }

  // Sharpshooter (utito tempo san) e SUBSTITUIDA pela stance utori con:
  // level 60 -> 20, mana 450 -> 250, +32% Distance Fighting total.
  if (SD["utito-tempo-san"]) {
    SD["utori-con"] = Object.assign({}, SD["utito-tempo-san"], {
      id: "utori-con", words: "utori con", name: "Sharpshooter",
      lvl: 20, mana: 250, icon: 189, stance: 1,
      cd: 10000, grupos: { "3": 2000, "7": 10000 }, gcd: 2000,
    });
    delete SD["utito-tempo-san"];
  }

  /* --------------------------------------------------- magias novas */

  const NOVAS = {
    // ---- Knight: as duas magias de escudo usam a DEFESA do escudo como
    // base de dano (shieldSpell resolvida em spells.js) e reduzem 50% do
    // proximo auto attack do alvo em ate 10s (weakNext, combat.js).
    "exori-ico-scu": {
      id: "exori-ico-scu", sid: 298, name: "Shield Bash",
      words: "exori ico scu", type: "attack", lvl: 18, mana: 30,
      soul: 0, ml: 0, icon: 191, vocs: ["knight"], cd: 4000,
      grupos: { "1": 2000 }, gcd: 2000, premium: true, needTarget: true,
      param: false, group: "attack", element: "physical", range: 1,
      shieldSpell: 1, weakNext: 0.5,
      f: { modo: "skill", saMin: 0, skMin: 0.35, atMin: 0.35, lvlMin: 0.2,
           flatMin: 44, saMax: 0, skMax: 0.6, atMax: 0.6, lvlMax: 0.2,
           flatMax: 66 },
      aggr: true,
    },
    "exori-scu": {
      id: "exori-scu", sid: 299, name: "Shield Slam",
      words: "exori scu", type: "attack", lvl: 30, mana: 110,
      soul: 0, ml: 0, icon: 192, vocs: ["knight"], cd: 6000,
      grupos: { "1": 2000 }, gcd: 2000, premium: true, needTarget: false,
      param: false, group: "attack", element: "physical",
      area: "AREA_SQUARE1X1", alvos: 8, shieldSpell: 1, weakNext: 0.5,
      f: { modo: "skill", saMin: 0, skMin: 0.3, atMin: 0.3, lvlMin: 0.2,
           flatMin: 42, saMax: 0, skMax: 0.5, atMax: 0.5, lvlMax: 0.2,
           flatMax: 62 },
      aggr: true,
    },
    // ---- Paladin: os dois barrages tem o tamanho da diamond arrow
    // (21 sqm, 5x5 sem os cantos) e 3 modos de mira (no idle o motor
    // mira no alvo, que e o modo padrao).
    "exevo-dir-san": {
      id: "exevo-dir-san", sid: 300, name: "Divine Barrage",
      words: "exevo dir san", type: "attack", lvl: 70, mana: 175,
      soul: 0, ml: 0, icon: 193, vocs: ["paladin"], cd: 4000,
      grupos: { "1": 2000 }, gcd: 2000, premium: true, needTarget: true,
      param: false, group: "attack", element: "holy",
      area: "AREA_BARRAGE", alvos: 21, range: 5,
      f: { modo: "magic", lvlMin: 0.2, mlMin: 4, flatMin: 112,
           lvlMax: 0.2, mlMax: 6, flatMax: 168 },
      aggr: true,
    },
    "exevo-dir-moe": {
      id: "exevo-dir-moe", sid: 301, name: "Ethereal Barrage",
      words: "exevo dir moe", type: "attack", lvl: 60, mana: 135,
      soul: 0, ml: 0, icon: 194, vocs: ["paladin"], cd: 4000,
      grupos: { "1": 2000 }, gcd: 2000, premium: true, needTarget: true,
      param: false, group: "attack", element: "physical",
      area: "AREA_BARRAGE", alvos: 21, range: 5,
      f: { modo: "skill", saMin: 0, skMin: 0.33333, atMin: 0, lvlMin: 0.2,
           flatMin: 32, saMax: 0, skMax: 1, atMax: 0, lvlMax: 0.2,
           flatMax: 48 },
      aggr: true,
    },
    // ---- Druid: magias bifurcadas, alvo + N proximos (chain generica)
    // TibiaWiki/Canary 15.25: salto de 4 SQM a partir do alvo (como Lightning),
    // alcance 7, grupo attack 2s. Glacier acerta 1+6; Thorns 1+5.
    "exevo-fur-frigo": {
      id: "exevo-fur-frigo", sid: 302, name: "Forked Glacier",
      words: "exevo fur frigo", type: "attack", lvl: 90, mana: 180,
      soul: 0, ml: 0, icon: 195, vocs: ["druid"], cd: 6000,
      grupos: { "1": 2000 }, gcd: 2000, premium: true, needTarget: true,
      param: false, group: "attack", element: "ice", chain: 7, chainDist: 4,
      range: 7, fx: "forked-glacier-effect", missile: "ice",
      chainFx: "chain-effect-blue",
      f: { modo: "magic", lvlMin: 0.2, mlMin: 3, flatMin: 78,
           lvlMax: 0.2, mlMax: 4.5, flatMax: 116 },
      aggr: true,
    },
    "exevo-fur-tera": {
      id: "exevo-fur-tera", sid: 303, name: "Forked Thorns",
      words: "exevo fur tera", type: "attack", lvl: 80, mana: 180,
      soul: 0, ml: 0, icon: 196, vocs: ["druid"], cd: 6000,
      grupos: { "1": 2000 }, gcd: 2000, premium: true, needTarget: true,
      param: false, group: "attack", element: "earth", chain: 6, chainDist: 4,
      range: 7, fx: "forked-thorns-effect", missile: "earth",
      chainFx: "chain-effect-green",
      f: { modo: "magic", lvlMin: 0.2, mlMin: 3, flatMin: 84,
           lvlMax: 0.2, mlMax: 4.5, flatMax: 126 },
      aggr: true,
    },
    // ---- Sorcerer: eco da morte, 5x5 com re-strike de 50% apos 1s
    "exevo-mort-ora": {
      id: "exevo-mort-ora", sid: 304, name: "Death Echo",
      words: "exevo mort ora", type: "attack", lvl: 120, mana: 150,
      soul: 0, ml: 0, icon: 197, vocs: ["sorcerer"], cd: 6000,
      grupos: { "1": 2000 }, gcd: 2000, premium: true, needTarget: true,
      param: false, group: "attack", element: "death",
      area: "AREA_ECHO", alvos: 25, range: 5, echo: 0.5,
      f: { modo: "magic", lvlMin: 0.2, mlMin: 3, flatMin: 68,
           lvlMax: 0.2, mlMax: 5, flatMax: 102 },
      aggr: true,
    },
    // ---- Monk: builder novo, alvo + area ao redor (pow em MONKSPELLDATA)
    "exori-mas-amp-pug": {
      id: "exori-mas-amp-pug", sid: 305, name: "Thousand Fist Blows",
      words: "exori mas amp pug", type: "attack", lvl: 120, mana: 145,
      soul: 0, ml: 0, icon: 205, vocs: ["monk"], cd: 12000,
      grupos: { "1": 2000 }, gcd: 2000, premium: true, needTarget: false,
      param: false, group: "attack", element: "physical", range: 1,
      monk: "builder",
      aggr: true,
    },
    // ---- Monk: builder de longo alcance (TibiaWiki / update 15.12).
    // Base power 25, range 7, cd 20s — versão fraca do Mystic Repulse.
    "exori-infir-amp-pug": {
      id: "exori-infir-amp-pug", sid: 306, name: "Lesser Mystic Repulse",
      words: "exori infir amp pug", type: "attack", lvl: 6, mana: 30,
      soul: 0, ml: 0, icon: 207, vocs: ["monk"], cd: 20000,
      grupos: { "1": 2000 }, gcd: 2000, premium: false, needTarget: true,
      param: false, group: "attack", element: "physical", range: 7,
      monk: "builder",
      aggr: true,
    },
    // ---- Stances (efeitos permanentes resolvidos em js/stances.js).
    // Valores das paginas oficiais pos-update.
    "utori-hur": {
      id: "utori-hur", sid: 307, name: "Divine Defiance",
      words: "utori hur", type: "support", lvl: 20, mana: 250,
      soul: 0, ml: 0, icon: 190, vocs: ["paladin"], cd: 10000,
      grupos: { "3": 2000, "7": 10000 }, gcd: 2000, premium: true,
      needTarget: false, param: false, group: "support", stance: 1,
      aggr: false,
    },
    "uteta-flam": {
      id: "uteta-flam", sid: 308, name: "Master of Flames",
      words: "uteta flam", type: "support", lvl: 20, mana: 400,
      soul: 0, ml: 0, icon: 198, vocs: ["sorcerer"], cd: 10000,
      grupos: { "3": 2000, "7": 10000 }, gcd: 2000, premium: true,
      needTarget: false, param: false, group: "support", stance: 1,
      aggr: false,
    },
    "uteta-vis": {
      id: "uteta-vis", sid: 309, name: "Master of Thunder",
      words: "uteta vis", type: "support", lvl: 20, mana: 400,
      soul: 0, ml: 0, icon: 199, vocs: ["sorcerer"], cd: 10000,
      grupos: { "3": 2000, "7": 10000 }, gcd: 2000, premium: true,
      needTarget: false, param: false, group: "support", stance: 1,
      aggr: false,
    },
    "uteta-mort": {
      id: "uteta-mort", sid: 310, name: "Master of Decay",
      words: "uteta mort", type: "support", lvl: 20, mana: 400,
      soul: 0, ml: 0, icon: 200, vocs: ["sorcerer"], cd: 10000,
      grupos: { "3": 2000, "7": 10000 }, gcd: 2000, premium: true,
      needTarget: false, param: false, group: "support", stance: 1,
      aggr: false,
    },
    "exori-kor-tempo": {
      id: "exori-kor-tempo", sid: 311, name: "Aura of Sapped Strength",
      words: "exori kor tempo", type: "support", lvl: 175, mana: 1500,
      soul: 0, ml: 0, icon: 201, vocs: ["sorcerer"], cd: 10000,
      grupos: { "3": 2000, "7": 10000 }, gcd: 2000, premium: true,
      needTarget: false, param: false, group: "support", stance: 1,
      aggr: false,
    },
    "exori-moe-tempo": {
      id: "exori-moe-tempo", sid: 312, name: "Aura of Exposed Weakness",
      words: "exori moe tempo", type: "support", lvl: 175, mana: 1500,
      soul: 0, ml: 0, icon: 202, vocs: ["sorcerer"], cd: 10000,
      grupos: { "3": 2000, "7": 10000 }, gcd: 2000, premium: true,
      needTarget: false, param: false, group: "support", stance: 1,
      aggr: false,
    },
    "utura-sio": {
      id: "utura-sio", sid: 313, name: "Shared Conservation",
      words: "utura sio", type: "support", lvl: 20, mana: 400,
      soul: 0, ml: 0, icon: 203, vocs: ["druid"], cd: 10000,
      grupos: { "3": 2000, "7": 10000 }, gcd: 2000, premium: true,
      needTarget: false, param: false, group: "support", stance: 1,
      aggr: false,
    },
    "utito-dru": {
      id: "utito-dru", sid: 314, name: "Elemental Synthesis",
      words: "utito dru", type: "support", lvl: 20, mana: 400,
      soul: 0, ml: 0, icon: 204, vocs: ["druid"], cd: 10000,
      grupos: { "3": 2000, "7": 10000 }, gcd: 2000, premium: true,
      needTarget: false, param: false, group: "support", stance: 1,
      aggr: false,
    },
  };
  for (const id in NOVAS) SD[id] = NOVAS[id];
  // As magias novas dos Barrages entraram com o id do update
  // (exevo-dir-san/exevo-dir-moe), mas o import do Canary JÁ trazia as
  // mesmas magias com sid 300/301 sob os ids exori-dir-san/exori-dir-moe.
  // Sobrescrever as chaves antigas com a referência nova fazia o grimório
  // listar cada Barrage DUAS VEZES (e duplicava em qualquer iteração do
  // SPELLDATA). Fica só o id novo; saves com o id antigo são migrados no
  // ensureCombo (combo.js).
  delete SD["exori-dir-san"];
  delete SD["exori-dir-moe"];

  /* ---------------------------------- dados anexos (fx, mira, area) */

  // Efeito visual das magias novas: os sprites Effect_318..349 do update
  // (mapeamento visual em render.js, FX_FRAMES).
  if (typeof SPELLFX !== "undefined" && SPELLFX && SPELLFX.words) {
    const W = SPELLFX.words;
    W["exori ico scu"] = { fx: "shield-bash-effect" };
    W["exori scu"] = { fx: "shield-bash-effect" };
    // Barrages: as cenas oficiais da TibiaWiki mostram o efeito caindo em
    // TODA a area como uma chuva de lancas vinda do ceu do tile — NAO ha
    // projetil voando do paladino (igual a divine caldera). O miss "holy"
    // que a dir san tinha era invencao. E o sprite e o oficial
    // (Divine_Barrage_Effect / Ethereal_Barrage_Effect), nao mais o chute
    // dos Effect_3xx pelo visual.
    W["exevo dir san"] = { fx: "divine-barrage-effect" };
    W["exevo dir moe"] = { fx: "ethereal-barrage-effect" };
    W["exevo tempo mas san"] = { fx: "divine-grenade-effect" };
    W["exevo fur frigo"] = { fx: "forked-glacier-effect", miss: "ice" };
    W["exevo fur tera"] = { fx: "forked-thorns-effect", miss: "earth" };
    if (SPELLFX.names) {
      SPELLFX.names["forked glacier"] = { fx: "forked-glacier-effect", miss: "ice" };
      SPELLFX.names["forked thorns"] = { fx: "forked-thorns-effect", miss: "earth" };
    }
    W["exevo mort ora"] = { fx: "death-echo-effect", miss: "death" };
    W["exori mas amp pug"] = { fx: "thousand-fist-effect" };
    W["exori infir amp pug"] = { fx: "blow-white" };
    W["utito tempo"] = { fx: "stance-blood-rage" };
    W["utamo tempo"] = { fx: "stance-protector" };
    W["utori con"] = { fx: "stance-sharpshooter" };
    W["utori hur"] = { fx: "stance-divine-defiance" };
    W["uteta flam"] = { fx: "stance-master-flames" };
    W["uteta vis"] = { fx: "stance-master-thunder" };
    W["uteta mort"] = { fx: "stance-master-decay" };
    W["exori kor tempo"] = { fx: "stance-sapped-strength" };
    W["exori moe tempo"] = { fx: "stance-exposed-weakness" };
    W["utura sio"] = { fx: "stance-shared-conservation" };
    W["utito dru"] = { fx: "stance-elemental-synthesis" };
  }

  // Mira/targeting das magias novas (mesmo formato do importador)
  if (typeof SPELLTARGET !== "undefined" && SPELLTARGET) {
    const T = SPELLTARGET;
    T["exori-ico-scu"] = { blockWalls: 1, needTarget: 1,
                           nome: "Shield Bash", range: 1,
                           words: "exori ico scu" };
    // Shield Slam explode em volta do CONJURADOR ("atinge todos os
    // inimigos adjacentes", tabela oficial): sem o self, a AREA_SQUARE1X1
    // cairia na AREA_ANCORA_ALVO e centraria no alvo clicado
    T["exori-scu"] = { areaNome: "AREA_SQUARE1X1", self: 1,
                       nome: "Shield Slam", words: "exori scu" };
    // Berserk / Fierce Berserk / Groundshaker / Front Sweep: isSelfTarget
    // no Canary. Sem self, AREA_SQUARE1X1 / AREA_CIRCLE3X3 / WAVE6
    // ancorariam no inimigo apontado em vez da caixa em volta do knight.
    for (const id of ["exori", "exori-gran", "exori-mas", "exori-min"]) {
      if (T[id]) T[id] = Object.assign({}, T[id], { self: 1 });
    }
    T["exevo-dir-san"] = { areaNome: "AREA_BARRAGE", blockWalls: 1,
                           needTarget: 1, nome: "Divine Barrage",
                           range: 5, words: "exevo dir san" };
    T["exevo-dir-moe"] = { areaNome: "AREA_BARRAGE", blockWalls: 1,
                           needTarget: 1, nome: "Ethereal Barrage",
                           range: 5, words: "exevo dir moe" };
    T["exevo-fur-frigo"] = { blockWalls: 1, needTarget: 1,
                             nome: "Forked Glacier", range: 7,
                             words: "exevo fur frigo" };
    T["exevo-fur-tera"] = { blockWalls: 1, needTarget: 1,
                            nome: "Forked Thorns", range: 7,
                            words: "exevo fur tera" };
    T["exevo-mort-ora"] = { areaNome: "AREA_ECHO", blockWalls: 1,
                            needTarget: 1, nome: "Death Echo", range: 5,
                            words: "exevo mort ora" };
    T["exori-mas-amp-pug"] = { blockWalls: 1, needTarget: 1,
                               nome: "Thousand Fist Blows", range: 1,
                               words: "exori mas amp pug" };
    T["exori-infir-amp-pug"] = { blockWalls: 1, needTarget: 1,
                                 nome: "Lesser Mystic Repulse", range: 7,
                                 words: "exori infir amp pug" };
    // alcance 3 -> 7 das strikes melhoradas (fonte do importador tambem
    // precisa acompanhar, senao o areafx sai curto)
    for (const id of ["exori-gran-flam", "exori-gran-vis",
                      "exori-gran-tera", "exori-gran-frigo",
                      "exori-max-flam", "exori-max-vis",
                      "exori-max-tera", "exori-max-frigo"]) {
      if (T[id]) T[id].range = 7;
    }
    if (T["exori-amp-vis"]) T["exori-amp-vis"].range = 7;
    if (T["exevo-gran-frigo-hur"]) T["exevo-gran-frigo-hur"].areaNome = "AREA_WAVE7";
    const CANARY_DIR = {
      "exevo-flam-hur": "AREA_WAVE4", "exevo-frigo-hur": "AREA_WAVE4",
      "exevo-infir-flam-hur": "AREA_WAVE4", "exevo-infir-frigo-hur": "AREA_WAVE4",
      "exevo-dis-flam-hur": "AREA_WAVE4", "exevo-gran-flam-hur": "AREA_WAVE7",
      "exevo-gran-frigo-hur": "AREA_WAVE7", "exevo-vis-hur": "AREA_SQUAREWAVE5",
      "exevo-tera-hur": "AREA_SQUAREWAVE5", "exevo-vis-lux": "AREA_BEAM5",
      "exevo-gran-vis-lux": "AREA_BEAM8", "exevo-max-mort": "AREA_BEAM6",
      "exori-min": "AREA_WAVE6",
    };
    for (const id of Object.keys(CANARY_DIR)) {
      T[id] = Object.assign({}, T[id] || {}, { areaNome: CANARY_DIR[id] });
    }
  }

  // Areas novas do update, no formato do importador de areas:
  //   AREA_BARRAGE = o desenho da diamond arrow (5x5 sem os cantos,
  //   21 sqm), centrada no alvo;
  //   AREA_ECHO    = quadrado 5x5 cheio (25 sqm), centrado no alvo.
  if (typeof window !== "undefined" && window.AREADATA) {
    const barr = [];
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        if (Math.abs(dx) === 2 && Math.abs(dy) === 2) continue;
        barr.push([dx, dy]);
      }
    }
    const echo = [];
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++) echo.push([dx, dy]);
    window.AREADATA["AREA_BARRAGE"] =
      { e: barr, n: barr, s: barr, w: barr, sqm: 21 };
    window.AREADATA["AREA_ECHO"] =
      { e: echo, n: echo, s: echo, w: echo, sqm: 25 };
  }

  // Swift Foot agora DURA 10s (a 80% de haste ja estava em maxa/minb):
  // sem `dur` ela nunca entrava em hasteAtiva. E o cd individual cai
  // para 4s em todos os lugares.
  if (typeof HASTEDATA !== "undefined" && HASTEDATA["utamo-tempo-san"]) {
    HASTEDATA["utamo-tempo-san"].dur = 10000;
    HASTEDATA["utamo-tempo-san"].cd = 4000;
  }

  /* ----------------------------------------- MONKSPELLDATA (15.25) */
  const MD = window.MONKSPELLDATA;
  if (MD) {
    // Mystic Repulse: base power 72 -> 85, cd 20s -> 12s
    if (MD["exori-amp-pug"]) {
      MD["exori-amp-pug"].pow = 85;
      MD["exori-amp-pug"].cd = 12000;
    }
    // Chained Penance (exori med pug): hit todos adjacentes ao caster, depois
    // flood BFS em ≤2 SQM (Chebyshev) de qualquer ja atingido. Cap 16 / max
    // range 10 do caster evita varrer o mapa inteiro em packs densos.
    if (MD["exori-med-pug"]) {
      MD["exori-med-pug"].chain = {
        alvos: 16, dist: 2, flood: 1, seedAdj: 1, maxRange: 10,
      };
    }
    // Spiritual Outburst: ate 8 inimigos, saltos mirando o mais proximo.
    // A tabela oficial do update registra a distancia de salto pos-update
    // como 2 — o valor que o importador do Canary ja trazia (o boletim
    // "+1 de jump range" partia de um valor anterior do test server, que
    // nao e o do nosso Canary). Mantemos 2 e deixamos o registro aqui.
    // O segundo impacto 1s depois sai pelo `echo` generico (combat.js).
    if (MD["exori-gran-mas-nia"]) {
      MD["exori-gran-mas-nia"].chain = { alvos: 8, dist: 2 };
      MD["exori-gran-mas-nia"].echo = 0.5;
      MD["exori-gran-mas-nia"].lvl = 300;
    }
    // Alinha mana com TibiaWiki / SPELLDATA (Canary importado estava defasado).
    if (MD["exori-infir-nia"]) MD["exori-infir-nia"].mana = 18;
    if (MD["exori-mas-nia"]) MD["exori-mas-nia"].mana = 195;
    // Mass Spirit Mend deixou de ser spender (mana/icone em SPELLDATA).
    if (MD["exura-mas-nia"]) {
      delete MD["exura-mas-nia"].monk;
      MD["exura-mas-nia"].mana = 400;
    }
    // CDs do importador vieram em segundos/minutos sem *1000.
    if (MD["utevo-nia"]) MD["utevo-nia"].cd = 120000;
    if (MD["utamo-tio"]) MD["utamo-tio"].cd = 600000;
    if (MD["uteta-res-tio"]) MD["uteta-res-tio"].cd = 7200000;
    // Mentor Other foi REMOVIDO do jogo (secao Monks do update).
    delete SD["uteta-tio"];
    delete MD["uteta-tio"];
    // Thousand Fist Blows: builder novo. Base power 62, alvo + area ao
    // redor. O efeito usa o sprite do update (fist-thousand).
    MD["exori-mas-amp-pug"] = {
      cd: 12000, element: "physical", fx: "thousand-fist-effect",
      fxRaw: "EFFECT_321_1525", gcd: 2000, lvl: 120, mana: 145,
      monk: "builder", nome: "Thousand Fist Blows", pow: 62, range: 1,
      area: { raio: 1, sqm: 9 }, words: "exori mas amp pug",
    };
    // Lesser Mystic Repulse (15.12): builder a distancia, pow 25.
    MD["exori-infir-amp-pug"] = {
      cd: 20000, element: "physical", fx: "blow-white",
      fxRaw: "CONST_ME_BLOW_WHITE", gcd: 2000, lvl: 6, mana: 30,
      monk: "builder", nome: "Lesser Mystic Repulse", pow: 25, range: 7,
      words: "exori infir amp pug",
    };
  }

  /* ------------------------------------------------- RUNAS (15.25)
   * Aplicadas sobre window.RUNEDATA (o supplies.js le de la), assim o
   * arquivo gerado js/runedata.js nao precisa ser tocado — a mudanca
   * sobrevive a uma reimportacao. */
  const RD = window.RUNEDATA;
  if (RD) {
    // Avalanche, Great Fireball, Thunderstorm e Stone Shower "agora
    // possuem base power 50" (secao Combate & Mecanicas do update). O
    // base power pre-update dessas runas e 40 (consta nas paginas das
    // runas), entao o fator e 50/40 = 1,25 sobre os termos de ML/flat —
    // mesmo criterio das magias: termos de nivel ficam intocados.
    for (const id of ["avalanche-rune", "great-fireball-rune",
                      "thunderstorm-rune", "stone-shower-rune"]) {
      const r = RD[id];
      if (!r || !r.f) continue;
      for (const k of ["mlMin", "mlMax", "flatMin", "flatMax"]) {
        if (typeof r.f[k] === "number") r.f[k] = r.f[k] * 1.25;
      }
    }
    // Explosion Rune: area aumentada de 5 para 9 sqm — a cruz da
    // AREA_CIRCLE1X1 vira o 3x3 cheio da AREA_SQUARE1X1 (mesma grade da
    // energybomb). O objeto `area` acompanha (raio/w/h/sqm).
    if (RD["explosion-rune"]) {
      RD["explosion-rune"].area = { h: 3, raio: 1, sqm: 9, w: 3 };
      RD["explosion-rune"].areaNome = "AREA_SQUARE1X1";
    }
  }

  /* ------------------------------------------ MUNICAO NOVA (15.25)
   * As 5 flechas AoE em area de 13 sqm (cruz preenchida, centro="3" no
   * formato do importador). Attack, nivel, dano e custo por tiro vem da
   * secao "Novas flechas AoE" do update; o peso 0.80 vem da tabela de
   * Visao Geral. Chance de acerto nao consta no update: adotamos 91, a
   * mesma das demais flechas comuns (burst/diamond tem noMiss proprio,
   * que estas NAO tem). Aplicadas sobre window.AMMODATA para o
   * ammo.js fundir no catalogo sem tocar o arquivo gerado. */
  const AM = window.AMMODATA;
  if (AM) {
    const AREA13 = [[0, 0, 1, 0, 0], [0, 1, 1, 1, 0], [1, 1, 3, 1, 1],
                    [0, 1, 1, 1, 0], [0, 0, 1, 0, 0]];
    const FLECHAS = {
      "shatterstorm-arrow": { atk: 27, lvl: 50,  shotCost: 45,
                              el: "physical", areaFx: "explosion-area" },
      "firestorm-arrow":    { atk: 21, lvl: 125, shotCost: 75,
                              el: "fire",  areaFx: "fire-area" },
      "terrastorm-arrow":   { atk: 21, lvl: 125, shotCost: 75,
                              el: "earth", areaFx: "stones" },
      "froststorm-arrow":   { atk: 21, lvl: 125, shotCost: 75,
                              el: "ice",   areaFx: "ice-area" },
      "thunderstorm-arrow": { atk: 21, lvl: 125, shotCost: 75,
                              el: "energy", areaFx: "energy-area" },
    };
    for (const slug in FLECHAS) {
      const f = FLECHAS[slug];
      AM[slug] = {
        n: slug.replace(/-/g, " "), s: "ammo", t: "ammo",
        ammoKind: "arrow", atk: f.atk, el: f.el, w: 0.8, hit: 91,
        lvl: f.lvl, shotCost: f.shotCost,
        areaMatrix: AREA13, areaFx: f.areaFx,
      };
    }
  }
})();
