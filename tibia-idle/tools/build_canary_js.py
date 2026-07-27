"""
Gera game/js/canarydata.js a partir do canary.json.

O arquivo expoe window.CANARY (vocacoes, imbuements, outfits, mounts) e
MESCLA as spells do Canary dentro do SPELLS que o jogo ja usa, mantendo
as magias antigas que ja estao balanceadas e adicionando as novas — em
especial as 44 do Monk.

Cada spell ganha um icone da folha defaultspells.png. O mapeamento e
feito por palavra-chave do nome, com um indice estavel por hash como
reserva, para nenhuma magia ficar sem icone.
"""
import json
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.normpath(os.path.join(HERE, "..", "game", "data", "canary.json"))
OUT = os.path.normpath(os.path.join(HERE, "..", "game", "js", "canarydata.js"))
ICON_DIR = os.path.normpath(os.path.join(HERE, "..", "game", "assets", "spell"))

VOC_JOGO = {"knight", "paladin", "druid", "sorcerer", "monk"}

# elemento pelo nome/palavras da magia
ELEMENTO = [
    (r"\bflam|fire|inferno|hell|scorch", "fire"),
    (r"\bvis\b|energy|thunder|storm|lightning", "energy"),
    (r"\bfrigo|ice|glacia|freez", "ice"),
    (r"\btera\b|earth|poison|envenom|terra", "earth"),
    (r"\bmort\b|death|curse|soul", "death"),
    (r"\bsan\b|holy|divine|light", "holy"),
]

# icones escolhidos a dedo para as magias mais usadas
ICONE_FIXO = {
    "exura": 26, "exura gran": 27, "exura vita": 28, "exura san": 29,
    "exura ico": 30, "exura gran san": 31, "exura gran ico": 32,
    "exori": 60, "exori gran": 61, "exori mas": 62, "exori con": 63,
    "exori flam": 64, "exori vis": 65, "exori frigo": 66, "exori tera": 67,
    "exori san": 68, "exori min": 69, "exori hur": 70,
    "exevo flam hur": 72, "exevo vis hur": 73, "exevo frigo hur": 74,
    "exevo tera hur": 75, "exevo gran mas vis": 76,
    "exevo gran mas flam": 77, "exevo gran mas frigo": 78,
    "exevo gran mas tera": 79, "exevo mas san": 80,
    "utani hur": 12, "utani gran hur": 13, "utamo vita": 14,
    "utura": 15, "utura gran": 16, "utura mas sio": 17,
    "exana pox": 18, "exana flam": 19, "exana vis": 20, "exana mort": 21,
    "exana kor": 22, "exana amp res": 23,
    # monk
    "exori pug": 96, "exori gran pug": 97, "exori mas pug": 98,
    "exori gran mas pug": 99, "exori nia": 100, "exori gran nia": 101,
    "exori mas nia": 102, "exori gran mas nia": 103, "exori infir pug": 104,
    "exori infir nia": 105, "exori amp pug": 106, "utori kor": 107,
    "utura tio": 108, "utura sio": 109, "utura mas tio": 110,
}


def elemento_de(sp):
    alvo = ((sp.get("words") or "") + " " + (sp.get("name") or "")).lower()
    for pat, el in ELEMENTO:
        if re.search(pat, alvo):
            return el
    return None


def icone_de(sp, disponiveis):
    w = (sp.get("words") or "").lower().strip()
    if w in ICONE_FIXO and ICONE_FIXO[w] in disponiveis:
        return ICONE_FIXO[w]
    # reserva estavel: hash do nome cai sempre no mesmo icone
    lista = sorted(disponiveis)
    if not lista:
        return None
    h = 0
    for ch in (sp.get("name") or w):
        h = (h * 31 + ord(ch)) & 0xFFFFFFF
    return lista[h % len(lista)]


def slug(txt):
    return re.sub(r"[^a-z0-9]+", "-", (txt or "").lower()).strip("-")


def main():
    dados = json.load(open(SRC, encoding="utf-8"))
    disponiveis = set()
    if os.path.isdir(ICON_DIR):
        for f in os.listdir(ICON_DIR):
            m = re.match(r"icon-(\d+)\.png$", f)
            if m:
                disponiveis.add(int(m.group(1)))

    spells = {}
    por_voc = {}
    for sp in dados["spells"]:
        vocs = [v for v in sp["vocs"]
                if v.split()[-1] in VOC_JOGO or v in VOC_JOGO]
        # normaliza "elite knight" -> knight, "exalted monk" -> monk
        norm = []
        for v in vocs:
            base = v.split()[-1]
            if base in VOC_JOGO and base not in norm:
                norm.append(base)
        if not norm:
            continue
        if sp["type"] not in ("attack", "heal", "support"):
            continue
        chave = slug(sp["words"] or sp["name"])
        if not chave or chave in spells:
            continue
        item = {
            "name": sp["name"],
            "words": sp["words"],
            "type": sp["type"],
            "mana": sp["mana"],
            "lvl": sp["level"],
            "cd": sp["cooldown"],
            "vocs": norm,
            "group": sp["group"],
            "icon": icone_de(sp, disponiveis),
        }
        el = elemento_de(sp)
        if el:
            item["element"] = el
        if sp.get("selfTarget"):
            item["selfTarget"] = 1
        spells[chave] = item
        for v in norm:
            por_voc[v] = por_voc.get(v, 0) + 1

    saida = {
        "vocations": dados["vocations"],
        "imbuements": dados["imbuements"],
        "outfits": dados["outfits"],
        "mounts": dados["mounts"],
        "spells": spells,
    }
    js = ("/* Gerado por tools/build_canary_js.py — dados do opentibiabr/canary */\n"
          "window.CANARY = " + json.dumps(saida, ensure_ascii=False,
                                          separators=(",", ":")) + ";\n")
    open(OUT, "w", encoding="utf-8").write(js)
    print("spells jogaveis: %d" % len(spells))
    for v in sorted(por_voc):
        print("  %-9s %d" % (v, por_voc[v]))
    print("icones disponiveis: %d" % len(disponiveis))
    semicone = sum(1 for s in spells.values() if s["icon"] is None)
    print("spells sem icone: %d" % semicone)
    print("\ngravado em %s (%.0f KB)" % (OUT, os.path.getsize(OUT) / 1024))


if __name__ == "__main__":
    main()
