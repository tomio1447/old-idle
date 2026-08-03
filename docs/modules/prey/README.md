# Prey System — Módulo OTUI completo (Canary + OTClient)

## Estrutura do módulo OTClient (referência)

```
modules/game_prey/
├── prey.otmod      ← manifesto do módulo (nome, dependências, scripts)
├── prey.otui       ← layout visual (Locked/Inactive/ActivePreyPanel, stars, etc)
└── prey.lua        ← lógica: eventos, callbacks, comunicação com servidor
```

## Protocolo (Canary → Client)

### Server Packets (enviados pelo servidor)

| Função | Descrição |
|--------|-----------|
| `onPreyFreeRerolls(slot, timeleft)` | Tempo até reroll grátis (minutos) |
| `onPreyTimeLeft(slot, timeLeft)` | Tempo restante da prey ativa (segundos) |
| `onPreyRerollPrice(price)` | Preço do reroll pago em gold |
| `onPreyLocked(slot, unlockState, freeReroll, wildcards)` | Slot bloqueado |
| `onPreyInactive(slot, freeReroll, wildcards)` | Slot inativo (sem prey) |
| `onPreyActive(slot, name, outfit, bonusType, bonusValue, grade, timeLeft, freeReroll, wildcards, option)` | Prey ativa |
| `onPreySelection(slot, names[], outfits[], freeReroll, wildcards, option)` | Lista de 9 criaturas (grade 3x3) |
| `onPreySelectionChangeMonster(slot, names[], outfits[], bonusType, bonusValue, grade, freeReroll, wildcards, option)` | Escolha de monstro (mantém bônus) |
| `onPreyListSelection(slot, raceIds[], freeReroll, wildcards, option)` | Lista completa de criaturas (pick specific) |
| `onPreyWildcardSelection(slot, raceIds[], freeReroll, wildcards, option)` | Wildcard ativado |

### Client Packet (enviado pelo jogador)

```
preyAction(slot, action, index/option/raceId)
```

| Action | Nome | Parâmetro |
|--------|------|-----------|
| 0 | LISTREROLL | (ignorado) |
| 1 | BONUSREROLL | (ignorado) |
| 2 | MONSTERSELECTION | index (0-8) |
| 3 | REQUEST_ALL_MONSTERS | (ignorado) |
| 4 | CHANGE_FROM_ALL | raceId |
| 5 | OPTION | option (0=untoggle, 1=autoReroll, 2=lock) |

## Estados do slot (PreyDataState_t)

| Estado | Significado |
|--------|-------------|
| 0 = Locked | Bloqueado (sem premium/permanent slot) |
| 1 = Inactive | Desbloqueado, sem prey ativa |
| 2 = Active | Prey ativa com bônus |
| 3 = Selection | Mostrando grade 3x3 para escolher criatura |
| 4 = SelectionChangeMonster | Trocando monstro (mantém bônus) |
| 5 = ListSelection | Lista completa (pick specific prey) |
| 6 = WildcardSelection | Wildcard sendo usado |

## Tipos de bônus (PreyBonus_t)

| Tipo | Descrição | Fórmula |
|------|-----------|---------|
| 0 = Damage | +7%~25% dano | 2 × rarity + 5 |
| 1 = Defense | −12%~30% dano recebido | 2 × rarity + 10 |
| 2 = Experience | +13%~40% XP | 3 × rarity + 10 |
| 3 = Loot | +13%~40% loot duplo | 3 × rarity + 10 |

## Opções (PreyOption_t)

| Opção | Custo (Prey Cards) |
|-------|---------------------|
| 0 = None | — |
| 1 = AutomaticReroll | 1 card ao expirar |
| 2 = Locked | 5 cards ao expirar |

## Rarity (estrelas): 1-10 steps
Cada reroll de bônus sobe a rarity. No step 10, rerollar garante tipo diferente.

## Configuração (config.lua)

```lua
preySystemEnabled = true
preyFreeThirdSlot = false
preyRerollPricePerLevel = 200          -- gold por nível para reroll
preySelectListPrice = 5                -- Prey Cards para selecionar
preyBonusRerollPrice = 1               -- Prey Cards para rerollar bônus
preyBonusTime = 2 * 60 * 60           -- 2 horas em segundos
preyFreeRerollTime = 20 * 60 * 60     -- 20 horas em segundos
```

## Regras

1. **3 slots**: Slot 1 sempre livre, Slot 2 com Premium, Slot 3 comprável
2. **Grade 3x3**: 3 criaturas low, 3 mid, 3 high, sem repetir entre slots
3. **Pool**: Bestiário completo do Canary (≥36 monstros registrados)
4. **Reroll grátis** a cada 20h, senão pago (gold por nível)
5. **Bônus dura 2h** de tempo de caça (decrementa enquanto hunt ativa)
6. **Wildcard**: sobe +1 rarity (pode trocar tipo com 50% chance)

## Task Hunting (sistema irmão)

Mesmo layout, mas com missões de matar N criaturas para ganhar recompensa.
