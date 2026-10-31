import pg from 'pg';
import { config } from '../config.js';

// Return NUMERIC as JS numbers (money values are NUMERIC(12,2), well within float precision for display)
pg.types.setTypeParser(1700, (value) => Number(value));
// Return DATE columns as 'YYYY-MM-DD' strings instead of local-time Date objects
pg.types.setTypeParser(1082, (value) => value);
// Return BIGINT (e.g. COUNT(*)) as numbers
pg.types.setTypeParser(20, (value) => Number(value));

export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  ssl: config.databaseSsl ? { rejectUnauthorized: false } : undefined,
  max: 10,
});

export type DbClient = pg.Pool | pg.PoolClient;

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params: unknown[] = [],
  client: DbClient = pool,
) {
  return client.query<T>(text, params);
}

export async function withTransaction<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
