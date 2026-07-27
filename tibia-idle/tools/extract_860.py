"""
Regenera TODOS os sprites do jogo a partir dos assets 15.x-with-8.60
(https://github.com/Levi999x/15.x-with-8.60).

Mantem exatamente os mesmos nomes de arquivo que o jogo ja consome, entao
nenhum codigo do cliente precisa mudar:

    assets/outfit/<nome>_<dir>[frame].base.png  + .mask.png
    assets/mob/<slug>_<dir>.png
    assets/item/<slug>.png

Alguns client ids mudaram entre o 7.4 e o 15.x (as municoes, por exemplo).
Para esses casos o script resolve o id pelo nome usando o items.xml novo,
com fallback para o id antigo.

Uso:
    TIBIA860=/caminho/para/extracted python3 extract_860.py
"""
import json
import os
import re
import sys

from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from tibia_assets_860 import (Dat860, Spr860, render_outfit_860,  # noqa: E402
                              render_item_860, render_group_860)

SRC = os.environ.get("TIBIA860", "/tmp/newassets/extracted")
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(HERE, "..", "game", "assets"))
ITEMS_XML = os.environ.get("ITEMS_XML", "/tmp/newassets/items.xml")

for sub in ("outfit", "mob", "item"):
    os.makedirs(os.path.join(OUT, sub), exist_ok=True)

print("lendo assets 8.60 de", SRC)
dat = Dat860(os.path.join(SRC, "Tibia.dat"))
spr = Spr860(os.path.join(SRC, "Tibia.spr"))
print("  %d itens, %d outfits, %d sprites" % (dat.item_count, dat.outfit_count, spr.count))

DIRS = (("s", 2), ("w", 3), ("n", 0), ("e", 1))

# ------------------------------------------------------------ outfits do player
# looktypes dos 8.60 (mesmos ids classicos); colors = paleta padrao do jogo
PLAYER = {
    "knight-m":   (131, (95, 116, 116, 95)),
    "knight-f":   (139, (95, 116, 116, 95)),
    "hunter-m":   (129, (78, 68, 58, 76)),
    "hunter-f":   (137, (78, 68, 58, 76)),
    "summoner-m": (133, (79, 78, 78, 76)),
    "summoner-f": (138, (79, 78, 78, 76)),
    "mage-m":     (130, (86, 50, 50, 86)),
    "mage-f":     (141, (86, 50, 50, 86)),
    "citizen-m":  (128, (78, 68, 58, 76)),
    "citizen-f":  (136, (113, 68, 58, 76)),
}


def pick_group(obj, want_moving):
    """8.60 traz 2 frame groups por outfit: 0 = idle, 1 = andando."""
    if not obj.groups:
        return None, 0
    if want_moving and len(obj.groups) > 1:
        return obj.groups[1], 1
    return obj.groups[0], 0


def export_player_outfits():
    total = 0
    for name, (lt, _colors) in PLAYER.items():
        obj = dat.outfit(lt)
        if obj is None:
            print("  !! outfit ausente:", name, lt)
            continue
        for tag, direction in DIRS:
            # frame 0 = parado (grupo idle) | frames 1 e 2 = passos (grupo andando)
            for f in range(3):
                moving = f > 0
                g, gi = pick_group(obj, moving)
                if g is None:
                    continue
                # dentro do grupo de andar, os frames de passo comecam em 0
                frame = (f - 1) % max(1, g.anim) if moving else 0
                base = render_group_860(spr, g, frame=frame,
                                        xp=direction % max(1, g.px), yp=0, layer=0)
                if base is None or not base.getbbox():
                    continue
                mask = None
                if g.layers > 1:
                    mask = render_group_860(spr, g, frame=frame,
                                            xp=direction % max(1, g.px), yp=0,
                                            layer=1)
                box = base.getbbox()
                key = tag if f == 0 else "%s%d" % (tag, f)
                base.crop(box).save("%s/outfit/%s_%s.base.png" % (OUT, name, key))
                total += 1
                if mask is not None:
                    mask.crop(box).save("%s/outfit/%s_%s.mask.png" % (OUT, name, key))
                    total += 1
                # PNG plano (compatibilidade com o fallback do OutfitRenderer)
                flat = render_outfit_860(dat, spr, lt, direction=direction,
                                         frame=frame, colors=_colors, group=gi)
                if flat is not None and flat.getbbox():
                    flat.crop(box if flat.size == base.size
                              else flat.getbbox()).save(
                        "%s/outfit/%s_%s.png" % (OUT, name, key))
                    total += 1
    print("  outfits: %d arquivos" % total)


