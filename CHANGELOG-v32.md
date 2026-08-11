# 📦 Atualização Global-Idle — v32 (Inventário compacto + amulet/helmet/backpack na linha + ammo só RP)

**Zip:** `atualizacoes/atualizacao-global-idle.zip` (tag `atualizacao-v1`).
Link direto: `https://github.com/tomio1447/old-idle/raw/refs/tags/atualizacao-v1/atualizacoes/atualizacao-global-idle.zip`

---

## 🎛️ 1. Abas da esquerda menores (HP e inventário)

- Barras de **Vida/Mana/XP/Stamina** reduzidas (14px → **9px**, fonte 10px →
  8px) — o painel do personagem fica bem mais compacto.
- **Inventário (Mochila/Loot Pouch)** com itens menores (38px → **32px**) e
  menos espaçamento.
- Painéis com padding reduzido (8px → 5px) — a coluna esquerda encolheu.

## 🔀 2. Equipamento reposicionado (como na print do baiak-idle)

- A grade de equipamento foi reordenada:
  - **Linha 1:** Amuleto · Elmo · Mochila (backpack)
  - **Linha 2:** Corpo (armor) · Arma · Escudo
  - **Linha 3:** Pernas · Anel · Botas
  - **Canto:** Extra Slot
- O slot de **munição (arrow)** saiu da grade fixa.

## 🏹 3. Slot de arrow APENAS para RP

- O slot **AMMO (munição)** só aparece no equipamento para **RP (paladino)**.
  Para Knight, Sorcerer, Druid e Monk o slot some da grade — quem não usa
  arco não vê mais o slot de flecha.

## 🧪 4. Testes

- **Novo `test_equip_layout_v32.js`**: SLOT_ORDER com amulet/helmet/backpack
  na primeira linha (sem ammo), renderEquip sem slot ammo p/ knight e com p/
  RP, e CSS com barra 9px + inv 32px.
- Regressão completa (v21→v31, party, BOX, reward chest, combat, dt-seal,
  scan 15.x) — **tudo verde**.

## Como atualizar

1. Baixe o zip e extraia **sobre** a pasta do jogo (substituindo os arquivos).
2. **Ctrl+F5** após atualizar.
