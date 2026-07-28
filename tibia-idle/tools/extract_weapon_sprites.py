#!/usr/bin/env python3
"""
Extrai do SPR/DAT 8.60 as sprites dos itens importados por import_weapons.py.

Grava dois arquivos por item quando ele e animado:

    assets/item/<slug>.png        frame 0 (usado por todo <img> ja existente)
    assets/item/<slug>_anim.png   tira horizontal com os N frames

A tira e o formato mais barato para o navegador: uma requisicao so e a
animacao vira `background-position` com `steps(N)` no CSS, sem JS por item.

Uso: python3 extract_weapon_sprites.py [categoria ...]
     (sem argumento processa tudo que estiver no weapons.json)
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

from PIL import Image                                        # noqa: E402
from tibia_assets_860 import (Dat860, Spr860,                # noqa: E402
                              render_group_860)

SRC = os.environ.get("ASSETS860", "/home/user/assets860/ex")
GAME = os.path.normpath(os.path.join(HERE, "..", "game"))
MAX_FRAMES = 8          # tiras maiores que isso viram peso morto no disco

# Mesmo mapa de WD_ALIAS em game/js/weapons.js: itens que ja existiam no jogo
# com outra grafia. A sprite precisa ser gravada TAMBEM no slug antigo, senao
# o item mesclado continua exibindo a arte velha do 7.4.
ALIAS = {
    "broadsword": "broad-sword",
    "bunnyslippers": "bunny-slippers",
}


def recorta_comum(frames):
    """Recorta todos os frames pela MESMA caixa (a uniao das caixas).

    Recortar cada frame pela propria bbox faria a arte pular de posicao
    durante a animacao -- foi o que aconteceu na primeira tentativa com a
    magic longsword.
    """
    caixa = None
    for f in frames:
        b = f.getbbox()
        if not b:
            continue
        caixa = b if caixa is None else (
            min(caixa[0], b[0]), min(caixa[1], b[1]),
            max(caixa[2], b[2]), max(caixa[3], b[3]))
    if caixa is None:
        return None
    return [f.crop(caixa) for f in frames]


def main():
    alvos = sys.argv[1:]
    dados = json.load(open(os.path.join(GAME, "data", "weapons.json"),
                           encoding="utf-8"))
    itens, cats = dados["items"], dados["cats"]
    slugs = []
    if alvos:
        for c in alvos:
            slugs += cats.get(c, [])
    else:
        slugs = list(itens)
    slugs = sorted(set(slugs))

    dat = Dat860(os.path.join(SRC, "Tibia.dat"))
    spr = Spr860(os.path.join(SRC, "Tibia.spr"))
    destino = os.path.join(GAME, "assets", "item")
    os.makedirs(destino, exist_ok=True)

    ok = anim = falta = 0
    artes = set()
    for slug in slugs:
        it = itens[slug]
        obj = dat.item(it["id"])
        if obj is None or not obj.groups:
            falta += 1
            it.pop("af", None)
            continue
        g = obj.groups[0]
        n = min(g.anim, MAX_FRAMES)
        frames = [render_group_860(spr, g, frame=i) for i in range(n)]
        frames = recorta_comum(frames)
        if not frames:
            falta += 1
            it.pop("af", None)
            continue
        nomes = [slug] + ([ALIAS[slug]] if slug in ALIAS else [])
        for nm in nomes:
            frames[0].save(os.path.join(destino, nm + ".png"))
        artes.add(frames[0].tobytes())
        ok += 1
        # so vira tira se os frames forem realmente diferentes entre si:
        # varios itens do DAT declaram anim>1 repetindo a mesma arte
        distintos = len({f.tobytes() for f in frames})
        if len(frames) > 1 and distintos > 1:
            w, h = frames[0].size
            tira = Image.new("RGBA", (w * len(frames), h), (0, 0, 0, 0))
            for i, f in enumerate(frames):
                tira.paste(f, (i * w, 0))
            for nm in nomes:
                tira.save(os.path.join(destino, nm + "_anim.png"))
            it["af"] = len(frames)
            it["aw"] = w
            it["ah"] = h
            anim += 1
        else:
            it.pop("af", None)
            it.pop("aw", None)
            it.pop("ah", None)
            for nm in nomes:
                p = os.path.join(destino, nm + "_anim.png")
                if os.path.exists(p):
                    os.remove(p)

    # regrava o json/js porque o campo `af` so e confiavel depois de conferir
    # se os frames sao mesmo diferentes
    with open(os.path.join(GAME, "data", "weapons.json"), "w",
              encoding="utf-8") as fh:
        json.dump(dados, fh, ensure_ascii=False, indent=1, sort_keys=True)
    with open(os.path.join(GAME, "js", "weapondata.js"), "w",
              encoding="utf-8") as fh:
        fh.write("/* Gerado por tools/import_weapons.py + "
                 "extract_weapon_sprites.py -- nao editar a mao. */\n")
        fh.write("window.WEAPONDATA = ")
        json.dump(dados, fh, ensure_ascii=False, separators=(",", ":"),
                  sort_keys=True)
        fh.write(";\n")

    print("sprites: %d gravadas (%d artes distintas), %d animadas, %d sem arte"
          % (ok, len(artes), anim, falta))


if __name__ == "__main__":
    main()
