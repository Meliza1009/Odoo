import request from 'supertest';
import { createApp } from '../src/app.js';
import { migrate } from '../src/db/migrate.js';
import { pool } from '../src/db/pool.js';

export const app = createApp();
export const api = () => request(app);

/** Drops everything and re-runs all migrations. Only ever point TEST_DATABASE_URL at a throwaway database. */
export async function resetDatabase() {
  if (!/test/i.test(process.env.DATABASE_URL ?? '')) {
    throw new Error('Refusing to reset a database whose URL does not contain "test"');
  }
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await migrate(pool, () => undefined);
}

export async function closeDatabase() {
  await pool.end();
}
