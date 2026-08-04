"""
extract_tile_anims.py — Gera animações para os TILES do mapa (.otbm/RME).

Para cada id que o jogo usa em assets/tiles (chão + itens de mapa) e que
tem animação real no .dat 15.x (formato 8.60), gera:

    assets/tiles/<id>_anim.png    strip horizontal com af frames
    js/tileanimdata.js            window.TILE_ANIM = { id: {af, aw, ah} }

O runtime (tilemap.js) recorta o frame atual da strip — mapa fica vivo
(água, lava, fogo, cristais, portais...) sem mudar o modelo do .otbm.

Uso:
    TIBIA860=/caminho/extraido python3 extract_tile_anims.py
"""
import json
import os
import re
import sys

from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from tibia_assets_860 import Dat860, Spr860, render_group_860  # noqa: E402

SRC = os.environ.get("TIBIA860", "/tmp/newassets/extracted")
HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.normpath(os.path.join(HERE, "..", "game"))
TILES = os.path.join(GAME, "assets", "tiles")
OUT_JS = os.path.join(GAME, "js", "tileanimdata.js")

print("lendo", SRC)
dat = Dat860(os.path.join(SRC, "Tibia.dat"))
spr = Spr860(os.path.join(SRC, "Tibia.spr"))
print("  %d itens, %d sprites" % (dat.item_count, spr.count))

# ids em uso: PNGs em assets/tiles + known_tiles (RME)
ids = set()
for f in os.listdir(TILES):
    m = re.match(r"^(\d+)\.png$", f)
    if m:
        ids.add(int(m.group(1)))
try:
    kt = open(os.path.join(GAME, "rme", "data", "known_tiles.js"), encoding="utf-8").read()
    for m in re.finditer(r"\d+", kt.split("[", 1)[1].split("]", 1)[0]):
        ids.add(int(m.group()))
except Exception as e:
    print("  aviso known_tiles:", e)

print("  %d ids em uso" % len(ids))

anim = {}
gerados = 0
sem_anim = 0
for cid in sorted(ids):
    obj = dat.item(cid)
    if obj is None or not obj.groups:
        continue
    g = obj.groups[0]
    af = g.anim
    if not af or af < 2:
        sem_anim += 1
        continue
    frames = []
    for f in range(af):
        img = render_group_860(spr, g, frame=f)
        if img is None:
            continue
        bb = img.getbbox()
        if bb is None:
            continue
        frames.append(img.crop(bb))
    frames = [fr for fr in frames if fr is not None]
    if not frames:
        continue
    aw = max(fr.width for fr in frames)
    ah = max(fr.height for fr in frames)
    strip = Image.new("RGBA", (aw * len(frames), ah), (0, 0, 0, 0))
    for i, fr in enumerate(frames):
        strip.alpha_composite(fr, (i * aw + (aw - fr.width) // 2,
                                   (ah - fr.height) // 2))
    strip.save(os.path.join(TILES, "%d_anim.png" % cid))
    anim[str(cid)] = {"af": len(frames), "aw": aw, "ah": ah}
    gerados += 1

with open(OUT_JS, "w", encoding="utf-8") as fh:
    fh.write("/* tileanimdata.js — GERADO por tools/extract_tile_anims.py.\n")
    fh.write(" * Animacao dos tiles do mapa (itens do RME/OTBM):\n")
    fh.write(" * assets/tiles/<id>_anim.png = strip horizontal de af frames\n")
    fh.write(" * de aw x ah pixels. O renderer recorta o frame atual.\n */\n")
    fh.write('"use strict";\n')
    fh.write("window.TILE_ANIM = " + json.dumps(anim, separators=(",", ":")) + ";\n")

print("  tiles animados: %d strips geradas | %d sem animacao" % (gerados, sem_anim))
print("  ->", OUT_JS)
