"""import_buster_spectre_assets.py — assets da hunt Buster Spectre - Darashia.

Publica game/beta-maps/buster_darashia.otbm -> game/maps/ e, para cada id
usado no andar z=7, garante sprite em game/assets/tiles/<id>.png, flag de
colisão em js/tileflags.js (cliente E servidor), patterns posicionais e
nomes oficiais do canary-items.xml em js/tiledata.js. Mesma convenção de
import_pvp_assets.py / import_otbm_sprites.py.

Uso (de tibia-idle/):  python tools/import_buster_spectre_assets.py [--dry]
Fonte: TIBIA860 ou ../refs/tibia860.
"""
import argparse
import json
import os
import re
import shutil
import subprocess
import xml.etree.ElementTree as ET
from pathlib import Path

from import_otbm_sprites import recorte32, extrair_patterns, quadrante_unico
from tibia_assets_860 import Dat860, Spr860, render_item_860

ROOT = Path(__file__).resolve().parents[1]
GAME = ROOT / "game"
SOURCE = Path(os.environ.get("TIBIA860", ROOT.parent / "refs" / "tibia860"))
CANARY_XML = ROOT / "tools" / "data" / "canary-items.xml"
MAP_NAME = "buster_darashia.otbm"

# IDs lidos pelo leitor do jogo (game/js/otbm.js): o parser Python rejeita
# atributos Canary novos — igual aos mapas de guerra PvP.
NODE_IDS = r"""
const fs=require("fs"),OTBM=require(process.argv[1]);const out=new Set();
for(const f of process.argv.slice(2)){const m=OTBM.read(fs.readFileSync(f),{z:7});
  for(const c of Object.values(m.cells||{})){if(c.g)out.add(c.g);for(const i of c.items||[])out.add(i);}}
console.log(JSON.stringify([...out]));
"""


def ids_do_mapa(path):
    res = subprocess.run(["node", "-e", NODE_IDS, str(GAME / "js" / "otbm.js"), str(path)],
                         capture_output=True, text=True, check=True)
    return {int(cid) for cid in json.loads(res.stdout)}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry", action="store_true", help="só lista o que falta")
    parser.add_argument("--publish-map", action="store_true",
                        help="republica o .otbm mesmo quando o publicado diverge da origem")
    args = parser.parse_args()

    source_map = GAME / "beta-maps" / MAP_NAME
    destination_map = GAME / "maps" / MAP_NAME
    if not destination_map.exists():
        shutil.copyfile(source_map, destination_map)
    elif destination_map.read_bytes() != source_map.read_bytes():
        if not args.publish_map:
            raise ValueError(f"Mapa publicado diverge da origem: {MAP_NAME}")
        shutil.copyfile(source_map, destination_map)

    ids = ids_do_mapa(destination_map)
    tiles_dir = GAME / "assets" / "tiles"
    missing = sorted(cid for cid in ids if not (tiles_dir / f"{cid}.png").exists())
    flags_path = GAME / "js" / "tileflags.js"
    text = flags_path.read_text(encoding="utf-8")
    prefix, payload = text.split("window.TILEFLAGS = ", 1)
    flags = json.loads(payload.rstrip().rstrip(";"))
    print(f"ids no mapa: {len(ids)} · sem sprite: {len(missing)} · sem flag: "
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
            print(f"  {cid}: sem entrada no DAT, pulando")
            continue
        destination = tiles_dir / f"{cid}.png"
        if not destination.exists():
            image = render_item_860(dat, spr, cid)
            if image is None or not image.getbbox():
                empty.append(cid)
            else:
                group = obj.groups[0]
                if (image.size[0] > 32 or image.size[1] > 32) and bool(
                        {"Ground", "GroundBorder", "OnBottom"} & obj.flags):
                    quad = quadrante_unico(image)
                    if quad is not None:
                        image = image.crop(quad)
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

    # js/tiledata.js: completa nomes oficiais (canary-items.xml) p/ ids novos
    tiledata_path = GAME / "js" / "tiledata.js"
    corpo = tiledata_path.read_text(encoding="utf-8")
    names = {}
    if CANARY_XML.exists():
        raw = CANARY_XML.read_text(encoding="iso-8859-1")
        for m in re.finditer(r'<item id="(\d+)"[^>]*name="([^"]+)"', raw):
            names.setdefault(int(m.group(1)), m.group(2).strip())
    add = [cid for cid in missing
           if (tiles_dir / f"{cid}.png").exists() and f'"{cid}"' not in corpo]
    if add:
        corpo = corpo.rstrip()
        assert corpo.endswith("};")
        corpo = corpo[:-2] + "\n" + "\n".join(
            '  "%d": {"n": "%s"},' % (cid, names.get(cid, "item %d" % cid).replace('"', '\\"'))
            for cid in add) + "\n};\n"
        tiledata_path.write_text(corpo, encoding="utf-8")
    print(f"tiledata.js: +{len(add)} nomes")

    # rme/data/known_tiles.js: lista de ids com sprite (verificação do editor)
    existentes = sorted(int(n[:-4]) for n in os.listdir(tiles_dir)
                        if n[:-4].isdigit() and n.endswith(".png"))
    kt = ("/* known_tiles.js — GERADO (build_rme_catalog.py /\n"
          " * import_otbm_sprites.py): ids presentes em game/assets/tiles. */\n"
          "window.RME_KNOWN_TILES = " + json.dumps(existentes, separators=(",", ":")) + ";\n")
    (GAME / "rme" / "data" / "known_tiles.js").write_text(kt)
    print(f"rme/data/known_tiles.js: {len(existentes)} ids")
    print(f"sprites novos: {added} · flags novas: {added_flags} · sem pixels (invisíveis): {empty}")


if __name__ == "__main__":
    main()
