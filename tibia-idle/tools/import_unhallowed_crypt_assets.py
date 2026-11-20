"""import_unhallowed_crypt_assets.py — assets da Unhallowed Crypt (400+).

Publica game/beta-maps/Unhallowed_Crypt.otbm -> game/maps/unhallowed_crypt.otbm
e, para cada id usado no andar z=7, garante sprite em game/assets/tiles/<id>.png,
flag de colisão em js/tileflags.js (cliente E servidor), patterns posicionais e
nomes oficiais do canary-items.xml em js/tiledata.js. Também renderiza os ícones
32x32 dos itens de loot novos para game/assets/item/<slug>.png e os sheets
9x4 (64x64) dos 3 looktypes 15.20 para game/assets/mob/<slug>.png.

Uso (de tibia-idle/):  python tools/import_unhallowed_crypt_assets.py [--dry]
Fonte: TIBIA860 ou ../refs/tibia860.
"""
import argparse
import json
import os
import re
import shutil
import subprocess
from pathlib import Path

from PIL import Image

from import_otbm_sprites import recorte32, extrair_patterns, quadrante_unico
from tibia_assets_860 import Dat860, Spr860, render_item_860, render_group_860

ROOT = Path(__file__).resolve().parents[1]
GAME = ROOT / "game"
SOURCE = Path(os.environ.get("TIBIA860", ROOT.parent / "refs" / "tibia860"))
CANARY_XML = ROOT / "tools" / "data" / "canary-items.xml"
SOURCE_MAP = GAME / "beta-maps" / "Unhallowed_Crypt.otbm"
DEST_MAP = GAME / "maps" / "unhallowed_crypt.otbm"

# Itens de loot novos (cids oficiais, update 15.20).
LOOT_ITEMS = {
    "amber": 32626,
    "necromantic-core": 52705,
    "toe-nails": 52706,
    "giant-tusk": 52707,
    "fetid-heart": 52708,
    "crystallized-death": 52719,
    "cluster-of-crystallized-death": 52720,
}

# Looktypes oficiais 15.20 (TibiaWiki): Crypt Fiend 1885, Crypt Construct
# 1887, Creepy Crawler 1890.
MOBS = {
    "crypt-fiend": 1885,
    "crypt-construct": 1887,
    "creepy-crawler": 1890,
}

# IDs lidos pelo leitor do jogo (game/js/otbm.js): o parser Python rejeita
# atributos Canary novos — igual aos outros mapas.
NODE_IDS = r"""
const fs=require("fs"),OTBM=require(process.argv[1]);const out=new Set();
for(const f of process.argv.slice(2)){const b=fs.readFileSync(f);
  const m=OTBM.read(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),{z:7});
  for(const c of Object.values(m.cells||{})){if(c.g)out.add(c.g);for(const i of c.items||[])out.add(i);}}
console.log(JSON.stringify([...out]));
"""

DIRS = (("n", 0), ("e", 1), ("s", 2), ("w", 3))
MAX_PASSOS = 12


def ids_do_mapa(path):
    res = subprocess.run(["node", "-e", NODE_IDS, str(GAME / "js" / "otbm.js"), str(path)],
                         capture_output=True, text=True, check=True)
    return {int(cid) for cid in json.loads(res.stdout)}


def quadros_da_criatura(spr, obj):
    """Todos os quadros (direção x pose) sem recortar — mesmo modelo do
    extract_monster_sprites.py: coluna 0 = idle, 1..n = passos."""
    g_idle = obj.groups[0]
    g_walk = obj.groups[1] if len(obj.groups) > 1 else obj.groups[0]
    out = {}
    for tag, xp in DIRS:
        img = render_group_860(spr, g_idle, frame=0,
                               xp=xp % max(1, g_idle.px), yp=0, layer=0)
        if img is not None:
            out[(tag, 0)] = img
        for i in range(min(MAX_PASSOS, max(1, g_walk.anim))):
            fr = render_group_860(spr, g_walk, frame=i,
                                  xp=xp % max(1, g_walk.px), yp=0, layer=0)
            if fr is not None:
                out[(tag, i + 1)] = fr
    return out


def caixa_comum(quadros):
    x0 = y0 = 10 ** 6
    x1 = y1 = 0
    achou = False
    for img in quadros.values():
        b = img.getbbox()
        if not b:
            continue
        achou = True
        x0 = min(x0, b[0]); y0 = min(y0, b[1])
        x1 = max(x1, b[2]); y1 = max(y1, b[3])
    return (x0, y0, x1, y1) if achou else None


