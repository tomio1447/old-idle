"""Funcoes de renderizacao de outfits/itens do Tibia 7.4 para PNG."""
from PIL import Image
from tibia_assets import Dat, Spr, compose_outfit, OUTFIT_COLORS, bgr_to_rgb

DAT_PATH = "/home/user/base/data/74/Tibia.dat"
SPR_PATH = "/home/user/base/data/74/Tibia.spr"


def load():
    return Dat(DAT_PATH), Spr(SPR_PATH)


def render_group(spr, g, frame=0, xp=0, yp=0, zp=0, layer=0):
    """Compoe as tiles (width x height) de um frame group num unico PNG."""
    W, H = g.width * 32, g.height * 32
    canvas = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    for y in range(g.height):
        for x in range(g.width):
            sid = g.sprite_id(frame, xp, yp, zp, layer, x, y)
            img = spr.sprite(sid)
            if img is None:
                continue
            canvas.alpha_composite(img, (W - 32 * (x + 1), H - 32 * (y + 1)))
    return canvas


def render_outfit(dat, spr, looktype, direction=2, frame=0, addon=0, colors=None):
    """Renderiza uma outfit. direction: 0=N 1=E 2=S 3=W. colors=(head,body,legs,feet) indices."""
    obj = dat.outfit(looktype)
    if obj is None or not obj.groups:
        return None
    g = obj.groups[0]
    xp = direction % max(1, g.px)
    yp = min(addon, g.py - 1)
    base = render_group(spr, g, frame=frame % g.anim, xp=xp, yp=yp)
    if g.layers > 1 and colors:
        mask = render_group(spr, g, frame=frame % g.anim, xp=xp, yp=yp, layer=1)
        cols = [bgr_to_rgb(OUTFIT_COLORS[c % len(OUTFIT_COLORS)]) for c in colors]
        base = compose_outfit(base, mask, *cols)
    return base


def render_item(dat, spr, client_id, frame=0):
    obj = dat.item(client_id)
    if obj is None or not obj.groups:
        return None
    g = obj.groups[0]
    return render_group(spr, g, frame=frame % g.anim, xp=0, yp=0)


def trim_scale(img, scale=1):
    if img is None:
        return None
    bbox = img.getbbox()
    if bbox:
        img = img.crop(bbox)
    if scale != 1:
        img = img.resize((img.width * scale, img.height * scale), Image.NEAREST)
    return img
