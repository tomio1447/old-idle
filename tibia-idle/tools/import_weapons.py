#!/usr/bin/env python3
"""
Importa categorias inteiras de equipamento do Canary para o jogo.

Por que existe: ate agora o gamedata.js tinha 380 itens escritos a mao (27
swords, por exemplo) enquanto o items.xml do Canary traz 165 swords com os
atributos reais. Este script le TRES fontes e cruza as tres:

  1. data/items/items.xml      -> atributos de combate (atk, def, skill,
                                  elemento, vocacao, nivel, imbuement,
                                  leech, augments, slotType)
  2. data/items/appearances.dat -> upgrade_classification (a "classificacao"
                                  usada pela forja), categoria de mercado e
                                  os precos reais de NPC (npcsaledata)
  3. Tibia.dat 8.60             -> quantos frames de animacao a sprite tem

O `id` do items.xml e o client id, que indexa tanto o appearances.dat quanto
o DAT 8.60 -- e essa a ponte que liga as tres fontes.

Saida:
  game/data/weapons.json   (legivel, para conferencia)
  game/js/weapondata.js    (window.WEAPONDATA, carregado pelo index.html)

Uso:
  python3 import_weapons.py sword            # so as espadas
  python3 import_weapons.py sword axe club   # varias categorias
  python3 import_weapons.py --all            # tudo que o script conhece
"""
import json
import os
import re
import sys
import xml.etree.ElementTree as ET

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.normpath(os.path.join(HERE, "..", "game"))
ITEMS_XML = os.environ.get("ITEMS_XML", "/tmp/can/data/items/items.xml")
APPEAR = os.environ.get("APPEARANCES", "/tmp/can/data/items/appearances.dat")
DAT = os.environ.get("TIBIA_DAT", "/home/user/assets860/ex/Tibia.dat")
PB = os.environ.get("PB_DIR", "/tmp/pb")

# --------------------------------------------------------------- categorias
# Cada categoria diz como achar os itens no items.xml e como o jogo vai
# classificar o resultado (slot `s` + tipo `t`).
CATEGORIAS = {
    # armas: casadas pelo weaponType do items.xml
    "sword":     {"weaponType": "sword",     "s": "weapon", "t": "sword"},
    "axe":       {"weaponType": "axe",       "s": "weapon", "t": "axe"},
    "club":      {"weaponType": "club",      "s": "weapon", "t": "club"},
    "distance":  {"weaponType": "distance",  "s": "weapon", "t": "distance"},
    "wand":      {"weaponType": "wand",      "s": "weapon", "t": "magic"},
    "fist":      {"weaponType": "fist",      "s": "weapon", "t": "fist"},
    "shield":    {"weaponType": "shield",    "s": "shield", "t": "shield"},
    "spellbook": {"weaponType": "spellbook", "s": "shield", "t": "spellbook"},
    # vestimentas: casadas pelo `slot` do moveevent (nao pelo slotType, que
    # no Canary so marca two-handed/dualwielding)
    "armor":     {"slot": ("armor", "body"), "s": "armor",  "t": "armor"},
    "legs":      {"slot": ("legs",),         "s": "legs",   "t": "armor"},
    "helmet":    {"slot": ("head",),         "s": "helmet", "t": "armor"},
    "boots":     {"slot": ("feet",),         "s": "boots",  "t": "armor"},
    "ring":      {"slot": ("ring",),         "s": "ring",   "t": "accessory"},
    "amulet":    {"slot": ("necklace",),     "s": "amulet", "t": "accessory"},
}

# vocacao do Canary ("Knight;true, Elite Knight") -> vocacao do jogo
VOC_MAP = {
    "knight": "knight", "elite knight": "knight",
    "paladin": "paladin", "royal paladin": "paladin",
    "sorcerer": "sorcerer", "master sorcerer": "sorcerer",
    "druid": "druid", "elder druid": "druid",
    "monk": "monk", "exalted monk": "monk",
}

ELEMENTOS = {
    "elementfire": "fire", "elementice": "ice", "elementenergy": "energy",
    "elementearth": "earth", "elementdeath": "death", "elementholy": "holy",
    "elementphysical": "physical",
}

ABSORB = {
    "absorbpercentfire": "fire", "absorbpercentice": "ice",
    "absorbpercentenergy": "energy", "absorbpercentearth": "earth",
    "absorbpercentpoison": "earth", "absorbpercentdeath": "death",
    "absorbpercentholy": "holy", "absorbpercentphysical": "physical",
    "absorbpercentall": "all", "absorbpercentallelements": "all",
    "absorbpercentdrown": "drown", "absorbpercentlifedrain": "death",
    "absorbpercentmanadrain": "death",
}

