"""
colorize_humanoid_mobs.py — aplica as cores oficiais das outfits aos monstros
humanoides que usam looktypes de outfit (Amazon, Valkyrie, Witch, etc.) e que
antes estavam brancos/cinzas em assets/mob/<slug>.png.
"""
import os
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.normpath(os.path.join(HERE, "..", "game"))

PALETTE = [
    "#ffffff","#ffd4bf","#ffe9bf","#ffffbf","#e9ffbf","#d4ffbf","#bfffbf",
    "#bfffd4","#bfffe9","#bfffff","#bfe9ff","#bfd4ff","#bfbfff","#d4bfff",
    "#e9bfff","#ffbfff","#ffbfe9","#ffbfd4","#ffbfbf","#dadada","#bf9f8f",
    "#bfaf8f","#bfbf8f","#afbf8f","#9fbf8f","#8fbf8f","#8fbf9f","#8fbfaf",
    "#8fbfbf","#8fafbf","#8f9fbf","#8f8fbf","#9f8fbf","#af8fbf","#bf8fbf",
    "#bf8faf","#bf8f9f","#bf8f8f","#b6b6b6","#bf7f5f","#bfaf8f","#bfbf5f",
    "#9fbf5f","#7fbf5f","#5fbf5f","#5fbf7f","#5fbf9f","#5fbfbf","#5f9fbf",
    "#5f7fbf","#5f5fbf","#7f5fbf","#9f5fbf","#bf5fbf","#bf5f9f","#bf5f7f",
    "#bf5f5f","#919191","#bf6a3f","#bf943f","#bfbf3f","#94bf3f","#6abf3f",
    "#3fbf3f","#3fbf6a","#3fbf94","#3fbfbf","#3f94bf","#3f6abf","#3f3fbf",
    "#6a3fbf","#943fbf","#bf3fbf","#bf3f94","#bf3f6a","#bf3f3f","#6d6d6d",
    "#bf5500","#bfaa00","#bfbf00","#aabf00","#55bf00","#00bf00","#00bf55",
    "#00bfaa","#00bfbf","#00aabf","#0055bf","#0000bf","#5500bf","#aa00bf",
    "#bf00bf","#bf00aa","#bf0055","#bf0000","#484848"
]


def hex_to_rgb(hex_str):
    h = hex_str.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def colorize_cell(base_cell, mask_cell, color_indices):
    cols = [hex_to_rgb(PALETTE[i % len(PALETTE)]) for i in color_indices]
    base_rgba = np.array(base_cell, dtype=float)
    mask_rgba = np.array(mask_cell, dtype=float)
    out = base_rgba.copy()

    alpha = mask_rgba[:, :, 3]
    for c_idx in range(4):
        if c_idx == 0:
            cond = (alpha > 0) & (mask_rgba[:, :, 0] > 128) & (mask_rgba[:, :, 1] > 128) & (mask_rgba[:, :, 2] < 128)
        elif c_idx == 1:
            cond = (alpha > 0) & (mask_rgba[:, :, 0] > 128) & (mask_rgba[:, :, 1] < 128) & (mask_rgba[:, :, 2] < 128)
        elif c_idx == 2:
            cond = (alpha > 0) & (mask_rgba[:, :, 0] < 128) & (mask_rgba[:, :, 1] > 128) & (mask_rgba[:, :, 2] < 128)
        elif c_idx == 3:
            cond = (alpha > 0) & (mask_rgba[:, :, 0] < 128) & (mask_rgba[:, :, 1] < 128) & (mask_rgba[:, :, 2] > 128)

        target_rgb = cols[c_idx]
        for ch in range(3):
            out[:, :, ch] = np.where(cond, (base_rgba[:, :, ch] * target_rgb[ch]) / 255.0, out[:, :, ch])

    return Image.fromarray(np.uint8(np.clip(out, 0, 255)))


def generate_mob(mob_slug, outfit_id, cw_in, ch_in, cw_out, ch_out, colors):
    base_path = os.path.join(GAME, "assets", "appearance", "outfit", f"{outfit_id}.base.png")
    mask_path = os.path.join(GAME, "assets", "appearance", "outfit", f"{outfit_id}.mask.png")
    out_path = os.path.join(GAME, "assets", "mob", f"{mob_slug}.png")

    if not os.path.exists(base_path) or not os.path.exists(mask_path):
        print(f"Skipping {mob_slug}: missing {base_path} or {mask_path}")
        return

    base_img = Image.open(base_path).convert("RGBA")
    mask_img = Image.open(mask_path).convert("RGBA")
    out_sheet = Image.new("RGBA", (cw_out * 3, ch_out * 4), (0, 0, 0, 0))

    for row in range(4):
        for col in range(3):
            base_cell = base_img.crop((col * cw_in, row * ch_in, (col + 1) * cw_in, (row + 1) * ch_in))
            mask_cell = mask_img.crop((col * cw_in, row * ch_in, (col + 1) * cw_in, (row + 1) * ch_in))
            colored_cell = colorize_cell(base_cell, mask_cell, colors)
            bbox = colored_cell.getbbox()
            if bbox:
                cropped = colored_cell.crop(bbox)
                px = max(0, cw_out - cropped.width)
                py = max(0, ch_out - cropped.height)
                out_sheet.alpha_composite(cropped, (col * cw_out + px, row * ch_out + py))
    out_sheet.save(out_path)
    print(f"Colorized mob {mob_slug}.png ({cw_out * 3}x{ch_out * 4}) from outfit {outfit_id}")


def main():
    mobs = [
        ("amazon",       "citizen-f", 46, 46, 36, 36, [113, 39, 113, 115]),
        ("valkyrie",     "knight-f",  42, 42, 35, 35, [95, 113, 39, 115]),
        ("witch",        "mage-f",    46, 46, 38, 38, [114, 95, 95, 0]),
        ("hunter",       "hunter-m",  42, 42, 35, 35, [113, 114, 39, 115]),
        ("wild-warrior", "citizen-m", 46, 46, 36, 36, [113, 39, 113, 115]),
        ("necromancer",  "mage-m",    42, 42, 32, 32, [0, 94, 94, 0]),
        ("black-knight", "knight-m",  42, 42, 36, 36, [95, 95, 95, 95]),
    ]
    for mob_slug, out_id, cwi, chi, cwo, cho, cols in mobs:
        generate_mob(mob_slug, out_id, cwi, chi, cwo, cho, cols)


if __name__ == "__main__":
    main()
