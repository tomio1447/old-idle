"""
Importa TODOS os monstros do Canary: stats, habilidades, defesas, loot,
resistencias e os dados de bestiario/boostiary.

Por que refazer: os 91 monstros do jogo vinham de tools/build_monsters.py,
uma tabela escrita a mao com stats "aproximados do Tibia 7.4". Nada disso era
dado real — HP, exp, dano e armadura eram chutes, o loot era uma lista curta
inventada e nao havia habilidade nenhuma (o monstro so batia de perto).

Aqui lemos os 1656 arquivos .lua de data-otservbr-global/monster, que sao a
fonte que o servidor executa de verdade:

  monster.health / experience / speed  -> stats
  monster.flags                        -> targetDistance, staticAttackChance,
                                          runHealth (usados pela IA do grid)
  monster.attacks                      -> habilidades: intervalo, chance,
                                          elemento, faixa de dano, alcance,
                                          area, efeito visual e projetil
  monster.defenses                     -> defesa, armadura, mitigacao e as
                                          curas/escudos que o bicho lanca
  monster.elements                     -> resistencias por elemento
  monster.immunities                   -> imunidade a condicoes
  monster.loot                         -> loot real com chance em 1/100000
  monster.Bestiary                     -> classe, raca, toKill, estagios,
                                          charm points, estrelas, dificuldade

Sobre a chance do loot: o Canary guarda em partes de 100000 (chance = 89920
quer dizer 89,92%). O jogo trabalha em porcentagem, entao dividimos por 1000.

Uso: python3 import_monsters.py [dir_do_canary] [dir_do_game]
"""
import json
import os
import re
import sys

CAN = sys.argv[1] if len(sys.argv) > 1 else "/tmp/can"
GAME = sys.argv[2] if len(sys.argv) > 2 else os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "..", "game")

# COMBAT_* -> elemento do jogo
COMBAT = {
    "PHYSICALDAMAGE": "physical", "ENERGYDAMAGE": "energy",
    "EARTHDAMAGE": "earth", "FIREDAMAGE": "fire", "ICEDAMAGE": "ice",
    "HOLYDAMAGE": "holy", "DEATHDAMAGE": "death",
    "LIFEDRAIN": "death", "MANADRAIN": "energy",
    "DROWNDAMAGE": "ice", "HEALING": "healing",
}

# CONST_ME_* -> sheet em assets/fx (mesmo mapa do import_spell_effects)
ME = {
    "DRAWBLOOD": "draw-blood", "LOSEENERGY": "lose-energy", "POFF": "poff",
    "BLOCKHIT": "block-hit", "EXPLOSIONAREA": "explosion-area",
    "EXPLOSIONHIT": "explosion-hit", "FIREAREA": "fire-area",
    "YELLOW_RINGS": "yellow-rings", "GREEN_RINGS": "green-rings",
    "HITAREA": "hit-area", "TELEPORT": "teleport", "ENERGYHIT": "energy-hit",
    "MAGIC_BLUE": "magic-blue", "MAGIC_RED": "magic-red",
    "MAGIC_GREEN": "magic-green", "HITBYFIRE": "hit-by-fire",
    "HITBYPOISON": "hit-by-poison", "MORTAREA": "mort-area",
    "SOUND_GREEN": "sound-green", "SOUND_RED": "sound-red",
    "POISONAREA": "poison-area", "SOUND_YELLOW": "sound-yellow",
    "SOUND_PURPLE": "sound-purple", "SOUND_BLUE": "sound-blue",
    "SOUND_WHITE": "sound-white", "BUBBLES": "bubbles",
    "STUN": "stun", "SLEEP": "sleep", "WATERCREATURE": "watercreature",
    "GROUNDSHAKER": "groundshaker", "HEARTS": "hearts",
    "FIREATTACK": "fire-attack", "ENERGYAREA": "energy-area",
    "SMALLCLOUDS": "small-clouds", "HOLYDAMAGE": "holy-damage",
    "BIGCLOUDS": "big-clouds", "ICEAREA": "ice-area",
    "ICETORNADO": "ice-tornado", "ICEATTACK": "ice-attack",
    "STONES": "stones", "SMALLPLANTS": "small-plants",
    "CARNIPHILA": "carniphila", "PURPLEENERGY": "purple-energy",
    "YELLOWENERGY": "yellow-energy", "HOLYAREA": "holy-area",
    "BIGPLANTS": "big-plants", "GIANTICE": "giant-ice",
    "WATERSPLASH": "water-splash", "PLANTATTACK": "plant-attack",
    "SMALLSTONES": "small-stones", "GREENSMOKE": "green-smoke",
    "PURPLESMOKE": "purple-smoke", "BLUE_GHOST": "blue-ghost",
    "WHITE_ENERGY_SPARK": "white-energy-spark",
    "BLOW_WHITE": "blow-white", "BLOW_BLUE": "blow-blue",
    "BLOW_GREEN": "blow-green", "BLOW_PINK": "blow-pink",
    "CLAW_WHITE": "claw-white", "CLAW_GREEN": "claw-green",
}

