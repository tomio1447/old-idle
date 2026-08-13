# Global-Idle — API de Contas (MySQL)

Servidor de contas/personagens do Global-Idle para o jogo **online**.
Guarda contas (login/senha bcrypt, Tibia Coins, role) e personagens
(save completo em JSON) num banco MySQL ou storage JSON local.

## Test server em uma única URL

O processo serve o frontend e a API na mesma porta; o navegador não acessa
`localhost` nem precisa configurar a URL da API manualmente.

```bash
cd tibia-idle/server
npm install
npm run start:test
# abra http://localhost:3333
```

No modo `TEST_SERVER=1`:

- cadastro de novas contas fica liberado;
- contas prontas: **1/1** e **2/2**;
- as duas contas recebem role `admin`, 1.000 Tibia Coins e acesso ao módulo Admin;
- saves, sessões, market e parties usam `server/data/` quando MySQL não estiver configurado;
- `/api/health` informa se o test server está ativo.

Em ambientes Arena/E2B, compartilhe a URL HTTPS da Live Preview da porta 3333.
O servidor é temporário: para hospedagem permanente será necessário publicar
a aplicação e usar um banco/disco persistente.

## Como rodar com MySQL (na sua máquina)

1. **Instale o MySQL** e crie o banco:

   ```bash
   mysql -u root -p < database.sql
   ```

   Isso cria o banco `global_idle` com as tabelas `accounts`, `sessions`
   e `characters`, e já insere a conta de **ADMINISTRADOR login=1 senha=1**.

2. **Configure a API**:

   ```bash
   cd tibia-idle/server
   cp .env.example .env
   # edite o .env: MYSQL_PASS com a senha do seu MySQL
   npm install
   ```

3. **Rode o seed** (garante o admin 1/1 com o hash correto):

   ```bash
   node seed.js
   ```

4. **Suba a API**:

   ```bash
   node server.js
   # -> [db] MySQL conectado em 127.0.0.1:3306/global_idle
   # -> [server] API de contas em http://0.0.0.0:3333
   ```

## Rotas

