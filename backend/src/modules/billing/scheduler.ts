import { config } from '../../config.js';
import { pool } from '../../db/pool.js';
import { runBilling, type BillingRunResult } from './engine.js';

// Session-scoped across all API instances, distinct from the migration lock (727274).
const SCHEDULE_LOCK_ID = 727275;

export interface ScheduledBillingOptions {
  now?: Date;
  intervalMs?: number;
  autoConfirm?: boolean;
}

export interface ScheduledBillingResult {
  status: 'completed' | 'not_due' | 'locked';
  result?: BillingRunResult;
}

/** A scheduled run uses UTC dates and the same catch-up/idempotency rules as an administrator's billing run. */
export async function runScheduledBilling(options: ScheduledBillingOptions = {}): Promise<ScheduledBillingResult> {
  const now = options.now ?? new Date();
  const intervalMs = options.intervalMs ?? config.billingScheduleIntervalMs;
  if (!Number.isFinite(intervalMs) || intervalMs <= 0 || intervalMs > 2_147_483_647) throw new Error('Invalid billing schedule interval');
  const client = await pool.connect();
  let locked = false;
  try {
    locked = (await client.query<{ locked: boolean }>('SELECT pg_try_advisory_lock($1) AS locked', [SCHEDULE_LOCK_ID])).rows[0].locked;
    if (!locked) return { status: 'locked' };
    const checkpoint = await client.query<{ lastSuccessAt: Date | null }>(
      'SELECT last_success_at AS "lastSuccessAt" FROM billing_scheduler_state WHERE job_name = $1', ['recurring_billing'],
    );
    const lastSuccessAt = checkpoint.rows[0]?.lastSuccessAt;
    if (lastSuccessAt && now.getTime() - lastSuccessAt.getTime() < intervalMs) return { status: 'not_due' };
    const result = await runBilling(now.toISOString().slice(0, 10), { autoConfirm: options.autoConfirm ?? config.billingScheduleAutoConfirm });
    if (result.errors.length) throw new Error(`Scheduled billing incomplete: ${result.errors.length} subscriptions failed; will retry`);
    await client.query(
      'INSERT INTO billing_scheduler_state (job_name, last_success_at) VALUES ($1, $2) ON CONFLICT (job_name) DO UPDATE SET last_success_at = EXCLUDED.last_success_at',
      ['recurring_billing', options.now ?? new Date()],
    );
    return { status: 'completed', result };
  } finally {
    let releaseError: Error | undefined;
    if (locked) {
      try { await client.query('SELECT pg_advisory_unlock($1)', [SCHEDULE_LOCK_ID]); }
      catch (error) { releaseError = error as Error; }
    }
    // Destroy a connection whose unlock failed so a pooled session can never retain the job lock.
    client.release(releaseError);
  }
}

interface BillingSchedulerOptions {
  enabled?: boolean;
  intervalMs?: number;
  autoConfirm?: boolean;
  run?: () => Promise<ScheduledBillingResult>;
  logger?: Pick<Console, 'info' | 'error'>;
}

/** Starts with a catch-up check, coalesces overlapping ticks, and exposes a draining shutdown. */
export function startBillingScheduler(options: BillingSchedulerOptions = {}) {
  const enabled = options.enabled ?? config.billingScheduleEnabled;
  const intervalMs = options.intervalMs ?? config.billingScheduleIntervalMs;
  if (!enabled) return { stop: async () => undefined };
  if (!Number.isFinite(intervalMs) || intervalMs <= 0 || intervalMs > 2_147_483_647) throw new Error('Invalid billing schedule interval');
  const logger = options.logger ?? console;
  const run = options.run ?? (() => runScheduledBilling({ intervalMs, autoConfirm: options.autoConfirm }));
  let stopped = false;
  let inFlight: Promise<void> | null = null;
  const tick = () => {
    if (stopped || inFlight) return;
    inFlight = (async () => {
      try {
        const result = await run();
        if (result.status === 'completed') logger.info(`[billing-scheduler] generated ${result.result?.invoicesCreated ?? 0} invoices`);
      } catch (error) {
        logger.error('[billing-scheduler] failed; will retry:', (error as Error).message);
      }
    })().finally(() => { inFlight = null; });
  };
  tick();
  const timer = setInterval(tick, intervalMs);
  return {
    async stop() {
      stopped = true;
      clearInterval(timer);
      await inFlight;
    },
  };
}
