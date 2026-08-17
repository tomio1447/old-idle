# World Boss / Warzone — especificação

Status: **lobby + instância compartilhada multiplayer** (mapa placeholder 40×40). OTBM oficial e drops raros finais entram depois.

## Mapas (próximo passo)

- Arena oficial OTBM chegará depois em **`beta-maps/bosses`** (validação do mapa oficial).
- Por agora permanece o **mapa placeholder** 40×40; **não bloqueia** testes de lobby/JOIN/multiplayer.
- Drops raros e arte dedicada do World Boss também ficam para depois dos OTBM.

## Visão geral

- Rotação a cada **3h** (produção): escolhe **WZ1–WZ3** com peso igual (pode repetir).
- Só **1 World Boss** ativo por vez.
- Timeout de kill: **60 min** → fail para todos.
- Wipe (todos caídos ao mesmo tempo) → fail (`party-wipe`).
- Morte individual: **revive 30s** (não é permadeath de boss solo).

## Lobby (10 min)

- Modal no canto superior direito (área do mission box): **`WARZONE N OPEN — JOIN`**.
- Cabeçalho mostra o **sprite do boss** da warzone (`bossSprite` em `assets/mob/…`).
- Máx. **30** personagens no lobby.
- Máx. **2** chars por conta **por evento**.
- Em **30/30** → fecha e inicia imediatamente.
- Fim do timer com **≥ `WB_MIN_START`** chars → inicia; abaixo → cancela.
  - Produção: **≥20** inicia; **≤19** cancela.
  - `TEST_SERVER=1`: default **`WB_MIN_START=2`**.
- **JOIN** / **LEAVE** (LEAVE com cooldown de 30s).
- No start: **countdown 60s** com mensagem on-screen.

## Instância compartilhada (como Megalomania / warzones)

No fim do countdown o servidor:

1. Escolhe o **host** = primeira conta do JOIN.
2. Cria **uma** `account_instances` autoritativa no host com **todos** os chars JOIN (até 30).
3. Liga `bindShare` conta → `{ ownerAccountId, instanceId }`.
4. Envia SSE `teleport` com `instanceId` / `isHost`.

Clientes (host e convidados):

1. Parar hunt → templo + full HP/MP (`world-boss-prep`; host **não** encerra a sala WB).
2. `accountLoadInstance` + `resumeIdleInstance` na sala compartilhada.
3. Ticks online autoritativos (convidados avançam a row do host com `leaseAccountId`).
4. Sem `startBoss` / sem arena local isolada / sem `partyReportZone({ zone: "boss" })`.

Boss ids: `world-boss-wz1` | `world-boss-wz2` | `world-boss-wz3`  
HP: **2.5M / 4M / 6M** (tabela warzone), não o HP do catálogo Canary stub.

## Bosses / sprites

| Warzone | Boss | bossSprite | HP |
| ------- | ---- | ---------- | -- |
| WZ1 | The Deathstrike | `deathstrike` | 2.500.000 |
| WZ2 | Gnomevil | `gnomevil` | 4.000.000 |
| WZ3 | The Abyssador | `abyssador` | 6.000.000 |

## Combate

- Mapa placeholder até OTBM.
- Stack no mesmo SQM permitido; AoE por tile.
- Helper controla chars; jogador pode mover um manualmente.
- Sem máculas Soul War no kill do WB.
- Disconnect: worker avança se ninguém da warzone tiver lease; com alguém online, clients tickam.

## Score / loot (stub)

| Métrica | Peso |
| ------- | ---- |
| Damage dealt | 1.0 |
| Heal to allies | 0.5 |
| Damage taken | 0.25 |

- Sucesso: **3× `major-crystal-token`** por conta (≥1 char vivo), via Reward Chest.
- HP do boss é o da instância autoritativa (`syncSharedBoss`); `/report` só pontua.

## API

| Método | Rota | Quem |
| ------ | ---- | ---- |
| GET | `/api/world-boss/state` | público / Bearer opcional |
| POST | `/api/world-boss/join` | `{ token, characterIds:[…] }` |
| POST | `/api/world-boss/leave` | `{ token }` |
| POST | `/api/world-boss/loaded` | mapa carregado |
| POST | `/api/world-boss/report` | deltas de score (opcional) |
| POST | `/api/world-boss/admin/force-open` | admin / `MAINTENANCE_TOKEN` / TEST_SERVER |
| POST | `/api/world-boss/admin/force-close` | idem |

SSE: evento `world-boss` (broadcast + por conta).

## Env — timers de teste

| Variável | Produção default | Test default |
| -------- | ---------------- | ------------ |
| `WB_ROTATION_MS` | **10800000 (3h)** | **10800000 (3h)** — override curto só se setar env |
| `WB_LOBBY_MS` | 600000 (10 min) | 75000 |
| `WB_COUNTDOWN_MS` | 60000 | 15000 |
| `WB_SPAWN_DELAY_MS` | 10000 | 5000 |
| `WB_BOSS_TIMEOUT_MS` | 3600000 (60 min) | 600000 |
| `WB_LEAVE_COOLDOWN_MS` | 30000 | 30000 |
| `WB_MIN_START` | 20 | **2** |
| `WB_MAX_CHARS` | 30 | 30 |

## Forçar lobby (local :8001)

```powershell
Invoke-RestMethod -Method POST -Uri "http://127.0.0.1:8001/api/world-boss/admin/force-open" `
  -ContentType "application/json" -Body '{"warzoneId":"wz1"}'
```

Arquivos: `server/world_boss.js`, `server/server.js` (`createWorldBossSharedInstance`), `server/authoritative_engine.js`, UI em `game/js/world-boss-ui.js` + `BOSS_DEFS` em `game/js/game.js`.