| Método | Rota | Corpo | Descrição |
| --- | --- | --- | --- |
| GET | `/api/health` | — | Saúde, protocolo SSE, cursor, conexões e worker |
| POST | `/api/register` | `{ login, password, email? }` | Cria uma conta |
| POST | `/api/login` | `{ login, password }` | Login → sessão com expiração |
| POST | `/api/logout` | `{ token }` | Revoga a sessão no servidor |
| GET | `/api/me` | header `Authorization: Bearer <token>` | Conta + personagens |
| POST | `/api/sync/ticket` | `{ token }` | Ticket temporário para SSE |
| GET | `/api/sync/events?ticket=&lastEventId=` | SSE | Eventos ordenados com replay |
| GET | `/api/sync/state` | Bearer token | Snapshot de versões para fallback |
| POST | `/api/lease/acquire` | `{ token, holder_id, lease_token? }` | Adquire/retoma controle exclusivo |
| POST | `/api/lease/renew` | `{ token, holder_id, lease_token }` | Heartbeat do holder atual |
| POST | `/api/lease/takeover` | `{ token, holder_id }` | Transferência explícita de controle |
| POST | `/api/lease/release` | `{ token, holder_id, lease_token }` | Libera no logout explícito |
| GET | `/api/instance` | Bearer token | Carrega a hunt/boss ativa da conta |
| PUT | `/api/instance` | `{ token, lease, expected_version, state }` | Cria/atualiza apenas snapshot visual/versionado |
| POST | `/api/instance/tick` | `{ token, lease, expected_version? }` | Executa combate/progressão autoritativos |
| POST | `/api/instance/end` | `{ token, lease, instance_id, expected_version, reason }` | Persiste condição terminal |
| POST | `/api/characters` | `{ token, name, voc, data }` | Cria personagem |
| GET | `/api/characters/:id` | Bearer token | Carrega um personagem pertencente à conta |
| PUT | `/api/characters/:id` | `{ token, holder_id, lease_token, expected_version, level, data, ... }` | Save otimista protegido pelo lease |
| PUT | `/api/characters/:id/repair` | `{ token, voc, data, maxHp, maxMp }` | Reparo administrativo explícito de identidade |
| POST | `/api/coins` | `{ token, amount }` | Admin adiciona/remove Tibia Coins |
| POST | `/api/market/offers` | `{ token, kind, slug?, tier?, qty, price, price_tc?, days?, seller_name }` | Cria oferta de venda (item ou TC) |
| GET | `/api/market/offers?kind=&tier=&slug=` | — | Lista ofertas ativas (P2P) |
| GET | `/api/market/mine` | Bearer token | Minhas ofertas |
| POST | `/api/market/buy` | `{ token, offer_id, buyer_name }` | Compra oferta (item ou TC) |
| DELETE | `/api/market/offers/:id` | `{ token }` | Cancela oferta (devolve item/TC) |
| POST | `/api/market/claim` | `{ token }` | (legado) nada pendente — vendas caem no banco |
| POST | `/api/market/deposit` | `{ token, amount, char_id, expected_version, holder_id, lease_token }` | Transfere gold do personagem ao banco atomicamente |
| POST | `/api/market/withdraw` | `{ token, amount, char_id, expected_version, holder_id, lease_token }` | Transfere gold do banco ao personagem atomicamente |
| GET | `/api/market/bank` | Bearer token | Saldo do banco do market |
| GET | `/api/market/history?limit=` | Bearer token | Histórico autoritativo de transações |
| GET | `/api/rankings?by=&limit=` | — | Ranking persistido por critério |
| GET | `/api/admin/snapshots?account_id=` | Bearer Admin | Histórico imutável/checksums |
| GET | `/api/admin/backup?account_id=` | Bearer Admin | Bundle sanitizado e verificável |
| POST | `/api/party/create` | `{ token, char_id }` | Cria a party (char vira líder) |
| POST | `/api/party/invite` | `{ token, char_id, invitee_name }` | Líder convida por nome (só em cidade/treino) |
| GET | `/api/party/inbox` | Bearer token | Convites PENDENTES de todos os chars da conta |
| POST | `/api/party/accept` | `{ token, invite_id }` | Aceita um convite pendente |
| POST | `/api/party/decline` | `{ token, invite_id }` | Recusa um convite |
| POST | `/api/party/leave` | `{ token, char_id }` | Sai da party (líder dissolve) |
| POST | `/api/party/kick` | `{ token, char_id, member_id }` | Líder remove um membro |
| POST | `/api/party/reorder` | `{ token, char_id, expected_version, character_ids[] }` | Reordena com optimistic concurrency |
| POST | `/api/party/save` | `{ token, holder_id, lease_token, party_id, party_version, party_order, characters[] }` | Save transacional protegido pelo lease |
| GET | `/api/party/state?char_id=` | Bearer token | Estado, proprietário, versão, ordem e follow pendente |
| POST | `/api/party/zone` | `{ token, char_id, zone, hunt?, instance?, otbm?, boss? }` | Líder reporta transição de mapa |
| POST | `/api/party/follow` | `{ token, char_id, nonce }` | Membro confirma o teleporte (consome nonce) |

**Snapshots, backup e hardening:**
- `snapshot_history` mantém snapshots imutáveis por entidade com SHA-256,
  motivo, versão, retenção de 500 entradas por conta e throttle de checkpoints
- Admin pode consultar o histórico e exportar bundle sem `password_hash`
- `tools/backup_restore.js` oferece `backup`, `verify` e `restore` para JSON,
  além de `backup-mysql`/`restore-mysql`. Restore exige `--apply` e confirmação
  exata do checksum; JSON cria um safety backup antes de trocar arquivos
- Sessões expiram (24h por padrão), novo login revoga a sessão anterior e
  `/api/logout` revoga imediatamente token e tickets SSE vinculados
- CORS aceita same-origin e allowlist explícita; headers CSP, nosniff,
  Referrer-Policy e Permissions-Policy são enviados em API e estáticos
- Login, cadastro, takeover e emissão de tickets possuem rate limit por IP;
  `TRUST_PROXY=1` só deve ser usado atrás de proxy confiável

```bash
node tibia-idle/tools/backup_restore.js backup --data-dir tibia-idle/server/data --out backup.json
node tibia-idle/tools/backup_restore.js verify --file backup.json
node tibia-idle/tools/backup_restore.js restore --file backup.json --data-dir tibia-idle/server/data --apply --confirm SHA256
# MySQL: backup-mysql / restore-mysql usam MYSQL_HOST, MYSQL_USER, MYSQL_PASS e MYSQL_DB
```

**Sincronização SSE e reconexão:**
- O navegador troca a sessão por um ticket temporário; o token da conta não é
  colocado na URL do `EventSource`
