# 📦 Atualização Global-Idle — v38 (IA dos personagens: sem correria, posição de wave e box perfeita)

**Zip:** `atualizacoes/atualizacao-global-idle.zip` (tag `atualizacao-v1`).
Link direto: `https://github.com/tomio1447/old-idle/raw/refs/tags/atualizacao-v1/atualizacoes/atualizacao-global-idle.zip`

---

## 🧠 1. Ninguém mais fica correndo sem motivo (anti-oscilação)

O problema: o "melhor spot" da formação mudava a cada tick dos monstros, e o
personagem **trocava de destino a cada reavaliação** — na prática ele ficava
andando de um lado pro outro sem nunca parar (dava pra ver o RP/mago "dançando"
entre retas iguais).

- **Histerese no destino:** o personagem só troca de posição-alvo se o novo
  spot for **pelo menos 20% melhor** que o atual (ou se o atual ficou ocupado).
  Mudança de 1 mob a mais não faz mais ninguém sair correndo.
- **Reavaliação mais lenta:** 1,5s (antes 1s).
- **Caminho bloqueado:** em vez de tentar de novo a cada 250ms (ficava
  "dançando" na frente do bloqueio), espera **500ms**.
- **Bug corrigido:** o occ (mapa de ocupação) inclui o próprio personagem —
  sem o ajuste, ele "via a célula ocupada por ele mesmo" e trocava de reta
  para sempre. Agora, parado NA posição, **fica parado** encarando o alvo.

## 🌊 2. Magos: procuram o tile da WAVE (reta com o knight a 3 SQM)

Os magos (druid/sorcerer/monk) continuam a **3 SQM em linha reta** do knight
(nunca diagonal), mas agora a reta é escolhida pela **wave**:

- Para cada uma das 4 retas, a IA calcula quantos mobs da box a **wave reta**
  do mago pegaria — usando a **mesma geometria oficial do Canary**
  (`AreaCombat::setupArea(length, spread)`, a idêntica do dano real) — com o
  caster no tile candidato mirando o knight.
- Score da reta = `mobs na wave × 10` + `mobs no raio de área × 1` — o mago
  escolhe a reta que **alinha a wave dele com a box** (ex: se a box está na
  coluna do knight, ele vai para o norte/sul; se está na fileira, leste/oeste).
- **Distribuição:** se outro aliado já está numa reta, ela perde um pouco no
  score — os magos se espalham por retas diferentes em vez de empilhar.

## 🛡️ 3. Knight: escolhe a melhor posição da sala (box de 8)

O knight agora **varre a sala inteira** (não só 7x7 ao redor do centro) e
escolhe o spot com, em ordem de prioridade:

1. **Adjacência livre** — ideal 8: toda a volta dele desimpedida para os
   **8 monstros** chegarem e ele tankar todos os lados. Célula com menos de 5
   lados livres nem é considerada (encostado na parede não tanka box);
2. **Corredores para os magos** — as retas cardeais a 3 SQM desimpedidas
   (1+2+3 células livres), para as waves chegarem na box;
3. **Mobs no alcance** do exeta amp res (7 SQM) e do melee (1 SQM);
4. Mais perto do **centro da sala** (espaço para waves dos dois lados).

## 🧪 4. Testes

- **Novo `test_ia_v38.js`**: knight escolhe spot com 8 adjacências livres
  (nunca canto de parede com 3), mago escolhe a reta da wave (norte com 3
  mobs na linha vs sul com 1), histerese (não troca com +10%, troca com
  +30%), parado na posição fica parado.
- `test_box_v24.js` atualizado: o RP chega na reta a 2 SQM e **FICA parado**
  (antes o teste "aceitava" a oscilação sem querer).
- Regressão completa: **29 suítes do cliente + 6 de API — verdes** (as 3
  suítes defasadas `test_market`/`test_changes`/`test_ui_fixes` continuam
  falhando exatamente como na v35 — não têm relação com esta versão).

---

## 💡 Dicas de IA para desenvolvermos juntos

1. **Danger/sobrevivência:** se um mob fugir da box e vier no mago, ele dá um
   micro-passo de fuga para o lado oposto e só volta à formação quando o
   knight retomar o aggro (exeta recast).
2. **Foco no alvo:** cada mago mira o mob da box com **menos HP** (sniper)
   em vez de todos atacarem o mesmo, derrubando a box mais rápido.
3. **Prioridade de mob:** matar primeiro os **ranged** (que não entram na box)
   — o knight não tanka eles e eles castam de longe.
4. **Exeta inteligente:** o knight recasta exeta res quando detecta mob solto
   passando dos magos, sem depender do timer fixo.
5. **Kiting do mago:** no modo kiting, escolher o eixo da wave em vez de só
   manter distância — ataca correndo em reta.

## Como atualizar

1. Baixe o zip e extraia **sobre** a pasta do jogo (substituindo os arquivos).
2. **Ctrl+F5** após atualizar (limpa o cache).
