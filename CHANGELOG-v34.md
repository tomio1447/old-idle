# 📦 Atualização Global-Idle — v34 (Modal alto corrigido)

**Zip:** `atualizacoes/atualizacao-global-idle.zip` (tag `atualizacao-v1`).
Link direto: `https://github.com/tomio1447/old-idle/raw/refs/tags/atualizacao-v1/atualizacoes/atualizacao-global-idle.zip`

---

## 🪟 1. Modal da party (e outros modais altos) corrigido

- **Bug:** o modal usava `align-items: center` no flexbox — quando o conteúdo
  fica alto (party com 5 membros + convites + Analyser), o topo do modal é
  **cortado para fora da tela** (o conteúdo "estoura e vai para o fundo" e
  não rola).
- **Correção:** o `.modal-bg` agora tem `overflow-y: auto` e o `.modal` tem
  `margin: auto` — o modal **centraliza quando cabe** e **rola quando
  estoura** (o topo fica sempre acessível). Aplicado no `layout.css` e no
  `otc-complete.css`.

## 🧪 2. Testes

- **Novo `test_modal_v34.js`**: valida `overflow-y: auto` no modal-bg e
  `margin: auto` no modal nos dois CSS.
- Regressão completa (v21→v33, party, BOX, reward chest, combat, dt-seal,
  scan 15.x) — **tudo verde**.

## Como atualizar

1. Baixe o zip e extraia **sobre** a pasta do jogo (substituindo os arquivos).
2. **Ctrl+F5** após atualizar.
