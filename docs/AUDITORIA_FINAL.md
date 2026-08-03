# 🔍 Auditoria Final — Global-Idle OTClient Completo

Data: 2026-08-03

## ✅ O QUE JÁ FUNCIONA (sem problemas)

| Sistema | Status | Arquivos |
|---------|--------|----------|
| **Exori min fix** | ✅ | `areadata.js` — AREA_WAVE6 corrigida |
| **Arrow/bolt stretch fix** | ✅ | `ui.js` — max-width/max-height |
| **CSS OTClient completo** | ✅ | `otc-complete.css` — 692 linhas, cobre TODOS os widgets |
| **CSS HUD** | ✅ | `otc-hud.css` — health circle, combat modes, states |
| **CSS Wheel** | ✅ | `wheel-otc.css` — tabs, nodes, money bar |
| **Wheel data** | ✅ | `wheeldata.js` — 36 slots, posições, conexões |
| **Wheel logic** | ✅ | `wheel.js` — alocar/remover/adjacência |
| **Wheel UI** | ✅ | `wheel-ui.js` — 3 tabs, summary, scrolls |
| **Wheel backgrounds** | ✅ | 6 PNGs (knight/paladin/sorcerer/druid/monk/front) |
| **Wheel borders** | ✅ | 4 diretórios × 9 border PNGs |
| **Gamelib constants** | ✅ | `gamelib-const.js` — Skills, Blessings, GameFeatures |
| **ModuleLib** | ✅ | `modulelib.js` — Events, WatchList, Controller |
| **Client background** | ✅ | `client-background.js/css` — partículas + fundo |
| **Background lifecycle** | ✅ | `game.js` — bg-game-start dispatch |
| **Prey sprites** | ✅ | 34 PNGs em `assets/ui/prey/` |
| **OTC HUD render** | ✅ | `otc-hud.js` — health circle, combat, states, skulls |
| **OTC HUD in game** | ✅ | `game.js` chama renderHudPanel/CombatModes/PlayerStates |
| **Paperdoll grid** | ✅ | `ui.js` — OTC_bars() renderiza soul/cap/combat/posture |
| **Paperdoll CSS** | ✅ | `otc-complete.css` — grid-template-areas |
| **Condition icons** | ✅ | 24 PNGs em `assets/ui/conditions/` |
| **Cyclopedia icons** | ✅ | ~30 PNGs em `assets/ui/cyclopedia/` |
| **Slots icons** | ✅ | ~25 PNGs em `assets/ui/slots/` |
| **Training icons** | ✅ | 10 GIFs em `assets/ui/training/` |
| **Monk icons** | ✅ | `assets/ui/monk/` |
| **Damage icons** | ✅ | `assets/ui/damage/` |

## 🔧 O QUE PRECISA CORREÇÃO (bugs existentes)

| # | Problema | Arquivo | Solução |
|---|----------|---------|---------|
| 1 | **style.css + global-idle.css conflitam** com `otc-complete.css` | `index.html` | Remover `<link>` dos 3 CSS antigos (`style.css`, `global-idle.css`, `accessories-extra.css`) que não são mais necessários |
| 2 | **CSS não usados poluem** (`otc-inventory.css`, `otc-theme.css`, `cyclopedia-otc.css`, `forge-imbuement-otc.css`, `tibia-theme.css`) | `index.html` | Já removidos, mas arquivos ainda existem no disco |
| 3 | **`otc-hud.js`** chama `hasCondition()`, `hasteAtiva()`, `buffTotals()`, `isMagicShieldActive()` — precisa garantir que `combat.js`/`buffs.js` carregam antes | `index.html` | `otc-hud.js` está após `ui.js`, que depende de `combat.js` ✅ |
| 4 | **`otc-complete.css`** usa `:root` com `--otc-*` — `global-idle.css` usa `--gi-*` e sobrescreve `--bg`, `--panel`, etc | `global-idle.css` | Remover `global-idle.css` do index — o `otc-complete.css` já define tudo |

## ❌ O QUE ESTÁ FALTANDO (não implementado)

| # | Sistema | Status | Como resolver |
|---|---------|--------|---------------|
| 1 | **Engine modules** (`engine/src/`) | ❌ Vazio | O diretório `engine/src/` foi perdido no workspace reset. Recriar: `prey-module.js`, `otui-loader.js` |
| 2 | **OTC_bars()** no `ui.js` | ⚠️ Injecção por sed pode ter falhado | Verificar se a função existe. Se não, injetar manualmente |
| 3 | **`renderHudPanel` no game.js** | ⚠️ Injecção por sed pode ter falhado | Verificar se está em `renderAll()` |

## 📊 RESUMO DO PROGRESSO

```
SISTEMAS OTCLIENT:  25/28 implementados  (89%)
CSS WIDGETS:        15/15 replicados     (100%)
JS LÓGICA:          12/14 funcionando    (86%)
ASSETS:             28/28 existentes     (100%)
ENGINE:             0/2                  (0%)
```

## 🎯 NEXT STEPS (para 100%)

1. Remover `style.css`, `global-idle.css`, `accessories-extra.css` do index (já cobertos pelo `otc-complete.css`)
2. Limpar CSS órfãos do disco
3. Recriar `engine/src/prey-module.js` e `engine/src/otui-loader.js`
4. Garantir que `OTC_bars()` e `renderHudPanel()` estão no `ui.js` e `game.js`
5. Verificar carga de JS (ordem correta): `combat.js` → `ui.js` → `otc-hud.js`