- Eventos `lease`, `instance`, `character`, `party` e `party-inbox` possuem ID
  monotônico. `Last-Event-ID`/`lastEventId` reproduz somente o que faltou
- Um histórico curto por conta mantém ordem no reconnect. Cursor expirado envia
  `snapshot-required`, e o cliente reconcilia `/api/me`, `/api/instance` e party
- Heartbeat SSE atravessa proxies; após erros repetidos o cliente renova ticket
  com backoff e mantém fallback de `/api/sync/state` a cada 5 segundos
- Takeover chega imediatamente a outras abas/dispositivos; versões de instância
  e personagens disparam refresh coalescido, sem aplicar snapshot de outro char
- Saves de outfit/cores/addons e mudanças de zona notificam em tempo real todas
  as contas presentes na party; polling fica apenas como fallback de recuperação
- `/api/health` expõe cursor e quantidade de conexões para observabilidade

**Lease exclusivo de simulação:**
- `account_leases` concede a somente um documento o direito de simular e
  persistir a conta; saves sem o segredo vigente recebem HTTP 423
- O segredo bruto é devolvido apenas ao holder e só seu SHA-256 fica no banco
- Heartbeat a cada 5 segundos renova o lease de 2 minutos; BroadcastChannel
  pausa imediatamente outra aba local. Timers continuam ativos em abas
  ocultas; se o SO congelar a página, o cliente readquire antes do catch-up
- Reload rotaciona o `holder_id`, impedindo que uma aba clonada use a cópia do
  mesmo `sessionStorage`. Takeover por outro dispositivo exige ação explícita
- Fechar a página não libera o lease nem encerra a instância. Logout explícito
  libera imediatamente; expiração permite retomada segura

**Instâncias persistentes:**
- `account_instances` guarda uma hunt ou boss ativo por conta, incluindo
  membros, HP/MP, mobs, waves, cooldowns e mecânicas específicas do encontro
- O snapshot possui `instance_id` e versão otimista. Saves obsoletos recebem
  HTTP 409; lease, party e composição são revalidados dentro da transação
- Ao entrar por outro dispositivo, `/api/instance` substitui qualquer cópia
  local. `localStorage` permanece apenas como espelho e migração legada
- Wipe sem bless, retorno à cidade, boss derrotado e demais condições finais
  persistem um tombstone `ended`, impedindo a reabertura de snapshot local velho
- Fechar o navegador não encerra a linha ativa. O próximo holder retoma a mesma
  instância e processa o intervalo desde `saved_at`

**Combate e progressão autoritativos:**
- `authoritative_engine.js` é o único núcleo online que decide dano, cura,
  consumo de supplies, XP, level, kills, loot, gold, morte, bless e cooldowns
- O navegador envia somente heartbeat/tick e renderiza snapshots. Seus valores
  locais de level, XP, skills, gold, HP ou mobs não substituem a autoridade
- Criação de personagem normaliza progressão e starter kit no servidor. Saves
  comuns preservam campos protegidos; ferramentas Admin continuam explícitas
- Monstros, HP, dano, armor, XP e loot vêm dos JSONs oficiais do servidor. RNG
  xorshift persistido por instância torna worker e ticks online reproduzíveis
- Ticks usam cursor server-side: spam de requests não gera ações/recompensas
  extras. Instância e personagens são atualizados na mesma transação
- Morte normal consome bless sem XP; wipe compra a bless e retorna se houver
  gold. No PVP, monstros retiram 3% e raid de jogador 8%
- Boss cooldown começa no relógio do servidor e a morte atualiza kills/reward.
  Goshnar's Greed mantém imunidade, adds prioritários, 30% de Greedbeast,
  janela vulnerável de 40s e dano do boss reduzido em 30% na fase imune

**Worker idle sem navegador:**
- `instance_worker.js` varre instâncias ativas e só reivindica tempo quando o
  lease da conta expirou ou foi liberado; aba oculta com lease nunca duplica
  processamento com o worker
- Cada claim bloqueia lease e instância na mesma ordem transacional, avança no
  máximo 1 hora e move `worker_cursor_at`. Múltiplos processos não consomem o
  mesmo intervalo
- Snapshots autoritativos são combatidos e materializados no próprio worker;
  apenas snapshots legados usam `workerElapsedMs` para migração no cliente
- Cursor, estado, total auditável e versão sobrevivem a restart. Tombstones
  `ended` nunca entram na fila
