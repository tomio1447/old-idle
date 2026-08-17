#!/usr/bin/env python3
"""Extrai tiras de frames de PILHA (count) para itens stackable do DAT 15.x.

No Canary/OTClient, itens Stackable com pattern X/Y (tipicamente 4x2 = 8)
NAO animam no tempo: o frame e escolhido pelo count (subtype 0..7).

    assets/item/<slug>.png         frame do count=1 (compativel com <img>)
    assets/item/<slug>_stack.png   tira horizontal com sf frames
    metadado no item: sf / aw / ah

Itens com af herdado por engano (anim DAT == 1) perdem o af — a tira
_anim.png errada deixava moedas/pérolas ciclando como GIF.

Uso:
  python extract_stack_sprites.py
  python extract_stack_sprites.py gold-coin assassin-star
"""
from __future__ import annotations

import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

from PIL import Image  # noqa: E402
from tibia_assets_860 import Dat860, Spr860, render_group_860  # noqa: E402

GAME = os.path.normpath(os.path.join(HERE, "..", "game"))
DEFAULT_DAT = os.path.normpath(os.path.join(
    HERE, "..", "..", "refs", "15.x", "Tibia.dat"))
DEFAULT_SPR = os.path.normpath(os.path.join(
    HERE, "..", "..", "refs", "15.x", "Tibia.spr"))


def load_js_json(path, var_name):
    text = open(path, encoding="utf-8").read()
    m = re.search(r"window\.%s\s*=\s*(\{.*\})\s*;?\s*$" % var_name, text, re.S)
    if not m:
        raise SystemExit("nao achei window.%s em %s" % (var_name, path))
    return json.loads(m.group(1))


def save_js_json(path, var_name, data, header, sort_keys=False):
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(header)
        fh.write("window.%s = " % var_name)
        json.dump(data, fh, ensure_ascii=False, separators=(",", ":"),
                  sort_keys=sort_keys)
        fh.write(";\n")


def common_box(frames):
    box = None
    for fr in frames:
        b = fr.getbbox()
        if not b:
            continue
        box = b if box is None else (
            min(box[0], b[0]), min(box[1], b[1]),
            max(box[2], b[2]), max(box[3], b[3]))
    return box


def stack_frames(spr, group):
    """Ordem Canary subtype 0..N-1: yp * px + xp (frame anim = 0)."""
    out = []
    for yp in range(group.py):
        for xp in range(group.px):
            img = render_group_860(spr, group, frame=0, xp=xp, yp=yp)
            if img is None:
                continue
            out.append(img)
    return out


