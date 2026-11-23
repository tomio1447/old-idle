# PvP Tactical AI HARD — Auditoria FASE 0

Relatório de compatibilidade e pontos de integração. Nenhum código foi
alterado nesta etapa.

---

## A. Arquitetura atual do combate

### Modelo de execução

- **Instância compartilhada** (uma row, M contas): `db.instanceAuthorityTick`
  é chamado por `POST /api/instance/tick` de **qualquer** conta da guerra —
  `advanceWithVisuals` recebe o `visual` daquela conta e roda o `step`.
  (`server/server.js:3352-3393`)
- **Step autoritativo**: `step(auth, now, {dt: AUTH_STEP_MS=200})` em
  `server/authoritative_engine.js`. Todos os chars (humanos e auxiliares)
  passam pelo mesmo loop de ataque, cura, poções, movimento e respawn.
- **Congelamento seletivo**: `pvpFrozenIds` = chars com `self` no visual
  da conta que tickou. O `self` é a pose autoritativa do pilotado
  (`advanceAuthorityState`, ~linha 10285). Os demais são movidos pelo
  servidor via `pvpBattleGoal` (`advanceAuthorityMovement`, ~8948).

### O que já é automatizado para TODOS os chars (humanos inclusive)

| Ação | Função | Gate |
|---|---|---|
| Ataque de arma | loop `item.attackAcc` + `authorityPlayerTarget` | `pvpApproachRange`, distância |
| Spells de combo | `nextComboSpell` → bloco de cast (~9273) | lvl/ml/mana/`_spellCd`/`_groupCd`/`_offensiveCd` |
| Runas | `tryUseRune` → `runeUsable` + `consumeSupply` | lvl/ml/CDs/`PVP_BATTLE_RUNE_RANGE=7` |
| SD burst | `tryUseRune("sudden-death-rune")` sorcerer/druid | `item._pvpAttackOff` |
| Cura própria | `healPlayers` (lista `healSpells` por %) | `healAcc>=1000`, thresholds |
| Friend-heal | `healPlayers` 2º loop (`healFriendSpells`) | `friendHealSpellIds`, time filtrado |
| Poções/UH | `usePotion` | `_potionCd`, `healItemAt`/`manaAt` |
| Magic Shield | `tryMagicShield` | automático em dano |

**Conclusão de arquitetura**: o "motor de combate dos jogadores" já é
server-side e universal. O que o humano controla de fato é: posição
(`self` pose / `walkIntent`), `teamTarget` (líder), `pvpAtk`, `wallTarget`,
`pvpCtrl` (painel por char) e configs (combo, heal, presets). A IA HARD
portanto = **camada de decisão/goal sobre mecânicas existentes**, não um
motor novo.

### Movimento

- `pvpBattleGoal(auth,item)` → `{cx,cy,td,push|follow|zone}`: marcha da
  sz, anel por vocação no líder (`pvpFollowCell` + `pvpDistanceField` BFS
  cacheado em `PVP_FIELD_CACHE`, chave `mapId:w×h:blkSig:gx:gy`), push no
  `teams[t].targetId`, disputa de `controlZone` em Venore, engajamento
  limitado a `PVP_BATTLE_FOLLOW_RANGE=5`+alcance do líder.
- Execução: `walkToward` → `walkAcc`/`authorityStepDuration` +
  `pvpStepToward`/`pvpStepToRange` + `authorityApplyStep` — mesmos
  primitivos do walk humano (`walkIntent` → `AUTH_STEP_DIRS`).
- Bloqueios: `authorityCellBlocked` (inclui `pvpWallAt`),
  `pvpBattleStepBlocked` (sz inimiga), occupancy compartilhada por tick.

### Batalha (pvpBattleTick ~5342)

- Expira walls, processa `wallCalls`, dominação em Venore
  (`pvpBattleControlCounts`), timer final → `pb.finished`.
- Respawn: `pvpBattleRespawn` (10s, célula livre na própria sz).

