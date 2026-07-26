"""Empacota os JSONs em um unico arquivo JS para funcionar sem servidor (file://)."""
import json

DATA = "/home/user/tibia-idle/game/data"
items = json.load(open("%s/items.json" % DATA))
monsters = json.load(open("%s/monsters.json" % DATA))
hunts = json.load(open("%s/hunts.json" % DATA))

# so mantem os campos usados pelo jogo (arquivo menor)
slim_items = {}
for k, v in items.items():
    e = {"n": v["name"], "s": v.get("slot"), "t": v["type"]}
    for src, dst in (("attack", "atk"), ("defense", "def"), ("armor", "arm"),
                     ("magicDamage", "mdmg"), ("mag", "mag"), ("prot", "prot"),
                     ("hpreg", "hpreg"), ("mpreg", "mpreg"), ("speed", "spd"),
                     ("melee", "melee"), ("sword", "sword"), ("axe", "axe"),
                     ("club", "club"), ("shield", "shield"), ("level", "lvl"),
                     ("sell", "sell"), ("buy", "buy"), ("twoHanded", "th"),
                     ("weight", "w"), ("vocs", "vocs")):
        if src in v and v[src]:
            e[dst] = v[src]
    slim_items[k] = e

out = "window.GAMEDATA = %s;\n" % json.dumps(
    {"items": slim_items, "monsters": monsters, "hunts": hunts},
    separators=(",", ":"), ensure_ascii=False)

path = "/home/user/tibia-idle/game/js/gamedata.js"
import os
os.makedirs(os.path.dirname(path), exist_ok=True)
open(path, "w", encoding="utf-8").write(out)
print("bytes:", len(out), "| itens", len(slim_items),
      "| monstros", len(monsters), "| hunts", len(hunts))
