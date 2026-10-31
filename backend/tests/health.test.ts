import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, closeDatabase, resetDatabase } from './helpers.js';

beforeAll(resetDatabase);
afterAll(closeDatabase);

describe('health', () => {
  it('reports ok when the database is reachable', async () => {
    const res = await api().get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('returns 404 JSON for unknown routes', async () => {
    const res = await api().get('/api/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/);
  });
});
