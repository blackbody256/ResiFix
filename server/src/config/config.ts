// Single source of configuration. Env is read and validated once; inject with
// `@Inject(APP_CONFIG) private readonly config: AppConfig`.
import path from 'node:path';
import { z } from 'zod';

// Load the repo-root .env if present (real environment variables win). Works from src/ and dist/.
try {
  process.loadEnvFile(path.resolve(__dirname, '../../../.env'));
} catch {
  // no .env file: rely on the real environment (CI, Docker, production)
}

export const APP_CONFIG = Symbol('APP_CONFIG');

const bool = z.enum(['true', 'false', '1', '0']).transform((v) => v === 'true' || v === '1');

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(3000),
  DATABASE_URL: z.string().min(1),

  JWT_SECRET: z.string().min(1).optional(),
  JWT_EXPIRES_IN: z.string().default('7d'),
  OTP_DEV_CODE: z
    .string()
    .regex(/^\d{6}$/)
    .default('123456'),
  OTP_TTL_SECONDS: z.coerce.number().int().positive().default(300),
  OTP_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),

  REDIS_URL: z.string().default('redis://localhost:6379'),
  RUN_WORKER_INLINE: bool.default(true),
  AUTO_CLOSE_HOURS: z.coerce.number().positive().default(48),

  S3_ENDPOINT: z.string().default('http://localhost:9000'),
  S3_PUBLIC_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default('us-east-1'),
  S3_BUCKET: z.string().default('resifix-photos'),
  S3_ACCESS_KEY: z.string().default('resifix'),
  S3_SECRET_KEY: z.string().default('resifix-secret'),
  S3_FORCE_PATH_STYLE: bool.default(true),
  PHOTO_URL_TTL_SECONDS: z.coerce.number().int().positive().default(900),

  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().default('mailto:admin@resifix.local'),

  AT_USERNAME: z.string().optional(),
  AT_API_KEY: z.string().optional(),
  AT_SENDER_ID: z.string().optional(),
  AT_SANDBOX: bool.default(true),

  SENTRY_DSN: z.string().optional(),
});

export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  // Treat empty strings in .env as "not set".
  const cleaned = Object.fromEntries(Object.entries(env).filter(([, v]) => v !== ''));
  const e = EnvSchema.parse(cleaned);
  const isProd = e.NODE_ENV === 'production';

  if (isProd && !e.JWT_SECRET) throw new Error('JWT_SECRET is required in production');

  return {
    nodeEnv: e.NODE_ENV,
    isProd,
    port: e.PORT,
    databaseUrl: e.DATABASE_URL,
    jwt: { secret: e.JWT_SECRET ?? 'dev-only-change-me', expiresIn: e.JWT_EXPIRES_IN },
    otp: {
      // The fixed dev code is NEVER used in production.
      devCode: isProd ? null : e.OTP_DEV_CODE,
      ttlSeconds: e.OTP_TTL_SECONDS,
      maxAttempts: e.OTP_MAX_ATTEMPTS,
    },
    redis: { url: e.REDIS_URL },
    worker: { inline: e.RUN_WORKER_INLINE, autoCloseHours: e.AUTO_CLOSE_HOURS },
    storage: {
      endpoint: e.S3_ENDPOINT,
      publicEndpoint: e.S3_PUBLIC_ENDPOINT ?? e.S3_ENDPOINT,
      region: e.S3_REGION,
      bucket: e.S3_BUCKET,
      accessKeyId: e.S3_ACCESS_KEY,
      secretAccessKey: e.S3_SECRET_KEY,
      forcePathStyle: e.S3_FORCE_PATH_STYLE,
      urlTtlSeconds: e.PHOTO_URL_TTL_SECONDS,
    },
    webPush:
      e.VAPID_PUBLIC_KEY && e.VAPID_PRIVATE_KEY
        ? {
            publicKey: e.VAPID_PUBLIC_KEY,
            privateKey: e.VAPID_PRIVATE_KEY,
            subject: e.VAPID_SUBJECT,
          }
        : null,
    sms:
      e.AT_USERNAME && e.AT_API_KEY
        ? {
            username: e.AT_USERNAME,
            apiKey: e.AT_API_KEY,
            senderId: e.AT_SENDER_ID,
            sandbox: e.AT_SANDBOX,
          }
        : null,
    sentry: { dsn: e.SENTRY_DSN, environment: e.NODE_ENV },
  };
}

export type AppConfig = ReturnType<typeof loadConfig>;
