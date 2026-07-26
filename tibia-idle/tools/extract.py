"""Extrai sprites de monstros (looktypes) e itens do Tibia 7.4 para PNGs do jogo."""
import json
import os
from PIL import Image
from render import load, render_outfit, render_item

OUT = "/home/user/tibia-idle/game/assets"
os.makedirs(OUT + "/mob", exist_ok=True)
os.makedirs(OUT + "/item", exist_ok=True)
os.makedirs(OUT + "/outfit", exist_ok=True)

dat, spr = load()

# ---------------------------------------------------------------- monstros
# looktype oficiais do data/740/looktypes.txt do html5-tibia-engine
MONSTER_LOOKTYPES = {
    "rat": 21, "cave-rat": 56, "snake": 28, "spider": 30, "bug": 45,
    "wasp": 44, "scorpion": 43, "rotworm": 26, "carrion-worm": 26,
    "poison-spider": 36, "wolf": 27, "bear": 16, "polar-bear": 42,
    "troll": 15, "swamp-troll": 76, "frost-troll": 53, "goblin": 61,
    "orc": 5, "orc-spearman": 50, "orc-warrior": 7, "orc-shaman": 6,
    "orc-berserker": 8, "orc-rider": 4, "orc-leader": 59, "orc-warlord": 2,
    "war-wolf": 3, "minotaur": 25, "minotaur-archer": 24, "minotaur-guard": 29,
    "minotaur-mage": 23, "skeleton": 33, "ghoul": 18, "mummy": 65,
    "demon-skeleton": 37, "crypt-shambler": 100, "bonebeast": 101,
    "vampire": 68, "banshee": 78, "lich": 99, "ghost": 48,
    "cyclops": 22, "dwarf": 69, "dwarf-soldier": 71, "dwarf-guard": 70,
    "dwarf-geomancer": 66, "stone-golem": 67, "elf": 62, "elf-scout": 64,
    "elf-arcanist": 63, "witch": 54, "monk": 57, "priestess": 58,
    "hero": 73, "black-knight": 131, "necromancer": 9, "bonelord": 17,
    "elder-bonelord": 108, "gazer": 109, "giant-spider": 38, "slime": 19,
    "fire-devil": 40, "fire-elemental": 49, "dragon": 34, "dragon-lord": 39,
    "demon": 35, "behemoth": 55, "hydra": 121, "serpent-spawn": 219,
    "green-djinn": 51, "blue-djinn": 80, "efreet": 103, "marid": 104,
    "gargoyle": 95, "scarab": 83, "ancient-scarab": 79, "larva": 82,
    "cobra": 81, "quara-predator": 20, "yeti": 110, "winter-wolf": 52,
    "hyaena": 94, "lion": 41, "badger": 105, "deer": 31, "rabbit": 74,
    "pirate-marauder": 93, "pirate-cutthroat": 96, "pirate-buccaneer": 97,
    "pirate-corsair": 98, "mimic": 92, "pig": 60, "sheep": 14,
    "black-sheep": 13, "dog": 32, "butterfly": 10, "beholder": 17,
    "dwarf-miner": 69, "amazon": 137, "valkyrie": 139, "swamp-thing": 51,
}

# Cores das outfits humanoides (head, body, legs, feet) para dar variedade
HUMANOID_COLORS = {
    "witch": (114, 86, 86, 0), "monk": (95, 95, 95, 95),
    "priestess": (114, 86, 86, 0), "hero": (0, 132, 132, 114),
    "black-knight": (0, 0, 0, 0), "necromancer": (0, 86, 86, 0),
    "amazon": (113, 39, 113, 115), "valkyrie": (95, 113, 39, 115),
    "pirate-marauder": (95, 76, 76, 114),
}


def save_mob(name, looktype, colors=None, frames=(0,)):
    """Salva o sprite frontal (sul) e o de perfil (oeste) de um monstro."""
    for tag, direction in (("s", 2), ("w", 3), ("n", 0), ("e", 1)):
        img = render_outfit(dat, spr, looktype, direction=direction, colors=colors)
        if img is None or not img.getbbox():
            continue
        img = img.crop(img.getbbox())
        img.save("%s/mob/%s_%s.png" % (OUT, name, tag))


manifest_mobs = {}
for name, lt in MONSTER_LOOKTYPES.items():
    colors = HUMANOID_COLORS.get(name)
    obj = dat.outfit(lt)
    if obj is None:
        print("!! sem outfit", name, lt)
        continue
    if obj.groups[0].layers > 1 and colors is None:
        colors = (78, 68, 58, 76)
    save_mob(name, lt, colors)
    manifest_mobs[name] = lt

# ---------------------------------------------------------------- itens
items_def = json.load(open("/home/user/engine/data/740/items/definitions.json"))
by_name = {}
for k, v in items_def.items():
    n = v.get("properties", {}).get("name")
    if n and n not in by_name:
        by_name[n] = int(k)

