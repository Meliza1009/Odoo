-- Module A: reusable quotation templates (plan + product lines + validity).

CREATE TABLE quotation_templates (
  id                 SERIAL PRIMARY KEY,
  name               TEXT NOT NULL CHECK (length(trim(name)) > 0),
  plan_id            INTEGER NOT NULL REFERENCES plans (id),
  validity_days      INTEGER NOT NULL DEFAULT 30 CHECK (validity_days BETWEEN 1 AND 365),
  payment_terms_days INTEGER NOT NULL DEFAULT 30 CHECK (payment_terms_days BETWEEN 0 AND 365),
  -- Number of billing periods the contract runs for (NULL = open-ended). Used to set the expiry date.
  contract_periods   INTEGER CHECK (contract_periods IS NULL OR contract_periods > 0),
  notes              TEXT,
  is_active          BOOLEAN NOT NULL DEFAULT TRUE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_quotation_templates_name ON quotation_templates (lower(name));

CREATE TABLE quotation_template_lines (
  id          SERIAL PRIMARY KEY,
  template_id INTEGER NOT NULL REFERENCES quotation_templates (id) ON DELETE CASCADE,
  product_id  INTEGER NOT NULL REFERENCES products (id),
  variant_id  INTEGER REFERENCES product_variants (id),
  quantity    INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  -- NULL = use the product (+ variant) price at the time the quotation is created
  unit_price  NUMERIC(12,2) CHECK (unit_price IS NULL OR unit_price >= 0),
  tax_rate    NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (tax_rate >= 0 AND tax_rate <= 100),
  sort_order  INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_quotation_template_lines_template ON quotation_template_lines (template_id);
