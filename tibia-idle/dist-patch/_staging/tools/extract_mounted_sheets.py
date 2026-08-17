"""
Extrai sheets de outfit com zPattern=1 (pose montada do DAT/OTC).

No client (mehah/otclient creature.cpp):
  m_numPatternZ = min(1, getNumPatternZ() - 1) quando hasMount()
  dest -= mount.displacement; draw(mount);
  dest += outfit.displacement; draw(outfit, zPattern);

O extract_appearance_sheets.py so exportava zp=0 (a pe). Sem zp=1 o
AppearanceRenderer empilhava a pose em pe sobre a montaria.

Uso: python extract_mounted_sheets.py [dir_com_Tibia.dat] [dir_do_game]
"""
import json
import os
import sys

from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from tibia_assets_860 import Dat860, Spr860, render_group_860  # noqa: E402

SRC = sys.argv[1] if len(sys.argv) > 1 else os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "..", "..", "refs", "15.x")
GAME = sys.argv[2] if len(sys.argv) > 2 else os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "..", "game")

DIRS = 4
MAX_WALK = 12
CELL = 64


def frames_de_caminhada(anim):
    if anim <= 1:
        return [0]
    return list(range(min(anim, MAX_WALK)))


def montar_sheet(spr, obj, yp, layer, zp):
    g_idle = obj.groups[0]
    g_walk = obj.groups[1] if len(obj.groups) > 1 else obj.groups[0]
    if layer >= g_idle.layers or yp >= g_idle.py:
        return None
    if zp >= g_idle.pz:
        return None

    passos = frames_de_caminhada(g_walk.anim)
    cols = 1 + len(passos)
    sheet = Image.new("RGBA", (CELL * cols, CELL * DIRS), (0, 0, 0, 0))
    vazio = True
    for d in range(DIRS):
        for col in range(cols):
            if col == 0:
                g, fr = g_idle, 0
            else:
                g, fr = g_walk, passos[col - 1]
            xp = d % max(1, g.px)
            yy = min(yp, g.py - 1)
            zz = min(zp, g.pz - 1)
            ly = min(layer, g.layers - 1)
            img = render_group_860(spr, g, frame=fr, xp=xp, yp=yy, zp=zz, layer=ly)
            if img is None:
                continue
            if img.getbbox():
                vazio = False
            sheet.alpha_composite(img, (col * CELL, d * CELL))
    return None if vazio else sheet


def caixa_das_celulas(sheets):
    x0, y0, x1, y1 = CELL, CELL, 0, 0
    achou = False
    for sh in sheets:
        if sh is None:
            continue
        cols = sh.width // CELL
        for d in range(DIRS):
            for col in range(cols):
                cel = sh.crop((col * CELL, d * CELL,
                               col * CELL + CELL, d * CELL + CELL))
                b = cel.getbbox()
                if not b:
                    continue
                achou = True
                x0 = min(x0, b[0]); y0 = min(y0, b[1])
                x1 = max(x1, b[2]); y1 = max(y1, b[3])
    if not achou:
        return None
    return (x0, y0, x1, y1)


def recortar(sheet, box):
    x0, y0, x1, y1 = box
    cw, ch = x1 - x0, y1 - y0
    cols = sheet.width // CELL
    out = Image.new("RGBA", (cw * cols, ch * DIRS), (0, 0, 0, 0))
    for d in range(DIRS):
        for col in range(cols):
            cel = sheet.crop((col * CELL + x0, d * CELL + y0,
                              col * CELL + x1, d * CELL + y1))
            out.paste(cel, (col * cw, d * ch))
    return out


def exportar_mounted(dat, spr, looktype, destino, nome, addons=True):
    obj = dat.outfit(looktype)
    if obj is None or not obj.groups:
        return None
    if obj.groups[0].pz < 2:
        return None

    camadas = []
    n_yp = min(3, obj.groups[0].py) if addons else 1
    for yp in range(n_yp):
        base = montar_sheet(spr, obj, yp, 0, 1)
        if base is None:
            continue
        mask = montar_sheet(spr, obj, yp, 1, 1)
        camadas.append(("" if yp == 0 else "-a%d" % yp, base, mask))
    if not camadas:
        return None

    box = caixa_das_celulas([b for _, b, _ in camadas])
    if box is None:
        return None

    for suf, base, mask in camadas:
        recortar(base, box).save(
            os.path.join(destino, "%s%s.mounted.base.png" % (nome, suf)),
            optimize=True)
        if mask is not None:
            recortar(mask, box).save(
                os.path.join(destino, "%s%s.mounted.mask.png" % (nome, suf)),
                optimize=True)

    x0, y0, x1, y1 = box
    return {
        "cw": x1 - x0, "ch": y1 - y0,
        "ox": x0, "oy": y0,
        "cols": camadas[0][1].width // CELL, "rows": DIRS,
    }


def main():
    dat_path = os.path.join(SRC, "Tibia.dat")
    spr_path = os.path.join(SRC, "Tibia.spr")
    print("DAT", dat_path)
    dat = Dat860(dat_path)
    spr = Spr860(spr_path)

    dir_out = os.path.join(GAME, "assets", "appearance", "outfit")
    os.makedirs(dir_out, exist_ok=True)

    js_path = os.path.join(GAME, "js", "appearancedata.js")
    js = open(js_path, encoding="utf-8").read()
    dados = json.loads(js[js.index("{"):js.rindex("}") + 1])

    ok, skip = 0, 0
    for o in dados["outfits"]:
        meta = exportar_mounted(dat, spr, o["looktype"], dir_out, o["id"])
        if not meta:
            o.pop("mounted", None)
            skip += 1
            continue
        o["mounted"] = meta
        ok += 1
        if ok % 25 == 0:
            print("mounted", ok, "...")

    header = (
        "/* Gerado por tools/extract_appearance_sheets.py\n"
        " * Spritesheet por visual: coluna = frame (0 parado),\n"
        " * linha = direcao (0 N, 1 E, 2 S, 3 O). A celula e sempre\n"
        " * cw x ch e nasce num canvas de 64x64 na posicao ox/oy —\n"
        " * o renderizador precisa desses valores para ancorar a\n"
        " * sprite no SQM certo.\n"
        " * Sexo corrigido: Canary type 0 = female (f), type 1 = male (m).\n"
        " * Campo mounted = geometria do sheet .mounted (zPattern=1 OTC). */\n"
    )
    with open(js_path, "w", encoding="utf-8") as f:
        f.write(header)
        f.write("window.APPEARANCES = " + json.dumps(dados, separators=(",", ":")) + ";\n")

    json.dump(dados, open(os.path.join(GAME, "data", "appearances.json"), "w"),
              separators=(",", ":"))
    print("mounted sheets:", ok, "sem pz:", skip)


if __name__ == "__main__":
    main()