- O mesmo claim agora chama o núcleo autoritativo: fechar o navegador continua
  combate, recompensas, morte e progressão sem depender de código do cliente

**Integridade dos saves online:**
- Cada personagem possui `save_version`; o cliente deve enviar a versão que
  carregou. Uma versão obsoleta recebe HTTP 409 e nunca sobrescreve o servidor
- Saves da party travam a linha da party e todos os personagens no MySQL;
  qualquer conflito faz rollback completo, sem salvar apenas parte do grupo
- A composição possui `roster_version`, incrementada em add/remove/reorder.
  Saves e reorders feitos sobre uma composição antiga são recusados
- O cliente serializa autosaves da mesma aba e, ao detectar conflito externo,
  bloqueia novas gravações até recarregar o estado autoritativo

**Regras do Party (multiplayer, convites assíncronos + follow):**
- Cada party possui `owner_account_id`: uma conta só pode possuir uma party,
  mesmo que tente criá-la simultaneamente com personagens diferentes
- A ordem é persistida em `party_members.position`; somente a conta dona
  pode reordenar e a posição zero permanece reservada ao líder
- O LÍDER só pode CONVIDAR estando em Safe Zone (cidade) ou Área de Treino
  (academia / sala de exercise weapons) — validado no servidor
- CONVIDADO também só ACEITA em cidade/treino: a zona de cada personagem é
  gravada pelo reporte de zona (qualquer membro reporta a própria)
- Convites ficam PENDENTES no servidor (inbox): o jogador pode trocar de
  personagem da conta, abrir o menu de Party e aceitar de lá
- MEMBROS de party NÃO podem entrar em hunt/boss (só o líder escolhe e leva
  a party junto via FOLLOW) — bloqueado no cliente + servidor
- FOLLOW: quando o líder muda de mapa, os membros vão juntos. Se ele entra
  numa hunt (instância non-pvp/pvp) ou sala de boss, os membros recebem um
  NONCE de uso único com o destino e são teleportados para a MESMA instância
- BOSS: antes de gerar o follow, o servidor valida os REQUISITOS de TODOS
  os membros (cooldown de 16h + missão, ex.: Timira 25/25/25) — se alguém
  não puder, o boss não inicia
- O state da party inclui hp/mp/maxHp/maxMp/zona por membro (snapshots
  enviados no save do personagem) — usado pelo painel de party estilo OTC
- Segurança: nonce consumido atomicamente (sem replay), conta errada não
  aceita convite, membro não reporta zona, 1 party por conta proprietária e
  1 party por personagem participante

**Regras do Market (guia oficial do Tibia 4.3.3):**
- Respostas devolvem `coinBalance` e `bank` autoritativos; o cliente nunca
  soma/subtrai TC ou saldo por conta própria
- Depósito/saque move gold do personagem e banco na mesma transação, usando
  lease + `save_version`; Market fica bloqueado durante instância ativa
- Compra/cancelamento da mesma oferta são serializados para impedir consumo
  duplo por requests concorrentes
- Fee de 2% ao criar oferta (mín 20 gp, máx 1.000.000), pago do banco
- Ofertas duram 30 dias (fixo); item volta ao depot, dinheiro volta ao banco
- Vendedor usa itens do DEPOT; comprado vai para o DEPOT/inbox
- Buy offers (oferta de compra) e sell offers (oferta de venda)
- MATCH AUTOMATICO: criar oferta casa com contra-oferta compatível na hora
- Oferta anônima (opcional) e aviso 25% acima/abaixo da média
- Preço médio por item (market_stats) alimentado a cada venda

## Sem MySQL (desenvolvimento)

Se `MYSQL_HOST` estiver vazio no `.env`, a API usa um **storage JSON local**
em `tibia-idle/server/data/` (accounts.json + characters.json) com a mesma
API — dá para desenvolver/testar sem instalar banco. O `seed.js` também
funciona nesse modo.

## Contas administrativas de teste

| Login | Senha | Role | Tibia Coins |
| --- | --- | --- | --- |
| `1` | `1` | admin | 1.000 |
| `2` | `2` | admin | 1.000 |

Essas credenciais são deliberadamente fracas e só devem existir no test server.

Para trocar a senha:

```bash
node -e "console.log(require('bcryptjs').hashSync('novaSenha',10))"
# copie o hash e atualize no banco:
mysql -u root -p global_idle -e "UPDATE accounts SET password_hash='<hash>' WHERE login='1'"
```
