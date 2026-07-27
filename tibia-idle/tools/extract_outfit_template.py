"""
Extrai as outfits jogaveis em formato TEMPLATE para permitir troca de cores
no navegador (Change Outfit).

Para cada outfit sao gerados dois PNGs por direcao/frame:
  <nome>_<dir>.png       -> sprite base, em tons neutros (sem cor "assada")
  <nome>_<dir>.mask.png  -> mascara com as areas head/body/legs/feet

A mascara usa as cores puras do proprio Tibia:
  amarelo (255,255,0) = head    vermelho (255,0,0) = body
  verde   (0,255,0)   = legs    azul     (0,0,255) = feet

O cliente multiplica base x cor escolhida usando a mascara, exatamente como
compose_outfit() faz aqui no Python.
"""
import os
from PIL import Image
from render import load, render_group

OUT = os.path.join(os.path.dirname(__file__), "..", "game", "assets", "outfit")
os.makedirs(OUT, exist_ok=True)
dat, spr = load()

# looktypes das outfits jogaveis (mesmos de extract_people.py)
PLAYER = {
    "knight-m": 131, "knight-f": 139,
    "hunter-m": 129, "hunter-f": 137,
    "summoner-m": 133, "summoner-f": 138,
    "mage-m": 130, "mage-f": 141,
    "citizen-m": 128, "citizen-f": 136,
}

DIRS = (("s", 2), ("w", 3), ("n", 0), ("e", 1))


def build(looktype):
    """Retorna {chave: (base, mask)} para todas as direcoes/frames."""
    obj = dat.outfit(looktype)
    if obj is None or not obj.groups:
        return {}
    g = obj.groups[0]
    out = {}
    for tag, direction in DIRS:
        xp = direction % max(1, g.px)
        for f in range(g.anim):
            base = render_group(spr, g, frame=f, xp=xp, yp=0, layer=0)
            if base is None or not base.getbbox():
                continue
            mask = None
            if g.layers > 1:
                mask = render_group(spr, g, frame=f, xp=xp, yp=0, layer=1)
            # recorta os dois com a MESMA bbox para manterem o alinhamento
            box = base.getbbox()
            base_c = base.crop(box)
            mask_c = mask.crop(box) if mask is not None else None
            key = tag if f == 0 else "%s%d" % (tag, f)
            out[key] = (base_c, mask_c)
    return out


count = 0
for name, lt in PLAYER.items():
    frames = build(lt)
    if not frames:
        print("  ! sem frames:", name)
        continue
    for key, (base, mask) in frames.items():
        base.save("%s/%s_%s.base.png" % (OUT, name, key))
        count += 1
        if mask is not None:
            mask.save("%s/%s_%s.mask.png" % (OUT, name, key))
            count += 1
    print("  %-12s %2d direcoes/frames  (layers=%s)" % (
        name, len(frames), "sim" if frames[list(frames)[0]][1] is not None else "nao"))

print("\n%d arquivos gerados em %s" % (count, os.path.normpath(OUT)))
