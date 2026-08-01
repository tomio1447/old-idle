# Status — Sistema de Party + Party Hunt Analyser (TibiaWiki/Party)

**Fontes:**
- https://tibia.fandom.com/wiki/Party
- https://tibia.fandom.com/wiki/Party_Hunt_Analyser

## O que foi implementado

### Botão
- Novo botão **👥 PARTY** no topo (ao lado de FORGE/PREY) com **badge do
  número de membros**.

### Sistema (`js/party.js` + `js/party-ui.js`)
- **Criar party** convidando personagens do próprio save (roster) — os
  outros chars viram membros e ganham XP de verdade no save deles.
- Gerenciar: convidar, remover, sair do party (máx. 5 no total).

### Shared Experience (fórmula oficial da wiki)
```
Exp = M × S ÷ P × C
```
- **M** = exp base do monstro · **S** = bônus de vocações · **P** = nº de
  membros · **C** = bônus individual (stamina/prey do líder já entra no exp).
- Bônus por **vocações DIFERENTES** (wiki): 1 voc = **20%**, 2 = **35%**,
  3 = **70%**, 4+ = **100%**.
- **Requisito da wiki**: o menor nível do party ≥ **2/3 do maior**
  (ex.: 40 e 60 compartilham; 200 e 300 também).
- Aplicado **de verdade**: o líder recebe `floor(M·S/P)` e cada membro do
  roster recebe a mesma parte com **level-up incluso** (`addExp`).
- Toggle "Compartilhar experiência" na janela (só com membros e condições ok).

### Party Hunt Analyser (wiki)
- Registra a **sessão da última caçada**: duração, kills, exp total, itens de
  loot e a tabela **por membro** (exp ganha, kills, level-ups) — como o
  analisador do client (até 50 membros; aqui o limite prático é 5).
- Integrado ao kill do combate: quando o share está ativo, cada kill
  distribui a exp e atualiza a sessão (líder + membros).

### Correção incluída: Prey de EXP
- O commit anterior do Prey não tinha integrado o **bônus de EXP** no
  `combat.js` (só dano/defesa/loot). Este pacote **inclui o prey de EXP**
  (+13~40%) no cálculo do kill, antes da divisão do party.

## Arquivos alterados

| Arquivo | Mudança |
| --- | --- |
| `js/party.js` | **novo** — lógica (membros, share, sessão, aplicação ao roster) |
| `js/party-ui.js` | **novo** — botão + janela (membros, convites, share, analisador) |
| `js/combat.js` | prey de EXP (faltava) + party share no kill + sessão |
| `js/game.js` | normalize (`ensureParty`), `renderPartyButton`, `bindPartyButton` |
| `index.html` | botão 👥 PARTY + scripts |
| `css/style.css` | estilos do party (membros, convites, analisador) |

## Validação (navegador real, headless Chromium)

1. Botão PARTY ✓
2. `partyAvailableMembers` lista chars do save ✓
3. Convidar knight+druid → bônus **35%** (2 vocações) ✓
4. `partyShareExp(1000)` → S=1.35, P=2, líder 675, membro 675 ✓
5. `partyApplyToMember(5000)` → level-up real no roster (nv 8) ✓
6. Sessão: kills/exp/loot por membro ✓
7. Kill real com party: sessão atualizada (5 kills, 2 membros) ✓
8. Modal com membro + analisador ✓
9. Regressão: combate 9s com 4 kills, zero erros ✓
