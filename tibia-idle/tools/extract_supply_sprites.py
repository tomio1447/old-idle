#!/usr/bin/env python3
"""Extrai as sprites das potions, runas e itens iniciais que faltavam.

O items.xml do Canary usa o id do cliente, que e exatamente o indice do DAT —
foi essa descoberta que resolveu os icones errados na importacao anterior.
Aqui usamos a mesma ponte para os itens que o jogo passou a precisar:
as 12 potions, as runas de ataque/cura e o kit de Dawnport (The Scorcher,
The Chiller, Jo Staff, quiver, simple arrow...).

Uso: python3 extract_supply_sprites.py [dir_assets] [dir_game]
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from tibia_assets_860 import Dat860, Spr860, render_item_860  # noqa: E402

SRC = sys.argv[1] if len(sys.argv) > 1 else "/home/user/assets860/ex"
GAME = sys.argv[2] if len(sys.argv) > 2 else os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "..", "game")

# itens do kit inicial que ainda nao existiam no jogo (slug -> id do cliente)
EXTRAS = {
    "scorcher": 21348,
    "chiller": 21350,
    "simple-jo-staff": 50166,
    "spellbook-of-the-novice": 21400,
    "quiver": 35562,
    "simple-arrow": 21470,
}


def main():
    dat = Dat860(os.path.join(SRC, "Tibia.dat"))
    spr = Spr860(os.path.join(SRC, "Tibia.spr"))
    dados = json.load(open(os.path.join(GAME, "data", "supplies.json"),
                           encoding="utf-8"))

    alvos = {}
    for grupo in ("potions", "runas"):
        for slug, e in dados[grupo].items():
            if e.get("itemId"):
                alvos[slug] = e["itemId"]
    alvos.update(EXTRAS)

    destino = os.path.join(GAME, "assets", "item")
    os.makedirs(destino, exist_ok=True)
    ok = falta = pulou = 0
    for slug, cid in sorted(alvos.items()):
        caminho = os.path.join(destino, slug + ".png")
        img = render_item_860(dat, spr, cid)
        if img is None or not img.getbbox():
            print("  ! sem sprite:", slug, cid)
            falta += 1
            continue
        img.crop(img.getbbox()).save(caminho)
        ok += 1
    print("sprites: %d gravadas, %d sem arte, %d puladas" % (ok, falta, pulou))


if __name__ == "__main__":
    main()