### Financeiro / lifecycle (server/pvp.js)

- Lobby SSE, convites, roster sorteado, pote−10%, insígnias 3/1/1,
  histórico, `pvpAuthSerialize`/`pvpAuthCache`/`pvpResumeLiveOnBoot`.
  **Intocado pela IA.**

---

## B. Como a IA atual funciona

1. **Detecção de "sem piloto" (já existe!)** — `advanceAuthorityMovement`
   (~8911): `pvpAi = auth.pvpBattle && !(_pvpDrivenAt > now-5000)`.
   Char cujo `self` visual não chega há 5s vira IA de movimento
   automaticamente, mesmo com `autoWalk:false` salvo.
   `_pvpDrivenAt` é carimbado no branch `self` do `syncAuthorityVisualState`.
2. **Goal único** `pvpBattleGoal` decide tudo: sair da sz, seguir anel do
   líder, push no target call, disputar zona, perseguir no raio do líder.
3. **Combate universal**: o loop de ataque/cura/poção já roda para todos.
4. **Controles manuais por char** (`pvpCtrl`, implementado esta semana):
   `chase` (knight/monk), `mode` ue/sd/paralyze/heal/bow/xbow — enviados
   pelo painel do líder de conta. A IA HARD vai **preencher `_pvpCtrl`
   server-side** em vez de depender do cliente — a infraestrutura já está
   pronta para isso.
5. **Hoje, chars "offline"** (conta que não ticka) continuam na arena:
   auxiliares já são IA; o `self` congela na pose antiga só por ≤5s e
   depois o `pvpAi` retoma. **Não existe, porém, nenhum cérebro tático —
   a "IA" atual é literalmente a formação básica.**

---

## C. Funções existentes reutilizáveis

| Necessidade da spec | Função real | Local |
|---|---|---|
| Controle/offline | `_pvpDrivenAt` + flag `pvpAi` (5s) | authoritative_engine.js ~8911 |
| Percepção hostis | `livingHostilePlayers`, `combatLivingFor` | 4821, 4870 |
| Alvo | `pvpBattleTarget`, `authorityPlayerTarget` | ~4880+ |
| Goal/movimento | `pvpBattleGoal`, `walkToward`, `pvpStepToward/ToRange` | 5170, 8890 |
| BFS/cache | `pvpDistanceField`, `PVP_FIELD_CACHE` | 8605 |
| Anel/formação | `pvpFollowCell` | ~5128 |
| Safezone/PZ | `pvpBattleInAnySafezone`, `pvpBattleSz`, `pvpBattleStepBlocked` | — |
| Runas | `tryUseRune`, `runeUsable`, `consumeSupply` | 2991, 9000, 4190 |
| Spells | `nextComboSpell`, `pvpSpellReady`, `pvpPrioritySpell` | 3019, ~4920 |
| Cura | `healPlayers`, `usePotion`, `tryMagicShield` | 6493+ |
| AoE/area | `spellAreaCells`, `spellAreaTargets`, `ammoMatrixTargets` | — |
| Pack/área | `packOpportunity`, `runeIsMultiHit`, `spellIsMultiHit` | — |
| Equip | `pvpEquipPreset` (swap arma+munição), `equipInstanceItem` | ~4990, server.js:4256 |
| Paralyze | `pvpTryParalyze` + `_pvpParalyzeUntil` | ~4970 |
| Controle/modos | `_pvpCtrl` + `sanitizePvpCtrl` + transporte visual | ~1120, 1228 |
| Dano PvP | `applyPlayerPvpDamage`, `scalePlayerDamage`, mul 0.65 | — |
| Cooldowns | `startSpellCooldown`, `spellGroupBusy`, `_runeCd` | 3973+ |
| Respawn | `pvpBattleRespawn` | ~5225 |
| Serialização | `pvpAuthSerialize` (descriptor.state.pvpBattle → UI) | server/pvp.js:149 |
| Presença de conta | `db.socialPresence(accountIds)` → `{online,inInstance}` | db.js:1443 |
| Lease | `/api/lease/*` acquire/takeover/release | server.js:389-418 |

