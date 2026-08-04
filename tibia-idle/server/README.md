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
| POST | `/api/market/claim` | `{ token }` | Coleta gold de vendas pendente |

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
