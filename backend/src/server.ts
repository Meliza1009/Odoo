import { createApp } from './app.js';
import { config } from './config.js';
import { pool } from './db/pool.js';
import { runScheduledBilling, startBillingScheduler } from './modules/billing/scheduler.js';
import { closeExpiredSubscriptions } from './modules/subscriptions/service.js';

const server = createApp().listen(config.port, () => {
  console.log(`Brightloop API listening on http://localhost:${config.port}`);
});

/** Closes expired subscriptions whose plan has auto-close enabled. Runs at startup and then every hour. */
async function autoCloseJob() {
  try {
    const closed = await closeExpiredSubscriptions();
    if (closed.length) console.log(`[auto-close] closed ${closed.map((s) => s.subscriptionNumber).join(', ')}`);
  } catch (error) {
    console.error('[auto-close] failed:', (error as Error).message);
  }
}
let autoCloseInFlight: Promise<void> | null = null;
function runAutoClose() {
  if (!autoCloseInFlight) autoCloseInFlight = autoCloseJob().finally(() => { autoCloseInFlight = null; });
  return autoCloseInFlight;
}

const billingScheduler = startBillingScheduler({
  run: async () => {
    const result = await runScheduledBilling();
    if (result.status !== 'locked') await runAutoClose();
    return result;
  },
});
// When billing is enabled, the scheduler runs expiry maintenance after billing. Manual-billing deployments
// retain the original expiry maintenance job; its closure path also protects outstanding due periods.
const autoCloseTimer = config.billingScheduleEnabled ? null : setInterval(() => { void runAutoClose(); }, 60 * 60 * 1000);
if (!config.billingScheduleEnabled) void runAutoClose();

/**
 * Free Render instances spin down after 15 minutes without inbound traffic. Requesting our own public URL goes
 * through Render's proxy, so it counts as traffic. Pinging every 10 minutes keeps the demo awake while it runs
 * (the GitHub keep-alive workflow covers restarts).
 */
const KEEP_ALIVE_INTERVAL_MS = 10 * 60 * 1000;
const keepAliveTimer = config.keepAliveUrl
  ? setInterval(() => {
      fetch(`${config.keepAliveUrl}/health`, { signal: AbortSignal.timeout(30_000) })
        .then((res) => res.ok || console.warn(`[keep-alive] health check returned ${res.status}`))
        .catch((error: Error) => console.warn('[keep-alive] ping failed:', error.message));
    }, KEEP_ALIVE_INTERVAL_MS)
  : null;
if (keepAliveTimer) console.log(`[keep-alive] pinging ${config.keepAliveUrl}/health every ${KEEP_ALIVE_INTERVAL_MS / 60_000} minutes`);

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} received, shutting down`);
  if (autoCloseTimer) clearInterval(autoCloseTimer);
  if (keepAliveTimer) clearInterval(keepAliveTimer);
  const requestsDrained = new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
  await Promise.all([requestsDrained, billingScheduler.stop(), autoCloseInFlight]);
  await pool.end();
}

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    if (shuttingDown) return;
    shutdown(signal).then(() => process.exit(0)).catch((error: Error) => {
      console.error('[shutdown] failed:', error.message);
      process.exit(1);
    });
  });
}
