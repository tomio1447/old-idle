# Status — HP/Mana em números cheios + Loot de arremessáveis empilháveis + Vender tudo na bag

## 1. Barra de vida/mana com o valor cheio

**Antes:** `10.1k / 12.1k` (abreviado pelo `fmt()`).
**Depois:** `10150 / 12150` (número inteiro, como no client oficial).

- `ui.js` (`renderStats`): as barras `#bar-hp` e `#bar-mp` agora usam
  `Math.floor(...)` direto, sem o `fmt()` que abreviava em k/M/B.
- Vale para a barra de HP e a de Mana (inclusive quando a mana máxima é 0).

## 2. Loot de arremessáveis NÃO fica mais stackável… (leia abaixo)

Ajuste em `player.js` (`itemUsesInstances`): itens arremessáveis do Tibia
(assassin star, throwing star, viper star, leaf star, throwing star of Sula,
royal spear, small stone...) são **munição empilhável** — cada unidade NÃO
deve ocupar um slot da bag.

- Regra: `t === "distance"` **e sem** `imbSlots` → empilhável (1 slot por
  tipo, contagem na stack, ex.: "assassin star ×5").
- Armas de verdade (bows, crossbows, armas com imbuement slot) continuam por
  instância.
- **Migração automática**: instâncias antigas desses itens na bag são
  convertidas em quantidade na stack (`syncBagCountsFromInstances`).

## 3. Botão provisório "Vender tudo" na mochila

- Novo botão no cabeçalho da bag, com o **valor total vendável** no rótulo
  (ex.: `Vender tudo · 6.311 gp`).
- `sellAllBag(p)`: vende tudo com valor — empilhados **e** por instância —
  respeitando:
  - a marca **"Não vender"** (mesma lista da Loot Pouch);
  - **itens tierados** (da forja) nunca são vendidos;
  - itens **sem valor de venda** continuam na bag.
- Botão desabilita quando não há nada vendável.

## Arquivos alterados

| Arquivo | Mudança |
| --- | --- |
| `tibia-idle/game/js/ui.js` | barras de HP/MP com número cheio; `bagSellableValue` + `sellAllBag`; botão "Vender tudo" (com delegação de evento, sobrevive ao re-render) |
| `tibia-idle/game/js/player.js` | `itemUsesInstances` com exceção de arremessáveis; `syncBagCountsFromInstances` converte instâncias antigas em stack |

## Validação (navegador real, headless Chromium)

1. Barra HP: `185 / 185` (sem "k") — e `10150 / 12150` em personagem alto ✓
2. `addItem('assassin-star', 5)` → `p.bag['assassin-star'] = 5`, **0 instâncias**, 1 slot ✓
3. Render da bag: 1 tile "assassin star" com contagem `5` ✓
4. Migração: 2 instâncias antigas de star → stack 2; item de instância (knight-legs) **preservado** ✓
5. Botão "Vender tudo · 6.311 gp" → vende stars/fish/meat/bread/potion, credita gold,
   mantém item tierado e item sem valor ✓
6. Botão desabilita com a bag limpa ✓
7. Zero erros de console; teste no clone limpo do GitHub também OK ✓
