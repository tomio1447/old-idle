# 📦 Atualização Global-Idle — v37 (Poluição visual do combate reduzida)

**Zip:** `atualizacoes/atualizacao-global-idle.zip` (tag `atualizacao-v1`).
Link direto: `https://github.com/tomio1447/old-idle/raw/refs/tags/atualizacao-v1/atualizacoes/atualizacao-global-idle.zip`

---

## 🔢 1. Escala de fontes dos números flutuantes (dano > cura)

Os números de dano/cura agora usam uma **escala de 3 fontes**, com hierarquia clara:

- **Fonte 3 — dano: `bold 12px`** (o maior e mais visível). Vale para o dano que
  você dá no monstro, o dano que você recebe e o dano do treinamento.
- **Fonte 2 — cura HP/mana: `9px`** (menor que o dano, discreta). Vale para as
  curas de vida (`+X` verde), curas de aliados (`+X → nome`) e recuperação de
  mana (`+X mana` azul).
- **Fonte 1 — `5px`** preservada para os textos bem pequenos que ainda usavam
  ela (o resto da interface não foi mexido).

Antes, dano e cura saíam **todos com 5px** (v33) — tudo parecia igual e
ninguém distinguia o que era dano do que era cura.

## ⏱️ 2. Tempo de exibição reduzido

- **Dano: 1,5s** na tela (antes 1,9s–2,4s).
- **Cura HP/mana: 1,2s** na tela (antes 1,9s).

Números somem mais rápido → menos acúmulo de texto na cena.

## 🐌 3. Monstros mais parados

A movimentação dos monstros foi reduzida para a cena ficar mais calma:

- **600ms parados antes de se mover de novo** (antes 200ms) — o bicho que está
  no alcance fica parado um tempo antes de reagir/trocar de SQM;
- **Chance de ficar parado (em vez de "dançar") subiu de 90% → 96%** (piso de
  90% mesmo para os monstros cujo dado do Canary permite dançar mais);
- **Vaguear sem alvo ficou bem mais raro** (25% → 10%).

## ✨ 4. Dano de Holy mais chamativo

- Cor do dano **Holy/Sagrado**: `#ffe680` (amarelo pálido) → **`#ffd400`**
  (amarelo forte/vivo) — dá pra ver o dano sagrado de longe.

## 🧪 5. Testes

- **Novo `test_policao_visual_v37.js`**: valida a escala de 3 fontes nos 2
  loops de render, os tempos (dano 1500ms / cura 1200ms), a cor do holy
  `#ffd400`, o `MOB_STAND_MS=600` no `monsterThinkStep`, o staticChance 96%
  com piso 90 e o wander 0.10.
- `test_visual_v27.js` atualizado para a nova escala (antes checava só o 5px).
- Regressão completa: **27 suítes do cliente + 6 de API — verdes** (o
  `test_combat_fixes` é probabilístico e passou 3/3 no re-run; os 3 testes
  defasados `test_market`/`test_changes`/`test_ui_fixes` continuam falhando
  exatamente como já falhavam na v35, sem relação com esta versão).

## Como atualizar

1. Baixe o zip e extraia **sobre** a pasta do jogo (substituindo os arquivos).
2. **Ctrl+F5** após atualizar (limpa o cache).
