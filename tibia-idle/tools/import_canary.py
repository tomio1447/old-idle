"""
Importa os dados reais de monstros do Canary (opentibiabr/canary) para o
gamedata.js do idle.

O Canary guarda cada criatura num .lua declarativo com todos os numeros
oficiais do Tibia global: vida, experiencia, ataques (melee/magia, com
alcance e condicoes), defesas, resistencias elementais e a tabela de loot
com as chances reais em 1/100000.

Este script le esses arquivos e traduz para o formato enxuto que o jogo
usa, preservando o que o idle sabe representar:

    hp, exp, damage, armor, element, ranged, loot[], poison, attackSpeed

Regras de traducao:
  * `targetDistance > 1` ou ataque `combat` com `range` -> ranged
  * elemento = o tipo do ataque a distancia mais forte, senao physical
  * `condition CONDITION_POISON` -> veneno por turno no formato do jogo
  * chance do loot: Canary usa 1/100000, o jogo usa porcentagem
  * so importa monstros que o jogo ja conhece (nao infla o gamedata)

Uso:
    CANARY=/caminho/do/canary python3 import_canary.py [--dry-run]
"""
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
CANARY = os.environ.get("CANARY", "/tmp/canary_probe")
MON_DIR = os.path.join(CANARY, "data-otservbr-global", "monster")
GAME = os.path.normpath(os.path.join(HERE, "..", "game", "js", "gamedata.js"))

ELEMENT_MAP = {
    "COMBAT_PHYSICALDAMAGE": "physical",
    "COMBAT_FIREDAMAGE": "fire",
    "COMBAT_ENERGYDAMAGE": "energy",
    "COMBAT_EARTHDAMAGE": "earth",
    "COMBAT_ICEDAMAGE": "ice",
    "COMBAT_DEATHDAMAGE": "death",
    "COMBAT_HOLYDAMAGE": "holy",
    "COMBAT_LIFEDRAIN": "death",
    "COMBAT_MANADRAIN": "energy",
    "COMBAT_DROWNDAMAGE": "ice",
}


def num(txt, key, default=None):
    m = re.search(r"\b%s\s*=\s*(-?\d+(?:\.\d+)?)" % key, txt)
    if not m:
        return default
    v = float(m.group(1))
    return int(v) if v == int(v) else v


