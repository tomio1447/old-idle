# Plano de Migração Global-Idle — Assets 15.x + Canary

## Objetivo

Trocar toda a base visual do jogo para sprites/itens do Tibia 15.x (com look 8.60), alinhando dados de itens, monstros e bosses ao repositório Canary, e ajustar a UI para se parecer com o cliente do Tibia.

## 1. Análise dos Repositórios de Origem

### 1.1 `Levi999x/15.x-with-8.60`
- Verificar estrutura de pastas (`assets/`, `data/`, `images/`).
- Localizar `items.xml` e mapear `id` → `name`/`slug`.
- Identificar spritesheets ou PNGs já extraídos de:
  - items
  - creatures/outfits
  - effects
  - projectiles
  - interface

### 1.2 `dudantas/tibia-client` (release 15.25.0)
- Baixar release.
- Identificar formatos de assets:
  - `Tibia.spr` / `Tibia.dat`
  - `assets/catalog-content.json`
  - `.bmp`/`.png` de interface
- Definir ferramenta de extração (`tibia-sprites-extractor`, `TibiaPNG`, etc.).

### 1.3 `opentibiabr/canary`
- Localizar definições de itens (`data/items/items.xml`).
- Localizar definições de monstros/bosses (`data/monsters/`).
- Extrair tabela de loot, stats, spells e aparências.

## 2. Estrutura de Assets do Jogo Atual

Atualmente em `tibia-idle/game/assets/`:

```
assets/
  item/       -> ícones de itens (slug.png)
  mob/        -> sprites de monstros (slug_s.png, slug_w.png...)
  outfit/     -> sprites de personagens (nome_d.png, nome_s.png...)
  ground/     -> fundos de caçada
  fx/         -> efeitos
  npc/        -> sprites de NPCs
  city/       -> tiles da cidade
```

## 3. Estratégia de Extração

### Opção A — PNGs já extraídos (ideal)
Se o repositório `15.x-with-8.60` já tiver PNGs organizados, copiar/renomear para `assets/`.

### Opção B — Extrair do cliente 15.x
Se os assets estiverem em formato binário `.spr`/`.dat`:
1. Usar ferramenta de extração compatível com Tibia 11+.
2. Gerar PNGs por ID do asset.
3. Criar mapeamento `client-id` → `slug-do-jogo`.

### Opção C — Sprite sheet + JSON
Se houver `catalog-content.json` + spritesheets:
1. Parse do JSON para obter offsets/sizes.
2. Cropar spritesheets em arquivos individuais.

## 4. Migração de Itens

1. Importar `items.xml` do Canary e/ou `15.x-with-8.60`.
2. Parsear IDs, nomes, categorias, atributos (`weight`, `attack`, `defense`, `armor`, etc.).
3. Cruzar com sprites extraídas para gerar `slug.png` em `assets/item/`.
4. Atualizar `GAMEDATA.items` em `tibia-idle/game/js/gamedata.js`.
5. Garantir que itens de bosses e itens 15.x estejam incluídos.

## 5. Migração de Monstros / Bosses

1. Parsear arquivos XML de monstros do Canary.
2. Para cada monstro, obter:
   - nome
   - HP, experiência, aparência/looktype
   - loot (chance/quantidade)
3. Cruzar com sprites de criaturas.
4. Atualizar `GAMEDATA.monsters` e `GAMEDATA.hunts`.

## 6. Ajustes de UI

- Refinar `global-idle.css` para imitar o cliente 15.x:
  - barras de vida/mana/experiência
  - janelas de NPCs
  - inventário com slots 32x32
  - fonte e sombreamento do client
- Ajustar tamanho de personagens/outfits no canvas para refletir a proporção 15.x.

## 7. Animação / Frames

- Mapear frames de caminhada/parado por vocação/outfit.
- Atualizar `Sprites.walk()` e `Renderer` para suportar múltiplos frames.
- Considerar usar spritesheets com `drawImage` recortando frames.

## 8. Ferramentas Recomendadas

- `tibia-sprites-extractor` / `tibia-png` — extração de `.spr`/`.dat`.
- Python + Pillow — crop de spritesheets.
- Node script customizado — geração de `gamedata.js` a partir de XML.

## 9. Riscos

- Copyright: não versionar assets originais do Tibia.
- Tamanho: repositórios grandes; extrair localmente pode consumir disco.
- Formato: cliente 15.x pode usar compressão/encriptação diferentes das versões antigas.
- Mapeamento: IDs do client 15.x podem não bater com IDs do Canary.

## 10. Próximos Passos Imediatos

1. Confirmar qual formato de assets está disponível nos repositórios.
2. Decidir se será feita extração local ou se o usuário já possui PNGs prontos.
3. Criar scripts de conversão (Python/Node) para automatizar mapeamento.
4. Aplicar assets em lotes pequenos (itens → monstros → outfits → efeitos).
