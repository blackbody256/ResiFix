// Single source of configuration. Read env once here; import `config` everywhere else.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// Load the repo-root .env if present (real environment variables win).
try {
  process.loadEnvFile(path.join(repoRoot, '.env'));
} catch {
  // no .env file — rely on the real environment (CI, production)
}

const env = process.env;
const nodeEnv = env.NODE_ENV ?? 'development';
const isProd = nodeEnv === 'production';

function required(name, devDefault) {
  const value = env[name] ?? (isProd ? undefined : devDefault);
  if (value === undefined || value === '') {
    throw new Error(`Missing required environment variable ${name} (see .env.example)`);
  }
  return value;
}

export const config = Object.freeze({
  nodeEnv,
  isProd,
  isTest: nodeEnv === 'test',
  port: Number(env.PORT ?? 3000),
  logLevel: env.LOG_LEVEL ?? 'info',
  databaseUrl: required('DATABASE_URL'),
  jwt: Object.freeze({
    secret: required('JWT_SECRET', 'dev-only-change-me'),
    expiresIn: env.JWT_EXPIRES_IN ?? '7d',
  }),
  otp: Object.freeze({
    // The fixed dev code is NEVER used in production.
    devCode: isProd ? null : (env.OTP_DEV_CODE ?? '123456'),
    ttlSeconds: Number(env.OTP_TTL_SECONDS ?? 300),
    maxAttempts: Number(env.OTP_MAX_ATTEMPTS ?? 5),
  }),
});
