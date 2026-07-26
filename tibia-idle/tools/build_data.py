"""Gera game/data/*.json: monstros, hunts, itens equipaveis, loot e supplies."""
import json
import os

ASSETS = "/home/user/tibia-idle/game/assets"
DATA = "/home/user/tibia-idle/game/data"
os.makedirs(DATA, exist_ok=True)

man = json.load(open("%s/manifest.json" % ASSETS))
items_raw = man["items"]

# ---------------------------------------------------------------- ITENS
# slot final usado pelo jogo
SLOT_BY_WEAPON = {"sword": "weapon", "axe": "weapon", "club": "weapon",
                  "distance": "weapon", "shield": "shield",
                  "ammunition": "ammo", "wand": "weapon", "rod": "weapon"}

# Wands/rods do 7.4 nao tem weaponType no dat; definimos manualmente (dano magico)
MAGIC_WEAPONS = {
    "wooden-wand": {"mag": 1, "dmg": 8, "lvl": 7, "vocs": ["sorcerer", "druid"]},
    "elven-wand": {"mag": 2, "dmg": 14, "lvl": 13, "vocs": ["sorcerer", "druid"]},
    "conjurer-wand": {"mag": 3, "dmg": 21, "lvl": 19, "vocs": ["sorcerer", "druid"]},
    "crystal-wand": {"mag": 4, "dmg": 29, "lvl": 26, "vocs": ["sorcerer", "druid"]},
    "ritual-wand": {"mag": 5, "dmg": 38, "lvl": 33, "vocs": ["sorcerer", "druid"]},
    "wand-of-might": {"mag": 6, "dmg": 48, "lvl": 40, "vocs": ["sorcerer", "druid"]},
    "golden-wand": {"mag": 7, "dmg": 58, "lvl": 50, "vocs": ["sorcerer", "druid"]},
    "green-spell-wand": {"mag": 4, "dmg": 30, "lvl": 26, "vocs": ["druid"]},
    "blue-spell-wand": {"mag": 5, "dmg": 40, "lvl": 33, "vocs": ["sorcerer"]},
    "red-spell-wand": {"mag": 6, "dmg": 50, "lvl": 40, "vocs": ["sorcerer"]},
    "yellow-spell-wand": {"mag": 5, "dmg": 40, "lvl": 33, "vocs": ["druid"]},
    "arcane-staff": {"mag": 9, "dmg": 78, "lvl": 75, "vocs": ["sorcerer", "druid"]},
    "skull-staff": {"mag": 3, "dmg": 0, "lvl": 30, "vocs": []},
}

# bonus magicos de itens (7.4 real)
MAGIC_BONUS = {
    "blue-robe": 3, "mystic-turban": 2, "magician-hat": 2, "hat-of-the-mad": 3,
    "spellbook": 1, "life-crystal": 2, "mind-stone": 3, "orb": 1,
    "crystal-ball": 1, "magic-plate-armor": 1, "boots-of-haste": 0,
    "elven-amulet": 0, "ancient-amulet": 0, "starlight-amulet": 2,
    "crown-shield": 0, "demonbone-amulet": 0,
}

# level minimo sugerido por item (aproximado do Tibia real)
LEVEL_REQ = {
    "magic-plate-armor": 60, "demon-armor": 60, "golden-armor": 40,
    "dragon-scale-mail": 50, "crown-armor": 35, "knight-armor": 30,
    "demon-shield": 55, "mastermind-shield": 60, "blessed-shield": 70,
    "tempest-shield": 55, "great-shield": 60, "vampire-shield": 45,
    "medusa-shield": 45, "phoenix-shield": 50, "dragon-shield": 40,
    "tower-shield": 35, "demon-helmet": 60, "royal-helmet": 40,
    "crown-helmet": 30, "warrior-helmet": 35, "crusader-helmet": 45,
    "horned-helmet": 50, "winged-helmet": 55, "golden-helmet": 60,
    "helmet-of-the-ancients": 50, "golden-boots": 70, "boots-of-haste": 30,
    "steel-boots": 35, "soft-boots": 40, "golden-legs": 55, "demon-legs": 60,
    "crown-legs": 35, "knight-legs": 30, "dragon-scale-legs": 45,
    "magic-longsword": 65, "warlord-sword": 60, "thunder-hammer": 55,
    "giant-sword": 45, "fire-sword": 35, "magic-sword": 70, "arcane-staff": 75,
    "stonecutter-axe": 50, "hammer-of-wrath": 50, "great-axe": 55,
    "guardian-halberd": 45, "dragon-lance": 40, "obsidian-lance": 30,
}

