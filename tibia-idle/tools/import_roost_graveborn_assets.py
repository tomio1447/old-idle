#!/usr/bin/env python3
"""import_roost_graveborn_assets.py — The Roost of the Graveborn Quest (15.20).

Publica os 5 bossrooms OTBM em game/maps/, importa sprites/flags/patterns dos
tiles que faltam, renderiza os ícones 32x32 das 5 crypt runes + 7 armas crypt,
gera os sheets 9x4 dos 3 bosses com looktype real (eldritch-dl 1879,
gravedigger 1880, ice-horror 1881), os sheets estáticos dos 2 bosses
lookItem (adventurer-group 52836, bonelords-phylactery 52831) e o retrato do
NPC Dragon Ancestor Spirit (looktype 1899 — dragão espírito sombrio).

Uso:  python tools/import_roost_graveborn_assets.py [--dry] [--publish-map]
Fonte: TIBIA860 ou ../refs/tibia860.
"""
import argparse, json, os, re, shutil, subprocess, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
GAME = ROOT / "game"
sys.path.insert(0, str(ROOT / "tools"))
from import_otbm_sprites import recorte32, extrair_patterns, quadrante_unico
from tibia_assets_860 import Dat860, Spr860, render_item_860, render_group_860
from import_unhallowed_crypt_assets import (DIRS, quadros_da_criatura,
    caixa_comum, render_mob_sheet)
from PIL import Image

CANARY_XML = ROOT / "tools" / "data" / "canary-items.xml"
SOURCE = Path(os.environ.get("TIBIA860", ROOT.parent / "refs" / "tibia860"))

# (beta-maps, nome publicado). first_dragon/ice_horror na raiz de beta-maps,
# os outros três em bossesroom/.
MAPS = [
    ("first_dragon.otbm", "first_dragon.otbm"),
    ("ice_horror.otbm", "ice_horror.otbm"),
    ("bossesroom/eldritch_dl.otbm", "eldritch_dl.otbm"),
    ("bossesroom/gravedigger.otbm", "gravedigger.otbm"),
    ("bossesroom/bonelords_phylactery.otbm", "bonelords_phylactery.otbm"),
    # Court Warlock — Order of the Stag Quest (15.20).
    ("bossesroom/court_room.otbm", "court_room.otbm"),
    # Stag Bastion — hunt 400+ dos Raubritters (15.20).
    ("bossesroom/stag_bastion.otbm", "stag_bastion.otbm"),
    # Arean Outskirts — hunt 400+ mista (Raubritters + Night Harpy).
    ("bossesroom/Arean Outskirts.otbm", "arean_outskirts.otbm"),
]

# 7 armas Crypt + 5 Crypt Runes (cids oficiais update 15.20, tibia.gg).
ITEM_ICONS = {
    "crypt-spine": 52332, "crypt-splitter": 52333, "crypt-breaker": 52334,
    "crypt-strike": 52335, "crypt-bile": 52336, "crypt-jaw": 52337,
    "crypt-slicer": 52338,
    "fiery-crypt-rune": 52657, "icy-crypt-rune": 52658,
    "deathly-crypt-rune": 52659, "ancient-crypt-rune": 52660,
    "necromantic-crypt-rune": 52661,
    # Creature products / loot novo (cids do wikitext oficial Fandom).
    "dragon-tongue": 24938, "golden-claw": 52711, "shrunken-head": 52712,
    "ancient-scales": 52713, "soul-trap": 52714, "skull-tendril": 52715,
    "bone-spikes": 52717, "icy-scales": 52726, "icy-horns": 52727,
    "frozen-crapace": 52728, "worn-guide-book": 52710,
    # Court Warlock — Stag Set completo + Twisted Marionette (cids
    # oficiais do wikitext Fandom; Stag = equipamentos "Negotiable"
    # sem comprador NPC → sell 0).
    "stag-helmet": 52348, "stag-robe": 52349, "stag-plate": 52350,
    "stag-legs": 52351, "stag-shinguards": 52352, "stag-boots": 52353,
    "stag-footwraps": 52354, "stag-spellbook": 52355,
    "stag-scrolls": 52356, "stag-shield": 52357,
    "twisted-marionette": 52746,
    # Stag Bastion — creature products/loot dos Raubritters de hunt
    # (cids oficiais do wikitext Fandom).
    "stag-parchment": 52664, "silver-poniard": 52662,
    "cuirass-plate": 52663, "bottle-of-raubritter-lager": 52745,
    "marinated-sturgeon": 52638, "crystalline-arrow": 15793,
    "ring-of-green-plasma": 23531, "ring-of-orange-plasma": 50150,
    # Arean Outskirts — Night Harpy Feathers (cid oficial).
    "night-harpy-feathers": 52633,
    # Order of the Stag — Mariner's Compass (cid oficial, extra slot).
    "mariners-compass-from-the-antoinette": 52759,
}

