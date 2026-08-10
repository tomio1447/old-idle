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
  TIBIA860=/caminho/com/Tibia.dat \
  CANARY_MONSTERS=/canary/data-otservbr-global/monster \
    python3 extract_idle_sprites.py
"""
import json
import os
import re
import sys

from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from tibia_assets_860 import Dat860, Spr860, render_group_860  # noqa: E402
from colorize_monsters_canary import (  # noqa: E402
    CANARY_ADDONS, CANARY_COLORS, PALETTE, compor_cor, hex_to_rgb,
)

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.normpath(os.path.join(HERE, "..", "game"))
SRC = os.environ.get("TIBIA860", "/home/user/work/15x860_repo/extracted")
CANARY_MONSTERS = os.environ.get("CANARY_MONSTERS", "")
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


def monster_pose(spr, group, frame, direction, addon=0, layer=0):
    base = group_image(spr, group, frame, direction, 0, layer)
    if addon and group.py > 1:
        extra = group_image(spr, group, frame, direction, addon % group.py, layer)
        if extra is not None:
            if base is None:
                base = extra.copy()
            else:
                base = base.copy()
                base.alpha_composite(extra)
    return base


def infer_monster_colors(spr, obj, slug, dest, main_meta, box, addon):
    """Recupera as quatro cores comparando o frame moving já colorido.

    Isso cobre monstros cujo lookHead/lookBody/lookLegs/lookFeet não entrou no
    JSON importado (ex.: Burning Book), sem manter uma segunda lista manual.
    """
    sheet_path = os.path.join(dest, slug + ".png")
    if not os.path.exists(sheet_path) or obj.groups[0].layers < 2:
        return None
    cw, ch = main_meta["cw"], main_meta["ch"]
    colored_sheet = Image.open(sheet_path).convert("RGBA")
    if colored_sheet.width < cw or colored_sheet.height < ch * 3:
        return None
    colored = colored_sheet.crop((0, ch * 2, cw, ch * 3))
    bw, bh = box[2] - box[0], box[3] - box[1]
    sw, sh = obj.groups[0].width * 32, obj.groups[0].height * 32
    ox = max(0, min(sw - cw, round(box[0] + (bw - cw) / 2)))
    oy = max(0, min(sh - ch, round(box[1] + (bh - ch) / 2)))
    base = monster_pose(spr, obj.groups[0], 0, 2, addon, 0).crop((ox, oy, ox + cw, oy + ch))
    mask = monster_pose(spr, obj.groups[0], 0, 2, addon, 1).crop((ox, oy, ox + cw, oy + ch))
    if base.size != colored.size or mask.size != colored.size:
        return None

    mask_colors = [(255,255,0), (255,0,0), (0,255,0), (0,0,255)]
    palette_rgb = [hex_to_rgb(value) for value in PALETTE]
    result = []
    for mask_color in mask_colors:
        samples = []
        for y in range(ch):
            for x in range(cw):
                mp = mask.getpixel((x,y))
                bp = base.getpixel((x,y))
                cp = colored.getpixel((x,y))
                if mp[:3] == mask_color and mp[3] and bp[3] and cp[3]:
                    samples.append((bp[:3], cp[:3]))
        if not samples:
            result.append(0)
            continue
        if len(samples) > 160:
            step = max(1, len(samples) // 160)
            samples = samples[::step][:160]
        best_index, best_error = 0, None
        for index, candidate in enumerate(palette_rgb):
            error = 0
            for before, after in samples:
                for channel in range(3):
                    predicted = before[channel] * candidate[channel] // 255
                    delta = predicted - after[channel]
                    error += delta * delta
            if best_error is None or error < best_error:
                best_index, best_error = index, error
        result.append(best_index)
    return tuple(result)


def load_canary_looks(root):
    """Lê cores/addon oficiais diretamente dos monster.lua do Canary."""
    looks = {}
    if not root or not os.path.isdir(root):
        return looks
    keys = ("lookHead", "lookBody", "lookLegs", "lookFeet")
    for directory, _subdirs, files in os.walk(root):
        for name in files:
            if not name.endswith(".lua"):
                continue
            text = open(os.path.join(directory, name), encoding="utf-8", errors="ignore").read()
            block_match = re.search(r"monster\.outfit\s*=\s*\{(.*?)\}", text, re.S)
            if not block_match:
                continue
            block = block_match.group(1)
            values = []
            valid = True
            for key in keys:
                match = re.search(r"\b%s\s*=\s*(\d+)" % key, block)
                if not match:
                    valid = False
                    break
                values.append(int(match.group(1)))
            if not valid:
                continue
            addon_match = re.search(r"\blookAddons\s*=\s*(\d+)", block)
            slug = os.path.splitext(name)[0].replace("_", "-").lower()
            looks[slug] = {
                "colors": tuple(values),
                "addon": int(addon_match.group(1)) if addon_match else 0,
            }
    return looks


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


def monster_walk_box(spr, obj, addon=0):
    idle = obj.groups[0]
    moving = next((g for g in obj.groups if g.group_type == 1),
                  obj.groups[1] if len(obj.groups) > 1 else idle)
    images = []
    for direction in range(DIRS):
        images.append(monster_pose(spr, idle, 0, direction, addon, 0))
        for frame in range(min(MAX_WALK, max(1, moving.anim))):
            images.append(monster_pose(spr, moving, frame, direction, addon, 0))
    return bbox_union(images)


def monster_idle(dat, spr, slug, looktype, dest, main_meta, canary_look=None):
    obj = dat.outfit(looktype or 0)
    if obj is None or not obj.groups:
        return None
    idle = obj.groups[0]
    if idle.group_type != 0 or idle.anim <= 1:
        return None
    frame_count = min(MAX_IDLE, idle.anim)
    addon = canary_look["addon"] if canary_look else CANARY_ADDONS.get(slug, 0)
    raw_idle = [[monster_pose(spr, idle, frame, direction, addon, 0)
                 for frame in range(frame_count)] for direction in range(DIRS)]
    all_idle = [im for row in raw_idle for im in row]
    # Inclui a caixa usada no sheet de caminhada para a troca idle/moving não
    # cortar efeitos nem mudar desnecessariamente a ancoragem do corpo.
    walk_box = monster_walk_box(spr, obj, addon)
    idle_box = bbox_union(all_idle, walk_box)
    if idle_box is None:
        return None
    if walk_box:
        box = (min(walk_box[0], idle_box[0]), min(walk_box[1], idle_box[1]),
               max(walk_box[2], idle_box[2]), max(walk_box[3], idle_box[3]))
    else:
        box = idle_box

    color_indices = canary_look["colors"] if canary_look else CANARY_COLORS.get(slug)
    if color_indices is None and idle.layers > 1:
        color_indices = infer_monster_colors(
            spr, obj, slug, dest, main_meta, walk_box or box, addon)
    rgb_colors = tuple(hex_to_rgb(PALETTE[index % len(PALETTE)])
                       for index in color_indices) if color_indices else None
    if rgb_colors:
        idle_frames = []
        for direction in range(DIRS):
            row = []
            for frame in range(frame_count):
                base = monster_pose(spr, idle, frame, direction, addon, 0)
                mask = monster_pose(spr, idle, frame, direction, addon, 1)
                row.append(compor_cor(base, mask, *rgb_colors))
            idle_frames.append(row)
    else:
        idle_frames = raw_idle

    if not save_sheet(os.path.join(dest, slug + ".idle.png"), idle_frames, box):
        return None
    ds = durations(idle, frame_count)
    meta = {"cw": box[2] - box[0], "ch": box[3] - box[1],
            "sw": max(group.width * 32 for group in obj.groups),
            "sh": max(group.height * 32 for group in obj.groups),
            "ox": box[0], "oy": box[1],
            "frames": frame_count, "durations": ds, "duration": sum(ds)}
    if color_indices:
        meta["colors"] = list(color_indices)
    return meta


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
    canary_looks = load_canary_looks(CANARY_MONSTERS)

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
        meta = monster_idle(dat, spr, slug, monster.get("looktype"), mob_dir,
                            mob_sheets[slug], canary_looks.get(slug))
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
    print("looks oficiais Canary disponíveis:", len(canary_looks))
    print("arquivos idle:", len(valid_outfit) + len(valid_mount) + len(valid_mob))
    return 0


if __name__ == "__main__":
    sys.exit(main())