---

## D. Limitações técnicas

1. **AFK ≠ offline hoje**: `_pvpDrivenAt` só marca *presença* do self no
   visual — o cliente envia a pose a cada tick mesmo com o jogador parado.
   Para "AFK confirmado" precisamos de um segundo carimbo de **atividade
   intencional**: `walkIntent` mudando, `teamTarget`, `wallTarget`,
   `pvpCtrl`, cliques de ataque — ações que hoje não carimbam nada.
   *Mitigação*: novo `_pvpHumanActAt` alimentado por campos intencionais.
2. **Conflito pose × IA**: um char "AFK confirmado" continua enviando
   `self`+pose (aba aberta). Se a IA assumir movimento, a pose do cliente
   regressa o passo (mesmo problema já resolvido para auxiliares —
   `!pos.self → continue` sem applyPose). Solução: quando `controlMode===
   AI_HARD`, o servidor ignora `applyPose` para aquele char — mesma
   técnica já usada para paralyze e auxiliares.
3. **Sem estado de controle explícito**: hoje é um boolean implícito. A
   spec exige máquina HUMAN/AI_PENDING/AI_HARD/HUMAN_RETURNING/DEAD com
   histerese (evitar oscilação em pausas de 5-15s).
4. **`pvpBattleGoal` é O(players) por chamada**: `livingHostilePlayers`
   filtra `auth.players` inteiro a cada goal × char × 5 steps/s. Em
   100v100 → ~1M de comparações/s só de filtro. Precisa de cache por tick.
5. **Ocupação por step**: `buildOccupancy`/`occ` já é compartilhada por
   tick — manter esse padrão, nunca reconstruir por decisão.
6. **Sem memória/percepção**: nada existe — `PVP_FIELD_CACHE` é o único
   cache e é por mapa, não por char.
7. **Decisão síncrona por step**: hoje goal é computado inline no loop de
   movimento. Um scheduler staggered precisa desacoplar "decidir"
   (300-500ms) de "andar" (step de 200ms) — o goal já é um objeto
   passível de cache por char (`item._aiGoal`).
8. **Tick é cliente-dirigido**: se todas as contas caírem, a batalha
   para de avançar (instância dorme) — fora do escopo da IA, mas vale
   notar: bots nunca "puxam" ticks; a IA roda dentro do `step`.

---

## E. Pontos exatos de integração

| # | Ponto | Arquivo:linha (aprox) | Uso |
|---|---|---|---|
| E1 | `syncAuthorityVisualState` loop players | authoritative_engine.js ~1205 | Carimbar `_pvpHumanActAt` quando chegam campos intencionais (`walkIntent`,`teamTarget`,`wallTarget`,`pvpCtrl`,`challenge`,`cfg`) |
| E2 | `pvpAi` flag | ~8911 | Substituir por `aiControlState(item,now)` — máquina de estados |
| E3 | `pvpBattleGoal` | ~5170 | Wrapper: `aiBattleGoal` decide antes; goal em cache `item._aiGoal` |
| E4 | Loop de ataque (SD block) | ~9268 | Ponto de injeção de prioridades por decisão da IA (reuso `_pvpCtrl`/forced spells — já cabe) |
| E5 | `healPlayers` friend-heal | ~6590 | Percepção de aliados críticos já team-filtrada |
| E6 | `pvpBattleTick` | ~5342 | Chamada do `aiCoordinatorTick` (1/s) + `aiScheduler` |
| E7 | `pvpAuthSerialize` | server/pvp.js:149 | Exportar `controlMode` por char → badge UI |
| E8 | `initializeAuthority`/`descriptor.state` | ~10085 | Inicializar `auth.ai` (registry/memória) a partir do estado serializado |
| E9 | `pvp-ui.js` scoreboard | ~1030 | Badges HUMAN/AI/AFK/DISCONNECTED por char (read-only) |
| E10 | `db.socialPresence` | db.js:1443 | Offline confirmado por conta (lease) — chamar no coordinator, não por char |
| E11 | `pvpProcessWallCalls` | ~5302 | IA pode emitir `wallCalls[acc]` — reuso direto |

