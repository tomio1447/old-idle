#!/usr/bin/env python3
"""Importa potions, runas e os itens iniciais de cada vocacao do Canary.

Tres fontes, todas oficiais:

  data/scripts/actions/items/potions.lua
      A tabela `potions` tem, por id de item, a cura/mana em faixa, o nivel
      minimo e quais vocacoes podem beber. E o dado que o Helper precisa para
      dizer "Strong Health Potion: knight/paladin/monk, nivel 50".

  data/scripts/runes/*.lua
      Uma runa por arquivo, com runeId, level, magicLevel, cargas e a formula
      de dano. Sao executadas em Lua real (canary_spell_runner) e a formula
      sai por regressao, igual ao que ja fizemos com as magias.

  data-otservbr-global/scripts/movements/others/dawnport_vocation_trial.lua
      Dawnport e o mapa inicial do Canary. Esse arquivo lista exatamente o
      que cada vocacao recebe ao escolher a profissao (The Scorcher para
      sorcerer, The Chiller para druid, Jo Staff para monk, dagger+shield
      para knight, bow+quiver para paladin) e o set comum de leather.

Saida: game/data/supplies.json + game/js/supplydata.js
"""
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import canary_spell_runner as runner  # noqa: E402

CAN = sys.argv[1] if len(sys.argv) > 1 else "/tmp/can"
GAME = sys.argv[2] if len(sys.argv) > 2 else os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "..", "game")

# VOCATION.BASE_ID do canary -> nome usado no jogo
VOC_BASE = {
    "SORCERER": "sorcerer", "DRUID": "druid", "PALADIN": "paladin",
    "KNIGHT": "knight", "MONK": "monk",
}


def slug(nome):
    s = re.sub(r"[^a-z0-9]+", "-", (nome or "").lower())
    return s.strip("-")


def ler_nomes_itens():
    """id do item -> nome, direto do items.xml."""
    p = os.path.join(CAN, "data", "items", "items.xml")
    s = open(p, encoding="utf-8", errors="ignore").read()
    out = {}
    for m in re.finditer(r'<item id="(\d+)"[^>]*name="([^"]*)"', s):
        out[int(m.group(1))] = m.group(2)
    return out


# ------------------------------------------------------------------ potions
def ler_potions(nomes):
    p = os.path.join(CAN, "data", "scripts", "actions", "items", "potions.lua")
    src = open(p, encoding="utf-8", errors="ignore").read()
    bloco = src[src.index("local potions = {"):]
    bloco = bloco[:bloco.index("\n}\n")]

    out = {}
    # cada entrada e uma linha [id] = { ... }; as multilinha (transcendence)
    # nao tem cura, entao a leitura por linha da conta do que interessa
    for m in re.finditer(r"\[(\d+)\]\s*=\s*\{(.*)", bloco):
        iid = int(m.group(1))
        corpo = m.group(2)
        nome = nomes.get(iid)
        if not nome:
            continue
        hp = re.search(r"health\s*=\s*\{\s*(\d+),\s*(\d+)\s*\}", corpo)
        mp = re.search(r"mana\s*=\s*\{\s*(\d+),\s*(\d+)\s*\}", corpo)
        if not hp and not mp:
            continue          # potion de buff (berserk, bullseye...) fica fora
        lvl = re.search(r"level\s*=\s*(\d+)", corpo)
        vocs = re.findall(r"VOCATION\.BASE_ID\.([A-Z]+)", corpo)
        e = {
            "id": slug(nome), "itemId": iid, "nome": nome,
            "lvl": int(lvl.group(1)) if lvl else 1,
            # sem lista de vocacao no canary = qualquer um pode beber
            "vocs": [VOC_BASE[v] for v in vocs if v in VOC_BASE]
                    or list(VOC_BASE.values()),
        }
        if hp:
            e["hp"] = [int(hp.group(1)), int(hp.group(2))]
        if mp:
            e["mp"] = [int(mp.group(1)), int(mp.group(2))]
        e["tipo"] = ("ambos" if hp and mp else ("hp" if hp else "mp"))
        out[e["id"]] = e
    return out


