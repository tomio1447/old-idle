# 📦 Atualização Global-Idle — v40 (IA de precisão: kiting em reta, combo com alvo dinâmico, posição sincronizada)

**Zip:** `atualizacoes/atualizacao-global-idle.zip` (tag `atualizacao-v1`).
Link direto: `https://github.com/tomio1447/old-idle/raw/refs/tags/atualizacao-v1/atualizacoes/atualizacao-global-idle.zip`

---

## 🏹 1. Kiting em RETA (a wave acompanha o caster)

- **Antes:** no modo Kiting, o personagem fugia em **diagonal** (`stepAway`) —
  ele saía da linha do alvo e a **wave** (que é reta, no eixo dominante) não
  pegava o pack enquanto ele corria.
- **Agora:** foge/aproxima **ao longo do eixo dominante** (a linha da wave) —
  `stepKiteLine`. O caster corre na mesma fileira/coluna do alvo, então a wave
  varre o caminho dele. Sem mais zig-zag diagonal no kiting.

## 🎯 2. Combo com ALVO DINÂMICO

- **Antes:** a barra de combo atacava o alvo que vinha do targeting (o primeiro
  mob ou o alvo do party) — a área podia pegar 2 quando dava pra pegar 8.
- **Agora:** quando o slot do combo exige pack (`N+` alvos), o jogo escolhe o
  mob que **MAXIMIZA o número de alvos da área** (o centro do maior cluster) e
  lança a magia/runa NELE. O requisito "4+" continua contando com a matriz real
  da área (`areaCount`), agora aplicada ao melhor alvo.

## 🧭 3. Posição SINCRONIZADA com o knight

- **Antes:** o mago/RP escolhia a reta a 3/2 SQM de onde o knight **está agora**.
  Quando o knight se movia para o spot da box, as retas ficavam desalinhadas e
  os aliados "corrigiam" depois.
- **Agora:** o mago/RP se alinha com o spot que o knight **ESCOLHEU**
  (`_boxTarget`, a decisão dele com histerese) — as retas já nascem alinhadas
  com a box final. Se o knight ainda não decidiu, usa o mesmo cálculo previsto
  (`boxKnightSpot`) que ele vai fazer. Resultado: a wave do mago nasce apontada
  para onde o knight VAI tankar.

## 🧪 4. Testes

- **Novo `test_ia_v40.js`**: kiting em reta (eixo dominante, nunca diagonal),
  combo escolhe o centro do cluster (3 alvos vs 1 do alvo original), posição
  sincronizada (mago a 3 SQM do spot ESCOLHIDO do knight, wave pega os 4 mobs).
- `test_ia_v38.js` e `test_box_v24.js` atualizados: pina o `_boxTarget` do
  knight (a decisão dele) — o comportamento novo alinha as retas com o spot
  escolhido, não mais com a posição atual.
- Regressão completa: **31 suítes do cliente + 6 de API — verdes** (as 3
  suítes defasadas de sempre continuam falhando como na v35, sem relação).

---

## 💡 Próximas ideias de IA (me diz qual implemento)

1. **Prioridade de mob por classe**: o alvo inteligente já derruba soltos
   primeiro — dá pra refinar escolhendo por tipo (matar o mob que mais cura /
   o que casta debuff antes dos demais).
2. **Exeta preventivo**: o knight marca antecipadamente o mob que está saindo
   do alcance do box (fronteira), antes de ele chegar nos magos — fuga quase
   nunca dispara.
3. **Uso de potions inteligente**: beber potion só quando o próximo hit do mob
   derrubaria o personagem (em vez de manter 100% o tempo todo).

## Como atualizar

1. Baixe o zip e extraia **sobre** a pasta do jogo (substituindo os arquivos).
2. **Ctrl+F5** após atualizar (limpa o cache).
