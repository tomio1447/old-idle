"""
Importa o efeito visual REAL de cada magia/runa a partir dos scripts do Canary.

Por que: o jogo escolhia a animacao so pelo ELEMENTO do dano (ELEMENTS[el].fx
em js/core.js), entao todas as magias de fogo mostravam hit-by-fire, todas as
de gelo mostravam ice-attack e assim por diante. No servidor de verdade cada
magia declara o proprio efeito:

    combat:setParameter(COMBAT_PARAM_EFFECT, CONST_ME_FIREAREA)
    combat:setParameter(COMBAT_PARAM_DISTANCEEFFECT, CONST_ANI_FIRE)

Exevo gran mas flam usa FIREAREA (a explosao larga), exori flam usa
HITBYFIRE (a labareda pontual) e exevo flam hur usa FIREAREA tambem, mas com
um projetil CONST_ANI_FIRE saindo do conjurador. Sao animacoes diferentes com
o mesmo elemento — era exatamente essa a queixa de "elemento certo, animacao
errada".

Gera game/js/spellfxdata.js com, por magia:
    fx    -> nome do sheet em assets/fx (efeito de impacto)
    miss  -> nome do sheet em assets/missile (projetil), quando houver

Uso: python3 import_spell_effects.py [dir_do_canary] [dir_do_game]
"""
import json
import os
import re
import sys

CAN = sys.argv[1] if len(sys.argv) > 1 else "/tmp/can"
GAME = sys.argv[2] if len(sys.argv) > 2 else os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "..", "game")

# CONST_ME_* -> nome do PNG em assets/fx. Os nomes dos arquivos vieram do
# extrator de efeitos do 8.60 (tools/extract_fx_860.py), que usa o rotulo do
# client; aqui so traduzimos a constante do servidor para esse rotulo.
ME = {
    "DRAWBLOOD": "draw-blood", "LOSEENERGY": "lose-energy",
    "POFF": "poff", "BLOCKHIT": "block-hit", "EXPLOSIONAREA": "explosion-area",
    "EXPLOSIONHIT": "explosion-hit", "FIREAREA": "fire-area",
    "YELLOW_RINGS": "yellow-rings", "GREEN_RINGS": "green-rings",
    "HITAREA": "hit-area", "TELEPORT": "teleport", "ENERGYHIT": "energy-hit",
    "MAGIC_BLUE": "magic-blue", "MAGIC_RED": "magic-red",
    "MAGIC_GREEN": "magic-green", "HITBYFIRE": "hit-by-fire",
    "HITBYPOISON": "hit-by-poison", "MORTAREA": "mort-area",
    "SOUND_GREEN": "sound-green", "SOUND_RED": "sound-red",
    "POISONAREA": "poison-area", "SOUND_YELLOW": "sound-yellow",
    "SOUND_PURPLE": "sound-purple", "SOUND_BLUE": "sound-blue",
    "SOUND_WHITE": "sound-white", "BUBBLES": "bubbles", "CRAPS": "craps",
    "GIFT_WRAPS": "gift-wraps", "FIREWORK_YELLOW": "firework-yellow",
    "FIREWORK_RED": "firework-red", "FIREWORK_BLUE": "firework-blue",
    "STUN": "stun", "SLEEP": "sleep", "WATERCREATURE": "watercreature",
    "GROUNDSHAKER": "groundshaker", "HEARTS": "hearts",
    "FIREATTACK": "fire-attack", "ENERGYAREA": "energy-area",
    "SMALLCLOUDS": "small-clouds", "HOLYDAMAGE": "holy-damage",
    "BIGCLOUDS": "big-clouds", "ICEAREA": "ice-area",
    "ICETORNADO": "ice-tornado", "ICEATTACK": "ice-attack",
    "STONES": "stones", "SMALLPLANTS": "small-plants",
    "CARNIPHILA": "carniphila", "PURPLEENERGY": "purple-energy",
    "YELLOWENERGY": "yellow-energy", "HOLYAREA": "holy-area",
    "BIGPLANTS": "big-plants", "CAKE": "cake", "GIANTICE": "giant-ice",
    "WATERSPLASH": "water-splash", "PLANTATTACK": "plant-attack",
    "TUTORIALARROW": "tutorial-arrow", "TUTORIALSQUARE": "tutorial-square",
    "MIRRORHORIZONTAL": "mirror-horizontal", "SMALLSTONES": "small-stones",
    "PURPLETELEPORT": "purple-teleport", "REDTELEPORT": "red-teleport",
    "ORANGETELEPORT": "orange-teleport", "GREYTELEPORT": "grey-teleport",
    "BLUETELEPORT": "blue-teleport", "GREENSMOKE": "green-smoke",
    "PURPLESMOKE": "purple-smoke", "BLUE_GHOST": "blue-ghost",
    "WHITE_ENERGY_SPARK": "white-energy-spark",
    "BLUE_ENERGY_SPARK": "blue-energy-spark",
    "RED_ENERGY_SPARK": "red-energy-spark",
    "YELLOW_ENERGY_SPARK": "yellow-energy-spark",
    "GREEN_ENERGY_SPARK": "green-energy-spark",
    "BLOW_WHITE": "blow-white", "BLOW_BLUE": "blow-blue",
    "BLOW_GREEN": "blow-green", "BLOW_PINK": "blow-pink",
    "CLAW_WHITE": "claw-white", "CLAW_GREEN": "claw-green",
    "WHIRLWIND_BLOW_WHITE": "whirlwind-blow-white",
    "DIVINE_GRENADE": "divine-grenade", "POFF_PURPLE": "poff",
}

