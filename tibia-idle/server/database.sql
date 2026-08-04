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
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
                ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_characters_account
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  UNIQUE KEY uq_characters_name (name),
  INDEX idx_characters_account (account_id)
) ENGINE=InnoDB;

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
