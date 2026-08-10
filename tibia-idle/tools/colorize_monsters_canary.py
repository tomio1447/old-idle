"""
colorize_monsters_canary.py — regera os sheets dos monstros humanoides das
hunts usando as CORES OFICIAIS do Canary (lookHead/lookBody/lookLegs/lookFeet
de cada monster .lua) aplicadas com a paleta oficial de 132 cores do client.

O que corrige:
  * amazon/valkyrie estavam "descoloridas" (cinza/preta): o colorize antigo
    usava uma paleta de 96 cores do 7.4 e indices chutados, e o cabelo da
    Amazon saia preto em vez de VERMELHO (lookHead=113 = #BF0000 no client).
  * naga warrior/archer/corrupt/rogue usavam cores arbitrarias do extrator,
    sem a mascara do DAT (lookBody=1 = #FFD4BF, olhos/cabelo cyan 85, etc).
  * o `cols` do sheet (3 vs 9) agora e detectado do proprio PNG, nunca
    chutado.

Uso:
    python3 colorize_monsters_canary.py [dir_com_Tibia.dat] [dir_do_game]

Saida (sobrescreve):
    assets/mob/<slug>.png          sheet 3 colunas x 4 linhas colorido
    data/mobsheets.json            geometria real de cada sheet
    js/mobsheetdata.js             window.MOBSHEETS
"""
import json
import os
import re
import sys

from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from tibia_assets_860 import Dat860, Spr860, render_group_860  # noqa: E402

SRC = sys.argv[1] if len(sys.argv) > 1 else "/tmp/tibia860/extracted"
GAME = sys.argv[2] if len(sys.argv) > 2 else os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "..", "game")

# --------------------------------------------------------------------------
# Paleta oficial de 132 cores do client Tibia (mesma tabela do tibia-outfitter
# e da wiki; o OTClient gera esses mesmos valores pelo HSI com 19x7).
# --------------------------------------------------------------------------
PALETTE = [
    "#FFFFFF", "#FFD4BF", "#FFE9BF", "#FFFFBF", "#E9FFBF", "#D4FFBF",
    "#BFFFBF", "#BFFFD4", "#BFFFE9", "#BFFFFF", "#BFE9FF", "#BFD4FF",
    "#BFBFFF", "#D4BFFF", "#E9BFFF", "#FFBFFF", "#FFBFE9", "#FFBFD4",
    "#FFBFBF", "#DADADA", "#BF9F8F", "#BFAF8F", "#BFBF8F", "#AFBF8F",
    "#9FBF8F", "#8FBF8F", "#8FBF9F", "#8FBFAF", "#8FBFBF", "#8FAFBF",
    "#8F9FBF", "#8F8FBF", "#9F8FBF", "#AF8FBF", "#BF8FBF", "#BF8FAF",
    "#BF8F9F", "#BF8F8F", "#B6B6B6", "#BF7F5F", "#BFAF8F", "#BFBF5F",
    "#9FBF5F", "#7FBF5F", "#5FBF5F", "#5FBF7F", "#5FBF9F", "#5FBFBF",
    "#5F9FBF", "#5F7FBF", "#5F5FBF", "#7F5FBF", "#9F5FBF", "#BF5FBF",
    "#BF5F9F", "#BF5F7F", "#BF5F5F", "#919191", "#BF6A3F", "#BF943F",
    "#BFBF3F", "#94BF3F", "#6ABF3F", "#3FBF3F", "#3FBF6A", "#3FBF94",
    "#3FBFBF", "#3F94BF", "#3F6ABF", "#3F3FBF", "#6A3FBF", "#943FBF",
    "#BF3FBF", "#BF3F94", "#BF3F6A", "#BF3F3F", "#6D6D6D", "#FF5500",
    "#FFAA00", "#FFFF00", "#AAFF00", "#54FF00", "#00FF00", "#00FF54",
    "#00FFAA", "#00FFFF", "#00A9FF", "#0055FF", "#0000FF", "#5500FF",
    "#A900FF", "#FE00FF", "#FF00AA", "#FF0055", "#FF0000", "#484848",
    "#BF3F00", "#BF7F00", "#BFBF00", "#7FBF00", "#3FBF00", "#00BF00",
    "#00BF3F", "#00BF7F", "#00BFBF", "#007FBF", "#003FBF", "#0000BF",
    "#3F00BF", "#7F00BF", "#BF00BF", "#BF007F", "#BF003F", "#BF0000",
    "#242424", "#7F2A00", "#7F5500", "#7F7F00", "#557F00", "#2A7F00",
    "#007F00", "#007F2A", "#007F55", "#007F7F", "#00547F", "#002A7F",
    "#00007F", "#2A007F", "#54007F", "#7F007F", "#7F0055", "#7F002A",
    "#7F0000",
]