---

## F. Riscos de compatibilidade

1. **`_pvpCtrl` já é preenchido pelo cliente** (painel): IA e painel
   disputam o mesmo campo. Regra: IA só escreve `_pvpCtrl` quando o char
   está em AI_HARD; humano sempre vence.
2. **`applyPose` em paralyze + AI**: dois clamps diferentes —
   `_pvpParalyzeUntil` (combate) vs `controlMode===AI_HARD` (controle).
   Unificar num gate único de pose.
3. **`pvpFrozenIds` por tick**: o frozen-set muda a cada POST de conta
   diferente — o char pilotado do time B só congela quando B ticka. Em
   ticks de A, o self de B é "não-self" → entra no movimento IA... mas o
   gate `_pvpDrivenAt` protege (B fresco → `pvpAi=false` → `auto=false`
   → só `walkIntent`). *A máquina de estados tem de respeitar
   `_pvpDrivenAt` antes de qualquer coisa.*
4. **Snapshots serializados**: `auth.ai` precisa sobreviver
   checkpoint/serialize — campos `_ai*` devem ser excluídos do
   `TRANSIENT_VISUAL_KEYS`-style snapshot ou serializados explicitamente.
   Verificar `materializeAuthority`/`descriptor.state`.
5. **Events `_pvpMuted` no cliente**: ações de bots geram eventos
   normalmente — filtro de poluição já os trata igual a humanos.
6. **Não quebrar**: `teamTarget` do líder humano continua com prioridade
   sobre o coordinator do bot (comandante estratégico = líder humano;
   quando o líder está offline → coordinator assume macro-estratégia).
7. **`test_pvp.js`/`test_pvp_instance_rules.js`/`test_pvp_wall.js`/
   `test_pvp_ctrl.js`**: assertam comportamento atual do goal/attack —
   mudanças devem manter os defaults quando nenhum char é AI_HARD
   (regressão garantida por flag).

---

## G. Estrutura de arquivos recomendada

A spec propõe 16+ arquivos — o projeto real tem um único motor monolítico
e a infraestrutura já cobre metade. Recomendação **enxuta** (mesmo
padrão `server/pvp.js` + tools):

```
server/
  pvp-ai.js            — registry, máquina de estados, scheduler staggered,
                         percepção (cache por tick), memória, coordinator,
                         utility/decisão, perfis por vocação, debug/métricas.
  pvp-ai-config.js     — thresholds/prioridades/frequências tunáveis (HARD).
tools/
  test_pvp_ai_control.js  — FASE 1 (estados/AFK/histerese/retorno)
  test_pvp_ai_combat.js   — decisões por vocação, utility, recursos
  test_pvp_ai_perf.js     — benchmark 100v100 (orçamento de ms por step)
```

Justificativa: `authoritative_engine.js` já exporta os primitivos
(tryUseRune, nextComboSpell, pvpDistanceField, pvpEquipPreset...). Criar
`server/pvp/ai/*` separados duplicaria imports e circularizaria com o
engine — o módulo `pvp-ai.js` segue o padrão `pvp.js` (requer engine,
exporta funções chamadas nos pontos E1-E7). Se crescer, subdividir por
seções comentadas (PERCEPTION/DECISION/VOCATION) no mesmo arquivo, como
o engine já faz.

---

## H. Estratégia de performance para 100v100

Orçamento real: `AUTH_STEP_MS=200` por step × 200 chars.