# CONST_ANI_* -> sheet em assets/missile
ANI = {
    "SPEAR": "spear", "BOLT": "bolt", "ARROW": "arrow", "FIRE": "fire",
    "ENERGY": "energy", "POISONARROW": "poison-arrow",
    "BURSTARROW": "burst-arrow", "THROWINGSTAR": "throwing-star",
    "THROWINGKNIFE": "throwing-knife", "SMALLSTONE": "small-stone",
    "DEATH": "death", "LARGEROCK": "large-rock", "SNOWBALL": "snowball",
    "POWERBOLT": "power-bolt", "POISON": "poison", "ICE": "ice",
    "EARTH": "earth", "HOLY": "holy", "SUDDENDEATH": "sudden-death",
    "ENERGYBALL": "energy", "SMALLICE": "ice", "SMALLHOLY": "holy",
    "SMALLEARTH": "earth", "EXPLOSION": "explosion",
    "REDSTAR": "red-star", "GREENSTAR": "green-star",
    "WHIRLWINDSWORD": "whirlwind-sword", "WHIRLWINDAXE": "whirlwind-axe",
    "WHIRLWINDCLUB": "whirlwind-club", "ETHEREALSPEAR": "spear",
    "HUNTINGSPEAR": "spear", "ENCHANTEDSPEAR": "spear",
    "ROYALSPEAR": "spear", "SNIPERARROW": "arrow", "ONYXARROW": "arrow",
    "PIERCINGBOLT": "bolt", "INFERNALBOLT": "bolt", "DIAMONDARROW": "arrow",
}


def slug(nome):
    return re.sub(r"[^a-z0-9]+", "-", (nome or "").lower()).strip("-")


def mapa_de_ids():
    """{client_id: slug} lido do items.xml.

    Parte do loot do Canary referencia o item por id numerico
    (`{ id = 3039, chance = ... }`) em vez de nome. Sem traduzir esses ids a
    entrada fica sem slug e a tela do bestiario pede assets/item/undefined.png.
    """
    xml = os.path.join(CAN, "data", "items", "items.xml")
    out = {}
    if not os.path.exists(xml):
        return out
    txt = open(xml, encoding="utf-8", errors="ignore").read()
    for m in re.finditer(r'<item id="(\d+)"[^>]*name="([^"]+)"', txt):
        out[int(m.group(1))] = slug(m.group(2))
    # ids em faixa (`fromid`/`toid`) tambem aparecem no items.xml
    for m in re.finditer(
            r'<item fromid="(\d+)" toid="(\d+)"[^>]*name="([^"]+)"', txt):
        s = slug(m.group(3))
        for i in range(int(m.group(1)), int(m.group(2)) + 1):
            out.setdefault(i, s)
    return out


ID2SLUG = {}


def num(txt, campo, padrao=None):
    m = re.search(r"\b%s\s*=\s*(-?[\d.]+)" % campo, txt)
    if not m:
        return padrao
    v = m.group(1)
    return float(v) if "." in v else int(v)


