const env = process.env;

const isProduction = env.NODE_ENV === 'production';

function required(name: string, devFallback: string): string {
  const value = env[name];
  if (value) return value;
  if (isProduction) throw new Error(`Missing required environment variable ${name}`);
  return devFallback;
}

export const config = {
  nodeEnv: env.NODE_ENV ?? 'development',
  isProduction,
  isTest: env.NODE_ENV === 'test',
  port: Number(env.PORT ?? 4000),
  databaseUrl: required('DATABASE_URL', 'postgres://brightloop:brightloop@localhost:5432/brightloop'),
  databaseSsl: env.DATABASE_SSL === 'true',
  jwtSecret: required('JWT_SECRET', 'local-dev-secret-change-me'),
  jwtExpiresIn: env.JWT_EXPIRES_IN ?? '8h',
  frontendUrls: (env.FRONTEND_URL ?? 'http://localhost:5173')
    .split(',')
    .map((url) => url.trim().replace(/\/$/, ''))
    .filter(Boolean),
  smtp: {
    host: env.SMTP_HOST ?? '',
    port: Number(env.SMTP_PORT ?? 1025),
    from: env.SMTP_FROM ?? 'Brightloop <no-reply@brightloop.demo>',
  },
  passwordResetTtlMinutes: 30,
};
