# 📦 Atualização Global-Idle — v15 (DT Seal / Ferumbras Ascendant)

**Zip para download:** `atualizacoes/atualizacao-global-idle.zip` no repositório (tag `atualizacao-v1`) — 35,4 MB, 5.478 arquivos.
Link direto: `https://github.com/tomio1447/old-idle/raw/refs/tags/atualizacao-v1/atualizacoes/atualizacao-global-idle.zip`

---

## 🔥 1. Vexclaw/Demon "quase imunes" a gelo — CORRIGIDO

**Causa:** o importador mapeava `LIFEDRAIN→death`, `MANADRAIN→energy` e `DROWNDAMAGE→ice`. Como vexclaw/demon têm **drown 100%** e **lifedrain 100%** no Canary, isso virou `ice:100` e `death:100` no jogo — e a fraqueza real a gelo foi apagada.

**Depois da correção** (reimportação do Canary completo):

| Monstro | Resist agora (padrão Canary) |
|---|---|
| **Vexclaw** | physical 5 · energy 10 · earth 40 · fire 75 · **ice −5 (fraqueza)** · holy −10 · death 20 · drown 100 · lifedrain 100 |
| **Demon** | physical 25 · energy 50 · earth 40 · fire 100 · **ice −12 (fraqueza)** · holy −12 · death 20 · drown 100 · lifedrain 100 |
| **Grimeleech** | energy −5 · earth 40 · fire 20 · **ice 0** · death 60 · drown 100 · lifedrain 100 |
| **Dark Torturer** | energy 30 · earth 90 · fire 100 · **ice −10 (fraqueza)** · holy −10 · death 10 |

→ Gelo agora **machuca de verdade** os monstros de fogo.

## 📖 2. Elemental Books com cor (sprites brancas corrigidas)

`burning-book`, `energetic-book` e `icecold-book` usam a looktype 1061 com **outfit colors** no Canary; as sprites foram extraídas sem aplicar a cor. Regeneradas com a paleta oficial:
- **burning-book** → vermelho/amarelo (fogo)
- **energetic-book** → roxo/magenta (energia)
- **icecold-book** → azul com partes **verdes** (como no client)

## ⚔️ 3. Hunt DT Seal + aba Ferumbras Ascendant (nível 250+)

- Nova hunt **DT Seal**: vexclaw, grimeleech e dark-torturer — HP, exp, dano, skills, fraquezas e loot **100% do Canary**.
- **Subcategorias** nas áreas de caça: 🌱 Iniciante · ⚔️ Aventureiro · 🛡️ Herói · 🐉 Lenda · 🔥 **Ferumbras Ascendant**.
- A aba **Ferumbras Ascendant** fica **bloqueada (🔒) até o nível 250** — e o `startHunt` também trava (não dá para burlar).
- Mapa genérico **`maps/dt_seal.otbm`** (21×13, chão de pedra, spawn + zona de monstros) — **pronto para você abrir no RME e editar**.
- Monstros adicionados como jogáveis + itens de loot característicos (vexclaw talon, rift shield, grimeleech wings, death ring, butcher's axe...).

## 💀 4. Boss: Ferumbras Mortal Shell

- Na aba de bosses, **requer nível 250**.
- Stats diretos do Canary: **300.000 HP · 2.000.000 exp** · armor 100 · defense 120 · resist 65% em quase tudo (menos físico/drown).
- **Loot oficial** do .lua com chances reais: gold/platinum 100%, ferumbras' hat, death gaze, ferumbras' amulet, rift bow/crossbow, demon shield, golden armor, magic plate armor, chaos mace, bloody edge, etc.

## 🧪 Testes

- `tools/test_dt_seal.js` (novo): valida resist, hunt 250+, boss, books e mapa.
- Regressão completa (90 scripts, party, market, exercise, spawn, UI) — tudo verde.

## Como atualizar

1. Baixe o zip e extraia **sobre** a pasta do jogo (substituindo os arquivos).
2. O mapa `dt_seal.otbm` já está em `tibia-idle/game/maps/` — edite no RME quando quiser.
