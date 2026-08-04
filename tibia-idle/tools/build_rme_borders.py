#!/usr/bin/env python3
"""
Extrai as bordas automaticas do DAT 8.60 para o editor de mapas (RME).

Gera game/rme/data/borders.js com:
  - window.RME_BORDERS: mapa ground_id -> border_id
  - window.RME_BORDER_TILES: set de IDs que sao GroundBorder

O RME usa isso para colocar bordas automaticamente quando um chao
e adjacente a um tipo de chao diferente.
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from tibia_assets_860 import Dat860  # noqa: E402

SRC = os.environ.get("TIBIA860", "/tmp/levi860_assets")
HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.normpath(os.path.join(HERE, "..", "game"))
RME_DATA = os.path.join(GAME, "rme", "data")

dat = Dat860(os.path.join(SRC, "Tibia.dat"))

# Coleta todos os itens que sao GroundBorder
border_tiles = set()
# Coleta todos os itens que sao Ground
ground_tiles = {}  # id -> speed

for cid in range(100, dat.item_count + 1):
    obj = dat.item(cid)
    if obj is None:
        continue
    if "GroundBorder" in obj.flags:
        border_tiles.add(cid)
    if "Ground" in obj.flags:
        ground_tiles[cid] = obj.props.get("speed", 0)

# Heuristica de associacao ground -> border:
# No client 8.60, as bordas costumam vir logo depois do chao
# Ex: grass (106) -> bordas 107-109, dirt (103) -> bordas proximas, etc.
# Vamos agrupar por proximidade de ID e por GroundBorder
borders_map = {}  # ground_id -> border_id

ground_ids = sorted(ground_tiles.keys())
border_ids = sorted(border_tiles)

# Para cada ground, encontrar o GroundBorder mais proximo que vem depois
for gid in ground_ids:
    best = None
    best_dist = 999999
    for bid in border_ids:
        if bid > gid:
            dist = bid - gid
            if dist < best_dist:
                best_dist = dist
                best = bid
    if best and best_dist <= 20:  # bordas ficam ate 20 IDs depois do chao
        borders_map[gid] = best

# Tambem faz o mapeamento reverso: qual chao usa qual borda?
# Se dois chaos mapeiam a mesma borda, sao do mesmo "grupo" de borda
border_groups = {}  # border_id -> [ground_ids]
for gid, bid in borders_map.items():
    border_groups.setdefault(bid, []).append(gid)

# Para chaos sem borda propria, herda a borda do grupo mais proximo
for gid in ground_ids:
    if gid in borders_map:
        continue
    # Tenta achar outro chao com a mesma velocidade (mesmo tipo de terreno)
    for other_gid in ground_ids:
        if other_gid in borders_map and ground_tiles[other_gid] == ground_tiles[gid]:
            borders_map[gid] = borders_map[other_gid]
            break

print(f"Ground tiles: {len(ground_tiles)}")
print(f"Border tiles: {len(border_tiles)}")
print(f"Mapped ground->border: {len(borders_map)}")

# Gera borders.js
os.makedirs(RME_DATA, exist_ok=True)
out = os.path.join(RME_DATA, "borders.js")

with open(out, "w", encoding="utf-8") as f:
    f.write("/* borders.js — GERADO por tools/build_rme_borders.py\n")
    f.write(" * Mapeamento de chao -> borda para o editor de mapas.\n")
    f.write(" * RME_BORDERS: ground_id -> border_id (borda automatica)\n")
    f.write(" * RME_BORDER_TILES: IDs que sao GroundBorder no DAT\n")
    f.write(" * RME_GROUND_SPEED: ground_id -> velocidade (para agrupar\n")
    f.write(" *   chaos do mesmo tipo: agua, grama, areia, etc.)\n */\n\n")

    f.write("window.RME_BORDERS = ")
    f.write(json.dumps({str(k): v for k, v in sorted(borders_map.items())}, indent=2))
    f.write(";\n\n")

    f.write("window.RME_BORDER_TILES = new Set([")
    f.write(", ".join(str(b) for b in sorted(border_tiles)))
    f.write("]);\n\n")

    f.write("window.RME_GROUND_SPEED = ")
    f.write(json.dumps({str(k): v for k, v in sorted(ground_tiles.items())}, indent=2))
    f.write(";\n")

print(f"Escrito: {out}")
