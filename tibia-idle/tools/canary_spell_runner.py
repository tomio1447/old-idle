#!/usr/bin/env python3
"""Executa os scripts de magia do Canary em um Lua real com stubs.

Regex nao da conta: o canary escreve as formulas de dezenas de jeitos
(funcao auxiliar, WOD, clamps, getHarmonyDamage...). Rodando o Lua de
verdade e amostrando a funcao em varios pontos, conseguimos os
coeficientes reais por regressao linear — inclusive de magias que o
parser textual nao entendia.

Modelo ajustado:
  magica : valor = a*level + b*magicLevel + c
  skill  : valor = a*(skill*attack) + b*level + c
"""
import os
import re

import lupa

PRELUDIO = r"""
-- Stubs minimos para carregar um script de spell do canary fora do servidor.
-- Tudo que nao interessa vira um objeto "engolidor" que aceita qualquer
-- chamada e devolve a si mesmo, para o script rodar ate o fim.
local registro = {
  vocations = {}, groups = {}, areas = {}, params = {},
  conditions = {}, chain = nil,
}
_G.REG = registro

local function engolidor(nome)
  local t = {}
  setmetatable(t, {
    __index = function(_, k) return function(...) return engolidor(nome) end end,
    __call = function(_, ...) return engolidor(nome) end,
  })
  return t
end
_G.__engolidor = engolidor

setmetatable(_G, { __index = function(_, k)
  -- qualquer constante desconhecida (CONST_ME_X, AREA_Y, COMBAT_Z) vira
  -- a propria string, para conseguirmos ler o valor depois
  if type(k) == "string" and k:match("^[A-Z][A-Z0-9_]*$") then return k end
  return nil
end })

Combat = function()
  local c = {}
  function c:setParameter(k, v) registro.params[tostring(k)] = v; return c end
  function c:setArea(a) registro.areas[#registro.areas + 1] = a; return c end
  function c:setCallback(tipo, fn)
    -- guarda o PRIMEIRO callback de cada tipo: magias com area interna e
    -- externa (Sweeping Takedown) registram duas, e a segunda so le cache
    local chave = "cb_" .. tostring(tipo)
    if registro[chave] == nil then registro[chave] = fn end
    return c
  end
  function c:addCondition(cd) registro.conditions[#registro.conditions + 1] = cd; return c end
  function c:setFormula(...) registro.formula_direta = { ... }; return c end
  function c:execute(...) return true end
  function c:setOrigin(...) return c end
  return c
end

createCombatArea = function(a, b) return a end

Condition = function(tipo)
  local cd = { tipo = tipo, params = {}, dmg = {} }
  function cd:setParameter(k, v) cd.params[tostring(k)] = v; return cd end
  function cd:addDamage(n, intervalo, valor)
    cd.dmg[#cd.dmg + 1] = { n = n, intervalo = intervalo, valor = valor }
    registro.dano_condicao = cd.dmg
    registro.tipo_condicao = tostring(tipo)
    return cd
  end
  -- qualquer outro metodo de Condition (setOutfit, setTicks, addOutfit...)
  -- vira no-op encadeavel: nao afeta a formula que queremos ler
  setmetatable(cd, { __index = function(_, k)
    return function(_, ...) return cd end
  end })
  return cd
end

Spell = function(tipo)
  local s = { tipo = tipo }
  local function setter(nome)
    return function(_, ...)
      local args = { ... }
      if #args == 1 then registro[nome] = args[1] else registro[nome] = args end
      return s
    end
  end
  s.name = setter("name")
  s.words = setter("words")
  s.level = setter("level")
  s.mana = setter("mana")
  s.soul = setter("soul")
  s.magicLevel = setter("magicLevel")
  s.range = setter("range")
  s.cooldown = setter("cooldown")
  s.needTarget = setter("needTarget")
  s.needWeapon = setter("needWeapon")
  s.needDirection = setter("needDirection")
  s.isPremium = setter("premium")
  s.isSelfTarget = setter("selfTarget")
  s.isAggressive = setter("aggressive")
  s.blockWalls = setter("blockWalls")
  s.allowOnSelf = setter("allowOnSelf")
  s.pzLocked = setter("pzLocked")
  s.id = setter("id")
  s.castSound = setter("castSound")
  s.impactSound = setter("impactSound")
  s.hasParams = setter("hasParams")
  s.hasPlayerNameParam = setter("hasPlayerNameParam")
  s.isBlockingWalls = setter("blockWalls")
  s.monkSpellType = setter("monkType")
  s.runeId = setter("runeId")
  s.charges = setter("charges")
  s.runeLevel = setter("runeLevel")
  s.runeMagicLevel = setter("runeMagicLevel")
  s.isSelfTargetOnly = setter("selfTarget")
  function s:group(...)
    local g = { ... }
    for i = 1, #g do registro.groups[#registro.groups + 1] = tostring(g[i]) end
    return s
  end
  function s:groupCooldown(...)
    registro.groupCooldown = { ... }
    return s
  end
  function s:vocation(...)
    local v = { ... }
    for i = 1, #v do
      local nome = tostring(v[i]):match("^([^;]+)")
      registro.vocations[#registro.vocations + 1] = nome
    end
    return s
  end
  function s:register() registro.registrado = true; return s end
  setmetatable(s, { __index = function(_, k)
    return function(_, ...) return s end
  end })
  return s
end

Action = function() return engolidor("Action") end
TalkAction = function() return engolidor("TalkAction") end
MoveEvent = function() return engolidor("MoveEvent") end

-- API de player usada dentro das formulas
local PLAYER = {}
_G.__PLAYER = PLAYER
function PLAYER:getLevel() return PLAYER._level end
function PLAYER:getMagicLevel() return PLAYER._ml end
function PLAYER:getEffectiveMagicLevel() return PLAYER._ml end
function PLAYER:getSkillLevel() return PLAYER._skill end
function PLAYER:calculateFlatDamageHealing() return 0 end
function PLAYER:getHarmonyDamage(min, max) return min, max end
function PLAYER:getWheelSpellAdditionalTarget() return 0 end
function PLAYER:getWheelSpellAdditionalArea() return false end
function PLAYER:getWheelSpellAdditionalDuration() return 0 end
function PLAYER:instantSkillWOD() return false end
function PLAYER:revelationStageWOD() return 0 end
-- WOD/wheel desligado: devolve o grau "nenhum" para a formula cair no
-- multiplicador 1.0 em vez de indexar uma tabela com nil
function PLAYER:upgradeSpellsWOD() return WHEEL_GRADE_NONE end
function PLAYER:getPlayer() return PLAYER end
function PLAYER:isPlayer() return true end
-- sem esses o metatable devolveria uma funcao (truthy em Lua) e os
-- scripts entrariam nos ramos de monstro, pulando o calculo do dano
function PLAYER:isMonster() return false end
function PLAYER:isNpc() return false end
function PLAYER:getMaster() return nil end
function PLAYER:getName() return "stub" end
function PLAYER:getId() return 1 end
function PLAYER:getVocation() return { getId = function() return 1 end } end
setmetatable(PLAYER, { __index = function(_, k)
  return function(...) return 0 end
end })

-- captura o dano das magias que curam/atacam via doTargetCombatHealth
-- (Mass Healing, Mass Spirit Mend) em vez de um callback de formula
doTargetCombatHealth = function(creature, target, tipo, min, max, ...)
  registro.alvo_min = min
  registro.alvo_max = max
  return true
end
doTargetCombatMana = doTargetCombatHealth
doAreaCombatHealth = function(cid, tipo, pos, area, min, max, ...)
  registro.alvo_min = min
  registro.alvo_max = max
  return true
end

logger = { debug = function() end, info = function() end,
           warn = function() end, error = function() end }

Tile = function() return engolidor("Tile") end
Position = function() return engolidor("Position") end
Creature = function() return engolidor("Creature") end
Game = engolidor("Game")

table.contains = function(t, v)
  for _, x in pairs(t) do if x == v then return true end end
  return false
end
"""


