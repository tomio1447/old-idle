"""
Extrai os missiles (projeteis) e effects (efeitos de impacto) dos assets
15.x/8.60 para o jogo.

Missiles no Tibia sao desenhados em 8 direcoes de voo (grade 3x3 sem o
centro). Aqui cada direcao vira um PNG separado:

    assets/missile/<nome>_<dir>.png     dir = n, ne, e, se, s, sw, w, nw

Effects sao animacoes de 1 a N frames, salvos como sprite sheet
horizontal, no mesmo formato dos fx que o jogo ja usa:

    assets/fx/<nome>.png

Os ids vem dos enums oficiais do Canary (src/utils/utils_definitions.hpp):
CONST_ANI_* para missiles e CONST_ME_* para effects.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from PIL import Image  # noqa: E402
from tibia_assets_860 import Dat860, Spr860, render_group_860  # noqa: E402

SRC = os.environ.get("TIBIA860", "/tmp/newassets/extracted")
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(HERE, "..", "game", "assets"))

os.makedirs(os.path.join(OUT, "missile"), exist_ok=True)
os.makedirs(os.path.join(OUT, "fx"), exist_ok=True)

dat = Dat860(os.path.join(SRC, "Tibia.dat"))
spr = Spr860(os.path.join(SRC, "Tibia.spr"))

# ---------------------------------------------------------------- missiles
# CONST_ANI_* do Canary. Nome no jogo -> id do enum.
MISSILES = {
    "spear": 1, "bolt": 2, "arrow": 3, "fire": 4, "energy": 5,
    "poison-arrow": 6, "burst-arrow": 7, "throwing-star": 8,
    "throwing-knife": 9, "small-stone": 10, "death": 11, "large-rock": 12,
    "snowball": 13, "power-bolt": 14, "poison": 15, "infernal-bolt": 16,
    "hunting-spear": 17, "enchanted-spear": 18, "red-star": 19,
    "green-star": 20, "royal-spear": 21, "sniper-arrow": 22,
    "onyx-arrow": 23, "piercing-bolt": 24, "whirlwind-sword": 25,
    "whirlwind-axe": 26, "whirlwind-club": 27, "ethereal-spear": 28,
    "ice": 29, "earth": 30, "holy": 31, "sudden-death": 32,
    "flash-arrow": 33, "flamming-arrow": 34, "shiver-arrow": 35,
    "energy-ball": 36, "small-ice": 37, "small-holy": 38,
    "small-earth": 39, "earth-arrow": 40, "explosion": 41,
    "diamond-arrow": 57, "spectral-bolt": 58,
}

# a grade 3x3 do missile mapeia a direcao do voo; o centro fica vazio
DIRS = {
    "nw": (0, 0), "n": (1, 0), "ne": (2, 0),
    "w":  (0, 1),              "e":  (2, 1),
    "sw": (0, 2), "s": (1, 2), "se": (2, 2),
}


def export_missiles():
    ok = vazio = 0
    manifesto = {}
    for nome, mid in MISSILES.items():
        obj = dat.objects.get(dat.effects_end + mid)
        if obj is None or not obj.groups:
            vazio += 1
            continue
        g = obj.groups[0]
        salvos = []
        for tag, (xp, yp) in DIRS.items():
            if xp >= g.px or yp >= g.py:
                continue
            img = render_group_860(spr, g, frame=0, xp=xp, yp=yp)
            if img is None or not img.getbbox():
                continue
            img.crop(img.getbbox()).save(
                "%s/missile/%s_%s.png" % (OUT, nome, tag))
            salvos.append(tag)
        if salvos:
            ok += 1
            manifesto[nome] = salvos
        else:
            vazio += 1
    print("  missiles: %d exportados, %d sem sprite" % (ok, vazio))
    return manifesto


# ---------------------------------------------------------------- effects
# CONST_ME_* do Canary. Nome usado pelo jogo -> id do enum.
EFFECTS = {
    "draw-blood": 1, "lose-energy": 2, "poff": 3, "block-hit": 4,
    "explosion-area": 5, "explosion-hit": 6, "fire-area": 7,
    "yellow-rings": 8, "green-rings": 9, "hit-area": 10, "teleport": 11,
    "energy-damage": 12, "magic-blue": 13, "magic-red": 14,
    "magic-green": 15, "hit-by-fire": 16, "hit-by-poison": 17,
    "mort-area": 18, "sound-green": 19, "sound-red": 20,
    "poison-area": 21, "sound-yellow": 22, "sound-purple": 23,
    "sound-blue": 24, "sound-white": 25, "bubbles": 26,
    "stun": 32, "sleep": 33, "watercreature": 34, "groundshaker": 35,
    "hearts": 36, "fire-attack": 37, "energy-area": 38,
    "small-clouds": 39, "holy-damage": 40, "big-clouds": 41,
    "ice-area": 42, "ice-tornado": 43, "ice-attack": 44, "stones": 45,
    "small-plants": 46, "purple-energy": 48, "yellow-energy": 49,
}


def export_effects():
    ok = vazio = 0
    frames_por_fx = {}
    for nome, eid in EFFECTS.items():
        obj = dat.objects.get(dat.outfits_end + eid)
        if obj is None or not obj.groups:
            vazio += 1
            continue
        g = obj.groups[0]
        quadros = []
        for f in range(max(1, g.anim)):
            img = render_group_860(spr, g, frame=f, xp=0, yp=0)
            if img is None:
                continue
            quadros.append(img)
        # descarta os quadros totalmente vazios do fim
        while quadros and not quadros[-1].getbbox():
            quadros.pop()
        if not quadros:
            vazio += 1
            continue
        w = max(q.width for q in quadros)
        h = max(q.height for q in quadros)
        sheet = Image.new("RGBA", (w * len(quadros), h), (0, 0, 0, 0))
        for i, q in enumerate(quadros):
            sheet.alpha_composite(q, (i * w, 0))
        sheet.save("%s/fx/%s.png" % (OUT, nome))
        frames_por_fx[nome] = len(quadros)
        ok += 1
    print("  effects: %d exportados, %d sem sprite" % (ok, vazio))
    return frames_por_fx


if __name__ == "__main__":
    print("extraindo de", SRC)
    print("\n[1/2] missiles")
    mis = export_missiles()
    print("\n[2/2] effects")
    fx = export_effects()

    # o render.js precisa saber quantos quadros cada efeito tem
    print("\nFX_FRAMES para o render.js:")
    linha = []
    for k in sorted(fx):
        linha.append('"%s": %d' % (k, fx[k]))
    print("  " + ", ".join(linha))
    print("\nmissiles com direcoes:", len(mis))
