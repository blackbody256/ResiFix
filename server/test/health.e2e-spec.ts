import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startApp, type TestApp } from './app';

describe('GET /api/health', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await startApp();
  });
  afterAll(() => t.close());

  it('is public and reports the database and Redis as up', async () => {
    const res = await t.anon().get('/health').expect(200);
    expect(res.body).toMatchObject({ status: 'ok', db: 'ok', redis: 'ok' });
  });

  it('answers unknown routes with the standard error shape', async () => {
    const res = await t.anon().get('/no-such-route').expect(404);
    expect(res.body).toEqual({ error: expect.objectContaining({ code: 'NOT_FOUND' }) });
  });
});
