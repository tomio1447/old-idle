# Status — Upgrade visual do Sistema de Prey

## Resumo

Upgrade visual do **Sistema de Prey** usando os **assets oficiais do otclient**
(OpenTibiaBR), trazendo a interface do jogo real para o idle. A lógica do
sistema (slots, criaturas, bônus, reroll, wildcards, timer) foi mantida.

## Assets importados (assets/ui/prey/*.png)

Extraídos de `data/images/game/prey/` do otclient:

| Asset | Uso |
| --- | --- |
| `topbutton-prey.png` | ícone oficial do botão PREY na topbar |
| `prey_bigdamage/defense/xp/loot.png` | ícone GRANDE do bônus no card ativo |
| `prey_bignobonus.png` | ícone grande padrão (sem bônus) |
| `prey_star.png` / `prey_nostar.png` | estrelas cheia/vazia do grau do bônus |
| `prey_wildcard.png` | ícone do Prey Wildcard |
| `prey_damage/defense/xp/loot.png` | ícone pequeno do tipo de bônus (reserva) |
| `prey_no_bonus.png` | ícone pequeno padrão |
| `balanceBg.png`, `panel_flat.png`, `prey_choose/reroll/select*.png`, etc. | assets auxiliares importados (fundo, botões) |

## Mudanças visuais

- **Botão da topbar**: usa o **ícone oficial** do otclient (`topbutton-prey.png`).
- **Card da criatura + bônus** (`prey-creature-bonus`): replica o layout
  `CreatureAndBonus` do cliente — criatura (96px) à esquerda + caixa de bônus
  à direita.
- **Caixa de bônus**: usa o **ícone grande oficial** do bônus (`prey_big*.png`),
  nome colorido, valor em % e **estrelas reais** (`prey_star`/`prey_nostar`)
  numa **grade 5×2** (10 estrelas), como no client.
- **Barra de tempo restante** (`prey-timer-bar`): barra de progresso com a cor
  do cliente (#C28400) mostrando o tempo restante da prey.
- **Prey Wildcard**: ícone oficial (`prey_wildcard.png`) no botão e na carteira.
- **Grade de criaturas**: sprite da criatura em caixa dedicada + nome.

## Botões e layout OFICIAIS do Tibia (replicando o prey.otui)

A interface agora usa **todos os botões oficiais de imagem** do otclient:

| Botão oficial | Asset | Uso |
| --- | --- | --- |
| Reroll | `prey_reroll.png` | rerrolla a lista de criaturas do slot (com preço embaixo) |
| Choose | `prey_choose.png` | escolher criatura da lista |
| Select | `prey_select_blocked.png` | selecionar a criatura marcada (painel ativo) |
| Bonus Reroll | `prey_bonus_reroll.png` | rerrolla o bônus da prey ativa |
| Store Perm | `prey_perm_test.png` | desbloqueia o slot permanente (loja) |
| Store Temp | `prey_temp_test.png` | usa um slot temporário (loja) |
| Inactive | `prey_biginactive.png` | criatura placeholder no slot bloqueado |

- **Slot bloqueado** replica o `LockedPreyPanel`: painel com criatura inativa +
  os dois botões de loja (Perm/Temp) empilhados, como no client.
- **Painel ativo** (`ActivePreyPanel`): card CreatureAndBonus + barra de tempo +
  botões de imagem (Bonus Reroll / Select / Reroll) no rodapé do slot.
- **Painel inativo** (`InactivePreyPanel`): grade 3×3 de criaturas + botões
  Choose / Reroll.
- **Estrelas**: sprites oficiais `prey_star`/`prey_nostar` em grade 5×2.

## Arquivos alterados / criados

| Arquivo | Mudança |
| --- | --- |
| `assets/ui/prey/*.png` | **novos** — assets oficiais do otclient (30+ PNGs, incl. botões) |
| `js/prey-ui.js` | layout oficial: card criatura+bônus, estrelas reais, barra de tempo, botões de imagem Reroll/Choose/Select/BonusReroll/Perm/Temp |
| `css/style.css` | CSS dos botões oficiais, slot bloqueado, estrelas grid, timer bar |
| `index.html` | botão PREY usa o ícone oficial do otclient |

## Validação (navegador real, headless Chromium) — 12/12

1. Modal abre ✓
2. 3 slots (2 desbloqueados + 1 bloqueado) ✓
3. Slot bloqueado tem botões de loja Perm/Temp (oficiais) ✓
4. Botão Reroll oficial presente nos slots ✓
5. Botão Choose oficial presente ✓
6. Clicar numa criatura ativa a prey (card de bônus aparece) ✓
7. Ícone grande do bônus presente ✓
8. Grade de 10 estrelas renderizada ✓
9. Barra de tempo restante presente ✓
10. Botão Bonus Reroll presente no slot ativo ✓
11. Botão Reroll presente no slot ativo ✓
12. Sem erros de página relacionados à prey ✓
