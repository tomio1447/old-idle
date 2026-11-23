# Sistema PvP — Guild vs Guild (Guerra Agendada)

Documento de referência para polimento do sistema PvP. Reflete o estado
atual do código (`server/pvp.js`, `server/authoritative_engine.js`,
`game/js/pvp-ui.js`).

## Visão geral

Batalhas **agendadas** entre duas guilds com **aposta do caixa da guild**.
Líder/vice criam um lobby → convite vai para a guild rival → em T-10min o
sistema sorteia o roster → em T-0 a batalha abre numa instância
compartilhada num mapa de guerra. Placar por **frags** ou **domínio de
área de controle**, ao fim de 10 min o vencedor leva o pote menos a taxa
da casa.

## Arquivos

| Arquivo | Papel |
|---|---|
| `server/pvp.js` (~970 linhas) | Controlador: lobby/convite/roster/payout/histórico/tick |
| `server/authoritative_engine.js` | Regras de combate dentro da instância (`auth.pvpBattle`) |
| `game/js/pvp-ui.js` (~990 linhas) | Modal: tabs Batalhas/Convites/Histórico, lobby, countdown, detalhe |
| `server/server.js` (~7450) | Rotas `/api/pvp/*` com rate-limit |
| `server/guild.js` | Guild/ranks/caixa/log — fonte das apostas |
| `tools/test_pvp.js` | Regressão: OTBMs, controlador, JsonStore, engine, wiring |
| `tools/test_pvp_instance_rules.js` | Regras da instância compartilhada |
| `server/scripts/seed-pvp-5x5.js` | Seed de batalha 5x5 para testes |
| `tools/import_pvp_assets.py` | Importa OTBM de guerra + previews |

## Fluxo de uma batalha

```
lobby (líder/vice)        POST /api/pvp/lobby
  → registro 'pending' + convite para a guild rival (SSE)
aceite (líder/vice rival) POST /api/pvp/respond  {accept|decline|cancel}
  → 'accepted': aposta DEBITADA do caixa das duas guilds
T-10min  prepareBattle(): sorteia roster dos membros elegíveis,
         trava chars ('prep'), cria instance compartilhada
T-0      startBattle(): status 'live', chars teleportam para a arena
live     engine toca a guerra; controller espelha placar/fim via tick
fim      finishBattle(): consolida stats, paga pote+insígnias, grava
         resultado, publica action='end' por SSE
```

`cancel()` por qualquer líder em pending/accepted devolve as apostas.
`GET /api/pvp/state` = visão da conta (rivais elegíveis, minStake,
batalhas, convites, histórico recente). `GET /api/pvp/battle?id=` =
detalhe/placar/resultado.

## Regras e constantes (server/pvp.js)

| Constante | Valor |
|---|---|
| `PVP_MIN_GUILD_MEMBERS` | 7 membros |
| `PVP_MIN_GUILD_LEVEL` | 2 |
| `PVP_MIN_LEAD_MS` | +10 min de antecedência |
| `PVP_PREP_MS` | T-10 (aviso + sorteio + countdown) |
| `PVP_CREATE_COOLDOWN_MS` | 30 min entre criações |
| `PVP_TEAM_SIZES` | 3, 5, 10, 15, 20, 50, 100 |
| `PVP_HOUSE_FEE` | 10% do pote |
| `PVP_MIN_STAKE` | 5.000.000 gold / 25 TC |
| `PVP_BATTLE_MS` | 10 min |
| `PVP_QUICK_INVITE_MS` | convite rápido vale 5 min |
| `PVP_QUICK_START_MS` | batalha começa 3s após aceite (test server) |
| `PVP_INSIGNIA_{WIN,LOSE,DRAW}` | 3 / 1 / 1 por conta |
| `PVP_PARTY_MAX_CHARS` | 5 chars da party da conta entram juntos |

Empate = devolução integral das duas apostas (sem taxa), sem prorrogação.

## Mapas de guerra (`PVP_MAPS`)