def bloco(txt, nome):
    """Recorta `monster.<nome> = { ... }` respeitando chaves aninhadas."""
    i = txt.find("monster.%s" % nome)
    if i < 0:
        return None
    i = txt.find("{", i)
    if i < 0:
        return None
    prof = 0
    for j in range(i, len(txt)):
        if txt[j] == "{":
            prof += 1
        elif txt[j] == "}":
            prof -= 1
            if prof == 0:
                return txt[i:j + 1]
    return None


def linhas_de_tabela(b):
    """Itens `{ ... }` de primeiro nivel dentro de um bloco."""
    if not b:
        return []
    out, prof, ini = [], 0, None
    for j, ch in enumerate(b[1:-1], start=1):
        if ch == "{":
            if prof == 0:
                ini = j
            prof += 1
        elif ch == "}":
            prof -= 1
            if prof == 0 and ini is not None:
                out.append(b[ini:j + 1])
                ini = None
    return out


def parse_loot(txt):
    b = bloco(txt, "loot")
    out = []
    for ln in linhas_de_tabela(b):
        nome = re.search(r'name\s*=\s*"([^"]+)"', ln)
        iid = re.search(r"\bid\s*=\s*(\d+)", ln)
        ch = num(ln, "chance", 0) or 0
        mx = num(ln, "maxCount", 1) or 1
        if not nome and not iid:
            continue
        reg = {
            # o Canary usa 1/100000; o jogo trabalha em porcentagem
            "chance": round(min(100.0, ch / 1000.0), 4),
            "max": int(mx),
        }
        if nome:
            reg["item"] = slug(nome.group(1))
        else:
            cid = int(iid.group(1))
            s = ID2SLUG.get(cid)
            if s:
                reg["item"] = s
            else:
                # id que nao existe no items.xml: guarda o numero para nao
                # perder a entrada, mas a UI precisa saber que nao ha slug
                reg["cid"] = cid
        out.append(reg)
    return out


def parse_ataques(txt):
    """Habilidades ofensivas: melee vira o dano base, o resto vira skill.

    Retorna (melee, skills, melee_cond): melee_cond e a condition que o
    golpe corpo-a-corpo aplica (ex.: veneno da aranha) — o Canary declara
    `condition = { type = CONDITION_POISON, totalDamage = N }` dentro do
    proprio ataque melee, e sem isso o bicho mordia mas nunca envenenava.
    """
    b = bloco(txt, "attacks")
    melee = 0
    melee_cond = None
    skills = []
    for ln in linhas_de_tabela(b):
        nome = re.search(r'name\s*=\s*"([^"]+)"', ln)
        nome = nome.group(1) if nome else ""
        mind = abs(num(ln, "minDamage", 0) or 0)
        maxd = abs(num(ln, "maxDamage", 0) or 0)
        if nome == "melee":
            melee = max(melee, int(maxd))
            cond = _condicao(ln)
            if cond:
                melee_cond = cond
            continue
        tp = re.search(r"type\s*=\s*COMBAT_([A-Z]+)", ln)
        el = COMBAT.get(tp.group(1), "physical") if tp else "physical"
        hab = {
            "el": el,
            "min": int(mind), "max": int(maxd),
            "int": int(num(ln, "interval", 2000) or 2000),
            "ch": int(num(ln, "chance", 100) or 100),
        }
        if nome and nome != "combat":
            hab["n"] = nome
        r = num(ln, "range")
        if r:
            hab["range"] = int(r)
        # area: radius = circulo, length/spread = feixe (a onda de fogo)
        rad = num(ln, "radius")
        if rad:
            hab["radius"] = int(rad)
        ln_ = num(ln, "length")
        if ln_:
            hab["length"] = int(ln_)
            sp = num(ln, "spread")
            if sp is not None:
                hab["spread"] = int(sp)
        fx = re.search(r"\beffect\s*=\s*CONST_ME_([A-Z_0-9]+)", ln)
        if fx and fx.group(1) in ME:
            hab["fx"] = ME[fx.group(1)]
        mi = re.search(r"shootEffect\s*=\s*CONST_ANI_([A-Z_0-9]+)", ln)
        if mi and mi.group(1) in ANI:
            hab["miss"] = ANI[mi.group(1)]
        if re.search(r"target\s*=\s*true", ln):
            hab["alvo"] = 1

        # campos de chao (*field): firefield/poisonfield/energyfield criam um
        # campo que queima/envenena/eletrifica no tempo — no idle vira a
        # condition correspondente (o parser antigo deixava a magia "sem
        # efeito nenhum", que era o que parecia bugado).
        campo = re.search(r'name\s*=\s*"([a-z]*)field"', ln)
        if campo:
            nome_campo = campo.group(1)
            mapa = {"fire": "fire", "poison": "poison", "energy": "energy"}
            if nome_campo in mapa:
                hab["campo"] = mapa[nome_campo]
        elif nome == "condition":
            # magia de condition pura (ex.: priestess): aplica a condition
            # correspondente ao tipo no alvo, com o dano do proprio ataque
            ctp = re.search(r"type\s*=\s*CONDITION_([A-Z]+)", ln)
            if ctp:
                hab["cond"] = ctp.group(1).lower()
                if maxd > 0:
                    hab["condDano"] = int(maxd)

        # conditions aplicadas pelo golpe (veneno, fogo, dreno)
        cond = _condicao(ln)
        if cond:
            hab["cond"] = cond["tipo"]
            if cond.get("dano") and not hab.get("condDano"):
                hab["condDano"] = cond["dano"]

        skills.append(hab)
    return melee, skills, melee_cond


