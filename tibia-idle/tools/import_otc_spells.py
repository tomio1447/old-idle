#!/usr/bin/env python3
"""Monta a base completa de magias cruzando otclient + canary.

Por que duas fontes:
  * otclient/modules/gamelib/spells.lua  -> lista canonica das magias do 15.x
    com id, palavras, nivel, mana, vocacoes (por id) e o `clientId`, que e a
    COLUNA do spritesheet spell-icons-32x32. E a unica fonte que liga
    magia -> icone sem chute.
  * canary/data/scripts/spells/**.lua    -> as formulas reais de dano/cura,
    elemento de combate, area, alcance, chain e condicoes aplicadas. Os
    scripts sao EXECUTADOS em Lua (canary_spell_runner) com stubs e a formula
    e amostrada em varios pontos, entao o resultado e o valor real do servidor
    e nao uma leitura textual aproximada.

Saida: game/data/spells.json + game/js/spelldata.js

Uso: python3 import_otc_spells.py /tmp/otc /tmp/canary_probe ../game
"""
import json
import os
import re
import sys

import canary_spell_runner as runner

OTC = sys.argv[1] if len(sys.argv) > 1 else "/tmp/otc"
CAN = sys.argv[2] if len(sys.argv) > 2 else "/tmp/canary_probe"
GAME = sys.argv[3] if len(sys.argv) > 3 else os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "..", "game")

VOC_ID = {
    0: "none", 1: "sorcerer", 2: "druid", 3: "paladin", 4: "knight",
    5: "master sorcerer", 6: "elder druid", 7: "royal paladin",
    8: "elite knight", 9: "monk", 10: "exalted monk",
}
BASE = {
    "master sorcerer": "sorcerer", "elder druid": "druid",
    "royal paladin": "paladin", "elite knight": "knight",
    "exalted monk": "monk",
}
ELEMENTO = {
    "COMBAT_PHYSICALDAMAGE": "physical", "COMBAT_FIREDAMAGE": "fire",
    "COMBAT_ENERGYDAMAGE": "energy", "COMBAT_EARTHDAMAGE": "earth",
    "COMBAT_ICEDAMAGE": "ice", "COMBAT_HOLYDAMAGE": "holy",
    "COMBAT_DEATHDAMAGE": "death", "COMBAT_HEALING": "healing",
    "COMBAT_MANADRAIN": "mana", "COMBAT_LIFEDRAIN": "death",
}
# quantos alvos cada area cobre na pratica. O jogo nao tem grid de verdade
# nas hunts, entao a area vira "quantos monstros a magia acerta".
# nome do grupo no canary -> id numerico do SpellGroups do otclient
GRUPO_ID = {
    "attack": 1, "healing": 2, "support": 3, "special": 4, "conjure": 5,
    "crippling": 6, "focus": 7, "ultimatestrikes": 8, "greatbeams": 9,
    "burstsofnature": 10, "virtue": 11,
}

TOTAL_ICONES = 187   # colunas do spell-icons-32x32.png do otclient

AREA_ALVOS = {
    "AREA_SQUARE1X1": 8, "AREA_CIRCLE2X2": 8, "AREA_CIRCLE3X3": 12,
    "AREA_CIRCLE3X4": 14, "AREA_CIRCLE5X5": 20, "AREA_CIRCLE6X6": 28,
    "AREA_BEAM5": 5, "AREA_BEAM6": 6, "AREA_BEAM7": 7, "AREA_BEAM8": 8,
    "AREA_BEAM10": 10, "AREA_WAVE4": 8, "AREA_WAVE6": 14, "AREA_WAVE7": 18,
    "AREA_SHORTWAVE3": 6, "AREA_SQUAREWAVE5": 10, "AREA_RING1_BURST3": 8,
    "AREA_FLURRY_OF_BLOWS": 8, "AREA_GREATER_FLURRY_OF_BLOWS": 12,
    "AREA_BALANCED_BRAWL": 8, "AREA_SWEEPING_CENTER": 6,
    "AREA_SWEEPING_OUTER": 10, "AREA_MASS_SPIRIT_MEND": 20,
    "AREA_MASS_SPIRIT_MEND_WOD": 24, "AREA_CROSS1X1": 5,
}
# condicoes que o motor do jogo ja conhece (js/combat.js)
COND = {
    "CONDITION_FIRE": "fire", "CONDITION_POISON": "poison",
    "CONDITION_ENERGY": "energy", "CONDITION_BLEEDING": "bleed",
    "CONDITION_CURSED": "cursed", "CONDITION_DAZZLED": "dazzled",
    "CONDITION_DROWN": "drown", "CONDITION_FREEZING": "freeze",
}
DISPEL = {
    "CONDITION_POISON": "poison", "CONDITION_FIRE": "fire",
    "CONDITION_ENERGY": "energy", "CONDITION_BLEEDING": "bleed",
    "CONDITION_CURSED": "cursed", "CONDITION_PARALYZE": "paralyze",
}


