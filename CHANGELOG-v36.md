# 📦 Atualização Global-Idle — v36 (Market P2P liberado sem API + Histórico + DB expandida)

**Zip:** `atualizacoes/atualizacao-global-idle.zip` (tag `atualizacao-v1`).
Link direto: `https://github.com/tomio1447/old-idle/raw/refs/tags/atualizacao-v1/atualizacoes/atualizacao-global-idle.zip`

---

## 🛒 1. Market player-to-player LIBERADO (modo local / offline)

- **Antes:** o Market mostrava a mensagem *"O Market player-to-player precisa do
  servidor de contas online (API). Configure `tibia-idle-api` no localStorage e
  recarregue a página"* — ou seja, só funcionava com o servidor de contas.
- **Agora:** o Market **sempre abre**. Com a API configurada (`tibia-idle-api`
  no localStorage), ele usa o servidor normalmente (P2P real entre contas).
  **Sem API, ele roda num modo LOCAL**: as ofertas ficam no localStorage do
  navegador e valem para todos os personagens do seu save (simulando outros
  jogadores), com as **mesmas regras do servidor**:
  - Vender itens do Depot (taxa de 2% do banco, oferta de 30 dias);
  - Comprar ofertas de venda (item vai pro Depot, gold sai do banco);
  - Ofertas de compra (gold travado no banco) com match automático;
  - Tibia Coins (conta local do navegador);
  - Banco do market (depositar/sacar gold);
  - Cancelar oferta devolve o item/gold.
- Novo arquivo **`js/market-local.js`** — substitui automaticamente as funções
  do Market quando a API não está configurada.

## 🧾 2. Nova aba "Histórico" no Market

- Botão **🧾 Histórico** ao lado das abas existentes (Comprar/Vender/Minhas/Tibia Coins).
- Lista as **últimas 200–600 transações**: item, quantidade, vendedor → comprador,
  preço (gp ou TC) e data.
- Com API, busca no servidor (`GET /api/market/history`); sem API, lê do localStorage.

## 🗄️ 3. DB expandida (servidor)

- **Nova tabela `market_history`** (`database.sql`): registra cada venda/compra
  concluída (vendedor, comprador, item, tier, qty, preço, TC, data) com índices
  por data e item — alimenta a aba Histórico.
- **JsonStore** (modo sem MySQL) também ganhou o histórico, persistido em
  `data/market.json` (últimos 600 trades).
- **Novo endpoint público `GET /api/rankings?by=level|kills&limit=`**: top
  personagens por nível ou por total de kills (lê `totalKills` do save via
  `JSON_EXTRACT` no MySQL / direto no JSON).

## 🧪 4. Testes

- **Novo `test_market_local_v36.js`**: valida o modo local — market abre sem
  API, sem mensagem bloqueadora, depósito, criar oferta, cancelar (refund),
  compra por outro personagem, histórico e renderização da aba.
- **Regressão completa:** 27 suítes do cliente + 6 suítes de API (market local,
  market guia, market P2P, party API, party v16, contas) — **tudo verde**
  (as 3 suítes antigas que acusam erro — `test_market`, `test_changes`,
  `test_ui_fixes` — já falhavam da mesma forma na v35: são checagens
  defasadas de versões antigas, nada quebrado nesta atualização).

---

## ⚠️ 5. Aviso: arte do Summer 2026

A imagem **`Tibia_Artwork_Summer2026.png`** (arte de background) foi anexada na
mensagem, mas **não chegou no workspace** — o anexo não persistiu no sandbox
(só sobrou um screenshot antigo de 582×542). **Reenvie a imagem** que eu aplico
como background do jogo na próxima versão.

## Como atualizar

1. Baixe o zip e extraia **sobre** a pasta do jogo (substituindo os arquivos).
2. **Ctrl+F5** após atualizar (limpa o cache — importante).
