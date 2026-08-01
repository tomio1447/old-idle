# Status — Sistema de Prey (TibiaWiki/Prey_System + Canary)

**Fonte:** https://tibia.fandom.com/wiki/Prey_System

## O que foi implementado

### Botão
- Novo botão **PREY** ao lado do **FORGE** no topo, com o ícone oficial da
  cartinha de prey **brilhando** (GIF animado com glow dourado pulsante,
  criado a partir do `Prey_Button` oficial da wiki).
- Badge no botão mostra o tempo restante da prey ativa mais próxima.

### Sistema (`js/prey.js` + `js/prey-ui.js`)
Baseado no Canary e nas regras oficiais:

- **3 slots** (2 desbloqueados + 1 permanente comprável por 250.000 gp);
- cada slot mostra **9 criaturas aleatórias** — sempre 3 low, 3 mid e 3 high
  (faixas pelo EXP do Canary), sem repetir criatura entre slots;
- **reroll grátis a cada 20h** OU pago (**150 gp por nível**);
- ao escolher uma criatura, um **bônus é rolado** entre os 4 tipos com
  step inicial ponderado (35.5/26.5/22/11.9/4.1 — 1 a 5 estrelas da wiki):
  - **Dano**: +7% a +25% (passos de 2%);
  - **Defesa**: −12% a −30% do dano recebido (passos de 2%);
  - **Exp**: +13% a +40% (passos de 3%);
  - **Loot**: +13% a +40% (passos de 3%);
- **timer de 2 horas** que decrementa enquanto o personagem caça;
- **Prey Wildcard**: melhora o bônus (+1 passo) e pode trocar o tipo; no
  passo máximo o tipo muda com garantia;
- **Defense prey** gasta +10s de tempo extra a cada hit recebido da criatura;
- **Loot melhorado**: com bônus de X%, há X% de chance de o monstro gerar um
  **segundo conjunto de loot** (como se matasse dois).

### Aplicação no combate (`js/combat.js`)
- **EXP**: bônus aplicado no kill da criatura alvo;
- **DANO**: bônus aplicado em auto attacks, distance e imbuement elemental
  contra a criatura alvo;
- **DEFESA**: bônus aplicado no dano recebido (skills e auto attack do mob)
  da criatura alvo;
- **LOOT**: segunda rolagem de loot na morte da criatura alvo.

### Integração (`js/game.js`)
- `normalizePlayer` → `ensurePrey(p)` (migração/saves);
- `renderAll` → `renderPreyButton(p)` (badge do botão);
- `bindControls` → `bindPreyButton()`;
- loop → `preyTick(G.p, dt)` enquanto em combate.

## Arquivos alterados

| Arquivo | Mudança |
| --- | --- |
| `js/prey.js` | **novo** — dados + lógica do sistema |
| `js/prey-ui.js` | **novo** — botão + janela (3 slots, 9 criaturas, bônus, reroll, wildcard) |
| `js/combat.js` | bônus de exp/dano/defesa/loot aplicados |
| `js/game.js` | normalize + renderAll + bindControls + preyTick |
| `index.html` | botão PREY ao lado do FORGE + scripts |
| `css/style.css` | estilos do prey (janela, grid, card, botão gif) |
| `assets/ui/prey/prey-button.gif` | **novo** — cartinha brilhando (GIF animado) |

## Validação (navegador real, headless Chromium)

1. Botão com o GIF da cartinha ✓
2. `ensurePrey`: 3 slots (2 desbloqueados) ✓
3. Reroll grátis → 9 criaturas (3 low/3 mid/3 high) ✓
4. Seleção → bônus rolado (step 0-4, 2h de duração) ✓
5. Helpers: bônus só para a criatura alvo ✓
6. Prey de EXP 40% → kill real com bônus ✓
7. Wildcard: step +1; no máximo muda o tipo ✓
8. Reroll pago: 150 gp × nível ✓
9. Modal: 3 slots + 9 criaturas + botão com imagem ✓
10. Defense tick: −10s por hit ✓ · Loot chance 40% no step 9 ✓
11. Slot permanente comprável (250k) ✓
12. Zero 404/erros · combate real 9s sem travar ✓
