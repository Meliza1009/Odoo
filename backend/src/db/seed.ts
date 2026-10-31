import { pathToFileURL } from 'node:url';
import { pool, withTransaction } from './pool.js';
import { seeds } from './seeds/index.js';

/**
 * Idempotent demo data. Every module adds its own seed function to ./seeds/index.ts.
 * Seeds run in order inside one transaction, so later seeds can use data from earlier ones.
 */
export async function seed(log: (msg: string) => void = console.log) {
  await withTransaction(async (client) => {
    for (const { name, run } of seeds) {
      await run(client);
      log(`seeded ${name}`);
    }
  });
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
