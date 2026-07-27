"""
Calibra os monstros com os dados do Tibia global.

Corrige tres coisas que estavam erradas no gamedata:

1. `element` era usado tanto para "de que elemento e o dano" quanto para
   decidir se o bicho ataca de longe. Resultado: a snake (earth) atirava
   veneno a distancia e o bear aparecia com efeito de veneno. No Tibia
   os dois sao MELEE FISICO.

2. `ranged` passa a ser explicito:
      ausente -> melee
      1       -> ataca a distancia (curto)
      2       -> caster / arqueiro (longo)

3. hp / exp / damage batem com o TibiaWiki.

Fonte: TibiaWiki (tibia.fandom.com), secao Abilities de cada criatura.
"""
import json
import os

GAME = os.path.join(os.path.dirname(__file__), "..", "game", "js", "gamedata.js")

# slug: (hp, exp, dano_max_melee, element, ranged)
#   element = elemento do ataque principal
#   ranged  = None melee | 1 distancia curta | 2 caster/arqueiro
TIBIA = {
    # ---------------------------------------------------- Rookgaard / basicos
    "rat":            (20,    5,   10,  "physical", None),
    "cave-rat":       (30,    8,   12,  "physical", None),
    "bug":            (30,    6,   10,  "physical", None),
    "snake":          (35,   10,    8,  "physical", None),   # melee + veneno
    "spider":         (50,   12,   12,  "physical", None),
    "poison-spider":  (66,   44,   20,  "physical", None),
    "scorpion":       (45,   30,   20,  "physical", None),
    "wasp":           (35,   12,   16,  "physical", None),
    "rabbit":         (15,    2,    3,  "physical", None),
    "sheep":          (20,    3,    4,  "physical", None),
    "pig":            (25,    4,    5,  "physical", None),
    "dog":            (25,    5,   10,  "physical", None),
    "deer":           (35,   12,    8,  "physical", None),
    "badger":         (40,   10,   10,  "physical", None),
    "butterfly":      (5,     1,    1,  "physical", None),
    "slime":          (160,   0,   45,  "earth",    None),

    # ---------------------------------------------------- animais / feras
    "bear":           (105,  73,   25,  "physical", None),   # melee fisico puro
    "polar-bear":     (110,  80,   30,  "physical", None),
    "wolf":           (55,   25,   20,  "physical", None),
    "war-wolf":       (160,  95,   45,  "physical", None),
    "winter-wolf":    (160, 100,   45,  "ice",      None),
    "lion":           (170, 120,   50,  "physical", None),
    "hyaena":         (200, 120,   50,  "physical", None),
    "rotworm":        (65,   40,   25,  "physical", None),
    "larva":          (170, 130,   50,  "physical", None),
    "cobra":          (100,  75,   30,  "physical", None),   # melee + veneno
    "scarab":         (340, 240,   80,  "physical", None),
    "ancient-scarab": (800, 750,  130,  "earth",    None),
    "giant-spider":   (900, 900,  150,  "physical", None),
    "yeti":           (800, 700,  125,  "ice",      None),

    # ---------------------------------------------------- humanoides melee
    "troll":          (50,   20,   18,  "physical", None),
    "swamp-troll":    (65,   30,   20,  "physical", None),
    "frost-troll":    (55,   30,   20,  "physical", None),
    "goblin":         (60,   25,   20,  "physical", None),
    "orc":            (70,   25,   25,  "physical", None),
    "orc-warrior":    (125,  62,   40,  "physical", None),
    "orc-berserker":  (210, 195,   60,  "physical", None),
    "orc-leader":     (270, 270,   70,  "physical", None),
    "orc-rider":      (180, 110,   45,  "physical", None),
    "orc-warlord":    (950, 890,  140,  "physical", None),
    "dwarf":          (90,   45,   30,  "physical", None),
    "dwarf-soldier":  (135,  85,   45,  "physical", None),
    "dwarf-guard":    (215, 165,   60,  "physical", None),
    "minotaur":       (100,  50,   30,  "physical", None),
    "minotaur-guard": (185, 150,   55,  "physical", None),
    "elf":            (75,   42,   30,  "physical", None),
    "cyclops":        (260, 150,   60,  "physical", None),
    "behemoth":       (3000,2500, 250,  "physical", None),
    "hero":           (1400,1200, 175,  "physical", None),
    "black-knight":   (1400,1000, 165,  "physical", None),
    "monk":           (240, 200,   62,  "physical", None),
    "mimic":          (1000,1200, 150,  "physical", None),
    "pirate-marauder":(300, 250,   70,  "physical", None),
    "pirate-cutthroat":(400,400,   88,  "physical", None),
    "pirate-buccaneer":(550,550,  105,  "physical", None),

    # ---------------------------------------------------- undead melee
    "skeleton":       (50,   35,   25,  "physical", None),
    "ghoul":          (100,  85,   40,  "physical", None),   # melee + veneno leve
    "demon-skeleton": (200, 240,   65,  "physical", None),
    "crypt-shambler": (195, 195,   60,  "physical", None),
    "mummy":          (240, 150,   55,  "death",    None),
    "bonebeast":      (515, 580,  105,  "death",    None),
    "vampire":        (475, 305,   90,  "death",    None),
    "ghost":          (150, 250,   62,  "death",    None),
    "banshee":        (550, 580,  105,  "death",    1),
    "stone-golem":    (450, 350,   85,  "physical", None),
    "gargoyle":       (250, 150,   58,  "physical", None),

    # ---------------------------------------------------- casters / distancia
    "orc-spearman":   (85,   40,   30,  "physical", 1),   # arremessa spear
    "orc-shaman":     (60,   70,   30,  "energy",   2),
    "minotaur-archer":(100, 100,   45,  "physical", 2),
    "minotaur-mage":  (110, 150,   50,  "energy",   2),
    "elf-scout":      (120,  85,   40,  "physical", 2),   # arco
    "elf-arcanist":   (175, 225,   62,  "holy",     2),
    "dwarf-geomancer":(145, 190,   55,  "energy",   2),
    "gazer":          (125, 100,   42,  "energy",   2),
    "bonelord":       (260, 260,   68,  "energy",   2),
    "elder-bonelord": (500, 500,   98,  "energy",   2),
    "necromancer":    (580, 580,  110,  "death",    2),
    "priestess":      (290, 350,   78,  "death",    2),
    "witch":          (300, 340,   75,  "earth",    2),
    "lich":           (880, 900,  140,  "death",    2),
    "green-djinn":    (800, 750,  130,  "earth",    2),
    "blue-djinn":     (800, 750,  130,  "ice",      2),
    "efreet":         (1650,1750, 205,  "fire",     2),
    "marid":          (1650,1750, 205,  "ice",      2),
    "quara-predator": (1000,1000, 150,  "ice",      1),
    "fire-devil":     (400, 250,   72,  "fire",     1),
    "fire-elemental": (550, 500,  100,  "fire",     1),
    "dragon":         (1000, 700, 130,  "fire",     2),
    "dragon-lord":    (1900,2100, 210,  "fire",     2),
    "demon":          (8200,6000, 400,  "fire",     2),
    "pirate-corsair": (700, 800,  125,  "physical", None),
}


