-- ============================================================
-- GLOBAL-IDLE — Banco de Dados MySQL (contas + personagens)
-- ============================================================
-- Execute como root:
--   mysql -u root -p < database.sql
--
-- Depois ajuste o tibia-idle/server/.env com o usuário/senha.
-- ============================================================

CREATE DATABASE IF NOT EXISTS global_idle
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE global_idle;

-- ------------------------------------------------------------
-- Contas (login/senha). A senha é guardada com bcrypt.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS accounts (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  login         VARCHAR(32)  NOT NULL UNIQUE,
  password_hash VARCHAR(128) NOT NULL,
  email         VARCHAR(128) DEFAULT NULL,
  role          ENUM('user','admin') NOT NULL DEFAULT 'user',
  coins         INT UNSIGNED NOT NULL DEFAULT 0,   -- Tibia Coins da conta
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
                   ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- Sessões (token HMAC/aleatório por login)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sessions (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  account_id INT UNSIGNED NOT NULL,
  token      CHAR(64) NOT NULL UNIQUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NULL,
  CONSTRAINT fk_sessions_account
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  INDEX idx_sessions_token (token)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- Lease exclusivo de simulação: somente um browser/dispositivo por conta.
-- O segredo bruto nunca é persistido; apenas SHA-256.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS account_leases (
  account_id   INT UNSIGNED PRIMARY KEY,
  holder_id    VARCHAR(80) NOT NULL,
  secret_hash  CHAR(64) NOT NULL,
  acquired_at  DATETIME(3) NOT NULL,
  renewed_at   DATETIME(3) NOT NULL,
  expires_at   DATETIME(3) NOT NULL,
  CONSTRAINT fk_account_leases_account
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  INDEX idx_account_leases_expiry (expires_at)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- Instância ativa persistida por conta. O worker server-side da fase seguinte
-- poderá avançar este mesmo snapshot quando não houver browser conectado.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS account_instances (
  account_id         INT UNSIGNED PRIMARY KEY,
  instance_id        CHAR(64) NOT NULL,
  version            BIGINT UNSIGNED NOT NULL DEFAULT 1,
  status             ENUM('active','ended') NOT NULL DEFAULT 'active',
  kind               ENUM('hunt','boss') NOT NULL,
  hunt_id            VARCHAR(64) DEFAULT NULL,
  boss_id            VARCHAR(64) DEFAULT NULL,
  instance_mode      VARCHAR(24) NOT NULL DEFAULT 'non-pvp',
  party_id           INT UNSIGNED DEFAULT NULL,
  party_version      BIGINT UNSIGNED DEFAULT NULL,
  active_character_id INT UNSIGNED NOT NULL,
  state              MEDIUMTEXT NOT NULL,
  saved_at           DATETIME(3) NOT NULL,
  started_at         DATETIME(3) NOT NULL,
  worker_cursor_at   DATETIME(3) DEFAULT NULL, -- último intervalo reivindicado
  worker_total_ms    BIGINT UNSIGNED NOT NULL DEFAULT 0, -- auditoria acumulada
  ended_at           DATETIME(3) DEFAULT NULL,
  terminal_reason    VARCHAR(40) DEFAULT NULL,
  created_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_instances_account
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  INDEX idx_instances_status (status, saved_at)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- Histórico imutável de snapshots (retenção aplicada pelo servidor).
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS snapshot_history (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  account_id INT UNSIGNED NOT NULL,
  entity_type VARCHAR(24) NOT NULL,
  entity_id VARCHAR(64) NOT NULL,
  version BIGINT UNSIGNED NOT NULL DEFAULT 0,
  reason VARCHAR(40) NOT NULL,
  checksum CHAR(64) NOT NULL,
  data MEDIUMTEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_snapshot_account (account_id, id),
  INDEX idx_snapshot_entity (account_id, entity_type, entity_id, created_at),
  CONSTRAINT fk_snapshot_account FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- Personagens. O campo `data` guarda o SAVE COMPLETO do jogo
-- (JSON: bag, equip, skills, stats, missions, lootPouch, ...),
-- exatamente o que o cliente tinha no localStorage.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS characters (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  account_id INT UNSIGNED NOT NULL,
  name       VARCHAR(32)  NOT NULL,
  voc        VARCHAR(24)  NOT NULL DEFAULT 'none',
  level      INT UNSIGNED NOT NULL DEFAULT 1,
  data       MEDIUMTEXT   NOT NULL,          -- save completo do personagem
  save_version BIGINT UNSIGNED NOT NULL DEFAULT 0, -- optimistic concurrency
  zone       VARCHAR(16)  NOT NULL DEFAULT 'unknown',  -- cidade/treino/hunt/boss (party)
  hp         INT UNSIGNED NOT NULL DEFAULT 0,          -- snapshot de vida (party)
  mp         INT UNSIGNED NOT NULL DEFAULT 0,          -- snapshot de mana (party)
  max_hp     INT UNSIGNED NOT NULL DEFAULT 0,          -- vida máxima (party)
  max_mp     INT UNSIGNED NOT NULL DEFAULT 0,          -- mana máxima (party)
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
                ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_characters_account
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  UNIQUE KEY uq_characters_name (name),
  INDEX idx_characters_account (account_id)
) ENGINE=InnoDB;

-- migração de instalações antigas (colunas novas)
ALTER TABLE characters
  ADD COLUMN save_version BIGINT UNSIGNED NOT NULL DEFAULT 1,
  ADD COLUMN zone VARCHAR(16) NOT NULL DEFAULT 'unknown',
  ADD COLUMN hp INT UNSIGNED NOT NULL DEFAULT 0,
  ADD COLUMN mp INT UNSIGNED NOT NULL DEFAULT 0,
  ADD COLUMN max_hp INT UNSIGNED NOT NULL DEFAULT 0,
  ADD COLUMN max_mp INT UNSIGNED NOT NULL DEFAULT 0;

-- ------------------------------------------------------------
-- Conta de ADMINISTRADOR: login = 1, senha = 1
-- O hash abaixo é o bcrypt de "1" (gerado com bcryptjs, rounds 10).
-- Se preferir gerar de novo:
--   node -e "console.log(require('bcryptjs').hashSync('1',10))"
-- ------------------------------------------------------------
INSERT INTO accounts (login, password_hash, role, coins)
VALUES ('1', '$2b$10$rdAcBfHepRIsc06mihQG9e2BG/wjhdXkKJt66jKikKgCY4E.JiKa2', 'admin', 1000)
ON DUPLICATE KEY UPDATE role = 'admin';

-- ------------------------------------------------------------
-- MARKET (player-to-player)
-- Ofertas de venda entre jogadores. O vendedor coloca um item
-- (ou Tibia Coins) com preço; o comprador paga e recebe na hora.
-- Duração padrão: 7 dias (expira e devolve ao vendedor).
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS market_offers (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  seller_id   INT UNSIGNED NOT NULL,
  seller_name VARCHAR(32)  NOT NULL,           -- personagem que vende
  kind        ENUM('item','coins','buy') NOT NULL DEFAULT 'item',
  slug        VARCHAR(64)  DEFAULT NULL,       -- item vendido (kind=item)
  tier        INT UNSIGNED NOT NULL DEFAULT 0, -- tier da forja do item
  data        MEDIUMTEXT   DEFAULT NULL,       -- extras (imbuements etc.)
  qty         INT UNSIGNED NOT NULL DEFAULT 1,
  price       INT UNSIGNED NOT NULL,           -- preço total (gold ou TC)
  price_tc    TINYINT(1)   NOT NULL DEFAULT 0, -- 1 = preço em Tibia Coins
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at  TIMESTAMP NULL,                  -- fim da oferta (7 dias)
  status      ENUM('active','sold','cancelled','expired')
              NOT NULL DEFAULT 'active',
  buyer_id    INT UNSIGNED DEFAULT NULL,
  bought_at   TIMESTAMP NULL,
  INDEX idx_market_active (status, kind, tier),
  INDEX idx_market_seller (seller_id, status)
) ENGINE=InnoDB;

-- Saldo do market pendente de coleta (gold de vendas de outro jogador
-- comprou enquanto o vendedor estava offline). TC vai direto em accounts.coins.
ALTER TABLE accounts ADD COLUMN market_gold INT UNSIGNED NOT NULL DEFAULT 0;

-- ------------------------------------------------------------
-- MARKET STATS (preco medio por item — atualizado a cada venda)
-- Usado pelo aviso de oferta injusta (25% acima/abaixo da media)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS market_stats (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  slug       VARCHAR(64)  NOT NULL,
  tier       INT UNSIGNED NOT NULL DEFAULT 0,
  count      INT UNSIGNED NOT NULL DEFAULT 0,    -- vendas registradas
  total      BIGINT UNSIGNED NOT NULL DEFAULT 0, -- soma dos precos
  last_price INT UNSIGNED NOT NULL DEFAULT 0,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
                ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_stats_item (slug, tier)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- MARKET HISTORY (histórico de transações — os últimos 600 trades)
-- Registrado a cada venda/compra concluída. Alimenta a aba Histórico
-- do Market (guia 4.3.3) e o ranking de negociadores.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS market_history (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  seller_id   INT UNSIGNED NOT NULL,
  seller_name VARCHAR(32)  NOT NULL,
  buyer_id    INT UNSIGNED DEFAULT NULL,
  buyer_name  VARCHAR(32)  DEFAULT NULL,
  kind        ENUM('item','coins','buy') NOT NULL DEFAULT 'item',
  slug        VARCHAR(64)  DEFAULT NULL,
  tier        INT UNSIGNED NOT NULL DEFAULT 0,
  qty         INT UNSIGNED NOT NULL DEFAULT 1,
  price       INT UNSIGNED NOT NULL,
  price_tc    TINYINT(1)   NOT NULL DEFAULT 0,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_history_created (created_at),
  INDEX idx_history_item (slug, created_at)
) ENGINE=InnoDB;

-- ============================================================
-- PARTY (multiplayer, convites assíncronos + follow)
-- ============================================================
-- Uma party pertence a UMA CONTA, tem um LÍDER (um personagem dessa conta)
-- e até 4 membros convidados. `owner_account_id` impede a mesma conta de
-- criar rosters concorrentes; `party_members.position` persiste a ordem.
-- O líder só pode CONVIDAR estando em Safe Zone (cidade) ou Área de
-- Treino (academia / sala de exercise weapons) — validado em
-- parties.leader_zone.
--
-- Follow: quando o líder muda de mapa (hunt/boss), o servidor gera um
-- NONCE por membro (party_members.follow_*) — token de uso único que o
-- cliente do membro consome ao confirmar o teleporte. Isso impede
-- teleporte indevido (o membro só vai onde o líder realmente foi, e só
-- uma vez por transição) e replay (o nonce é consumido na confirmação).
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS parties (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  owner_account_id INT UNSIGNED NOT NULL,          -- conta proprietária
  roster_version BIGINT UNSIGNED NOT NULL DEFAULT 1,
  leader_id      INT UNSIGNED NOT NULL,           -- personagem líder
  leader_name    VARCHAR(32)  NOT NULL,
  -- zona atual do líder (validada nas transições de mapa):
  leader_zone    ENUM('unknown','city','training','hunt','boss')
                 NOT NULL DEFAULT 'unknown',
  leader_hunt    VARCHAR(64)  DEFAULT NULL,       -- hunt onde o líder está
  leader_instance VARCHAR(24) DEFAULT NULL,       -- instância (non-pvp/pvp)
  leader_otbm    VARCHAR(64)  DEFAULT NULL,       -- mapa .otbm da hunt
  leader_boss    VARCHAR(64)  DEFAULT NULL,       -- boss onde o líder está
  created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
                   ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_parties_owner (owner_account_id), -- 1 party por conta
  UNIQUE KEY uq_parties_leader (leader_id),
  INDEX idx_parties_zone (leader_zone),
  CONSTRAINT fk_parties_owner
    FOREIGN KEY (owner_account_id) REFERENCES accounts(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS party_members (
  party_id      INT UNSIGNED NOT NULL,
  character_id  INT UNSIGNED NOT NULL,
  position      TINYINT UNSIGNED NOT NULL DEFAULT 1,
  joined_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- follow pendente PARA ESTE MEMBRO (nonce de uso único). Quando o líder
  -- entra em hunt/boss, o servidor preenche aqui o destino + nonce; o
  -- membro (online agora ou quando logar) consome com POST /api/party/follow.
  follow_nonce   VARCHAR(64) DEFAULT NULL,
  follow_hunt    VARCHAR(64) DEFAULT NULL,
  follow_instance VARCHAR(24) DEFAULT NULL,
  follow_otbm    VARCHAR(64) DEFAULT NULL,
  follow_boss    VARCHAR(64) DEFAULT NULL,
  follow_at      TIMESTAMP NULL,
  PRIMARY KEY (party_id, character_id),
  UNIQUE KEY uq_member_character (character_id),  -- 1 party por personagem
  INDEX idx_members_party (party_id),
  INDEX idx_members_order (party_id, position)
) ENGINE=InnoDB;

-- Convites PENDENTES (inbox assíncrono): o convidado pode trocar para o
-- personagem, abrir a interface de Party e aceitar de lá. Um personagem
-- só pode ter 1 convite pendente por vez (UNIQUE invitee_id+status).
CREATE TABLE IF NOT EXISTS party_invites (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  party_id   INT UNSIGNED NOT NULL,
  leader_id  INT UNSIGNED NOT NULL,               -- personagem que convidou
  invitee_id INT UNSIGNED NOT NULL,               -- personagem convidado
  status     ENUM('pending','accepted','declined','expired','cancelled')
             NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NULL,                      -- validade do convite
  UNIQUE KEY uq_invite_pending (invitee_id, status),
  INDEX idx_invites_party (party_id, status)
) ENGINE=InnoDB;