# ------------------------------------------------------------ monstros
MONSTER_LOOKTYPES = {
    "rat": 21, "cave-rat": 56, "snake": 28, "spider": 30, "bug": 45,
    "wasp": 44, "scorpion": 43, "rotworm": 26, "carrion-worm": 26,
    "poison-spider": 36, "wolf": 27, "bear": 16, "polar-bear": 42,
    "troll": 15, "swamp-troll": 76, "frost-troll": 53, "goblin": 61,
    "orc": 5, "orc-spearman": 50, "orc-warrior": 7, "orc-shaman": 6,
    "orc-berserker": 8, "orc-rider": 4, "orc-leader": 59, "orc-warlord": 2,
    "war-wolf": 3, "minotaur": 25, "minotaur-archer": 24, "minotaur-guard": 29,
    "minotaur-mage": 23, "skeleton": 33, "ghoul": 18, "mummy": 65,
    "demon-skeleton": 37, "crypt-shambler": 100, "bonebeast": 101,
    "vampire": 68, "banshee": 78, "lich": 99, "ghost": 48,
    "cyclops": 22, "dwarf": 69, "dwarf-soldier": 71, "dwarf-guard": 70,
    "dwarf-geomancer": 66, "stone-golem": 67, "elf": 62, "elf-scout": 64,
    "elf-arcanist": 63, "witch": 54, "monk": 57, "priestess": 58,
    "hero": 73, "black-knight": 131, "necromancer": 9, "bonelord": 17,
    "elder-bonelord": 108, "gazer": 109, "giant-spider": 38, "slime": 19,
    "fire-devil": 40, "fire-elemental": 49, "dragon": 34, "dragon-lord": 39,
    "demon": 35, "behemoth": 55, "hydra": 121, "serpent-spawn": 219,
    "green-djinn": 51, "blue-djinn": 80, "efreet": 103, "marid": 104,
    "gargoyle": 95, "scarab": 83, "ancient-scarab": 79, "larva": 82,
    "cobra": 81, "quara-predator": 20, "yeti": 110, "winter-wolf": 52,
    "hyaena": 94, "lion": 41, "badger": 105, "deer": 31, "rabbit": 74,
    "pirate-marauder": 93, "pirate-cutthroat": 96, "pirate-buccaneer": 97,
    "pirate-corsair": 98, "mimic": 92, "pig": 60, "sheep": 14,
    "black-sheep": 13, "dog": 32, "butterfly": 10, "beholder": 17,
    "dwarf-miner": 69, "amazon": 137, "valkyrie": 139, "swamp-thing": 51,
}

HUMANOID_COLORS = {
    "witch": (114, 86, 86, 0), "monk": (95, 95, 95, 95),
    "priestess": (114, 86, 86, 0), "hero": (0, 132, 132, 114),
    "black-knight": (0, 0, 0, 0), "necromancer": (0, 86, 86, 0),
    "amazon": (113, 39, 113, 115), "valkyrie": (95, 113, 39, 115),
    "pirate-marauder": (95, 76, 76, 114),
}


def export_mobs():
    ok = miss = 0
    for name, lt in MONSTER_LOOKTYPES.items():
        obj = dat.outfit(lt)
        if obj is None or not obj.groups:
            print("  !! sem outfit:", name, lt)
            miss += 1
            continue
        colors = HUMANOID_COLORS.get(name)
        if obj.groups[0].layers > 1 and colors is None:
            colors = (78, 68, 58, 76)
        wrote = False
        for tag, direction in DIRS:
            img = render_outfit_860(dat, spr, lt, direction=direction,
                                    frame=0, colors=colors, group=0)
            if img is None or not img.getbbox():
                continue
            img.crop(img.getbbox()).save("%s/mob/%s_%s.png" % (OUT, name, tag))
            wrote = True
        ok += wrote
        miss += (not wrote)
    print("  monstros: %d ok, %d sem sprite" % (ok, miss))