def _condicao(ln):
    """Extrai `condition = { type = CONDITION_X, totalDamage = N, ... }`
    de uma linha de ataque. Devolve {tipo, dano} ou None."""
    cond = re.search(r"condition\s*=\s*\{([^}]*)\}", ln)
    if not cond:
        return None
    ctp = re.search(r"type\s*=\s*CONDITION_([A-Z]+)", cond.group(1))
    if not ctp:
        return None
    tipo = ctp.group(1).lower()
    # totalDamage (canary) -> dano por turno do jogo (4 turnos)
    td = num(cond.group(1), "totalDamage")
    if td:
        dano = max(1, int(round(abs(td) / 4.0)))
        return {"tipo": tipo, "dano": dano, "total": int(abs(td))}
    return {"tipo": tipo}


def parse_defesas(txt):
    b = bloco(txt, "defenses")
    out = {
        "defense": int(num(b or "", "defense", 0) or 0),
        "armor": int(num(b or "", "armor", 0) or 0),
    }
    mit = num(b or "", "mitigation")
    if mit:
        out["mitigation"] = mit
    curas = []
    for ln in linhas_de_tabela(b):
        tp = re.search(r"type\s*=\s*COMBAT_([A-Z]+)", ln)
        if not tp:
            # escudo/haste que o bicho lanca em si mesmo
            nm = re.search(r'name\s*=\s*"([^"]+)"', ln)
            if nm:
                curas.append({"n": nm.group(1),
                              "int": int(num(ln, "interval", 2000) or 2000),
                              "ch": int(num(ln, "chance", 100) or 100)})
            continue
        if tp.group(1) != "HEALING":
            continue
        curas.append({
            "n": "healing",
            "min": int(abs(num(ln, "minDamage", 0) or 0)),
            "max": int(abs(num(ln, "maxDamage", 0) or 0)),
            "int": int(num(ln, "interval", 2000) or 2000),
            "ch": int(num(ln, "chance", 100) or 100),
        })
    if curas:
        out["skills"] = curas
    return out


def parse_elements(txt):
    b = bloco(txt, "elements")
    out = {}
    for ln in linhas_de_tabela(b):
        tp = re.search(r"type\s*=\s*COMBAT_([A-Z]+)", ln)
        pc = num(ln, "percent", 0)
        if not tp or not pc:
            continue
        el = COMBAT.get(tp.group(1))
        if not el or el == "healing":
            continue
        # varios COMBAT_* caem no mesmo elemento (LIFEDRAIN -> death);
        # fica o de maior valor absoluto, que e o que domina na pratica
        if el in out and abs(out[el]) >= abs(int(pc)):
            continue
        out[el] = int(pc)
    return out


