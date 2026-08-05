# 📦 Atualização Global-Idle — v27 (Upgrade visual 120fps + Loot limpo + Números pequenos)

**Zip:** `atualizacoes/atualizacao-global-idle.zip` (tag `atualizacao-v1`).
Link direto: `https://github.com/tomio1447/old-idle/raw/refs/tags/atualizacao-v1/atualizacoes/atualizacao-global-idle.zip`

---

## 🎨 1. Upgrade visual — 120fps fluido e SEM serrilhado

- **Antialiasing LIGADO:** o canvas da cena agora usa `imageSmoothingEnabled =
  true` com qualidade `high` — as bordas das sprites deixam de ficar
  "serrilhadas" (o `pixelated` forçado dava o aspecto de 30fps).
- **Resolução em devicePixelRatio (máx. 2x):** o canvas interno renderiza em
  resolução maior que o display e o navegador faz o downscale suave
  (`#scene { image-rendering: auto }`) — a cena fica nítida, sem dentes de
  serra na escala.
- **120fps:** o loop já roda em `requestAnimationFrame` — na taxa do display
  (60/120/144Hz). Com o DPR 2x + smoothing, o movimento fica fluido e sem
  o aspecto "travado" que o serrilhado causava. (O limite físico é a taxa de
  atualização do seu monitor: 120Hz → 120fps.)

## 🧹 2. Mensagens de loot reajustadas

- **Removido** o toast/flutuante à esquerda "Loot raro: ..." (que aparecia
  ao dropar item raro).
- **Removida** a mensagem verde "✦ loot" que subia na tela sobre o mob morto.
- O loot continua **no log do painel** (`Loot: ...`), com raros destacados em
  roxo — só a poluição visual foi cortada.

## 🔢 3. Números de cura/dano pela METADE

- Os números flutuantes de **cura (+X)**, **dano recebido (−X)**, **dano
  causado (−X)**, **mana (+X)** e **cura de monstro** saem agora com
  **metade do tamanho** da fonte (11px → 6px, contorno mais fino) — bem
  menos poluição numa tela idle que fica aberta por horas.
- O **XP (+X xp)** continua no tamanho normal, como o client oficial.

## 🧪 4. Testes

- **Novo `test_visual_v27.js`**: antialiasing high + DPR no renderer, CSS do
  #scene smooth, loot sem toast/floater (só log) e floaters de cura/dano com
  fonte 6px.
- Regressão completa (v21→v26, party, BOX, magic shield, combat, exercise,
  dt-seal, scan 15.x) — **tudo verde**.

## Como atualizar

1. Baixe o zip e extraia **sobre** a pasta do jogo (substituindo os arquivos).
2. **Ctrl+F5** após atualizar.
