-- Module B: admin-configurable tax rules and discount rules.

-- Optional region on customers so tax rules can target regions (e.g. state/country codes).
ALTER TABLE customers ADD COLUMN region TEXT;

-- Matching (see backend/src/modules/billing/calculate.ts):
--   applies_to 'product' > 'product_type' > 'all', and a rule with a region beats one without.
--   Within the most specific matching group the rates add up (e.g. CGST 9% + SGST 9%).
CREATE TABLE tax_rules (
  id           SERIAL PRIMARY KEY,
  name         TEXT NOT NULL CHECK (length(trim(name)) > 0),
  rate         NUMERIC(5,2) NOT NULL CHECK (rate >= 0 AND rate <= 100),
  applies_to   TEXT NOT NULL DEFAULT 'all' CHECK (applies_to IN ('all', 'product_type', 'product')),
  product_type TEXT CHECK (product_type IS NULL OR product_type IN ('software', 'service', 'addon', 'goods')),
  product_id   INTEGER REFERENCES products (id) ON DELETE CASCADE,
  region       TEXT,
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    (applies_to = 'all' AND product_type IS NULL AND product_id IS NULL) OR
    (applies_to = 'product_type' AND product_type IS NOT NULL AND product_id IS NULL) OR
    (applies_to = 'product' AND product_id IS NOT NULL AND product_type IS NULL)
  )
);
CREATE INDEX idx_tax_rules_active ON tax_rules (is_active);

CREATE TABLE discounts (
  id            SERIAL PRIMARY KEY,
  name          TEXT NOT NULL CHECK (length(trim(name)) > 0),
  discount_type TEXT NOT NULL CHECK (discount_type IN ('fixed_amount', 'percentage')),
  value         NUMERIC(12,2) NOT NULL CHECK (value > 0),
  min_purchase  NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (min_purchase >= 0),
  min_quantity  INTEGER NOT NULL DEFAULT 0 CHECK (min_quantity >= 0),
  start_date    DATE,
  end_date      DATE,
  usage_limit   INTEGER CHECK (usage_limit IS NULL OR usage_limit > 0),
  usage_count   INTEGER NOT NULL DEFAULT 0 CHECK (usage_count >= 0),
  scope         TEXT NOT NULL DEFAULT 'subscription' CHECK (scope IN ('subscription', 'product')),
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_by    INTEGER REFERENCES users (id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (discount_type <> 'percentage' OR value <= 100),
  CHECK (start_date IS NULL OR end_date IS NULL OR end_date >= start_date),
  CHECK (usage_limit IS NULL OR usage_count <= usage_limit)
);
CREATE INDEX idx_discounts_active ON discounts (is_active);

-- Products a product-scoped discount applies to.
CREATE TABLE discount_products (
  discount_id INTEGER NOT NULL REFERENCES discounts (id) ON DELETE CASCADE,
  product_id  INTEGER NOT NULL REFERENCES products (id) ON DELETE CASCADE,
  PRIMARY KEY (discount_id, product_id)
);

-- Optional restriction to specific subscriptions. No rows = any subscription.
CREATE TABLE discount_subscriptions (
  discount_id     INTEGER NOT NULL REFERENCES discounts (id) ON DELETE CASCADE,
  subscription_id INTEGER NOT NULL REFERENCES subscriptions (id) ON DELETE CASCADE,
  PRIMARY KEY (discount_id, subscription_id)
);
CREATE INDEX idx_discount_subscriptions_subscription ON discount_subscriptions (subscription_id);
