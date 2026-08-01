# Status — Forja Canary (Dust/Slivers/Exalted Cores) + Barra de Status + Tooltip de Tier

## 1. Forja com sprites oficiais (fim do dust verde)

O `mystic-dust` (poeira mística verde, criada antes do Canary) foi **removido**:

- `assets/item/mystic-dust.png` deletado;
- definição do item removida do `core.js` (com migração: saves antigos convertem
  o que tinham na lootPouch/mochila para o **Dust da Forja** `p.dust`, respeitando
  o dustLimit);
- ferreiro da cidade (`city.js`/`city-ui.js`): o upgrade agora consome o recurso
  oficial `p.dust` (Dust da Exaltation Forge), com textos atualizados;
- todas as referências de UI trocadas.

**Novos sprites oficiais da TibiaWiki** (animados, como no client):
- `assets/item/dust.gif` — **Dust** (recurso da forja, 20 frames);
- `assets/item/sliver.gif` — **Sliver** (8 frames);
- `assets/item/exalted-core.gif` — **Exalted Core** (10 frames);

Aplicados em toda a forja (`forge-ui.js` + `style.css`):
- abas Fusion/Transfer/Conversion com os tiles animados;
- botões "Improve to 65% / Reduce to 50%" (fusão) mostram o Exalted Core;
- carteira (wallet), resumo e linhas de conversão com os ícones oficiais.

## 2. Barra de status estilo Tibia (Special Conditions)

Nova barra **logo abaixo dos equipamentos** (painel Equipamento), como o client
oficial mostra os ícones de condição sob o inventário:

- 24 ícones oficiais da página
  [Special Conditions](https://tibia.fandom.com/wiki/Special_Conditions)
  em `assets/ui/conditions/*.png`, registrados no `icondata.js`
  (`WIKI_CONDITIONS` mapeia o tipo do jogo → ícone; `WIKI_CONDITION_ICONS`
  registra todos com nome/tipo/descrição);
- exibe: condições de dano no tempo (Envenenado, Queimando, Eletrificado,
  Sangrando, Amaldiçoado, Congelado), Magic Shield, Haste, buffs gerais,
  stances ativas e Avatar Stage 3;
- **hover mostra tooltip** com nome, descrição (pt-BR) e tempo restante;
- borda colorida por tipo: vermelho = harmful, verde = positive, neutro;
- re-renderiza no `renderAll()`.

## 3. Tooltip de item: Tier + bônus real da forja

Ao passar o mouse num item (equipado ou na mochila), o tooltip agora mostra:

```
Classificação 1 · máx T1
Forja: Tier 2
Transcendence: +0,27%
```

- tier lido da **instância** (instId) — equipado ou mochila — com fallback
  para `p.forge[slug]` de saves antigos;
- bônus calculado por `forgeEffectForSlot()` (leva em conta a Amplification
  das botas): ex. `Transcendence: +0,27%`, `Onslaught: +1,05%`,
  `Amplification: +5,40%` — formatado com vírgula (pt-BR).

## 4. Sistema baseado no Canary + equipamentos de boss (uso futuro)

- A classificação (1–4) de **todos** os equipamentos já vem do `weapons.json`
  (items.xml do Canary) — verificado: 0 equipáveis sem `cls`;
- novo registro **`FORGE_BOSS_ITEMS`** em `forgedata.js`: **282 itens**
  classe 4 (boss-grade) por slot (33 armor, 30 helmet, 167 weapon, 25 legs,
  27 boots) — os itens que os bosses irão dropar futuramente. Helper
  `forgeIsBossItem(slug)`; todos já são elegíveis na forja (máx T10).

## Arquivos alterados/criados

| Arquivo | Mudança |
| --- | --- |
| `assets/item/dust.gif`, `sliver.gif`, `exalted-core.gif` | novos (oficiais, animados) |
| `assets/item/mystic-dust.png` | removido |
| `assets/ui/conditions/*.png` (24) | novos (Special Conditions) |
| `js/icondata.js` | `WIKI_CONDITIONS` + `WIKI_CONDITION_ICONS` |
| `js/core.js` | itens dust/sliver/exalted-core; def mystic-dust removida |
| `js/game.js` | migração mystic-dust → p.dust; `renderStatusBar` no renderAll |
| `js/city.js`, `js/city-ui.js` | ferreiro usa Dust da Forja |
| `js/forge-ui.js` | tiles/botões/carteira com sprites oficiais |
| `js/forgedata.js` | `FORGE_BOSS_ITEMS` (282 itens classe 4) |
| `js/ui.js` | `renderStatusBar` + tooltip de tier/bônus |
| `css/style.css` | barra de status + sprites da forja |
| `index.html` | container `#status-bar` abaixo de `#equip` |

## Validação (navegador real, headless Chromium)

- itens `dust`/`sliver`/`exalted-core` presentes; `mystic-dust` ausente;
- migração: 37 mystic-dust + 10 dust → 47 Dust, sem sobras no save;
- barra de status com 6 estados (Envenenado, Queimando, Magic Shield, Haste,
  Aura of Sapped Strength, Avatar) + tooltip ao hover;
- itemTip: `Forja: Tier 2 · Transcendence: +0,27%`;
- forja: sprites animados em Fusion/Conversion/Transfer; **zero 404**;
- `cls` no runtime (ex.: amazon-armor = 4); `FORGE_BOSS_ITEMS` = 282.
