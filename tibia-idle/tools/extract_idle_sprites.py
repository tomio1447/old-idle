"""Extrai somente animações IDLE reais do DAT 8.60 extended.

Os sheets principais do jogo continuam com a pose 0 + frames de caminhada.
Este gerador cria sheets separados apenas quando o frame group de tipo idle
possui mais de um frame:

  assets/mob/<slug>.idle.png
  assets/appearance/outfit/<id>[-aN].idle.{base,mask}.png
  assets/appearance/mount/<id>.idle.base.png
  js/idleanimdata.js

Assim uma criatura sem idle real nunca percorre frames de caminhada enquanto
está parada. As durações são as médias min/max declaradas pelo próprio DAT.

Uso:
  TIBIA860=/caminho/com/Tibia.dat python3 extract_idle_sprites.py
"""
import json
import os
import sys

from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from tibia_assets_860 import Dat860, Spr860, render_group_860  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.normpath(os.path.join(HERE, "..", "game"))
SRC = os.environ.get("TIBIA860", "/home/user/work/15x860_repo/extracted")
DIRS = 4
MAX_IDLE = 16
MAX_WALK = 12
CELL = 64


def durations(g, frames):
    ds = list(g.durations[:frames]) if g.durations else []
    if len(ds) < frames:
        ds.extend([180] * (frames - len(ds)))
    return [max(1, int(n)) for n in ds]


def bbox_union(images, fallback=None):
    boxes = [im.getbbox() for im in images if im is not None and im.getbbox()]
    if not boxes:
        return fallback
    return (min(b[0] for b in boxes), min(b[1] for b in boxes),
            max(b[2] for b in boxes), max(b[3] for b in boxes))


def canvas64(img):
    out = Image.new("RGBA", (CELL, CELL), (0, 0, 0, 0))
    if img is not None:
        out.alpha_composite(img, (0, 0))
    return out


def group_image(spr, group, frame, direction, yp=0, layer=0):
    if layer >= group.layers:
        return Image.new("RGBA", (group.width * 32, group.height * 32), (0, 0, 0, 0))
    return render_group_860(
        spr, group, frame=frame,
        xp=direction % max(1, group.px),
        yp=min(yp, group.py - 1), layer=layer)


def save_sheet(path, frames_by_dir, box):
    x0, y0, x1, y1 = box
    cw, ch = x1 - x0, y1 - y0
    count = len(frames_by_dir[0])
    sheet = Image.new("RGBA", (cw * count, ch * DIRS), (0, 0, 0, 0))
    visible = False
    for direction in range(DIRS):
        for frame, image in enumerate(frames_by_dir[direction]):
            cell = image.crop(box)
            if cell.getbbox():
                visible = True
            sheet.alpha_composite(cell, (frame * cw, direction * ch))
    if not visible:
        return False
    sheet.save(path, optimize=True)
    return True


def appearance_idle(dat, spr, entry, dest, addons):
    obj = dat.outfit(entry.get("looktype", 0))
    if obj is None or not obj.groups:
        return None
    idle = obj.groups[0]
    if idle.group_type != 0 or idle.anim <= 1:
        return None
    frame_count = min(MAX_IDLE, idle.anim)
    yp_count = min(3, idle.py) if addons else 1

    # Uma caixa compartilhada por corpo/addons e por todos os frames idle.
    base_images = []
    for yp in range(yp_count):
        for direction in range(DIRS):
            for frame in range(frame_count):
                base_images.append(canvas64(group_image(spr, idle, frame, direction, yp, 0)))
    box = bbox_union(base_images)
    if box is None:
        return None

    suffixes = ["" if yp == 0 else "-a%d" % yp for yp in range(yp_count)]
    mask_suffixes = []
    for yp, suffix in enumerate(suffixes):
        base_frames = [[canvas64(group_image(spr, idle, frame, direction, yp, 0))
                        for frame in range(frame_count)] for direction in range(DIRS)]
        save_sheet(os.path.join(dest, entry["id"] + suffix + ".idle.base.png"),
                   base_frames, box)
        if addons and idle.layers > 1:
            mask_frames = [[canvas64(group_image(spr, idle, frame, direction, yp, 1))
                            for frame in range(frame_count)] for direction in range(DIRS)]
            mask_path = os.path.join(dest, entry["id"] + suffix + ".idle.mask.png")
            if save_sheet(mask_path, mask_frames, box):
                mask_suffixes.append(suffix)
            elif os.path.exists(mask_path):
                os.remove(mask_path)

    ds = durations(idle, frame_count)
    return {"cw": box[2] - box[0], "ch": box[3] - box[1],
            "ox": box[0], "oy": box[1], "frames": frame_count,
            "durations": ds, "duration": sum(ds), "masks": mask_suffixes}


