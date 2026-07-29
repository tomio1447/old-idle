#!/usr/bin/env python3
"""
Le os scripts .lua das magias do Monk no Canary e extrai o que o combate
precisa para reproduzir o comportamento do servidor:

    SPELL_BASE_POWER  -> o multiplicador de dano de cada magia
    COMBAT_PARAM_EFFECT -> o efeito visual do client 15.x
    createCombatArea()  -> a grade real de area, resolvida em SQMs
    CALLBACK_PARAM_CHAINVALUE -> alvos e distancia do salto em cadeia
    spell:range()       -> alcance
    monkSpellType()     -> builder ou spender

Por que ler o .lua: nenhuma dessas informacoes existe no otclient nem no
items.xml. A formula de dano das magias do Monk NAO usa magic level -- usa
skill de punho e ataque da arma:

    dano = BASE_POWER * (skill / 100) * (attack / 10) + flatDamageHealing
    min  = dano - dano/10        max = dano + dano/10

O flatDamageHealing e o Player::calculateFlatDamageHealing(), um bonus por
nivel com fator decrescente (1/5 ate o nivel 500, 1/6 ate 1100...).

Saida: game/data/monkspells.json + game/js/monkspelldata.js
"""
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.normpath(os.path.join(HERE, "..", "game"))
CAN = os.environ.get("CANARY", "/tmp/can")
SPELLS = os.path.join(CAN, "data", "scripts", "spells")
LIB = os.path.join(CAN, "data", "scripts", "lib", "register_spells.lua")

# CONST_ME_* do client 15.x -> sprite de efeito em assets/fx.
# Os efeitos brancos do Monk mudam de cor conforme o elemental bond da arma
# (monkEffectByElementalBond no combat.cpp); a cor base fica aqui e o jogo
# resolve a variante em tempo de execucao.
EFEITO = {
    "CONST_ME_HITAREA": "hit-area",
    "CONST_ME_CLAW_WHITE": "claw-white",
    "CONST_ME_BLOW_WHITE": "blow-white",
    "CONST_ME_WHIRLWIND_BLOW_WHITE": "whirlwind-white",
    "CONST_ME_PULSE_WHITE": "pulse-white",
    "CONST_ME_OUTBURST_WHITE": "outburst-white",
    "CONST_ME_WHITE_ENERGY_SPARK": "white-energy-spark",
    "CONST_ME_EXPLOSIONAREA": "explosion-area",
    "CONST_ME_HITBYFIRE": "hit-by-fire",
    "CONST_ME_MAGIC_BLUE": "magic-blue",
    "CONST_ME_MAGIC_GREEN": "magic-green",
    "CONST_ME_MAGIC_RED": "magic-red",
    "CONST_ME_HOLYAREA": "holy-area",
    "CONST_ME_HOLYDAMAGE": "holy-damage",
    "CONST_ME_ENERGYHIT": "energy-damage",
    "CONST_ME_ENERGYAREA": "energy-area",
    "CONST_ME_POISONAREA": "poison-area",
    "CONST_ME_GREEN_RINGS": "green-rings",
    "CONST_ME_BLOCKHIT": "block-hit",
    "CONST_ME_DRAWBLOOD": "draw-blood",
    "CONST_ME_GROUNDSHAKER": "groundshaker",
    "CONST_ME_BIGCLOUDS": "big-clouds",
    "CONST_ME_STONES": "stones",
    "CONST_ME_ICEAREA": "ice-area",
    "CONST_ME_ICEATTACK": "ice-attack",
    "CONST_ME_FIREAREA": "fire-area",
    "CONST_ME_MORTAREA": "mort-area",
    "CONST_ME_PURPLEENERGY": "purple-energy",
    "CONST_ME_LOSEENERGY": "lose-energy",
    "CONST_ME_POFF": "poff",
}

TIPO_DANO = {
    "COMBAT_PHYSICALDAMAGE": "physical",
    "COMBAT_ENERGYDAMAGE": "energy",
    "COMBAT_EARTHDAMAGE": "earth",
    "COMBAT_FIREDAMAGE": "fire",
    "COMBAT_ICEDAMAGE": "ice",
    "COMBAT_DEATHDAMAGE": "death",
    "COMBAT_HOLYDAMAGE": "holy",
    "COMBAT_HEALING": "healing",
}


def le_areas():
    """AREA_* -> {sqm, raio} lendo as matrizes do register_spells.lua."""
    if not os.path.exists(LIB):
        return {}
    txt = open(LIB, encoding="utf-8", errors="replace").read()
    saida = {}
    for m in re.finditer(r"^(AREA_\w+)\s*=\s*\{(.*?)^\}", txt, re.S | re.M):
        linhas = []
        for ln in re.finditer(r"\{([^{}]*)\}", m.group(2)):
            nums = [int(x) for x in re.findall(r"-?\d+", ln.group(1))]
            if nums:
                linhas.append(nums)
        if not linhas:
            continue
        sqm = 0
        cx = cy = 0
        for y, l in enumerate(linhas):
            for x, v in enumerate(l):
                if v == 3:
                    cx, cy = x, y
                    sqm += 1
                elif v == 1:
                    sqm += 1
        raio = 0
        for y, l in enumerate(linhas):
            for x, v in enumerate(l):
                if v in (1, 3):
                    raio = max(raio, max(abs(x - cx), abs(y - cy)))
        saida[m.group(1)] = {"sqm": sqm, "raio": raio}
    return saida


