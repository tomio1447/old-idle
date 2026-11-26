"""
colorize_raubritters.py — recoloriza os sheets dos Raubritters (Stag
Bastion / Court Warlock waves) com as cores oficiais do staticdata 15.x.

Os sheets `assets/mob/raubritter-{skirmisher,chastener,marksman}.png` foram
gerados do appearances.dat renderizando SÓ a camada base (layer 0) — que é
grayscale por design. A camada 1 é a máscara (vermelho=body, verde=legs,
amarelo=head, azul=feet) que o client oficial recoloriza com as cores da
criatura. Resultado: cavalos/cavaleiros cinzas.

Cores oficiais (refs/gameclient-main/assets/staticdata-*.dat, race ->
outfit+colors):
  raubritter skirmisher race 2750 -> outfit 1900, [94, 19, 3, 19],  addon 0
  raubritter marksman   race 2751 -> outfit 1901, [94, 19, 118, 2], addon 2
  raubritter chastener  race 2752 -> outfit 1902, [94, 19, 21, 78], addon 0
(marksman: staticdata diz addon 2, mas a outfit 1901 só tem py=1 — sem
pose de addon no arquivo; o sheet mantém py=0.)

Layout idêntico ao pipeline original: 9 colunas (idle + 8 walk) x 4
direções, caixa compartilhada calculada na camada base — a geometria
(cw/ch dos MOBSHEETS e CREATURE_ANCHORS) não muda.

Uso: python tools/colorize_raubritters.py [--check]
     --check  só reporta se o PNG atual difere do recolorizado (não grava)
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

# slug, looktype, [head, body, legs, feet] (índices da paleta oficial)
MOBS = [
    ("raubritter-skirmisher", 1900, [94, 19, 3, 19]),
    ("raubritter-marksman",   1901, [94, 19, 118, 2]),
    ("raubritter-chastener",  1902, [94, 19, 21, 78]),
]


def _cell(spr, looktype, group, layer, direction, phase):
    return spr.render_outfit(looktype, direction=direction, phase=phase,
                             group=group, layer=layer)


def _montar(spr, looktype, layer):
    """Grid CELL x CELL: col 0 = idle (grupo 0), cols 1..N = walk (grupo 1)."""
    obj = spr.appearances.outfit(looktype)
    if not obj or len(obj.groups) < 2:
        return None, 0
    g_walk = obj.groups[1]
    passos = min(int(g_walk.phases), MAX_WALK)
    cols = 1 + passos
    sheet = Image.new("RGBA", (CELL * cols, CELL * DIRS), (0, 0, 0, 0))
    for d in range(DIRS):
        idle = _cell(spr, looktype, 0, layer, d, 0)
        if idle is not None:
            if idle.size != (CELL, CELL):
                idle = idle.resize((CELL, CELL))
            sheet.alpha_composite(idle, (0, d * CELL))
        for p in range(passos):
            img = _cell(spr, looktype, 1, layer, d, p)
            if img is None:
                continue
            if img.size != (CELL, CELL):
                img = img.resize((CELL, CELL))
            sheet.alpha_composite(img, ((1 + p) * CELL, d * CELL))
    return sheet, cols


def _caixa(base):
    """Bbox compartilhada de todas as células (coords dentro da célula)."""
    cols = base.width // CELL
    x0, y0, x1, y1 = CELL, CELL, 0, 0
    achou = False
    for d in range(DIRS):
        for c in range(cols):
            b = base.crop((c * CELL, d * CELL, (c + 1) * CELL,
                           (d + 1) * CELL)).getbbox()
            if not b:
                continue
            achou = True
            x0, y0 = min(x0, b[0]), min(y0, b[1])
            x1, y1 = max(x1, b[2]), max(y1, b[3])
    return (x0, y0, x1, y1) if achou else None


def recolor(spr, looktype, colors):
    base, cols = _montar(spr, looktype, 0)
    mask, _ = _montar(spr, looktype, 1)
    if base is None:
        return None, None
    box = _caixa(base)
    if not box:
        return None, None
    x0, y0, x1, y1 = box
    cw, ch = x1 - x0, y1 - y0
    rgb = [bgr_to_rgb(OUTFIT_COLORS[c % len(OUTFIT_COLORS)]) for c in colors]
    out = Image.new("RGBA", (cw * cols, ch * DIRS), (0, 0, 0, 0))
    for d in range(DIRS):
        for c in range(cols):
            r = (c * CELL + x0, d * CELL + y0, c * CELL + x1, d * CELL + y1)
            cel = base.crop(r)
            mcel = mask.crop(r) if mask is not None else None
            cel = compose_outfit(cel, mcel, *rgb)
            out.paste(cel, (c * cw, d * ch))
    return out, (cw, ch, cols)


def main():
    check = "--check" in sys.argv
    spr = Sprites15x()
    for slug, lt, colors in MOBS:
        novo, geom = recolor(spr, lt, colors)
        if novo is None:
            print("%s: falhou (outfit %d sem frames)" % (slug, lt))
            continue
        path = os.path.join(GAME, "assets", "mob", slug + ".png")
        cw, ch, cols = geom
        velho = Image.open(path).convert("RGBA") if os.path.exists(path) else None
        if velho is not None and velho.size == novo.size and \
                list(velho.getdata()) == list(novo.getdata()):
            print("%s: já colorido (inalterado)" % slug)
            continue
        if check:
            print("%s: mudaria -> %dx%d (%d cols) %s" %
                  (slug, novo.width, novo.height, cols, path))
        else:
            novo.save(path)
            print("%s: recolorido -> %dx%d cells %dx%d (%d cols)" %
                  (slug, cw, ch, novo.width, novo.height, cols))


if __name__ == "__main__":
    main()
