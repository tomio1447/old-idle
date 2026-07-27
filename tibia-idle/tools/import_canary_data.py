"""
Importa a base de dados do Canary (15.x) para o idle:

  * vocacoes (incluindo Monk) com ganhos de hp/mana/cap por nivel
  * multiplicadores de skill por vocacao
  * spells: nome, palavras, vocacoes, nivel, mana, cooldown e grupo
  * imbuements: categorias, tiers e atributos
  * outfits e montarias

Gera game/data/canary.json, que o cliente carrega junto do gamedata.

Uso:
    CANARY=/caminho/canary python3 import_canary_data.py
"""
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
CANARY = os.environ.get("CANARY", "/tmp/canary_probe")
XML = os.path.join(CANARY, "data", "XML")
OUT = os.path.normpath(os.path.join(HERE, "..", "game", "data", "canary.json"))

SKILL_ID = {0: "fist", 1: "club", 2: "sword", 3: "axe", 4: "dist",
            5: "shield", 6: "fish"}


def attrs(tag):
    return dict(re.findall(r'(\w+)="([^"]*)"', tag))


# ------------------------------------------------------------ vocacoes
def load_vocations():
    txt = open(os.path.join(XML, "vocations.xml"), encoding="utf-8",
               errors="replace").read()
    out = {}
    for m in re.finditer(r"<vocation\b([^>]*)>(.*?)</vocation>", txt, re.S):
        d = attrs(m.group(1))
        nome = d.get("name")
        if not nome:
            continue
        skills = {}
        for sm in re.finditer(r'<skill id="(\d+)" multiplier="([\d.]+)"',
                              m.group(2)):
            sid = SKILL_ID.get(int(sm.group(1)))
            if sid:
                skills[sid] = float(sm.group(2))
        out[nome.lower()] = {
            "id": int(d.get("id", 0)),
            "name": nome,
            "clientId": int(d.get("clientid", 0)),
            "gainCap": int(d.get("gaincap", 10)),
            "gainHp": int(d.get("gainhp", 5)),
            "gainMana": int(d.get("gainmana", 5)),
            "gainHpTicks": int(d.get("gainhpticks", 6000)),
            "gainHpAmount": int(d.get("gainhpamount", 1)),
            "gainManaTicks": int(d.get("gainmanaticks", 6000)),
            "gainManaAmount": int(d.get("gainmanaamount", 2)),
            "manaMultiplier": float(d.get("manamultiplier", 1.0)),
            "attackSpeed": int(d.get("attackspeed", 2000)),
            "baseSpeed": int(d.get("basespeed", 110)),
            "fromVoc": int(d.get("fromvoc", 0)),
            "skills": skills,
        }
    return out


# ------------------------------------------------------------ spells
GRUPO_TIPO = {"attack": "attack", "healing": "heal", "support": "support",
              "conjuring": "conjure", "party": "support",
              "familiar": "summon", "house": "support"}


def parse_spell(path, categoria):
    txt = open(path, encoding="utf-8", errors="replace").read()

    def s(pat, default=None, tipo=str):
        m = re.search(pat, txt)
        if not m:
            return default
        try:
            return tipo(m.group(1))
        except (TypeError, ValueError):
            return default

    nome = s(r'spell:name\("([^"]+)"\)')
    if not nome:
        return None
    palavras = s(r'spell:words\("([^"]+)"\)')
    # vocacoes: spell:vocation("monk;true", "exalted monk;true")
    vocs = []
    mv = re.search(r"spell:vocation\(([^)]*)\)", txt, re.S)
    if mv:
        for v in re.findall(r'"([^";]+)', mv.group(1)):
            v = v.strip().lower()
            if v and v not in vocs:
                vocs.append(v)
    # mana pode ser expressao (10 * 1000); pega so o numero simples
    mana = s(r"spell:mana\((\d+)\)", 0, int)
    lvl = s(r"spell:level\((\d+)\)", 1, int)
    cd = s(r"spell:cooldown\(([\d\s*]+)\)", None)
    if cd:
        try:
            cd = int(eval(cd.replace(" ", ""), {"__builtins__": {}}))
        except Exception:
            cd = None
    grupo = None
    mg = re.search(r'spell:group\("([^"]+)"', txt)
    if mg:
        grupo = mg.group(1)
    return {
        "name": nome,
        "words": palavras,
        "vocs": vocs,
        "level": lvl,
        "mana": mana,
        "cooldown": cd or 2000,
        "group": grupo or categoria,
        "type": GRUPO_TIPO.get(categoria, categoria),
        "premium": bool(re.search(r"spell:isPremium\(true\)", txt)),
        "selfTarget": bool(re.search(r"spell:isSelfTarget\(true\)", txt)),
        "aggressive": not re.search(r"spell:isAggressive\(false\)", txt),
        "id": s(r"spell:id\((\d+)\)", None, int),
    }