# ------------------------------------------------------------ itens
def load_name_to_id():
    """server id -> nome, a partir do items.xml novo."""
    out = {}
    try:
        xml = open(ITEMS_XML, encoding="iso-8859-1").read()
    except OSError:
        return out
    for m in re.finditer(r'<item id="(\d+)"[^>]*name="([^"]+)"', xml):
        n = m.group(2).strip().lower()
        if n not in out:
            out[n] = int(m.group(1))
    return out


NEW_IDS = load_name_to_id()

# Client ids que mudaram do 7.4 para o 15.x e que o items.xml nao resolve
# sozinho (as municoes foram renumeradas na faixa 24xxx).
OVERRIDE_IDS = {
    # municoes: os ids 24xxx do items.xml sao as PILHAS grandes (2x2 tiles).
    # O icone unitario, que e o que o inventario precisa, fica em server-40.
    "arrow": 2504,
    "bolt": 2503,
    "poison-arrow": 2505,
    "burst-arrow": 2506,
    "power-bolt": 2507,
    "infernal-bolt": 6529,
    "spear": 2389,
    "ancient-amulet": 2142,
    "golden-legs": 2470,
    "hoe": 2552,
    "pick": 2553,
    "present": 1990,
    "scythe": 2550,
    "shovel": 2554,
    "small-amethyst": 2150,
    "small-axe": 2559,
    "small-emerald": 2149,
    "strange-helmet": 2479,
    "talon": 2151,
    "white-pearl": 2143,
    "mana-fluid": 7590,
    "health-potion": 7618,
}


def item_id_for(slug, name, old_id):
    """Escolhe o client id que realmente tem sprite no 8.60.

    O items.xml lista SERVER ids; o dat indexa por CLIENT id. Na faixa
    classica do Tibia a diferenca costuma ser de 40 (server 2142 =
    client 2102), entao esse deslocamento entra como ultimo fallback.
    """
    xml_id = NEW_IDS.get(name) or NEW_IDS.get(slug.replace("-", " "))
    candidatos = [OVERRIDE_IDS.get(slug), old_id, xml_id]
    if xml_id:
        candidatos.append(xml_id - 40)
    if old_id:
        candidatos.append(old_id - 40)
    for cid in candidatos:
        if not cid or cid < 100:
            continue
        img = render_item_860(dat, spr, cid)
        if img is not None and img.getbbox():
            return cid, img
    return None, None


def export_items():
    """Regera os PNGs dos itens que o jogo ja usa, mantendo os nomes."""
    defs_path = os.path.normpath(os.path.join(
        HERE, "..", "..", "engine", "data", "740", "items", "definitions.json"))
    by_name = {}
    if os.path.exists(defs_path):
        defs = json.load(open(defs_path))
        for k, v in defs.items():
            n = v.get("properties", {}).get("name")
            if n and n not in by_name:
                by_name[n] = int(k)

    existentes = sorted(f[:-4] for f in os.listdir(os.path.join(OUT, "item"))
                        if f.endswith(".png"))
    ok = falhou = 0
    faltando = []
    for slug in existentes:
        name = slug.replace("-", " ")
        cid, img = item_id_for(slug, name, by_name.get(name))
        if img is None:
            faltando.append(slug)
            falhou += 1
            continue
        img.crop(img.getbbox()).save("%s/item/%s.png" % (OUT, slug))
        ok += 1
    print("  itens: %d atualizados, %d mantidos no 7.4" % (ok, falhou))
    if faltando:
        print("    sem equivalente:", ", ".join(faltando[:25]),
              "..." if len(faltando) > 25 else "")


if __name__ == "__main__":
    print("\n[1/3] outfits do jogador")
    export_player_outfits()
    print("\n[2/3] monstros")
    export_mobs()
    print("\n[3/3] itens")
    export_items()
    print("\npronto — sprites regravados em", OUT)
