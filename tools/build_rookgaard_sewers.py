#!/usr/bin/env python3
"""
build_rookgaard_sewers.py — Gera o mapa Rookgaard Sewers (.otbm) para o tibia-idle.

Layout inspirado no esgoto clássico de Rookgaard (Tibia global):
- Entrada com escada (ladder)
- Corredores de pedra com lama
- Salas com rats, cave rats, spiders e poison spiders
- Água de esgoto bloqueando passagem
- Decorações: ralos, teias de aranha, ovos, ossadas, cogumelos, tochas

O mapa é gerado no formato OTBM v2 (compatível com o editor RME do projeto).
"""

import struct
import json
import os

# ============================================================
# Tile IDs do DAT 8.60 (extraídos do catalog.js)
# ============================================================
# Ground
VOID      = 100   # void (blocking ground)
EARTH     = 101   # earth (blocking ground — cave wall)
DIRT      = 103   # dirt (walkable ground)
SAND      = 104   # sand
GRASS     = 106   # grass
EARTH_GND = 280   # earth ground (walkable)
DIRT_FLOOR = 386  # dirt floor
STONE_FLOOR = 416 # stone floor
TILED_FLOOR = 417 # tiled floor
STONE_FLOOR2 = 418 # stone floor (variant)
STONE_TILE = 421  # stone tile
STONE_TILE2 = 429 # stone tile (variant)
SEWER_GRATE = 435 # sewer grate (non-walkable deco)
STONE_FLOOR3 = 436 # stone floor
STONE_FLOORING = 481 # stone flooring
CARVED_STONE = 516 # carved stone tile
STONE_FLOOR4 = 562 # stone floor
STONE_PILE = 593  # stone pile (walkable ground)
LOOSE_STONE = 606 # loose stone pile
WATER     = 622   # water (blocking ground)
DIRT_FLOOR2 = 7756 # dirt floor
TILED_FLOOR2 = 7760 # tiled floor
DIRT_FLOOR3 = 7762 # dirt floor
STONE_FLOOR5 = 7770 # stone floor

# Cave walls (blocking ground — used as walls)
CAVE_WALL_1 = 356  # various cave wall tiles
CAVE_WALL_2 = 357
CAVE_WALL_3 = 358
CAVE_WALL_4 = 359
CAVE_WALL_5 = 360
CAVE_WALL_6 = 361
CAVE_WALL_7 = 362
CAVE_WALL_8 = 363
CAVE_WALL_9 = 364
CAVE_WALL_10 = 365
CAVE_WALL_11 = 366
CAVE_WALL_12 = 367

# Items (blocking)
SPIDER_EGG    = 181   # spider egg
SPIDER_EGG2   = 233   # spider egg variant
STALAGMITE    = 388   # stalagmites
STALAGMITE2   = 389   # stalagmites variant
WOODEN_TRASH  = 398   # wooden trash
JAGGED_STONE  = 1006  # jagged stones
MOSSY_STONE   = 1840  # mossy stone
STONE_PILLAR  = 2152  # stone pillar

# Items (non-blocking — decoration)
SPIDER_WEB    = 188   # remains of a spider web
SPIDER_WEB2   = 189   # remains of a spider web
MUD_STAIN     = 1066  # mud stain
SKULL         = 3114  # skull
SKULL2        = 3132  # skull variant
HUMAN_REMAINS = 3133  # human remains
BONE          = 3115  # bone
BIG_BONE      = 3116  # big bone
DEAD_RAT      = 4255  # dead rat
DEAD_SPIDER   = 4264  # dead spider
PILE_BONES    = 4254  # pile of bones
PILE_BONES2   = 4271  # pile of bones
SKELETON      = 4315  # skeleton
SOME_BONES    = 4317  # some bones
WHITE_MUSH    = 3723  # white mushroom
BROWN_MUSH    = 3725  # brown mushroom
LIT_TORCH     = 2921  # lit torch
LIT_TORCH2    = 2923  # lit torch
LIT_TORCH_BEARER = 2929 # lit torch bearer
SEWER_GRATE2  = 7750  # sewer grate (deco)
FISHBONE      = 3111  # fishbone
CHAIN         = 2920  # torch (unlit)
BARREL        = 2519  # barrel
CRATE         = 2471  # crate

# Ground (walkable) — used for holes
HOLE       = 385
LADDER_GND = 433  # ladder (ground)
STAIRS     = 428  # stairs
TRAPDOOR   = 475  # closed trapdoor
HOLE2      = 594  # hole
HOLE3      = 607  # hole