| Mapa | OTBM | Modo | Especial |
|---|---|---|---|
| `ank_open` — Ankrahmun Open Battle | `ank_open.otbm` | `frags` — primeiro a 100 | safezones PZ reais |
| `venore_town` — Venore Town | `venore_town.otbm` | `control` — segundos de domínio | área central 7×5 na praça |

Bounds/safezones/zona de controle declarados em coordenadas RME
absolutas e convertidos para o grid local (`pvpMapLocal`).

**OTBMs já presentes em `game/maps/` e ainda NÃO usados:**
`ankrahmun_tombs.otbm`, `otherworld-venore.otbm`, `warzone4/5/6.otbm`
— base pronta para 5 mapas novos.

## Combate dentro da instância (engine)

`auth.pvpBattle` ativa um conjunto próprio de regras:

- **Dano ×0.65** (`PVP_BATTLE_DMG_MUL`) — o proxy de HP aplica a
  redução na entrada e desfaz na leitura (hp e maxHp virtuais).
- **Respawn 10s** na própria safezone (`pvpBattleRespawn`); sem
  permadeath, sem custo de bless, sem entrada no deathLog.
- **PZ real**: em mapa `pz`, ninguém entra na safezone inimiga
  (`pvpBattleStepBlocked`) e não há dano dentro de qualquer safezone.
- **Placar frags**: kill credita +1 em `pb.scores[team]`; evento
  `pvp-score` por kill; `fragTarget` encerra na hora.
- **Placar controle**: tick conta chars vivos por time na zona
  (`pvpBattleControlCounts`); domina quem tem mais; `dominationMs`
  soma em segundos no placar; evento `pvp-control` em mudança de dono.
- **Stats por char** (`pb.stats[charId]`): kills/deaths/damage —
  usados no resultado (mostKills/mostDeaths/mostDamage).

### IA de batalha (a parte mais elaborada)

Cada conta entra com **a party inteira** (até 5 chars); só um é
pilotado — os demais são automáticos dentro da instância:

- **Âncora** (`pvpBattleLeaderChar`): o char pilotado da conta líder
  da guild (`_pvpDrivenAt` < 5s). É ele quem dita o avanço.
- **Target call**: o líder clica num inimigo (`pvpHandleCombatClick`
  → `teamTarget` via `/api/instance` pos) e o time inteiro avança
  naquele alvo — melee a 1 sqm, ranged a 3 (`pvpBattleGoal` PUSH).
- **Sem call**: seguidores só engajam hostis a ≤5+alcance do líder
  (melee 6 / ranged 8); mais longe = segura a linha.
- **Formação** (`pvpFollowCell` + `pvpDistanceField` BFS): cada
  seguidor ocupa o anel da própria vocação ao redor do âncora —
  knight/monk raio 1 (colado), paladin/druid/sorcerer raio 3
  (`pvpApproachRange`), com transbordo até 5 sqm e penalidade para
  célula dentro de safezone. BFS cacheado por destino
  (`PVP_FIELD_CACHE`) — um BFS por destino distinto, não A* por passo.
- **Alvo automático** (`pvpBattleTarget`): o alvo chamado, senão o
  inimigo vivo de **menor maxHp**.
- `accountIsVip` **não é exigido**: em `pvpBattle`, autoWalk e
  walkIntent são sempre honrados.

## Resiliência

- `pvpAuthSerialize` — operações por instância em fila (anti-corrida).
- `pvpAuthCache{Get,Set,Drop,Sweep}` + `pvpAuthMarkAllDirty` — cache de
  autoridade por instanceId com varredura.
- `pvpFilterVisualState` — o visual que cada conta recebe (self marcado).
- `pvpResumeLiveOnBoot` / `rebindLive` — após restart do servidor a
  batalha 'live' religa o espelhamento a partir do banco.
- `finishBattle` marca `status='finished'` **antes** dos pagamentos —
  um erro de payout não repete o crédito do pote.
