# Auditoria — Forge / Depot / Exaltation

## Diagnóstico principal

### 1) O arquivo `forge-ui.js` estava quebrado
Havia várias linhas inválidas, por exemplo:

- `.classList.add('wide','modal-wide2');`
- `var b=;`
- `.innerHTML=renderForgeModal();`

Isso gerava **erro de sintaxe** e interrompia o carregamento correto do subsistema.

### 2) Forge e Depot estavam acoplados no core
No código antigo (`forge.js`), a tentativa de forja:

- removia o item do equipamento,
- colocava o resultado automaticamente na `exaltationBox`,
- incrementava `depotNotification`.

Ou seja: **a Forge dependia do Depot para funcionar**. Esse é o motivo estrutural de os dois botões/sistemas parecerem “ligados”.

### 3) As regras implementadas não batiam com a referência enviada
A referência do usuário (`tibiaduality.com/pt-exaltation-system`) descreve:

- slots oficiais: **armor, helmet, weapon**
- efeitos oficiais: **Ruse, Momentum, Onslaught**
- operações oficiais: **Fusion** e **Transferência**
- recursos oficiais: **Dust, Slivers, Exalted Cores**
- tiers máximos por classificação: **1->1, 2->2, 3->3, 4->10**

O sistema antigo usava:

- slots extras (`legs`, `boots`)
- efeitos custom (`Transcendence`, `Amplification`)
- progressão custom por tier
- dusts em 4 camadas (`basic/refined/pristine/exalted`)
- upgrade direto de item em vez de fusion/transfer

### 4) O Depot estava incompleto
O sistema antigo tinha funções de depot, mas sem fluxo consistente de armazenamento manual pela UI.

### 5) Limitação de arquitetura ainda existente
O inventário da mochila ainda agrupa itens por `slug` (`p.bag[slug] = count`).

Isso impede modelar 100% do comportamento oficial da Forge quando existem várias cópias do mesmo item com tiers diferentes, porque o jogo ainda não trata cada peça como uma instância individual.

## Refactor aplicado

### UI
- reescrita completa de `tibia-idle/game/js/forge-ui.js`
- correção do modal da Forge
- correção do modal do Depot
- separação visual entre Forge e Depot
- Forge agora mostra:
  - Fusion
  - Transferência
  - Resources / Convergence
- Depot agora mostra:
  - grade do depot
  - armazenamento manual a partir da mochila
  - Exaltation Box apenas como **legado de save antigo**

### Core da Forge
- reescrita de `tibia-idle/game/js/forge.js`
- Forge desacoplada do Depot
- remoção do fluxo automático “forjou -> vai para depot/exaltation box”
- implementação de:
  - `forgeFuse(...)`
  - `forgeTransfer(...)`
  - `forgeConvergenceDustToSlivers(...)`
  - `forgeConvergenceSliversToCore(...)`
- manutenção de compatibilidade mínima com saves antigos

### Dados da Forge
- reescrita de `tibia-idle/game/js/forgedata.js`
- alinhamento das tabelas com a regra oficial descrita na referência:
  - classificação máxima
  - efeitos por slot
  - chance por tier
  - custos de fusion
  - custos de transferência
  - convergence Dust -> Slivers -> Core

### Combate
- integração dos efeitos oficiais em `tibia-idle/game/js/combat.js`
  - **Ruse**: pode evitar golpes recebidos
  - **Onslaught**: pode aplicar +60% de dano
  - **Momentum**: pode reduzir cooldowns em 2s após spell/potion

## O que ainda falta para ficar 100% oficial

### Refactor estrutural maior: inventário por instância
Hoje ainda falta um refactor mais profundo para suportar perfeitamente:

- várias cópias do mesmo item com tiers diferentes
- donor/target independentes sem trava por quantidade
- itens tierados coexistindo em mochila/depot/equip sem ambiguidade

### Lucky rolls especiais da Fusion
A referência fala de chances especiais como:

- não consumir o segundo item
- não consumir gold
- não consumir dust
- não consumir core
- subir 2 tiers
- duplicar resultado

Esses efeitos especiais ainda **não foram portados** neste refactor.

## Arquivos alterados

- `tibia-idle/game/js/forgedata.js`
- `tibia-idle/game/js/forge.js`
- `tibia-idle/game/js/forge-ui.js`
- `tibia-idle/game/js/combat.js`

## Validação executada

Foi executado `node --check` em todos os arquivos JS da pasta `tibia-idle/game/js`.

Resultado: **0 erros de sintaxe**.