def hex_to_rgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def rgb_tuple(c):
    return tuple(c)


# cores oficiais dos monstros, lidas dos .lua do Canary
# (lookHead, lookBody, lookLegs, lookFeet)
CANARY_COLORS = {
    # --- humanoides das hunts (com mascara no DAT)
    "amazon":        (113, 120, 95, 115),   # cabelo vermelho, túnica verde
    "valkyrie":      (113, 38, 76, 96),     # cabelo vermelho, couro marrom
    "witch":         None,                  # looktype 54 sem mascara (vestido preto)
    "priestess":     None,                  # sem mascara
    "necromancer":   None,                  # sem mascara
    "monk":          None,                  # sem mascara
    "hero":          None,                  # sem mascara
    "black-knight":  (95, 95, 95, 95),      # tudo escuro
    # --- nagas (mascara real no DAT 15.x)
    "naga-warrior":  (85, 1, 85, 105),      # cabelo ciano, corpo pele clara
    "naga-archer":   (55, 6, 0, 78),
    "corrupt-naga":  (86, 57, 75, 94),
    "rogue-naga":    (75, 13, 95, 109),
    # --- elfos
    "elf":           None,
    "elf-scout":     None,
    "elf-arcanist":  None,
    # --- dwarfs
    "dwarf":         None,
    "dwarf-soldier": None,
    "dwarf-guard":   None,
    "dwarf-geomancer": None,
    # --- orcs
    "orc":           None,
    "orc-spearman":  None,
    "orc-warrior":   None,
    "orc-shaman":    None,
    "orc-berserker": None,
    "orc-rider":     None,
    "orc-leader":    None,
    "orc-warlord":   None,
    # --- minotaurs
    "minotaur":        None,
    "minotaur-archer": None,
    "minotaur-guard":  None,
    "minotaur-mage":   None,
    # --- piratas
    "pirate-marauder":  None,
    "pirate-cutthroat": None,
    "pirate-buccaneer": None,
    "pirate-corsair":   None,
    # --- misc hunts
    "hunter":        (113, 114, 39, 115),
    "wild-warrior":  (113, 39, 113, 115),
    # Soul War: appearances que usam o mesmo sistema de máscara/paleta.
    "knight-s-apparition": (19, 76, 74, 114),
    "paladin-s-apparition": (57, 42, 114, 114),
    "sorcerer-s-apparition": (95, 114, 52, 76),
    "druid-s-apparition": (114, 48, 114, 95),
    "monk-s-apparition": (114, 48, 114, 95),
    # Rage Squid / Squid Warden compartilham looktype 1059. As quatro cores
    # abaixo são as definidas pelo Canary; a máscara do DAT separa cérebro,
    # corpo e tentáculos. Não aplicar filtro CSS no renderer.
    "rage-squid": (94, 78, 79, 57),
    "squid-warden": (9, 21, 3, 57),
    # Cobra Bastion: mesmo looktype 1217, mas cores oficiais distintas.
    "cobra-vizier":   (19, 19, 67, 78),
    "cobra-scout":    (1, 1, 102, 78),
    "cobra-assassin": (2, 2, 77, 19),
    "giant-spider":  None,
    "stone-golem":   None,
    "crypt-shambler": None,
}

