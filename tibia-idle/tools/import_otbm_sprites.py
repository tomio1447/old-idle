"""
import_otbm_sprites.py — varre um (ou mais) mapa .otbm salvo pelo editor
(game/rme/) e extrai para o jogo os sprites que ainda nao existem em
game/assets/tiles/<id>.png.

Sem isso a hunt instanciada da otbm (otbmhunt.js) desenharia buracos nos
tiles importados de ids novos. O recorte segue a convencao de
extract_tiles.py (PNG 32x32 ancordado no canto superior esquerdo).

Tambem regenera game/rme/data/known_tiles.js (a "verificar sprites" do
editor compara contra a lista nova) e completa js/tiledata.js com os nomes
oficiais do items.xml do Canary quando faltam.

Uso:
    TIBIA860=/home/user/work/15x860_repo/extracted \
        python3 import_otbm_sprites.py game/maps/amazoncamp_venore.otbm [...]
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

NODE_START = 0xFE
NODE_END = 0xFF
ESCAPE = 0xFD


class Rdr:
    def __init__(self, data):
        self.d = data
        self.i = 0

    def peek(self):
        return self.d[self.i] if self.i < len(self.d) else None

    def take(self):
        b = self.d[self.i]
        self.i += 1
        return b

    def u8(self):
        b = self.take()
        if b == ESCAPE:
            b = self.take()
        return b

    def u16(self):
        return self.u8() | (self.u8() << 8)

    def u32(self):
        return (self.u8() | (self.u8() << 8) | (self.u8() << 16) |
                (self.u8() << 24))

    def skip_str(self):
        n = self.u16()
        for _ in range(n):
            self.u8()

    def attr(self, aid, ctx):
        if aid in (1, 2, 7, 11, 13):
            self.skip_str()
        elif aid in (3, 12, 16, 22, 23):
            self.u32()
        elif aid in (4, 5, 9):
            v = self.u16()
            if aid == 9 and ctx.get("cell") is not None and \
                    not ctx["cell"][0]:
                ctx["cell"][0] = v
                ctx["ids"].add(v)
        elif aid == 8:
            self.u16(); self.u16(); self.u8()
        elif aid in (14, 15):
            self.u8()
        else:
            raise ValueError("atributo OTBM desconhecido %d" % aid)


def ids_do_otbm(path):
    """Devolve (ids_usados, area_z7): todos os item ids do arquivo."""
    data = open(path, "rb").read()
    if data[:4] != b"OTBM":
        raise ValueError(path + ": magic OTBM ausente")
    r = Rdr(data)
    r.i = 4
    r.u32()  # versao
    ctx = {"ids": set(), "cell": [0]}
    ids = set()

    def parse(area_z):
        typ = r.u8()
        base = (0, 0, 7)
        if typ == 1:
            base = (r.u16(), r.u16(), r.u8())
        elif typ in (2, 14):
            r.u8(); r.u8()
        elif typ == 3:
            item = r.u16()
            if area_z[2] == 7:
                ids.add(item)
        my_z = base if typ == 1 else area_z
        cell_state = {"ids": ids, "cell": [0]}
        while True:
            nxt = r.peek()
            if nxt is None:
                return
            if nxt == NODE_END:
                r.take()
                return
            if nxt == NODE_START:
                r.take()
                if typ == 3:
                    parse(area_z)   # item aninhado (container): pega id tambem
                else:
                    parse(my_z)
                continue
            r.take()
            r.attr(nxt, cell_state if typ in (2, 14) and area_z[2] == 7
                   else {"ids": set(), "cell": [None]})

    if r.peek() != NODE_START:
        raise ValueError(path + ": sem no raiz")
    r.take()
    parse((0, 0, 7))
    return ids


def recorte32(img):
    if img.size == (32, 32):
        return img
    base = Image.new("RGBA", (32, 32), (0, 0, 0, 0))
    base.alpha_composite(img, (0, 0))
    return base


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if not args:
        print(__doc__)
        return 1
    usados = set()
    for path in args:
        try:
            ids = ids_do_otbm(path)
        except Exception as e:
            print("erro lendo %s: %s" % (path, e))
            continue
        print("%s: %d ids usados" % (os.path.basename(path), len(ids)))
        usados |= ids

    existentes = {int(n[:-4]) for n in os.listdir(TILES_DIR)
                  if n[:-4].isdigit() and n.endswith(".png")}
    falta = sorted(usados - existentes)
    print("faltam sprites: %d -> %s" %
          (len(falta), falta if len(falta) <= 40 else "..."))
    if not falta:
        criar = []
    else:
        dat = Dat860(os.path.join(SRC, "Tibia.dat"))
        spr = Spr860(os.path.join(SRC, "Tibia.spr"))
        criar = []
        for cid in falta:
            img = render_item_860(dat, spr, cid)
            if img is None or not img.getbbox():
                print("  %d: sem sprite no client (N/A), pulando" % cid)
                continue
            recorte32(img).save(os.path.join(TILES_DIR, "%d.png" % cid))
            criar.append(cid)
        print("extraidos %d sprites para %s" % (len(criar), TILES_DIR))

    # tiledata.js: completa nomes oficiais para os ids novos
    tiledata = os.path.join(GAME, "js", "tiledata.js")
    corpo = open(tiledata, encoding="utf-8").read()
    NOMES = {}
    if os.path.exists(CANARY_XML):
        _x = open(CANARY_XML, encoding="iso-8859-1").read()
        for _m in re.finditer(r'<item id="(\d+)"[^>]*name="([^"]+)"', _x):
            NOMES.setdefault(int(_m.group(1)), _m.group(2).strip())
    add = []
    for cid in criar:
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

    # known_tiles.js atualizado
    known = sorted(existentes | set(criar))
    kt = "/* known_tiles.js — GERADO (build_rme_catalog.py /\n"
    kt += " * import_otbm_sprites.py): ids presentes em game/assets/tiles. */\n"
    kt += "window.RME_KNOWN_TILES = " + json.dumps(
        known, separators=(",", ":")) + ";\n"
    with open(os.path.join(GAME, "rme", "data", "known_tiles.js"), "w") as f:
        f.write(kt)
    print("rme/data/known_tiles.js: %d ids" % len(known))
    return 0


if __name__ == "__main__":
    sys.exit(main())