def slug(words, nome):
    """id interno do jogo: as palavras magicas com hifen (exura-gran)."""
    base = (words or nome or "").strip().lower()
    base = re.sub(r"[^a-z0-9 ]", "", base)
    return re.sub(r"\s+", "-", base) or None


# ---------------------------------------------------------------- otclient
def ler_grupos_otclient():
    """SpellGroups do otclient: id numerico -> nome do grupo de cooldown."""
    src = open(os.path.join(OTC, "modules", "gamelib", "spells.lua"),
               encoding="utf-8").read()
    m = re.search(r"SpellGroups\s*=\s*\{(.*?)\n\}", src, re.S)
    if not m:
        return {}
    out = {}
    for k, v in re.findall(r"\[(\d+)\]\s*=\s*'([^']+)'", m.group(1)):
        out[int(k)] = v
    return out


def ler_otclient():
    src = open(os.path.join(OTC, "modules", "gamelib", "spells.lua"),
               encoding="utf-8").read()
    ini = src.index("SpellInfo = {")
    fim = src.index("SpellRunesData = {")
    out = {}
    for linha in src[ini:fim].split("\n"):
        if "words =" not in linha or "clientId" not in linha:
            continue
        if linha.strip().startswith("--"):
            continue

        def g(campo, padrao=None):
            for pat in (r"\s*=\s*'([^']*)'", r"\s*=\s*\"([^\"]*)\""):
                m = re.search(campo + pat, linha)
                if m:
                    return m.group(1)
            m = re.search(campo + r"\s*=\s*(true|false)", linha)
            if m:
                return m.group(1) == "true"
            m = re.search(campo + r"\s*=\s*(-?\d+)", linha)
            if m:
                return int(m.group(1))
            return padrao

        nome = g("name", "")
        if not nome:
            continue
        mv = re.search(r"vocations\s*=\s*\{([^}]*)\}", linha)
        vocs = []
        for vid in ([int(x) for x in re.findall(r"\d+", mv.group(1))] if mv else []):
            v = VOC_ID.get(vid)
            if not v or v == "none":
                continue
            v = BASE.get(v, v)
            if v not in vocs:
                vocs.append(v)
        mg = re.search(r"group\s*=\s*\{(.*?)\}\s*,\s*needTarget", linha)
        grupos = {}
        if mg:
            for k, v in re.findall(r"\[(\d+)\]\s*=\s*(\d+)", mg.group(1)):
                grupos[int(k)] = int(v)
        out[nome] = {
            "sid": g("id"), "name": nome, "words": g("words", ""),
            "kind": (g("type", "") or "").lower(),
            "lvl": g("level", 1) or 1, "mana": g("mana", 0) or 0,
            "soul": g("soul", 0) or 0, "ml": g("maglevel", 0) or 0,
            "icon": g("clientId"), "vocs": vocs, "grupos": grupos,
            "cd": g("exhaustion", 2000) or 2000,
            "premium": g("premium", False),
            "needTarget": g("needTarget", False),
            "param": g("parameter", False),
            "range": g("range", -1),
        }
    return out


# ------------------------------------------------------------------ canary
def ler_canary():
    raiz = os.path.join(CAN, "data", "scripts", "spells")
    out = {}
    for dp, _, fs in os.walk(raiz):
        for f in sorted(fs):
            if not f.endswith(".lua"):
                continue
            caminho = os.path.join(dp, f)
            d, err = runner.extrair(caminho)
            if not d or not d.get("name"):
                continue
            d["pasta"] = os.path.basename(dp)
            d["arquivo"] = os.path.relpath(caminho, CAN)
            out[d["name"]] = d
    return out


