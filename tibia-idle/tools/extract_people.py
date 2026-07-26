"""
Extrai as outfits REAIS das vocacoes (Knight, Hunter, Mage, Summoner...) e os NPCs.

IMPORTANTE: os sprites sao usados EXATAMENTE como estao no Tibia.spr.
A arte do Tibia e desenhada em perspectiva isometrica (45 graus), entao as
figuras sao naturalmente inclinadas — isso NAO e defeito e nao deve ser
"corrigido". Qualquer tentativa de endireitar deforma o pixel art original.
"""
import os
from PIL import Image
from render import load, render_outfit

OUT = "/home/user/tibia-idle/game/assets"
os.makedirs(OUT + "/outfit", exist_ok=True)
os.makedirs(OUT + "/npc", exist_ok=True)
dat, spr = load()


def build(looktype, colors=None):
    """
    Renderiza as 4 direcoes do sprite, sem alterar a arte original.
    Cada direcao tem 3 frames de animacao (0 = parado, 1 e 2 = passos),
    salvos como nome_dir.png (parado) e nome_dir1.png / nome_dir2.png.
    """
    obj = dat.outfit(looktype)
    if obj is None:
        return {}
    g = obj.groups[0]
    use = colors if g.layers > 1 else None
    frames = {}
    for tag, direction in (("s", 2), ("w", 3), ("n", 0), ("e", 1)):
        for f in range(g.anim):
            img = render_outfit(dat, spr, looktype, direction=direction,
                                colors=use, frame=f)
            if img is None or not img.getbbox():
                continue
            key = tag if f == 0 else "%s%d" % (tag, f)
            frames[key] = img.crop(img.getbbox())
    return frames


# ---- outfits REAIS de cada vocacao, com as cores classicas do Tibia
#      (head, body, legs, feet) na paleta de outfit do 7.4
PLAYER = {
    "knight-m":   (131, (95, 116, 116, 95)),    # Knight
    "knight-f":   (139, (95, 116, 116, 95)),
    "hunter-m":   (129, (78, 68, 58, 76)),      # Hunter (paladin)
    "hunter-f":   (137, (78, 68, 58, 76)),
    "summoner-m": (133, (79, 78, 78, 76)),      # Summoner (druid)
    "summoner-f": (138, (79, 78, 78, 76)),
    "mage-m":     (130, (86, 50, 50, 86)),      # Mage (sorcerer)
    "mage-f":     (141, (86, 50, 50, 86)),
    "citizen-m":  (128, (78, 68, 58, 76)),      # Citizen
    "citizen-f":  (136, (113, 68, 58, 76)),
}

for name, (lt, colors) in PLAYER.items():
    for tag, img in build(lt, colors).items():
        img.save("%s/outfit/%s_%s.png" % (OUT, name, tag))

# ---- NPCs: tambem com outfits humanas reais, cada um com cor propria
NPCS = {
    "shopkeeper": (128, (114, 94, 94, 114)),    # Citizen — lojista
    "magicshop":  (130, (0, 86, 86, 0)),        # Mage — runas
    "blacksmith": (134, (95, 116, 116, 95)),    # Warrior — ferreiro
    "banker":     (132, (95, 39, 39, 114)),     # Nobleman — banco
    "priest":     (133, (0, 0, 0, 0)),          # Summoner — templo
    "trainer":    (131, (86, 86, 86, 86)),      # Knight — academia
    "innkeeper":  (136, (113, 78, 78, 76)),     # Citizen fem — estalagem
    "captain":    (129, (95, 95, 95, 86)),      # Hunter — viagens
}

for name, (lt, colors) in NPCS.items():
    for tag, img in build(lt, colors).items():
        img.save("%s/npc/%s_%s.png" % (OUT, name, tag))


print("player outfits:", len(PLAYER), "| npcs:", len(NPCS))
print("sprites gravados sem qualquer alteracao da arte original")