def parse_imunidades(txt):
    b = bloco(txt, "immunities")
    out = []
    for ln in linhas_de_tabela(b):
        tp = re.search(r'type\s*=\s*"([^"]+)"', ln)
        if tp and re.search(r"condition\s*=\s*true", ln):
            out.append(tp.group(1))
    return out


def parse_voices(txt):
    """Falas da criatura (monster.voices).

    No servidor isso vira onThinkYell: a cada `interval` ms roda uma rolagem
    de `chance`% e, passando, sorteia UMA fala do vetor. `yell = true` sai
    como TALKTYPE_MONSTER_YELL (o cliente mostra em laranja e em caixa alta)
    e o resto como TALKTYPE_MONSTER_SAY.
    """
    b = bloco(txt, "voices")
    if not b:
        return None
    reg = {
        "int": int(num(b, "interval", 5000) or 5000),
        "ch": int(num(b, "chance", 10) or 10),
        "list": [],
    }
    for ln in linhas_de_tabela(b):
        t = re.search(r'text\s*=\s*"((?:[^"\\]|\\.)*)"', ln)
        if not t:
            continue
        fala = {"t": t.group(1).replace('\\"', '"')}
        if re.search(r"yell\s*=\s*true", ln):
            fala["y"] = 1
        reg["list"].append(fala)
    return reg if reg["list"] else None


def parse_bestiary(txt):
    b = bloco(txt, "Bestiary")
    if not b:
        return None
    cls = re.search(r'class\s*=\s*"([^"]+)"', b)
    loc = re.search(r'Locations\s*=\s*"(.*?)"', b, re.S)
    out = {}
    if cls:
        out["classe"] = cls.group(1)
    for campo, chave in (("toKill", "toKill"), ("FirstUnlock", "u1"),
                         ("SecondUnlock", "u2"),
                         ("CharmsPoints", "charm"), ("Stars", "stars"),
                         ("Occurrence", "ocor")):
        v = num(b, campo)
        if v is not None:
            out[chave] = int(v)
    if loc:
        # o Lua quebra string longa com \z + indentacao; junta tudo
        s = re.sub(r"\\z\s*", "", loc.group(1))
        out["locais"] = re.sub(r"\s+", " ", s).strip()
    return out or None


def elemento_principal(skills, melee):
    """Elemento que o bicho mais usa, para o resumo na ficha."""
    peso = {}
    for h in skills:
        if h["el"] == "healing":
            continue
        peso[h["el"]] = peso.get(h["el"], 0) + h.get("max", 0)
    if not peso:
        return "physical"
    el = max(peso, key=peso.get)
    return el if peso[el] >= melee else "physical"


def parse_arquivo(caminho):
    txt = open(caminho, encoding="utf-8", errors="ignore").read()
    nome = re.search(r'Game\.createMonsterType\("([^"]+)"\)', txt)
    if not nome:
        return None, None
    nome = nome.group(1)
    hp = num(txt, "health")
    if not hp:
        return None, None

    flags = bloco(txt, "flags") or ""
    melee, skills, melee_cond = parse_ataques(txt)
    defesas = parse_defesas(txt)
    elements = parse_elements(txt)

    m = {
        "name": nome,
        "hp": int(hp),
        "exp": int(num(txt, "experience", 0) or 0),
        "speed": int(num(txt, "speed", 100) or 100),
        "armor": defesas["armor"],
        "defense": defesas["defense"],
        # dano do golpe corpo a corpo; sem melee usa a maior habilidade
        "damage": int(melee or max([h.get("max", 0) for h in skills] or [0])),
        "element": elemento_principal(skills, melee),
        "attackSpeed": 2000,
    }
    if melee_cond:
        m["meleeCond"] = melee_cond
    if defesas.get("mitigation"):
        m["mitigation"] = defesas["mitigation"]
    if elements:
        m["resist"] = elements
    if skills:
        m["skills"] = skills
    if defesas.get("skills"):
        m["defSkills"] = defesas["skills"]

    lt = num(txt, "lookType")
    if lt:
        m["looktype"] = int(lt)
    raca = re.search(r'monster\.race\s*=\s*"([^"]+)"', txt)
    if raca:
        m["race"] = raca.group(1)
    rid = num(txt, "raceId")
    if rid:
        m["raceId"] = int(rid)

    # flags que a IA do grid consome
    td = num(flags, "targetDistance")
    if td:
        m["targetDistance"] = int(td)
        if int(td) > 1:
            m["ranged"] = 1
    sa = num(flags, "staticAttackChance")
    if sa is not None:
        m["staticAttack"] = int(sa)
    rh = num(flags, "runHealth")
    if rh:
        m["runAt"] = int(rh)
    if re.search(r"hostile\s*=\s*false", flags):
        m["passivo"] = 1
    if re.search(r"rewardBoss\s*=\s*true", flags):
        m["boss"] = 1

    imu = parse_imunidades(txt)
    if imu:
        m["imune"] = imu
    loot = parse_loot(txt)
    if loot:
        m["loot"] = loot
    best = parse_bestiary(txt)
    if best:
        m["best"] = best
    voices = parse_voices(txt)
    if voices:
        m["voices"] = voices

    return slug(nome), m


