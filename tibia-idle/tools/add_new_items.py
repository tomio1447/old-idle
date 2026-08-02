import json
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
CANARY = "../../../levi-repo"
ITEMS_XML = os.path.join(CANARY, "items.xml")
GAME = os.path.normpath(os.path.join(HERE, "..", "game", "js", "gamedata.js"))

def parse_items():
    import xml.etree.ElementTree as ET
    tree = ET.parse(ITEMS_XML)
    root = tree.getroot()
    res = {}
    for node in root.findall('item'):
        name = node.get("name")
        if not name: continue
        name = name.lower()
        it = {}
        for attr in node.findall('attribute'):
            k = attr.get('key')
            v = attr.get('value')
            if k == 'weaponType': it['weaponType'] = v.lower()
            elif k == 'armor': it['arm'] = int(v)
            elif k == 'defense': it['def'] = int(v)
            elif k == 'attack': it['atk'] = int(v)
            elif k == 'slotType': it['slot'] = v.lower()
            elif k == 'weight': it['w'] = float(v)/100.0
        res[name] = it
    return res

def main():
    canary = parse_items()
    src = open(GAME, encoding="utf-8").read()
    prefix = "window.GAMEDATA = "
    data = json.loads(src[len(prefix):].rstrip().rstrip(";"))
    itens = data["items"]
    
    # known items mapping
    known_names = set((i.get("n") or k.replace("-", " ")).lower() for k,i in itens.items())
    
    added = 0
    for name, c in canary.items():
        if name in known_names: continue
        
        # Only add equipments
        wt = c.get('weaponType')
        slot = c.get('slot')
        
        is_equip = False
        slug = name.replace(" ", "-").replace("'", "")
        new_item = {"n": name}
        if wt in ("sword", "club", "axe", "distance", "wand", "rod"):
            is_equip = True
            new_item["s"] = "weapon"
            new_item["t"] = wt
            if 'atk' in c: new_item["atk"] = c["atk"]
            if 'def' in c: new_item["def"] = c["def"]
        elif slot in ("head", "body", "legs", "feet", "shield"):
            is_equip = True
            new_item["s"] = slot if slot != "shield" else "shield"
            if slot == "head": new_item["s"] = "helmet"
            if slot == "body": new_item["s"] = "armor"
            if slot == "feet": new_item["s"] = "boots"
            new_item["t"] = "armor" if slot != "shield" else "shield"
            if 'arm' in c: new_item["arm"] = c["arm"]
            if 'def' in c: new_item["def"] = c["def"]
            
        if is_equip:
            if 'w' in c: new_item["w"] = c["w"]
            itens[slug] = new_item
            added += 1

    print(f"Added {added} new equipments.")
    
    out = json.dumps(data, separators=(',', ':'))
    # Make it pretty like it was?
    # the original file is a one-liner basically, or printed with no spaces. Let's just output it.
    with open(GAME, "w", encoding="utf-8") as f:
        f.write(prefix + out + ";")

main()
