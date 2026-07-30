"""
Extrai sprites dos monstros do Canary que ainda nao tinham arte.

O jogo so tinha PNG para ~100 criaturas, mas o import_monsters.py trouxe 1655
fichas do servidor. Sem sprite o monstro nao pode entrar numa cacada — vira
apenas uma ficha de bestiario. Este script fecha essa lacuna usando o
looktype que cada ficha ja carrega.

Alinhamento: o extrator antigo (extract_860.py) recortava CADA direcao e CADA
frame com o seu proprio getbbox(), o mesmo defeito que causava o desalinhamento
dos outfits. Aqui a caixa de corte e calculada UMA vez por criatura, como a
uniao dos bbox de todos os quadros, entao o bicho nao "pula" ao virar nem ao
dar o passo.

Saida (mesmos nomes que o render ja consome):
    assets/mob/<slug>_<dir>.png    pose parada
    assets/mob/<slug>_<dir>1.png   passo 1
    assets/mob/<slug>_<dir>2.png   passo 2

Uso: python3 extract_monster_sprites.py [dir_com_Tibia.dat] [dir_do_game]
"""
import json
import os
import sys

from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from tibia_assets_860 import Dat860, Spr860, render_group_860  # noqa: E402

SRC = sys.argv[1] if len(sys.argv) > 1 else "/home/user/assets860/ex"
GAME = sys.argv[2] if len(sys.argv) > 2 else os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "..", "game")

# (sufixo do arquivo, xp do frame group) na ordem do client
DIRS = (("n", 0), ("e", 1), ("s", 2), ("w", 3))
PASSOS = 2          # quantos frames de caminhada o render alterna


def quadros_da_criatura(spr, obj):
    """Renderiza todos os quadros (direcao x pose) sem recortar.

    Devolve {(dir, indice): imagem}, com indice 0 = parado e 1..n = passos.
    Nao recorta aqui: o corte precisa da caixa comum, calculada depois.
    """
    g_idle = obj.groups[0]
    g_walk = obj.groups[1] if len(obj.groups) > 1 else obj.groups[0]
    out = {}
    for tag, xp in DIRS:
        # px < 4 acontece em criaturas que nao viram (slimes, por exemplo):
        # o modulo repete a unica direcao em vez de estourar o indice
        img = render_group_860(spr, g_idle, frame=0,
                               xp=xp % max(1, g_idle.px), yp=0, layer=0)
        if img is not None:
            out[(tag, 0)] = img
        for i in range(min(PASSOS, max(1, g_walk.anim))):
            fr = render_group_860(spr, g_walk, frame=i,
                                  xp=xp % max(1, g_walk.px), yp=0, layer=0)
            if fr is not None:
                out[(tag, i + 1)] = fr
    return out


def caixa_comum(quadros):
    """Uniao dos bbox de todos os quadros. None se estiver tudo vazio."""
    x0 = y0 = 10 ** 6
    x1 = y1 = 0
    achou = False
    for img in quadros.values():
        b = img.getbbox()
        if not b:
            continue
        achou = True
        x0 = min(x0, b[0]); y0 = min(y0, b[1])
        x1 = max(x1, b[2]); y1 = max(y1, b[3])
    return (x0, y0, x1, y1) if achou else None


def main():
    dat = Dat860(os.path.join(SRC, "Tibia.dat"))
    spr = Spr860(os.path.join(SRC, "Tibia.spr"))
    dest = os.path.join(GAME, "assets", "mob")
    os.makedirs(dest, exist_ok=True)

    mons = json.load(open(os.path.join(GAME, "data", "canarymonsters.json")))

    # quem ja tem arte fica como esta: a sprite atual pode ter sido ajustada
    ja_tem = set()
    for a in os.listdir(dest):
        if a.endswith(".png"):
            ja_tem.add(a.rsplit("_", 1)[0])

    feitos = semLook = semArte = 0
    novos = []
    for slug, m in sorted(mons.items()):
        if slug in ja_tem:
            continue
        lt = m.get("looktype")
        if not lt:
            semLook += 1
            continue
        obj = dat.outfit(lt)
        if obj is None or not obj.groups:
            semArte += 1
            continue
        quadros = quadros_da_criatura(spr, obj)
        box = caixa_comum(quadros)
        if box is None:
            semArte += 1
            continue
        for (tag, idx), img in quadros.items():
            if not img.getbbox():
                continue
            nome = "%s_%s.png" % (slug, tag) if idx == 0 \
                else "%s_%s%d.png" % (slug, tag, idx)
            img.crop(box).save(os.path.join(dest, nome), optimize=True)
        feitos += 1
        novos.append(slug)

    print("sprites novas:", feitos, "| sem looktype:", semLook,
          "| looktype sem arte:", semArte)
    # o jogo precisa saber quem virou jogavel
    json.dump(sorted(novos),
              open(os.path.join(GAME, "data", "monstersprites.json"), "w"))


if __name__ == "__main__":
    main()
