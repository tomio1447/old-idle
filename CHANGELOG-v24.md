# 📦 Atualização Global-Idle — v24 (Modo BOX + Party de 4 + Avalanche fix + Exeta Res)

**Zip:** `atualizacoes/atualizacao-global-idle.zip` (tag `atualizacao-v1`).
Link direto: `https://github.com/tomio1447/old-idle/raw/refs/tags/atualizacao-v1/atualizacoes/atualizacao-global-idle.zip`

---

## 🎯 1. Modo BOX — formação tática de party com 4 membros

Novo modo de ataque **BOX** (aba Ataque do Helper, disponível para todas as
vocações). Cada vocação assume a posição dela na formação:

- **Knight:** fica no **MEIO da sala** (spawn/centro do mapa), **parado**,
  tankando — bate nos monstros e **casta o exeta res + exeta amp res**
  automaticamente (no BOX os dois são forçados, mesmo sem toggle);
- **Royal Paladin:** fica **parado ao lado do knight a 2 SQMs**, **SEMPRE nas
  RETAS (N/S/L/O) — nunca nas diagonais**, na reta que pega mais alvos, e
  bate neles de longe;
- **Druid/Sorcerer/Monk:** se posicionam (reta ou diagonal, 1-2 SQMs do
  centro) para **atingir o MÁXIMO de alvos com as magias de área** (raio 3) —
  a IA conta os monstros em volta de cada célula e escolhe a melhor,
  reavaliando a cada ~1s conforme os mobs andam.

## 👥 2. Party com limite de 4 (líder + 3) + convites visíveis

- **Limite da party agora é 4 personagens no total** (líder + 3) — local e
  servidor. Com 3 membros, o 4º convite é bloqueado com a mensagem certa.
- **Convites enviados ficam visíveis para o LÍDER**: seção "Convites enviados
  (aguardando aceite)" com botão **Cancelar convite** — resolve o caso do 4º
  personagem que "não entrava": o convite pendente não fica mais escondido,
  e cancelando o personagem volta para a lista de convidáveis.
- (O fluxo continua: o líder convida → troca para o personagem → aceita.)

## ❄️ 3. Avalanche rune — sprite do chão corrigida

- **Bug:** o alias `ice-area → ice-crystal-effect` fazia a avalanche desenhar
  no chão o efeito de **cristal de gelo** com o frame rasgado (o cristal tem
  69 quadros e o meta só 23 — `fw` de 96px cortava 3 quadros de uma vez).
- **Agora:** `ice-area` volta ao efeito **oficial do DAT** (`CONST_ME_ICEAREA`,
  9 quadros de 32px) — a poça/área de gelo correta no chão da avalanche.

## ⚔️ 4. Exeta Res reforçado (cd 5s + pega TODOS)

- **Exeta res (Challenge)** agora tem **5s de cooldown** (era 2s) e **marca
  TODOS os monstros** ao alcance 7 (antes marcava só 1). O Amp Res continua
  com 2s e 7 de alcance — no BOX o knight alterna os dois.

## 🧪 5. Testes

- **Novo `test_box_v24.js`**: avalanche (alias removido, 9 frames, sprite do
  DAT), party limite 4 + convites visíveis/canceláveis, exeta res (cd 5s,
  pega todos) e modo BOX (knight no centro, RP a 2 SQMs nas retas sem
  diagonal, mago na posição de área, boxThinkStep movendo até a formação).
- Regressão completa (party, combat, exercise, dt-seal, v21/v22/v23, market,
  account, servidor com limite 4) — **tudo verde**.

## Como atualizar

1. Baixe o zip e extraia **sobre** a pasta do jogo (substituindo os arquivos).
2. **Ctrl+F5** após atualizar.
