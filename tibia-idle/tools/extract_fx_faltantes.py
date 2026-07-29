"""
Extrai os efeitos que o import_spell_effects.py pediu e ainda nao existiam
em assets/fx.

O extrator antigo (extract_fx_860.py) cobria os efeitos classicos e os do
Monk, mas algumas magias apontam para efeitos que ficaram de fora: energy-hit
(CONST_ME_ENERGYHIT, usado pelas magias de energia pontuais), holy-area,
carniphila e whirlwind-blow-white.

Os ids vem do enum CONST_ME_* de src/utils/utils_definitions.hpp do Canary.

Uso: python3 extract_fx_faltantes.py [dir_com_Tibia.dat] [dir_do_game]
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from tibia_assets_860 import Dat860, Spr860, render_group_860  # noqa: E402

SRC = sys.argv[1] if len(sys.argv) > 1 else "/home/user/assets860/ex"
GAME = sys.argv[2] if len(sys.argv) > 2 else os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "..", "game")

FALTANTES = {
    "energy-hit": 12,
    "carniphila": 47,
    "holy-area": 50,
    "whirlwind-blow-white": 276,
}


def main():
    dat = Dat860(os.path.join(SRC, "Tibia.dat"))
    spr = Spr860(os.path.join(SRC, "Tibia.spr"))
    dest = os.path.join(GAME, "assets", "fx")
    os.makedirs(dest, exist_ok=True)

    from PIL import Image
    for nome, eid in FALTANTES.items():
        obj = dat.effect(eid)
        if obj is None or not obj.groups:
            print("sem objeto:", nome, eid)
            continue
        g = obj.groups[0]
        # cada quadro da animacao vira uma coluna do sheet, que e como o
        # Renderer.addEffect consome (fatia por naturalWidth / frames)
        quadros = []
        for f in range(g.anim):
            im = render_group_860(spr, g, frame=f)
            if im is not None:
                quadros.append(im)
        if not quadros:
            print("vazio:", nome)
            continue
        w, h = quadros[0].size
        sheet = Image.new("RGBA", (w * len(quadros), h), (0, 0, 0, 0))
        for i, im in enumerate(quadros):
            sheet.paste(im, (i * w, 0))
        sheet.save(os.path.join(dest, nome + ".png"), optimize=True)
        print(nome, "->", len(quadros), "quadros", sheet.size)


if __name__ == "__main__":
    main()
