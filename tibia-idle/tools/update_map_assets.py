"""
update_map_assets.py — Atualiza assets de UM ou mais mapas .otbm sem tocar
nos tiles dos demais mapas.

Puxa SOMENTE os ids usados nos .otbm passados:
  * assets/tiles/<id>.png              (sprite principal)
  * assets/tiles/<id>_anim.png         (strip se for animado)
  * assets/tiles/<id>_pattern.png      (strip X/Y se for pattern)
  * js/tileflags.js                    merge das flags de colisão
  * js/tilepatterndata.js              merge dos patterns
  * js/tileanimdata.js                 merge das animações
  * rme/data/known_tiles.js            merge dos ids conhecidos

NÃO regenera o RME_CATALOG completo nem os atlas do editor.

Uso:
    $env:TIBIA860="C:\caminho\do\860" ; python update_map_assets.py ..\game\maps\elfyalahar.otbm
    python update_map_assets.py ..\game\maps\elfyalahar.otbm ..\game\beta-maps\falcons.otbm
"""
import json
import os
import re
import sys

from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from tibia_assets_860 import Dat860, Spr860, render_item_860  # noqa: E402

SRC = os.environ.get("TIBIA860", "/home/user/work/15x860_repo/extracted")
HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.normpath(os.path.join(HERE, "..", "game"))
TILES_DIR = os.path.join(GAME, "assets", "tiles")
JS_DIR = os.path.join(GAME, "js")
RME_DATA = os.path.join(GAME, "rme", "data")

from import_otbm_sprites import ids_do_otbm  # noqa: E402


def read_js_file(path):
    """Lê um arquivo JS tentando utf-8/iso-8859-1/latin1."""
    if not os.path.exists(path):
        return None
    for enc in ("utf-8", "iso-8859-1", "latin1"):
        try:
            return open(path, "r", encoding=enc, errors="replace").read()
        except Exception:
            continue
    return None


def read_js_dict(path, var_name, default=None):
    """Lê um arquivo JS que declara window.XXX = {...};"""
    src = read_js_file(path)
    if src is None:
        return default or {}
    m = re.search(r'(?:window|const)\s*' + var_name + r'\s*=\s*(\{.*?\});', src, re.S)
    if not m:
        return default or {}
    try:
        return eval(m.group(1))
    except Exception:
        return default or {}


def read_js_list(path, var_name, default=None):
    """Lê um arquivo JS que declara window.XXX = [...];"""
    src = read_js_file(path)
    if src is None:
        return default or []
    m = re.search(r'(?:window|const)\s*' + var_name + r'\s*=\s*(\[.*?\]);', src, re.S)
    if not m:
        return default or []
    try:
        return eval(m.group(1))
    except Exception:
        return default or []


def write_js_obj(path, var_name, doc, data, compact=True):
    """Sobrescreve o arquivo JS com window.XXX = <json>;"""
    out = "/* %s\n * Gerado por tools/update_map_assets.py.\n */\n" % doc
    out += '"use strict";\nwindow.%s = ' % var_name
    out += json.dumps(data, separators=(",", ":") if compact else None)
    out += ";\n"
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(out)


def recorte32(img):
    """Padroniza sprite para 32x32 ancorado no canto superior esquerdo."""
    if img.size == (32, 32):
        return img
    if img.size[0] > 32 or img.size[1] > 32:
        return img
    base = Image.new("RGBA", (32, 32), (0, 0, 0, 0))
    base.alpha_composite(img, (0, 0))
    return base


def ensure_sprite(cid, dat, spr):
    """Gera assets/tiles/<cid>.png se ainda não existir."""
    dest = os.path.join(TILES_DIR, "%d.png" % cid)
    if os.path.exists(dest):
        return False
    obj = dat.item(cid)
    if obj is None or not obj.groups:
        return False
    g = obj.groups[0]
    img = render_item_860(dat, spr, cid, frame=0, xp=0, yp=0)
    if img is None:
        return False
    img = recorte32(img)
    os.makedirs(TILES_DIR, exist_ok=True)
    img.save(dest, optimize=True)
    return True


def ensure_pattern(cid, dat, spr):
    """Gera assets/tiles/<cid>_pattern.png se houver pattern X/Y."""
    obj = dat.item(cid)
    if obj is None or not obj.groups:
        return None
    g = obj.groups[0]
    positional = bool({"Ground", "GroundBorder", "OnBottom"} & obj.flags)
    if not positional or (g.px <= 1 and g.py <= 1):
        return None
    dest = os.path.join(TILES_DIR, "%d_pattern.png" % cid)
    frames = max(1, g.anim)
    aw, ah = g.width * 32, g.height * 32
    total = frames * g.py * g.px
    strip = Image.new("RGBA", (aw * total, ah), (0, 0, 0, 0))
    visible = False
    index = 0
    for frame in range(frames):
        for yp in range(g.py):
            for xp in range(g.px):
                img = render_item_860(dat, spr, cid, frame=frame, xp=xp, yp=yp)
                if img is not None:
                    strip.alpha_composite(img, (index * aw, 0))
                    visible = visible or bool(img.getbbox())
                index += 1
    if not visible:
        return None
    os.makedirs(TILES_DIR, exist_ok=True)
    strip.save(dest, optimize=True)
    return {
        "px": g.px, "py": g.py, "af": frames,
        "aw": aw, "ah": ah,
        "durations": list(g.durations[:frames]) if g.durations else [120] * frames,
        "duration": sum(g.durations[:frames]) if g.durations else 120 * frames,
    }


