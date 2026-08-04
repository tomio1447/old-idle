"""
add_missing_loot_items.py — adiciona ficha + sprite para TODOS os itens de
loot dos monstros das hunts que ainda nao existem no jogo.

Fonte de verdade: items.xml do Canary (data/items/items.xml) para id e
atributos; Tibia.dat/.spr 15.x para o sprite. O preco de venda usa o
`value` do Canary (moedas do market) quando existe, senao uma estimativa
por raridade.

Uso:
    python3 add_missing_loot_items.py [dir_com_items.xml] [dir_do_game]
"""
import json
import os
import re
import sys

from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from tibia_assets_860 import Dat860, Spr860, render_item_860  # noqa: E402

ITEMS_XML = sys.argv[1] if len(sys.argv) > 1 else "/tmp/items.xml"
GAME = sys.argv[2] if len(sys.argv) > 2 else os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "..", "game")

DAT = "/tmp/tibia860/extracted/Tibia.dat"
SPR = "/tmp/tibia860/extracted/Tibia.spr"


def slug(nome):
    return re.sub(r"[^a-z0-9]+", "-", (nome or "").lower()).strip("-")


def ler_items_xml():
    """{slug: {id, sell, w, arm, atk, def, slot}} do items.xml do Canary."""
    txt = open(ITEMS_XML, encoding="utf-8", errors="ignore").read()
    out = {}
    # itens individuais
    for m in re.finditer(
            r'<item id="(\d+)"(?:[^>]*?)name="([^"]+)"(.*?)</item>',
            txt, re.S):
        iid = int(m.group(1))
        nome = m.group(2)
        corpo = m.group(3)
        it = {"id": iid}
        v = re.search(r'<attribute key="value" value="(\d+)"', corpo)
        if v:
            it["sell"] = int(v.group(1))
        w = re.search(r'<attribute key="weight" value="(\d+)"', corpo)
        if w:
            it["w"] = round(int(w.group(1)) / 100.0, 2)
        arm = re.search(r'<attribute key="armor" value="(\d+)"', corpo)
        if arm:
            it["arm"] = int(arm.group(1))
        atk = re.search(r'<attribute key="attack" value="(\d+)"', corpo)
        if atk:
            it["atk"] = int(atk.group(1))
        df = re.search(r'<attribute key="defense" value="(\d+)"', corpo)
        if df:
            it["def"] = int(df.group(1))
        slot = re.search(r'<attribute key="slotType" value="([a-z]+)"', corpo)
        if slot:
            it["slot"] = slot.group(1)
        out[slug(nome)] = it
    # faixas (fromid-toid): usa o primeiro id
    for m in re.finditer(
            r'<item fromid="(\d+)" toid="(\d+)"(?:[^>]*?)name="([^"]+)"',
            txt):
        out.setdefault(slug(m.group(3)), {"id": int(m.group(1))})
    return out


def main():
    xml = ler_items_xml()
    print("items.xml:", len(xml), "entradas")

    # itens atuais do jogo
    gpath = os.path.join(GAME, "js", "gamedata.js")
    src = open(gpath, encoding="utf-8").read()
    data = json.loads(src[src.index("{"):src.rindex("}") + 1])
    itens = data["items"]

    # todos os itens de loot dos monstros das hunts
    md_txt = open(os.path.join(GAME, "js", "monsterdata.js")).read()
    md = json.loads(md_txt[md_txt.index("{"):md_txt.rindex("}") + 1])
    playable = set()
    for h in data["hunts"].values():
        playable.update(h.get("monsters", []))
    precisam = {}
    for slug_m in playable:
        m = md.get(slug_m) or {}
        for l in m.get("loot", []):
            it = l.get("item")
            if it and it not in itens:
                precisam[it] = True
    print("itens de loot sem ficha:", len(precisam))

    dat = Dat860(DAT)
    spr = Spr860(SPR)
    dest = os.path.join(GAME, "assets", "item")
    os.makedirs(dest, exist_ok=True)

    adicionados = 0
    sem_id = []
    for slug_item in sorted(precisam):
        if slug_item in itens:
            continue
        info = xml.get(slug_item)
        if not info or "id" not in info:
            sem_id.append(slug_item)
            continue
        iid = info["id"]
        img = render_item_860(dat, spr, iid)
        if img is None:
            sem_id.append(slug_item + " (sem sprite)")
            continue
        bb = img.getbbox()
        if bb:
            img = img.crop(bb)
        img.save(os.path.join(dest, slug_item + ".png"), optimize=True)

        ficha = {
            "n": slug_item.replace("-", " "),
            "s": None,
            "t": "loot",
            "cid": iid,
        }
        # equipamentos ganham stats do items.xml
        if info.get("slot") in ("head", "body", "legs", "feet", "shield"):
            ficha["s"] = "armor"
            ficha["t"] = "armor"
            if info.get("arm"):
                ficha["arm"] = info["arm"]
        if info.get("slot") == "ring":
            ficha["s"] = "ring"
            ficha["t"] = "ring"
        if info.get("atk"):
            ficha["s"] = "weapon"
            ficha["t"] = "weapon"
            ficha["atk"] = info["atk"]
            if info.get("def"):
                ficha["def"] = info["def"]
        # preco de venda: value do market, ou estimativa por raridade
        if info.get("sell"):
            ficha["sell"] = info["sell"]
        else:
            ficha["sell"] = 1
        if info.get("w"):
            ficha["w"] = info["w"]
        else:
            ficha["w"] = 0.5
        itens[slug_item] = ficha
        adicionados += 1

    print("adicionados:", adicionados, "| sem id/sprite:", len(sem_id))
    print("exemplos sem id:", sem_id[:15])

    # reescreve o gamedata.js
    novo = "window.GAMEDATA = " + json.dumps(data, ensure_ascii=False,
                                             separators=(",", ":")) + ";\n"
    with open(gpath, "w", encoding="utf-8") as f:
        f.write(src[:src.index("window.GAMEDATA")] + novo)
    print("gamedata.js atualizado:", len(itens), "itens")


if __name__ == "__main__":
    main()