SKILLS = {
    "skillsword": "sword", "skillaxe": "axe", "skillclub": "club",
    "skilldist": "dist", "skillshield": "shield", "skillfist": "fist",
    "magiclevelpoints": "mag",
}


# Itens que o Canary usa para teste interno de GM e nao existem no jogo real.
# Sem esse filtro a "ornate testtplate" e a "wand of destruction test"
# apareciam no catalogo com stats absurdos.
RE_TESTE = re.compile(r"\btests?\b|testt|\bgm\b|\bdebug\b", re.I)


def slugify(nome):
    s = re.sub(r"[^a-z0-9]+", "-", nome.strip().lower()).strip("-")
    return s or "item"


def num(v, inteiro=True):
    try:
        f = float(v)
    except (TypeError, ValueError):
        return 0
    return int(f) if inteiro else f


# --------------------------------------------------------------- items.xml
def le_items_xml():
    """client id -> dict cru com tudo que interessa do items.xml.

    Le com ElementTree e nao com regex de proposito: metade dos atributos
    fica ANINHADA dentro de <attribute key="script"> (level, vocation, slot)
    e varios itens tem `article` entre o id e o name, o que quebra regex.
    """
    raiz = ET.parse(ITEMS_XML).getroot()
    saida = {}
    for it in raiz:
        if it.tag != "item":
            continue
        ids = it.get("id")
        if not ids:            # faixas <item fromid= toid=> nao tem sprite propria util
            continue
        cid = int(ids)
        d = {"id": cid, "name": (it.get("name") or "").strip(),
             "article": it.get("article") or ""}
        aug = []
        # percorre a arvore inteira: atributos de primeiro nivel e os de script
        for a in it.iter("attribute"):
            k = (a.get("key") or "").strip().lower()
            v = (a.get("value") or "").strip()
            if k == "augments":
                for ch in a:
                    valor = 0
                    for sub in ch:
                        if (sub.get("key") or "").lower() == "value":
                            valor = num(sub.get("value"))
                    aug.append({"s": (ch.get("key") or "").strip(),
                                "k": (ch.get("value") or "").strip(),
                                "v": valor})
                continue
            if k == "imbuementslot":
                d["imbSlots"] = num(v)
                continue
            if k in d and k in ("weapontype", "slottype"):
                continue       # o de fora vale mais que o repetido no script
            d[k] = v
        if aug:
            d["augments"] = aug
        saida[cid] = d
    return saida


# ---------------------------------------------------------- appearances.dat
def le_appearances():
    """client id -> {cls, cat, buy, sell, mlvl, profs}.

    O appearances.dat e um protobuf; e a UNICA fonte da
    upgrade_classification (1..4), que a forja do Tibia usa para saber
    quantos tiers o item aceita. Tambem traz os precos de NPC reais.
    """
    sys.path.insert(0, PB)
    try:
        import app_pb2
    except ImportError:
        # Aborta em vez de seguir sem os dados. A versao anterior so imprimia
        # um aviso e continuava, e como /tmp e limpo entre sessoes isso gerou
        # um weapons.json com classification zerada em TODOS os 1322 itens --
        # falha silenciosa que so apareceu quando um teste quebrou.
        raise SystemExit(
            "ERRO: app_pb2 nao encontrado em %s.\n"
            "  A classification (forja) e os precos de NPC vem do\n"
            "  appearances.dat, que precisa do protobuf compilado:\n"
            "    pip install grpcio-tools\n"
            "    curl -o /tmp/app.proto https://raw.githubusercontent.com/"
            "opentibiabr/canary/main/src/protobuf/appearances.proto\n"
            "    cd /tmp && mkdir -p pb && python3 -m grpc_tools.protoc "
            "-I. --python_out=pb app.proto" % PB)
    a = app_pb2.Appearances()
    with open(APPEAR, "rb") as fh:
        a.ParseFromString(fh.read())
    saida = {}
    for o in a.object:
        f = o.flags
        e = {}
        if f.HasField("upgradeclassification"):
            e["cls"] = f.upgradeclassification.upgrade_classification
        if f.HasField("market"):
            m = f.market
            if m.category:
                e["cat"] = app_pb2.ITEM_CATEGORY.Name(m.category)
            if m.minimum_level:
                e["mlvl"] = m.minimum_level
            profs = [app_pb2.PLAYER_PROFESSION.Name(x)
                     for x in m.restrict_to_profession]
            if profs:
                e["profs"] = profs
        # Precos de NPC. Atencao a semantica invertida do protobuf:
        #   sale_price = quanto o NPC VENDE (o jogador paga esse valor)
        #   buy_price  = quanto o NPC PAGA   (o jogador recebe esse valor)
        # Confirmado na plate armor: sale 1200 / buy 400, igual ao Tibia real.
        vende = [n.sale_price for n in f.npcsaledata if n.sale_price]
        paga = [n.buy_price for n in f.npcsaledata if n.buy_price]
        if vende:
            e["buy"] = min(vende)      # melhor preco para o jogador comprar
        if paga:
            e["sell"] = max(paga)      # melhor preco para o jogador vender
        if e:
            saida[o.id] = e
    return saida


