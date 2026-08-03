# 🎨 Global-Idle — Auditoria Visual OTClient

Comparando `/data/images/game/` do OTClient com `/tibia-idle/game/assets/`

## ✅ JÁ IMPLEMENTADO

| Sistema OTClient | Status | Arquivos |
|-----------------|--------|----------|
| **Wheel of Destiny** | ✅ Visual + Lógica | `wheel.js`, `wheel-ui.js`, `wheeldata.js`, `wheel-otc.css`, `assets/wheel/` |
| **Prey System** | ✅ Visual + Lógica | `prey.js`, `prey-ui.js`, `assets/ui/prey/` |
| **Imbuement** | ✅ Visual + Lógica | `imbuement.js`, `imbuement-ui.js`, `imbuementdata.js`, `forge-imbuement-otc.css` |
| **Forge** | ✅ Visual + Lógica | `forge.js`, `forge-ui.js`, `forgedata.js`, `forge-imbuement-otc.css` |
| **Cyclopedia** | ✅ Visual + Lógica | `cyclopedia.js`, `cyclopedia-ui.js`, `cyclopedia-otc.css` |
| **Client Background** | ✅ Visual | `client-background.js/css` |
| **Spell Icons** | ✅ | `assets/spell/otc/`, `assets/spell/otc20/` |
| **Monster Sprites** | ✅ | `assets/mob/` |
| **Item Sprites** | ✅ | `assets/item/` |
| **Missiles** | ✅ | `assets/missile/` |
| **Effects/FX** | ✅ | `assets/fx/` |
| **Outfits** | ✅ | `assets/outfit/`, `assets/appearance/` |
| **Gamelib Constants** | ✅ | `gamelib-const.js` |
| **ModuleLib** | ✅ | `modulelib.js` |

## 🔧 PRECISA ATUALIZAR

| Sistema | OTClient dir | O que falta | Prioridade |
|---------|-------------|-------------|------------|
| **Health Circle HP/Mana** | `healthcircle/` | Arcos HP/Mana estilo Tibia: `left_full/empty.png`, `right_full/empty.png`, `bottom_full/empty.png`, `right_extra_full/empty.png` (Mana Shield) | 🔴 ALTA |
| **Combat Modes** | `combatmodes/` | Ícones oficiais: `whitedovemode`, `whitehandmode`, `yellowhandmode`, `redfistmode`, `safefight` | 🔴 ALTA |
| **Battle List** | `battle/` | Ícones por vocação: `icon-battlelist-knight/paladin/sorcerer/druid/monk/monster/npc` | 🟡 MÉDIA |
| **States/Flags** | `states/` | `player-state-flags.png` — ícones de estado (poison, burn, haste, etc) | 🟡 MÉDIA |
| **Creature Icons** | `creatureicons/` | Ícones de criatura (skull, party, etc) | 🟡 MÉDIA |
| **Emblems** | `emblems/` | Emblemas de guild/party | 🟢 BAIXA |
| **Shields** | `shields/` | Party shield icons | 🟢 BAIXA |
| **Skulls** | `skulls/` | Skull icons (yellow, green, white, red, black, orange) | 🟢 BAIXA |
| **Top Bar** | `topbar/` | Ícones de topbar stats | 🟢 BAIXA |
| **Spells** | `spells/` | Ícones de magia adicionais | 🟢 BAIXA |
| **NPC Icons** | `npcicons/` | Ícones de NPC no battle | 🟢 BAIXA |
| **Analyzer** | `analyzer/` | Party Analyzer icons | 🟢 BAIXA |
| **Console** | `console/` | Chat console icons | 🟢 BAIXA |
| **Crosshair** | `crosshair/` | Crosshair | 🟢 BAIXA |
| **Tutorial** | `tutorial/` | Tutorial hints | 🟢 BAIXA |
| **VIP List** | `viplist/` | VIP list icons | 🟢 BAIXA |
| **Enter Game** | `entergame/` | Enter game screen | 🟢 BAIXA |
| **Slots** | `slots/` | Inventory slot backgrounds (already have via CSS) | 🟢 BAIXA |

## 📊 Progresso Geral: ~55% completo

- ✅ Sistemas principais (wheel, prey, forge, imbuement, cyclopedia): **100%**
- ✅ Backgrounds, sprites, effects: **100%**
- ✅ Libs (gamelib, modulelib): **100%**
- 🔧 HUD (health circle, combat modes, battle list): **30%**
- 🔧 States/flags/creature icons: **10%**
- 🔧 Menores (skulls, shields, emblems, analyzer): **0%**
