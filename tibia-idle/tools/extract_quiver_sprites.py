#!/usr/bin/env python3
"""Extrai as sprites reais das municoes e quivers do DAT 8.60.

O commit anterior usou um placeholder repetido: todas as flechas tinham o
mesmo PNG de 297 bytes e todos os quivers o mesmo de 877. Aqui cada item sai
com a arte propria, usando o id do items.xml (que e o client id e indexa o
DAT direto).

Uso: python3 extract_quiver_sprites.py [dir_assets] [dir_game]
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from tibia_assets_860 import Dat860, Spr860, render_item_860  # noqa: E402

SRC = sys.argv[1] if len(sys.argv) > 1 else "/home/user/assets860/ex"
GAME = sys.argv[2] if len(sys.argv) > 2 else os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "..", "game")


def main():
    dat = Dat860(os.path.join(SRC, "Tibia.dat"))
    spr = Spr860(os.path.join(SRC, "Tibia.spr"))
    dados = json.load(open(os.path.join(GAME, "data", "quivers.json"),
                           encoding="utf-8"))

    destino = os.path.join(GAME, "assets", "item")
    os.makedirs(destino, exist_ok=True)
    ok = falta = 0
    vistos = {}
    for grupo in ("ammo", "quivers"):
        for slug, e in sorted(dados[grupo].items()):
            cid = e.get("itemId")
            if not cid:
                continue
            img = render_item_860(dat, spr, cid)
            if img is None or not img.getbbox():
                print("  ! sem arte:", slug, cid)
                falta += 1
                continue
            img = img.crop(img.getbbox())
            img.save(os.path.join(destino, slug + ".png"))
            vistos[slug] = img.tobytes()
            ok += 1

    # conferencia: se muitas sprites sairem identicas e sinal de que o id
    # esta errado e todas cairam no mesmo objeto do DAT
    unicas = len(set(vistos.values()))
    print("sprites: %d gravadas (%d artes distintas), %d sem arte"
          % (ok, unicas, falta))
    if ok and unicas < ok * 0.6:
        print("  ATENCAO: muitas sprites repetidas, conferir os client ids")


if __name__ == "__main__":
    main()