- `lockedAccount` — conta não pode entrar em duas batalhas.
- `endSharedInstance(host, "pvp-end")` no unbind.

## Cliente (pvp-ui.js)

- Modal shell `pvp-modal-shell` (estilo cidade).
- **Tabs**: `battles` (cards com guild icons, placar, status, mapa),
  `invites` (aceitar/recusar com contagem), `history` (resultado por
  conta: score, kills/deaths/damage próprios, insígnias).
- **Lobby**: mapa (com preview `assets/ui/pvp/*.png`), tamanho do time,
  modo, aposta (gold/TC com mínimos), data-hora e rival (lista de
  guilds elegíveis por nível).
- **Countdown**: `_pvpCountdown` + timer; sync "pvp" via SSE atualiza
  modal e contador; notificações de convites novos
  (`pvpNotifyKeys`/`pvpUnseen` + badge).
- Durante a batalha: eventos `pvp-score` / `pvp-control` / `pvp-respawn`
  chegam no stream da instância; placar exibido no combate.

## Onde polir — análise de melhorias

### UX / apresentação
1. **Placar ao vivo no HUD**: hoje os eventos `pvp-score`/`pvp-control`
   existem — falta um placar persistente (nome das guilds, tempo
   restante, frags/domínio) sempre visível durante a batalha, no estilo
   da nova boss bar ornamentada.
2. **Kill feed**: feed de kills ("A matou B") no topo do mapa durante
   a batalha — eventos já existem (`pvp-score`), falta a UI.
3. **Resultado em tela**: ao `action='end'`, abrir modal de resultado
   com placar final, MVP (mais kills/dano), pote — hoje o jogador
   descobre pela aba histórico.
4. **Contagem regressiva audível/visual**: aviso em tela aos T-10/T-1
   com som, para quem está caçando.
5. **Spectate**: conta de fora da batalha assistindo a instância
   (visual filtrado já existe — `pvpFilterVisualState`).

### Regras / modos
6. **Novos mapas**: 5 OTBMs já no repo sem uso (`warzone4/5/6`,
   `ankrahmun_tombs`, `otherworld-venore`) — cada um precisa só de
   bounds + safezones + modo.
7. **Modos novos**: "Last team standing" (sem respawn, eliminação),
   capture-the-flag, melhor de 3 rounds.
8. **Overtime / desempate**: hoje empate devolve aposta — prorrogação
   de 2 min ou morte súbita seria mais emocionante (result.overtime já
   existe no payload).
9. **Forfeit por abandono**: se um time inteiro desconectar por X
   min, vitória do outro — hoje só decide por placar/timer.
10. **Ranking/Elo de guilds**: vitórias já vão pro guildLog; falta
    computar um rating e exibir no modal/aba de guild.

### Economia / progressão
11. **Loja de insígnias PvP**: insígnias acumulam mas não têm uso —
    catálogo de recompensas (outfits, mounts, títulos, itens).
12. **Histórico por guild** (não só por conta): aba "Guerras" no
    painel da guild com W/L, potes, stats agregados.
13. **Anti-abuse**: impedir farm de frags entre contas da mesma
    guild/alt (já há `lockedAccount`; falta heurística de feed).

### Robustez
14. **Reconnect dentro da batalha**: o char reconecta na instância?
    Revisar comportamento ao fechar a aba no meio do 'live' (hoje o
    automático assume? documentar e testar).
15. **Cancelamento justo**: cancelar em 'prep' devolve aposta mas e
    insígnia/compensação? Definir política.
16. **Testes de carga**: 100v100 = 200 chars + IA por step (200ms) —
    medir custo do `pvpBattleGoal`/BFS com roster cheio antes de abrir
    tamanhos grandes.

## Verificação

```bash
node tools/test_pvp.js                  # regressão geral
node tools/test_pvp_instance_rules.js   # regras da instância
node server/scripts/seed-pvp-5x5.js     # batalha 5x5 de teste
```
