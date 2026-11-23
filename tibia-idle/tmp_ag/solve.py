import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))) + "/tools")
from pathlib import Path
from PIL import Image
import numpy as np
from tibia_assets_860 import Dat860, Spr860, render_group_860, OUTFIT_COLORS, bgr_to_rgb

ROOT = Path(__file__).resolve().parent.parent
SRC = Path(os.environ.get("TIBIA860", ROOT.parent / "refs" / "tibia860"))
dat = Dat860(str(SRC / "Tibia.dat"))
spr = Spr860(str(SRC / "Tibia.spr"))

MASK = {(255,255,0):0,(255,0,0):1,(0,255,0):2,(0,0,255):3}  # head,body,legs,feet
TMP = ROOT / "tmp_ag"

def solve(slug, lt, gif_name):
    obj = dat.outfit(lt)
    if obj is None: print(slug,"sem outfit",lt); return
    g = obj.groups[0]
    gif = Image.open(TMP / gif_name).convert("RGBA")
    W,H = g.width*32, g.height*32
    if gif.size != (W,H): gif = gif.resize((W,H), Image.NEAREST)
    gif = np.array(gif)
    best=None
    for addon in range(max(1,g.py)):
        base = np.array(render_group_860(spr,g,frame=0,xp=2%max(1,g.px),yp=addon,layer=0))
        mask = np.array(render_group_860(spr,g,frame=0,xp=2%max(1,g.px),yp=addon,layer=1)) if g.layers>1 else None
        ma = mask[:,:,3]>0 if mask is not None else np.zeros(base.shape[:2],bool)
        both=(base[:,:,3]>0)&(gif[:,:,3]>0)
        un=both&~ma
        err_un = np.abs(base[:,:,:3].astype(int)-gif[:,:,:3].astype(int))[un].mean() if un.any() else 999
        # tambem penaliza addon que mostra sprite onde o gif e transparente e vice-versa
        cov = np.abs((base[:,:,3]>0).astype(int)-(gif[:,:,3]>0).astype(int)).mean()
        cols=[0,0,0,0]
        for key,ch in MASK.items():
            sel=ma&(mask[:,:,0]==key[0])&(mask[:,:,1]==key[1])&(mask[:,:,2]==key[2])&(gif[:,:,3]>0)&(base[:,:,3]>0)
            if not sel.any(): continue
            ratio=(gif[:,:,:3][sel].astype(float)*255/np.maximum(base[:,:,:3][sel].astype(float),1))
            med=np.median(ratio,axis=0)
            d=[np.linalg.norm(np.array(bgr_to_rgb(OUTFIT_COLORS[i]))-med) for i in range(len(OUTFIT_COLORS))]
            cols[ch]=int(np.argmin(d))
        err_m=0
        if mask is not None:
            msel=ma&(gif[:,:,3]>0)&(base[:,:,3]>0)
            if msel.any():
                exp=base[:,:,:3].astype(float).copy()
                for key,ch in MASK.items():
                    s=ma&(mask[:,:,0]==key[0])&(mask[:,:,1]==key[1])&(mask[:,:,2]==key[2])
                    c=np.array(bgr_to_rgb(OUTFIT_COLORS[cols[ch]]),float)
                    exp[s]=base[:,:,:3][s]*c/255
                err_m=np.abs(exp-gif[:,:,:3].astype(int))[msel].mean()
        score=err_un+err_m+cov*200
        if best is None or score<best[0]: best=(score,addon,cols,err_un,err_m,cov)
    print(f"{slug} lt{lt}: addon={best[1]} colors(h,b,l,f)={best[2]} err_un={best[3]:.1f} err_mask={best[4]:.1f} cov={best[5]:.2f}")

solve("yorik-youngbook",    268,  "Yorik_Youngbook.gif")
solve("percy-peacetinker",  137,  "Percy_Peacetinker.gif")
solve("grendel-greenlunch", 144,  "Grendel_Greenlunch.gif")
solve("fiona-firstdream",   1681, "Fiona_Firstdream.gif")
solve("nigel-neverguess",   1837, "Nigel_Neverguess.gif")