# monstros com looktype "sem mascara" que ainda assim devem ser regerados com
# as cores 0 (branco padrao) — o DAT renderiza a propria cor do sprite.
FORCE_REGEN = {"amazon", "valkyrie", "naga-warrior", "naga-archer",
               "corrupt-naga", "rogue-naga", "black-knight", "hunter",
               "wild-warrior", "necromancer", "witch", "priestess", "monk",
               "hero", "elf", "elf-scout", "elf-arcanist", "dwarf",
               "dwarf-soldier", "dwarf-guard", "dwarf-geomancer", "orc",
               "orc-spearman", "orc-warrior", "orc-shaman", "orc-berserker",
               "orc-rider", "orc-leader", "orc-warlord", "minotaur",
               "minotaur-archer", "minotaur-guard", "minotaur-mage",
               "pirate-marauder", "pirate-cutthroat", "pirate-buccaneer",
               "pirate-corsair", "knight-s-apparition", "paladin-s-apparition",
               "sorcerer-s-apparition", "druid-s-apparition", "monk-s-apparition",
               "rage-squid", "squid-warden", "cobra-vizier", "cobra-scout",
               "cobra-assassin"}

# lookAddons oficial. Scout usa addon 2; Assassin addon 1; Vizier sem addon.
CANARY_ADDONS = {"cobra-vizier": 0, "cobra-scout": 2, "cobra-assassin": 1}

DIRS = (("n", 0), ("e", 1), ("s", 2), ("w", 3))


def ler_looktypes():
    """{slug: looktype} a partir de data/canarymonsters.json."""
    path = os.path.join(GAME, "data", "canarymonsters.json")
    if not os.path.exists(path):
        return {}
    data = json.load(open(path))
    out = {}
    for slug, m in data.items():
        if m and m.get("looktype"):
            out[slug] = m["looktype"]
    return out


