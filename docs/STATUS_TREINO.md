# Status — Sistema de Treino (Skill Trainer / Exercise Weapons, TibiaWiki)

**Fontes:**
- https://tibia.fandom.com/wiki/Skill_Trainer_(All)
- https://tibia.fandom.com/wiki/Exercise_Sword (e demais exercise weapons)
- https://tibia.fandom.com/wiki/Exercise_Dummy

## O que foi implementado

### Botão TREINO na topbar (ao lado da FORGE)
- Novo botão **TREINO** logo após o ⚒ FORGE, com o **GIF oficial do
  Skill Trainer (All)** da TibiaWiki (64×64 animado) como ícone.
- Abre o modal do Sistema de Treino com **2 abas**.

### Aba 1 — 🎯 Treino com Dummy (Exercise Dummy)
- Lista as **7 exercise weapons oficiais** (GIFs 64×64 animados (5 frames, upscaling nearest-neighbor da TibiaWiki)):
  Exercise Sword, Axe, Club, Bow, Rod, Wand e Shield.
- Cada linha mostra: ícone, nome, **skill treinada** (Sword/Axe/Club →
  melee; Bow → distance; Rod/Wand → Magic Level; Shield → shielding) e o
  **número de cargas** que o jogador tem.
- Botão **"Buy 5000x charges a 25 Tibia Coins"** ao lado das cargas:
  usa o saldo de **Tibia Coins da conta** (desabilitado sem TC; mostra o
  saldo no topo da aba). 25 TC → +5000 cargas.
- **Iniciar treino**: escolhe a weapon e entra na sala com o **Exercise
  Dummy** (poste com saco desenhado na cena, com barra e contador de
  cargas).
- **Regras do Canary aplicadas**:
  - **1 carga por golpe**; sem cargas, o treino **encerra** com aviso;
  - **Skill tick**: 7 tries por golpe (600 mana spent para Magic Level)
    × taxa do dummy — mesma fórmula do servidor (`EXERCISE_TRIES`/
    `EXERCISE_MANA`), agora com a skill **da exercise weapon** (não do
    equipamento);
  - Shielding ganha tries em todos os golpes (exceto exercise shield, que
    já é o próprio golpe de shielding);
  - **Regen de stamina 3:1** (3 min reais → 1 min de stamina).

### Aba 2 — 🧘 Treino Online (Treiner)
- O treino antigo da academia, agora rotulado **Treino Online**: sem
  custo (nenhuma carga/TC), treina a skill da arma equipada, mages
  acumulam mana spent, distance não consome munição, todos ganham
  shielding.
- **Regen de stamina 1:1** (1 min real → 1 min de stamina).

### Animações
- No modo dummy o personagem faz a **animação de golpe** (lunge em direção
  ao dummy a cada hit, como o atkPush dos mobs no combate), com efeito de
  impacto (`block-hit` / `magic-blue`) e números de dano no dummy — as
  mesmas animações de ataque do combate do Canary.
- No modo online mantém o visual atual do Treiner.

## Arquivos alterados

| Arquivo | Mudança |
| --- | --- |
| `assets/ui/training/skill-trainer-all.gif` | **novo** — GIF oficial do Skill Trainer (All) (64×64) |
| `assets/ui/training/exercise-*.gif` (7) | **novos** — GIFs das exercise weapons (64×64 animados, upscaling nearest-neighbor da TibiaWiki) |
| `js/training.js` | **novo** — `EXERCISE_WEAPONS`, cargas (`ensureTraining`), compra com TC (`buyExerciseCharges`), `startDummyTraining`, `startOnlineTraining`, `trainingStaminaRate` |
| `js/training-ui.js` | **novo** — botão TREINO + modal 2 abas (dummy/online) |
| `js/tibiacoin.js` | `accountSpendCoins(n)` (gastar TC da conta) |
| `js/city.js` | `newAcademyTraining(p, mode, weapon)`; tick do dummy (skill da weapon, 1 carga/golpe, para sem cargas, lunge) |
| `js/game.js` | regen de stamina por modo (3:1 dummy / 1:1 online); `drainAcademyEvents` para dummy; bind do botão |
| `js/render.js` | `drawAcademy` com Exercise Dummy (poste+saco, barra, cargas) e animação de lunge |
| `index.html` | botão TREINO na topbar + scripts |
| `css/style.css` | estilos do botão e do modal (lista, compra) |

## Validação (navegador real, headless Chromium)

1. Botão TREINO com GIF do Skill Trainer ✓
2. Modal com 2 abas ✓
3. 7 exercise weapons com ícones carregando ✓
4. Cargas iniciais 0; botão compra desabilitado sem TC ✓
5. +100 TC → compra 5000 cargas de sword (gasta 25, sobra 75) ✓
6. UI atualiza para 5.000 cargas ✓
7. Treino dummy: modo/weapon corretos, hits, consumo de 1 carga/golpe ✓
8. Skill treinada = sword (da weapon, não do equipamento) ✓
9. Regen 3:1 no dummy medido (~2s em 6s) ✓
10. Treino online: modo correto, regen 1:1 medido (~4s em 4s) ✓
11. Compras de bow/rod/shield OK; falha sem TC ✓
12. Skill up REAL no dummy (sword subiu) ✓
13. Cargas zeram → treino encerra ✓
14. Regressão: combate real funcionando, zero erros de console ✓