# ------------------------------------------------------------------- DAT
def le_frames():
    """client id -> numero de frames de animacao da sprite no DAT 8.60."""
    sys.path.insert(0, HERE)
    from tibia_assets_860 import Dat860
    dat = Dat860(DAT)
    saida = {}
    for cid, obj in dat.objects.items():
        if cid > dat.item_count or not obj.groups:
            continue
        g = obj.groups[0]
        if g.anim > 1:
            saida[cid] = g.anim
    return saida


# --------------------------------------------------------------- conversao
def vocacoes(txt):
    out = []
    for parte in re.split(r"[;,]", txt or ""):
        p = parte.strip().lower()
        if p in ("true", "false", ""):
            continue
        v = VOC_MAP.get(p)
        if v and v not in out:
            out.append(v)
    return out


def converte(cru, extra, frames, cfg):
    """items.xml + appearances + frames -> registro do jogo."""
    d = {"n": cru["name"], "id": cru["id"], "s": cfg["s"], "t": cfg["t"]}

    atk = num(cru.get("attack"))
    if atk:
        d["atk"] = atk
    for src, dst in (("defense", "def"), ("extradef", "extraDef"),
                     ("armor", "arm"), ("range", "range"),
                     ("hitchance", "hit"), ("charges", "charges"),
                     # mantra: "armadura elemental" do Monk (15.10). Reduz um
                     # valor FIXO de dano de fogo/gelo/energia/terra, nao um
                     # percentual, e so conta nos slots que o servidor lista
                     # em Player::getMantra()
                     ("mantra", "mantra")):
        v = num(cru.get(src))
        if v:
            d[dst] = v
    peso = num(cru.get("weight"), False)
    d["w"] = round(peso / 100.0, 2) if peso else 0

    lvl = num(cru.get("level")) or extra.get("mlvl", 0)
    if lvl:
        d["lvl"] = lvl
    vocs = vocacoes(cru.get("vocation"))
    if vocs:
        d["vocs"] = vocs
    if cru.get("imbSlots"):
        d["imbSlots"] = cru["imbSlots"]
    if (cru.get("slottype") or "").lower() == "two-handed":
        d["th"] = 1

    # dano elemental convertido (parte do ataque vira fogo/gelo/...)
    for k, el in ELEMENTOS.items():
        v = num(cru.get(k))
        if v:
            d["el"] = el
            d["elDmg"] = v
            break

    # wand/rod: dano magico fixo vem de fromDamage/toDamage
    fd, td = num(cru.get("fromdamage")), num(cru.get("todamage"))
    if td:
        d["mdmg"] = (fd + td) // 2
        d["dmgMin"], d["dmgMax"] = fd, td
    if cru.get("mana"):
        d["manaCost"] = num(cru.get("mana"))
    if cru.get("wandtype"):
        d["el"] = cru["wandtype"].strip().lower()

    # bonus de skill do proprio item
    for k, sk in SKILLS.items():
        v = num(cru.get(k))
        if v:
            d[sk] = v

    # resistencias elementais: guardadas como mapa para a Cyclopedia mostrar
    res = {}
    for k, el in ABSORB.items():
        v = num(cru.get(k))
        if v:
            res[el] = res.get(el, 0) + v
    if res:
        d["res"] = res
        # `prot` continua sendo o numero unico que o combate ja consome
        d["prot"] = res.get("physical", 0) or res.get("all", 0)

    # leech (percentual em milesimos no Canary: 300 = 3%)
    for src, dst in (("lifeleechamount", "lifeLeech"),
                     ("manaleechamount", "manaLeech")):
        v = num(cru.get(src))
        if v:
            d[dst] = round(v / 100.0, 2)

    for src, dst in (("healthgain", "hpreg"), ("managain", "mpreg"),
                     ("speed", "spd"), ("maxhitpoints", "hp"),
                     ("maxmanapoints", "mp")):
        v = num(cru.get(src))
        if v:
            d[dst] = v

    # classificacao (forja) e categoria de mercado
    if extra.get("cls"):
        d["cls"] = extra["cls"]
    if extra.get("cat"):
        d["cat"] = extra["cat"]
    if cru.get("augments"):
        d["aug"] = cru["augments"]

    # Economia. O preco de NPC do Tibia real e guardado separado (npcBuy /
    # npcSell) so para exibicao: usar ele como `sell` quebraria a curva do
    # idle, porque no Tibia a demon shield vale 30k enquanto a economia
    # daqui trabalha na casa das centenas nesse nivel.
    #
    # `sell` continua saindo da MESMA formula de poder que build_data.py ja
    # usava, para os 380 itens antigos nao mudarem de preco.
    if extra.get("buy"):
        d["npcBuy"] = extra["buy"]
        d["shop"] = 1          # existe em NPC -> pode aparecer na loja
    else:
        d["drop"] = 1          # so por drop/quest, como no Tibia
    if extra.get("sell"):
        d["npcSell"] = extra["sell"]
    poder = (d.get("atk", 0) * 12 + d.get("elDmg", 0) * 12 +
             d.get("def", 0) * 10 + d.get("arm", 0) * 30 +
             d.get("mdmg", 0) * 8 + d.get("mag", 0) * 250 +
             d.get("prot", 0) * 20 + d.get("hpreg", 0) * 150 +
             d.get("mpreg", 0) * 120 + d.get("spd", 0) * 10)
    d["sell"] = max(2, int(poder * 1.6))

    n = frames.get(cru["id"])
    if n:
        d["af"] = n           # a sprite tem animacao: N frames na tira
    return d


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("-")]
    if "--all" in sys.argv:
        args = list(CATEGORIAS)
    if not args:
        print(__doc__)
        return 1
    for a in args:
        if a not in CATEGORIAS:
            print("categoria desconhecida:", a, "->", list(CATEGORIAS))
            return 1

    print("lendo fontes...")
    xml = le_items_xml()
    appear = le_appearances()
    frames = le_frames()
    print("  %d itens no items.xml, %d no appearances.dat, %d sprites animadas"
          % (len(xml), len(appear), len(frames)))

    destino = os.path.join(GAME, "data", "weapons.json")
    antigo = {}
    if os.path.exists(destino):
        antigo = json.load(open(destino, encoding="utf-8"))
    itens = antigo.get("items", {})
    cats = antigo.get("cats", {})

    for nome_cat in args:
        cfg = CATEGORIAS[nome_cat]
        slugs = []
        for cid, cru in sorted(xml.items()):
            if "weaponType" in cfg:
                if (cru.get("weapontype") or "").lower() != cfg["weaponType"]:
                    continue
            else:
                if (cru.get("slot") or "").lower() not in cfg["slot"]:
                    continue
                # nao deixa arma entrar como vestimenta
                if cru.get("weapontype"):
                    continue
            if not cru["name"] or RE_TESTE.search(cru["name"]):
                continue
            slug = slugify(cru["name"])
            if slug in itens and itens[slug].get("id") != cid:
                continue      # ja veio de outra categoria, primeiro id vence
            d = converte(cru, appear.get(cid, {}), frames, cfg)
            d["cat"] = nome_cat
            itens[slug] = d
            slugs.append(slug)
        cats[nome_cat] = sorted(set(slugs))
        anim = sum(1 for s in cats[nome_cat] if itens[s].get("af"))
        print("  %-10s %3d itens (%d animados)"
              % (nome_cat, len(cats[nome_cat]), anim))

    saida = {"cats": cats, "items": itens}
    os.makedirs(os.path.dirname(destino), exist_ok=True)
    with open(destino, "w", encoding="utf-8") as fh:
        json.dump(saida, fh, ensure_ascii=False, indent=1, sort_keys=True)

    js = os.path.join(GAME, "js", "weapondata.js")
    with open(js, "w", encoding="utf-8") as fh:
        fh.write("/* Gerado por tools/import_weapons.py -- nao editar a mao.\n"
                 " * Fontes: items.xml (atributos), appearances.dat\n"
                 " * (classification/precos de NPC) e Tibia.dat 8.60 (frames\n"
                 " * de animacao da sprite). */\n")
        fh.write("window.WEAPONDATA = ")
        json.dump(saida, fh, ensure_ascii=False, separators=(",", ":"),
                  sort_keys=True)
        fh.write(";\n")
    print("gravado: %d itens no total (%s)"
          % (len(itens), ", ".join(sorted(cats))))
    return 0


if __name__ == "__main__":
    sys.exit(main())
