#!/usr/bin/env python3
"""
Extrai dos .lua de TODAS as magias do Canary as propriedades de ALVO:

    isSelfTarget    a magia nasce no CONJURADOR, nao no alvo
    needTarget      exige um alvo selecionado
    isAggressive    magia hostil
    range           alcance em SQM
    blockWalls      a magia e barrada por parede

POR QUE ISSO IMPORTA

O jogo lancava TODA magia de area centrada no alvo. No servidor isso e
falso para 65 magias: exevo mas san (Divine Caldera), exori mas
(Whirlwind Throw), as ondas... todas nascem em volta de QUEM LANCA.

    divine_caldera.lua:
        combat:setArea(createCombatArea(AREA_CIRCLE3X3))
        spell:isSelfTarget(true)

Sem o isSelfTarget o Divine Caldera de um paladino explodia em cima do
monstro em vez de em volta do proprio paladino -- o oposto do que a magia
faz.

Saida: game/data/spelltarget.json + game/js/spelltargetdata.js
"""
import json
import os
import re
import sys
import glob

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.normpath(os.path.join(HERE, "..", "game"))
CAN = os.environ.get("CANARY", "/tmp/can")
SPELLS = os.path.join(CAN, "data", "scripts", "spells")


def flag(txt, nome):
    """spell:nome(true) -> True, spell:nome(false) -> False, ausente -> None"""
    m = re.search(r"spell:%s\(\s*(true|false)\s*\)" % nome, txt)
    if not m:
        return None
    return m.group(1) == "true"


def num(txt, nome):
    m = re.search(r"spell:%s\(\s*([^)]+?)\s*\)" % nome, txt)
    if not m:
        return None
    expr = m.group(1)
    mult = re.match(r"([\d.]+)\s*\*\s*([\d.]+)", expr)
    if mult:
        return int(float(mult.group(1)) * float(mult.group(2)))
    d = re.search(r"[\d.]+", expr)
    return int(float(d.group(0))) if d else None


def main():
    if not os.path.isdir(SPELLS):
        raise SystemExit("ERRO: %s nao existe. Clone o canary." % SPELLS)

    arqs = glob.glob(os.path.join(SPELLS, "**", "*.lua"), recursive=True)
    saida = {}
    for f in arqs:
        txt = open(f, encoding="utf-8", errors="replace").read()
        w = re.search(r'spell:words\("([^"]+)"', txt)
        if not w:
            continue
        sid = w.group(1).replace(" ", "-")

        e = {"words": w.group(1)}
        nm = re.search(r'spell:name\("([^"]+)"', txt)
        if nm:
            e["nome"] = nm.group(1)

        # a propriedade central: a magia sai do conjurador?
        st = flag(txt, "isSelfTarget")
        if st:
            e["self"] = 1
        nt = flag(txt, "needTarget")
        if nt:
            e["needTarget"] = 1
        ag = flag(txt, "isAggressive")
        if ag is False:
            e["passiva"] = 1
        bw = flag(txt, "blockWalls")
        if bw:
            e["blockWalls"] = 1

        r = num(txt, "range")
        if r:
            e["range"] = r

        # a area, para saber se a magia e de area de verdade
        ar = re.search(r"createCombatArea\(\s*(AREA\w+)", txt)
        if ar:
            e["areaNome"] = ar.group(1)

        saida[sid] = e

    selfs = [k for k, v in saida.items() if v.get("self")]
    comArea = [k for k in selfs if saida[k].get("areaNome")]
    print("magias: %d (%d selfTarget, %d delas com area)"
          % (len(saida), len(selfs), len(comArea)))
    for k in sorted(comArea)[:14]:
        print("   self+area: %-22s %-26s %s"
              % (k, saida[k].get("nome", ""), saida[k]["areaNome"]))

    os.makedirs(os.path.join(GAME, "data"), exist_ok=True)
    with open(os.path.join(GAME, "data", "spelltarget.json"), "w",
              encoding="utf-8") as fh:
        json.dump(saida, fh, ensure_ascii=False, indent=1, sort_keys=True)
    with open(os.path.join(GAME, "js", "spelltargetdata.js"), "w",
              encoding="utf-8") as fh:
        fh.write("/* Gerado por tools/import_spell_targeting.py: de onde cada\n"
                 " * magia nasce (self ou alvo), alcance e area. */\n")
        fh.write("window.SPELLTARGET = ")
        json.dump(saida, fh, ensure_ascii=False, separators=(",", ":"),
                  sort_keys=True)
        fh.write(";\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
