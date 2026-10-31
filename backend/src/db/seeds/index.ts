import type pg from 'pg';

export interface Seed {
  name: string;
  run: (client: pg.PoolClient) => Promise<void>;
}

// Order matters: users/customers -> catalog -> subscriptions -> invoices/payments.
export const seeds: Seed[] = [];
