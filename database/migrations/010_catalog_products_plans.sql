-- Module A: product catalogue (products + variants) and recurring plans.

CREATE TABLE products (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL CHECK (length(trim(name)) > 0),
  type        TEXT NOT NULL CHECK (type IN ('software', 'service', 'addon', 'goods')),
  sales_price NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (sales_price >= 0),
  cost_price  NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (cost_price >= 0),
  notes       TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_products_name ON products (lower(name));
CREATE INDEX idx_products_is_active ON products (is_active);

-- A variant is one attribute value of a product, e.g. attribute "Brand", value "Odoo", extra_price 560.
-- Final unit price = products.sales_price + product_variants.extra_price
CREATE TABLE product_variants (
  id          SERIAL PRIMARY KEY,
  product_id  INTEGER NOT NULL REFERENCES products (id) ON DELETE CASCADE,
  attribute   TEXT NOT NULL CHECK (length(trim(attribute)) > 0),
  value       TEXT NOT NULL CHECK (length(trim(value)) > 0),
  extra_price NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (extra_price >= 0),
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_product_variants_value ON product_variants (product_id, lower(attribute), lower(value));

CREATE TABLE plans (
  id                   SERIAL PRIMARY KEY,
  name                 TEXT NOT NULL CHECK (length(trim(name)) > 0),
  description          TEXT,
  billing_interval     TEXT NOT NULL CHECK (billing_interval IN ('daily', 'weekly', 'monthly', 'yearly')),
  price                NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (price >= 0),
  min_quantity         INTEGER NOT NULL DEFAULT 1 CHECK (min_quantity > 0),
  start_date           DATE,
  end_date             DATE,
  auto_close_on_expiry BOOLEAN NOT NULL DEFAULT FALSE,
  can_close_early      BOOLEAN NOT NULL DEFAULT TRUE,
  can_pause            BOOLEAN NOT NULL DEFAULT TRUE,
  can_renew            BOOLEAN NOT NULL DEFAULT TRUE,
  is_active            BOOLEAN NOT NULL DEFAULT TRUE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (start_date IS NULL OR end_date IS NULL OR end_date >= start_date)
);
CREATE UNIQUE INDEX uq_plans_name ON plans (lower(name));
CREATE INDEX idx_plans_is_active ON plans (is_active);