def render_mob_sheet(spr, obj, slug, dest_dir):
    """Sheet cols×4 alinhado: recorte comum a todas as direções/frames.
    Devolve ({cw, ch, cols, rows}, âncora CREATURE_ANCHORS) ou (None, None).

    A âncora preserva onde o recorte comum ficava no canvas original do
    DAT (sw/sh = canvas, ox/oy = origem do recorte) — sem ela o renderer
    desloca a criatura do SQM lógico."""
    quadros = quadros_da_criatura(spr, obj)
    box = caixa_comum(quadros)
    if box is None:
        return None, None
    sw = max(img.width for img in quadros.values())
    sh = max(img.height for img in quadros.values())
    anchor = {"sw": sw, "sh": sh, "ox": box[0], "oy": box[1]}
    imgs = {}
    cw = ch = 0
    for k, img in quadros.items():
        crop = img.crop(box)
        if crop.getbbox() is None:
            continue
        imgs[k] = crop
        cw = max(cw, crop.width)
        ch = max(ch, crop.height)
    if not cw or not ch or not imgs:
        return None, None
    cols = max(k[1] for k in imgs) + 1
    sheet = Image.new("RGBA", (cw * cols, ch * 4), (0, 0, 0, 0))
    for li, (d, _) in enumerate(DIRS):
        for col in range(cols):
            im = imgs.get((d, col)) or imgs.get((d, 0))
            if im is None:
                continue
            sheet.paste(im, (col * cw, li * ch))
    sheet.save(dest_dir / f"{slug}.png", optimize=True)
    return {"cw": cw, "ch": ch, "cols": cols, "rows": 4}, anchor


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry", action="store_true", help="só lista o que falta")
    parser.add_argument("--publish-map", action="store_true",
                        help="republica o .otbm mesmo quando o publicado diverge da origem")
    args = parser.parse_args()

    if not DEST_MAP.exists():
        shutil.copyfile(SOURCE_MAP, DEST_MAP)
    elif DEST_MAP.read_bytes() != SOURCE_MAP.read_bytes():
        if not args.publish_map:
            raise ValueError(f"Mapa publicado diverge da origem: {DEST_MAP.name}")
        shutil.copyfile(SOURCE_MAP, DEST_MAP)

    ids = ids_do_mapa(DEST_MAP)
    tiles_dir = GAME / "assets" / "tiles"
    missing = sorted(cid for cid in ids if not (tiles_dir / f"{cid}.png").exists())
    flags_path = GAME / "js" / "tileflags.js"
    text = flags_path.read_text(encoding="utf-8")
    prefix, payload = text.split("window.TILEFLAGS = ", 1)
    flags = json.loads(payload.rstrip().rstrip(";"))
    missing_items = [s for s in LOOT_ITEMS
                     if not (GAME / "assets" / "item" / f"{s}.png").exists()]
    missing_mobs = [s for s in MOBS
                    if not (GAME / "assets" / "mob" / f"{s}.png").exists()]
    print(f"ids no mapa: {len(ids)} · sem sprite: {len(missing)} · sem flag: "
          f"{sum(1 for cid in ids if str(cid) not in flags)} · "
          f"loot sem ícone: {missing_items} · mobs sem sheet: {missing_mobs}")
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

    # Ícones 32x32 dos itens de loot novos.
    item_dir = GAME / "assets" / "item"
    for slug, cid in LOOT_ITEMS.items():
        dest = item_dir / f"{slug}.png"
        if dest.exists():
            continue
        image = render_item_860(dat, spr, cid)
        if image is None or not image.getbbox() or image.size != (32, 32):
            raise ValueError(f"Loot icon inválido: {slug} ({cid})")
        image.save(dest)
        print(f"  item {slug} ({cid}) -> assets/item/{slug}.png")

    # Sheets dos 3 monstros (looktypes 15.20 do DAT convertido).
    mob_dir = GAME / "assets" / "mob"
    meta_nova = {}
    anchors_novos = {}
    for slug, looktype in MOBS.items():
        obj = dat.outfit(looktype)
        if obj is None or not obj.groups:
            raise ValueError(f"looktype {looktype} ({slug}) sem arte no DAT")
        meta, anchor = render_mob_sheet(spr, obj, slug, mob_dir)
        if meta is None:
            raise ValueError(f"sheet vazio: {slug} (looktype {looktype})")
        meta_nova[slug] = meta
        anchors_novos[slug] = anchor
        print(f"  mob {slug} (looktype {looktype}) -> {meta['cols']}x4 de {meta['cw']}x{meta['ch']} · âncora {anchor['ox']},{anchor['oy']} em {anchor['sw']}x{anchor['sh']}")

    # js/mobsheetdata.js: mescla as entradas novas sem regerar o arquivo.
    ms_path = GAME / "js" / "mobsheetdata.js"
    ms_text = ms_path.read_text(encoding="utf-8")
    ms_prefix, ms_payload = ms_text.split("window.MOBSHEETS = ", 1)
    meta_all = json.loads(ms_payload.rstrip().rstrip(";"))
    meta_all.update(meta_nova)
    ms_path.write_text(
        ms_prefix + "window.MOBSHEETS = " +
        json.dumps(meta_all, separators=(", ", ": ")) + ";\n",
        encoding="utf-8")
    print(f"mobsheetdata.js: +{len(meta_nova)} criaturas")

    # js/creatureanchordata.js: mescla as âncoras dos novos mobs.
    ca_path = GAME / "js" / "creatureanchordata.js"
    ca_text = ca_path.read_text(encoding="utf-8")
    ca_prefix, ca_payload = ca_text.split("window.CREATURE_ANCHORS = ", 1)
    anchors_all = json.loads(ca_payload.rstrip().rstrip(";"))
    anchors_all.update(anchors_novos)
    ca_path.write_text(
        ca_prefix + "window.CREATURE_ANCHORS = " +
        json.dumps(anchors_all, separators=(",", ":")) + ";\n",
        encoding="utf-8")
    print(f"creatureanchordata.js: +{len(anchors_novos)} âncoras")

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
