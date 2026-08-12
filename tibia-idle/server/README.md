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
| POST | `/api/register` | `{ login, password, email? }` | Cria uma conta |
| POST | `/api/login` | `{ login, password }` | Login → `{ token, account, characters }` |
| GET | `/api/me` | header `Authorization: Bearer <token>` | Conta + personagens |
| POST | `/api/lease/acquire` | `{ token, holder_id, lease_token? }` | Adquire/retoma controle exclusivo |
| POST | `/api/lease/renew` | `{ token, holder_id, lease_token }` | Heartbeat do holder atual |
| POST | `/api/lease/takeover` | `{ token, holder_id }` | Transferência explícita de controle |
| POST | `/api/lease/release` | `{ token, holder_id, lease_token }` | Libera no logout explícito |
| POST | `/api/characters` | `{ token, name, voc, data }` | Cria personagem |
| PUT | `/api/characters/:id` | `{ token, holder_id, lease_token, expected_version, level, data, ... }` | Save otimista protegido pelo lease |
| POST | `/api/coins` | `{ token, amount }` | Admin adiciona/remove Tibia Coins |
| POST | `/api/market/offers` | `{ token, kind, slug?, tier?, qty, price, price_tc?, days?, seller_name }` | Cria oferta de venda (item ou TC) |
| GET | `/api/market/offers?kind=&tier=&slug=` | — | Lista ofertas ativas (P2P) |
| GET | `/api/market/mine` | Bearer token | Minhas ofertas |
| POST | `/api/market/buy` | `{ token, offer_id, buyer_name }` | Compra oferta (item ou TC) |
| DELETE | `/api/market/offers/:id` | `{ token }` | Cancela oferta (devolve item/TC) |
| POST | `/api/market/claim` | `{ token }` | (legado) nada pendente — vendas caem no banco |
| POST | `/api/market/deposit` | `{ token, amount }` | Deposita gold no banco do market |
| POST | `/api/market/withdraw` | `{ token, amount }` | Saca gold do banco do market |
| GET | `/api/market/bank` | Bearer token | Saldo do banco do market |
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
