"""Extrai os sprites de construcao da cidade: paredes, telhados, portas, moveis."""
import os
from PIL import Image
from render import load, render_item

OUT = "/home/user/tibia-idle/game/assets/city"
os.makedirs(OUT, exist_ok=True)
dat, spr = load()

# nome -> client id do Tibia 7.4
TILES = {
    # paredes de tijolo (corpo das casas)
    "wall-brick-v":   1025,   # vertical
    "wall-brick-h":   1026,   # horizontal
    "wall-brick-c":   1027,   # canto
    "wall-brick-p":   1030,
    # paredes claras (marmore) para templo/banco
    "wall-marble-v":  1111,
    "wall-marble-h":  1112,
    "wall-marble-c":  1113,
    # janelas
    "window-brick":   1265,
    "window-wood":    1263,
    "window-marble":  1269,
    # portas
    "door-v":         1209,
    "door-h":         1210,
    "door-open-v":    1212,
    "door-open-h":    1213,
    # telhados
    "roof-red-a":     925,
    "roof-red-b":     926,
    "roof-red-c":     927,
    "roof-red-d":     928,
    "roof-red-e":     929,
    "roof-red-f":     936,
    "roof-red-g":     937,
    "roof-red-h":     938,
    "roof-wood-a":    946,
    "roof-wood-b":    947,
    "roof-wood-c":    948,
    # colunas
    "pillar":         1514,
    "pillar-marble":  1515,
    # moveis e pontos de interesse
    "depot":          2594,   # depot chest (com placa DEPOT)
    "locker":         2589,
    "mailbox":        2593,
    "altar":          2606,   # altar do templo
    "altar-b":        2607,
    "altar-stone":    1642,
    "fountain-a":     1360,
    "fountain-b":     1361,
    "fountain-c":     1362,
    "fountain-d":     1363,
    "table":          1602,
    "counter":        1617,
    "chair":          1650,
    "barrel":         1770,
    "crate":          1739,
    "box":            1738,
    "bed":            1754,
    # natureza e decoracao
    "tree-fir":       2700,
    "tree-magic":     2699,
    "bush":           2767,
    "bush-berry":     2769,
    "flowers":        108,
    "statue-hero":    1444,
    "statue-angel":   1448,
    "statue-dwarf":   1449,
    "sign":           1429,
    "signpost":       1440,
    "torch-wall":     2051,
    "lamp":           2045,
    "stairs":         1385,
}

saved = 0
missing = []
for name, cid in TILES.items():
    img = render_item(dat, spr, cid)
    if img is None or not img.getbbox():
        missing.append(name)
        continue
    img.crop(img.getbbox()).save("%s/%s.png" % (OUT, name))
    saved += 1

print("tiles de cidade salvos:", saved)
if missing:
    print("nao encontrados:", missing)

# ---- tiles de chao individuais (32x32), para o mapa da cidade
GROUND = {
    "floor-grass":  102,   # grama verde
    "floor-dirt":   103,   # terra
    "floor-stone":  431,   # piso de pedra
    "floor-pave":   724,   # pavimento de rua
    "floor-marble": 965,   # marmore claro
    "floor-wood":   405,   # assoalho de madeira
    "floor-sand":   104,   # areia
}
for name, cid in GROUND.items():
    img = render_item(dat, spr, cid)
    if img is None:
        continue
    if img.size != (32, 32):
        img = img.resize((32, 32), Image.NEAREST)
    img.save("%s/%s.png" % (OUT, name))
print("tiles de chao:", len(GROUND))