class Runner(object):
    def __init__(self):
        self.lua = lupa.LuaRuntime(unpack_returned_tuples=True)

    def rodar(self, caminho):
        """Carrega um script de magia e devolve o registro + avaliador."""
        src = open(caminho, encoding="utf-8", errors="ignore").read()
        lua = lupa.LuaRuntime(unpack_returned_tuples=True)
        try:
            lua.execute(PRELUDIO)
            lua.execute(src)
        except Exception as exc:  # script que depende de coisas do servidor
            return None, None, str(exc)
        reg = lua.globals().REG
        player = lua.globals()["__PLAYER"]
        return reg, (lua, player), None


def amostrar(lua, player, fn, modo, reg=None):
    """Chama a formula em varios pontos e devolve (min, max) por ponto."""
    pontos = []
    if modo == "target":
        # magias tipo Mass Healing nao tem callback de formula: elas chamam
        # doTargetCombatHealth diretamente. Rodamos o callback e lemos os
        # valores que o stub interceptou.
        for lvl, ml in [(8, 0), (100, 50), (200, 100), (500, 150), (1000, 200)]:
            player._level = lvl
            player._ml = ml
            reg.alvo_min = None
            reg.alvo_max = None
            try:
                fn(player, player)
            except Exception:
                return None
            if reg.alvo_min is None:
                return None
            pontos.append(((lvl, ml), (reg.alvo_min, reg.alvo_max)))
        return pontos
    if modo == "magic":
        combos = [(8, 0), (100, 50), (200, 100), (500, 150), (1000, 200)]
        for lvl, ml in combos:
            player._level = lvl
            player._ml = ml
            try:
                r = fn(player, lvl, ml)
            except Exception:
                return None
            pontos.append(((lvl, ml), r))
    else:
        # amostragem cruzada: skill, attack e level variam de forma
        # independente para separar os termos skill*attack, skill+attack
        # e level, que o canary mistura conforme a magia
        combos = [(10, 10, 100), (60, 40, 100), (100, 60, 100),
                  (130, 80, 100), (150, 100, 100), (150, 10, 100),
                  (10, 100, 100), (100, 60, 10), (100, 60, 500),
                  (100, 60, 1000), (40, 90, 300), (90, 40, 700)]
        for skill, atk, lvl in combos:
            player._level = lvl
            player._skill = skill
            try:
                r = fn(player, skill, atk, 1.0)
            except Exception:
                return None
            pontos.append(((skill, atk, lvl), r))
    return pontos