def main():
    raiz = os.path.join(CAN, "data-otservbr-global", "monster")
    if not os.path.isdir(raiz):
        print("monstros do canary nao encontrados em", raiz)
        return

    global ID2SLUG
    ID2SLUG = mapa_de_ids()
    print("ids de item mapeados:", len(ID2SLUG))

    todos = {}
    ignorados = 0
    for base, _, arqs in os.walk(raiz):
        for a in arqs:
            if not a.endswith(".lua"):
                continue
            try:
                s, m = parse_arquivo(os.path.join(base, a))
            except Exception as e:                      # noqa: BLE001
                print("erro em", a, e)
                continue
            if not s:
                ignorados += 1
                continue
            # Descarta o que nao e criatura de verdade: armadilhas, pilares e
            # as "wild magics" do mapa sao MonsterType no Canary (para o
            # servidor poder posiciona-los), mas tem hp 1, exp 0 e nenhum
            # looktype. No bestiario apareceriam como fichas vazias e no jogo
            # pediriam uma sprite que nao existe.
            if not m.get("looktype") and m.get("hp", 0) <= 1 \
                    and not m.get("exp"):
                ignorados += 1
                continue
            # a pasta diz se e boss; serve para o boostiary
            rel = os.path.relpath(base, raiz).split(os.sep)[0]
            m["grupo"] = rel
            if rel == "bosses":
                m["boss"] = 1
            # duplicado: fica o de maior HP (versoes de quest sao mais fracas)
            if s in todos and todos[s]["hp"] >= m["hp"]:
                continue
            todos[s] = m

    saida = os.path.join(GAME, "data", "canarymonsters.json")
    json.dump(todos, open(saida, "w"))
    js = os.path.join(GAME, "js", "monsterdata.js")
    with open(js, "w") as f:
        f.write("/* Gerado por tools/import_monsters.py\n"
                " * Monstros lidos de data-otservbr-global/monster do Canary:\n"
                " * stats, habilidades, defesas, resistencias, loot real e os\n"
                " * dados de bestiario (classe, toKill, estagios, charms). */\n")
        f.write("window.MONSTERDATA = " + json.dumps(todos) + ";\n")

    comSkill = sum(1 for m in todos.values() if m.get("skills"))
    comLoot = sum(1 for m in todos.values() if m.get("loot"))
    comBest = sum(1 for m in todos.values() if m.get("best"))
    bosses = sum(1 for m in todos.values() if m.get("boss"))
    print("monstros:", len(todos), "| ignorados:", ignorados)
    comVoz = sum(1 for m in todos.values() if m.get("voices"))
    print("com habilidade:", comSkill, "| com loot:", comLoot,
          "| com bestiario:", comBest, "| bosses:", bosses,
          "| com falas:", comVoz)
    print("tamanho:", round(os.path.getsize(js) / 1024 / 1024, 1), "MB")


if __name__ == "__main__":
    main()
