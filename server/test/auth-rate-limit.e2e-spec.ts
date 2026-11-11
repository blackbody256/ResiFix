// PB-002: request-otp is limited per phone and per client IP, in fixed windows kept in Redis.
// This file runs with small limits and a short window so the window can be seen to reset.
// Each test uses its own IP (X-Forwarded-For) and its own numbers, so the tests do not share counters.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startApp, type TestApp } from './app';
import { createProperty, destroyProperty, type PropertyFixture, uniquePhone } from './fixtures';

const PER_PHONE = 2;
const PER_IP = 4;
const WINDOW_SECONDS = 3;

// Read when the app starts, so set before startApp().
process.env.OTP_REQUESTS_PER_PHONE = String(PER_PHONE);
process.env.OTP_REQUESTS_PER_IP = String(PER_IP);
process.env.OTP_REQUEST_WINDOW_SECONDS = String(WINDOW_SECONDS);

let ipSequence = 0;
/** A client IP no other test in this run uses. */
const freshIp = () => `203.0.113.${++ipSequence}`;

describe('auth: request-otp rate limit (PB-002)', () => {
  let t: TestApp;
  let home: PropertyFixture;

  beforeAll(async () => {
    t = await startApp();
    home = await createProperty(t.prisma, 'Rate Limit Hall');
  });
  afterAll(async () => {
    await destroyProperty(t.prisma, home.property.id);
    await t.close();
  });

  /** A fresh registered resident, so no other test has used the number. */
  const newUser = async () =>
    t.prisma.user.create({
      data: {
        propertyId: home.property.id,
        phone: uniquePhone(),
        name: 'Rate test',
        role: 'RESIDENT',
      },
    });
  const requestOtp = (phone: string, ip: string) =>
    t.anon().post('/auth/request-otp').set('X-Forwarded-For', ip).send({ phone });
  const codesFor = (phone: string) => t.prisma.otpChallenge.count({ where: { phone } });
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  it('allows requests up to the per-phone limit', async () => {
    const { phone } = await newUser();
    const ip = freshIp();
    for (let i = 0; i < PER_PHONE; i++) await requestOtp(phone, ip).expect(200);
    expect(await codesFor(phone)).toBe(PER_PHONE);
  });

  it('answers 429 over the per-phone limit, without creating or sending a code', async () => {
    const { phone } = await newUser();
    const ip = freshIp();
    for (let i = 0; i < PER_PHONE; i++) await requestOtp(phone, ip).expect(200);

    const limited = await requestOtp(phone, ip).expect(429);
    expect(limited.body.error).toEqual({
      code: 'TOO_MANY_REQUESTS',
      message: expect.any(String),
      details: { retryAfterSeconds: expect.any(Number) },
    });
    expect(limited.body.error.details.retryAfterSeconds).toBeGreaterThan(0);
    expect(limited.body.error.details.retryAfterSeconds).toBeLessThanOrEqual(WINDOW_SECONDS);
    expect(await codesFor(phone)).toBe(PER_PHONE);
  });

  it('follows the phone across IPs', async () => {
    const { phone } = await newUser();
    for (let i = 0; i < PER_PHONE; i++) await requestOtp(phone, freshIp()).expect(200);
    await requestOtp(phone, freshIp()).expect(429);
    expect(await codesFor(phone)).toBe(PER_PHONE);
  });

  it('limits one IP across many phones, and counts unregistered numbers too', async () => {
    const ip = freshIp();
    // Unregistered numbers still use up the IP's allowance, so numbers cannot be probed freely.
    await requestOtp(uniquePhone(), ip).expect(404);
    await requestOtp(uniquePhone(), ip).expect(404);
    for (let i = 2; i < PER_IP; i++) await requestOtp((await newUser()).phone, ip).expect(200);

    const { phone } = await newUser();
    const limited = await requestOtp(phone, ip).expect(429);
    expect(limited.body.error.code).toBe('TOO_MANY_REQUESTS');
    expect(await codesFor(phone)).toBe(0);

    // The same number from another network still works: the IP block did not count against it.
    await requestOtp(phone, freshIp()).expect(200);
    expect(await codesFor(phone)).toBe(1);
  });

  it('allows requests again once the window has passed', async () => {
    const { phone } = await newUser();
    const ip = freshIp();
    for (let i = 0; i < PER_PHONE; i++) await requestOtp(phone, ip).expect(200);
    await requestOtp(phone, ip).expect(429);

    await sleep(WINDOW_SECONDS * 1000 + 1100);
    await requestOtp(phone, ip).expect(200);
    expect(await codesFor(phone)).toBe(PER_PHONE + 1);
  });

  it('does not count requests that fail validation', async () => {
    const { phone } = await newUser();
    const ip = freshIp();
    for (let i = 0; i < PER_IP + 1; i++) await requestOtp('07', ip).expect(400);
    await requestOtp(phone, ip).expect(200);
  });
});
