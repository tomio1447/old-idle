/*
 * patch_imbuement.js — materiais dos imbuements (sprite oficial + drops).
 *
 * Itens: slug "mat-<clientId>", nome oficial do items.xml do Canary, sprite
 * extraida do client 8.60 (ids <= 19999) ou da TibiaWiki oficial (ids 15.x).
 * sell = 0 de proposito: o Sell all NUNCA vende material (ele so serve para
 * imbuar). npcvalue vem da TibiaWiki (referencia de valor, exibido em
 * tooltips).
 *
 * Drops: cada material cai APENAS de monstros que existem neste mundo E que
 * a TibiaWiki lista em "Dropped By". Chance por tier mais baixo em que o
 * material aparece no canary-imbuements.xml — DESIGN nosso (a TibiaWiki usa
 * loot statistics comunitarias, sem taxa oficial): t1 12%, t2 6%, t3 2%.
 * Materiais cujos droppers sao criaturas 10.x+/15.x (sem hunt no jogo) ficam
 * com drops: [] — o modal mostra "sem fonte neste mundo".
 */
"use strict";

const IMB_MATS = {
  5877: { name: "green dragon leather", npc: 100, drops: ["dragon"], ch: 12.0 },
  5920: { name: "green dragon scale", npc: 100, drops: ["dragon"], ch: 6.0 },
  5954: { name: "demon horn", npc: 1000, drops: ["demon"], ch: 2.0 },
  9633: { name: "bloody pincers", npc: 100, drops: [], ch: 6.0 },
  9635: { name: "elvish talisman", npc: 45, drops: ["elf", "elf-arcanist", "elf-scout"], ch: 12.0 },
  9636: { name: "fiery heart", npc: 375, drops: [], ch: 12.0 },
  9638: { name: "cultish mask", npc: 280, drops: [], ch: 6.0 },
  9639: { name: "cultish robe", npc: 150, drops: ["priestess"], ch: 12.0 },
  9640: { name: "poisonous slime", npc: 50, drops: [], ch: 6.0 },
  9641: { name: "piece of scarab shell", npc: 45, drops: ["scarab"], ch: 12.0 },
  9644: { name: "wyvern talisman", npc: 265, drops: [], ch: 12.0 },
  9647: { name: "demonic skeletal hand", npc: 80, drops: ["demon-skeleton"], ch: 6.0 },
  9650: { name: "polar bear paw", npc: 30, drops: ["polar-bear"], ch: 2.0 },
  9654: { name: "war crystal", npc: 460, drops: [], ch: 2.0 },
  9657: { name: "cyclops toe", npc: 55, drops: ["cyclops"], ch: 12.0 },
  9660: { name: "mystical hourglass", npc: 700, drops: [], ch: 2.0 },
  9661: { name: "frosty heart", npc: 280, drops: [], ch: 12.0 },
  9663: { name: "piece of dead brain", npc: 420, drops: [], ch: 2.0 },
  9665: { name: "wyrm scale", npc: 400, drops: [], ch: 2.0 },
  9685: { name: "vampire teeth", npc: 275, drops: ["vampire"], ch: 12.0 },
  9686: { name: "swamp grass", npc: 20, drops: ["swamp-troll"], ch: 12.0 },
  9690: { name: "ghostly tissue", npc: 90, drops: ["ghost"], ch: 12.0 },
  9691: { name: "lion's mane", npc: 60, drops: ["lion"], ch: 12.0 },
  9694: { name: "snake skin", npc: 400, drops: [], ch: 6.0 },
  10196: { name: "orc tooth", npc: 150, drops: ["orc", "orc-berserker", "orc-leader", "orc-rider", "orc-shaman", "orc-spearman", "orc-warlord", "orc-warrior"], ch: 12.0 },
  10281: { name: "tarantula egg", npc: 80, drops: [], ch: 6.0 },
  10295: { name: "winter wolf fur", npc: 20, drops: ["winter-wolf"], ch: 12.0 },
  10298: { name: "metal spike", npc: 320, drops: [], ch: 2.0 },
  10302: { name: "compass", npc: 45, drops: ["pirate-buccaneer", "pirate-corsair", "pirate-cutthroat", "pirate-marauder"], ch: 6.0 },
  10304: { name: "hellspawn tail", npc: 475, drops: [], ch: 2.0 },
  10307: { name: "thick fur", npc: 150, drops: [], ch: 6.0 },
  10309: { name: "strand of medusa hair", npc: 600, drops: [], ch: 2.0 },
  10311: { name: "sabretooth", npc: 400, drops: [], ch: 6.0 },
  10405: { name: "warmaster's wristguards", npc: 200, drops: [], ch: 2.0 },
  10420: { name: "petrified scream", npc: 250, drops: ["banshee"], ch: 2.0 },
  11444: { name: "protective charm", npc: 60, drops: [], ch: 12.0 },
  11447: { name: "battle stone", npc: 290, drops: ["behemoth"], ch: 6.0 },
  11452: { name: "broken shamanic staff", npc: 35, drops: ["orc-shaman"], ch: 6.0 },
  11464: { name: "elven scouting glass", npc: 50, drops: ["elf-scout"], ch: 12.0 },
  11466: { name: "flask of embalming fluid", npc: 30, drops: ["mummy"], ch: 12.0 },
  11484: { name: "pile of grave earth", npc: 25, drops: ["ghoul"], ch: 12.0 },
  11489: { name: "mantassin tail", npc: 280, drops: [], ch: 6.0 },
  11492: { name: "rope belt", npc: 66, drops: ["monk"], ch: 12.0 },
  11658: { name: "draken sulphur", npc: 550, drops: [], ch: 2.0 },
  11702: { name: "brimstone fangs", npc: 380, drops: [], ch: 2.0 },
  11703: { name: "brimstone shell", npc: 210, drops: [], ch: 6.0 },
  14012: { name: "deepling warts", npc: 180, drops: [], ch: 2.0 },
  14079: { name: "crawler head plating", npc: 210, drops: [], ch: 6.0 },
  14081: { name: "waspoid wing", npc: 190, drops: [], ch: 2.0 },
  16131: { name: "blazing bone", npc: 610, drops: [], ch: 6.0 },
  17458: { name: "damselfly wing", npc: 20, drops: [], ch: 12.0 },
  17823: { name: "piece of swampling wood", npc: 30, drops: [], ch: 12.0 },
  18993: { name: "rorc feather", npc: 70, drops: [], ch: 12.0 },
  18994: { name: "elven hoof", npc: 115, drops: [], ch: 6.0 },
  20199: { name: "frazzle skin", npc: 400, drops: [], ch: 2.0 },
  20200: { name: "silencer claws", npc: 390, drops: [], ch: 6.0 },
  20205: { name: "goosebump leather", npc: 650, drops: [], ch: 2.0 },
  21194: { name: "slime heart", npc: 160, drops: [], ch: 2.0 },
  21200: { name: "moohtant horn", npc: 140, drops: [], ch: 2.0 },
  21202: { name: "mooh'tah shell", npc: 110, drops: [], ch: 6.0 },
  21801: { name: "seacrest hair", npc: 260, drops: [], ch: 6.0 },
  21975: { name: "peacock feather fan", npc: 350, drops: [], ch: 6.0 },
  22007: { name: "gloom wolf fur", npc: 70, drops: [], ch: 6.0 },
  22053: { name: "wereboar hooves", npc: 175, drops: [], ch: 12.0 },
  22189: { name: "ogre nose ring", npc: 210, drops: [], ch: 6.0 },
  22728: { name: "vexclaw talon", npc: 1100, drops: [], ch: 2.0 },
  22730: { name: "some grimeleech wings", npc: 1200, drops: [], ch: 2.0 },
  23507: { name: "crystallized anger", npc: 400, drops: [], ch: 6.0 },
  23508: { name: "energy vein", npc: 270, drops: [], ch: 2.0 },
  25694: { name: "fairy wings", npc: 200, drops: [], ch: 12.0 },
  25702: { name: "little bowl of myrrh", npc: 500, drops: [], ch: 6.0 },
  28567: { name: "quill", npc: 1100, drops: [], ch: 2.0 },
  40529: { name: "gold-brocaded cloth", npc: 0, drops: [], ch: 2.0 },
};

/* Injeta os itens e os loots no GAMEDATA (gerado — nao editar la). */
if (typeof GAMEDATA !== "undefined") {
  for (const id of Object.keys(IMB_MATS)) {
    const m = IMB_MATS[id];
    GAMEDATA.items["mat-" + id] = {
      n: m.name, s: "material", sell: 0, _imbMat: +id,
    };
    for (const mon of m.drops) {
      const M = GAMEDATA.monsters[mon];
      if (!M) continue;
      M.loot = M.loot || [];
      if (!M.loot.some((l) => l.item === "mat-" + id))
        M.loot.push({ item: "mat-" + id, chance: m.ch, max: 1 });
    }
  }
}