def ajustar(pontos, modo):
    """Regressao linear simples (minimos quadrados via numpy)."""
    import numpy as np

    xs, ys_min, ys_max = [], [], []
    for entrada, saida in pontos:
        try:
            vals = list(saida)
        except TypeError:
            return None
        if len(vals) < 2:
            return None
        lo, hi = abs(float(vals[0])), abs(float(vals[1]))
        if lo > hi:
            lo, hi = hi, lo
        if modo in ("magic", "target"):
            lvl, ml = entrada
            xs.append([lvl, ml, 1.0])
        else:
            # skill e attack entram separados alem do produto: o canary
            # usa skill*attack, (skill+attack)*k e (skill+2*attack)*k
            skill, atk, lvl = entrada
            xs.append([skill * atk, skill, atk, lvl, 1.0])
        ys_min.append(lo)
        ys_max.append(hi)
    A = np.array(xs)
    try:
        cmin, *_ = np.linalg.lstsq(A, np.array(ys_min), rcond=None)
        cmax, *_ = np.linalg.lstsq(A, np.array(ys_max), rcond=None)
    except Exception:
        return None
    # erro relativo: se o ajuste linear nao explica a formula, avisa
    erro = float(np.max(np.abs(A.dot(cmax) - np.array(ys_max))) /
                 max(1.0, float(np.max(ys_max))))
    r = lambda v: round(float(v), 5)
    if modo in ("magic", "target"):
        return {"modo": "magic",
                "lvlMin": r(cmin[0]), "mlMin": r(cmin[1]), "flatMin": r(cmin[2]),
                "lvlMax": r(cmax[0]), "mlMax": r(cmax[1]), "flatMax": r(cmax[2]),
                "erro": round(erro, 4)}
    return {"modo": "skill",
            "saMin": r(cmin[0]), "skMin": r(cmin[1]), "atMin": r(cmin[2]),
            "lvlMin": r(cmin[3]), "flatMin": r(cmin[4]),
            "saMax": r(cmax[0]), "skMax": r(cmax[1]), "atMax": r(cmax[2]),
            "lvlMax": r(cmax[3]), "flatMax": r(cmax[4]),
            "erro": round(erro, 4)}


