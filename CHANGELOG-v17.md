# 📦 Atualização Global-Idle — v17 (Party: mesma instância + follow de retorno)

**Zip:** `atualizacoes/atualizacao-global-idle.zip` (tag `atualizacao-v1`) — 35,5 MB, 5.539 arquivos.
Link direto: `https://github.com/tomio1447/old-idle/raw/refs/tags/atualizacao-v1/atualizacoes/atualizacao-global-idle.zip`

---

## 🧭 1. Party System — teleporte da party CORRIGIDO

### Bug do teleporte (party não ia toda junto)
- O follow chamava `startHunt`/`startBoss`, que **bloqueavam membros** (regra de zona: membro não entra em hunt). Agora o follow usa **`force=true`** e o membro é teleportado para a **MESMA instância do líder** — os 2+ personagens ficam na mesma instância.
- Poll do party reduzido de 6s → **3s** (teleporte mais responsivo).

### Follow de RETORNO (instância ativa só enquanto o líder caçar)
- Quando o **líder sai** da hunt/boss (volta p/ cidade ou treino), o servidor gera um follow `returnHome` para **TODOS os membros** — todos voltam para a cidade.
- Botão **LEAVE HUNT** no painel de party: o líder sai (todos voltam) ou o membro sai sozinho.

### Regras de zona (reforçadas)
- **Líder** só convida/aceita em **Cidade ou Área de Treino**.
- **Convidado** só aceita em **Cidade ou Área de Treino**.
- **Líder em hunt impede o aceite** — ninguém entra na party enquanto o líder estiver caçando (validado no servidor).

### Fix crítico (IDs colidindo)
- O storage JSON não persistia o seq de IDs de party/convite — **após reiniciar o servidor**, uma party nova pegava o id de uma antiga e o estado vinha com **membros/zonas ERRADOS** (era isso que quebrava o follow). Corrigido: o id agora é sempre `maior existente + 1`.

## 🎨 2. Loot da DT Seal (não estava faltando — a UI escondia)

- O modal da hunt mostrava **só os 8 primeiros drops** — os raros ficavam de fora. Agora mostra **TODOS os loots do Canary**: os **rift** (lance/bow/crossbow/shield) do Vexclaw e Grimeleech aparecem.
- Verificado: os 3 monstros têm loot completo no runtime (**35/31/20 itens**) com ficha e sprite — nada quebrado.

## 💀 3. Ferumbras Mortal Shell — sprite CORRETA

- O outfit do Ferumbras **não é um demon**: o Canary usa **looktype 229** (a forma do Ferumbras). O boss agora usa a sprite `ferumbras-mortal-shell` — o arquivo já existia no jogo; só o `BOSS_DEFS` apontava errado para `"demon"`.

## ⚠️ 4. Áreas danger

- A **DT Seal** agora nasce **6–10 monstros por respawn** (pack 8, respawn 1.2s) — a faixa viável de área danger.

## 🧪 5. Testes

- `test_party_api` atualizado (follow de retorno), `test_party_v16`, market, account, dt-seal, scan 15.x, load dos 90 scripts — **tudo verde**.

## Como atualizar

1. Baixe o zip e extraia **sobre** a pasta do jogo (substituindo os arquivos).
2. O servidor (JSON local ou MySQL) — se usar MySQL, rode o `database.sql` atualizado (as colunas `zone/hp/mp/max_hp/max_mp` já foram adicionadas na v16; o servidor migra sozinho).
