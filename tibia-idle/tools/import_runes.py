#!/usr/bin/env python3
"""
Le os scripts .lua das runas do Canary e extrai TUDO que o combate precisa:

    formula de dano, tipo de dano, efeito de impacto, projetil,
    area de efeito (a grade real, nao um nome solto), cargas,
    nivel, magic level, cooldown e as conditions (fogo/veneno/energia)

Por que ler o .lua e nao o items.xml: a runa nao tem atributo de dano no
items.xml. O dano mora na funcao onGetFormulaValues() de cada script, e a
area mora no setArea(createCombatArea(AREA_*)). Sao duas informacoes que so
existem no Lua.

A grade de area e resolvida de verdade: AREA_CIRCLE3X3 vira a matriz 7x7 do
register_spells.lua, e dela sai quantos SQMs a runa cobre. Antes o jogo
guardava so a string "AREA_CIRCLE3X3" e ignorava.

Saida:
    game/data/runes.json
    game/js/runedata.js   (window.RUNEDATA)
"""
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.normpath(os.path.join(HERE, "..", "game"))
CAN = os.environ.get("CANARY", "/tmp/can")
RUNES_DIR = os.path.join(CAN, "data", "scripts", "runes")
LIB = os.path.join(CAN, "data", "scripts", "lib", "register_spells.lua")

# COMBAT_*DAMAGE -> elemento usado pelo jogo
TIPO_DANO = {
    "COMBAT_PHYSICALDAMAGE": "physical",
    "COMBAT_FIREDAMAGE": "fire",
    "COMBAT_ICEDAMAGE": "ice",
    "COMBAT_ENERGYDAMAGE": "energy",
    "COMBAT_EARTHDAMAGE": "earth",
    "COMBAT_DEATHDAMAGE": "death",
    "COMBAT_HOLYDAMAGE": "holy",
    "COMBAT_HEALING": "healing",
    "COMBAT_MANADRAIN": "mana",
    "COMBAT_LIFEDRAIN": "death",
}

# CONST_ME_* (efeito no alvo) -> sprite de efeito que o jogo ja tem em
# assets/fx. O nome do arquivo segue o padrao do otclient.
EFEITO = {
    "CONST_ME_ICEAREA": "ice-area",
    "CONST_ME_ICEATTACK": "ice-attack",
    "CONST_ME_FIREAREA": "fire-area",
    "CONST_ME_HITBYFIRE": "hit-by-fire",
    "CONST_ME_EXPLOSIONAREA": "explosion-area",
    "CONST_ME_EXPLOSIONHIT": "explosion-hit",
    "CONST_ME_ENERGYAREA": "energy-area",
    "CONST_ME_ENERGYHIT": "energy-damage",
    "CONST_ME_MORTAREA": "mort-area",
    "CONST_ME_POISONAREA": "poison-area",
    "CONST_ME_GREEN_RINGS": "green-rings",
    "CONST_ME_HOLYAREA": "holy-area",
    "CONST_ME_HOLYDAMAGE": "holy-damage",
    "CONST_ME_MAGIC_BLUE": "magic-blue",
    "CONST_ME_MAGIC_RED": "magic-red",
    "CONST_ME_MAGIC_GREEN": "magic-green",
    "CONST_ME_STONES": "stones",
    "CONST_ME_SMALLPLANTS": "small-plants",
    "CONST_ME_CARNIPHILA": "carniphila",
    "CONST_ME_PURPLEENERGY": "purple-energy",
    "CONST_ME_BLOCKHIT": "block-hit",
    "CONST_ME_DRAWBLOOD": "draw-blood",
    "CONST_ME_LOSEENERGY": "lose-energy",
    "CONST_ME_POFF": "poff",
    "CONST_ME_SOUND_GREEN": "sound-green",
}

