"""
Gera game/js/imbuementdata.js a partir de tools/data/canary-imbuements.xml
(baixado do repo oficial opentibiabr/canary, data/XML/imbuements.xml) e dos
nomes de materiais do tools/data/canary-items.xml (items.xml do Canary).

Tudo aqui e dado oficial: bases (preco, protectionPrice, percent, removecost,
duration), categorias, efeitos por tier e materiais com quantidades
ACUMULATIVAS (o tier 2 exige os itens do tier 1 + os proprios, igual ao XML).

Uso:
    python3 tools/build_imbuement_js.py
"""
import os
import re
import xml.etree.ElementTree as ET

HERE = os.path.dirname(os.path.abspath(__file__))
XML = os.path.join(HERE, "data", "canary-imbuements.xml")
ITEMS = os.path.join(HERE, "data", "canary-items.xml")
OUT = os.path.normpath(os.path.join(HERE, "..", "game", "js", "imbuementdata.js"))

def main():
    tree = ET.parse(XML)
    root = tree.getroot()

    bases = {}
    for b in root.iter("base"):
        i = int(b.get("id"))
        bases[i] = {
            "name": b.get("name"),
            "price": int(b.get("price")),
            "protection": int(b.get("protectionPrice")),
            "pct": int(b.get("percent")),
            "remove": int(b.get("removecost")),
            "duration": int(b.get("duration")),
        }

    cats = {}
    for c in root.iter("category"):
        cats[int(c.get("id"))] = c.get("name")

    imbs = {}
    mats = {}
    for el in root.iter("imbuement"):
        name = el.get("name").strip()
        sub = (el.get("subgroup") or "").strip()
        cat = int(el.get("category"))
        base = int(el.get("base"))
        key = name + ((" " + sub) if sub else "")
        g = imbs.setdefault(key, {
            "name": name,
            "sub": sub.strip("()"),
            "cat": cat,
            "icon": int(el.get("iconid")),
            "tiers": {},
        })
        t = {"items": [], "desc": "", "effect": None}
        for a in el.iter("attribute"):
            k = a.get("key")
            if k == "description":
                t["desc"] = a.get("value")
            elif k == "item":
                iid = int(a.get("value"))
                cnt = int(a.get("count", "1"))
                t["items"].append([iid, cnt])
            elif k == "effect":
                t["effect"] = {"type": a.get("type")}
                for attr in ("combat", "skill", "value"):
                    if a.get(attr) is not None:
                        t["effect"][attr] = a.get(attr)
                for attr in ("bonus", "chance"):
                    if a.get(attr) is not None:
                        t["effect"][attr] = int(a.get(attr))
                if "value" in t["effect"] and re.fullmatch(r"-?\d+",
                        str(t["effect"]["value"])):
                    t["effect"]["value"] = int(t["effect"]["value"])
        g["tiers"][base] = t
        for iid, _cnt in t["items"]:
            mats[iid] = None

    # nomes oficiais dos materiais (items.xml do Canary 15.x)
    names = {}
    xml_txt = open(ITEMS, encoding="iso-8859-1").read()
    for m in re.finditer(r'<item id="(\d+)"[^>]*name="([^"]+)"', xml_txt):
        names[int(m.group(1))] = m.group(2)
    faltam = []
    for iid in mats:
        n = names.get(iid)
        if n:
            mats[iid] = n
        else:
            faltam.append(iid)

    def js(obj, indent=0):
        pad = "  " * indent
        if isinstance(obj, dict):
            if not obj:
                return "{}"
            parts = []
            for k, v in obj.items():
                kk = json_str(k) if isinstance(k, str) else str(k)
                parts.append(pad + "  " + kk + ": " + js(v, indent + 1))
            return "{\n" + ",\n".join(parts) + "\n" + pad + "}"
        if isinstance(obj, list):
            return "[" + ", ".join(js(v, indent) for v in obj) + "]"
        if isinstance(obj, str):
            return json_str(obj)
        if obj is None:
            return "null"
        return str(obj).lower() if isinstance(obj, bool) else str(obj)

    def json_str(s):
        return '"' + s.replace("\\", "\\\\").replace('"', '\\"') + '"'

    linhas = [
        "/* imbuementdata.js — GERADO por tools/build_imbuement_js.py a partir",
        " * de tools/data/canary-imbuements.xml (opentibiabr/canary, oficial).",
        " * NAO EDITAR A MAO: edite o XML e rode o builder de novo. */",
        '"use strict";',
        "window.IMBDATA = " + js({"bases": bases, "categories": cats,
                                   "imbs": imbs, "mats": mats}) + ";",
        "",
    ]
    with open(OUT, "w", encoding="utf-8") as f:
        f.write("\n".join(linhas))
    print("gerado", OUT)
    print("imbuements:", len(imbs), "| materiais:", len(mats))
    if faltam:
        print("sem nome (nao constam no canary-items.xml):",
              ", ".join(map(str, sorted(faltam))))

if __name__ == "__main__":
    main()
