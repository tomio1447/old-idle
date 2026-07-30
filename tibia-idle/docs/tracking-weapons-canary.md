# Tracking — scripts de arma do Canary

Levantamento do que existe em `data/scripts/weapons/scripts/` e em
`src/items/weapons/weapons.cpp` do Canary, comparado com o que o jogo já
implementa. Serve para decidir o que ainda precisa ser portado.

Fonte: `opentibiabr/canary` (main).

---

## 1. Scripts Lua de arma (`data/scripts/weapons/scripts/`)

O Canary só tem **4** scripts de arma. Todo o resto das armas é resolvido
pelos atributos do `items.xml` mais o motor em C++.

| Script | id(s) | atk | maxHitChance | Área | Efeito | Particularidade | Status aqui |
|---|---|---|---|---|---|---|---|
| `burst_arrow.lua` | 3449 | 27 | 100 | 3×3 cheio (9 SQM) | `EXPLOSIONAREA` | `COMBAT_FORMULA_SKILL` | ✅ importado |
| `diamond_arrow.lua` | 25757, 35901 | 37 | 100 | 5×5 sem cantos (21 SQM) | `ENERGYHIT` | fórmula própria, `level(150)`, `wieldUnproperly` | ✅ importado |
| `poison_arrow.lua` | 3448 | 21 | 91 | — | — | aplica condição de veneno | ✅ importado |
| `viper_star.lua` | — | 28 | 76 | — | `GREENSTAR` | `breakChance(9)` | ⚠️ arma não existe no jogo |

### Fórmula da diamond arrow (do próprio script)

```lua
local min = (player:getLevel() / 5)
local max = (0.09 * factor) * distanceSkill * attack + (player:getLevel() / 5)
```

Ou seja: **a mesma fórmula da arma de distância genérica**. A diamond arrow
não tem dano reduzido em área — cada alvo atingido leva a rolagem cheia.

---

## 2. Motor C++ (`src/items/weapons/weapons.cpp`)

### 2.1 Dano de arma de distância — `WeaponDistance::getWeaponDamage`

```
attackValue = ammo.attack + bow.attack   (+ elementDamage, se houver)
attackSkill = skill de distância
attackFactor = 1.0 attack / 0.75 balanced / 0.5 defense

minValue = level / 5
maxValue = round(0.09 * attackFactor * attackSkill * attackValue + minValue)

se a munição tem elemento e o alvo NÃO é jogador:
    maxValue /= 2 ; minValue /= 2

dano = normal_random(minValue, maxValue * vocation.distDamageMultiplier)
```

Pontos que importam:

- o **ataque do arco soma ao da flecha**; não é um ou outro;
- munição elemental troca metade do dano físico por elemental — por isso a
  divisão por 2 contra monstro;
- `normal_random` é distribuição normal, não uniforme: o resultado tende ao
  meio da faixa;
- `distDamageMultiplier` vem do vocations.xml e é 1.0 por padrão.

**Status aqui:** ✅ portado (`distanceDamage` reescrito).
Antes era `(skill + 4) * attack * 0.085 * factor`, com `min` fixo em 0.

### 2.2 Chance de acerto — `WeaponDistance::useWeapon`

Tabela por `maxHitChance` e distância, com teto de skill por faixa:

| Dist | 75 (uma mão) | 90 (duas mãos) | 100 (munição especial) |
|---|---|---|---|
| 1 e 5 | `min(skill,74) + 1` | `min(skill,74)*1.20 + 1` | `min(skill,73)*1.35 + 1` |
| 2 | `min(skill,28)*2.40 + 8` | `min(skill,28)*3.20` | `min(skill,30)*3.20 + 4` |
| 3 | `min(skill,45)*1.55 + 6` | `min(skill,45)*2` | `min(skill,48)*2.05 + 2` |
| 4 | `min(skill,58)*1.25 + 3` | `min(skill,58)*1.55` | `min(skill,65)*1.50 + 2` |
| 6 | `min(skill,90)*0.80 + 3` | `min(skill,90)` | `min(skill,87)*1.20 - 4` |
| 7 | `min(skill,104)*0.70 + 2` | `min(skill,90)` | `min(skill,90)*1.10 + 1` |

Regras em volta da tabela:

- se o quiver dá **perfect shot** (`damageX/damageY != 0`), a chance vira
  **100** e o tiro não pode errar;
- se o item tem `hitChance` próprio no items.xml, ele manda e a tabela é
  ignorada;
- sem `maxHitChance` declarado: **90** para munição, **75** para arma de
  arremesso de uma mão;
- o `hitChance` do arco é **somado** ao da munição.

**Status aqui:** ✅ portado (`hitChanceDistance`).
Antes era uma curva única `min(0.95, 0.35 + skill*0.006)`, sem distância.

### 2.3 Errar não cancela o tiro

Este é o ponto que mais muda o comportamento da diamond arrow:

```cpp
if (chance >= uniform_random(1, 100)) {
    Weapon::internalUseWeapon(player, item, target, damageModifier);
} else {
    // miss target — escolhe um tile vizinho ao alvo e acerta ELE
    ...
    Weapon::internalUseWeapon(player, item, destTile);
}
```

Quando o tiro erra, o servidor **não descarta o disparo**: sorteia uma casa
vizinha (3×3 em volta do alvo) e resolve a arma ali. Para munição com área,
isso significa que a explosão acontece de qualquer jeito — só que centrada
na casa errada. É por isso que a diamond arrow "sempre causa dano em área"
mesmo quando erra o alvo.

**Status aqui:** ✅ portado. Antes o erro fazia `return 0` e a área nunca
saía.

### 2.4 Munição consumida

`action("removecount")` — a munição some a cada tiro. O jogo já cobra a
carga em gold no lugar (decisão de design do idle), então não há mudança.

---

## 3. Munições no `items.xml`

21 munições importadas por `tools/import_ammo.py`, com `attack`, `ammotype`,
`weight`, `maxhitchance` e o elemento. As duas com área trazem também a
matriz e o nível mínimo, lidos do script Lua.

---

## 4. O que ainda NÃO foi portado

| Item | Por quê |
|---|---|
| `viper_star.lua` e o `breakChance` | a arma de arremesso quebrável não existe no jogo |
| Fight mode (attack/balanced/defense) | o jogo não tem seletor; `attackFactor` fica fixo em 1.0 |
| `distDamageMultiplier` por vocação | é 1.0 para todas as vocações no Canary padrão |
| `weaponProficiency()` | sistema de proficiência do 15.x, sem equivalente aqui |
| Munição atravessar/parar em parede | o jogo não tem `isSightClear` |
