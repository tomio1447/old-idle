/*
 * monsters.js — funde o catalogo de monstros do Canary em GAMEDATA.monsters.
 *
 * Os 91 monstros do jogo vinham de tools/build_monsters.py, uma tabela
 * escrita a mao com stats "aproximados do Tibia 7.4": HP, exp, dano e
 * armadura eram estimativas, o loot era uma lista curta inventada e nenhum
 * bicho tinha habilidade — todos apenas batiam de perto.
 *
 * MONSTERDATA (tools/import_monsters.py) traz os 1655 monstros que o
 * servidor executa de verdade, com habilidades, defesas, resistencias, loot
 * com chance real e os dados de bestiario.
 *
 * Politica de fusao: o Canary manda nos NUMEROS (e a fonte de verdade), mas
 * o catalogo antigo manda no que e decisao nossa — o `sprite` que o monstro
 * usa e o nome traduzido. Sem isso um monstro perderia a arte ao reimportar.
 *
 * Jogavel x catalogado: so ha sprite para ~100 criaturas. Os outros 1500+
 * entram no bestiario como fichas consultaveis (e sao alvo do boostiary),
 * mas nao aparecem em cacada, porque nao ha o que desenhar.
 */
"use strict";

const MONSTER_DATA = (typeof window !== "undefined" && window.MONSTERDATA)
  ? window.MONSTERDATA : {};

/* Campos vindos do Canary que sobrescrevem o valor antigo. `sprite` e `name`
 * ficam de fora de proposito: sao escolha do jogo, nao dado do servidor. */
const MD_CAMPOS = [
  "hp", "exp", "speed", "armor", "defense", "damage", "element",
  "mitigation", "resist", "skills", "defSkills", "looktype", "race",
  "raceId", "targetDistance", "staticAttack", "runAt", "ranged",
  "imune", "loot", "best", "grupo", "boss", "passivo",
];

/* O monstro pode entrar numa caçada? Depende de existir sheet para ele.
 * MOBSHEETS e gerado por tools/pack_monster_sheets.py e lista exatamente
 * quem tem arte, entao e a fonte certa — nao um campo escrito a mao. */
function monsterPlayable(slug) {
  if (typeof MOBSHEETS === "undefined" || !MOBSHEETS) return false;
  return !!MOBSHEETS[slug];
}

/* Lista completa do bestiario: tudo que veio do Canary com ficha. */
function bestiaryCatalog(filtro) {
  const out = [];
  for (const slug in GAMEDATA.monsters) {
    const m = GAMEDATA.monsters[slug];
    if (!m.best) continue;
    if (filtro === "jogavel" && !m.jogavel) continue;
    if (filtro === "boss" && !m.boss) continue;
    out.push(slug);
  }
  return out;
}

/* Classe do bestiario (Dragon, Undead...) traduzida para as categorias que a
 * Cyclopedia ja usa. O Canary chama de `class`; guardamos em best.classe. */
const MD_CLASSE = {
  "Amphibic": "aquatic", "Aquatic": "aquatic", "Bird": "bird",
  "Construct": "construct", "Demon": "demon", "Dragon": "dragon",
  "Elemental": "elemental", "Extra Dimensional": "magical",
  "Fey": "magical", "Giant": "giant", "Human": "human",
  "Humanoid": "humanoid", "Lycanthrope": "humanoid", "Magical": "magical",
  "Mammal": "beast", "Plant": "plant", "Reptile": "reptile",
  "Slime": "slime", "Undead": "undead", "Vermin": "vermin",
};

function monsterCategory(slug) {
  const m = GAMEDATA.monsters[slug];
  if (!m) return "extra";
  const c = m.best && m.best.classe;
  return (c && MD_CLASSE[c]) || "extra";
}

/* Funde MONSTERDATA em GAMEDATA.monsters. Idempotente. */
function fundirMonsterData() {
  if (!MONSTER_DATA || typeof GAMEDATA === "undefined") return 0;
  let novos = 0, atualizados = 0;
  for (const slug in MONSTER_DATA) {
    const novo = MONSTER_DATA[slug];
    const velho = GAMEDATA.monsters[slug];
    if (!velho) {
      const m = Object.assign({}, novo);
      // so entra em cacada quem tem sheet extraido
      m.jogavel = monsterPlayable(slug);
      GAMEDATA.monsters[slug] = m;
      novos++;
      continue;
    }
    for (const k of MD_CAMPOS) {
      if (novo[k] !== undefined) velho[k] = novo[k];
    }
    velho.jogavel = monsterPlayable(slug);
    // attackSpeed nao vem do Canary por monstro; mantem o que o jogo usava
    if (!velho.attackSpeed) velho.attackSpeed = 2000;
    atualizados++;
  }
  return { novos: novos, atualizados: atualizados };
}

if (typeof window !== "undefined") fundirMonsterData();

if (typeof module !== "undefined" && module.exports) {
  module.exports = { fundirMonsterData, bestiaryCatalog, monsterCategory };
}
