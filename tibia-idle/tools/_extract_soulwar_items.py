"""Extract Soul War loot item PNGs by client id into game/assets/item/."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from tibia_assets_860 import Dat860, Spr860, render_item_860

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.normpath(os.path.join(HERE, "..", "game"))
OUT = os.path.join(GAME, "assets", "item")
SRC = os.environ.get("TIBIA860", os.path.join(HERE, "..", "..", "refs", "15.x"))

ITEMS = {
  "figurine-of-malice": 34018,
  "figurine-of-cruelty": 34019,
  "figurine-of-hatred": 34020,
  "figurine-of-greed": 34021,
  "figurine-of-spite": 33952,
  "figurine-of-megalomania": 33953,
  "megalomania-s-skull": 33925,
  "megalomania-s-essence": 33928,
  "spites-spirit": 33926,
  "spite-s-spirit": 33926,
  "malices-spine": 33921,
  "malice-s-spine": 33921,
  "malices-horn": 33920,
  "malice-s-horn": 33920,
  "greed-s-arm": 33924,
  "vial-of-hatred": 33927,
  "bag-you-desire": 34109,
  "white-gem": 32769,
  "the-skull-of-a-beast": 34075,
  "roots": 33938,
  "crawler-s-essence": 33982,
  "mould-heart": 34141,
  "mould-robe": 34148,
  "spectral-horseshoe": 34072,
  "spectral-horse-tack": 34074,
  "bracelet-of-strengthening": 34076,
}

os.makedirs(OUT, exist_ok=True)
dat = Dat860(os.path.join(SRC, "Tibia.dat"))
spr = Spr860(os.path.join(SRC, "Tibia.spr"))
ok = fail = 0
for slug, cid in ITEMS.items():
  path = os.path.join(OUT, slug + ".png")
  img = render_item_860(dat, spr, cid)
  if img is None or not img.getbbox():
    print("FAIL", slug, cid)
    fail += 1
    continue
  img.crop(img.getbbox()).save(path)
  print("OK", slug, cid, "->", path)
  ok += 1
print("done ok=%d fail=%d" % (ok, fail))
