# 📦 Atualização Global-Idle — v18 (Fix dano + Knight +30% + HEAL FRIEND)

**Zip:** `atualizacoes/atualizacao-global-idle.zip` (tag `atualizacao-v1`) — 35,5 MB, 5.541 arquivos.
Link direto: `https://github.com/tomio1447/old-idle/raw/refs/tags/atualizacao-v1/atualizacoes/atualizacao-global-idle.zip`

---

## 🐛 1. BUG GRAVE CORRIGIDO: monstros não causavam dano físico

- O loop de combate fazia `skills || melee` — se **qualquer skill** passasse na chance, o **ataque básico (melee) nunca rodava**. No Canary (`commitCombatIntention`) o melee é uma attack separada com chance 100 que roda **SEMPRE junto** com as skills (multi-roll).
- Agora: as skills rolam a própria chance **E** o melee roda sempre que o monstro tem dano base. Corrige o **vexclaw / grimeleech / dark-torturer** (e todos os monstros) que só causavam dano de magia.
- **Verificado:** 3 combates de 20s da DT Seal → dano físico sempre presente (1283/1329/1683) junto com fire/death/lifedrain.

## ⚔️ 2. Knight: dano base +30%

- O ataque da arma do Knight multiplica por **1.3** antes da rolagem (espada atk 14 → ~21 de ataque base).

## 📖 3. Books coloridos (cache do navegador)

- As sprites dos elemental books (burning/energetic/icecold) **já estavam coloridas** no zip desde a v15; o navegador cacheava a branca antiga. `ASSET_VERSION` subiu para **17** — força a recarga. (Se ainda aparecer branco, dê **Ctrl+F5**.)

## ❤️ 4. HEAL FRIEND (Druid/Monk) — igual ao baiak-idle

- Nova aba **HEAL FRIEND** dentro do **Helper: Cura** para **Druid/Elder Druid** e **Monk/Exalted Monk**.
- **Puxa os aliados da party** (com barra de HP e status ferido/ok) — modo online usa hp/maxHp do state do servidor; modo local usa o roster.
- Magias de aliado:
  - **exura sio** (Heal Friend) — cura 1 aliado
  - **exura gran sio** (Nature's Embrace) — cura forte 1 aliado (cd 60s)
  - **exura gran mas res** (Mass Healing) — **cura TODOS os aliados ao alcance quando 2+ membros estão com HP abaixo do % configurado**
  - **exura tio sio** (Restore Balance, Monk) — cura 1 aliado à distância
- **% gatilho configurável** ("Curar aliado quando HP abaixo de %").
- A cura **aplica de verdade** no aliado: modo local atualiza o save do personagem; modo online espelha no state (o save do membro, que roda no próprio cliente, sincroniza o HP real no servidor).

## 🧪 5. Testes

- `tools/test_combat_fixes.js` (novo): melee sempre roda, knight +30%, HEAL FRIEND mass (2 feridos) e single (1 ferido).
- Regressão completa (party, exercise, spawn, UI, dt-seal, scan 15.x, market, multiroll) — **tudo verde**.

## Como atualizar

1. Baixe o zip e extraia **sobre** a pasta do jogo (substituindo os arquivos).
2. Dê **Ctrl+F5** no navegador para limpar o cache (importante para as sprites dos books).
