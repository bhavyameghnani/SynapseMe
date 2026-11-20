-- MySQL-compatible schema (same DDL runs on SingleStore and SQLite).
DROP TABLE IF EXISTS positions;
DROP TABLE IF EXISTS prices;
DROP TABLE IF EXISTS tax_lots;

CREATE TABLE positions (
  account VARCHAR(32) NOT NULL,
  bank_id VARCHAR(16) NOT NULL,
  asset VARCHAR(32) NOT NULL,
  symbol VARCHAR(16) NOT NULL,
  quantity DOUBLE NOT NULL,
  value_usd BIGINT NOT NULL
);

CREATE TABLE prices (
  symbol VARCHAR(16) NOT NULL PRIMARY KEY,
  price_usd DOUBLE NOT NULL,
  as_of VARCHAR(32) NOT NULL
);

CREATE TABLE tax_lots (
  lot_id VARCHAR(16) NOT NULL PRIMARY KEY,
  symbol VARCHAR(16) NOT NULL,
  acquired VARCHAR(10) NOT NULL,
  quantity DOUBLE NOT NULL,
  cost_basis_usd BIGINT NOT NULL
);
