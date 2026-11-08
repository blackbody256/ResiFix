// PB-001 / PB-002: phone + OTP login, JWT sessions. OTP in tests is always 123456.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startApp, type TestApp } from './app';
import { createProperty, destroyProperty, type PropertyFixture, uniquePhone } from './fixtures';

const CODE = '123456';
const WRONG = '000000';

describe('auth', () => {
  let t: TestApp;
  let home: PropertyFixture;

  beforeAll(async () => {
    t = await startApp();
    home = await createProperty(t.prisma, 'Auth Hall');
  });
  afterAll(async () => {
    await destroyProperty(t.prisma, home.property.id);
    await t.close();
  });

  const requestOtp = (phone: string) => t.anon().post('/auth/request-otp').send({ phone });
  const verifyOtp = (phone: string, code: string) =>
    t.anon().post('/auth/verify-otp').send({ phone, code });
  /** "+256791234567" -> "0791234567", the way people type it. */
  const local = (e164: string) => `0${e164.slice(4)}`;

  it('logs in with a locally formatted number and returns a working token', async () => {
    const resident = home.residents[0];
    const sent = await requestOtp(local(resident.phone)).expect(200);
    expect(sent.body).toEqual({ phone: resident.phone, expiresInSeconds: expect.any(Number) });

    const res = await verifyOtp(resident.phone, CODE).expect(200);
    expect(res.body.user).toEqual({
      id: resident.id,
      propertyId: home.property.id,
      phone: resident.phone,
      name: resident.name,
      role: 'RESIDENT',
    });

    const me = await t
      .anon()
      .get('/auth/me')
      .set('Authorization', `Bearer ${res.body.token}`)
      .expect(200);
    expect(me.body.user.id).toBe(resident.id);
  });

  it('does not accept the same code twice', async () => {
    const phone = home.residents[1].phone;
    await requestOtp(phone).expect(200);
    await verifyOtp(phone, CODE).expect(200);
    const again = await verifyOtp(phone, CODE).expect(401);
    expect(again.body.error.code).toBe('UNAUTHORIZED');
  });

  it('rejects a wrong code, then locks the code after too many attempts', async () => {
    const phone = home.residents[2].phone;
    await requestOtp(phone).expect(200);
    for (let i = 0; i < 5; i++) await verifyOtp(phone, WRONG).expect(401);
    const locked = await verifyOtp(phone, CODE).expect(429);
    expect(locked.body.error.code).toBe('TOO_MANY_REQUESTS');
  });

  it('rejects a code that was never requested', async () => {
    await verifyOtp(home.custodian2.phone, CODE).expect(401);
  });

  it('answers 404 for numbers that are not registered', async () => {
    const res = await requestOtp('0799999999').expect(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('validates the request body', async () => {
    const short = await requestOtp('07').expect(400);
    expect(short.body.error.code).toBe('VALIDATION_FAILED');
    const badCode = await verifyOtp(home.admin.phone, '12ab').expect(400);
    expect(badCode.body.error.code).toBe('VALIDATION_FAILED');
    const malformed = await t
      .anon()
      .post('/auth/request-otp')
      .set('Content-Type', 'application/json')
      .send('{"phone": ')
      .expect(400);
    expect(malformed.body.error.code).toBe('BAD_JSON');
  });

  it('requires a valid token on protected routes', async () => {
    await t.anon().get('/auth/me').expect(401);
    await t.anon().get('/auth/me').set('Authorization', 'Bearer not-a-jwt').expect(401);
    await t.anon().get('/auth/me').set('Authorization', 'Basic abc').expect(401);
  });

  it('locks out a deactivated user immediately, even with a valid token', async () => {
    const user = await t.prisma.user.create({
      data: {
        propertyId: home.property.id,
        phone: uniquePhone(),
        name: 'Leaving soon',
        role: 'CUSTODIAN',
      },
    });
    await t.as(user).get('/auth/me').expect(200);

    await t.prisma.user.update({ where: { id: user.id }, data: { isActive: false } });
    await t.as(user).get('/auth/me').expect(401);
    await requestOtp(user.phone).expect(404);
  });
});
