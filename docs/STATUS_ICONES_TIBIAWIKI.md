# Status — Ícones oficiais da TibiaWiki (página "Icons")

## Fonte

- **Página:** https://tibia.fandom.com/wiki/Icons
- **Arquivos:** baixados de `static.wikia.nocookie.net` (WebP) e convertidos para PNG RGBA com transparência.
- **Local no projeto:** `tibia-idle/game/assets/ui/icons/<slug>.png` (tamanho nativo 11×11 / 12×12 px).

## O que foi aplicado

### 1. Registro de dados — `tibia-idle/game/js/icondata.js` (novo)
- `window.WIKI_ICONS`: registro `{ slug, title, file, source, path }` dos 15 ícones, no mesmo formato do `CLIENT_EFFECTS` (`effectdata.js`).
- Helpers globais:
  - `wikiIcon(slug)` → `<img>` cacheada;
  - `wikiIconReady(slug)` → true quando carregou;
  - `drawWikiIcon(ctx, slug, x, y, size)` → desenha no canvas se pronta (retorna true/false para fallback).
- Carregado no `index.html` entre `effectdata.js` e `render.js`.

### 2. Ícones nas criaturas — `render.js` (arena/forge)
- **Fiendish:** ícone oficial `fiendish-creature` + tag "FIENDISH" (grupo centralizado no SQM), substituindo só o texto.
- **Influenced:** ícone oficial `influenced-creature` + stacks no lugar do sprite de `mystic-dust`.
- **Sap Strength / Expose Weakness:** ícones oficiais ao lado do nome quando o monstro está com `sapStrUntil` / `exposeUntil` (crippling stances do Sorcerer).
- **Challenged:** o ícone `challenged` já é renderizado se `m.challengedUntil` existir — reservado para quando Chivalrous Challenge / Divine Dazzle aplicarem condição no alvo.

### 3. Badge de posturas — `stances.js` + `ui.js`
- As crippling stances `exori-kor-tempo` (Aura of Sapped Strength) e `exori-moe-tempo` (Aura of Exposed Weakness) ganharam `iconWiki`.
- `stanceBadgesHtml` (canto superior esquerdo) passa a exibir o ícone oficial da TibiaWiki quando a stance tem `iconWiki`; senão, mantém o ícone de spell antigo.

### 4. Painel administrativo — `admin.js` (aba FORJE)
- Botões "Influenced" e "Fiendish" de invocação agora mostram os ícones oficiais.

## Lista de ícones baixados (15)

| Slug | Título (TibiaWiki) |
| --- | --- |
| `sap-strength` | Sap Strength Icon |
| `expose-weakness` | Expose Weakness Icon |
| `challenged` | Chivalrous Challenge Icon |
| `influenced-creature` | Influenced Creature Icon |
| `fiendish-creature` | Fiendish Creature Icon |
| `soulpit-normal` | Normal Soulpit Icon |
| `soulpit-final` | Final Soulpit Icon |
| `weekly-task` | Weekly Task Icon |
| `bounty-task` | Bounty Task Icon |
| `quest-condition-red-blood` | Quest Condition Red Blood |
| `quest-condition-white-x` | Quest Condition White X |
| `quest-condition-red-ball` | Quest Condition Red Ball |
| `quest-condition-arrow-up` | Quest Condition Arrow Up |
| `boss-difficulty-cons` | Boss Difficulty System — Cons |
| `boss-difficulty-pros` | Boss Difficulty System — Pros |

## Arquivos alterados/criados

- `tibia-idle/game/assets/ui/icons/*.png` (15 novos)
- `tibia-idle/game/js/icondata.js` (novo)
- `tibia-idle/game/index.html` (script tag)
- `tibia-idle/game/js/render.js`
- `tibia-idle/game/js/stances.js`
- `tibia-idle/game/js/ui.js`
- `tibia-idle/game/js/admin.js`

## Observações

- Ícones `soulpit-*`, `weekly-task`, `bounty-task`, `quest-condition-*` e `boss-difficulty-*` estão registrados e disponíveis para as telas futuras (Task Board, Soulpit, quests, boss difficulty), mas ainda não têm sistema correspondente no jogo.
- Os arquivos da wiki são WebP renomeados como `.png`; a conversão para PNG RGBA foi feita na importação para funcionar em qualquer navegador.