1. **Decisão ≠ step**: decisão de goal a cada 300-500ms por char;
   `item._aiGoal` cacheado e o step só executa `walkToward` (barato).
   `aiScheduler` distribui: `charIndex % ceil(N/decisionsPerTick)` —
   ~40-70 decisões por step em 200 chars.
2. **Percepção por time, não por char**: `livingHostilePlayers`/
   `combatLivingFor` custam O(n) — montar `teamPerception` 1× por tick
   (hostis por time, HP%, distâncias pré-computadas, criticals) e
   compartilhar entre os 100 bots do mesmo lado.
3. **Occupancy única por tick** — já é o padrão (não regredir).
4. **BFS compartilhado**: `PVP_FIELD_CACHE` já deduplica por célula-alvo
   (líder é 1 alvo → 1 BFS por time por campo). Metas novas (retreat
   point, zone center) entram na mesma chave — LRU 256 já existe.
5. **Early-outs**: char morto/respawnando/downUntil → skip decisão.
   Char parado+sem mudança de contexto (`_aiGoalValid`) → reutiliza.
6. **Coordinator 1/s**: eventos de time + macro-estratégia —
   custo desprezível, roda em `pvpBattleTick`.
7. **`socialPresence`**: chamada 1× por coordinator tick por *conta*
   (não por char) — resultado cacheado 5s.
8. **Sem alocação por decisão**: perception/memory como objetos
   reutilizados (`item._aiMem`), evitar GC de 200 objects/300ms.

---

## I. Plano de implementação por fases

> Cada fase: código + teste dedicado + regressão das 4 suites PvP
> existentes (`test_pvp`, `test_pvp_instance_rules`, `test_pvp_wall`,
> `test_pvp_ctrl`) + commit separado.

### FASE 1 — Control Manager (`server/pvp-ai.js`, ~2 integrações engine)

- `AI_CONTROL` const + máquina de estados por char (`item._aiCtl`):
  `HUMAN → AI_PENDING (suspeito) → AI_HARD → HUMAN_RETURNING → HUMAN`
  + `DEAD` overlay (respawn) + `DISABLED`.
- Carimbos: `_pvpDrivenAt` (presença, existente) + novo `_pvpHumanActAt`
  (atividade intencional — campos intent do visual) + `socialPresence`
  (offline de conta, via coordinator).
- Tempos configuráveis: `AI_SUSPECT_MS=15000`, `AI_CONFIRM_MS=45000`,
  `AI_HYSTERESIS_MS=10000` (sem re-takeover em flick), `OFFLINE_MS=8000`
  (já coberto por `_pvpDrivenAt` 5s → manter).
- Pose-gate unificado: `AI_HARD` ignora `applyPose`/`walkIntent` do char
  (comandos do cliente não concorrem com a IA; retorno humano solta).
- `auth.pvpBattle.aiControl[charId]=mode` serializado → badge UI (E7/E9).
- *Zero mudança de comportamento enquanto nenhum char vira AI_HARD.*

### FASE 2 — Perception + Memory

- `teamPerception` 1×/tick/time: hostis por time com {hpPct,dist,voc,
  isolamento,ameaça}, aliados críticos, zone counts.
- `item._aiMem`: último alvo, últimos danos recebidos (janela 5s),
  perseguidores, expiry natural.

### FASE 3 — Decision Engine (utility)

- `aiDecide(item,perception)` → ação escolhida por score (tabela de
  prioridades da spec: morte iminente 100 … perseguição 40).
- Ações mapeadas para mecânicas existentes: goal (move), `_pvpCtrl.mode`
  (cast prefs), `wallCalls`, `teamTarget` (líder offline), forced spell.
- Estabilidade: histerese de alvo, penalidade de repetição, cooldown de
  decisão — em `_aiMem`.

### FASE 4 — Vocational profiles

- `PVP_AI_PROFILES[voc]`: alcance preferido, papel (frontline/ranged/
  support/burst), thresholds de recuo, magias/runas preferidas —
  lidas de RUNEDATA/SPELLDATA reais (sem nomes inventados além dos que
  já existem no código: sd/thunderstorm/avalanche/gfb/paralyze/sio/
  exori-*/exevo-*/mw).

