"""Gera game/js/mountedmaskdata.js — sufixos de máscara MONTADA existentes.

O extrator (extract_mounted_sheets.py) só grava <id><suf>.mounted.mask.png
quando a camada de máscara tem pixels — vários addons montados não têm área
colorível (ex.: knight-m-a1) e o arquivo não existe. Sem este manifesto o
preload/renderer pediam o arquivo e o console enchia de 404.

Uso: python tools/gen_mounted_masks.py [dir_do_game]
"""
import json
import os
import re
import sys

GAME = sys.argv[1] if len(sys.argv) > 1 else os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "..", "game")
OUT_DIR = os.path.join(GAME, "assets", "appearance", "outfit")
DEST = os.path.join(GAME, "js", "mountedmaskdata.js")

MASK = re.compile(r"^(?P<id>.+?)(?P<suf>-a[12])?\.mounted\.mask\.png$")


def main():
    outfits = {}
    for name in os.listdir(OUT_DIR):
        m = MASK.match(name)
        if not m:
            continue
        suf = m.group("suf") or ""
        outfits.setdefault(m.group("id"), []).append(suf)
    order = {"": 0, "-a1": 1, "-a2": 2}
    for sufs in outfits.values():
        sufs.sort(key=lambda s: order.get(s, 9))
    data = ("/* Gerado por tools/gen_mounted_masks.py — sufixos de máscara "
            "montada existentes por outfit. */\n"
            "window.MOUNTED_MASKS = " + json.dumps(outfits) + ";\n")
    with open(DEST, "w", encoding="utf-8") as f:
        f.write(data)
    print("outfits:", len(outfits))


if __name__ == "__main__":
    main()
