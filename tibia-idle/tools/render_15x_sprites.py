"""Renderizador de sprites do client 15.x (appearances.dat + catalogos lzma).

Os assets ficam em refs/gameclient-main/assets:
  * appearances-*.dat       -> protobuf: outfit/object id -> sprite ids
  * catalog-content.json    -> faixas de sprite id por arquivo .bmp.lzma
  * sprites-*.bmp.lzma      -> atlas BMP (144 sprites de 32px, 12x12)

Layout do arquivo lzma: header proprio de 32 bytes + stream LZMA1 raw
(decodificado com FILTERS preset 9|EXTREME).

Uso interno: chamado por render_lothar_assets.py (montarias + itens de troca).
"""
import io
import json
import lzma
import os
import sys
import glob

from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from appearances import Appearances  # noqa: E402

ASSETS = os.environ.get("TIBIA15X", os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "..", "..",
    "refs", "gameclient-main", "assets"))

_CELL = 32
_PER_FILE = 144  # sprites por catalogo
_COLS = 12       # celulas por linha no atlas


class Sprites15x:
    def __init__(self, assets_dir=ASSETS):
        self.dir = assets_dir
        dat = glob.glob(os.path.join(assets_dir, "appearances-*.dat"))[0]
        self.appearances = Appearances(dat)
        catalog = json.load(open(os.path.join(assets_dir, "catalog-content.json")))
        self.ranges = sorted(
            ((e["firstspriteid"], e["lastspriteid"], e["file"])
             for e in catalog if e.get("type") == "sprite"),
            key=lambda r: r[0])
        self._atlases = {}

    def _atlas(self, sprite_id):
        for first, last, fname in self.ranges:
            if first <= sprite_id <= last:
                if fname not in self._atlases:
                    raw = open(os.path.join(self.dir, fname), "rb").read()
                    # header proprio de 32 bytes + LZMA1 "alone" (13B) -> raw em 45
                    data = lzma.LZMADecompressor(
                        lzma.FORMAT_RAW,
                        filters=[{"id": lzma.FILTER_LZMA1,
                                  "preset": 9 | lzma.PRESET_EXTREME}]
                    ).decompress(raw[45:])
                    atlas = Image.open(io.BytesIO(data)).convert("RGBA")
                    # A grade do atlas nao e fixa: sprites de 32/64/128px
                    # convivem; a celula e atlas.width / ceil(sqrt(count)).
                    import math
                    count = last - first + 1
                    cols = max(1, math.ceil(math.sqrt(count)))
                    cell = atlas.width // cols
                    self._atlases[fname] = (atlas, cols, cell)
                atlas, cols, cell = self._atlases[fname]
                return atlas, cols, cell, sprite_id - first
        return None, 0, 0, 0

    def sprite(self, sprite_id):
        if not sprite_id:
            return None
        atlas, cols, cell, idx = self._atlas(int(sprite_id))
        if atlas is None or not cell:
            return None
        col, row = idx % cols, idx // cols
        return atlas.crop((col * cell, row * cell,
                           (col + 1) * cell, (row + 1) * cell))

    def render_outfit(self, looktype, direction=2, phase=0, group=0, layer=-1):
        """Outfits/montarias no 15.x: pattern_width = n de direcoes e cada
        sprite ja e a criatura inteira (celula do bounding square).
        direction: 0=N 1=E 2=S 3=W. layer=-1 empilha todas as camadas."""
        o = self.appearances.outfit(looktype)
        if not o or not o.groups:
            return None
        g = o.groups[min(group, len(o.groups) - 1)]
        layers = range(g.layers) if layer < 0 else [layer]
        out = None
        for lay in layers:
            sid = g.sprite_at(layer=lay, px=direction, phase=phase)
            img = self.sprite(sid)
            if img is None:
                continue
            if out is None:
                out = Image.new("RGBA", img.size)
            if img.size != out.size:
                img = img.resize(out.size)
            out.alpha_composite(img)
        return out

    def render_object(self, cid):
        """Icone de item: todas as celulas da camada 0."""
        o = self.appearances.object(cid)
        if not o or not o.groups:
            return None
        g = o.groups[0]
        w, h = g.pattern_width, g.pattern_height
        canvas = Image.new("RGBA", (w * _CELL, h * _CELL))
        for py in range(h):
            for px in range(w):
                sid = g.sprite_at(layer=0, px=px, py=py)
                img = self.sprite(sid)
                if img:
                    canvas.alpha_composite(
                        img, ((w - 1 - px) * _CELL, (h - 1 - py) * _CELL))
        return canvas


if __name__ == "__main__":
    s = Sprites15x()
    print(s.appearances)
