# 📦 Atualização Global-Idle — v21 (Escudo Mágico do Knight + Exeta Res/Amp Res + Cargas)

**Zip:** `atualizacoes/atualizacao-global-idle.zip` (tag `atualizacao-v1`).
Link direto: `https://github.com/tomio1447/old-idle/raw/refs/tags/atualizacao-v1/atualizacoes/atualizacao-global-idle.zip`

---

## 🛡️ 1. Knight sem Escudo Mágico — Energy Ring só Monk e RP

- **A aba "Escudo mágico" do Helper some para o Knight** (e Elite Knight).
- **Energy Ring agora é exclusivo de Monk e Royal Paladin (RP)**: o Knight
  não consegue mais equipar (bloqueio real no equipamento, com a mensagem
  "Vocação incompatível") e o item não ativa Magic Shield para ele.
- Sorcerer/Druid continuam com a aba (usam **utamo vita**), mas a seção de
  Energy Ring fica oculta para eles — só Monk/RP veem e usam o anel.

## ⚔️ 2. Exeta Res + Exeta Amp Res na aba Ataque (os dois podem ficar ligados)

- Novos toggles na aba **Ataque** do Helper (Knight):
  - **Exeta Res** (Challenge, nv 20): marca **1 inimigo**;
  - **Exeta Amp Res** (Chivalrous Challenge, nv 150): marca **TODOS** ao
    alcance (7 SQM) — com a **animação oficial** (CONST_ME_CHIVALRIOUS_CHALLENGE,
    anel de energia roxo/azul do DAT 15.x, 8 quadros) no cast;
- **Os dois podem ficar ligados juntos**: o Amp Res tem prioridade e o Res
  cobre quando ele está em recarga. Monstro marcado causa **20% menos dano**
  por 10s (como já era).
- O cast é automático em combate apenas com o(s) toggle(s) ligado(s).

## ⚡ 3. Sistema de CARGAS de anéis e amuletos (verificado + funcionando)

- **Cargas por TEMPO (como o time ring):** 1 carga a cada **3s enquanto
  equipado** — o time ring de 200 cargas dura 10 min. Durações dos anéis
  ajustadas pela wiki: life ring 20 min (400), sword/axe/club/power 30 min
  (600), dwarven 60 min (1200), ring of healing 8 min (160), energy/stealth
  10 min (200).
- **Cargas por GOLPE (como o might ring):** o might ring de **20 cargas**
  gasta 1 carga a cada golpe recebido — o 20º golpe ainda é absorvido e só
  então o anel **quebra**.
- **Quebra:** quando as cargas zeram o item **sai do slot e some** (log +
  toast) — e o Helper de Equipamento repõe o item configurado na hora.
- **Cargas na UI:** o Helper de Equipamento mostra "⚡ X/Y cargas" do item
  equipado (com o modo: por tempo / por golpe), a aba Escudo Mágico mostra as
  cargas do energy ring e o tooltip do item mostra o total e o saldo quando
  equipado.
- **Anti-exploit:** a troca normal/emergencial do Helper **preserva o saldo
  parcial** (o anel não "recarrega de graça" ao ser desequipado).

## 🧪 4. Testes

- **Novo `test_v21_accessories_challenge.js`**: restrição do energy ring
  (knight/druid bloqueados, monk/RP liberados), exeta res (1 alvo) + amp res
  (todos) com toggles, sprite oficial (8 quadros), cargas por tempo (1/3s +
  saldo preservado) e por golpe (1/golpe + quebra).
- Regressão completa (party, combat fixes, monster spells, exercise, dt-seal,
  scan 15.x, market, account) — **tudo verde**.

## Como atualizar

1. Baixe o zip e extraia **sobre** a pasta do jogo (substituindo os arquivos).
2. **Ctrl+F5** após atualizar.
