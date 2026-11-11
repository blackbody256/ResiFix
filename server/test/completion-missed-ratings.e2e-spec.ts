import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TicketStatus } from '@prisma/client';
import { startApp, type TestApp } from './app';
import {
  createProperty,
  createTicket,
  destroyProperty,
  HOUR,
  type PropertyFixture,
} from './fixtures';

describe('PB-028 missed visits and ratings analytics', () => {
  let t: TestApp;
  let home: PropertyFixture;
  let away: PropertyFixture;

  beforeAll(async () => {
    t = await startApp();
    home = await createProperty(t.prisma, 'Completion Analytics Hall');
    away = await createProperty(t.prisma, 'Other Completion Analytics Hall');

    const first = await createTicket(t.prisma, home, {
      reporter: home.residents[0],
      status: TicketStatus.CLOSED,
      createdAt: new Date(Date.now() - HOUR),
    });
    const second = await createTicket(t.prisma, home, {
      reporter: home.residents[1],
      status: TicketStatus.CLOSED,
      createdAt: new Date(),
    });
    const awayTicket = await createTicket(t.prisma, away, {
      reporter: away.residents[0],
      status: TicketStatus.CLOSED,
    });

    await t.prisma.auditLog.createMany({
      data: [
        {
          propertyId: home.property.id,
          ticketId: first.id,
          actorId: home.custodian.id,
          action: 'visit.missed',
          meta: { reason: 'RESIDENT_ABSENT' },
          createdAt: new Date(Date.now() - HOUR),
        },
        {
          propertyId: home.property.id,
          ticketId: second.id,
          actorId: home.custodian.id,
          action: 'visit.missed',
          meta: { reason: 'NO_ACCESS' },
          createdAt: new Date(),
        },
        {
          propertyId: away.property.id,
          ticketId: awayTicket.id,
          actorId: away.custodian.id,
          action: 'visit.missed',
          meta: { reason: 'CUSTODIAN_UNAVAILABLE' },
        },
      ],
    });
    await t.prisma.rating.createMany({
      data: [
        {
          ticketId: first.id,
          userId: home.residents[0].id,
          score: 5,
          createdAt: new Date(Date.now() - HOUR),
        },
        { ticketId: second.id, userId: home.residents[1].id, score: 3, createdAt: new Date() },
        { ticketId: awayTicket.id, userId: away.residents[0].id, score: 1 },
      ],
    });
  });

  afterAll(async () => {
    await destroyProperty(t.prisma, home.property.id);
    await destroyProperty(t.prisma, away.property.id);
    await t.close();
  });

  it('returns missed-visit reasons and rating distribution for admins', async () => {
    const response = await t.as(home.admin).get('/completion/missed-visits-ratings').expect(200);

    expect(response.body.missedVisits).toEqual({
      total: 2,
      byReason: expect.arrayContaining([
        { reason: 'RESIDENT_ABSENT', count: 1 },
        { reason: 'NO_ACCESS', count: 1 },
      ]),
    });
    expect(response.body.ratings).toMatchObject({ total: 2, averageScore: 4 });
    expect(response.body.ratings.distribution).toEqual(
      expect.arrayContaining([
        { score: 3, count: 1 },
        { score: 5, count: 1 },
      ]),
    );
  });

  it('filters by date, isolates properties and restricts custodians', async () => {
    const from = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const to = new Date(Date.now() + HOUR).toISOString();
    const response = await t
      .as(home.admin)
      .get(
        `/completion/missed-visits-ratings?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      )
      .expect(200);
    expect(response.body.missedVisits.total).toBe(1);
    expect(response.body.ratings).toMatchObject({ total: 1, averageScore: 3 });

    await t.as(home.custodian).get('/completion/missed-visits-ratings').expect(403);
    const awayResponse = await t
      .as(away.admin)
      .get('/completion/missed-visits-ratings')
      .expect(200);
    expect(awayResponse.body.missedVisits.total).toBe(1);
    expect(awayResponse.body.ratings).toMatchObject({ total: 1, averageScore: 1 });
  });
});
