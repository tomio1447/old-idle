#!/usr/bin/env python3
"""
Extrai dos .lua de suporte do Canary as magias que MUDAM A VELOCIDADE.

A condition de velocidade do servidor nao guarda um numero fixo: guarda uma
formula sobre o baseSpeed do jogador.

    ConditionSpeed::getFormulaValues(var, min, max):
        difference = var - 40
        min = mina * difference + minb
        max = maxa * difference + maxb

    startCondition():
        speedDelta = uniform_random(min, max) - baseSpeed

Ou seja: a haste de um personagem nivel 8 e MENOR que a de um nivel 500,
porque o baseSpeed entra na conta. E por isso que nao da para cravar
"utani hur = +40": o ganho escala com o nivel.

Do setFormula(mina, minb, maxa, maxb) de cada script sai tudo.

Saida: game/data/haste.json + game/js/hastedata.js
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


def num(txt, pat):
    m = re.search(pat, txt)
    if not m:
        return None
    expr = m.group(1)
    mult = re.match(r"\s*([\d.]+)\s*\*\s*([\d.]+)", expr)
    if mult:
        return int(float(mult.group(1)) * float(mult.group(2)))
    d = re.search(r"[\d.]+", expr)
    return int(float(d.group(0))) if d else None


def main():
    if not os.path.isdir(SPELLS):
        raise SystemExit("ERRO: %s nao existe." % SPELLS)

    arqs = glob.glob(os.path.join(SPELLS, "**", "*.lua"), recursive=True)
    saida = {}
    for f in arqs:
        txt = open(f, encoding="utf-8", errors="replace").read()
        # so interessa quem monta uma condition de HASTE ou PARALYZE
        if "CONDITION_HASTE" not in txt and "CONDITION_PARALYZE" not in txt:
            continue
        w = re.search(r'spell:words\("([^"]+)"', txt)
        if not w:
            continue
        sid = w.group(1).replace(" ", "-")

        e = {"words": w.group(1)}
        nm = re.search(r'spell:name\("([^"]+)"', txt)
        if nm:
            e["nome"] = nm.group(1)

        # setFormula(mina, minb, maxa, maxb) -- a conta que escala com o nivel
        fm = re.search(r"condition:setFormula\(\s*([\d.]+)\s*,\s*([\d.-]+)\s*,"
                       r"\s*([\d.]+)\s*,\s*([\d.-]+)\s*\)", txt)
        if fm:
            e["mina"] = float(fm.group(1))
            e["minb"] = float(fm.group(2))
            e["maxa"] = float(fm.group(3))
            e["maxb"] = float(fm.group(4))
        else:
            # algumas usam CONDITION_PARAM_SPEED direto, um delta fixo
            sp = re.search(r"condition:setParameter\(CONDITION_PARAM_SPEED,\s*"
                           r"(-?\d+)", txt)
            if not sp:
                continue
            e["delta"] = int(sp.group(1))

        t = num(txt, r"condition:setParameter\(CONDITION_PARAM_TICKS,\s*([^)]+)\)")
        if t:
            e["dur"] = t
        for campo, chave in (("level", "lvl"), ("mana", "mana"),
                             ("cooldown", "cd")):
            v = num(txt, r"spell:%s\(([^)]+)\)" % campo)
            if v is not None:
                e[chave] = v
        voc = re.search(r"spell:vocation\(([^)]*)\)", txt)
        if voc:
            vs = []
            for v in re.findall(r'"([^";]+)', voc.group(1)):
                v = v.strip().lower().replace("elite ", "").replace("elder ", "")
                v = v.replace("master ", "").replace("royal ", "")
                v = v.replace("exalted ", "")
                if v and v not in vs:
                    vs.append(v)
            if vs:
                e["vocs"] = vs
        e["paralyze"] = 1 if "CONDITION_PARALYZE" in txt and not fm else 0
        saida[sid] = e

    comFormula = [k for k, v in saida.items() if "mina" in v]
    print("magias de velocidade: %d (%d com formula escalavel)"
          % (len(saida), len(comFormula)))
    for k in sorted(comFormula):
        v = saida[k]
        # exemplo do ganho em dois niveis, para conferir na mao
        def ganho(lvl):
            base = 110 + (lvl - 1)
            dif = base - 40
            lo = v["mina"] * dif + v["minb"]
            hi = v["maxa"] * dif + v["maxb"]
            return int((lo + hi) / 2 - base)
        print("   %-22s %-20s nv8:+%d  nv100:+%d  nv500:+%d"
              % (k, v.get("nome", ""), ganho(8), ganho(100), ganho(500)))

    os.makedirs(os.path.join(GAME, "data"), exist_ok=True)
    with open(os.path.join(GAME, "data", "haste.json"), "w",
              encoding="utf-8") as fh:
        json.dump(saida, fh, ensure_ascii=False, indent=1, sort_keys=True)
    with open(os.path.join(GAME, "js", "hastedata.js"), "w",
              encoding="utf-8") as fh:
        fh.write("/* Gerado por tools/import_haste.py: as magias que mudam a\n"
                 " * velocidade, com a formula do ConditionSpeed do Canary\n"
                 " * (o ganho escala com o baseSpeed, ou seja, com o nivel). */\n")
        fh.write("window.HASTEDATA = ")
        json.dump(saida, fh, ensure_ascii=False, separators=(",", ":"),
                  sort_keys=True)
        fh.write(";\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