def extrair(caminho):
    """Devolve o dicionario de uma magia do canary, com formula ajustada."""
    runner = Runner()
    reg, ctx, erro = runner.rodar(caminho)
    if reg is None:
        return None, erro
    lua, player = ctx
    d = {}
    for k in ("name", "words", "level", "mana", "soul", "magicLevel", "range",
              "cooldown", "needTarget", "needWeapon", "needDirection",
              "premium", "selfTarget", "aggressive", "blockWalls", "id",
              "monkType", "runeId", "charges", "runeLevel"):
        try:
            v = reg[k]
        except Exception:
            v = None
        if v is not None and not isinstance(v, (int, float, str, bool)):
            v = None
        d[k] = v
    d["groups"] = [reg.groups[i] for i in range(1, len(reg.groups) + 1)] \
        if reg.groups else []
    d["vocations"] = [reg.vocations[i] for i in range(1, len(reg.vocations) + 1)] \
        if reg.vocations else []
    d["areas"] = [str(reg.areas[i]) for i in range(1, len(reg.areas) + 1)] \
        if reg.areas else []
    params = {}
    if reg.params:
        for k, v in reg.params.items():
            params[str(k)] = v if isinstance(v, (int, float, str, bool)) else str(v)
    d["params"] = params
    if reg.groupCooldown:
        d["groupCooldown"] = [reg.groupCooldown[i]
                              for i in range(1, len(reg.groupCooldown) + 1)]
    if reg.dano_condicao:
        dmgs = []
        for i in range(1, len(reg.dano_condicao) + 1):
            e = reg.dano_condicao[i]
            dmgs.append({"n": e["n"], "intervalo": e["intervalo"],
                         "valor": e["valor"]})
        d["condicao"] = {"tipo": str(reg.tipo_condicao), "dano": dmgs}

    # formula: procura o callback registrado
    fn = None
    modo = None
    for chave, m in (("cb_CALLBACK_PARAM_LEVELMAGICVALUE", "magic"),
                     ("cb_CALLBACK_PARAM_SKILLVALUE", "skill"),
                     ("cb_CALLBACK_PARAM_TARGETCREATURE", "target")):
        alvo = reg[chave]
        if alvo is None:
            continue
        nome = alvo if isinstance(alvo, str) else None
        f = lua.globals()[nome] if nome else alvo
        if f is not None:
            fn = f
            modo = m
            break
    if fn is not None:
        pontos = amostrar(lua, player, fn, modo, reg)
        if pontos:
            d["formula"] = ajustar(pontos, modo)
    return d, None


if __name__ == "__main__":
    import json
    import sys

    raiz = sys.argv[1] if len(sys.argv) > 1 else \
        "/tmp/canary_probe/data/scripts/spells"
    ok = falha = comf = 0
    for dp, _, fs in os.walk(raiz):
        for f in sorted(fs):
            if not f.endswith(".lua"):
                continue
            d, err = extrair(os.path.join(dp, f))
            if d is None or not d.get("name"):
                falha += 1
                print("FALHA", f, (err or "")[:90])
                continue
            ok += 1
            if d.get("formula"):
                comf += 1
    print("ok=%d falha=%d comFormula=%d" % (ok, falha, comf))
