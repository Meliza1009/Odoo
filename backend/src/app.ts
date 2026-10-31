import cors from 'cors';
import express, { Router } from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import { config } from './config.js';
import { pool } from './db/pool.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(helmet());
  app.use(cors({ origin: config.frontendUrls, credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  if (!config.isTest) app.use(morgan(config.isProduction ? 'combined' : 'dev'));

  app.get('/health', async (_req, res) => {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', uptime: Math.round(process.uptime()) });
  });

  // Each module registers its router here (one line per module).
  const api = Router();
  app.use('/api', api);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
