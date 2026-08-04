# 📦 Atualização Global-Idle — v14 (Varredura 15.x)

**Zip para download:** `atualizacoes/atualizacao-global-idle.zip` no repositório (tag `atualizacao-v1`) — 35,3 MB, 5.473 arquivos.

---

## 🧹 1. Itens que não deviam dar atributos — corrigido pelo items.xml do Canary

Removidos **28 atributos inventados de 21 itens** que no Canary 15.x **não têm nenhum bônus** (decorativos/quest):

- **Crystal Ring** ~~ML+1~~ · **Crystal Necklace** ~~prot+12%~~
- **Life Crystal / Mind Stone / Orb / Crystal Ball** ~~ML+2~+6~~
- **Spellbook** ~~ML+2~~
- **Gold Ring / Wedding Ring** ~~regen~~
- **Ring of the Sky / Ring of Wishes** ~~ML/regen~~
- **Golden Amulet / Ancient Amulet / Starlight Amulet** ~~prot/ML/arm~~
- **Ruby Necklace** ~~prot+14%~~
- **Wolf Tooth Chain / Paw Amulet** ~~+melee~~
- **Elven Brooch / Frozen Starlight** ~~ML~~
- **Energy Ring** ~~+shield 6~~ → agora só **Magic Shield** (item ativo 3088 do Canary)
- **Power Ring** ~~+melee~~ → agora **+fist** (item ativo 3087 do Canary)

> Conferência feita item a item no `items.xml` do Canary (inclusive itens com `transformequipto` — o anel só ganha atributo no item ATIVO, ex. energy ring → 3088).

## ⚔️ 2. Dano físico agora é CINZA (nativo do Tibia)

- Cor do número do dano físico: `#a0a0a0` (cinza) — antes era vermelho vivo `#ff3c3c`.
- Vale para o dano **causado** e **recebido**.
- O efeito visual (respingo de sangue, poeira etc.) continua seguindo a raça da criatura — só o **número** ficou cinza, como no game window do Tibia.

## 🔍 3. Varredura 7.4 → 15.x

- **Runtime (tibia-idle/game):** nenhum vestígio funcional do 7.4 — só comentários, todos atualizados para 15.x/Canary (`core.js`, `monsters.js`, `outfit.js`, `layout.css`, `style.css`).
- **Pasta `base/`:** cliente 7.4 legado, **não referenciada** pelo jogo e **fora do zip** — mantida só como referência no repo.
- **`tools/extract_*.py`:** geradores de build internos (extraem sprites do .dat 8.60 como fonte de arte) — não afetam o jogo.

## 🧪 Testes

- `tools/test_scan_15x.js` (novo): valida itens limpos, cor física cinza e ausência de 7.4 no runtime ✔
- Regressão: party, market, exercise weapons, spawn, UI, load dos 90 scripts ✔

## 🖥️ Testar ao vivo (previews)

- Jogo e API já servem o conteúdo novo (verificado: `core.js` com cinza, `gamedata.js` com crystal-ring sem atributos, login admin 1/1 OK).
- Equipe o crystal ring / crystal necklace e veja o tooltip **sem** ML/prot.
- Bata num monstro e veja o dano físico em **cinza**.
