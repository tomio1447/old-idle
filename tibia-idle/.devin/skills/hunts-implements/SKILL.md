---
name: hunts-implements
description: Implementa hunts, bosses, mapas, monstros, sprites e loot no Tibia-Idle
triggers:
  - user
  - model
---

Ao implementar ou atualizar hunts e bosses:

1. Use os dados do Canary para stats, spells, resistências, loot, lookType/lookTypeEx e posições fornecidas pelo usuário.
2. Antes de publicar o OTBM, analise todos os andares e determine o andar jogável, bounds reais e células caminháveis. Calcule e valide:
   - `centerroom`: célula caminhável mais próxima do centro geométrico da arena;
   - `bossspawn`: célula caminhável central com espaço visual e distância segura da entrada;
   - `playerspawn`: célula caminhável distante do boss, sem parede/objeto bloqueante e dentro do FOV;
   - confirme que os três pontos permanecem dentro do recorte e não se sobrepõem.
3. Publique o OTBM em `game/maps/`, importe todos os tiles e confira bounds/FOV/spawn.
   - Ao analisar OTBM no Node, nunca passe `fs.readFileSync(path).buffer` diretamente: `Buffer.buffer` pode incluir bytes externos ao arquivo por causa do pool. Use `const b = fs.readFileSync(path); const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);`.
   - Sempre teste explicitamente todos os pisos prováveis. Mapas auxiliares do Dream Courts têm um único tile em `z=13`, mas a arena completa em `z=14`; deixar o parser escolher automaticamente faz o mapa parecer 1x1.
4. Verifique que cada monstro possui sprite e metadados compatíveis com seu formato. Itens `lookTypeEx`, sprites sem direções e criaturas 2x2 não podem usar automaticamente o layout padrão de 4 direções.
5. Para cada item de loot, confirme:
   - registro em `GAMEDATA.items`;
   - sprite PNG em `game/assets/item/`;
   - `sell` e `npcSell` com fonte oficial (primeiro os NPCs do Canary; depois TibiaWiki).
6. Liste separadamente todo item sem comprador ou valor oficial. Antes de atribuir valor customizado, pergunte ao usuário qual preço estabelecer. Não invente nem use 1 gp como fallback.
   - Itens atualmente confirmados sem comprador NPC: Cheesy Key, Golden Sea Horse Figurine e Plushie of Tentugly.
7. Adicione ou atualize testes que validem existência da definição, sprite e preço de cada loot.
8. Teste sintaxe, carregamento, spawn, renderização no mapa e exibição em modal antes de concluir.
