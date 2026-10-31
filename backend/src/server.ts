import { createApp } from './app.js';
import { config } from './config.js';
import { pool } from './db/pool.js';
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
void autoCloseJob();
const autoCloseTimer = setInterval(autoCloseJob, 60 * 60 * 1000);

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

function shutdown(signal: string) {
  console.log(`${signal} received, shutting down`);
  clearInterval(autoCloseTimer);
  if (keepAliveTimer) clearInterval(keepAliveTimer);
  server.close(() => {
    pool.end().finally(() => process.exit(0));
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
