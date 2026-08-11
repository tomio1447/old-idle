# 📦 Atualização Global-Idle — v20 (Ondas/Áreas oficiais + Party corrigida + Party Combat)

**Zip:** `atualizacoes/atualizacao-global-idle.zip` (tag `atualizacao-v1`).
Link direto: `https://github.com/tomio1447/old-idle/raw/refs/tags/atualizacao-v1/atualizacoes/atualizacao-global-idle.zip`

---

## 🌊 1. Ondas dos monstros agora vão RETAS (formato oficial do Canary)

- **Antes:** a onda saía numa **linha diagonal** apontando para o personagem.
- **Agora:** a onda vai **reta no eixo dominante** (N/S/L/O), igual ao
  `getPrimaryDirection` do Canary — o monstro vira e a onda varre o eixo.
- A **boca da onda** (spread do .lua, ex.: `length=8, spread=3` do grimeleech)
  agora é respeitada: abre larga nas primeiras casas e **afunila até a ponta**
  — o desenho exato do `AreaCombat::setupArea(length, spread)` do servidor.
- **Dano fiel ao servidor:** a magia só acerta se o personagem estiver numa
  célula coberta pela onda reta (quem está na diagonal fora dela não leva dano).

## 💥 2. Explosões de área com o CÍRCULO oficial (não mais quadradas)

- **Antes:** a death explosion do grimeleech (e toda área de raio) pintava um
  **quadrado cheio** na tela.
- **Agora:** o formato é o **círculo oficial do Canary**
  (`AreaCombat::setupArea(radius)`): um diamante com os cantos cortados —
  a death explosion `radius=4` vira um octógono de 21 células, igual ao servidor.
- O **dano** usa a mesma forma: a explosão centrada no monstro só acerta quem
  estiver dentro do círculo (o canto do quadrado antigo não leva dano).

## 👥 3. Party local corrigida (convite precisa de ACEITE)

- **Convite NÃO entra mais automático:** o líder convida (só na **Cidade** ou
  **Área de Treino**) e o convite fica **PENDENTE** na inbox.
- O jogador **troca para o personagem convidado** e aceita pelo menu **👥 PARTY**
  (também só em cidade/treino). Recusar também é possível.
- Badge do botão PARTY mostra **✉N** quando há convite pendente para o
  personagem atual.

## 👑 4. Líder é FIXO no personagem que criou a party

- A party local agora vive num **storage compartilhado** do navegador (vale
  para todos os personagens do save). **Trocar de personagem NÃO move a
  liderança** — o líder continua sendo quem criou.
- Painel OTC mostra sempre o líder verdadeiro (coroa), não o personagem atual.

## ⚔️ 5. PARTY COMBAT — todos os personagens na MESMA instância

- Quando o **líder** entra numa hunt ou boss, **TODOS os membros da party vão
  juntos para a mesma instância** (aparecem na arena ao lado dele).
- **O jogador controla TODOS:** clica no membro no painel OTC (canto superior
  direito) e o controle troca **na hora, sem recarregar** — a UI (magias,
  potions, stats) passa a ser do personagem selecionado.
- **Aliados lutam sozinhos:** cada membro ataca com a própria arma (melee,
  distância ou magia) e o Druid/Monk **cura a party** com a configuração de
  HEAL FRIEND de cada um.
- **Monstros miram o alvo mais próximo** entre líder + membros — o dano físico
  e as magias atingem qualquer um da party de verdade (HP real de cada um).
- **Morte:** quem cai fica **inconsciente** (sprite apagada) e **renasce no
  local** depois de ~30s; o controle pula para o próximo vivo. Só quando a
  party inteira morre é que vale a morte normal (perda de XP/ouro + revive).
- **LEAVE HUNT** também aparece no party combat local (sai da instância e
  salva todos os personagens).
- Exp compartilhada continua aplicando **de verdade no save** de cada membro
  (com level-up na hora, inclusive na tela).

## 🧪 6. Testes

- **Novo `test_party_combat.js`**: formas oficiais de onda/área, convite
  pendente + aceite no convidado, líder fixo, party combat com aliados
  atacando, monstro mirando o mais próximo e troca de controle sem reload.
- Regressão completa (party api/v16/client, combat fixes, monster spells,
  changes, ui, exercise, magic multiroll, dt-seal, scan 15.x, market, account)
  — **tudo verde**.

## Como atualizar

1. Baixe o zip e extraia **sobre** a pasta do jogo (substituindo os arquivos).
2. **Ctrl+F5** após atualizar.