def parse_monster(path):
    """Le um .lua do Canary e devolve os campos que o jogo usa."""
    txt = open(path, encoding="utf-8", errors="replace").read()
    out = {}

    m = re.search(r'createMonsterType\("([^"]+)"\)', txt)
    out["name"] = m.group(1) if m else None
    out["hp"] = num(txt, "monster\\.health") or num(txt, "health")
    out["exp"] = num(txt, "monster\\.experience") or num(txt, "experience")

    m = re.search(r"lookType\s*=\s*(\d+)", txt)
    out["looktype"] = int(m.group(1)) if m else None

    # ---- defesas
    bloco = re.search(r"monster\.defenses\s*=\s*\{(.*?)\n\}", txt, re.S)
    out["armor"] = num(bloco.group(1), "armor", 0) if bloco else 0

    # ---- flags: distancia de perseguicao
    bloco = re.search(r"monster\.flags\s*=\s*\{(.*?)\n\}", txt, re.S)
    target_dist = num(bloco.group(1), "targetDistance", 1) if bloco else 1

    # ---- ataques
    bloco = re.search(r"monster\.attacks\s*=\s*\{(.*?)\n\}", txt, re.S)
    melee_max = 0
    dist_max = 0
    dist_range_max = 0      # dano do maior ataque com `range` explicito
    dist_range_reach = 0    # maior alcance declarado
    dist_elem = None
    poison_total = 0
    if bloco:
        for linha in re.findall(r"\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}", bloco.group(1)):
            nome = re.search(r'name\s*=\s*"([^"]+)"', linha)
            nome = nome.group(1) if nome else ""
            dmg = abs(num(linha, "maxDamage", 0) or 0)
            tem_range = "range" in linha
            if nome == "melee":
                melee_max = max(melee_max, dmg)
                mp = re.search(r"CONDITION_POISON.*?totalDamage\s*=\s*(\d+)", linha)
                if mp:
                    poison_total = max(poison_total, int(mp.group(1)))
            else:
                if tem_range:
                    mr = re.search(r"\brange\s*=\s*(\d+)", linha)
                    alcance = int(mr.group(1)) if mr else 0
                    if dmg > dist_range_max:
                        dist_range_max = dmg
                    dist_range_reach = max(dist_range_reach, alcance)
                if dmg > dist_max:
                    dist_max = dmg
                    te = re.search(r"type\s*=\s*(COMBAT_\w+)", linha)
                    if te and tem_range:
                        dist_elem = ELEMENT_MAP.get(te.group(1))
                if tem_range and dist_elem is None:
                    te = re.search(r"type\s*=\s*(COMBAT_\w+)", linha)
                    if te:
                        dist_elem = ELEMENT_MAP.get(te.group(1))

    # E um atacante a distancia?
    # Dois sinais independentes, porque nenhum sozinho basta:
    #  * targetDistance > 1: o bicho MANTEM distancia (arqueiro, caster).
    #    Mas a butterfly usa 8 so para fugir e nao ataca nada, entao exige
    #    tambem ter algum ataque.
    #  * ataque com `range`: dispara de longe mesmo perseguindo em melee.
    #    E o caso do dragon (targetDistance 1 + fire com range 7).
    ranged = None
    tem_ataque = melee_max > 0 or dist_max > 0
    if target_dist and target_dist > 1 and tem_ataque:
        ranged = 2 if target_dist >= 4 else 1
    elif dist_range_max > 0 and dist_range_reach >= 4:
        # hibrido: persegue em melee, mas tambem cospe de longe (dragon).
        # `range` curto (1-3) e so o alcance da propria magia corpo-a-corpo,
        # como no skeleton, e nao faz dele um atirador.
        ranged = 1
    out["damage"] = max(melee_max, dist_max if ranged else 0) or melee_max or 1
    out["element"] = dist_elem if (ranged and dist_elem) else "physical"
    if ranged:
        out["ranged"] = ranged
    if poison_total:
        # o jogo aplica dano por turno; Canary da o total do veneno
        turnos = 5
        out["poison"] = {"dmg": max(1, round(poison_total / turnos)),
                         "turns": turnos}

    # ---- resistencias elementais (percent > 0 = toma MENOS dano)
    bloco = re.search(r"monster\.elements\s*=\s*\{(.*?)\n\}", txt, re.S)
    resist = {}
    if bloco:
        for linha in re.findall(r"\{[^{}]*\}", bloco.group(1)):
            te = re.search(r"type\s*=\s*(COMBAT_\w+)", linha)
            pc = num(linha, "percent", 0) or 0
            if not te or not pc:
                continue
            el = ELEMENT_MAP.get(te.group(1))
            if el and el not in resist:
                resist[el] = int(pc)
    if resist:
        out["resist"] = resist

    # ---- foge com pouca vida (runHealth) e velocidade
    bloco = re.search(r"monster\.flags\s*=\s*\{(.*?)\n\}", txt, re.S)
    if bloco:
        rh = num(bloco.group(1), "runHealth", 0) or 0
        if rh:
            out["runAt"] = int(rh)
    sp = num(txt, "monster\\.speed", 0) or 0
    if sp:
        out["speed"] = int(sp)

    # ---- loot (chance do Canary e em 1/100000)
    bloco = re.search(r"monster\.loot\s*=\s*\{(.*?)\n\}", txt, re.S)
    loot = []
    if bloco:
        for linha in re.findall(r"\{[^{}]*\}", bloco.group(1)):
            chance = num(linha, "chance", 0) or 0
            maxc = num(linha, "maxCount", 1) or 1
            entrada = {"chance": round(min(100.0, chance / 1000.0), 2),
                       "max": int(maxc)}
            nm = re.search(r'name\s*=\s*"([^"]+)"', linha)
            if nm:
                entrada["name"] = nm.group(1).strip().lower()
            else:
                # varias linhas usam `id = 3607` com o nome so no comentario
                mid = re.search(r"\bid\s*=\s*(\d+)", linha)
                if not mid:
                    continue
                entrada["id"] = int(mid.group(1))
                com = re.search(r"--\s*([a-zA-Z][\w '\-]*)", linha)
                if com:
                    entrada["name"] = com.group(1).strip().lower()
            if "name" not in entrada and "id" not in entrada:
                continue
            loot.append(entrada)
    out["loot"] = loot
    return out


