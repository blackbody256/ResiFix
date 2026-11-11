// PB-022: the resident rates the repair service. POST /completion/tickets/:id/rating
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TicketStatus, type Ticket } from '@prisma/client';
import { startApp, type TestApp } from './app';
import { createProperty, createTicket, destroyProperty, type PropertyFixture } from './fixtures';

const S = TicketStatus;

describe('PB-022 rate the service', () => {
  let t: TestApp;
  let home: PropertyFixture;
  let away: PropertyFixture;

  beforeAll(async () => {
    t = await startApp();
    home = await createProperty(t.prisma, 'Rating Hall');
    away = await createProperty(t.prisma, 'Other Rating Hall');
  });
  afterAll(async () => {
    await destroyProperty(t.prisma, home.property.id);
    await destroyProperty(t.prisma, away.property.id);
    await t.close();
  });

  const finished = (status: TicketStatus = S.CLOSED, reporter = home.residents[0]) =>
    createTicket(t.prisma, home, { reporter, status, assignee: home.custodian });
  const rate = (caller: PropertyFixture['admin'], ticket: Ticket, body: object) =>
    t.as(caller).post(`/completion/tickets/${ticket.id}/rating`).send(body);

  it.each([S.COMPLETED, S.STUDENT_CONFIRMED, S.CLOSED])(
    'saves a rating on a %s ticket and audits it without the score',
    async (status) => {
      const ticket = await finished(status);
      const res = await rate(home.residents[0], ticket, {
        score: 4,
        comment: '  Quick and tidy.  ',
      }).expect(201);
      expect(res.body.rating).toEqual({
        score: 4,
        comment: 'Quick and tidy.',
        createdAt: expect.any(String),
      });

      const stored = await t.prisma.rating.findUniqueOrThrow({ where: { ticketId: ticket.id } });
      expect(stored).toMatchObject({ userId: home.residents[0].id, score: 4 });
      const audit = await t.prisma.auditLog.findFirstOrThrow({
        where: { ticketId: ticket.id, action: 'ticket.rated' },
      });
      expect(audit.actorId).toBe(home.residents[0].id);
      expect(JSON.stringify(audit.meta ?? {})).not.toContain('4');
    },
  );

  it('works without a comment and shows the rating to the reporter only', async () => {
    const ticket = await finished();
    await rate(home.residents[0], ticket, { score: 5 }).expect(201);

    const mine = await t.as(home.residents[0]).get(`/tickets/${ticket.id}`).expect(200);
    expect(mine.body.ticket.rating).toMatchObject({ score: 5, comment: null });
    const staff = await t.as(home.admin).get(`/tickets/${ticket.id}`).expect(200);
    expect(staff.body.ticket).not.toHaveProperty('rating');
  });

  it('allows only one rating per ticket', async () => {
    const ticket = await finished();
    await rate(home.residents[0], ticket, { score: 3 }).expect(201);
    const again = await rate(home.residents[0], ticket, { score: 1 }).expect(409);
    expect(again.body.error.code).toBe('CONFLICT');
    const stored = await t.prisma.rating.findUniqueOrThrow({ where: { ticketId: ticket.id } });
    expect(stored.score).toBe(3);
  });

  it.each([S.REPORTED, S.REVIEWED, S.SCHEDULED, S.IN_PROGRESS, S.REOPENED])(
    'refuses a %s ticket: the repair is not done',
    async (status) => {
      const ticket = await finished(status);
      const res = await rate(home.residents[0], ticket, { score: 5 }).expect(409);
      expect(res.body.error.code).toBe('CONFLICT');
      expect(await t.prisma.rating.count({ where: { ticketId: ticket.id } })).toBe(0);
    },
  );

  it("answers 404 for a neighbour's ticket and another property's ticket", async () => {
    const neighbours = await finished(S.CLOSED, home.residents[1]);
    const elsewhere = await createTicket(t.prisma, away, {
      reporter: away.residents[0],
      status: S.CLOSED,
    });
    for (const ticket of [neighbours, elsewhere]) {
      const res = await rate(home.residents[0], ticket, { score: 5 }).expect(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    }
    await rate(home.residents[0], { id: 'does-not-exist' } as Ticket, { score: 5 }).expect(404);
  });

  it('is for residents only', async () => {
    const ticket = await finished();
    for (const staff of [home.custodian, home.admin]) {
      const res = await rate(staff, ticket, { score: 5 }).expect(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    }
    await t.anon().post(`/completion/tickets/${ticket.id}/rating`).send({ score: 5 }).expect(401);
  });

  it.each([
    ['no score', {}],
    ['score 0', { score: 0 }],
    ['score 6', { score: 6 }],
    ['a fraction', { score: 4.5 }],
    ['a string', { score: '5' }],
    ['a long comment', { score: 5, comment: 'x'.repeat(501) }],
  ])('rejects %s with field errors', async (_label, body) => {
    const ticket = await finished();
    const res = await rate(home.residents[0], ticket, body).expect(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(res.body.error.details).toBeTruthy();
    expect(await t.prisma.rating.count({ where: { ticketId: ticket.id } })).toBe(0);
  });
});
