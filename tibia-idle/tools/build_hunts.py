"""Gera game/data/hunts.json — areas de caca progressivas estilo Baiak Idle."""
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.normpath(os.path.join(HERE, "..", "game", "data"))
MON = json.load(open("%s/monsters.json" % DATA))

# id, nome, level minimo, monstros, cor tematica, cenario
HUNTS = [
    ("rats", "Esgoto de Rookgaard", 1,
     ["rat", "cave-rat", "bug", "snake"], "#6b7a4a", "sewer"),
    ("spiders", "Caverna das Aranhas", 5,
     ["spider", "poison-spider", "wasp", "scorpion"], "#4a6b52", "cave"),
    ("trolls", "Ponte dos Trolls", 8,
     ["troll", "swamp-troll", "goblin", "wolf"], "#5a6b3a", "swamp"),
    ("rotworms", "Túnel dos Rotworms", 12,
     ["rotworm", "cave-rat", "bear", "poison-spider"], "#7a5a3a", "cave"),
    ("orcs", "Fortaleza Orc", 18,
     ["orc", "orc-spearman", "orc-warrior", "orc-shaman", "war-wolf"],
     "#6b4a3a", "fortress"),
    ("amazon-camp", "Amazon Camp", 20,
     ["amazon", "valkyrie"], "#5a7a3a", "forest"),
    ("skeletons", "Cripta Antiga", 24,
     ["skeleton", "ghoul", "crypt-shambler", "gazer"], "#5a5a6b", "crypt"),
    ("minotaurs", "Labirinto Minotauro", 30,
     ["minotaur", "minotaur-archer", "minotaur-guard", "minotaur-mage"],
     "#8a4a3a", "labyrinth"),
    ("dwarves", "Minas de Kazordoon", 38,
     ["dwarf", "dwarf-soldier", "dwarf-guard", "dwarf-geomancer"],
     "#7a6a4a", "mine"),
    ("elves", "Bosque Élfico", 45,
     ["elf", "elf-scout", "elf-arcanist", "winter-wolf"], "#3a7a4a", "forest"),
    ("orc-fortress", "Guarda Orc Real", 52,
     ["orc-berserker", "orc-rider", "orc-leader", "orc-warlord"],
     "#8a3a2a", "fortress"),
    ("cyclops", "Vale dos Cyclops", 60,
     ["cyclops", "troll", "orc-leader", "hyaena"], "#6b5a4a", "valley"),
    ("mummies", "Tumbas de Ankrahmun", 70,
     ["mummy", "scarab", "larva", "cobra"], "#a08a5a", "desert"),
    ("undead", "Catacumbas Sombrias", 82,
     ["demon-skeleton", "bonebeast", "ghost", "vampire"], "#4a3a5a", "crypt"),
    ("golems", "Templo de Pedra", 95,
     ["stone-golem", "gargoyle", "bonelord", "elder-bonelord"],
     "#5a5a5a", "temple"),
    ("djinns", "Palácio dos Djinns", 110,
     ["green-djinn", "blue-djinn", "witch", "priestess"], "#4a5a8a", "palace"),
    ("giant-spiders", "Ninho das Aranhas Gigantes", 125,
     ["giant-spider", "poison-spider", "larva", "ancient-scarab"],
     "#3a5a3a", "nest"),
    ("pirates", "Ilha Pirata", 140,
     ["pirate-marauder", "pirate-cutthroat", "pirate-buccaneer",
      "pirate-corsair"], "#5a6a7a", "island"),
    ("necro", "Torre do Necromante", 155,
     ["necromancer", "banshee", "lich", "priestess"], "#3a2a4a", "tower"),
    ("dragons", "Covil dos Dragões", 175,
     ["dragon", "fire-devil", "fire-elemental", "dragon-lord"],
     "#8a3a2a", "lair"),
    ("heroes", "Salão dos Heróis", 200,
     ["hero", "black-knight", "monk", "vampire"], "#7a6a3a", "hall"),
    ("efreets", "Deserto Ardente", 230,
     ["efreet", "marid", "ancient-scarab", "fire-elemental"],
     "#a06a3a", "desert"),
    ("frozen", "Geleiras de Svargrond", 260,
     ["yeti", "quara-predator", "winter-wolf", "polar-bear"],
     "#5a8a9a", "glacier"),
    ("dragonlords", "Covil dos Dragon Lords", 300,
     ["dragon-lord", "dragon", "behemoth", "fire-elemental"],
     "#9a3a2a", "lair"),
    ("behemoths", "Cavernas Behemoth", 360,
     ["behemoth", "cyclops", "dragon-lord", "mimic"], "#6a4a3a", "cave"),
    ("inferno", "Portal do Inferno", 450,
     ["demon", "dragon-lord", "efreet", "fire-elemental"], "#b02a1a", "hell"),
]


def stats(mobs):
    hp = sum(MON[m]["hp"] for m in mobs) / len(mobs)
    exp = sum(MON[m]["exp"] for m in mobs) / len(mobs)
    dmg = sum(MON[m]["damage"] for m in mobs) / len(mobs)
    arm = sum(MON[m]["armor"] for m in mobs) / len(mobs)
    gold = 0
    for m in mobs:
        for l in MON[m]["loot"]:
            if l["item"] == "gold-coin":
                gold += (l["chance"] / 100) * (l["max"] / 2 + 0.5)
    return hp, exp, dmg, arm, gold / len(mobs)


out = {}
for hid, name, lvl, mobs, color, scene in HUNTS:
    mobs = [m for m in mobs if m in MON]
    hp, exp, dmg, arm, gold = stats(mobs)
    out[hid] = {
        "name": name, "level": lvl, "monsters": mobs,
        "color": color, "scene": scene,
        "avgHp": round(hp), "avgExp": round(exp), "avgDamage": round(dmg),
        "avgArmor": round(arm), "avgGold": round(gold, 1),
        # respawn: tempo minimo entre kills (segundos)
        "respawn": 0.8,
        # numero de monstros simultaneos na tela
        "pack": 3 if lvl < 100 else 4,
    }

json.dump(out, open("%s/hunts.json" % DATA, "w"), indent=1)
print("hunts:", len(out))
for hid, h in out.items():
    print("%-16s lvl %-4d hp %-6d exp %-6d dmg %-4d gold %s"
          % (hid, h["level"], h["avgHp"], h["avgExp"], h["avgDamage"],
             h["avgGold"]))
