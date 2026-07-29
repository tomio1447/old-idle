"""
Importa o catalogo de municoes (flechas e virotes) do Canary.

Por que: o jogo tinha apenas 6 municoes escritas a mao em gamedata.js
(arrow, bolt, power-bolt, burst-arrow, poison-arrow, infernal-bolt), mas o
combat.js ja citava diamond-arrow, onyx-arrow, crystalline-arrow, tarsal-arrow
e outras no mapa AMMO_MISSILE. Essas municoes simplesmente NAO EXISTIAM no
catalogo, entao nunca podiam ser equipadas nem cair de loot — e a diamond
arrow, que o usuario reportou "nao bate em area", nao tinha nem item.

Fontes:
  * data/items/items.xml   -> ataque, tipo de municao, nivel, peso, sprite
  * data/scripts/weapons/scripts/*.lua -> area de efeito e formula

Area: o Canary escreve a area como matriz, onde 3 e o centro (o alvo) e 1 sao
as casas atingidas. A burst arrow e um 3x3 cheio; a diamond arrow e um 5x5 em
CRUZ (os quatro cantos ficam de fora). O jogo antigo tratava area como um raio
circular unico (`area: 1`), o que nao consegue representar a cruz — por isso
gravamos a matriz de verdade.

Uso: python3 import_ammo.py [dir_do_canary] [dir_do_game]
"""
import json
import os
import re
import sys

CAN = sys.argv[1] if len(sys.argv) > 1 else "/tmp/can"
GAME = sys.argv[2] if len(sys.argv) > 2 else os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "..", "game")

# elemento por municao. O items.xml guarda isso em <attribute key="elementX">
# so em parte dos casos, entao completamos pelo nome, que e como o jogo ja
# classificava as flechas elementais.
ELEM_POR_NOME = {
    "flaming arrow": "fire", "flash arrow": "energy",
    "shiver arrow": "ice", "earth arrow": "earth",
    "envenomed arrow": "earth", "poison arrow": "earth",
    "infernal bolt": "fire", "vortex bolt": "energy",
    "prismatic bolt": "energy", "drill bolt": "physical",
    "spectral bolt": "death", "onyx arrow": "death",
    "crystalline arrow": "earth", "tarsal arrow": "earth",
    "sniper arrow": "physical", "diamond arrow": "physical",
    "burst arrow": "physical", "power bolt": "energy",
    "arrow": "physical", "bolt": "physical", "simple arrow": "physical",
    "piercing bolt": "physical", "royal star": "physical",
}


def slug(nome):
    return re.sub(r"[^a-z0-9]+", "-", nome.lower()).strip("-")


# CONST_ME_* -> sheet em assets/fx, para o estouro da municao com area
ME_FX = {
    "EXPLOSIONAREA": "explosion-area", "ENERGYHIT": "energy-hit",
    "HITAREA": "hit-area", "FIREAREA": "fire-area", "ICEAREA": "ice-area",
    "POISONAREA": "poison-area", "MORTAREA": "mort-area",
    "HOLYAREA": "holy-area", "ENERGYAREA": "energy-area",
}


def parse_matriz(txt):
    """Le a primeira createCombatArea do script e devolve a matriz."""
    m = re.search(r"createCombatArea\(\{(.*?)\}\)", txt, re.S)
    if not m:
        return None
    linhas = re.findall(r"\{([^{}]*)\}", m.group(1))
    matriz = []
    for ln in linhas:
        nums = [int(x) for x in re.findall(r"-?\d+", ln)]
        if nums:
            matriz.append(nums)
    return matriz or None


def scripts_das_municoes():
    """{id_do_item: {area, lvl}} lendo os scripts de arma do Canary.

    O nivel minimo mora no script (`diamondArrow:level(150)`), nao no
    items.xml, entao precisa sair daqui junto com a area.
    """
    base = os.path.join(CAN, "data", "scripts", "weapons", "scripts")
    out = {}
    if not os.path.isdir(base):
        return out
    for a in os.listdir(base):
        if not a.endswith(".lua"):
            continue
        txt = open(os.path.join(base, a), encoding="utf-8",
                   errors="ignore").read()
        matriz = parse_matriz(txt)
        lvl = re.search(r":level\((\d+)\)", txt)
        fx = re.search(r"COMBAT_PARAM_EFFECT,\s*CONST_ME_([A-Z_0-9]+)", txt)
        if not matriz and not lvl:
            continue
        reg = {}
        if matriz:
            reg["area"] = matriz
        if lvl:
            reg["lvl"] = int(lvl.group(1))
        if fx and fx.group(1) in ME_FX:
            reg["fx"] = ME_FX[fx.group(1)]
        for i in re.findall(r":id\((\d+)\)", txt):
            out[int(i)] = reg
    return out


def main():
    xml = os.path.join(CAN, "data", "items", "items.xml")
    if not os.path.exists(xml):
        print("items.xml nao encontrado")
        return
    txt = open(xml, encoding="utf-8", errors="ignore").read()
    scripts = scripts_das_municoes()

    itens = {}
    for bloco in re.finditer(
            r'<item id="(\d+)"[^>]*name="([^"]+)">(.*?)</item>', txt, re.S):
        iid, nome, corpo = int(bloco.group(1)), bloco.group(2), bloco.group(3)
        attrs = dict((k, v) for k, v in re.findall(
            r'<attribute key="([^"]+)" value="([^"]+)"', corpo))
        if attrs.get("weaponType") != "ammunition" and \
           attrs.get("primarytype") != "ammunition":
            continue
        tipo = attrs.get("ammotype")
        if tipo not in ("arrow", "bolt"):
            continue
        s = slug(nome)
        atk = int(attrs.get("attack", 0) or 0)
        if not atk:
            continue
        # o mesmo nome aparece em varios ids (versoes de evento); fica o
        # de maior ataque, que e a versao "de verdade"
        if s in itens and itens[s]["atk"] >= atk:
            continue
        reg = {
            "n": nome, "s": "ammo", "t": "ammo", "atk": atk,
            "ammoKind": tipo,
            "el": ELEM_POR_NOME.get(nome.lower(), "physical"),
            "w": float(attrs.get("weight", 0) or 0) / 100.0,
        }
        if attrs.get("maxhitchance") == "100":
            # maxhitchance 100 e o "nunca erra" do servidor
            reg["noMiss"] = 1
        sc = scripts.get(iid)
        if sc:
            if sc.get("area"):
                reg["areaMatrix"] = sc["area"]
            if sc.get("lvl"):
                reg["lvl"] = sc["lvl"]
            if sc.get("fx"):
                reg["areaFx"] = sc["fx"]
        itens[s] = reg

    saida = os.path.join(GAME, "data", "ammo.json")
    json.dump(itens, open(saida, "w"))
    js = os.path.join(GAME, "js", "ammodata.js")
    with open(js, "w") as f:
        f.write("/* Gerado por tools/import_ammo.py\n"
                " * Municoes lidas de data/items/items.xml do Canary. A area\n"
                " * (quando existe) vem da createCombatArea do script da arma:\n"
                " * 3 = casa do alvo, 1 = casa atingida. */\n")
        f.write("window.AMMODATA = " + json.dumps(itens) + ";\n")

    comArea = [k for k, v in itens.items() if "areaMatrix" in v]
    print("municoes:", len(itens), "| com area:", comArea)


if __name__ == "__main__":
    main()
