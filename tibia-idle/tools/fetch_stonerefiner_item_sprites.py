"""fetch_stonerefiner_item_sprites.py — baixa os sprites oficiais (TibiaWiki/
Tibia Fandom, 32x32) dos itens de loot da Stonerefiner e grava em
game/assets/item/<slug>.png.

Serve para matar os 404 de assets/item/* na Stonerefiner. Os GIFs da wiki
são as sprites reais do client; convertemos para PNG RGBA.

Se um <slug>.png já existir, o item é pulado.

Uso:
    python3 tools/fetch_stonerefiner_item_sprites.py
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
    "rare-earth":           "https://static.wikia.nocookie.net/tibia/images/4/4c/Rare_Earth.gif/revision/latest?cb=20180214075943&path-prefix=en",
    "glob-of-acid-slime":   "https://static.wikia.nocookie.net/tibia/images/7/79/Glob_of_Acid_Slime.gif/revision/latest?cb=20131105225428&path-prefix=en",
    "stonerefiner-s-skull": "https://static.wikia.nocookie.net/tibia/images/9/95/Stonerefiner%27s_Skull.gif/revision/latest?cb=20180214080137&path-prefix=en",
    "poisonous-slime":      "https://static.wikia.nocookie.net/tibia/images/8/84/Poisonous_Slime.gif/revision/latest?cb=20131105230019&path-prefix=en",
    "half-digested-stones": "https://static.wikia.nocookie.net/tibia/images/9/9e/Half-Digested_Stones.gif/revision/latest?cb=20180214080045&path-prefix=en",
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