ITEM_LIST = [
    # armas
    "sword", "axe", "club", "rapier", "sabre", "combat knife", "mace",
    "hatchet", "longsword", "battle axe", "battle hammer", "morning star",
    "war hammer", "knight axe", "barbarian axe", "dragon hammer",
    "fire axe", "fire sword", "giant sword", "warlord sword", "magic longsword",
    "thunder hammer", "stonecutter axe", "serpent sword", "dragon lance",
    "obsidian lance", "halberd", "guardian halberd", "great axe", "spike sword",
    "ice rapier", "silver mace", "clerical mace", "crowbar", "carlin sword",
    "broadsword", "double axe", "daramian mace", "orcish axe", "bright sword",
    "epee", "durable axe", "heavy mace",
    # distance
    "bow", "crossbow", "spear", "arrow", "bolt", "royal spear", "hunting spear",
    "power bolt", "burst arrow", "poison arrow",
    # varinhas / rods
    "wand of vortex", "wand of dragonbreath", "wand of decay", "wand of draconia",
    "wand of cosmic energy", "wand of inferno", "snakebite rod", "moonlight rod",
    "necrotic rod", "northwind rod", "terra rod", "hailstorm rod",
    # armaduras
    "leather armor", "chain armor", "brass armor", "plate armor", "scale armor",
    "studded armor", "knight armor", "crown armor", "golden armor", "noble armor",
    "dragon scale mail", "magic plate armor", "demon armor", "blue robe",
    "doublet", "coat", "dark armor", "leopard armor",
    # pernas
    "leather legs", "studded legs", "chain legs", "brass legs", "plate legs",
    "knight legs", "crown legs", "golden legs", "blue legs", "dragon scale legs",
    # capacetes
    "leather helmet", "studded helmet", "chain helmet", "brass helmet",
    "steel helmet", "soldier helmet", "viking helmet", "dwarven helmet",
    "crown helmet", "royal helmet", "demon helmet", "devil helmet",
    "warrior helmet", "crusader helmet", "horned helmet", "winged helmet",
    "strange helmet", "mystic turban",
    # botas
    "leather boots", "boots of haste", "steel boots", "golden boots",
    "sandals", "patched boots", "soft boots",
    # escudos
    "wooden shield", "studded shield", "brass shield", "plate shield",
    "steel shield", "copper shield", "battle shield", "dragon shield",
    "tower shield", "demon shield", "guardian shield", "bonelord shield",
    "vampire shield", "amazon shield", "medusa shield", "phoenix shield",
    "crown shield", "griffin shield", "ancient shield", "dark shield",
    "castle shield", "scarab shield",
    # aneis e amuletos
    "life ring", "might ring", "power ring", "energy ring", "sword ring",
    "axe ring", "club ring", "dwarven ring", "ring of healing", "time ring",
    "stealth ring", "strange talisman", "silver amulet", "bronze amulet",
    "dragon necklace", "protection amulet", "stone skin amulet", "elven amulet",
    "amulet of loss", "platinum amulet", "garlic necklace", "scarab amulet",
    "star amulet", "sacred tree amulet", "demonbone amulet",
    # consumiveis / moedas / loot
    "gold coin", "platinum coin", "crystal coin", "health potion",
    "strong health potion", "great health potion", "mana potion",
    "strong mana potion", "great mana potion", "great spirit potion",
    "small health potion", "brown mushroom", "white mushroom",
    "backpack", "bag", "golden mug", "torch", "rope", "shovel", "pick",
    # loot vendavel
    "dragon ham", "ham", "meat", "cheese", "worm", "bread",
    "dragon scale", "red dragon scale", "dragon claw", "demon dust",
    "demonic essence", "bones", "skull", "bone", "spider silk", "ape fur",
    "iron ore", "perfect behemoth fang", "behemoth claw", "lizard leather",
    "minotaur leather", "wolf paw", "bear paw", "vampire dust", "lich scepter",
    "gold ingot", "small diamond", "small ruby", "small emerald",
    "small sapphire", "small amethyst", "talon", "green gem", "blue gem",
    "red gem", "yellow gem", "violet gem", "giant spider silk", "royal helmet",
    "orcish gear", "orc tooth", "skeleton decoration", "book",
    "soul orb", "flask of demonic blood", "green mushroom", "fish",
]

manifest_items = {}
for name in ITEM_LIST:
    cid = by_name.get(name)
    if cid is None:
        continue
    img = render_item(dat, spr, cid)
    if img is None or not img.getbbox():
        continue
    img = img.crop(img.getbbox())
    slug = name.replace(" ", "-")
    img.save("%s/item/%s.png" % (OUT, slug))
    props = items_def[str(cid)].get("properties", {})
    manifest_items[slug] = {"id": cid, "name": name, "props": props}

# ---------------------------------------------------------------- outfits do player
PLAYER_OUTFITS = {
    "citizen-m": 128, "hunter-m": 129, "mage-m": 130, "knight-m": 131,
    "nobleman-m": 132, "summoner-m": 133, "warrior-m": 134,
    "citizen-f": 136, "hunter-f": 137, "summoner-f": 138, "knight-f": 139,
    "noblewoman-f": 140, "mage-f": 141, "warrior-f": 142,
}
for name, lt in PLAYER_OUTFITS.items():
    for tag, direction in (("s", 2), ("w", 3), ("n", 0), ("e", 1)):
        img = render_outfit(dat, spr, lt, direction=direction, colors=(78, 68, 58, 76))
        if img is None or not img.getbbox():
            continue
        img.crop(img.getbbox()).save("%s/outfit/%s_%s.png" % (OUT, name, tag))

json.dump({"mobs": manifest_mobs, "items": manifest_items,
           "outfits": PLAYER_OUTFITS},
          open("%s/manifest.json" % OUT, "w"), indent=1)
print("mobs:", len(manifest_mobs), "items:", len(manifest_items),
      "outfits:", len(PLAYER_OUTFITS))
missing = [n for n in ITEM_LIST if n not in by_name]
print("itens nao encontrados:", missing)
