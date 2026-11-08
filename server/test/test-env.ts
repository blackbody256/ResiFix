// Where the e2e tests run. Derived from the normal settings so `npm test` needs no extra setup:
//   DATABASE_URL  .../resifix          -> .../resifix_test        (or set TEST_DATABASE_URL)
//   REDIS_URL     redis://host:6379    -> redis://host:6379/15    (or set TEST_REDIS_URL)
// Tests never touch the development database or the Redis DB the dev worker reads.
import path from 'node:path';

export const repoRoot = path.resolve(__dirname, '../..');

const DEFAULT_DATABASE_URL = 'postgresql://resifix:resifix@localhost:5432/resifix?schema=public';
const DEFAULT_REDIS_URL = 'redis://localhost:6379';
const TEST_REDIS_DB = '15';

export function testEnv() {
  try {
    process.loadEnvFile(path.join(repoRoot, '.env')); // never overrides variables already set
  } catch {
    // no .env (CI): rely on the real environment
  }

  const databaseUrl = new URL(
    process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL,
  );
  if (!process.env.TEST_DATABASE_URL) databaseUrl.pathname += '_test';
  if (!databaseUrl.pathname.endsWith('_test')) {
    throw new Error(
      `Refusing to run e2e tests against ${databaseUrl.pathname}: use a *_test database`,
    );
  }

  const redisUrl = new URL(
    process.env.TEST_REDIS_URL ?? process.env.REDIS_URL ?? DEFAULT_REDIS_URL,
  );
  if (!process.env.TEST_REDIS_URL) redisUrl.pathname = `/${TEST_REDIS_DB}`;
  if (redisUrl.pathname === '' || redisUrl.pathname === '/' || redisUrl.pathname === '/0') {
    throw new Error(
      'Refusing to run e2e tests against Redis DB 0: set TEST_REDIS_URL to another DB',
    );
  }

  return {
    NODE_ENV: 'test',
    DATABASE_URL: databaseUrl.toString(),
    REDIS_URL: redisUrl.toString(),
    // Jobs are queued but not run: tests assert on queued jobs instead of real delivery.
    RUN_WORKER_INLINE: 'false',
    JWT_SECRET: 'e2e-test-secret',
    OTP_DEV_CODE: '123456',
    // Test photos go to their own bucket (created on startup), never the dev one.
    S3_BUCKET: process.env.TEST_S3_BUCKET ?? 'resifix-photos-test',
    SENTRY_DSN: '',
  };
}