def load_spells():
    base = os.path.join(CANARY, "data", "scripts", "spells")
    out = []
    vistos = set()
    for cat in sorted(os.listdir(base)) if os.path.isdir(base) else []:
        d = os.path.join(base, cat)
        if not os.path.isdir(d):
            continue
        for raiz, _dirs, arqs in os.walk(d):
            for a in arqs:
                if not a.endswith(".lua"):
                    continue
                try:
                    sp = parse_spell(os.path.join(raiz, a), cat)
                except Exception:
                    continue
                if not sp or not sp["words"]:
                    continue
                chave = sp["words"].lower()
                if chave in vistos:
                    continue
                vistos.add(chave)
                out.append(sp)
    return out


# ------------------------------------------------------------ imbuements
def load_imbuements():
    p = os.path.join(XML, "imbuements.xml")
    if not os.path.exists(p):
        return {}
    txt = open(p, encoding="utf-8", errors="replace").read()
    bases, cats, imbs = {}, {}, []
    for m in re.finditer(r"<base\b([^>]*)/?>", txt):
        d = attrs(m.group(1))
        bases[int(d["id"])] = {
            "id": int(d["id"]), "name": d.get("name"),
            "price": int(d.get("price", 0)),
            "percent": int(d.get("percent", 100)),
            "removeCost": int(d.get("removecost", 0)),
            "duration": int(d.get("duration", 0)),
        }
    for m in re.finditer(r"<category\b([^>]*)/?>", txt):
        d = attrs(m.group(1))
        cats[int(d["id"])] = d.get("name")
    for m in re.finditer(r"<imbuement\b([^>]*)>(.*?)</imbuement>", txt, re.S):
        d = attrs(m.group(1))
        corpo = m.group(2)
        atributos = {}
        for am in re.finditer(r'<attribute key="([^"]+)" value="([^"]*)"', corpo):
            atributos[am.group(1)] = am.group(2)
        imbs.append({
            "name": d.get("name"),
            "base": int(d.get("base", 1)),
            "category": int(d.get("category", 0)),
            "categoryName": cats.get(int(d.get("category", 0))),
            "subgroup": (d.get("subgroup") or "").strip(),
            "iconId": int(d.get("iconid", 0)),
            "attributes": atributos,
        })
    return {"bases": bases, "categories": cats, "imbuements": imbs}


# ------------------------------------------------------------ outfits/mounts
def load_outfits():
    p = os.path.join(XML, "outfits.xml")
    if not os.path.exists(p):
        return []
    txt = open(p, encoding="utf-8", errors="replace").read()
    out = []
    for m in re.finditer(r"<outfit\b([^>]*)/?>", txt):
        d = attrs(m.group(1))
        if not d.get("looktype"):
            continue
        out.append({
            "type": int(d.get("type", 0)),      # 0 = feminino, 1 = masculino
            "looktype": int(d["looktype"]),
            "name": d.get("name"),
            "premium": d.get("premium") == "yes",
            "unlocked": d.get("unlocked", "yes") == "yes",
        })
    return out


def load_mounts():
    p = os.path.join(XML, "mounts.xml")
    if not os.path.exists(p):
        return []
    txt = open(p, encoding="utf-8", errors="replace").read()
    out = []
    for m in re.finditer(r"<mount\b([^>]*)/?>", txt):
        d = attrs(m.group(1))
        if not d.get("clientid"):
            continue
        out.append({
            "id": int(d.get("id", 0)),
            "clientId": int(d["clientid"]),
            "name": d.get("name"),
            "speed": int(d.get("speed", 0)),
            "premium": d.get("premium") == "yes",
        })
    return out


def main():
    print("lendo o Canary em", CANARY)
    dados = {
        "vocations": load_vocations(),
        "spells": load_spells(),
        "imbuements": load_imbuements(),
        "outfits": load_outfits(),
        "mounts": load_mounts(),
    }
    print("  vocacoes:  %d (monk: %s)" % (
        len(dados["vocations"]), "sim" if "monk" in dados["vocations"] else "nao"))
    print("  spells:    %d" % len(dados["spells"]))
    imb = dados["imbuements"].get("imbuements", [])
    print("  imbuements:%d em %d categorias" % (
        len(imb), len(dados["imbuements"].get("categories", {}))))
    print("  outfits:   %d" % len(dados["outfits"]))
    print("  mounts:    %d" % len(dados["mounts"]))

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(dados, f, ensure_ascii=False, separators=(",", ":"))
    kb = os.path.getsize(OUT) / 1024
    print("\ngravado em %s (%.0f KB)" % (OUT, kb))


if __name__ == "__main__":
    main()