def main():
    src = open(GAME, encoding="utf-8").read()
    prefix = "window.GAMEDATA = "
    data = json.loads(src[len(prefix):].rstrip().rstrip(";"))
    mons = data["monsters"]

    changed, missing = 0, []
    for slug, (hp, exp, dmg, element, ranged) in TIBIA.items():
        m = mons.get(slug)
        if not m:
            missing.append(slug)
            continue
        before = (m.get("hp"), m.get("exp"), m.get("damage"),
                  m.get("element"), m.get("ranged"))
        m["hp"] = hp
        m["exp"] = exp
        m["damage"] = dmg
        m["element"] = element
        # ranged explicito: ausencia = melee
        if ranged:
            m["ranged"] = ranged
        else:
            m.pop("ranged", None)
        after = (hp, exp, dmg, element, ranged)
        if before != after:
            changed += 1
            print("  %-18s %s -> %s" % (slug, before, after))

    # qualquer monstro fora da tabela vira melee, evitando o bug antigo de
    # "elemento nao-fisico = ataca de longe"
    for slug, m in mons.items():
        if slug not in TIBIA:
            m.pop("ranged", None)

    open(GAME, "w", encoding="utf-8").write(
        prefix + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";\n")

    print("\n%d monstros ajustados, %d na tabela" % (changed, len(TIBIA)))
    if missing:
        print("nao encontrados:", ", ".join(missing))
    total_ranged = sum(1 for m in mons.values() if m.get("ranged"))
    print("%d de %d monstros atacam a distancia" % (total_ranged, len(mons)))


if __name__ == "__main__":
    main()
