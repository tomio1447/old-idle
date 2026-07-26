"""Extrai efeitos (animacoes) e itens extras do Tibia 7.4."""
import json
import os
from PIL import Image
from render import load, render_group, render_item

OUT = "/home/user/tibia-idle/game/assets"
os.makedirs(OUT + "/fx", exist_ok=True)

dat, spr = load()
base = dat.item_count + dat.outfit_count

# Nomes dos efeitos do Tibia 7.4 na ordem oficial
FX = {
    1: "draw-blood", 2: "lose-energy", 3: "poff", 4: "block-hit",
    5: "explosion-area", 6: "explosion-hit", 7: "fire-area", 8: "yellow-rings",
    9: "green-rings", 10: "hit-area", 11: "teleport", 12: "energy-damage",
    13: "magic-blue", 14: "magic-red", 15: "magic-green", 16: "hit-by-fire",
    17: "hit-by-poison", 18: "mort-area", 19: "sound-green", 20: "sound-red",
    21: "poison-area", 22: "sound-yellow", 23: "sound-purple", 24: "sound-blue",
    25: "sound-white",
}

fx_manifest = {}
for eid, name in FX.items():
    obj = dat.objects.get(base + eid)
    if obj is None:
        continue
    g = obj.groups[0]
    frames = []
    for f in range(g.anim):
        img = render_group(spr, g, frame=f)
        if img is None:
            continue
        frames.append(img)
    if not frames:
        continue
    # spritesheet horizontal
    w, h = frames[0].size
    sheet = Image.new("RGBA", (w * len(frames), h), (0, 0, 0, 0))
    for i, fr in enumerate(frames):
        sheet.alpha_composite(fr, (i * w, 0))
    sheet.save("%s/fx/%s.png" % (OUT, name))
    fx_manifest[name] = {"frames": len(frames), "w": w, "h": h}

# ------------------------------------------------------- itens extras
items_def = json.load(open("/home/user/engine/data/740/items/definitions.json"))
by_name = {}
for k, v in items_def.items():
    n = v.get("properties", {}).get("name")
    if n and n not in by_name:
        by_name[n] = int(k)

EXTRA = [
    "broad sword", "daramanian mace", "daramanian waraxe", "daramanian axe",
    "dwarven axe", "dwarven shield", "dwarven armor", "dwarven legs",
    "war axe", "twin axe", "hammer of wrath", "arcane staff", "magic sword",
    "pharaoh sword", "djinn blade", "poison dagger", "silver dagger",
    "throwing knife", "throwing star", "katana", "naginata", "scimitar",
    "short sword", "dagger", "staff", "crystal mace", "skull staff",
    "bone club", "bone sword", "studded club", "small axe", "hand axe",
    "wooden wand", "elven wand", "crystal wand", "wand of might",
    "conjurer wand", "ritual wand", "green spell wand", "yellow spell wand",
    "blue spell wand", "red spell wand", "golden wand", "enchanted staff",
    "life crystal", "mind stone", "orb", "crystal ball", "spellbook",
    "amazon armor", "amazon helmet", "native armor", "elven legs",
    "demon legs", "dragon scale helmet", "golden helmet", "golden legs",
    "iron helmet", "legion helmet", "dark helmet", "damaged helmet",
    "helmet of the ancients", "magician hat", "hat of the mad",
    "mastermind shield", "shield of honour", "beholder shield", "great shield",
    "blessed shield", "ornamented shield", "viking shield", "eagle shield",
    "black shield", "bone shield", "tempest shield", "rose shield",
    "dwarven ring", "crystal ring", "gold ring", "wedding ring",
    "ring of healing", "ring of the sky", "ring of wishes",
    "golden amulet", "ancient amulet", "starlight amulet", "crystal necklace",
    "ruby necklace", "wolf tooth chain", "paw amulet", "elven brooch",
    "vial", "brown flask", "green flask", "blue bottle",
    "white pearl", "black pearl", "small diamond", "small ruby",
    "small emerald", "small sapphire", "small amethyst", "gold nugget",
    "green gem", "blue gem", "red gem", "yellow gem", "violet gem",
    "talon", "holy scarab", "scarab coin", "burning heart", "blood orb",
    "roc feather", "phoenix egg", "frozen starlight", "mysterious fetish",
    "strange symbol", "voodoo doll", "teddy bear", "doll",
    "dirty fur", "big bone", "bone", "skull", "fishbone", "rotten meat",
    "moldy cheese", "brown bread", "bread", "cheese", "ham", "dragon ham",
    "meat", "fish", "salmon", "shrimp", "northern pike", "melon", "banana",
    "orange", "grapes", "carrot", "pumpkin", "cookie", "candy cane",
    "white mushroom", "brown mushroom", "red mushroom", "green mushroom",
    "fire mushroom", "dark mushroom", "orange mushroom", "wood mushroom",
    "blood herb", "star herb", "sling herb", "powder herb", "shadow herb",
    "stone herb", "torch", "rope", "shovel", "pick", "crowbar", "machete",
    "scythe", "sickle", "hoe", "watch", "backpack", "bag", "blue backpack",
    "red backpack", "purple backpack", "grey backpack", "golden backpack",
    "backpack of holding", "present", "letter", "book", "torn book",
    "cookbook", "spy report", "blank rune", "intense healing rune",
    "ultimate healing rune", "great fireball rune", "sudden death rune",
    "explosion rune", "heavy magic missile rune", "light magic missile rune",
    "fireball rune", "firebomb rune", "poison bomb rune", "energy bomb rune",
    "paralyze rune", "magic wall rune", "destroy field rune", "antidote rune",
    "animate dead rune", "convince creature rune", "soulfire rune",
    "chameleon rune", "desintegrate rune", "crystal arrow", "burst arrow",
    "poison arrow", "power bolt", "arrow", "bolt", "spear", "bow", "crossbow",
    "cape", "coat", "jacket", "doublet", "green tunic", "red tunic",
    "blue robe", "red robe", "scarf", "cowl", "simple dress", "white dress",
    "ball gown", "worn leather boots", "sandals", "bunny slippers",
    "traper boots", "soft boots", "boots of waterwalking",
    "gold coin", "platinum coin", "crystal coin", "piggy bank",
    "silver key", "golden key", "crystal key", "copper key", "bone key",
    "purple key", "wooden key", "depot chest", "locker", "mirror", "vase",
    "candlestick", "lamp", "gemmed lamp", "small oil lamp",
]

extra_manifest = {}
for name in EXTRA:
    cid = by_name.get(name)
    if cid is None:
        continue
    slug = name.replace(" ", "-").replace("'", "")
    path = "%s/item/%s.png" % (OUT, slug)
    if not os.path.exists(path):
        img = render_item(dat, spr, cid)
        if img is None or not img.getbbox():
            continue
        img.crop(img.getbbox()).save(path)
    extra_manifest[slug] = {"id": cid, "name": name,
                            "props": items_def[str(cid)].get("properties", {})}

# junta no manifest existente
mpath = "%s/manifest.json" % OUT
man = json.load(open(mpath))
man["items"].update(extra_manifest)
man["fx"] = fx_manifest
json.dump(man, open(mpath, "w"), indent=1)
print("fx:", len(fx_manifest), "itens totais:", len(man["items"]))
missing = [n for n in EXTRA if n not in by_name]
print("faltando:", missing)