def monster_walk_box(spr, obj):
    idle = obj.groups[0]
    moving = next((g for g in obj.groups if g.group_type == 1),
                  obj.groups[1] if len(obj.groups) > 1 else idle)
    images = []
    for direction in range(DIRS):
        images.append(group_image(spr, idle, 0, direction, 0, 0))
        for frame in range(min(MAX_WALK, max(1, moving.anim))):
            images.append(group_image(spr, moving, frame, direction, 0, 0))
    return bbox_union(images)


def monster_idle(dat, spr, slug, looktype, dest):
    obj = dat.outfit(looktype or 0)
    if obj is None or not obj.groups:
        return None
    idle = obj.groups[0]
    if idle.group_type != 0 or idle.anim <= 1:
        return None
    frame_count = min(MAX_IDLE, idle.anim)
    idle_frames = [[group_image(spr, idle, frame, direction, 0, 0)
                    for frame in range(frame_count)] for direction in range(DIRS)]
    all_idle = [im for row in idle_frames for im in row]
    # Inclui a caixa usada no sheet de caminhada para a troca idle/moving não
    # cortar efeitos nem mudar desnecessariamente a ancoragem do corpo.
    walk_box = monster_walk_box(spr, obj)
    idle_box = bbox_union(all_idle, walk_box)
    if idle_box is None:
        return None
    if walk_box:
        box = (min(walk_box[0], idle_box[0]), min(walk_box[1], idle_box[1]),
               max(walk_box[2], idle_box[2]), max(walk_box[3], idle_box[3]))
    else:
        box = idle_box
    if not save_sheet(os.path.join(dest, slug + ".idle.png"), idle_frames, box):
        return None
    ds = durations(idle, frame_count)
    return {"cw": box[2] - box[0], "ch": box[3] - box[1],
            "frames": frame_count, "durations": ds, "duration": sum(ds)}


def remove_stale(directory, suffix, valid):
    for name in os.listdir(directory):
        if not name.endswith(suffix):
            continue
        if os.path.join(directory, name) not in valid:
            os.remove(os.path.join(directory, name))


def main():
    dat = Dat860(os.path.join(SRC, "Tibia.dat"))
    spr = Spr860(os.path.join(SRC, "Tibia.spr"))
    appearances = json.load(open(os.path.join(GAME, "data", "appearances.json")))
    monsters = json.load(open(os.path.join(GAME, "data", "canarymonsters.json")))
    mob_sheets = json.load(open(os.path.join(GAME, "data", "mobsheets.json")))

    outfit_dir = os.path.join(GAME, "assets", "appearance", "outfit")
    mount_dir = os.path.join(GAME, "assets", "appearance", "mount")
    mob_dir = os.path.join(GAME, "assets", "mob")
    data = {"outfits": {}, "mounts": {}, "monsters": {}}
    valid_outfit = set()
    valid_mount = set()
    valid_mob = set()

    for entry in appearances["outfits"]:
        meta = appearance_idle(dat, spr, entry, outfit_dir, True)
        if meta:
            data["outfits"][entry["id"]] = meta
            prefix = entry["id"]
            for name in os.listdir(outfit_dir):
                if name.startswith(prefix) and ".idle." in name:
                    valid_outfit.add(os.path.join(outfit_dir, name))

    for entry in appearances["mounts"]:
        meta = appearance_idle(dat, spr, entry, mount_dir, False)
        if meta:
            data["mounts"][entry["id"]] = meta
            valid_mount.add(os.path.join(mount_dir, entry["id"] + ".idle.base.png"))

    for slug, monster in monsters.items():
        if slug not in mob_sheets:
            continue
        meta = monster_idle(dat, spr, slug, monster.get("looktype"), mob_dir)
        if meta:
            data["monsters"][slug] = meta
            valid_mob.add(os.path.join(mob_dir, slug + ".idle.png"))

    remove_stale(outfit_dir, ".idle.base.png", valid_outfit)
    remove_stale(outfit_dir, ".idle.mask.png", valid_outfit)
    remove_stale(mount_dir, ".idle.base.png", valid_mount)
    remove_stale(mount_dir, ".idle.mask.png", set())
    remove_stale(mob_dir, ".idle.png", valid_mob)

    output = os.path.join(GAME, "js", "idleanimdata.js")
    with open(output, "w", encoding="utf-8") as f:
        f.write("/* Gerado por tools/extract_idle_sprites.py.\n"
                " * Somente frame groups idle reais (anim > 1) do DAT. */\n")
        f.write("window.IDLE_ANIMATIONS = " + json.dumps(
            data, separators=(",", ":")) + ";\n")

    print("idle real: %d outfits, %d mounts, %d monsters" % (
        len(data["outfits"]), len(data["mounts"]), len(data["monsters"])))
    print("arquivos idle:", len(valid_outfit) + len(valid_mount) + len(valid_mob))
    return 0


if __name__ == "__main__":
    sys.exit(main())
