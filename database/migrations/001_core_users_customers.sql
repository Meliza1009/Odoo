-- Core identity tables: users, customers, password reset tokens and audit logs.
-- Migration numbering ranges (see docs/API_CONTRACT.md):
--   001-009 core/auth, 010-019 catalog, 020-029 subscriptions & discounts,
--   030-039 invoices & payments, 040-049 reports

CREATE TABLE users (
  id            SERIAL PRIMARY KEY,
  email         TEXT UNIQUE NOT NULL CHECK (email = lower(email) AND position('@' IN email) > 1),
  password_hash TEXT NOT NULL,
  full_name     TEXT NOT NULL CHECK (length(trim(full_name)) > 0),
  role          TEXT NOT NULL CHECK (role IN ('admin', 'staff', 'customer')),
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- users.email is indexed by its UNIQUE constraint
CREATE INDEX idx_users_role ON users (role);

CREATE TABLE customers (
  id              SERIAL PRIMARY KEY,
  user_id         INTEGER UNIQUE REFERENCES users (id) ON DELETE SET NULL,
  company_name    TEXT NOT NULL CHECK (length(trim(company_name)) > 0),
  contact_name    TEXT,
  email           TEXT CHECK (email IS NULL OR email = lower(email)),
  phone           TEXT,
  billing_address TEXT,
  tax_number      TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_customers_company_name ON customers (lower(company_name));
CREATE INDEX idx_customers_is_active ON customers (is_active);

CREATE TABLE password_reset_tokens (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_password_reset_tokens_user ON password_reset_tokens (user_id);

CREATE TABLE audit_logs (
  id            BIGSERIAL PRIMARY KEY,
  actor_user_id INTEGER REFERENCES users (id) ON DELETE SET NULL,
  action        TEXT NOT NULL,
  entity_type   TEXT NOT NULL,
  entity_id     TEXT,
  details       JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_logs_entity ON audit_logs (entity_type, entity_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs (created_at);
