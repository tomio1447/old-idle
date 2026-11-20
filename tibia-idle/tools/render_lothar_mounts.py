"""Gera os sheets das montarias que faltam no Lothar, do client 15.x.

Mesmo layout do extract_appearance_sheets.py (8.60): coluna = frame
(idle + fases de andar), linha = direcao (N,E,S,W). Camada 0 vira
`<id>.base.png`; camada 1 (regioes coloriveis) vira `<id>.mask.png` —
montarias sem camada 1 saem sem mask, igual as existentes.

Uso: python tools/render_lothar_mounts.py
"""
import os
import sys

from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from render_15x_sprites import Sprites15x  # noqa: E402

GAME = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "game")
DIR_MNT = os.path.join(GAME, "assets", "appearance", "mount")

# (id, nome, looktype oficial — tibia.gg outfits-by-id)
MOUNTS = [
    ("alpha-demonosaur", "Alpha Demonosaur", 1827),
    ("battlefrazzle", "Battlefrazzle", 1882),
    ("reliable-ram", "Reliable Ram", 1936),
    ("jaracal", "Jaracal", 1962),
]


def union_bbox(imgs):
    box = None
    for img in imgs:
        if img is None:
            continue
        b = img.getbbox()
        if not b:
            continue
        box = b if box is None else (
            min(box[0], b[0]), min(box[1], b[1]),
            max(box[2], b[2]), max(box[3], b[3]))
    return box


def build_sheet(s, looktype, layer):
    """linhas = 4 direcoes; colunas = idle(frame0 grupo0) + fases do grupo1."""
    rows = []
    frames = []
    for direction in range(4):
        cells = []
        idle = s.render_outfit(looktype, direction=direction, phase=0,
                               group=0, layer=layer)
        cells.append(idle)
        g = s.appearances.outfit(looktype).groups
        phases = g[1].phases if len(g) > 1 else 0
        for ph in range(phases):
            cells.append(s.render_outfit(looktype, direction=direction,
                                         phase=ph, group=1, layer=layer))
        rows.append(cells)
        frames.extend(cells)
    if all(c is None for row in rows for c in row):
        return None
    size = next(c.size for row in rows for c in row if c is not None)
    box = union_bbox([c for row in rows for c in row])
    if not box:
        return None
    cw, ch = box[2] - box[0], box[3] - box[1]
    cols = max(len(r) for r in rows)
    sheet = Image.new("RGBA", (cols * cw, 4 * ch))
    for y, row in enumerate(rows):
        for x, cell in enumerate(row):
            if cell is None:
                continue
            if cell.size != size:
                cell = cell.resize(size)
            sheet.paste(cell.crop(box), (x * cw, y * ch))
    return sheet, cols, cw, ch, box


def main():
    s = Sprites15x()
    meta = []
    for mid, nome, looktype in MOUNTS:
        o = s.appearances.outfit(looktype)
        if not o:
            print(f"[{mid}] looktype {looktype} ausente no dat — pulando")
            continue
        base = build_sheet(s, looktype, 0)
        if not base:
            print(f"[{mid}] sem sprites — pulando")
            continue
        sheet, cols, cw, ch, box = base
        sheet.save(os.path.join(DIR_MNT, mid + ".base.png"))
        mask = build_sheet(s, looktype, 1)
        if mask:
            mask[0].save(os.path.join(DIR_MNT, mid + ".mask.png"))
        meta.append((mid, nome, looktype, cols, cw, ch, box, bool(mask)))
        print(f"[{mid}] {sheet.size} cols={cols} cell={cw}x{ch} mask={bool(mask)}")
    for m in meta:
        print(m)


if __name__ == "__main__":
    main()
