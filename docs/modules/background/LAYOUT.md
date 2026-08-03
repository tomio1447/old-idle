# Prey System — OTClient Module (game_prey)

## Estrutura OTUI

```
modules/game_prey/
├── prey.otmod          ← Manifesto do módulo
├── prey.otui           ← Layout visual (OTUI markup)
├── prey.lua            ← Lógica do módulo (803 linhas)
└── images/             ← Sprites oficiais (stars, bonus icons, etc)
```

## Protocolo

### Server → Client
O servidor Canary envia o estado de cada slot via callbacks registrados em `g_game`:
- `onPreyActive(slot, name, outfit, bonusType, bonusValue, grade, timeLeft, freeReroll, wildcards, option)`
- `onPreyInactive(slot, timeUntilFreeReroll, wildcards)`
- `onPreySelection(slot, names[], outfits[], timeUntilFreeReroll, wildcards, option)`
- `onPreyListSelection(slot, raceIds[], nextFreeReroll, wildcards, option)`
- `onPreyLocked(slot, unlockState, timeUntilFreeReroll, wildcards)`
- `onPreyTimeLeft(slot, timeLeft)` — atualiza timer
- `onPreyFreeRerolls(slot, timeleft)` — reroll grátis
- `onPreyRerollPrice(price)` — custo do reroll pago

### Client → Server
O jogador envia ações via `g_game.preyAction(slot, action, index/option/raceId)`:
- `PREY_ACTION_LISTREROLL = 0` — rerollar lista de 9 criaturas
- `PREY_ACTION_BONUSREROLL = 1` — rerollar tipo/valor do bônus (custa 1 Wildcard)
- `PREY_ACTION_MONSTERSELECTION = 2` — escolher criatura da grade 3x3
- `PREY_ACTION_REQUEST_ALL_MONSTERS = 3` — abrir lista completa (custa 5 Wildcards)
- `PREY_ACTION_CHANGE_FROM_ALL = 4` — selecionar da lista completa
- `PREY_ACTION_OPTION = 5` — toggle auto-reroll / lock prey

## Estados do Slot

| Estado | Widget | Descrição |
|--------|--------|-----------|
| Locked (0) | LockedPreyPanel | Bloqueado — mostra botões Perm/Temp Store |
| Inactive (1) | InactivePreyPanel | Desbloqueado, sem prey — mostra grade 3x3 |
| Active (2) | ActivePreyPanel | Prey ativa — criatura + bônus + timer + ações |
| Selection (3) | InactivePreyPanel | Mostrando grade 3x3 para escolha |
| SelectionChangeMonster (4) | InactivePreyPanel | Trocando monstro (mantém bônus atual) |
| ListSelection (5) | InactivePreyPanel (fullList) | Lista completa de criaturas |
| WildcardSelection (6) | — | Wildcard em uso |

## Layout Oficial (prey.otui)

### Painéis por slot:
```
SlotPanel (210×320)
├── Label (title)
├── InactivePreyPanel
│   ├── FlatPanel (list) 195×195 — grade 3x3 de criaturas
│   ├── ChoosePrey — botão de confirmar
│   ├── SelectPreyCreature — botão pick specific
│   └── RerollButton — reroll com barra de tempo
├── ActivePreyPanel
│   ├── CreatureAndBonus
│   │   ├── UICreature (124×124) — sprite da criatura
│   │   └── FlatPanel (bonus) — ícone + 10 estrelas + timer
│   ├── BonusReroll — rerollar bônus
│   ├── SelectPreyCreature — pick specific
│   ├── RerollButton — reroll de criatura
│   ├── FlatPanel (autoReroll) — checkbox automatic bonus reroll
│   └── FlatPanel (lockPrey) — checkbox lock prey
└── LockedPreyPanel
    ├── NoCreaturePanel — ícone inativo
    └── Botões Perm/Temp Store
```

### MainWindow:
```
MainWindow (688×520)
├── SlotPanel (slot1)
├── SlotPanel (slot2)
├── SlotPanel (slot3)
├── FlatLabel (description) — tooltip text
├── GoldLabel (gold) — saldo de gold
├── CardLabel (wildCards) — saldo de Prey Wildcards
├── UIButton (openStore) — abrir loja
└── Button (closeButton) — fechar
```

### PreyTracker (miniwindow):
```
PreyTracker (miniwindow)
├── PreyCreature (slot1) — criatura + nome + ícone bônus + timer
├── PreyCreature (slot2)
└── PreyCreature (slot3)
```

## Bônus

| Tipo | Ícone Grande | Ícone Pequeno | Valor |
|------|-------------|---------------|-------|
| Damage Boost (0) | prey_bigdamage | prey_damage | 2×rarity + 5% |
| Damage Reduction (1) | prey_bigdefense | prey_defense | 2×rarity + 10% |
| XP Bonus (2) | prey_bigxp | prey_xp | 3×rarity + 10% |
| Improved Loot (3) | prey_bigloot | prey_loot | 3×rarity + 10% |

## Recursos do Jogador

- **Prey Wildcards**: moeda premium para rerolls e lock
- **Gold**: moeda comum para reroll pago (200 gp/nível)
- **Bank Balance**: saldo no banco (somado ao inventário)
- **Inventory Gold**: gold na mochila

## Integração com o Projeto

A engine já suporta o protocolo completo via `prey-module.js`.
O frontend (`tibia-idle`) já implementa a UI via `prey.js` e `prey-ui.js`.
Os sprites oficiais estão em `assets/ui/prey/`.

### Para ativar na engine:
```js
const { PreyManager } = require("./prey-module");
const prey = new PreyManager();
// Registra como módulo OTUI
require("./otui-loader").registerModule("game_prey", { manager: prey });
```
