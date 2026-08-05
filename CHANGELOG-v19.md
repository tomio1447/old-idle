# 📦 Atualização Global-Idle — v19 (Cds de aliado + Exeta Amp Res + Ícones + Crit Heal)

**Zip:** `atualizacoes/atualizacao-global-idle.zip` (tag `atualizacao-v1`) — 35,5 MB, 5.543 arquivos.
Link direto: `https://github.com/tomio1447/old-idle/raw/refs/tags/atualizacao-v1/atualizacoes/atualizacao-global-idle.zip`

---

## ⏱️ 1. Cds das magias de cura de aliado

- **exura gran sio** (Nature's Embrace): cd de **60s → 15s**.
- **exura gran tio sio** (Restore Friend, druid): **NOVA** — cura forte de aliado, cd de **30s**. Entra no **HEAL FRIEND** (aba do Helper: Cura).

## 🛡️ 2. Exeta Amp Res (Chivalrous Challenge) do Knight

- **Auto-cast** quando o knight está em combate: marca **TODOS os monstros ao alcance (7 SQM)** por 10s.
- Monstros **marcados causam 20% MENOS dano** ao knight (efeito do Challenge do Tibia).
- Efeito visual: floater **"EXETA AMP RES!"**, log da party e **ícone "challenged"** ao lado do nome do monstro (ícone já existente no jogo).

## 🎯 3. Ícones Ranged/Melee no OTC

- Cada monstro mostra, ao lado do nome, o ícone do tipo de ataque:
  - **⚔ espadas cruzadas** = melee
  - **🏹 flecha** = ranged
- Ícones vetoriais desenhados em canvas (sem depender de sprite), usando o `monsterAttackRange()` do jogo.

## 💚 4. Critical Heal do Druid (10% base)

- Chance de **cura crítica** do Druid agora é **10% por base** (antes ~5% do crit hit) + Strike imbuement.
- O **HEAL FRIEND** também rola o critical heal: quando acerta, a cura sobe pelo % de dano crítico extra e mostra o **efeito azul oficial (critical-heal-effect)** + texto **"CRITICAL!"** sobre o druid.

## 🧪 5. Testes

- Runtime validou: cds (15s/30s), exeta amp res marcando mobs, chance de crit heal 10% e heal friend com campo crit.
- Regressão completa (party, exercise, spawn, UI, dt-seal, scan 15.x, combat fixes, multiroll, market) — tudo verde.

## Como atualizar

1. Baixe o zip e extraia **sobre** a pasta do jogo (substituindo os arquivos).
2. **Ctrl+F5** após atualizar.
