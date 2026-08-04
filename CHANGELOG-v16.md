# 📦 Atualização Global-Idle — v16 (Party System completo + Timira)

**Zip:** `atualizacoes/atualizacao-global-idle.zip` (tag `atualizacao-v1`) — 35,5 MB, 5.539 arquivos.
Link direto: `https://github.com/tomio1447/old-idle/raw/refs/tags/atualizacao-v1/atualizacoes/atualizacao-global-idle.zip`

---

## 👥 1. Painel de Party estilo OTC (canto superior direito)

- Novo painel **"PARTY"** fixo no canto superior direito da tela do jogo (dentro do canvas).
- Ao abrir, lista os personagens da party **exatamente como o módulo de party do OTC**:
  - **outfit pequeno** de cada membro
  - **nome** (com ♛ no líder)
  - **level** e vocação
  - **barra + valor de HP** e **barra + valor de mana**
  - ícone da **zona** (🏛 cidade / 🎯 treino / ⚔️ hunt / 💀 boss)
- **Clicar num membro da sua conta = trocar de personagem** (mesma função do botão "Trocar personagem" — salva, seta o personagem e recarrega).

## 🚫 2. Regras de zona

- **Membros de party não podem entrar em hunt/boss** — só Cidade ou Área de Treino (bloqueado no cliente e validado no servidor por zona do personagem).
- **Para aceitar um convite é preciso estar em Cidade (safe zone) ou Área de Treino** — o servidor recusa se o convidado estiver em hunt/boss, e o botão Aceitar trava fora da zona segura.

## 🧭 3. Líder leva a party

- O **líder escolhe a hunt** e inicia → todos os membros são teleportados para a **mesma instância** (follow com nonce de uso único, anti-replay).
- **Boss**: o servidor valida os **requisitos de TODOS os membros** (cooldown de 16h + missão) antes de gerar o follow — se alguém estiver em cooldown ou sem a missão, o boss **não inicia** e a mensagem diz quem está bloqueando.

## 📊 4. Analyser completo

- Botão **📊 Analyser** no menu de party abre o modal completo do **Party Hunt Analyser**: hunt, duração, kills, exp total, **exp/h**, kills/h, loot e a **tabela por membro** (exp, kills, loot, level-ups). Funciona no modo local e online.

## 🐉 5. Timira the Many-Headed (boss)

- Stats/skills do Canary: **75.000 HP · 45.500 exp · armor 82 · defense 60 · mitigação 2.07** · resist 10% em energy/fire/ice/death.
- **Loot oficial** do `.lua` do Canary (30 itens: crystal coin, potions de boss, naga basin, timira's sensors, giant gems, dawnfire/frostflower/midnight set, naga armas e quiver...).
- **Requisito:** missão do mapa das Nagas — **25 Naga Archer + 25 Naga Warrior + 25 Makara**.
- **16h de cooldown.** Ao **completar a missão o cooldown é ZERADO**; ao entrar no boss a missão volta a zero (precisa refazer os 25/25/25 para liberar de novo).

## 🎨 6. Itens de loot sem sprite — AGORA COM SPRITE (não removidos!)

- **61 itens** de loot adicionados com **ficha + sprite oficial** do DAT 15.x (items.xml do Canary): **silver-token**, **gold-ingot**, armas nagas (sword/axe/club/wand/rod/crossbow), **giant-*** gems, potions de boss (bullseye/berserk/mastermind/transcendence), **one of timira's many heads**, **piece of timira's sensors**, naga scales/armring/earring, rift-*, dawnfire/feverbloom/frostflower, death gaze, ferumbras mana keg, etc.
- **silver-token e gold-ingot voltaram ao loot do Ferumbras Mortal Shell.**
- Nenhum item de loot do jogo fica sem sprite (só 3 itens de catálogo que não caem em lugar nenhum: rusty-boots, epic-wisdom, market).

## 🧪 Testes

- `tools/test_party_v16.js` (novo, 8 cenários: hp/mp, zona, aceite por zona, requisitos de boss).
- `tools/test_party_api.js` atualizado com a regra de zona no aceite.
- Runtime: timira boss + missão/CD + painel + trava de hunt + analyser.
- Regressão completa (90 scripts, market, dt-seal, scan 15.x) — tudo verde.

## Como atualizar

1. Baixe o zip e extraia **sobre** a pasta do jogo (substituindo os arquivos).
2. Rode o `database.sql` novo (o servidor também cria/migra as colunas `zone/hp/mp/max_hp/max_mp` em `characters` sozinho no primeiro uso).
