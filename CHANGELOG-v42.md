# 📦 Atualização Global-Idle — v42 (IA de risco e loot: agressividade configurável + prioridade de loot)

**Zip:** `atualizacoes/atualizacao-global-idle.zip` (tag `atualizacao-v1`).
Link direto: `https://github.com/tomio1447/old-idle/raw/refs/tags/atualizacao-v1/atualizacoes/atualizacao-global-idle.zip`

---

## ⚖️ 1. Agressividade por RISCO (configurável)

Novos controles no config de cada personagem (Helper → Ataque):

- **`maxPackSize`** — tamanho máximo de pack que o personagem encara
  (0 = sem limite). Se os mobs vivos passarem disso, ele **recua** do centro
  do pack em vez de atacar. Ex.: `maxPackSize: 5` → com 7 mobs na tela, sai.
- **`fleeBelowHp`** + **`fleeMobCount`** — se o HP cair abaixo de `fleeBelowHp`%
  e houver `fleeMobCount`+ mobs colados, ele **recua antes de morrer**.
  Ex.: `fleeBelowHp: 30` + `fleeMobCount: 3` → com 30% de HP e 3 mobs em cima,
  foge.
- **O knight na formação (BOX/SAFE) nunca foge por pack grande** — ele é o
  tanque da box (só recua por HP baixo). O recuo vale para o jogador ativo
  fora da formação, aliados do party e modos chase/follow.

## 💰 2. Prioridade de LOOT no alvo

Nova flag **`lootPriority`** (config): quando ligada, o aliado do party combat
mira o mob de loot mais valioso em vez do sniper puro:

- **Item raro primeiro** — mob com loot de preço de venda ≥ 300 gp e chance
  < 50% (ex.: plate-armor, magic-longsword) → derruba o "jackpot" antes;
- Senão, o de **maior valor esperado** (chance × quantidade × preço do loot);
- A ordem de segurança continua valendo: mob solto > healer > debuffer só são
  superados pelo loot depois desses. O valor usa o preço de venda real
  (`GAMEDATA.items[].sell` + moedas fixas: gold 1 / platinum 100 / crystal 10k).

## 🧪 3. Testes

- **Novo `test_ia_v42.js`**: boxRiscoFoge (maxPackSize e fleeBelowHp recuam na
  hora; knight na box não foge por pack; config zerado nunca foge), a fuga no
  formationThinkStep anda para longe do centro do pack, mobLootValue/mobLootRaro
  e o partyAllyTarget com lootPriority mira o mob de loot raro mesmo com mais
  HP.
- Regressão completa: **33 suítes do cliente + 6 de API — verdes** (as 3
  suítes defasadas de sempre continuam falhando como na v35, sem relação).

---

## 💡 Próximas ideias de IA (me diz qual implemento)

1. **Refill inteligente**: repor supplies/arrows só quando sobrar o bastante
   para terminar a hunt (evita voltar à cidade toda hora).
2. **Rota de farm**: na hunt de área, o personagem anda uma rota cíclica entre
   os spawns (em vez de parar no primeiro) — farm ativo sem idle.
3. **Exibir os novos controles na UI do Helper**: os campos maxPackSize /
   fleeBelowHp / lootPriority hoje são config (funcionam no save), mas dá para
   colocar interruptores visuais na aba Ataque.

## Como atualizar

1. Baixe o zip e extraia **sobre** a pasta do jogo (substituindo os arquivos).
2. **Ctrl+F5** após atualizar (limpa o cache).