# CONST_ANI_* (projetil) -> sprite de missile
PROJETIL = {
    "CONST_ANI_ICE": "ice",
    "CONST_ANI_FIRE": "fire",
    "CONST_ANI_ENERGY": "energy",
    "CONST_ANI_EXPLOSION": "explosion",
    "CONST_ANI_SUDDENDEATH": "sudden-death",
    "CONST_ANI_DEATH": "death",
    "CONST_ANI_EARTH": "earth",
    "CONST_ANI_POISON": "earth",
    "CONST_ANI_HOLY": "holy",
    "CONST_ANI_SMALLSTONE": "small-stone",
    "CONST_ANI_LARGEROCK": "large-rock",
    "CONST_ANI_SMALLICE": "small-ice",
    "CONST_ANI_SMALLEARTH": "small-earth",
    "CONST_ANI_SMALLHOLY": "small-holy",
    "CONST_ANI_ETHEREALSPEAR": "ethereal-spear",
    "CONST_ANI_FLASHARROW": "flash-arrow",
}

# CONDITION_* -> tipo de condition que o jogo ja aplica
CONDICAO = {
    "CONDITION_FIRE": "fire",
    "CONDITION_POISON": "poison",
    "CONDITION_ENERGY": "energy",
    "CONDITION_DROWN": "drown",
    "CONDITION_FREEZING": "freezing",
    "CONDITION_DAZZLED": "dazzled",
    "CONDITION_CURSED": "cursed",
    "CONDITION_PARALYZE": "paralyze",
}


def slugify(nome):
    return re.sub(r"[^a-z0-9]+", "-", nome.strip().lower()).strip("-")


# ------------------------------------------------------------ areas
def le_areas():
    """Nome da area -> grade de 0/1/3 (3 = centro), do register_spells.lua."""
    if not os.path.exists(LIB):
        return {}
    txt = open(LIB, encoding="utf-8", errors="replace").read()
    saida = {}
    for m in re.finditer(r"^(AREA_\w+)\s*=\s*\{(.*?)^\}", txt, re.S | re.M):
        nome = m.group(1)
        linhas = []
        for ln in re.finditer(r"\{([^{}]*)\}", m.group(2)):
            nums = [int(x) for x in re.findall(r"-?\d+", ln.group(1))]
            if nums:
                linhas.append(nums)
        if linhas:
            saida[nome] = linhas
    return saida


def mede_area(grade):
    """Quantos SQMs a area cobre e qual o raio, a partir da grade real.

    O centro e marcado com 3. Contar os 1s (mais o centro) da exatamente
    quantas casas a runa atinge — e assim que o servidor monta a lista de
    tiles afetados.
    """
    if not grade:
        return None
    sqm = 0
    cx = cy = 0
    for y, linha in enumerate(grade):
        for x, v in enumerate(linha):
            if v == 3:
                cx, cy = x, y
                sqm += 1
            elif v == 1:
                sqm += 1
    # raio = maior distancia de Chebyshev do centro ate uma casa marcada
    raio = 0
    for y, linha in enumerate(grade):
        for x, v in enumerate(linha):
            if v in (1, 3):
                raio = max(raio, max(abs(x - cx), abs(y - cy)))
    return {"sqm": sqm, "raio": raio,
            "w": max(len(l) for l in grade), "h": len(grade)}