def ensure_anim(cid, dat, spr):
    """Gera assets/tiles/<cid>_anim.png se houver 2+ frames."""
    obj = dat.item(cid)
    if obj is None or not obj.groups:
        return None
    g = obj.groups[0]
    af = g.anim
    if not af or af < 2:
        return None
    frames = []
    for f in range(af):
        img = render_item_860(dat, spr, cid, frame=f, xp=0, yp=0)
        if img is None:
            continue
        bb = img.getbbox()
        if bb:
            frames.append(img.crop(bb))
    if not frames:
        return None
    aw = max(fr.width for fr in frames)
    ah = max(fr.height for fr in frames)
    strip = Image.new("RGBA", (aw * len(frames), ah), (0, 0, 0, 0))
    for i, fr in enumerate(frames):
        strip.alpha_composite(fr, (i * aw + (aw - fr.width) // 2, (ah - fr.height) // 2))
    dest = os.path.join(TILES_DIR, "%d_anim.png" % cid)
    strip.save(dest, optimize=True)
    return {"af": len(frames), "aw": aw, "ah": ah}


def flag_for_item(obj):
    """[walk, block, tw?, th?] a partir das flags do .dat 8.60."""
    if obj is None or not obj.groups:
        return None
    is_ground = bool(obj.flags & {"Ground"})
    not_walk = bool(obj.flags & {"NotWalkable"})
    on_top = bool(obj.flags & {"OnTop"})
    # walk: 1 se Ground e não NotWalkable
    walk = 1 if is_ground and not not_walk else 0
    # block: 1 se NotWalkable ou não Ground e não OnTop (objeto sólido)
    block = 1 if not_walk or (not is_ground and not on_top) else 0
    g = obj.groups[0]
    tw = g.width if g.width > 1 else None
    th = g.height if g.height > 1 else None
    out = [walk, block]
    if tw is not None and th is not None:
        out += [tw, th]
    return out


def main():
    otbm_paths = [a for a in sys.argv[1:] if not a.startswith("-")]
    if not otbm_paths:
        print(__doc__)
        return 1

    dat_path = os.path.join(SRC, "Tibia.dat")
    spr_path = os.path.join(SRC, "Tibia.spr")
    if not os.path.exists(dat_path) or not os.path.exists(spr_path):
        print("Tibia.dat/.spr 8.60 nao encontrados em %s" % SRC)
        print("Defina TIBIA860 apontando para a pasta extraida do 15.x-with-8.60")
        return 1

    dat = Dat860(dat_path)
    spr = Spr860(spr_path)

    # Coleta ids usados em todos os .otbm passados
    usados = set()
    for p in otbm_paths:
        p = os.path.normpath(p)
        if not os.path.exists(p):
            print("arquivo nao encontrado: %s" % p)
            continue
        usados |= ids_do_otbm(p)
    if not usados:
        print("nenhum id encontrado nos .otbm")
        return 1

    print("ids unicos nos mapas: %d" % len(usados))

    # Carrega os 3 dicionarios atuais
    tileflags = read_js_dict(os.path.join(JS_DIR, "tileflags.js"), "TILEFLAGS")
    patterns = read_js_dict(os.path.join(JS_DIR, "tilepatterndata.js"), "TILE_PATTERNS")
    anims = read_js_dict(os.path.join(JS_DIR, "tileanimdata.js"), "TILE_ANIM")
    known = read_js_list(os.path.join(RME_DATA, "known_tiles.js"), "RME_KNOWN_TILES")

    new_sprites = 0
    new_patterns = 0
    new_anims = 0

    for cid in sorted(usados):
        # 1. sprite base
        if ensure_sprite(cid, dat, spr):
            new_sprites += 1

        # 2. pattern X/Y
        pat = ensure_pattern(cid, dat, spr)
        if pat is not None:
            patterns[str(cid)] = pat
            new_patterns += 1

        # 3. animação
        anim = ensure_anim(cid, dat, spr)
        if anim is not None:
            anims[str(cid)] = anim
            new_anims += 1

        # 4. flags
        obj = dat.item(cid)
        fl = flag_for_item(obj)
        if fl is not None:
            tileflags[str(cid)] = fl

    # 5. known_tiles: adiciona ids novos mantendo ordenado
    known_set = set(known)
    for cid in usados:
        known_set.add(cid)
    known = sorted(known_set)

    # 6. grava os arquivos
    write_js_obj(
        os.path.join(JS_DIR, "tileflags.js"), "TILEFLAGS",
        "tileflags.js — GERADO por tools/update_map_assets.py. "
        "[walk, block, tw?, th?] por item id.", tileflags)
    write_js_obj(
        os.path.join(JS_DIR, "tilepatterndata.js"), "TILE_PATTERNS",
        "tilepatterndata.js — Gerado por tools/update_map_assets.py. "
        "Patterns X/Y reais do DAT por coordenada do mapa.", patterns)
    write_js_obj(
        os.path.join(JS_DIR, "tileanimdata.js"), "TILE_ANIM",
        "tileanimdata.js — Gerado por tools/update_map_assets.py. "
        "Animacoes dos tiles do mapa.", anims)
    kt_path = os.path.join(RME_DATA, "known_tiles.js")
    with open(kt_path, "w", encoding="utf-8") as f:
        f.write("/* known_tiles.js — Gerado por tools/update_map_assets.py.\n"
                " * ids presentes em game/assets/tiles. */\n")
        f.write("\"use strict\";\nwindow.RME_KNOWN_TILES = %s;\n" %
                json.dumps(known, separators=(",", ":")))

    print("novos sprites: %d | patterns: %d | anims: %d" %
          (new_sprites, new_patterns, new_anims))
    print("tileflags merge: %d entradas" % len(tileflags))
    print("tilepatterndata merge: %d entradas" % len(patterns))
    print("tileanimdata merge: %d entradas" % len(anims))
    print("known_tiles merge: %d entradas" % len(known))


if __name__ == "__main__":
    sys.exit(main())