def num(txt, pat, grupo=1):
    m = re.search(pat, txt)
    if not m:
        return None
    expr = m.group(grupo)
    mult = re.match(r"\s*([\d.]+)\s*\*\s*([\d.]+)", expr)
    if mult:
        return int(float(mult.group(1)) * float(mult.group(2)))
    d = re.search(r"[\d.]+", expr)
    return int(float(d.group(0))) if d else None


def main():
    if not os.path.isdir(SPELLS):
        raise SystemExit("ERRO: %s nao existe." % SPELLS)

    areas = le_areas()
    print("areas lidas: %d" % len(areas))

    magias = {}
    for sub in ("attack", "healing", "support"):
        d = os.path.join(SPELLS, sub)
        if not os.path.isdir(d):
            continue
        for arq in sorted(os.listdir(d)):
            if not arq.endswith(".lua"):
                continue
            txt = open(os.path.join(d, arq), encoding="utf-8",
                       errors="replace").read()
            # so magias de monk
            if "monk" not in txt.lower():
                continue
            voc = re.search(r'spell:vocation\(([^)]*)\)', txt)
            if not voc or "monk" not in voc.group(1).lower():
                continue

            w = re.search(r'spell:words\("([^"]+)"', txt)
            if not w:
                continue
            palavras = w.group(1)
            sid = palavras.replace(" ", "-")

            e = {"words": palavras}
            nm = re.search(r'spell:name\("([^"]+)"', txt)
            if nm:
                e["nome"] = nm.group(1)

            # SPELL_BASE_POWER, ou a variante _CENTER do sweeping takedown,
            # que tem duas potencias (centro cheio e as bordas em 75%)
            pot = re.search(r"SPELL_BASE_POWER\s*=\s*([\d.]+)", txt)
            if not pot:
                pot = re.search(r"SPELL_BASE_POWER_CENTER\s*=\s*([\d.]+)", txt)
                if pot:
                    # as casas fora do centro batem por 0.75 do valor cheio
                    e["powBorda"] = 0.75
            if pot:
                e["pow"] = float(pot.group(1))

            tp = re.search(r"COMBAT_PARAM_TYPE,\s*(COMBAT_\w+)", txt)
            if tp:
                e["element"] = TIPO_DANO.get(tp.group(1), "physical")

            ef = re.search(r"COMBAT_PARAM_EFFECT,\s*(CONST_ME_\w+)", txt)
            if ef:
                e["fx"] = EFEITO.get(ef.group(1))
                e["fxRaw"] = ef.group(1)

            ch = re.search(r"CHAIN_EFFECT,\s*(CONST_ME_\w+)", txt)
            if ch:
                e["chainFx"] = EFEITO.get(ch.group(1))

            ar = re.search(r"createCombatArea\(\s*(AREA_\w+)", txt)
            if ar:
                e["areaNome"] = ar.group(1)
                if ar.group(1) in areas:
                    e["area"] = areas[ar.group(1)]

            # chain: getChainValue devolve (alvos, distancia, backtracking)
            alvos = re.search(r"local targets\s*=\s*(\d+)", txt)
            dist = re.search(r"return targets,\s*(\d+)", txt)
            if alvos and dist:
                e["chain"] = {"alvos": int(alvos.group(1)),
                              "dist": int(dist.group(1))}

            for campo, chave in (("range", "range"), ("level", "lvl"),
                                 ("mana", "mana"), ("cooldown", "cd"),
                                 ("groupCooldown", "gcd")):
                v = num(txt, r"spell:%s\(([^)]+)\)" % campo)
                if v is not None:
                    e[chave] = v

            mk = re.search(r"monkSpellType\(MonkSpell_(\w+)\)", txt)
            if mk:
                e["monk"] = mk.group(1).lower()

            magias[sid] = e

    comPow = [k for k, v in magias.items() if v.get("pow")]
    comArea = [k for k, v in magias.items() if v.get("area")]
    comChain = [k for k, v in magias.items() if v.get("chain")]
    print("magias de monk: %d (%d com base power, %d com area, %d com chain)"
          % (len(magias), len(comPow), len(comArea), len(comChain)))
    for k in sorted(comChain):
        print("   chain: %-22s %s" % (k, magias[k]["chain"]))

    os.makedirs(os.path.join(GAME, "data"), exist_ok=True)
    with open(os.path.join(GAME, "data", "monkspells.json"), "w",
              encoding="utf-8") as fh:
        json.dump(magias, fh, ensure_ascii=False, indent=1, sort_keys=True)
    with open(os.path.join(GAME, "js", "monkspelldata.js"), "w",
              encoding="utf-8") as fh:
        fh.write("/* Gerado por tools/import_monk_spells.py a partir dos\n"
                 " * scripts .lua das magias do Monk no Canary: base power,\n"
                 " * efeito do client 15.x, area real e chain. */\n")
        fh.write("window.MONKSPELLDATA = ")
        json.dump(magias, fh, ensure_ascii=False, separators=(",", ":"),
                  sort_keys=True)
        fh.write(";\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
