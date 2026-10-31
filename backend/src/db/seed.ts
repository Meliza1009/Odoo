import { pathToFileURL } from 'node:url';
import { pool, withTransaction } from './pool.js';
import { seeds } from './seeds/index.js';

/**
 * Idempotent demo data. Every module adds its own seed function to ./seeds/index.ts.
 * Seeds run in order; each normal seed runs in its own transaction. Standalone seeds manage their own
 * transactions (e.g. because they call services such as the billing engine).
 */
export async function seed(log: (msg: string) => void = console.log) {
  for (const entry of seeds) {
    if (entry.standalone) await entry.run();
    else await withTransaction((client) => entry.run(client));
    log(`seeded ${entry.name}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  seed()
    .then(() => console.log('seed complete'))
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}
