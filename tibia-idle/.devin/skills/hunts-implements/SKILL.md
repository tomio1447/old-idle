---
name: hunts-implements
description: Implementa hunts, bosses, mapas, monstros, sprites e loot no Tibia-Idle
triggers:
  - user
  - model
---

Ao implementar ou atualizar hunts e bosses:

1. Use os dados do Canary para stats, spells, resistências, loot, lookType/lookTypeEx e posições fornecidas pelo usuário.
2. Publique o OTBM em `game/maps/`, importe todos os tiles e confira bounds/FOV/spawn.
3. Verifique que cada monstro possui sprite e metadados compatíveis com seu formato. Itens `lookTypeEx`, sprites sem direções e criaturas 2x2 não podem usar automaticamente o layout padrão de 4 direções.
4. Para cada item de loot, confirme:
   - registro em `GAMEDATA.items`;
   - sprite PNG em `game/assets/item/`;
   - `sell` e `npcSell` com fonte oficial (primeiro os NPCs do Canary; depois TibiaWiki).
5. Liste separadamente todo item sem comprador ou valor oficial. Antes de atribuir valor customizado, pergunte ao usuário qual preço estabelecer. Não invente nem use 1 gp como fallback.
   - Itens atualmente confirmados sem comprador NPC: Cheesy Key, Golden Sea Horse Figurine e Plushie of Tentugly.
6. Adicione ou atualize testes que validem existência da definição, sprite e preço de cada loot.
7. Teste sintaxe, carregamento, spawn, renderização no mapa e exibição em modal antes de concluir.
