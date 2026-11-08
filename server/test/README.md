# Server tests

```bash
npm run infra:up      # Postgres, Redis, MinIO (once)
npm test              # unit + e2e, from the repo root
npm run test:unit     # fast, no database
npm run test:e2e      # HTTP tests against the real app
npm run test:watch -w server   # unit tests on every save
```

## Two kinds of test

| Kind | Where                     | What it is for                                                                                      |
| ---- | ------------------------- | --------------------------------------------------------------------------------------------------- |
| unit | `src/**/<name>.spec.ts`   | Pure logic: the status machine, date and target maths, parsing. Next to the file it tests.          |
| e2e  | `test/<area>.e2e-spec.ts` | An endpoint through the whole app: global guards, roles, `PropertyScope`, validation, the database. |

The e2e tests boot the real `AppModule` against:

- a separate database, `resifix_test` (`<your DATABASE_URL>_test`), created and migrated by `global-setup.ts`;
- Redis DB 15, emptied at the start of each run;
- the `resifix-photos-test` bucket.

Your demo data in `resifix` is never touched. Override with `TEST_DATABASE_URL`, `TEST_REDIS_URL` or `TEST_S3_BUCKET`. The queue worker does not run during tests (`RUN_WORKER_INLINE=false`): check that a job was queued rather than waiting for it to run.

## Writing an e2e test

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startApp, type TestApp } from './app';
import { createProperty, createTicket, destroyProperty, type PropertyFixture } from './fixtures';

describe('PB-0xx: what the story does', () => {
  let t: TestApp;
  let home: PropertyFixture;
  let away: PropertyFixture;

  beforeAll(async () => {
    t = await startApp();
    home = await createProperty(t.prisma, 'Home Hall');
    away = await createProperty(t.prisma, 'Away Hall'); // for the cross-property case
  });
  afterAll(async () => {
    await destroyProperty(t.prisma, home.property.id);
    await destroyProperty(t.prisma, away.property.id);
    await t.close();
  });

  it('does the thing', async () => {
    const ticket = await createTicket(t.prisma, home, { reporter: home.residents[0] });
    const res = await t.as(home.custodian).get(`/tickets/${ticket.id}`).expect(200);
    expect(res.body.ticket.id).toBe(ticket.id);
  });
});
```

- `t.as(user)` sends requests as that user with a real JWT; `t.anon()` sends them with no token. Paths are relative to `/api`.
- `createProperty` gives you a property with Block A (101, 102) and Block B (201), the Plumbing and Electrical catalogue, the standard response targets, an `admin`, a `custodian`, a `custodian2` and three `residents` (in A-101, A-102 and B-201). Phone numbers are unique, so test files run in parallel.
- `createTicket` takes `status`, `priority`, `assignee`, `createdAt` (backdate it to make a ticket overdue: `new Date(Date.now() - 30 * HOUR)`) and `dueAt`.
- Always clean up with `destroyProperty` in `afterAll`.

## What every endpoint test should cover

The Definition of Done asks for these. Copy the pattern from `isolation.e2e-spec.ts`:

1. The happy path, checking the response body and what changed in the database (status, audit row, queued job).
2. **Wrong role**: 403 with `{ error: { code: 'FORBIDDEN' } }`.
3. **Another property's data**: 404, never 403, so the response does not reveal that the record exists.
4. **Bad input**: 400 `VALIDATION_FAILED` with field `details`.
5. **Illegal status change**: 409 `CONFLICT`.
