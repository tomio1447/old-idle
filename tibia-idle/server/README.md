# Global-Idle — API de Contas (MySQL)

Servidor de contas/personagens do Global-Idle para o jogo **online**.
Guarda contas (login/senha bcrypt, Tibia Coins, role) e personagens
(save completo em JSON) num banco MySQL.

## Como rodar (na sua máquina)

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
| POST | `/api/characters` | `{ token, name, voc, data }` | Cria personagem |
| PUT | `/api/characters/:id` | `{ token, voc, level, data }` | Salva personagem |
| POST | `/api/coins` | `{ token, amount }` | Adiciona/remove Tibia Coins |
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
| GET | `/api/party/state?char_id=` | Bearer token | Estado da party + follow pendente |
| POST | `/api/party/zone` | `{ token, char_id, zone, hunt?, instance?, otbm?, boss? }` | Líder reporta transição de mapa |
| POST | `/api/party/follow` | `{ token, char_id, nonce }` | Membro confirma o teleporte (consome nonce) |

**Regras do Party (multiplayer, convites assíncronos + follow):**
- O LÍDER só pode CONVIDAR estando em Safe Zone (cidade) ou Área de Treino
  (academia / sala de exercise weapons) — validado no servidor
- Convites ficam PENDENTES no servidor (inbox): o jogador pode trocar de
  personagem da conta, abrir o menu de Party e aceitar de lá
- FOLLOW: quando o líder muda de mapa, os membros vão juntos. Se ele entra
  numa hunt (instância non-pvp/pvp) ou sala de boss, os membros recebem um
  NONCE de uso único com o destino e são teleportados para a MESMA instância
- Segurança: nonce consumido atomicamente (sem replay), conta errada não
  aceita convite, membro não reporta zona, 1 party por personagem

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

## Conta de administrador

- **login:** `1`
- **senha:** `1`
- **role:** `admin`
- **Tibia Coins:** 1.000 (na criação)

Para trocar a senha:

```bash
node -e "console.log(require('bcryptjs').hashSync('novaSenha',10))"
# copie o hash e atualize no banco:
mysql -u root -p global_idle -e "UPDATE accounts SET password_hash='<hash>' WHERE login='1'"
```
