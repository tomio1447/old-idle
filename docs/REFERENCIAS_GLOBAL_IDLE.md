# Global-Idle — Referências de Assets e Bases

Repositórios externos usados como referência para sprites, items e estrutura de dados do projeto.

## 1. Sprites e `items.xml` (15.x com look 8.60)

**URL:** https://github.com/Levi999x/15.x-with-8.60

- Contém sprites/assets do client 15.x com aparência 8.60.
- Deve ser a fonte primária de imagens de itens, efeitos, criaturas e outfits.
- Provavelmente inclui `items.xml` com IDs, nomes e flags dos itens.

## 2. Cliente do Tibia (release 15.25.0)

**URL:** https://github.com/dudantas/tibia-client/releases/tag/15.25.0a00a0

- Cliente oficial/derivado do Tibia 15.x.
- Referência para proporções de tela, tamanhos de personagens, animações e frames de sprites.
- Útil para extrair formatos de spritesheets (`assets/`, `.spr`, `.dat`, `catalog-content.json`).

## 3. Base de Dados do Projeto — Canary

**URL:** https://github.com/opentibiabr/canary

- Base geral do servidor e do jogo.
- Usado para mapeamento completo de itens, bosses, monstros, loot, spells e mecânicas.
- Itens 15x e itens de bosses devem ser migrados a partir desta base.

---

## Notas

- Os assets destes repositórios **não devem ser versionados** neste projeto sem permissão/licença adequada.
- Eles devem ser usados como referência para gerar/extrair os próprios arquivos PNG utilizados pelo cliente web.
- Veja `PLANO_MIGRACAO_ASSETS.md` para o passo-a-passo técnico de extração e integração.
