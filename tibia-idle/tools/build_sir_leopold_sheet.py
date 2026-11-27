"""
build_sir_leopold_sheet.py — monta o sheet do Sir Leopold (miniboss da
Book World, update 15.10) a partir do appearances.dat 15.x convertido.

Oficial (tibia.gg): looktype 1847 (mesma outfit do Crusader/Sir Leonard),
addons 3, cores [head 78, body 19, legs 94, feet 95]. A outfit só tem 3
poses de addon (py 0..2) — o py é clampado em 2 como no marksman.

Layout igual ao pipeline dos Raubritters: 9 colunas (idle + 8 walk) x 4
direções, caixa compartilhada na camada base, máscara colorida com
compose_outfit.

Uso: python tools/build_sir_leopold_sheet.py [--check]
"""
import os
import sys

from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from render_15x_sprites import Sprites15x            # noqa: E402
from tibia_assets import OUTFIT_COLORS, bgr_to_rgb  # noqa: E402
from tibia_assets_860 import compose_outfit         # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.normpath(os.path.join(HERE, "..", "game"))

CELL = 64
DIRS = 4
MAX_WALK = 12

SLUG = "sir-leopold"
LOOKTYPE = 1847
COLORS = [78, 19, 94, 95]  # [head, body, legs, feet] — oficiais
ADDON = 3


def _cell(spr, obj, group, layer, direction, phase, py):
    g = obj.groups[min(group, len(obj.groups) - 1)]
    py = min(py, g.pattern_height - 1)
    sid = g.sprite_at(layer=layer, px=direction, py=py, phase=phase)
    return spr.sprite(sid)


def _montar(spr, obj, layer, py):
    """Grid CELL x CELL: col 0 = idle (grupo 0), cols 1..N = walk (grupo 1)."""
    if not obj or len(obj.groups) < 2:
        return None, 0
    g_walk = obj.groups[1]
    passos = min(int(g_walk.phases), MAX_WALK)
    cols = 1 + passos
    sheet = Image.new("RGBA", (CELL * cols, CELL * DIRS), (0, 0, 0, 0))
    for d in range(DIRS):
        idle = _cell(spr, obj, 0, layer, d, 0, py)
        if idle is not None:
            if idle.size != (CELL, CELL):
                idle = idle.resize((CELL, CELL))
            sheet.alpha_composite(idle, (0, d * CELL))
        for p in range(passos):
            img = _cell(spr, obj, 1, layer, d, p, py)
            if img is None:
                continue
            if img.size != (CELL, CELL):
                img = img.resize((CELL, CELL))
            sheet.alpha_composite(img, ((1 + p) * CELL, d * CELL))
    return sheet, cols


def render(spr):
    obj = spr.appearances.outfit(LOOKTYPE)
    if not obj or len(obj.groups) < 2:
        return None, None
    base, cols = _montar(spr, obj, 0, ADDON)
    mask, _ = _montar(spr, obj, 1, ADDON)
    if base is None:
        return None, None
    # Convenção Book World: células fixas 64x64 (MOBSHEETS cw/ch 64) — sem
    # crop: a pose fica onde o DAT a desenha, como nos demais Inkborn.
    rgb = [bgr_to_rgb(OUTFIT_COLORS[c % len(OUTFIT_COLORS)]) for c in COLORS]
    out = Image.new("RGBA", (CELL * cols, CELL * DIRS), (0, 0, 0, 0))
    for d in range(DIRS):
        for c in range(cols):
            r = (c * CELL, d * CELL, (c + 1) * CELL, (d + 1) * CELL)
            cel = base.crop(r)
            mcel = mask.crop(r) if mask is not None else None
            cel = compose_outfit(cel, mcel, *rgb)
            out.paste(cel, (c * CELL, d * CELL))
    return out, (CELL, CELL, cols)


def main():
    check = "--check" in sys.argv
    spr = Sprites15x()
    novo, geom = render(spr)
    if novo is None:
        print("%s: falhou (outfit %d sem frames)" % (SLUG, LOOKTYPE))
        return 1
    path = os.path.join(GAME, "assets", "mob", SLUG + ".png")
    cw, ch, cols = geom
    if check:
        print("%s: geraria -> %dx%d (%d cols) %s" %
              (SLUG, novo.width, novo.height, cols, path))
        return 0
    novo.save(path)
    print("%s: sheet -> %dx%d cells %dx%d (%d cols) em %s" %
          (SLUG, novo.width, novo.height, cw, ch, cols, path))
    return 0


if __name__ == "__main__":
    sys.exit(main())
