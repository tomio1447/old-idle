# 📦 Atualização Global-Idle — v28 (Cores do outfit dentro da Cyclopedia)

**Zip:** `atualizacoes/atualizacao-global-idle.zip` (tag `atualizacao-v1`).
Link direto: `https://github.com/tomio1447/old-idle/raw/refs/tags/atualizacao-v1/atualizacoes/atualizacao-global-idle.zip`

---

## 🎨 1. Escolha a cor do outfit dentro da Cyclopedia

- A aba **Aparências** da Cyclopedia (Personagem → Aparências) ganhou a
  seção **"🎨 Cores do outfit"** com a **paleta completa do Tibia (96 cores
  oficiais — 24×4)**, igual à paleta do client que você enviou.
- Escolha a **parte** (Cabeça / Corpo / Pernas / Pés) e clique numa cor da
  paleta — a cor é **aplicada na hora** na prévia e em **todos os visuais** da
  grade (os cards coloridos re-renderizam com a nova cor).
- A cor atual de cada parte fica marcada e mostrada (número + hex) abaixo da
  paleta.
- O save é automático — a cor persiste no personagem e aparece na cena,
  no Change Outfit e nos aliados do party combat.

## 🧪 2. Testes

- **Novo `test_cyclopedia_colors_v28.js`**: paleta com 96 cores (24×4), a
  seção renderiza com 4 partes e 96 swatches, e clicar numa cor aplica na
  parte selecionada (Cabeça/Corpo independentes).
- Regressão completa (v21→v27, party, BOX, magic shield, combat, exercise,
  dt-seal, scan 15.x) — **tudo verde**.

## Como atualizar

1. Baixe o zip e extraia **sobre** a pasta do jogo (substituindo os arquivos).
2. **Ctrl+F5** após atualizar.
