# Patch Notes

Histórico de alterações do jogo, mais recentes primeiro.

---
## 2026-11-21 — Monstros invisíveis no menu e in-game (MOBSHEETS)

- court-warlock.js e roost-graveborn.js definiam monstros e registravam
  GAMEDATA/MONSTERDATA, mas nunca registravam MOBSHEETS — monsterPlayable()
  reprovava o slug, mobImg() devolvia espaço vazio no modal e mobCell()
  null no canvas: monstros sumiam no menu e ingame.
- Registradas as geometrias reais dos sheets (célula = PNG/colsx4):
  night-harpy + 3 raubritters (Stag Bastion/Arean Outskirts), court-warlock
  + 8 adds enraged/base, 5 bosses do Roost e ~30 entidades dos encontros
  (avatars, soulcages, spirits, totems, ice-crawler 3x4, humanoides 3x4).
- Cache-busters mobsheet-fix-v1.

---
## 2026-11-21 — Charms: Melhorar também funciona durante caçada online

- "Melhorar"/"Desbloquear" eram bloqueados online (charmLockedOnline)
  — quem caça o tempo todo nunca conseguia usar. Agora as operações de pool
  (buy/upgrade) viram op do POST /api/instance/charm no p autoritativo.
- Contabilidade exactly-once: o débito sai pela extração do p da instância;
  charmPoolCommit shifta _charmPointsBase para o save comum sair com
  delta 0 (antes debitaria 2x). Falha do patch → rollback local sem cobrança.
- p._charmPointsBase passou a ser baseline no accountApplySharedInventory
  e a ser preservado no merge da autoridade (charmPoints/base viram campos
  client-owned como helperPresets).
- Tier é espelhado nos demais membros da MESMA conta dentro da instância.
- Migração do pool local (tibiacoin) preserva tiers (não achata p/ true).

---
## 2026-11-21 — Charms: níveis (tiers) oficiais + procs restaurados

- **Níveis de charm (WU 2024)**: cada charm agora tem 3 estágios com custos
  e efeitos oficiais (ex.: Enflame 400/600/2000 pts → chance 5%/10%/11%).
  `p.charms[id]` guarda o tier (1-3); `true` legado = nível 1.
- Botão **Melhorar** no painel de Charms (mesmo bloqueio do Desbloquear
  durante caçada online — debita o pool da conta).
- `charmFx(id,key,tier)`/`charmCostAt(id,tier)`/`charmTier(p,id)` no
  cliente e no engine; `charmTotals`/procs ofensivos/defensivos escalam
  pelo nível; Gut corrigido p/ oficial (6/9/12%).
- Uniões de `shared.charms` preservam o tier MÁXIMO (não regrediam p/ true).
- **Procs quebrados**: o servidor local rodava build anterior ao endpoint
  `/api/instance/charm` — o assign nunca chegava na autoridade
  (`charmRace {}`), então nenhum charm procava. Reiniciado.

---
## 2026-11-21 — Charms: seleção de criatura não oscila mais após Associar

- Ao clicar em "Associar Criatura", o painel mostrava a primeira criatura
  da lista por alguns segundos até voltar à correta. Causa: um sync de
  conta concorrente reidratava o roster com o blob anterior ao
  PUT/instance-patch e o `charmRace` recém-associado sumia temporariamente.
- `CYCLO._pendingCharm`: overlay otimista em `charmSelectedChar()` — o
  assign/clear local é mantido na UI até o servidor ecoar o mesmo valor
  (ou TTL de 15s). Não toca outros personagens nem outros charms.

---
## 2026-11-21 — Sprites: Distorted Heart/Robe, outfit colors dos phantoms/apparitions

- `distorted-heart`/`distorted-robe` eram placeholders "?": re-renderizados
  do DAT convertido (cids 34142/34149). Preços conferidos na wiki: Yasir
  2.100 / 1.200 gp — já estavam certos.
- Paleta de outfits truncada em 96 cores (oficial tem 133): índices 96-132
  resolviam por módulo em cores erradas. Corrigida em `tibia_assets.py`
  (render) e `outfit.js` (jogo) com a tabela oficial completa.
- Re-render dos sheets com cores oficiais do Canary .lua: distorted-
  phantom (113/94/132/76 = tons de vermelho — estava cinza), capricious
  (81/114/85/83), infernal (114/80/94/78), mould (106/60/131/116),
  knight (19/76/74/114) e monk apparition (114/48/114/95 addon 1).
- `wand-of-defiance`: sprite atual já é o cid 16096 oficial (re-render
  idêntico).
---
## 2026-11-21 — Fix: "Associar Criatura" (Cyclopedia > Charms) em caçada online

- Assign/clear de charm estava sempre bloqueado em caçadas autoritativas
  (toast "fora de caçada online") — e com a PT caçando 24/7 o botão parecia
  quebrado. Novo endpoint `POST /api/instance/charm` faz o patch
  autoritativo do `p.charmRace` na instância em execução (mesmo padrão do
  /api/instance/ammo): a extração terminal preserva a associação e o bônus
  já vale no combate em andamento.
- Desbloquear (compra) permanece bloqueado online — o débito de charm
  points duplicaria na extração (save do char + delta da instância).
- charmPoolSync agora espelha `_charmPointsBase` para chars não-ativos:
  sem isso, salvar o char selecionado injetava a diferença inteira do pool
  de volta (charm points duplicados).
- charmRace também propaga para a entidade de combate local na hora.
---
## 2026-11-21 — Fix: Forge Bonus/Charms zerados no Analyzer (caçadas online)

- Dois bugs impediam os bônus de forja (Momentum/Onslaught/Transcendence/
  Ruse) e charms de aparecer no Analyzer em caçadas autoritativas (online):
  1) o merge de `incoming.stats` em applyOnlineAuthorityState sobrescrevia
  `forgeTrack`/`charmTrack` acumulados no cliente com a cópia congelada do
  descriptor (mesmo bug antigo do damageTrack/takenTrack — agora todos os
  trackers de analyzer são preservados);
  2) `t:"forge"` e `t:"charm"` não estavam no keep-set do cap de 120 eventos
  — em lotes cheios eram descartados sistematicamente.
- O materialize agora também remove damageTrack/takenTrack/forgeTrack/
  charmTrack do `state.stats` (trackers são do cliente; deathTrack segue
  autoritativo do servidor).
---
## 2026-11-21 — Fix CRÍTICO: nível dos personagens zerando (level 1)

- O backfill de "level/exp por conta" (dc5fc64f) falhava silenciosamente
  (JSON_EXTRACT abortava o UPDATE inteiro em data inválido e o catch
  engolia) — todas as contas ficaram level=1/exp=0.
- findCharacter/_applyAccountLevel injetavam o level da conta na leitura:
  todo char lia level 1, e o save seguinte gravava 1 na coluna e no blob
  — destruindo o progresso real (Tomio Ek 183 -> 1).
- Fix: a injeção agora usa MAX(conta, coluna, data) — nunca rebaixa, e o
  save seguinte auto-cura a conta (setAccountLevelExp só sobe).
- Backfill reescrito em JS por conta: tolera data inválido, roda a cada
  boot, grow-only. Escalares protegidos (exp/ml/gold/manaSpent/
  totalKills/stamina) sanitizam para número no save — exp:{} legado não
  propaga mais.
- Reparo de dados: Tomio Ek restaurado para level 183 / exp 95.986.908
  (snapshot_history) + sanitização de campos {} em 9 chars.

---
## 2026-11-21 — Fix grants do painel admin + ER_CHECKREAD nos ticks

- A forja do admin "parava de funcionar" porque o grant era recusado sem
  lease/apos conflito de save e a mensagem culpava sempre o lease. Agora
  distingue: conflito de save pede reload; falta de lease pede fechar a
  outra aba ou Takeover.
- ER_CHECKREAD (errno 1020) derrubava o instanceAuthorityTick a cada tick
  na conta afetada: SELECT consistente da linha de accounts/characters
  seguido de UPDATE na mesma tx falha quando outra tx toca a linha.
  Adicionado FOR UPDATE nos SELECTs (shared_inventory, cosmetics,
  characters) — convencao ja usada em 4572/3149 — o lock na leitura
  serializa escritores e elimina o check-read.

---
## 2026-11-21 — Ícone de item na barra de cooldown ao usar potion/runa

- Ao beber potion de HP/mana (ou runa de cura), o ícone do item aparece
  na barra de cooldown com o compartilhamento de 1s — como no cliente
  oficial (runas de ataque já apareciam).
- p.itemCd separado de p.cd: cdHydrateFromAuthority reconstroi p.cd a
  cada sync do servidor e apagaria os ícones; itemCd sobrevive.

---
## 2026-11-21 — Fix crash "p.skills undefined" no load/treino

- normalizePlayer agora garante skills (10s), skillTries, ml e manaSpent —
  contas criadas via login social e snapshots antigos podiam vir sem o
  bloco, quebrando effSkill → renderStats → startGameReady e a área de
  treino (TypeError "reading 'sword'").
- Guards defensivos em effSkill/skillBreakdown/renderSkills para players
  não-normalizados (membros remotos de party).

---
## 2026-11-21 — Redesign do modal PVP (Guerras de Guild)

- Restyle das 5 abas nos tokens do mockup: cards #21242b, bordas #363b47,
  dourado/crimson/esmeralda — CSS escopado em .pvp-modal-shell.
- Banner da guild com gradiente + glow dourado; ícone maior.
- "Desafiar ›" vira botão metálico crimson com glow no hover do card.
- Pills de status e resultado com fundo colorido (VITÓRIA verde, EMPATE
  âmbar, DERROTA vermelha, AO VIVO pulsante).
- Resumo de histórico e carteira de boosts em chips; último chip com
  acento dourado; resultado da tabela colorido.
- Botões de ação (Ativar/Aceitar/Criar) em dourado metálico com glow.

---
## 2026-11-21 — HP oficial Maior Domus/Phosphorus + kill de boss por conta

- final-radiant.js: HP oficial dificuldade 1 — Maior Domus 460.000,
  Phosphorus 1.500.000 (antes 10.000 de teste).
- accountBossKilled(p, slug): kill de boss passa a valer para a CONTA —
  qualquer personagem que derrotou libera o requisito para os demais.
  Agrega o char atual + os demais do cache da conta. Aplicado em:
  huntRequirementCheck (gate Radiant Skyhold), feastBossesKilled,
  bossAccessChecklist e os estados das quests Make Believe, Stag Bastion,
  Norcferatus, Roost Graveborn e Book World.

---
## 2026-11-21 — Voucher já resgatado exibe modal de prêmios

- Resposta de claim duplicado agora carrega rewards+modal — o cliente
  abre o pop-up de prêmios com "Recompensa já obtida" no lugar do botão.

---
## 2026-11-21 — Modais de voucher em roxo Twitch + botão COLETAR

