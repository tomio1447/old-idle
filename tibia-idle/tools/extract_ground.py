"""Extrai tiles de chao e monta um fundo tileavel por cenario de hunt."""
import json
import os
import random
from PIL import Image
from render import load, render_item

OUT = "/home/user/tibia-idle/game/assets"
os.makedirs(OUT + "/ground", exist_ok=True)
dat, spr = load()

# tiles de chao por cenario (client ids do Tibia 7.4)
SCENES = {
    "sewer":     [351, 352, 353, 354, 355],
    "cave":      [351, 352, 354, 356, 101],
    "swamp":     [530, 531, 532, 533],
    "fortress":  [724, 725, 726, 727],
    "crypt":     [412, 413, 416, 417],
    "labyrinth": [465, 467, 431, 413],
    "mine":      [351, 352, 105, 146],
    "forest":    [102, 103, 106, 110],
    "valley":    [102, 105, 146, 147],
    "desert":    [104, 134, 135, 136],
    "temple":    [406, 407, 965, 966],
    "palace":    [967, 968, 969, 970],
    "nest":      [530, 532, 351, 354],
    "island":    [104, 134, 102, 103],
    "tower":     [407, 966, 412, 419],
    "lair":      [351, 354, 356, 101],
    "hall":      [405, 424, 425, 426],
    "glacier":   [670, 671, 684, 685],
    "hell":      [351, 356, 101, 107],
}

TILE = 32
W_TILES, H_TILES = 16, 8

for scene, ids in SCENES.items():
    rng = random.Random(hash(scene) & 0xFFFF)
    sheet = Image.new("RGBA", (W_TILES * TILE, H_TILES * TILE), (20, 20, 20, 255))
    variants = []
    for cid in ids:
        img = render_item(dat, spr, cid)
        if img is not None and img.getbbox():
            if img.size != (TILE, TILE):
                img = img.resize((TILE, TILE), Image.NEAREST)
            variants.append(img)
    if not variants:
        print("!! sem tiles", scene)
        continue
    for y in range(H_TILES):
        for x in range(W_TILES):
            sheet.alpha_composite(rng.choice(variants), (x * TILE, y * TILE))
    sheet.save("%s/ground/%s.png" % (OUT, scene))

# alguns tiles avulsos para decoracao
DECOR = {
    "lava": 519, "water": 491, "fire": 1506,
}
for name, cid in DECOR.items():
    img = render_item(dat, spr, cid)
    if img and img.getbbox():
        img.save("%s/ground/deco-%s.png" % (OUT, name))

print("cenarios:", len(SCENES))
