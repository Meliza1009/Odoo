import { existsSync } from 'node:fs';
import path from 'node:path';

const envFile = path.resolve(import.meta.dirname, '../../.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET ??= 'test-secret';
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://brightloop:brightloop@localhost:5432/brightloop_test';
