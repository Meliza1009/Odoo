import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { pool } from '../src/db/pool.js';
import { addDays, todayIso } from '../src/lib/dates.js';
import { runScheduledBilling, startBillingScheduler } from '../src/modules/billing/scheduler.js';
import { api, assignCustomers, closeDatabase, createActiveSubscription, createUser, resetDatabase, type TestUser } from './helpers.js';

let subscriptionId: number;
let admin: TestUser;
let staff: TestUser;
let customer: TestUser;
let planId: number;
beforeAll(async () => {
  await resetDatabase();
  [admin, staff, customer] = await Promise.all([createUser('admin'), createUser('staff'), createUser('customer')]);
  await assignCustomers(staff, customer.customerId!);
  planId = (await api().post('/api/plans').set(admin.auth).send({ name: 'Scheduled Monthly', billingInterval: 'monthly', price: 100 })).body.id;
  subscriptionId = await createActiveSubscription(staff, { customerId: customer.customerId, planId, startDate: todayIso(), lines: [] });
});
afterAll(closeDatabase);

it('runs opt-in billing on server startup without waiting for an admin request', async () => {
  const child = spawn(process.execPath, ['--import', 'tsx', 'src/server.ts'], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: '0', NODE_ENV: 'test', KEEP_ALIVE: 'false', BILLING_SCHEDULE_ENABLED: 'true', BILLING_SCHEDULE_INTERVAL_MS: '3600000' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (data) => { output += String(data); });
  child.stderr.on('data', (data) => { output += String(data); });
  const stopped = new Promise<void>((resolve) => child.once('exit', () => resolve()));
  try {
    let invoices: { status: string }[] = [];
    for (let n = 0; n < 120; n += 1) {
      invoices = (await pool.query('SELECT status FROM invoices WHERE subscription_id = $1', [subscriptionId])).rows;
      if (invoices.length) break;
      if (child.exitCode !== null) throw new Error(`Server exited before billing: ${output}`);
      await delay(50);
    }
    expect(invoices).toEqual([{ status: 'draft' }]);
  } finally {
    child.kill('SIGTERM');
    await stopped;
  }
});

it('persists its successful interval checkpoint so another process/restart skips the same window', async () => {
  const now = new Date(Date.now() + 2 * 60 * 60 * 1000);
  expect((await runScheduledBilling({ now, intervalMs: 3600000 })).status).toBe('completed');
  const withinHour = new Date(now.getTime() + 30 * 60 * 1000);
  expect((await runScheduledBilling({ now: withinHour, intervalMs: 3600000 })).status).toBe('not_due');
});

it('does not start a billing run while another database session owns the scheduler lock', async () => {
  const otherInstance = await pool.connect();
  await otherInstance.query('SELECT pg_advisory_lock($1)', [727275]);
  await pool.query('UPDATE billing_scheduler_state SET last_success_at = NULL');
  const before = (await pool.query('SELECT count(*)::int AS count FROM billing_runs')).rows[0].count;
  try {
    expect((await runScheduledBilling()).status).toBe('locked');
    expect((await pool.query('SELECT count(*)::int AS count FROM billing_runs')).rows[0].count).toBe(before);
  } finally {
    await otherInstance.query('SELECT pg_advisory_unlock($1)', [727275]);
    otherInstance.release();
  }
});

it('keeps the checkpoint unchanged after per-subscription failure and retries the due work', async () => {
  const id = await createActiveSubscription(staff, { customerId: customer.customerId, planId, startDate: todayIso(), lines: [] });
  await pool.query('UPDATE billing_scheduler_state SET last_success_at = NULL');
  await pool.query(`CREATE FUNCTION reject_scheduled_invoice() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN IF NEW.subscription_id = ${id} THEN RAISE EXCEPTION 'scheduled invoice failure'; END IF; RETURN NEW; END $$;
    CREATE TRIGGER reject_scheduled_invoice BEFORE INSERT ON invoices FOR EACH ROW EXECUTE FUNCTION reject_scheduled_invoice()`);
  try {
    await expect(runScheduledBilling()).rejects.toThrow(/failed|incomplete/i);
  } finally {
    await pool.query('DROP TRIGGER reject_scheduled_invoice ON invoices; DROP FUNCTION reject_scheduled_invoice()');
  }
  expect((await pool.query('SELECT last_success_at FROM billing_scheduler_state')).rows[0].last_success_at).toBeNull();
  expect((await runScheduledBilling()).status).toBe('completed');
  expect((await pool.query('SELECT status FROM invoices WHERE subscription_id = $1', [id])).rows).toEqual([{ status: 'draft' }]);
});

