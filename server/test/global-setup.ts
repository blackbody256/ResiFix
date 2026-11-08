// Vitest `globalSetup` for e2e, once per run: bring the test database up to date (Prisma creates
// it if missing) and empty the test Redis DB so queued jobs from earlier runs don't pile up.
import { execFileSync } from 'node:child_process';
import { Redis } from 'ioredis';
import { repoRoot, testEnv } from './test-env';

export default async function globalSetup() {
  const env = testEnv();

  try {
    execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
      cwd: repoRoot,
      env: { ...process.env, DATABASE_URL: env.DATABASE_URL },
      stdio: 'pipe',
    });
  } catch (err) {
    const output = (err as { stdout?: Buffer; stderr?: Buffer }).stderr?.toString() ?? '';
    throw new Error(
      `Could not migrate the test database. Is Postgres up (npm run infra:up)?\n${output}`,
      { cause: err },
    );
  }

  const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 1, lazyConnect: true });
  try {
    await redis.connect();
    await redis.flushdb();
  } catch (err) {
    throw new Error(`Could not reach the test Redis (${env.REDIS_URL})`, { cause: err });
  } finally {
    redis.disconnect();
  }
}
