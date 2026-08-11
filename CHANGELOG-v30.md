# 📦 Atualização Global-Idle — v30 (Reward Chest + Modal da Timira corrigido)

**Zip:** `atualizacoes/atualizacao-global-idle.zip` (tag `atualizacao-v1`).
Link direto: `https://github.com/tomio1447/old-idle/raw/refs/tags/atualizacao-v1/atualizacoes/atualizacao-global-idle.zip`

---

## 🎁 1. REWARD CHEST — drops de boss no baú de recompensas

- **Todos os drops de boss agora vão para o REWARD CHEST** (`p.rewardChest`),
  separado da Loot Pouch comum (gold/coins continuam direto no bolso).
- Botão **🎁 REWARD** ao lado do **MARKET** no topo, com **badge** mostrando
  quantos itens únicos estão no baú.
- Abrir o baú mostra as **sprites dos itens lado a lado** (como o
  baiak-idle.com), com nome + quantidade — **simples e sem poluição**.
- Botões **Recolher** (um item) e **Recolher tudo** (move para a Loot Pouch
  para vender/usar como quiser).

## 🐛 2. Modal da Timira corrigido (não abria)

- **Bug:** a Timira não tem `loot` no BOSS_DEFS (usa o loot do monstro base)
  e o modal fazia `boss.loot.map` de `undefined` — **quebrava ao abrir**.
- **Correção:** `bossLootReal()` usa o loot do BOSS_DEFS ou o do **monstro
  base** (30 drops da Timira). O modal agora abre normal.
- O modal do boss ficou **mais simples**: sprites dos drops lado a lado com
  nome + chance, menos linhas de informação.

## 🧪 3. Testes

- **Novo `test_reward_chest_v30.js`**: rollLoot de boss → reward chest (gold
  direto), botão no HTML ao lado do MARKET, Timira abrindo (bossLootReal com
  loot do base) e claim all → lootPouch.
- Regressão completa (v21→v29, party, BOX, magic shield, combat, exercise,
  dt-seal, scan 15.x) — **tudo verde** (91 scripts carregam).

## Como atualizar

1. Baixe o zip e extraia **sobre** a pasta do jogo (substituindo os arquivos).
2. **Ctrl+F5** após atualizar.