SLOT_ALIAS = {"body": "armor", "legs": "legs", "head": "helmet", "feet": "boots",
              "ring": "ring", "necklace": "amulet", "ammo": "ammo",
              "two-handed": "weapon", "backpack": "container"}

# amuletos / aneis com efeitos
ACCESSORY_STATS = {
    "life-ring": {"hpreg": 2, "mpreg": 3},
    "ring-of-healing": {"hpreg": 4, "mpreg": 5},
    "might-ring": {"prot": 20},
    "power-ring": {"melee": 2},
    "energy-ring": {"shield": 6},
    "sword-ring": {"sword": 3}, "axe-ring": {"axe": 3}, "club-ring": {"club": 3},
    "time-ring": {"speed": 15},
    "dwarven-ring": {"hpreg": 1},
    "crystal-ring": {"mag": 1},
    "gold-ring": {"hpreg": 1, "mpreg": 1},
    "wedding-ring": {"hpreg": 1},
    "ring-of-the-sky": {"mag": 2, "mpreg": 4},
    "ring-of-wishes": {"mag": 3, "hpreg": 3, "mpreg": 3},
    "silver-amulet": {"prot": 8}, "bronze-amulet": {"prot": 8},
    "dragon-necklace": {"prot": 15},
    "protection-amulet": {"prot": 12},
    "stone-skin-amulet": {"prot": 30},
    "elven-amulet": {"prot": 10},
    "platinum-amulet": {"prot": 18},
    "garlic-necklace": {"prot": 10},
    "scarab-amulet": {"prot": 14},
    "star-amulet": {"prot": 16},
    "demonbone-amulet": {"prot": 25},
    "golden-amulet": {"prot": 20},
    "ancient-amulet": {"mag": 1, "prot": 10},
    "starlight-amulet": {"mag": 2, "prot": 12},
    "crystal-necklace": {"prot": 12},
    "ruby-necklace": {"prot": 14},
    "wolf-tooth-chain": {"melee": 2},
    "paw-amulet": {"melee": 3},
    "amulet-of-loss": {"prot": 5},
    "strange-talisman": {"prot": 6},
    "elven-brooch": {"mag": 1},
    "silver-necklace": {"prot": 6},
    "bronzen-necklace": {"prot": 6},
    "life-crystal": {"mag": 2},
    "mind-stone": {"mag": 3},
    "orb": {"mag": 1},
    "crystal-ball": {"mag": 1},
    "spellbook": {"mag": 1},
    "frozen-starlight": {"mag": 2},
}

# valor de venda (gp) para loot vendavel
SELL_VALUE = {
    "gold-coin": 1, "platinum-coin": 100, "crystal-coin": 10000,
    "small-diamond": 300, "small-ruby": 250, "small-emerald": 250,
    "small-sapphire": 250, "small-amethyst": 200, "gold-nugget": 850,
    "white-pearl": 160, "black-pearl": 280, "green-gem": 5000,
    "blue-gem": 5000, "red-gem": 1000, "yellow-gem": 1000, "violet-gem": 1000,
    "talon": 800, "scarab-coin": 100, "holy-scarab": 300,
    "burning-heart": 400, "blood-orb": 500, "roc-feather": 400,
    "phoenix-egg": 750, "frozen-starlight": 3000,
    "dragon-ham": 30, "ham": 8, "meat": 5, "cheese": 4, "bread": 3,
    "fish": 4, "salmon": 6, "shrimp": 8, "northern-pike": 10,
    "big-bone": 15, "bone": 2, "skull": 4, "dirty-fur": 30, "fishbone": 2,
    "brown-mushroom": 15, "white-mushroom": 5, "red-mushroom": 20,
    "green-mushroom": 25, "fire-mushroom": 30, "dark-mushroom": 25,
    "blood-herb": 500, "star-herb": 100, "sling-herb": 100,
    "powder-herb": 100, "shadow-herb": 100, "stone-herb": 100,
    "torch": 2, "rope": 50, "shovel": 50, "pick": 50, "crowbar": 260,
    "machete": 35, "scythe": 12, "sickle": 8, "hoe": 12, "watch": 20,
    "vial": 5, "brown-flask": 3, "green-flask": 3, "blue-bottle": 3,
    "silver-key": 10, "golden-key": 20, "crystal-key": 30,
    "mysterious-fetish": 50, "strange-symbol": 200, "voodoo-doll": 100,
    "teddy-bear": 10, "doll": 5, "present": 5, "letter": 1, "book": 6,
    "torn-book": 4, "cookbook": 15, "spy-report": 100,
    "rotten-meat": 1, "moldy-cheese": 1, "brown-bread": 3, "cookie": 2,
    "candy-cane": 5, "melon": 8, "banana": 3, "orange": 4, "grapes": 4,
    "carrot": 2, "pumpkin": 8, "egg": 2, "golden-mug": 200,
    "silver-brooch": 100, "elven-brooch": 200, "golden-trash": 30,
    "piece-of-iron": 30, "some-wood": 5, "stone": 1,
}