### FASE 5 — Resource intelligence

- Poções: `usePotion` já cobre — a IA só ajusta thresholds via config
  transient (`item._aiRes`) sem tocar config salva.
- Equip: `pvpEquipPreset` como primitivo; avaliação expandida
  (resistência por elemento dominante inimigo).
- Runas de suporte: paralyze (já existe), mw via `wallCalls` (já existe),
  wild-growth/energy-wall como extensão do mesmo padrão — se aprovado.

### FASE 6 — Hybrid coordination

- `aiCoordinatorTick` em `pvpBattleTick` (1/s): macro-estratégia por time
  (offensive/defensive/domination/retreat), eventos internos, fallback
  quando `leaderAccountId` está offline (target call por consenso de bots:
  alvo de maior score agregado).
- Proteção: knight intercepta perseguidor de druida (goal override quando
  `TEAM_MEMBER_UNDER_ATTACK`).

### FASE 7 — Adaptive + map-aware

- Perfis de mapa: `ank_open` (frags → pressão/execução), `venore_town`
  (control → ocupação/dominação > kills).
- Memória de setor: druida inimigo inacessível → pressure alternativo.

### FASE 8 — Performance + UI + release

- `test_pvp_ai_perf.js`: benchmark sintético 200 chars — orçamento
  < 30ms/step de decisões no hardware da VM.
- Badges UI (E9) + métricas (`ai.debug`).
- Revisão final + PVP_SYSTEM.md/PATCH_NOTES.

---

## J. Testes por fase

| Fase | Arquivo | Cobertura mínima |
|---|---|---|
| 1 | `test_pvp_ai_control.js` | offline→AI_PENDING→AI_HARD; AFK intencional; retorno humano cancela goal; histerese anti-flick; pose ignorada em AI_HARD; serialização do modo |
| 2 | incluído no 3 | percepção por time 1×/tick; memória expira |
| 3 | `test_pvp_ai_combat.js` | utility ranking (heal crítico > finish > chase); histerese de alvo; sem ação inválida |
| 4 | idem | cada vocação executa seu papel (knight intercepta, druida cura, sorc AoE em pack, pally mantém distância) |
| 5 | idem | poção no threshold, equip quando ganho real, runas respeitam supplies/cd |
| 6 | idem | coordinator: retirada coletiva, target por consenso sem líder, proteção de healer |
| 7 | idem | venore: prioridade zona > perseguição |
| 8 | `test_pvp_ai_perf.js` | 200 chars, N decisões/step ≤ orçamento; sem regressão nos 4 testes antigos |

**Invariante de todas as fases**: `node tools/test_pvp.js` +
`test_pvp_instance_rules.js` + `test_pvp_wall.js` + `test_pvp_ctrl.js`
verdes — a IA só pode agir através das validações que já existem.

---

## Sumário executivo

- **Não precisa de motor novo**: combate, runas, cura, poções, equip e
  movimento já são autoritativos e universais — a IA é uma **camada de
  decisão** que consome os mesmos primitivos.
- **Offline já é detectado** (`_pvpDrivenAt`, 5s) — falta a distinção
  AFK-intencional e a máquina de estados com histerese.
- **A infra do painel PvP** (`_pvpCtrl`, `wallCalls`, `pvpEquipPreset`,
  `pvpTryParalyze`, friend-heal por time) já é o "vocabulário de ações"
  da IA — reutilização direta.
- **Maior risco**: custo O(n) de percepção por char em 100v100 — resolvido
  por percepção por time + scheduler staggered + goal cache.
- **Nenhuma mudança** em pvp.js (financeiro/lobby), regras de instância
  ou combat pipeline — apenas leitura/injeção nos pontos E1-E9.

Aguardando aprovação para iniciar a FASE 1.