# ------------------------------------------------------------ formula
def le_formula(txt):
    """Extrai min/max de onGetFormulaValues como coeficientes.

    As formulas do Canary tem sempre a forma
        (level / 5) + (maglevel * K) + C
    entao da para pegar os coeficientes sem executar Lua. Quando aparece
    algo fora desse padrao o retorno e None e o chamador decide.
    """
    m = re.search(r"function onGetFormulaValues\((.*?)\)(.*?)\bend\b", txt, re.S)
    if not m:
        return None
    corpo = m.group(2)

    def coefs(expr):
        """-> (coefLevel, coefMagic, constante) da expressao.

        Dois detalhes que ja quebraram a extracao:

        1. O lookbehind (?<!mag)(?<!magic) e essencial: sem ele o regex de
           "level" casa DENTRO de "maglevel"/"magicLevel" e o coeficiente do
           magic level acaba copiado para o do level. A avalanche saia com
           lvlMin 1.2 em vez de 0.2 (1/5).

        2. Os scripts usam duas grafias -- "maglevel" e "magicLevel". Sem o
           re.I a segunda passava batido e stone shower e thunderstorm
           ficavam com coeficiente de magic level ZERO (26-36 de dano no
           nivel 100 em vez de 156-286).
        """
        lvl = mag = const = 0.0
        # (level / N)
        d = re.search(r"(?<!mag)(?<!magic)level\s*/\s*([\d.]+)", expr, re.I)
        if d:
            lvl = 1.0 / float(d.group(1))
        # level * N  (algumas runas usam multiplicacao)
        d = re.search(r"(?<!mag)(?<!magic)level\s*\*\s*([\d.]+)", expr, re.I)
        if d:
            lvl = float(d.group(1))
        # maglevel * N  /  magicLevel * N
        d = re.search(r"mag(?:ic)?level\s*\*\s*([\d.]+)", expr, re.I)
        if d:
            mag = float(d.group(1))
        # constante solta no fim: + N (que nao seja parte de outra conta)
        for c in re.finditer(r"\+\s*([\d.]+)\s*(?:$|\n|\))", expr):
            const += float(c.group(1))
        if const == 0:
            partes = re.findall(r"\+\s*([\d.]+)", expr)
            if partes:
                const = float(partes[-1])
        return lvl, mag, const

    out = {}
    for chave in ("min", "max"):
        lm = re.search(r"local\s+%s\s*=\s*([^\n]+)" % chave, corpo)
        if not lm:
            return None
        expr = lm.group(1).strip()
        if re.fullmatch(r"-?\d+(\.\d+)?", expr):     # ex.: local min = 0
            out[chave] = (0.0, 0.0, float(expr))
        else:
            out[chave] = coefs(expr)
    # `modo: magic` e obrigatorio: o supplyPowerFor() do jogo usa esse campo
    # para escolher entre a conta de level+magic level e a de skill de
    # distancia. Sem ele TODA runa caia no ramo errado e o dano saia torto.
    # Toda formula de runa do Canary e level+maglevel, entao e sempre magic.
    return {
        "modo": "magic",
        "lvlMin": round(out["min"][0], 4), "mlMin": round(out["min"][1], 4),
        "flatMin": round(out["min"][2], 2),
        "lvlMax": round(out["max"][0], 4), "mlMax": round(out["max"][1], 4),
        "flatMax": round(out["max"][2], 2),
    }


def const_lua(txt, chamada):
    m = re.search(re.escape(chamada) + r"\s*\(\s*([^)]*?)\s*\)", txt)
    return m.group(1).strip() if m else None


def num_lua(txt, chamada):
    m = re.search(r"rune:" + chamada + r"\s*\(\s*([^)]+?)\s*\)", txt)
    if not m:
        return None
    expr = m.group(1)
    mult = re.match(r"([\d.]+)\s*\*\s*([\d.]+)", expr)
    if mult:
        return int(float(mult.group(1)) * float(mult.group(2)))
    d = re.search(r"[\d.]+", expr)
    return int(float(d.group(0))) if d else None