# ============================================================
# Map Layout — 25x19 grid
# Character legend:
#   # = cave wall (blocking ground)
#   . = stone floor (walkable)
#   , = dirt floor (walkable)
#   ~ = water (blocking ground)
#   S = spawn do jogador (walkable — stone floor)
#   G = zona de monstros (walkable — stone floor)
#   (space) = void (no cell)
# ============================================================

MAP_LAYOUT = [
    "#########################",  # 0
    "#..,,..#.......#..,,..#",  # 1
    "#..,,..#.......#..,,..#",  # 2
    "#..,,..#.......#..,,..#",  # 3
    "#..,,.............,,..#",  # 4
    "#..,,.............,,..#",  # 5
    "####..####~~~####..####",  # 6
    "#........#~~~#........#",  # 7
    "#........#~~~#........#",  # 8
    "#...S....#~~~#...G....#",  # 9
    "#........#~~~#........#",  # 10
    "#........#~~~#........#",  # 11
    "####..####~~~####..####",  # 12
    "#..,,.............,,..#",  # 13
    "#..,,.............,,..#",  # 14
    "#..,,..#.......#..,,..#",  # 15
    "#..,,..#.......#..,,..#",  # 16
    "#..,,..#.......#..,,..#",  # 17
    "#########################",  # 18
]

MAP_W = 25
MAP_H = 19

# ============================================================
# Decorations — placed on top of ground tiles
# Format: [item_id, x, y]
# ============================================================
DECORATIONS = [
    # Tochas nas paredes (corredores norte)
    [LIT_TORCH, 1, 1],  [LIT_TORCH2, 7, 1],
    [LIT_TORCH, 17, 1], [LIT_TORCH2, 23, 1],
    # Tochas nas paredes (corredores sul)
    [LIT_TORCH, 1, 17],  [LIT_TORCH2, 7, 17],
    [LIT_TORCH, 17, 17], [LIT_TORCH2, 23, 17],
    # Tochas na sala central
    [LIT_TORCH_BEARER, 5, 7],  [LIT_TORCH_BEARER, 19, 7],
    [LIT_TORCH_BEARER, 5, 11], [LIT_TORCH_BEARER, 19, 11],
    # Ralos do esgoto
    [SEWER_GRATE, 2, 6],  [SEWER_GRATE, 22, 6],
    [SEWER_GRATE, 2, 12], [SEWER_GRATE, 22, 12],
    [SEWER_GRATE2, 12, 7], [SEWER_GRATE2, 12, 11],
    # Teias de aranha (perto da zona de monstros)
    [SPIDER_WEB, 16, 9],  [SPIDER_WEB2, 17, 10],
    [SPIDER_WEB, 18, 8],  [SPIDER_WEB2, 19, 9],
    [SPIDER_WEB, 15, 10], [SPIDER_WEB2, 20, 11],
    # Ovos de aranha (perto da zona de monstros)
    [SPIDER_EGG, 20, 8],  [SPIDER_EGG2, 21, 10],
    [SPIDER_EGG, 19, 11], [SPIDER_EGG2, 16, 11],
    # Ossadas e crânios (cantos escuros)
    [SKULL, 3, 2],        [SKULL2, 22, 3],
    [BONE, 4, 15],        [BIG_BONE, 20, 16],
    [PILE_BONES, 2, 16],  [PILE_BONES2, 22, 2],
    [SKELETON, 3, 14],    [SOME_BONES, 21, 14],
    [DEAD_RAT, 5, 3],     [DEAD_RAT, 19, 15],
    [DEAD_SPIDER, 17, 15],
    # Cogumelos na umidade
    [WHITE_MUSH, 3, 5],   [BROWN_MUSH, 4, 5],
    [WHITE_MUSH, 20, 5],  [BROWN_MUSH, 21, 5],
    [WHITE_MUSH, 3, 13],  [BROWN_MUSH, 4, 13],
    [WHITE_MUSH, 20, 13], [BROWN_MUSH, 21, 13],
    # Manchas de lama
    [MUD_STAIN, 6, 4],    [MUD_STAIN, 18, 4],
    [MUD_STAIN, 6, 14],   [MUD_STAIN, 18, 14],
    [MUD_STAIN, 10, 5],   [MUD_STAIN, 14, 13],
    # Barril e caixote (perto da entrada)
    [BARREL, 2, 4],       [CRATE, 3, 4],
    [BARREL, 22, 14],     [CRATE, 21, 14],
    # Espinha de peixe (perto da água)
    [FISHBONE, 10, 7],    [FISHBONE, 14, 11],
    # Stalagmites decorativas
    [STALAGMITE, 5, 6],   [STALAGMITE2, 19, 6],
    [STALAGMITE, 5, 12],  [STALAGMITE2, 19, 12],
]