- Gate "Siga o streamer" e modal de recompensa adotam a identidade roxa
  dos parceiros (gradiente #2b1a4e→#1b1032, glow, logo Twitch animada).
- Gate ganhou botão COLETAR: se já segue → resgata; Twitch não vinculada
  → abre OAuth e coleta automaticamente ao confirmar; vinculada sem
  follow → orienta seguir o canal e tentar de novo.
- Modal de recompensa ganhou botão OK para fechar.
- Fix: gate/status passavam a verificar sempre o canal padrão — agora o
  ?channel= do parceiro correto vai no OAuth e no poll (FLOWERS0800
  verificava buto_pvp antes deste fix).

---
## 2026-11-21 — Novo parceiro: bruno_flowers (voucher FLOWERS0800)

- partners.js: segunda entrada (channel bruno_flowers) — listado no modal
  Parceiros com follow-gate próprio via /api/oauth/callback.
- Voucher FLOWERS0800: 250 NT Tibia Coins + 3 dias VIP + outfit Warrior
  com addons 1 e 2 (cosmetics.outfits.warrior=3, chave canônica) + NOVO
  tipo de recompensa: 12h de skill boost +50%.
- Skill boost por conta: shared.skillBoostUntil persiste em
  accounts.shared_inventory; applySharedToPlayer hidrata p.skillBoostUntil;
  addSkillTries/addManaSpent da engine multiplicam por 1.5 enquanto ativo
  (separado do bônus temporário de guilda +25%, acumulativo).
  accountApplySharedInventory + addSkillTries do cliente espelham.
- voucherRewardsPreview ganhou kinds "outfit" (sprite warrior-f) e
  "boost" (ícone raio); voucherRewardIcon renderiza os dois.
- Fix: loop de itens do redeem tolerava voucher sem `items` — FLOWERS0800
  quebrava após o claim (TypeError em for..of de undefined).

---
## 2026-11-21 — Modal Parceiros em identidade Twitch (roxo radiante)

- Restyle completo: card e modal em gradiente roxo Twitch com glow
  animado (partners-logo-pulse, partner-card-glow, partner-avatar-glow).

---
## 2026-11-21 — Follow-gate usa o callback unificado do OAuth

- /api/twitch/auth agora direciona o authorize para OAUTH_REDIRECT_URI
  (/api/oauth/callback) — a MESMA Redirect URL já registrada no app Twitch
  atende login social E gate de voucher/parceiros (fim do erro
  redirect_mismatch; /api/twitch/callback segue como fallback).
- /api/oauth/callback reconhece states do gate (twitch.newState) e executa
  a verificação de follow do canal do parceiro.

---
## 2026-11-21 — CSP libera CDN da Twitch (avatares dos parceiros)

- img-src ganhou https://static-cdn.jtvnw.net — o avatar do canal no modal
  Parceiros era bloqueado pelo Content-Security-Policy.

---
## 2026-11-21 — "Mover para o depot" no menu do item da backpack

- Nova opção no menu de contexto dos itens da mochila (ao lado de
  "Mover para Loot Pouch"), com hint do uso do depot (ex.: "4/30").
- Reusa o fluxo autoritativo depotAction ("store") — funciona online
  (instância) e na cidade, com sync do shared da conta.
- depotActionAuth e depotStore agora aceitam qty: stacks movem a pilha
  inteira em uma chamada, respeitando o cap de 30 slots do depot.
- Itens instanciados/tierados movem como instância (loc "depot"), como no
  retrieve/equip existentes.

---
## 2026-11-21 — Gate Twitch do voucher mostra as recompensas

- A resposta `needTwitch` do /api/store/voucher agora inclui `rewards`
  (mesmo helper estruturado do resgate — vip/mount/coinsNt/coins/items).
- O modal "Siga o streamer para resgatar" exibe a lista "Ao confirmar o
  follow você recebe:" com os ícones de cada recompensa antes do botão
  Conectar com Twitch.

---
## 2026-11-21 — Botão PARCEIROS na topbar + modal de streamers parceiros

- Novo botão quadrado "PARCEIROS" entre PERSONAGEM e STORE (mesmo tamanho,
  glow roxo Twitch, ícone oficial da plataforma).
- Modal lista parceiros (`server/partners.js`): avatar real + nome
  (helix/users via app token), nível do parceiro, badge AO VIVO/OFFLINE,
  tempo de live + espectadores quando online, links Twitch/Instagram.
- Ordenação: online primeiro; quem está há MAIS tempo em live na frente.
- Voucher exibido como "• • • • •" até o jogador seguir o canal — o botão
  "Seguir para revelar" abre o mesmo OAuth do gate de voucher, agora
  parametrizado por canal (`/api/twitch/auth?channel=` + state carrega o
  canal; apenas canais cadastrados são aceitos).
- Após o follow, o código aparece + copiar com 1 clique + botão "Resgatar"
  (abre STORE na aba Vouchers com o código preenchido).
- Primeiro parceiro: @buto_pvp (voucher BUTO__PVP, Nv. 1).
- `GET /api/partners?token=` — autenticado; reusa credenciais Twitch já
  configuradas; auto-refresh da lista a cada 60s no cliente.

---
## 2026-11-21 — Login/registro social: Google + Twitch (OAuth)

- Novo `server/oauth.js` + callback compartilhado `GET /api/oauth/callback`
  (o state carrega o provider — UMA Redirect URI serve nos dois apps).
- `/api/auth/{google|twitch}` redireciona pro authorize; `/api/auth/providers`
  diz ao cliente quais botões exibir (provedor sem credenciais não aparece).
- `oauthFinish` decide: conta logada → VINCULA o provedor; identidade já
  ligada → login; Google com e-mail verificado → vincula por e-mail;
  senão → CRIA conta nova (login/display únicos, senha aleatória, e-mail
  verificado só quando o Google confirma). Ban ativo bloqueia igual ao
  login por senha; sessão emitida via redirect `/?sso=<token>`.
- Login Twitch reusa `TWITCH_CLIENT_ID/SECRET` e já checa o follow do
  canal do voucher (`user:read:follows`) — quem segue sai do login com o
  gate do BUTO__PVP resolvido.
- `accounts.social` armazena `google.sub` / `twitch.id`; novos métodos
  `findAccountBySocial` e `setAccountEmailVerified` nos dois stores.
- Cliente: tela de login ganha "ou continue com Google/Twitch" (injetado
  só quando configurado) e consome `?sso=` no boot → `/api/me` → picker.
- Requer env: `GOOGLE_CLIENT_ID/SECRET`, `TWITCH_CLIENT_ID/SECRET`,
  `OAUTH_REDIRECT_URI` registrada nos consoles Google e Twitch.

---
## 2026-11-21 — Voucher de streamer exige follow real na Twitch (OAuth)

- Novo `server/twitch.js`: fluxo OAuth completo — `/api/twitch/auth` redireciona
  pro authorize da Twitch (escopo `user:read:follows`), `/api/twitch/callback`
  confirma via `GET /helix/channels/followed` se o jogador segue o canal e grava
  em `accounts.social.twitch`, `/api/twitch/status` expõe `linked/verified` pro
  poll do cliente. Sem precisar de autorização do streamer.
- Voucher `BUTO__PVP` ganha `twitchFollow: "buto_pvp"` — `redeemVoucher`
  responde `needTwitch` ANTES do claim (voucher não é consumido).
- Cliente: modal de gate "Siga o streamer para resgatar" com botão Conectar
  com Twitch (pop-up OAuth), poll de status a cada 2,5s e re-resgate
  automático ao confirmar o follow; "Verificar novamente" repete o OAuth.
- `accounts.social` (MEDIUMTEXT) migrado no boot + `setAccountSocial` nos
  dois stores; hidratação em `hydrateAccount`.
- Requer env: `TWITCH_CLIENT_ID`/`TWITCH_CLIENT_SECRET` (app em
  dev.twitch.tv, Redirect URL = `TWITCH_REDIRECT_URI`) — sem credenciais o
  gate avisa que a verificação está indisponível.

---
## 2026-11-20 — Fix: espaço em branco no modal da Wheel of Destiny

- `.wod-stage` (palco da roda) não tinha `flex-grow` — encolhia para o
  conteúdo (522px) e a folga do workspace ia para o inspetor / ficava
  vazia. Agora `flex:1 1 auto`: o palco absorve todo o espaço livre.
- `wheelFitCanvas` passa a medir o palco real (`.wod-stage`, flex:1) —
  antes media o host encolhido e a roda nunca escalava acima de 522px.
- Inspetor lateral com largura fixa (360px standalone / 330px embutido)
  em vez de `flex:1` — a folga horizontal vai toda para a roda.
- Modal standalone da wheel alargado (1180px) e escala máxima 1.25→1.45;
  seletor `.modal-bg.wide .modal:has(.wheel-window)` corrigido (a classe
  `wide` mora no `.modal-bg`, não no `.modal` — nunca aplicava).
- Paddings do workspace/palco reduzidos; wrap em telas <900px empilha
  inspetor abaixo da roda.
- Cache-buster `wod-fit-v1`.

---

## 2026-11-20 — Fix: Desbloquear de charm não persistia

- `charmSaveChar` pulava o save no servidor para o personagem ativo — o
  unlock ficava só no espelho local e o próximo `sharedInventory`
  (`/api/me`, SSE) revertia. Agora TODOS os personagens empurram
  `accountSaveCharacter` na fila (`ACCOUNT_SAVE_PENDING` protege da
  reversão em voo).
- Operações de charm (desbloquear/associar/remover) bloqueadas durante
  instância autoritativa — lá a engine é dona do estado e o save local
  não persiste; o aviso explica ao jogador.

---

## 2026-11-20 — Voucher tolerante a underscores

- O resgate de vouchers agora ignora variações de underscores no código:
  `BUTO_PVP`, `BUTOPVP` e `buto__pvp` resolvem para o código canônico
  (`BUTO__PVP`). Claims e estado (pause/delete) são sempre gravados no
  canônico — não dá para resgatar duas vezes por variação de digitação.
- Topbar hero: botões agora **atravessam as duas faixas** da topbar
  (ancorados `top/bottom` à direita com `aspect-ratio:1`) — quadrados
  perfeitos que preenchem o canto sem o espaço vazio que sobrava embaixo.
  `.topbar` ganha `padding-right` reservando a faixa dos heróis.

---

## 2026-11-20 — Topbar: PERSONAGEM e STORE quadrados com glow

- Os botões **Personagem** e **STORE** saíram da faixa de botões e agora
  ocupam o canto superior direito da topbar como quadrados **78×78** com
  moldura e glow dourados (`.topbar-hero-*`) — mais destaque visual.
- Personagem mostra o retrato do char + nome; STORE mostra o coin + label.
- Fallback responsivo para telas <640px (quadrados 62×62).
- Modal de patch notes (`alpha-announce.js`) atualizado com a data da
  release e as novidades da sessão.

---

## 2026-11-20 — Aba VOUCHERS no painel Admin + voucher sem cura no treino

- **Painel Admin → aba 🎟 VOUCHERS**: lista todos os códigos definidos no
  servidor com status (ATIVO/PAUSADO/EXCLUÍDO) e contagem de resgates.
  Clicar no card abre o detalhe: recompensas, quem resgatou (login + data)
  e ações **Pausar/Retomar**, **Excluir** (com confirmação) e **Restaurar**.
- **Estado administrável por código** (`voucher_state` — tabela MySQL +
  campo no JsonStore): `paused` bloqueia novos resgates com
  "Voucher pausado temporariamente"; `deleted` responde "Voucher inválido".
  É um overlay — a definição em `store.VOUCHERS` permanece intacta.
- Novas rotas `/api/admin/vouchers` (lista), `/api/admin/vouchers/:code`
  (detalhe) e `/api/admin/vouchers/state` (pause/resume/delete/restore),
  todas atrás de `adminSession` (role=admin).
- **Treino sem cura instantânea**: `startTrainingArea` agora passa
  `keepVitals` ao `stopHunt` — entrar na área de treino vindo de uma hunt
  não enche mais HP/mana na hora (o treino não é templo).

---

## 2026-11-20 — STORE sem a aba "Vender Coins"

- Removida a aba **Vender Coins (BETA)** da STORE (venda player-to-player
  de TC por gold): saíram a entrada da navegação, o card da Home e toda a
  UI `renderStoreSell`. Os endpoints do Market no servidor permanecem
  intactos — a janela do Market não é afetada.
- Chip de PARTY recolhido agora fica no canto superior direito do cenário
  (mesma posição do painel expandido).

---

## 2026-11-20 — Cupom de streamer `buto__pvp` + modal de recompensa

- **Voucher `buto__pvp`** (STORE → VOUCHERS, 1x por conta): concede
  **+3 dias de VIP** (empilha no `vip_until`), **montaria Shock Head**
  (catálogo `shock-head`, creditada em `accounts.cosmetics.mounts`) e
  **+250 Non-Transferable Tibia Coins** (`accounts.coins_nt` — não vai
  para o `coins` normal, não pode ser vendida no market/RMT).
- **Resposta enriquecida**: `redeemVoucher` agora devolve `rewards`
  (lista estruturada por `kind`: vip/mount/coinsNt/coins/items) e `modal`
  opcional com título, intro e links sociais do criador.
- **Modal de recompensa**: resgates com `modal` abrem um pop-up
  (`openStoreVoucherModal` em `store-ui.js`) mostrando as recompensas com
  ícone próprio (coroa VIP, sprite da montaria via primeiro frame do
  sheet, coin NT), a mensagem de agradecimento e os links do streamer
  (Instagram/Twitch com logos em SVG inline). O feedback inline da aba
  VOUCHERS continua aparecendo como fallback.
- DRUWELL e demais vouchers futuros continuam funcionando no mesmo
  fluxo (inline se não definirem `modal`).

---

## 2026-11-20 — Fix: recursos da FORJE do painel admin

- **`accountAdminSaveCharacter` agora aplica `data.sharedInventory`**
  (`accountApplySharedInventory`) na resposta do grant — o autosave comum
  já fazia isso via `accountMaybeApplyShared`. Sem o rebase, `p._forgeBase`
  ficava no valor antigo e o save seguinte re-somava o delta de
  dust/slivers/exaltedCores: o admin aplicava um valor e o recurso vinha
  inflado depois (ou parecia não aplicar).
- **`mergeSharedFromPlayer` mescla `tier`/`charges` por campo** em
  instâncias já presentes no shared (antes `byId.has(id)` pulava inteiro):
  grants de tier no painel FORJE dentro de instância ativa (patch no
  authority → tick grava por merge) agora persistem, assim como consumo de
  cargas de acessórios. `loc`/`slug` continuam autoridade do shared
  (movimentos depot/market são server-side).

## 2026-11-20 — Non-Transferable Tibia Coins + voucher DRUWELL

- **Novo pool `coins_nt`** (não transferível): coluna `accounts.coins_nt`
  (migração MySQL automática) / campo `coins_nt` no JsonStore. Só pode
  ser gasto na **STORE** — o market e o RMT operam exclusivamente em
  `coins` e nunca enxergam o pool NT (coberto por teste: `debitCoins`,
  o mesmo caminho do market, não toca `coins_nt`).
- **Débito NT-first**: `db.spendStoreCoins` (atômico — MySQL usa a ordem
  de avaliação do SET, documentada no código) e `changePreyCards` foram
  convertidos; todas as compras por TC (`buyVip`, `buyCosmetic`,
  `buyBless`, `buyImbuement`, prey cards) debitam `coins_nt` primeiro e
  completam com `coins`. Ledger registra o split como ` (NT N)` na nota.
- **Voucher DRUWELL** (`POST /api/store/voucher`): +3 dias de VIP
  (empilha sobre vip_until), montaria **Roaring Lion** na conta e
  **+250 NT Tibia Coins**. `redeemVoucher` agora entende `coinsNt`,
  `vipDays` e `mount` na definição do voucher.
- **Montaria `roaring-lion`** registrada no catálogo
  (`appearancedata.js` + `appearances.json`, mountId 242): art do leão
  dourado (mesma família do Roaring Lion, looktype 570/571 — sprite
  `assets/appearance/mount/roaring-lion.base.png`).
- **Cliente**: `accountCoinsNt()`/`accountSetCoinsNt()` no tibiacoin.js;
  `storeApplyCoins` aplica o pool NT de todas as respostas de store;
  login/`accountPublicView` carrega `coinsNt`; header da STORE mostra
  "TC + N NT" quando houver; resgate de voucher aplica VIP e
  cosmetics.mounts no sessionStorage (mesma fonte que `ownsMount` lê).
- `listAccountCoinSummaries` (faturamento admin) inclui `coinsNt`.
- `tools/test_nt_coins.js` (novo, 6 testes): split NT-first, market não
  alcança NT, voucher DRUWELL completo e resgate único, montaria no
  catálogo + sprite.
- Cache-busters `nt-coins-v1` em `tibiacoin.js`, `account-client.js`,
  `store-ui.js`, `appearancedata.js`.

---

## 2026-11-20 — Guilds: redesign gi-guild (diretório + painel interno)

- Modal de GUILDS reestruturado no layout `gi-guild-*` (mockup do usuário)
  na paleta quente do jogo.
- **Diretório (2 colunas)**: cards `gi-guild-card` com moldura de ícone,
  pílula de nível, badge **SUA GUILD** dourado e **RECRUTANDO**/**CHEIA**;
  glow dourado em `is-mine`/`is-selected`, hover com elevação.
- **Botão duplicado corrigido**: "⚔️ Acessar minha guild" agora é um único
  CTA (`gi-guild-primary-cta`) na coluna esquerda. No preview à direita só
  aparece "Ver guild completa" — e apenas para guilds de terceiros.
- **Barra de EXP**: `gi-exp-track`/`gi-exp-fill` com gradiente âmbar e
  glow (`box-shadow`), label sobreposto legível — antes era um medidor
  apagado sem preenchimento luminoso.
- **Membros**: `gi-member-row` com `is-leader`/`is-vice`, ícone de cargo
  (👑/⭐), badges `gi-role-tag` coloridos por cargo (líder ouro, vice
  azul, membro neutro) e `gi-task-pill` de contribuição.
- **Painel interno**: 8 abas viraram pílulas `gi-gtab` (ativa dourada com
  glow, PVP com hover avermelhado, blink `has-pending` em solicitações);
  banner `gi-interior-banner` com avatar emoldurado + stat chips
  (✨EXP/🪙GP/💎TC); gerenciamento do líder em card `gi-manage-box`
  (ícone em grade + `gi-dark-input` + botão TC azul `gi-tc-btn`).
- Ações de membro (promover/rebaixar/expulsar) e aceite/recusa de
  solicitações viraram `gi-act-btn` compactos com hover por função.
- Handlers e dados inalterados (`data-guild-*`/`data-char-profile`);
  helper novo `guildMemberRowHtml`/`guildRoleTag`/`guildRankIcon`
  compartilhado entre preview e abas MEMBROS/RANKING/SOLICITAÇÕES.
- Cache-busters `guild-redesign-v1` em `layout.css` e `guild-ui.js`.

---

## 2026-11-20 — Analyzer: aba Forge Bonus (contador de ativações por char)

- Nova aba **⚒ Forge** no Analyser (`OTC_ANALYSERS` + `forgeTrack`):
  por personagem, contagem de ativações de **Momentum**, **Onslaught**,
  **Transcendence** e **Ruse**, com legenda e tooltips.
- Fontes de verdade por bônus (mesmo evento para o floater e o contador):
  - Momentum/Transcendence → `t:"buff"` `nome:"Momentum"|"Transcendence"`;
    o cliente agora emite `whoId` nesses eventos (o engine já emitia).
  - Onslaught → novo `t:"forge"` `nome:"onslaught"` emitido no roll
    (`forgeTryOnslaught` no cliente, `forgeRollOnslaught` no engine, nos 3
    call sites de cada: auto attack, spell e runa). O flag `fatal` do hit
    não servia — se repete em cleave/área e inflaria a contagem.
  - Ruse → `t:"miss"` `ruse:true` com `targetId` = quem esquivou (o
    cliente passou a emitir `targetId` no evento).
- Ingest: `t:"forge"`/`t:"buff"`/`miss ruse` são consumidos antes do
  filtro de `dmg` (esses eventos não carregam dano). Ativação de
  Transcendence conta a ATIVAÇÃO (buff), não cada crítico do avatar.
- Reset de sessão zera o `forgeTrack`; linhas mostram os 4 contadores por
  personagem (células apagadas quando zero, âmbar quando >0).
- `tools/test_account_charms.js` cobre a ingest dos 4 bônus por char.
- Cache-busters `forge-analyser-v1` em `layout.css`, `combat.js`,
  `analyzers.js`.

---

## 2026-11-20 — Charms: pool por conta, assign por personagem, procs ativos + Analyzer

**Modelo de dados — charms/charm points são DA CONTA:**

- `server/shared_inventory.js`: `shared.charms` (unlocks major+minor) e
  `shared.charmPoints` entram no normalize; `seedSharedCharms` migra o
  legado por personagem com **união dos unlocks + soma dos pontos não
  gastos** (flag `charmsSharedDone` nas duas stores do `db.js`);
  `applySharedCharms` espelha o pool no char (baseline `_charmPointsBase`);
  `mergeSharedCharms` faz merge por **delta** (gastos/ganhos somam sobre o
  pool sem reverter ops de outra cópia) + união dos unlocks.
- `tibiacoin.js`: `acc.charms`/`acc.charmPoints` + `bindAccountCharms(p)`
  — accessors `p.charms`/`p.charmPoints` direto na conta (mesmo padrão de
  gold/lootPouch), com migração lazy `charmsMigrated` lendo o roster bruto.
  `bindAccountCharms` chamado em `normalizePlayer` (game.js) — vale
  offline e online (o servidor aplica o espelho via
  `accountApplySharedInventory`).
- **`p.charmRace` (assign por criatura) e `p.charmsPagos` continuam POR
  PERSONAGEM** — dois chars da conta podem associar runas diferentes à
  mesma criatura e o bônus só vale para quem associou.
- `buyCharm` reatribui o mapa inteiro (`Object.assign`) — mutation
  `p.charms[id]=true` não dispara o setter do accessor.
- `ensureCyclopedia` só escreve nos accessors quando o valor muda
  (evitava um `accountSave` por ataque no hot path do `charmTotals`).

**Modal de Charms redesign (`gi-charms-panel`):**

- Novo layout em `cyclopedia-ui.js` + `layout.css` seguindo o mockup:
  topbar com regra + saldo ✦, subtabs Major/Minor, legenda
  desbloqueada/associada, corpo 2 colunas com grid de cards (ícone, nome,
  custo, tipo) e inspetor lateral (thumb, descrição, criatura associada,
  ações) — paleta quente do jogo.
- **Seletor de personagem** (`#gi-charm-char-sel`, `CYCLO.charmChar`):
  dropdown com todos os chars da conta ("Aplicar em"); assign/clear
  operam no `charmRace` do char escolhido — `charmSaveChar` persiste no
  roster e no servidor (`accountSaveCharacter`) mesmo quando não é o
  ativo. O saldo/unlocks exibidos são sempre os da conta
  (`charmPoolSync` espelha o pool do G.p no char selecionado).
- O inspector mostra "Criatura Associada (**nome do char**)": reforça
  que o assign é individual.

**Funcionalidades ativadas/auditadas (cliente + engine):**

- **Ofensivos (freeze, wound, enflame, zap, curse, divine, carnage,
  overpower, overflux):** cliente não proccava — `applyCharmDamage` era
  no-op e `charmOffensiveProc` nunca era chamado. Agora `playerAttack`
  dispara os procs no **alvo principal** (auto attack; cleave/área não
  disparam, paridade Canary/engine) com mitigação/resist do elemento e
  evento `t:"charm"` por proc.
- **Vampiric Embrace / Void's Call:** leech agora filtrado por raça
  (antes `charmTotals(p)` sem slug valia contra QUALQUER criatura — bug),
  cura capada no max e emite `heal`/`mana` no evento de charm. Engine:
  `applyOutgoingLeech` ganhou `auth/now` e emite os mesmos eventos.
- **Dodge:** ambos emitem `charm:"dodge"` + `mitigated` (dano evitado) no
  evento `miss`; cliente passa a filtrar por raça também.
- **Parry:** engine NÃO refletia (só somava no totals) — agora reflete
  `dmg*reflete%` no atacante como o cliente, com evento `dmg`.
- **Gut:** engine não aplicava; agora ambos rolam % de creature product
  extra da tabela da raça (filtro: sem currency/supply/ammo/equip) com
  evento `extra:1`.
- **Cripple/Numb:** chance de paralisar — no idle vira slow pesado de
  movimento (`slowUntil`+`slowMul`, 3s, 0.5×) no atacante alvo (cripple,
  no proc ofensivo) ou no agressor (numb, ao sofrer o golpe); honrado em
  `authoritySpeedPts` (engine) e `moveMobs` (cliente); respeita
  `imune:["paralyze"]`.
- **Adrenaline Burst / Cleanse:** implementados nos dois lados ao sofrer
  golpe da raça associada — haste `utani-hur` 10s / remove 1 condition.
- `charmTotals` (cliente+engine) ganhou `numb`/`adrenaline`/`cleanse`.
- Bless/Scavenge/Fatal/Void Inversion: sem mecânica de skin/flee/
  mana-drain no jogo — seguem inertes (descrição já diz "quando
  aplicável").

**Analyzer — nova aba Charms (✦):**

- `analyzers.js`: `OTC_ANALYSERS` + `charmTrack` por personagem — por
  runa: `procs`, `dmg`, `heal`, `mana`, `mitigated`, `extra`, `aplicado`.
- Ingest: eventos `t:"charm"` (whoId = quem proccou) e `miss` com
  `charm:"dodge"` (targetId = quem esquivou + `mitigated`).
- Dano de charm (procs + parry) também entra no `damageTrack`.
- Reset da sessão zera o `charmTrack` junto; render lista runas por
  personagem com procs× e métricas (Life Leech curado, Freeze dano,
  Dodge vezes+mitigado, Gut itens…).

**Testes:** `tools/test_account_charms.js` (novo) cobre seed/apply/merge
do pool, assigns independentes na mesma raça, accessor offline
compartilhado, totals do engine e ingest do Analyzer. Bateria AGENTS
(charms/hunts/wardrobe) verde. Cache-busters `gi-charms-v1` em
layout.css, combat.js, cyclopedia.js, cyclopedia-ui.js, analyzers.js,
account-client.js, tibiacoin.js, game.js.

**Ressalva conhecida:** o servidor valida débito de pontos via merge por
delta (nunca fica negativo), mas um save de cliente malicioso poderia
reinvindicar unlocks sem custo — mesma classe de confiança dos demais
campos client-authored fora da lista `PVP_CLIENT_HEAVY_KEYS`.

---

## 2026-11-20 — Chat dockado: sai da tela do jogo e fica SEMPRE aberto

- O `#global-chat` era overlay `absolute` dentro do `#scene-wrap`
  (canto inferior esquerdo, cobrindo o jogo). Agora o `chat.js` monta o
  chat dentro do novo `#chat-dock` — bloco em fluxo na `.col-mid`,
  logo abaixo do `scene-wrap` e acima da barra de cooldown / painéis.
- `#global-chat` virou `position: static` com `width:100%` (o overlay
  tinha `max-height`/largura proporcional à scene); o visual OTC
  (borda metal, cabeçalho, abas, input) é mantido.
- **SEMPRE aberto**: removido o botão de minimizar
  (`#global-chat-toggle`) e o handler de collapse; `applyCollapsed()`
  virou no-op que só remove a classe `collapsed` (prefs antigas com
  `collapsed:true` não dobram mais o chat). O pref `collapsed` ainda é
  lido/salvo mas não tem efeito.
- `#chat-dock:empty { display:none }` evita gap fantasma no flex antes
  do login/montagem do chat.
- Cache-busters `chat-dock-v1` em `chat.css` e `chat.js`.

---

## 2026-11-20 — Painel de party: recolhido encolhe pra esquerda (chip mínimo)

- Antes, recolher o `#party-panel` só escondia o corpo — a barra de
  200px com "👥 PARTY" continuava no canto superior direito, cobrindo o
  jogo. Agora `.party-panel.collapsed` vira um **chip mínimo encostado
  na borda esquerda do scene** (vertical: 👥 + contador + seta), com
  `top:50%/translateY(-50%)` pra não sobrepor o painel de TREINO no
  topo esquerdo. O texto " PARTY" (`.pp-label`) e o spacer somem no
  estado recolhido; clicar no chip reabre o painel normal no canto
  direito.
- `party-ui.js`: `renderPartyPanel` passa a alternar `collapsed`
  também no elemento `#party-panel` (antes só no body).
- `index.html`: markup do head ganhou `.pp-title`/`.pp-label` pra
  esconder só o texto sem perder o emoji e o contador.
- Cache-busters `party-collapse-v1` em `layout.css` e `party-ui.js`.

---

## 2026-11-20 — Topbar: personagem em destaque à esquerda + botões unificados

- **Herói do personagem** (`#btn-switch.gi-char-hero-btn`): movido pro
  início da faixa de botões — avatar do outfit em pedestal escuro com
  moldura dourada (30px, canvas proporcional em vez do 20×20 esmagado),
  **nome do personagem** (`#btn-switch-name`, preenchido no
  `paintSwitchPortrait`) + sub "Personagem", borda `#e6b84c` com glow
  suave. O label i18n continua oculto (menu mobile/acessibilidade).
- **Agrupamento com divisores** (`.gi-toolbar-divider`): [herói] |
  Admin, Calendário, Config | Cyclopedia, Guild, PVP, Party, Prey,
  Social, Store | cidade/academia.
- **Botões unificados**: `.topbar-btns .sm` ganhou quadro metálico
  escuro (gradiente `#2a2620→#1c1913`, borda `#3a3428`, raio 4px,
  hover dourado). `#btn-city` perdeu o `primary` estourado — vira
  `is-exit` discreto só quando `G.training` ("Sair da academia" com
  ícone 🚪). `#btn-store` com filete dourado, `#btn-pvp` hover avermelhado.
- **Fix lateral**: `renderTopbar` fazia `textContent =` no `#btn-city`
  e destruía os spans internos do botão a cada render — agora atualiza
  só `.topbar-btn-label`/`.topbar-btn-emoji` e alterna `is-exit`.
- Cache-busters `topbar-hero-v1` em `layout.css`, `ui.js` e
  `char-details.js`.

---

## 2026-11-20 — Limite de 4 personagens por conta + mísseis mort-area/ice-attack corrigidos

- **Limite de 4 chars por conta**: `ACCOUNT_MAX_CHARS = 4` enforced no
  servidor (`POST /api/characters` rejeita o 5º com mensagem) e no
  `showCharacterCreator`. No picker de party, quando a conta atinge o
  limite o botão "Criar personagem" vira **Logout** (o slot troca de
  lugar, mantendo sempre exatamente um botão de logout no rodapé).
- **Fix pré-existente — `db.findCharacterByName` ausente no MySQL**: o
  endpoint de criação quebrava com 500 (`is not a function`) no
  adaptador MySQL; só o JsonStore tinha o método. Adicionado
  `findCharacterByName` (LOWER(name) = LOWER(?), LIMIT 1) — sem ele a
  checagem de nome duplicado nem chegava a rodar.
- **Mísseis `mort-area`/`ice-attack` → sprites reais**: os dois nomes
  são efeitos de **hit** (fx), não projéteis — pediam `mort-area_*.png`
  inexistentes. CW death strike → `miss:"death"` + `fx:"mort-area"`
  (oficial, igual ao SPELLFX de death strike); spirits do Roost →
  `miss:"death"`/`"ice"` com o fx correspondente mantido no impacto.
- `spear_s.png` confirmado: existe e serve 200 — o `CONNECTION_REFUSED`
  era o blip do restart, sem relação com sprite faltante.

---

## 2026-11-20 — Guarda-roupa do personagem: novo layout gi-wardrobe (preview + catálogo)

- **Redesign da aba Outfit/Montarias** (`chardTabOutfit`): o layout antigo
  `.chard-outfit-*` deu lugar ao `.gi-wardrobe` em duas colunas — à
  esquerda o estúdio de prévia (palco com pedestal, sprite em 84px,
  **botão ↻ que gira a prévia** pelas 4 direções, nome do outfit +
  montaria), e à direita o catálogo com abas **Visuais/Montarias com
  contagem**, busca e grade de cards responsiva.
- **Addons viraram 2 toggles independentes** (`✓ Addon 1`/`✓ Addon 2`)
  em vez do seletor de 4 estados; o bitmask interno 0–3 e as regras de
  posse (`ownedAddonMask`) continuam valendo — pílulas não desbloqueadas
  ficam desabilitadas com dica no `title`.
- **Montaria virou switch A pé/Montado**: "A pé" desmonta; "Montado"
  abre a aba de montarias do catálogo para escolher (clicar num card
  de montaria continua equipando direto).
- **Cards do catálogo próprios** (sem depender do `cycloAppearance`):
  sprite pintado em lotes de 12/frame via `AppearanceRenderer`
  (outfit com as cores do jogador / montaria virada pro sul), nome,
  meta (`addons x/y` ou `+vel`), tag **EM USO** no equipado e 🔒 +
  `Bloqueado` nos não possuídos — clicar num bloqueado mostra toast
  explicando onde desbloquear (Addoner/Lothar/Store).
- **Cores preservadas** no painel esquerdo (4 partes + paleta compacta
  `.gi-palette`), e **Aplicar Visual** faz o mesmo do antigo Salvar
  (save + volta pra aba Personagem).
- Busca continua reativa (`CHARD.outfitBusca`), agora filtrando a
  lista antes de renderizar em vez de esconder cards no DOM.
- CSS novo em `game/css/layout.css` (todas as classes `gi-*`) na
  **paleta quente do jogo** (fundos `#0d0c0a`/`#14120e`/`#1c1913`,
  bordas `#3a3428`, acentos ouro `#d4af37`/`#e6b84c` — substituindo o
  slate-azul do mockup original); cache-busters `wardrobe-gi-v2`.
- **Ajustes pós-feedback**: catálogo exibe **apenas outfits/montarias
  desbloqueados** (filtro `"owned"`, contadores das abas acompanham),
  e a prévia escala **proporcionalmente** para caber inteira no palco
  (o canvas do `AppearanceRenderer.preview` é recortado pelo conteúdo —
  montado fica ~64×100; antes era forçado 84×84 e esmagava).
- **Paleta sem scroll + botão Random**: as 96 cores ficam em 6 linhas
  de 16 dentro da coluna (`.gi-palette`, sem `outfit-palette-compact`),
  stage reduzido pra 128px, e 🎲 **Random** no cabeçalho do grupo CORES
  sorteia as 4 partes de uma vez (save + refresh completo).

---

## 2026-11-20 — Lothar: troca aceita Loot Pouch, `enough` autoritativo e sprites que sempre renderizam

- **Fix — "NPC não confirma a troca"**: o botão Trocar usava o espelho
  local `G.p.bag`, que podia ficar atrasado, e a receita só aceitava a
  Bag — mas o loot das hunts cai na **Loot Pouch**. Agora o catálogo do
  servidor devolve `enough`/`have` por alternativa calculados sobre
  `shared.bag + shared.lootPouch` (autoridade), o `exchange` consome da
  Bag primeiro e completa da Pouch, e o modal mostra "(tem X)" por item.
  No cliente o espelho local virou só fallback.
- **Fix — sprite da montaria sempre renderiza**: o preview trocou o
  canvas/`Sprites.get` por `background` CSS do `.base.png` (mesmo padrão
  das recompensas de quest). Um 404 transitório envenenava o cache e o
  slot ficava vazio pra sempre.
- **Novo — sprites dos 2 últimos itens nome-only**: `frostheart-shard`
  (Norseman addon) e `mermaid-comb` (Oriental addon) são itens custom
  sem equivalente no client 15.x — ganharam definição própria e sprite
  emprestada de ice shard (54128) / coral comb (5945). Todos os 154
  itens de troca agora têm def + sprite.
- Drop do `marinated-sturgeon` permanece no oficial **0,01%**
  (raubritter-skirmisher, cliente + engine).

---

## 2026-11-20 — Lothar: montarias 15.x + sprites de troca, Vladrukh com drops raros, recuperação de senha por e-mail

- **Fix — troca de montaria travada no Lothar**: o Battlefrazzle (e
  outras montarias 15.x) não existiam em `APPEARANCES.mounts`, então o
  catálogo marcava a oferta como indisponível ("Aparência ainda não
  disponível no cliente") e o botão Trocar nunca habilitava mesmo com o
  item na Bag. Renderizadas as sheets oficiais do client 15.20:
  **Alpha Demonosaur** (looktype 1827), **Battlefrazzle** (1882),
  **Reliable Ram** (1936) e **Jaracal** (1962) — todas trocáveis. A
  receita falsa `hell-demonosaur` foi removida.
- **Novo — preview da montaria no modal**: cada oferta de montaria do
  Lothar mostra a sprite da montaria a receber (frame parado) e os
  ícones dos itens exigidos.
- **Novo — sprites dos itens de troca**: 75 itens sem definição nem
  ícone (reins, diapason, music box, demon-in-a-box, horseshoes,
  vouchers gnomish, peças de addons etc.) ganharam definição com cid
  oficial do `appearances.dat` 15.x + sprite renderizado em
  `assets/item/`. `frostheart-shard` e `mermaid-comb` não existem no
  client 15.20 — permanecem nome-only.
- **Fix — Marinated Sturgeon 0,01%**: drop oficial somente no
  Raubritter Skirmisher; chance ajustada de 1,5% para **0,01%**
  (cliente + engine).
- **Fix — Vladrukh sem drops raros/muito raros**: adicionados
  Blood Sceptre e Blood Crown (raros, 1,5%) e as 10 peças do set
  Norcferatu (muito raras, 0,5%): Bloodhide, Bloodstrider, Bonecloak,
  Bonehood, Goretrampers, Thornwraps, Tuskplate, Skullguard,
  Fleshguards e Fangstompers — 33 drops no total, com paridade
  cliente/engine.
- **Novo — recuperação de senha por e-mail**: link "Esqueci a senha" no
  login abre o fluxo em 2 passos (código de 6 dígitos/10 min + nova
  senha). Resposta genérica anti-enumeração, hash bcrypt, revoga todas
  as sessões da conta. SMTP usa a configuração existente; em
  `TEST_SERVER=1` o código volta como `devCode`. Confirmação por SMS
  fica desativada — `server/smser.js` é só o stub do provedor futuro.

---

## 2026-11-20 — Arean Outskirts: outfits oficiais + FOV da arena

- **Fix — FOV fora da arena**: a FOV 21×13 é centrada no centro do mapa
  OTBM (39×41), então a arena (y1014–1020) ficava acima da janela
  visível (y1017–1029) — o centermap {1020,1018} colava na borda
  superior da tela e 3 linhas da zona de spawn ficavam fora/inacessíveis.
  Adicionado `otbmBounds` {1010,1012,21,13} que recorta o mapa centrado
  no centermap: jogador nasce no centro exato da tela e 100% da zona de
  spawn fica visível.
- **Fix — 404 de projéteis (`physical_*.png`)**: as skills dos
  monstros declaravam `miss: "physical"` (nome de elemento, não de
  sprite) — o client pedia `missile/physical_<dir>.png` inexistente e o
  engine marcava `projectile` até em skill de área. O Marksman agora
  dispara `bolt` real; os `miss` mortos de skills de área (groundshaker
  do Skirmisher, swoop da Night Harpy, groundshaker do Yorik Youngbook
  no Roost e o root do Zharvorin's Spirit — que pedia
  `rooting-effect_*.png`) foram removidos. Consumers de `sk.miss`
  (client + engine) agora resolvem nome de elemento via
  `ELEMENT_MISSILE` antes de virar nome de arquivo.
- **Fix — sprites errados na Arean Outskirts (400+)**: os 4 monstros
  usavam looktypes estimados do lote livre 15.20. Corrigidos para os
  looktypes oficiais do staticdata do client 15.20 (race→outfit):
  Night Harpy **1899** (era 1901 — o looktype do Marksman), Raubritter
  Skirmisher **1900**, Raubritter Marksman **1901** e Raubritter
  Chastener **1902**. As mesmas fichas valem para a Stag Bastion.
  Sheets 9×4 re-renderizados a partir do DAT convertido.

---

## 2026-11-20 — Vladrukh: drops raros e muito raros oficiais

- **Loot do Vladrukh corrigido** — faltavam os tiers raros do loot
  oficial. Adicionados: **Blood Crown** (item novo, 116k no Yasir) e
  as 10 peças do **set Norcferatu** (Bloodhide, Bloodstrider,
  Bonecloak, Bonehood, Goretrampers, Thornwraps, Tuskplate,
  Skullguard, Fleshguards e Fangstompers) como drops muito raros.
  Blood Sceptre passou a ser classificado como drop raro, como na
  tabela oficial.

---

## 2026-11-20 — Progresso por CONTA: level/exp, nome público, bless no wipe

- **Level e EXP passam a ser da conta, não do personagem**: todos os
  personagens da conta compartilham o mesmo nível — a leitura injeta
  `accounts.level/exp` no snapshot de cada char e todo save (cidade,
  checkpoint de hunt, compras) só faz o progresso da conta AVANÇAR.
  Migração automática: `accounts.level/exp` = maior char existente.
- **Nome da conta no registro**: criar conta agora exige um nome público
  (3-24 caracteres, único) exibido no chat, ranking e perfil — o
  nickname do chat passa a ser esse nome, não mais o do personagem.
- **Ranking por jogador**: cada linha é uma conta (nome público); clicar
  no nome expande a lista de personagens daquele jogador com vocação
  e nível.
- **Bless cobrada só no wipe da PT**: morte individual não consome mais
  o flag de bless — o custo acontece quando o grupo inteiro morre
  (revive pago ou carga da Store), como antes no wipe.

---

## 2026-11-20 — Wheel of Destiny: pontos persistem durante a hunt

- **Fix — pontos da roda não salvavam**: durante uma hunt ativa o
  autosave era ignorado (instância ativa) e o snapshot autoritativo
  regravava a roda antiga no fim do combate. A roda agora viaja no
  tick como preferência do cliente (mesmo canal dos Helper presets):
  o cliente espelha `p.wheel` no `visual`, o engine sanitiza contra
  o budget real (ids válidos, `spec.max`, gasto ≤ pontos por nível)
  e aplica em `item.p` — e `enforceAuthoritativeProgress` preserva
  a roda enviada no save.
- **OK (Aplicar) não fecha mais o modal** — continua aberto para
  distribuir +1 por fatia enquanto houver pontos; fecha pelo botão
  "Close" ou pelo X do modal.

---

## 2026-11-20 — Modal de patch notes compacto

- Modal de boas-vindas/patch notes **menor** (720 → 560px, logo 96px,
  lista até 260px) e **fundo no padrão dos painéis da cidade**
  (`#23262d`, header/footer `#1b1e24`).

---

## 2026-11-20 — Wheel of Destiny: novo layout do modal (wod)

- **Palco circular** — a roda fica contida em um palco com gradiente
  radial e borda dourada metálica (`#755b29`), escondendo as bordas
  irregulares da arte original.
- **Nós claros** — ícones circulares com estados distintos:
  disponível = glow verde `#4ade80`; selecionada = borda/glow ciano
  `#38bdf8` + escala; bloqueada = apagada/grayscale. Cada nó exibe um
  mini-contador `pts/max` abaixo do ícone.
- **Inspetor direito** — painel lateral com botão "Show bonus
  summary", card da fatia selecionada (nome, progresso, descrição) e
  os controles **−1 / +1 / MAX** logo abaixo dos detalhes.
- **Ações fixas na base** — **OK (Aplicar)** dourado e **Reset**
  vermelho sempre visíveis no rodapé do inspetor.
- Layout 2 colunas com coordenadas percentuais — redimensiona junto
  com a janela; todos os ids/handlers originais preservados.

---

## 2026-11-20 — Sprite da Wand of Defiance + preços oficiais de NPC

- **Wand of Defiance** — ícone reimportado do client (cid 16096,
  32×32): o sprite anterior estava quebrado/truncado.
- **Preços corrigidos** (npcvalue oficial TibiaWiki, venda ao Yasir):
  Brooch of Embracement 0 → **14.000** · Crown 0 → **2.700** ·
  Vibrant Heart 0 → **2.100** · Telescope Eye 0 → **1.600** ·
  Vibrant Robe 0 → **1.200**.
- **Rotten Blood** (valores confirmados): Unstable Darklight Matter
  0 → **5.000** · Yellow Darklight Matter 0 → **5.000** ·
  Darklight Obsidian Axe 0 → **8.000**.
- Verificados já corretos: Dark Obsidian Splinter 4.400 e
  Darklight Basalt Chunk 3.800.

---

## 2026-11-20 — Modal de patch notes redesenhado

- O aviso pré-login (`alpha-announce`) agora usa o layout `gi-patch-*`:
  faixa "BETA OFICIAL" no topo, logo hero, bloco de boas-vindas, barra
  dourada de data/hora, lista com badges **NOVO**/**FIX** parseados do
  prefixo de cada bullet, footer com botão OK dourado e copyright.
- Itens sem prefixo renderizam como texto puro (sem badge). Badge FIX
  em azul, NOVO em vermelho.
- Conteúdo atualizado: timestamp 20/11 e os 5 updates mais recentes
  (Order of the Stag, Roost of the Graveborn, Dragon Ancestor Spirit,
  badge "!" de quests, fix do loot de boss) no topo da lista.

---

## 2026-11-20 — Notificação "!" de recompensa de quest a coletar

- Sempre que uma missão de quest está concluída e a recompensa ainda
  não foi resgatada, um badge **"!"** dourado aparece:
  - no botão **QUESTS** da topbar (`#btn-quests`), e
  - no **card da quest** dentro do modal QUESTS (sobre o retrato).
- Detecção por quest via `rewardReady(p)` no `QUEST_DEFS`:
  - **Roost of the Graveborn** — Crypt Runes (M3, auto-resgate ao abrir)
  - **Order of the Stag** — Royal Bounacean Advisor Outfit (M3)
  - **Make Believe** — outfit/elmo/montaria/arma Moonsilver pendentes
  - **Book World** — Illuminator Outfit · **Bloody Tusks** — Gloom Maw
  - **Primal Ordeal** — Noxious Ripptor (Hazard 6, claim manual)
- O badge do botão atualiza em todo `renderAll`; o do card no render do
  modal. Some ao resgatar/receber a recompensa.

---

## 2026-11-20 — Dragon Ancestor Spirit: outfit corrigida + novo modal de troca

- **Outfit corrigida** — o retrato do NPC usava o looktype 1899, que é a
  Night Harpy (o NPC aparecia como uma ave). Agora usa o looktype 1883
  (dragão espectral sombrio). Importer atualizado para não regredir.
- **Modal dedicado** — a troca de Crypt Runes saiu do painel genérico
  para um layout próprio (`gi-crypt-*`): cabeçalho com retrato do NPC,
  citação, grade de 5 runas com destaque `.is-owned` nas que o jogador
  possui, caixa de recompensa com a roleta de armas Crypt, botão
  TROCAR que só habilita (`.is-ready`) com as 5 runas e status de
  bloqueio. O botão Fechar usa o fechamento padrão do modal de NPC.
- Regras inalteradas: 1 de cada runa → 1 arma Crypt aleatória com os
  mesmos pesos oficiais; débito antes do giro e crédito na Loot Pouch.

---

## 2026-11-20 — Roost of the Graveborn: Missão 1 reduzida para 500 kills

- A Missão 1 da quest (`MISSION_DEFS["unhallowed-crypt"]`) passa de
  **5.000 para 500 kills** na Unhallowed Crypt para liberar a cadeia de
  bosses (Adventurer Group → … → Bonelord's Phylactery). Label,
  descrição da quest, `roostState` (progresso/conclusão) e testes
  atualizados. Progresso já acumulado continua valendo — quem tinha
  ≥500 kills tem a missão completa automaticamente.
- `game/js/roost-graveborn.js` → `?v=roost-m1-500-v1`.

---

## 2026-11-20 — Reward Chest: loot de boss aparece na Loot Pouch na hora + correções de integridade

- **Bug corrigido**: ao recolher o loot de boss online, o item não
  aparecia na Loot Pouch até trocar de personagem. `rewardChestApplyServer`
  atualizava os dados mas nunca repintava o painel `#lootpouch` (na cidade
  não há loop de render — só `renderAll` o atualizava). Agora repinta
  Loot Pouch, mochila e Supply Stash no ato do claim.
- **Duplicação corrigida (servidor)**: o patch do claim dentro de
  instância ativa não rebasiava `_pouchBase` — o split
  terminal/dirty via `pouchDelta` somava o MESMO delta de novo e os
  itens entravam duplicados no shared. O patch agora rebasia a
  baseline de todos os membros que compartilham a pouch por
  referência (mesmo padrão de `syncInstancePouchCopies`).
- **Ressurreição de bundles corrigida**: `rewardChestBundles` é array
  compartilhado por referência entre os membros da conta na instância
  (`shareInstanceContainers`). Remover bundle via `filter()` trocava a
  ref só no personagem que clicou — o tick seguinte ressuscitava o
  pacote nos demais. Remoções agora são `splice` in-place
  (`rewardChestRemoveBundleIfEmpty`/`rewardChestCompactBundles`), com
  paridade no cliente.
- `tools/test_boss_reward_online.js` cobre: remoção in-place com ref
  compartilhada, rebase de `_pouchBase`, repaint e aplicação do estado
  do claim (pouch/stash/chest) num sandbox.
- `game/js/reward-chest.js` → `?v=reward-claim-repaint-v1`.

---

## 2026-11-20 — Modal de hunts: Ferumbras Ascendant movido para HUNTS 250+

- As 3 hunts de Ferumbras Ascendant (**Ferumbras Ascendant Way**,
  **Grounds of Damnation/Tafariel** e **Grounds of Destruction/
  Apocalypse** — todas minLevel 250) saíram da seção dedicada
  "FERUMBRAS ASCENDANT" e entram em **HUNTS 250+** no modal.
- `game/js/hunt-sections.js` → `?v=ferumbras-250-v1`. A `cat`
  `ferumbras-ascendant` dos hunts permanece (só a seção mudou).

---

## 2026-11-20 — The Roost of the Graveborn Quest — informações in-game atualizadas

A página da quest (QUEST_DEFS `roost-of-the-graveborn-quest`) agora
descreve as mecânicas realmente implementadas de cada encontro — não
mais só a cadeia nominal:

- **Descrição** reescrita: M1 5.000 kills na Unhallowed Crypt →
  cadeia de 4 bosses com as mecânicas de cada um (avatares + Bright
  Crystal + Fatal Bug; vulcões→Flame Totems/imortalidade; Ice
  Crawlers; Bonelord Totems invulneráveis) → Phylactery em 2 fases
  (Soulcages de pool compartilhado + dragon spirits; Phylactery + 4
  Enthralled Dragons sob os gazes) → 5 Crypt Runes.
- Novo painel **"MECÂNICAS DA CADEIA"** no detalhe da quest, com uma
  linha de estratégia por boss.
- `game/js/roost-graveborn.js` → `?v=roost-info-v1`. Nenhuma
  mecânica alterada — apenas a informação exibida.

---

## 2026-11-20 — The Order of the Stag Quest (350+) — 3 missões

A quest que amarra a região da Isle of Ada: duas missões de caça nos
hunts 400+ recém-lançados e o boss final, com recompensas oficiais.

### Missões (registradas como MISSION_DEFS dos hunts)

- **M1 — Stag Bastion**: eliminar **500 monstros** na hunt.
  Recompensa: **The Mariner's Compass from the Antoinette** ×1 —
  item oficial `itemid 52759`, `w 30`, **extra slot com arm 3**
  (a pedido do jogador; oficialmente é um extra-slot item).
  `npcvalue 0` → **sem comprador NPC → sell 0**.
- **M2 — Arean Outskirts**: eliminar **50 Night Harpies**
  (contador `monster:"night-harpy"` — só harpias contam).
  Recompensa: **acesso ao Court Warlock** (`bossAccess`); o
  requirement do boss agora é `level 400 + mission arean-outskirts
  + access court-warlock` — com migração automática para quem já
  tiver a missão completa.
- **M3 — Court Warlock**: derrotar o boss. Recompensa: **Royal
  Bounacean Advisor Outfit (addon 1 + 2)** — looktypes oficiais
  m=1436 / f=1437 (já presentes no `appearancedata`), concedida
  automaticamente ao abrir a quest após o kill
  (`missionsDone["order-of-stag:outfit"]`).

### Detalhes

- `QUEST_DEFS["order-of-the-stag-quest"]`: level 350, `questType:
  "boss"`, renderDetail próprio com barras de progresso das 3
  missões, ícone do compass, preview da outfit e requisito 350+.
- Paridade: progresso por hunt counter (`p.missions[huntId].progress`)
  — engine incrementa `.kills` e `.progress[slug]` a cada kill;
  claims/recompensas pelo fluxo genérico de missões
  (`tryCompleteMissionRewards`) + `missionsDone` sincronizado à conta.
- Kills já registrados nos hunts (progress acumulado desde o
  lançamento) contam retroativamente — mesmo comportamento da
  missão de 5.000 da Unhallowed Crypt.
- `game/js/court-warlock.js` (`?v=order-of-stag-v1`), ícone
  `assets/item/mariners-compass-from-the-antoinette.png` (cid 52759).

---

## 2026-11-20 — Court Warlock — boss 400+ final da The Order of the Stag (update 15.20)

### Ficha oficial

- **race_id 2741 · looktype OFICIAL 1903** (decodificado do bestiário
  do client 15.20) · **hp 120.000** · **exp 147.000** · Archfoe;
  walksthrough Fire/Energy/Poison, para-immune, sense-invis;
  cooldown 20h (oficial: resetável com Twisted Marionette).
- Sala `court_room.otbm` — center {1021,1025} / bossspawn {1021,1022} /
  playerspawn {1021,1028} (coords oficiais), z=7.

### Encontro oficial em 3 fases (Spoiler da quest)

- **F1 — Raubritters**: waves spawnam **na posição do jogador** —
  Poisoned (imune earth), Frozen (imune ice), Raging (imune fire),
  Energised (distance fighter, imune energy); hp oficial 35.000.
  **4 do mesmo tipo vivos → viram a versão enraivecida** (+hp/dano).
  Teleporte periódico pela sala + **terreno especial** (as 12 células
  de ground 500 do OTBM, anel central) causa **Death Damage alto por
  exposição**.
- **F2 — Falcons**: após as waves a sala enche de **Falcon Knights e
  Falcon Paladins**; o terreno especial some.
- **F3 — Court Warlock**: entra com **menos HP conforme a luta**
  (implementado: hp base + 15k por transformação forçada).
- Paridade: `tickCourtWarlock` + bind em `arenaBossBindMechanics` no
  engine; `courtWarlockBossInit/BossTick/Cleanup` no cliente
  (`court-warlock.js`), hooks em `combat.js`/`game.js`.

### Loot oficial completo

- **Stag Set** (10 peças, lvl 350, upgrade class 4, ids oficiais
  52348–52357): helmet/robe/plate/legs/shinguards/boots/footwraps/
  spellbook/scrolls/shield — "Negotiable", **sem comprador NPC →
  sell 0** (padrão das crypt weapons).
- **Twisted Marionette** 52746 — npcvalue 125.000 (Yasir), drop raro.
- **Wooden Spellbook** 25699 — npcvalue 12.000 (Talila/Valindara).
- Spellbook of Mind Control, Terra Hood, Lightning Headband, Magma
  Coat, Blue/Red Gem, moedas (até **500 cc very rare**), poções
  ultimate (health/mana/spirit).
- Looktypes dos Raubritters **estimados** do lote livre 15.20
  (não-bestiário, sem ficha pública): poisoned 1895, frozen 1890,
  raging 1910, energised 1909; enraivecidos 1888/1885/1919/1882.
  Valores de waves/teleporte/bônus de hp são design documentado.

### Stag Bastion — hunt 400+ (mesma sessão)

- `stag_bastion.otbm` (20×19, z=7): spawn radius oficial
  {1017,1020}–{1025,1028} (81/81 caminhável), center {1020,1024},
  **respawn 8–10** (pack 9).
- **3 Raubritters de hunt** (fichas OFICIAIS do wikitext):
  - **Skirmisher** — melee: hp 11.000, exp 8.550, armor 100, mit 3.92
  - **Chastener** — conjurador elemental + escudo: hp 10.000, exp 9.500,
    armor 80, mit 3.68
  - **Marksman** — distance fighter oficial: hp 10.500, exp 9.025,
    armor 90, mit 3.45
  - resistências oficiais (dmgMod→resist), walksthrough campos,
    para-immune + sense-invis; looktypes estimados (1908/1920/1889).
- **Loot oficial completo** — creature products novos: stag parchment
  (52664→3k), silver poniard (52662→2k), cuirass plate (52663→1k),
  bottle of raubritter lager (52745→sem comprador), marinated sturgeon
  (52638→sem comprador), crystalline arrow, rings plasma verde/laranja
  (23531/50150→8k); placeholders de preço corrigidos ao oficial
  (shockwave amulet 3k, magma amulet 1,5k, gold ingot 5k).

### Arean Outskirts — hunt 400+ (mesma sessão)

- `arean_outskirts.otbm` (39×41, z=7): spawn rect oficial
  {1015,1014}–{1023,1020} (63/63 caminhável), center {1020,1018},
  respawn 8–10 — hunt mista Isle of Ada.
- **Night Harpy** (ficha oficial): hp 14.000, exp 21.000, armor 90,
  mit 3.92, speed 190, Bird/Hard — resistente earth 40%/fire 30%,
  fraca a ice/death/holy; loot oficial: potions 8-12, **night harpy
  feathers** (52633→5k), gems gigantes e 100cc very rare.
- + os 3 Raubritters (mesma área oficial da Isle of Ada).
- Correções de preço: 5 giant gems placeholder → npcvalue oficial
  (50k–90k).

### Correções de looktype (staticdata do client 15.20)

- Adventurer Group: yorik 268 · percy 137 · grendel 144 ·
  fiona 1681 · nigel 1837 (estimativas anteriores substituídas).
- Zharvorin's Spirit → 1884 (1903 é o looktype oficial do
  Court Warlock — colisão resolvida).

---

## 2026-11-20 — The Roost of the Graveborn Quest — boss quest 450+ (update 15.20)

### Progressão (oficial)

- **M1** — 5.000 kills na Unhallowed Crypt → libera **Adventurer Group**
  (The First Dragon, `first_dragon.otbm`).
- **M2** — cadeia sequencial de 4 bosses → libera **Bonelord's
  Phylactery** (boss final):
  1º Adventurer Group (first_dragon) → 2º Eldritch Dragon Lord
  (Under Fire, `eldritch_dl.otbm`) → 3º Ice Horror (The Frozen Hoard,
  `ice_horror.otbm`) → 4º The Gravedigger (The Last Dragon Soul,
  `gravedigger.otbm`).
- **M3** — derrotar a Phylactery (`bonelords_phylactery.otbm`) →
  **1 de cada Crypt Rune** (auto-resgate ao abrir a quest).

### Bosses (fichas oficiais 15.20)

- **Adventurer Group** (The First Dragon, `first_dragon.otbm`,
  center {1029,1031} / bossspawn {1030,1027} / playerspawn {1029,1034}) —
  encontro oficial **multi-membro**: a sala abre com **5 aventureiros
  por vocação** (Yorik=Knight 2712, Percy=Paladin 2713, Grendel=Druid
  2714, Fiona=Sorcerer 2715, Nigel=Monk 2716 — HP só Nigel é oficial,
  155k) + uma **Bright Crystal** estática (oficial: explode em Mana
  Drain AoE raio 2 ao morrer — drena 35% da mana máx.).
  - **Transformação oficial**: membro em vida vermelha (≤30%) vira o
    **avatar da vocação** — Steel 1593 / Light 1594 / Storm 1595 /
    Nature 1596 / Balance 1823 — que acerta **crítico em todos os
    ataques** (+30%) e **sofre 30% menos dano**
    (`def.damageTakenMul`, funnel único em `applyOutgoingDamage`;
    `mob.critAll` no melee + skills). Ordem de abate livre — a
    estratégia oficial é um avatar por vez.
  - Os 5 caem → **Fatal Bug** (race 2773, `lookItem 52836`, voices
    oficiais "BRRRRMM"/"I'm bugged!") entra na sala; matá-lo encerra e
    credita `adventurer-group`. Loot oficial dele: Ancient Crypt Rune
    + Worn Guide Book (rare). HP/XP ocultos — 520k/750k estimados.
- **Eldritch Dragon Lord** (Under Fire, `eldritch_dl.otbm`, center
  {1021,1028} / bossspawn {1021,1024} / playerspawn {1021,1030}) —
  race 2739, looktype 1879, exp 750.000, 680k hp; fire imune (oficial:
  se cura com fogo). **Vulcões oficiais**: 4 vents fixos
  ({1017,1024} {1026,1024} {1016,1034} {1026,1033}) que acumulam vida e
  evoluem **Pulsating Lava → Eruption → Flame Totem** (~18s/estágio,
  vent destruído respawna como lava em 30s). **3+ Flame Totems vivos →
  boss IMORTAL** (`mob.eldritchImmune` → dano 0 no funnel
  `applyOutgoingDamage`; totens atacam nova de fogo). Objetos oficiais:
  Eruption 51952 / Flame Totem 51953 (lookItem); Pulsating Lava sem
  objectID público → lava vent 391.
- **Ice Horror** — race 2733, looktype 1881, **hp oficial 542.700**,
  exp 259.000; ice 0% (imune), Death Ring 950+, Great Energy Wave 1300+.
  Sala `ice_horror.otbm` nas coords oficiais (center {1030,1029},
  boss {1030,1025}, player {1030,1031}). **Invoca Ice Crawlers**
  durante a batalha — sprite da Crystal Spider oficial ("looks the
  same as a Crystal Spider"), até 3 vivos, um a cada 12s
  (`tickIceHorror` no engine + `iceHorrorBossInit/BossTick/Cleanup`
  no cliente).
- **The Gravedigger** — race 2721, looktype 1880, exp 750.000;
  Fire Ball 600–800 (oficial). Sala `gravedigger.otbm` nas coords
  oficiais (center {1023,1032}, boss {1023,1029}, player {1023,1035}).
  **Invoca Bonelord Totems ×2** (oficial `Summon amount=2`) — objetos
  `lookItem 51192` **invulneráveis** (todos os dmg mods 0% →
  `damageTakenMul 0` no funil) que fazem área de morte; cooldown oficial
  resetável com Shrunken Head.
- **Bonelord's Phylactery / Bone Overlord** — race 2771,
  `lookItem 52831`, exp 1.000.000, 850k hp; earth 110% (fraco).
  Batalha máx. oficial 900s. Sala `bonelords_phylactery.otbm`
  (boss {1026,1025}, player {1026,1035}). Encontro oficial em
  **2 fases** (`tickBoneOverlord` + `boneOverlordBossInit/BossTick/
  Cleanup`):
  - **Fase 1** — 4 **Soulcages** (`objectID 52546`, hp oficial 120.000
    cada, **pool compartilhado**: dano em qualquer uma drena todas —
    propagado por delta de sync, nunca min() das vivas) + 4 **dragon
    Spirits imunes a todo dano** (Zharvorin/rooted, Myzareth/feared,
    Scarith/drunk, Elyrax/slowed — Energy Missile 450+ e Bleed
    Explosion 800+ oficiais); espírito a ≤2 sqm da sua cage **cura o
    pool** (~5.000/turno oficial) e teleporta à cage quando o pool
    cai abaixo de 50%. Resistências oficiais das cages: Zharvorin
    fraco Death+Physical, Myzareth fraco Energy, Scarith fraco Ice
    (mitigation 3.45 oficial), Elyrax fraco Death+Holy + Holy Chain
    1600+.
  - **Fase 2** — pool zerado → a **Phylactery entra** junto de **4
    Enthralled Dragons** ao sul (atravessam Fire/Energy/Poison —
    resist 100% oficial; life drain vital). Até 4 de cada invocável,
    como pedido.
  - **Gazes** durante toda a luta (~20s): *An Eye* (fuse 5s → 30% maxHP
    agony raio 2), *Wraithfire* (15% hp atual + campo 52441), *Mana
    Drain* (5% maxMP ×5), *Curse* (4 explosões físicas), *Bone Barrier*
    (4 barreiras objectID 6972 hp 10.000 ao redor do jogador —
    simplificação documentada do teleport à sala lateral).
  - Looktypes dos summons são **estimados** do lote livre 15.20
    (dragão 1883; espíritos 1886/1903/1904/1905) — o appearances.dat
    não traz nomes.
- Cooldown **20h** em todos; gates `enforced` + `killsRequired`
  sequencial (boss modal "ROOST OF THE GRAVEBORN 450+").

### NPC Dragon Ancestor Spirit

- `crypt-exchange` (catálogo de NPCs): exige **1 de cada Crypt Rune**
  (fiery/icy/deathly/ancient/necromantic) e troca por **1 arma Crypt
  aleatória** — debita antes do giro (troca persistida).
- Roleta gif igual à do Make Believe: preview ciclando ícones + giro
  que desacelera até o sorteado. Pesos oficiais (Crypt Runes
  Statistics): Spine 82/15,8% · Slicer 79/15,3% · Bile 76/14,7% ·
  Strike 75/14,5% · Splitter 73/14,1% · Breaker 69/13,3% ·
  Jaw 64/12,4%.

### Itens novos (12, cids oficiais 15.20)

- 7 **Crypt weapons** lvl 450 cls 4 — sell 0 ("Negotiable", sem
  comprador NPC): spine (bow pal, atk+8 hit+5 dist+3 range6 ice+5%),
  slicer/splitter/breaker (sword/axe/club knight, atk 58 def 33 +4),
  strike (fist monk, atk 45 def 20 fist+4 ml+1), bile (wand sorc,
  85-135 physical, range 7, ml+4, fire+6%), jaw (rod druid, range 5,
  ml+4, energy+6%). **ids 52332–52338 corrigidos** (estavam 51309–15
  no weapondata).
- 5 **Crypt Runes** — sell 0 (quest, npcvalue 0): cids 52657–52661.
- Creature products novos (Yasir, npcvalue oficial): worn-guide-book
  250k, golden-claw 250k, shrunken-head 250k, ancient-scales 400k,
  soul-trap 250k, skull-tendril 650k, bone-spikes 1,5M, icy-scales
  250k, icy-horns 250k, frozen-crapace 500k, dragon-tongue 550, shard
  2.000 (id 7290 — item antigo que faltava no catálogo).

### Sprites e mapas

- Sheets 9×4 reais do DAT: eldritch (1879), gravedigger (1880),
  ice-horror (1881); sheets estáticos dos `lookItem` 52836/52831;
  portrait do NPC (looktype 1899); 166+ tiles importados dos 5 OTBMs
  (2 ids invisíveis: 33720/51935 metadata).
- Paridade cliente/servidor: `roost-graveborn.js` carrega no sandbox
  do engine + `registerMonsters(MONSTERS)` + 5 HUNTS `*-room`.

### Teste

- `node tools/test_roost_graveborn.js` — OTBM bounds/spawns conectados,
  cadeia de gates, fichas oficiais, cids/preços, sheets, âncoras,
  roleta ponderada (40k giros), troca 5-runas, paridade engine.

---

## 2026-11-20 — Unhallowed Crypt — nova hunt 400+ (update 15.20)

### Hunt

- **Unhallowed Crypt** (HUNTS 400+): mapa oficial OTBM 34×27 z=7
  (bounds 1009–1042 × 1016–1042), centermap {1027,1030,7}, zona de
  spawn {1021,1028}→{1030,1034} 10×7 = 60 sqm conectados, respawn de
  **8 a 12 monstros por onda**.

### Monstros (fichas oficiais TibiaWiki/tibia.gg)

- **Creepy Crawler** — 27.000 hp / 22.380 exp, armor 100, mit 6.60,
  speed 260, raceId 2763, looktype 1890. Ability oficial **Fear (2s)**
  (mesmo modelo do Soul War: condição no cliente, fx no servidor).
- **Crypt Construct** — 25.000 hp / 19.730 exp, armor 100, mit 5.36,
  speed 240, raceId 2760, looktype 1887. **Area Healing oficial**
  10.000–13.250 (uncommon) como defSkill de cura.
- **Crypt Fiend** — 30.000 hp / 19.070 exp, armor 140, mit 4.39,
  speed 240, raceId 2758, looktype 1885, som oficial "Uhhh!".
- Todas: Skeletons/Undead **Challenging** (200/2.000/5.000 → 100
  charms), melee, paraimmune + veem invisível, sprites 9×4 reais
  (4 direções) renderizadas do DAT convertido.

### Itens novos (7, cids do update 15.20)

- amber 20.000 · necromantic-core 10.000 · giant-tusk 6.000 ·
  toe-nails 4.500 · crystallized-death 3.000 ·
  cluster-of-crystallized-death 9.000 (Yasir)
- **fetid-heart: sell 0** — item de quest (5 Ancestral Charges), sem
  comprador NPC oficial.

---

## 2026-11-20 — Prey Cards: seleção paga de criatura + 3º slot na Store

### Prey

- **SELECIONAR (qualquer criatura)** — novo botão em cada slot de prey
  (ativo ou inativo) abre o picker com todas as criaturas caçáveis,
  com busca: escolhe qualquer uma — mesmo fora da grade de 9 — por
  **1 Prey Card** (o `ListAll_Cards` oficial; `isPreyExclusive` só entra
  nesse pool). O bônus rola normalmente e o timer de 2h começa. Serve
  também para trocar a criatura de uma prey ativa.
- **3º slot de prey por conta** — compra permanente na **Store → Preys**
  por **50 Prey Cards** (`/api/store/prey-slot`, débito + grant em um
  único UPDATE atômico). Desbloqueia o slot 3 em todos os personagens
  da conta via `cosmetics.preySlot` (o unlock por 250k de gold por
  personagem segue valendo).

### Fix

- **Make Believe — Illuminated Warrior/Radiant Nimbus** — os claims
  persistiam só `missionsDone` no servidor enquanto o cosmético ficava
  no sessionStorage; `wardrobe.migrate()` agora deriva os cosméticos por
  conta dos claims (outfit com addons 1+2, montaria) em toda leitura do
  wardrobe — cura retroativa de quem já resgatou.
- `test_store.js` — `adminSummary` exige role admin real (TEST_SERVER
  não é bypass); assert desatualizado corrigido.

---

## 2026-11-19 (v2) — Savestate global sem desconexão + visual gótico do login

### Server save → savestate global

- **Fim da desconexão das 00h** — o server save não derruba mais o
  processo: às 00:00 (America/Sao_Paulo) o servidor executa um savestate
  global — libera a recompensa diária de exercise weapon, marca o cache
  quente de PvP como sujo (o próximo tick commita o blob inteiro da
  batalha no banco) e flusha o runtime do JsonStore. Jogadores seguem
  online, sem countdown de manutenção.
- `SERVER_SAVE_EXIT=1` restaura o restart legado supervisionado (uso
  exclusivo de ops/deploy). A topbar passa a exibir "DAILY RESET IN".

### Visual da entrada (login / seleção / loading)

- **Background Verão 2026** — novo wallpaper global
  (`backgroundverao2026.webp`), sem filtros escuros sobre a imagem
  (`#login-bg`/`#login-overlay` transparentes).
- **Login sem modal** — caixa transparente integrada ao ambiente;
  logo e botões LOGIN/CREATE ACCOUNT (arte) mantidos, sem moldura
  amarela atrás da arte.
- **Seleção de party gótica** — moldura dourada com ornamentos de canto
  em SVG, header "Selecione sua Party • Global Idle" + saldo de TC,
  cards com alça de arraste, badge 👑 LÍDER, level verde e botão ENTRAR
  outlined; rodapé com botões primário/secundário/danger.
- **Loading bestiário** — mesmo padrão gótico: pedestal iluminado com
  sprite flutuante, badge elemental colorido (HOLY/FIRE/ICE/DEATH/
  EARTH/ENERGY), pills HP/EXP/ARMOR e barra de progresso dourada com
  contador fixo `N/M` (tabular-nums).

### Outras correções acumuladas

- **Phosphorus** — mapa OTBM com bounds reais (crop correto), sem
  cooldown, mecânica Agony em área 3000–5000 (20% a cada 8s, true
  damage), missile físico corrigido (fim do 404 physical_w.png).
- **PvP multi-guerras** — cache de batalhas sem thrash (PVP_AUTH_CACHE_MAX),
  pool MySQL configurável (MYSQL_POOL_LIMIT=25) e lock de conta com 1 query
  (fim do N+1 de rosters).
- **Topbar** — botões padronizados (mesmo tamanho/espaçamento/ícones).
- **FOV +1 coluna** em todas as hunts — laterais do combate sem faixas
  pretas.
- Regressões de testes corrigidas (pillar-of-dark-energy restaurado no
  mobsheetdata, asserts de cache-bust/SHA atualizadas).

---

## 2026-11-19 — RMT: recompra oficial de Tibia Coins via PIX

### Novo módulo (economia)

- **Market → aba RMT** — o servidor passa a recomprar Tibia Coins dos
  jogadores com pagamento manual via PIX: dashboard (saldo, cotação,
  reservadas, últimas transações), formulário de venda com simulação e
  confirmação, cadastro de dados PIX do titular (CPF/CNPJ/e-mail/
  telefone/chave aleatória) e histórico de tickets com linha do tempo.
- **Reserva atômica de TC** — ao criar a solicitação as TC são debitadas
  na mesma transação de banco (FOR UPDATE + UPDATE condicional); TC
  reservadas não podem ser usadas em market, transferências ou outras
  solicitações. Devolução idempotente em cancelamento/reprovação.
- **Cotação fixa configurável** — padrão 1.000 TC = R$ 10,00; cada
  ticket grava snapshot imutável da cotação e dos dados de recebimento.
  Valores sempre em centavos inteiros (nunca ponto flutuante).
- **Máquina de estados** — pending → under_review → approved →
  payment_processing → paid, com rejected/cancelled; comprovante PIX
  (upload jpg/png/pdf com SHA-256) é obrigatório para concluir.
- **Painel admin → aba RMT** — tesouraria (TC compradas/reservadas,
  comprometido, caixa disponível), fila com filtros, tela do ticket com
  ações por permissão, configurações com histórico e auditoria.
- **Segurança** — permissões granulares RMT_* (nova coluna
  accounts.admin_perms; role=admin continua super), PIX/CPF cifrados
  AES-256-GCM (RMT_ENC_KEY) e exibidos mascarados, logs administrativos
  append-only em rmt_admin_logs, ledger reusa coin_ledger, rate limits,
  elegibilidade (idade da conta, bans, rejeições repetidas, fila aberta).
- **Backend**: server/rmt.js + tabelas rmt_requests, rmt_payment_profiles,
  rmt_settings(+history), rmt_admin_logs, rmt_receipts — MySQL only;
  em modo JSON o módulo responde indisponível.

---

## 2026-11-17 (v2) — Norcferatus Fortress, Vladrukh e Bloody Tusks Quest

### Novo conteúdo

- **Norcferatus Fortress (400+, hunt)** — a fortaleza dos vampiros do
  update 15.10: Dworc Shadowstalker, Gloom Maw, Norcferatu Heartless,
  Norcferatu Nightweaver e Orclops Bloodbreaker (pack 8–10, **respawn
  de 8 em 8 segundos**). Mecânica própria: a cada respawn há **3% de
  chance de nascer 1 Varg extra** além do pack. Loot completo com os
  creature products do update — Blood Amulet, Norcferatu Talisman,
  Chain Leash, Piece of Frozen Night, Heart Amphora, Pot of Orcish
  Warpaint, Spiked Gorget/Bracers, Blood Hood, Orcish Toothbrush,
  Bone Fibula, Bloodshot Giant Eye, Ritual Bone Knife, Bone Rattle e
  Greater Garlic Necklace (10k no Haroun).
- **Vladrukh (400+, boss)** — o lorde Norcferatu: 390.000 HP, sala
  própria na câmara sul da fortaleza, cooldown de 20h. Loot com
  **Blood Sceptre** (178k no Yasir), Greater Proficiency Catalyst,
  Blood Preservation, catalisadores de proficiência e poções supreme/
  ultimate em quantidade.
- **Bloody Tusks Quest (400+)** — Missão 1: derrotar **5 Vargs** na
  Norcferatus Fortress libera o acesso ao Vladrukh; Missão 2:
  derrotá-lo concede a **montaria Gloom Maw** (resgate único por
  conta).

### Ajustes

- **Urmahlullu the Weakened** — HP reduzido de 500k para **150k**.
- **Mimar Haffar** — movido para a seção **BOSSES 800+** (o requisito
  oficial já era nível 800 + Doctor Marrow + Make Believe M1).

---

## 2026-11-17 — Book World, Sir Leonard, Make Believe Quest e 8 novas hunts/bosses

### Novo conteúdo

- **Book World (150+, hunt)** — a biblioteca viva do update 15.10:
  Bluebeak, Bramble Wyrmling, Crusader, Hawk Hopper, Headwalker e
  Lion Hydra (respawn 6–8), todos Inkborn com loot oficial — incluindo
  Paper Boat, Star Ink, Book with a Dragon/Hourglass, Sealing Wax e o
  novo Cookbook (produto de criatura, vende no Yasir).
- **Sir Leonard (150+, boss)** — o centauro-menestrel guardião da Book
  World: sala própria, melee + UE de terra + Death Strike + Bomba
  Musical, invoca até 5 Crusader Guardians, cooldown 2h. Loot com os
  raros **Ink Blade/Quill/Claw/Vine/Brush**, Axe e Helmet of Sir
  Leonard, Gearwheel Chain e Proficiency Catalyst.
- **Book World Quest (150+)** — Missão 1: derrotar 1.000 monstros em
  Book World libera o acesso ao Sir Leonard; Missão 2: derrotá-lo
  concede a **outfit Illuminator com addons 1 e 2** (resgate único por
  conta).
- **Urmahlullu the Weakened (150+, boss)** — estágio único de 500k HP
  com a sala própria e loot completo.
- **Bashmuul - Issavi (250+)** e **True Asuras - Thalassara (400+)** —
  novas hunts OTBM com sprites e loot oficiais.
- **Moonstone Castle (400+, hunt)** — os cavaleiros de pedra-lua da
  Make Believe, porta de entrada da quest 800+.
- **Make Believe Quest (800+)** — quest em 4 missões encadeadas:
  2.500 kills em Moonstone Castle liberam os bosses **Mimar Haffar** e
  **Maior Domus**; matá-los libera a hunt **Radiant Skyhold (800+)**;
  5.000 kills lá liberam o World Boss **Phosphorus** (lobby até 5,
  level 800+). Recompensas finais por conta: outfit **Illuminated
  Warrior** com addons, montaria **Radiant Nimbus** e sorteio com
  animação de roleta de **1 arma + 1 equipamento Moonsilver**.
- **4 hunts OTBM anteriores** também entram neste deploy: **Buster
  Spectre - Darashia (150+)** e **Putrefactory, Darklight Core e Gloom
  Pillars (BLOOD ROTTEN 600+)** — a ala da Blood Rotten Quest com
  Wandering Pillar, Darklight Matter e Basalt.
- **HP oficial dos World Bosses** — Deathstrike 200k, Gnomevil 250k,
  Abyssador 340k, Baron/Count/Duke 350k, World Devourer 25k, Pale Worm
  420k, Goshnar's Megalomania 620k (valores de teste removidos).
- **Urmahlullu entrou no sorteio de boss do dia** (daily boost).

### Melhorias e correções

- **Cadeado nas hunts com requisito** — o modal de hunts mostra 🔒 com
  o motivo (nível, boss ou missão pendente) e o jogo bloqueia o início
  até cumprir.
- **Contador de kills de missão no servidor** — hunts online agora
  progridem as missões `kills` no engine autoritativo, em paridade com
  o contador do cliente.
- **Gate de Phosphorus por missão** — o join valida a Missão 3 da Make
  Believe (5.000 kills em Radiant Skyhold) além dos kills de Maior
  Domus e Mimar Haffar.
- **Outfit Illuminator masculina corrigida** — a variante estava com a
  sprite feminina duplicada; agora usa o looktype 1860 correto.
- **Brain Grounds - Venore** movida para a seção HUNTS 400+.
- **Cobra Bastion**: ajuste de células bloqueadas no mapa.
- **Preview de outfit nas quests** respeita o nº de colunas da sheet
  (corrige frames cortados nas outfits novas).
- Preços NPC oficiais de **40+ itens novos** (loot de todas as hunts e
  bosses acima) com paridade cliente/servidor.

---

## 2026-11-06 — Prey por conta, proteção no templo/treiners e PvP fluido

### Mudanças

- **Prey agora é DA CONTA** — slots, criaturas selecionadas, bônus
  (exp/dano/defesa/loot) e wildcards passam a ser compartilhados entre
  **todos os personagens da conta**, como stamina e inventário. O estado
  mora em `accounts.shared_inventory.prey`; qualquer personagem que
  hidratar recebe o mesmo objeto (`applySharedToPlayer`), e rerolls,
  seleções e uso de wildcards feitos em um char valem para os demais
  (`extractSharedFromPlayer`/`mergeSharedFromPlayer` persistem de volta).
  Migração automática: o primeiro personagem com prey já preenchida
  semeia o estado compartilhado da conta.
- **Templo e treiners protegem cargas e timers** — enquanto o personagem
  está na cidade (templo) ou nos treiners/dummies, **itens não perdem
  cargas** (soft boots, time rings etc.), **imbuements não perdem tempo**
  (eles já só decaem por tempo de combate) e **o relógio de 2h da prey
  congela** — a expiração desliza junto, então a prey só gasta tempo
  caçando de verdade.
- **PvP: opção 3v3** no modal de criação de batalha (3 contas por time,
  ~12–15 personagens) além de 5/10/15/20/50/100; **zoom da arena maior**
  (FOV 15×11, estilo Tibia clássico).
- **PvP: início rápido de teste em 3s** (somente TEST_SERVER).

### Correções de performance/estabilidade (PvP)

- **Servidor destravado**: o tick autoritativo segurava `FOR UPDATE` na
  mesma linha por ~35 req/s e afogava o pool do MySQL (menus travavam em
  "Carregando"). Agora o avanço é serializado por mutex em processo com
  persistência por compare-and-swap de `version` — menus voltam a
  responder em ms.
- **Chars remotos não "teleportam" mais**: merges descartados por
  `version` (só bumpava a cada ~4s com o hot-persistence) congelavam os
  personagens simulados; em batalha PvP o dedupe é dispensado (requests já
  são ordenadas na fila da conta), respostas duplicadas mantêm a
  interpolação e deslocamentos de até 4 SQMs deslizam em vez de saltar.
- **Render mais leve**: cache de sprites de texto (nomes/floaters/falas),
  janela de células visíveis no tilemap (FOV+margem em vez do mapa inteiro),
  cache de `maxStats` e da ocupação do grid.
- **Modal "ASSUMIR O CONTROLE"**: logar numa conta já em batalha PvP não
  trava mais numa tela escura — aparece aviso e botão para tomar o lease.
- **Regressão de mapa preto corrigida** (cache offscreen do chão
  removido; o culling por janela visível permanece).

---

## 2026-11-05 — Buraco nas paredes corrigido, telas com cara da cidade

### Correções

- **Espaço vazio nas paredes da Lion Sanctum (e de ~25 mapas)** — grounds
  como `16866` (swamp clay mountain) têm grupo 2×2 no .dat, mas só 1 dos 4
  sprites tem pixels (quadrante superior-esquerdo). Ancorados no canto
  inferior-direito, a textura caía um SQM para cima/esquerda e as células
  da borda ficavam vazias (buraco preto / parede "comendo" a sprite).
  Os **11 ids** afetados (`1128, 4415, 4416, 9246, 16866, 26995, 32570,
  32638, 36565, 36566, 36571`) foram recortados para o 1×1 real e o
  `import_otbm_sprites.py` agora detecta esses "grupos fake multi-SQM"
  automaticamente em imports futuros.
- **Bordas de ground border** (brainstealer, grimvale etc.) passam a
  renderizar exatamente na célula onde foram pintadas no RME.
- **Annihilator: grupo teleportado para a entrada** — o servidor teleporta
  ao disparar a alavanca, mas o merge de checkpoint preservava a posição
  local e o teleporte era descartado (o grupo ficava travado nos SQMs de
  preparo). O evento `annihilator-lever` agora também posiciona os
  personagens na entrada, na mesma ordem esq→dir do servidor.
- **Annihilator: líder caminha ao SQM de preparo** — o `walkGoal`
  scriptado (botão "Posicionar") era ignorado para `c.player`; se o líder
  não estava num SQM de preparo, a alavanca nunca disparava.

### Interface

- **Login, patch notes e tela de loading** agora usam a estética da
  cidade — paleta escura quente (`#1c1a16`/`#4b493e`/`#d8d0bc`) com
  acentos dourados (`#ffe680`/`#8a7a40`/`#d4af37`), no padrão
  `.ranking-table`/`.market-tabs`.
- **Seleção de personagens e modais pré-jogo** (login, patch notes,
  social, ui-mode) na mesma estética da cidade: botões `.primary` dourados,
  secundários escuros, cartões com bevel `#4b493e`/`#17150f`.

### Bosses

- **4 novos Archfoe na seção BOSSES 1–250** (últimos da lista): **Katex
  Blood Tongue** (6.300 HP / 5.000 exp), **Srezz Yellow Eyes** (6.200 /
  4.800), **Utua Stone Sting** (6.400 / 5.100) e **Yirkas Blue Scales**
  (6.300 / 4.900) — stats e loot oficiais do Canary/TibiaWiki.
- Sala dos 4: `lion_sanctum.otbm` (a própria sala do Sanctum) — spawn do
  jogador `{1024,1031,7}`, boss `{1023,1024,7}`, com `walkFloors` de
  areia/trilha igual à hunt.
- **20 itens novos** no catálogo (creature products + Spellweaver's Robe,
  Warrior's Axe, Ring of Green Plasma) com sprites extraídos do DAT e
  preços oficiais de NPC onde existem; itens sem comprador oficial ficam
  com valor 0.
- **14 itens sem preço ganham venda a NPC** (valores oficiais Rashid):
  Skull Helmet 40k, Mercenary Sword 43k, Demonrage Sword 36k, Jade
  Hammer 25k, Assassin Dagger 20k, Ornate Crossbow 12k, Spellweaver's
  Robe 12k, Alloy/Magma/Lightning Legs e Glacier Kilt/Robe 11k, Noble
  Axe 10k, Chaos Mace e Guardian Axe 9k.

---

## 2026-11-04 (b) — Annihilator jogável, abas no personagem, bosses em breve

### Quests

- **Annihilator vira Party Quest** — sem lobby: INICIAR entra direto com os
  4 personagens elegíveis da conta (sem seletor, sem countdown).
- **Modal de explicação** ao entrar na quest com os 5 passos
  (preparo → alavanca → 6 Demons → saída → recompensa).
- Correções: `kind:'quest'` aceito no schema de instâncias (bug que fazia a
  quest falhar instantaneamente), spawnCells com fallback, lobbys órfãs
  removidas ao criar nova.
- **Sprites do mapa**: 25 tiles faltantes extraídos (pisos de fogo, paredes)
  — os SQMs "quebrados" agora renderizam.

### Personagem (UI)

- **LOYALTY, CHARMS, PROFICIÊNCIA e WHEEL** saíram da topbar e viraram
  **abas** do modal do personagem (junto de Proficiência, Roda do Destino).
- Botão **Personagem** ampliado na topbar.
- **Wheel**: botões **OK** (salva pontos) e **RESET** (zera a roda).
- Helper → Ataque → Echo Raid: ícone agora usa a **sprite oficial** do
  portal (Exploraid_Trigger.gif).

### Bosses

- Nova seção **EM BREVE** no modal: The Primal Menace, Magma Bubble,
  Court Warlock, Maior Domus, Phosphorus, Mitmah Vanguard, Bakragore e
  Vladrukh (preview, entrada bloqueada).
- **GRIMVALE 100+** é a segunda seção do modal de bosses.
- Bosses da Grimvale exigem nível 100 + as 2 missões da hunt — o botão
  fica travado sem os requisitos (sem cooldown indevido).

### Correções

- **Bossbar não fica mais sob o corpse** — corpos de jogadores mortos
  passam a desenhar antes da barra do boss.
- **Templo/treino curam** — ao entrar na cidade ou área de treino, o
  personagem recupera HP e mana completos.

---

## 2026-11-04 — Echo Raid, Oberon sem falas, Annihilator no modal

### Novidades

- **Sistema de Echo Raid** (novo). Ao matar monstros comuns/incomuns
  (bestiário 1–2★, sem boss/summon/forge stack), 0,05% de chance de nascer
  um **portal** no SQM do cadáver 30s após a morte, disponível por 2min.
  Pisar no portal arma a raid: **60s de espera** e nascem o **Echo Warden**
  (mesmo monstro, 4x HP) + **7–12 minions** (1,5x HP). Abater o warden
  concede **charm points** por estrelas do bestiário (1x por espécie por
  personagem): 1★→10, 2★→15, 3★→20, 4★→25, 5★→30.
  - **Helper → Ataque → Echo Raid**: checkbox ativa/desativa e modos
    **AUTO** (corre para pisar assim que aparece) e **SAFE** (só pisa sem
    monstros vivos). Funciona offline e online (servidor autoritativo).
  - Arquivos: `game/js/echo-raid.js` (novo), `combat.js`, `gridai.js`,
    `render.js`, `game.js`, `ui.js`, `helper-presets.js`, `index.html`,
    `server/authoritative_engine.js`.

### Mudanças

- **Grand Master Oberon — mecânica de debate removida.** As falas/modal de
  réplicas foram retirados. A luta agora é direta: Oberon precisa ser
  **morto 4 vezes** e **cada morte invoca 4 falcons** (2 Falcon Knights +
  2 Falcon Paladins — ou 10% de chance de 1 mini boss do Falcon Bastion).
  A quarta morte é a morte real. Sem invulnerabilidade/debate.
  - `spawnMobAt` implementado no cliente (helpers agora nascem de verdade
    também no modo offline).
- **Annihilator Quest jogável no modal QUESTS** (nível 100, até 4
  jogadores, rewards: demon armor / magic sword / stonecutter axe /
  demonbone). Mecânica dedicada implementada no servidor: os personagens
  nascem nos **4 SQMs de preparo** — quando todos ficam parados neles por
  3s a **alavanca dispara**: o grupo é teleportado para a entrada e
  **6 Demons** nascem em posições fixas. Mortos todos, fase de **saída**:
  os sobreviventes caminham para os SQMs ao norte e a quest termina
  (`quest-completed` → escolha de recompensa por personagem). O mapa
  `annihilator.otbm` foi copiado para `game/maps/`.

---