def main():
    if not os.path.isdir(RUNES_DIR):
        raise SystemExit("ERRO: %s nao existe. Clone o canary primeiro." % RUNES_DIR)

    areas = le_areas()
    print("areas lidas do register_spells.lua: %d" % len(areas))

    runas = {}
    for arq in sorted(os.listdir(RUNES_DIR)):
        if not arq.endswith(".lua"):
            continue
        txt = open(os.path.join(RUNES_DIR, arq), encoding="utf-8",
                   errors="replace").read()

        nm = re.search(r'rune:name\s*\(\s*"([^"]+)"', txt)
        if not nm:
            continue
        nome = nm.group(1)
        slug = slugify(nome)

        d = {"id": slug, "nome": nome.title()}

        rid = num_lua(txt, "runeId")
        if rid:
            d["itemId"] = rid
        for campo, chave in (("level", "lvl"), ("magicLevel", "ml"),
                             ("charges", "cargas"), ("cooldown", "cd"),
                             ("groupCooldown", "gcd")):
            v = num_lua(txt, campo)
            if v is not None:
                d[chave] = v

        g = re.search(r'rune:group\s*\(\s*"([^"]+)"', txt)
        if g:
            d["grupo"] = g.group(1)

        # tipo de dano -> elemento
        tp = re.search(r"COMBAT_PARAM_TYPE,\s*(COMBAT_\w+)", txt)
        if tp:
            d["element"] = TIPO_DANO.get(tp.group(1), "physical")

        # efeito de impacto e projetil
        ef = re.search(r"COMBAT_PARAM_EFFECT,\s*(CONST_ME_\w+)", txt)
        if ef:
            d["fx"] = EFEITO.get(ef.group(1))
            d["fxRaw"] = ef.group(1)
        pr = re.search(r"COMBAT_PARAM_DISTANCEEFFECT,\s*(CONST_ANI_\w+)", txt)
        if pr:
            d["missile"] = PROJETIL.get(pr.group(1))
            d["missileRaw"] = pr.group(1)

        # area: resolve a grade de verdade
        ar = re.search(r"createCombatArea\s*\(\s*(AREA_\w+)", txt)
        if ar:
            d["areaNome"] = ar.group(1)
            medida = mede_area(areas.get(ar.group(1)))
            if medida:
                d["area"] = medida

        if re.search(r"rune:needTarget\s*\(\s*true", txt):
            d["needTarget"] = 1
        if re.search(r"rune:allowFarUse\s*\(\s*true", txt):
            d["farUse"] = 1

        # formula de dano
        f = le_formula(txt)
        if f:
            d["f"] = f
            d["tipo"] = "attack"
        elif d.get("element") == "healing":
            d["tipo"] = "healing"
        else:
            d["tipo"] = "suporte"

        # condition aplicada (soulfire, poison bomb, fire bomb, wild growth...)
        cond = re.search(r"Condition\s*\(\s*(CONDITION_\w+)", txt)
        if cond:
            tipo = CONDICAO.get(cond.group(1))
            if tipo:
                c = {"tipo": tipo}
                dm = re.search(r"CONDITION_PARAM_(?:MIN|)DAMAGE\w*,\s*(\d+)", txt)
                # o padrao mais comum e addDamage(N, intervalo, dano)
                add = re.search(r"addDamage\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*-?(\d+)", txt)
                if add:
                    c["golpes"] = int(add.group(1))
                    c["intervalo"] = int(add.group(2))
                    c["dano"] = int(add.group(3))
                elif dm:
                    c["dano"] = int(dm.group(1))
                d["cond"] = c
                if d["tipo"] == "suporte":
                    d["tipo"] = "attack"      # dano over time ainda e ataque

        runas[slug] = d

    ataque = [k for k, v in runas.items() if v["tipo"] == "attack"]
    comArea = [k for k in ataque if runas[k].get("area")]
    comCond = [k for k in ataque if runas[k].get("cond")]
    print("runas: %d (%d de ataque, %d com area, %d com condition)"
          % (len(runas), len(ataque), len(comArea), len(comCond)))

    os.makedirs(os.path.join(GAME, "data"), exist_ok=True)
    with open(os.path.join(GAME, "data", "runes.json"), "w",
              encoding="utf-8") as fh:
        json.dump(runas, fh, ensure_ascii=False, indent=1, sort_keys=True)
    with open(os.path.join(GAME, "js", "runedata.js"), "w",
              encoding="utf-8") as fh:
        fh.write("/* Gerado por tools/import_runes.py a partir dos scripts\n"
                 " * .lua das runas do Canary: formula de dano, efeito,\n"
                 " * projetil, area (grade real) e conditions. */\n")
        fh.write("window.RUNEDATA = ")
        json.dump(runas, fh, ensure_ascii=False, separators=(",", ":"),
                  sort_keys=True)
        fh.write(";\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