it('finds subscriptions created later in the same UTC day at the next interval', async () => {
  await pool.query('UPDATE billing_scheduler_state SET last_success_at = NULL');
  const now = new Date();
  expect((await runScheduledBilling({ now, intervalMs: 3600000 })).status).toBe('completed');
  const id = await createActiveSubscription(staff, { customerId: customer.customerId, planId, startDate: todayIso(), lines: [] });
  expect((await runScheduledBilling({ now: new Date(now.getTime() + 1800000), intervalMs: 3600000 })).status).toBe('not_due');
  expect((await pool.query('SELECT id FROM invoices WHERE subscription_id = $1', [id])).rows).toEqual([]);
  expect((await runScheduledBilling({ now: new Date(now.getTime() + 3600000), intervalMs: 3600000 })).status).toBe('completed');
  expect((await pool.query('SELECT status FROM invoices WHERE subscription_id = $1', [id])).rows).toEqual([{ status: 'draft' }]);
});

it('honors explicit automatic confirmation and uses the UTC billing date', async () => {
  await pool.query('UPDATE billing_scheduler_state SET last_success_at = NULL');
  const id = await createActiveSubscription(staff, { customerId: customer.customerId, planId, startDate: todayIso(), lines: [] });
  const date = todayIso();
  const now = new Date(`${date}T19:00:00-05:00`);
  const scheduled = await runScheduledBilling({ now, autoConfirm: true });
  expect(scheduled.result?.runDate).toBe(addDays(date, 1));
  expect((await pool.query('SELECT status FROM invoices WHERE subscription_id = $1', [id])).rows).toEqual([{ status: 'confirmed' }]);
});

it('does nothing when the in-process scheduler is disabled', async () => {
  vi.useFakeTimers();
  try {
    const run = vi.fn(async () => ({ status: 'not_due' as const }));
    const scheduler = startBillingScheduler({ enabled: false, intervalMs: 1000, run });
    await vi.advanceTimersByTimeAsync(5000);
    expect(run).not.toHaveBeenCalled();
    await scheduler.stop();
  } finally { vi.useRealTimers(); }
});

it('coalesces ticks and drains an in-flight job before stopping', async () => {
  vi.useFakeTimers();
  try {
    let finish!: () => void;
    const run = vi.fn(() => new Promise<{ status: 'not_due' }>((resolve) => { finish = () => resolve({ status: 'not_due' }); }));
    const scheduler = startBillingScheduler({ enabled: true, intervalMs: 1000, run });
    expect(run).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(5000);
    expect(run).toHaveBeenCalledTimes(1);
    let drained = false;
    const stopping = scheduler.stop().then(() => { drained = true; });
    await Promise.resolve();
    expect(drained).toBe(false);
    finish();
    await stopping;
    expect(drained).toBe(true);
    await vi.advanceTimersByTimeAsync(5000);
    expect(run).toHaveBeenCalledTimes(1);
  } finally { vi.useRealTimers(); }
});

it('retries a failed in-process tick on the next interval', async () => {
  vi.useFakeTimers();
  try {
    const run = vi.fn<() => Promise<{ status: 'not_due' }>>()
      .mockRejectedValueOnce(new Error('temporary failure'))
      .mockResolvedValue({ status: 'not_due' });
    const logger = { info: vi.fn(), error: vi.fn() };
    const scheduler = startBillingScheduler({ enabled: true, intervalMs: 1000, run, logger });
    await vi.advanceTimersByTimeAsync(0);
    expect(logger.error).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(run).toHaveBeenCalledTimes(2);
    await scheduler.stop();
  } finally { vi.useRealTimers(); }
});
