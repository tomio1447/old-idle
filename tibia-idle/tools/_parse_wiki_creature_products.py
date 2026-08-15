#!/usr/bin/env python3
"""Parse TibiaWiki creature-product NPC prices from MediaWiki parse JSON."""
import json
import re
from html import unescape
from pathlib import Path

SRC = Path(r"C:\Users\Tomio\AppData\Local\Temp\cp_wiki_parse.json")
OUT = Path(__file__).resolve().parent / "_wiki_creature_products.json"

data = json.loads(SRC.read_text(encoding="utf-8"))
text = data["parse"]["text"]
rows = re.findall(r"<tr[^>]*>(.*?)</tr>", text, re.I | re.S)
products = []
for row in rows[1:]:
    tds = re.findall(r"<td[^>]*>(.*?)</td>", row, re.I | re.S)
    if len(tds) < 5:
        continue
    m = re.search(r'title="([^"]+)"', tds[0])
    if m:
        name = unescape(m.group(1))
    else:
        name = unescape(re.sub(r"<[^>]+>", "", tds[0])).strip()
    weight = unescape(re.sub(r"<[^>]+>", "", tds[2])).strip()
    price_raw = unescape(re.sub(r"<[^>]+>", "", tds[4])).strip().replace("\xa0", " ")
    pm = re.search(r"([0-9][0-9,]*)", price_raw)
    price = int(pm.group(1).replace(",", "")) if pm else 0
    products.append({"name": name, "npcPrice": price, "weight": weight})

OUT.write_text(json.dumps(products, indent=1, ensure_ascii=False), encoding="utf-8")
print("products", len(products))
print("nonzero", sum(1 for p in products if p["npcPrice"] > 0))
print("zero", sum(1 for p in products if p["npcPrice"] == 0))
print("sample", products[:3])
print("wrote", OUT)
