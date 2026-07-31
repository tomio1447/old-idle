"""
extract_amazon_loot_items.py — extrai os sprites de "girlish hair decoration"
(id 11443) e "red apple" (id 3585) do client 8.60 para game/assets/item/.

"protective charm" (11444) ja existe como mat-11444.png (material de
imbuement, tools/import_monsters + patch_imbuement.js) — faltavam so esses
dois: nenhum dos dois e material de imbuement, entao nunca tinham entrado
no catalogo. O restante (catalogo + loot dos monstros) e feito em
js/patch_amazon.js, carregado em runtime (gamedata.js e gerado, nao editar
os dados na mao).

Uso:
    python3 extract_amazon_loot_items.py [dir_do_client_860]
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from tibia_assets_860 import Dat860, Spr860, render_item_860  # noqa: E402
from PIL import Image  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.normpath(os.path.join(HERE, "..", "game"))
SRC = sys.argv[1] if len(sys.argv) > 1 else os.path.join(
    HERE, "..", "..", "15.x")

ITENS = {
    11443: "girlish-hair-decoration",
    3585: "red-apple",
}

print("lendo client 8.60 em", SRC)
dat = Dat860(os.path.join(SRC, "Tibia.dat"))
spr = Spr860(os.path.join(SRC, "Tibia.spr"))

OUT = os.path.join(GAME, "assets", "item")
os.makedirs(OUT, exist_ok=True)

for cid, slug in ITENS.items():
    img = render_item_860(dat, spr, cid)
    if img is None or not img.getbbox():
        print("sem sprite para", cid, slug)
        continue
    if img.size != (32, 32):
        base = Image.new("RGBA", (32, 32), (0, 0, 0, 0))
        base.alpha_composite(img, (0, 0))
        img = base
    img.save(os.path.join(OUT, slug + ".png"))
    print("extraido", slug, "<-", cid)