# Bosses com looktype real (2 grupos: idle + walk, 4 dirs x 8 fases).
MOBS_LOOKTYPE = {
    "eldritch-dragon-lord": 1879,
    "the-gravedigger": 1880,
    "ice-horror": 1881,
    # Adventurer Group — 5 membros: looktypes OFICIAIS do staticdata
    # do client 15.20 (race→outfit: yorik 2712→268, percy 2713→137,
    # grendel 2714→144, fiona 2715→1681, nigel 2716→1837).
    "nigel-neverguess": 1837,
    "fiona-firstdream": 1681,
    "percy-peacetinker": 137,
    "grendel-greenlunch": 144,
    "yorik-youngbook": 268,
    # Avatares das vocações (outfits oficiais como looktype de criatura).
    "avatar-of-steel": 1593,
    "avatar-of-light": 1594,
    "avatar-of-storm": 1595,
    "avatar-of-nature": 1596,
    "avatar-of-balance": 1823,
    # Bright Crystal — objeto hostil estático (sprite 4x1 do lote 15.20).
    "bright-crystal": 1902,
    # Bone Overlord — summons (looktypes estimados do lote livre 15.20;
    # 1883 = dragão espectral, 1884/1886/1904/1905 = bestas espectrais;
    # 1903 é o looktype OFICIAL do Court Warlock — não usar nos summons).
    "enthralled-dragon": 1883,
    "myzareths-spirit": 1886,
    "zharvorins-spirit": 1884,
    "elyraxs-spirit": 1904,
    "scariths-spirit": 1905,
    # Court Warlock — looktype OFICIAL 1903 (staticdata do client 15.20,
    # race 2741→outfit 1903). Raubritters não são bestiário → looktypes
    # estimados do lote livre 15.20 (cavaleiros/magos espectrais).
    "court-warlock": 1903,
    # Raubritters: cavaleiros/espectros do lote livre 15.20 (1893/91/92
    # são outfits VAZIOS no DAT — verificado). Enraivecidos: formas
    # distintas estimadas.
    "poisoned-raubritter": 1895,
    "frozen-raubritter": 1890,
    "raging-raubritter": 1910,
    "energised-raubritter": 1909,
    "enraged-poisoned-raubritter": 1888,
    "enraged-frozen-raubritter": 1885,
    "enraged-raging-raubritter": 1919,
    "enraged-energised-raubritter": 1882,
    # Stag Bastion — Raubritters de hunt (bestiário existe mas sem
    # looktype público → estimados do lote livre 15.20).
    "raubritter-skirmisher": 1908,
    "raubritter-chastener": 1920,
    "raubritter-marksman": 1889,
    # Arean Outskirts — Night Harpy (ave negra do lote livre — estimado).
    "night-harpy": 1901,
}

# Bosses "lookItem": a entidade oficial aparece como objeto (cid). O sheet
# repete o frame do item nas 9 colunas x 4 linhas (estático).
MOBS_LOOKITEM = {
    "adventurer-group": 52836,   # relíquia/troféu do grupo
    "bonelords-phylactery": 52831,  # face do Bone Overlord (pinata oficial)
    # Vulcões do Eldritch Dragon Lord — objectIDs oficiais do wikitext
    # (Eruption 51952, Flame Totem 51953); Pulsating Lava sem objectID
    # público → lava vent clássico 391 (aproximação documentada).
    "pulsating-lava": 391,
    "eruption": 51952,
    "flame-totem": 51953,
    # The Gravedigger — Bonelord Totem (objectID oficial 51192 do wikitext;
    # invocável x2, todos os dmg mods 0% → hazard invulnerável).
    "bonelord-totem": 51192,
    # Bone Overlord — objectIDs oficiais do wikitext: soulcages 52546
    # (as 4 usam o mesmo objeto), bone-barrier 6972, wraithfire 52441.
    # An Eye sem objectID público → bonelord-eye 5898 (aproximação).
    "zharvorins-soulcage": 52546,
    "myzareths-soulcage": 52546,
    "scariths-soulcage": 52546,
    "elyraxs-soulcage": 52546,
    "an-eye": 5898,
    "bone-barrier": 6972,
    "wraithfire": 52441,
}