# ============================================================
# Build the map data structure
# ============================================================

def build_map():
    cells = {}
    spawn = None
    mob = []

    # Cave wall variants for variety
    cave_walls = [EARTH, CAVE_WALL_1, CAVE_WALL_2, CAVE_WALL_3,
                  CAVE_WALL_4, CAVE_WALL_5, CAVE_WALL_6, CAVE_WALL_7,
                  CAVE_WALL_8, CAVE_WALL_9, CAVE_WALL_10, CAVE_WALL_11,
                  CAVE_WALL_12]

    # Stone floor variants for variety
    stone_floors = [STONE_FLOOR, STONE_FLOOR2, STONE_FLOOR3, STONE_FLOOR4,
                    STONE_FLOOR5, STONE_TILE, STONE_TILE2, STONE_FLOORING,
                    CARVED_STONE, TILED_FLOOR, TILED_FLOOR2]

    # Dirt floor variants
    dirt_floors = [DIRT, DIRT_FLOOR, DIRT_FLOOR2, DIRT_FLOOR3, EARTH_GND]

    import random
    rng = random.Random(42)  # deterministic seed

    for y, row in enumerate(MAP_LAYOUT):
        for x, ch in enumerate(row):
            if ch == ' ':
                continue

            if ch == '#':
                # Cave wall — use various blocking ground tiles
                wall_id = rng.choice(cave_walls)
                cells[f"{x},{y}"] = {"g": wall_id, "items": []}

            elif ch == '~':
                # Water
                cells[f"{x},{y}"] = {"g": WATER, "items": []}

            elif ch == '.':
                # Stone floor
                floor_id = rng.choice(stone_floors)
                cells[f"{x},{y}"] = {"g": floor_id, "items": []}

            elif ch == ',':
                # Dirt floor
                floor_id = rng.choice(dirt_floors)
                cells[f"{x},{y}"] = {"g": floor_id, "items": []}

            elif ch == 'S':
                # Player spawn
                cells[f"{x},{y}"] = {"g": STONE_FLOOR, "items": []}
                spawn = {"x": x, "y": y}

            elif ch == 'G':
                # Monster zone
                cells[f"{x},{y}"] = {"g": STONE_FLOOR, "items": []}
                mob.append({"x": x, "y": y})

    # Add decorations (items on top of ground)
    for item_id, x, y in DECORATIONS:
        key = f"{x},{y}"
        if key in cells:
            cells[key]["items"].append(item_id)

    # Add monster zone cells (expand the G zone around the spawn point)
    # The G marker is at (16, 9), expand to a 4x4 area
    g_center_x, g_center_y = 16, 9
    for dx in range(-1, 3):
        for dy in range(-1, 3):
            gx, gy = g_center_x + dx, g_center_y + dy
            if 0 <= gx < MAP_W and 0 <= gy < MAP_H:
                key = f"{gx},{gy}"
                if key in cells and cells[key]["g"] not in (EARTH, WATER, VOID) + tuple(cave_walls):
                    mob_entry = {"x": gx, "y": gy}
                    if mob_entry not in mob:
                        mob.append(mob_entry)

    return {
        "name": "rookgaard_sewers",
        "w": MAP_W,
        "h": MAP_H,
        "cells": cells,
        "spawn": spawn,
        "mob": mob,
    }


# ============================================================
# OTBM Writer (matches otbm.js format)
# ============================================================

NODE_START = 0xFE
NODE_END = 0xFF
ESCAPE = 0xFD
NODE_ROOT = 0
NODE_TILE_AREA = 1
NODE_TILE = 2
NODE_ITEM = 3


