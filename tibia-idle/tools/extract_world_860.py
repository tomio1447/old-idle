"""
Regenera os ultimos sprites que ainda vinham do Tibia 7.4:
NPCs da cidade, tiles de cenario urbano e os chaos das hunts.

Depois deste script nao sobra nenhum asset do client antigo: outfits,
monstros, itens, projeteis, efeitos, NPCs, cidade e chao passam todos a
usar a arte 15.x/8.60.

Os ids de chao e mobilia da faixa classica (100-1000) sao estaveis entre
as versoes — conferido contra o items.xml do Canary, onde grass ainda e
106, dirt 103 e sand 104. Os nomes vao pelo Canary quando existirem.

Uso:
    TIBIA860=/caminho/extracted python3 extract_world_860.py
"""
import os
import random
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from PIL import Image  # noqa: E402
from tibia_assets_860 import (Dat860, Spr860, render_item_860,  # noqa: E402
                              render_outfit_860)

SRC = os.environ.get("TIBIA860", "/tmp/newassets/extracted")
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(HERE, "..", "game", "assets"))
CANARY_XML = os.path.join(HERE, "data", "canary-items.xml")

for sub in ("npc", "city", "ground"):
    os.makedirs(os.path.join(OUT, sub), exist_ok=True)

print("lendo assets de", SRC)
dat = Dat860(os.path.join(SRC, "Tibia.dat"))
spr = Spr860(os.path.join(SRC, "Tibia.spr"))

NOMES = {}
if os.path.exists(CANARY_XML):
    _xml = open(CANARY_XML, encoding="iso-8859-1").read()
    for _m in re.finditer(r'<item id="(\d+)"[^>]*name="([^"]+)"', _xml):
        NOMES.setdefault(_m.group(2).strip().lower(), int(_m.group(1)))
    print("  %d nomes de item do Canary" % len(NOMES))

DIRS = (("s", 2), ("w", 3), ("n", 0), ("e", 1))
TILE = 32


def tile_de(cid, nome=None):
    """Renderiza um tile 32x32 a partir do id (ou do nome no Canary)."""
    for c in (NOMES.get(nome) if nome else None, cid):
        if not c:
            continue
        img = render_item_860(dat, spr, c)
        if img is None or not img.getbbox():
            continue
        # tiles de chao devem preencher o quadrado inteiro
        if img.size != (TILE, TILE):
            img = img.crop((0, 0, min(TILE, img.width), min(TILE, img.height)))
            if img.size != (TILE, TILE):
                base = Image.new("RGBA", (TILE, TILE), (0, 0, 0, 0))
                base.alpha_composite(img, (0, 0))
                img = base
        return img
    return None


# ---------------------------------------------------------------- NPCs
# looktype + cores (head, body, legs, feet).
# A paleta de outfit tem 96 cores: indices acima disso davam wrap e caiam
# em branco/cinza, que era o motivo dos NPCs saírem todos esbranquiçados.
NPCS = {
    "shopkeeper": (128, (95, 68, 58, 76)),    # cidadao de marrom
    "magicshop":  (130, (0, 86, 86, 0)),      # mago de azul
    "banker":     (132, (79, 50, 50, 76)),    # nobre de vinho
    "priest":     (133, (94, 94, 94, 94)),    # tunica escura
    "trainer":    (131, (86, 88, 88, 86)),    # knight
    "blacksmith": (134, (78, 68, 58, 76)),    # ferreiro
    "innkeeper":  (136, (94, 39, 39, 76)),   # estalajadeira
    "captain":    (129, (95, 39, 39, 88)),    # capitao
}


def export_npcs():
    ok = 0
    for nome, (lt, cores) in NPCS.items():
        for tag, direcao in DIRS:
            img = render_outfit_860(dat, spr, lt, direction=direcao,
                                    frame=0, colors=cores, group=0)
            if img is None or not img.getbbox():
                continue
            img.crop(img.getbbox()).save("%s/npc/%s_%s.png" % (OUT, nome, tag))
            ok += 1
    print("  npc: %d sprites" % ok)


# ------------------------------------------------------- decoracao urbana
# ids classicos, estaveis entre versoes
# decoracao urbana: ids resolvidos pelo nome no items.xml do Canary,
# com o id classico como reserva quando o nome nao existe mais.
DECO = {
    "tree-fir":      (3614, "fir tree"),
    "tree-magic":    (9587, "tree"),
    "bush":          (3681, "bush"),
    "bush-berry":    (3682, None),
    "flowers":       (2981, "god flowers"),
    "barrel":        (2519, "barrel"),
    "box":           (119,  "box"),
    "crate":         (116,  "crate"),
    "chair":         (2358, "wooden chair"),
    "table":         (2339, "table"),
    "bed":           (694,  "bed"),
    "counter":       (2334, None),
    "locker":        (2449, "locker"),
    "depot":         (3502, "depot chest"),
    "mailbox":       (3501, "mailbox"),
    "sign":          (2967, None),
    "signpost":      (2965, None),
    "lamp":          (2914, "lamp"),
    "torch-wall":    (2050, None),
    "pillar":        (6986, "pillar"),
    "pillar-marble": (1425, None),
    "stairs":        (428,  "stairs"),
    "statue-angel":  (2025, "statue"),
    "statue-dwarf":  (2026, None),
    "statue-hero":   (2027, None),
    "fountain-a":    (21438, "fountain"),
    "fountain-b":    (1363, None),
    "fountain-c":    (1364, None),
    "fountain-d":    (1365, None),
    "altar":         (1488, None),
    "altar-b":       (1489, None),
    "altar-stone":   (1490, None),
    "door-h":        (1219, None),
    "door-v":        (1225, None),
    "door-open-h":   (1220, None),
    "door-open-v":   (1226, None),
}


