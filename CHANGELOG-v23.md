# 📦 Atualização Global-Idle — v23 (Helper individual por personagem + Tag de Party)

**Zip:** `atualizacoes/atualizacao-global-idle.zip` (tag `atualizacao-v1`).
Link direto: `https://github.com/tomio1447/old-idle/raw/refs/tags/atualizacao-v1/atualizacoes/atualizacao-global-idle.zip`

---

## ⚙️ 1. Helper funciona em TODOS os personagens do Party Combat

- **Antes:** o Helper (cura, mana, potions, anel emergencial, magic shield,
  buff/haste, exeta, ataque com runa/magia) só rodava no personagem **ativo**.
  Os aliados só davam ataque básico e usavam o HEAL FRIEND.
- **Agora:** cada personagem da party roda o **Helper COMPLETO com a própria
  configuração**, individualmente:
  - se cura com a **magia/potion escolhida por ele** (exura gran, UH, potion…);
  - bebe **mana potion** pelo limite dele;
  - cura conditions (exana), equipa **anel/amuleto emergencial** quando o HP
    dele cai, usa **Magic Shield** (sorcerer/druid aliado), mantém o
    **buff/haste** escolhido e o **exeta res/amp res** (knight aliado);
  - ataca com a **arma e magias dele** (runa → spell → ataque básico).
- **Cooldowns independentes:** os cds de potion/cura/runa/buff/haste/magic
  shield agora são **por personagem** — o líder beber potion não trava o
  aliado, e vice-versa.
- Efeitos visuais no lugar certo: a cura/mana/buff do aliado aparece **na
  sprite dele**, e a fala da magia (bolha + log) usa o **nome do aliado**.

## 👥 2. Tag de Party ao lado do personagem (como no OTC/Canary)

- No Party Combat, cada personagem mostra a **tag de party** ao lado do nome,
  como o client oficial:
  - **⭐ estrela amarela** = líder da party;
  - **● círculo azul** = membro.
- Aparece tanto no personagem ativo quanto nos aliados da mesma instância.

## 🧪 3. Testes

- **Novo `test_party_helper.js`**: aliado se cura com a própria config,
  bebe mana, ataca com a arma dele, cooldowns de potion/cura independentes
  por personagem e tag de party no render (estrela/círculo).
- Regressão completa (party, combat fixes, monster spells, exercise, dt-seal,
  v21, v22, scan 15.x) — **tudo verde**.

## Como atualizar

1. Baixe o zip e extraia **sobre** a pasta do jogo (substituindo os arquivos).
2. **Ctrl+F5** após atualizar.
