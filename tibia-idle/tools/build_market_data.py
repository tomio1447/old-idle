"""
build_market_data.py — gera o Market (loja oficial estilo Canary).

Fonte de preços: o atributo `value` (preço de mercado) do items.xml do
Canary, casado pelo clientId (cid) de cada item do jogo. Itens de
imbuement (os ids que o canarydata lista como item/scroll de cada
imbuement) entram numa categoria propria, com sprite extraida do DAT.

Saidas:
    game/js/marketdata.js          window.MARKETDATA
    game/assets/ui/market/market.png   icone do market (item 12903)
    game/assets/item/<imbue>.png   sprites dos itens de imbuement
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


def ler_precos_canary():
    """{client_id: {value, name, weight, slot, atk, def, arm}} do items.xml."""
    txt = open(ITEMS_XML, encoding="utf-8", errors="ignore").read()
    out = {}
    for m in re.finditer(r'<item id="(\d+)"(?:[^>]*?)name="([^"]+)"(.*?)</item>',
                         txt, re.S):
        iid = int(m.group(1))
        corpo = m.group(3)
        it = {"id": iid, "name": m.group(2)}
        v = re.search(r'<attribute key="value" value="(\d+)"', corpo)
        if v:
            it["value"] = int(v.group(1))
        w = re.search(r'<attribute key="weight" value="(\d+)"', corpo)
        if w:
            it["weight"] = round(int(w.group(1)) / 100.0, 2)
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
        out[iid] = it
    return out


# categorias do market (ordem de exibicao)
CATS = [
    ("weapons", "Armas"),
    ("armors", "Armaduras"),
    ("helmets", "Elmos"),
    ("legs", "Pernas"),
    ("boots", "Botas"),
    ("shields", "Escudos"),
    ("rings", "Aneis"),
    ("amulets", "Amuletos"),
    ("imbue", "Imbuement"),
]


def main():
    precos = ler_precos_canary()
    print("items.xml:", len(precos), "precos")

    gpath = os.path.join(GAME, "js", "gamedata.js")
    src = open(gpath, encoding="utf-8").read()
    data = json.loads(src[src.index("{"):src.rindex("}") + 1])
    itens = data["items"]

    # ---- equipamentos do jogo (com cid) -> categoria pelo slot ----
    mercado = {}
    for slug_item, it in itens.items():
        s = it.get("s")
        cat = None
        if s == "weapon":
            cat = "weapons"
        elif s == "armor":
            cat = "armors"
        elif s == "helmet":
            cat = "helmets"
        elif s == "legs":
            cat = "legs"
        elif s == "boots":
            cat = "boots"
        elif s == "shield":
            cat = "shields"
        elif s == "ring":
            cat = "rings"
        elif s == "amulet":
            cat = "amulets"
        if not cat:
            continue
        # preco: value do market do Canary; fallback sell*2
        cid = it.get("cid")
        price = None
        if cid and cid in precos and precos[cid].get("value"):
            price = precos[cid]["value"]
        else:
            price = max(10, (it.get("sell") or 1) * 2)
        mercado[slug_item] = {
            "slug": slug_item,
            "n": it.get("n") or slug_item.replace("-", " "),
            "cat": cat,
            "price": int(price),
            "cid": cid,
            "s": s,
            "t": it.get("t"),
        }
        for campo in ("atk", "def", "arm", "mag", "lvl", "vocs", "el", "elDmg",
                      "imbSlots", "range", "th"):
            if it.get(campo) is not None:
                mercado[slug_item][campo] = it[campo]
    print("equipamentos no market:", len(mercado))

    # ---- itens de imbuement (ids do canarydata) ----
    ctxt = open(os.path.join(GAME, "js", "canarydata.js"), encoding="utf-8").read()
    cdata = json.loads(ctxt[ctxt.index("{"):ctxt.rindex("}") + 1])
    imb_ids = set()
    for imb in cdata["imbuements"]["imbuements"]:
        a = imb.get("attributes") or {}
        if a.get("item"):
            imb_ids.add(a["item"])
        if a.get("scroll"):
            imb_ids.add(a["scroll"])
    print("ids de imbuement:", len(imb_ids))

    dat = Dat860(DAT)
    spr = Spr860(SPR)
    dest = os.path.join(GAME, "assets", "item")
    os.makedirs(dest, exist_ok=True)

    imbue_items = {}
    for iid in sorted(imb_ids, key=int):
        info = precos.get(int(iid))
        if not info:
            continue
        nome = info["name"]
        s = slug(nome)
        # preco oficial do market (value) quando existe; senao usa o sell do
        # jogo (se o item ja tem ficha) x2, ou um valor base sensato.
        price = info.get("value")
        if not price:
            existing = itens.get(s)
            price = (existing.get("sell") or 0) * 2 if existing and existing.get("sell") else 100
        price = max(50, int(price))
        # sprite
        img = render_item_860(dat, spr, int(iid))
        if img:
            bb = img.getbbox()
            if bb:
                img = img.crop(bb)
            img.save(os.path.join(dest, s + ".png"), optimize=True)
        imbue_items[s] = {
            "slug": s,
            "n": nome,
            "cat": "imbue",
            "price": price,
            "cid": int(iid),
            "s": None,
            "t": "loot",
        }
    print("itens de imbuement:", len(imbue_items))

    # ---- icone do market (item 12903) ----
    ui_dir = os.path.join(GAME, "assets", "ui", "market")
    os.makedirs(ui_dir, exist_ok=True)
    img = render_item_860(dat, spr, 12903)
    if img:
        bb = img.getbbox()
        if bb:
            img = img.crop(bb)
        img.save(os.path.join(ui_dir, "market.png"), optimize=True)
        print("icone do market:", img.size)
    # adiciona o item market ao gamedata
    if "market" not in itens:
        itens["market"] = {"n": "market", "s": None, "t": "loot",
                           "sell": 1, "w": 1.0, "cid": 12903}

    # ---- salva marketdata.js ----
    market = {
        "categories": dict(CATS),
        "items": mercado,
        "imbue": imbue_items,
    }
    out_js = os.path.join(GAME, "js", "marketdata.js")
    with open(out_js, "w", encoding="utf-8") as f:
        f.write("/* marketdata.js — GERADO por tools/build_market_data.py\n")
        f.write(" * Market com precos oficiais do Canary (items.xml value),\n")
        f.write(" * equipamentos do jogo + itens de imbuement. */\n")
        f.write('"use strict";\n')
        f.write("window.MARKETDATA = " + json.dumps(market, ensure_ascii=False,
                                                    separators=(",", ":")) + ";\n")
    print("marketdata.js:", sum(len(v) for v in (mercado, imbue_items)), "itens")

    # reescreve gamedata.js com o item market
    novo = "window.GAMEDATA = " + json.dumps(data, ensure_ascii=False,
                                             separators=(",", ":")) + ";\n"
    with open(gpath, "w", encoding="utf-8") as f:
        f.write(src[:src.index("window.GAMEDATA")] + novo)
    print("gamedata.js atualizado")


if __name__ == "__main__":
    main()
