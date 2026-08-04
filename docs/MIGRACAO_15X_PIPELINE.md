# 🚀 Migração 15.x — Pipeline Completo (.dat/.spr + items.xml)

> **Resposta à pergunta: "dá para usar as sprites .dat/.spr e o items.xml na
> versão 15x?" → SIM, e o projeto já é 100% construído nessa base.** Este
> guia documenta o fluxo completo, do download à execução na sua máquina.

---

## 1. Por que o formato 8.60 do repositório 15.x-with-8.60?

O cliente oficial 15.x usa `appearance.dat` + assets LZMA — formatos que o
**RME não abre** e que exigem parsers pesados. O repositório
[Levi999x/15.x-with-8.60](https://github.com/Levi999x/15.x-with-8.60)
resolve isso: ele converte (SpiderClientConverter) todo o conteúdo do Tibia
15.x (itens, outfits, criaturas, efeitos) **para o formato 8.60**
(`Tibia.dat` + `Tibia.spr`), que:

| Consumidor | Funciona? |
|---|---|
| **RME (Remere's Map Editor 8.60)** | ✅ com o `Tibia.otfi` do repo |
| **Nosso parser Python** (`tibia_assets_860.py`) | ✅ Dat860/Spr860 |
| **Client web do jogo** (via PNGs gerados) | ✅ |
| **items.xml / items.otb** | ✅ itens 15.x em formato 8.60 |

**Verificação importante (feita por pixel):** o `Tibia.dat` convertido
**mantém os ids do cliente 15.x** (não os ids clássicos 8.60). Ex.:
fire sword = 3280 (não 2392), golden boots = 3555 (não 2646). Por isso o
`extract_860.py` prioriza os nomes/ids do **items.xml do Canary (15.x)**.

## 2. O que o pipeline gera

```
┌─────────────────────────┐   ┌──────────────────┐
│ Tibia.dat + Tibia.spr   │──▶│ tibia_assets_860 │──▶ assets/outfit/*.png
│ (15.x-with-8.60, 8.60)  │   │   (parser puro)  │──▶ assets/mob/*.png
└─────────────────────────┘   └──────────────────┘──▶ assets/item/*.png
                                                      assets/item/*_anim.png
┌─────────────────────────┐
│ items.xml (Canary 15.x) │──▶ gamedata.js (atributos reais de combate)
└─────────────────────────┘
┌─────────────────────────┐
│ Tibia.dat (mesmo!)      │──▶ rme/data/catalog.js + atlas_*.png
│                         │──▶ js/tileflags.js (colisão walk/block)
└─────────────────────────┘
```

O `gamedata.js` agora guarda por item:
- **`cid`** — client id no .dat 15.x (ligação direta item ↔ sprite ↔ RME);
- **`af`/`aw`/`ah`** — animação real do dat (117 itens animados: wands,
  rods, golden boots, phoenix egg, etc. — o cliente já anima via `weapons.js`).

## 3. Passo a passo (na sua máquina)

### 3.1 Baixar os arquivos-fonte (uma única vez)

Do repositório [Levi999x/15.x-with-8.60](https://github.com/Levi999x/15.x-with-8.60):

| Arquivo | Tamanho | Para quê |
|---|---|---|
| `Tibia_spr_dat.zip` | ~104 MB | extrair → `Tibia.dat` + `Tibia.spr` |
| `items.xml` | ~1,9 MB | opcional (nomes extras) |
| `Tibia.otfi` | 244 B | RME desktop (config 8.60) |

Opcional: `items.xml` do Canary 15.x
(https://raw.githubusercontent.com/opentibiabr/canary/main/data/items/items.xml)
— o script já usa `tools/data/canary-items.xml` como padrão.

### 3.2 Extrair

```bash
mkdir -p ~/work/15x860 && cd ~/work/15x860
unzip Tibia_spr_dat.zip        # gera Tibia.dat + Tibia.spr
```

### 3.3 Rodar a migração completa (1 comando)

```bash
cd tibia-idle/tools
python3 migracao_15x.py --tibia860 ~/work/15x860 \
                        --items-xml ~/work/15x860/items.xml
```

Sem o items.xml do Canary, rode também:
`--canary-dir /caminho/canary` (ou `--canary-xml .../canary-items.xml`).

O que acontece em cada passo (com `--skip-*` dá para pular):

1. **extract_860.py** — regrava todos os PNGs (outfit/mob/item) + tiras
   `_anim` + `cid`/`af`/`aw`/`ah` no `gamedata.js`;
2. **import_canary_items.py** — atributos de combate reais (atk/def/arm,
   nível, vocações, elemento, skills, imbuement slots) do items.xml;
3. **build_rme_catalog.py** — catalogo + atlases do editor web +
   `tileflags.js` (colisão) — **mesmo .dat do jogo**;
4. **consolidate_css.py** — garante `css/layout.css` (3 CSS base → 1) e o
   `index.html` correto.

### 3.4 RME desktop (Remere's Map Editor 8.60)

1. Copie o `Tibia.otfi` para a pasta do RME 8.60 **e** para a pasta do
   client Tibia 8.60 (como manda o README do repo 15.x-with-8.60);
2. No RME: **Options → Client Version → 8.60** e aponte para o
   `Tibia.dat`/`Tibia.spr` extraídos;
3. O editor web do projeto (`tibia-idle/game/rme/` ou `RME.bat`) usa os
   mesmos sprites via `catalog.js` + `atlas_*.png`.

## 4. Resultados da última execução (2026-08-03)

```
.dat: 54.751 itens | 1.978 outfits | 454.730 sprites
itens do gamedata: 868/870 atualizados com sprite 15.x real
itens órfãos:      792 PNGs extras atualizados
itens animados:    117 strips _anim geradas (af/aw/ah no gamedata)
itens sem sprite:  rusty-boots, epic-wisdom (sem nome nos XMLs — mantidos)
atributos Canary:  824 itens casados (imbSlots 239, vocs 256, el 70, lvl 362)
RME:               43.155 itens com sprite em 6 atlas | 19.422 flags colisão
```

## 5. Corrigido no caminho (bugs achados pela auditoria)

| Bug | Causa | Correção |
|---|---|---|
| Clique no personagem não funciona | `.modal-bg` do `otc-complete.css` com `display:flex` (overlay invisível cobrindo a tela) | `display:none` + `.modal-bg.show{display:flex}` |
| Layout desmontado | `final-otc` removeu os 3 CSS base do `index.html` | `css/layout.css` (consolidado) carregado antes do `otc-complete.css` |
| 12 itens sem sprite 15.x | nomes com "The", apóstrofos, "bunnyslippers" | normalização + OVERRIDE_IDS + fuzzy com auditoria |
| e2e desatualizado | modal de instância (PvP/non-PvP) e `sellAllPouch` | `e2e.py` atualizado (passou 100%) |

## 6. Riscos / notas

- **Copyright:** não versione `Tibia.dat`/`Tibia.spr`/`items.xml` originais
  no repositório — o pipeline gera os PNGs localmente (mesma política já
  documentada em `REFERENCIAS_GLOBAL_IDLE.md`).
- **Auditoria fuzzy:** resoluções por nome parcial aparecem no log do
  `extract_860.py` (`[auditoria]`) — confira esses itens no jogo.
- **Re-executar é seguro:** o pipeline é idempotente (mesmos nomes de
  arquivo, mesma cascata CSS).
