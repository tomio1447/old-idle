"""
Le o items.xml do Canary (15.x) e enriquece o gamedata.js do jogo com os
atributos de combate reais de cada item:

    atk, def, extra def, arm, weaponType, slot, level minimo, vocacoes,
    imbuementSlots, elemento do dano, skills concedidas, regen, speed

Tambem marca as armas que tem mecanica especial no 15.x:
  * cleave  -> golpe que atinge alvos adjacentes
  * elemento -> parte do dano convertida (fire/ice/energy/earth/death/holy)

Nao inventa item novo: so completa os que o jogo ja usa, casando pelo
nome. Assim as sprites e o balanceamento continuam validos.

Uso:
    CANARY=/caminho/canary python3 import_canary_items.py [--dry-run]
"""
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
CANARY = os.environ.get("CANARY", "/tmp/canary_probe")
ITEMS_XML = os.path.join(CANARY, "data", "items", "items.xml")
GAME = os.path.normpath(os.path.join(HERE, "..", "game", "js", "gamedata.js"))

# weaponType do Canary -> tipo usado pelo jogo
WEAPON_TYPE = {
    "sword": "sword", "club": "club", "axe": "axe",
    "distance": "distance", "wand": "magic", "rod": "magic",
    "ammunition": "ammo", "shield": "shield", "fist": "fist",
}

SLOT_MAP = {
    "head": "helmet", "necklace": "amulet", "backpack": "backpack",
    "body": "armor", "two-handed": "weapon", "legs": "legs",
    "feet": "boots", "ring": "ring", "ammo": "ammo", "hand": "weapon",
    "shield": "shield",
}

ELEMENT_KEYS = {
    "elementfire": "fire", "elementice": "ice", "elementenergy": "energy",
    "elementearth": "earth", "elementdeath": "death", "elementholy": "holy",
}

SKILL_KEYS = {
    "skillsword": "sword", "skillaxe": "axe", "skillclub": "club",
    "skilldist": "dist", "skillshield": "shield", "skillfist": "fist",
    "magiclevelpoints": "magic",
}


def parse_items():
    """nome (minusculo) -> atributos do Canary."""
    txt = open(ITEMS_XML, encoding="iso-8859-1", errors="replace").read()
    out = {}
    for m in re.finditer(r'<item\s+id="(\d+)"([^>]*)>(.*?)</item>', txt, re.S):
        cid = int(m.group(1))
        cab = m.group(2)
        corpo = m.group(3)
        nm = re.search(r'name="([^"]+)"', cab)
        if not nm:
            continue
        nome = nm.group(1).strip().lower()
        if nome in out:
            continue

        d = {"clientId": cid}
        # atributos diretos (nao aninhados em script)
        for am in re.finditer(r'<attribute key="([^"]+)" value="([^"]*)"', corpo):
            k = am.group(1).strip().lower()
            v = am.group(2).strip()
            if k == "attack":
                d["atk"] = int(float(v))
            elif k == "defense":
                d["def"] = int(float(v))
            elif k == "extradefense":
                d["extraDef"] = int(float(v))
            elif k == "armor":
                d["arm"] = int(float(v))
            elif k == "weight":
                d["w"] = round(int(float(v)) / 100.0, 2)
            elif k == "weapontype":
                d["wt"] = WEAPON_TYPE.get(v.lower(), v.lower())
            elif k == "slottype":
                d["slot"] = SLOT_MAP.get(v.lower(), v.lower())
            elif k == "imbuementslot":
                d["imbSlots"] = int(float(v))
            elif k == "level":
                d["lvl"] = int(float(v))
            elif k == "vocation":
                vocs = [x.split(";")[0].strip().lower()
                        for x in v.split(",") if x.strip()]
                if vocs:
                    d["vocs"] = sorted(set(vocs))
            elif k == "range":
                d["range"] = int(float(v))
            elif k == "hitchance":
                d["hitChance"] = int(float(v))
            elif k == "speed":
                d["spd"] = int(float(v))
            elif k == "healthgain":
                d["hpreg"] = int(float(v))
            elif k == "managain":
                d["mpreg"] = int(float(v))
            elif k in ELEMENT_KEYS:
                d["el"] = ELEMENT_KEYS[k]
                d["elDmg"] = int(float(v))
            elif k in SKILL_KEYS:
                d.setdefault("skills", {})[SKILL_KEYS[k]] = int(float(v))
            elif k == "classification":
                d["classification"] = int(float(v))
            elif k == "tier":
                d["tier"] = int(float(v))
        out[nome] = d
    return out


# Armas com cleave (golpe em area) no 15.x
CLEAVE = {
    "gnome sword", "sword of remembrance", "cobra axe", "cobra club",
    "cobra sword", "falcon battleaxe", "falcon longsword", "falcon mace",
    "soulbleeder", "soulcrusher", "soulmaimer", "soulbiter", "soulshredder",
    "eldritch axe", "eldritch cutter", "eldritch warmace",
    "naga axe", "naga club", "naga sword",
}


def main():
    dry = "--dry-run" in sys.argv
    print("lendo", ITEMS_XML)
    canary = parse_items()
    print("  %d itens no Canary" % len(canary))

    src = open(GAME, encoding="utf-8").read()
    prefix = "window.GAMEDATA = "
    data = json.loads(src[len(prefix):].rstrip().rstrip(";"))
    itens = data["items"]

    casados = 0
    novos_campos = {"imbSlots": 0, "vocs": 0, "el": 0, "lvl": 0,
                    "skills": 0, "cleave": 0, "classification": 0}
    for slug, it in itens.items():
        nome = (it.get("n") or slug.replace("-", " ")).strip().lower()
        c = canary.get(nome) or canary.get(slug.replace("-", " "))
        if not c:
            continue
        casados += 1
        # so completa: nao sobrescreve o balanceamento ja testado
        for campo in ("imbSlots", "classification", "tier", "extraDef",
                      "hitChance", "range"):
            if campo in c:
                it[campo] = c[campo]
                if campo in novos_campos:
                    novos_campos[campo] += 1
        if "vocs" in c:
            it["vocs"] = c["vocs"]
            novos_campos["vocs"] += 1
        if "lvl" in c and "lvl" not in it:
            it["lvl"] = c["lvl"]
            novos_campos["lvl"] += 1
        if "el" in c:
            it["el"] = c["el"]
            it["elDmg"] = c.get("elDmg", 0)
            novos_campos["el"] += 1
        if "skills" in c:
            for k, v in c["skills"].items():
                it[k] = v
            novos_campos["skills"] += 1
        if nome in CLEAVE:
            it["cleave"] = 1
            novos_campos["cleave"] += 1

    print("\n%d itens casados com o Canary" % casados)
    for k, v in novos_campos.items():
        if v:
            print("  %-15s %d" % (k, v))

    if dry:
        print("\n--dry-run: nada gravado")
        return
    open(GAME, "w", encoding="utf-8").write(
        prefix + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";\n")
    print("\ngamedata.js atualizado")


if __name__ == "__main__":
    main()
