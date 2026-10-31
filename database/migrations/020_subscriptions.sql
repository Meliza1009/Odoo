-- Module A: subscriptions (quotations are subscriptions in draft/quotation status) and their lines.

CREATE SEQUENCE subscription_number_seq START 1001;

CREATE TABLE subscriptions (
  id                    SERIAL PRIMARY KEY,
  subscription_number   TEXT UNIQUE NOT NULL
                        DEFAULT ('SUB-' || lpad(nextval('subscription_number_seq')::text, 5, '0')),
  customer_id           INTEGER NOT NULL REFERENCES customers (id),
  plan_id               INTEGER NOT NULL REFERENCES plans (id),
  template_id           INTEGER REFERENCES quotation_templates (id) ON DELETE SET NULL,
  status                TEXT NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft', 'quotation', 'confirmed', 'active', 'paused', 'cancelled', 'closed')),
  start_date            DATE NOT NULL,
  expiry_date           DATE,
  next_billing_date     DATE,
  payment_terms_days    INTEGER NOT NULL DEFAULT 30 CHECK (payment_terms_days BETWEEN 0 AND 365),
  quotation_valid_until DATE,
  subtotal              NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  tax_total             NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (tax_total >= 0),
  total                 NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (total >= 0),
  notes                 TEXT,
  confirmed_at          TIMESTAMPTZ,
  activated_at          TIMESTAMPTZ,
  paused_at             TIMESTAMPTZ,
  closed_at             TIMESTAMPTZ,
  close_reason          TEXT,
  created_by            INTEGER REFERENCES users (id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (expiry_date IS NULL OR expiry_date >= start_date)
);
CREATE INDEX idx_subscriptions_status ON subscriptions (status);
CREATE INDEX idx_subscriptions_next_billing_date ON subscriptions (next_billing_date);
CREATE INDEX idx_subscriptions_customer ON subscriptions (customer_id);
CREATE INDEX idx_subscriptions_plan ON subscriptions (plan_id);
CREATE INDEX idx_subscriptions_expiry_date ON subscriptions (expiry_date);

-- 'plan' lines carry the recurring plan fee (no product); 'product' lines are products/add-ons.
CREATE TABLE subscription_lines (
  id              SERIAL PRIMARY KEY,
  subscription_id INTEGER NOT NULL REFERENCES subscriptions (id) ON DELETE CASCADE,
  line_type       TEXT NOT NULL CHECK (line_type IN ('plan', 'product')),
  product_id      INTEGER REFERENCES products (id),
  variant_id      INTEGER REFERENCES product_variants (id),
  description     TEXT NOT NULL,
  quantity        INTEGER NOT NULL CHECK (quantity > 0),
  unit_price      NUMERIC(12,2) NOT NULL CHECK (unit_price >= 0),
  tax_rate        NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (tax_rate >= 0 AND tax_rate <= 100),
  subtotal        NUMERIC(12,2) NOT NULL CHECK (subtotal >= 0),
  tax_amount      NUMERIC(12,2) NOT NULL CHECK (tax_amount >= 0),
  total           NUMERIC(12,2) NOT NULL CHECK (total >= 0),
  sort_order      INTEGER NOT NULL DEFAULT 0,
  CHECK ((line_type = 'plan' AND product_id IS NULL) OR (line_type = 'product' AND product_id IS NOT NULL))
);
CREATE INDEX idx_subscription_lines_subscription ON subscription_lines (subscription_id);