# preco de compra na loja (NPC) — para supplies e equips basicos
SHOP_PRICE = {
    "intense-healing-rune": 95, "ultimate-healing-rune": 175,
    "great-fireball-rune": 65, "sudden-death-rune": 155,
    "explosion-rune": 55, "heavy-magic-missile-rune": 25,
    "light-magic-missile-rune": 10, "fireball-rune": 30,
    "blank-rune": 10, "arrow": 3, "bolt": 4, "spear": 9,
    "burst-arrow": 15, "poison-arrow": 12, "power-bolt": 20,
    "brown-mushroom": 50, "torch": 2, "rope": 50, "shovel": 50,
}


def build_items():
    out = {}
    for slug, v in items_raw.items():
        p = v["props"]
        name = v["name"]
        entry = {"id": v["id"], "name": name, "sprite": slug}
        wt = p.get("weaponType")
        st = p.get("slotType")

        if slug in MAGIC_WEAPONS:
            mw = MAGIC_WEAPONS[slug]
            entry.update({"slot": "weapon", "type": "magic",
                          "magicDamage": mw["dmg"], "mag": mw["mag"],
                          "level": mw["lvl"], "vocs": mw["vocs"]})
        elif wt in ("sword", "axe", "club"):
            entry.update({"slot": "weapon", "type": wt,
                          "attack": p.get("attack", 0),
                          "defense": p.get("defense", 0)})
            if st == "two-handed":
                entry["twoHanded"] = True
        elif wt == "distance":
            entry.update({"slot": "weapon", "type": "distance",
                          "attack": p.get("attack", 0)})
        elif wt == "shield":
            entry.update({"slot": "shield", "type": "shield",
                          "defense": p.get("defense", 0)})
        elif wt == "ammunition":
            entry.update({"slot": "ammo", "type": "ammo",
                          "attack": p.get("attack", 0)})
        elif st in ("body", "legs", "head", "feet"):
            entry.update({"slot": SLOT_ALIAS[st], "type": "armor",
                          "armor": p.get("armor", 0)})
            if p.get("speed"):
                entry["speed"] = p["speed"]
        elif st == "ring":
            entry.update({"slot": "ring", "type": "accessory"})
        elif st == "necklace":
            entry.update({"slot": "amulet", "type": "accessory"})
        elif slug in ACCESSORY_STATS:
            entry.update({"slot": "amulet", "type": "accessory"})
        else:
            entry.update({"slot": None, "type": "loot"})

        if slug in ACCESSORY_STATS:
            entry.update(ACCESSORY_STATS[slug])
        if slug in MAGIC_BONUS and MAGIC_BONUS[slug]:
            entry["mag"] = entry.get("mag", 0) + MAGIC_BONUS[slug]
        if slug in LEVEL_REQ:
            entry["level"] = LEVEL_REQ[slug]
        if slug in SELL_VALUE:
            entry["sell"] = SELL_VALUE[slug]
        if slug in SHOP_PRICE:
            entry["buy"] = SHOP_PRICE[slug]
        if p.get("armor") and "armor" not in entry:
            entry["armor"] = p["armor"]
        entry["weight"] = p.get("weight", 100) / 100.0
        out[slug] = entry

    # preco de venda automatico para equips sem valor definido
    for slug, e in out.items():
        if "sell" in e:
            continue
        power = (e.get("attack", 0) * 12 + e.get("defense", 0) * 10 +
                 e.get("armor", 0) * 30 + e.get("magicDamage", 0) * 8 +
                 e.get("mag", 0) * 250 + e.get("prot", 0) * 20 +
                 e.get("hpreg", 0) * 150 + e.get("mpreg", 0) * 120 +
                 e.get("speed", 0) * 10)
        e["sell"] = max(2, int(power * 1.6))
    return out


ITEMS = build_items()
json.dump(ITEMS, open("%s/items.json" % DATA, "w"), indent=1)
print("itens:", len(ITEMS))
