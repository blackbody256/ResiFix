import { describe, expect, it } from 'vitest';
import { loadConfig } from './config';

const base = { DATABASE_URL: 'postgresql://x@localhost/db' };

describe('loadConfig', () => {
  it('uses development defaults, including the fixed dev OTP', () => {
    const config = loadConfig({ ...base });
    expect(config.nodeEnv).toBe('development');
    expect(config.otp.devCode).toBe('123456');
    expect(config.worker.autoCloseHours).toBe(48);
  });

  it('never uses the fixed OTP in production', () => {
    const config = loadConfig({ ...base, NODE_ENV: 'production', JWT_SECRET: 'long-secret' });
    expect(config.otp.devCode).toBeNull();
  });

  it('refuses to start in production without a JWT secret', () => {
    expect(() => loadConfig({ ...base, NODE_ENV: 'production' })).toThrow(/JWT_SECRET/);
  });

  it('rejects an unknown NODE_ENV instead of silently treating it as development', () => {
    expect(() => loadConfig({ ...base, NODE_ENV: 'staging' })).toThrow();
  });

  it('treats empty values in .env as unset', () => {
    const config = loadConfig({ ...base, VAPID_PUBLIC_KEY: '', AT_API_KEY: '', SENTRY_DSN: '' });
    expect(config.webPush).toBeNull();
    expect(config.sms).toBeNull();
    expect(config.sentry.dsn).toBeUndefined();
  });

  it('only enables SMS and Web Push when both halves of the credentials are set', () => {
    expect(loadConfig({ ...base, AT_USERNAME: 'u' }).sms).toBeNull();
    expect(loadConfig({ ...base, AT_USERNAME: 'u', AT_API_KEY: 'k' }).sms).not.toBeNull();
    expect(loadConfig({ ...base, VAPID_PUBLIC_KEY: 'p' }).webPush).toBeNull();
  });

  it('limits OTP requests by default and lets each limit be changed', () => {
    expect(loadConfig({ ...base }).otp.requestLimit).toEqual({
      perPhone: 5,
      perIp: 30,
      windowSeconds: 900,
    });
    const custom = loadConfig({
      ...base,
      OTP_REQUESTS_PER_PHONE: '2',
      OTP_REQUESTS_PER_IP: '8',
      OTP_REQUEST_WINDOW_SECONDS: '60',
    });
    expect(custom.otp.requestLimit).toEqual({ perPhone: 2, perIp: 8, windowSeconds: 60 });
    expect(() => loadConfig({ ...base, OTP_REQUESTS_PER_PHONE: '0' })).toThrow();
  });

  it('requires a database URL', () => {
    expect(() => loadConfig({})).toThrow();
  });
});
