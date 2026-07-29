#!/usr/bin/env python3
"""
Extrai dos .lua de monstro do Canary os campos que controlam MOVIMENTO:

    targetDistance      1 = melee (cola no alvo); >1 = mantem distancia
    staticAttackChance  chance de FICAR PARADO ao inves de dancar em volta
    runOnHealth         hp abaixo do qual foge
    canPushCreatures    empurra outros monstros
    canPushItems
    speed               velocidade base (vira duracao de passo)
    isBlockable / ignoreFieldDamage

Por que importa: sem targetDistance todo monstro cola no jogador, e sem
staticAttackChance nenhum deles "danca" em volta -- os dois comportamentos
que dao a sensacao de Tibia de verdade.

Saida: game/data/monstermoves.json + game/js/monstermovedata.js
"""
import json
import os
import re
import sys
import glob

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.normpath(os.path.join(HERE, "..", "game"))
CAN = os.environ.get("CANARY", "/tmp/can")
MON = os.path.join(CAN, "data-otservbr-global", "monster")


def slugify(nome):
    return re.sub(r"[^a-z0-9]+", "-", (nome or "").strip().lower()).strip("-")


def num(txt, chave):
    m = re.search(r"\b%s\s*=\s*(-?\d+)" % chave, txt)
    return int(m.group(1)) if m else None


def boolean(txt, chave):
    m = re.search(r"\b%s\s*=\s*(true|false)" % chave, txt)
    if not m:
        return None
    return m.group(1) == "true"


def main():
    if not os.path.isdir(MON):
        raise SystemExit("ERRO: %s nao existe." % MON)

    arqs = glob.glob(os.path.join(MON, "**", "*.lua"), recursive=True)
    print("arquivos de monstro: %d" % len(arqs))

    saida = {}
    for f in arqs:
        txt = open(f, encoding="utf-8", errors="replace").read()
        # O nome canonico vem do Game.createMonsterType("X") na primeira
        # linha. Usar monster.name como fonte principal pegava so 36 dos
        # 1656 arquivos: a maioria define o nome so no createMonsterType.
        nm = re.search(r'createMonsterType\(\s*"([^"]+)"', txt)
        if not nm:
            nm = re.search(r'monster\.name\s*=\s*"([^"]+)"', txt)
        if not nm:
            continue
        slug = slugify(nm.group(1))
        if not slug or slug in saida:
            continue

        d = {}
        # targetDistance vive dentro de monster.flags
        td = num(txt, "targetDistance")
        if td is not None:
            d["targetDistance"] = td
        sac = num(txt, "staticAttackChance")
        if sac is not None:
            d["staticAttack"] = sac
        rh = num(txt, "runHealth") or num(txt, "runOnHealth")
        if rh:
            d["runHealth"] = rh
        sp = num(txt, "speed")
        if sp:
            d["speed"] = sp
        for campo, chave in (("canPushCreatures", "pushCreatures"),
                             ("canPushItems", "pushItems"),
                             ("isBlockable", "blockable"),
                             ("attackable", "attackable"),
                             ("hostile", "hostile")):
            v = boolean(txt, campo)
            if v is not None:
                d[chave] = 1 if v else 0

        # alcance dos ataques: o maior range das spells diz ate onde o
        # monstro consegue bater sem se aproximar
        ranges = [int(x) for x in re.findall(r"range\s*=\s*(\d+)", txt)]
        if ranges:
            d["atkRange"] = max(ranges)

        saida[slug] = d

    comTd = sum(1 for v in saida.values() if v.get("targetDistance"))
    comSac = sum(1 for v in saida.values() if v.get("staticAttack") is not None)
    dist = sum(1 for v in saida.values() if (v.get("targetDistance") or 1) > 1)
    print("monstros: %d (%d com targetDistance, %d com staticAttackChance, "
          "%d que mantem distancia)" % (len(saida), comTd, comSac, dist))

    os.makedirs(os.path.join(GAME, "data"), exist_ok=True)
    with open(os.path.join(GAME, "data", "monstermoves.json"), "w",
              encoding="utf-8") as fh:
        json.dump(saida, fh, ensure_ascii=False, indent=1, sort_keys=True)
    with open(os.path.join(GAME, "js", "monstermovedata.js"), "w",
              encoding="utf-8") as fh:
        fh.write("/* Gerado por tools/import_monster_moves.py: campos de\n"
                 " * movimento dos monstros do Canary (targetDistance,\n"
                 " * staticAttackChance, runHealth, speed). */\n")
        fh.write("window.MONSTERMOVES = ")
        json.dump(saida, fh, ensure_ascii=False, separators=(",", ":"),
                  sort_keys=True)
        fh.write(";\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
