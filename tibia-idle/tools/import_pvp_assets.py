"""import_pvp_assets.py — sprites/flags/patterns dos mapas de guerra PvP.

Varre game/maps/venore_town.otbm e game/maps/ank_open.otbm e, para cada id
de item usado que ainda não existe em game/assets/tiles/<id>.png, renderiza
o sprite do Tibia 8.60. Também completa js/tileflags.js (colisão usada pelo
cliente E pelo servidor) e os patterns posicionais. Mesma convenção de
import_gnomprona_assets.py.

Uso (de tibia-idle/):  python tools/import_pvp_assets.py [--dry]
Fonte: TIBIA860 ou ../refs/tibia860.
"""
import argparse
import json
import os
import subprocess
from pathlib import Path

from import_otbm_sprites import recorte32, extrair_patterns
from tibia_assets_860 import Dat860, Spr860, render_item_860

ROOT = Path(__file__).resolve().parents[1]
GAME = ROOT / "game"
SOURCE = Path(os.environ.get("TIBIA860", ROOT.parent / "refs" / "tibia860"))
MAPS = ["venore_town.otbm", "ank_open.otbm"]

# Os mapas de guerra usam atributos Canary que o parser Python não conhece;
# o leitor do jogo (game/js/otbm.js) é a referência do que é desenhado.
NODE_IDS = r"""
const fs=require("fs"),OTBM=require(process.argv[1]);const out=new Set();
for(const f of process.argv.slice(2)){const m=OTBM.read(fs.readFileSync(f),{z:7});
  for(const c of Object.values(m.cells||{})){if(c.g)out.add(c.g);for(const i of c.items||[])out.add(i);}}
console.log(JSON.stringify([...out]));
"""


def ids_dos_mapas():
    res = subprocess.run(["node", "-e", NODE_IDS, str(GAME / "js" / "otbm.js")] +
                         [str(GAME / "maps" / name) for name in MAPS],
                         capture_output=True, text=True, check=True)
    return {int(cid) for cid in json.loads(res.stdout)}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry", action="store_true", help="só lista o que falta")
    args = parser.parse_args()
    ids = ids_dos_mapas()
    tiles_dir = GAME / "assets" / "tiles"
    missing = sorted(cid for cid in ids if not (tiles_dir / f"{cid}.png").exists())
    flags_path = GAME / "js" / "tileflags.js"
    text = flags_path.read_text(encoding="utf-8")
    prefix, payload = text.split("window.TILEFLAGS = ", 1)
    flags = json.loads(payload.rstrip().rstrip(";"))
    print(f"ids nos mapas: {len(ids)} · sem sprite: {len(missing)} · sem flag: "
          f"{sum(1 for cid in ids if str(cid) not in flags)}")
    if args.dry:
        print("faltando:", missing)
        return
    dat = Dat860(str(SOURCE / "Tibia.dat"))
    spr = Spr860(str(SOURCE / "Tibia.spr"))
    positional, added, empty, added_flags = set(), 0, [], 0
    for cid in sorted(ids):
        obj = dat.item(cid)
        if obj is None:
            raise ValueError(f"Tile sem DAT: {cid}")
        destination = tiles_dir / f"{cid}.png"
        if not destination.exists():
            image = render_item_860(dat, spr, cid)
            if image is None or not image.getbbox():
                empty.append(cid)
            else:
                recorte32(image).save(destination)
                added += 1
        group = obj.groups[0]
        if {"Ground", "GroundBorder", "OnBottom"} & obj.flags and (group.px > 1 or group.py > 1):
            positional.add(cid)
        if str(cid) in flags:
            continue
        walk = int("Ground" in obj.flags and "NotWalkable" not in obj.flags and bool(obj.props.get("speed")))
        block = int("NotWalkable" in obj.flags or ("Ground" in obj.flags and not walk))
        if walk or block:
            flags[str(cid)] = [walk, block] + ([group.width, group.height] if group.width > 1 or group.height > 1 else [])
            added_flags += 1
    flags_path.write_text(prefix + "window.TILEFLAGS = " + json.dumps(flags, separators=(",", ":")) + ";\n", encoding="utf-8")
    print("Patterns:", extrair_patterns(dat, spr, positional))
    print(f"sprites novos: {added} · flags novas: {added_flags} · sem pixels (invisíveis): {empty}")


if __name__ == "__main__":
    main()
