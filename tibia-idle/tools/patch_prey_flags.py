"""
Injeta isPreyExclusive / isPreyable no monsterdata.js a partir dos .lua
do Canary, sem reimportar stats/loot (evita clobber de outros campos).
"""
import json
import os
import re
import sys

ROOT = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", ".."))
CAN = sys.argv[1] if len(sys.argv) > 1 else os.path.join(
    ROOT, "refs", "canary-main")
GAME = sys.argv[2] if len(sys.argv) > 2 else os.path.join(
    os.path.dirname(__file__), "..", "game")
MONSTER_DIR = os.path.join(CAN, "data-otservbr-global", "monster")
JS = os.path.join(GAME, "js", "monsterdata.js")
JSON_OUT = os.path.join(GAME, "data", "canarymonsters.json")


def slug(nome):
    s = nome.lower().strip()
    s = re.sub(r"[^a-z0-9]+", "-", s)
    return s.strip("-")


def main():
    flags = {}
    for base, _, arqs in os.walk(MONSTER_DIR):
        for a in arqs:
            if not a.endswith(".lua"):
                continue
            txt = open(os.path.join(base, a), encoding="utf-8",
                       errors="ignore").read()
            nome = re.search(r'Game\.createMonsterType\("([^"]+)"\)', txt)
            if not nome:
                continue
            fl = {}
            if re.search(r"isPreyable\s*=\s*false", txt):
                fl["isPreyable"] = 0
            if re.search(r"isPreyExclusive\s*=\s*true", txt):
                fl["isPreyExclusive"] = 1
            if fl:
                flags[slug(nome.group(1))] = fl

    raw = open(JS, encoding="utf-8").read()
    m = re.match(r"(.*?window\.MONSTERDATA\s*=\s*)(.*)(;\s*)\Z", raw, re.S)
    if not m:
        raise SystemExit("monsterdata.js: formato inesperado")
    prefix, body, suffix = m.group(1), m.group(2), m.group(3)
    data = json.loads(body)

    hit = 0
    for slug_k, fl in flags.items():
        if slug_k not in data:
            continue
        for k, v in fl.items():
            if data[slug_k].get(k) != v:
                data[slug_k][k] = v
                hit += 1

    with open(JS, "w", encoding="utf-8") as f:
        f.write(prefix + json.dumps(data, separators=(",", ":")) + suffix)
    if os.path.isdir(os.path.dirname(JSON_OUT)):
        json.dump(data, open(JSON_OUT, "w", encoding="utf-8"))

    excl = sum(1 for m in data.values() if m.get("isPreyExclusive"))
    print("flags aplicadas:", hit, "| isPreyExclusive no catalogo:", excl,
          "| fontes Canary:", len(flags))


if __name__ == "__main__":
    main()
