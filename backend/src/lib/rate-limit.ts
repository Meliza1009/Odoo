import type { NextFunction, Request, Response } from 'express';
import { HttpError } from './errors.js';

interface Bucket {
  count: number;
  resetAt: number;
}

interface RateLimitOptions {
  /** Attempts allowed per key within the window. */
  max: number;
  windowMs: number;
  /** Builds the bucket key from the request; defaults to the client IP. */
  keyFor?: (req: Request) => string;
  message?: string;
}

/**
 * Small in-memory fixed-window limiter for credential endpoints (login, password reset).
 * Per process only, which is fine for a single API instance; swap for a shared store when scaling out.
 */
export function rateLimit({ max, windowMs, keyFor = (req) => req.ip ?? 'unknown', message = 'Too many attempts, please try again later' }: RateLimitOptions) {
  const buckets = new Map<string, Bucket>();

  const sweep = () => {
    const now = Date.now();
    for (const [key, bucket] of buckets) if (bucket.resetAt <= now) buckets.delete(key);
  };

  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();
    if (buckets.size > 10_000) sweep();
    const key = keyFor(req);
    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(key, bucket);
    }
    bucket.count += 1;
    if (bucket.count > max) {
      res.setHeader('Retry-After', String(Math.ceil((bucket.resetAt - now) / 1000)));
      throw new HttpError(429, message);
    }
    next();
  };
}
