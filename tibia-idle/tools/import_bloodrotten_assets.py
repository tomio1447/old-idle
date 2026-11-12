import json
import os
from pathlib import Path
import shutil

from PIL import Image
from import_otbm_sprites import ids_do_otbm, recorte32, extrair_patterns
from tibia_assets_860 import Dat860, Spr860, render_item_860

ROOT = Path(__file__).resolve().parents[1]
GAME = ROOT / "game"
SOURCE = Path(os.environ.get("TIBIA860", ROOT.parent / "refs" / "tibia860"))
LOOT = {"crystal-coin": 3043, "ultimate-mana-potion": 23373, "giant-emerald": 30060,
        "supreme-health-potion": 23375, "yellow-gem": 3037, "berserk-potion": 7439,
        "blue-gem": 3041, "green-gem": 3038, "bullseye-potion": 7443,
        "mastermind-potion": 7440, "ultimate-spirit-potion": 23374, "giant-topaz": 32623,
        "giant-amethyst": 32622, "gold-ingot": 9058, "red-gem": 3039,
        "dragon-figurine": 30053, "raw-watermelon-tourmaline": 33778,
        "vemiath-s-infused-basalt": 43967, "violet-gem": 3036, "bag-you-covet": 43895,
        "giant-sapphire": 30061, "white-gem": 32769, "amber-with-a-bug": 32624,
        "amber-with-a-dragonfly": 32625, "putrefactive-figurine": 43962,
        "ichgahal-s-fungal-infestation": 43964, "giant-ruby": 30059,
        "figurine-of-bakragore": 43963, "bakragore-s-amalgamation": 43968,
        "spiritual-horseshoe": 44048}
ROOMS = {"Vemiath_room.otbm": "vemiath_room.otbm", "Chagorz_room.otbm": "chagorz_room.otbm",
         "Murcion_room.otbm": "murcion_room.otbm", "Ichgahal_room.otbm": "ichgahal_room.otbm",
         "bakragore_room.otbm": "bakragore_room.otbm"}


def main():
    dat = Dat860(str(SOURCE / "Tibia.dat"))
    spr = Spr860(str(SOURCE / "Tibia.spr"))
    for source_name, destination_name in ROOMS.items():
        source = GAME / "beta-maps" / "bossesroom" / source_name
        destination = GAME / "maps" / destination_name
        if not destination.exists():
            shutil.copyfile(source, destination)
        elif destination.read_bytes() != source.read_bytes():
            raise ValueError("Mapa publicado diverge da origem: " + destination_name)
    for slug, cid in LOOT.items():
        image = render_item_860(dat, spr, cid)
        if image is None or image.size != (32, 32) or not image.getbbox():
            raise ValueError(f"Loot sem ícone 1x1: {slug} ({cid})")
        destination = GAME / "assets" / "item" / f"{slug}.png"
        if not destination.exists():
            image.save(destination)
        with Image.open(destination) as published:
            if max(published.size) > 32 or not published.getbbox():
                raise ValueError(f"PNG inválido: {slug}")
    image = render_item_860(dat, spr, 43588)
    if image is None or not image.getbbox():
        raise ValueError("Pillar of Dark Energy sem sprite")
    image.save(GAME / "assets" / "mob" / "pillar-of-dark-energy.png")
    sheets_path = GAME / "js" / "mobsheetdata.js"
    prefix, payload = sheets_path.read_text(encoding="utf-8").split("window.MOBSHEETS = ", 1)
    sheets = json.loads(payload.rstrip().rstrip(";"))
    sheets["pillar-of-dark-energy"] = {"cw": image.width, "ch": image.height, "cols": 1, "rows": 1}
    sheets_path.write_text(prefix + "window.MOBSHEETS = " + json.dumps(sheets, sort_keys=True) + ";\n", encoding="utf-8")
    flags_path = GAME / "js" / "tileflags.js"
    prefix, payload = flags_path.read_text(encoding="utf-8").split("window.TILEFLAGS = ", 1)
    flags = json.loads(payload.rstrip().rstrip(";"))
    ids = set()
    for source_name in ROOMS:
        ids |= ids_do_otbm(str(GAME / "beta-maps" / "bossesroom" / source_name))
    positional = set()
    for cid in sorted(ids):
        obj = dat.item(cid)
        if obj is None:
            raise ValueError(f"Tile sem DAT: {cid}")
        image = render_item_860(dat, spr, cid)
        if cid == 43366 and "IgnoreLook" in obj.flags:
            image = Image.new("RGBA", (32, 32))
        elif image is None or not image.getbbox():
            raise ValueError(f"Tile sem pixels: {cid}")
        destination = GAME / "assets" / "tiles" / f"{cid}.png"
        if not destination.exists():
            recorte32(image).save(destination)
        group = obj.groups[0]
        if {"Ground", "GroundBorder", "OnBottom"} & obj.flags and (group.px > 1 or group.py > 1):
            positional.add(cid)
        if str(cid) not in flags:
            walk = int("Ground" in obj.flags and "NotWalkable" not in obj.flags and bool(obj.props.get("speed")))
            block = int("NotWalkable" in obj.flags or ("Ground" in obj.flags and not walk))
            if walk or block:
                flags[str(cid)] = [walk, block] + ([group.width, group.height] if group.width > 1 or group.height > 1 else [])
    flags_path.write_text(prefix + "window.TILEFLAGS = " + json.dumps(flags, separators=(",", ":")) + ";\n", encoding="utf-8")
    print("Patterns:", extrair_patterns(dat, spr, positional))
    print(f"Bloodrotten: {len(ROOMS)} mapas publicados, {len(ids)} tiles, {len(LOOT)} loots e sprite lookTypeEx 43588 validados.")


if __name__ == "__main__":
    main()
