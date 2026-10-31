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

function shutdown(signal: string) {
  console.log(`${signal} received, shutting down`);
  clearInterval(autoCloseTimer);
  server.close(() => {
    pool.end().finally(() => process.exit(0));
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
