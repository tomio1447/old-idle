"""Monta sheets 9x4 (64x64/celula) dos 5 membros do Adventurer Group a
partir dos GIFs oficiais da TibiaWiki — mesma técnica de sir-leonard.png
/ moonstone-miner.png (sprite oficial ausente do DAT convertido; direcao
do GIF replicada nas 4 linhas)."""
from PIL import Image

JOBS = [
    ("Fiona_Firstdream",   "fiona-firstdream"),
    ("Grendel_Greenlunch", "grendel-greenlunch"),
    ("Nigel_Neverguess",   "nigel-neverguess"),
    ("Percy_Peacetinker",  "percy-peacetinker"),
    ("Yorik_Youngbook",    "yorik-youngbook"),
]
CELL = 64
for name, slug in JOBS:
    gif = Image.open(f"tmp_ag/{name}.gif")
    frames = []
    for i in range(gif.n_frames):
        gif.seek(i)
        frames.append(gif.convert("RGBA"))
    # col 0 = idle (frame 0); cols 1..8 = ciclo dos 8 frames (walk/anim)
    cols = 9
    cells = [frames[0]] + frames[:8]
    sheet = Image.new("RGBA", (CELL * cols, CELL * 4), (0, 0, 0, 0))
    for row in range(4):
        for col in range(cols):
            sheet.paste(cells[col], (col * CELL, row * CELL))
    out = f"game/assets/mob/{slug}.png"
    sheet.save(out, optimize=True)
    print(f"{slug}: {sheet.size} <- {name} ({gif.n_frames} frames)")
