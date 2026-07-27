#!/usr/bin/env python3
"""Importa os quivers oficiais do Canary e confere as municoes.

O commit anterior adicionou as 22 municoes com a tabela correta, mas os
quivers foram inventados (basic/modified/ornate/sanguine/soulpiercer nao
existem no servidor) e as sprites eram um placeholder repetido.

Aqui os quivers vem do items.xml de verdade:

  quiver / blue / red   6 espacos, sem nivel, qualquer um
  jungle                8 espacos, nivel 150
  candy-coated          8 espacos, nivel 200, +2% resistencia a fogo
  eldritch              8 espacos, nivel 250, perfect shot +20 a 4 SQM
  naga                  8 espacos, nivel 250, +2% resistencia a gelo
  alicorn              12 espacos, nivel 400, perfect shot +20 a 3 SQM, +1 ml

Perfect shot (src/items/weapons/weapons.cpp): quando o alvo esta EXATAMENTE
na distancia do quiver, o tiro ganha o dano fixo e nao pode errar.

Saida: game/data/quivers.json + game/js/quiverdata.js
"""
import json
import os
import re
import sys
import xml.etree.ElementTree as ET

CAN = sys.argv[1] if len(sys.argv) > 1 else "/tmp/can"
GAME = sys.argv[2] if len(sys.argv) > 2 else os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "..", "game")

# municoes na ordem da tabela acordada com o usuario
AMMO_IDS = [
    761, 762, 763, 774, 21470, 3448, 3447, 16143, 3449, 7364, 14251,
    25757, 7365, 15793,
    3446, 7363, 14252, 3450, 16142, 16141, 6528, 25758,
]

QUIVER_IDS = [35562, 35848, 35849, 35524, 45644, 36666, 39160, 39150]

# custo por tiro. Onde o shops.lua tem preco de NPC os valores batem; as
# municoes sem NPC (burst, simple, infernal) usam a tabela do jogo.
CUSTO = {
    "flash arrow": 5, "shiver arrow": 5, "flaming arrow": 5,
    "earth arrow": 5, "simple arrow": 2, "poison arrow": 4, "arrow": 3,
    "envenomed arrow": 12, "burst arrow": 15, "sniper arrow": 5,
    "tarsal arrow": 6, "diamond arrow": 130, "onyx arrow": 7,
    "crystalline arrow": 20, "bolt": 4, "piercing bolt": 5,
    "vortex bolt": 6, "power bolt": 7, "drill bolt": 12,
    "prismatic bolt": 20, "infernal bolt": 13, "spectral bolt": 70,
}

# nivel declarado no script de weapon, e nao no items.xml
NIVEL_EXTRA = {"diamond arrow": 150, "spectral bolt": 150}

# elemento por nome: o items.xml nao declara elementXXX nessas municoes,
# o dano elemental vem do shootType/efeito
ELEMENTO = {
    "flash arrow": "energy", "shiver arrow": "ice",
    "flaming arrow": "fire", "earth arrow": "earth",
    "poison arrow": "earth", "envenomed arrow": "earth",
    "onyx arrow": "death", "crystalline arrow": "ice",
    "tarsal arrow": "earth", "prismatic bolt": "holy",
    "infernal bolt": "fire", "spectral bolt": "death",
    "vortex bolt": "energy",
}

# efeitos confirmados nos weapons/scripts do canary
ESPECIAL = {
    "burst arrow": {"area": 3, "desc": "Explode em 3x3 e nunca erra"},
    "diamond arrow": {"area": 5, "desc": "Explode em 5x5 e nunca erra"},
    "poison arrow": {"poison": {"dmg": 3, "turns": 5},
                     "desc": "Envenena o alvo"},
    "envenomed arrow": {"poison": {"dmg": 8, "turns": 6},
                        "desc": "Veneno forte"},
}


def slug(nome):
    return re.sub(r"[^a-z0-9]+", "-", (nome or "").lower()).strip("-")


def ler_items():
    """Le o items.xml com ElementTree.

    A leitura por regex perdia itens: o diamond arrow tem article="a" entre
    o id e o name, e ha tags <item/> auto-fechadas que faziam o casamento
    ate </item> pular entradas inteiras.

    Os atributos tambem podem estar aninhados — o canary poe level, vocation
    e slot DENTRO do <attribute key="script"> — entao a leitura desce a
    arvore, senao o nivel exigido se perde.
    """
    raiz = ET.parse(os.path.join(CAN, "data", "items", "items.xml")).getroot()
    out = {}
    for el in raiz.iter("item"):
        iid = el.get("id")
        if not iid or not iid.isdigit():
            continue
        attrs = {}

        def coletar(no):
            for a in no.findall("attribute"):
                k = (a.get("key") or "").lower()
                if k and a.get("value") is not None:
                    attrs.setdefault(k, a.get("value"))
                coletar(a)

        coletar(el)
        out[int(iid)] = {"nome": el.get("name") or "", "attrs": attrs}
    return out


