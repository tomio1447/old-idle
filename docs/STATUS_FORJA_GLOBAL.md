# Status atual — Forja alinhada ao global

## Implementado nesta etapa

### Efeitos globais conferidos e ajustados
- **Onslaught**: implementado no combate.
  - agora aplica **+60% de dano extra**
  - somando ao crítico/extra damage, sem multiplicação errada em cascata
- **Ruse**: implementado no combate.
  - evita completamente o golpe quando ativa
- **Momentum**: implementado no combate.
  - rola a cada 2s em combate
  - reduz **2s do cooldown individual e dos grupos secundários**
- **Transcendence**: implementado no combate.
  - agora está no **slot legs**
  - ativa Avatar Stage 3 por **7s**
  - concede **15% de redução de dano recebido**
  - todos os ataques ficam críticos com **+15% critical extra damage**
- **Amplification**: implementado.
  - agora está no **slot boots**
  - amplifica as chances de proc de armor / helmet / weapon / legs
  - a UI já calcula a chance amplificada

## Ajustes de dados da Forge
- slots válidos atualizados para:
  - armor
  - helmet
  - weapon
  - legs
  - boots
- tabelas atualizadas para incluir:
  - Transcendence
  - Amplification
- UI da Forge atualizada para mostrar itens elegíveis desses slots

## Limitação ainda existente
A única limitação estrutural séria que continua de pé é o inventário ainda ser por `slug -> count`.

Isso significa que o sistema **ainda não é 100% idêntico ao global** em cenários que exigem distinguir várias cópias do mesmo item com tiers diferentes ao mesmo tempo.

Exemplo de problema que ainda pode existir:
- duas cópias do mesmo item, uma T2 e outra sem tier, na mochila
- donor e receptor com o mesmo slug em transfer

Para fechar isso 100%, ainda será necessário um refactor de inventário por instância.