def compor_cor(base, mask, head, body, legs, feet):
    """Aplica as cores usando a mascara do DAT (amarelo/vermelho/verde/azul)."""
    if mask is None:
        return base
    if base.size != mask.size:
        mask = mask.crop((0, 0, base.width, base.height))
    b = base.load()
    m = mask.load()
    cores = {
        (255, 255, 0): head,
        (255, 0, 0): body,
        (0, 255, 0): legs,
        (0, 0, 255): feet,
    }
    out = base.copy()
    o = out.load()
    for y in range(base.height):
        for x in range(base.width):
            mp = m[x, y]
            if mp[3] == 0:
                continue
            col = cores.get((mp[0], mp[1], mp[2]))
            if col is None:
                continue
            r, g, bl, a = b[x, y]
            o[x, y] = (r * col[0] // 255, g * col[1] // 255,
                       bl * col[2] // 255, a)
    return out


def gerar_sheet(dat, spr, looktype, colors, addons=0):
    """Renderiza 4 direções × (pose parada + todos os passos), colorido.

    `addons` seleciona o lookAddons do monster.lua. O grupo WALK moderno
    possui até oito frames; truncar em dois deixava humanoides 15x picotados.
    Devolve (sheet, cw, ch, cols).
    """
    obj = dat.outfit(looktype)
    if obj is None or not obj.groups:
        return None
    g_idle = obj.groups[0]
    g_walk = obj.groups[1] if len(obj.groups) > 1 else obj.groups[0]
    poses = [(g_idle, 0)] + [(g_walk, i) for i in range(max(1, g_walk.anim))]

    # caixa comum para todas as células (sem recorte por célula)
    caixas = []
    for tag, xp in DIRS:
        for g, fr in poses:
            img = render_group_860(spr, g, frame=fr % max(1, g.anim),
                                   xp=xp % max(1, g.px),
                                   yp=addons % max(1, g.py), layer=0)
            if img is not None and img.getbbox():
                caixas.append(img.getbbox())
    if not caixas:
        return None
    x0 = min(b[0] for b in caixas)
    y0 = min(b[1] for b in caixas)
    x1 = max(b[2] for b in caixas)
    y1 = max(b[3] for b in caixas)
    cw, ch = x1 - x0, y1 - y0
    if cw <= 0 or ch <= 0:
        return None

    cols = len(poses)
    sheet = Image.new("RGBA", (cw * cols, ch * len(DIRS)), (0, 0, 0, 0))
    for li, (tag, xp) in enumerate(DIRS):
        for ci, (g, fr) in enumerate(poses):
            base = render_group_860(spr, g, frame=fr % max(1, g.anim),
                                    xp=xp % max(1, g.px),
                                    yp=addons % max(1, g.py), layer=0)
            if base is None:
                continue
            if colors:
                mask = render_group_860(spr, g, frame=fr % max(1, g.anim),
                                        xp=xp % max(1, g.px),
                                        yp=addons % max(1, g.py), layer=1)
                base = compor_cor(base, mask, *colors)
            cel = base.crop((x0, y0, x1, y1))
            sheet.paste(cel, (ci * cw, li * ch))
    return sheet, cw, ch, cols


def main():
    dat = Dat860(os.path.join(SRC, "Tibia.dat"))
    spr = Spr860(os.path.join(SRC, "Tibia.spr"))
    looktypes = ler_looktypes()

    dest = os.path.join(GAME, "assets", "mob")
    meta_path = os.path.join(GAME, "data", "mobsheets.json")
    js_path = os.path.join(GAME, "js", "mobsheetdata.js")

    meta = json.load(open(meta_path)) if os.path.exists(meta_path) else {}

    # Slugs opcionais depois de SRC/GAME permitem regenerar só uma hunt.
    only = set(sys.argv[3:])
    targets = FORCE_REGEN & only if only else FORCE_REGEN
    feitos = 0
    for slug in sorted(targets):
        lt = looktypes.get(slug)
        if not lt:
            print("  sem looktype:", slug)
            continue
        colors = CANARY_COLORS.get(slug)
        rgb_colors = None
        if colors is not None:
            rgb_colors = tuple(hex_to_rgb(PALETTE[c % len(PALETTE)]) for c in colors)
        res = gerar_sheet(dat, spr, lt, rgb_colors, CANARY_ADDONS.get(slug, 0))
        if res is None:
            print("  falhou:", slug, "looktype", lt)
            continue
        sheet, cw, ch, cols = res
        sheet.save(os.path.join(dest, slug + ".png"), optimize=True)
        meta[slug] = {"cw": cw, "ch": ch, "cols": cols, "rows": 4}
        feitos += 1
        print("  ok:", slug, "looktype", lt, "cores", colors,
              "addon", CANARY_ADDONS.get(slug, 0), "cols", cols,
              "cw", cw, "ch", ch)

    # Não reduza sheets existentes a três colunas. Alguns outfits do cliente
    # têm 4, 5, 7 ou 9 frames por direção; o catálogo precisa preservar a
    # geometria verdadeira para o recorte do canvas e das miniaturas.
    json.dump(meta, open(meta_path, "w"))
    with open(js_path, "w") as f:
        f.write("/* Gerado por tools/colorize_monsters_canary.py\n"
                " * Spritesheet por criatura: coluna = pose (0 parado, 1..N\n"
                " * passos), linha = direcao (0 N, 1 E, 2 S, 3 O). */\n")
        f.write("window.MOBSHEETS = " + json.dumps(meta) + ";\n")
    print("sheets coloridos:", feitos)


if __name__ == "__main__":
    main()