def export_city_deco():
    ok = falhou = 0
    faltando = []
    for nome, (cid, cnome) in DECO.items():
        destino = "%s/city/%s.png" % (OUT, nome)
        if not os.path.exists(destino):
            continue                      # só atualiza o que o jogo já usa
        img = None
        for c in (NOMES.get(cnome) if cnome else None, cid):
            if not c:
                continue
            cand = render_item_860(dat, spr, c)
            if cand is not None and cand.getbbox():
                img = cand
                break
        if img is None:
            faltando.append(nome)
            falhou += 1
            continue
        img.crop(img.getbbox()).save(destino)
        ok += 1
    print("  city: %d atualizados, %d mantidos" % (ok, falhou))
    if faltando:
        print("    sem equivalente:", ", ".join(faltando[:15]))


# ---------------------------------------------------------------- chaos
# tiles por cena; nome do Canary quando existe, senao o id classico
SCENES = {
    "sewer":     [(351, None), (352, None), (353, None), (354, None), (355, None)],
    "cave":      [(351, None), (352, None), (354, None), (356, None), (101, None)],
    "swamp":     [(530, None), (531, None), (532, None), (533, None)],
    "fortress":  [(726, None), (727, None), (351, None), (352, None)],
    "crypt":     [(412, None), (413, None), (416, None), (417, None)],
    "labyrinth": [(465, None), (467, None), (431, None), (413, None)],
    "mine":      [(351, None), (352, None), (105, None), (146, None)],
    "forest":    [(102, None), (103, "dirt"), (106, "grass"), (110, None)],
    "valley":    [(102, None), (105, None), (146, None), (147, None)],
    "desert":    [(104, "sand"), (134, None), (135, None), (136, None)],
    "temple":    [(406, None), (407, None), (965, None), (966, None)],
    "palace":    [(967, None), (968, None), (969, None), (970, None)],
    "nest":      [(530, None), (532, None), (351, None), (354, None)],
    "island":    [(104, "sand"), (134, None), (102, None), (103, "dirt")],
    "tower":     [(407, None), (966, None), (412, None), (419, None)],
    "lair":      [(351, None), (354, None), (356, None), (101, None)],
    "hall":      [(405, None), (424, None), (425, None), (426, None)],
    "glacier":   [(670, None), (671, None), (684, None), (685, None)],
    "hell":      [(351, None), (356, None), (101, None), (107, None)],
    "city":      [(724, None), (725, None), (726, None), (727, None)],
}

W_TILES, H_TILES = 16, 8
DECOR_CHAO = {"lava": (519, "lava"), "water": (491, "water"), "fire": (1506, None)}


def export_ground():
    ok = falhou = 0
    rng = random.Random(7)
    for cena, ids in SCENES.items():
        destino = "%s/ground/%s.png" % (OUT, cena)
        if not os.path.exists(destino):
            continue
        variantes = []
        for cid, nome in ids:
            t = tile_de(cid, nome)
            if t is not None:
                variantes.append(t)
        if not variantes:
            falhou += 1
            continue
        w = 20 if cena == "city" else W_TILES
        h = 10 if cena == "city" else H_TILES
        sheet = Image.new("RGBA", (w * TILE, h * TILE), (20, 20, 20, 255))
        for y in range(h):
            for x in range(w):
                sheet.alpha_composite(rng.choice(variantes), (x * TILE, y * TILE))
        sheet.save(destino)
        ok += 1
    for nome, (cid, cnome) in DECOR_CHAO.items():
        destino = "%s/ground/deco-%s.png" % (OUT, nome)
        if not os.path.exists(destino):
            continue
        img = tile_de(cid, cnome)
        if img is not None:
            img.save(destino)
            ok += 1
    print("  ground: %d cenas/decor atualizados, %d sem tile" % (ok, falhou))


if __name__ == "__main__":
    print("\n[1/3] NPCs")
    export_npcs()
    print("\n[2/3] decoracao da cidade")
    export_city_deco()
    print("\n[3/3] chao das hunts")
    export_ground()
    print("\npronto —", OUT)
