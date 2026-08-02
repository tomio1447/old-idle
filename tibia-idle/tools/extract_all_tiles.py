"""
extract_all_tiles.py — Extrai TODOS os itens do client 8.60 (.dat/.spr)
para PNGs em game/assets/tiles/ na resolução real (32x32, 64x64, 64x32, etc.).

Itens que já existem em assets/tiles/ NÃO são sobrescritos (a menos que
se use --force). Isso garante que sprites customizadas (exercise dummies,
monstros, etc.) sejam preservadas.

Também regenera game/rme/data/known_tiles.js e game/js/tiledata.js.

Uso:
    TIBIA860=/home/user/work/15x860_repo/extracted python3 extract_all_tiles.py
    TIBIA860=/home/user/work/15x860_repo/extracted python3 extract_all_tiles.py --force
    TIBIA860=/home/user/work/15x860_repo/extracted python3 extract_all_tiles.py --ids 28559 31208
"""
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from PIL import Image  # noqa: E402
from tibia_assets_860 import Dat860, Spr860, render_item_860  # noqa: E402

SRC = os.environ.get("TIBIA860", "/home/user/work/15x860_repo/extracted")
HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.normpath(os.path.join(HERE, "..", "game"))
TILES_DIR = os.path.join(GAME, "assets", "tiles")
CANARY_XML = os.path.join(HERE, "data", "canary-items.xml")

FORCE = "--force" in sys.argv
ONLY_IDS = []
if "--ids" in sys.argv:
    i = sys.argv.index("--ids")
    ONLY_IDS = [int(x) for x in sys.argv[i+1:] if x.isdigit()]

os.makedirs(TILES_DIR, exist_ok=True)

print("lendo", SRC)
dat = Dat860(os.path.join(SRC, "Tibia.dat"))
spr = Spr860(os.path.join(SRC, "Tibia.spr"))

NOMES = {}
if os.path.exists(CANARY_XML):
    _x = open(CANARY_XML, encoding="iso-8859-1").read()
    for _m in re.finditer(r'<item id="(\d+)"[^>]*name="([^"]+)"', _x):
        NOMES.setdefault(int(_m.group(1)), _m.group(2).strip())

existentes = {int(n[:-4]) for n in os.listdir(TILES_DIR)
              if n[:-4].isdigit() and n.endswith(".png")}

criados = 0
pulados = 0
sem_sprite = 0

ids_to_process = ONLY_IDS if ONLY_IDS else range(100, dat.item_count + 1)

for cid in ids_to_process:
    path = os.path.join(TILES_DIR, "%d.png" % cid)
    # Pula se já existe e não é --force
    if cid in existentes and not FORCE:
        pulados += 1
        continue
    img = render_item_860(dat, spr, cid)
    if img is None or not img.getbbox():
        sem_sprite += 1
        continue
    # Salva na resolução real (não corta para 32x32!)
    img.save(path)
    criados += 1
    if criados % 2000 == 0:
        print("  %d extraídos..." % criados)

print("extraídos: %d | pulados (já existem): %d | sem sprite: %d" %
      (criados, pulados, sem_sprite))

# known_tiles.js atualizado
known = sorted(existentes | set(range(100, dat.item_count + 1)) - {0})
# Re-ler diretório para pegar os novos
known = sorted(int(n[:-4]) for n in os.listdir(TILES_DIR)
               if n[:-4].isdigit() and n.endswith(".png"))
kt = "/* known_tiles.js — GERADO por extract_all_tiles.py / build_rme_catalog.py /\n"
kt += " * import_otbm_sprites.py): ids presentes em game/assets/tiles. */\n"
kt += "window.RME_KNOWN_TILES = " + json.dumps(known, separators=(",", ":")) + ";\n"
with open(os.path.join(GAME, "rme", "data", "known_tiles.js"), "w") as f:
    f.write(kt)
print("rme/data/known_tiles.js: %d ids" % len(known))

# tiledata.js: completa nomes oficiais para os ids novos
tiledata = os.path.join(GAME, "js", "tiledata.js")
corpo = open(tiledata, encoding="utf-8").read()
add = []
for cid in known:
    if ('"%d"' % cid) in corpo:
        continue
    nome = NOMES.get(cid, "item %d" % cid).replace('"', '\\"')
    add.append('  "%d": {"n": "%s"},' % (cid, nome))
if add:
    corpo = corpo.rstrip()
    assert corpo.endswith("};")
    corpo = corpo[:-2] + "\n" + "\n".join(add) + "\n};\n"
    open(tiledata, "w", encoding="utf-8").write(corpo)
    print("js/tiledata.js: +%d nomes" % len(add))
