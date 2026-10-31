import jwt, { type SignOptions } from 'jsonwebtoken';
import { config } from '../config.js';

export type Role = 'admin' | 'staff' | 'customer';

export interface TokenPayload {
  sub: string;
  role: Role;
}

export function signToken(userId: number, role: Role): string {
  return jwt.sign({ role } satisfies Omit<TokenPayload, 'sub'>, config.jwtSecret, {
    subject: String(userId),
    expiresIn: config.jwtExpiresIn as SignOptions['expiresIn'],
  });
}

export function verifyToken(token: string): TokenPayload {
  return jwt.verify(token, config.jwtSecret) as TokenPayload;
}