def build_strip(frames):
    """Tira com bbox uniao (alinha frames); PNG estatico = bbox do frame 0."""
    box = common_box(frames)
    if not box:
        return None, None, None
    # frame 0 no tamanho nativo (moeda unica 9x9 etc.) — usado por <img>
    b0 = frames[0].getbbox()
    static = frames[0].crop(b0) if b0 else frames[0].crop(box)
    cropped = [f.crop(box) for f in frames]
    aw = max(f.width for f in cropped)
    ah = max(f.height for f in cropped)
    strip = Image.new("RGBA", (aw * len(cropped), ah), (0, 0, 0, 0))
    for i, fr in enumerate(cropped):
        strip.alpha_composite(fr, (i * aw + (aw - fr.width) // 2,
                                   (ah - fr.height) // 2))
    return strip, static, (aw, ah)


def iter_targets(gamedata, weapondata, only):
    seen = set()
    sources = [
        ("gamedata", gamedata["items"], "cid"),
        ("weapondata", weapondata["items"], "id"),
    ]
    for _src, items, id_key in sources:
        for slug, it in items.items():
            if only and slug not in only:
                continue
            if slug in seen:
                continue
            cid = it.get(id_key) or it.get("cid") or it.get("id")
            if not cid:
                continue
            seen.add(slug)
            yield slug, it, int(cid), items


def main():
    only = set(sys.argv[1:]) if len(sys.argv) > 1 else None
    dat_path = os.environ.get("TIBIA_DAT", DEFAULT_DAT)
    spr_path = os.environ.get("TIBIA_SPR", DEFAULT_SPR)
    if not os.path.exists(dat_path) or not os.path.exists(spr_path):
        raise SystemExit("DAT/SPR nao encontrados: %s / %s" % (dat_path, spr_path))

    gamedata_js = os.path.join(GAME, "js", "gamedata.js")
    weapondata_js = os.path.join(GAME, "js", "weapondata.js")
    weapons_json = os.path.join(GAME, "data", "weapons.json")

    gamedata = load_js_json(gamedata_js, "GAMEDATA")
    weapondata = load_js_json(weapondata_js, "WEAPONDATA")

    print("lendo", dat_path)
    dat = Dat860(dat_path)
    spr = Spr860(spr_path)
    out_dir = os.path.join(GAME, "assets", "item")
    os.makedirs(out_dir, exist_ok=True)

    ok = skip = cleared_af = 0
    for slug, it, cid, store in iter_targets(gamedata, weapondata, only):
        obj = dat.item(cid)
        if not obj or "Stackable" not in obj.flags or not obj.groups:
            skip += 1
            continue
        g = obj.groups[0]
        patterns = max(1, g.px) * max(1, g.py)
        if patterns < 2:
            # stackable sem look por count — so anima se o DAT tiver fases
            skip += 1
            continue

        frames = stack_frames(spr, g)
        if len(frames) < 2:
            skip += 1
            continue
        # so mantem frames visualmente distintos
        if len({f.tobytes() for f in frames}) < 2:
            skip += 1
            continue

        strip, first, size = build_strip(frames)
        if strip is None:
            skip += 1
            continue
        aw, ah = size
        first.save(os.path.join(out_dir, slug + ".png"))
        strip.save(os.path.join(out_dir, slug + "_stack.png"))

        # metadado: sf = frames de pilha; NAO e af (tempo)
        it["sf"] = len(frames)
        it["aw"] = aw
        it["ah"] = ah
        # se o DAT nao anima no tempo, remove af herdado por engano
        if g.anim <= 1 and it.get("af"):
            it.pop("af", None)
            cleared_af += 1
            anim_path = os.path.join(out_dir, slug + "_anim.png")
            if os.path.exists(anim_path):
                os.remove(anim_path)

        # espelha em gamedata quando o item tambem mora la
        gd_it = gamedata["items"].get(slug)
        if gd_it is not None and gd_it is not it:
            gd_it["sf"] = it["sf"]
            gd_it["aw"] = aw
            gd_it["ah"] = ah
            if g.anim <= 1:
                gd_it.pop("af", None)

        # weapondata.json paralelo
        wj = weapondata["items"].get(slug)
        if wj is not None and wj is not it:
            wj["sf"] = it["sf"]
            wj["aw"] = aw
            wj["ah"] = ah
            if g.anim <= 1:
                wj.pop("af", None)

        ok += 1
        print("  %s cid=%d sf=%d %dx%d" % (slug, cid, len(frames), aw, ah))

    # gamedata: preservar ordem das chaves (catalogo historico).
    save_js_json(gamedata_js, "GAMEDATA", gamedata, "", sort_keys=False)
    save_js_json(
        weapondata_js, "WEAPONDATA", weapondata,
        "/* Gerado por tools/import_weapons.py + extract_stack_sprites.py.\n"
        " * sf = frames de count (Canary subtype), nao animacao temporal. */\n",
        sort_keys=True)
    with open(weapons_json, "w", encoding="utf-8") as fh:
        json.dump(weapondata, fh, ensure_ascii=False, indent=1, sort_keys=True)

    print("stack strips: %d gravadas, %d ignoradas, af limpos: %d"
          % (ok, skip, cleared_af))


if __name__ == "__main__":
    main()
