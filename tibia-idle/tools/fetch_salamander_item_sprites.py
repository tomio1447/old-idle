"""fetch_salamander_item_sprites.py — baixa os sprites OFICIAIS (TibiaWiki/
Tibia Fandom, 32x32) dos itens de loot da Salamander's Cave e grava em
game/assets/item/<slug>.png.

Serve para matar os 404 de assets/item/* na Salamander's Cave SEM precisar
do client 15.x extraído. Os GIFs da wiki são as sprites reais do client;
convertemos para PNG RGBA (o formato que o jogo carrega).

Se um <slug>.png já existir (ex.: extraído pelo add_missing_loot_items.py
a partir do .spr), o item é pulado.

Uso:
    python3 tools/fetch_salamander_item_sprites.py
"""
import os
import sys
import urllib.request

try:
    from PIL import Image
except ImportError:
    sys.exit("Pillow ausente: pip install pillow")

HERE = os.path.dirname(os.path.abspath(__file__))
DEST = os.path.join(HERE, "..", "game", "assets", "item")

# URLs oficiais (tibia.fandom, sprites 32x32 do client)
SPRITES = {
    "swampling-moss":          "https://static.wikia.nocookie.net/tibia/images/6/6e/Swampling_Moss.gif/revision/latest?cb=20121129185725&path-prefix=en",
    "piece-of-swampling-wood": "https://static.wikia.nocookie.net/tibia/images/f/f6/Piece_of_Swampling_Wood.gif/revision/latest?cb=20121129185725&path-prefix=en",
    "swampling-club":          "https://static.wikia.nocookie.net/tibia/images/3/3c/Swampling_Club.gif/revision/latest?cb=20121129185727&path-prefix=en",
    "damselfly-wing":          "https://static.wikia.nocookie.net/tibia/images/8/84/Damselfly_Wing.gif/revision/latest?cb=20121129183957&path-prefix=en",
    "damselfly-eye":           "https://static.wikia.nocookie.net/tibia/images/a/ac/Damselfly_Eye.gif/revision/latest?cb=20121129192431&path-prefix=en",
    "marsh-stalker-feather":   "https://static.wikia.nocookie.net/tibia/images/c/c5/Marsh_Stalker_Feather.gif/revision/latest?cb=20121129183954&path-prefix=en",
    "marsh-stalker-beak":      "https://static.wikia.nocookie.net/tibia/images/9/9b/Marsh_Stalker_Beak.gif/revision/latest?cb=20121129183953&path-prefix=en",
    "simple-jo-staff":         "https://static.wikia.nocookie.net/tibia/images/e/e5/Simple_Jo_Staff.gif/revision/latest?cb=20250426140028&path-prefix=en",
}


def main():
    os.makedirs(DEST, exist_ok=True)
    ok = 0
    for slug, url in SPRITES.items():
        out = os.path.join(DEST, slug + ".png")
        if os.path.exists(out):
            print("pulado (já existe):", slug)
            continue
        req = urllib.request.Request(url, headers={
            "User-Agent": "Mozilla/5.0 (compatible; tibia-idle-tools/1.0)"})
        try:
            data = urllib.request.urlopen(req, timeout=30).read()
        except Exception as e:
            print("ERRO baixando %s: %s" % (slug, e))
            continue
        is_gif = data[:6] in (b"GIF89a", b"GIF87a")
        is_webp = data[:4] == b"RIFF" and data[8:12] == b"WEBP"
        if not (is_gif or is_webp):
            print("ERRO %s: resposta não é GIF/WebP (%d bytes)" % (slug, len(data)))
            continue
        try:
            img = Image.open(__import__("io").BytesIO(data))
            img.seek(0)
            rgba = img.convert("RGBA")
            rgba.save(out, optimize=True)
            print("ok:", slug, "->", os.path.relpath(out, HERE), rgba.size)
            ok += 1
        except Exception as e:
            print("ERRO convertendo %s: %s" % (slug, e))
    print("prontos:", ok, "de", len(SPRITES))
    return 0


if __name__ == "__main__":
    sys.exit(main())
