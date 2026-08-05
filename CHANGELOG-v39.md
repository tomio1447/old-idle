# 📦 Atualização Global-Idle — v39 (IA: sobrevivência e foco — fuga, alvo inteligente, exeta sem desperdício)

**Zip:** `atualizacoes/atualizacao-global-idle.zip` (tag `atualizacao-v1`).
Link direto: `https://github.com/tomio1447/old-idle/raw/refs/tags/atualizacao-v1/atualizacoes/atualizacao-global-idle.zip`

---

## 🏃 1. DANGER — mago/RP fogem quando um mob escapa da box

- Quando um monstro **solta da box** e chega **colado** (1 SQM) num personagem
  que **não é o knight**, o personagem **foge 1 passo** (para o vizinho mais
  distante do mob) em vez de ficar parado tomando hit.
- O **knight nunca foge** — ele é o tanque; assim que o exeta é recastado, o
  mob volta pro aggro dele.
- Vale nos modos BOX/SAFE **e** no modo normal de party (chase/follow) — a
  fuga roda antes de qualquer lógica de formação.

## 🎯 2. Alvo inteligente (party combat)

- **Antes:** todo aliado atacava o `mobs[0]` (o primeiro da fila) — a box
  demorava pra cair e mobs soltos ficavam atacando de longe.
- **Agora** (`partyAllyTarget`), por aliado:
  1. **Mob SOLTO primeiro** — qualquer mob a mais de 2 SQM do knight (os
     ranged/escapados que ele não tanka) vira prioridade, para derrubar logo
     e parar o dano nos magos;
  2. Senão, **SNIPER** — o mob vivo com **menor % de HP** (derruba a box mais
     rápido);
  3. O **knight aliado** continua mirando o **mais próximo** (não persegue
     longe — sair da box quebraria a formação).

## 🛡️ 3. Exeta inteligente (sem desperdício)

- **Antes:** o knight recastava exeta res/amp res a cada cooldown, mesmo com
  **todos** os mobs já marcados — gastava mana e spammava "EXETA RES!" à toa.
- **Agora:** o cast **só marca quem não está mais desafiado**. Com todo mundo
  marcado, não casta (economiza mana e silencia o spam); quando um mob
  **escapa ou o challenge expira**, recasta na hora e re-marca. A redução de
  20% de dano continua ativa nos marcados.

## 🧪 4. Testes

- **Novo `test_ia_v39.js`**: fuga do mago com mob colado (aumenta a
  distância), knight nunca foge, alvo inteligente (solto > sniper > knight
  próximo), exeta sem cast/mana com tudo marcado e recast com 1 desmarcado.
- Regressão completa: **30 suítes do cliente + 6 de API — verdes** (as 3
  suítes defasadas `test_market`/`test_changes`/`test_ui_fixes` continuam
  falhando exatamente como na v35 — sem relação com esta versão).

---

## 💡 Próximas ideias de IA (me diz qual implemento)

1. **Kiting em reta**: no modo kiting, correr no eixo da wave — ataca correndo
   em linha reta (a wave varre o caminho) em vez de fugir em diagonal.
2. **Prioridade de alvo no combo**: a barra de combo já considera tamanho do
   pack — dá pra fazer ela escolher o mob que maximiza a wave/área em tempo
   real (alvo = centro do maior cluster).
3. **Exeta + posicionamento sincronizados**: o mago escolhe a reta da wave
   SABENDO onde o knight vai ficar (não onde ele está) — cálculo antecipado
   do spot do knight com os mobs atuais.

## Como atualizar

1. Baixe o zip e extraia **sobre** a pasta do jogo (substituindo os arquivos).
2. **Ctrl+F5** após atualizar (limpa o cache).
