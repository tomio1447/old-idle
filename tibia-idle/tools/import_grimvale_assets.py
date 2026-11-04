import json
import os
from pathlib import Path
import shutil
import subprocess
import sys

from tibia_assets_860 import Dat860, Spr860, render_item_860

ROOT = Path(__file__).resolve().parent.parent
SOURCE = Path(os.environ["TIBIA860"])
manifest = json.loads(subprocess.check_output([
    "node", "-e", "console.log(JSON.stringify(Object.assign({},require('./game/js/grimvale').items,require('./game/js/grimvale-bosses').items)))",
], cwd=ROOT, text=True))
dat = Dat860(str(SOURCE / "Tibia.dat"))
spr = Spr860(str(SOURCE / "Tibia.spr"))
for slug, item in manifest.items():
    image = render_item_860(dat, spr, item["cid"])
    if image is None or not image.getbbox():
        raise RuntimeError(f"Sprite inválida: {slug} / {item['cid']}")
    bounds = image.getbbox()
    if bounds[2] - bounds[0] > 32 or bounds[3] - bounds[1] > 32:
        raise RuntimeError(f"Ícone não cabe em 1x1: {slug} / {bounds}")
    if image.width > 32 or image.height > 32:
        image = image.crop(bounds)
    target = ROOT / "game/assets/item" / (slug + ".png")
    if not target.exists():
        image.save(target)
    print(slug, item["cid"], image.size, image.getbbox())

maps = []
for name, relative in [("grimvale", "grimvale.otbm"), ("grimvale2", "grimvale2.otbm"),
                       ("grimvaleboss", "bossesroom/grimvalebosses.otbm")]:
    source = ROOT / "game/beta-maps" / relative
    target = ROOT / "game/maps" / (name + ".otbm")
    if target.exists() and target.read_bytes() != source.read_bytes():
        raise RuntimeError(f"Mapa runtime diferente já existe: {target}")
    if not target.exists():
        shutil.copy2(source, target)
    maps.append(str(target))
subprocess.run([sys.executable, str(ROOT / "tools/import_otbm_sprites.py"), *maps], check=True)
