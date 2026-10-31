-- Attention notifications are derived from live invoices/subscriptions. Store only
-- per-user read receipts, so resolved items disappear and access changes apply immediately.
CREATE TABLE notification_reads (
  user_id          INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  notification_key TEXT NOT NULL,
  read_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, notification_key)
);
