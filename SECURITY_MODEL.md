# Global-Idle — threat model (tomio1447/old-idle @ 365c3f73)

Status: draft built from the code; facts from the owner are marked **[owner]**. Everything else is inferred and should be confirmed.

## System overview
Global-Idle is an online idle game based on Tibia. One Node.js process (`tibia-idle/server/server.js`, started by `tibia-idle/server.js` / `Procfile` / PM2 `ecosystem.config.js`) serves:
- the static browser client (`tibia-idle/game/`, `tibia-idle/imagens/`) via `serveStatic` (path-confined to `STATIC_DIR` / `STATIC_IMAGES_DIR`);
- a JSON API under `/api/*` (accounts, characters, saves, leases, authoritative combat instances, store, chat, party, guild, PvP, quests, world bosses, admin);
- Server-Sent Events streams (`/api/sync/events`, `/api/chat/events`) authorized by short-lived tickets.

Storage is MySQL (`db.js`, `database.sql`) or, without MySQL, a local JSON store under `server/data/`. Payments go through Mercado Pago (`store.js`, `MP_ACCESS_TOKEN`), e-mail through SMTP (`mailer.js`). Deployment targets SaveInCloud/Jelastic and Cloudflare tunnels (`start-cf-tunnel.vbs`, `start-cloudflared-quick.bat`). No infrastructure-as-code repository exists; deployment configuration is the env vars read by the server.

## Components
| Component | Code | Notes |
| --- | --- | --- |
| API Server | `tibia-idle/server/server.js`, `sync_bus.js`, `chat.js`, `mailer.js` | HTTP routing, auth, sessions, rate limiting, CORS, static files, SSE, chat |
| Game Engine | `tibia-idle/server/authoritative_engine.js`, `instance_worker.js`, `party.js`, `guild.js`, `pvp.js`, `quest_controller.js`, `world_boss.js`, `*_lobby.js`, `forge.js`, `shared_inventory.js`, `annihilator.js`, `wardrobe.js`, `dailyboost.js` | Server-authoritative combat, inventory, economy |
| Store & Payments | `tibia-idle/server/store.js`, `yana_catalog.js` | Tibia Coins, VIP, Mercado Pago checkout + webhook, vouchers |
| Data Layer | `tibia-idle/server/db.js`, `database.sql`, `seed.js` | MySQL / JSON store, accounts, sessions, characters |
| Web Client | `tibia-idle/game/` (`js/`, `index.html`) | Browser game, also loaded server-side for game data (`require("../game/js/...")`, `vm.runInContext(tileflags.js)`) |
| Tooling | `engine/`, `base/`, `canary-map-editor-v4.0-windows/`, `rme-scripts/`, `tools/`, `tibia-idle/tools/`, `tibia-idle/scripts/`, `_tmp_*/` | Offline map/asset tooling, the C++ map editor and stale temp copies; not deployed |
| Deploy Patch | `tibia-idle/dist-patch/` (`_staging/server/*`) | Pending server patch meant to be copied to the VM (`/opt/global-idle`); not running today |

## Trust boundaries and entry points
- **Internet → API Server**: every `/api/*` route; anonymous: `/api/health`, `/api/register`, `/api/login`, `/api/rankings`, `/api/online-count`, store catalog, `/api/store/mp/webhook`.
- **Authenticated player → API**: Bearer session token (`SESSION_TTL_MS`, default 24h) or `token` in body; character saves, leases, instances, store checkout, chat, party/guild/PvP/quest actions.
- **Admin → API**: `/api/admin/*`, `/api/coins`, VIP edits, `admin_grant` saves, maintenance/announce. Gated by `role==="admin"` or `MAINTENANCE_TOKEN`.
- **Mercado Pago → webhook**: unauthenticated callback; the server re-fetches the payment from Mercado Pago before crediting (`store.webhook`).
- **Browser origin → API**: CORS via `allowedOrigin` (`ALLOWED_ORIGINS`, `*` allowed by config).
- **Proxy → API**: `TRUST_PROXY=1` trusts `X-Forwarded-For` for rate limiting.

## Assets
- Player accounts: logins, bcrypt password hashes, e-mail addresses, session tokens.
- Tibia Coins / VIP and store orders (bought with real money via Mercado Pago), Mercado Pago access token, SMTP credentials, DB credentials (env).
- Admin role and `MAINTENANCE_TOKEN` (cross-account control, bans, backups, spectate).
- Character saves and the shared account inventory (game economy: items, gold, rewards).
- Server availability (single process, single worker, in-memory rate buckets).

## Attacker profiles
- Anonymous internet user hitting the public API.
- Authenticated player trying to cheat the economy, act on other accounts, or escalate to admin.
- Malicious site abusing a logged-in browser (CORS/CSRF, XSS via chat or names).
- Forged payment callbacks.

## Existing controls
- bcrypt password hashing (`SALT_ROUNDS=10`), server-side sessions with expiry and logout revocation.
- Admin checks via `accountCanSelfAdmin` / `role==="admin"`; cross-account bundles admin-only.
- Static file path confinement in `serveStatic`; `hardenedHeaders`.
- In-memory IP rate limiting (`rateLimit`), can be disabled by `RATE_LIMIT_DISABLED`.
- Versioned saves (`expected_version`), leases for exclusive character control, server-authoritative combat engine.
- Webhook credits only after re-fetching an `approved` payment from Mercado Pago.
- Chat text sanitizing (`sanitizeText`, `filterHardObscenity`).

## Known dangerous modes (inferred)
- `TEST_SERVER=1`: open registration, seeded `1/1` admin and `2/2` accounts, admin panel on own characters for every account, `simulatePay`, maintenance scheduling without a secret when `MAINTENANCE_TOKEN` is unset, e-mail codes returned to the client.
- `database.sql` / `seed.js` create an admin account `1`/`1`.
- The scan reports that the public-VM deploy scripts (`vm-bootstrap-db.sh`, `docs/vm-producao.md`) set `TEST_SERVER=1` without `MAINTENANCE_TOKEN`; not yet confirmed by the owner.

## Out of scope / accepted risk
- (none stated by the owner yet)

## Open questions
- Which assets matter most (accounts, real-money coins, admin, game economy, availability)?
- Does production ever run with `TEST_SERVER=1`, `ALLOWED_ORIGINS=*` or the seeded admin `1/1`?
- Is cheating on a player's own save/character in scope?
- Is the offline tooling (map editor, engine, tools) out of scope?
