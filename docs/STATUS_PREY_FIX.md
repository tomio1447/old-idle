# Status — Prey System corrigido para o padrão do client global (Canary)

## Problema relatado
"As criaturas não estão sendo exibidas" na janela de Prey.

## Causa
A lista de 9 criaturas **só era gerada depois de clicar em Reroll** — ao
abrir a janela, os slots apareciam vazios com a mensagem "Clique em Reroll
para gerar a lista". No client global, **a lista já vem pronta** ao abrir.

Além disso, o pool de criaturas usava apenas os monstros das **hunts**
(limitado e com nomes repetidos entre faixas), em vez do **bestiário
completo do Canary**.

## Correções (baseadas na estrutura do Canary)

### 1. `js/prey.js`
- **`ensurePrey`**: todo slot desbloqueado que não tem lista agora **gera as
  9 criaturas automaticamente** ao carregar/abrir (como o client).
- **`preyMonsterPool`**: o pool agora é o **MONSTERDATA completo do Canary**
  (1600+ criaturas) filtrando pelas que têm sprite de combate (`MOBSHEETS`,
  1564 criaturas) — com fallback para as hunts se o MONSTERDATA não existir.
- **`preyRerollList`**: sorteia **3 low + 3 mid + 3 high** (faixas por EXP do
  Canary: <200 / <1000 / >=1000), embaralhadas, sem repetir criatura entre
  slots. Distribuição real do Canary: 607 low · 261 mid · 780 high — sempre
  completa.
- Removida a recursão `ensurePrey ⇄ preyRerollList` (guard interno).

### 2. `js/prey-ui.js` — layout do client
- Janela com **3 slots lado a lado** (grid 3 colunas), cada um com:
  - header: nome do slot + botões **Reroll** (grátis 20h / pago) e
    **Wildcard**;
  - quando ativa: card da criatura selecionada + **bônus com estrelas**
    (1–10) + valor % + **timer de 2h**;
  - **grade 3×3 de criaturas** (sprite + nome) sempre visível;
- Slot bloqueado mostra "Comprar (250.000 gp)".

### 3. `css/style.css`
- Grid de 3 colunas para os slots (responsivo: 1 coluna em telas estreitas),
  grade 3×3 das criaturas com sprite + nome e destaque de seleção dourado.

## Validação (navegador real, headless Chromium)

1. Abrir a janela → **2 slots desbloqueados com 9 criaturas cada** (18) ✓
2. Todas as 18 criaturas com **sprite** (mobImg) ✓
3. Selecionar criatura → bônus rolado (step 0–4, valor %) ✓
4. Reroll → nova lista de 9 (diferente) ✓
5. Faixas exatas: **3 low / 3 mid / 3 high** ✓
6. Comprar slot permanente → 3º grid com 9 criaturas (27 no total) ✓
7. Nomes visíveis (0 vazios) ✓
8. Zero erros de console ✓
