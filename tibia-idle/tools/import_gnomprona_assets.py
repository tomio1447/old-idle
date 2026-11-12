import argparse
import json
import os
from pathlib import Path
import shutil
import xml.etree.ElementTree as ET

from import_otbm_sprites import ids_do_otbm, recorte32, extrair_patterns
from tibia_assets_860 import Dat860, Spr860, render_item_860

ROOT = Path(__file__).resolve().parents[1]
GAME = ROOT / "game"
SOURCE = Path(os.environ.get("TIBIA860", ROOT.parent / "refs" / "tibia860"))
PRODUCTS = ["headpecker-beak", "headpecker-feather", "mantosaurus-jaw", "mercurial-wing",
            "ripptor-scales", "ripptor-claw", "cry-stal", "emerald-tortoise-shell",
            "gore-horn", "gorerilla-mane", "gorerilla-tail", "prehemoth-horns",
            "prehemoth-claw", "sabretooth-fur"]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--publish-map", choices=["gnomprona_weagon2.otbm", "gnomprona_weagon3.otbm"])
    args = parser.parse_args()
    dat = Dat860(str(SOURCE / "Tibia.dat"))
    spr = Spr860(str(SOURCE / "Tibia.spr"))
    items = {item.attrib.get("name", "").lower(): item
             for item in ET.parse(ROOT / "tools" / "data" / "canary-items.xml").getroot()}
    prices = {row["name"].lower(): row["npcPrice"] for row in
              json.loads((ROOT / "tools" / "_wiki_creature_products.json").read_text(encoding="utf-8"))}
    for slug in PRODUCTS:
        name = slug.replace("-", " ") if slug != "cry-stal" else slug
        item = items[name]
        cid = int(item.attrib["id"])
        image = render_item_860(dat, spr, cid)
        if image is None or not image.getbbox() or image.size != (32, 32):
            raise ValueError(f"Loot icon inválido: {slug} ({cid})")
        dest = GAME / "assets" / "item" / f"{slug}.png"
        if not dest.exists():
            image.save(dest)
        price = prices["gore horn (item)" if slug == "gore-horn" else name]
        weight = next(float(attr.attrib["value"]) / 100 for attr in item
                      if attr.attrib.get("key") == "weight")
        print(json.dumps([slug, cid, price, weight]))
    flags_path = GAME / "js" / "tileflags.js"
    text = flags_path.read_text(encoding="utf-8")
    prefix, payload = text.split("window.TILEFLAGS = ", 1)
    flags = json.loads(payload.rstrip().rstrip(";"))
    ids = set()
    for wagon in (2, 3):
        name = f"gnomprona_weagon{wagon}.otbm"
        source = GAME / "beta-maps" / name
        destination = GAME / "maps" / name
        if not destination.exists():
            shutil.copyfile(source, destination)
        elif destination.read_bytes() != source.read_bytes():
            if args.publish_map != name:
                raise ValueError(f"Mapa publicado diverge da origem: {name}")
            shutil.copyfile(source, destination)
        ids |= ids_do_otbm(str(source))
    positional = set()
    for cid in sorted(ids):
        obj = dat.item(cid)
        if obj is None:
            raise ValueError(f"Tile sem DAT: {cid}")
        image = render_item_860(dat, spr, cid)
        destination = GAME / "assets" / "tiles" / f"{cid}.png"
        if not destination.exists():
            if image is None or not image.getbbox():
                raise ValueError(f"Tile sem pixels: {cid}")
            recorte32(image).save(destination)
        group = obj.groups[0]
        if {"Ground", "GroundBorder", "OnBottom"} & obj.flags and (group.px > 1 or group.py > 1):
            positional.add(cid)
        if str(cid) in flags:
            continue
        walk = int("Ground" in obj.flags and "NotWalkable" not in obj.flags and bool(obj.props.get("speed")))
        block = int("NotWalkable" in obj.flags or ("Ground" in obj.flags and not walk))
        if walk or block:
            flags[str(cid)] = [walk, block] + ([group.width, group.height] if group.width > 1 or group.height > 1 else [])
    flags_path.write_text(prefix + "window.TILEFLAGS = " + json.dumps(flags, separators=(",", ":")) + ";\n", encoding="utf-8")
    print("Patterns:", extrair_patterns(dat, spr, positional))
    print("OTBMs publicados; tiles validados:", len(ids))


if __name__ == "__main__":
    main()