# NPC Dragon Ancestor Spirit — dragão espírito (looktype 1899).
NPC_PORTRAIT = ("dragon-ancestor-spirit", 1899)


def ids_do_mapa(path):
    script = (
        "const fs=require('fs'),OTBM=require(process.argv[1]);"
        "const b=fs.readFileSync(process.argv[2]);"
        "const m=OTBM.read(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));"
        "const out=new Set();"
        "for(const c of Object.values(m.cells||{})){if(c.g)out.add(c.g);"
        "for(const i of c.items||[])out.add(i);}"
        "console.log(JSON.stringify([...out]));")
    res = subprocess.run(
        ["node", "-e", script, str(GAME / "js" / "otbm.js"), str(path)],
        capture_output=True, text=True, check=True)
    return {int(cid) for cid in json.loads(res.stdout)}


def render_static_sheet(image, slug, dest_dir):
    """Sheet 9x4 idêntico em todas as células para boss lookItem (objeto)."""
    cw = ch = 64
    cell = image.crop(image.getbbox()).resize(
        (min(image.width, cw), min(image.height, ch))) if image.getbbox() else image
    frame = Image.new("RGBA", (cw, ch), (0, 0, 0, 0))
    frame.paste(cell, ((cw - cell.width) // 2, (ch - cell.height) // 2))
    sheet = Image.new("RGBA", (cw * 9, ch * 4), (0, 0, 0, 0))
    for r in range(4):
        for c in range(9):
            sheet.paste(frame, (c * cw, r * ch))
    sheet.save(dest_dir / f"{slug}.png", optimize=True)
    return {"cw": cw, "ch": ch, "cols": 9, "rows": 4}, {"sw": cw, "sh": ch, "ox": 0, "oy": 0}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry", action="store_true")
    parser.add_argument("--publish-map", action="store_true")
    args = parser.parse_args()

    # 1) publica os OTBM
    all_ids = set()
    for rel, dest_name in MAPS:
        src = GAME / "beta-maps" / rel
        dest = GAME / "maps" / dest_name
        if not dest.exists():
            shutil.copyfile(src, dest)
        elif dest.read_bytes() != src.read_bytes():
            if not args.publish_map:
                raise ValueError(f"Mapa publicado diverge da origem: {dest_name}")
            shutil.copyfile(src, dest)
        ids = ids_do_mapa(dest)
        print(f"  mapa {dest_name}: {len(ids)} ids")
        all_ids |= ids

    tiles_dir = GAME / "assets" / "tiles"
    missing = sorted(cid for cid in all_ids if not (tiles_dir / f"{cid}.png").exists())
    flags_path = GAME / "js" / "tileflags.js"
    prefix, payload = flags_path.read_text(encoding="utf-8").split("window.TILEFLAGS = ", 1)
    flags = json.loads(payload.rstrip().rstrip(";"))
    missing_icons = [s for s in ITEM_ICONS
                     if not (GAME / "assets" / "item" / f"{s}.png").exists()]
    missing_mobs = [s for s in list(MOBS_LOOKTYPE) + list(MOBS_LOOKITEM)
                    if not (GAME / "assets" / "mob" / f"{s}.png").exists()]
    print(f"ids nos 5 mapas: {len(all_ids)} · sem sprite: {len(missing)} · "
          f"sem flag: {sum(1 for c in all_ids if str(c) not in flags)} · "
          f"ícones faltando: {missing_icons} · mobs faltando: {missing_mobs}")
    if args.dry:
        print("faltando:", missing)
        return

    dat = Dat860(str(SOURCE / "Tibia.dat"))
    spr = Spr860(str(SOURCE / "Tibia.spr"))
    positional, added, empty, added_flags = set(), 0, [], 0
    for cid in sorted(all_ids):
        obj = dat.item(cid)
        if obj is None:
            continue
        destination = tiles_dir / f"{cid}.png"
        if not destination.exists():
            image = render_item_860(dat, spr, cid)
            if image is None or not image.getbbox():
                empty.append(cid)
                # IgnoreLook/marcador invisível — PNG transparente (padrão
                # do tile 372) para o catálogo cobrir o id.
                Image.new("RGBA", (32, 32), (0, 0, 0, 0)).save(destination)
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

    # 2) ícones de item
    item_dir = GAME / "assets" / "item"
    for slug, cid in ITEM_ICONS.items():
        dest = item_dir / f"{slug}.png"
        if dest.exists():
            continue
        image = render_item_860(dat, spr, cid)
        if image is None or not image.getbbox():
            raise ValueError(f"Ícone inválido: {slug} ({cid})")
        image.save(dest)
        print(f"  item {slug} ({cid}) -> assets/item/{slug}.png")

    # 3) sheets dos bosses
    mob_dir = GAME / "assets" / "mob"
    meta_nova, anchors_novos = {}, {}
    for slug, looktype in MOBS_LOOKTYPE.items():
        if (mob_dir / f"{slug}.png").exists():
            continue
        obj = dat.outfit(looktype)
        if obj is None or not obj.groups:
            raise ValueError(f"looktype {looktype} ({slug}) sem arte no DAT")
        meta, anchor = render_mob_sheet(spr, obj, slug, mob_dir)
        if meta is None:
            raise ValueError(f"sheet vazio: {slug}")
        meta_nova[slug] = meta
        anchors_novos[slug] = anchor
        print(f"  mob {slug} (lt {looktype}) -> {meta['cols']}x4 {meta['cw']}x{meta['ch']}")
    for slug, cid in MOBS_LOOKITEM.items():
        if (mob_dir / f"{slug}.png").exists():
            continue
        image = render_item_860(dat, spr, cid)
        if image is None or not image.getbbox():
            raise ValueError(f"lookItem {cid} ({slug}) sem arte")
        meta, anchor = render_static_sheet(image, slug, mob_dir)
        meta_nova[slug] = meta
        anchors_novos[slug] = anchor
        print(f"  mob {slug} (lookItem {cid}) -> sheet estático 9x4")

    # 4) retrato do NPC (frame idle sul do looktype)
    npc_dir = GAME / "assets" / "npc"
    npc_dir.mkdir(exist_ok=True)
    slug_npc, lt = NPC_PORTRAIT
    npc_png = npc_dir / f"{slug_npc}_s.png"
    if not npc_png.exists():
        obj = dat.outfit(lt)
        img = render_group_860(spr, obj.groups[0], frame=0, xp=0, yp=0, layer=0)
        if img is None or not img.getbbox():
            raise ValueError("NPC looktype sem arte")
        img = img.crop(img.getbbox())
        img.save(npc_png)
        print(f"  npc {slug_npc} (lt {lt}) -> assets/npc/{slug_npc}_s.png")

    # 5) mobsheetdata.js + creatureanchordata.js
    if meta_nova:
        ms_path = GAME / "js" / "mobsheetdata.js"
        ms_text = ms_path.read_text(encoding="utf-8")
        ms_prefix, ms_payload = ms_text.split("window.MOBSHEETS = ", 1)
        meta_all = json.loads(ms_payload.rstrip().rstrip(";"))
        meta_all.update(meta_nova)
        ms_path.write_text(ms_prefix + "window.MOBSHEETS = " +
            json.dumps(meta_all, separators=(",", ":")) + ";\n", encoding="utf-8")
        an_path = GAME / "js" / "creatureanchordata.js"
        an_text = an_path.read_text(encoding="utf-8")
        an_prefix, an_payload = an_text.split("window.CREATURE_ANCHORS = ", 1)
        an_all = json.loads(an_payload.rstrip().rstrip(";"))
        an_all.update(anchors_novos)
        an_path.write_text(an_prefix + "window.CREATURE_ANCHORS = " +
            json.dumps(an_all, separators=(",", ":")) + ";\n", encoding="utf-8")
        print(f"  mobsheets+anchors: +{len(meta_nova)}")

    # 6) tiledata nomes + known_tiles
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
    existentes = sorted(int(n[:-4]) for n in os.listdir(tiles_dir)
                        if n[:-4].isdigit() and n.endswith(".png"))
    kt = ("/* known_tiles.js — GERADO: ids presentes em game/assets/tiles. */\n"
          "window.RME_KNOWN_TILES = " + json.dumps(existentes, separators=(",", ":")) + ";\n")
    (GAME / "rme" / "data" / "known_tiles.js").write_text(kt)
    print(f"sprites novos: {added} · flags novas: {added_flags} · invisíveis: {empty}")


if __name__ == "__main__":
    main()
