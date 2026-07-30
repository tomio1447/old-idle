"""
Importa os tiles de cenario (grounds, walls e decorativos) do client
8.60-format (repo Levi999x/15.x-with-8.60, zip Tibia_spr_dat.zip) para o
jogo como PNGs 32x32 em game/assets/tiles/<id>.png + js/tiledata.js com os
nomes oficiais do items.xml do Canary.

O cenario usa ids CLASSICOS (estaveis entre versoes — grass continua 106),
confirmados contra tools/data/canary-items.xml. Arte = pixel oficial, nada
desenhado na mao.

Uso:
    TIBIA860=/home/user/work/15x860/extracted python3 extract_tiles.py [saida]
"""
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from PIL import Image  # noqa: E402
from tibia_assets_860 import Dat860, Spr860, render_item_860  # noqa: E402

SRC = os.environ.get("TIBIA860", "/home/user/work/15x860/extracted")
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(HERE, "..", "game", "assets", "tiles"))
CANARY_XML = os.path.join(HERE, "data", "canary-items.xml")

os.makedirs(OUT, exist_ok=True)

# ---------------------------------------------------------------- catalogo
# grounds classicos
GROUNDS = [101, 102, 103, 104, 105, 106, 107, 110, 150,
           351, 352, 353, 354, 355, 356,
           405, 406, 407, 409, 410, 412, 413, 416, 417, 419,
           424, 425, 426, 431,
           465, 467, 519, 530, 531, 532, 533,
           670, 671, 684, 685,
           724, 725, 726, 727,
           965, 966, 967, 968, 969, 970]
# agua/lava/fogo de cenario
FLUIDOS = [490, 491, 492, 493, 494, 495, 496, 497, 1506, 6352, 8716, 622,
           4612, 4613, 4614]
# walls/estrutura (escolhidos a olho depois da montagem de candidatos;
# blocos COMPLETOS, porque paredes de borda do client renderizam vazias
# fora do compositor do OTClient)
WALLS = [478, 479, 480, 481, 482, 483,          # sandstone wall (cidade)
         5647, 5684, 5686,                      # stone/dirt wall (esgoto)
         2152, 2153, 2188,                      # pilares stone/marble/sand
         1557, 1561, 1565, 1566,                # archways de pedra
         1542,                                  # bamboo palisade
         1646, 1648, 1664, 1667, 1678, 1680,    # portoes dourados
         5102, 5103]                            # barras (cela/grade esgoto)
# decorativos de cidade + esgoto
DECO = [3614, 9587, 3681, 3682, 2981, 2519, 119, 116, 2358, 2339, 694,
        2334, 2449, 3502, 3501, 2967, 2965, 2914, 2050, 6986, 1425, 428,
        2025, 2026, 2027, 2031, 1219, 1220, 1225, 1226, 1488, 1489, 1490,
        433, 855, 856, 1958, 5033, 5034, 5045,
        435, 6, 3913, 4254, 4271, 4276, 4280, 4285, 4298, 4317,
        3114, 3132, 1444, 1445, 1446, 1771, 3688, 1066]

TODOS = sorted(set(GROUNDS + FLUIDOS + WALLS + DECO))

# grupos 2x2 (muros tipo "bloco"): o compositor do 8.60 ancora a peca
# principal no canto INFERIOR DIREITO do canvas (ver render_group_860) —
# recortamos so ela para o PNG 32x32.
CROP = {478: (32, 32, 64, 64)}

print("lendo", SRC)
dat = Dat860(os.path.join(SRC, "Tibia.dat"))
spr = Spr860(os.path.join(SRC, "Tibia.spr"))

NOMES = {}
if os.path.exists(CANARY_XML):
    _x = open(CANARY_XML, encoding="iso-8859-1").read()
    for _m in re.finditer(r'<item id="(\d+)"[^>]*name="([^"]+)"', _x):
        NOMES.setdefault(int(_m.group(1)), _m.group(2).strip())

ok = []
falhou = []
for cid in TODOS:
    img = render_item_860(dat, spr, cid)
    if img is None or not img.getbbox():
        falhou.append(cid)
        continue
    img = img.crop(CROP[cid]) if cid in CROP else img
    # tile cheio: cenário de chão ocupa o quadrado; itens maiores sao
    # cortados no canto superior esquerdo (o Tibia ancora em cima)
    if img.size != (32, 32):
        base = Image.new("RGBA", (32, 32), (0, 0, 0, 0))
        base.alpha_composite(img, (0, 0))
        img = base
    img.save(os.path.join(OUT, "%d.png" % cid))
    ok.append(cid)

print("exportados %d tiles para %s" % (len(ok), OUT))
if falhou:
    print("sem sprite:", ", ".join(map(str, falhou)))

# tiledata.js: nomes oficiais para docs/tooltips
linhas = ["/* tiledata.js — nomes oficiais dos tiles importados do client 8.60",
          " * (extract_tiles.py; nomes do items.xml do Canary). Usado por",
          " * tilemap.js para legendas e tooltips. */",
          '"use strict";',
          "window.TILEDATA = {"]
for cid in ok:
    n = NOMES.get(cid, "item %d" % cid).replace('"', '\\"')
    linhas.append('  "%d": {"n": "%s"},' % (cid, n))
linhas.append("};")
with open(os.path.join(HERE, "..", "game", "js", "tiledata.js"), "w") as f:
    f.write("\n".join(linhas) + "\n")
print("js/tiledata.js com %d entradas" % len(ok))

# montagem de candidatos para revisao visual (nao vai para o repo)
try:
    cols = 12
    rows = (len(ok) + cols - 1) // cols
    sheet = Image.new("RGBA", (cols * 34, rows * 40), (24, 24, 24, 255))
    from PIL import ImageDraw
    d = ImageDraw.Draw(sheet)
    for i, cid in enumerate(ok):
        im = Image.open(os.path.join(OUT, "%d.png" % cid))
        x, y = (i % cols) * 34, (i // cols) * 40
        sheet.alpha_composite(im, (x, y))
        d.text((x + 1, y + 32), str(cid), fill=(255, 255, 160, 255))
    sheet.save("/home/user/work/tiles_montagem.png")
    print("montagem em /home/user/work/tiles_montagem.png")
except Exception as e:
    print("montagem falhou:", e)
