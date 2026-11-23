import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "tools"))
from render_15x_sprites import Sprites15x
import numpy as np
from PIL import Image

s = Sprites15x()
ap = s.appearances
TMP = os.path.join(os.path.dirname(os.path.abspath(__file__)))

def gif_arr(name):
    g = Image.open(os.path.join(TMP, name + ".gif")); g.seek(0)
    a = np.array(g.convert("RGBA"))
    return a

def out_arr(lt, d, addon, layer):
    img = s.render_outfit(lt, direction=d, addon=addon if False else 0, layer=layer) \
        if False else None
    return img

def render(lt, d, addon, layer=-1):
    o = ap.outfit(lt)
    if not o or not o.groups: return None
    g = o.groups[0]
    layers = range(g.layers) if layer < 0 else [min(layer, g.layers-1)]
    out = None
    for lay in layers:
        sid = g.sprite_at(layer=lay, px=d, py=addon, phase=0)
        img = s.sprite(sid)
        if img is None: continue
        if out is None: out = Image.new("RGBA", img.size)
        if img.size != out.size: img = img.resize(out.size)
        out.alpha_composite(img)
    return out

results = {}
for lt in sorted(ap.outfits):
    o = ap.outfit(lt)
    if not o or not o.groups: continue
    g = o.groups[0]
    for addon in range(max(1, g.pattern_height)):
        base = render(lt, 2, addon, layer=0)
        if base is None: continue
        a = np.array(base)
        if a.shape[0] != 64 or a.shape[1] != 64: continue
        alpha = a[:,:,3] > 0
        if alpha.sum() < 100: continue
        mask = render(lt, 2, addon, layer=1) if g.layers >= 2 else None
        results.setdefault("all", []).append((lt, addon, a, np.array(mask) if mask is not None else None))

print("candidates rendered:", len(results["all"]))
np.save(os.path.join(TMP, "_skip.npy"), np.array([1]))

import pickle
with open(os.path.join(TMP, "_cands.pkl"), "wb") as f:
    pickle.dump([(lt, ad, a.tobytes(), (m.tobytes() if m is not None else None)) for lt, ad, a, m in results["all"]], f)
