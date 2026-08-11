# 📦 Atualização Global-Idle — v25 (Magic Shield moderno + Naga Hunt hard)

**Zip:** `atualizacoes/atualizacao-global-idle.zip` (tag `atualizacao-v1`).
Link direto: `https://github.com/tomio1447/old-idle/raw/refs/tags/atualizacao-v1/atualizacoes/atualizacao-global-idle.zip`

---

## 🛡️ 1. Magic Shield dos Mages — sistema moderno (Update 12.55+) verificado

- **Cooldown:** confirmado **14s** (grupo 2s) — oficial da Tibia Library.
- **Duração:** corrigida de **200s → 60s** (oficial 12.55).
- **Bônus de defesa na mana (capacidade):** o escudo agora absorve uma
  quantidade **LIMITADA** de dano, calculada pela fórmula oficial:
  `Capacidade = 7×ML + 7,6×nível + max(300, 0,4×nível)`.
- **Pool própria:** o dano drena a **pool do escudo** — a mana do personagem
  **não é consumida** (antes o utamo vita drenava a mana inteira).
- **Quebra:** quando a capacidade esgota o escudo **quebra** (mesmo com mana
  cheia e tempo restante) — evento visual e log "Magic Shield quebrou".
- **Recast renova:** castar de novo com o escudo ativo **renova a capacidade**
  (o auto-cast renova quando a pool está gasta, sem drenar mana à toa).
- **Mana potion bloqueada:** com o escudo ativo o mage **não bebe mana
  potion** (regra oficial — a pool do escudo não recarrega com potions; o
  energy ring clássico também não se beneficia de mana potion).
- **Energy Ring (Monk/RP):** continua com o mana shield **clássico** (dano
  drena a mana do personagem até zerar).
- **UI:** a aba Escudo Mágico mostra o tempo restante e **⚡ pool/capacidade**
  do escudo, e o floater do dano absorvido mostra o restante da pool.

## ⚔️ 2. Naga Hunt agora é HARD (igual ao DT Seal)

- **Marapur — Nagas** ajustada: **pack 3 → 8** e **respawn 0,8s → 1,2s** —
  os mesmos valores do DT Seal. O spawn agora enche a sala com até 8
  criaturas (naga archer, naga warrior e makara), com o respawn espaçado do
  hard.

## 🧪 3. Testes

- **Novo `test_magic_shield_v25.js`**: capacidade (7×ML + 7,6×L + bônus),
  duração 60s, dano drenando a pool (mana intocada), quebra ao esgotar,
  recast renovando, mana potion bloqueada, energy ring clássico e naga hunt
  com pack 8/respawn 1.2.
- Regressão completa (party, BOX, combat, exercise, dt-seal, v21/v22/v23/v24,
  scan 15.x) — **tudo verde**.

## Como atualizar

1. Baixe o zip e extraia **sobre** a pasta do jogo (substituindo os arquivos).
2. **Ctrl+F5** após atualizar.
