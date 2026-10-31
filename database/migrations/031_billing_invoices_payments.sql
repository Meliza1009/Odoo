-- Module B: billing runs, invoices, invoice lines, applied discounts and payments.

CREATE TABLE billing_runs (
  id                    SERIAL PRIMARY KEY,
  run_date              DATE NOT NULL,
  status                TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed')),
  subscriptions_checked INTEGER NOT NULL DEFAULT 0,
  invoices_created      INTEGER NOT NULL DEFAULT 0,
  periods_skipped       INTEGER NOT NULL DEFAULT 0,
  errors                JSONB NOT NULL DEFAULT '[]'::jsonb,
  triggered_by          INTEGER REFERENCES users (id) ON DELETE SET NULL,
  started_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at           TIMESTAMPTZ
);
CREATE INDEX idx_billing_runs_started_at ON billing_runs (started_at);

CREATE SEQUENCE invoice_number_seq START 1001;

CREATE TABLE invoices (
  id                   SERIAL PRIMARY KEY,
  invoice_number       TEXT UNIQUE NOT NULL DEFAULT ('INV-' || lpad(nextval('invoice_number_seq')::text, 6, '0')),
  subscription_id      INTEGER NOT NULL REFERENCES subscriptions (id),
  customer_id          INTEGER NOT NULL REFERENCES customers (id),
  billing_run_id       INTEGER REFERENCES billing_runs (id) ON DELETE SET NULL,
  status               TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'confirmed', 'paid', 'cancelled')),
  billing_period_start DATE NOT NULL,
  billing_period_end   DATE NOT NULL,
  invoice_date         DATE NOT NULL,
  due_date             DATE NOT NULL,
  customer_name        TEXT NOT NULL,
  customer_email       TEXT,
  billing_address      TEXT,
  tax_number           TEXT,
  subtotal             NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  discount_total       NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (discount_total >= 0),
  tax_total            NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (tax_total >= 0),
  grand_total          NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (grand_total >= 0),
  amount_paid          NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (amount_paid >= 0),
  amount_due           NUMERIC(12,2) GENERATED ALWAYS AS (grand_total - amount_paid) STORED,
  notes                TEXT,
  confirmed_at         TIMESTAMPTZ,
  sent_at              TIMESTAMPTZ,
  paid_at              TIMESTAMPTZ,
  cancelled_at         TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (billing_period_end >= billing_period_start),
  CHECK (due_date >= invoice_date),
  -- Overpayments are impossible at the database level.
  CHECK (amount_paid <= grand_total),
  -- The core billing guarantee: one invoice per subscription per billing period.
  CONSTRAINT uq_invoices_subscription_period UNIQUE (subscription_id, billing_period_start, billing_period_end)
);
CREATE INDEX idx_invoices_status ON invoices (status);
CREATE INDEX idx_invoices_due_date ON invoices (due_date);
CREATE INDEX idx_invoices_customer ON invoices (customer_id);
CREATE INDEX idx_invoices_invoice_date ON invoices (invoice_date);
CREATE INDEX idx_invoices_open_due ON invoices (due_date) WHERE status = 'confirmed';

CREATE TABLE invoice_lines (
  id                   SERIAL PRIMARY KEY,
  invoice_id           INTEGER NOT NULL REFERENCES invoices (id) ON DELETE CASCADE,
  subscription_line_id INTEGER REFERENCES subscription_lines (id) ON DELETE SET NULL,
  line_type            TEXT NOT NULL CHECK (line_type IN ('plan', 'product')),
  product_id           INTEGER REFERENCES products (id),
  variant_id           INTEGER REFERENCES product_variants (id),
  description          TEXT NOT NULL,
  quantity             INTEGER NOT NULL CHECK (quantity > 0),
  unit_price           NUMERIC(12,2) NOT NULL CHECK (unit_price >= 0),
  subtotal             NUMERIC(12,2) NOT NULL CHECK (subtotal >= 0),
  discount_amount      NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  tax_rate             NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (tax_rate >= 0 AND tax_rate <= 100),
  tax_amount           NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
  total                NUMERIC(12,2) NOT NULL CHECK (total >= 0),
  sort_order           INTEGER NOT NULL DEFAULT 0,
  CHECK (discount_amount <= subtotal)
);
CREATE INDEX idx_invoice_lines_invoice ON invoice_lines (invoice_id);

CREATE TABLE invoice_discounts (
  invoice_id  INTEGER NOT NULL REFERENCES invoices (id) ON DELETE CASCADE,
  discount_id INTEGER NOT NULL REFERENCES discounts (id),
  name        TEXT NOT NULL,
  amount      NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  PRIMARY KEY (invoice_id, discount_id)
);
CREATE INDEX idx_invoice_discounts_discount ON invoice_discounts (discount_id);

CREATE TABLE payments (
  id               SERIAL PRIMARY KEY,
  invoice_id       INTEGER NOT NULL REFERENCES invoices (id),
  customer_id      INTEGER NOT NULL REFERENCES customers (id),
  payment_method   TEXT NOT NULL CHECK (payment_method IN ('cash', 'bank_transfer', 'card', 'upi', 'other')),
  amount           NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  payment_date     DATE NOT NULL,
  reference_number TEXT,
  note             TEXT,
  recorded_by      INTEGER REFERENCES users (id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_payments_payment_date ON payments (payment_date);
CREATE INDEX idx_payments_invoice ON payments (invoice_id);
CREATE INDEX idx_payments_customer ON payments (customer_id);
