# 📦 Atualização Global-Idle — v29 (Imagem bugada removida + Visual nítido sem blur)

**Zip:** `atualizacoes/atualizacao-global-idle.zip` (tag `atualizacao-v1`).
Link direto: `https://github.com/tomio1447/old-idle/raw/refs/tags/atualizacao-v1/atualizacoes/atualizacao-global-idle.zip`

---

## 🗑️ 1. Imagem bugada removida (paleta de cores da Cyclopedia)

- A seção **"🎨 Cores do outfit"** que foi adicionada na v28 dentro da
  Cyclopedia renderizava uma **imagem bugada** — foi **removida** por
  completo (o seletor de cores volta a ser apenas o "Change Outfit" do
  modal de personagem, que sempre funcionou).

## 🔍 2. Visual corrigido — sem serrilhado E sem embaçado

- **Problema da v27:** o antialiasing (bilinear) ligado no canvas deixava a
  imagem **embaçada**.
- **Correção (v29):** o canvas continua renderizando em **devicePixelRatio
  (máx. 2x)** — resolução dobrada — mas o desenho volta para
  **nearest-neighbor (`imageSmoothingEnabled=false`)**: pixel art **nítido**.
- O navegador faz o downscale 2:1 do canvas para o tamanho CSS
  (`#scene { image-rendering: auto }`), então o resultado é **crisp e sem
  serrilhado** — o melhor dos dois mundos.
- O loop continua em `requestAnimationFrame` (60/120/144Hz), fluido.

## 🧪 3. Testes

- `test_visual_v27.js` atualizado: valida DPR 2x + nearest (sem blur) e a
  remoção do smoothing; o teste da v28 foi removido junto com a feature.
- Regressão completa (v21→v28, party, BOX, magic shield, combat, exercise,
  dt-seal, scan 15.x) — **tudo verde**.

## Como atualizar

1. Baixe o zip e extraia **sobre** a pasta do jogo (substituindo os arquivos).
2. **Ctrl+F5** após atualizar.
