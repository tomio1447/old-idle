"""build_adventurer_group_sheets.py — remonta os sheets 9x4 (64x64/celula)
dos 5 membros do Adventurer Group a partir dos GIFs oficiais da TibiaWiki.

Os atlases lzma das outfits oficiais (staticdata 15.20: yorik 2712→268,
percy 2713→137, grendel 2714→144, fiona 2715→1681, nigel 2716→1837) nao
estao no cache de refs — o DAT convertido renderiza placeholders
(cavaleiro cinza). Mesma tecnica de sir-leonard.png / moonstone-miner.png:
a direcao do GIF e replicada nas 4 linhas; col 0 = idle, cols 1..8 =
ciclo dos 8 frames.

Uso (de tibia-idle/):  python tools/build_adventurer_group_sheets.py <dir_gifs>
"""
import sys
from pathlib import Path
from PIL import Image

JOBS = [
    ("Fiona_Firstdream",   "fiona-firstdream"),
    ("Grendel_Greenlunch", "grendel-greenlunch"),
    ("Nigel_Neverguess",   "nigel-neverguess"),
    ("Percy_Peacetinker",  "percy-peacetinker"),
    ("Yorik_Youngbook",    "yorik-youngbook"),
]
CELL = 64
GAME = Path(__file__).resolve().parent.parent / "game"


def main(gif_dir):
    for name, slug in JOBS:
        gif = Image.open(Path(gif_dir) / f"{name}.gif")
        frames = [gif.copy().convert("RGBA") for i in range(gif.n_frames)
                  if not gif.seek(i) or True]
        cols = 9
        cells = [frames[0]] + frames[:8]
        sheet = Image.new("RGBA", (CELL * cols, CELL * 4), (0, 0, 0, 0))
        for row in range(4):
            for col in range(cols):
                sheet.paste(cells[col], (col * CELL, row * CELL))
        out = GAME / "assets" / "mob" / f"{slug}.png"
        sheet.save(out, optimize=True)
        print(f"{slug}: {sheet.size} <- {name} ({gif.n_frames} frames)")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "tmp_ag")
