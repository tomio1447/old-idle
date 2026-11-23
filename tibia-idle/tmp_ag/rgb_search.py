import sys, os, pickle
sys.path.insert(0, "tools")
import numpy as np
from PIL import Image
from render_15x_sprites import Sprites15x

s = Sprites15x()
ap = s.appearances
TMP = "tmp_ag"

def render_all(lt, d, addon):
    o = ap.outfit(lt)
    if not o or not o.groups: return None
    g = o.groups[0]
    out = None
    for lay in range(g.layers):
        sid = g.sprite_at(layer=lay, px=d, py=addon, phase=0)
        img = s.sprite(sid)
        if img is None: continue
        if out is None: out = Image.new("RGBA", img.size)
        if img.size != out.size: img = img.resize(out.size)
        out.alpha_composite(img)
    return out

names = ["Fiona_Firstdream","Grendel_Greenlunch","Nigel_Neverguess",
         "Percy_Peacetinker","Yorik_Youngbook"]
gifs = {}
for name in names:
    gif = Image.open(os.path.join(TMP, name + ".gif")); gif.seek(0)
    gifs[name] = np.array(gif.convert("RGBA")).astype(int)

scores = {n: [] for n in names}
for lt in sorted(ap.outfits):
    o = ap.outfit(lt)
    if not o or not o.groups: continue
    g = o.groups[0]
    for addon in range(max(1, g.pattern_height)):
        for d in range(4):
            img = render_all(lt, d, addon)
            if img is None: continue
            a = np.array(img).astype(int)
            if a.shape[:2] != (64, 64): continue
            al = a[:,:,3] > 0
            if not (100 < al.sum() < 4000): continue
            for n, g64 in gifs.items():
                ga = g64[:,:,3] > 0
                un = al | ga
                # erro RGB + penalidade de alpha divergente
                err = np.abs(a[:,:,:3] - g64[:,:,:3])[un].mean()
                err += 60 * np.abs(al.astype(int) - ga.astype(int)).mean()
                scores[n].append((err, lt, addon, d))

for n in names:
    best = sorted(scores[n])[:5]
    print(n, [(f"{e:.1f}", f"lt{l}", f"a{a}", f"d{d}") for e,l,a,d in best])