# CONST_ANI_* -> nome do PNG em assets/missile
ANI = {
    "SPEAR": "spear", "BOLT": "bolt", "ARROW": "arrow", "FIRE": "fire",
    "ENERGY": "energy", "POISONARROW": "poison-arrow",
    "BURSTARROW": "burst-arrow", "THROWINGSTAR": "throwing-star",
    "THROWINGKNIFE": "throwing-knife", "SMALLSTONE": "small-stone",
    "DEATH": "death", "LARGEROCK": "large-rock", "SNOWBALL": "snowball",
    "POWERBOLT": "power-bolt", "POISON": "poison", "INFERNALBOLT": "bolt",
    "HUNTINGSPEAR": "spear", "ENCHANTEDSPEAR": "spear",
    "REDSTAR": "red-star", "GREENSTAR": "green-star",
    "ROYALSPEAR": "spear", "SNIPERARROW": "arrow", "ONYXARROW": "arrow",
    "PIERCINGBOLT": "bolt", "WHIRLWINDSWORD": "whirlwind-sword",
    "WHIRLWINDAXE": "whirlwind-axe", "WHIRLWINDCLUB": "whirlwind-club",
    "ETHEREALSPEAR": "spear", "ICE": "ice", "EARTH": "earth",
    "HOLY": "holy", "SUDDENDEATH": "sudden-death",
    "FLASHARROW": "arrow", "FLAMMINGARROW": "arrow",
    "SHIVERARROW": "arrow", "ENERGYBALL": "energy",
    "SMALLICE": "ice", "SMALLHOLY": "holy", "SMALLEARTH": "earth",
    "EARTHARROW": "arrow", "EXPLOSION": "explosion", "CAKE": "cake",
    "TARSALARROW": "arrow", "VORTEXBOLT": "bolt",
    "PRISMATICBOLT": "bolt", "CRYSTALLINEARROW": "arrow",
    "DRILLBOLT": "bolt", "ENVENOMEDARROW": "poison-arrow",
    "GLOOTHSPEAR": "spear", "SIMPLEARROW": "arrow",
    "DIAMONDARROW": "arrow", "SPECTRALBOLT": "bolt",
    "ROYALSTAR": "red-star",
    # WEAPONTYPE = "o projetil da arma equipada": quem resolve e o cliente,
    # entao deixamos nulo e o jogo escolhe pela municao
    "WEAPONTYPE": None, "NONE": None,
}


def parse_lua(txt):
    """Extrai (palavras, efeito, projetil) de um script de magia/runa."""
    pal = re.search(r'spell:words\("([^"]+)"\)', txt)
    if not pal:
        pal = re.search(r'\bwords\("([^"]+)"\)', txt)
    fx = re.search(r"COMBAT_PARAM_EFFECT,\s*CONST_ME_([A-Z_0-9]+)", txt)
    ani = re.search(r"COMBAT_PARAM_DISTANCEEFFECT,\s*CONST_ANI_([A-Z_0-9]+)",
                    txt)
    nome = re.search(r'spell:name\("([^"]+)"\)', txt)
    return (pal.group(1) if pal else None,
            nome.group(1) if nome else None,
            fx.group(1) if fx else None,
            ani.group(1) if ani else None)


def main():
    raiz = os.path.join(CAN, "data", "scripts", "spells")
    if not os.path.isdir(raiz):
        print("canary nao encontrado em", raiz)
        return

    porPalavra, porNome = {}, {}
    faltandoMe, faltandoAni = set(), set()
    n = 0
    for base, _, arqs in os.walk(raiz):
        for a in arqs:
            if not a.endswith(".lua"):
                continue
            txt = open(os.path.join(base, a), encoding="utf-8",
                       errors="ignore").read()
            palavras, nome, me, ani = parse_lua(txt)
            if not me and not ani:
                continue
            reg = {}
            if me:
                if me in ME:
                    reg["fx"] = ME[me]
                else:
                    faltandoMe.add(me)
            if ani:
                if ani in ANI:
                    if ANI[ani]:
                        reg["miss"] = ANI[ani]
                else:
                    faltandoAni.add(ani)
            if not reg:
                continue
            n += 1
            if palavras:
                porPalavra[palavras.lower()] = reg
            if nome:
                porNome[nome.lower()] = reg

    dados = {"words": porPalavra, "names": porNome}
    saida = os.path.join(GAME, "js", "spellfxdata.js")
    with open(saida, "w") as f:
        f.write("/* Gerado por tools/import_spell_effects.py\n"
                " * Efeito visual de cada magia, lido do COMBAT_PARAM_EFFECT e\n"
                " * do COMBAT_PARAM_DISTANCEEFFECT dos scripts do Canary.\n"
                " * Indexado pelas palavras magicas e tambem pelo nome. */\n")
        f.write("window.SPELLFX = " + json.dumps(dados) + ";\n")
    json.dump(dados, open(os.path.join(GAME, "data", "spellfx.json"), "w"))

    print("magias com efeito:", n,
          "| por palavra:", len(porPalavra), "| por nome:", len(porNome))
    if faltandoMe:
        print("CONST_ME sem mapa:", sorted(faltandoMe))
    if faltandoAni:
        print("CONST_ANI sem mapa:", sorted(faltandoAni))


if __name__ == "__main__":
    main()
