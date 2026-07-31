# Status — instâncias de item + influenced/fiendish + dust limit

## O que foi ajustado

### 1. Itens por instância
Foi adicionada uma camada de instâncias para itens equipáveis/não-stackáveis.

Impacto principal:
- itens da mochila agora podem existir como peças distintas;
- itens com tier não dependem mais apenas de `p.forge[slug]`;
- bag/depot/equip/exaltation box conseguem carregar referência por instância;
- a Forge agora pode fundir/transferir itens do mesmo slug sem ambiguidades.

## 2. Forge
- Fusion agora usa duas instâncias reais do mesmo item e mesmo tier.
- Transfer agora usa doador e alvo por instância.
- Legs e Boots entraram no conjunto global da Forge.
- Transcendence e Amplification foram ligados ao sistema.

## 3. Influenced / Fiendish
O sistema antigo tinha apenas um caminho simples de `influenced` e dropava `mystic-dust` como item fictício.

Agora:
- `Influenced` continua existindo como monstro especial;
- `Fiendish` foi adicionado como variante distinta;
- influenced/fiendish recebem marca visual no render;
- influenced mostra tag com stacks;
- fiendish mostra tag própria;
- Dust agora é ganho automaticamente no recurso da Forge, em vez de cair como item de loot pouch;
- Fiendish gera Slivers automaticamente.

## 4. Dust limit / increase dust
Foi implementado:
- `p.dustLimit` com default 100;
- aumento de limite até 325;
- custo por ponto = `dustLimit - 75`;
- botão de increase dust limit dentro da janela Resources/Convergence;
- destaque visual no botão da Forge quando o dust chega ao limite.

## 5. Efeitos globais
- Onslaught: ativo
- Ruse: ativo
- Momentum: ativo
- Transcendence: ativo
- Amplification: ativo

## Observação
Ainda existe código legado no projeto que cita `mystic-dust` fora da Forge nova, especialmente em áreas antigas de upgrade/cidade. Esse legado não é mais a fonte oficial de poeira da Forge refatorada.