def tipo_do_jogo(otc, c):
    """Traduz o grupo do canary para os tipos que o motor entende."""
    grupos = (c or {}).get("groups") or []
    pasta = (c or {}).get("pasta")
    if pasta == "healing" or "healing" in grupos:
        # exana* nao cura vida: remove condicao
        if otc["words"].startswith("exana"):
            return "cure"
        return "heal"
    if pasta == "attack" or "attack" in grupos:
        return "attack"
    if pasta == "conjuring":
        return "conjure"
    if pasta == "familiar":
        return "summon"
    if pasta == "support" or "support" in grupos:
        return "support"
    if otc["kind"] == "conjure":
        return "conjure"
    if otc["words"].startswith("exura"):
        return "heal"
    if otc["words"].startswith("exana"):
        return "cure"
    if otc["words"][:5] in ("exori", "exevo"):
        return "attack"
    return "support"


def main():
    otc = ler_otclient()
    can = ler_canary()
    can_lower = {k.lower(): v for k, v in can.items()}

    spells = {}
    sem_canary = []
    for nome, o in otc.items():
        c = can.get(nome) or can_lower.get(nome.lower())
        if c is None:
            sem_canary.append(nome)
        sid = slug(o["words"], nome)
        if not sid:
            continue
        # o sheet do otclient tem 187 colunas (0..186); Conjure Sniper Arrow
        # aponta para 240, que nao existe no arquivo. Sem icone e melhor que
        # um 404 — a UI simplesmente nao desenha a imagem.
        icone = o["icon"]
        if icone is not None and not (0 <= icone < TOTAL_ICONES):
            icone = None
        e = {
            "id": sid, "sid": o["sid"], "name": o["name"], "words": o["words"],
            "type": tipo_do_jogo(o, c), "lvl": o["lvl"], "mana": o["mana"],
            "soul": o["soul"], "ml": o["ml"], "icon": icone,
            "vocs": o["vocs"],
            "cd": (c or {}).get("cooldown") or o["cd"],
            # grupos de cooldown: {idDoGrupo: duracaoMs}. No Tibia lancar uma
            # magia trava TODO o grupo dela (todas as de ataque compartilham
            # um cooldown curto), alem do cooldown proprio da magia.
            "grupos": o["grupos"],
            "gcd": min(o["grupos"].values()) if o["grupos"] else 1000,
            "premium": bool(o["premium"]),
            "needTarget": bool(o["needTarget"]),
            "param": bool(o["param"]),
        }
        if c:
            e["group"] = (c.get("groups") or [c.get("pasta")])[0]
            # A tabela do otclient esta defasada em relacao ao servidor: as
            # Virtudes aparecem la so no grupo Support, mas o canary declara
            # group("support", "virtue") com groupCooldown(2s, 10s). O canary
            # e a fonte de verdade, entao completamos os grupos com o que ele
            # diz — senao o grupo Virtue nunca acenderia para o Monk.
            nomes = c.get("groups") or []
            cds = c.get("groupCooldown") or []
            if nomes:
                grupos = {}
                for i, nome in enumerate(nomes):
                    gid = GRUPO_ID.get(str(nome).lower())
                    if gid is None:
                        continue
                    dur = cds[i] if i < len(cds) else None
                    if dur is None:
                        dur = e["grupos"].get(str(gid)) or 2000
                    grupos[str(gid)] = int(dur)
                if grupos:
                    e["grupos"] = grupos
                    e["gcd"] = min(grupos.values())
            p = c.get("params") or {}
            tipo_combate = p.get("COMBAT_PARAM_TYPE")
            if tipo_combate and tipo_combate in ELEMENTO:
                el = ELEMENTO[tipo_combate]
                if el != "healing":
                    e["element"] = el
            if c.get("areas"):
                a = c["areas"][0]
                e["area"] = a
                e["alvos"] = AREA_ALVOS.get(a, 8)
            rng = c.get("range")
            if rng:
                e["range"] = int(rng)
            elif o["range"] and o["range"] > 0:
                e["range"] = o["range"]
            if c.get("needWeapon"):
                e["needWeapon"] = True
            if c.get("needDirection"):
                e["dir"] = True
            if c.get("monkType"):
                e["monk"] = str(c["monkType"]).replace("MonkSpell_", "")
            if c.get("formula"):
                f = dict(c["formula"])
                f.pop("erro", None)
                e["f"] = f
            e["aggr"] = c.get("aggressive") is not False
            # dano por condicao (Ignite, Curse, Envenom, Electrify...)
            cond = c.get("condicao")
            if cond:
                tipo = COND.get(cond["tipo"].replace("CONDITION_", "CONDITION_"))
                if not tipo:
                    tipo = COND.get(cond["tipo"])
                golpes = cond["dano"]
                if golpes:
                    g0 = golpes[0]
                    e["cond"] = {
                        "tipo": tipo or cond["tipo"].lower().replace("condition_", ""),
                        "golpes": int(g0["n"]),
                        "intervalo": int(g0["intervalo"]),
                        "dano": abs(int(g0["valor"])),
                    }
            # magia de cura de condicao: qual condition ela dissipa
            disp = p.get("COMBAT_PARAM_DISPEL")
            if disp and disp in DISPEL:
                e["dispel"] = DISPEL[disp]
            # regeneracao (utura / utura gran)
            if c.get("pasta") == "healing" and not c.get("formula") \
                    and "CONDITION_REGENERATION" in str(c.get("params", "")):
                e["regen"] = True
        else:
            if o["range"] and o["range"] > 0:
                e["range"] = o["range"]
        spells[sid] = e

    # segunda passada: regen le direto do script (o runner nao expoe params
    # de Condition, entao usamos o texto do arquivo so nesse caso)
    for nome, c in can.items():
        sid = slug(c.get("words"), nome)
        if sid not in spells:
            continue
        src = open(os.path.join(CAN, c["arquivo"]), encoding="utf-8",
                   errors="ignore").read()
        if "CONDITION_REGENERATION" in src:
            mh = re.search(r"CONDITION_PARAM_HEALTHGAIN,\s*(\d+)", src)
            mt = re.search(r"CONDITION_PARAM_HEALTHTICKS,\s*([^)]+)\)", src)
            mm = re.search(r"CONDITION_PARAM_MANAGAIN,\s*(\d+)", src)
            mtk = re.search(r"CONDITION_PARAM_TICKS,\s*([^)]+)\)", src)

            def ev(m):
                try:
                    return int(eval(m.group(1).replace(" ", "")))
                except Exception:
                    return None

            spells[sid]["regen"] = {
                "hp": int(mh.group(1)) if mh else 0,
                "mp": int(mm.group(1)) if mm else 0,
                "intervalo": ev(mt) if mt else 3000,
                "duracao": ev(mtk) if mtk else 60000,
            }
        if "spell:runeId" in src or "runeId" in src:
            mr = re.search(r"spell:runeId\((\d+)\)", src)
            if mr:
                spells[sid]["runeId"] = int(mr.group(1))

    so_canary = [n for n in can if n not in otc]

    grupos_cd = ler_grupos_otclient()

    with open(os.path.join(GAME, "data", "spells.json"), "w",
              encoding="utf-8") as fh:
        json.dump({"spells": spells, "grupos": grupos_cd}, fh,
                  ensure_ascii=False, separators=(",", ":"))
    with open(os.path.join(GAME, "js", "spelldata.js"), "w",
              encoding="utf-8") as fh:
        fh.write("/* Gerado por tools/import_otc_spells.py\n"
                 " * otclient -> metadados + indice do icone (clientId)\n"
                 " * canary   -> formulas de dano/cura executadas em Lua real */\n")
        fh.write("window.SPELLDATA = " +
                 json.dumps(spells, ensure_ascii=False, separators=(",", ":")) +
                 ";\n")
        fh.write("window.SPELLGROUPS = " +
                 json.dumps(grupos_cd, ensure_ascii=False,
                            separators=(",", ":")) + ";\n")

    por_voc = {}
    for s in spells.values():
        for v in s["vocs"]:
            por_voc.setdefault(v, []).append(s)
    print("otclient=%d canary=%d exportadas=%d" % (len(otc), len(can), len(spells)))
    print("com formula = %d | com icone = %d | com condition = %d | com area = %d"
          % (sum(1 for s in spells.values() if "f" in s),
             sum(1 for s in spells.values() if s["icon"] is not None),
             sum(1 for s in spells.values() if "cond" in s),
             sum(1 for s in spells.values() if "area" in s)))
    print("sem par no canary = %d | so no canary = %d" % (len(sem_canary),
                                                          len(so_canary)))
    for v in ("sorcerer", "druid", "paladin", "knight", "monk"):
        ls = por_voc.get(v, [])
        t = {}
        for s in ls:
            t[s["type"]] = t.get(s["type"], 0) + 1
        print("  %-9s %3d  %s" % (v, len(ls), t))


if __name__ == "__main__":
    main()
