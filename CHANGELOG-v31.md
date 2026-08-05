# 📦 Atualização Global-Idle — v31 (Dano físico vermelho + Party limite 5)

**Zip:** `atualizacoes/atualizacao-global-idle.zip` (tag `atualizacao-v1`).
Link direto: `https://github.com/tomio1447/old-idle/raw/refs/tags/atualizacao-v1/atualizacoes/atualizacao-global-idle.zip`

---

## 🩸 1. Dano físico em VERMELHO (criaturas de sangue e players)

- O número de dano físico voltou ao esquema do Tibia clássico: **vermelho**
  contra criaturas de **sangue** (race `blood`) e contra **players**.
- As demais raças mantêm a cor delas: **veneno = verde**, **morto-vivo =
  cinza**, **fogo = laranja**, etc. — e o respingo de sangue acompanha.
- (Isso restaura o comportamento da v13 — a v14 tinha deixado tudo cinza.)

## 👥 2. Party com limite de 5 jogadores

- O limite da party subiu de **4 → 5 no total** (líder + 4) — no modo local
  e no servidor.
- O 6º personagem é bloqueado com a mensagem "Party cheia (máx. 5
  personagens)". O badge, os convites pendentes e o Party Combat (5 na
  mesma instância) continuam funcionando.

## 🧪 3. Testes

- **Novo `test_dano_fisico_v31.js`**: cor do dano físico por raça (blood/
  player vermelho, venom verde, undead cinza) + party com 4 membros aceitos
  (5 no total) e 6º bloqueado.
- `test_box_v24.js` e `test_scan_15x.js` atualizados para o limite 5 e o
  dano vermelho. Regressão completa (local + servidor) — **tudo verde**.

## Como atualizar

1. Baixe o zip e extraia **sobre** a pasta do jogo (substituindo os arquivos).
2. **Ctrl+F5** após atualizar.
