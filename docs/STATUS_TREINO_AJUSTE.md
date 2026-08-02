# Status — Ajuste do Treino (animação, Ferumbras Dummy, Exercise Wraps)

**Fonte:** https://www.tibiawiki.com.br/wiki/Exercise_Weapons

## O que foi corrigido/implementado

### 1. Personagem NÃO flutua mais
- Removido o **bob senoidal** (`Math.sin(Date.now()/340)*2`) que fazia o
  personagem "flutuar" na sala de treino. Agora a sprite fica **fixa no
  chão**, como no client e no baiakidle.

### 2. Animação de golpe correta (mesma pegada do Canary)
- Antes o golpe usava um lunge sinusoidal (`sin(prog*PI)`) que fazia o
  personagem **avançar e voltar "quicando"** — animação errada.
- Agora, durante o golpe (~180ms): o personagem **avança um passo fixo** em
  direção ao dummy e **alterna os frames 1/2 da outfit** (o swing do braço),
  exatamente como as animações de ataque do combate. Entre golpes ele fica
  parado no chão.

### 3. Dummy agora é o FERRUMBRAS EXERCISE DUMMY
- Substituído o "poste com saco" desenhado proceduralmente pelo **sprite
  oficial do Ferumbras Exercise Dummy** (TibiaWiki, 64×64 — a estátua do
  Ferumbras com a base de pedra).
- Nome da sala: **"Ferumbras Dummy Safezone"** e rótulo acima do dummy:
  "Ferumbras Exercise Dummy".

### 4. Exercise Wraps adicionado (faltava o do Monk)
- Nova exercise weapon **Exercise Wraps** (GIF oficial 64×64 animado (upscaling nearest-neighbor da TibiaWiki)) —
  treina **fist fighting** (punho), a skill do Monk.
- A lista do modal agora tem **8 exercise weapons** (Sword, Axe, Club, Bow,
  Rod, Wand, Shield, Wraps), todas com compra de 5000 cargas por 25 TC.

## Arquivos alterados

| Arquivo | Mudança |
| --- | --- |
| `assets/ui/training/exercise-wraps.gif` | **novo** — GIF oficial do Exercise Wraps (wiki) |
| `assets/ui/training/ferumbras-dummy.gif` | **novo** — sprite oficial do Ferumbras Exercise Dummy (wiki) |
| `js/render.js` | sem bob (fixo no chão); golpe com avanço fixo + alternância de frames; dummy Ferumbras com sprite oficial |
| `js/training.js` | `EXERCISE_WEAPONS` com 8 itens (adicionado `exercise-wraps` → skill `fist`) |

## Validação (navegador real, headless Chromium)

1. 8 exercise weapons registradas (wraps com skill fist) ✓
2. Modal lista 8 weapons com GIF do wraps carregando ✓
3. Comprar wraps por 25 TC e treinar: hits acontecendo, 1 carga/golpe ✓
4. Skill treinada = fist (punho) ✓
5. Animação finita (lungeT decresce, sem loop infinito) ✓
6. Sprite do Ferumbras Dummy carrega e aparece na cena (pixels
   azulados/roxos da estátua confirmados no render) ✓
7. Regressão: combate real funcionando, zero erros de console ✓
