-- Persistent interval checkpoint, shared by restarted/scaled API instances.
CREATE TABLE billing_scheduler_state (
  job_name        TEXT PRIMARY KEY CHECK (job_name = 'recurring_billing'),
  last_success_at TIMESTAMPTZ
);
INSERT INTO billing_scheduler_state (job_name) VALUES ('recurring_billing');
