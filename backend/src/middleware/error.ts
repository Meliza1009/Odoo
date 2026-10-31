import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { HttpError } from '../lib/errors.js';

interface PgError extends Error {
  code?: string;
  constraint?: string;
  detail?: string;
}

const PG_ERRORS: Record<string, { status: number; message: string }> = {
  '23505': { status: 409, message: 'A record with these values already exists' },
  '23503': { status: 409, message: 'This record is referenced by, or references, another record' },
  '23514': { status: 400, message: 'A value failed a database validation rule' },
  '22P02': { status: 400, message: 'Invalid input value' },
};

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({ error: `Route ${req.method} ${req.path} not found` });
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: err.issues[0]?.message ?? 'Validation failed',
      details: err.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    });
    return;
  }
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message, details: err.details });
    return;
  }
  const pgError = err as PgError;
  if (pgError.code && PG_ERRORS[pgError.code]) {
    const { status, message } = PG_ERRORS[pgError.code];
    res.status(status).json({ error: message, details: { constraint: pgError.constraint } });
    return;
  }
  if ((err as { type?: string }).type === 'entity.parse.failed') {
    res.status(400).json({ error: 'Malformed JSON body' });
    return;
  }
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
}