class EscBuf:
    def __init__(self):
        self.bytes = []

    def raw(self, b):
        self.bytes.append(b & 0xFF)

    def u8(self, b):
        b &= 0xFF
        if b in (NODE_START, NODE_END, ESCAPE):
            self.bytes.append(ESCAPE)
        self.bytes.append(b)

    def u16(self, v):
        self.u8(v & 0xFF)
        self.u8((v >> 8) & 0xFF)

    def u32(self, v):
        v = v & 0xFFFFFFFF
        self.u8(v & 0xFF)
        self.u8((v >> 8) & 0xFF)
        self.u8((v >> 16) & 0xFF)
        self.u8((v >> 24) & 0xFF)

    def str_bytes(self, arr):
        for b in arr:
            self.u8(b)

    def write_str(self, s):
        encoded = s.encode('utf-8')
        self.u16(len(encoded))
        self.str_bytes(list(encoded))

    def to_bytes(self):
        return bytes(self.bytes)


def build_description(map_data):
    lines = [
        "Saved with OTI RME (editor web do tibia idle).",
        f"Mapa: {map_data['name']} — Rookgaard Sewers",
    ]
    payload = {
        "n": map_data["name"],
        "s": [map_data["spawn"]["x"], map_data["spawn"]["y"]] if map_data["spawn"] else None,
        "m": [[m["x"], m["y"]] for m in map_data["mob"]],
    }
    lines.append("OTIDLE:" + json.dumps(payload))
    return "\r\n".join(lines)


def write_otbm(map_data):
    out = EscBuf()

    # Magic "OTBM" + version 2
    out.raw(0x4F)
    out.raw(0x54)
    out.raw(0x42)
    out.raw(0x4D)
    out.raw(2)
    out.raw(0)
    out.raw(0)
    out.raw(0)

    # Root node
    out.raw(NODE_START)
    out.u8(NODE_ROOT)

    # Attr 1: description
    out.u8(1)
    out.write_str(build_description(map_data))

    # Attr 2: header binary (version, dimensions, items.otb 8.60)
    out.u8(2)
    out.u16(20)  # payload size
    out.u32(2)   # version
    out.u16(map_data["w"])
    out.u16(map_data["h"])
    out.u32(3)   # items.otb major
    out.u32(860) # items.otb minor
    out.u32(0)   # reserved

    # TILE_AREA
    out.raw(NODE_START)
    out.u8(NODE_TILE_AREA)
    out.u16(0)  # baseX
    out.u16(0)  # baseY
    out.u8(7)   # z (floor 7)

    # Sort cells by y then x
    cells = map_data["cells"]
    keys = sorted(cells.keys(), key=lambda k: (
        int(k.split(",")[1]), int(k.split(",")[0])
    ))

    for key in keys:
        x, y = map(int, key.split(","))
        cell = cells[key]
        if not cell or (not cell.get("g") and not cell.get("items")):
            continue

        out.raw(NODE_START)
        out.u8(NODE_TILE)
        out.u8(x)
        out.u8(y)

        if cell.get("g"):
            out.u8(9)  # OTBM_ATTR_ITEM
            out.u16(cell["g"])

        for item_id in cell.get("items", []):
            out.raw(NODE_START)
            out.u8(NODE_ITEM)
            out.u16(item_id)
            out.raw(NODE_END)

        out.raw(NODE_END)  # end TILE

    out.raw(NODE_END)  # end TILE_AREA
    out.raw(NODE_END)  # end ROOT

    return out.to_bytes()


# ============================================================
# Main
# ============================================================

def main():
    map_data = build_map()

    # Validate
    if not map_data["spawn"]:
        print("ERRO: Sem spawn do jogador!")
        return
    if not map_data["mob"]:
        print("ERRO: Sem zona de monstros!")
        return

    # Write OTBM
    otbm_data = write_otbm(map_data)
    out_path = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        "tibia-idle", "game", "maps", "rookgaard_sewers.otbm"
    )
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "wb") as f:
        f.write(otbm_data)

    print(f"✅ Mapa gerado: {out_path}")
    print(f"   Tamanho: {len(otbm_data)} bytes")
    print(f"   Dimensões: {map_data['w']}x{map_data['h']}")
    print(f"   Spawn: ({map_data['spawn']['x']}, {map_data['spawn']['y']})")
    print(f"   Zona de monstros: {len(map_data['mob'])} células")
    print(f"   Células: {len(map_data['cells'])}")

    # Also generate a JSON version for reference
    json_path = out_path.replace(".otbm", ".json")
    with open(json_path, "w") as f:
        json.dump(map_data, f, indent=2)
    print(f"   JSON: {json_path}")


if __name__ == "__main__":
    main()