# -------------------------------------------------------------------- runas
def ler_runas(nomes):
    raiz = os.path.join(CAN, "data", "scripts", "runes")
    out = {}
    for f in sorted(os.listdir(raiz)):
        if not f.endswith(".lua"):
            continue
        d, err = runner.extrair(os.path.join(raiz, f))
        if not d or not d.get("name"):
            continue
        nome = d["name"]
        rid = d.get("runeId")
        e = {
            "id": slug(nome), "itemId": rid, "nome": nome.title(),
            "lvl": d.get("level") or 1,
            "ml": d.get("magicLevel") or 0,
            "cargas": d.get("charges") or 1,
            "cd": d.get("cooldown") or 2000,
            "grupo": (d.get("groups") or ["attack"])[0],
        }
        params = d.get("params") or {}
        tipo = params.get("COMBAT_PARAM_TYPE")
        ELEM = {
            "COMBAT_FIREDAMAGE": "fire", "COMBAT_ICEDAMAGE": "ice",
            "COMBAT_ENERGYDAMAGE": "energy", "COMBAT_EARTHDAMAGE": "earth",
            "COMBAT_DEATHDAMAGE": "death", "COMBAT_HOLYDAMAGE": "holy",
            "COMBAT_PHYSICALDAMAGE": "physical", "COMBAT_HEALING": "healing",
        }
        if tipo in ELEM:
            el = ELEM[tipo]
            if el == "healing":
                e["tipo"] = "heal"
            else:
                e["tipo"] = "attack"
                e["element"] = el
        else:
            e["tipo"] = "suporte"
        if d.get("areas"):
            e["area"] = d["areas"][0]
        if d.get("formula"):
            fm = dict(d["formula"])
            fm.pop("erro", None)
            e["f"] = fm
        # o canary nao lista vocacao nas runas: quem conjura e quem usa
        out[e["id"]] = e
    return out


# ----------------------------------------------------------- itens iniciais
def ler_dawnport(nomes):
    p = os.path.join(CAN, "data-otservbr-global", "scripts", "movements",
                     "others", "dawnport_vocation_trial.lua")
    src = open(p, encoding="utf-8", errors="ignore").read()

    # set comum, dado a qualquer vocacao no primeiro passo
    comum = []
    mfi = re.search(r"local function addFirstItems.*?\n\tlocal firstItems = \{(.*?)\n\t\}",
                    src, re.S)
    if mfi:
        for slot, iid in re.findall(
                r"\[CONST_SLOT_(\w+)\]\s*=\s*Game\.createItem\((\d+)\)",
                mfi.group(1)):
            iid = int(iid)
            comum.append({"itemId": iid, "nome": nomes.get(iid, str(iid)),
                          "slot": slot.lower(), "qtd": 1})

    # itens por vocacao
    por_voc = {}
    for m in re.finditer(
            r"name = \"(\w+)\",\s*\n\s*outfit = \{(.*?)\n\t\t\t\},\s*\n\s*\},\s*\n\s*items = \{(.*?)\n\t\t\},",
            src, re.S):
        voc = m.group(1)
        outfit_txt = m.group(2)
        itens_txt = m.group(3)
        itens = []
        for mi in re.finditer(
                r"\{ id = (\d+), amount = (\d+)(?:, slot = CONST_SLOT_(\w+))?",
                itens_txt):
            iid = int(mi.group(1))
            itens.append({
                "itemId": iid, "nome": nomes.get(iid, str(iid)),
                "qtd": int(mi.group(2)),
                "slot": (mi.group(3) or "").lower() or None,
            })
        cores = {}
        for k in ("Head", "Body", "Legs", "Feet"):
            mc = re.search(r"look%s = (\d+)" % k, outfit_txt)
            if mc:
                cores[k.lower()] = int(mc.group(1))
        lt = dict(re.findall(r"\[PLAYERSEX_(\w+)\] = (\d+)", outfit_txt))
        por_voc[voc] = {
            "itens": itens,
            "cores": [cores.get("head", 0), cores.get("body", 0),
                      cores.get("legs", 0), cores.get("feet", 0)],
            "looktype": {"m": int(lt.get("MALE", 0)),
                         "f": int(lt.get("FEMALE", 0))},
        }
    return {"comum": comum, "vocacoes": por_voc}


def main():
    nomes = ler_nomes_itens()
    potions = ler_potions(nomes)
    runas = ler_runas(nomes)
    inicio = ler_dawnport(nomes)

    dados = {"potions": potions, "runas": runas, "inicio": inicio}
    with open(os.path.join(GAME, "data", "supplies.json"), "w",
              encoding="utf-8") as fh:
        json.dump(dados, fh, ensure_ascii=False, separators=(",", ":"))
    with open(os.path.join(GAME, "js", "supplydata.js"), "w",
              encoding="utf-8") as fh:
        fh.write("/* Gerado por tools/import_supplies.py\n"
                 " * potions.lua, scripts/runes/*.lua e o dawnport_vocation_trial\n"
                 " * do canary: cura/mana, nivel, vocacao e itens iniciais. */\n")
        fh.write("window.SUPPLYDATA = " +
                 json.dumps(dados, ensure_ascii=False,
                            separators=(",", ":")) + ";\n")

    print("potions: %d" % len(potions))
    for k, v in sorted(potions.items(), key=lambda x: x[1]["lvl"]):
        print("   nv%-4d %-24s %-6s %s" % (
            v["lvl"], v["nome"], v["tipo"],
            "todas" if len(v["vocs"]) == 5 else ",".join(v["vocs"])))
    print("runas: %d (%d com formula)" % (
        len(runas), sum(1 for r in runas.values() if "f" in r)))
    print("itens iniciais: %d comuns + %s" % (
        len(inicio["comum"]), list(inicio["vocacoes"])))


if __name__ == "__main__":
    main()
