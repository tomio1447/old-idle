import sys, os, pickle
sys.path.insert(0, "tools")
import numpy as np
from PIL import Image
from render_15x_sprites import Sprites15x

s = Sprites15x()
ap = s.appearances
TMP = "tmp_ag"

def render(lt, d, addon, layer=0):
    o = ap.outfit(lt)
    if not o or not o.groups: return None
    g = o.groups[0]
    if layer >= g.layers: return None
    sid = g.sprite_at(layer=layer, px=d, py=addon, phase=0)
    img = s.sprite(sid)
    return img

names = ["Fiona_Firstdream","Grendel_Greenlunch","Nigel_Neverguess",
         "Percy_Peacetinker","Yorik_Youngbook"]
# pre-render: (lt,addon,dir) -> alpha
alphas = []
for lt in sorted(ap.outfits):
    o = ap.outfit(lt)
    if not o or not o.groups: continue
    g = o.groups[0]
    for addon in range(max(1,g.pattern_height)):
        for d in range(4):
            img = render(lt,d,addon)
            if img is None: continue
            a = np.array(img)
            if a.shape[:2] != (64,64): continue
            al = a[:,:,3] > 0
            if 100 < al.sum() < 4000:
                alphas.append((lt,addon,d,al))
print("renders:", len(alphas))
for name in names:
    gif = Image.open(os.path.join(TMP, name+".gif")); gif.seek(0)
    ga = np.array(gif.convert("RGBA"))[:,:,3] > 0
    best = sorted((((al&ga).sum()/(al|ga).sum(),lt,ad,d) for lt,ad,d,al in alphas), reverse=True)[:6]
    print(name, [(f"{i:.2f}",f"lt{l}",f"a{a}",f"d{d}") for i,l,a,d in best])