def main():
    itens = ler_items()

    ammo = {}
    for iid in AMMO_IDS:
        it = itens.get(iid)
        if not it:
            print("  ! municao ausente:", iid)
            continue
        a = it["attrs"]
        nome = it["nome"]
        e = {
            "id": slug(nome), "itemId": iid, "nome": nome,
            "tipo": "bolt" if "bolt" in nome else "arrow",
            "atk": int(a.get("attack", 0) or 0),
            "lvl": NIVEL_EXTRA.get(nome, int(a.get("level", 0) or 0)),
            "peso": int(a.get("weight", 0) or 0) / 100.0,
            "custo": CUSTO.get(nome, 5),
            # maxhitchance 100 = nunca erra (burst, diamond); 91 = normal.
            # Antes o "nunca erra" estava chumbado numa lista no codigo.
            "hit": int(a.get("maxhitchance", 0) or 0),
        }
        if e["hit"] >= 100:
            e["noMiss"] = True
        if ELEMENTO.get(nome):
            e["el"] = ELEMENTO[nome]
        esp = ESPECIAL.get(nome)
        if esp:
            e.update({k: v for k, v in esp.items() if k != "desc"})
            e["desc"] = esp["desc"]
        ammo[e["id"]] = e

    quivers = {}
    for iid in QUIVER_IDS:
        it = itens.get(iid)
        if not it:
            print("  ! quiver ausente:", iid)
            continue
        a = it["attrs"]
        nome = it["nome"]
        lvl = int(a.get("level", 0) or 0)
        e = {
            "id": slug(nome), "itemId": iid, "nome": nome, "lvl": lvl,
            "slots": int(a.get("containersize", 6) or 6),
            "peso": int(a.get("weight", 0) or 0) / 100.0,
            # os basicos custam 400 no shops.lua; os de nivel escalam
            "preco": 400 if lvl == 0 else 400 + lvl * 180,
        }
        if a.get("perfectshotdamage"):
            e["shotDmg"] = int(a["perfectshotdamage"])
            e["shotRange"] = int(a.get("perfectshotrange", 0) or 0)
        prot = {}
        for k, v in a.items():
            m = re.match(r"absorbpercent(\w+)", k)
            if m:
                prot[m.group(1)] = int(v)
        if prot:
            e["prot"] = prot
        if a.get("magiclevelpoints"):
            e["mag"] = int(a["magiclevelpoints"])
        quivers[e["id"]] = e

    dados = {"ammo": ammo, "quivers": quivers}
    with open(os.path.join(GAME, "data", "quivers.json"), "w",
              encoding="utf-8") as fh:
        json.dump(dados, fh, ensure_ascii=False, separators=(",", ":"))
    with open(os.path.join(GAME, "js", "quiverdata.js"), "w",
              encoding="utf-8") as fh:
        fh.write("/* Gerado por tools/import_quivers.py\n"
                 " * items.xml do canary: atributos das municoes e dos\n"
                 " * quivers, incluindo perfect shot e resistencias. */\n")
        fh.write("window.QUIVERDATA = " +
                 json.dumps(dados, ensure_ascii=False,
                            separators=(",", ":")) + ";\n")

    print("municoes: %d" % len(ammo))
    for v in sorted(ammo.values(), key=lambda x: (x["tipo"], x["atk"])):
        print("   %-5s %-20s atk %-3d lvl %-4s %3d gp/tiro %s%s"
              % (v["tipo"], v["nome"], v["atk"], v["lvl"] or "-", v["custo"],
                 v.get("el", ""), " " + v.get("desc", "")))
    print("quivers: %d" % len(quivers))
    for v in sorted(quivers.values(), key=lambda x: x["lvl"]):
        print("   %-20s lvl %-4s %2d slots %s%s"
              % (v["nome"], v["lvl"] or "-", v["slots"],
                 ("perfect +%d a %d SQM " % (v["shotDmg"], v["shotRange"]))
                 if v.get("shotDmg") else "", v.get("prot", "")))


if __name__ == "__main__":
    main()
