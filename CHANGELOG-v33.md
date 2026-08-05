# 📦 Atualização Global-Idle — v33 (BOX magos 3 SQM + sem Chase/Stand + números menores + sprites maiores)

**Zip:** `atualizacoes/atualizacao-global-idle.zip` (tag `atualizacao-v1`).
Link direto: `https://github.com/tomio1447/old-idle/raw/refs/tags/atualizacao-v1/atualizacoes/atualizacao-global-idle.zip`

---

## 🧙 1. Modo BOX — druids/sorcerers a 3 SQM em linha reta

- No modo **BOX**, Druid/Sorcerer/Monk agora ficam a **3 SQMs de distância em
  linha reta** do knight (nunca diagonais) — na reta que maximiza mobs
  dentro do raio das magias de área. Ficam parados na posição da formação.

## 🧍 2. Removidas as opções Chase/Stand

- As opções **Chase** e **Stand** foram removidas do seletor de Modo de Hunt
  (aba Ataque e modal de instância). Restam: **Kiting / BOX / SAFE**.
- O personagem agora **SEMPRE fica em STAND**: parado encarando o alvo, e só
  **se movimenta quando o bot (alvo) sai do alcance** — persegue o alvo para
  manter o ataque, como pedido.

## 🔢 3. Números de dano e cura AINDA menores

- Os floaters de **cura/dano/mana** foram reduzidos de 6px → **5px** (contorno
  mais fino) — ainda mais discretos no idle.

## 🖼️ 4. Sprites dos monstros e do jogador maiores

- Jogador, aliados do party combat, monstros e o corpse agora usam uma escala
  **1.18× maior** (`creatureScale`) que o tile nativo — as criaturas ficam
  mais visíveis sem quebrar o grid.

## 🧪 5. Testes

- **Novo `test_box_mage_v33.js`**: magos a 3 SQM reta no BOX, sem
  Chase/Stand na UI, small 5px e creatureScale 1.18× em 5 pontos.
- `test_visual_v27.js` e `test_sprite_center.js` atualizados. Regressão
  completa — **tudo verde**.

## Como atualizar

1. Baixe o zip e extraia **sobre** a pasta do jogo (substituindo os arquivos).
2. **Ctrl+F5** após atualizar.
