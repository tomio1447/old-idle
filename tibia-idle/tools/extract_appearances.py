#!/usr/bin/env python3
"""Extrai as 252 outfits (com os 2 addons) e as 236 montarias do Canary.

Como funciona no DAT: cada outfit e um objeto com frame groups. Dentro do
grupo, o eixo `yp` (pattern Y) separa as camadas de addon:

    yp = 0  -> corpo base
    yp = 1  -> overlay do addon 1
    yp = 2  -> overlay do addon 2

Os overlays sao desenhados POR CIMA da base, entao addon 3 = base + 1 + 2.
234 das 252 outfits tem os dois addons; as demais so tem a base.

As montarias sao outfits normais, com looktype proprio (`clientId` no
mounts.xml), e por isso saem pelo mesmo caminho.

Cada sprite vira dois PNGs: `.base.png` (arte neutra) e `.mask.png` (areas
head/body/legs/feet), que o js/outfit.js multiplica pela cor escolhida. Esse
e o mesmo esquema que as outfits do jogador ja usavam.

Uso: python3 extract_appearances.py [dir_com_Tibia.dat] [dir_do_game]
"""
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from tibia_assets_860 import Dat860, Spr860, render_group_860  # noqa: E402

SRC = sys.argv[1] if len(sys.argv) > 1 else "/home/user/assets860/ex"
GAME = sys.argv[2] if len(sys.argv) > 2 else os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "..", "game")

# so a direcao sul: o seletor de aparencia mostra o personagem de frente e
# guardar 4 direcoes de 252 outfits x 3 addons seria 3.000 PNGs sem uso
DIRECAO_SUL = 2


def slug(nome):
    s = re.sub(r"[^a-z0-9]+", "-", (nome or "").lower())
    return s.strip("-") or "sem-nome"


def salvar(img, caminho):
    """Recorta o vazio e grava. Devolve a caixa usada, para a mascara casar."""
    if img is None:
        return None
    box = img.getbbox()
    if not box:
        return None
    img.crop(box).save(caminho)
    return box


def exportar(dat, spr, looktype, destino, nome_arquivo, addons=True):
    """Grava base+mask de um looktype. Devolve quantos addons saiu."""
    obj = dat.outfit(looktype)
    if obj is None or not obj.groups:
        return -1
    g = obj.groups[0]
    xp = DIRECAO_SUL % max(1, g.px)
    # quantas camadas de addon esse looktype tem (1 = so a base)
    camadas = min(3, g.py) if addons else 1
    saiu = 0
    for yp in range(camadas):
        base = render_group_860(spr, g, frame=0, xp=xp, yp=yp, layer=0)
        if base is None or not base.getbbox():
            continue
        sufixo = "" if yp == 0 else "-a%d" % yp
        box = salvar(base, os.path.join(
            destino, "%s%s.base.png" % (nome_arquivo, sufixo)))
        if box is None:
            continue
        if g.layers > 1:
            mask = render_group_860(spr, g, frame=0, xp=xp, yp=yp, layer=1)
            if mask is not None:
                mask.crop(box).save(os.path.join(
                    destino, "%s%s.mask.png" % (nome_arquivo, sufixo)))
        saiu += 1
    return saiu


def main():
    print("lendo", SRC)
    dat = Dat860(os.path.join(SRC, "Tibia.dat"))
    spr = Spr860(os.path.join(SRC, "Tibia.spr"))

    canary = json.load(open(os.path.join(GAME, "data", "canary.json"),
                            encoding="utf-8"))
    dir_out = os.path.join(GAME, "assets", "appearance", "outfit")
    dir_mnt = os.path.join(GAME, "assets", "appearance", "mount")
    os.makedirs(dir_out, exist_ok=True)
    os.makedirs(dir_mnt, exist_ok=True)

    # ------------------------------------------------------------- outfits
    catalogo = []
    vistos = {}
    sem_sprite = 0
    for o in canary["outfits"]:
        lt = o["looktype"]
        s = slug(o["name"])
        # o mesmo nome aparece nas versoes masculina e feminina (type 0/1)
        sexo = "m" if o.get("type") == 0 else "f"
        arquivo = "%s-%s" % (s, sexo)
        if arquivo in vistos:            # nomes repetidos no canary
            arquivo = "%s-%s-%d" % (s, sexo, lt)
        vistos[arquivo] = True
        n = exportar(dat, spr, lt, dir_out, arquivo)
        if n <= 0:
            sem_sprite += 1
            continue
        catalogo.append({
            "id": arquivo, "nome": o["name"], "looktype": lt,
            "sexo": sexo, "premium": bool(o.get("premium")),
            # quantos addons esse visual tem de fato (0, 1 ou 2)
            "addons": max(0, n - 1),
        })
    print("outfits: %d exportadas, %d sem sprite" % (len(catalogo), sem_sprite))

    # ----------------------------------------------------------- montarias
    cat_m = []
    vistos_m = {}
    sem_m = 0
    for m in canary["mounts"]:
        s = slug(m["name"])
        if s in vistos_m:
            s = "%s-%d" % (s, m["id"])
        vistos_m[s] = True
        # montaria nao tem addon: e um bicho so
        n = exportar(dat, spr, m["clientId"], dir_mnt, s, addons=False)
        if n <= 0:
            sem_m += 1
            continue
        cat_m.append({
            "id": s, "nome": m["name"], "looktype": m["clientId"],
            "mountId": m["id"], "speed": m.get("speed", 0),
            "premium": bool(m.get("premium")),
        })
    print("montarias: %d exportadas, %d sem sprite" % (len(cat_m), sem_m))

    # ------------------------------------------------------------- catalogo
    dados = {"outfits": catalogo, "mounts": cat_m}
    with open(os.path.join(GAME, "data", "appearances.json"), "w",
              encoding="utf-8") as fh:
        json.dump(dados, fh, ensure_ascii=False, separators=(",", ":"))
    with open(os.path.join(GAME, "js", "appearancedata.js"), "w",
              encoding="utf-8") as fh:
        fh.write("/* Gerado por tools/extract_appearances.py\n"
                 " * Outfits e montarias do canary com sprites do DAT 8.60.\n"
                 " * O eixo yp do frame group separa base (0) e addons (1, 2). */\n")
        fh.write("window.APPEARANCES = " +
                 json.dumps(dados, ensure_ascii=False,
                            separators=(",", ":")) + ";\n")

    com2 = sum(1 for o in catalogo if o["addons"] == 2)
    print("outfits com os 2 addons: %d" % com2)
    print("arquivos em assets/appearance/{outfit,mount}")


if __name__ == "__main__":
    main()
