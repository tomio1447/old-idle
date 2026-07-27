#!/usr/bin/env python3
"""Extrai assets de UI do opentibiabr/otclient para o jogo.

O otclient e o cliente oficial do Canary: os icones das magias vem de um
spritesheet horizontal onde a coluna N corresponde ao `clientId` da magia
declarada em modules/gamelib/spells.lua. Isso da o mapeamento exato
magia -> icone que antes era adivinhado a partir do defaultspells.png.

Uso:  python3 extract_otc_assets.py /tmp/otc /caminho/para/game
"""
import os
import sys
import struct

from PIL import Image

OTC = sys.argv[1] if len(sys.argv) > 1 else "/tmp/otc"
GAME = sys.argv[2] if len(sys.argv) > 2 else os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "..", "game")

IMG = os.path.join(OTC, "data", "images", "game")


def ensure(path):
    os.makedirs(path, exist_ok=True)
    return path


def fatiar(sheet_path, out_dir, cell_w, cell_h, prefix=""):
    """Corta um spritesheet horizontal em PNGs indexados pela coluna."""
    if not os.path.exists(sheet_path):
        print("  ! nao encontrado:", sheet_path)
        return 0
    im = Image.open(sheet_path).convert("RGBA")
    n = im.size[0] // cell_w
    ensure(out_dir)
    escritos = 0
    for i in range(n):
        cell = im.crop((i * cell_w, 0, (i + 1) * cell_w, cell_h))
        if cell.getbbox() is None:
            continue  # coluna vazia no sheet, nao gera arquivo
        cell.save(os.path.join(out_dir, "%s%d.png" % (prefix, i)))
        escritos += 1
    print("  %s -> %d/%d" % (os.path.basename(sheet_path), escritos, n))
    return escritos


def copiar_dir(src, dst, exts=(".png",)):
    if not os.path.isdir(src):
        print("  ! nao encontrado:", src)
        return 0
    ensure(dst)
    n = 0
    for f in sorted(os.listdir(src)):
        if not f.lower().endswith(exts):
            continue
        Image.open(os.path.join(src, f)).convert("RGBA").save(
            os.path.join(dst, f))
        n += 1
    print("  %s -> %d arquivos" % (src.split("/game/")[-1], n))
    return n


def main():
    print("Icones de magia (32x32, indexados por clientId):")
    fatiar(os.path.join(IMG, "spells", "spell-icons-32x32.png"),
           os.path.join(GAME, "assets", "spell", "otc"), 32, 32)

    print("Icones de magia para cooldown (20x22):")
    fatiar(os.path.join(IMG, "spells", "spell-icons-20x20.png"),
           os.path.join(GAME, "assets", "spell", "otc20"), 20, 20)

    print("Icones de grupo de magia (20x20):")
    fatiar(os.path.join(IMG, "spells", "spellgroup-icons-20x20.png"),
           os.path.join(GAME, "assets", "spell", "group"), 20, 20)

    print("Icones de imbuement (o indice e o mesmo do imbuements.xml):")
    copiar_dir(os.path.join(IMG, "imbuing", "icons"),
               os.path.join(GAME, "assets", "imbuement"))

    print("Molduras do painel de imbuement:")
    for f in ("slot.png", "slot_disabled.png", "slot_inactive.png",
              "imbue_empty.png", "imbue_green.png", "100percent.png",
              "clear.png"):
        src = os.path.join(IMG, "imbuing", f)
        if os.path.exists(src):
            ensure(os.path.join(GAME, "assets", "imbuement", "ui"))
            Image.open(src).convert("RGBA").save(
                os.path.join(GAME, "assets", "imbuement", "ui", f))

    print("Icones de status/condition:")
    copiar_dir(os.path.join(IMG, "states"),
               os.path.join(GAME, "assets", "ui", "states"))

    print("Icones da vocacao Monk (combo points / serenity):")
    copiar_dir(os.path.join(IMG, "vocations", "monk"),
               os.path.join(GAME, "assets", "ui", "monk"))

    print("Icones das abas do Cyclopedia:")
    copiar_dir(os.path.join(IMG, "cyclopedia"),
               os.path.join(GAME, "assets", "ui", "cyclopedia"))

    print("Icones das categorias de personagem:")
    copiar_dir(os.path.join(OTC, "modules", "game_cyclopedia", "images",
                            "character_icons"),
               os.path.join(GAME, "assets", "ui", "cyclopedia", "character"))

    print("Slots de inventario:")
    copiar_dir(os.path.join(OTC, "data", "images", "game", "slots"),
               os.path.join(GAME, "assets", "ui", "slots"))


if __name__ == "__main__":
    main()