def build_index():
    """slug -> dados, varrendo todos os .lua do Canary."""
    idx = {}
    for raiz, _dirs, arqs in os.walk(MON_DIR):
        for a in arqs:
            if not a.endswith(".lua"):
                continue
            try:
                d = parse_monster(os.path.join(raiz, a))
            except Exception:
                continue
            if not d.get("name") or not d.get("hp"):
                continue
            slug = d["name"].strip().lower().replace(" ", "-").replace("'", "")
            idx.setdefault(slug, d)
    return idx


def main():
    dry = "--dry-run" in sys.argv
    print("lendo monstros do Canary em", MON_DIR)
    canary = build_index()
    print("  %d criaturas lidas" % len(canary))

    src = open(GAME, encoding="utf-8").read()
    prefix = "window.GAMEDATA = "
    data = json.loads(src[len(prefix):].rstrip().rstrip(";"))
    mons = data["monsters"]
    itens = data["items"]

    # nomes de item do jogo, para casar o loot
    item_por_nome = {}
    for slug, it in itens.items():
        item_por_nome.setdefault(it["n"].strip().lower(), slug)
        item_por_nome.setdefault(slug.replace("-", " "), slug)

    # id do Canary -> nome, para o loot declarado como `id = 3607`
    id_para_nome = {}
    xml_path = os.path.join(HERE, "data", "canary-items.xml")
    if os.path.exists(xml_path):
        xml = open(xml_path, encoding="iso-8859-1").read()
        for m in re.finditer(r'<item id="(\d+)"[^>]*name="([^"]+)"', xml):
            id_para_nome[int(m.group(1))] = m.group(2).strip().lower()

    atualizados = 0
    sem_match = []
    relatorio = []
    for slug, m in mons.items():
        c = canary.get(slug)
        if not c:
            sem_match.append(slug)
            continue
        antes = (m.get("hp"), m.get("exp"), m.get("damage"),
                 m.get("armor"), m.get("element"), m.get("ranged"))

        m["hp"] = c["hp"]
        m["exp"] = c["exp"]
        m["damage"] = c["damage"]
        m["armor"] = c["armor"] or m.get("armor", 0)
        m["element"] = c["element"]
        if c.get("ranged"):
            m["ranged"] = c["ranged"]
        else:
            m.pop("ranged", None)
        if c.get("poison"):
            m["poison"] = c["poison"]
        else:
            m.pop("poison", None)
        # resistencias elementais, fuga e velocidade
        if c.get("resist"):
            m["resist"] = c["resist"]
        else:
            m.pop("resist", None)
        if c.get("runAt"):
            m["runAt"] = c["runAt"]
        else:
            m.pop("runAt", None)
        if c.get("speed"):
            m["speed"] = c["speed"]

        # loot: so itens que o jogo tem sprite/definicao
        novo_loot = []
        for l in c["loot"]:
            nome = l.get("name")
            if not nome and l.get("id"):
                nome = id_para_nome.get(l["id"])
            alvo = item_por_nome.get(nome) if nome else None
            if not alvo:
                continue
            novo_loot.append({"item": alvo, "chance": l["chance"],
                              "max": l["max"]})
        if novo_loot:
            m["loot"] = novo_loot

        depois = (m["hp"], m["exp"], m["damage"], m["armor"],
                  m["element"], m.get("ranged"))
        if antes != depois:
            relatorio.append((slug, antes, depois))
        atualizados += 1

    print("\n%d monstros sincronizados com o Canary" % atualizados)
    if sem_match:
        print("  sem equivalente (mantidos): %s" % ", ".join(sem_match[:12]))
    print("\nmudancas (hp, exp, dano, armor, elemento, ranged):")
    for slug, a, b in relatorio[:30]:
        print("  %-18s %s -> %s" % (slug, a, b))
    if len(relatorio) > 30:
        print("  ... e mais %d" % (len(relatorio) - 30))

    if dry:
        print("\n--dry-run: nada foi gravado")
        return
    open(GAME, "w", encoding="utf-8").write(
        prefix + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";\n")
    print("\ngamedata.js atualizado")


if __name__ == "__main__":
    main()
