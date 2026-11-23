import sys, os, pickle
sys.path.insert(0, "tools")
import numpy as np
from PIL import Image
from tibia_assets import OUTFIT_COLORS, bgr_to_rgb

TMP = "tmp_ag"
cands = pickle.load(open(os.path.join(TMP, "_cands.pkl"), "rb"))
MASKCH = {(255,255,0):0,(255,0,0):1,(0,255,0):2,(0,0,255):3}
PAL = np.array([bgr_to_rgb(OUTFIT_COLORS[i]) for i in range(len(OUTFIT_COLORS))], float)

names = ["Fiona_Firstdream","Grendel_Greenlunch","Nigel_Neverguess",
         "Percy_Peacetinker","Yorik_Youngbook"]
for name in names:
    gif = Image.open(os.path.join(TMP, name + ".gif")); gif.seek(0)
    g64 = np.array(gif.convert("RGBA"))
    ga = g64[:,:,3] > 0
    scored = []
    for lt, ad, ab, mb in cands:
        a = np.frombuffer(ab, dtype=np.uint8).reshape(64,64,4)
        al = a[:,:,3] > 0
        iou = (al & ga).sum() / (al | ga).sum()
        scored.append((iou, lt, ad))
    scored.sort(reverse=True)
    print(f"== {name}: top IoU", [(f"{i:.2f}",l,a) for i,l,a in scored[:5]])
    # solve cores nos 3 melhores
    for iou, lt, ad in scored[:3]:
        for lt2, ad2, ab, mb in cands:
            if lt2 == lt and ad2 == ad:
                a = np.frombuffer(ab, dtype=np.uint8).reshape(64,64,4).astype(float)
                m = np.frombuffer(mb, dtype=np.uint8).reshape(64,64,4) if mb else None
                break
        cols = [0,0,0,0]; err_m = 0
        if m is not None:
            ma = m[:,:,3] > 0
            sel_any = ma & ga & (a[:,:,3]>0)
            for key,ch in MASKCH.items():
                sel = sel_any & (m[:,:,0]==key[0]) & (m[:,:,1]==key[1]) & (m[:,:,2]==key[2])
                if not sel.any(): continue
                ratio = g64[:,:,:3][sel].astype(float)*255/np.maximum(a[:,:,:3][sel],1)
                med = np.median(ratio, axis=0)
                cols[ch] = int(np.argmin(np.linalg.norm(PAL-med, axis=1)))
            exp = a[:,:,:3].copy()
            for key,ch in MASKCH.items():
                s_ = sel_any & (m[:,:,0]==key[0]) & (m[:,:,1]==key[1]) & (m[:,:,2]==key[2])
                exp[s_] = a[:,:,:3][s_]*PAL[cols[ch]]/255
            msel = sel_any
            err_m = np.abs(exp - g64[:,:,:3].astype(int))[msel].mean() if msel.any() else 0
        un = ga & (a[:,:,3]>0) & ~(m[:,:,3]>0 if m is not None else False)
        err_u = np.abs(a[:,:,:3].astype(int)-g64[:,:,:3].astype(int))[un].mean() if un.any() else 999
        print(f"   lt{lt} addon{ad}: iou={iou:.2f} err_un={err_u:.1f} err_mask={err_m:.1f} cols={cols}")
