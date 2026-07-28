#!/usr/bin/env python3
"""Precos de NPC do TibiaWiki (tibiawiki.com.br), por carga/unidade.

Fonte: as paginas individuais de cada item no TibiaWiki BR, secao
"Compra ... de:" (valor cobrado pelos NPCs). Sao os precos classicos do
Tibia global, que e a referencia que o jogo passou a usar.

Conferido diretamente na wiki:
  Sudden Death Rune -> 162 gp  (Shiriel, Rachel, Asima...)

Os demais seguem a mesma tabela de NPC do jogo global.
"""

# ---- runas: preco por CARGA cobrado pelos NPCs de magia
RUNAS = {
    "lightest-missile-rune": 5,
    "lightest-magic-missile-rune": 5,
    "light-stone-shower-rune": 5,
    "light-magic-missile-rune": 12,
    "poison-field-rune": 21,
    "fire-field-rune": 28,
    "antidote-rune": 65,
    "intense-healing-rune": 95,
    "convince-creature-rune": 80,
    "destroy-field-rune": 15,
    "energy-field-rune": 38,
    "desintegrate-rune": 26,
    "stalagmite-rune": 12,
    "ultimate-healing-rune": 175,
    "heavy-magic-missile-rune": 25,
    "poison-bomb-rune": 85,
    "animate-dead-rune": 375,
    "chameleon-rune": 210,
    "firebomb-rune": 235,
    "fireball-rune": 30,
    "holy-missile-rune": 16,
    "soulfire-rune": 46,
    "wild-growth-rune": 160,
    "icicle-rune": 30,
    "stone-shower-rune": 37,
    "thunderstorm-rune": 37,
    "poison-wall-rune": 52,
    "avalanche-rune": 57,
    "great-fireball-rune": 57,
    "explosion-rune": 31,
    "magic-wall-rune": 116,
    "fire-wall-rune": 61,
    "energybomb-rune": 203,
    "energy-wall-rune": 85,
    "sudden-death-rune": 162,
    "paralyze-rune": 700,
}

# ---- potions: preco por unidade nos NPCs de magia
POTIONS = {
    "small-health-potion": 20,
    "health-potion": 45,
    "mana-potion": 50,
    "strong-health-potion": 100,
    "strong-mana-potion": 80,
    "great-health-potion": 190,
    "great-mana-potion": 120,
    "great-spirit-potion": 190,
    "ultimate-health-potion": 310,
    "ultimate-mana-potion": 438,
    "ultimate-spirit-potion": 322,
    "supreme-health-potion": 625,
}

# ---- municao: preco por unidade
AMMO = {
    "simple-arrow": 2,
    "arrow": 3,
    "poison-arrow": 4,
    "burst-arrow": 5,
    "sniper-arrow": 5,
    "flash-arrow": 5,
    "shiver-arrow": 5,
    "flaming-arrow": 5,
    "earth-arrow": 5,
    "tarsal-arrow": 6,
    "onyx-arrow": 7,
    "envenomed-arrow": 12,
    "crystalline-arrow": 20,
    "diamond-arrow": 130,
    "bolt": 4,
    "piercing-bolt": 5,
    "vortex-bolt": 6,
    "power-bolt": 7,
    "drill-bolt": 12,
    "prismatic-bolt": 20,
    "infernal-bolt": 13,
    "spectral-bolt": 70,
}

if __name__ == "__main__":
    print("runas: %d | potions: %d | municoes: %d"
          % (len(RUNAS), len(POTIONS), len(AMMO)))
