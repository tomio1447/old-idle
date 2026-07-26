"""Extrai outfits dos NPCs da cidade e tiles de cenario urbano."""
import os
from PIL import Image
from render import load, render_outfit, render_item

OUT = "/home/user/tibia-idle/game/assets"
os.makedirs(OUT + "/npc", exist_ok=True)
dat, spr = load()

# NPCs da cidade: (slug, looktype, cores head/body/legs/feet)
NPCS = {
    "shopkeeper":  (128, (95, 116, 116, 95)),   # cidadao — loja de equipamentos
    "magicshop":   (130, (0, 86, 86, 0)),       # mago — runas e magias
    "banker":      (132, (114, 95, 95, 114)),   # nobre — banco
    "priest":      (133, (0, 0, 0, 0)),         # summoner — templo
    "trainer":     (131, (86, 86, 86, 86)),     # knight — treinador
    "blacksmith":  (134, (78, 68, 58, 76)),     # warrior — ferreiro
    "innkeeper":   (136, (114, 86, 86, 0)),     # cidada — estalagem
    "captain":     (129, (95, 39, 39, 114)),    # hunter — viagens
}

for name, (lt, colors) in NPCS.items():
    for tag, direction in (("s", 2), ("w", 3), ("n", 0), ("e", 1)):
        img = render_outfit(dat, spr, lt, direction=direction, colors=colors)
        if img is None or not img.getbbox():
            continue
        img.crop(img.getbbox()).save("%s/npc/%s_%s.png" % (OUT, name, tag))

# tiles do chao da cidade (pavimento de Thais)
CITY_TILES = [724, 725, 726, 727]
TILE = 32
W_TILES, H_TILES = 20, 10
import random
rng = random.Random(7)
variants = []
for cid in CITY_TILES:
    im = render_item(dat, spr, cid)
    if im is not None and im.getbbox():
        if im.size != (TILE, TILE):
            im = im.resize((TILE, TILE), Image.NEAREST)
        variants.append(im)
sheet = Image.new("RGBA", (W_TILES * TILE, H_TILES * TILE), (20, 20, 20, 255))
for y in range(H_TILES):
    for x in range(W_TILES):
        sheet.alpha_composite(rng.choice(variants), (x * TILE, y * TILE))
sheet.save("%s/ground/city.png" % OUT)

# objetos decorativos da cidade
DECOR = {
    "depot": 2589, "sign": 1440, "torch": 2050, "barrel": 1770,
    "table": 1616, "chair": 1650, "vase": 2874, "flowerpot": 2749,
}
for name, cid in DECOR.items():
    im = render_item(dat, spr, cid)
    if im is not None and im.getbbox():
        im.crop(im.getbbox()).save("%s/npc/deco-%s.png" % (OUT, name))

print("NPCs:", len(NPCS), "| tiles cidade ok")
