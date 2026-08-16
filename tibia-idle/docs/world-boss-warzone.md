# World Boss / Warzone — especificação (skeleton)

Status: **skeleton** (lobby + timers + stub de combate/loot). Mapas OTBM e drops raros finais entram depois.

## Mapas (próximo passo)

- Arena oficial OTBM chegará depois em **`beta-maps/bosses`** (validação do mapa oficial).
- Por agora permanece o **mapa placeholder** 40×40 no cliente; **não bloqueia** testes de lobby/JOIN.
- Drops raros e arte dedicada do World Boss também ficam para depois dos OTBM.

## Visão geral

- Rotação a cada **3h** (produção): escolhe **WZ1–WZ3** com peso igual (pode repetir).
- Só **1 World Boss** ativo por vez.
- Timeout de kill: **60 min** → fail para todos.
- Todos os personagens do evento mortos → fail.

## Lobby (10 min)

- Modal no canto superior direito (área do mission box): **`WARZONE N OPEN — JOIN`**.
- Cabeçalho mostra o **sprite do boss** da warzone (`bossSprite` em `assets/mob/…`, stubs Canary).
- Máx. **30** personagens no lobby.
- Máx. **2** chars por conta **por evento** (UI desabilita checkboxes além de 2; API rejeita `>2`).
- Em **30/30** → fecha e inicia imediatamente.
- Fim do timer com **≥ `WB_MIN_START`** chars → inicia; abaixo → cancela.
  - Produção: **≥20** inicia; **≤19** cancela.
  - `TEST_SERVER=1`: default **`WB_MIN_START=2`**.
- **JOIN**: escolhe até 2 chars da conta logada.
- **LEAVE**: remove os dois chars; **cooldown de 30s** na conta.
- Lobby mostra contagem + breakdown de vocações.
- No start: **countdown 60s** com mensagem on-screen para quem entrou:

  > EM BREVE VOCÊ IRÁ PARTICIPAR DE UM WORLD BOSS, VERIFIQUE SEU HELPER E AJUSTE PARA A BATALHA!

- Depois: **PT inteira** vai ao templo (limpa hunt/boss instance online); full HP/MP; se estiver em outro boss → perde/skip esse boss.
- Só os **chars do JOIN** (máx. 2/conta) entram no mapa WB; demais membros da party ficam no templo.
- Arena WB é instância **local isolada** (`worldBoss`), sem waves de hunt e sem `partyReportZone({ zone: "boss" })`.
- Teleporte ao mapa → espera loaded → **10s** → spawn do boss.

## Bosses / sprites (warzone)

| Warzone | Boss | bossSprite (assets/mob) |
| ------- | ---- | ----------------------- |
| WZ1 | The Deathstrike | `deathstrike` |
| WZ2 | Gnomevil | `gnomevil` |
| WZ3 | The Abyssador | `abyssador` |

Fluxo de entrada (obrigatório): **parar hunt** → **templo + full HP/MP** → party report `city` (PT inteira) → só os chars do JOIN entram na arena WB isolada (sem `startBoss` / sem follow de party para sala de boss / sem instância de hunt online).

## Combate (skeleton)

- Mapa placeholder grande/simples até chegar OTBM em `beta-maps/bosses`.
- Câmera segue o personagem ativo.
- Stack no mesmo SQM permitido; AoE por tile acerta todos no stack.
- Helper controla chars; jogador pode mover **um** manualmente só para posicionar.
- Morte: revive em **30s**; os **dois** chars mortos → templo + remove a conta do evento (fail só para ela).
- Disconnect: continua offline/helper; ainda pode receber reward se o boss completar.

## Score / loot (stub)

Pesos de score:

| Métrica            | Peso |
| ------------------ | ---- |
| Damage dealt       | 1.0  |
| Heal to allies     | 0.5  |
| Damage taken       | 0.25 |

- Chance de rare por score: **depois**.
- Sucesso WZ1–3: **3× `major-crystal-token`** por **conta** (se ≥1 char vivo), via **Reward Chest**.
- Itens raros únicos: sem duplicar o mesmo item id para dois players (hook preparado; drops ainda stub).

## API

| Método | Rota | Quem |
| ------ | ---- | ---- |
| GET | `/api/world-boss/state` | público / Bearer opcional |
| POST | `/api/world-boss/join` | `{ token, characterIds:[…] }` |
| POST | `/api/world-boss/leave` | `{ token }` |
| POST | `/api/world-boss/loaded` | mapa carregado |
| POST | `/api/world-boss/report` | deltas de damage/heal/taken + deadCharIds |
| POST | `/api/world-boss/admin/force-open` | admin / `MAINTENANCE_TOKEN` / TEST_SERVER |
| POST | `/api/world-boss/admin/force-close` | idem |

SSE: evento `world-boss` (broadcast + por conta).

## Env — timers de teste

Com `TEST_SERVER=1` os defaults já são curtos. Override:

| Variável | Produção default | Test default |
| -------- | ---------------- | ------------ |
| `WB_ROTATION_MS` | 10800000 (3h) | 180000 (3 min) |
| `WB_LOBBY_MS` | 600000 (10 min) | 75000 |
| `WB_COUNTDOWN_MS` | 60000 | 15000 |
| `WB_SPAWN_DELAY_MS` | 10000 | 5000 |
| `WB_BOSS_TIMEOUT_MS` | 3600000 (60 min) | 600000 |
| `WB_LEAVE_COOLDOWN_MS` | 30000 | 30000 |
| `WB_MIN_START` | 20 | **2** |
| `WB_MAX_CHARS` | 30 | 30 |

## Forçar lobby (local :8001)

Com servidor local (`TEST_SERVER=1`):

```powershell
Invoke-RestMethod -Method POST -Uri "http://127.0.0.1:8001/api/world-boss/admin/force-open" `
  -ContentType "application/json" -Body '{"warzoneId":"wz1"}'
```

Opcional: `"warzoneId":"wz2"` / `"wz3"`. Sem body escolhe aleatório.

Fechar:

```powershell
Invoke-RestMethod -Method POST -Uri "http://127.0.0.1:8001/api/world-boss/admin/force-close" `
  -ContentType "application/json" -Body '{}'
```

Em produção use header `x-maintenance-token` ou sessão admin.

## Manutenção (`MAINTENANCE_MODE`)

- Default **OFF** (local pode testar normalmente).
- `MAINTENANCE_MODE=1` no `.env`:
  - HTML de manutenção em `/` (mensagem PT + Discord clicável)
  - `503` em `/api/login`, `/api/register`, `/api/lease/*`
  - `/api/health`, `/api/maintenance`, `/api/admin/*` seguem disponíveis
- Não apaga DB.

Arquivos: `server/world_boss.js`, rotas em `server/server.js`, UI em `game/js/world-boss-ui.js`.
