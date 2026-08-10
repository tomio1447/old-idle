"""Gera a âncora DAT dos spritesheets de monstros.

Os PNGs em assets/mob são recortes apertados. Para posicioná-los no SQM do
OTClient é necessário preservar onde esse recorte ficava no canvas original
32×32/64×64 do DAT. Sem ox/oy o renderer centralizava o recorte e a criatura
não coincidia com efeitos calculados na célula lógica.

Saída: game/js/creatureanchordata.js
Uso: TIBIA860=/caminho/com/Tibia.dat python3 build_creature_anchor_data.py
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from tibia_assets_860 import Dat860, Spr860, render_group_860  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.normpath(os.path.join(HERE, "..", "game"))
SRC = os.environ.get("TIBIA860", "/home/user/work/15x860_repo/extracted")
MAX_WALK = 12


def source_geometry(spr, obj):
    idle = obj.groups[0]
    moving = next((g for g in obj.groups if g.group_type == 1),
                  obj.groups[1] if len(obj.groups) > 1 else idle)
    images = []
    for direction in range(4):
        images.append(render_group_860(
            spr, idle, frame=0, xp=direction % max(1, idle.px), yp=0, layer=0))
        for frame in range(min(MAX_WALK, max(1, moving.anim))):
            images.append(render_group_860(
                spr, moving, frame=frame,
                xp=direction % max(1, moving.px), yp=0, layer=0))
    boxes = [image.getbbox() for image in images if image is not None and image.getbbox()]
    if not boxes:
        return None
    return {
        "sw": max(image.width for image in images if image is not None),
        "sh": max(image.height for image in images if image is not None),
        "x0": min(box[0] for box in boxes),
        "y0": min(box[1] for box in boxes),
        "x1": max(box[2] for box in boxes),
        "y1": max(box[3] for box in boxes),
    }


def main():
    dat = Dat860(os.path.join(SRC, "Tibia.dat"))
    spr = Spr860(os.path.join(SRC, "Tibia.spr"))
    monsters = json.load(open(os.path.join(GAME, "data", "canarymonsters.json")))
    sheets = json.load(open(os.path.join(GAME, "data", "mobsheets.json")))
    by_looktype = {}
    anchors = {}

    for slug, meta in sheets.items():
        monster = monsters.get(slug) or {}
        looktype = monster.get("looktype")
        geometry = None
        if looktype:
            if looktype not in by_looktype:
                obj = dat.outfit(looktype)
                by_looktype[looktype] = source_geometry(spr, obj) if obj and obj.groups else None
            geometry = by_looktype[looktype]

        cw, ch = meta["cw"], meta["ch"]
        if geometry:
            bw = geometry["x1"] - geometry["x0"]
            bh = geometry["y1"] - geometry["y0"]
            # Sheets customizados (addons/cores) podem ser alguns pixels
            # maiores/menores que a camada base. Mantém o centro do recorte
            # original dentro do canvas DAT.
            ox = geometry["x0"] + (bw - cw) / 2
            oy = geometry["y0"] + (bh - ch) / 2
            sw, sh = max(geometry["sw"], cw), max(geometry["sh"], ch)
            ox = max(0, min(sw - cw, ox))
            oy = max(0, min(sh - ch, oy))
        else:
            # Fallback que reproduz o alinhamento anterior para arte sem DAT.
            sw, sh = max(32, cw), max(32, ch)
            ox = sw - 16 - cw / 2
            oy = sh - ch
        anchors[slug] = {
            "sw": sw, "sh": sh,
            "ox": round(ox, 2), "oy": round(oy, 2),
        }

    output = os.path.join(GAME, "js", "creatureanchordata.js")
    with open(output, "w", encoding="utf-8") as fh:
        fh.write("/* Gerado por tools/build_creature_anchor_data.py.\n"
                 " * Canvas DAT e offset do recorte por monstro. */\n")
        fh.write("window.CREATURE_ANCHORS = " + json.dumps(
            anchors, separators=(",", ":")) + ";\n")
    print("âncoras:", len(anchors), "| looktypes lidos:", len(by_looktype))
    return 0


if __name__ == "__main__":
    sys.exit(main())
