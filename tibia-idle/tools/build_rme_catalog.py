"""
Gera o catalogo de itens do editor de mapas (game/rme/) a partir do client
8.60-format (repo Levi999x/15.x-with-8.60, zip Tibia_spr_dat.zip):

  game/rme/data/catalog.js     -> todos os itens do .dat com nome oficial
       (items.xml do Canary quando existe, senao "item N" documentado como
       N/A), flags de andavel/bloqueio lidas do proprio .dat
       (numeracao OTCv8 do thingtype.cpp).
       Agora tambem inclui dimensoes (tw, th) em tiles para cada item.
  game/rme/data/atlas_<N>.png  -> folhas com o sprite 32x32 de cada item
       (recorte superior-esquerdo — usado apenas como fallback quando
       o PNG externo nao carrega; a fonte principal e assets/tiles/).
  game/rme/data/known_tiles.js -> ids que ja existem em game/assets/tiles
       (a ferramenta "verificar sprites" compara contra isso; regenerado
       tambem por import_otbm_sprites.py).
  game/js/tileflags.js         -> walk/block por id para o RUNTIME do jogo
       (colisao das hunts instanciadas de .otbm).

Uso:
    TIBIA860=/home/user/work/15x860_repo/extracted python3 build_rme_catalog.py
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
RME_DATA = os.path.join(GAME, "rme", "data")
TILES_DIR = os.path.join(GAME, "assets", "tiles")
CANARY_XML = os.path.join(HERE, "data", "canary-items.xml")

COLS = 128          # largura do atlas em celulas 32x32
ROWS_PER_PAGE = 64  # 128x64 = 8192 itens por folha

os.makedirs(RME_DATA, exist_ok=True)

print("lendo", SRC)
dat = Dat860(os.path.join(SRC, "Tibia.dat"))
spr = Spr860(os.path.join(SRC, "Tibia.spr"))

NOMES = {}
if os.path.exists(CANARY_XML):
    _x = open(CANARY_XML, encoding="iso-8859-1").read()
    for _m in re.finditer(r'<item id="(\d+)"[^>]*name="([^"]+)"', _x):
        NOMES.setdefault(int(_m.group(1)), _m.group(2).strip())

def recorte32(img):
    """Mesma convencao dos tiles do jogo: imagem final 32x32 ancordada no
    canto superior esquerdo."""
    if img.size == (32, 32):
        return img
    base = Image.new("RGBA", (32, 32), (0, 0, 0, 0))
    base.alpha_composite(img, (0, 0))
    return base

entries = []   # [id, walk, block, ground, page, idx, tw, th]
flags_rt = {}  # id -> [walk, block] (runtime)
page = Image.new("RGBA", (COLS * 32, ROWS_PER_PAGE * 32), (0, 0, 0, 0))
page_i = 0
idx = 0
sem_sprite = 0

for cid in range(100, dat.item_count + 1):
    obj = dat.item(cid)
    if obj is None:
        continue
    f = obj.flags
    if "Ground" in f:
        w = 0 if "NotWalkable" in f or not obj.props.get("speed") else 1
        b = 0 if w else 1
        g = 1
    else:
        w = 0
        b = 1 if "NotWalkable" in f else 0
        g = 0
    # Dimensoes em tiles (1x1, 2x2, 2x1, 1x2, etc.)
    tw = obj.groups[0].width if obj.groups else 1
    th = obj.groups[0].height if obj.groups else 1
    img = render_item_860(dat, spr, cid)
    if img is None or not img.getbbox():
        sem_sprite += 1
        continue                      # item de dat sem pixel: fora da paleta
    # registra flags de runtime mesmo para quem nao entra na paleta? nao:
    # sem sprite o jogo nao desenha, entao pinta o id invalido importado
    if w or b:
        flags_rt[cid] = [w, b]
    cx = idx % COLS
    cy = (idx // COLS) % ROWS_PER_PAGE
    if idx and idx % (COLS * ROWS_PER_PAGE) == 0:
        out = os.path.join(RME_DATA, "atlas_%d.png" % page_i)
        page.save(out)
        print("atlas_%d.png (%d itens)" % (page_i, COLS * ROWS_PER_PAGE))
        page_i += 1
        idx = 0
        cx = 0
        cy = 0
        page = Image.new("RGBA", (COLS * 32, ROWS_PER_PAGE * 32), (0, 0, 0, 0))
    page.paste(recorte32(img), (cx * 32, cy * 32), recorte32(img))
    entries.append([cid, w, b, g, page_i, idx, tw, th])
    idx += 1

if idx:
    out = os.path.join(RME_DATA, "atlas_%d.png" % page_i)
    page.save(out)
    print("atlas_%d.png (%d itens)" % (page_i, idx))
    page_i += 1

# catalog.js — nomes so quando oficiais (default "item N" no editor)
names = {cid: NOMES[cid] for cid, *_ in entries if cid in NOMES}
catalog = {
    "pages": page_i,
    "cols": COLS,
    "rowsPerPage": ROWS_PER_PAGE,
    "entries": entries,
    "names": names,
}
with open(os.path.join(RME_DATA, "catalog.js"), "w") as f:
    f.write("/* catalog.js — GERADO por tools/build_rme_catalog.py.\n")
    f.write(" * Paleta completa do .dat 8.60 para o editor de mapas:\n")
    f.write(" * entries = [id, walk, block, ground, page, idx, tw, th];\n")
    f.write(" * tw/th = largura/altura em tiles (1x1, 2x2, etc.).\n")
    f.write(" * nomes do items.xml do Canary quando existem (senao 'item N').\n")
    f.write(" * flags walk/block vem do proprio .dat (thingtype.cpp OTCv8). */\n")
    f.write("window.RME_CATALOG = ")
    f.write(json.dumps(catalog, separators=(",", ":")))
    f.write(";\n")

# tileflags.js — colisao de runtime (ids com Ground ou NotWalkable)
fl = "/* tileflags.js — GERADO por tools/build_rme_catalog.py.\n"
fl += " * [walk, block] por item id, lidos do .dat 8.60 (thingtype.cpp).\n"
fl += " * Colisao das hunts .otbm: celula bloqueada quando o chao nao e\n"
fl += " * andavel ou algum item empilhado bloqueia. */\n"
fl += '"use strict";\nwindow.TILEFLAGS = '
fl += json.dumps({str(k): v for k, v in flags_rt.items()},
                 separators=(",", ":")) + ";\n"
with open(os.path.join(GAME, "js", "tileflags.js"), "w") as f:
    f.write(fl)

# known_tiles.js — o que o jogo JA desenha (assets/tiles/<id>.png)
known = sorted(int(n[:-4]) for n in os.listdir(TILES_DIR)
               if n[:-4].isdigit() and n.endswith(".png"))
kt = "/* known_tiles.js — GERADO (build_rme_catalog.py /\n"
kt += " * import_otbm_sprites.py): ids presentes em game/assets/tiles.\n"
kt += " * A 'verificar sprites' do editor compara os ids do mapa com isso. */\n"
kt += "window.RME_KNOWN_TILES = " + json.dumps(known,
                                             separators=(",", ":")) + ";\n"
with open(os.path.join(RME_DATA, "known_tiles.js"), "w") as f:
    f.write(kt)

print("catalogo: %d itens com sprite em %d folha(s); %d sem sprite (N/A); "
      "%d ids com flag de colisao; %d tiles ja no jogo"
      % (len(entries), page_i, sem_sprite, len(flags_rt), len(known)))
