#!/usr/bin/env python3
"""
Extrai as MATRIZES de area do register_spells.lua do Canary e gera as quatro
rotacoes de cada uma, exatamente como o AreaCombat::setupArea() faz.

POR QUE ISSO IMPORTA

O jogo vinha aproximando toda area por um raio circular. Isso funciona para
AREA_CIRCLE3X3, que e mesmo um circulo, mas destroi as areas direcionais: o
leque do Sweeping Takedown, as ondas (AREA_WAVE*) e os feixes (AREA_BEAM*)
viravam bolas centradas no alvo.

No servidor a matriz e escrita apontando para o NORTE e rotacionada em
90/180/270 conforme a direcao do lance:

    setupArea(): north = matriz original
                 south = ROTATE180,  east = ROTATE90,  west = ROTATE270

O valor 3 marca o centro (origem do lance) e o 1 marca uma casa atingida --
e por isso que num beam o centro fica na borda da matriz, e nao no meio.

Saida: game/data/areas.json + game/js/areadata.js
       cada area vira { w, h, cx, cy, cells:[[dx,dy],...] } por direcao,
       ja em OFFSETS relativos ao centro, que e o que o combate consome.
"""
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.normpath(os.path.join(HERE, "..", "game"))
CAN = os.environ.get("CANARY", "/tmp/can")
LIB = os.path.join(CAN, "data", "scripts", "lib", "register_spells.lua")


def le_matrizes():
    """AREA_* -> lista de listas de inteiros, como escrito no lua."""
    txt = open(LIB, encoding="utf-8", errors="replace").read()
    saida = {}
    for m in re.finditer(r"^(AREA\w*)\s*=\s*\{(.*?)^\}", txt, re.S | re.M):
        linhas = []
        for ln in re.finditer(r"\{([^{}]*)\}", m.group(2)):
            nums = [int(x) for x in re.findall(r"-?\d+", ln.group(1))]
            if nums:
                linhas.append(nums)
        if linhas:
            saida[m.group(1)] = linhas
    return saida


def offsets(grade):
    """Converte a grade em offsets (dx, dy) relativos ao centro.

    O centro e a casa marcada com 2 ou 3. Quando nao ha marca -- algumas
    matrizes de campo nao tem -- cai no meio geometrico, que e o que o
    createArea() faz por omissao.
    """
    cx = cy = None
    for y, linha in enumerate(grade):
        for x, v in enumerate(linha):
            if v in (2, 3):
                cx, cy = x, y
    if cx is None:
        cy = len(grade) // 2
        cx = max(len(l) for l in grade) // 2

    cells = []
    for y, linha in enumerate(grade):
        for x, v in enumerate(linha):
            if v == 1:
                cells.append([x - cx, y - cy])
    # Valor 3 = ancora do caster. Em circulos/cruzes o centro tambem e
    # area de dano (o 3 ocupa o lugar de um 1). Em WAVE/BEAM so ha casas
    # "a frente" (dy<=0 na matriz norte) — o centro NAO leva dano; o
    # primeiro SQM e sempre 1 a frente do caster.
    atras = any(dy > 0 for _dx, dy in cells)
    if atras:
        cells.append([0, 0])
    return cells


def rotaciona(cells, graus):
    """Roda os offsets no plano. E a mesma transformacao do copyArea():

        90  -> (x, y) vira (-y,  x)
        180 -> (x, y) vira (-x, -y)
        270 -> (x, y) vira ( y, -x)
    """
    out = []
    for dx, dy in cells:
        if graus == 90:
            out.append([-dy, dx])
        elif graus == 180:
            out.append([-dx, -dy])
        elif graus == 270:
            out.append([dy, -dx])
        else:
            out.append([dx, dy])
    return out


def main():
    if not os.path.exists(LIB):
        raise SystemExit("ERRO: %s nao existe. Clone o canary." % LIB)

    matrizes = le_matrizes()
    print("matrizes lidas: %d" % len(matrizes))

    saida = {}
    for nome, grade in matrizes.items():
        base = offsets(grade)
        if not base:
            continue
        # a matriz do lua aponta para o NORTE; as outras sao rotacoes dela
        saida[nome] = {
            "n": base,
            "e": rotaciona(base, 90),
            "s": rotaciona(base, 180),
            "w": rotaciona(base, 270),
            "sqm": len(base),
        }

    # confere: rotacionar nao pode ganhar nem perder casa
    ruins = [n for n, a in saida.items()
             if not (len(a["n"]) == len(a["e"]) == len(a["s"]) == len(a["w"]))]
    if ruins:
        raise SystemExit("ERRO: rotacao perdeu casas em %s" % ruins)

    direcionais = [n for n, a in saida.items()
                   if sorted(map(tuple, a["n"])) != sorted(map(tuple, a["e"]))]
    print("areas: %d (%d direcionais, %d simetricas)"
          % (len(saida), len(direcionais), len(saida) - len(direcionais)))
    for n in sorted(direcionais)[:12]:
        print("   direcional: %-28s %d sqm" % (n, saida[n]["sqm"]))

    os.makedirs(os.path.join(GAME, "data"), exist_ok=True)
    with open(os.path.join(GAME, "data", "areas.json"), "w",
              encoding="utf-8") as fh:
        json.dump(saida, fh, ensure_ascii=False, indent=1, sort_keys=True)
    with open(os.path.join(GAME, "js", "areadata.js"), "w",
              encoding="utf-8") as fh:
        fh.write("/* Gerado por tools/import_areas.py: as matrizes de area do\n"
                 " * register_spells.lua, ja resolvidas em offsets (dx,dy) nas\n"
                 " * quatro direcoes, como o AreaCombat::setupArea() faz. */\n")
        fh.write("window.AREADATA = ")
        json.dump(saida, fh, ensure_ascii=False, separators=(",", ":"),
                  sort_keys=True)
        fh.write(";\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
