# 📦 Atualização Global-Idle — v41 (IA tática: prioridade por classe, exeta preventivo, potions inteligentes)

**Zip:** `atualizacoes/atualizacao-global-idle.zip` (tag `atualizacao-v1`).
Link direto: `https://github.com/tomio1447/old-idle/raw/refs/tags/atualizacao-v1/atualizacoes/atualizacao-global-idle.zip`

---

## 🎯 1. Prioridade de alvo POR CLASSE (party combat)

O alvo inteligente agora entende o **papel** de cada monstro na box (dados do
Canary) e derruba na ordem certa:

1. **Mob solto** (fora da box — danger imediato);
2. **HEALER** — monstro com `defSkills: healing` (cura os outros da box e
   prolonga a luta): prioridade máxima na box, mesmo com mais HP;
3. **DEBUFFER** — monstro com `meleeCond`/skill de condição (envenena,
   paralisa, cega): derruba antes de aplicar debuff;
4. **SNIPER** — o de menor % de HP.

O knight aliado continua mirando o mais próximo (não sai da box).

## 🛡️ 2. EXETA PREVENTIVO

- **Antes:** o exeta só marcava mobs dentro do alcance do knight (7 SQM) — o
  mob que escapava e corria pro mago só era marcado quando entrava no raio.
- **Agora:** no modo BOX, um mob **desmarcado que já está colado num aliado**
  (a ≤ 2 SQM de um não-knight) é marcado **mesmo fora do raio normal** (o
  alcance estende para 9 SQM): o knight "grita" para o mob que está chegando
  nos magos **antes** de ele dar dano — junto com a fuga do danger (v39), o
  mob volta pro aggro quase sem bater em ninguém.

## 💊 3. Potions inteligentes (beber antes sob pressão)

- **Antes:** o helper bebia a potion de vida no threshold configurado — com
  uma box cheia batendo, esperar 50% de HP era tarde demais.
- **Agora:** quando o personagem está **sob pressão** (4+ mobs colados, a box
  cheia), o threshold de vida sobe **+15 pontos** (máx. 95%): bebe/casta a
  cura **antes** do normal. Fora da pressão, o comportamento segue o config.

## 🧪 4. Testes

- **Novo `test_ia_v41.js`**: prioridade por classe (healer > debuffer >
  sniper), exeta preventivo (mob a 8 SQM do knight mas colado no druid é
  marcado) e potion sob pressão (bebe a 60% com config 50 quando 4 mobs
  colados; não bebe sem pressão).
- Regressão completa: **32 suítes do cliente + 6 de API — verdes** (as 3
  suítes defasadas de sempre continuam falhando como na v35, sem relação).

---

## 💡 Próximas ideias de IA (me diz qual implemento)

1. **Refill inteligente**: repor supplies/arrows só quando sobrar o bastante
   para terminar a hunt (evita voltar à cidade toda hora).
2. **Agressividade por risco**: config por hunt (ex.: "só ataca pack ≤ 5",
   "foge se HP < 20% e mobs > 2") — o jogador calibra o apetite de risco.
3. **Prioridade de loot**: o loot bag já vende por valor — dá pra colar a
   prioridade de coleta no alvo (matar o mob de loot raro primeiro).
4. **Rota de farm**: na hunt de área, o personagem anda uma rota cíclica
   entre os spawns (em vez de parar no primeiro) — farm ativo sem idle.

## Como atualizar

1. Baixe o zip e extraia **sobre** a pasta do jogo (substituindo os arquivos).
2. **Ctrl+F5** após atualizar (limpa o cache).
