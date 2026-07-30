"""
Empacota os PNGs soltos de cada monstro num spritesheet unico.

Por que: extrair as 1466 criaturas que faltavam gerou 18.760 arquivos (4
direcoes x 3 poses cada). Isso e ruim por dois motivos independentes:

  1. o navegador abre uma requisicao por quadro — entrar numa cacada com 4
     bichos disparava dezenas de GETs;
  2. o workspace tem teto de 10.000 arquivos por snapshot, entao boa parte
     da arte simplesmente nao seria salva.

O sheet segue o mesmo formato ja usado nas outfits (extract_appearance_sheets):
coluna = pose (0 parado, 1 e 2 os passos), linha = direcao na ordem do client
(0 N, 1 E, 2 S, 3 O), celula de tamanho fixo. Como todos os quadros de uma
criatura ja foram recortados com a MESMA caixa, eles encaixam sem ajuste.

Saida:
    assets/mob/<slug>.png      sheet 3 colunas x 4 linhas
    js/mobsheetdata.js         {slug: {cw, ch, cols, rows}}

Os PNGs soltos sao apagados no fim (o sheet os substitui).

Uso: python3 pack_monster_sheets.py [dir_do_game]
"""
import json
import os
import sys

from PIL import Image

GAME = sys.argv[1] if len(sys.argv) > 1 else os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "..", "game")

DIRS = ("n", "e", "s", "w")      # linha do sheet, na ordem do client
COLS = 3                          # parado + 2 passos


def main():
    dest = os.path.join(GAME, "assets", "mob")
    arquivos = [a for a in os.listdir(dest) if a.endswith(".png")]

    # agrupa por slug: "dragon_e2.png" -> slug dragon, dir e, pose 2
    porSlug = {}
    for a in arquivos:
        base = a[:-4]
        if "_" not in base:
            continue
        slug, suf = base.rsplit("_", 1)
        if not suf:
            continue
        d = suf[0]
        if d not in DIRS:
            continue
        pose = int(suf[1:]) if len(suf) > 1 and suf[1:].isdigit() else 0
        if pose >= COLS:
            continue
        porSlug.setdefault(slug, {})[(d, pose)] = a

    meta = {}
    feitos = 0
    usados = []
    for slug, quadros in sorted(porSlug.items()):
        # a celula tem o tamanho do maior quadro; como o recorte foi comum,
        # na pratica todos ja tem a mesma medida
        cw = ch = 0
        imgs = {}
        for k, nome in quadros.items():
            im = Image.open(os.path.join(dest, nome)).convert("RGBA")
            imgs[k] = im
            cw = max(cw, im.width)
            ch = max(ch, im.height)
        if not cw or not ch:
            continue

        sheet = Image.new("RGBA", (cw * COLS, ch * len(DIRS)), (0, 0, 0, 0))
        for li, d in enumerate(DIRS):
            for col in range(COLS):
                im = imgs.get((d, col))
                if im is None:
                    # sem esse passo: repete a pose parada para a animacao
                    # nao piscar um buraco transparente
                    im = imgs.get((d, 0))
                if im is None:
                    continue
                sheet.paste(im, (col * cw, li * ch))

        sheet.save(os.path.join(dest, slug + ".png"), optimize=True)
        meta[slug] = {"cw": cw, "ch": ch, "cols": COLS, "rows": len(DIRS)}
        usados.extend(quadros.values())
        feitos += 1

    # remove os quadros soltos: o sheet passa a ser a unica fonte
    for a in set(usados):
        try:
            os.remove(os.path.join(dest, a))
        except OSError:
            pass

    js = os.path.join(GAME, "js", "mobsheetdata.js")
    with open(js, "w") as f:
        f.write("/* Gerado por tools/pack_monster_sheets.py\n"
                " * Spritesheet por criatura: coluna = pose (0 parado, 1-2\n"
                " * passos), linha = direcao (0 N, 1 E, 2 S, 3 O). */\n")
        f.write("window.MOBSHEETS = " + json.dumps(meta) + ";\n")
    json.dump(meta, open(os.path.join(GAME, "data", "mobsheets.json"), "w"))

    restantes = len([a for a in os.listdir(dest) if a.endswith(".png")])
    print("sheets:", feitos, "| arquivos em assets/mob agora:", restantes)


if __name__ == "__main__":
    main()
